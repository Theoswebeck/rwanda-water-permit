-- API access for government agencies: requests, grants (API keys), and per-call audit.
-- Design: docs/api-access-DESIGN.md
--
-- Run on the target DB (UAT first, then prod) as a superuser:
--   sudo -u postgres psql -d <waterpermit_db> -f sql/api_access_tables.sql
--
-- Plain tables only — no enum types, safe to run in a single transaction.
-- After creating the tables, grant privileges to the application role (the DB
-- user in the app's DATABASE_URL is not the object owner on prod):
--   GRANT SELECT, INSERT, UPDATE ON api_access_requests, api_access_grants TO :app_user;
--   GRANT SELECT, INSERT ON api_access_logs TO :app_user;
--   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO :app_user;  -- api_access_logs identity column

BEGIN;

CREATE TABLE IF NOT EXISTS api_access_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no            text UNIQUE NOT NULL,          -- APIREQ-<year>-<6 hex>
  institution_name        text NOT NULL,
  institution_type        text NOT NULL
                          CHECK (institution_type IN ('ministry','district','agency','parastatal','other')),
  tin                     text,
  contact_name            text NOT NULL,
  contact_email           text NOT NULL,
  contact_phone           text,
  technical_email         text NOT NULL,
  purpose                 text NOT NULL,
  requested_scopes        text[] NOT NULL
                          CHECK (array_length(requested_scopes, 1) >= 1),
  requested_period_months int NOT NULL CHECK (requested_period_months BETWEEN 1 AND 60),
  static_ip               text,
  accepted_terms_at       timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),
  review_notes            text,
  reviewed_by             text,                          -- admin email (activity-log convention)
  reviewed_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_access_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES api_access_requests(id),
  api_key_hash        text NOT NULL UNIQUE,            -- SHA-256 hex of the full key
  key_prefix          text NOT NULL,                   -- display/lookup, e.g. rwb_uat_ab12cd34
  scopes              text[] NOT NULL
                      CHECK (array_length(scopes, 1) >= 1),
  rate_limit_per_min  int NOT NULL DEFAULT 60 CHECK (rate_limit_per_min BETWEEN 1 AND 6000),
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','revoked')),   -- expiry is computed at request time
  granted_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  total_requests      bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS api_access_grants_key_prefix_idx ON api_access_grants (key_prefix);
CREATE INDEX IF NOT EXISTS api_access_grants_request_idx ON api_access_grants (request_id);

CREATE TABLE IF NOT EXISTS api_access_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grant_id    uuid NOT NULL REFERENCES api_access_grants(id),
  endpoint    text NOT NULL,
  status_code int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_access_logs_grant_created_idx ON api_access_logs (grant_id, created_at DESC);

COMMIT;
