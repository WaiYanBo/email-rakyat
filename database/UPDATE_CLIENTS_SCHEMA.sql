-- ====================================================================
--  UPDATE CLIENTS TABLE SCHEMA
--  Adds columns to support advanced client case profiles:
--  - Laporan Polis (Police Report)
--  - Kertas Siasatan (Investigation Paper)
--  - Lokasi Laporan (Report Location)
--  - Resolution Status (Status Penyelesaian)
--  - Letter of Demand (LoD)
-- ====================================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS police_report_date TEXT,
ADD COLUMN IF NOT EXISTS police_report_no TEXT,
ADD COLUMN IF NOT EXISTS ip_date TEXT,
ADD COLUMN IF NOT EXISTS ip_no TEXT,
ADD COLUMN IF NOT EXISTS ip_pem1 TEXT,
ADD COLUMN IF NOT EXISTS ip_officer TEXT,
ADD COLUMN IF NOT EXISTS report_location_balai TEXT,
ADD COLUMN IF NOT EXISTS report_location_ipd TEXT,
ADD COLUMN IF NOT EXISTS report_location_ipk TEXT,
ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT 'Tindakan',
ADD COLUMN IF NOT EXISTS lod_date TEXT,
ADD COLUMN IF NOT EXISTS lod_claim_amount TEXT,
ADD COLUMN IF NOT EXISTS lod_remark TEXT;

-- Add comment explaining the new fields
COMMENT ON COLUMN public.clients.police_report_date IS 'Tarikh laporan polis dibuat';
COMMENT ON COLUMN public.clients.police_report_no IS 'Nombor laporan polis';
COMMENT ON COLUMN public.clients.ip_date IS 'Tarikh kertas siasatan';
COMMENT ON COLUMN public.clients.ip_no IS 'Nombor Kertas Siasatan (No. KS)';
COMMENT ON COLUMN public.clients.ip_pem1 IS 'PEM 1';
COMMENT ON COLUMN public.clients.ip_officer IS 'Pegawai Penyiasat (IO)';
COMMENT ON COLUMN public.clients.report_location_balai IS 'Balai polis tempat laporan dibuat';
COMMENT ON COLUMN public.clients.report_location_ipd IS 'IPD daerah tempat laporan dibuat';
COMMENT ON COLUMN public.clients.report_location_ipk IS 'IPK negeri tempat laporan dibuat';
COMMENT ON COLUMN public.clients.resolution_status IS 'Status Penyelesaian (Selesai/Tindakan/Tertangguh)';
COMMENT ON COLUMN public.clients.lod_date IS 'Tarikh Letter of Demand (LoD)';
COMMENT ON COLUMN public.clients.lod_claim_amount IS 'Jumlah tuntutan LoD';
COMMENT ON COLUMN public.clients.lod_remark IS 'Catatan/Remark LoD';
