-- DRIVE PERMISSION PATCH
-- This patch gives all staff members access to their own department folders without needing the 'manage_drive' explicit permission.
-- Global Admins (BOD & IT) retain global access.

DROP POLICY IF EXISTS "Drive SELECT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive INSERT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive UPDATE Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive DELETE Policy" ON storage.objects;

-- 1. SELECT (READ) POLICY
CREATE POLICY "Drive SELECT Policy"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      -- Global Access: BOD & IT Admin
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR 
      -- Department Isolated Access: Any user can read their own department folder
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );

-- 2. INSERT (UPLOAD) POLICY
CREATE POLICY "Drive INSERT Policy"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      -- Global Access: BOD & IT Admin
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR 
      -- Department Isolated Access: Any user can upload to their own department folder
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );

-- 3. UPDATE (RENAME/MOVE) POLICY
CREATE POLICY "Drive UPDATE Policy"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR 
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );

-- 4. DELETE POLICY
CREATE POLICY "Drive DELETE Policy"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR 
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );
