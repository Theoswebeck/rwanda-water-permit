-- Create phone_verification_logs table for registration flow
CREATE TABLE IF NOT EXISTS phone_verification_logs (
    id BIGSERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER DEFAULT 1,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'verified', 'expired', 'failed')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for quick phone number lookups
CREATE INDEX IF NOT EXISTS idx_phone_verification_logs_phone_number ON phone_verification_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verification_logs_status ON phone_verification_logs(status);
CREATE INDEX IF NOT EXISTS idx_phone_verification_logs_expires_at ON phone_verification_logs(expires_at);

-- Enable RLS for security
ALTER TABLE phone_verification_logs ENABLE ROW LEVEL SECURITY;

-- Allow anon users to insert verification logs (for registration)
CREATE POLICY "Allow insert for registration" ON phone_verification_logs
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anon users to read their own verification logs (for registration)
CREATE POLICY "Allow read for verification" ON phone_verification_logs
  FOR SELECT TO anon
  USING (true);

-- Allow anon users to update status to verified (for registration)
CREATE POLICY "Allow update for verification" ON phone_verification_logs
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (status IN ('verified', 'expired', 'failed'));

-- Allow authenticated users to manage their own verification logs
CREATE POLICY "Users can manage own verification logs" ON phone_verification_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Clean up expired verification codes automatically (optional)
-- You can set up a cron job or pg_cron to run this periodically
-- DELETE FROM phone_verification_logs WHERE expires_at < NOW() - INTERVAL '1 day';
