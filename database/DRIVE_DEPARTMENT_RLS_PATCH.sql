-- OVERHAUL OF DRIVE STORAGE SECURITY POLICIES
-- This enforces that BOD and IT Admin have global access, 
-- while other departments are isolated to their own department's folder if they have 'manage_drive' access.

-- Drop previous policies
DROP POLICY IF EXISTS "Allow authenticated read company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized insert company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized update company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized delete company_drive" ON storage.objects;

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
      -- Department Isolated Access
      (
        (storage.foldername(name))[1] = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.access_permissions
          WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
             OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
        )
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
      -- Department Isolated Access
      (
        (storage.foldername(name))[1] = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.access_permissions
          WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
             OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
        )
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
        (storage.foldername(name))[1] = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.access_permissions
          WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
             OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
        )
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
        (storage.foldername(name))[1] = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.access_permissions
          WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
             OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
        )
      )
    )
  );
