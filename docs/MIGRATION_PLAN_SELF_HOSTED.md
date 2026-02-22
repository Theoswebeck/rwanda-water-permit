# RWB Water Permit System — Self-Hosted Migration Plan

> **Goal:** Move the Water Permit application from Supabase (hosted BaaS) to a fully
> self-hosted PostgreSQL database on the RWB server, make the application public
> internet-facing, and ensure NIDA integration works natively from within the RWB
> network.
>
> **Important:** No existing user/application data needs to be migrated — only the
> database schema (tables, enums, indexes, triggers, functions) and the application
> code that currently relies on Supabase.

---

## Table of Contents

1. [Network & Server Topology](#1-network--server-topology)
2. [Current Architecture (Supabase)](#2-current-architecture-supabase)
3. [Target Architecture (Self-Hosted)](#3-target-architecture-self-hosted)
4. [Supabase Dependency Audit](#4-supabase-dependency-audit)
5. [Phase 1 — PostgreSQL Setup on RWB Server](#5-phase-1--postgresql-setup-on-rwb-server)
6. [Phase 2 — Self-Hosted Authentication](#6-phase-2--self-hosted-authentication)
7. [Phase 3 — Replace Supabase DB Client](#7-phase-3--replace-supabase-db-client)
8. [Phase 4 — File Storage Migration](#8-phase-4--file-storage-migration)
9. [Phase 5 — Deployment & Nginx Configuration](#9-phase-5--deployment--nginx-configuration)
10. [Phase 6 — Security Hardening](#10-phase-6--security-hardening)
11. [Phase 7 — Schema Migration (No Data)](#11-phase-7--schema-migration-no-data)
12. [Phase 8 — NIDA Integration (Already Done)](#12-phase-8--nida-integration-already-done)
13. [Execution Timeline](#13-execution-timeline)
14. [Risk Register](#14-risk-register)
15. [Environment Variables Reference](#15-environment-variables-reference)

---

## 1. Network & Server Topology

### How the Servers Are Connected

```
                          ┌──────────────────────────────────────┐
                          │           PUBLIC INTERNET             │
                          │   (End users, applicants, staff)      │
                          └────────────────┬─────────────────────┘
                                           │
                                     HTTPS (port 443)
                                           │
                          ┌────────────────▼─────────────────────┐
                          │                                       │
                          │        RWB UAT SERVER                 │
                          │                                       │
                          │   Public IP : 197.243.23.235          │
                          │   Internal IP: 10.10.82.212           │
                          │   OS: Ubuntu (Debian-based)           │
                          │   Access: SSH via VPN only             │
                          │                                       │
                          │   ┌─────────────────────────────┐    │
                          │   │  Our App (Next.js + DB)     │    │
                          │   │  - PostgreSQL (localhost)    │    │
                          │   │  - Next.js on port 3000     │    │
                          │   │  - Nginx on port 80/443     │    │
                          │   │  - File storage on disk     │    │
                          │   └───────────────┬─────────────┘    │
                          │                   │                   │
                          └───────────────────┼───────────────────┘
                                              │
                              RWB Internal LAN │ (10.10.x.x)
                                              │
                          ┌───────────────────▼───────────────────┐
                          │                                       │
                          │     NIDA GESB SERVER                  │
                          │                                       │
                          │   Internal IP: 10.10.73.23            │
                          │   Port: 8080                          │
                          │   Protocol: HTTP (not HTTPS)          │
                          │   Access: Only from RWB LAN           │
                          │                                       │
                          │   Endpoints:                          │
                          │     POST /authenticate                │
                          │     POST /sync/message/send           │
                          │                                       │
                          │   Service: rwbcitizeninfo              │
                          │   Auth: Bearer JWT (24h validity)      │
                          │   Credentials:                        │
                          │     username: rwbcitizen               │
                          │     password: wrb@2026FgA9xK          │
                          │                                       │
                          └───────────────────────────────────────┘
```

### Key Points About the Network

| Fact | Detail |
|------|--------|
| **RWB server can reach NIDA** | Confirmed via `nc -zv 10.10.73.23 8080` from `root@rwfa-uatserver` — connection succeeds |
| **NIDA is NOT on the public internet** | NIDA GESB (`10.10.73.23:8080`) is only accessible from within the RWB LAN. It cannot be reached from laptops, Vercel, or any cloud provider. |
| **RWB server HAS a public IP** | `197.243.23.235` — this means the app can be internet-facing once Nginx + SSL are configured. |
| **VPN required for admin SSH only** | Developers/admins need the VPN to SSH into `10.10.82.212`. End users access the app via the public domain (HTTPS). |
| **NIDA calls happen server-side only** | The Next.js API route (`/api/nida/verify`) makes the call. The end user's browser never talks to NIDA directly. |

### How NIDA Authentication Works

1. **Authenticate** → `POST http://10.10.73.23:8080/authenticate`
   - Body: `{"username":"rwbcitizen","password":"wrb@2026FgA9xK"}`
   - Returns: `{"token":"Bearer eyJhbG...","requestId":"..."}`
   - Token validity: **24 hours**
   - Our code strips the `Bearer ` prefix and caches the raw JWT

2. **Citizen Lookup** → `POST http://10.10.73.23:8080/sync/message/send`
   - Header: `Authorization: Bearer <token>`
   - Header: `serviceName: rwbcitizeninfo`
   - Body: `{"args":{"documentNumber":"1199280195517165"}}`
   - Returns: `{"serviceName":"rwbcitizeninfo","response":{"province":"...","documentNumber":"...","district":"...","photo":"...","foreName":"...","surnames":"...","dateOfBirth":"...","nin":"..."}}`

3. **Error handling**:
   - On `401` → re-authenticate and retry once
   - On non-zero `errorCode` → throw with `statusMessage`
   - Token cached in memory with 23h TTL (refresh 1h before expiry)

### NIDA Integration Code Location

- `lib/nida/gesb.ts` — Core NIDA client (auth, token cache, citizen info lookup)
- `app/api/nida/verify/route.ts` — API route called from the signup form
- `app/api/nida/status/route.ts` — Feature flag check (is NIDA enabled?)
- `components/auth/sign-up-form.tsx` — UI that triggers NIDA on blur of ID field
- `app/api/auth/signup/route.ts` — Server-side NIDA verification during registration

---

## 2. Current Architecture (Supabase)

```
┌──────────────────────┐        ┌──────────────────────────┐
│  Frontend (Next.js)  │◄──────►│  Supabase Cloud          │
│  Deployed on Vercel  │  HTTPS │                          │
│                      │        │  - Auth (JWT sessions)   │
│  Browser talks to:   │        │  - PostgreSQL (managed)  │
│  - Supabase Auth     │        │  - Storage (S3-backed)   │
│  - Supabase DB       │        │  - RLS policies          │
│  - Supabase Storage  │        │  - Real-time (unused)    │
└──────────────────────┘        └──────────────────────────┘
          │
          ✕ Cannot reach NIDA (10.10.73.23 is internal)
```

### What Supabase Provides Today

| Feature | How We Use It | Files Affected |
|---------|---------------|----------------|
| **Supabase Auth** | `signInWithPassword()`, `signUp()`, `getUser()`, `signOut()`, JWT in cookies, `auth.uid()` in RLS | `contexts/AuthContext.tsx`, `middleware.ts`, `lib/supabase/middleware.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, all `app/api/auth/*` routes, `components/auth/login-form.tsx` |
| **Supabase DB Client** | `.from('table').select().eq().insert().update().delete()` query builder | ~80+ files across `app/`, `components/`, `hooks/`, `lib/` |
| **Supabase Storage** | `supabase.storage.from('application-documents').upload()/.download()/.getPublicUrl()` | `lib/supabase-storage.ts`, `components/inspection/field-report-upload.tsx`, `components/inspection/inspection-documents-upload.tsx`, `components/documents/document-viewer.tsx`, `lib/pdf-generator.ts` |
| **Row Level Security** | `auth.uid()` in SQL policies to restrict who can read/write each table | `database/schema.sql` lines 736–981, plus 30+ migration SQL files |
| **Supabase Realtime** | Not used | N/A |

### NPM Packages to Remove

```json
"@supabase/ssr": "^0.7.0",
"@supabase/supabase-js": "^2.57.4"
```

### Files to Delete

```
lib/supabase.ts                  — Global browser client singleton
lib/supabase/client.ts           — Browser client factory
lib/supabase/server.ts           — Server client factory (cookies)
lib/supabase/middleware.ts        — Middleware client factory
lib/supabase/admin.ts            — Service-role admin client
lib/auth-debug.ts                — Supabase auth debug utilities
app/api/debug/supabase/route.ts  — Debug endpoint
app/auth/callback/route.ts       — Supabase auth callback
```

---

## 3. Target Architecture (Self-Hosted)

```
┌──────────────────────────────────────────────────────────────┐
│                     PUBLIC INTERNET                           │
│              https://permit.rwb.rw (HTTPS only)              │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS (port 443)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  RWB SERVER (10.10.82.212 / 197.243.23.235)                  │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  NGINX (port 80→301, port 443)                     │      │
│  │  • SSL/TLS termination (Let's Encrypt or RWB cert) │      │
│  │  • Reverse proxy → localhost:3000                  │      │
│  │  • Serve /uploads/ static files                    │      │
│  │  • Rate limiting on /api/*                         │      │
│  │  • Security headers (HSTS, CSP, X-Frame, etc.)     │      │
│  │  • Max upload body: 50 MB                          │      │
│  └───────────────────────┬────────────────────────────┘      │
│                          │                                    │
│  ┌───────────────────────▼────────────────────────────┐      │
│  │  NEXT.JS APPLICATION (PM2, port 3000)              │      │
│  │                                                    │      │
│  │  • SSR + API routes (no separate backend needed)   │      │
│  │  • Self-managed JWT auth (bcrypt + jsonwebtoken)   │      │
│  │  • Direct PostgreSQL via `pg` Pool                 │      │
│  │  • NIDA calls via lib/nida/gesb.ts                │ ──────── 10.10.73.23:8080 (NIDA)
│  │  • File uploads → /var/data/waterpermit/uploads    │      │
│  │  • IremboPay API calls (external internet)         │      │
│  │  • Pindo SMS + Resend email (external internet)    │      │
│  └───────────────────────┬────────────────────────────┘      │
│                          │ localhost:5432                      │
│  ┌───────────────────────▼────────────────────────────┐      │
│  │  PostgreSQL 16 (localhost only, never exposed)      │      │
│  │                                                    │      │
│  │  • Database: waterpermit                           │      │
│  │  • User: waterpermit_app (least privilege)         │      │
│  │  • Extensions: uuid-ossp, postgis, pgcrypto       │      │
│  │  • Same schema as Supabase (minus RLS policies)   │      │
│  │  • App-level auth replaces RLS                    │      │
│  │  • Daily automated backups via pg_dump            │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │  FILE STORAGE: /var/data/waterpermit/uploads/       │      │
│  │  • Served by Nginx at /uploads/*                   │      │
│  │  • Structure: uploads/applications/{id}/file.pdf   │      │
│  │  • Structure: uploads/permits/{id}/permit.pdf      │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### Benefits of This Architecture

| Benefit | Explanation |
|---------|-------------|
| **NIDA works natively** | Server is on the same LAN as `10.10.73.23` — no VPN tunnels, no proxy servers, no extra hops. NIDA calls are ~10 ms. |
| **No vendor lock-in** | No Supabase dependency. Standard PostgreSQL + Node.js. Can move to any server/cloud. |
| **Data sovereignty** | All data (users, applications, documents) stays on RWB infrastructure in Rwanda. |
| **Cost** | No monthly Supabase fees. No Vercel fees. Runs on existing RWB server. |
| **Security** | Database never exposed to internet. Auth controlled entirely by our code. |
| **Single deploy target** | One server to maintain instead of Supabase + Vercel + Storage. |

---

## 4. Supabase Dependency Audit

### 4.1 Authentication (Supabase Auth → Self-Hosted JWT)

**What Supabase Auth does for us today:**
- User registration (`supabase.auth.admin.createUser()`)
- Login (`supabase.auth.signInWithPassword()`)
- Session management (JWT in cookies, automatic refresh)
- `getUser()` / `getSession()` — validates the current user
- Password reset flow (email magic links)
- `auth.uid()` — used in RLS policies

**What we need to build:**
- `bcrypt` password hashing (register) + comparison (login)
- `jsonwebtoken` (sign JWT on login, verify on every request)
- HTTP-only secure cookies for session tokens
- `/api/auth/login` — verify credentials, issue JWT
- `/api/auth/signup` — hash password, insert user, issue JWT
- `/api/auth/logout` — clear cookie
- `/api/auth/me` — verify JWT, return user profile
- `/api/auth/password-reset/*` — token-based reset flow
- Middleware JWT verification (replaces `supabase.auth.getUser()`)

**Files that need auth changes:**

| File | What Changes |
|------|-------------|
| `contexts/AuthContext.tsx` | Replace all `supabase.auth.*` with `fetch('/api/auth/*')` |
| `middleware.ts` | Replace Supabase middleware client with JWT cookie verification |
| `lib/supabase/middleware.ts` | DELETE — replaced by `lib/auth/jwt.ts` |
| `lib/supabase/server.ts` | DELETE — replaced by `lib/db.ts` |
| `lib/supabase/client.ts` | DELETE — no more client-side DB |
| `lib/supabase/admin.ts` | DELETE — replaced by `lib/db.ts` |
| `app/api/auth/signup/route.ts` | Replace `supabase.auth.admin.createUser()` with `INSERT INTO users` + bcrypt |
| `app/api/auth/change-password/route.ts` | Replace Supabase update with `UPDATE users SET password_hash` |
| `app/api/auth/password-reset/*` | Replace Supabase magic links with token-based flow |
| `app/api/auth/email/*` | Keep — uses Resend, not Supabase |
| `app/api/auth/verify-phone/*` | Keep logic — just swap Supabase DB calls for `pool.query()` |
| `components/auth/login-form.tsx` | Replace `supabase.auth.signInWithPassword()` with `fetch('/api/auth/login')` |
| `app/auth/callback/route.ts` | DELETE — Supabase-specific |

### 4.2 Database (Supabase Client → pg Pool)

**Pattern change:**

Before (Supabase):
```typescript
const { data, error } = await supabase
  .from('applications')
  .select('*')
  .eq('id', applicationId)
  .single()
```

After (pg):
```typescript
const { rows } = await pool.query(
  'SELECT * FROM applications WHERE id = $1',
  [applicationId]
)
const data = rows[0] || null
```

**Affected file groups (~80+ files):**

| Group | Count | Strategy |
|-------|-------|----------|
| `app/api/` routes | ~30 | Direct `pool.query()` — already server-side |
| `app/` page components (server) | ~15 | Direct `pool.query()` — already SSR |
| `hooks/` (client) | ~10 | Convert to `fetch('/api/...')` → API routes do the SQL |
| `components/` (client) | ~25 | Fetch via API routes or receive data as props |
| `lib/` utilities | ~10 | Swap Supabase client for pool |

**Key rule:** No database calls from the browser. All SQL goes through API routes.

### 4.3 Storage (Supabase Storage → Local Filesystem + Nginx)

**What Supabase Storage does today:**
- `supabase.storage.from('application-documents').upload(path, file)` — uploads a file
- `supabase.storage.from('application-documents').getPublicUrl(path)` — returns CDN URL
- `supabase.storage.from('application-documents').download(path)` — downloads a file

**What we build instead:**
- `POST /api/upload` — accepts `multipart/form-data`, saves to `/var/data/waterpermit/uploads/`
- `GET /uploads/{path}` — served directly by Nginx (static files)
- `lib/storage.ts` — utility functions wrapping the above

**Files to change:**

| File | Change |
|------|--------|
| `lib/supabase-storage.ts` | Rewrite entirely → `lib/storage.ts` using `fs` + HTTP |
| `components/inspection/field-report-upload.tsx` | Call new upload API |
| `components/inspection/inspection-documents-upload.tsx` | Call new upload API |
| `components/documents/document-viewer.tsx` | Use `/uploads/` URLs |
| `lib/pdf-generator.ts` | Save PDFs to local disk |

### 4.4 Row Level Security (Supabase RLS → App-Level Auth)

**What Supabase RLS does:**
- Every query is automatically filtered by `auth.uid()` at the database level
- Policies like "Users can only see their own applications" are enforced in SQL

**Why we don't need RLS in self-hosted:**
- The database is **only accessible from localhost** (our Next.js app)
- There is **no direct browser→DB connection** (unlike Supabase)
- All queries go through our API routes where we can check `req.user.id` and `req.user.role`

**What replaces RLS:**
- A middleware function that verifies the JWT and attaches `user` to the request context
- Each API route checks `user.role` and `user.id` before querying
- Example:

```typescript
// Before (Supabase RLS handled it automatically):
const { data } = await supabase.from('applications').select('*')
// ↑ RLS policy: WHERE applicant_id = auth.uid()

// After (we enforce it in code):
const user = await getAuthUser(req) // from JWT cookie
const { rows } = await pool.query(
  'SELECT * FROM applications WHERE applicant_id = $1',
  [user.id]
)
```

**RLS policies to convert to app-level checks:**

| Table | Current RLS Rule | App-Level Equivalent |
|-------|-----------------|---------------------|
| `users` | `auth.uid() = id` for SELECT/UPDATE | Only return own profile; admins can list all |
| `applications` | Applicant sees own; staff sees assigned/all | Filter by `applicant_id` or check `role` |
| `permits` | Applicant sees own via `applications` join; staff sees all | Join check or role check |
| `documents` | Via application ownership | Check application ownership |
| `inspections` | Inspector sees own; applicant via application | Filter by `inspector_id` or join |
| `reviews` | Reviewer sees own | Filter by `reviewer_id` |
| `approvals` | Approver/admin only | Check `role in ('approver','admin')` |
| `notifications` | User sees own | Filter by `user_id` |
| `user_preferences` | User manages own | Filter by `user_id` |

---

## 5. Phase 1 — PostgreSQL Setup on RWB Server

### 5.1 Install PostgreSQL 16 + PostGIS

```bash
# SSH into the RWB server (requires VPN)
ssh root@10.10.82.212

# Update package lists
sudo apt update

# Install PostgreSQL 16 and PostGIS
sudo apt install -y postgresql-16 postgresql-16-postgis-3

# Verify installation
psql --version
# Expected: psql (PostgreSQL) 16.x

# Start and enable on boot
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

### 5.2 Create the Database and App User

```bash
# Switch to postgres user
sudo -u postgres psql
```

```sql
-- Create the database
CREATE DATABASE waterpermit
  WITH ENCODING = 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       TEMPLATE = template0;

-- Create a dedicated application user (NOT a superuser)
-- IMPORTANT: Replace the password below with a strong random password
-- Generate one with: openssl rand -base64 32
CREATE USER waterpermit_app WITH PASSWORD 'CHANGE_ME_USE_OPENSSL_RAND';

-- Grant necessary privileges
GRANT ALL PRIVILEGES ON DATABASE waterpermit TO waterpermit_app;

-- Connect to the new database
\c waterpermit

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- For uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "postgis";     -- For GEOMETRY columns (coordinates)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- For gen_random_bytes() if needed

-- Grant schema access to the app user
GRANT ALL ON SCHEMA public TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO waterpermit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO waterpermit_app;

-- Exit
\q
```

### 5.3 Secure PostgreSQL Configuration

Edit `/etc/postgresql/16/main/postgresql.conf`:

```ini
# Listen ONLY on localhost — never expose to the network
listen_addresses = 'localhost'
port = 5432

# Performance tuning for 8 GB RAM server (adjust as needed)
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 32MB
maintenance_work_mem = 512MB
max_connections = 100

# Logging
log_statement = 'mod'        # Log INSERT/UPDATE/DELETE
log_min_duration_statement = 1000  # Log slow queries (>1s)
```

Edit `/etc/postgresql/16/main/pg_hba.conf`:

```
# TYPE  DATABASE         USER              ADDRESS         METHOD
local   waterpermit      waterpermit_app                   scram-sha-256
host    waterpermit      waterpermit_app   127.0.0.1/32    scram-sha-256

# Keep postgres superuser for local admin
local   all              postgres                          peer
```

```bash
# Restart PostgreSQL to apply changes
sudo systemctl restart postgresql

# Verify connection works
psql -h 127.0.0.1 -U waterpermit_app -d waterpermit
# Should prompt for password, then connect
```

### 5.4 Set Up Automated Daily Backups

```bash
# Create backup directory
sudo mkdir -p /var/backups/waterpermit
sudo chown postgres:postgres /var/backups/waterpermit

# Create backup script
cat > /usr/local/bin/backup-waterpermit.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/waterpermit"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="waterpermit_${TIMESTAMP}.sql.gz"

echo "🔄 Starting database backup: ${FILENAME}"

# Dump the database (as postgres user) and compress
sudo -u postgres pg_dump --format=custom --verbose waterpermit \
  > "${BACKUP_DIR}/${FILENAME%.gz}.dump" 2>/var/log/waterpermit-backup-detail.log

# Also create a plain SQL backup for portability
sudo -u postgres pg_dump waterpermit | gzip > "${BACKUP_DIR}/${FILENAME}"

# Remove backups older than 30 days
find "${BACKUP_DIR}" -type f -mtime +30 -delete

echo "✅ Backup complete: ${FILENAME}"
echo "📁 Backup size: $(du -h ${BACKUP_DIR}/${FILENAME} | cut -f1)"
SCRIPT

chmod +x /usr/local/bin/backup-waterpermit.sh

# Add to crontab — runs daily at 2:00 AM (Africa/Kigali)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-waterpermit.sh >> /var/log/waterpermit-backup.log 2>&1") | crontab -

# Test the backup manually
/usr/local/bin/backup-waterpermit.sh
```

---

## 6. Phase 2 — Self-Hosted Authentication

This is the most complex phase. We replace Supabase Auth entirely.

### 6.1 Install Required Packages

```bash
# On your development machine
cd ~/go/src/waterpermit

npm install pg bcryptjs jsonwebtoken cookie
npm install -D @types/pg @types/bcryptjs @types/jsonwebtoken @types/cookie
```

### 6.2 Create Database Connection Pool

**New file:** `lib/db.ts`

```typescript
import { Pool, PoolClient, QueryResult } from 'pg'

// Singleton pool — reused across all API routes and server components
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // postgresql://waterpermit_app:PASSWORD@localhost:5432/waterpermit
  max: 20,                      // max concurrent connections
  idleTimeoutMillis: 30000,     // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if DB is unreachable
})

// Log pool errors (connection drops, etc.)
pool.on('error', (err) => {
  console.error('❌ [DB] Unexpected pool error:', err.message)
})

export default pool
export { pool }
export type { PoolClient, QueryResult }
```

### 6.3 Add `password_hash` Column to `users` Table

Since Supabase stored passwords in its own `auth.users` table (separate from our
`public.users`), we need a new column:

```sql
-- Run on the new self-hosted PostgreSQL
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- Index for login lookups
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
```

### 6.4 Build Auth Utility Library

**New file:** `lib/auth/password.ts`

```typescript
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
```

**New file:** `lib/auth/jwt.ts`

```typescript
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!
const JWT_EXPIRES_IN = '24h'

export interface JwtPayload {
  sub: string       // user.id (UUID)
  email: string
  role: string
  status: string
  iat?: number
  exp?: number
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}
```

**New file:** `lib/auth/session.ts`

```typescript
import { cookies } from 'next/headers'
import { verifyJwt, JwtPayload } from './jwt'

const AUTH_COOKIE = 'auth-token'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24, // 24 hours
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, token, COOKIE_OPTIONS)
}

export async function clearAuthCookie() {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  if (!token) return null
  return verifyJwt(token)
}
```

### 6.5 Rewrite API Routes

**`app/api/auth/login/route.ts`** (new):
- Accept `{ email, password }`
- Query `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`
- `bcrypt.compare(password, user.password_hash)`
- If valid → `signJwt()` → `setAuthCookie()` → return user profile
- If invalid → return 401
- Track failed attempts (brute-force protection)

**`app/api/auth/signup/route.ts`** (rewrite):
- Replace `supabase.auth.admin.createUser()` with:
  - `hashPassword(password)`
  - `INSERT INTO users (id, email, password_hash, role, status, ...) VALUES (...)`
- NIDA verification logic stays the same
- After insert → `signJwt()` → `setAuthCookie()` → return user

**`app/api/auth/logout/route.ts`** (new):
- `clearAuthCookie()`
- Return 200

**`app/api/auth/me/route.ts`** (new):
- `getAuthUser()` from cookie
- If null → 401
- Query `SELECT * FROM users WHERE id = $1` for fresh profile
- Return user profile

**`app/api/auth/change-password/route.ts`** (rewrite):
- Verify old password with bcrypt
- Hash new password
- `UPDATE users SET password_hash = $1 WHERE id = $2`

**`app/api/auth/password-reset/request/route.ts`** (rewrite):
- Generate random token → store in `password_reset_tokens` table
- Send email via Resend with reset link

**`app/api/auth/password-reset/confirm/route.ts`** (rewrite):
- Validate token from URL
- Hash new password → update user → delete token

### 6.6 Rewrite `middleware.ts`

Replace the Supabase middleware client with JWT verification:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/auth/jwt'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value
  const user = token ? verifyJwt(token) : null

  // ... same route protection logic, but using `user.sub`, `user.role`, etc.
  // ... instead of Supabase's getUser()
}
```

### 6.7 Rewrite `contexts/AuthContext.tsx`

Replace all `supabase.auth.*` calls:

| Before | After |
|--------|-------|
| `supabase.auth.signInWithPassword({email, password})` | `fetch('/api/auth/login', {method:'POST', body: JSON.stringify({email, password})})` |
| `supabase.auth.getUser()` | `fetch('/api/auth/me')` |
| `supabase.auth.signOut()` | `fetch('/api/auth/logout', {method:'POST'})` |
| `supabase.auth.onAuthStateChange()` | Remove — use `useEffect` to check `/api/auth/me` on mount |
| `supabase.from('users').select()` | `fetch('/api/users/me')` or include in `/api/auth/me` response |

---

## 7. Phase 3 — Replace Supabase DB Client

### 7.1 Strategy

Every file that imports from `@/lib/supabase*` or uses `supabase.from()` needs to change.

**For server-side code (API routes, server components):**
- Import `pool` from `@/lib/db`
- Replace `.from('table').select('*').eq('col', val)` with `pool.query('SELECT * FROM table WHERE col = $1', [val])`

**For client-side code (hooks, components):**
- Cannot use `pool` — must call API routes instead
- Create new API routes where needed (e.g., `/api/applications`, `/api/permits`)

### 7.2 Create Helper Utilities

**New file:** `lib/db/helpers.ts`

```typescript
import { pool } from '@/lib/db'

// Wrapper that mimics Supabase's { data, error } pattern for gradual migration
export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<{ data: T[] | null; error: string | null }> {
  try {
    const { rows } = await pool.query(sql, params)
    return { data: rows as T[], error: null }
  } catch (e: any) {
    console.error('❌ [DB] Query error:', e.message)
    return { data: null, error: e.message }
  }
}

export async function queryOne<T = any>(
  sql: string,
  params: any[] = []
): Promise<{ data: T | null; error: string | null }> {
  const result = await query<T>(sql, params)
  return {
    data: result.data?.[0] || null,
    error: result.error,
  }
}
```

### 7.3 Migration Order (by dependency)

Migrate files in this order to avoid breaking the app:

1. **Auth layer** (Phase 2 — already done above)
2. **API routes** — they are self-contained server-side files
3. **Server components** (pages using `createClient()` from server)
4. **Shared utilities** (`lib/*.ts`)
5. **Client hooks** — convert to fetch API routes
6. **Client components** — update to use new hooks

### 7.4 Major API Routes to Migrate

| Route | Supabase Usage | Migration |
|-------|---------------|-----------|
| `app/api/auth/signup/route.ts` | `createUser`, `from('users').insert()` | `pool.query('INSERT INTO users ...')` |
| `app/api/payments/initiate/route.ts` | `from('payments').insert()`, `from('applications').select()` | `pool.query()` for both |
| `app/api/payments/[id]/status/route.ts` | `from('payments').select()`, `from('applications').update()` | `pool.query()` |
| `app/api/payments/webhook/route.ts` | `from('payments').update()`, `from('webhook_logs').insert()` | `pool.query()` |
| `app/api/approver/final-decision/route.ts` | `from('applications').update()`, `from('approvals').insert()`, `from('permits').insert()` | `pool.query()` with transaction |
| `app/api/admin/users/create/route.ts` | `supabase.auth.admin.createUser()`, `from('users').insert()` | `hashPassword()` + `pool.query('INSERT INTO users ...')` |
| `app/api/role-delegations/*.ts` | Multiple table reads/writes | `pool.query()` |
| `app/api/transfers/*.ts` | Multiple table reads/writes | `pool.query()` with transactions |
| `app/api/notifications/send-submission/route.ts` | `from('applications').select()`, `from('users').select()` | `pool.query()` |
| `app/api/public/*.ts` | Public data queries | `pool.query()` (no auth needed) |

### 7.5 Major Pages to Migrate

| Page | Current Approach | Migration |
|------|-----------------|-----------|
| `app/assessment/application/[id]/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |
| `app/review/application/[id]/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |
| `app/inspection/*/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |
| `app/approver/application/[id]/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |
| `app/verification/*/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |
| `app/dashboard/*/page.tsx` | Mixes server + client | Server data via `pool.query()`, client fetches via API |
| `app/admin/page.tsx` | Server-side Supabase client | Use `pool.query()` directly |

### 7.6 Client Hooks to Migrate

| Hook | Current | Migration |
|------|---------|-----------|
| `hooks/useApplications.ts` | `supabase.from('applications')` | `fetch('/api/applications')` |
| `hooks/useApplicationsQuery.ts` | `supabase.from('applications')` | `fetch('/api/applications')` |
| `hooks/usePermits.ts` | `supabase.from('permits')` | `fetch('/api/permits')` |
| `hooks/usePermitsQuery.ts` | `supabase.from('permits')` | `fetch('/api/permits')` |
| `hooks/useDocuments.ts` | `supabase.from('documents')` + storage | New upload/download API |
| `hooks/useWaterUseReports.ts` | `supabase.from('water_use_reports')` | `fetch('/api/water-use-reports')` |
| `hooks/useWaterUseReportsQuery.ts` | `supabase.from('water_use_reports')` | `fetch('/api/water-use-reports')` |

---

## 8. Phase 4 — File Storage Migration

### 8.1 Create Upload Directory on Server

```bash
# On RWB server
sudo mkdir -p /var/data/waterpermit/uploads/applications
sudo mkdir -p /var/data/waterpermit/uploads/permits
sudo mkdir -p /var/data/waterpermit/uploads/inspections
sudo chown -R www-data:www-data /var/data/waterpermit/uploads
sudo chmod -R 755 /var/data/waterpermit/uploads
```

### 8.2 Create Upload API Route

**New file:** `app/api/upload/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { getAuthUser } from '@/lib/auth/session'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/data/waterpermit/uploads'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const folder = formData.get('folder') as string || 'general'

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 400 })

  const ext = path.extname(file.name)
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  const dir = path.join(UPLOAD_DIR, folder)
  const filePath = path.join(dir, fileName)

  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const url = `/uploads/${folder}/${fileName}`
  return NextResponse.json({ path: `${folder}/${fileName}`, url })
}
```

### 8.3 Rewrite `lib/supabase-storage.ts` → `lib/storage.ts`

Replace all Supabase storage methods with local filesystem + HTTP equivalents:

| Supabase Method | New Implementation |
|----------------|-------------------|
| `.upload(path, file)` | `POST /api/upload` with FormData |
| `.getPublicUrl(path)` | Return `/uploads/${path}` |
| `.download(path)` | `fetch('/uploads/${path}')` |
| `.remove(paths)` | `DELETE /api/upload?path=...` (new route) |

### 8.4 Configure Nginx to Serve Uploads

```nginx
# In the Nginx server block (see Phase 5)
location /uploads/ {
    alias /var/data/waterpermit/uploads/;
    expires 30d;
    add_header Cache-Control "public, immutable";
    add_header X-Content-Type-Options "nosniff";

    # Only allow specific file types
    location ~* \.(pdf|jpg|jpeg|png|doc|docx)$ {
        # Allowed
    }
    location ~* \.(exe|sh|bat|cmd|php|py|rb|pl)$ {
        return 403;
    }
}
```

---

## 9. Phase 5 — Deployment & Nginx Configuration

### 9.1 Install Node.js 20 + PM2

```bash
# On RWB server
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # Should be v20.x
npm --version

# Install PM2 globally
npm install -g pm2
```

### 9.2 Clone and Build the Application

```bash
# Create application directory
mkdir -p /opt/waterpermit
cd /opt/waterpermit

# Clone the repository (or scp the code)
git clone <your-repo-url> .
# Or: scp -r ~/go/src/waterpermit/* root@10.10.82.212:/opt/waterpermit/

# Install dependencies
npm ci

# Build the production bundle
npm run build
```

### 9.3 Create `.env.production`

```bash
cat > /opt/waterpermit/.env.production << 'ENV'
# =============================================
# RWB Water Permit System — Production Config
# =============================================

# --- Database (local PostgreSQL) ---
DATABASE_URL=postgresql://waterpermit_app:YOUR_STRONG_PASSWORD@localhost:5432/waterpermit

# --- Authentication ---
JWT_SECRET=GENERATE_WITH_openssl_rand_base64_64
SESSION_SECRET=GENERATE_ANOTHER_openssl_rand_base64_64

# --- NIDA Integration (direct LAN access from this server) ---
NIDA_BASE_URL=http://10.10.73.23:8080
NIDA_USERNAME=rwbcitizen
NIDA_PASSWORD=wrb@2026FgA9xK
NIDA_VERIFICATION_ENABLED=true

# --- IremboPay Payment Gateway ---
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=your_public_key
IREMBOPAY_SECRET_KEY=your_secret_key
IREMBOPAY_WEBHOOK_SECRET=your_webhook_secret
IREMBOPAY_PRODUCT_CODE=WATER_PERMIT_FEE
IREMBOPAY_ACCOUNT_ID=RWANDA_WATER_BOARD
NEXT_PUBLIC_IREMBOPAY_SANDBOX=false
IREMBOPAY_SANDBOX=false

# --- Email (Resend) ---
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@rwb.rw
SUPPORT_EMAIL=contact@rwb.rw

# --- SMS (Pindo) ---
PINDO_API_KEY=your_pindo_api_key
PINDO_SENDER_NAME=RWB

# --- App URLs ---
NEXT_PUBLIC_APP_URL=https://permit.rwb.rw
NODE_ENV=production

# --- File Storage ---
UPLOAD_DIR=/var/data/waterpermit/uploads
UPLOAD_URL_PREFIX=/uploads

# --- Demo modes OFF in production ---
NEXT_PUBLIC_PAYMENT_DEMO_MODE=false
PAYMENT_DEMO_MODE=false

# --- Heartbeat ---
NEXT_PUBLIC_ENABLE_CLIENT_HEARTBEAT=true
NEXT_PUBLIC_CLIENT_HEARTBEAT_INTERVAL_MS=60000
ENV
```

### 9.4 Run with PM2

```bash
cd /opt/waterpermit

# Start the application
pm2 start npm --name "waterpermit" -- start -- -p 3000

# Save PM2 process list
pm2 save

# Configure PM2 to start on system boot
pm2 startup systemd
# Follow the command it prints (sudo env PATH=... pm2 startup ...)

# Useful PM2 commands:
pm2 status              # Check running processes
pm2 logs waterpermit    # View logs
pm2 restart waterpermit # Restart after code changes
pm2 monit               # Real-time monitoring dashboard
```

### 9.5 Install and Configure Nginx

```bash
# Install Nginx
apt install -y nginx

# Install Certbot for SSL (Let's Encrypt)
apt install -y certbot python3-certbot-nginx
```

**Create Nginx config:** `/etc/nginx/sites-available/waterpermit`

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=upload:10m rate=10r/m;

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name permit.rwb.rw;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name permit.rwb.rw;

    # ─── SSL Configuration ───
    ssl_certificate     /etc/letsencrypt/live/permit.rwb.rw/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/permit.rwb.rw/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # ─── Security Headers ───
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

    # ─── Max Upload Size ───
    client_max_body_size 50M;

    # ─── Static File Uploads ───
    location /uploads/ {
        alias /var/data/waterpermit/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff";
    }

    # ─── Auth API (strict rate limit) ───
    location ~ ^/api/auth/(login|signup|password-reset) {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ─── Upload API (rate limit) ───
    location /api/upload {
        limit_req zone=upload burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # ─── General API ───
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # ─── Next.js Application ───
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
```

```bash
# Enable the site
ln -s /etc/nginx/sites-available/waterpermit /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # Remove default site

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

# Get SSL certificate (requires DNS to point to this server first)
certbot --nginx -d permit.rwb.rw --non-interactive --agree-tos -m admin@rwb.rw

# Auto-renew SSL (certbot adds this automatically, but verify)
systemctl status certbot.timer
```

### 9.6 DNS Configuration

Point `permit.rwb.rw` A record to the RWB server's **public IP**:

```
permit.rwb.rw.   IN   A   197.243.23.235
```

> **Note:** If RWB manages DNS internally, coordinate with their IT team to create
> this record. The server must be reachable on ports 80 and 443 from the internet.

### 9.7 Firewall Rules

```bash
# Install ufw if not present
apt install -y ufw

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow HTTP and HTTPS from anywhere (public-facing)
ufw allow 80/tcp
ufw allow 443/tcp

# Allow SSH only from known admin IPs or VPN range
ufw allow from 10.10.0.0/16 to any port 22   # RWB VPN range

# NEVER expose PostgreSQL (5432) to the network
# (It's already configured for localhost only, but belt-and-suspenders)
ufw deny 5432/tcp

# Enable firewall
ufw enable
ufw status verbose
```

---

## 10. Phase 6 — Security Hardening

### Public Internet Threat Model

Since this is now **public-facing**, we must protect against:

| Threat | Mitigation |
|--------|-----------|
| **Brute-force login** | Rate limit login to 5 req/min per IP (Nginx). Lock account after 5 failed attempts for 15 minutes. |
| **SQL injection** | All queries use parameterized `$1, $2` placeholders. NEVER concatenate user input into SQL strings. |
| **XSS (Cross-Site Scripting)** | Next.js auto-escapes JSX. CSP header via Nginx. `httpOnly` cookies prevent JS access to tokens. |
| **CSRF** | `SameSite=Lax` on auth cookies. Verify `Origin` header on mutations. |
| **Session hijacking** | JWT in `httpOnly`, `Secure`, `SameSite=Lax` cookie. HTTPS only. |
| **File upload attacks** | Whitelist extensions (pdf, jpg, png, doc, docx). Validate MIME types. Max 50 MB. |
| **DDoS** | Nginx rate limiting. Optional: put Cloudflare in front (free tier). |
| **Data leakage** | PostgreSQL only on localhost. No debug endpoints in production. Logs sanitized. |
| **Password security** | bcrypt with cost factor 12. Minimum 8 characters. |
| **Token security** | JWT secret is 64+ random bytes. 24h expiry. |
| **NIDA credentials** | In env vars only, never in code. Server-side calls only. |

### Implementation Checklist

- [ ] All auth cookies: `httpOnly: true, secure: true, sameSite: 'lax'`
- [ ] All SQL queries use `$1, $2, ...` parameterization
- [ ] Login rate limiter: 5 attempts per minute per IP
- [ ] Account lockout after 5 failed logins (15 min cooldown)
- [ ] Password minimum 8 characters, bcrypt cost 12
- [ ] JWT secret: generate with `openssl rand -base64 64`
- [ ] Nginx security headers configured
- [ ] Nginx HTTPS only (HTTP redirects to HTTPS)
- [ ] PostgreSQL listens on localhost only
- [ ] Firewall: only 80, 443, and SSH (VPN IPs only)
- [ ] No Supabase keys in production env
- [ ] NIDA credentials in env vars only
- [ ] Upload directory has proper permissions (www-data)
- [ ] File upload whitelist enforced
- [ ] All debug/test routes removed or behind admin auth

---

## 11. Phase 7 — Schema Migration (No Data)

### What Gets Migrated

Only the database **structure** — no user data, no applications, no files.

### Tables to Create

From `database/schema.sql`:

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | User accounts + profiles (+ new `password_hash` column) |
| 2 | `applications` | Water permit applications |
| 3 | `inspections` | Field inspections |
| 4 | `permits` | Issued permits |
| 5 | `documents` | Uploaded documents metadata |
| 6 | `reviews` | Application reviews |
| 7 | `approvals` | Final decisions |
| 8 | `workflow_history` | State change audit trail |
| 9 | `communications` | Comments and messages |
| 10 | `notifications` | User notifications |
| 11 | `system_settings` | App configuration |
| 12 | `user_preferences` | Per-user settings |
| 13 | `audit_logs` | Security audit trail |

From migration files:

| # | Table | Source File |
|---|-------|------------|
| 14 | `payments` | `database/irembopay-payments-migration.sql` |
| 15 | `merchants` | `database/irembopay-payments-migration.sql` |
| 16 | `payment_transactions` | `database/irembopay-payments-migration.sql` |
| 17 | `webhook_logs` | `database/irembopay-payments-migration.sql` |
| 18 | `payment_receipts` | `database/irembopay-payments-migration.sql` |
| 19 | `water_use_reports` | `database/supabase/20260108000002_create_water_use_reports.sql` |
| 20 | `phone_verification_logs` | `database/add-phone-verification-support.sql` |
| 21 | `email_verification_codes` | `database/add-email-code-verification.sql` |
| 22 | `password_reset_tokens` | `database/add-password-reset-tokens.sql` |
| 23 | `technical_assessments` | `database/create-technical-assessments-table.sql` |
| 24 | `quarterly_permit_stats` | `database/create-quarterly-permit-stats.sql` |
| 25 | `assessments` | `database/new-workflow-schema-update.sql` |
| 26 | `permit_change_events` | `database/supabase/20260214000000_permit_modification_history.sql` |
| 27 | `transfer_requests` | `database/migrations/create-transfer-requests.sql` |

### Enums to Create

```sql
-- From schema.sql
user_role, user_status, account_type, id_type,
application_status, application_type, water_source_type, water_purpose, sla_status,
permit_status, document_type, verification_status,
inspection_status, inspection_type, inspection_result,
risk_assessment, recommendation_type, province_type

-- From payments migration
payment_status, payment_method, payment_channel, webhook_event_type
```

### What Gets REMOVED (Supabase-specific)

- All `ENABLE ROW LEVEL SECURITY` statements → removed
- All `CREATE POLICY "..." ON ... USING (auth.uid() = ...)` statements → removed
- All references to `auth.uid()` → removed
- All references to `auth.users` → removed
- No Supabase triggers or functions that reference Supabase internals

### What Gets ADDED (self-hosted)

```sql
-- Password storage for self-hosted auth
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_sign_in_at TIMESTAMPTZ;

-- Login attempt tracking (brute-force protection)
CREATE TABLE login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, created_at);
```

### What Gets KEPT (unchanged)

- All table definitions (columns, types, constraints, defaults)
- All indexes
- All triggers (`update_updated_at_column`, `generate_application_number`, `generate_permit_number`, `update_user_activity_counts`)
- All functions
- All `CHECK` constraints
- All foreign key relationships
- All `UNIQUE` constraints
- Default system_settings data

### Migration Script

We will create a single consolidated `database/self-hosted-schema.sql` that:

1. Creates all extensions
2. Creates all enums
3. Creates all tables (with `password_hash` column on `users`)
4. Creates all indexes
5. Creates all triggers and functions
6. Inserts default system settings
7. Does **NOT** include any RLS policies or `auth.uid()` references

```bash
# To run on the RWB server:
scp database/self-hosted-schema.sql root@10.10.82.212:/tmp/
ssh root@10.10.82.212
sudo -u postgres psql -d waterpermit -f /tmp/self-hosted-schema.sql
```

---

## 12. Phase 8 — NIDA Integration (Already Done)

The NIDA integration is **already implemented** and will work better in the
self-hosted setup because:

- The Next.js server runs **on the RWB server** (`10.10.82.212`)
- The RWB server **can reach NIDA** (`10.10.73.23:8080`) directly via LAN
- No VPN tunneling, no proxy servers, no extra network hops
- NIDA calls will be faster (~10 ms latency vs timeout issues from external servers)

### Files (no changes needed)

| File | Purpose | Status |
|------|---------|--------|
| `lib/nida/gesb.ts` | NIDA auth + citizen lookup client | ✅ Ready |
| `app/api/nida/verify/route.ts` | API route for UI-triggered verification | ✅ Ready |
| `app/api/nida/status/route.ts` | Feature flag check | ✅ Ready |
| `components/auth/sign-up-form.tsx` | UI triggers NIDA on ID blur | ✅ Ready |

### Environment Variables (already documented)

```env
NIDA_BASE_URL=http://10.10.73.23:8080
NIDA_USERNAME=rwbcitizen
NIDA_PASSWORD=wrb@2026FgA9xK
NIDA_VERIFICATION_ENABLED=true
```

---

## 13. Execution Timeline

| # | Phase | Effort | Dependencies | Description |
|---|-------|--------|-------------|-------------|
| 1 | **PostgreSQL Setup** | 1 day | RWB server access | Install PG16, create DB, run schema, set up backups |
| 2 | **Auth Rewrite** | 3–4 days | Phase 1 | JWT auth, bcrypt, session cookies, all auth routes, middleware, AuthContext |
| 3 | **DB Client Migration** | 5–7 days | Phase 2 | Replace `supabase.from()` in ~80+ files with `pool.query()` |
| 4 | **File Storage** | 1 day | Phase 1 | Upload API, Nginx static serving, rewrite storage lib |
| 5 | **Deployment** | 1 day | Phases 1–4 | Nginx, PM2, SSL, DNS, firewall |
| 6 | **Security Hardening** | 1 day | Phase 5 | Rate limits, brute-force protection, audit |
| 7 | **Schema Migration** | 0.5 day | Phase 1 | Generate self-hosted schema SQL, run on server |
| 8 | **NIDA (already done)** | 0 days | — | Already implemented, just set env vars |
| | **Testing & QA** | 2–3 days | All phases | End-to-end testing of all workflows |
| | **TOTAL** | **~14–18 days** | | |

### Suggested Sprint Plan

- **Week 1:** Phase 1 (DB setup) + Phase 7 (Schema) + Phase 2 (Auth rewrite)
- **Week 2:** Phase 3 (DB client migration — API routes and pages)
- **Week 3:** Phase 3 continued (hooks, components) + Phase 4 (Storage)
- **Week 4:** Phase 5 (Deploy) + Phase 6 (Security) + Testing

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RWB server outage → app down | Medium | High | Set up monitoring (PM2 + healthcheck cron). Consider redundant server long-term. |
| Database corruption/loss | Low | Critical | Daily automated backups. Test restore monthly. |
| NIDA network change | Low | Medium | NIDA config is env vars. Easy to update endpoint. |
| SSL cert expiry | Low | Medium | Certbot auto-renews. Add monitoring alert. |
| Brute-force attacks | High | Medium | Rate limiting + account lockout + strong passwords. |
| File storage disk full | Medium | Medium | Monitor disk usage. Alert at 80%. Add logrotate. |
| Node.js/PM2 crash | Low | Medium | PM2 auto-restarts. `pm2 startup` survives reboots. |
| Code deployment breaks prod | Medium | High | Test on staging first. PM2 rollback. Git tags. |

---

## 15. Environment Variables Reference

### Self-Hosted Production (`.env.production`)

```env
# ─── Database ───
DATABASE_URL=postgresql://waterpermit_app:PASSWORD@localhost:5432/waterpermit

# ─── Authentication ───
JWT_SECRET=                    # openssl rand -base64 64
SESSION_SECRET=                # openssl rand -base64 64

# ─── NIDA ───
NIDA_BASE_URL=http://10.10.73.23:8080
NIDA_USERNAME=rwbcitizen
NIDA_PASSWORD=wrb@2026FgA9xK
NIDA_VERIFICATION_ENABLED=true

# ─── IremboPay ───
NEXT_PUBLIC_IREMBOPAY_PUBLIC_KEY=
IREMBOPAY_SECRET_KEY=
IREMBOPAY_WEBHOOK_SECRET=
IREMBOPAY_PRODUCT_CODE=WATER_PERMIT_FEE
IREMBOPAY_ACCOUNT_ID=RWANDA_WATER_BOARD
NEXT_PUBLIC_IREMBOPAY_SANDBOX=false
IREMBOPAY_SANDBOX=false

# ─── Email (Resend) ───
RESEND_API_KEY=
EMAIL_FROM=noreply@rwb.rw
SUPPORT_EMAIL=contact@rwb.rw

# ─── SMS (Pindo) ───
PINDO_API_KEY=
PINDO_SENDER_NAME=RWB

# ─── App ───
NEXT_PUBLIC_APP_URL=https://permit.rwb.rw
NODE_ENV=production

# ─── File Storage ───
UPLOAD_DIR=/var/data/waterpermit/uploads
UPLOAD_URL_PREFIX=/uploads

# ─── Deprecated (REMOVE these) ───
# NEXT_PUBLIC_SUPABASE_URL        ← DELETE
# NEXT_PUBLIC_SUPABASE_ANON_KEY   ← DELETE
# SUPABASE_SERVICE_ROLE_KEY       ← DELETE
```

### Variables NO LONGER NEEDED

| Variable | Reason |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | No Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | No Supabase |

### New Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://waterpermit_app:pass@localhost:5432/waterpermit` |
| `JWT_SECRET` | Signs auth JWTs | 64+ random bytes (base64) |
| `SESSION_SECRET` | Session encryption | 64+ random bytes (base64) |
| `UPLOAD_DIR` | Server filesystem path for uploads | `/var/data/waterpermit/uploads` |
| `UPLOAD_URL_PREFIX` | URL prefix for uploaded files | `/uploads` |

---

## Appendix A: Commands Quick Reference

### Server Setup (one-time)

```bash
# Install PostgreSQL
sudo apt install -y postgresql-16 postgresql-16-postgis-3

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Nginx
apt install -y nginx certbot python3-certbot-nginx
```

### Deploy / Update

```bash
ssh root@10.10.82.212
cd /opt/waterpermit
git pull
npm ci
npm run build
pm2 restart waterpermit
```

### Monitor

```bash
pm2 logs waterpermit          # App logs
pm2 monit                      # Real-time dashboard
sudo tail -f /var/log/nginx/error.log   # Nginx errors
sudo -u postgres psql -d waterpermit -c "SELECT count(*) FROM users;"   # DB check
```

### Backup / Restore

```bash
# Manual backup
/usr/local/bin/backup-waterpermit.sh

# Restore from backup
sudo -u postgres pg_restore -d waterpermit /var/backups/waterpermit/waterpermit_YYYYMMDD.dump
```
