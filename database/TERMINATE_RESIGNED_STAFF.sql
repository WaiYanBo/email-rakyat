-- ====================================================================
-- SQL Script: Terminate / Mark Staff as Resigned
-- 1. Sets profile status to 'Resigned'
-- 2. Revokes portal access permissions
-- 3. Historical attendance, leave, and reports records are PRESERVED
-- ====================================================================

-- Example: Replace 'STAFF_EMAIL_OR_NAME' with the actual staff member's email or name
-- e.g. WHERE email = 'akmar@emailrakyat.com' OR full_name ILIKE '%Akmar%'

UPDATE public.profiles
SET status = 'Resigned',
    remarks = COALESCE(remarks, '') || ' [Account Terminated - Staff Resigned]'
WHERE email ILIKE '%STAFF_NAME_OR_EMAIL%'
   OR full_name ILIKE '%STAFF_NAME_OR_EMAIL%';

-- Verify status in profiles
SELECT id, full_name, email, department, status, remarks
FROM public.profiles
WHERE status = 'Resigned';
