-- Drop the old policy if it exists
DROP POLICY IF EXISTS "Users can view their own attendance" ON public.attendance;

-- Create the updated policy supporting both roles and Access Control Matrix overrides
CREATE POLICY "Users can view their own attendance"
  ON public.attendance FOR SELECT
  USING (
    -- 1. Users can view their own records
    auth.uid() = user_id
    OR 
    -- 2. Users with explicit HR/CFO/IT Admin roles
    auth.uid() IN (
      SELECT id FROM public.profiles 
      WHERE role_id IN (
        SELECT id FROM public.roles 
        WHERE role_name IN ('HR', 'CFO', 'IT Admin')
      )
    )
    OR
    -- 3. Users with explicit user-level override in Access Control
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'user'
        AND target_id = auth.uid()::text
        AND (permissions->>'view_attendance')::boolean = true
    )
    OR
    -- 4. Users with department-level override in Access Control
    EXISTS (
      SELECT 1 FROM public.access_permissions
      WHERE target_type = 'department'
        AND target_id = (SELECT department FROM public.profiles WHERE id = auth.uid())
        AND (permissions->>'view_attendance')::boolean = true
    )
  );
