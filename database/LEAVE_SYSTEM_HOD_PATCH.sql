-- SQL PATCH: Add 'Head of Department' to Leave System Approvers whitelist
-- Run this in your Supabase SQL Editor to apply database policies changes.

CREATE OR REPLACE FUNCTION public.is_leave_approver(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'CEO', 'Chairman', 'COO', 'General Manager', 'Head of Department')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
