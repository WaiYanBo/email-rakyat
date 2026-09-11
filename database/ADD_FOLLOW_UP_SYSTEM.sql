-- ==============================================================================
-- SCHEMA MIGRATION: APPOINTMENT FOLLOW-UP SYSTEM
-- ==============================================================================
-- Adds follow-up scheduling and notification tracking columns to public.appointments
-- ==============================================================================

ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS follow_up_time TEXT DEFAULT '10:00 AM',
ADD COLUMN IF NOT EXISTS follow_up_notes TEXT,
ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'pending'; -- 'pending', 'completed', 'dismissed'

-- Index for lightning-fast due follow-up lookups and notifications
CREATE INDEX IF NOT EXISTS idx_appointments_follow_up_date ON public.appointments(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_appointments_follow_up_status ON public.appointments(follow_up_status);

COMMENT ON COLUMN public.appointments.follow_up_date IS 'Target date for post-consultation follow-up with the client';
COMMENT ON COLUMN public.appointments.follow_up_time IS 'Target time for the follow-up contact (e.g. 10:00 AM)';
COMMENT ON COLUMN public.appointments.follow_up_notes IS 'Specific objectives or notes for the follow-up consultation';
COMMENT ON COLUMN public.appointments.follow_up_status IS 'Status of follow-up reminder: pending, completed, or dismissed';
