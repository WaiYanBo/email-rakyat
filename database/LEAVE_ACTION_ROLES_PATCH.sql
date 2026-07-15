-- SQL Patch to enforce that only CEO, CFO, and COO can approve/reject leaves or adjust entitlements

-- 1. Helper function to check if a user is an authorized Leave Actioner (CEO, CFO, COO)
CREATE OR REPLACE FUNCTION public.is_leave_action_allowed(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('CEO', 'CFO', 'COO')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update RLS update policy on leave_balances to restrict to CEO, CFO, COO
DROP POLICY IF EXISTS "Approvers can update leave balances" ON public.leave_balances;

CREATE POLICY "Approvers can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (public.is_leave_action_allowed(auth.uid()));


-- 3. Update RLS update policy on leave_requests to restrict admin updates to CEO, CFO, COO
DROP POLICY IF EXISTS "Users and approvers can update leave requests" ON public.leave_requests;

CREATE POLICY "Users and approvers can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (auth.uid() = profile_id OR public.is_leave_action_allowed(auth.uid()))
  WITH CHECK (auth.uid() = profile_id OR public.is_leave_action_allowed(auth.uid()));
