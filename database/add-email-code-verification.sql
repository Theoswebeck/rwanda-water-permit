-- Email code verification support (OTP via email)
-- Creates a lightweight table to store short-lived verification codes

CREATE TABLE IF NOT EXISTS email_verification_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signup', -- signup | change_email | recovery
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON email_verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_exp ON email_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_purpose ON email_verification_codes(email, purpose);

-- Enable RLS; codes should only be accessed via server-side keys
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access" ON email_verification_codes;
CREATE POLICY "No direct access" ON email_verification_codes
  FOR ALL USING (false) WITH CHECK (false);

-- Helper function to upsert a new code and invalidate previous ones
CREATE OR REPLACE FUNCTION create_email_verification_code(p_email TEXT, p_purpose TEXT, p_ttl_minutes INTEGER DEFAULT 15)
RETURNS TABLE(id UUID, email TEXT, code TEXT, purpose TEXT, expires_at TIMESTAMPTZ) AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Invalidate any previous active codes for same email/purpose
  UPDATE email_verification_codes
    SET consumed_at = NOW(), updated_at = NOW()
  WHERE email = p_email AND purpose = p_purpose AND consumed_at IS NULL;

  -- Generate 6-digit code
  v_code := LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');

  INSERT INTO email_verification_codes(email, code, purpose, expires_at)
  VALUES (LOWER(p_email), v_code, p_purpose, NOW() + MAKE_INTERVAL(mins => p_ttl_minutes))
  RETURNING email_verification_codes.id, email_verification_codes.email, email_verification_codes.code, email_verification_codes.purpose, email_verification_codes.expires_at
  INTO id, email, code, purpose, expires_at;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify code function: increments attempts and consumes on success
CREATE OR REPLACE FUNCTION verify_email_code(p_email TEXT, p_code TEXT, p_purpose TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_row email_verification_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM email_verification_codes
   WHERE email = LOWER(p_email) AND purpose = p_purpose AND consumed_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check expiry and attempts
  IF v_row.expires_at < NOW() OR v_row.attempts >= v_row.max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Increment attempts
  UPDATE email_verification_codes
    SET attempts = attempts + 1, updated_at = NOW()
  WHERE id = v_row.id;

  IF v_row.code = p_code THEN
    UPDATE email_verification_codes
      SET consumed_at = NOW(), updated_at = NOW()
    WHERE id = v_row.id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_email_verification_code(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, TEXT) TO service_role;


