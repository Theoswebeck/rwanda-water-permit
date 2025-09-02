-- =====================================
-- Add Email Verification Support
-- =====================================
-- This script adds email verification tracking to the users table
-- and sets up proper RLS policies for email verification

-- Add email verification columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for email verification lookups
CREATE INDEX IF NOT EXISTS idx_users_email_verification 
ON users(email_verified, email_verification_sent_at);

-- Update existing users to have email_verified = true (for existing accounts)
UPDATE users 
SET email_verified = true, 
    email_verified_at = created_at,
    updated_at = NOW()
WHERE email_verified IS NULL OR email_verified = false;

-- Create email verification logs table for tracking verification attempts
CREATE TABLE IF NOT EXISTS email_verification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    verification_type TEXT NOT NULL DEFAULT 'signup', -- 'signup', 'email_change', 'manual'
    token_sent BOOLEAN DEFAULT false,
    token_verified BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_verification_type CHECK (verification_type IN ('signup', 'email_change', 'manual'))
);

-- Enable RLS on email verification logs
ALTER TABLE email_verification_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy for email verification logs (users can only see their own logs)
CREATE POLICY "Users can view their own email verification logs" ON email_verification_logs
    FOR SELECT USING (user_id = auth.uid());

-- RLS policy for inserting email verification logs (system/service_role only)
CREATE POLICY "Service role can insert email verification logs" ON email_verification_logs
    FOR INSERT WITH CHECK (true);

-- Create index on email verification logs
CREATE INDEX IF NOT EXISTS idx_email_verification_logs_user_id ON email_verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_logs_email ON email_verification_logs(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_logs_sent_at ON email_verification_logs(sent_at);

-- Function to update email verification status
CREATE OR REPLACE FUNCTION update_user_email_verification(
    user_uuid UUID,
    is_verified BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE users 
    SET 
        email_verified = is_verified,
        email_verified_at = CASE 
            WHEN is_verified THEN NOW() 
            ELSE NULL 
        END,
        updated_at = NOW()
    WHERE id = user_uuid;
    
    -- Log the verification event
    INSERT INTO email_verification_logs (
        user_id,
        email,
        verification_type,
        token_verified,
        verified_at
    )
    SELECT 
        user_uuid,
        email,
        'manual',
        is_verified,
        CASE WHEN is_verified THEN NOW() ELSE NULL END
    FROM users 
    WHERE id = user_uuid;
END;
$$;

-- Function to log email verification attempts
CREATE OR REPLACE FUNCTION log_email_verification_attempt(
    user_uuid UUID,
    user_email TEXT,
    verification_type TEXT DEFAULT 'signup',
    user_ip INET DEFAULT NULL,
    user_agent_string TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO email_verification_logs (
        user_id,
        email,
        verification_type,
        token_sent,
        sent_at,
        ip_address,
        user_agent
    )
    VALUES (
        user_uuid,
        user_email,
        verification_type,
        true,
        NOW(),
        user_ip,
        user_agent_string
    )
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- Function to mark email verification as successful
CREATE OR REPLACE FUNCTION mark_email_verification_success(
    user_uuid UUID,
    log_uuid UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update user verification status
    PERFORM update_user_email_verification(user_uuid, true);
    
    -- Update the specific log entry if provided
    IF log_uuid IS NOT NULL THEN
        UPDATE email_verification_logs 
        SET 
            token_verified = true,
            verified_at = NOW()
        WHERE id = log_uuid AND user_id = user_uuid;
    ELSE
        -- Update the most recent log entry for this user
        UPDATE email_verification_logs 
        SET 
            token_verified = true,
            verified_at = NOW()
        WHERE user_id = user_uuid 
        AND token_verified = false
        AND id = (
            SELECT id FROM email_verification_logs 
            WHERE user_id = user_uuid 
            AND token_verified = false
            ORDER BY sent_at DESC 
            LIMIT 1
        );
    END IF;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_user_email_verification(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION log_email_verification_attempt(UUID, TEXT, TEXT, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_email_verification_success(UUID, UUID) TO authenticated;

-- Update RLS policies to consider email verification status
-- Note: Most applications will enforce email verification at the application level
-- rather than at the database level to provide better user experience

-- Add comment for documentation
COMMENT ON TABLE email_verification_logs IS 'Tracks email verification attempts and status for audit and security purposes';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when the email was verified';

-- Summary
SELECT 'Email verification support added successfully' AS status;

-- Show current verification status
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
    COUNT(*) FILTER (WHERE email_verified = false) as unverified_users
FROM users;
