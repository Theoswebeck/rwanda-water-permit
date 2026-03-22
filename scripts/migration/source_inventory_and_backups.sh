#!/usr/bin/env bash
set -euo pipefail

# Source server inventory + backup capture for migration baseline.
# Run on source host as root (or with sudo privileges for system files).

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Run as root. Example: sudo bash $0"
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-waterpermit}"
DB_USER="${DB_USER:-waterpermit_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/root/waterpermit-migration}"

if [[ -z "${DB_PASSWORD}" ]]; then
  echo "[ERROR] DB_PASSWORD is required."
  echo "Example:"
  echo "  DB_PASSWORD='your_password' bash $0"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="${OUTPUT_ROOT}/source_${TIMESTAMP}"
mkdir -p "${RUN_DIR}"

export PGPASSWORD="${DB_PASSWORD}"

PSQL_BASE=(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -At)

echo "[INFO] Writing artifacts to ${RUN_DIR}"

{
  echo "timestamp=${TIMESTAMP}"
  echo "hostname=$(hostname)"
  echo "fqdn=$(hostname -f 2>/dev/null || true)"
  echo "kernel=$(uname -a)"
} > "${RUN_DIR}/meta.txt"

hostnamectl > "${RUN_DIR}/hostnamectl.txt" || true
uname -a > "${RUN_DIR}/uname.txt"

node -v > "${RUN_DIR}/node_version.txt" 2>&1 || true
npm -v > "${RUN_DIR}/npm_version.txt" 2>&1 || true
pm2 -v > "${RUN_DIR}/pm2_version.txt" 2>&1 || true
psql --version > "${RUN_DIR}/psql_version.txt" 2>&1 || true
nginx -v > "${RUN_DIR}/nginx_version.txt" 2>&1 || true

pm2 status > "${RUN_DIR}/pm2_status.txt" 2>&1 || true
pm2 show waterpermit > "${RUN_DIR}/pm2_show_waterpermit.txt" 2>&1 || true
systemctl status nginx --no-pager > "${RUN_DIR}/nginx_status.txt" 2>&1 || true
systemctl status postgresql --no-pager > "${RUN_DIR}/postgresql_status.txt" 2>&1 || true
ss -tlnp > "${RUN_DIR}/listening_ports.txt" 2>&1 || true

if [[ -f "/etc/nginx/nginx.conf" ]]; then
  cp -a "/etc/nginx/nginx.conf" "${RUN_DIR}/nginx.conf"
fi
if [[ -d "/etc/nginx/sites-available" ]]; then
  mkdir -p "${RUN_DIR}/nginx_sites_available"
  cp -a /etc/nginx/sites-available/* "${RUN_DIR}/nginx_sites_available/" 2>/dev/null || true
fi
if [[ -d "/etc/nginx/sites-enabled" ]]; then
  mkdir -p "${RUN_DIR}/nginx_sites_enabled"
  cp -a /etc/nginx/sites-enabled/* "${RUN_DIR}/nginx_sites_enabled/" 2>/dev/null || true
fi

if command -v ufw >/dev/null 2>&1; then
  ufw status verbose > "${RUN_DIR}/ufw_status.txt" 2>&1 || true
fi

# PostgreSQL security files (version-agnostic discovery).
PG_CONF="$(ls -1d /etc/postgresql/*/main/postgresql.conf 2>/dev/null | sed -n '1p' || true)"
if [[ -n "${PG_CONF}" ]]; then
  PG_HBA="${PG_CONF%/postgresql.conf}/pg_hba.conf"
  cp -a "${PG_CONF}" "${RUN_DIR}/postgresql.conf" || true
  cp -a "${PG_HBA}" "${RUN_DIR}/pg_hba.conf" || true
fi

echo "[INFO] Capturing DB inventory and checksums"
"${PSQL_BASE[@]}" -c "select version();" > "${RUN_DIR}/db_version.txt"
"${PSQL_BASE[@]}" -c "select current_database(), current_user;" > "${RUN_DIR}/db_identity.txt"
"${PSQL_BASE[@]}" -c "select extname, extversion from pg_extension order by 1;" > "${RUN_DIR}/db_extensions.tsv"

"${PSQL_BASE[@]}" -c "select schemaname, tablename from pg_tables where schemaname='public' order by tablename;" > "${RUN_DIR}/public_tables.tsv"
"${PSQL_BASE[@]}" -c "select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1,2,3;" > "${RUN_DIR}/public_functions.tsv"
"${PSQL_BASE[@]}" -c "select event_object_table, trigger_name, action_timing, event_manipulation from information_schema.triggers where trigger_schema='public' order by 1,2;" > "${RUN_DIR}/public_triggers.tsv"
"${PSQL_BASE[@]}" -c "select schemaname, tablename, policyname, permissive, roles, cmd, coalesce(qual,''), coalesce(with_check,'') from pg_policies where schemaname='public' order by 1,2,3;" > "${RUN_DIR}/public_policies.tsv"

"${PSQL_BASE[@]}" -c "select md5(string_agg(tablename, ',' order by tablename)) from pg_tables where schemaname='public';" > "${RUN_DIR}/fingerprint_tables.txt"
"${PSQL_BASE[@]}" -c "select md5(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ',' order by n.nspname,p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';" > "${RUN_DIR}/fingerprint_functions.txt"
"${PSQL_BASE[@]}" -c "select md5(string_agg(event_object_table||':'||trigger_name||':'||event_manipulation, ',' order by event_object_table,trigger_name,event_manipulation)) from information_schema.triggers where trigger_schema='public';" > "${RUN_DIR}/fingerprint_triggers.txt"
"${PSQL_BASE[@]}" -c "select md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by schemaname,tablename,policyname)) from pg_policies where schemaname='public';" > "${RUN_DIR}/fingerprint_policies.txt"

echo "[INFO] Creating schema/data/full dumps"
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --schema-only --no-owner --no-privileges -f "${RUN_DIR}/waterpermit_schema_source.sql"
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --data-only --inserts -f "${RUN_DIR}/waterpermit_data_source.sql"
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --format=custom --compress=9 -f "${RUN_DIR}/waterpermit_full_source.dump"

sha256sum "${RUN_DIR}"/waterpermit_* > "${RUN_DIR}/dump_checksums.sha256"

echo "[INFO] Capturing critical table rowcounts"
"${PSQL_BASE[@]}" -c "\
with tables(table_name) as (values \
('users'), \
('applications'), \
('permits'), \
('inspections'), \
('assessments'), \
('reviews'), \
('approvals'), \
('payments'), \
('water_use_reports'), \
('workflow_history'), \
('documents'), \
('notifications'), \
('transfer_requests') \
) \
select \
  t.table_name, \
  case \
    when to_regclass('public.' || t.table_name) is null then null::bigint \
    else ( \
      xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.table_name), false, true, '')) \
    )[1]::text::bigint \
  end as row_count \
from tables t \
order by t.table_name;\
" > "${RUN_DIR}/critical_table_counts.tsv"

# Fallback count query that is simple and robust.
"${PSQL_BASE[@]}" -c "\
select relname as table_name, n_live_tup::bigint as estimated_rows \
from pg_stat_user_tables \
order by relname;\
" > "${RUN_DIR}/estimated_table_counts.tsv"

echo "[INFO] Packaging artifact folder"
tar -czf "${RUN_DIR}.tar.gz" -C "${OUTPUT_ROOT}" "$(basename "${RUN_DIR}")"
sha256sum "${RUN_DIR}.tar.gz" > "${RUN_DIR}.tar.gz.sha256"

echo "[DONE] Source inventory complete."
echo "Artifact directory: ${RUN_DIR}"
echo "Artifact archive:   ${RUN_DIR}.tar.gz"
echo "Archive checksum:   ${RUN_DIR}.tar.gz.sha256"
