-- Fix for RLS policy failing after changing departments to 'BOD'
-- This ensures ONLY HR, CFO, IT Admins, and those with explicit Access Control overrides can update/insert profiles.

-- Drop any existing conflicting policies if needed (replace 'policy_name' if you know the exact name)
-- DROP POLICY IF EXISTS "Allow authorized roles to update profiles" ON public.profiles;

-- Create the UPDATE policy for profiles synced with Access Control matrix
CREATE POLICY "Allow authorized roles to update profiles"
ON public.profiles
FOR UPDATE
USING (
  -- 1. Users can update their own profile basic data
  auth.uid() = id
  OR 
  -- 2. Explicit HR, CFO, and IT Admin roles
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role_id IN (
      SELECT id FROM public.roles 
      WHERE role_name IN ('IT Admin', 'HR', 'CFO')
    )
  )
  OR
  -- 3. Users with explicit user-level override in Access Control (edit_staff permission)
  EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE target_type = 'user'
      AND target_id = auth.uid()::text
      AND (permissions->>'edit_staff')::boolean = true
  )
  OR
  -- 4. Users with department-level override in Access Control (edit_staff permission)
  EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE target_type = 'department'
      AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid())
      AND (permissions->>'edit_staff')::boolean = true
  )
);

-- Ensure INSERT policy also follows the exact same Access Control matrix
CREATE POLICY "Allow authorized roles to insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.uid() = id
  OR 
  auth.uid() IN (
    SELECT id FROM public.profiles 
    WHERE role_id IN (
      SELECT id FROM public.roles 
      WHERE role_name IN ('IT Admin', 'HR', 'CFO')
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE target_type = 'user'
      AND target_id = auth.uid()::text
      AND (permissions->>'edit_staff')::boolean = true
  )
  OR
  EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE target_type = 'department'
      AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid())
      AND (permissions->>'edit_staff')::boolean = true
  )
);
