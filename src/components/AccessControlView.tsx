import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

interface PermissionEntry {
  id?: string;
  target_type: 'department' | 'user';
  target_id: string; // Department name or User ID
  permissions: {
    view_clients: boolean;
    edit_clients: boolean;
    view_staff: boolean;
    edit_staff: boolean;
    view_attendance: boolean;
    view_snapshot: boolean;
    manage_access_control: boolean;
    manage_drive: boolean;
  };
}

const Toggle = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
  <button
    type="button"
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-indigo-600 dark:bg-yellow-500' : 'bg-slate-300 dark:bg-gray-700'}`}
  >
    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
);

export default function AccessControlView({ isITAdmin = false }: { isITAdmin?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { lang } = usePortalLanguage();

  const [departments, setDepartments] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, PermissionEntry>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, department, roles(role_name)');

      if (profError) throw profError;

      const depts = Array.from(new Set(profiles?.map(p => p.department).filter(Boolean))) as string[];
      setDepartments(depts);
      setUsers(profiles || []);

      const { data: perms, error: permError } = await supabase
        .from('access_permissions')
        .select('*');

      if (permError) throw permError;

      const matrix: Record<string, PermissionEntry> = {};

      depts.forEach(dept => {
        matrix[`dept_${dept}`] = {
          target_type: 'department',
          target_id: dept,
          permissions: {
            view_clients: false, edit_clients: false, view_staff: false, edit_staff: false, view_attendance: false, view_snapshot: false, manage_access_control: false, manage_drive: false
          }
        };
      });

      profiles?.forEach(user => {
        matrix[`user_${user.id}`] = {
          target_type: 'user',
          target_id: user.id,
          permissions: {
            view_clients: null as any, edit_clients: null as any, view_staff: null as any, edit_staff: null as any, view_attendance: null as any, view_snapshot: null as any, manage_access_control: null as any, manage_drive: null as any
          } // null defaults to inherited department settings
        };
      });

      perms?.forEach(p => {
        const key = p.target_type === 'department' ? `dept_${p.target_id}` : `user_${p.target_id}`;
        matrix[key] = {
          id: p.id,
          target_type: p.target_type,
          target_id: p.target_id,
          permissions: { ...matrix[key]?.permissions, ...p.permissions }
        };
      });

      // Synchronize department toggle states based on user overrides
      depts.forEach(deptName => {
        const deptKey = `dept_${deptName}`;
        if (matrix[deptKey]) {
          const deptUsers = profiles?.filter(p => p.department === deptName) || [];
          if (deptUsers.length > 0) {
            const modules: (keyof PermissionEntry['permissions'])[] = [
              'view_clients', 'edit_clients', 'view_staff', 'edit_staff', 'view_attendance', 'view_snapshot', 'manage_access_control', 'manage_drive'
            ];
            modules.forEach(module => {
              const allChecked = deptUsers.every(u => {
                const uKey = `user_${u.id}`;
                return matrix[uKey]?.permissions[module] === true;
              });
              matrix[deptKey].permissions[module] = allChecked;
            });
          }
        }
      });

      setPermissionsMatrix(matrix);
    } catch (err) {
      console.error('Error fetching access control data', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (key: string, module: keyof PermissionEntry['permissions']) => {
    setPermissionsMatrix(prev => {
      const entry = prev[key];
      const current = entry.permissions[module];
      const nextVal = current === true ? false : true;

      const newMatrix = {
        ...prev,
        [key]: {
          ...entry,
          permissions: {
            ...entry.permissions,
            [module]: nextVal
          }
        }
      };

      if (key.startsWith('dept_')) {
        // Cascade department toggle to all users
        const deptName = key.replace('dept_', '');
        users.forEach(u => {
          if (u.department === deptName) {
            const userKey = `user_${u.id}`;
            if (newMatrix[userKey]) {
               newMatrix[userKey] = {
                 ...newMatrix[userKey],
                 permissions: {
                   ...newMatrix[userKey].permissions,
                   [module]: nextVal
                 }
               };
            }
          }
        });
      } else if (key.startsWith('user_')) {
        // Sync department state if a single user overrides changes
        const userId = key.replace('user_', '');
        const userObj = users.find(u => u.id === userId);
        if (userObj && userObj.department) {
          const deptName = userObj.department;
          const deptKey = `dept_${deptName}`;
          if (newMatrix[deptKey]) {
            const deptUsers = users.filter(u => u.department === deptName);
            const allChecked = deptUsers.every(u => {
              const uKey = `user_${u.id}`;
              return newMatrix[uKey]?.permissions[module] === true;
            });

            newMatrix[deptKey] = {
              ...newMatrix[deptKey],
              permissions: {
                ...newMatrix[deptKey].permissions,
                [module]: allChecked
              }
            };
          }
        }
      }

      return newMatrix;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = Object.values(permissionsMatrix).filter(entry => {
        // Only save if there's actually a truthy permission set, or it already has an ID
        return entry.id || Object.values(entry.permissions).some(v => v === true || v === false);
      });

      for (const entry of upserts) {
        if (entry.id) {
          await supabase.from('access_permissions').update({ permissions: entry.permissions }).eq('id', entry.id);
        } else {
          await supabase.from('access_permissions').insert({
            target_type: entry.target_type,
            target_id: entry.target_id,
          });
        }
      }

      // Clear permissions cache in sessionStorage so updates are reflected immediately
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('portal_perms_')) {
            sessionStorage.removeItem(key);
            i--;
          }
        }
      } catch (e) {
        console.warn('Failed to clear session storage cache:', e);
      }

      alert(t('accessControl', 'savedSuccess', lang));
      fetchData(); // Refresh IDs
    } catch (err) {
      console.error('Save failed', err);
      alert(t('accessControl', 'saveFailed', lang));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">{t('accessControl', 'loading', lang)}</div>;
  }

  const renderMatrixRow = (title: string, subtitle: string, key: string, isDepartment: boolean) => {
    const entry = permissionsMatrix[key];
    if (!entry) return null;

    const p = entry.permissions;

    return (
      <tr key={key} className={`border-b border-slate-100 dark:border-gray-800 transition-colors ${isDepartment ? 'bg-slate-50 dark:bg-gray-900/50' : 'bg-white dark:bg-black hover:bg-indigo-50/30 dark:hover:bg-zinc-900/50'}`}>
        <td className="px-4 py-4 relative">
          {isDepartment && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 dark:bg-yellow-500 rounded-r-md"></div>}
          <div className={isDepartment ? '' : 'pl-4 border-l-2 border-slate-200 dark:border-gray-800'}>
            <p className={`font-semibold ${isDepartment ? 'text-indigo-700 dark:text-yellow-500 text-sm' : 'text-slate-800 dark:text-zinc-200 text-sm'}`}>{title}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 mt-0.5">{subtitle}</p>
          </div>
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.view_clients} onChange={() => togglePermission(key, 'view_clients')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.edit_clients} onChange={() => togglePermission(key, 'edit_clients')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.view_staff} onChange={() => togglePermission(key, 'view_staff')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.edit_staff} onChange={() => togglePermission(key, 'edit_staff')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.view_attendance} onChange={() => togglePermission(key, 'view_attendance')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.view_snapshot} onChange={() => togglePermission(key, 'view_snapshot')} />
        </td>
        <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
          <Toggle checked={!!p.manage_drive} onChange={() => togglePermission(key, 'manage_drive')} />
        </td>
        {isITAdmin && (
          <td className="px-4 py-4 text-center border-l border-slate-100 dark:border-gray-800/50 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-colors">
            <Toggle checked={!!p.manage_access_control} onChange={() => togglePermission(key, 'manage_access_control')} />
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-black p-6 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{t('accessControl', 'matrixTitle', lang)}</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            {t('accessControl', 'matrixSubtitle', lang)}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? t('accessControl', 'saving', lang) : t('accessControl', 'saveBtn', lang)}
        </button>
      </div>

      <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-100/80 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs w-64 uppercase tracking-wider">
                  {t('accessControl', 'colTarget', lang)}
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colViewClients', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colViewClientsDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colEditClients', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colEditClientsDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colViewStaff', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colViewStaffDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colEditStaff', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colEditStaffDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colAttendance', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colAttendanceDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider">{t('accessControl', 'colSnapshot', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colSnapshotDesc', lang)}</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{t('accessControl', 'colDrive', lang)}</span>
                    <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colDriveDesc', lang)}</span>
                  </div>
                </th>
                {isITAdmin && (
                  <th className="px-4 py-4 font-bold text-slate-700 dark:text-zinc-300 text-xs text-center border-l border-slate-200 dark:border-gray-800">
                    <div className="flex flex-col items-center">
                      <span className="uppercase tracking-wider text-rose-600 dark:text-rose-400">{t('accessControl', 'colManageAccess', lang)}</span>
                      <span className="text-[10px] font-normal text-slate-505 mt-1 capitalize normal-case leading-tight max-w-[90px]">{t('accessControl', 'colManageAccessDesc', lang)}</span>
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => (
                <React.Fragment key={`group_${dept}`}>
                  {renderMatrixRow(dept, t('accessControl', 'deptWideAccess', lang), `dept_${dept}`, true)}
                  {users.filter(u => u.department === dept).map(user => (
                    renderMatrixRow(user.full_name, user.roles?.role_name || t('common', 'noRole', lang), `user_${user.id}`, false)
                  ))}
                </React.Fragment>
              ))}

              {users.filter(u => !u.department).length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-gray-900/50 border-b border-slate-100 dark:border-gray-800">
                    <td colSpan={isITAdmin ? 9 : 8} className="px-4 py-2 font-semibold text-slate-500 dark:text-zinc-550 text-xs uppercase tracking-wider">{t('accessControl', 'unassignedDept', lang)}</td>
                  </tr>
                  {users.filter(u => !u.department).map(user => (
                    renderMatrixRow(user.full_name, user.roles?.role_name || t('common', 'noRole', lang), `user_${user.id}`, false)
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
