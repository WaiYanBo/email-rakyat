-- DRIVE MATRIX PERMISSION PATCH
-- This patch ensures that:
-- 1. BOD & IT Admin have global access.
-- 2. Any staff members with 'manage_drive' toggled ON in the Access Control matrix have global access.
-- 3. Standard staff members (without global roles or toggles) have access to their own department folders.

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
      -- Global Access via Access Control Matrix override
      EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
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
      -- Global Access via Access Control Matrix override
      EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
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
      -- Global Access: BOD & IT Admin
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR
      -- Global Access via Access Control Matrix override
      EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
      )
      OR 
      -- Department Isolated Access: Any user can update files inside their own department folder
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
      -- Global Access: BOD & IT Admin
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
      )
      OR
      -- Global Access via Access Control Matrix override
      EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
      )
      OR 
      -- Department Isolated Access: Any user can delete files inside their own department folder
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );
