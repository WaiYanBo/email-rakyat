-- Add the drive_url column to the billing_records table
ALTER TABLE public.billing_records
ADD COLUMN IF NOT EXISTS drive_url text;
