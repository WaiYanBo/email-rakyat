-- ====================================================================
--  FIX CLIENT STORAGE & BILLING POLICIES PATCH
--  Ensures all staff can upload/view/delete:
--   1. Invoices & Receipts (ER Advocacy billing documents)
--   2. Client Installment Payment Receipts (uploaded by staff/clients)
--   3. Agreement Forms (physical signed agreements)
-- ====================================================================

-- 1. Ensure columns exist on public.clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS agreement_url TEXT,
ADD COLUMN IF NOT EXISTS agreement_name TEXT,
ADD COLUMN IF NOT EXISTS agreement_date TEXT,
ADD COLUMN IF NOT EXISTS payment_receipts JSONB DEFAULT '{}'::jsonb;

-- 2. Ensure billing_records table has all required columns
ALTER TABLE public.billing_records
ADD COLUMN IF NOT EXISTS drive_url TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Ensure DELETE policy exists for public.billing_records
DROP POLICY IF EXISTS "Drive DELETE Billing Records Policy" ON public.billing_records;
CREATE POLICY "Drive DELETE Billing Records Policy"
  ON public.billing_records FOR DELETE
  USING (
    -- Any user with edit_clients permission, or Global Admin roles
    auth.uid() IN (
      SELECT id FROM public.profiles 
      WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'))
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'edit_clients')::boolean = true)
         OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'edit_clients')::boolean = true)
    )
    OR
    auth.role() = 'authenticated'
  );

-- 4. Rebuild company_drive Storage Policies to explicitly allow Clients/ and Finance/ folders
DROP POLICY IF EXISTS "Drive SELECT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive INSERT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive UPDATE Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive DELETE Policy" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized insert company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized update company_drive" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized delete company_drive" ON storage.objects;

-- A. SELECT (READ & DOWNLOAD) POLICY
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
      -- Unified Client Documents & Billing Folders: accessible to all authenticated staff
      LOWER((storage.foldername(name))[1]) IN ('clients', 'finance', 'trash')
      OR
      LOWER(name) IN ('clients', 'finance', 'trash')
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

-- B. INSERT (UPLOAD) POLICY
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
      -- Unified Client Documents & Billing Folders: accessible to all authenticated staff
      LOWER((storage.foldername(name))[1]) IN ('clients', 'finance', 'trash')
      OR
      LOWER(name) IN ('clients', 'finance', 'trash')
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

-- C. UPDATE (RENAME/MOVE/REPLACE) POLICY
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
      -- Unified Client Documents & Billing Folders: accessible to all authenticated staff
      LOWER((storage.foldername(name))[1]) IN ('clients', 'finance', 'trash')
      OR
      LOWER(name) IN ('clients', 'finance', 'trash')
      OR
      -- Department Isolated Access: Any user can update files in their own department folder
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );

-- D. DELETE POLICY
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
      -- Unified Client Documents & Billing Folders: accessible to all authenticated staff
      LOWER((storage.foldername(name))[1]) IN ('clients', 'finance', 'trash')
      OR
      LOWER(name) IN ('clients', 'finance', 'trash')
      OR
      -- Department Isolated Access: Any user can delete files in their own department folder
      (
        LOWER((storage.foldername(name))[1]) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid()))
        OR
        LOWER(name) = LOWER((SELECT department FROM public.profiles WHERE id = auth.uid())) || '/'
      )
    )
  );
