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
  };
}

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
      // 1. Fetch all profiles to get users and unique departments
      const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, department, roles(role_name)');
      
      if (profError) throw profError;
      
      const depts = Array.from(new Set(profiles?.map(p => p.department).filter(Boolean))) as string[];
      setDepartments(depts);
      setUsers(profiles || []);

      // 2. Fetch existing permissions
      const { data: perms, error: permError } = await supabase
        .from('access_permissions')
        .select('*');
        
      if (permError) throw permError;

      const matrix: Record<string, PermissionEntry> = {};
      
      // Initialize matrix with defaults for departments
      depts.forEach(dept => {
        matrix[`dept_${dept}`] = {
          target_type: 'department',
          target_id: dept,
          permissions: {
            view_clients: false, edit_clients: false, view_staff: false, edit_staff: false, view_attendance: false, view_snapshot: false, manage_access_control: false
          }
        };
      });

      // Initialize matrix with defaults for users
      profiles?.forEach(user => {
        matrix[`user_${user.id}`] = {
          target_type: 'user',
          target_id: user.id,
          permissions: {
            view_clients: null as any, edit_clients: null as any, view_staff: null as any, edit_staff: null as any, view_attendance: null as any, view_snapshot: null as any, manage_access_control: null as any
          } // null signifies "Inherit from department" in the UI mentally, but for simplicity we'll just store booleans if they override
        };
      });

      // Overlay saved permissions
      perms?.forEach(p => {
        const key = p.target_type === 'department' ? `dept_${p.target_id}` : `user_${p.target_id}`;
        matrix[key] = {
          id: p.id,
          target_type: p.target_type,
          target_id: p.target_id,
          permissions: { ...matrix[key]?.permissions, ...p.permissions }
        };
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
      
      alert('Permissions saved successfully!');
      fetchData(); // Refresh IDs
    } catch (err) {
      console.error('Save failed', err);
      alert('Failed to save permissions. Ensure the SQL script was run.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">Loading Access Control...</div>;
  }

  const renderMatrixRow = (title: string, subtitle: string, key: string, isDepartment: boolean) => {
    const entry = permissionsMatrix[key];
    if (!entry) return null;

    const p = entry.permissions;

    return (
      <tr key={key} className={`border-b border-slate-100 dark:border-gray-800 ${isDepartment ? 'bg-slate-50 dark:bg-gray-900/50' : 'bg-white dark:bg-black hover:bg-slate-50/50 dark:hover:bg-zinc-900/30'}`}>
        <td className="px-4 py-3">
          <p className={`font-semibold ${isDepartment ? 'text-indigo-700 dark:text-yellow-500 text-sm' : 'text-slate-800 dark:text-zinc-200 text-xs'}`}>{title}</p>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">{subtitle}</p>
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_clients} onChange={() => togglePermission(key, 'view_clients')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.edit_clients} onChange={() => togglePermission(key, 'edit_clients')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_staff} onChange={() => togglePermission(key, 'view_staff')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.edit_staff} onChange={() => togglePermission(key, 'edit_staff')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_attendance} onChange={() => togglePermission(key, 'view_attendance')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_snapshot} onChange={() => togglePermission(key, 'view_snapshot')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        {isITAdmin && (
          <td className="px-4 py-3 text-center">
            <input type="checkbox" checked={!!p.manage_access_control} onChange={() => togglePermission(key, 'manage_access_control')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-black p-6 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Access Control Matrix</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Manage viewing and editing permissions across the portal. Department permissions apply to all users in that department unless overridden by specific user settings.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>

      <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-100/50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs w-64">Target</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-gray-800">View Clients</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center">Edit Clients</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-gray-800">View Staff</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center">Edit Staff</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-gray-800">View Attendance</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-gray-800">View Snapshot</th>
                {isITAdmin && <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-gray-800">Manage Access</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => (
                <React.Fragment key={`group_${dept}`}>
                  {renderMatrixRow(dept, 'Department-wide Access', `dept_${dept}`, true)}
                  {users.filter(u => u.department === dept).map(user => (
                    renderMatrixRow(user.full_name, user.roles?.role_name || 'No Role', `user_${user.id}`, false)
                  ))}
                </React.Fragment>
              ))}
              
              {/* Users without departments */}
              {users.filter(u => !u.department).length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-gray-900/50 border-b border-slate-100 dark:border-gray-800">
                    <td colSpan={7} className="px-4 py-2 font-semibold text-slate-500 dark:text-zinc-500 text-xs uppercase tracking-wider">Unassigned / No Department</td>
                  </tr>
                  {users.filter(u => !u.department).map(user => (
                    renderMatrixRow(user.full_name, user.roles?.role_name || 'No Role', `user_${user.id}`, false)
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
