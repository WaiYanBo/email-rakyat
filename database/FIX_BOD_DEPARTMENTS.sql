-- Fix: Set department to BOD for top executive roles
-- Run this script in the Supabase SQL Editor to permanently update existing records

-- 1. Ensure Chairman, CEO, COO, CFO roles exist in the roles table if not already
INSERT INTO public.roles (role_name)
VALUES ('Chairman'), ('CEO'), ('COO'), ('CFO')
ON CONFLICT (role_name) DO NOTHING;

-- 2. Update existing profiles that mistakenly had Chairman, CEO, COO, CFO in the department column
-- We move these people to the BOD department and also assign them the correct role if we can map it.
UPDATE public.profiles
SET 
  department = 'BOD',
  role_id = (SELECT id FROM public.roles WHERE role_name = profiles.department LIMIT 1)
WHERE department IN ('Chairman', 'CEO', 'COO', 'CFO');

-- 3. Ensure any profile that ALREADY has the Chairman, CEO, COO, or CFO role is placed in the BOD department
UPDATE public.profiles
SET department = 'BOD'
WHERE role_id IN (
    SELECT id FROM public.roles 
    WHERE role_name IN ('Chairman', 'CEO', 'COO', 'CFO')
);

-- 4. Clean up any edge cases where 'BOD' might have been typed as 'Board' or 'Board of Directors'
UPDATE public.profiles
SET department = 'BOD'
WHERE department IN ('Board', 'Board of Directors', 'Board Of Directors', 'B.O.D');
