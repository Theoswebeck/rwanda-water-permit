#!/usr/bin/env bash
set -euo pipefail

# Prepare target production server baseline.
# Run on target host as root:
#   sudo bash scripts/migration/prepare_target_server.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Run as root."
  exit 1
fi

APP_USER="${APP_USER:-waterpermit_deploy}"
APP_GROUP="${APP_GROUP:-waterpermit}"
APP_DIR="${APP_DIR:-/opt/waterpermit/app}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/data/waterpermit/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/waterpermit}"
DB_NAME="${DB_NAME:-waterpermit}"
DB_USER="${DB_USER:-waterpermit_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ -z "${DB_PASSWORD}" ]]; then
  echo "[ERROR] DB_PASSWORD is required."
  echo "Example: DB_PASSWORD='strong_password' sudo bash $0"
  exit 1
fi

echo "[INFO] Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y ca-certificates curl gnupg lsb-release ufw nginx git build-essential

echo "[INFO] Installing PostgreSQL and PostGIS"
if ! command -v psql >/dev/null 2>&1; then
  apt install -y postgresql postgresql-contrib postgis
fi

echo "[INFO] Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
fi

echo "[INFO] Installing PM2 globally"
npm install -g pm2

echo "[INFO] Creating service account and directories"
if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${APP_GROUP}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --gid "${APP_GROUP}" --shell /bin/bash "${APP_USER}"
fi

mkdir -p "${APP_DIR}" "${UPLOAD_DIR}" "${BACKUP_DIR}"
chown -R "${APP_USER}:${APP_GROUP}" /opt/waterpermit /var/data/waterpermit
chown -R postgres:postgres "${BACKUP_DIR}"
chmod 750 /var/data/waterpermit
chmod 750 "${UPLOAD_DIR}"

echo "[INFO] Configuring PostgreSQL security"
PG_CONF="$(ls -1d /etc/postgresql/*/main/postgresql.conf 2>/dev/null | sed -n '1p')"
if [[ -z "${PG_CONF}" ]]; then
  echo "[ERROR] Could not find postgresql.conf"
  exit 1
fi
PG_DIR="${PG_CONF%/postgresql.conf}"
PG_HBA="${PG_DIR}/pg_hba.conf"

sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "${PG_CONF}"

if ! grep -Eq "^host[[:space:]]+${DB_NAME}[[:space:]]+${DB_USER}[[:space:]]+127\\.0\\.0\\.1/32[[:space:]]+scram-sha-256" "${PG_HBA}"; then
  echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" >> "${PG_HBA}"
fi

systemctl enable postgresql
systemctl restart postgresql

echo "[INFO] Creating database and role"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '${DB_USER}') then
    create role ${DB_USER} login password '${DB_PASSWORD}';
  else
    alter role ${DB_USER} with login password '${DB_PASSWORD}';
  end if;
end
\$\$;

do \$\$
begin
  if not exists (select 1 from pg_database where datname = '${DB_NAME}') then
    create database ${DB_NAME} owner ${DB_USER};
  end if;
end
\$\$;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" <<SQL
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "postgis";
grant all privileges on schema public to ${DB_USER};
alter default privileges in schema public grant all on tables to ${DB_USER};
alter default privileges in schema public grant all on sequences to ${DB_USER};
alter default privileges in schema public grant execute on functions to ${DB_USER};
SQL

echo "[INFO] Configuring firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 5432/tcp
ufw --force enable

echo "[INFO] Enabling nginx"
systemctl enable nginx
systemctl restart nginx

echo "[DONE] Target server baseline prepared."
echo "[INFO] Versions:"
node -v || true
npm -v || true
pm2 -v || true
psql --version || true
nginx -v 2>&1 || true
