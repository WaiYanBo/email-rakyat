-- ====================================================================
--  ADD AGREEMENTS & PAYMENT RECEIPTS SCHEMA
--  Supports digital uploads of physical agreement forms & client payment receipts
-- ====================================================================

-- 1. Add agreement form columns to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS agreement_url TEXT,
ADD COLUMN IF NOT EXISTS agreement_name TEXT,
ADD COLUMN IF NOT EXISTS agreement_date TEXT,
ADD COLUMN IF NOT EXISTS payment_receipts JSONB DEFAULT '{}'::jsonb;

-- 2. Add comments explaining columns
COMMENT ON COLUMN public.clients.agreement_url IS 'URL atau laluan storan bagi salinan digital borang perjanjian fizikal';
COMMENT ON COLUMN public.clients.agreement_name IS 'Nama fail borang perjanjian yang dimuat naik';
COMMENT ON COLUMN public.clients.agreement_date IS 'Tarikh borang perjanjian ditandatangani atau dimuat naik';
COMMENT ON COLUMN public.clients.payment_receipts IS 'Peta JSON mengandungi maklumat fail resit/slip bayaran klien bagi setiap ansuran (cth: {"1st": {"url": "...", "name": "..."}})';
