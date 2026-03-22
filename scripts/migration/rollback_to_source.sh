#!/usr/bin/env bash
set -euo pipefail

# Emergency rollback: shift traffic back to source and reopen source writes.
# Run from control machine.

SOURCE_HOST=""
TARGET_HOST=""
SSH_USER="root"
SOURCE_APP_DIR="/opt/waterpermit/app"
PM2_NAME="waterpermit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-host) SOURCE_HOST="$2"; shift 2 ;;
    --target-host) TARGET_HOST="$2"; shift 2 ;;
    --ssh-user) SSH_USER="$2"; shift 2 ;;
    --source-app-dir) SOURCE_APP_DIR="$2"; shift 2 ;;
    --pm2-name) PM2_NAME="$2"; shift 2 ;;
    *)
      echo "[ERROR] Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "${SOURCE_HOST}" || -z "${TARGET_HOST}" ]]; then
  echo "[ERROR] Required args: --source-host and --target-host"
  exit 1
fi

echo "[STEP] 1/4 - Pause target writes"
ssh "${SSH_USER}@${TARGET_HOST}" "touch /opt/waterpermit/app/.maintenance-mode && pm2 restart '${PM2_NAME}' --update-env"

echo "[STEP] 2/4 - Manual DNS/proxy revert to source required"
echo "Point production URL back to source host: ${SOURCE_HOST}"
read -r -p "Type 'reverted' when DNS/proxy is switched back: " ANSWER
if [[ "${ANSWER}" != "reverted" ]]; then
  echo "[ERROR] Rollback stopped before traffic move."
  exit 1
fi

echo "[STEP] 3/4 - Reopen source writes"
ssh "${SSH_USER}@${SOURCE_HOST}" "rm -f '${SOURCE_APP_DIR}/.maintenance-mode' && pm2 restart '${PM2_NAME}' --update-env"

echo "[STEP] 4/4 - Capture quick status"
ssh "${SSH_USER}@${SOURCE_HOST}" "pm2 status && curl -sS -I http://127.0.0.1:3000 && curl -sS -I http://127.0.0.1"
ssh "${SSH_USER}@${TARGET_HOST}" "pm2 status && curl -sS -I http://127.0.0.1:3000"

echo "[DONE] Rollback to source complete."
