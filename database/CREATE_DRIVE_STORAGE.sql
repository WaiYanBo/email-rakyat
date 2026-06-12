-- Create the company_drive storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('company_drive', 'company_drive', false)
ON CONFLICT (id) DO NOTHING;

-- Set up Storage Security Policies for company_drive
-- Allow ALL authenticated users to READ files in the drive
CREATE POLICY "Allow authenticated read company_drive"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
  );

-- Allow authorized users to UPLOAD (INSERT) files
CREATE POLICY "Allow authorized insert company_drive"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'HR', 'Chairman', 'CEO', 'COO', 'CFO', 'General Manager'))
      )
      OR EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
      )
    )
  );

-- Allow authorized users to UPDATE files (e.g. rename/move)
CREATE POLICY "Allow authorized update company_drive"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
  );

-- Allow authorized users to DELETE files
CREATE POLICY "Allow authorized delete company_drive"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company_drive' 
    AND auth.role() = 'authenticated'
    AND (
      auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role_id IN (SELECT id FROM public.roles WHERE role_name IN ('IT Admin', 'HR', 'Chairman', 'CEO', 'COO', 'CFO', 'General Manager'))
      )
      OR EXISTS (
        SELECT 1 FROM public.access_permissions
        WHERE (target_type = 'user' AND target_id = auth.uid()::text AND (permissions->>'manage_drive')::boolean = true)
           OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid()) AND (permissions->>'manage_drive')::boolean = true)
      )
    )
  );
