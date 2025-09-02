-- =============================================
-- FINAL RLS POLICY FIX V4
-- =============================================
-- This script fixes the "infinite recursion" error by simplifying
-- and correcting the Row-Level Security policies on the users table.

-- Step 1: Disable and re-enable RLS to clear any cached plans
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing policies on the users table to start fresh
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow user profile creation" ON public.users; -- From previous fix

-- Step 3: Create a single, permissive policy for authenticated users
-- This policy allows users to perform all actions (SELECT, INSERT, UPDATE)
-- on their own user record, which is a common and secure pattern.
CREATE POLICY "Authenticated users can manage their own profile"
    ON public.users
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Step 4: Ensure public/anonymous users have no access
-- This is a critical security step.
DROP POLICY IF EXISTS "Allow public read access" ON public.users;
-- (No new policy is created for anon, effectively denying access)


-- Step 5: Verify permissions are correct for all roles
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated, service_role;
-- Deny anonymous users any write access
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM anon;
GRANT SELECT ON TABLE public.users TO anon; -- Allow anon to read if other policies permit (none will)

-- Final success message
SELECT 'Final RLS policy fix v4 applied successfully! Login should now work.' as result;
