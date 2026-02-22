# ============================================
# STEP 1: PostgreSQL 16 + PostGIS Installation
# Run on: root@10.10.82.212 (RWB UAT Server)
# ============================================

# 1. Update system packages
apt update && apt upgrade -y

# 2. Install prerequisites
apt install -y wget gnupg2 lsb-release curl ca-certificates

# 3. Add PostgreSQL 16 official repo
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt update

# 4. Install PostgreSQL 16 + PostGIS
apt install -y postgresql-16 postgresql-16-postgis-3

# 5. Verify installation
systemctl status postgresql
psql --version
pg_isready

# 6. Enable PostgreSQL to start on boot
systemctl enable postgresql

# ============================================
# STEP 2: Create Database & App User
# ============================================

# Switch to postgres system user and create everything
sudo -u postgres psql <<'SETUP_SQL'

-- Create application database user (change password!)
CREATE USER waterpermit_app WITH PASSWORD 'WP_Rwb2026!SecureDB';

-- Create the database
CREATE DATABASE waterpermit OWNER waterpermit_app;

-- Connect to the new database
\c waterpermit

-- Enable required extensions (must be done as superuser)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant schema usage to app user
GRANT ALL PRIVILEGES ON DATABASE waterpermit TO waterpermit_app;
GRANT ALL ON SCHEMA public TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO waterpermit_app;

-- Verify extensions
SELECT extname, extversion FROM pg_extension;

\q
SETUP_SQL

# ============================================
# STEP 3: Configure PostgreSQL Security
# ============================================

# PostgreSQL config: listen only on localhost (secure — app runs on same server)
PG_CONF=$(find /etc/postgresql -name postgresql.conf | head -1)
PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -1)

echo "PostgreSQL config: $PG_CONF"
echo "HBA config: $PG_HBA"

# Set listen_addresses to localhost only
sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$PG_CONF"
sed -i "s/^listen_addresses = .*/listen_addresses = 'localhost'/" "$PG_CONF"

# Ensure md5/scram-sha-256 auth for local connections
# Add app user auth rule (before the default rules)
grep -q "waterpermit_app" "$PG_HBA" || \
  sed -i '/^# TYPE  DATABASE/a host    waterpermit     waterpermit_app 127.0.0.1/32    scram-sha-256' "$PG_HBA"

# Restart PostgreSQL to apply config changes
systemctl restart postgresql

# ============================================
# STEP 4: Verify Everything Works
# ============================================

# Test connection as the app user
PGPASSWORD='WP_Rwb2026!SecureDB' psql -h 127.0.0.1 -U waterpermit_app -d waterpermit -c "
  SELECT current_database(), current_user, version();
  SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'postgis', 'pgcrypto');
"

# Show PostgreSQL is listening on localhost only
ss -tlnp | grep 5432

echo ""
echo "✅ PostgreSQL 16 setup complete!"
echo "📦 Database: waterpermit"
echo "👤 User: waterpermit_app"
echo "🔒 Listening: localhost:5432 only"
echo "🧩 Extensions: uuid-ossp, postgis, pgcrypto"
echo ""
echo "Connection string for the app:"
echo "  postgresql://waterpermit_app:WP_Rwb2026!SecureDB@127.0.0.1:5432/waterpermit"