-- Migration script to rename attendance columns from check-in/out to clock-in/out
-- Run this in your Supabase SQL Editor:

-- 1. Rename check_in columns
ALTER TABLE public.attendance RENAME COLUMN check_in_time TO clock_in_time;
ALTER TABLE public.attendance RENAME COLUMN check_in_latitude TO clock_in_latitude;
ALTER TABLE public.attendance RENAME COLUMN check_in_longitude TO clock_in_longitude;
ALTER TABLE public.attendance RENAME COLUMN check_in_distance TO clock_in_distance;
ALTER TABLE public.attendance RENAME COLUMN check_in_within_zone TO clock_in_within_zone;
ALTER TABLE public.attendance RENAME COLUMN check_in_accuracy TO clock_in_accuracy;

-- 2. Rename check_out columns
ALTER TABLE public.attendance RENAME COLUMN check_out_time TO clock_out_time;
ALTER TABLE public.attendance RENAME COLUMN check_out_latitude TO clock_out_latitude;
ALTER TABLE public.attendance RENAME COLUMN check_out_longitude TO clock_out_longitude;
ALTER TABLE public.attendance RENAME COLUMN check_out_distance TO clock_out_distance;
ALTER TABLE public.attendance RENAME COLUMN check_out_within_zone TO clock_out_within_zone;
ALTER TABLE public.attendance RENAME COLUMN check_out_accuracy TO clock_out_accuracy;

-- 3. Rename late checkout columns/flags
ALTER TABLE public.attendance RENAME COLUMN is_late_checkout TO is_late_clockout;
ALTER TABLE public.attendance RENAME COLUMN late_checkout_flagged TO late_clockout_flagged;
ALTER TABLE public.attendance RENAME COLUMN late_checkout_reported_at TO late_clockout_reported_at;
