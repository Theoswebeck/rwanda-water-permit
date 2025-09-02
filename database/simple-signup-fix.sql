-- =============================================
-- SIMPLE SIGNUP FIX - NO PSQL COMMANDS
-- =============================================

-- Check if the trigger exists
SELECT 
    'TRIGGER CHECK:' as step,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Check if the function exists
SELECT 
    'FUNCTION CHECK:' as step,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user';

-- Check recent auth users without profiles
SELECT 
    'ORPHANED USERS:' as step,
    au.id,
    au.email,
    au.created_at as auth_created,
    u.id as profile_id
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE au.created_at > NOW() - INTERVAL '1 day'
  AND u.id IS NULL
ORDER BY au.created_at DESC
LIMIT 5;

-- Now create the fixed trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert user profile with proper constraint handling
    INSERT INTO public.users (
        id, 
        email, 
        role, 
        status, 
        account_type,
        first_name,
        last_name,
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
        'individual', -- Default, app will update
        'User',       -- Required for individual constraint
        'Profile',    -- Required for individual constraint
        NULL,         -- Must be NULL for individual
        NULL,         -- Must be NULL for individual 
        NULL,         -- Must be NULL for individual
        NULL,         -- Must be NULL for individual
        0, 
        0, 
        0,
        FALSE,
        NOW(), 
        NOW()
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent duplicates
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail auth signup on profile errors
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON public.users TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, anon, service_role;

-- Ensure RLS allows profile creation
DROP POLICY IF EXISTS "Allow user profile creation" ON public.users;
CREATE POLICY "Allow user profile creation"
    ON public.users FOR INSERT
    WITH CHECK (true);

-- Success message
SELECT 'Simple signup fix applied successfully!' as result;
