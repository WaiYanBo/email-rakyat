-- Migration to support multiple clock-ins per day for a single employee
-- Run this in your Supabase SQL Editor:

-- 1. Drop the unique constraint that restricts attendance to one record per user per day
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_user_id_date_key;

-- 2. (Optional) Verification:
-- After running this, users will be allowed to have multiple rows in the public.attendance table for the same date.
-- This supports employees with split shifts (e.g., morning and night shifts).
