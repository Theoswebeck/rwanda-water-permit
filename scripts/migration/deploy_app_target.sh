#!/usr/bin/env bash
set -euo pipefail

# Deploy app on target server after DB migration.
# Run on target server as root.

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Run as root."
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/waterpermit/app}"
APP_USER="${APP_USER:-waterpermit_deploy}"
APP_GROUP="${APP_GROUP:-waterpermit}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-waterpermit}"
PORT="${PORT:-3000}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.production}"
REPO_URL="${REPO_URL:-}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] Missing env file: ${ENV_FILE}"
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -z "${REPO_URL}" ]]; then
    echo "[ERROR] APP_DIR is not a git repo and REPO_URL is empty."
    exit 1
  fi
  mkdir -p "${APP_DIR}"
  git clone "${REPO_URL}" "${APP_DIR}"
fi

echo "[INFO] Preparing app directory permissions"
chown -R "${APP_USER}:${APP_GROUP}" /opt/waterpermit

echo "[INFO] Fetching code"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && git fetch origin '${BRANCH}' && git checkout '${BRANCH}' && git pull --ff-only origin '${BRANCH}'"

echo "[INFO] Installing dependencies and building app"
sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && npm ci && npm run build"

echo "[INFO] Starting PM2 service"
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 restart '${PM2_NAME}' --update-env"
else
  sudo -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 start 'npm run start -- -p ${PORT}' --name '${PM2_NAME}' --cwd '${APP_DIR}' --update-env"
fi

sudo -u "${APP_USER}" pm2 save
sudo -u "${APP_USER}" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" >/tmp/pm2_startup_cmd.txt 2>&1 || true

echo "[INFO] Verifying service health"
sleep 2
curl -sS -I "http://127.0.0.1:${PORT}" | tee /tmp/waterpermit_local_${PORT}.health || true
curl -sS -I "http://127.0.0.1" | tee /tmp/waterpermit_local_nginx.health || true
pm2 status

echo "[DONE] Target app deployment complete."
