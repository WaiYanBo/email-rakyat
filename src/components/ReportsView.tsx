import { useEffect, useState } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { sanitizeInput, isValidEmail, isStrongPassword } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

export type EmploymentType = 'Contract of Service' | 'Contract for Service' | 'Internship';

export interface AccrualCalculation {
  tenureText: string;
  completedMonthsThisYear: number;
  accruedDays: number;
  annualTotal: number;
  monthlyRate: string;
  isEligible: boolean;
  note?: string;
}

// ─── HELPER: CALCULATE MONTH-BY-MONTH ANNUAL LEAVE ACCRUAL & TENURE ───
export function calculateLeaveAccrual(
  startDateStr?: string,
  endDateStr?: string,
  annualTotal: number = 12,
  employmentType: string = 'Contract of Service',
  isCurrentlyWorking: boolean = true,
  referenceDate: Date = new Date()
): AccrualCalculation {
  if (!startDateStr) {
    return {
      tenureText: 'Start date not set',
      completedMonthsThisYear: 0,
      accruedDays: 0,
      annualTotal,
      monthlyRate: (annualTotal / 12).toFixed(2),
      isEligible: employmentType !== 'Contract for Service',
      note: 'Set start date to enable month-by-month calculation'
    };
  }

  const start = new Date(startDateStr);
  const end = !isCurrentlyWorking && endDateStr ? new Date(endDateStr) : referenceDate;
  
  if (isNaN(start.getTime())) {
    return {
      tenureText: 'Invalid start date',
      completedMonthsThisYear: 0,
      accruedDays: 0,
      annualTotal,
      monthlyRate: (annualTotal / 12).toFixed(2),
      isEligible: employmentType !== 'Contract for Service',
    };
  }

  // 1. Calculate Tenure
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const tenureParts: string[] = [];
  if (years > 0) tenureParts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months > 0) tenureParts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);
  if (days > 0 || tenureParts.length === 0) tenureParts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  const tenureText = tenureParts.join(' ');

  // 2. Contract for Service (Independent Contractor - Not eligible for statutory annual leave accrual)
  if (employmentType === 'Contract for Service') {
    return {
      tenureText,
      completedMonthsThisYear: 0,
      accruedDays: 0,
      annualTotal: 0,
      monthlyRate: '0.00',
      isEligible: false,
      note: 'Contract for Service (Independent Contractor - Not eligible for statutory annual leave accrual)'
    };
  }

  // 3. Internship: Pro-rated across the internship duration
  if (employmentType === 'Internship') {
    const internEnd = endDateStr ? new Date(endDateStr) : end;
    const totalInternMonths = Math.max(1, (internEnd.getFullYear() - start.getFullYear()) * 12 + (internEnd.getMonth() - start.getMonth()) + (internEnd.getDate() >= start.getDate() ? 1 : 0));
    const elapsedMonths = Math.max(0, Math.min(totalInternMonths, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + (end.getDate() >= start.getDate() ? 1 : 0)));
    const internAccrual = Math.min(annualTotal, parseFloat(((elapsedMonths / 12) * annualTotal).toFixed(1)));
    return {
      tenureText,
      completedMonthsThisYear: elapsedMonths,
      accruedDays: internAccrual,
      annualTotal,
      monthlyRate: (annualTotal / 12).toFixed(2),
      isEligible: true,
      note: `Internship duration: ${totalInternMonths} mos (Accrued: ${elapsedMonths}/${totalInternMonths} mos)`
    };
  }

  // 4. Contract of Service: Month-by-month statutory accrual in current calendar year
  const currentYear = referenceDate.getFullYear();
  const startYear = start.getFullYear();
  let monthsEligibleThisYear = 0;

  if (startYear === currentYear) {
    // Joined this year: months from start month up to current month
    const startMonth = start.getMonth(); // 0-11
    const currentMonth = referenceDate.getMonth(); // 0-11
    monthsEligibleThisYear = Math.max(0, currentMonth - startMonth + (start.getDate() <= 15 ? 1 : 0));
  } else if (startYear < currentYear) {
    // Joined in earlier year: full months in current calendar year up to current month
    monthsEligibleThisYear = referenceDate.getMonth() + (referenceDate.getDate() >= 1 ? 1 : 0);
  } else {
    monthsEligibleThisYear = 0;
  }

  monthsEligibleThisYear = Math.min(12, Math.max(0, monthsEligibleThisYear));
  const rawAccrued = (monthsEligibleThisYear / 12) * annualTotal;
  // Round to nearest 0.5 day
  const accruedDays = Math.min(annualTotal, Math.round(rawAccrued * 2) / 2);

  return {
    tenureText,
    completedMonthsThisYear: monthsEligibleThisYear,
    accruedDays,
    annualTotal,
    monthlyRate: (annualTotal / 12).toFixed(2),
    isEligible: true,
    note: `${monthsEligibleThisYear}/12 months completed in ${currentYear} (${(annualTotal / 12).toFixed(2)} days/month)`
  };
}

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

  // Contract & Period form modal states
  const [modalEmploymentType, setModalEmploymentType] = useState<EmploymentType>('Contract of Service');
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [modalIsStillWorking, setModalIsStillWorking] = useState(true);

  const fetchStaffRecords = async () => {
    try {
      const { data: staffData, error } = await supabase
        .from('profiles')
        .select(`*, roles ( role_name )`);

      if (error) {
        console.error('Error fetching staff records:', error);
        return;
      }

      // Fetch approved leave requests for today
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: leavesData } = await supabase
        .from('leave_requests')
        .select('profile_id')
        .eq('status', 'Approved')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr);

      const staffOnLeave = new Set(leavesData?.map(l => l.profile_id) || []);

      // Fetch leave balances to know each staff's assigned annual_total
      const { data: balancesData } = await supabase
        .from('leave_balances')
        .select('profile_id, annual_total, annual_used');
      const balancesMap = new Map((balancesData || []).map((b: any) => [b.profile_id, b]));

      if (staffData) {
        const enhancedStaffData = staffData.map(staff => {
          let empType = staff.employment_type;
          let empStart = staff.start_date;
          let empEnd = staff.end_date;
          let empActive = staff.is_currently_working;

          // Parse metadata tag from remarks if direct columns are not yet present
          if (staff.remarks) {
            const match = staff.remarks.match(/<!--EMP_META:(.*?)-->/);
            if (match) {
              try {
                const meta = JSON.parse(match[1]);
                if (!empType && meta.type) empType = meta.type;
                if (!empStart && meta.start) empStart = meta.start;
                if (!empEnd && meta.end) empEnd = meta.end;
                if (empActive === undefined && typeof meta.active === 'boolean') empActive = meta.active;
              } catch (e) {}
            }
          }

          if (!empType) {
            empType = staff.roles?.role_name?.toLowerCase().includes('intern') ? 'Internship' : 'Contract of Service';
          }
          if (empActive === undefined) {
            empActive = empType !== 'Internship';
          }

          const balance = balancesMap.get(staff.id);
          const annualTotal = balance?.annual_total ?? (empType === 'Contract for Service' ? 0 : 12);
          const annualUsed = balance?.annual_used ?? 0;

          const accrual = calculateLeaveAccrual(
            empStart,
            empEnd,
            annualTotal,
            empType,
            empActive
          );

          return {
            ...staff,
            is_on_leave_today: staffOnLeave.has(staff.id),
            employment_type: empType,
            start_date: empStart,
            end_date: empEnd,
            is_currently_working: empActive,
            leave_balance: balance,
            annual_total: annualTotal,
            annual_used: annualUsed,
            accrual,
            display_remarks: staff.remarks ? staff.remarks.replace(/<!--EMP_META:.*?-->/g, '').trim() : ''
          };
        });
        setStaffRecords(enhancedStaffData);
      }
    } catch (err) {
      console.error('Exception fetching staff records:', err);
    }
  };

  useEffect(() => {
    async function loadData() {
      const session = await getCurrentSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

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
          name: profileData.full_name,
          department: profileData.department,
          role: roleName,
        });
      }

      await fetchStaffRecords();
      setLoading(false);
    }
    loadData();
  }, []);

  const openEditModal = (staff: any) => {
    setEditingStaff(staff);
    setDepartmentInputType('select');

    let empType: EmploymentType = staff.employment_type || (staff.roles?.role_name?.toLowerCase().includes('intern') ? 'Internship' : 'Contract of Service');
    let sDate = staff.start_date || '';
    let eDate = staff.end_date || '';
    let isWorking = staff.is_currently_working !== false;

    if (staff.remarks && (!sDate || !staff.employment_type)) {
      const match = staff.remarks.match(/<!--EMP_META:(.*?)-->/);
      if (match) {
        try {
          const meta = JSON.parse(match[1]);
          if (meta.type) empType = meta.type;
          if (meta.start) sDate = meta.start;
          if (meta.end) eDate = meta.end;
          if (typeof meta.active === 'boolean') isWorking = meta.active;
        } catch (e) {}
      }
    }

    setModalEmploymentType(empType);
    setModalStartDate(sDate);
    setModalEndDate(eDate);
    setModalIsStillWorking(isWorking);
    setIsStaffModalOpen(true);
  };

  const openNewStaffModal = () => {
    setEditingStaff(null);
    setDepartmentInputType('select');
    setModalEmploymentType('Contract of Service');
    setModalStartDate(new Date().toISOString().split('T')[0]);
    setModalEndDate('');
    setModalIsStillWorking(true);
    setIsStaffModalOpen(true);
  };

  useEffect(() => {
    let subscription: any = null;

    const setupRealtime = async () => {
      if (profile?.id && !permsLoading) {
        const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
        const hasAccess = permissions.view_snapshot || isIT;
        if (hasAccess) {
          await fetchStaffRecords();
          
          subscription = supabase
            .channel('public:profiles')
            .on(
              'postgres_changes',
              {
                event: '*', // Listen for INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'profiles'
              },
              async (payload) => {
                await fetchStaffRecords();
              }
            )
            .subscribe();
        }
      }
    };

    setupRealtime();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [profile, permsLoading, permissions]);

  const saveStaffRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    const cleanName = sanitizeInput((data.name as string) || '', 100);
    const cleanDept = sanitizeInput((data.dept as string) || '', 100);
    const rawEmail = ((data.email as string) || '').trim().toLowerCase();
    const rawPassword = (data.password as string) || '';
    const salaryValue = parseFloat(data.salary as string);
    const cleanSalary = isFinite(salaryValue) && salaryValue >= 0 ? salaryValue : 0;
    const cleanRemarks = sanitizeInput((data.remarks as string) || '', 1000);

    const allowedRoles = [
      'Chairman', 'CEO', 'COO', 'CFO', 'CPO',
      'General Manager', 'Head of Department', 'Senior Executive', 'Executive',
      'Junior Executive', 'Specialist', 'Analyst', 'Admin Assistant',
      'Intern', 'Contract Worker', 'Part-Time Worker',
      'Finance', 'Marketing', 'Accounting', 'Creative', 'IT Admin', 'Intern HR', 'Contract', 'Part Time'
    ];
    const cleanRole = allowedRoles.includes(data.role as string) ? data.role as string : 'Executive';
    const allowedStatuses = ['Active', 'On Leave', 'Resigned'];
    const cleanStatus = allowedStatuses.includes(data.status as string) ? data.status as string : 'Active';

    let finalDept = cleanDept;
    if (['Chairman', 'CEO', 'COO', 'CFO', 'CPO'].includes(cleanRole)) {
      finalDept = 'BOD';
    }

    if (!cleanName) {
      alert('Staff name is required.');
      setIsProcessing(false);
      return;
    }

    // Employment contract and period
    const employmentType = modalEmploymentType;
    const startDateVal = modalStartDate || '';
    const isStillWorkingVal = modalEmploymentType === 'Internship' ? false : modalIsStillWorking;
    const endDateVal = modalEmploymentType === 'Internship' ? (modalEndDate || '') : (!isStillWorkingVal ? (modalEndDate || '') : '');

    // Prepare metadata tag fallback in remarks
    const rawCleanRemarks = cleanRemarks.replace(/<!--EMP_META:.*?-->/g, '').trim();
    const metaPayload = {
      type: employmentType,
      start: startDateVal,
      end: endDateVal,
      active: isStillWorkingVal
    };
    const remarksWithMeta = `${rawCleanRemarks}\n<!--EMP_META:${JSON.stringify(metaPayload)}-->`.trim();

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
        // Attempt update with native columns, fallback to remarksWithMeta if columns don't exist yet
        let updatePayload: any = {
          id: editingStaff.id,
          full_name: cleanName,
          department: finalDept,
          role_id: roleObj.id,
          salary: cleanSalary,
          status: cleanStatus,
          remarks: remarksWithMeta,
          email: editingStaff.email,
          employment_type: employmentType,
          start_date: startDateVal || null,
          end_date: endDateVal || null,
          is_currently_working: isStillWorkingVal
        };

        let { error: upsertError } = await supabase.from('profiles').upsert(updatePayload);
        if (upsertError && upsertError.message?.toLowerCase().includes('column')) {
          delete updatePayload.employment_type;
          delete updatePayload.start_date;
          delete updatePayload.end_date;
          delete updatePayload.is_currently_working;
          const retry = await supabase.from('profiles').upsert(updatePayload);
          upsertError = retry.error;
        }

        if (upsertError) throw new Error(`Update failed: ${upsertError.message}`);

        alert('✓ Staff record updated! Month-by-month leave calculation updated.');
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

        let newProfilePayload: any = {
          id: authData.user.id,
          full_name: cleanName,
          department: finalDept,
          role_id: roleObj.id,
          salary: cleanSalary,
          status: cleanStatus,
          remarks: remarksWithMeta,
          email: rawEmail,
          employment_type: employmentType,
          start_date: startDateVal || null,
          end_date: endDateVal || null,
          is_currently_working: isStillWorkingVal
        };

        let { error: profileError } = await supabase.from('profiles').upsert(newProfilePayload);
        if (profileError && profileError.message?.toLowerCase().includes('column')) {
          delete newProfilePayload.employment_type;
          delete newProfilePayload.start_date;
          delete newProfilePayload.end_date;
          delete newProfilePayload.is_currently_working;
          const retry = await supabase.from('profiles').upsert(newProfilePayload);
          profileError = retry.error;
        }

        if (profileError) throw new Error(`Profile creation failed: ${profileError.message}`);

        alert('✓ New staff account created! Email: ' + rawEmail + '\nMonth-by-month calculation initialized.');
        setIsStaffModalOpen(false);
      }
      await fetchStaffRecords();
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
    'CPO': 5,
    'General Manager': 6,
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
          {/* Top Metrics Cards */}
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

          {/* Staff Directory Table */}
          <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[68vh]">
            <div className="p-5 border-b border-indigo-950 dark:border-gray-800 flex justify-between items-center bg-indigo-950 dark:bg-gray-900">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">{t('reports', 'staffDirectory', lang)}</h3>
                <p className="text-[10px] text-slate-300 dark:text-zinc-400 mt-0.5">
                  Includes Contract Type, Period of Service, and Month-by-Month Annual Leave Accruals
                </p>
              </div>
              {canEditStaff && (
                <button
                  onClick={openNewStaffModal}
                  className="text-xs font-semibold bg-white hover:bg-slate-50 text-indigo-950 dark:bg-yellow-500 dark:text-black border border-slate-200 dark:border-yellow-500/50 dark:hover:bg-yellow-400 px-4 py-2.5 rounded-xl transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>{t('reports', 'onboardStaff', lang)}</span>
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full min-w-[950px] text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('reports', 'colNameRole', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs hidden md:table-cell">{t('reports', 'colDept', lang)}</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">Contract & Period</th>
                    <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-center">Accrued AL (Month-by-Month)</th>
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

                      {/* Contract Type & Duration of Service */}
                      <td className="px-4 py-3.5 text-left">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            staff.employment_type === 'Internship'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                              : staff.employment_type === 'Contract for Service'
                                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                          }`}>
                            {staff.employment_type || 'Contract of Service'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-700 dark:text-zinc-300 font-semibold">
                            {staff.start_date ? (
                              <>
                                📅 {new Date(staff.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {staff.end_date ? ` → ${new Date(staff.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ' (Active)'}
                              </>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">Start date not set</span>
                            )}
                          </span>
                          {staff.accrual?.tenureText && staff.start_date && (
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                              ⏱️ {staff.accrual.tenureText}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Month-by-Month Accrued Annual Leave */}
                      <td className="px-4 py-3.5 text-center">
                        {staff.employment_type === 'Contract for Service' ? (
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
                            <span>Contract for Service</span>
                            <span className="block text-[9px] text-slate-400 opacity-75">(No Statutory AL)</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono font-black text-xs text-amber-600 dark:text-yellow-400">
                              🏖️ {staff.accrual?.accruedDays ?? 0} / {staff.annual_total || 12} d earned
                            </span>
                            <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-medium">
                              {staff.accrual?.completedMonthsThisYear ?? 0}/12 mos ({staff.accrual?.monthlyRate || '1.00'} d/mo)
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right hidden lg:table-cell font-mono text-slate-800 dark:text-zinc-200">RM {staff.salary || '0'}</td>
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
                            className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 text-xs font-semibold transition-all shadow-sm inline-flex cursor-pointer"
                          >
                            {t('clients', 'viewDoc', lang)}
                          </button>
                          {canEditStaff && (
                            <button
                              onClick={() => openEditModal(staff)}
                              className="h-8 px-3.5 flex items-center justify-center rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-gray-900/30 dark:text-yellow-500 dark:hover:bg-yellow-500/20 border border-indigo-200 dark:border-yellow-500/30 text-xs font-semibold transition-all shadow-sm inline-flex cursor-pointer"
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

      {/* ─── VIEW STAFF DOSSIER MODAL ─── */}
      {isViewStaffModalOpen && viewingStaff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                Staff Profile & Employment Dossier
              </h2>
              <button
                onClick={() => { setIsViewStaffModalOpen(false); setViewingStaff(null); }}
                className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-gray-900/10 space-y-4">
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

              </div>

              {/* ─── DEDICATED CONTRACT & ANNUAL LEAVE ACCRUAL CARD ─── */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-amber-500/30 dark:border-yellow-500/30 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-yellow-400">
                      Employment Contract & Annual Leave Accrual
                    </h4>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    viewingStaff.employment_type === 'Internship'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                      : viewingStaff.employment_type === 'Contract for Service'
                        ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                  }`}>
                    {viewingStaff.employment_type || 'Contract of Service'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-150 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase block mb-0.5">Start Date</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">
                      {viewingStaff.start_date ? new Date(viewingStaff.start_date).toLocaleDateString('en-GB') : 'Not Set'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-150 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase block mb-0.5">End Date / Working Status</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">
                      {viewingStaff.end_date ? new Date(viewingStaff.end_date).toLocaleDateString('en-GB') : (viewingStaff.is_currently_working !== false ? 'Active / Present' : 'Not Set')}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-150 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase block mb-0.5">Period of Service (Tenure)</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">
                      {viewingStaff.accrual?.tenureText || 'N/A'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-150 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase block mb-0.5">Month-by-Month Accrued AL</span>
                    <span className="font-black text-amber-500 dark:text-yellow-400 font-mono text-sm">
                      {viewingStaff.employment_type === 'Contract for Service' 
                        ? '0 Days (Not Eligible)' 
                        : `${viewingStaff.accrual?.accruedDays || 0} / ${viewingStaff.annual_total || 12} Days`}
                    </span>
                  </div>
                </div>

                {viewingStaff.accrual?.note && (
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 italic bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/50 dark:border-amber-900/30">
                    💡 {viewingStaff.accrual.note}
                  </p>
                )}
              </div>

              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col shadow-sm">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-2">Remarks</p>
                <p className="text-sm font-medium text-slate-800 dark:text-zinc-300 break-words whitespace-pre-wrap">{viewingStaff.display_remarks || 'No remarks provided.'}</p>
              </div>

            </div>

            <div className="p-5 border-t border-slate-100 dark:border-gray-800/80 bg-white dark:bg-black flex justify-end gap-3">
              {canEditStaff && (
                <button
                  onClick={() => {
                    setIsViewStaffModalOpen(false);
                    openEditModal(viewingStaff);
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer"
                >
                  {t('reports', 'editStaff', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ONBOARD / EDIT STAFF MODAL ─── */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white tracking-tight">{editingStaff ? t('reports', 'editStaff', lang) : t('reports', 'onboarding', lang)}</h2>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-slate-400 hover:text-rose-500 p-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl transition-colors cursor-pointer"
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
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 font-semibold px-2 py-1 bg-slate-100 dark:bg-gray-800 rounded-lg cursor-pointer"
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
                        <option value="CPO">CPO</option>
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
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Employment Status</label>
                      <select name="status" defaultValue={editingStaff?.status || 'Active'} className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-slate-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer">
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Resigned">Resigned / Terminated</option>
                      </select>
                    </div>

                    {/* ─── DEDICATED CONTRACT & PERIOD SECTION (CALCULATES ACCRUAL) ─── */}
                    <div className="col-span-2 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-yellow-400 flex items-center gap-1.5">
                          <span>📋</span>
                          <span>Employment Contract & Period (Leave Accrual)</span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                          Month-by-Month
                        </span>
                      </div>

                      {/* Contract Type Selection */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Contract Option
                        </label>
                        <select
                          name="employment_type"
                          value={modalEmploymentType}
                          onChange={(e) => setModalEmploymentType(e.target.value as any)}
                          className="w-full px-4 py-2.5 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-950 text-slate-900 dark:text-zinc-100 text-xs font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="Contract of Service">Contract of Service (Direct Employment)</option>
                          <option value="Contract for Service">Contract for Service (Independent Contractor / Freelancer)</option>
                          <option value="Internship">Internship (Practical Training)</option>
                        </select>
                      </div>

                      {/* Conditional Date Pickers */}
                      {modalEmploymentType === 'Internship' ? (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                              Internship Start Date *
                            </label>
                            <input
                              type="date"
                              name="start_date"
                              value={modalStartDate}
                              onChange={(e) => setModalStartDate(e.target.value)}
                              required
                              className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                              Internship End Date *
                            </label>
                            <input
                              type="date"
                              name="end_date"
                              value={modalEndDate}
                              onChange={(e) => setModalEndDate(e.target.value)}
                              required
                              className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                Start Date (Join Date) *
                              </label>
                              <input
                                type="date"
                                name="start_date"
                                value={modalStartDate}
                                onChange={(e) => setModalStartDate(e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="pb-2 flex items-center">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  name="is_currently_working"
                                  checked={modalIsStillWorking}
                                  onChange={(e) => setModalIsStillWorking(e.target.checked)}
                                  className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span>Still Working / Currently Active</span>
                              </label>
                            </div>
                          </div>

                          {!modalIsStillWorking && (
                            <div className="space-y-1 animate-fade-in">
                              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                End Date / Resignation Date
                              </label>
                              <input
                                type="date"
                                name="end_date"
                                value={modalEndDate}
                                onChange={(e) => setModalEndDate(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Live Calculation Preview Card */}
                      {(() => {
                        const accrual = calculateLeaveAccrual(
                          modalStartDate,
                          modalEndDate,
                          editingStaff?.annual_total || 12,
                          modalEmploymentType,
                          modalIsStillWorking
                        );
                        return (
                          <div className="p-3.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase">
                                ⏱️ Duration of Service:
                              </span>
                              <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">
                                {accrual.tenureText}
                              </span>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80 pt-1.5">
                              <span className="text-[10px] font-bold text-slate-450 dark:text-zinc-500 uppercase">
                                🏖️ Month-by-Month Accrued AL:
                              </span>
                              <span className={`font-black font-mono ${accrual.isEligible ? 'text-amber-500 dark:text-yellow-400 text-sm' : 'text-slate-400'}`}>
                                {accrual.isEligible ? `${accrual.accruedDays} / ${accrual.annualTotal} Days Earned` : 'Not Applicable'}
                              </span>
                            </div>

                            {accrual.note && (
                              <p className="text-[10px] text-slate-500 dark:text-zinc-400 italic pt-0.5">
                                ℹ️ {accrual.note}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Remarks</label>
                      <textarea name="remarks" defaultValue={editingStaff?.display_remarks ?? (editingStaff?.remarks ? editingStaff.remarks.replace(/<!--EMP_META:.*?-->/g, '').trim() : '')} rows={3} placeholder="Add any internal notes about this staff member..." className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/40 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 resize-y" />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-gray-800/80">
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-6 py-3 rounded-xl text-xs md:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:text-black border-0 dark:hover:bg-yellow-400 transition-colors w-full sm:w-auto min-h-[48px] disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing ? 'Saving & Calculating...' : 'Save & Calculate'}
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