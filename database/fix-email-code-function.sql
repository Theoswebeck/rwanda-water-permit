-- Fix ambiguous column references in email code functions

-- Recreate with fully-qualified column references and clean drops
DROP FUNCTION IF EXISTS create_email_verification_code(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS verify_email_code(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION create_email_verification_code(
  p_email TEXT,
  p_purpose TEXT,
  p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(out_id UUID, out_email TEXT, out_code TEXT, out_purpose TEXT, out_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Invalidate prior active codes for same email/purpose
  UPDATE public.email_verification_codes evc
     SET consumed_at = NOW(), updated_at = NOW()
   WHERE evc.email = LOWER(p_email)
     AND evc.purpose = p_purpose
     AND evc.consumed_at IS NULL;

  -- Generate 6-digit code
  v_code := LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');

  -- Return the inserted row
  RETURN QUERY
  INSERT INTO public.email_verification_codes(email, code, purpose, expires_at)
  VALUES (LOWER(p_email), v_code, p_purpose, NOW() + MAKE_INTERVAL(mins => p_ttl_minutes))
  RETURNING public.email_verification_codes.id,
            public.email_verification_codes.email,
            public.email_verification_codes.code,
            public.email_verification_codes.purpose,
            public.email_verification_codes.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION verify_email_code(
  p_email TEXT,
  p_code TEXT,
  p_purpose TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.email_verification_codes%ROWTYPE;
BEGIN
  SELECT *
    INTO v_row
    FROM public.email_verification_codes evc
   WHERE evc.email = LOWER(p_email)
     AND evc.purpose = p_purpose
     AND evc.consumed_at IS NULL
   ORDER BY evc.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_row.expires_at < NOW() OR v_row.attempts >= v_row.max_attempts THEN
    RETURN FALSE;
  END IF;

  UPDATE public.email_verification_codes
     SET attempts = attempts + 1,
         updated_at = NOW()
   WHERE id = v_row.id;

  IF v_row.code = p_code THEN
    UPDATE public.email_verification_codes
       SET consumed_at = NOW(),
           updated_at = NOW()
     WHERE id = v_row.id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION create_email_verification_code(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, TEXT) TO service_role;


