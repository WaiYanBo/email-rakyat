-- Add deleted_at column to billing_records table
ALTER TABLE public.billing_records
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- Update RLS policies or trigger if necessary
-- Create a cron job to automatically clean up trash older than 30 days if pg_cron is enabled
-- (Requires pg_cron extension)
CREATE OR REPLACE FUNCTION public.cleanup_billing_trash_30_days()
RETURNS void AS $$
BEGIN
  -- 1. Delete billing records from public.billing_records soft-deleted more than 30 days ago
  DELETE FROM public.billing_records
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  -- 2. Delete storage objects in the company_drive bucket under Trash/ folder created more than 30 days ago
  DELETE FROM storage.objects
  WHERE bucket_id = 'company_drive'
    AND name LIKE 'Finance/billing_documents/Trash/%'
    AND created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow authenticated users to update billing records (required for soft delete)
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.billing_records;
CREATE POLICY "Allow authenticated update access" 
ON public.billing_records FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);
