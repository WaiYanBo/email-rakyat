-- ==============================================================================
-- SCHEMA MIGRATION: CLIENT APPOINTMENTS TABLE
-- ==============================================================================
-- Table: public.appointments
-- Stores scheduled client consultation meetings, linked with Active / Potential clients.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Client Information
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_ic TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    potential_client_id UUID REFERENCES public.potential_clients(id) ON DELETE SET NULL,
    
    -- Appointment Schedule Details
    appointment_date DATE NOT NULL,
    appointment_time TEXT NOT NULL, -- e.g. "11:00 AM" or "11:00 pagi"
    
    -- Case & Staff Details
    case_category TEXT NOT NULL DEFAULT 'Loan Shark',
    pic_name TEXT NOT NULL,         -- Name of the officer in charge (e.g. Mr. Jazz, Azizul)
    location TEXT NOT NULL DEFAULT 'Office Consultation', -- Office Consultation, Phone Call, Google Meet, On-Site
    
    -- Status & Notes
    status TEXT NOT NULL DEFAULT 'Scheduled', -- 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'No-Show'
    notes TEXT,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Create Policies for Authenticated Portal Staff
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;
CREATE POLICY "Authenticated users can view appointments"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert appointments" ON public.appointments;
CREATE POLICY "Authenticated users can insert appointments"
    ON public.appointments FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update appointments" ON public.appointments;
CREATE POLICY "Authenticated users can update appointments"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete appointments" ON public.appointments;
CREATE POLICY "Authenticated users can delete appointments"
    ON public.appointments FOR DELETE
    TO authenticated
    USING (true);

-- Indexes for lightning fast calendar & filter queries
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_pic ON public.appointments(pic_name);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON public.appointments(created_at DESC);

-- Enable Realtime for live multi-staff updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
