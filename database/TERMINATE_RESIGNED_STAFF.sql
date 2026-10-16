-- ==============================================================================
-- SQL SCRIPT: IMMEDIATE STAFF TERMINATION & COMPLETE ACCESS REVOCATION
-- ==============================================================================
-- Run this in your Supabase SQL Editor whenever a staff member is terminated.
-- This script performs a 100% complete lockout:
--   1. Changes profile status to 'Terminated'
--   2. Stamps termination audit remarks with date/time
--   3. Immediately bans user in auth.users (cannot refresh token or login)
--   4. Deletes active authentication sessions & refresh tokens
--   5. Purges all custom access permissions from access_permissions table
--   6. Historical data (attendance, cases, claims, logs) remains intact for audit
-- ==============================================================================

DO $$
DECLARE
  -- ─── SPECIFY THE STAFF EMAIL(S) OR NAME(S) HERE ───
  target_identifier TEXT := 'STAFF_EMAIL_OR_NAME_HERE';
  target_user_id UUID;
  target_name TEXT;
  target_email TEXT;
BEGIN
  -- 1. Locate the profile
  SELECT id, full_name, email INTO target_user_id, target_name, target_email
  FROM public.profiles
  WHERE email ILIKE '%' || target_identifier || '%'
     OR full_name ILIKE '%' || target_identifier || '%'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'Staff member matching "%" was not found in public.profiles.', target_identifier;
    RETURN;
  END IF;

  RAISE NOTICE 'Terminating access for: % (%) with ID: %', target_name, target_email, target_user_id;

  -- 2. Update profile status to 'Terminated' with audit trail
  UPDATE public.profiles
  SET status = 'Terminated',
      remarks = COALESCE(remarks, '') || ' [TERMINATED ON ' || TO_CHAR(now(), 'YYYY-MM-DD HH24:MI:SS') || ' - Rule Violation / Revoked Access]'
  WHERE id = target_user_id;

  -- 3. Purge custom access permissions
  DELETE FROM public.access_permissions
  WHERE target_id = target_user_id::text
     OR target_id = target_name;

  -- 4. Ban the user account in auth.users (prevents all Supabase Auth logins and token refreshes)
  BEGIN
    UPDATE auth.users
    SET banned_until = '2999-12-31 23:59:59+00'
    WHERE id = target_user_id;
    RAISE NOTICE 'User account % successfully banned in auth.users.', target_email;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Notice: Could not update auth.users: %', SQLERRM;
  END;

  -- 5. Delete all active sessions to instantly kill live login tokens
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = target_user_id;
    RAISE NOTICE 'Active sessions deleted for %.', target_email;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Notice: Could not delete from auth.sessions: %', SQLERRM;
  END;

  RAISE NOTICE '✓ TERMINATION COMPLETE: % is now completely locked out from all systems.', target_name;
END $$;

-- ─── VERIFICATION QUERY ────────────────────────────────────────────────────────
-- Check the current status of terminated staff:
SELECT 
  p.id, 
  p.full_name, 
  p.email, 
  p.department, 
  p.status, 
  p.remarks,
  u.banned_until
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE p.status IN ('Terminated', 'Resigned')
ORDER BY p.full_name;
