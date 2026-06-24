-- ====================================================================
--  SUPABASE DATABASE PATCH: ADD EMAIL TO PROFILES
--  Adds email column, syncs existing emails, and registers automatic sync.
--  Run this inside your Supabase SQL Editor.
-- ====================================================================

-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- 2. Sync existing emails from auth.users to public.profiles
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- 3. Trigger to automatically sync email when a new user signs up or updates email
CREATE OR REPLACE FUNCTION public.handle_sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  -- We use INSERT ON CONFLICT DO UPDATE so that if a profile row already exists,
  -- we update its email. If it doesn't exist, we insert a placeholder row with the email.
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_sync_profile_email();
