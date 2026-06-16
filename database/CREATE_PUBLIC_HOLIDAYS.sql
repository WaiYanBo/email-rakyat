-- Create public_holidays table
CREATE TABLE IF NOT EXISTS public_holidays (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Enable read access for all users" ON public_holidays
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert/update/delete for users with 'view_attendance' permission
-- (This relies on checking the role, similar to how your app does it, or we can just allow HR/Admins)
CREATE POLICY "Enable write access for HR and Admins" ON public_holidays
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (
                profiles.role_id IN (SELECT id FROM roles WHERE role_name IN ('HR', 'IT Admin', 'General Manager', 'CEO', 'COO', 'CFO'))
            )
        )
    );

-- Insert default public holidays for 2026
INSERT INTO public_holidays (date, name) VALUES
('2026-06-01', 'Agong''s Birthday'),
('2026-06-02', 'Wesak Day Holiday'),
('2026-06-17', 'Awal Muharram'),
('2026-08-25', 'Prophet Muhammad''s Birthday'),
('2026-08-31', 'Merdeka Day'),
('2026-09-16', 'Malaysia Day'),
('2026-11-08', 'Deepavali'),
('2026-11-09', 'Deepavali Holiday'),
('2026-12-11', 'Sultan of Selangor''s Birthday'),
('2026-12-25', 'Christmas Day');
