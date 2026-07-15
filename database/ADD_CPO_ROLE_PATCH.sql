-- SQL Patch to add CPO (Chief People Officer) to the authorized leave actioner list

-- 1. Insert CPO into public.roles if not exists
INSERT INTO public.roles (role_name)
SELECT 'CPO'
WHERE NOT EXISTS (
    SELECT 1 FROM public.roles WHERE role_name = 'CPO'
);

-- 2. Update the helper function definition to include CPO
CREATE OR REPLACE FUNCTION public.is_leave_action_allowed(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('CEO', 'CFO', 'COO', 'CPO')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
