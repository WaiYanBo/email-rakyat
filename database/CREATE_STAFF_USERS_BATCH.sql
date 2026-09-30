-- ====================================================================
--  SUPABASE BATCH SCRIPT: CREATE ALL STAFF USERS & SET READ-ONLY ACCESS
--  Generated for: Email Rakyat Secure Portal
--
--  SUMMARY:
--  1. Creates accounts in auth.users & auth.identities with confirmed email.
--  2. Sets temporary default password: ERakyat@2026! (can be changed in tetapan).
--  3. Populates public.profiles with full_name, email, and Active status.
--  4. Leaves role & position (department) unassigned so you can set them
--     manually later via Portal Settings or HR Panel as desired.
--  5. Configures public.access_permissions to 'Read-Only View All':
--     - Can see Clients, LoD, Potential Clients, Appointments, Staff Directory,
--       Attendance Logs, Reports/Snapshots, Expense Claims, and Leave Records.
--     - CANNOT edit, add, delete, or modify any records, settings, or approvals.
--  6. CRITICAL SAFETY RULE:
--     - Any user already registered in Supabase (including Wai Yan Bo and
--       any other existing accounts) is COMPLETELY SKIPPED.
--     - Their credentials, existing roles, and permissions are 100% UNTOUCHED!
--
--  HOW TO RUN:
--  1. Go to your Supabase Project Dashboard (SQL Editor)
--  2. Navigate to "SQL Editor" on the left sidebar.
--  3. Paste this entire script into a new query tab and click "Run".
-- ====================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
  -- Default temporary password for newly created accounts (change if desired)
  v_default_password TEXT := 'ERakyat@2026!';
  
  -- Iteration variables
  r RECORD;
  v_new_id UUID;
  v_existing_id UUID;
  v_ident_id_type TEXT;
  
  -- Read-only permissions JSON: Can view everything, cannot change or manage anything
  v_view_only_perms JSONB := '{
    "view_clients": true,
    "edit_clients": false,
    "view_lod": true,
    "manage_lod": false,
    "view_potential_clients": true,
    "manage_potential_clients": false,
    "view_appointments": true,
    "manage_appointments": false,
    "export_data": false,
    "view_staff": true,
    "edit_staff": false,
    "view_attendance": true,
    "edit_attendance": false,
    "view_snapshot": true,
    "manage_access_control": false,
    "manage_drive": false,
    "manage_hr": false,
    "view_claims": true,
    "manage_claims": false,
    "view_leave": true,
    "manage_leave": false
  }'::jsonb;

BEGIN
  -- Temporary table with full staff list from document photo
  CREATE TEMP TABLE temp_staff_list (
    full_name TEXT,
    email TEXT
  ) ON COMMIT DROP;

  INSERT INTO temp_staff_list (full_name, email) VALUES
    ('Mohd Shahril Bin Abd Rani', 'aduan@e-rakyat.com'),
    ('Muhammad Jazli Bin Jalaluddin', 'jazz.erasb@gmail.com'),
    ('Muhammad Azizul Harith Bin Azm', 'azizul.erasb@gmail.com'),
    ('Muhammad Hafiz Bin Hashim', 'muhammad.erasb@gmail.com'),
    ('Shahniza Binti Midi', 'shazzmidi.erasb@gmail.com'),
    ('Arif Wafiyuddin Bin Mohd Fuad', 'arifw.erasb@gmail.com'),
    ('Wai Yan Bo', 'shoaiev126.wyb@gmail.com'),
    ('Mohd Badlyshah Bin Amiruddin', 'shahani310@gmail.com'),
    ('Akmar Syahnizam binti Midi', 'midiakma.erasb@gmail.com'),
    ('Norsyuhada binti Othman', 'syuhada.erasb@gmail.com'),
    ('Shahrizul Azri Bin Rosdi', 'shahrizul.erasb@gmail.com'),
    ('Nurul Azra Syafiqka bt Rosliza @ Rosli', 'azrasyafiqkarosli@gmail.com'),
    ('Daniel Abdillah', 'matdaniel.erasb@gmail.com'),
    ('Nursyaqira Izwani Binti Abdullah', 'ira.erasb@gmail.com');

  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'STARTING BATCH USER CREATION & READ-ONLY ACCESS CONFIGURATION';
  RAISE NOTICE 'Default Password for new users: %', v_default_password;
  RAISE NOTICE '===============================================================';

  FOR r IN SELECT full_name, LOWER(TRIM(email)) AS email FROM temp_staff_list LOOP

    -- STEP A: Check if account already exists in auth.users
    SELECT id INTO v_existing_id
    FROM auth.users
    WHERE LOWER(email) = r.email
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Existing user detected! DO NOT TOUCH anything!
      RAISE NOTICE '[SKIPPED - ALREADY REGISTERED] % (%) [User ID: %] - Preserved without changes.', r.full_name, r.email, v_existing_id;
      CONTINUE;
    END IF;

    -- STEP B: Generate new unique UUID
    v_new_id := gen_random_uuid();

    -- STEP C: Insert new user into auth.users (email confirmed so they can log in immediately)
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_new_id,
      'authenticated',
      'authenticated',
      r.email,
      crypt(v_default_password, gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.full_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    -- STEP D: Insert identity into auth.identities
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
      SELECT data_type INTO v_ident_id_type 
      FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'id';

      BEGIN
        IF v_ident_id_type = 'uuid' THEN
          INSERT INTO auth.identities (
            id,
            user_id,
            provider_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            v_new_id,
            v_new_id::text,
            jsonb_build_object('sub', v_new_id::text, 'email', r.email),
            'email',
            NOW(),
            NOW(),
            NOW()
          );
        ELSE
          INSERT INTO auth.identities (
            id,
            user_id,
            provider_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid()::text,
            v_new_id,
            v_new_id::text,
            jsonb_build_object('sub', v_new_id::text, 'email', r.email),
            'email',
            NOW(),
            NOW(),
            NOW()
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Note on identity table insert for %: %', r.email, SQLERRM;
      END;
    END IF;

    -- STEP E: Sync / Upsert public.profiles
    INSERT INTO public.profiles (id, full_name, email, status)
    VALUES (v_new_id, r.full_name, r.email, 'Active')
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        status = 'Active';

    -- STEP F: Set up read-only permissions in public.access_permissions
    -- 1. By User UUID
    IF EXISTS (SELECT 1 FROM public.access_permissions WHERE target_type = 'user' AND target_id = v_new_id::text) THEN
      UPDATE public.access_permissions
      SET permissions = v_view_only_perms,
          updated_at = NOW()
      WHERE target_type = 'user' AND target_id = v_new_id::text;
    ELSE
      INSERT INTO public.access_permissions (target_type, target_id, permissions)
      VALUES ('user', v_new_id::text, v_view_only_perms);
    END IF;

    -- 2. By Full Name (fallback compatibility for legacy permission checks)
    IF EXISTS (SELECT 1 FROM public.access_permissions WHERE target_type = 'user' AND target_id = r.full_name) THEN
      UPDATE public.access_permissions
      SET permissions = v_view_only_perms,
          updated_at = NOW()
      WHERE target_type = 'user' AND target_id = r.full_name;
    ELSE
      INSERT INTO public.access_permissions (target_type, target_id, permissions)
      VALUES ('user', r.full_name, v_view_only_perms);
    END IF;

    -- STEP G: Initialize leave balance if leave_balances table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leave_balances') THEN
      INSERT INTO public.leave_balances (profile_id)
      VALUES (v_new_id)
      ON CONFLICT (profile_id) DO NOTHING;
    END IF;

    RAISE NOTICE '[CREATED SUCCESSFULLY] % (%) [User ID: %]', r.full_name, r.email, v_new_id;
  END LOOP;

  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'BATCH CREATION PROCESS COMPLETED!';
  RAISE NOTICE '===============================================================';
END $$;

-- 2. Summary Verification Table: Output all staff profiles and their permission status
SELECT 
  p.id AS user_id, 
  p.full_name, 
  p.email, 
  p.status,
  COALESCE(r.role_name, 'No Role (Manual Assignment Pending)') AS current_role,
  COALESCE(p.department, 'No Dept (Manual Assignment Pending)') AS current_department,
  CASE 
    WHEN ap.permissions IS NOT NULL THEN 'Configured (Read-Only View All)'
    ELSE 'Standard Default'
  END AS permissions_profile
FROM public.profiles p
LEFT JOIN public.roles r ON p.role_id = r.id
LEFT JOIN public.access_permissions ap ON ap.target_type = 'user' AND ap.target_id = p.id::text
WHERE p.email IN (
  'aduan@e-rakyat.com',
  'jazz.erasb@gmail.com',
  'azizul.erasb@gmail.com',
  'muhammad.erasb@gmail.com',
  'shazzmidi.erasb@gmail.com',
  'arifw.erasb@gmail.com',
  'shoaiev126.wyb@gmail.com',
  'shahani310@gmail.com',
  'midiakma.erasb@gmail.com',
  'syuhada.erasb@gmail.com',
  'shahrizul.erasb@gmail.com',
  'azrasyafiqkarosli@gmail.com',
  'matdaniel.erasb@gmail.com',
  'ira.erasb@gmail.com'
)
ORDER BY p.full_name;
