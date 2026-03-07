# Stage Server Auto-Deploy Setup

## Server Info

| Field       | Value              |
|-------------|--------------------|
| IP (private)| `10.10.82.212`     |
| IP (public) | `197.243.23.235`   |
| SSH user    | `root`             |
| SSH port    | `22`               |
| App path    | `/opt/waterpermit/app` |
| PM2 process | `waterpermit`      |
| Branch      | `chore/stage-unstaged-2026-03-01` |

---

## What We Did

### 1. Created deploy script on server

SSH into the server:

```bash
ssh root@10.10.82.212
```

Created `/opt/waterpermit/deploy.sh`:

```bash
sudo tee /opt/waterpermit/deploy.sh > /dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/waterpermit/app"
BRANCH="chore/stage-unstaged-2026-03-01"
LOCK_FILE="/tmp/waterpermit-deploy.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "⏭️ Deploy already running, skipping..."
  exit 0
fi

echo "🚀 Starting deploy at $(date)"
cd "$APP_DIR"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --lts >/dev/null || true
fi

git fetch origin "$BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "✅ No new commits. Nothing to deploy."
  exit 0
fi

git pull --ff-only origin "$BRANCH"
npm run build
pm2 restart waterpermit --update-env
pm2 save

echo "✅ Deploy completed at $(date)"
SCRIPT

sudo chmod +x /opt/waterpermit/deploy.sh
```

### 2. Generated SSH key pair on server

```bash
ssh-keygen -t ed25519 -C "github-actions-waterpermit" -f ~/.ssh/waterpermit_actions -N ""
```

### 3. Authorized the key on the server

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat ~/.ssh/waterpermit_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 4. Added GitHub repository secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name    | Value                                          |
|----------------|------------------------------------------------|
| `STAGE_HOST`   | `10.10.82.212`                                 |
| `STAGE_USER`   | `root`                                         |
| `STAGE_PORT`   | `22`                                           |
| `STAGE_SSH_KEY` | Full private key from `~/.ssh/waterpermit_actions` |

### 5. Created GitHub Actions workflow

File: `.github/workflows/deploy-stage.yml`

Triggers on every push to `chore/stage-unstaged-2026-03-01`. SSHes into the server and runs `/opt/waterpermit/deploy.sh`.

---

## How to Verify a Deploy Worked

### On GitHub

1. Go to the repository on GitHub
2. Click the **Actions** tab (top menu bar)
3. You'll see a list of workflow runs — find **"Deploy Stage"**
4. Click the run to see logs
5. ✅ Green check = success, ❌ Red X = failure (click to see error logs)

### On the server

```bash
ssh root@10.10.82.212

# Check PM2 process status
pm2 status

# Check recent PM2 logs
pm2 logs waterpermit --lines 50

# Check deploy log (if using cron fallback)
tail -50 /var/log/waterpermit-deploy.log
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Actions workflow not triggering | Ensure you pushed to `chore/stage-unstaged-2026-03-01` and secrets are set |
| SSH connection refused | Verify server firewall allows port 22 from GitHub Actions IPs |
| `npm run build` fails | SSH in and run `/opt/waterpermit/deploy.sh` manually to see full error |
| PM2 process not found | Run `pm2 list` to check the exact process name |
| Key permission denied | Re-check `authorized_keys` has the correct public key and permissions are 600 |
