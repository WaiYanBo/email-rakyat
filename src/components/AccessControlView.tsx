import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { clearPermissionsCache } from '../hooks/usePermissions';

export interface PermissionEntry {
  id?: string;
  target_type: 'department' | 'user';
  target_id: string; // Department name or User ID
  permissions: {
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
  };
}

const DEFAULT_DEPT_PERMISSIONS: PermissionEntry['permissions'] = {
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

type PermissionKey = keyof PermissionEntry['permissions'];

interface PermissionCategory {
  id: string;
  titleEn: string;
  titleBm: string;
  features: PermissionKey[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'clients',
    titleEn: 'Clients, Cases & Appointments',
    titleBm: 'Klien, Kes & Temujanji',
    features: ['view_clients', 'edit_clients', 'view_lod', 'manage_lod', 'view_potential_clients', 'manage_potential_clients', 'view_appointments', 'manage_appointments', 'export_data'],
  },
  {
    id: 'hr_staff',
    titleEn: 'Human Resources & Staff Management',
    titleBm: 'Sumber Manusia & Pengurusan Staf',
    features: ['view_staff', 'edit_staff', 'manage_hr'],
  },
  {
    id: 'attendance',
    titleEn: 'Attendance & Time Logs',
    titleBm: 'Kehadiran & Log Masa',
    features: ['view_attendance', 'edit_attendance'],
  },
  {
    id: 'leave_claims',
    titleEn: 'Leave & Expense Claims',
    titleBm: 'Cuti & Tuntutan Perbelanjaan',
    features: ['view_leave', 'manage_leave', 'view_claims', 'manage_claims'],
  },
  {
    id: 'system_drive',
    titleEn: 'Storage, Analytics & Administration',
    titleBm: 'Storan, Analitik & Pentadbiran',
    features: ['manage_drive', 'view_snapshot', 'manage_access_control'],
  },
];

const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${checked ? 'bg-indigo-600 dark:bg-yellow-500' : 'bg-slate-300 dark:bg-gray-700'}`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'
        }`}
    />
  </button>
);

export default function AccessControlView({ isITAdmin = false }: { isITAdmin?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const { lang } = usePortalLanguage();
  const isBm = lang === 'bm';

  const [departments, setDepartments] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, PermissionEntry>>({});
  const [initialMatrix, setInitialMatrix] = useState<Record<string, PermissionEntry>>({});

  // Filter & Navigation state
  const [filterType, setFilterType] = useState<'staff' | 'department' | 'feature'>('staff');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<PermissionKey>('view_clients');

  // Search queries
  const [staffSearch, setStaffSearch] = useState('');
  const [deptFilterPill, setDeptFilterPill] = useState<string>('all');
  const [deptSearch, setDeptSearch] = useState('');
  const [featureSearch, setFeatureSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, email, department, status, avatar_url, roles(role_name)')
        .order('full_name');

      if (profError) throw profError;

      const EXCLUDED_DEPT_KEYWORDS = [
        'part time', 'part-time', 'contract', 'contract worker', 'intern', 'intern hr',
        'top management', 'tm', 'executive'
      ];

      const activeProfiles = (profiles || []).filter(
        p => p.status !== 'Resigned' && p.status !== 'Terminated' && p.status !== 'Inactive'
      );

      const depts = Array.from(new Set(activeProfiles.map(p => p.department).filter(Boolean)))
        .filter(d => !EXCLUDED_DEPT_KEYWORDS.includes(d.trim().toLowerCase())) as string[];

      setDepartments(depts);
      setUsers(activeProfiles);

      const { data: perms, error: permError } = await supabase
        .from('access_permissions')
        .select('*');

      if (permError) throw permError;

      const matrix: Record<string, PermissionEntry> = {};

      // Seed Department Defaults
      depts.forEach(dept => {
        matrix[`dept_${dept}`] = {
          target_type: 'department',
          target_id: dept,
          permissions: { ...DEFAULT_DEPT_PERMISSIONS }
        };
      });

      // Seed User Entries (null defaults to inherit)
      activeProfiles.forEach(user => {
        matrix[`user_${user.id}`] = {
          target_type: 'user',
          target_id: user.id,
          permissions: {
            view_clients: null as any,
            edit_clients: null as any,
            view_lod: null as any,
            manage_lod: null as any,
            view_potential_clients: null as any,
            manage_potential_clients: null as any,
            view_appointments: null as any,
            manage_appointments: null as any,
            export_data: null as any,
            view_staff: null as any,
            edit_staff: null as any,
            view_attendance: null as any,
            edit_attendance: null as any,
            view_snapshot: null as any,
            manage_access_control: null as any,
            manage_drive: null as any,
            manage_hr: null as any,
            view_claims: null as any,
            manage_claims: null as any,
            view_leave: null as any,
            manage_leave: null as any,
          }
        };
      });

      // Overlay database permissions
      perms?.forEach(p => {
        const key = p.target_type === 'department' ? `dept_${p.target_id}` : `user_${p.target_id}`;
        if (matrix[key]) {
          matrix[key] = {
            id: p.id,
            target_type: p.target_type,
            target_id: p.target_id,
            permissions: { ...matrix[key]?.permissions, ...p.permissions }
          };
        } else if (p.target_type === 'department' || p.target_type === 'user') {
          matrix[key] = {
            id: p.id,
            target_type: p.target_type,
            target_id: p.target_id,
            permissions: { ...p.permissions }
          };
        }
      });

      setPermissionsMatrix(JSON.parse(JSON.stringify(matrix)));
      setInitialMatrix(JSON.parse(JSON.stringify(matrix)));

      if (activeProfiles.length > 0 && !selectedStaffId) {
        setSelectedStaffId(activeProfiles[0].id);
      }
      if (depts.length > 0 && !selectedDept) {
        setSelectedDept(depts[0]);
      }
    } catch (err) {
      console.error('Error fetching access control data', err);
      showToast(t('accessControl', 'saveFailed', lang), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper: check effective permission for a user (user override or fallback to dept)
  const getEffectivePermission = (userId: string, module: PermissionKey): boolean => {
    const userKey = `user_${userId}`;
    const userVal = permissionsMatrix[userKey]?.permissions?.[module];
    if (userVal === true || userVal === false) {
      if (userVal === true) return true;
    }

    const userObj = users.find(u => u.id === userId);
    let deptVal: boolean | null = null;
    if (userObj?.department) {
      const deptKey = `dept_${userObj.department}`;
      const dVal = permissionsMatrix[deptKey]?.permissions?.[module];
      if (dVal === true || dVal === false) {
        deptVal = dVal;
      }
    }

    const effective = userVal !== null && userVal !== undefined ? userVal : (deptVal !== null ? deptVal : (DEFAULT_DEPT_PERMISSIONS[module] ?? false));
    if (effective) return true;

    // If checking a view permission, also check if user has the corresponding manage permission
    if (module === 'view_potential_clients' && getEffectivePermission(userId, 'manage_potential_clients')) return true;
    if (module === 'view_lod' && getEffectivePermission(userId, 'manage_lod')) return true;
    if (module === 'view_clients' && getEffectivePermission(userId, 'edit_clients')) return true;
    if (module === 'view_staff' && getEffectivePermission(userId, 'edit_staff')) return true;
    if (module === 'view_attendance' && getEffectivePermission(userId, 'edit_attendance')) return true;
    if (module === 'view_claims' && getEffectivePermission(userId, 'manage_claims')) return true;
    if (module === 'view_leave' && getEffectivePermission(userId, 'manage_leave')) return true;
    if (module === 'view_appointments' && getEffectivePermission(userId, 'manage_appointments')) return true;

    return false;
  };

  // Helper: check if a user permission is an override vs department default
  const isUserOverride = (userId: string, module: PermissionKey): boolean => {
    const userKey = `user_${userId}`;
    const userVal = permissionsMatrix[userKey]?.permissions?.[module];
    return userVal === true || userVal === false;
  };

  // Toggle single permission
  const togglePermission = (key: string, module: PermissionKey) => {
    setPermissionsMatrix(prev => {
      const entry = prev[key];
      if (!entry) return prev;

      let nextVal: boolean;
      if (key.startsWith('user_')) {
        const userId = key.replace('user_', '');
        const currentEffective = getEffectivePermission(userId, module);
        nextVal = !currentEffective;
      } else {
        const current = entry.permissions[module];
        nextVal = current === true ? false : true;
      }

      const updatedPermissions = {
        ...entry.permissions,
        [module]: nextVal
      };

      // Automatic cascading for paired view/manage permissions
      if (nextVal === true) {
        if (module === 'manage_potential_clients') updatedPermissions.view_potential_clients = true;
        if (module === 'manage_lod') updatedPermissions.view_lod = true;
        if (module === 'edit_clients') updatedPermissions.view_clients = true;
        if (module === 'edit_staff') updatedPermissions.view_staff = true;
        if (module === 'edit_attendance') updatedPermissions.view_attendance = true;
        if (module === 'manage_claims') updatedPermissions.view_claims = true;
        if (module === 'manage_leave') updatedPermissions.view_leave = true;
        if (module === 'manage_appointments') updatedPermissions.view_appointments = true;
      } else {
        if (module === 'view_potential_clients') updatedPermissions.manage_potential_clients = false;
        if (module === 'view_lod') updatedPermissions.manage_lod = false;
        if (module === 'view_clients') updatedPermissions.edit_clients = false;
        if (module === 'view_staff') updatedPermissions.edit_staff = false;
        if (module === 'view_attendance') updatedPermissions.edit_attendance = false;
        if (module === 'view_claims') updatedPermissions.manage_claims = false;
        if (module === 'view_leave') updatedPermissions.manage_leave = false;
        if (module === 'view_appointments') updatedPermissions.manage_appointments = false;
      }

      const newMatrix = {
        ...prev,
        [key]: {
          ...entry,
          permissions: updatedPermissions
        }
      };

      return newMatrix;
    });
  };

  // Quick Privilege Presets definition
  const applyPreset = (targetKey: string, presetType: 'full' | 'manager' | 'hr' | 'staff' | 'readonly' | 'revoke') => {
    let presetPerms: Partial<PermissionEntry['permissions']> = {};

    switch (presetType) {
      case 'full':
        presetPerms = {
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
          manage_access_control: isITAdmin,
          manage_drive: true,
          manage_hr: true,
          view_claims: true,
          manage_claims: true,
          view_leave: true,
          manage_leave: true,
        };
        break;
      case 'manager':
        presetPerms = {
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
          edit_staff: false,
          view_attendance: true,
          edit_attendance: false,
          view_snapshot: true,
          manage_access_control: false,
          manage_drive: true,
          manage_hr: false,
          view_claims: true,
          manage_claims: true,
          view_leave: true,
          manage_leave: true,
        };
        break;
      case 'hr':
        presetPerms = {
          view_clients: false,
          edit_clients: false,
          view_lod: false,
          manage_lod: false,
          view_potential_clients: false,
          manage_potential_clients: false,
          view_appointments: true,
          manage_appointments: false,
          export_data: true,
          view_staff: true,
          edit_staff: true,
          view_attendance: true,
          edit_attendance: true,
          view_snapshot: false,
          manage_access_control: false,
          manage_drive: true,
          manage_hr: true,
          view_claims: true,
          manage_claims: true,
          view_leave: true,
          manage_leave: true,
        };
        break;
      case 'staff':
        presetPerms = {
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
        break;
      case 'readonly':
        presetPerms = {
          view_clients: true,
          edit_clients: false,
          view_lod: true,
          manage_lod: false,
          view_potential_clients: true,
          manage_potential_clients: false,
          view_appointments: true,
          manage_appointments: false,
          export_data: false,
          view_staff: true,
          edit_staff: false,
          view_attendance: true,
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
        break;
      case 'revoke':
        presetPerms = {
          view_clients: false,
          edit_clients: false,
          view_lod: false,
          manage_lod: false,
          view_potential_clients: false,
          manage_potential_clients: false,
          view_appointments: false,
          manage_appointments: false,
          export_data: false,
          view_staff: false,
          edit_staff: false,
          view_attendance: false,
          edit_attendance: false,
          view_snapshot: false,
          manage_access_control: false,
          manage_drive: false,
          manage_hr: false,
          view_claims: false,
          manage_claims: false,
          view_leave: false,
          manage_leave: false,
        };
        break;
    }

    setPermissionsMatrix(prev => {
      const entry = prev[targetKey];
      if (!entry) return prev;

      return {
        ...prev,
        [targetKey]: {
          ...entry,
          permissions: {
            ...entry.permissions,
            ...presetPerms,
          }
        }
      };
    });

    showToast(isBm ? 'Pratetap keistimewaan dikemaskini.' : 'Privilege preset applied.');
  };

  // Reset user to department default
  const resetUserToDeptDefault = (userId: string) => {
    const userKey = `user_${userId}`;
    setPermissionsMatrix(prev => {
      const entry = prev[userKey];
      if (!entry) return prev;

      const clearedPerms: any = {};
      Object.keys(DEFAULT_DEPT_PERMISSIONS).forEach(k => {
        clearedPerms[k] = null;
      });

      return {
        ...prev,
        [userKey]: {
          ...entry,
          permissions: clearedPerms
        }
      };
    });

    showToast(isBm ? 'Kebenaran staf diset semula ke lalai jabatan.' : 'Staff permissions reset to department default.');
  };

  // Synchronize all staff in department to match department template
  const syncAllStaffInDept = (deptName: string) => {
    const deptUsers = users.filter(u => u.department === deptName);
    const deptKey = `dept_${deptName}`;
    const deptPerms = permissionsMatrix[deptKey]?.permissions || DEFAULT_DEPT_PERMISSIONS;

    setPermissionsMatrix(prev => {
      const updated = { ...prev };
      deptUsers.forEach(u => {
        const uKey = `user_${u.id}`;
        if (updated[uKey]) {
          updated[uKey] = {
            ...updated[uKey],
            permissions: { ...deptPerms }
          };
        }
      });
      return updated;
    });

    showToast(
      isBm
        ? `Semua ${deptUsers.length} staf dalam ${deptName} diselaraskan ke templat jabatan.`
        : `All ${deptUsers.length} staff in ${deptName} synced to department template.`
    );
  };

  // Compute number of unsaved changes
  const unsavedCount = useMemo(() => {
    let diffs = 0;
    Object.keys(permissionsMatrix).forEach(key => {
      const current = permissionsMatrix[key]?.permissions || {};
      const initial = initialMatrix[key]?.permissions || {};
      Object.keys(DEFAULT_DEPT_PERMISSIONS).forEach(module => {
        if (current[module as PermissionKey] !== initial[module as PermissionKey]) {
          diffs++;
        }
      });
    });
    return diffs;
  }, [permissionsMatrix, initialMatrix]);

  // Discard changes
  const handleDiscard = () => {
    setPermissionsMatrix(JSON.parse(JSON.stringify(initialMatrix)));
    showToast(isBm ? 'Semua perubahan telah dibatalkan.' : 'Changes discarded.');
  };

  // Save changes to Supabase
  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = Object.values(permissionsMatrix).filter(entry => {
        return entry.id || Object.values(entry.permissions).some(v => v === true || v === false);
      });

      for (const entry of upserts) {
        let recordId = entry.id;

        // If ID not set in matrix, check database to prevent duplicate key violations
        if (!recordId) {
          const { data: existing } = await supabase
            .from('access_permissions')
            .select('id')
            .eq('target_type', entry.target_type)
            .eq('target_id', entry.target_id)
            .maybeSingle();

          if (existing?.id) {
            recordId = existing.id;
            entry.id = existing.id;
          }
        }

        if (recordId) {
          const { error: updateErr } = await supabase
            .from('access_permissions')
            .update({
              permissions: entry.permissions,
              updated_at: new Date().toISOString()
            })
            .eq('id', recordId);

          if (updateErr) throw updateErr;
        } else {
          const { data: newRecord, error: insertErr } = await supabase
            .from('access_permissions')
            .insert({
              target_type: entry.target_type,
              target_id: entry.target_id,
              permissions: entry.permissions
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          if (newRecord?.id) {
            entry.id = newRecord.id;
          }
        }
      }

      // Clear in-memory permissions cache for real-time reactivity
      clearPermissionsCache();

      setInitialMatrix(JSON.parse(JSON.stringify(permissionsMatrix)));
      showToast(t('accessControl', 'savedSuccess', lang), 'success');
    } catch (err) {
      console.error('Save failed', err);
      showToast(t('accessControl', 'saveFailed', lang), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Translation helpers
  const getFeatureLabel = (f: PermissionKey) => {
    switch (f) {
      case 'view_clients': return t('accessControl', 'colViewClients', lang);
      case 'edit_clients': return t('accessControl', 'colEditClients', lang);
      case 'view_lod': return t('accessControl', 'colViewLoD', lang);
      case 'manage_lod': return t('accessControl', 'colManageLoD', lang);
      case 'view_potential_clients': return t('accessControl', 'colViewPotentialClients', lang);
      case 'manage_potential_clients': return t('accessControl', 'colManagePotentialClients', lang);
      case 'view_appointments': return t('accessControl', 'colViewAppointments', lang);
      case 'manage_appointments': return t('accessControl', 'colManageAppointments', lang);
      case 'export_data': return t('accessControl', 'colExportData', lang);
      case 'view_staff': return t('accessControl', 'colViewStaff', lang);
      case 'edit_staff': return t('accessControl', 'colEditStaff', lang);
      case 'manage_hr': return t('accessControl', 'colHR', lang);
      case 'view_attendance': return t('accessControl', 'colAttendance', lang);
      case 'edit_attendance': return t('accessControl', 'colEditAttendance', lang);
      case 'view_claims': return t('accessControl', 'colClaims', lang);
      case 'manage_claims': return t('accessControl', 'colManageClaims', lang);
      case 'view_leave': return t('accessControl', 'colLeave', lang);
      case 'manage_leave': return t('accessControl', 'colManageLeave', lang);
      case 'manage_drive': return t('accessControl', 'colDrive', lang);
      case 'view_snapshot': return t('accessControl', 'colSnapshot', lang);
      case 'manage_access_control': return t('accessControl', 'colManageAccess', lang);
      default: return f;
    }
  };

  const getFeatureDesc = (f: PermissionKey) => {
    switch (f) {
      case 'view_clients': return t('accessControl', 'colViewClientsDesc', lang);
      case 'edit_clients': return t('accessControl', 'colEditClientsDesc', lang);
      case 'view_lod': return t('accessControl', 'colViewLoDDesc', lang);
      case 'manage_lod': return t('accessControl', 'colManageLoDDesc', lang);
      case 'view_potential_clients': return t('accessControl', 'colViewPotentialClientsDesc', lang);
      case 'manage_potential_clients': return t('accessControl', 'colManagePotentialClientsDesc', lang);
      case 'view_appointments': return t('accessControl', 'colViewAppointmentsDesc', lang);
      case 'manage_appointments': return t('accessControl', 'colManageAppointmentsDesc', lang);
      case 'export_data': return t('accessControl', 'colExportDataDesc', lang);
      case 'view_staff': return t('accessControl', 'colViewStaffDesc', lang);
      case 'edit_staff': return t('accessControl', 'colEditStaffDesc', lang);
      case 'manage_hr': return t('accessControl', 'colHRDesc', lang);
      case 'view_attendance': return t('accessControl', 'colAttendanceDesc', lang);
      case 'edit_attendance': return t('accessControl', 'colEditAttendanceDesc', lang);
      case 'view_claims': return t('accessControl', 'colClaimsDesc', lang);
      case 'manage_claims': return t('accessControl', 'colManageClaimsDesc', lang);
      case 'view_leave': return t('accessControl', 'colLeaveDesc', lang);
      case 'manage_leave': return t('accessControl', 'colManageLeaveDesc', lang);
      case 'manage_drive': return t('accessControl', 'colDriveDesc', lang);
      case 'view_snapshot': return t('accessControl', 'colSnapshotDesc', lang);
      case 'manage_access_control': return t('accessControl', 'colManageAccessDesc', lang);
      default: return f;
    }
  };

  // Filtered lists
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        u.full_name?.toLowerCase().includes(staffSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(staffSearch.toLowerCase()) ||
        u.department?.toLowerCase().includes(staffSearch.toLowerCase()) ||
        u.roles?.role_name?.toLowerCase().includes(staffSearch.toLowerCase());

      const matchDept = deptFilterPill === 'all' || u.department === deptFilterPill;
      return matchSearch && matchDept;
    });
  }, [users, staffSearch, deptFilterPill]);

  const filteredDepts = useMemo(() => {
    return departments.filter(d => d.toLowerCase().includes(deptSearch.toLowerCase()));
  }, [departments, deptSearch]);

  const allFilteredFeatures = useMemo(() => {
    const list: PermissionKey[] = [
      'view_clients', 'edit_clients', 'view_lod', 'manage_lod', 'view_potential_clients', 'manage_potential_clients', 'view_appointments', 'manage_appointments', 'export_data',
      'view_staff', 'edit_staff', 'manage_hr',
      'view_attendance', 'edit_attendance',
      'view_claims', 'manage_claims', 'view_leave', 'manage_leave',
      'manage_drive', 'view_snapshot',
      ...(isITAdmin ? ['manage_access_control' as PermissionKey] : [])
    ];

    if (!featureSearch.trim()) return list;

    return list.filter(f => {
      const label = getFeatureLabel(f).toLowerCase();
      const desc = getFeatureDesc(f).toLowerCase();
      const q = featureSearch.toLowerCase();
      return label.includes(q) || desc.includes(q) || f.toLowerCase().includes(q);
    });
  }, [featureSearch, isITAdmin, lang]);

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent dark:border-yellow-500 rounded-full animate-spin mx-auto"></div>
        <div className="text-sm font-semibold text-slate-500 dark:text-zinc-400 animate-pulse">
          {t('accessControl', 'loading', lang)}
        </div>
      </div>
    );
  }

  const selectedUserObj = users.find(u => u.id === selectedStaffId);

  return (
    <div className="space-y-6 animate-fade-in relative pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold animate-bounce-in ${toastMessage.type === 'success'
              ? 'bg-emerald-700 text-white border-emerald-600'
              : 'bg-rose-700 text-white border-rose-600'
            }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('accessControl', 'matrixTitle', lang)}
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            {t('accessControl', 'matrixSubtitle', lang)}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0 w-full md:w-auto justify-end">
          {unsavedCount > 0 && (
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="flex-1 md:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-xs"
            >
              {t('accessControl', 'discardBtn', lang)}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || unsavedCount === 0}
            className={`flex-1 md:flex-none px-4 sm:px-5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap ${unsavedCount > 0
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black shadow-md cursor-pointer'
                : 'bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed opacity-60'
              }`}
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>{t('accessControl', 'saving', lang)}</span>
              </>
            ) : (
              <span>
                {t('accessControl', 'saveBtn', lang)}
                {unsavedCount > 0 ? ` (${unsavedCount})` : ''}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm p-6 space-y-6">

        {/* Filter Mode Selector */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-zinc-800 pb-4">
          <button
            onClick={() => setFilterType('staff')}
            className={`px-4 py-2 rounded-xl font-semibold text-xs md:text-sm transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none cursor-pointer ${filterType === 'staff'
                ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
          >
            <span>{isBm ? 'Kakitangan Individu' : 'Individual Staff'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 dark:bg-black/20 font-bold">
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setFilterType('department')}
            className={`px-4 py-2 rounded-xl font-semibold text-xs md:text-sm transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none cursor-pointer ${filterType === 'department'
                ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
          >
            <span>{isBm ? 'Seluruh Jabatan' : 'Department Wide'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 dark:bg-black/20 font-bold">
              {departments.length}
            </span>
          </button>

          <button
            onClick={() => setFilterType('feature')}
            className={`px-4 py-2 rounded-xl font-semibold text-xs md:text-sm transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none cursor-pointer ${filterType === 'feature'
                ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
          >
            <span>{isBm ? 'Ciri-Ciri Portal' : 'Portal Features'}</span>
          </button>
        </div>

        {/* ─── TAB 1: INDIVIDUAL STAFF VIEW ───────────────────────────────── */}
        {filterType === 'staff' && (
          <div className="space-y-6">
            {/* Search & Department Filter Bar */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <input
                  type="text"
                  placeholder={t('accessControl', 'searchStaffPlaceholder', lang)}
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500"
                />
                <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Department filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-thin">
                <button
                  onClick={() => setDeptFilterPill('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all flex-shrink-0 ${deptFilterPill === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                    }`}
                >
                  {isBm ? 'Semua' : 'All'}
                </button>
                {departments.map(d => (
                  <button
                    key={d}
                    onClick={() => setDeptFilterPill(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all flex-shrink-0 ${deptFilterPill === d
                        ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-slate-950'
                        : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                      }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Staff Selector Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                {isBm ? 'Pilih Kakitangan' : 'Select Staff Member'} ({filteredUsers.length})
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full md:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 cursor-pointer"
              >
                {filteredUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} {u.department ? `(${u.department})` : ''} - {u.roles?.role_name || 'Staff'}
                  </option>
                ))}
              </select>
            </div>

            {selectedUserObj && (
              <div className="bg-slate-50 dark:bg-zinc-950/80 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-6">
                {/* Staff Dossier Header & Active Stats */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-5 border-b border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {selectedUserObj.avatar_url ? (
                        <img src={selectedUserObj.avatar_url} alt={selectedUserObj.full_name} className="w-full h-full rounded-xl object-cover" />
                      ) : (
                        selectedUserObj.full_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {selectedUserObj.full_name}
                        </h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-yellow-500/10 dark:text-yellow-400">
                          {selectedUserObj.roles?.role_name || 'Staff'}
                        </span>
                        {selectedUserObj.department && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {selectedUserObj.department}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 dark:text-zinc-400 mt-0.5 font-mono">
                        {selectedUserObj.email}
                      </p>
                    </div>
                  </div>

                  {/* Quick Action: Reset to Dept */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => resetUserToDeptDefault(selectedUserObj.id)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs"
                      title="Clear custom overrides and revert to department default"
                    >
                      {t('accessControl', 'resetToDept', lang)}
                    </button>
                  </div>
                </div>

                {/* Quick Presets Bar */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                    {t('accessControl', 'presetLabel', lang)}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'full')}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20 dark:text-yellow-400 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetFullAdmin', lang)}
                    </button>
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'manager')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetManager', lang)}
                    </button>
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'hr')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetHR', lang)}
                    </button>
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'staff')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetStaff', lang)}
                    </button>
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'readonly')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetReadOnly', lang)}
                    </button>
                    <button
                      onClick={() => applyPreset(`user_${selectedUserObj.id}`, 'revoke')}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t('accessControl', 'presetRevoke', lang)}
                    </button>
                  </div>
                </div>

                {/* Categorized Permissions Grid */}
                <div className="space-y-5">
                  {PERMISSION_CATEGORIES.map(category => {
                    const availableFeatures = category.features.filter(
                      f => f !== 'manage_access_control' || isITAdmin
                    );

                    return (
                      <div
                        key={category.id}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 shadow-xs space-y-3"
                      >
                        <div className="pb-2.5 border-b border-slate-100 dark:border-zinc-800">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            {isBm ? category.titleBm : category.titleEn}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                          {availableFeatures.map(feat => {
                            const isEffective = getEffectivePermission(selectedUserObj.id, feat);
                            const hasOverride = isUserOverride(selectedUserObj.id, feat);

                            return (
                              <div
                                key={feat}
                                className="flex items-start justify-between gap-4 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                              >
                                <div className="space-y-0.5 flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
                                      {getFeatureLabel(feat)}
                                    </span>
                                    {hasOverride ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                        {t('accessControl', 'customOverrideBadge', lang)}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                                        {t('accessControl', 'deptDefaultBadge', lang)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                                    {getFeatureDesc(feat)}
                                  </p>
                                </div>

                                <div className="pt-0.5 flex-shrink-0">
                                  <Toggle
                                    checked={isEffective}
                                    onChange={() => togglePermission(`user_${selectedUserObj.id}`, feat)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: DEPARTMENT WIDE VIEW ─────────────────────────────────── */}
        {filterType === 'department' && (
          <div className="space-y-6">
            {/* Department Search Bar */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 md:w-96">
                <input
                  type="text"
                  placeholder={t('accessControl', 'searchDeptPlaceholder', lang)}
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500"
                />
                <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                {isBm ? 'Pilih Jabatan' : 'Select Department'}
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full md:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 cursor-pointer"
              >
                {filteredDepts.map(d => (
                  <option key={d} value={d}>
                    {d} ({users.filter(u => u.department === d).length} {isBm ? 'Staf' : 'Staff'})
                  </option>
                ))}
              </select>
            </div>

            {selectedDept && (
              <div className="space-y-6">
                {/* Department Template Card */}
                <div className="bg-slate-50 dark:bg-zinc-950/80 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-6">
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedDept} - {t('accessControl', 'deptWideAccess', lang)}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {isBm
                          ? `Kebenaran ini menjadi templat lalai untuk semua kakitangan di bawah jabatan ${selectedDept}.`
                          : `These settings serve as the default baseline for all staff members assigned to the ${selectedDept} department.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => syncAllStaffInDept(selectedDept)}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {t('accessControl', 'syncAllDept', lang)}
                      </button>
                    </div>
                  </div>

                  {/* Department Quick Presets */}
                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider block">
                      {isBm ? 'Tetapkan Templat Jabatan Mengikut Peranan:' : 'Set Department Baseline from Role Preset:'}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'full')}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-yellow-500/10 dark:text-yellow-400 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetFullAdmin', lang)}
                      </button>
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'manager')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetManager', lang)}
                      </button>
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'hr')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetHR', lang)}
                      </button>
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'staff')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetStaff', lang)}
                      </button>
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'readonly')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetReadOnly', lang)}
                      </button>
                      <button
                        onClick={() => applyPreset(`dept_${selectedDept}`, 'revoke')}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        {t('accessControl', 'presetRevoke', lang)}
                      </button>
                    </div>
                  </div>

                  {/* Department Matrix Grid by Categories */}
                  <div className="space-y-5">
                    {PERMISSION_CATEGORIES.map(category => {
                      const availableFeatures = category.features.filter(
                        f => f !== 'manage_access_control' || isITAdmin
                      );

                      return (
                        <div
                          key={category.id}
                          className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-5 shadow-xs space-y-3"
                        >
                          <div className="pb-2.5 border-b border-slate-100 dark:border-zinc-800">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                              {isBm ? category.titleBm : category.titleEn}
                            </h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                            {availableFeatures.map(feat => {
                              const deptChecked = !!permissionsMatrix[`dept_${selectedDept}`]?.permissions[feat];

                              return (
                                <div
                                  key={feat}
                                  className="flex items-start justify-between gap-4 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                                >
                                  <div className="space-y-0.5 flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 block">
                                      {getFeatureLabel(feat)}
                                    </span>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                                      {getFeatureDesc(feat)}
                                    </p>
                                  </div>

                                  <div className="pt-0.5 flex-shrink-0">
                                    <Toggle
                                      checked={deptChecked}
                                      onChange={() => togglePermission(`dept_${selectedDept}`, feat)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Staff list in this department */}
                <div className="bg-slate-50 dark:bg-zinc-950/80 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                      {isBm ? `Senarai Kakitangan (${selectedDept})` : `Staff Directory (${selectedDept})`}
                    </h4>
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                      {users.filter(u => u.department === selectedDept).length} {isBm ? 'Orang' : 'Members'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {users
                      .filter(u => u.department === selectedDept)
                      .map(user => {
                        return (
                          <div
                            key={user.id}
                            onClick={() => {
                              setSelectedStaffId(user.id);
                              setFilterType('staff');
                            }}
                            className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center justify-between cursor-pointer hover:border-indigo-400 dark:hover:border-yellow-500 transition-all shadow-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-zinc-200 flex-shrink-0">
                                {user.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {user.full_name}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                                  {user.roles?.role_name || 'Staff'} • {user.email}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-indigo-600 dark:text-yellow-400 font-semibold flex-shrink-0">
                              {isBm ? 'Urus' : 'Manage'} &rarr;
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: FEATURE MATRIX VIEW ─────────────────────────────────── */}
        {filterType === 'feature' && (
          <div className="space-y-6">
            {/* Feature Search */}
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 md:w-96">
                <input
                  type="text"
                  placeholder={t('accessControl', 'searchFeaturePlaceholder', lang)}
                  value={featureSearch}
                  onChange={(e) => setFeatureSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500"
                />
                <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                {isBm ? 'Pilih Kebenaran' : 'Select Feature / Permission'}
              </label>
              <select
                value={selectedFeature}
                onChange={(e) => setSelectedFeature(e.target.value as PermissionKey)}
                className="w-full md:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 cursor-pointer"
              >
                {allFilteredFeatures.map(f => (
                  <option key={f} value={f}>
                    {getFeatureLabel(f)}
                  </option>
                ))}
              </select>
            </div>

            {selectedFeature && (
              <div className="bg-slate-50 dark:bg-zinc-950/80 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-6">
                <div className="pb-4 border-b border-slate-200 dark:border-zinc-800">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {getFeatureLabel(selectedFeature)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                    {getFeatureDesc(selectedFeature)}
                  </p>
                </div>

                {/* By Department Breakdown */}
                <div className="space-y-5">
                  {departments.map(dept => {
                    const deptUsers = users.filter(u => u.department === dept);
                    const deptChecked = !!permissionsMatrix[`dept_${dept}`]?.permissions[selectedFeature];

                    return (
                      <div
                        key={dept}
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-xs"
                      >
                        {/* Department Header with Toggle */}
                        <div className="flex items-center justify-between bg-slate-100/70 dark:bg-zinc-800/80 px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs md:text-sm text-slate-900 dark:text-white">
                              {dept} ({isBm ? 'Seluruh Jabatan' : 'Department Wide'})
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200 font-semibold">
                              {deptUsers.length} {isBm ? 'Staf' : 'Staff'}
                            </span>
                          </div>

                          <Toggle
                            checked={deptChecked}
                            onChange={() => togglePermission(`dept_${dept}`, selectedFeature)}
                          />
                        </div>

                        {/* Staff items in department */}
                        <div className="p-2 divide-y divide-slate-100 dark:divide-zinc-800">
                          {deptUsers.map(user => {
                            const isEffective = getEffectivePermission(user.id, selectedFeature);
                            const hasOverride = isUserOverride(user.id, selectedFeature);

                            return (
                              <div
                                key={user.id}
                                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-zinc-200 flex-shrink-0">
                                    {user.full_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate">
                                        {user.full_name}
                                      </p>
                                      {hasOverride && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                          {t('accessControl', 'customOverrideBadge', lang)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                                      {user.roles?.role_name || 'Staff'} • {user.email}
                                    </p>
                                  </div>
                                </div>

                                <Toggle
                                  checked={isEffective}
                                  onChange={() => togglePermission(`user_${user.id}`, selectedFeature)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
