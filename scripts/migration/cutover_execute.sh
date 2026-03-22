#!/usr/bin/env bash
set -euo pipefail

# Controlled cutover script for maintenance-window migration.
# Run from control machine with SSH access to both servers.
#
# This script does NOT edit DNS automatically. It pauses before DNS/proxy switch.

SOURCE_HOST=""
TARGET_HOST=""
SSH_USER="root"
SOURCE_APP_DIR="/opt/waterpermit/app"
TARGET_APP_DIR="/opt/waterpermit/app"
PM2_NAME="waterpermit"
DB_NAME="waterpermit"
WORK_DIR="/root/waterpermit-migration"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-host) SOURCE_HOST="$2"; shift 2 ;;
    --target-host) TARGET_HOST="$2"; shift 2 ;;
    --ssh-user) SSH_USER="$2"; shift 2 ;;
    --source-app-dir) SOURCE_APP_DIR="$2"; shift 2 ;;
    --target-app-dir) TARGET_APP_DIR="$2"; shift 2 ;;
    --pm2-name) PM2_NAME="$2"; shift 2 ;;
    --db-name) DB_NAME="$2"; shift 2 ;;
    --work-dir) WORK_DIR="$2"; shift 2 ;;
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

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="${WORK_DIR}/cutover_${TIMESTAMP}"
mkdir -p "${RUN_DIR}"

echo "[STEP] 1/8 - Pre-cutover health snapshots"
ssh "${SSH_USER}@${SOURCE_HOST}" "pm2 status && curl -sS -I http://127.0.0.1:3000 && curl -sS -I http://127.0.0.1" > "${RUN_DIR}/source_pre_health.txt" 2>&1 || true
ssh "${SSH_USER}@${TARGET_HOST}" "pm2 status && curl -sS -I http://127.0.0.1:3000 && curl -sS -I http://127.0.0.1" > "${RUN_DIR}/target_pre_health.txt" 2>&1 || true

echo "[STEP] 2/8 - Enable write freeze on source (maintenance)"
ssh "${SSH_USER}@${SOURCE_HOST}" "touch '${SOURCE_APP_DIR}/.maintenance-mode' && pm2 restart '${PM2_NAME}' --update-env"

echo "[STEP] 3/8 - Final delta backup from source"
ssh "${SSH_USER}@${SOURCE_HOST}" "mkdir -p '${WORK_DIR}' && sudo -u postgres pg_dump -d '${DB_NAME}' --format=custom --compress=9 -f '${WORK_DIR}/final_delta_${TIMESTAMP}.dump'"

echo "[STEP] 4/8 - Apply final delta to target"
scp "${SSH_USER}@${SOURCE_HOST}:${WORK_DIR}/final_delta_${TIMESTAMP}.dump" "${RUN_DIR}/final_delta_${TIMESTAMP}.dump"
scp "${RUN_DIR}/final_delta_${TIMESTAMP}.dump" "${SSH_USER}@${TARGET_HOST}:${WORK_DIR}/final_delta_${TIMESTAMP}.dump"
ssh "${SSH_USER}@${TARGET_HOST}" "sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB_NAME}' and pid <> pg_backend_pid();\" && sudo -u postgres pg_restore -d '${DB_NAME}' --clean --if-exists '${WORK_DIR}/final_delta_${TIMESTAMP}.dump'"

echo "[STEP] 5/8 - Post-delta smoke checks on target"
ssh "${SSH_USER}@${TARGET_HOST}" "pm2 restart '${PM2_NAME}' --update-env && sleep 2 && curl -sS -I http://127.0.0.1:3000 && curl -sS -I http://127.0.0.1" > "${RUN_DIR}/target_post_delta_health.txt" 2>&1 || true

echo "[STEP] 6/8 - Pause for manual DNS/proxy switch"
echo "Manual action required now:"
echo "  - Point production URL to ${TARGET_HOST}"
echo "  - Wait for TTL propagation"
read -r -p "Type 'continue' after DNS/proxy is switched: " ANSWER
if [[ "${ANSWER}" != "continue" ]]; then
  echo "[ERROR] Cutover aborted before traffic switch."
  exit 1
fi

echo "[STEP] 7/8 - Observe target after switch (2 minutes)"
for i in 1 2 3 4; do
  ssh "${SSH_USER}@${TARGET_HOST}" "date && pm2 status && curl -sS -I http://127.0.0.1:3000 | sed -n '1,3p'" >> "${RUN_DIR}/target_observe.log" 2>&1 || true
  sleep 30
done

echo "[STEP] 8/8 - Keep source warm for rollback"
echo "Source remains in maintenance mode for fast rollback."
echo "[DONE] Cutover flow complete."
echo "Artifacts: ${RUN_DIR}"
