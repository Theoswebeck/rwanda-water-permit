-- =============================================
-- IMMEDIATE PERMISSIONS FIX
-- =============================================
-- This fixes the "permission denied for table users" error

-- Grant all necessary permissions to authenticated users
GRANT ALL PRIVILEGES ON TABLE public.users TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.users TO anon;
GRANT ALL PRIVILEGES ON TABLE public.users TO service_role;

-- Grant sequence permissions (if any exist)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;

-- Make sure RLS is still disabled (from our previous fix)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Success message
SELECT 'Permissions fixed - signup should work now!' as result;
