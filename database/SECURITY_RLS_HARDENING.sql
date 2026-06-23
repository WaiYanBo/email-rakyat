-- ====================================================================
--  SUPABASE SECURITY & RLS HARDENING PATCH
--  Addresses privilege escalation, self-approval, and data leak flaws.
--  Run this inside your Supabase SQL Editor.
-- ====================================================================

-- ─── 1. PROFILES INSERT & UPDATE PROTECTION ─────────────────────────

-- Trigger function for BEFORE INSERT
CREATE OR REPLACE FUNCTION public.check_profile_insert_authorization()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user is inserting their own profile row
  IF auth.uid() = NEW.id THEN
    -- Standard users (or new signups) must not set administrative/management roles
    IF NEW.role_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = NEW.role_id
        AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'CEO', 'Chairman', 'COO', 'General Manager', 'Head of Department')
    ) THEN
      RAISE EXCEPTION 'Access Denied: You cannot assign yourself an administrative or management role.';
    END IF;

    -- Standard users must not set a non-zero salary
    IF NEW.salary IS DISTINCT FROM 0 AND NEW.salary IS NOT NULL THEN
      RAISE EXCEPTION 'Access Denied: You cannot specify a salary on your profile.';
    END IF;

    -- Standard users must not set status to anything other than Active
    IF NEW.status IS DISTINCT FROM 'Active' AND NEW.status IS NOT NULL THEN
      RAISE EXCEPTION 'Access Denied: You cannot specify a non-Active status on your profile.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_profile_insert_security ON public.profiles;
CREATE TRIGGER enforce_profile_insert_security
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_insert_authorization();


-- Trigger function for BEFORE UPDATE
-- Prevents standard users from modifying their own roles, salary, or department.
-- Standard users can only update full_name and avatar_url.
CREATE OR REPLACE FUNCTION public.check_profile_update_authorization()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user is updating their own profile row
  IF auth.uid() = NEW.id THEN
    -- Check if they are trying to change sensitive fields
    IF (OLD.role_id IS DISTINCT FROM NEW.role_id) OR
       (OLD.salary IS DISTINCT FROM NEW.salary) OR
       (OLD.department IS DISTINCT FROM NEW.department) OR
       (OLD.status IS DISTINCT FROM NEW.status) THEN
       
      -- Allow the update if the user has an IT Admin, HR, or CFO role
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
          AND r.role_name IN ('IT Admin', 'HR', 'CFO')
      ) THEN
        RAISE EXCEPTION 'Access Denied: You cannot modify sensitive fields (role, salary, department, status) on your own profile.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_profile_update_security ON public.profiles;
CREATE TRIGGER enforce_profile_update_security
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_update_authorization();


-- ─── 2. LEAVE REQUESTS SELF-APPROVAL PROTECTION ───────────────────────
-- Prevents standard users from self-approving or self-rejecting leave requests.

CREATE OR REPLACE FUNCTION public.check_leave_request_status_update()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT
  IF TG_OP = 'INSERT' THEN
    -- If the status is not Pending or Cancelled
    IF NEW.status IN ('Approved', 'Rejected') THEN
      -- Verify the updater is an authorized leave approver, or if inserting for someone else
      IF NOT public.is_leave_approver(auth.uid()) OR auth.uid() = NEW.profile_id THEN
        -- Standard users cannot self-approve or insert approved requests
        RAISE EXCEPTION 'Access Denied: You cannot create an already approved or rejected leave request.';
      END IF;
    END IF;
  END IF;

  -- On UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- If the status is being modified to Approved or Rejected
    IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status IN ('Approved', 'Rejected')) THEN
      -- Verify the updater is an authorized leave approver
      IF NOT public.is_leave_approver(auth.uid()) THEN
        RAISE EXCEPTION 'Access Denied: You are not authorized to approve or reject leave requests.';
      END IF;
    END IF;
    
    -- Prevent standard users from modifying request details once it's no longer pending,
    -- except for changing status to 'Cancelled' (cancelling their own request).
    IF auth.uid() = NEW.profile_id THEN
      IF OLD.status <> 'Pending' AND NEW.status <> 'Cancelled' THEN
        RAISE EXCEPTION 'Access Denied: Cannot modify a processed leave request.';
      END IF;
      
      IF NEW.status IN ('Approved', 'Rejected') AND OLD.status = 'Pending' THEN
        RAISE EXCEPTION 'Access Denied: You cannot approve or reject your own leave request.';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_leave_request_status_security ON public.leave_requests;
CREATE TRIGGER enforce_leave_request_status_security
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_leave_request_status_update();


-- ─── 3. BILLING RECORDS RLS HARDENING ──────────────────────────────────
-- Restricts client billing record CRUD operations to users with client access permissions.

CREATE OR REPLACE FUNCTION public.has_client_permission(u_id UUID, perm_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. IT Admin, HR, CFO roles have global access
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Explicit access permissions from the Access Control matrix (user or department level)
  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (target_type = 'user' AND target_id = u_id::text AND (permissions->>perm_type)::boolean = true)
       OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = u_id) AND (permissions->>perm_type)::boolean = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS and drop public policies
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.billing_records;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.billing_records;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.billing_records;
DROP POLICY IF EXISTS "Drive SELECT Billing Records Policy" ON public.billing_records;
DROP POLICY IF EXISTS "Drive INSERT Billing Records Policy" ON public.billing_records;
DROP POLICY IF EXISTS "Drive UPDATE Billing Records Policy" ON public.billing_records;

-- SELECT policy: User must have client view permissions
CREATE POLICY "Drive SELECT Billing Records Policy"
  ON public.billing_records FOR SELECT
  USING (
    public.has_client_permission(auth.uid(), 'view_clients')
  );

-- INSERT policy: User must have client edit permissions
CREATE POLICY "Drive INSERT Billing Records Policy"
  ON public.billing_records FOR INSERT
  WITH CHECK (
    public.has_client_permission(auth.uid(), 'edit_clients')
  );

-- UPDATE policy: User must have client edit permissions
CREATE POLICY "Drive UPDATE Billing Records Policy"
  ON public.billing_records FOR UPDATE
  USING (
    public.has_client_permission(auth.uid(), 'edit_clients')
  );


-- ─── 4. ATTENDANCE GEOLOCATION & TIME VERIFICATION ────────────────────

-- Haversine formula distance helper function in SQL
CREATE OR REPLACE FUNCTION public.calculate_distance_m(lat1 NUMERIC, lon1 NUMERIC, lat2 NUMERIC, lon2 NUMERIC)
RETURNS INTEGER AS $$
DECLARE
  R CONSTANT NUMERIC := 6371000; -- Earth radius in meters
  dlat NUMERIC;
  dlon NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  RETURN round(R * c)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Trigger function to check integrity of attendance submissions (time & location spoofing)
CREATE OR REPLACE FUNCTION public.check_attendance_record_integrity()
RETURNS TRIGGER AS $$
DECLARE
  calculated_dist INTEGER;
  is_privileged BOOLEAN;
  office_lat CONSTANT NUMERIC := 3.0750624396122763;
  office_lng CONSTANT NUMERIC := 101.61250689446412;
  zone_radius CONSTANT INTEGER := 200;
BEGIN
  -- 1. Determine if the updater is privileged (IT Admin, HR, CFO)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
      AND r.role_name IN ('IT Admin', 'HR', 'CFO')
  ) INTO is_privileged;

  -- If not privileged, enforce strict checks
  IF NOT is_privileged THEN
    -- Ensure standard users can only manage their own attendance records
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Access Denied: You cannot modify attendance records for other users.';
    END IF;

    -- Ensure they don't change user_id or date on update
    IF TG_OP = 'UPDATE' THEN
      IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'Access Denied: Cannot change user_id on an existing attendance record.';
      END IF;
      IF OLD.date IS DISTINCT FROM NEW.date THEN
        RAISE EXCEPTION 'Access Denied: Cannot change the date of an existing attendance record.';
      END IF;
    END IF;

    -- Validate clock_in_time if set/changed
    IF ((TG_OP = 'INSERT' AND NEW.clock_in_time IS NOT NULL) OR
        (TG_OP = 'UPDATE' AND NEW.clock_in_time IS DISTINCT FROM OLD.clock_in_time AND NEW.clock_in_time IS NOT NULL)) THEN
      IF ABS(extract(epoch from (NEW.clock_in_time - now()))) > 600 THEN -- 10 minutes tolerance
        RAISE EXCEPTION 'Access Denied: Clock-in time must be close to current time.';
      END IF;
    END IF;

    -- Validate clock_out_time if set/changed
    IF (TG_OP = 'UPDATE' AND NEW.clock_out_time IS DISTINCT FROM OLD.clock_out_time AND NEW.clock_out_time IS NOT NULL) THEN
      -- Check if this is a late clockout resolution
      IF NEW.is_late_clockout = true AND NEW.late_clockout_flagged = true THEN
        -- If resolving a late clockout, the reporting timestamp must be close to now
        IF ABS(extract(epoch from (NEW.late_clockout_reported_at - now()))) > 600 THEN
          RAISE EXCEPTION 'Access Denied: Late clockout report timestamp must be close to current time.';
        END IF;
        -- Enforce that they can't change it back once flagged
        IF OLD.late_clockout_flagged = true AND NEW.late_clockout_flagged = false THEN
          RAISE EXCEPTION 'Access Denied: Cannot clear late clockout flags.';
        END IF;
      ELSE
        -- Standard clock-out time must be close to now
        IF ABS(extract(epoch from (NEW.clock_out_time - now()))) > 600 THEN
          RAISE EXCEPTION 'Access Denied: Clock-out time must be close to current time.';
        END IF;
      END IF;
    END IF;

    -- Geolocation and Distance spoofing verification
    -- Clock In Geolocation
    IF NEW.clock_in_latitude IS NOT NULL AND NEW.clock_in_longitude IS NOT NULL THEN
      calculated_dist := public.calculate_distance_m(office_lat, office_lng, NEW.clock_in_latitude, NEW.clock_in_longitude);
      
      -- Verify distance matches (allow 10 meters buffer for rounding and math differences)
      IF ABS(NEW.clock_in_distance - calculated_dist) > 10 THEN
        RAISE EXCEPTION 'Access Denied: Spoofed clock-in distance detected. Calculated %m, received %m.', calculated_dist, NEW.clock_in_distance;
      END IF;

      -- Verify within zone flag matches calculated distance
      IF NEW.clock_in_within_zone IS DISTINCT FROM (calculated_dist <= zone_radius) THEN
        RAISE EXCEPTION 'Access Denied: Spoofed clock-in zone flag detected.';
      END IF;
    END IF;

    -- Clock Out Geolocation
    IF NEW.clock_out_latitude IS NOT NULL AND NEW.clock_out_longitude IS NOT NULL THEN
      calculated_dist := public.calculate_distance_m(office_lat, office_lng, NEW.clock_out_latitude, NEW.clock_out_longitude);
      
      -- Verify distance matches (allow 10 meters buffer)
      IF ABS(NEW.clock_out_distance - calculated_dist) > 10 THEN
        RAISE EXCEPTION 'Access Denied: Spoofed clock-out distance detected. Calculated %m, received %m.', calculated_dist, NEW.clock_out_distance;
      END IF;

      -- Verify within zone flag matches calculated distance
      IF NEW.clock_out_within_zone IS DISTINCT FROM (calculated_dist <= zone_radius) THEN
        RAISE EXCEPTION 'Access Denied: Spoofed clock-out zone flag detected.';
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_attendance_integrity ON public.attendance;
CREATE TRIGGER enforce_attendance_integrity
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.check_attendance_record_integrity();
