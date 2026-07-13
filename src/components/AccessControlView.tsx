import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { clearPermissionsCache } from '../hooks/usePermissions';

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
    manage_hr: boolean;
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

      const EXCLUDED_DEPT_KEYWORDS = [
        'part time', 'part-time', 'contract', 'contract worker', 'intern', 'intern hr',
        'top management', 'tm', 'executive'
      ];

      const depts = Array.from(new Set(profiles?.map(p => p.department).filter(Boolean)))
        .filter(d => !EXCLUDED_DEPT_KEYWORDS.includes(d.trim().toLowerCase())) as string[];
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
            view_clients: false, edit_clients: false, view_staff: false, edit_staff: false, view_attendance: false, view_snapshot: false, manage_access_control: false, manage_drive: false, manage_hr: false
          }
        };
      });

      profiles?.forEach(user => {
        matrix[`user_${user.id}`] = {
          target_type: 'user',
          target_id: user.id,
          permissions: {
            view_clients: null as any, edit_clients: null as any, view_staff: null as any, edit_staff: null as any, view_attendance: null as any, view_snapshot: null as any, manage_access_control: null as any, manage_drive: null as any, manage_hr: null as any
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
              'view_clients', 'edit_clients', 'view_staff', 'edit_staff', 'view_attendance', 'view_snapshot', 'manage_access_control', 'manage_drive', 'manage_hr'
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
            permissions: entry.permissions
          });
        }
      }

      // Clear local in-memory permissions cache
      clearPermissionsCache();

      alert(t('accessControl', 'savedSuccess', lang));
      fetchData(); // Refresh IDs
    } catch (err) {
      console.error('Save failed', err);
      alert(t('accessControl', 'saveFailed', lang));
    } finally {
      setSaving(false);
    }
  };

  const [filterType, setFilterType] = useState<'staff' | 'department' | 'feature'>('staff');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedFeature, setSelectedFeature] = useState<keyof PermissionEntry['permissions']>('view_clients');

  useEffect(() => {
    if (users.length > 0 && !selectedStaffId) {
      setSelectedStaffId(users[0].id);
    }
  }, [users, selectedStaffId]);

  useEffect(() => {
    if (departments.length > 0 && !selectedDept) {
      setSelectedDept(departments[0]);
    }
  }, [departments, selectedDept]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">{t('accessControl', 'loading', lang)}</div>;
  }

  const allFeatures: (keyof PermissionEntry['permissions'])[] = [
    'view_clients', 'edit_clients', 'view_staff', 'edit_staff', 
    'view_attendance', 'view_snapshot', 'manage_drive', 'manage_hr',
    ...(isITAdmin ? ['manage_access_control' as keyof PermissionEntry['permissions']] : [])
  ];

  const getFeatureLabel = (f: string) => {
    switch(f) {
      case 'view_clients': return t('accessControl', 'colViewClients', lang);
      case 'edit_clients': return t('accessControl', 'colEditClients', lang);
      case 'view_staff': return t('accessControl', 'colViewStaff', lang);
      case 'edit_staff': return t('accessControl', 'colEditStaff', lang);
      case 'view_attendance': return t('accessControl', 'colAttendance', lang);
      case 'view_snapshot': return t('accessControl', 'colSnapshot', lang);
      case 'manage_drive': return t('accessControl', 'colDrive', lang);
      case 'manage_hr': return t('accessControl', 'colHR', lang) || 'Human Resources';
      case 'manage_access_control': return t('accessControl', 'colManageAccess', lang);
      default: return f;
    }
  };

  const getFeatureDesc = (f: string) => {
    switch(f) {
      case 'view_clients': return t('accessControl', 'colViewClientsDesc', lang);
      case 'edit_clients': return t('accessControl', 'colEditClientsDesc', lang);
      case 'view_staff': return t('accessControl', 'colViewStaffDesc', lang);
      case 'edit_staff': return t('accessControl', 'colEditStaffDesc', lang);
      case 'view_attendance': return t('accessControl', 'colAttendanceDesc', lang);
      case 'view_snapshot': return t('accessControl', 'colSnapshotDesc', lang);
      case 'manage_drive': return t('accessControl', 'colDriveDesc', lang);
      case 'manage_hr': return t('accessControl', 'colHRDesc', lang) || 'Manage HR settings';
      case 'manage_access_control': return t('accessControl', 'colManageAccessDesc', lang);
      default: return f;
    }
  };

  const renderFeatureRow = (featureKey: keyof PermissionEntry['permissions'], targetKey: string) => {
    const entry = permissionsMatrix[targetKey];
    if (!entry) return null;
    return (
      <div key={featureKey} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800 last:border-0">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">{getFeatureLabel(featureKey)}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{getFeatureDesc(featureKey)}</p>
        </div>
        <Toggle checked={!!entry.permissions[featureKey]} onChange={() => togglePermission(targetKey, featureKey)} />
      </div>
    );
  };

  const renderUserFeatureRow = (user: any, featureKey: keyof PermissionEntry['permissions']) => {
    const userKey = `user_${user.id}`;
    const entry = permissionsMatrix[userKey];
    if (!entry) return null;
    return (
      <div key={user.id} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-900/40 px-4 -mx-4 rounded-lg transition-colors">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">{user.full_name}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-500">{user.roles?.role_name || t('common', 'noRole', lang)} {user.department ? `· ${user.department}` : ''}</p>
        </div>
        <Toggle checked={!!entry.permissions[featureKey]} onChange={() => togglePermission(userKey, featureKey)} />
      </div>
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

      <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm p-6">
        
        {/* Primary Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-gray-800 pb-4 mb-6">
          <button 
            onClick={() => setFilterType('staff')} 
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex-1 sm:flex-none text-center ${filterType === 'staff' ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-900 dark:text-zinc-400 dark:hover:bg-gray-800'}`}>
            Name of Staff
          </button>
          <button 
            onClick={() => setFilterType('department')} 
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex-1 sm:flex-none text-center ${filterType === 'department' ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-900 dark:text-zinc-400 dark:hover:bg-gray-800'}`}>
            Department Wide
          </button>
          <button 
            onClick={() => setFilterType('feature')} 
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex-1 sm:flex-none text-center ${filterType === 'feature' ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-900 dark:text-zinc-400 dark:hover:bg-gray-800'}`}>
            Features
          </button>
        </div>

        {/* Dynamic Content Based on Filter */}
        
        {filterType === 'staff' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Select Staff Member</label>
              <select 
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full sm:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 transition-shadow"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} {u.department ? `(${u.department})` : ''}</option>
                ))}
              </select>
            </div>

            {selectedStaffId && (
              <div className="bg-slate-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-slate-100 dark:border-gray-800">
                <div className="mb-6 pb-4 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{users.find(u => u.id === selectedStaffId)?.full_name}</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-400">Manage individual feature access for this staff member.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  {allFeatures.map(f => renderFeatureRow(f, `user_${selectedStaffId}`))}
                </div>
              </div>
            )}
          </div>
        )}

        {filterType === 'department' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Select Department</label>
              <select 
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full sm:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 transition-shadow"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {selectedDept && (
              <div className="space-y-6">
                <div className="bg-indigo-50/50 dark:bg-gray-900/80 p-6 rounded-2xl border border-indigo-100 dark:border-gray-800 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 dark:bg-yellow-500"></div>
                  <div className="mb-6 pb-4 border-b border-indigo-100 dark:border-gray-800">
                    <h3 className="text-xl font-bold text-indigo-900 dark:text-yellow-500">{selectedDept} - Department Wide Access</h3>
                    <p className="text-sm text-indigo-700/70 dark:text-zinc-400">Toggling these will automatically apply to all staff in {selectedDept}.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {allFeatures.map(f => renderFeatureRow(f, `dept_${selectedDept}`))}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-black p-6 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-4">Staff in {selectedDept}</h4>
                  <div className="space-y-6">
                    {users.filter(u => u.department === selectedDept).map(user => (
                      <div key={user.id} className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-slate-200 dark:border-gray-800">
                        <div className="mb-4">
                          <p className="font-semibold text-slate-800 dark:text-zinc-200">{user.full_name}</p>
                          <p className="text-xs text-slate-500 dark:text-zinc-500">{user.roles?.role_name || t('common', 'noRole', lang)}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                          {allFeatures.map(f => (
                            <div key={f} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-gray-800 last:border-0">
                              <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{getFeatureLabel(f)}</span>
                              <Toggle checked={!!permissionsMatrix[`user_${user.id}`]?.permissions[f]} onChange={() => togglePermission(`user_${user.id}`, f)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {filterType === 'feature' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Select Feature</label>
              <select 
                value={selectedFeature}
                onChange={(e) => setSelectedFeature(e.target.value as keyof PermissionEntry['permissions'])}
                className="w-full sm:w-96 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 transition-shadow"
              >
                {allFeatures.map(f => (
                  <option key={f} value={f}>{getFeatureLabel(f)}</option>
                ))}
              </select>
            </div>

            {selectedFeature && (
              <div className="bg-slate-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-slate-100 dark:border-gray-800">
                <div className="mb-6 pb-4 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{getFeatureLabel(selectedFeature)}</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-400">{getFeatureDesc(selectedFeature)}</p>
                </div>
                
                <div className="space-y-8">
                  {departments.map(dept => (
                    <div key={dept}>
                      <div className="flex items-center justify-between bg-indigo-50 dark:bg-gray-900 px-4 py-3 rounded-lg border border-indigo-100 dark:border-gray-800 mb-2">
                        <span className="font-bold text-indigo-900 dark:text-yellow-500">{dept} (Department Wide)</span>
                        <Toggle checked={!!permissionsMatrix[`dept_${dept}`]?.permissions[selectedFeature]} onChange={() => togglePermission(`dept_${dept}`, selectedFeature)} />
                      </div>
                      <div className="pl-4 border-l-2 border-indigo-100 dark:border-gray-800 ml-2 space-y-1">
                        {users.filter(u => u.department === dept).map(user => renderUserFeatureRow(user, selectedFeature))}
                      </div>
                    </div>
                  ))}

                  {users.filter(u => !u.department).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between bg-slate-100 dark:bg-gray-800 px-4 py-3 rounded-lg border border-slate-200 dark:border-gray-700 mb-2">
                        <span className="font-bold text-slate-700 dark:text-zinc-300">{t('accessControl', 'unassignedDept', lang)}</span>
                      </div>
                      <div className="pl-4 border-l-2 border-slate-200 dark:border-gray-800 ml-2 space-y-1">
                        {users.filter(u => !u.department).map(user => renderUserFeatureRow(user, selectedFeature))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
