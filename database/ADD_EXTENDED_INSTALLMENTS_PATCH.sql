-- ====================================================================
--  ADD EXTENDED INSTALLMENTS COLUMNS (7th to 10th Payments)
--  Enables clients table to store up to 10 installment payments
-- ====================================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS "7th PAYMENT" NUMERIC,
ADD COLUMN IF NOT EXISTS "7th PAYMENT DATE" TEXT,
ADD COLUMN IF NOT EXISTS "8th PAYMENT" NUMERIC,
ADD COLUMN IF NOT EXISTS "8th PAYMENT DATE" TEXT,
ADD COLUMN IF NOT EXISTS "9th PAYMENT" NUMERIC,
ADD COLUMN IF NOT EXISTS "9th PAYMENT DATE" TEXT,
ADD COLUMN IF NOT EXISTS "10th PAYMENT" NUMERIC,
ADD COLUMN IF NOT EXISTS "10th PAYMENT DATE" TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.clients."7th PAYMENT" IS 'Jumlah bayaran ke-7';
COMMENT ON COLUMN public.clients."7th PAYMENT DATE" IS 'Tarikh bayaran ke-7';
COMMENT ON COLUMN public.clients."8th PAYMENT" IS 'Jumlah bayaran ke-8';
COMMENT ON COLUMN public.clients."8th PAYMENT DATE" IS 'Tarikh bayaran ke-8';
COMMENT ON COLUMN public.clients."9th PAYMENT" IS 'Jumlah bayaran ke-9';
COMMENT ON COLUMN public.clients."9th PAYMENT DATE" IS 'Tarikh bayaran ke-9';
COMMENT ON COLUMN public.clients."10th PAYMENT" IS 'Jumlah bayaran ke-10';
COMMENT ON COLUMN public.clients."10th PAYMENT DATE" IS 'Tarikh bayaran ke-10';
