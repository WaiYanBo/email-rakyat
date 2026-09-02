-- ====================================================================
--  CREATE POTENTIAL CLIENTS TABLE SCHEMA
--  Isolated table for prospect / potential clients (leads)
--  Columns:
--    - full_name: Nama Penuh (Full Name)
--    - ic_number: No. Kad Pengenalan (IC Number)
--    - phone_number: No. Telefon (Phone Number)
--    - email: E-mel (Email Address)
--    - address: Alamat (Address)
--    - date: Tarikh Pertanyaan / Hubungi (Contact/Enquiry Date, DD/MM/YYYY)
--    - case_category: Kategori Kes (Case Category)
--    - potential_level: Tahap Potensi (High / Medium / Low)
--    - lead_by: Nama Staf yang Membawa Klien (Staff Lead Source)
--    - notes: Catatan Tambahan (Notes / Remarks)
--    - status: Status Prospek (New / In Discussion / Follow-up / Converted / Dropped)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.potential_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    ic_number TEXT,
    phone_number TEXT,
    email TEXT,
    address TEXT,
    date TEXT,
    case_category TEXT,
    potential_level TEXT NOT NULL DEFAULT 'High',
    lead_by TEXT,
    notes TEXT,
    status TEXT DEFAULT 'New',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Comments on table and columns
COMMENT ON TABLE public.potential_clients IS 'Table storing potential/prospect clients who have not yet signed on';
COMMENT ON COLUMN public.potential_clients.full_name IS 'Full Name of the potential client';
COMMENT ON COLUMN public.potential_clients.ic_number IS 'IC or Identity Card / Passport number';
COMMENT ON COLUMN public.potential_clients.phone_number IS 'Phone contact number';
COMMENT ON COLUMN public.potential_clients.email IS 'Email address';
COMMENT ON COLUMN public.potential_clients.address IS 'Physical or residential address';
COMMENT ON COLUMN public.potential_clients.date IS 'Enquiry / Registration date (DD/MM/YYYY)';
COMMENT ON COLUMN public.potential_clients.case_category IS 'Case Category (e.g. Pinjaman Wang Tak Berlesen, Ah Long, Scam Victim, Bank, etc.)';
COMMENT ON COLUMN public.potential_clients.potential_level IS 'Potential Level: High, Medium, or Low';
COMMENT ON COLUMN public.potential_clients.lead_by IS 'Staff member who brought in or handles this lead';
COMMENT ON COLUMN public.potential_clients.notes IS 'Extra notes, situation details, quotation info';
COMMENT ON COLUMN public.potential_clients.status IS 'Prospect status (New, In Discussion, Follow-up, Converted, Dropped)';

-- Create indexes for fast lookup and sorting
CREATE INDEX IF NOT EXISTS idx_potential_clients_full_name ON public.potential_clients(full_name);
CREATE INDEX IF NOT EXISTS idx_potential_clients_ic_number ON public.potential_clients(ic_number);
CREATE INDEX IF NOT EXISTS idx_potential_clients_phone_number ON public.potential_clients(phone_number);
CREATE INDEX IF NOT EXISTS idx_potential_clients_potential_level ON public.potential_clients(potential_level);
CREATE INDEX IF NOT EXISTS idx_potential_clients_lead_by ON public.potential_clients(lead_by);
CREATE INDEX IF NOT EXISTS idx_potential_clients_created_at ON public.potential_clients(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.potential_clients ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow authenticated read potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated insert potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated update potential_clients" ON public.potential_clients;
DROP POLICY IF EXISTS "Allow authenticated delete potential_clients" ON public.potential_clients;

-- Policies: Authenticated staff can read, insert, update, delete
CREATE POLICY "Allow authenticated read potential_clients"
ON public.potential_clients FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert potential_clients"
ON public.potential_clients FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated update potential_clients"
ON public.potential_clients FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete potential_clients"
ON public.potential_clients FOR DELETE
TO authenticated
USING (true);
