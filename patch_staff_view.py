import sys
import re

content = open('src/components/ReportsView.tsx', 'r', encoding='utf-8').read()

# 1. Add states
state_insertion = """  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isViewStaffModalOpen, setIsViewStaffModalOpen] = useState(false);
  const [viewingStaff, setViewingStaff] = useState<any>(null);"""
content = re.sub(r'  const \[isStaffModalOpen, setIsStaffModalOpen\] = useState\(false\);', state_insertion, content)

# 2. Change header
header_find = """                    {canEditStaff && <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-right">{t('reports', 'colActions', lang)}</th>}"""
header_repl = """                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-right">{t('reports', 'colActions', lang)}</th>"""
content = content.replace(header_find, header_repl)

# 3. Change actions column
actions_find = """                      {canEditStaff && (
                        <td className="px-4 py-3.5 text-right">
                          <button 
                            onClick={() => { setEditingStaff(staff); setDepartmentInputType('select'); setIsStaffModalOpen(true); }} 
                            className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-750 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 border border-slate-205 dark:border-zinc-700 text-xs font-semibold transition-all shadow-sm inline-flex"
                          >
                            Edit
                          </button>
                        </td>
                      )}"""
actions_repl = """                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setViewingStaff(staff); setIsViewStaffModalOpen(true); }}
                            className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-750 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 border border-slate-205 dark:border-zinc-700 text-xs font-semibold transition-all shadow-sm inline-flex"
                          >
                            View
                          </button>
                          {canEditStaff && (
                            <button 
                              onClick={() => { setEditingStaff(staff); setDepartmentInputType('select'); setIsStaffModalOpen(true); }} 
                              className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/30 text-xs font-semibold transition-all shadow-sm inline-flex"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>"""
content = content.replace(actions_find, actions_repl)

# 4. Add View Modal at the end
view_modal = """
      {/* VIEW STAFF MODAL */}
      {isViewStaffModalOpen && viewingStaff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                Staff Profile
              </h2>
              <button 
                onClick={() => { setIsViewStaffModalOpen(false); setViewingStaff(null); }} 
                className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-zinc-900/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">Full Name</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.full_name || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">Department</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.department || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">Role</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.roles?.role_name || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.status || 'Active'}</p>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">Salary</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">RM {viewingStaff.salary || '0'}</p>
                </div>

              </div>
            </div>
            
            <div className="p-5 border-t border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex justify-end gap-3">
              {canEditStaff && (
                <button 
                  onClick={() => {
                    setIsViewStaffModalOpen(false);
                    setEditingStaff(viewingStaff);
                    setDepartmentInputType('select');
                    setIsStaffModalOpen(true);
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                >
                  Edit Record
                </button>
              )}
            </div>
          </div>
        </div>
      )}
"""

content = content.replace('      {isStaffModalOpen && (', view_modal + '\n      {isStaffModalOpen && (')

open('src/components/ReportsView.tsx', 'w', encoding='utf-8').write(content)
print('Patch complete!')
