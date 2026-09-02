-- ====================================================================
-- SQL Patch: Allow HR Department, Admins, and Management to Update Leave Balances & Requests
-- Run this in your Supabase SQL Editor if leave balance edits fail with an RLS error.
-- ====================================================================

-- 1. Update helper function to check if a user is authorized for leave management
CREATE OR REPLACE FUNCTION public.is_leave_action_allowed(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND (
        r.role_name IN ('CEO', 'CFO', 'COO', 'CPO', 'Director', 'Chairman', 'Admin', 'IT Admin', 'HR Manager', 'HR Executive')
        OR p.department ILIKE '%human resource%'
        OR p.department ILIKE '%hr%'
        OR p.department ILIKE '%it%'
        OR r.role_name ILIKE '%admin%'
        OR r.role_name ILIKE '%hr%'
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure RLS UPDATE policy on leave_balances allows authorized staff
DROP POLICY IF EXISTS "Approvers can update leave balances" ON public.leave_balances;

CREATE POLICY "Approvers can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (public.is_leave_action_allowed(auth.uid()))
  WITH CHECK (public.is_leave_action_allowed(auth.uid()));

-- 3. Ensure RLS UPDATE policy on leave_requests allows authorized staff
DROP POLICY IF EXISTS "Users and approvers can update leave requests" ON public.leave_requests;

CREATE POLICY "Users and approvers can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (auth.uid() = profile_id OR public.is_leave_action_allowed(auth.uid()))
  WITH CHECK (auth.uid() = profile_id OR public.is_leave_action_allowed(auth.uid()));
