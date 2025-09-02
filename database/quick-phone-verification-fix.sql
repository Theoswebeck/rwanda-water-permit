-- Quick fix for phone verification - Run this in Supabase SQL Editor
-- This adds the missing phone verification columns to the users table

-- Add phone verification columns to users table (if they don't exist)
DO $$ 
BEGIN
    -- Add phone_verified column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verified') THEN
        ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add phone_verification_code column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verification_code') THEN
        ALTER TABLE users ADD COLUMN phone_verification_code VARCHAR(10);
    END IF;
    
    -- Add phone_verification_expires_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verification_expires_at') THEN
        ALTER TABLE users ADD COLUMN phone_verification_expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add phone_verification_attempts column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verification_attempts') THEN
        ALTER TABLE users ADD COLUMN phone_verification_attempts INTEGER DEFAULT 0;
    END IF;
    
    -- Add phone_verification_last_sent column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verification_last_sent') THEN
        ALTER TABLE users ADD COLUMN phone_verification_last_sent TIMESTAMP WITH TIME ZONE;
    END IF;
    
    RAISE NOTICE 'Phone verification columns added successfully!';
END $$;
