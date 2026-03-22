# WaterPermit Production Server Migration Execution

This is the executable runbook for moving from the current server to the new production server with PostgreSQL parity and controlled rollback.

It is designed to match the migration plan phases and be run in order.

## 0) One-Time Preparation In Repository

Run locally in the project root:

```bash
cd /Users/nourumuneza/go/src/waterpermit
chmod +x scripts/migration/*.sh
```

## 1) Source Inventory + Baseline Backups

Run on the **source** server (`10.10.82.212`):

```bash
ssh root@10.10.82.212
cd /opt/waterpermit/app
git rev-parse --short HEAD

DB_PASSWORD='WP_Rwb2026!SecureDB' bash scripts/migration/source_inventory_and_backups.sh
```

Expected output includes:
- artifact directory path (`/root/waterpermit-migration/source_YYYYMMDD_HHMMSS`)
- archive path (`.tar.gz`)
- archive checksum file (`.sha256`)

Copy artifacts to your control machine:

```bash
scp root@10.10.82.212:/root/waterpermit-migration/source_*.tar.gz* .
```

## 2) Prepare New Target Production Server

Run on the **target** server:

```bash
ssh root@<NEW_PROD_HOST>
mkdir -p /opt/waterpermit/app
```

Copy repository to target (if not already cloned):

```bash
cd /opt/waterpermit
git clone <REPO_URL> app
cd app
```

Prepare target baseline:

```bash
cd /opt/waterpermit/app
DB_PASSWORD='<NEW_DB_PASSWORD>' bash scripts/migration/prepare_target_server.sh
```

Mandatory checks:

```bash
psql --version
node -v
npm -v
pm2 -v
nginx -v
ss -tlnp | rg "5432|3000|80|443"
```

## 3) Database Migration + Parity Validation

Run from your **control machine** (must SSH into both source and target):

```bash
cd /Users/nourumuneza/go/src/waterpermit

bash scripts/migration/migrate_db_and_validate.sh \
  --source-host 10.10.82.212 \
  --target-host <NEW_PROD_HOST> \
  --ssh-user root \
  --db-name waterpermit \
  --dump-path /root/waterpermit-migration/source_YYYYMMDD_HHMMSS/waterpermit_full_source.dump
```

If validation fails (`exit code 2`), review:
- `fingerprints.diff`
- `counts.diff`

Do not continue until diffs are understood and accepted.

## 4) Deploy App On Target

On target server, create/verify `.env.production` first:

```bash
cd /opt/waterpermit/app
cp -n .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S) || true
```

Then deploy:

```bash
cd /opt/waterpermit/app
BRANCH=main PM2_NAME=waterpermit PORT=3000 bash scripts/migration/deploy_app_target.sh
```

Local smoke checks:

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
pm2 status
```

## 5) Cutover (Maintenance Window)

From control machine:

```bash
cd /Users/nourumuneza/go/src/waterpermit

bash scripts/migration/cutover_execute.sh \
  --source-host 10.10.82.212 \
  --target-host <NEW_PROD_HOST> \
  --ssh-user root \
  --source-app-dir /opt/waterpermit/app \
  --target-app-dir /opt/waterpermit/app \
  --pm2-name waterpermit \
  --db-name waterpermit
```

The script pauses for manual DNS/proxy switch confirmation.

## 6) Rollback Procedure (If Needed)

If rollback conditions are hit (auth/payment broken, major errors, severe mismatch), run:

```bash
cd /Users/nourumuneza/go/src/waterpermit

bash scripts/migration/rollback_to_source.sh \
  --source-host 10.10.82.212 \
  --target-host <NEW_PROD_HOST> \
  --ssh-user root \
  --source-app-dir /opt/waterpermit/app \
  --pm2-name waterpermit
```

## 7) Post-Cutover Validation On Target

On target server:

```bash
cd /opt/waterpermit/app
bash scripts/migration/post_cutover_validation.sh \
  APP_URL='https://<YOUR_PUBLIC_URL>'
```

Review generated report path in `/tmp/waterpermit-post-cutover`.

## 8) External Integrations Rebinding (Critical)

Before opening public traffic, update and verify:

- NIDA:
  - `NIDA_BASE_URL`
  - `NIDA_USERNAME`
  - `NIDA_PASSWORD`
  - `NIDA_VERIFICATION_ENABLED`
- IremboPay:
  - `NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY`
  - `IREMBOPAY_SECRET_KEY`
  - `IREMBOPAY_WEBHOOK_SECRET`
  - `IREMBOPAY_PRODUCT_CODE`
  - `IREMBOPAY_ACCOUNT_ID`
- RRA keys/config in `lib/rra/client.ts`-related envs.
- Email/SMS provider keys.

Also ensure webhook endpoints on third-party dashboards point to the active production URL.

## 9) Commands To Send Back For Live Assistance

If you want me to validate each phase from your outputs, run and share outputs of:

```bash
# Source
ssh root@10.10.82.212 "pm2 status && sudo -u postgres psql -d waterpermit -c 'select count(*) from pg_tables where schemaname=''public'';'"

# Target
ssh root@<NEW_PROD_HOST> "pm2 status && sudo -u postgres psql -d waterpermit -c 'select count(*) from pg_tables where schemaname=''public'';'"

# Parity artifacts (on control machine after migrate_db_and_validate.sh)
ls -lah /root/waterpermit-migration/parity_*/ && \
for f in /root/waterpermit-migration/parity_*/fingerprints.diff /root/waterpermit-migration/parity_*/counts.diff; do echo \"==== \$f\"; [ -f \"\$f\" ] && sed -n '1,120p' \"\$f\"; done
```

## 10) Operational Notes

- Keep source server in standby mode for at least 7 days before decommissioning.
- Keep daily backups enabled on both servers during stabilization.
- Keep DNS TTL low during migration day; raise it after stabilization.
- Do not rotate all secrets at once during cutover unless planned; rotate in controlled batches after stable go-live.
