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
    const fetchPermissions = async () => {
      try {
        let userId = profile?.id;
        let department = profile?.department;
        let role = profile?.role || profile?.role_name;

        if (!userId) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            userId = session.user.id;
          }
        }

        if (userId) {
          const cacheKey = `portal_perms_${userId}`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              setPermissions(parsed);
              setLoading(false);
              return;
            } catch (e) {
              // ignore
            }
          }
        }

        if (userId && (!department || !role)) {
          const { data: profData } = await supabase
            .from('profiles')
            .select(`department, roles(role_name), role_id`)
            .eq('id', userId)
            .single();

          if (profData) {
            department = department || profData.department;
            if (!role) {
              if (profData.roles) {
                if (Array.isArray(profData.roles)) {
                  role = profData.roles[0]?.role_name || 'No Role';
                } else {
                  role = profData.roles?.role_name || 'No Role';
                }
              } else if (profData.role_id) {
                const { data: roleData } = await supabase
                  .from('roles')
                  .select('role_name')
                  .eq('id', profData.role_id)
                  .single();
                if (roleData) {
                  role = roleData.role_name;
                }
              }
            }
          }
        }

        if (!userId && !role) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('access_permissions')
          .select('*')
          .in('target_id', [userId, department].filter(Boolean));

        if (error) {
          console.warn('access_permissions table query failed', error);
        }

        const defaultHasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Head of Department'].includes(role || '');
        const defaultHasViewAccess = ['Intern', 'Contract Worker', 'Part-Time Worker'].includes(role || '');

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
        
        if (role === 'IT Admin') {
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
        if (userId) {
          try {
            sessionStorage.setItem(`portal_perms_${userId}`, JSON.stringify(finalPerms));
          } catch (e) {
            // ignore
          }
        }
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
