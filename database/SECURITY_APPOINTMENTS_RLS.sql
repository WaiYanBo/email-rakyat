-- ==============================================================================
-- SCHEMA MIGRATION & SECURITY HARDENING: CLIENT APPOINTMENTS RLS
-- ==============================================================================
-- Hardens public.appointments table with role & permission based RLS policies.
-- Prevents unauthorized tampering and enforces audit trail integrity.
-- ==============================================================================

-- 1. Helper function for appointment permissions
CREATE OR REPLACE FUNCTION public.has_appointment_permission(u_id UUID, perm_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. IT Admin, HR, CFO, Director roles have global management access
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'Director', 'BOD')
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

-- 2. Ensure table schema has client_ic and all audit fields
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_ic TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- 3. Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Drop insecure legacy policies
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can delete appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Appointments SELECT Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments INSERT Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments UPDATE Policy" ON public.appointments;
DROP POLICY IF EXISTS "Appointments DELETE Policy" ON public.appointments;

-- 4. Create Granular & Hardened RLS Policies
-- SELECT: Users with view_appointments or manage_appointments
CREATE POLICY "Appointments SELECT Policy"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
      public.has_appointment_permission(auth.uid(), 'view_appointments')
      OR public.has_appointment_permission(auth.uid(), 'manage_appointments')
    );

-- INSERT: Users with manage_appointments permission
CREATE POLICY "Appointments INSERT Policy"
    ON public.appointments FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_appointment_permission(auth.uid(), 'manage_appointments')
    );

-- UPDATE: Users with manage_appointments permission
CREATE POLICY "Appointments UPDATE Policy"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (
      public.has_appointment_permission(auth.uid(), 'manage_appointments')
    )
    WITH CHECK (
      public.has_appointment_permission(auth.uid(), 'manage_appointments')
    );

-- DELETE: Users with manage_appointments permission
CREATE POLICY "Appointments DELETE Policy"
    ON public.appointments FOR DELETE
    TO authenticated
    USING (
      public.has_appointment_permission(auth.uid(), 'manage_appointments')
    );

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_pic ON public.appointments(pic_name);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON public.appointments(created_at DESC);

-- 6. Enable Realtime safely (idempotent, prevents 42710 error if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;
