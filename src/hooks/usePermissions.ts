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
  manage_drive: boolean;
}

// In-memory permissions cache to avoid redundant database calls during component mounts/tab switching
const permissionsCache: Record<string, Permissions> = {};

export function usePermissions(profile: any) {
  const [permissions, setPermissions] = useState<Permissions>({
    view_clients: false,
    edit_clients: false,
    view_staff: false,
    edit_staff: false,
    view_attendance: false,
    view_snapshot: false,
    manage_access_control: false,
    manage_drive: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

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

        if (!userId) {
          if (isMounted) setLoading(false);
          return;
        }

        // 1. Check in-memory cache
        if (permissionsCache[userId]) {
          if (isMounted) {
            setPermissions(permissionsCache[userId]);
            setLoading(false);
          }
          return;
        }

        // 2. Check sessionStorage cache
        try {
          const cached = sessionStorage.getItem(`portal_perms_${userId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            permissionsCache[userId] = parsed;
            if (isMounted) {
              setPermissions(parsed);
              setLoading(false);
            }
            return;
          }
        } catch (e) {
          // ignore
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
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('access_permissions')
          .select('*')
          .in('target_id', [userId, department].filter(Boolean));

        if (error) {
          console.warn('access_permissions table query failed', error);
        }

        let finalPerms: Permissions = {
          view_clients: false,
          edit_clients: false,
          view_staff: false,
          edit_staff: false,
          view_attendance: false,
          view_snapshot: false,
          manage_access_control: false,
          manage_drive: false,
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
            manage_drive: userPerms.manage_drive ?? deptPerms.manage_drive ?? finalPerms.manage_drive,
          };
        }

        const isITAdmin = 
          role?.toLowerCase() === 'it' || 
          role?.toLowerCase() === 'it admin' || 
          department?.toLowerCase() === 'it';

        if (isITAdmin) {
          finalPerms = {
            view_clients: true,
            edit_clients: true,
            view_staff: true,
            edit_staff: true,
            view_attendance: true,
            view_snapshot: true,
            manage_access_control: true,
            manage_drive: true,
          };
        }

        if (isMounted) {
          setPermissions(finalPerms);
        }

        if (userId) {
          permissionsCache[userId] = finalPerms;
          try {
            sessionStorage.setItem(`portal_perms_${userId}`, JSON.stringify(finalPerms));
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPermissions();

    return () => {
      isMounted = false;
    };
  }, [profile]);

  const isITAdmin = 
    profile?.role?.toLowerCase() === 'it' || 
    profile?.role?.toLowerCase() === 'it admin' || 
    profile?.department?.toLowerCase() === 'it' ||
    profile?.roles?.role_name?.toLowerCase() === 'it admin' ||
    profile?.roles?.role_name?.toLowerCase() === 'it';

  const finalPermissions = isITAdmin ? {
    view_clients: true,
    edit_clients: true,
    view_staff: true,
    edit_staff: true,
    view_attendance: true,
    view_snapshot: true,
    manage_access_control: true,
    manage_drive: true,
  } : permissions;

  return { permissions: finalPermissions, loading };
}
