import sys

content = open('src/components/AccessControlView.tsx', 'r', encoding='utf-8').read()

# 1. Update PermissionEntry interface
content = content.replace("    view_snapshot: boolean;", "    view_snapshot: boolean;\n    manage_access_control: boolean;")

# 2. Add isITAdmin prop
content = content.replace("export default function AccessControlView() {", "export default function AccessControlView({ isITAdmin = false }: { isITAdmin?: boolean }) {")

# 3. Add to matrix init defaults
content = content.replace("view_clients: false, edit_clients: false, view_staff: false, edit_staff: false, view_attendance: false, view_snapshot: false", "view_clients: false, edit_clients: false, view_staff: false, edit_staff: false, view_attendance: false, view_snapshot: false, manage_access_control: false")
content = content.replace("view_clients: null as any, edit_clients: null as any, view_staff: null as any, edit_staff: null as any, view_attendance: null as any, view_snapshot: null as any", "view_clients: null as any, edit_clients: null as any, view_staff: null as any, edit_staff: null as any, view_attendance: null as any, view_snapshot: null as any, manage_access_control: null as any")

# 4. Modify togglePermission to cascade
old_toggle = """  const togglePermission = (key: string, module: keyof PermissionEntry['permissions']) => {
    setPermissionsMatrix(prev => {
      const entry = prev[key];
      // If user permission is being set from undefined/null to something, handle it.
      // For simplicity, we just toggle boolean.
      const current = entry.permissions[module];
      const nextVal = current === true ? false : true;
      
      return {
        ...prev,
        [key]: {
          ...entry,
          permissions: {
            ...entry.permissions,
            [module]: nextVal
          }
        }
      };
    });
  };"""

new_toggle = """  const togglePermission = (key: string, module: keyof PermissionEntry['permissions']) => {
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
  };"""
content = content.replace(old_toggle, new_toggle)

# 5. Render header column
header_old = """<th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-zinc-800">View Snapshot</th>"""
header_new = """<th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-zinc-800">View Snapshot</th>
                {isITAdmin && <th className="px-4 py-3 font-semibold text-slate-600 dark:text-zinc-400 text-xs text-center border-l border-slate-200 dark:border-zinc-800">Manage Access</th>}"""
content = content.replace(header_old, header_new)

# 6. Render row cell
row_old = """<td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_snapshot} onChange={() => togglePermission(key, 'view_snapshot')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
      </tr>"""
row_new = """<td className="px-4 py-3 text-center">
          <input type="checkbox" checked={!!p.view_snapshot} onChange={() => togglePermission(key, 'view_snapshot')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        {isITAdmin && (
          <td className="px-4 py-3 text-center">
            <input type="checkbox" checked={!!p.manage_access_control} onChange={() => togglePermission(key, 'manage_access_control')} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
          </td>
        )}
      </tr>"""
content = content.replace(row_old, row_new)

open('src/components/AccessControlView.tsx', 'w', encoding='utf-8').write(content)
print("AccessControlView patched")
