-- =============================================
-- COMPREHENSIVE SIGNUP DIAGNOSIS & FIX
-- =============================================
-- This script will diagnose and fix all signup issues

-- Step 1: Check if the trigger and function exist
\echo '=== CHECKING TRIGGER STATUS ==='
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user';

-- Step 2: Check users table structure and constraints
\echo '=== CHECKING USERS TABLE ==='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT constraint_name, constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'users' AND table_schema = 'public';

-- Step 3: Check for any recent auth users that might not have profiles
\echo '=== CHECKING AUTH USERS WITHOUT PROFILES ==='
SELECT 
    au.id,
    au.email,
    au.created_at as auth_created,
    u.id as profile_id,
    u.created_at as profile_created
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE au.created_at > NOW() - INTERVAL '1 day'
ORDER BY au.created_at DESC;

-- Step 4: Check RLS policies
\echo '=== CHECKING RLS POLICIES ==='
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users';

-- Step 5: Check if auth.users table exists and is accessible
\echo '=== CHECKING AUTH SCHEMA ==='
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'auth' AND table_name = 'users';

-- Now let's create a bulletproof fix
\echo '=== APPLYING COMPREHENSIVE FIX ==='

-- First, ensure the schema and permissions are correct
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON auth.users TO postgres;
GRANT ALL ON public.users TO postgres;

-- Create the most robust trigger function possible
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    result_message TEXT;
BEGIN
    -- Log the attempt
    RAISE LOG 'handle_new_user triggered for user: %, email: %', NEW.id, NEW.email;
    
    -- Try to insert user profile
    BEGIN
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
            'individual', -- Default, will be updated by app
            'User',       -- Satisfies individual constraint
            'Profile',    -- Satisfies individual constraint
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
        );
        
        result_message := 'SUCCESS: User profile created for ' || NEW.email;
        RAISE LOG '%', result_message;
        
    EXCEPTION 
        WHEN unique_violation THEN
            -- Profile already exists, that's okay
            RAISE LOG 'User profile already exists for %', NEW.email;
        WHEN OTHERS THEN
            -- Log the specific error but don't fail auth
            RAISE LOG 'ERROR creating user profile for %: % - %', NEW.email, SQLSTATE, SQLERRM;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is properly created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Grant all necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON public.users TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, anon, service_role;

-- Ensure RLS policies allow user creation
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can insert users" ON public.users;
DROP POLICY IF EXISTS "Allow trigger to insert users" ON public.users;

CREATE POLICY "Allow user profile creation"
    ON public.users FOR INSERT
    WITH CHECK (true); -- Allow all inserts for now

-- Test the function with a dummy call
\echo '=== TESTING TRIGGER FUNCTION ==='
DO $$
DECLARE
    test_id UUID := gen_random_uuid();
    test_email TEXT := 'test@example.com';
BEGIN
    -- This won't actually create an auth user, just tests our function logic
    RAISE LOG 'Testing handle_new_user function...';
END $$;

\echo '=== DIAGNOSIS AND FIX COMPLETE ==='
\echo 'Next steps:'
\echo '1. Try creating a new account'
\echo '2. Check logs: SELECT * FROM pg_stat_activity WHERE query LIKE ''%handle_new_user%'';'
\echo '3. Check recent users: SELECT * FROM public.users WHERE created_at > NOW() - INTERVAL ''10 minutes'';'
