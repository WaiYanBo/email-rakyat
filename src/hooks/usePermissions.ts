import { useState, useEffect } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';

export interface Permissions {
  view_clients: boolean;
  edit_clients: boolean;
  view_lod: boolean;
  manage_lod: boolean;
  view_potential_clients: boolean;
  manage_potential_clients: boolean;
  view_appointments: boolean;
  manage_appointments: boolean;
  export_data: boolean;
  view_staff: boolean;
  edit_staff: boolean;
  view_attendance: boolean;
  edit_attendance: boolean;
  view_snapshot: boolean;
  manage_access_control: boolean;
  manage_drive: boolean;
  manage_hr: boolean;
  view_claims: boolean;
  manage_claims: boolean;
  view_leave: boolean;
  manage_leave: boolean;
}

const IT_ADMIN_PERMISSIONS: Permissions = {
  view_clients: true,
  edit_clients: true,
  view_lod: true,
  manage_lod: true,
  view_potential_clients: true,
  manage_potential_clients: true,
  view_appointments: true,
  manage_appointments: true,
  export_data: true,
  view_staff: true,
  edit_staff: true,
  view_attendance: true,
  edit_attendance: true,
  view_snapshot: true,
  manage_access_control: true,
  manage_drive: true,
  manage_hr: true,
  view_claims: true,
  manage_claims: true,
  view_leave: true,
  manage_leave: true,
};

const DEFAULT_STAFF_PERMISSIONS: Permissions = {
  view_clients: false,
  edit_clients: false,
  view_lod: false,
  manage_lod: false,
  view_potential_clients: false,
  manage_potential_clients: false,
  view_appointments: true,
  manage_appointments: false,
  export_data: false,
  view_staff: false,
  edit_staff: false,
  view_attendance: false,
  edit_attendance: false,
  view_snapshot: false,
  manage_access_control: false,
  manage_drive: true,
  manage_hr: false,
  view_claims: true,
  manage_claims: false,
  view_leave: true,
  manage_leave: false,
};

// In-memory permissions cache to avoid redundant database calls during component mounts/tab switching
const permissionsCache: Record<string, Permissions> = {};

export function usePermissions(initialProfile?: any) {
  const [profile, setProfile] = useState<any>(initialProfile || null);
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_STAFF_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchPermissions = async () => {
      try {
        let currentProf = initialProfile;
        let userId = currentProf?.id;

        if (!userId) {
          const session = await getCurrentSession();
          if (session?.user?.id) {
            userId = session.user.id;
          }
        }

        if (!userId) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch full profile info if missing
        if (!currentProf || !currentProf.department) {
          const { data: profData } = await supabase
            .from('profiles')
            .select(`id, full_name, email, department, status, role, roles(role_name), role_id`)
            .eq('id', userId)
            .single();

          if (profData) {
            currentProf = profData;
            if (isMounted) setProfile(profData);
          }
        }

        const roleName = currentProf?.role || currentProf?.roles?.role_name || '';
        const deptName = currentProf?.department ? currentProf.department.trim() : '';
        const fullName = currentProf?.full_name ? currentProf.full_name.trim() : '';

        const isITAdmin = 
          roleName.toLowerCase() === 'it' || 
          roleName.toLowerCase() === 'it admin' || 
          deptName.toLowerCase() === 'it';

        if (isITAdmin) {
          if (isMounted) {
            setPermissions(IT_ADMIN_PERMISSIONS);
            setLoading(false);
          }
          return;
        }

        // Fetch permissions for this specific user (by ID or Full Name) and their department
        const targetIds = Array.from(new Set([userId, fullName, deptName].filter(Boolean)));
        const { data, error } = await supabase
          .from('access_permissions')
          .select('*')
          .in('target_id', targetIds);

        if (error) {
          console.warn('access_permissions table query failed', error);
        }

        let finalPerms: Permissions = { ...DEFAULT_STAFF_PERMISSIONS };

        if (data && data.length > 0) {
          const deptPerms = data.find(p => p.target_type === 'department' && p.target_id === deptName)?.permissions || {};
          const userPerms = data.find(p => p.target_type === 'user' && (p.target_id === userId || p.target_id === fullName))?.permissions || {};

          // User-specific settings take top precedence, followed by Department template, followed by secure defaults
          const viewPot = userPerms.view_potential_clients ?? deptPerms.view_potential_clients ?? (userPerms.manage_potential_clients || deptPerms.manage_potential_clients ? true : (userPerms.view_clients ?? deptPerms.view_clients ?? DEFAULT_STAFF_PERMISSIONS.view_potential_clients));
          const managePot = userPerms.manage_potential_clients ?? deptPerms.manage_potential_clients ?? userPerms.edit_clients ?? deptPerms.edit_clients ?? DEFAULT_STAFF_PERMISSIONS.manage_potential_clients;

          const viewLod = userPerms.view_lod ?? deptPerms.view_lod ?? (userPerms.manage_lod || deptPerms.manage_lod ? true : (userPerms.view_clients ?? deptPerms.view_clients ?? DEFAULT_STAFF_PERMISSIONS.view_lod));
          const manageLod = userPerms.manage_lod ?? deptPerms.manage_lod ?? userPerms.edit_clients ?? deptPerms.edit_clients ?? DEFAULT_STAFF_PERMISSIONS.manage_lod;

          const viewCli = userPerms.view_clients ?? deptPerms.view_clients ?? (userPerms.edit_clients || deptPerms.edit_clients ? true : DEFAULT_STAFF_PERMISSIONS.view_clients);
          const editCli = userPerms.edit_clients ?? deptPerms.edit_clients ?? DEFAULT_STAFF_PERMISSIONS.edit_clients;

          finalPerms = {
            view_clients: Boolean(viewCli || editCli),
            edit_clients: Boolean(editCli),
            view_lod: Boolean(viewLod || manageLod),
            manage_lod: Boolean(manageLod),
            view_potential_clients: Boolean(viewPot || managePot),
            manage_potential_clients: Boolean(managePot),
            view_appointments: Boolean((userPerms.view_appointments ?? deptPerms.view_appointments ?? (userPerms.manage_appointments || deptPerms.manage_appointments ? true : DEFAULT_STAFF_PERMISSIONS.view_appointments)) || (userPerms.manage_appointments ?? deptPerms.manage_appointments)),
            manage_appointments: Boolean(userPerms.manage_appointments ?? deptPerms.manage_appointments ?? DEFAULT_STAFF_PERMISSIONS.manage_appointments),
            export_data: Boolean(userPerms.export_data ?? deptPerms.export_data ?? DEFAULT_STAFF_PERMISSIONS.export_data),
            view_staff: Boolean((userPerms.view_staff ?? deptPerms.view_staff ?? (userPerms.edit_staff || deptPerms.edit_staff ? true : DEFAULT_STAFF_PERMISSIONS.view_staff)) || (userPerms.edit_staff ?? deptPerms.edit_staff)),
            edit_staff: Boolean(userPerms.edit_staff ?? deptPerms.edit_staff ?? DEFAULT_STAFF_PERMISSIONS.edit_staff),
            view_attendance: Boolean((userPerms.view_attendance ?? deptPerms.view_attendance ?? (userPerms.edit_attendance || deptPerms.edit_attendance ? true : DEFAULT_STAFF_PERMISSIONS.view_attendance)) || (userPerms.edit_attendance ?? deptPerms.edit_attendance)),
            edit_attendance: Boolean(userPerms.edit_attendance ?? deptPerms.edit_attendance ?? DEFAULT_STAFF_PERMISSIONS.edit_attendance),
            view_snapshot: Boolean(userPerms.view_snapshot ?? deptPerms.view_snapshot ?? DEFAULT_STAFF_PERMISSIONS.view_snapshot),
            manage_access_control: Boolean(userPerms.manage_access_control ?? deptPerms.manage_access_control ?? DEFAULT_STAFF_PERMISSIONS.manage_access_control),
            manage_drive: Boolean(userPerms.manage_drive ?? deptPerms.manage_drive ?? DEFAULT_STAFF_PERMISSIONS.manage_drive),
            manage_hr: Boolean(userPerms.manage_hr ?? deptPerms.manage_hr ?? DEFAULT_STAFF_PERMISSIONS.manage_hr),
            view_claims: Boolean((userPerms.view_claims ?? deptPerms.view_claims ?? (userPerms.manage_claims || deptPerms.manage_claims ? true : DEFAULT_STAFF_PERMISSIONS.view_claims)) || (userPerms.manage_claims ?? deptPerms.manage_claims)),
            manage_claims: Boolean(userPerms.manage_claims ?? deptPerms.manage_claims ?? DEFAULT_STAFF_PERMISSIONS.manage_claims),
            view_leave: Boolean((userPerms.view_leave ?? deptPerms.view_leave ?? (userPerms.manage_leave || deptPerms.manage_leave ? true : DEFAULT_STAFF_PERMISSIONS.view_leave)) || (userPerms.manage_leave ?? deptPerms.manage_leave)),
            manage_leave: Boolean(userPerms.manage_leave ?? deptPerms.manage_leave ?? DEFAULT_STAFF_PERMISSIONS.manage_leave),
          };
        }

        if (isMounted) {
          setPermissions(finalPerms);
        }
      } catch (err) {
        console.error('Error fetching permissions:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPermissions();

    const handlePermissionsUpdated = () => {
      fetchPermissions();
    };

    window.addEventListener('permissionsUpdated', handlePermissionsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('permissionsUpdated', handlePermissionsUpdated);
    };
  }, [initialProfile]);

  const isITAdmin = 
    profile?.role?.toLowerCase() === 'it' || 
    profile?.role?.toLowerCase() === 'it admin' || 
    profile?.department?.toLowerCase() === 'it' ||
    profile?.roles?.role_name?.toLowerCase() === 'it admin' ||
    profile?.roles?.role_name?.toLowerCase() === 'it';

  const finalPermissions = isITAdmin ? IT_ADMIN_PERMISSIONS : permissions;

  return { permissions: finalPermissions, profile, isITAdmin, loading };
}

export function clearPermissionsCache(userId?: string) {
  if (userId) {
    delete permissionsCache[userId];
  } else {
    for (const key in permissionsCache) {
      delete permissionsCache[key];
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('permissionsUpdated'));
  }
}

