-- ====================================================================
--  SUPABASE TEST ACCOUNTS CLEAN-UP SCRIPT
--  Safely removes all dummy/test staff members and their associated data.
--  Run this inside your Supabase SQL Editor.
-- ====================================================================

-- ─── 1. IDENTIFY & DEFINE TEST USER ID LIST ─────────────────────────
-- We build a temporary list of user IDs that match "test", "testing",
-- "dummy", or "example.com" in their emails or names.

CREATE TEMP TABLE test_user_ids AS
SELECT u.id
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email ILIKE '%test%'
   OR u.email ILIKE '%example.com%'
   OR p.full_name ILIKE '%test%'
   OR p.full_name ILIKE '%testing%'
   OR p.full_name ILIKE '%dummy%';

-- ─── 2. SAFELY DELETE RELATED DATA IN ORDER ──────────────────────────

-- Delete audit logs associated with test users
DELETE FROM public.audit_logs
WHERE user_id IN (SELECT id FROM test_user_ids);

-- Delete access matrix entries
DELETE FROM public.access_permissions
WHERE target_type = 'user' AND target_id IN (SELECT id::text FROM test_user_ids);

-- Delete attendance logs
DELETE FROM public.attendance
WHERE user_id IN (SELECT id FROM test_user_ids);

-- Delete leave requests and balances
DELETE FROM public.leave_requests
WHERE profile_id IN (SELECT id FROM test_user_ids);

DELETE FROM public.leave_balances
WHERE profile_id IN (SELECT id FROM test_user_ids);

-- Delete profile records
DELETE FROM public.profiles
WHERE id IN (SELECT id FROM test_user_ids);

-- Delete auth users (this removes them from login auth)
DELETE FROM auth.users
WHERE id IN (SELECT id FROM test_user_ids);

-- Drop temporary table
DROP TABLE test_user_ids;
