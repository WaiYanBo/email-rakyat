import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { sanitizeInput, isValidEmail, isStrongPassword } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

export default function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'hr' | 'finance'>('hr');
  const { lang } = usePortalLanguage();
  const { permissions, loading: permsLoading } = usePermissions(profile);

  const [staffRecords, setStaffRecords] = useState<any[]>([]);
  const [financeRecords, setFinanceRecords] = useState<any[]>([]); // Ready for finance table later

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isViewStaffModalOpen, setIsViewStaffModalOpen] = useState(false);
  const [viewingStaff, setViewingStaff] = useState<any>(null);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [departmentInputType, setDepartmentInputType] = useState<'select' | 'text'>('select');

  const fetchStaffRecords = async () => {
    try {
      const { data: staffData, error } = await supabase
        .from('profiles')
        .select(`id, full_name, department, salary, status, remarks, email, roles ( role_name )`);

      if (error) {
        console.error('Error fetching staff records:', error);
        return;
      }

      // Fetch approved leave requests for today
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: leavesData, error: leavesError } = await supabase
        .from('leave_requests')
        .select('profile_id')
        .eq('status', 'Approved')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr);

      const staffOnLeave = new Set(leavesData?.map(l => l.profile_id) || []);

      if (staffData) {
        const enhancedStaffData = staffData.map(staff => ({
          ...staff,
          is_on_leave_today: staffOnLeave.has(staff.id)
        }));
        setStaffRecords(enhancedStaffData);
        console.log('Staff records updated:', enhancedStaffData.length, 'records');
      }
    } catch (err) {
      console.error('Exception fetching staff records:', err);
    }
  };

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      // 1. Verify User Access
      const { data: profileData } = await supabase.from('profiles').select(`id, department, full_name, roles ( role_name )`).eq('id', session.user.id).single();
      if (profileData) {
        let roleName = 'No Role';
        if (profileData.roles) {
          const rolesVar = profileData.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        setProfile({
          id: profileData.id,
          department: profileData.department,
          name: profileData.full_name,
          role: roleName
        });
      }

      // 2. Initial Load of Staff Data
      await fetchStaffRecords();

      setLoading(false);
    }

    loadData();

    // 3. Setup Realtime Listener for instant updates
    console.log('Setting up realtime listener...');
    const subscription = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'profiles'
        },
        async (payload) => {
          console.log('Real-time change detected:', payload.eventType, payload);
          // Re-fetch all staff records when changes occur
          await fetchStaffRecords();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    // Cleanup: Remove listener on component unmount
    return () => {
      console.log('Unsubscribing from realtime listener');
      subscription.unsubscribe();
    };
  }, []);

  const saveStaffRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    // ── Sanitize all inputs ───────────────────────────────────────────────────
    const cleanName = sanitizeInput((data.name as string) || '', 100);
    const cleanDept = sanitizeInput((data.dept as string) || '', 100);
    const rawEmail = ((data.email as string) || '').trim().toLowerCase();
    const rawPassword = (data.password as string) || '';
    const salaryValue = parseFloat(data.salary as string);
    const cleanSalary = isFinite(salaryValue) && salaryValue >= 0 ? salaryValue : 0;
    const cleanRemarks = sanitizeInput((data.remarks as string) || '', 1000);

    // Whitelist role values from the select
    const allowedRoles = [
      'Chairman', 'CEO', 'COO', 'CFO',
      'General Manager', 'Head of Department', 'Senior Executive', 'Executive',
      'Junior Executive', 'Specialist', 'Analyst', 'Admin Assistant',
      'Intern', 'Contract Worker', 'Part-Time Worker',
      'Finance', 'Marketing', 'Accounting', 'Creative', 'IT Admin', 'Intern HR', 'Contract', 'Part Time'
    ];
    const cleanRole = allowedRoles.includes(data.role as string) ? data.role as string : 'Intern HR';
    const allowedStatuses = ['Active', 'On Leave', 'Resigned'];
    const cleanStatus = allowedStatuses.includes(data.status as string) ? data.status as string : 'Active';

    let finalDept = cleanDept;
    if (['Chairman', 'CEO', 'COO', 'CFO'].includes(cleanRole)) {
      finalDept = 'BOD';
    }

    if (!cleanName) {
      alert('Staff name is required.');
      setIsProcessing(false);
      return;
    }

    try {
      const { data: roleObj, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('role_name', cleanRole)
        .single();

      if (roleError) {
        throw new Error('Role not found in database. Please ensure the role exists in the roles table.');
      }

      if (editingStaff) {
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: editingStaff.id,
            full_name: cleanName,
            department: finalDept,
            role_id: roleObj.id,
            salary: cleanSalary,
            status: cleanStatus,
            remarks: cleanRemarks,
            email: editingStaff.email
          });

        if (upsertError) throw new Error(`Update failed: ${upsertError.message}`);

        alert('✓ Staff record updated! Changes will sync automatically.');
        setIsStaffModalOpen(false);

      } else {
        if (!isValidEmail(rawEmail)) {
          alert('Please enter a valid email address.');
          setIsProcessing(false);
          return;
        }
        const pwCheck = isStrongPassword(rawPassword);
        if (!pwCheck.valid) {
          alert(`Temp password is too weak: ${pwCheck.message}`);
          setIsProcessing(false);
          return;
        }

        const onboardingClient = createClient(
          import.meta.env.PUBLIC_SUPABASE_URL,
          import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
          { auth: { persistSession: false } }
        );

        const { data: authData, error: authError } = await onboardingClient.auth.signUp({
          email: rawEmail,
          password: rawPassword,
        });

        if (authError) throw new Error(`Auth creation failed: ${authError.message}`);
        if (!authData.user) throw new Error('Failed to create user account.');

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            full_name: cleanName,
            department: finalDept,
            role_id: roleObj.id,
            salary: cleanSalary,
            status: cleanStatus,
            remarks: cleanRemarks,
            email: rawEmail
          });

        if (profileError) throw new Error(`Profile creation failed: ${profileError.message}`);

        alert('✓ New staff account created! Email: ' + rawEmail + '\nChanges will sync automatically.');
        setIsStaffModalOpen(false);
      }
      window.location.reload();
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('reports', 'loading', lang)}
        </div>
      </div>
    );
  }

  const hasFullAccess = permissions?.view_staff || false;
  const canEditStaff = permissions?.edit_staff || false;

  if (!hasFullAccess) {
    return (
      <div className="p-12 rounded-2xl bg-white dark:bg-gray-900/50 border border-rose-200 dark:border-rose-950/20 shadow-sm text-center mt-12">
        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-455 mb-2">
          {t('common', 'accessDenied', lang)}
        </h2>
      </div>
    );
  }

  const activeStaffCount = staffRecords.filter(s => s.status === 'Active' || !s.status).length;
  const totalPayroll = staffRecords.filter(s => s.status !== 'Resigned').reduce((sum, s) => sum + parseFloat(s.salary || 0), 0);

  const roleHierarchy: Record<string, number> = {
    'Chairman': 1,
    'CEO': 2,
    'COO': 3,
    'CFO': 4,
    'General Manager': 5,
    'Head of Department': 6,
    'Senior Executive': 7,
    'IT Admin': 8,
    'Executive': 9,
    'Finance': 9,
    'Marketing': 9,
    'Accounting': 9,
    'Creative': 9,
    'Junior Executive': 10,
    'Specialist': 11,
    'Analyst': 12,
    'Admin Assistant': 13,
    // Bottom tier
    'Intern': 90,
    'Intern HR': 90,
    'Contract Worker': 91,
    'Contract': 91,
    'Part-Time Worker': 92,
    'Part Time': 92,
  };

  const sortedStaffRecords = [...staffRecords].sort((a, b) => {
    const roleA = a.roles?.role_name || '';
    const roleB = b.roles?.role_name || '';
    const rankA = roleHierarchy[roleA] || 99;
    const rankB = roleHierarchy[roleB] || 99;

    if (rankA !== rankB) return rankA - rankB;

    const deptA = a.department || '';
    const deptB = b.department || '';
    if (deptA !== deptB) return deptA.localeCompare(deptB);

    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  return (
    <div className="space-y-6 animate-page-transition pt-12 md:pt-0 relative mb-8">
      <div className="flex flex-col gap-1.5 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white tracking-tight">{t('reports', 'pageTitle', lang)}</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">{t('reports', 'pageSubtitle', lang)}</p>
      </div>

      {activeTab === 'hr' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 dark:bg-gray-900/40 dark:border-gray-800/80 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-450 dark:text-zinc-500 uppercase tracking-wide">{t('reports', 'activeStaff', lang)}</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2 tracking-tight">{activeStaffCount}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 dark:bg-gray-900/40 dark:border-gray-800/80 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-450 dark:text-zinc-500 uppercase tracking-wide">{t('reports', 'totalHeadcount', lang)}</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2 tracking-tight">{staffRecords.length}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 dark:bg-gray-900/40 dark:border-gray-800/80 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-450 dark:text-zinc-500 uppercase tracking-wide">{t('reports', 'estPayroll', lang)}</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2 tracking-tight">RM {totalPayroll.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[60vh]">
            <div className="p-5 border-b border-indigo-955 dark:border-gray-800 flex justify-between items-center bg-indigo-950 dark:bg-gray-900">
              <h3 className="text-sm font-bold text-white tracking-tight">{t('reports', 'staffDirectory', lang)}</h3>
              {canEditStaff && (
                <button
                  onClick={() => { setEditingStaff(null); setDepartmentInputType('select'); setIsStaffModalOpen(true); }}
                  className="text-xs font-semibold bg-white hover:bg-slate-50 text-indigo-955 dark:bg-yellow-500 dark:text-black border border-slate-200 dark:border-yellow-500/50 dark:hover:bg-yellow-400 px-4 py-2.5 rounded-xl transition-all shadow-sm min-h-[48px] flex items-center justify-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>{t('reports', 'onboardStaff', lang)}</span>
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('reports', 'colNameRole', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs hidden md:table-cell">{t('reports', 'colDept', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs hidden lg:table-cell">{t('reports', 'colRemarks', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-right hidden lg:table-cell">{t('reports', 'colSalary', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-center">{t('reports', 'colStatus', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-right">{t('reports', 'colActions', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-gray-800 text-slate-700 dark:text-zinc-300">
                  {sortedStaffRecords.map(staff => (
                    <tr key={staff.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white text-left">
                        {staff.full_name}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider">{staff.roles?.role_name || 'N/A'}</span>
                          <span className="text-[11px] font-medium text-indigo-650 dark:text-indigo-400 font-mono tracking-tight lowercase">{staff.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-left hidden md:table-cell">{staff.department}</td>
                      <td className="px-4 py-3.5 text-left hidden lg:table-cell max-w-[150px] truncate" title={staff.remarks || ''}>{staff.remarks || '-'}</td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell font-mono text-slate-800 dark:text-zinc-200">{staff.salary || '0'}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded border text-[11px] font-semibold tracking-wide uppercase ${staff.is_on_leave_today
                          ? 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/20 dark:text-yellow-500 dark:border-amber-900/30'
                          : (staff.status === 'Active' || !staff.status)
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                            : staff.status === 'On Leave'
                              ? 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900/20 dark:text-yellow-500 dark:border-amber-900/30'
                              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30'
                          }`}>
                          {staff.is_on_leave_today ? 'On Leave' : (staff.status || 'Active')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setViewingStaff(staff); setIsViewStaffModalOpen(true); }}
                            className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 text-xs font-semibold transition-all shadow-sm inline-flex"
                          >
                            {t('clients', 'viewDoc', lang)}
                          </button>
                          {canEditStaff && (
                            <button
                              onClick={() => { setEditingStaff(staff); setDepartmentInputType('select'); setIsStaffModalOpen(true); }}
                              className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-gray-900/30 dark:text-yellow-500 dark:hover:bg-yellow-500/20 border border-indigo-200 dark:border-yellow-500/30 text-xs font-semibold transition-all shadow-sm inline-flex"
                            >
                              {t('reports', 'editBtn', lang)}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isViewStaffModalOpen && viewingStaff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
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

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-gray-900/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Full Name</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.full_name || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Email Address</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words lowercase font-mono">{viewingStaff.email || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Department</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.department || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Role</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.roles?.role_name || 'N/A'}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">{viewingStaff.is_on_leave_today ? 'On Leave' : (viewingStaff.status || 'Active')}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-450 dark:text-zinc-550 uppercase tracking-wider mb-1">Salary</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">RM {viewingStaff.salary || '0'}</p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col shadow-sm sm:col-span-2 lg:col-span-3">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-2">Remarks</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-zinc-300 break-words whitespace-pre-wrap">{viewingStaff.remarks || 'No remarks provided.'}</p>
                </div>

              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-gray-800/80 bg-white dark:bg-black flex justify-end gap-3">
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
                  {t('reports', 'editStaff', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white tracking-tight">{editingStaff ? t('reports', 'editStaff', lang) : t('reports', 'onboarding', lang)}</h2>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-slate-400 hover:text-rose-500 p-2 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {(() => {
              const standardDepartments = ['Human Resources', 'Finance', 'Accounting', 'Marketing', 'Media', 'IT', 'Operations', 'Sales'];
              const dynamicDepartments = staffRecords.map(s => s.department).filter(Boolean) as string[];
              const EXCLUDED_DEPT_KEYWORDS = [
                'part time', 'part-time', 'contract', 'contract worker', 'intern', 'intern hr',
                'top management', 'tm', 'executive'
              ];
              const uniqueDepartments = Array.from(new Set([...standardDepartments, ...dynamicDepartments]))
                .filter(d => !EXCLUDED_DEPT_KEYWORDS.includes(d.trim().toLowerCase()));
              return (
                <form onSubmit={saveStaffRecord} className="p-6 space-y-4 overflow-y-auto scrollbar-thin bg-white dark:bg-black">
                  {!editingStaff && (
                    <div className="p-4 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl">
                      <p className="text-xs text-indigo-700 dark:text-yellow-500 font-semibold uppercase tracking-wider block mb-0.5">System Automation Active</p>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Filling this out will automatically generate credentials and initialize a matching database profile record.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Full Name</label>
                      <input type="text" name="name" defaultValue={editingStaff?.full_name} required className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                    </div>

                    {!editingStaff && (
                      <>
                        <div className="col-span-2 space-y-1">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Login Email</label>
                          <input type="email" name="email" required className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-455 dark:text-zinc-355">Temp Password</label>
                          <input type="text" name="password" required className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                        </div>
                      </>
                    )}

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Department</label>
                      {departmentInputType === 'select' && uniqueDepartments.length > 0 ? (
                        <select
                          name="dept"
                          defaultValue={editingStaff?.department || uniqueDepartments[0]}
                          onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                              setDepartmentInputType('text');
                              e.target.value = ''; // Reset select state
                            }
                          }}
                          className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-slate-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer"
                        >
                          {uniqueDepartments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                          <option value="ADD_NEW" className="font-semibold text-purple-600 dark:text-yellow-500">+ Add New Department</option>
                        </select>
                      ) : (
                        <div className="relative">
                          <input
                            type="text"
                            name="dept"
                            placeholder={uniqueDepartments.length > 0 ? "Enter new department name" : "e.g. Human Resources"}
                            defaultValue={editingStaff?.department || ''}
                            required
                            autoFocus={departmentInputType === 'text'}
                            className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px]"
                          />
                          {uniqueDepartments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setDepartmentInputType('select')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 font-semibold px-2 py-1 bg-slate-100 dark:bg-gray-800 rounded-lg"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Job Role</label>
                      <select name="role" defaultValue={editingStaff?.roles?.role_name || 'Executive'} className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-slate-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer">
                        <option value="Chairman">Chairman</option>
                        <option value="CEO">CEO</option>
                        <option value="COO">COO</option>
                        <option value="CFO">CFO</option>
                        <option value="General Manager">General Manager</option>
                        <option value="Head of Department">Head of Department</option>
                        <option value="Senior Executive">Senior Executive</option>
                        <option value="Executive">Executive</option>
                        <option value="Junior Executive">Junior Executive</option>
                        <option value="Specialist">Specialist</option>
                        <option value="Analyst">Analyst</option>
                        <option value="Admin Assistant">Admin Assistant</option>
                        <option value="Intern">Intern</option>
                        <option value="Contract Worker">Contract Worker</option>
                        <option value="Part-Time Worker">Part-Time Worker</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Base Salary (RM)</label>
                      <input type="number" step="0.01" name="salary" defaultValue={editingStaff?.salary || 0} required className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Employment Status</label>
                      <select name="status" defaultValue={editingStaff?.status || 'Active'} className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-slate-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer">
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Resigned">Resigned / Terminated</option>
                      </select>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Remarks</label>
                      <textarea name="remarks" defaultValue={editingStaff?.remarks || ''} rows={3} placeholder="Add any internal notes about this staff member..." className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 resize-y" />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-gray-800/80">
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-6 py-3 rounded-xl text-xs md:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:text-black border-0 dark:hover:bg-yellow-400 transition-colors w-full sm:w-auto min-h-[48px] disabled:opacity-50"
                    >
                      {isProcessing ? 'Automating...' : 'Save & Automate'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}