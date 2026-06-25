-- SQL script to insert today's clock-in record for Shahniza Binti Midi
-- Run this in your Supabase SQL Editor:

-- Disable integrity trigger temporarily to allow manual time correction
ALTER TABLE public.attendance DISABLE TRIGGER enforce_attendance_integrity;

DO $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_date DATE := '2026-06-25'; -- Today's date
  v_office_lat NUMERIC := 3.0750624396122763;
  v_office_lng NUMERIC := 101.61250689446412;
  -- Coordinates approx 41 meters away:
  v_lat NUMERIC := 3.0750624396122763 + 0.0003689;
  v_lng NUMERIC := 101.61250689446412;
BEGIN
  -- 1. Find user ID and full name in profiles database
  SELECT id, full_name INTO v_user_id, v_user_name
  FROM public.profiles
  WHERE full_name ILIKE '%Shahniza%'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Employee matching name "Shahniza" not found in profiles table.';
  END IF;

  RAISE NOTICE 'Found Employee: % (ID: %)', v_user_name, v_user_id;

  -- 2. Clean up any existing records for today
  DELETE FROM public.attendance 
  WHERE user_id = v_user_id AND date = v_date;

  -- 3. Insert today's clock-in (11:00 AM) with clock-out left as NULL
  INSERT INTO public.attendance (
    user_id,
    user_name,
    date,
    clock_in_time,
    clock_in_latitude,
    clock_in_longitude,
    clock_in_distance,
    clock_in_within_zone,
    clock_in_accuracy,
    clock_out_time,
    clock_out_latitude,
    clock_out_longitude,
    clock_out_distance,
    clock_out_within_zone,
    clock_out_accuracy
  ) VALUES (
    v_user_id,
    v_user_name,
    v_date,
    '2026-06-25T11:00:00+08:00', -- 11:00 AM Clock-In
    v_lat,
    v_lng,
    41,
    true,
    10,
    NULL, -- Clock-out is pending
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );

  RAISE NOTICE 'Successfully inserted today''s clock-in record for %', v_user_name;
END $$;

-- Re-enable the integrity trigger
ALTER TABLE public.attendance ENABLE TRIGGER enforce_attendance_integrity;
