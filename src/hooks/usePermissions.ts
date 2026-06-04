import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Permissions {
  view_clients: boolean;
  edit_clients: boolean;
  view_staff: boolean;
  edit_staff: boolean;
  view_attendance: boolean;
  view_snapshot: boolean;
  manage_access_control: boolean;
}

export function usePermissions(profile: any) {
  const [permissions, setPermissions] = useState<Permissions>({
    view_clients: false,
    edit_clients: false,
    view_staff: false,
    edit_staff: false,
    view_attendance: false,
    view_snapshot: false,
    manage_access_control: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        const { data, error } = await supabase
          .from('access_permissions')
          .select('*')
          .in('target_id', [profile.id, profile.department]);

        if (error) {
          // If table doesn't exist yet, we just swallow and use defaults
          console.warn('access_permissions table query failed', error);
        }

        // Hardcoded defaults to fallback on
        const defaultHasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Head of Department'].includes(profile.role);
        const defaultHasViewAccess = ['Intern', 'Contract Worker', 'Part-Time Worker'].includes(profile.role);

        let finalPerms: Permissions = {
          view_clients: defaultHasFullAccess || defaultHasViewAccess,
          edit_clients: defaultHasFullAccess,
          view_staff: defaultHasFullAccess,
          edit_staff: defaultHasFullAccess,
          view_attendance: defaultHasFullAccess,
          view_snapshot: defaultHasFullAccess,
          manage_access_control: false,
        };

        if (data && data.length > 0) {
          const deptPerms = data.find(p => p.target_type === 'department')?.permissions || {};
          const userPerms = data.find(p => p.target_type === 'user')?.permissions || {};
          
          finalPerms = {
            view_clients: userPerms.view_clients ?? deptPerms.view_clients ?? finalPerms.view_clients,
            edit_clients: userPerms.edit_clients ?? deptPerms.edit_clients ?? finalPerms.edit_clients,
            view_staff: userPerms.view_staff ?? deptPerms.view_staff ?? finalPerms.view_staff,
            edit_staff: userPerms.edit_staff ?? deptPerms.edit_staff ?? finalPerms.edit_staff,
            view_attendance: userPerms.view_attendance ?? deptPerms.view_attendance ?? finalPerms.view_attendance,
            view_snapshot: userPerms.view_snapshot ?? deptPerms.view_snapshot ?? finalPerms.view_snapshot,
            manage_access_control: userPerms.manage_access_control ?? deptPerms.manage_access_control ?? finalPerms.manage_access_control,
          };
        }
        
        // Safety lock: IT Admin ALWAYS has full access
        if (profile.role === 'IT Admin') {
          finalPerms = {
            view_clients: true,
            edit_clients: true,
            view_staff: true,
            edit_staff: true,
            view_attendance: true,
            view_snapshot: true,
            manage_access_control: true,
          };
        }

        setPermissions(finalPerms);
      } catch (err) {
        console.error('Error fetching permissions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [profile]);

  return { permissions, loading };
}
