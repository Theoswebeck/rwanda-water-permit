-- =============================================
-- FIX EMAIL VERIFICATION FLOW
-- =============================================
-- This script configures Supabase to allow immediate profile creation
-- while still requiring email verification for full access

-- Step 1: Enable email confirmation but allow unconfirmed users to have profiles
-- (This depends on your Supabase configuration, but we ensure the database supports it)

-- Step 2: Add email verification tracking to users table if not exists
DO $$ 
BEGIN
    -- Add email verification fields if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE public.users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified_at') THEN
        ALTER TABLE public.users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verification_token') THEN
        ALTER TABLE public.users ADD COLUMN email_verification_token VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verification_sent_at') THEN
        ALTER TABLE public.users ADD COLUMN email_verification_sent_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Step 3: Create a function to sync email verification status from auth.users
CREATE OR REPLACE FUNCTION public.sync_email_verification()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user profile when email verification status changes in auth.users
    UPDATE public.users 
    SET 
        email_verified = (NEW.email_confirmed_at IS NOT NULL),
        email_verified_at = NEW.email_confirmed_at,
        updated_at = NOW()
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to sync email verification status
DROP TRIGGER IF EXISTS sync_email_verification_trigger ON auth.users;
CREATE TRIGGER sync_email_verification_trigger
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_email_verification();

-- Step 5: Update existing users to sync their email verification status
UPDATE public.users 
SET 
    email_verified = (
        SELECT (email_confirmed_at IS NOT NULL) 
        FROM auth.users 
        WHERE auth.users.id = public.users.id
    ),
    email_verified_at = (
        SELECT email_confirmed_at 
        FROM auth.users 
        WHERE auth.users.id = public.users.id
    )
WHERE EXISTS (
    SELECT 1 FROM auth.users WHERE auth.users.id = public.users.id
);

-- Step 6: Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.sync_email_verification() TO authenticated, service_role;

-- Success message
SELECT 'Email verification flow configured successfully!' as result;
