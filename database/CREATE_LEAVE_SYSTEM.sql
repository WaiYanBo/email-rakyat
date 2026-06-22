-- 1. Helper function to check if a user is an authorized Leave Approver
CREATE OR REPLACE FUNCTION public.is_leave_approver(u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id
      AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'CEO', 'Chairman', 'COO', 'General Manager', 'Head of Department')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create the leave_balances table
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  annual_total NUMERIC(4,1) DEFAULT 14.0 NOT NULL,
  annual_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  sick_total NUMERIC(4,1) DEFAULT 14.0 NOT NULL,
  sick_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  hospitalisation_total NUMERIC(4,1) DEFAULT 60.0 NOT NULL,
  hospitalisation_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  maternity_total NUMERIC(4,1) DEFAULT 98.0 NOT NULL,
  maternity_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  paternity_total NUMERIC(4,1) DEFAULT 7.0 NOT NULL,
  paternity_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  unpaid_used NUMERIC(4,1) DEFAULT 0.0 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on leave_balances
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- Balances policies
CREATE POLICY "Users can select their own leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

CREATE POLICY "Approvers can update leave balances"
  ON public.leave_balances FOR UPDATE
  USING (public.is_leave_approver(auth.uid()));

CREATE POLICY "Approvers can insert leave balances"
  ON public.leave_balances FOR INSERT
  WITH CHECK (public.is_leave_approver(auth.uid()));

CREATE POLICY "Approvers can delete leave balances"
  ON public.leave_balances FOR DELETE
  USING (public.is_leave_approver(auth.uid()));


-- 3. Create the leave_requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  leave_type VARCHAR(50) NOT NULL, -- 'Annual', 'Sick', 'Hospitalisation', 'Maternity', 'Paternity', 'Compassionate', 'Marriage', 'Emergency', 'Unpaid'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  session_type VARCHAR(50) DEFAULT 'Full Day' NOT NULL, -- 'Full Day', 'AM Half Day', 'PM Half Day'
  total_days NUMERIC(4,1) NOT NULL,
  reason TEXT NOT NULL,
  attachment_url TEXT,
  status VARCHAR(20) DEFAULT 'Pending' NOT NULL, -- 'Pending', 'Approved', 'Rejected', 'Cancelled'
  approved_by UUID REFERENCES public.profiles(id),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Requests policies
CREATE POLICY "Users can select their own or authorized leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

CREATE POLICY "Users can insert their own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users and approvers can update leave requests"
  ON public.leave_requests FOR UPDATE
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()))
  WITH CHECK (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));

CREATE POLICY "Users and approvers can delete leave requests"
  ON public.leave_requests FOR DELETE
  USING (auth.uid() = profile_id OR public.is_leave_approver(auth.uid()));


-- 4. Create trigger to insert initial leave balances for new profiles
CREATE OR REPLACE FUNCTION public.handle_new_profile_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.leave_balances (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_profile_created_leave_balance
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_leave_balance();


-- 5. Seed initial leave balances for any existing profiles
INSERT INTO public.leave_balances (profile_id)
SELECT id FROM public.profiles
ON CONFLICT (profile_id) DO NOTHING;


-- 6. Helper function to adjust leave balance fields
CREATE OR REPLACE FUNCTION public.adjust_leave_balance(p_id UUID, l_type TEXT, days NUMERIC)
RETURNS VOID AS $$
BEGIN
  IF l_type = 'Annual' THEN
    UPDATE public.leave_balances SET annual_used = GREATEST(0.0, annual_used + days) WHERE profile_id = p_id;
  ELSIF l_type = 'Sick' THEN
    UPDATE public.leave_balances SET sick_used = GREATEST(0.0, sick_used + days) WHERE profile_id = p_id;
  ELSIF l_type = 'Hospitalisation' THEN
    UPDATE public.leave_balances SET hospitalisation_used = GREATEST(0.0, hospitalisation_used + days) WHERE profile_id = p_id;
  ELSIF l_type = 'Maternity' THEN
    UPDATE public.leave_balances SET maternity_used = GREATEST(0.0, maternity_used + days) WHERE profile_id = p_id;
  ELSIF l_type = 'Paternity' THEN
    UPDATE public.leave_balances SET paternity_used = GREATEST(0.0, paternity_used + days) WHERE profile_id = p_id;
  ELSIF l_type = 'Unpaid' THEN
    UPDATE public.leave_balances SET unpaid_used = GREATEST(0.0, unpaid_used + days) WHERE profile_id = p_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Trigger to automatically deduct/refund leave balances when leave requests are approved, cancelled, or deleted
CREATE OR REPLACE FUNCTION public.handle_leave_balance_adjustment()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE 1: INSERT of an already Approved request (e.g. historical data imports)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'Approved' THEN
      PERFORM public.adjust_leave_balance(NEW.profile_id, NEW.leave_type, NEW.total_days);
    END IF;
  
  -- CASE 2: UPDATE of request status
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transitioned to Approved: deduct days
    IF NEW.status = 'Approved' AND OLD.status <> 'Approved' THEN
      PERFORM public.adjust_leave_balance(NEW.profile_id, NEW.leave_type, NEW.total_days);
    -- Transitioned out of Approved (e.g. Cancelled/Rejected): refund days
    ELSIF OLD.status = 'Approved' AND NEW.status <> 'Approved' THEN
      PERFORM public.adjust_leave_balance(OLD.profile_id, OLD.leave_type, -OLD.total_days);
    -- Remain Approved but updated details (e.g. duration or type corrected): adjust difference
    ELSIF OLD.status = 'Approved' AND NEW.status = 'Approved' THEN
      PERFORM public.adjust_leave_balance(OLD.profile_id, OLD.leave_type, -OLD.total_days);
      PERFORM public.adjust_leave_balance(NEW.profile_id, NEW.leave_type, NEW.total_days);
    END IF;
  
  -- CASE 3: DELETE of request
  ELSIF TG_OP = 'DELETE' THEN
    -- If the deleted request was Approved, refund days
    IF OLD.status = 'Approved' THEN
      PERFORM public.adjust_leave_balance(OLD.profile_id, OLD.leave_type, -OLD.total_days);
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_leave_request_status_change
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_leave_balance_adjustment();


-- 8. Set up leave_attachments private storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave_attachments', 'leave_attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Security Policies for leave_attachments
CREATE POLICY "Users can upload their own leave attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'leave_attachments' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users and leave approvers can view leave attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'leave_attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_leave_approver(auth.uid())
    )
  );

CREATE POLICY "Users can update their own leave attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'leave_attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own leave attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'leave_attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
