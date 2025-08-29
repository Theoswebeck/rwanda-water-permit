-- =============================================
-- FIX AUTHENTICATION AND USER CREATION POLICIES
-- =============================================

-- First, let's add the missing INSERT policy for users table
-- This allows authenticated users to create their own profile
CREATE POLICY "Users can create their own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Also allow service role to insert users (for triggers)
CREATE POLICY "Service role can insert users"
    ON public.users FOR INSERT
    WITH CHECK (true);

-- Update the handle_new_user trigger function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert basic user profile with required fields for check constraints
    INSERT INTO public.users (
        id, 
        email, 
        role, 
        status, 
        account_type,
        first_name,
        last_name, 
        applications_count, 
        reviews_count, 
        inspections_count,
        profile_completed,
        created_at, 
        updated_at
    )
    VALUES (
        NEW.id, 
        NEW.email, 
        'applicant',   -- Default role
        'active',      -- Default status
        'individual',  -- Default account type
        'User',        -- Required by check constraint
        'Profile',     -- Required by check constraint
        0,             -- Initial counts
        0,
        0,
        false,         -- Profile needs completion
        NOW(), 
        NOW()
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
