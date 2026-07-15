-- Trigger modification to support freelance/contract workers without default leave entitlements

CREATE OR REPLACE FUNCTION public.handle_new_profile_leave_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_role_name TEXT;
BEGIN
  -- Get the role name of the newly created profile
  SELECT role_name INTO v_role_name
  FROM public.roles
  WHERE id = NEW.role_id;

  -- If employee role indicates freelance, contract, or part-time, set default entitlements to 0
  IF v_role_name IN ('Contract Worker', 'Part-Time Worker', 'Contract', 'Part Time') THEN
    INSERT INTO public.leave_balances (
      profile_id,
      annual_total,
      sick_total,
      hospitalisation_total,
      maternity_total,
      paternity_total
    )
    VALUES (
      NEW.id,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0
    )
    ON CONFLICT (profile_id) DO NOTHING;
  ELSE
    -- Standard full-time employee defaults
    INSERT INTO public.leave_balances (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
