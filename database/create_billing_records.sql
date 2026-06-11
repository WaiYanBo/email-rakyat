-- Create the billing_records table
CREATE TABLE IF NOT EXISTS public.billing_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id text NOT NULL,
    document_type text NOT NULL CHECK (document_type IN ('invoice', 'receipt')),
    ref_number text NOT NULL UNIQUE,
    amount numeric(10, 2) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust according to your auth needs)
CREATE POLICY "Allow authenticated read access" 
ON public.billing_records FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated insert access" 
ON public.billing_records FOR INSERT 
TO authenticated 
WITH CHECK (true);
