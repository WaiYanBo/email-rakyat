import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';

export default function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'finance' | 'hr'>('hr'); // Defaulted to HR for you

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

    try {
      // 1. Get the exact role_id from the database for the selected role
      const { data: roleObj, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('role_name', data.role)
        .single();
        
      if (roleError) {
        throw new Error("Role not found in database. Please ensure the role exists in the roles table.");
      }

      if (editingStaff) {
        // UPDATE EXISTING STAFF using upsert
        console.log('Updating staff ID:', editingStaff.id);
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id: editingStaff.id,
            full_name: data.name,
            department: data.dept,
            role_id: roleObj.id,
            salary: parseFloat(data.salary as string) || 0,
            status: data.status
          });
        
        if (upsertError) {
          throw new Error(`Update failed: ${upsertError.message}`);
        }
        
        console.log('✓ Staff record updated successfully!');
        alert('✓ Staff record updated! Changes will sync automatically.');
        setIsStaffModalOpen(false);
        // Real-time listener will automatically refresh the table

      } else {
        // INSERT NEW STAFF (Total Automation)
        
        // A. Create an isolated client so the CFO doesn't get logged out
        const onboardingClient = createClient(
          import.meta.env.PUBLIC_SUPABASE_URL,
          import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
          { auth: { persistSession: false } }
        );

        // B. Create the Auth Login Credentials
        console.log('Creating auth account for:', data.email);
        const { data: authData, error: authError } = await onboardingClient.auth.signUp({
          email: data.email as string,
          password: data.password as string,
        });

        if (authError) {
          throw new Error(`Auth creation failed: ${authError.message}`);
        }

        if (!authData.user) {
          throw new Error('Failed to create user account.');
        }

        // C. Push all HR data to profiles table using upsert
        console.log('Creating profile for user ID:', authData.user.id);
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            full_name: data.name,
            department: data.dept,
            role_id: roleObj.id,
            salary: parseFloat(data.salary as string) || 0,
            status: data.status
          });
        
        if (profileError) {
          throw new Error(`Profile creation failed: ${profileError.message}`);
        }

        console.log('✓ New staff onboarded successfully!');
        alert('✓ New staff account created! Email: ' + data.email + '\nChanges will sync automatically.');
        setIsStaffModalOpen(false);
        // Real-time listener will automatically refresh the table
      }
      
    } catch (err: any) {
      console.error('Error saving staff record:', err);
      alert("❌ Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="flex justify-center pt-20"><div className="animate-pulse text-teal-600 font-bold uppercase tracking-widest">Loading Reports...</div></div>;

  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  if (!hasFullAccess) return <div className="p-12 text-center text-red-600 font-bold text-xl uppercase tracking-widest mt-12 bg-white rounded-xl shadow-lg border border-red-200">Access Denied</div>;

  // HR Calculations
  const activeStaffCount = staffRecords.filter(s => s.status === 'Active' || !s.status).length;
  const totalPayroll = staffRecords.filter(s => s.status !== 'Resigned').reduce((sum, s) => sum + parseFloat(s.salary || 0), 0);

  return (
    <div className="space-y-6 md:space-y-8 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-teal-900 dark:text-white">Executive Reports</h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">Finance, Accounting, and Human Resources Management</p>
      </div>

      <div className="flex flex-row border-b border-gray-200 dark:border-gray-800">
        <button onClick={() => setActiveTab('hr')} className={`py-3 px-6 text-xs md:text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'hr' ? 'border-teal-600 text-teal-700 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>HR & Staff</button>
        <button onClick={() => setActiveTab('finance')} className={`py-3 px-6 text-xs md:text-sm font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'finance' ? 'border-teal-600 text-teal-700 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Finance & Ledger</button>
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
              <button onClick={() => { setEditingStaff(null); setIsStaffModalOpen(true); }} className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white dark:bg-yellow-500 dark:text-black px-3 py-2 rounded-md shadow-sm">+ Onboard Staff</button>
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 z-10 text-[10px] md:text-xs uppercase text-gray-600 dark:text-gray-300">
                  <tr><th className="px-4 py-3 font-bold border-b border-gray-200 dark:border-gray-700">Name & Role</th><th className="px-4 py-3 font-bold border-b border-gray-200 dark:border-gray-700">Dept</th><th className="px-4 py-3 font-bold border-b border-gray-200 dark:border-gray-700">Salary (RM)</th><th className="px-4 py-3 font-bold border-b border-gray-200 dark:border-gray-700">Status</th><th className="px-4 py-3 font-bold border-b border-gray-200 dark:border-gray-700 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs text-gray-700 dark:text-gray-300">
                  {staffRecords.map(staff => (
                    <tr key={staff.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{staff.full_name} <span className="block text-[10px] font-normal text-gray-500 mt-0.5">{staff.roles?.role_name || 'N/A'}</span></td>
                      <td className="px-4 py-3">{staff.department}</td>
                      <td className="px-4 py-3 font-mono text-gray-500">{staff.salary || '0'}</td>
                      <td className="px-4 py-3">
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