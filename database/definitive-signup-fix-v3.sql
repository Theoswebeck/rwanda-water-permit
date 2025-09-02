-- =============================================
-- DEFINITIVE SIGNUP FIX V3
-- =============================================
-- This fix makes the application responsible for creating user profiles,
-- resolving the race condition with the database trigger and fixing RLS policies.

-- Step 1: Replace the trigger function with a no-op function
-- This function does nothing, letting the app handle profile creation directly.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- The application is now responsible for creating the user profile.
    -- This trigger is now a no-op to prevent race conditions.
    RAISE LOG 'DEPRECATED TRIGGER: handle_new_user was called for user % but did nothing.', NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 2: Ensure the trigger is still in place but uses the new empty function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Set up secure RLS policies for the users table
-- This is critical for ensuring users can only manage their own data.

-- First, enable RLS if it's not already
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
CREATE POLICY "Users can read their own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Allow users to create their own profile
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
CREATE POLICY "Users can create their own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- Step 4: Ensure permissions are correct
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, anon, service_role;

-- Final success message
SELECT 'Definitive signup fix v3 applied successfully!' as result;
