-- ====================================================================
--  ANNOUNCEMENTS RLS & PERMISSIONS FIX PATCH
--  Ensures that authenticated staff / admins can insert, update,
--  and delete company announcements without silent RLS blocking.
-- ====================================================================

-- 1. Ensure table exists with all necessary columns
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'Info', -- 'Urgent', 'Memo', or 'Info'
  author_name VARCHAR(255),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- 2. Ensure RLS is enabled
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 3. Drop any outdated or restrictive policies
DROP POLICY IF EXISTS "Allow authenticated users to read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.announcements;
DROP POLICY IF EXISTS "Allow all users to read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow admins to create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.announcements;
DROP POLICY IF EXISTS "Allow user update own" ON public.announcements;
DROP POLICY IF EXISTS "Allow admins to manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow user delete own" ON public.announcements;
DROP POLICY IF EXISTS "Allow admins to delete announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow authorized users to update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Allow authorized users to delete announcements" ON public.announcements;

-- 4. Recreate clean, robust policies for announcements
-- SELECT: All authenticated users can view announcements
CREATE POLICY "Allow authenticated read announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: All authenticated users (or those with dashboard access) can create announcements
CREATE POLICY "Allow authenticated insert announcements"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: All authenticated users can edit/update announcements
CREATE POLICY "Allow authenticated update announcements"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: All authenticated users can delete announcements
CREATE POLICY "Allow authenticated delete announcements"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (true);

-- Enable real-time replication on announcements table if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore if publication doesn't exist in local dev
END $$;
