-- Key delivery via one-time claim links (requester retrieves the key; the
-- admin never sees it). A grant is created WITHOUT a key: the technical
-- contact receives an emailed claim link, and the key is generated at claim
-- time, shown once to them only.
--
-- Run on the target DB (UAT first, then prod) as a superuser:
--   sudo -u postgres psql -d <waterpermit_db> -f sql/api_access_claim.sql
-- (waterpermit_app already has SELECT/INSERT/UPDATE on api_access_grants.)

BEGIN;

ALTER TABLE api_access_grants ALTER COLUMN api_key_hash DROP NOT NULL;
ALTER TABLE api_access_grants ALTER COLUMN key_prefix DROP NOT NULL;

ALTER TABLE api_access_grants ADD COLUMN IF NOT EXISTS claim_token_hash text UNIQUE; -- SHA-256 of the emailed token
ALTER TABLE api_access_grants ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz; -- claim link validity
ALTER TABLE api_access_grants ADD COLUMN IF NOT EXISTS claimed_at       timestamptz; -- when the requester revealed the key

-- Grants issued before this migration already carry a key: mark them claimed.
UPDATE api_access_grants SET claimed_at = created_at
WHERE api_key_hash IS NOT NULL AND claimed_at IS NULL;

COMMIT;
