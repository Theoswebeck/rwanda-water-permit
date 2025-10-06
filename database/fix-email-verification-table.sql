-- =============================================
-- Email Verification System Setup
-- Fix for missing email_verification_codes table and functions
-- =============================================

-- Create the email verification codes table
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'signup',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON public.email_verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_exp ON public.email_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_purpose ON public.email_verification_codes(email, purpose);

-- Enable RLS; codes should only be accessed via server-side keys
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access" ON public.email_verification_codes;
CREATE POLICY "No direct access" ON public.email_verification_codes
  FOR ALL USING (false) WITH CHECK (false);

-- Create the verification code generation function
CREATE OR REPLACE FUNCTION create_email_verification_code(
  p_email TEXT,
  p_purpose TEXT DEFAULT 'signup',
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

-- Create the verification function
CREATE OR REPLACE FUNCTION verify_email_code(
  p_email TEXT,
  p_code TEXT,
  p_purpose TEXT DEFAULT 'signup'
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_email_verification_code(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, TEXT) TO service_role;

-- Allow authenticated users to execute these functions (for API usage)
GRANT EXECUTE ON FUNCTION create_email_verification_code(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, TEXT) TO authenticated;

-- Also grant to anon for public signup
GRANT EXECUTE ON FUNCTION create_email_verification_code(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION verify_email_code(TEXT, TEXT, TEXT) TO anon;

-- Log completion
SELECT 'Email verification system setup completed!' as status;

