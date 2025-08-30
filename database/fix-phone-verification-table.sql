-- Fix phone_verification_logs table by recreating it properly

-- First, drop the existing table if it exists
DROP TABLE IF EXISTS phone_verification_logs CASCADE;

-- Create the table with all required columns
CREATE TABLE phone_verification_logs (
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

-- Create indexes for performance
CREATE INDEX idx_phone_verification_logs_phone_number ON phone_verification_logs(phone_number);
CREATE INDEX idx_phone_verification_logs_status ON phone_verification_logs(status);
CREATE INDEX idx_phone_verification_logs_expires_at ON phone_verification_logs(expires_at);

-- Enable Row Level Security
ALTER TABLE phone_verification_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous users (registration flow)
CREATE POLICY "Allow insert for registration" ON phone_verification_logs
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow read for verification" ON phone_verification_logs
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow update for verification" ON phone_verification_logs
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (status IN ('verified', 'expired', 'failed'));

-- Create policies for authenticated users
CREATE POLICY "Users can manage own verification logs" ON phone_verification_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Test the table by inserting a sample record
INSERT INTO phone_verification_logs (
    phone_number, 
    verification_code, 
    expires_at, 
    status
) VALUES (
    '+250999999999', 
    '123456', 
    NOW() + INTERVAL '10 minutes', 
    'sent'
);

-- Verify the insert worked
SELECT * FROM phone_verification_logs WHERE phone_number = '+250999999999';

-- Clean up the test record
DELETE FROM phone_verification_logs WHERE phone_number = '+250999999999';
