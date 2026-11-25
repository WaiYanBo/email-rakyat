-- ====================================================================
--  ADD CONSULTATION FEE COLUMN TO CLIENTS TABLE
--  Stores the upfront consultation fee paid by the client, which adds
--  to both the Total Package (PACKAGE (RM)) and Total Paid (TOTAL PAID (RM)).
-- ====================================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS "CONSULTATION FEE (RM)" NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.clients."CONSULTATION FEE (RM)" IS 'Yuran konsultasi yang telah dibayar oleh klien semasa sesi konsultasi (ditambah kepada PACKAGE (RM) dan TOTAL PAID (RM))';
