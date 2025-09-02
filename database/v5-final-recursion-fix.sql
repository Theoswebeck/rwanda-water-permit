-- =============================================
-- V5 - FINAL RECURSION-PROOF RLS FIX
-- =============================================
-- This script resolves the "infinite recursion" login error by creating
-- a minimal, non-recursive RLS policy for the users table.

-- Step 1: Remove all previous, faulty policies to ensure a clean slate.
DROP POLICY IF EXISTS "Authenticated users can manage their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow user profile creation" ON public.users;

-- Step 2: Create a simple, secure, and non-recursive policy.
-- This is the standard Supabase policy for user profiles. It checks
-- the user's ID directly without calling functions that could cause recursion.
CREATE POLICY "Users can manage their own data"
    ON public.users
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Step 3: Ensure RLS is enabled.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY; -- Enforce RLS for table owners too

-- Final confirmation message
SELECT 'V5 RLS Fix: Applied successfully. The login recursion error should now be resolved.' as result;
