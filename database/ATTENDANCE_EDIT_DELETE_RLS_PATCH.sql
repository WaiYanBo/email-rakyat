-- ─── ATTENDANCE EDIT & DELETE RLS & INTEGRITY PATCH ─────────────────────
-- Script to enable UPDATE and DELETE policies on public.attendance for authorized users,
-- and update the trigger function to allow privileged users to edit attendance details.

-- 1. Enable UPDATE policy on public.attendance
DROP POLICY IF EXISTS "Privileged users can update attendance" ON public.attendance;
CREATE POLICY "Privileged users can update attendance"
  ON public.attendance FOR UPDATE
  USING (
    -- Users updating their own record or privileged users
    auth.uid() = user_id
    OR 
    auth.uid() IN (
      SELECT id FROM public.profiles 
      WHERE role_id IN (
        SELECT id FROM public.roles 
        WHERE role_name IN ('HR', 'CFO', 'IT Admin', 'IT', 'it')
      ) OR department IN ('Human Resources', 'IT', 'it')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'user'
        AND target_id = auth.uid()::text
        AND (permissions->>'edit_attendance')::boolean = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'department'
        AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND (permissions->>'edit_attendance')::boolean = true
    )
  );

-- 2. Enable DELETE policy on public.attendance
DROP POLICY IF EXISTS "Privileged users can delete attendance" ON public.attendance;
CREATE POLICY "Privileged users can delete attendance"
  ON public.attendance FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles 
      WHERE role_id IN (
        SELECT id FROM public.roles 
        WHERE role_name IN ('HR', 'CFO', 'IT Admin', 'IT', 'it')
      ) OR department IN ('Human Resources', 'IT', 'it')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'user'
        AND target_id = auth.uid()::text
        AND (permissions->>'edit_attendance')::boolean = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'department'
        AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND (permissions->>'edit_attendance')::boolean = true
    )
  );

-- 3. Update check_attendance_record_integrity trigger function
CREATE OR REPLACE FUNCTION public.check_attendance_record_integrity()
RETURNS TRIGGER AS $$
DECLARE
  is_privileged BOOLEAN;
BEGIN
  -- Determine if the updater is privileged (IT Admin, HR, CFO, IT dept, or edit_attendance permission)
  SELECT (
    EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND (r.role_name IN ('IT Admin', 'HR', 'CFO', 'IT', 'it') OR p.department IN ('Human Resources', 'IT', 'it'))
    )
    OR
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'edit_attendance')::boolean = true)
         OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'edit_attendance')::boolean = true)
    )
  ) INTO is_privileged;

  -- If privileged, skip standard user time/location/date restrictions
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Standard user constraints
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access Denied: You cannot modify attendance records for other users.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Access Denied: Cannot change user_id on an existing attendance record.';
    END IF;
    IF OLD.date IS DISTINCT FROM NEW.date THEN
      RAISE EXCEPTION 'Access Denied: Cannot change the date of an existing attendance record.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
