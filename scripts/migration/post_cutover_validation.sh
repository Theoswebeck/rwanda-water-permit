#!/usr/bin/env bash
set -euo pipefail

# Post-cutover verification script.
# Run on target production server after traffic cutover.

APP_URL="${APP_URL:-http://127.0.0.1}"
LOCAL_APP_URL="${LOCAL_APP_URL:-http://127.0.0.1:3000}"
PM2_NAME="${PM2_NAME:-waterpermit}"
DB_NAME="${DB_NAME:-waterpermit}"
TARGET_LOG_DIR="${TARGET_LOG_DIR:-/tmp/waterpermit-post-cutover}"
NIDA_STATUS_ENDPOINT="${NIDA_STATUS_ENDPOINT:-/api/nida/status}"
RRA_STATUS_ENDPOINT="${RRA_STATUS_ENDPOINT:-/api/rra/status}"
PAYMENT_STATUS_ENDPOINT="${PAYMENT_STATUS_ENDPOINT:-/api/payments/health}"

mkdir -p "${TARGET_LOG_DIR}"
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="${TARGET_LOG_DIR}/validation_${STAMP}.log"

run_check() {
  local label="$1"
  local cmd="$2"
  echo "---- ${label}" | tee -a "${REPORT}"
  bash -c "${cmd}" >> "${REPORT}" 2>&1 || {
    echo "[FAIL] ${label}" | tee -a "${REPORT}"
    return 1
  }
  echo "[PASS] ${label}" | tee -a "${REPORT}"
  return 0
}

FAILS=0

run_check "pm2 status" "pm2 status" || FAILS=$((FAILS + 1))
run_check "local app response" "curl -sS -I '${LOCAL_APP_URL}'" || FAILS=$((FAILS + 1))
run_check "nginx response" "curl -sS -I '${APP_URL}'" || FAILS=$((FAILS + 1))
run_check "nida status endpoint" "curl -sS '${APP_URL}${NIDA_STATUS_ENDPOINT}'" || FAILS=$((FAILS + 1))
run_check "rra status endpoint" "curl -sS '${APP_URL}${RRA_STATUS_ENDPOINT}'" || FAILS=$((FAILS + 1))
run_check "db basic query" "sudo -u postgres psql -d '${DB_NAME}' -c \"select now();\"" || FAILS=$((FAILS + 1))
run_check "db extension check" "sudo -u postgres psql -d '${DB_NAME}' -c \"select extname from pg_extension where extname in ('postgis','pgcrypto','uuid-ossp') order by extname;\"" || FAILS=$((FAILS + 1))
run_check "nginx status" "systemctl status nginx --no-pager" || FAILS=$((FAILS + 1))
run_check "postgresql status" "systemctl status postgresql --no-pager" || FAILS=$((FAILS + 1))

# Payment health endpoint is optional in some environments.
echo "---- payment status endpoint (optional)" | tee -a "${REPORT}"
curl -sS "${APP_URL}${PAYMENT_STATUS_ENDPOINT}" >> "${REPORT}" 2>&1 || true

echo "---- tail pm2 logs" | tee -a "${REPORT}"
pm2 logs "${PM2_NAME}" --lines 120 --nostream >> "${REPORT}" 2>&1 || true

if [[ "${FAILS}" -gt 0 ]]; then
  echo "[WARN] Post-cutover checks completed with ${FAILS} failure(s)." | tee -a "${REPORT}"
  echo "Report: ${REPORT}"
  exit 1
fi

echo "[DONE] Post-cutover checks passed."
echo "Report: ${REPORT}"
