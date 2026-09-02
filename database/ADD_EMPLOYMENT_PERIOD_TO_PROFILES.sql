-- ====================================================================
-- SQL Patch: Add Employment Contract & Period Fields to Profiles Table
-- Enables Month-by-Month Annual Leave Accrual & Contract Duration Tracking
-- ====================================================================

-- 1. Add new columns to public.profiles if they don't already exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Contract of Service',
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS is_currently_working BOOLEAN DEFAULT true;

-- 2. Add an index for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_employment ON public.profiles(employment_type, start_date);

-- 3. Verify columns in profiles
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name IN ('employment_type', 'start_date', 'end_date', 'is_currently_working');
