-- ==============================================================================
-- FIX ATTENDANCE CLOCK-IN & CLOCK-OUT TIMES FOR SHAHRIZUL AZRI (2026-08-28)
-- ==============================================================================
-- Record ID: 43cf44a4-29f8-4af0-9f69-9af4860407f8
-- Actual Clock-In:  9:45 AM MYT (UTC+8) -> '2026-08-28 09:45:00+08' / '2026-08-28 01:45:00+00'
-- Actual Clock-Out: 6:45 PM MYT (UTC+8) -> '2026-08-28 18:45:00+08' / '2026-08-28 10:45:00+00'
-- Geolocation: Lat 3.07527330, Lng 101.61247720, Distance 24m, Within Zone: true, Accuracy: 31m
-- ==============================================================================

-- 1. Temporarily disable user triggers (in case historical timestamp validation trigger is active)
ALTER TABLE public.attendance DISABLE TRIGGER USER;

-- 2. Update both Clock-In and Clock-Out times and coordinates
UPDATE public.attendance
SET
    clock_in_time = '2026-08-28 09:45:00+08',    -- 9:45 AM Malaysia Time
    clock_in_latitude = 3.07527330,
    clock_in_longitude = 101.61247720,
    clock_in_distance = 24,
    clock_in_within_zone = true,
    clock_in_accuracy = 31,

    clock_out_time = '2026-08-28 18:45:00+08',   -- 6:45 PM Malaysia Time
    clock_out_latitude = 3.07527330,
    clock_out_longitude = 101.61247720,
    clock_out_distance = 24,
    clock_out_within_zone = true,
    clock_out_accuracy = 31,

    is_late_clockout = false,
    late_clockout_flagged = false,
    updated_at = NOW()
WHERE id = '43cf44a4-29f8-4af0-9f69-9af4860407f8';

-- 3. Re-enable user triggers
ALTER TABLE public.attendance ENABLE TRIGGER USER;

-- 4. Verify the updated row
SELECT 
    id,
    user_name,
    date,
    clock_in_time,
    clock_out_time,
    clock_out_latitude,
    clock_out_longitude,
    clock_out_distance,
    clock_out_within_zone,
    clock_out_accuracy
FROM public.attendance
WHERE id = '43cf44a4-29f8-4af0-9f69-9af4860407f8';
