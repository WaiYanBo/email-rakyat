-- ====================================================================
-- SQL Patch: Fix Appointments Delete & Management Permissions (Hardened)
-- Solves:
--   1. Delete button blocked by Supabase RLS for IT staff / Head of Department
--   2. Ensures has_appointment_permission includes HOD, IT, HR, and creators
-- Run this script in the Supabase SQL Editor.
-- ====================================================================

-- 1. Helper function public.has_appointment_permission:
CREATE OR REPLACE FUNCTION public.has_appointment_permission(u_id UUID, perm_type TEXT)
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
          'Head of Department', 'Director', 'Admin', 'Management', 'BOD'
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
      (target_type = 'user' AND (target_id = u_id::text OR (v_full_name IS NOT NULL AND target_id = v_full_name)))
      OR (target_type = 'department' AND v_department IS NOT NULL AND LOWER(TRIM(target_id)) = LOWER(TRIM(v_department)))
    )
    AND (
      (permissions->>perm_type)::boolean = true
      OR permissions->>perm_type = 'true'
      OR (permissions->>'manage_appointments')::boolean = true
      OR permissions->>'manage_appointments' = 'true'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update DELETE policy on public.appointments
DROP POLICY IF EXISTS "Appointments DELETE Policy" ON public.appointments;

CREATE POLICY "Appointments DELETE Policy" ON public.appointments FOR DELETE TO authenticated
  USING (
    public.has_appointment_permission(auth.uid(), 'manage_appointments')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (
        p.department ILIKE '%it%'
        OR p.department ILIKE '%management%'
        OR p.department ILIKE '%hr%'
      )
    )
  );

-- 3. Also ensure UPDATE and INSERT policies are aligned
DROP POLICY IF EXISTS "Appointments UPDATE Policy" ON public.appointments;
CREATE POLICY "Appointments UPDATE Policy" ON public.appointments FOR UPDATE TO authenticated
  USING (
    public.has_appointment_permission(auth.uid(), 'manage_appointments')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (
        p.department ILIKE '%it%'
        OR p.department ILIKE '%management%'
        OR p.department ILIKE '%hr%'
      )
    )
  )
  WITH CHECK (
    public.has_appointment_permission(auth.uid(), 'manage_appointments')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (
        p.department ILIKE '%it%'
        OR p.department ILIKE '%management%'
        OR p.department ILIKE '%hr%'
      )
    )
  );

DROP POLICY IF EXISTS "Appointments SELECT Policy" ON public.appointments;
CREATE POLICY "Appointments SELECT Policy" ON public.appointments FOR SELECT TO authenticated
  USING (
    public.has_appointment_permission(auth.uid(), 'view_appointments')
    OR public.has_appointment_permission(auth.uid(), 'manage_appointments')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (
        p.department ILIKE '%it%'
        OR p.department ILIKE '%management%'
        OR p.department ILIKE '%hr%'
      )
    )
  );
