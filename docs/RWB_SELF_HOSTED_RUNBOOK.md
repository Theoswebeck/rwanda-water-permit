# RWB Self-Hosted Deployment Runbook

This document captures what was successfully completed to run the app on the RWB server, the current status, and the exact repeatable steps for future updates.

## Current Status (Successful)

- Self-hosted PostgreSQL schema is created and usable on RWB server.
- App is running with PM2 on port `3000`.
- Nginx is active on port `80` and proxies to `127.0.0.1:3000`.
- Apache default page issue was resolved by stopping/disabling Apache and enabling Nginx.
- Admin bootstrap user was created in `public.users`.
- NIDA verification path is configured for server-side calls from RWB network.

## Server Details Used

- SSH: `root@10.10.82.212` (internal/VPN)
- App path: `/opt/waterpermit/app`
- Database:
  - DB name: `waterpermit`
  - DB user: `waterpermit_app`
  - Host: `127.0.0.1`
  - Port: `5432`

## Database Work Completed

1. Imported self-hosted schema from `database/schema-selfhosted.sql`.
2. Resolved migration blockers:
   - Removed `spatial_ref_sys` constraint alterations (table owned by postgres/PostGIS).
   - Ensured function/constraint ordering issues were handled during migration.
3. Added missing auth column on existing users table:
   - `public.users.password_hash text not null`
4. Verified key objects:
   - Public tables present (expected set including users, applications, permits, etc.)
   - No public RLS policies active.

## Admin Bootstrap Completed

- Inserted initial admin account in `public.users` with bcrypt `password_hash`.
- Verified admin flags:
  - `role = admin`
  - `status = active`
  - `account_confirmed = true`
  - `email_verified = true`

## Application Runtime Setup Completed

1. Node/PM2 build and start:
   - `npm run build`
   - `pm2 start "npm run start -- -p 3000" --name waterpermit --cwd /opt/waterpermit/app --update-env`
   - `pm2 save`
2. Verified app locally:
   - `curl -I http://127.0.0.1:3000` returns `200`.

## Web Server Setup Completed

1. Apache disabled:
   - `systemctl stop apache2`
   - `systemctl disable apache2`
2. Nginx enabled and started:
   - `systemctl enable nginx`
   - `systemctl start nginx`
3. Nginx site configured and enabled:
   - `/etc/nginx/sites-available/waterpermit`
   - symlink in `/etc/nginx/sites-enabled/`
4. Nginx config tested and reloaded:
   - `nginx -t`
   - `systemctl reload nginx`

## Required Environment Variables (Minimum)

These must exist in server runtime env (`.env.production` or PM2 env context):

```env
NODE_ENV=production
TZ=Africa/Kigali
NEXT_PUBLIC_APP_URL=<public-url-or-ip>

DATABASE_URL=postgresql://waterpermit_app:<password>@127.0.0.1:5432/waterpermit
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=waterpermit
PGUSER=waterpermit_app
PGPASSWORD=<password>

NIDA_BASE_URL=http://10.10.73.23:8080
NIDA_USERNAME=<nida-username>
NIDA_PASSWORD=<nida-password>
NIDA_VERIFICATION_ENABLED=true
```

Note: some app paths still reference Supabase at build/runtime. Keep required `SUPABASE_*` envs until full code migration is done.

## NIDA Integration Notes

- Current code authenticates before NIDA data request and then performs citizen info lookup.
- Network access from RWB server to NIDA endpoint is required.
- Quick checks:
  - `GET /api/nida/status`
  - `POST /api/nida/verify` with a known test document number.

## Repeatable Deploy/Update Procedure

Run on server after each code change:

```bash
ssh root@10.10.82.212
cd /opt/waterpermit/app
git fetch origin
git pull origin <branch>
npm ci
npm run build
pm2 restart waterpermit --update-env
pm2 save
pm2 status
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
```

If PM2 fails with `/root/package.json` errors, process was started from wrong cwd. Recreate:

```bash
pm2 delete waterpermit
pm2 start "npm run start -- -p 3000" --name waterpermit --cwd /opt/waterpermit/app --update-env
pm2 save
```

## Verification Checklist

Use after deploy:

1. `pm2 status` shows `waterpermit` online.
2. `curl -I http://127.0.0.1:3000` returns `200`.
3. `curl -I http://127.0.0.1` returns proxied app response (not default Apache/Nginx page).
4. Admin login works.
5. NIDA verify endpoint works with test ID.
6. DB connection and key tables accessible.

## Known Follow-Up Work

- Full removal of Supabase dependencies from app code and envs.
- Full secret rotation (DB, SSH root, payment, SMS, email, Supabase keys exposed during setup).
- Optional HTTPS/Certbot setup for domain (if not already configured).
- Create non-root deploy user and reduce root SSH usage.

