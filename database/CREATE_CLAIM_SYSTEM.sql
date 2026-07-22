-- =======================================================
-- CLAIMS MANAGEMENT SYSTEM (Sistem Tuntutan) MIGRATION
-- =======================================================

-- 1. Helper function to check if a user is an authorized Claim Approver
CREATE OR REPLACE FUNCTION public.is_claim_approver(u_id UUID)
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


-- 2. Create the claim_entitlements table (Medical Annual Limits)
CREATE TABLE IF NOT EXISTS public.claim_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  medical_total NUMERIC(10,2) DEFAULT 500.00 NOT NULL,
  medical_used NUMERIC(10,2) DEFAULT 0.00 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_profile_year_claim UNIQUE (profile_id, year)
);

ALTER TABLE public.claim_entitlements ENABLE ROW LEVEL SECURITY;

-- Entitlement Policies
CREATE POLICY "Users can view their own or approver claim entitlements"
  ON public.claim_entitlements FOR SELECT
  USING (auth.uid() = profile_id OR public.is_claim_approver(auth.uid()));

CREATE POLICY "Approvers can manage claim entitlements"
  ON public.claim_entitlements FOR ALL
  USING (public.is_claim_approver(auth.uid()));


-- 3. Create Sequence & Function for Claim Numbers (CLM-YYYY-XXXX)
CREATE SEQUENCE IF NOT EXISTS public.claim_no_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_claim_no()
RETURNS TEXT AS $$
DECLARE
  yr TEXT;
  seq_num TEXT;
BEGIN
  yr := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := LPAD(NEXTVAL('public.claim_no_seq')::TEXT, 4, '0');
  RETURN 'CLM-' || yr || '-' || seq_num;
END;
$$ LANGUAGE plpgsql;


-- 4. Create the claims table
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no VARCHAR(50) NOT NULL DEFAULT public.generate_claim_no(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  staff_name TEXT,
  claim_type VARCHAR(50) NOT NULL, -- 'Meal', 'Mileage', 'Medical', 'Other'
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  actual_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payable_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  start_location TEXT,
  destination TEXT,
  vehicle_type VARCHAR(20), -- 'Car', 'Motorcycle'
  distance_km NUMERIC(8,2) DEFAULT 0.00,
  receipt_path TEXT,
  receipt_name TEXT,
  status VARCHAR(30) DEFAULT 'Draft' NOT NULL, -- 'Draft', 'Pending Approval', 'Approved', 'Rejected', 'Paid'
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Claims Policies
CREATE POLICY "Users can select their own claims or approvers can view all"
  ON public.claims FOR SELECT
  USING (auth.uid() = profile_id OR public.is_claim_approver(auth.uid()));

CREATE POLICY "Users can insert their own claims"
  ON public.claims FOR INSERT
  WITH CHECK (auth.uid() = profile_id OR public.is_claim_approver(auth.uid()));

CREATE POLICY "Users can update their own drafts/rejected or approvers update"
  ON public.claims FOR UPDATE
  USING (
    (auth.uid() = profile_id AND status IN ('Draft', 'Rejected', 'Pending Approval'))
    OR public.is_claim_approver(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = profile_id AND status IN ('Draft', 'Pending Approval'))
    OR public.is_claim_approver(auth.uid())
  );

CREATE POLICY "Users can delete their own drafts or approvers delete"
  ON public.claims FOR DELETE
  USING (
    (auth.uid() = profile_id AND status = 'Draft')
    OR public.is_claim_approver(auth.uid())
  );


-- 5. Trigger Function: Immutable Server Calculation for payable_amount
CREATE OR REPLACE FUNCTION public.fn_calculate_claim_payable()
RETURNS TRIGGER AS $$
DECLARE
  ent_total NUMERIC(10,2);
  ent_used NUMERIC(10,2);
  rem_bal NUMERIC(10,2);
  rate NUMERIC(4,2);
  claim_yr INT;
BEGIN
  -- 1. Meal Claim Logic (RM7 Hard Cap)
  IF NEW.claim_type = 'Meal' THEN
    NEW.payable_amount := LEAST(GREATEST(NEW.actual_amount, 0.00), 7.00);

  -- 2. Mileage Claim Logic (Car = 0.60/km, Motorcycle = 0.20/km)
  ELSIF NEW.claim_type = 'Mileage' THEN
    IF LOWER(COALESCE(NEW.vehicle_type, 'car')) = 'motorcycle' THEN
      rate := 0.20;
    ELSE
      rate := 0.60;
    END IF;
    NEW.actual_amount := ROUND(COALESCE(NEW.distance_km, 0.00) * rate, 2);
    NEW.payable_amount := NEW.actual_amount;

  -- 3. Medical Claim Logic (Capped at Remaining Annual Balance)
  ELSIF NEW.claim_type = 'Medical' THEN
    claim_yr := EXTRACT(YEAR FROM NEW.claim_date);
    SELECT medical_total, medical_used INTO ent_total, ent_used
    FROM public.claim_entitlements
    WHERE profile_id = NEW.profile_id AND year = claim_yr;

    IF ent_total IS NULL THEN
      -- Create default entitlement if not exists
      INSERT INTO public.claim_entitlements (profile_id, year, medical_total, medical_used)
      VALUES (NEW.profile_id, claim_yr, 500.00, 0.00)
      ON CONFLICT (profile_id, year) DO UPDATE SET updated_at = now()
      RETURNING medical_total, medical_used INTO ent_total, ent_used;
    END IF;

    rem_bal := GREATEST(0.00, COALESCE(ent_total, 500.00) - COALESCE(ent_used, 0.00));
    NEW.payable_amount := LEAST(GREATEST(NEW.actual_amount, 0.00), rem_bal);

  -- 4. General / Other Claim Logic
  ELSE
    NEW.payable_amount := GREATEST(NEW.actual_amount, 0.00);
  END IF;

  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_calc_claim_payable
  BEFORE INSERT OR UPDATE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_calculate_claim_payable();


-- 6. Trigger Function: Medical Entitlement Deduction on Approval & Refund on Reject/Delete
CREATE OR REPLACE FUNCTION public.fn_deduct_medical_entitlement()
RETURNS TRIGGER AS $$
DECLARE
  claim_yr INT;
  ent_total NUMERIC(10,2);
  ent_used NUMERIC(10,2);
  avail NUMERIC(10,2);
BEGIN
  -- Handling UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- A: Newly Approved Medical Claim
    IF NEW.claim_type = 'Medical' AND NEW.status = 'Approved' AND (OLD.status IS NULL OR OLD.status != 'Approved') THEN
      claim_yr := EXTRACT(YEAR FROM NEW.claim_date);
      
      -- Ensure entitlement record exists
      INSERT INTO public.claim_entitlements (profile_id, year, medical_total, medical_used)
      VALUES (NEW.profile_id, claim_yr, 500.00, 0.00)
      ON CONFLICT (profile_id, year) DO NOTHING;

      -- Fetch current entitlement
      SELECT medical_total, medical_used INTO ent_total, ent_used
      FROM public.claim_entitlements
      WHERE profile_id = NEW.profile_id AND year = claim_yr;

      avail := GREATEST(0.00, COALESCE(ent_total, 500.00) - COALESCE(ent_used, 0.00));

      -- Cap payable_amount if remaining balance is less than requested
      IF NEW.payable_amount > avail THEN
        NEW.payable_amount := avail;
      END IF;

      -- Deduct from entitlement
      UPDATE public.claim_entitlements
      SET medical_used = medical_used + NEW.payable_amount,
          updated_at = now()
      WHERE profile_id = NEW.profile_id AND year = claim_yr;

    -- B: Was Approved, now changed to Rejected / Draft / Pending Approval (Refund)
    ELSIF OLD.status = 'Approved' AND NEW.status != 'Approved' AND OLD.claim_type = 'Medical' THEN
      claim_yr := EXTRACT(YEAR FROM OLD.claim_date);
      UPDATE public.claim_entitlements
      SET medical_used = GREATEST(0.00, medical_used - COALESCE(OLD.payable_amount, 0.00)),
          updated_at = now()
      WHERE profile_id = OLD.profile_id AND year = claim_yr;
    END IF;

    RETURN NEW;

  -- Handling DELETE of an Approved Medical Claim (Refund)
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.claim_type = 'Medical' AND OLD.status = 'Approved' THEN
      claim_yr := EXTRACT(YEAR FROM OLD.claim_date);
      UPDATE public.claim_entitlements
      SET medical_used = GREATEST(0.00, medical_used - COALESCE(OLD.payable_amount, 0.00)),
          updated_at = now()
      WHERE profile_id = OLD.profile_id AND year = claim_yr;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_deduct_medical_entitlement
  BEFORE UPDATE OR DELETE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_deduct_medical_entitlement();


-- 7. Private Storage Bucket Setup: claim-receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-receipts', 'claim-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for claim-receipts
CREATE POLICY "Users can upload claim receipts to claim-receipts bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'claim-receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Users or approvers can view claim receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'claim-receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own receipts or approvers update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'claim-receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own receipts or approvers delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'claim-receipts'
    AND (auth.uid() = owner OR public.is_claim_approver(auth.uid()))
  );
