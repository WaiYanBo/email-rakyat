-- ==============================================================================
-- STRICT TERMINATION SECURITY & INSTANT LOCKOUT PATCH
-- ==============================================================================
-- This patch enforces zero-trust Row Level Security (RLS) across all tables
-- and storage buckets. If a staff member is marked as 'Resigned', 'Terminated',
-- or 'Inactive', they will be BLOCKED at the database level from accessing,
-- reading, exporting, modifying, or deleting ANY data—even if they possess a
-- valid JWT token, cached browser session, or try direct API calls.
--
-- Instructions: Run this script inside your Supabase SQL Editor.
-- ==============================================================================

-- ─── 1. CORE HELPER FUNCTION: is_active_staff ──────────────────────────────────
-- Checks if a user is currently an active, employed staff member.
CREATE OR REPLACE FUNCTION public.is_active_staff(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_uuid
      AND status NOT IN ('Resigned', 'Terminated', 'Inactive')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─── 2. UPDATE CLIENT & LEAD PERMISSION FUNCTION ───────────────────────────────
CREATE OR REPLACE FUNCTION public.has_client_permission(u_id UUID, perm_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Terminated/Resigned staff are blocked instantly
  IF NOT public.is_active_staff(u_id) THEN
    RETURN FALSE;
  END IF;

  -- 1. Global Admin Roles (IT Admin, HR, CFO, BOD)
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'Chairman', 'CEO', 'COO', 'Director')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Explicit access permissions from the Access Control matrix
  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (target_type = 'user' AND target_id = u_id::text AND (permissions->>perm_type)::boolean = true)
       OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = u_id) AND (permissions->>perm_type)::boolean = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─── 3. UPDATE APPOINTMENTS PERMISSION FUNCTION ────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_appointment_permission(u_id UUID, perm_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Terminated/Resigned staff are blocked instantly
  IF NOT public.is_active_staff(u_id) THEN
    RETURN FALSE;
  END IF;

  -- 1. Management Roles
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'Director', 'BOD', 'Chairman', 'CEO', 'COO')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Explicit access permissions
  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (target_type = 'user' AND target_id = u_id::text AND (permissions->>perm_type)::boolean = true)
       OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = u_id) AND (permissions->>perm_type)::boolean = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─── 4. UPDATE LEAVE & MC APPROVER FUNCTION ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_leave_approver(u_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_department TEXT;
  v_full_name TEXT;
BEGIN
  -- Terminated/Resigned staff are blocked instantly
  IF NOT public.is_active_staff(u_id) THEN
    RETURN FALSE;
  END IF;

  SELECT department, full_name INTO v_department, v_full_name
  FROM public.profiles
  WHERE id = u_id;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND (
        r.role_name IN (
          'IT Admin', 'HR', 'HR Manager', 'HR Executive', 'HR Officer',
          'CFO', 'CEO', 'Chairman', 'COO', 'CPO', 'General Manager',
          'Head of Department', 'Director', 'Admin', 'Management'
        )
        OR p.department ILIKE '%human resource%'
        OR p.department ILIKE '%hr%'
        OR p.department ILIKE '%it%'
      )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (
      (target_type = 'user' AND (target_id = u_id::text OR target_id = v_full_name))
      OR (target_type = 'department' AND target_id = v_department)
    )
    AND (
      (permissions->>'manage_leave')::text = 'true'
      OR (permissions->>'manage_hr')::text = 'true'
      OR (permissions->>'edit_staff')::text = 'true'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─── 5. UPDATE CLAIM APPROVER FUNCTION ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_claim_approver(u_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_department TEXT;
  v_full_name TEXT;
BEGIN
  -- Terminated/Resigned staff are blocked instantly
  IF NOT public.is_active_staff(u_id) THEN
    RETURN FALSE;
  END IF;

  SELECT department, full_name INTO v_department, v_full_name
  FROM public.profiles
  WHERE id = u_id;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND (
        r.role_name IN ('IT Admin', 'HR', 'CFO', 'CEO', 'Chairman', 'COO', 'Director', 'Finance')
        OR p.department ILIKE '%finance%'
        OR p.department ILIKE '%hr%'
        OR p.department ILIKE '%it%'
      )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (
      (target_type = 'user' AND (target_id = u_id::text OR target_id = v_full_name))
      OR (target_type = 'department' AND target_id = v_department)
    )
    AND (
      (permissions->>'manage_claims')::text = 'true'
      OR (permissions->>'manage_hr')::text = 'true'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ─── 6. HARDEN RLS ON POTENTIAL CLIENTS (PROSPECTS) ───────────────────────────
ALTER TABLE public.potential_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated insert potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated update potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated delete potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Strict potential_clients SELECT" ON public.potential_clients;
DROP POLICY IF EXISTS "Strict potential_clients INSERT" ON public.potential_clients;
DROP POLICY IF EXISTS "Strict potential_clients UPDATE" ON public.potential_clients;
DROP POLICY IF EXISTS "Strict potential_clients DELETE" ON public.potential_clients;

CREATE POLICY "Strict potential_clients SELECT"
  ON public.potential_clients FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      public.has_client_permission(auth.uid(), 'view_potential_clients')
      OR public.has_client_permission(auth.uid(), 'manage_potential_clients')
    )
  );

CREATE POLICY "Strict potential_clients INSERT"
  ON public.potential_clients FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'manage_potential_clients')
  );

CREATE POLICY "Strict potential_clients UPDATE"
  ON public.potential_clients FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'manage_potential_clients')
  )
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'manage_potential_clients')
  );

CREATE POLICY "Strict potential_clients DELETE"
  ON public.potential_clients FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'manage_potential_clients')
  );


-- ─── 7. HARDEN RLS ON CLIENTS ──────────────────────────────────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated update clients" ON public.clients;
DROP POLICY IF EXISTS "Allow authenticated delete clients" ON public.clients;
DROP POLICY IF EXISTS "Strict clients SELECT" ON public.clients;
DROP POLICY IF EXISTS "Strict clients INSERT" ON public.clients;
DROP POLICY IF EXISTS "Strict clients UPDATE" ON public.clients;
DROP POLICY IF EXISTS "Strict clients DELETE" ON public.clients;

CREATE POLICY "Strict clients SELECT"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      public.has_client_permission(auth.uid(), 'view_clients')
      OR public.has_client_permission(auth.uid(), 'view_lod')
    )
  );

CREATE POLICY "Strict clients INSERT"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'edit_clients')
  );

CREATE POLICY "Strict clients UPDATE"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      public.has_client_permission(auth.uid(), 'edit_clients')
      OR public.has_client_permission(auth.uid(), 'manage_lod')
    )
  )
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND (
      public.has_client_permission(auth.uid(), 'edit_clients')
      OR public.has_client_permission(auth.uid(), 'manage_lod')
    )
  );

CREATE POLICY "Strict clients DELETE"
  ON public.clients FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'edit_clients')
  );


-- ─── 8. HARDEN RLS ON BILLING RECORDS ──────────────────────────────────────────
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Drive SELECT Billing Records Policy" ON public.billing_records;
DROP POLICY IF EXISTS "Drive INSERT Billing Records Policy" ON public.billing_records;
DROP POLICY IF EXISTS "Drive UPDATE Billing Records Policy" ON public.billing_records;
DROP POLICY IF EXISTS "Drive DELETE Billing Records Policy" ON public.billing_records;

CREATE POLICY "Drive SELECT Billing Records Policy"
  ON public.billing_records FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'view_clients')
  );

CREATE POLICY "Drive INSERT Billing Records Policy"
  ON public.billing_records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'edit_clients')
  );

CREATE POLICY "Drive UPDATE Billing Records Policy"
  ON public.billing_records FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'edit_clients')
  );

CREATE POLICY "Drive DELETE Billing Records Policy"
  ON public.billing_records FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_client_permission(auth.uid(), 'edit_clients')
  );


-- ─── 9. HARDEN RLS ON APPOINTMENTS ─────────────────────────────────────────────
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Appointments SELECT Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments INSERT Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments UPDATE Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments DELETE Policy" ON public.appointments;

CREATE POLICY "Appointments SELECT Policy"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      public.has_appointment_permission(auth.uid(), 'view_appointments')
      OR public.has_appointment_permission(auth.uid(), 'manage_appointments')
    )
  );

CREATE POLICY "Appointments INSERT Policy"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_appointment_permission(auth.uid(), 'manage_appointments')
  );

CREATE POLICY "Appointments UPDATE Policy"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_appointment_permission(auth.uid(), 'manage_appointments')
  )
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND public.has_appointment_permission(auth.uid(), 'manage_appointments')
  );

CREATE POLICY "Appointments DELETE Policy"
  ON public.appointments FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.has_appointment_permission(auth.uid(), 'manage_appointments')
  );


-- ─── 10. HARDEN RLS ON CLAIMS & ENTITLEMENTS ───────────────────────────────────
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own claims or approvers view all" ON public.claims;
DROP POLICY IF EXISTS "Users can insert their own claims" ON public.claims;
DROP POLICY IF EXISTS "Users can update their own drafts/rejected or approvers update" ON public.claims;
DROP POLICY IF EXISTS "Users can delete their own draft claims or approvers delete" ON public.claims;

CREATE POLICY "Users can view their own claims or approvers view all"
  ON public.claims FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (auth.uid() = profile_id OR public.is_claim_approver(auth.uid()))
  );

CREATE POLICY "Users can insert their own claims"
  ON public.claims FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND auth.uid() = profile_id
  );

CREATE POLICY "Users can update their own drafts/rejected or approvers update"
  ON public.claims FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      (auth.uid() = profile_id AND status IN ('Draft', 'Rejected', 'Pending Approval'))
      OR public.is_claim_approver(auth.uid())
    )
  )
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND (
      (auth.uid() = profile_id AND status IN ('Draft', 'Pending Approval'))
      OR public.is_claim_approver(auth.uid())
    )
  );

CREATE POLICY "Users can delete their own draft claims or approvers delete"
  ON public.claims FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      (auth.uid() = profile_id AND status = 'Draft')
      OR public.is_claim_approver(auth.uid())
    )
  );


-- ─── 11. HARDEN RLS ON LEAVE REQUESTS & BALANCES ──────────────────────────────
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access for leave_balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Allow full access for leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can select their own or authorized leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can insert their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users and approvers can update leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users and approvers can delete leave requests" ON public.leave_requests;

CREATE POLICY "Strict leave_requests SELECT"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()))
  );

CREATE POLICY "Strict leave_requests INSERT"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND auth.uid() = profile_id
  );

CREATE POLICY "Strict leave_requests UPDATE"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      (auth.uid() = profile_id AND status = 'Pending')
      OR public.is_leave_approver(auth.uid())
    )
  );

CREATE POLICY "Strict leave_requests DELETE"
  ON public.leave_requests FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      (auth.uid() = profile_id AND status = 'Pending')
      OR public.is_leave_approver(auth.uid())
    )
  );

-- Leave balances policies
DROP POLICY IF EXISTS "Strict leave_balances SELECT" ON public.leave_balances;
DROP POLICY IF EXISTS "Strict leave_balances UPDATE" ON public.leave_balances;

CREATE POLICY "Strict leave_balances SELECT"
  ON public.leave_balances FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()))
  );

CREATE POLICY "Strict leave_balances UPDATE"
  ON public.leave_balances FOR ALL
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.is_leave_approver(auth.uid())
  );


-- ─── 12. HARDEN RLS ON ATTENDANCE ──────────────────────────────────────────────
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Privileged users can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Privileged users can delete attendance" ON public.attendance;

CREATE POLICY "Strict attendance SELECT"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
  );

CREATE POLICY "Strict attendance INSERT"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_staff(auth.uid())
    AND (auth.uid() = user_id OR public.is_leave_approver(auth.uid()))
  );

CREATE POLICY "Strict attendance UPDATE"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (auth.uid() = user_id OR public.is_leave_approver(auth.uid()))
  );

CREATE POLICY "Strict attendance DELETE"
  ON public.attendance FOR DELETE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND public.is_leave_approver(auth.uid())
  );


-- ─── 13. HARDEN RLS ON PROFILES ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authorized roles to update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Strict profiles SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Strict profiles UPDATE" ON public.profiles;

CREATE POLICY "Strict profiles SELECT"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
  );

CREATE POLICY "Strict profiles UPDATE"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    public.is_active_staff(auth.uid())
    AND (
      auth.uid() = id
      OR public.is_leave_approver(auth.uid())
    )
  );


-- ─── 14. HARDEN STORAGE (COMPANY DRIVE & RECEIPTS) ─────────────────────────────
DROP POLICY IF EXISTS "Drive SELECT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive INSERT Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive UPDATE Policy" ON storage.objects;
DROP POLICY IF EXISTS "Drive DELETE Policy" ON storage.objects;

CREATE POLICY "Drive SELECT Policy"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('company_drive', 'claim-receipts', 'leave-attachments')
    AND public.is_active_staff(auth.uid())
  );

CREATE POLICY "Drive INSERT Policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('company_drive', 'claim-receipts', 'leave-attachments')
    AND public.is_active_staff(auth.uid())
  );

CREATE POLICY "Drive UPDATE Policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('company_drive', 'claim-receipts', 'leave-attachments')
    AND public.is_active_staff(auth.uid())
  );

CREATE POLICY "Drive DELETE Policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('company_drive', 'claim-receipts', 'leave-attachments')
    AND public.is_active_staff(auth.uid())
  );


-- ─── 15. AUTOMATED TERMINATION TRIGGER ─────────────────────────────────────────
-- When status is updated to 'Resigned', 'Terminated', or 'Inactive':
-- 1. Automatically purges all custom permissions from access_permissions.
-- 2. Bans the user account in auth.users immediately.
-- 3. Invalidate active sessions in auth.sessions and refresh tokens.
CREATE OR REPLACE FUNCTION public.handle_staff_termination_security()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status IN ('Resigned', 'Terminated', 'Inactive')) AND 
     (OLD.status IS NULL OR OLD.status NOT IN ('Resigned', 'Terminated', 'Inactive')) THEN
     
    -- 1. Purge all permissions from access_permissions table
    DELETE FROM public.access_permissions
    WHERE target_id = NEW.id::text 
       OR target_id = NEW.full_name;

    -- 2. Ban the user account in auth.users immediately
    BEGIN
      UPDATE auth.users
      SET banned_until = '2999-12-31 23:59:59+00'
      WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Notice: Could not modify auth.users: %', SQLERRM;
    END;

    -- 3. Invalidate active sessions
    BEGIN
      DELETE FROM auth.sessions WHERE user_id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Notice: Could not delete from auth.sessions: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_staff_termination_security ON public.profiles;
CREATE TRIGGER trg_staff_termination_security
  AFTER UPDATE OF status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_staff_termination_security();

-- Confirmation output
SELECT 'Strict termination security patch successfully deployed! All terminated staff are now locked out at database and storage levels.' AS result;
