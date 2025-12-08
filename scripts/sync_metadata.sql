-- Sync public.users role and status to auth.users metadata
-- This improves performance by allowing middleware to check role/status without a DB query

UPDATE auth.users au
SET raw_user_meta_data = 
  COALESCE(au.raw_user_meta_data, '{}'::jsonb) || 
  jsonb_build_object(
    'role', pu.role,
    'status', pu.status,
    'account_type', pu.account_type
  )
FROM public.users pu
WHERE au.id = pu.id;

-- Optional: Create a trigger to keep them in sync automatically
-- This ensures future updates to public.users (e.g. suspension) reflect in metadata immediately

CREATE OR REPLACE FUNCTION public.sync_user_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'role', NEW.role,
      'status', NEW.status,
      'account_type', NEW.account_type
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_update_sync_metadata ON public.users;
CREATE TRIGGER on_user_update_sync_metadata
AFTER UPDATE OF role, status, account_type ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_metadata();

