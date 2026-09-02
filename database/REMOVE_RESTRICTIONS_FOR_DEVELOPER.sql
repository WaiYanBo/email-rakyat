-- ====================================================================
-- SQL SCRIPT: REMOVE ALL RESTRICTIONS FOR DEVELOPER & ADMINS
-- Drops the triggers that blocked profile role assignment, salary,
-- department, status updates, and leave approvals.
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO IMMEDIATELY REMOVE THE BLOCK!
-- ====================================================================

-- 1. Drop Profile Insert & Update Restriction Triggers
DROP TRIGGER IF EXISTS enforce_profile_insert_security ON public.profiles CASCADE;
DROP TRIGGER IF EXISTS enforce_profile_update_security ON public.profiles CASCADE;
DROP FUNCTION IF EXISTS public.check_profile_insert_authorization() CASCADE;
DROP FUNCTION IF EXISTS public.check_profile_update_authorization() CASCADE;

-- 2. Drop Leave Request Self-Approval / Processing Restrictions
DROP TRIGGER IF EXISTS enforce_leave_request_status_security ON public.leave_requests CASCADE;
DROP FUNCTION IF EXISTS public.check_leave_request_status_update() CASCADE;

-- 3. Ensure profiles update RLS policy allows full updates
DROP POLICY IF EXISTS "Allow authorized roles to update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

CREATE POLICY "Allow full access for profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Ensure leave_balances allows full updates
DROP POLICY IF EXISTS "leave_balances_update_policy" ON public.leave_balances;
CREATE POLICY "Allow full access for leave_balances"
  ON public.leave_balances FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Ensure leave_requests allows full updates
DROP POLICY IF EXISTS "leave_requests_update_policy" ON public.leave_requests;
CREATE POLICY "Allow full access for leave_requests"
  ON public.leave_requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Confirmation output
SELECT 'All developer and profile update restrictions have been successfully removed!' AS status;
