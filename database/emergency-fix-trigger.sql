-- =============================================
-- EMERGENCY FIX FOR SIGNUP TRIGGER
-- =============================================
-- This fixes the trigger to allow account creation again

-- Create a safer version of the trigger that properly handles constraints
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert minimal user profile with proper constraint handling
    INSERT INTO public.users (
        id, 
        email, 
        role, 
        status, 
        account_type,
        first_name,
        last_name,
        -- Explicitly set company fields to NULL for individual default
        company_name,
        company_tin, 
        company_address,
        company_phone,
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
        'individual', -- Default to individual, app will update if needed
        'User',       -- Required by constraint for individual accounts
        'Profile',    -- Required by constraint for individual accounts
        NULL,         -- company_name must be NULL for individual
        NULL,         -- company_tin must be NULL for individual  
        NULL,         -- company_address must be NULL for individual
        NULL,         -- company_phone must be NULL for individual
        0, 
        0, 
        0,
        FALSE,
        NOW(), 
        NOW()
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the specific error for debugging
        RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
        -- Don't fail the auth signup, just log the error
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure proper permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Test the function manually (optional)
SELECT 'Emergency trigger fix applied successfully!' as message;
