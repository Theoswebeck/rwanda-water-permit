-- =============================================
-- Add Phone Verification Support to RWB Water Permit System
-- =============================================

-- Add phone verification status to users table
ALTER TABLE users 
ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN phone_verification_code VARCHAR(10),
ADD COLUMN phone_verification_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN phone_verification_attempts INTEGER DEFAULT 0,
ADD COLUMN phone_verification_last_sent TIMESTAMP WITH TIME ZONE;

-- Create phone verification logs table for tracking
CREATE TABLE phone_verification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    
    -- Request details
    request_id VARCHAR(100), -- Pindo request ID for tracking
    pindo_message_id VARCHAR(100), -- Pindo message ID
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'sent', -- 'sent', 'verified', 'expired', 'failed'
    verification_method VARCHAR(50) DEFAULT 'sms',
    
    -- Attempt tracking
    attempts_count INTEGER DEFAULT 1,
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- API response details
    pindo_response JSONB, -- Store full Pindo API response
    cost_incurred DECIMAL(10,4), -- Track SMS costs
    
    -- Network/carrier info
    network_operator VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_phone_verification_logs_user_id ON phone_verification_logs(user_id);
CREATE INDEX idx_phone_verification_logs_status ON phone_verification_logs(status);
CREATE INDEX idx_phone_verification_logs_created_at ON phone_verification_logs(created_at);
CREATE INDEX idx_phone_verification_logs_expires_at ON phone_verification_logs(expires_at);

-- Add trigger for updated_at
CREATE TRIGGER trigger_phone_verification_logs_updated_at
    BEFORE UPDATE ON phone_verification_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired verification codes
CREATE OR REPLACE FUNCTION cleanup_expired_phone_verifications()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    -- Update expired verification codes in users table
    UPDATE users 
    SET 
        phone_verification_code = NULL,
        phone_verification_expires_at = NULL
    WHERE phone_verification_expires_at IS NOT NULL 
        AND phone_verification_expires_at < NOW();
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    -- Update expired verification logs
    UPDATE phone_verification_logs 
    SET status = 'expired'
    WHERE status = 'sent' 
        AND expires_at < NOW();
    
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate random verification code
CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS VARCHAR(6) AS $$
BEGIN
    RETURN LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for phone verification logs
ALTER TABLE phone_verification_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification logs
CREATE POLICY "Users can view their own phone verification logs"
    ON phone_verification_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Only system can insert verification logs
CREATE POLICY "System can insert phone verification logs"
    ON phone_verification_logs FOR INSERT
    WITH CHECK (true); -- This will be controlled by application logic

-- Staff can view all verification logs for audit purposes
CREATE POLICY "Staff can view all phone verification logs"
    ON phone_verification_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'reviewer')
        )
    );

-- Update users table constraints to ensure phone is required for verification
ALTER TABLE users ADD CONSTRAINT chk_phone_for_verification 
    CHECK (
        (phone_verified = FALSE) OR 
        (phone_verified = TRUE AND phone IS NOT NULL)
    );

-- Add comment to explain the phone verification system
COMMENT ON TABLE phone_verification_logs IS 'Tracks phone number verification attempts and status using Pindo.io SMS service';
COMMENT ON COLUMN users.phone_verified IS 'Whether the user phone number has been verified via SMS';
COMMENT ON COLUMN users.phone_verification_code IS 'Current active verification code (cleared after verification or expiry)';
COMMENT ON COLUMN users.phone_verification_expires_at IS 'When the current verification code expires';
COMMENT ON COLUMN users.phone_verification_attempts IS 'Number of verification attempts for current session';
COMMENT ON COLUMN users.phone_verification_last_sent IS 'When the last verification SMS was sent';

-- Insert initial system settings for phone verification
INSERT INTO system_settings (key, value, description, category) VALUES
('phone_verification_enabled', '"true"', 'Enable phone number verification during registration', 'phone_verification'),
('phone_verification_code_length', '"6"', 'Length of phone verification codes', 'phone_verification'),
('phone_verification_expiry_minutes', '"10"', 'Minutes before verification code expires', 'phone_verification'),
('phone_verification_max_attempts', '"3"', 'Maximum verification attempts per session', 'phone_verification'),
('phone_verification_cooldown_minutes', '"1"', 'Minutes between verification code requests', 'phone_verification'),
('pindo_api_enabled', '"true"', 'Enable Pindo.io SMS API integration', 'sms'),
('pindo_sender_name', '"RWB"', 'Default sender name for SMS messages', 'sms'),
('sms_verification_message', '"Your Rwanda Water Resources Board verification code is: {{code}}. Valid for {{minutes}} minutes."', 'SMS verification message template', 'sms')
ON CONFLICT (key) DO NOTHING;

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'Phone verification schema successfully added to RWB Water Permit System';
END $$;
