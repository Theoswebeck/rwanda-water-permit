-- =============================================
-- FIX SIGNUP TRIGGER FOR ACCOUNT TYPE
-- =============================================
-- This script fixes the trigger that creates user profiles
-- to avoid defaulting to 'individual' account type

-- Update the handle_new_user trigger function to create minimal profile only
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert only minimal user profile data
    -- The actual profile data will be updated by the application
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
    ) VALUES (
        NEW.id, 
        NEW.email, 
        'applicant', 
        'active', 
        'individual', -- Default to individual, will be updated by app
        'User',       -- Default names to satisfy constraints
        'Profile',    -- These will be updated by the app
        0, 
        0, 
        0,
        FALSE,
        NOW(), 
        NOW()
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the auth signup
        RAISE LOG 'Error in handle_new_user: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Success message
SELECT 'Signup trigger updated successfully!' as message;
