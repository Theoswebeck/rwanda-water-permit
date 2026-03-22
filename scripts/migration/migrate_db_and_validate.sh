#!/usr/bin/env bash
set -euo pipefail

# Restore source dump on target and validate parity.
#
# Usage:
#   bash scripts/migration/migrate_db_and_validate.sh \
#     --source-host 10.10.82.212 \
#     --target-host <new-server-ip> \
#     --db-user waterpermit_app \
#     --db-name waterpermit \
#     --dump-path /root/waterpermit-migration/source_YYYYMMDD_HHMMSS/waterpermit_full_source.dump
#
# Requirements:
# - SSH key access from the machine running this script to both servers
# - psql/pg_restore installed on target

SOURCE_HOST=""
TARGET_HOST=""
SSH_USER="root"
DB_USER="waterpermit_app"
DB_NAME="waterpermit"
DB_PASSWORD=""
DUMP_PATH=""
WORK_DIR="/root/waterpermit-migration"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-host) SOURCE_HOST="$2"; shift 2 ;;
    --target-host) TARGET_HOST="$2"; shift 2 ;;
    --ssh-user) SSH_USER="$2"; shift 2 ;;
    --db-user) DB_USER="$2"; shift 2 ;;
    --db-name) DB_NAME="$2"; shift 2 ;;
    --db-password) DB_PASSWORD="$2"; shift 2 ;;
    --dump-path) DUMP_PATH="$2"; shift 2 ;;
    --work-dir) WORK_DIR="$2"; shift 2 ;;
    *)
      echo "[ERROR] Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "${SOURCE_HOST}" || -z "${TARGET_HOST}" || -z "${DUMP_PATH}" ]]; then
  echo "[ERROR] Missing required args."
  echo "Required: --source-host --target-host --dump-path"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOCAL_RUN_DIR="${WORK_DIR}/parity_${TIMESTAMP}"
mkdir -p "${LOCAL_RUN_DIR}"

echo "[INFO] Copying dump from source to local control machine"
scp "${SSH_USER}@${SOURCE_HOST}:${DUMP_PATH}" "${LOCAL_RUN_DIR}/waterpermit_full_source.dump"

echo "[INFO] Uploading dump + SQL validators to target"
scp "${LOCAL_RUN_DIR}/waterpermit_full_source.dump" "${SSH_USER}@${TARGET_HOST}:${WORK_DIR}/"
scp "scripts/migration/db_fingerprints.sql" "${SSH_USER}@${TARGET_HOST}:${WORK_DIR}/db_fingerprints.sql"
scp "scripts/migration/critical_table_counts.sql" "${SSH_USER}@${TARGET_HOST}:${WORK_DIR}/critical_table_counts.sql"
scp "scripts/migration/db_fingerprints.sql" "${SSH_USER}@${SOURCE_HOST}:${WORK_DIR}/db_fingerprints.sql"
scp "scripts/migration/critical_table_counts.sql" "${SSH_USER}@${SOURCE_HOST}:${WORK_DIR}/critical_table_counts.sql"

echo "[INFO] Restoring database on target"
ssh "${SSH_USER}@${TARGET_HOST}" "bash -s" <<EOF
set -euo pipefail
mkdir -p "${WORK_DIR}"

sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${DB_NAME}_restore_tmp;"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database ${DB_NAME}_restore_tmp;"

sudo -u postgres pg_restore -d ${DB_NAME}_restore_tmp --clean --if-exists "${WORK_DIR}/waterpermit_full_source.dump"

# Replace active DB in controlled sequence.
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${DB_NAME}_old_backup;"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB_NAME}' and pid <> pg_backend_pid();"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "alter database ${DB_NAME} rename to ${DB_NAME}_old_backup;"
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "alter database ${DB_NAME}_restore_tmp rename to ${DB_NAME};"
EOF

echo "[INFO] Capturing fingerprints and rowcounts on source + target"
ssh "${SSH_USER}@${SOURCE_HOST}" "sudo -u postgres psql -d ${DB_NAME} -f ${WORK_DIR}/db_fingerprints.sql" > "${LOCAL_RUN_DIR}/source_fingerprints.txt"
ssh "${SSH_USER}@${TARGET_HOST}" "sudo -u postgres psql -d ${DB_NAME} -f ${WORK_DIR}/db_fingerprints.sql" > "${LOCAL_RUN_DIR}/target_fingerprints.txt"

ssh "${SSH_USER}@${SOURCE_HOST}" "sudo -u postgres psql -d ${DB_NAME} -f ${WORK_DIR}/critical_table_counts.sql" > "${LOCAL_RUN_DIR}/source_counts.csv"
ssh "${SSH_USER}@${TARGET_HOST}" "sudo -u postgres psql -d ${DB_NAME} -f ${WORK_DIR}/critical_table_counts.sql" > "${LOCAL_RUN_DIR}/target_counts.csv"

echo "[INFO] Diffing parity outputs"
diff -u "${LOCAL_RUN_DIR}/source_fingerprints.txt" "${LOCAL_RUN_DIR}/target_fingerprints.txt" > "${LOCAL_RUN_DIR}/fingerprints.diff" || true
diff -u "${LOCAL_RUN_DIR}/source_counts.csv" "${LOCAL_RUN_DIR}/target_counts.csv" > "${LOCAL_RUN_DIR}/counts.diff" || true

if [[ -s "${LOCAL_RUN_DIR}/fingerprints.diff" || -s "${LOCAL_RUN_DIR}/counts.diff" ]]; then
  echo "[WARN] Parity differences found."
  echo "Review:"
  echo "  ${LOCAL_RUN_DIR}/fingerprints.diff"
  echo "  ${LOCAL_RUN_DIR}/counts.diff"
  exit 2
fi

echo "[DONE] DB migration and parity validation complete."
echo "Artifacts in: ${LOCAL_RUN_DIR}"
