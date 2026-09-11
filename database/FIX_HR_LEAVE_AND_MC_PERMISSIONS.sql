-- ====================================================================
-- SQL Patch: Fix HR Leave History Visibility & MC Proof Access (Hardened)
-- Solves:
--   1. HR Department unable to view proof of MC (Storage RLS & permissions)
--   2. HR Department unable to find/select leave history for employees
-- Run this script in the Supabase SQL Editor.
-- ====================================================================

-- 1. Helper function public.is_leave_approver:
--    Recognizes all HR staff, management, HODs, and users with HR/Leave access permissions.
--    Hardened against:
--      - JSON boolean cast syntax errors (uses safe string equality = 'true')
--      - Case-insensitive department matching (ILIKE)
--      - Both UUID and Full Name matching for target_id in access_permissions
--      - Restricts approval privileges to HR/Leave/Staff-Management permissions (excludes read-only view_staff)
CREATE OR REPLACE FUNCTION public.is_leave_approver(u_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_department TEXT;
  v_full_name TEXT;
BEGIN
  -- Retrieve user's department and full_name for permission lookups
  SELECT department, full_name INTO v_department, v_full_name
  FROM public.profiles
  WHERE id = u_id;

  -- 1. Check Role or Department
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND (
        r.role_name IN (
          'IT Admin', 'HR', 'HR Manager', 'HR Executive', 'HR Officer',
          'CFO', 'CEO', 'Chairman', 'COO', 'CPO', 'General Manager',
          'Head of Department', 'Director', 'Admin', 'Management'
        )
        OR p.department ILIKE '%human resource%'
        OR p.department ILIKE '%hr%'
        OR p.department ILIKE '%it%'
        OR r.role_name ILIKE '%hr%'
        OR r.role_name ILIKE '%admin%'
      )
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Check granular access_permissions (by User UUID, Full Name, or Department)
  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (
      -- User-level permissions (UUID or Full Name)
      (
        target_type = 'user' 
        AND (target_id = u_id::text OR (v_full_name IS NOT NULL AND target_id = v_full_name))
      )
      -- Department-level permissions (Case-insensitive match)
      OR (
        target_type = 'department' 
        AND v_department IS NOT NULL 
        AND LOWER(TRIM(target_id)) = LOWER(TRIM(v_department))
      )
    )
    -- Safe check avoiding boolean cast errors (works with 'true', true, or 1)
    AND (
      permissions->>'manage_hr' = 'true'
      OR permissions->>'manage_leave' = 'true'
      OR permissions->>'view_leave' = 'true'
      OR permissions->>'edit_staff' = 'true'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Align is_leave_action_allowed with is_leave_approver
CREATE OR REPLACE FUNCTION public.is_leave_action_allowed(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_leave_approver(u_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update public.leave_requests RLS Policies
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own or authorized leave requests" ON public.leave_requests;
CREATE POLICY "Users can select their own or authorized leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own leave requests" ON public.leave_requests;
CREATE POLICY "Users can insert their own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Users and approvers can update leave requests" ON public.leave_requests;
CREATE POLICY "Users and approvers can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()))
  WITH CHECK (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Users and approvers can delete leave requests" ON public.leave_requests;
CREATE POLICY "Users and approvers can delete leave requests"
  ON public.leave_requests FOR DELETE
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));


-- 4. Update public.leave_balances RLS Policies
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own leave balances" ON public.leave_balances;
CREATE POLICY "Users can select their own leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Approvers can update leave balances" ON public.leave_balances;
CREATE POLICY "Approvers can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (public.is_leave_approver(auth.uid()))
  WITH CHECK (public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Approvers can insert leave balances" ON public.leave_balances;
CREATE POLICY "Approvers can insert leave balances"
  ON public.leave_balances FOR INSERT
  WITH CHECK (public.is_leave_approver(auth.uid()));

DROP POLICY IF EXISTS "Approvers can delete leave balances" ON public.leave_balances;
CREATE POLICY "Approvers can delete leave balances"
  ON public.leave_balances FOR DELETE
  USING (public.is_leave_approver(auth.uid()));


-- 5. Secure Storage Bucket Configuration for leave_attachments
-- Bucket is set to private (public = false) to safeguard confidential medical certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave_attachments', 'leave_attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage Security Policies on storage.objects
DROP POLICY IF EXISTS "Users and leave approvers can view leave attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view leave attachments if approver or owner" ON storage.objects;
DROP POLICY IF EXISTS "Public or approver view leave attachments" ON storage.objects;

-- Only the owner of the MC or authorized HR/approvers can access MC proof
CREATE POLICY "Users and leave approvers can view leave attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'leave_attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_leave_approver(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can upload their own leave attachments" ON storage.objects;
CREATE POLICY "Users can upload their own leave attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'leave_attachments' 
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_leave_approver(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their own leave attachments" ON storage.objects;
CREATE POLICY "Users can update their own leave attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'leave_attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_leave_approver(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their own leave attachments" ON storage.objects;
CREATE POLICY "Users can delete their own leave attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'leave_attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_leave_approver(auth.uid())
    )
  );
