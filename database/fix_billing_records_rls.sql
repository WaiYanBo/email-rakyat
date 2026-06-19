-- 1. Ensure Row Level Security (RLS) is enabled on billing_records
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing RLS policies on the table to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.billing_records;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.billing_records;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.billing_records;

-- 3. Create SELECT policy for authenticated users
CREATE POLICY "Allow authenticated read access" 
ON public.billing_records FOR SELECT 
TO authenticated 
USING (true);

-- 4. Create INSERT policy for authenticated users
CREATE POLICY "Allow authenticated insert access" 
ON public.billing_records FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 5. Create UPDATE policy for authenticated users (required for soft delete)
CREATE POLICY "Allow authenticated update access" 
ON public.billing_records FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 6. Retroactively fix any existing soft-deleted records that lack the _deleted_ suffix in their ref_number
UPDATE public.billing_records
SET ref_number = ref_number || '_deleted_' || floor(extract(epoch from now()))::text
WHERE deleted_at IS NOT NULL
  AND ref_number NOT LIKE '%_deleted_%';
