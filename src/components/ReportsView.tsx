import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { sanitizeInput, isValidEmail, isStrongPassword } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

export default function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'hr' | 'finance'>('hr');
  const { lang } = usePortalLanguage();

  // REAL DATABASE STATE
  const [staffRecords, setStaffRecords] = useState<any[]>([]);
  const [financeRecords, setFinanceRecords] = useState<any[]>([]); // Ready for finance table later

  // MODAL STATE
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);

  // FETCH STAFF RECORDS FUNCTION
  const fetchStaffRecords = async () => {
    try {
      const { data: staffData, error } = await supabase
        .from('profiles')
        .select(`id, full_name, department, salary, status, roles ( role_name )`);
      
      if (error) {
        console.error('Error fetching staff records:', error);
        return;
      }
      
      if (staffData) {
        setStaffRecords(staffData);
        console.log('Staff records updated:', staffData.length, 'records');
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
      const { data: profileData } = await supabase.from('profiles').select(`full_name, roles ( role_name )`).eq('id', session.user.id).single();
      if (profileData) {
        setProfile({ name: profileData.full_name, role: profileData.roles?.role_name || 'No Role' });
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

  // --- AUTOMATED HR ONBOARDING HANDLER (WITH REAL-TIME SYNC) ---
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

    // Whitelist role values from the select
    const allowedRoles = ['Intern', 'Contract', 'General Manager', 'COO', 'CFO'];
    const cleanRole = allowedRoles.includes(data.role as string) ? data.role as string : 'Intern';
    const allowedStatuses = ['Active', 'On Leave', 'Resigned'];
    const cleanStatus = allowedStatuses.includes(data.status as string) ? data.status as string : 'Active';

    if (!cleanName) {
      alert('Staff name is required.');
      setIsProcessing(false);
      return;
    }

    try {
      // 1. Get the exact role_id from the database for the selected role
      const { data: roleObj, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('role_name', cleanRole)
        .single();
        
      if (roleError) {
        throw new Error('Role not found in database. Please ensure the role exists in the roles table.');
      }

      if (editingStaff) {
        // UPDATE EXISTING STAFF
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: editingStaff.id,
            full_name: cleanName,
            department: cleanDept,
            role_id: roleObj.id,
            salary: cleanSalary,
            status: cleanStatus
          });
        
        if (upsertError) throw new Error(`Update failed: ${upsertError.message}`);
        
        alert('✓ Staff record updated! Changes will sync automatically.');
        setIsStaffModalOpen(false);

      } else {
        // INSERT NEW STAFF — validate email and password strength first
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

        // A. Create an isolated client so the current user isn’t logged out
        const onboardingClient = createClient(
          import.meta.env.PUBLIC_SUPABASE_URL,
          import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
          { auth: { persistSession: false } }
        );

        // B. Create the Auth Login Credentials
        const { data: authData, error: authError } = await onboardingClient.auth.signUp({
          email: rawEmail,
          password: rawPassword,
        });

        if (authError) throw new Error(`Auth creation failed: ${authError.message}`);
        if (!authData.user) throw new Error('Failed to create user account.');

        // C. Push HR data to profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            full_name: cleanName,
            department: cleanDept,
            role_id: roleObj.id,
            salary: cleanSalary,
            status: cleanStatus
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-teal-600 font-bold animate-pulse text-xl uppercase">{t('reports', 'loading', lang)}</div></div>;

  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  if (!hasFullAccess) return <div className="p-12 rounded-xl bg-white dark:bg-gray-900/50 border border-red-200 dark:border-red-900/50 shadow-lg text-center mt-12"><h2 className="text-2xl font-black uppercase tracking-widest text-red-600 dark:text-red-500 mb-2">{t('common', 'accessDenied', lang)}</h2></div>;

  // HR Calculations
  const activeStaffCount = staffRecords.filter(s => s.status === 'Active' || !s.status).length;
  const totalPayroll = staffRecords.filter(s => s.status !== 'Resigned').reduce((sum, s) => sum + parseFloat(s.salary || 0), 0);

  return (
    <div className="space-y-6 md:space-y-8 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col gap-3 mb-10">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-teal-900 dark:text-white">{t('reports', 'pageTitle', lang)}</h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">{t('reports', 'pageSubtitle', lang)}</p>
      </div>

      <div className="flex flex-row border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('hr')}
            className={`flex-1 px-6 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
              activeTab === 'hr'
                ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-md'
                : 'text-teal-700 dark:text-gray-400 hover:bg-teal-100 dark:hover:bg-gray-700/50'
            }`}
          >
            👥 {t('reports', 'tabHR', lang)}
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className={`flex-1 px-6 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
              activeTab === 'finance'
                ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-md'
                : 'text-teal-700 dark:text-gray-400 hover:bg-teal-100 dark:hover:bg-gray-700/50'
            }`}
          >
            💰 {t('reports', 'tabFinance', lang)}
          </button>
      </div>

      {/* ======================= HR TAB ======================= */}
      {activeTab === 'hr' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">Active Staff</p><p className="text-2xl font-black text-teal-700 dark:text-white mt-1">{activeStaffCount}</p></div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">Total Headcount</p><p className="text-2xl font-black text-blue-600 mt-1">{staffRecords.length}</p></div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 shadow-sm"><p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">Est. Monthly Payroll</p><p className="text-2xl font-black text-red-600 mt-1">RM {totalPayroll.toLocaleString()}</p></div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col max-h-[60vh]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h3 className="text-xs md:text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Staff Directory</h3>
              <button onClick={() => { setEditingStaff(null); setIsStaffModalOpen(true); }} className="text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded-lg bg-teal-600 dark:bg-yellow-500 text-white dark:text-black hover:bg-teal-700 dark:hover:bg-yellow-600 transition-all shadow-md hover:shadow-lg min-h-[40px]">{t('reports', 'onboardStaff', lang)}</button>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 z-10 text-[10px] md:text-xs uppercase text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-4 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">{t('reports', 'colNameRole', lang)}</th>
                    <th className="px-4 py-4 text-left font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px] hidden md:table-cell">{t('reports', 'colDept', lang)}</th>
                    <th className="px-4 py-4 text-right font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px] hidden lg:table-cell">{t('reports', 'colSalary', lang)}</th>
                    <th className="px-4 py-4 text-center font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">{t('reports', 'colStatus', lang)}</th>
                    <th className="px-4 py-4 text-right font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">{t('reports', 'colActions', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs text-gray-700 dark:text-gray-300">
                  {staffRecords.map(staff => (
                    <tr key={staff.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white text-left">{staff.full_name} <span className="block text-[10px] font-normal text-gray-500 mt-0.5">{staff.roles?.role_name || 'N/A'}</span></td>
                      <td className="px-4 py-3 text-left hidden md:table-cell">{staff.department}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell font-mono text-gray-500">{staff.salary || '0'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${staff.status === 'Active' || !staff.status ? 'bg-emerald-100 text-emerald-700' : staff.status === 'On Leave' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {staff.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right"><button onClick={() => { setEditingStaff(staff); setIsStaffModalOpen(true); }} className="text-[10px] bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 px-3 py-1 rounded font-bold uppercase">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================= FINANCE TAB (Awaiting DB Setup) ======================= */}
      {activeTab === 'finance' && (
        <div className="p-12 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
          <p className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Finance Ledger Database Not Yet Created</p>
          <p className="text-sm mt-2">IT Admin must create a `finance_ledger` table in Supabase before automating this section.</p>
        </div>
      )}

      {/* ======================= AUTOMATED HR MODAL ======================= */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 w-[95%] max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-yellow-500">{t('reports', 'activeStaff', lang)}</p>
              <h2 className="text-sm font-black uppercase tracking-widest text-teal-900 dark:text-white">{editingStaff ? 'Edit Staff Data' : 'Automated Onboarding'}</h2>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-gray-400 hover:text-red-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            
            <form onSubmit={saveStaffRecord} className="p-5 space-y-4 overflow-y-auto scrollbar-thin">
              {!editingStaff && (
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 rounded-lg mb-4">
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">System Automation Active</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Filling this out will automatically create their login credentials and push their data to the database.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-bold uppercase mb-1">Full Name</label><input type="text" name="name" defaultValue={editingStaff?.full_name} required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" /></div>
                
                {/* LOGIN CREDENTIALS (ONLY VISIBLE WHEN ADDING NEW STAFF) */}
                {!editingStaff && (
                  <>
                    <div className="col-span-2"><label className="block text-xs font-bold uppercase mb-1 text-teal-600">Login Email</label><input type="email" name="email" required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" /></div>
                    <div className="col-span-2"><label className="block text-xs font-bold uppercase mb-1 text-teal-600">Temp Password</label><input type="text" name="password" required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" /></div>
                  </>
                )}

                <div><label className="block text-xs font-bold uppercase mb-1">Department</label><input type="text" name="dept" defaultValue={editingStaff?.department} required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" /></div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Job Role</label>
                  <select name="role" defaultValue={editingStaff?.roles?.role_name || 'Intern'} className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm font-bold">
                    <option value="Intern">Intern</option>
                    <option value="Contract">Contract</option>
                    <option value="General Manager">General Manager</option>
                    <option value="COO">COO</option>
                    <option value="CFO">CFO</option>
                  </select>
                </div>
                
                <div><label className="block text-xs font-bold uppercase mb-1">Base Salary (RM)</label><input type="number" step="0.01" name="salary" defaultValue={editingStaff?.salary || 0} required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" /></div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase mb-1 text-red-600">Employment Status</label>
                  <select name="status" defaultValue={editingStaff?.status || 'Active'} className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm font-bold">
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Resigned">Resigned / Terminated</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button type="submit" disabled={isProcessing} className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase bg-teal-600 text-white w-full sm:w-auto disabled:opacity-50">
                  {isProcessing ? 'Automating...' : 'Save & Automate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}