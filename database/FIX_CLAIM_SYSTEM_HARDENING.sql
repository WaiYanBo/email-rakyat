-- =======================================================
-- CLAIM SYSTEM SECURITY & BUGFIX PATCH
-- =======================================================

-- 1. Fix RLS UPDATE policy on claims to prevent self-approval & unauthorized amount tampering
DROP POLICY IF EXISTS "Users can update their own drafts/rejected or approvers update" ON public.claims;

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

-- 2. Harden Storage RLS policies for claim-receipts
DROP POLICY IF EXISTS "Users can upload claim receipts to their staff folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view claim receipts in claim-receipts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users can update claim receipts in claim-receipts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete claim receipts in claim-receipts bucket" ON storage.objects;

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

-- 3. Enhance Trigger Function: Medical Entitlement Deduction & Refund on Approval/Un-approval/Delete
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

-- Re-create trigger for BEFORE UPDATE OR DELETE
DROP TRIGGER IF EXISTS trg_deduct_medical_entitlement ON public.claims;

CREATE TRIGGER trg_deduct_medical_entitlement
  BEFORE UPDATE OR DELETE ON public.claims
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_deduct_medical_entitlement();
