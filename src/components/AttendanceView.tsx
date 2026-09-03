import { useEffect, useState } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { exportAttendanceToExcel } from '../utils/excelExport';
export default function AttendanceView({ personalOnly = false }: { personalOnly?: boolean }) {
  const [profile, setProfile] = useState<any>(null);
  const { permissions, loading: permsLoading } = usePermissions(profile);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'date' | 'month'>(personalOnly ? 'month' : 'date');
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [uniqueEmployees, setUniqueEmployees] = useState<any[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const { lang } = usePortalLanguage();

  // Edit / Delete attendance record state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editDate, setEditDate] = useState('');
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editInZone, setEditInZone] = useState(true);
  const [editOutZone, setEditOutZone] = useState(true);
  const [editLateClockout, setEditLateClockout] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const handleOpenEditModal = (record: any) => {
    setEditingRecord(record);
    setEditDate(record.date || new Date().toISOString().split('T')[0]);

    let clockInStr = '';
    if (record.clock_in_time) {
      try {
        const d = new Date(record.clock_in_time);
        if (!isNaN(d.getTime())) {
          clockInStr = d.toTimeString().slice(0, 5);
        }
      } catch (e) {}
    }
    setEditClockIn(clockInStr);

    let clockOutStr = '';
    if (record.clock_out_time) {
      try {
        const d = new Date(record.clock_out_time);
        if (!isNaN(d.getTime())) {
          clockOutStr = d.toTimeString().slice(0, 5);
        }
      } catch (e) {}
    }
    setEditClockOut(clockOutStr);

    setEditInZone(record.clock_in_within_zone ?? true);
    setEditOutZone(record.clock_out_within_zone ?? true);
    setEditLateClockout(record.is_late_clockout ?? false);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord?.id) return;
    setIsSubmittingEdit(true);
    try {
      const clockInTimestamp = editClockIn ? new Date(`${editDate}T${editClockIn}:00`).toISOString() : null;
      const clockOutTimestamp = editClockOut ? new Date(`${editDate}T${editClockOut}:00`).toISOString() : null;

      const { error } = await supabase
        .from('attendance')
        .update({
          date: editDate,
          clock_in_time: clockInTimestamp,
          clock_out_time: clockOutTimestamp,
          clock_in_within_zone: editInZone,
          clock_out_within_zone: editOutZone,
          is_late_clockout: editLateClockout
        })
        .eq('id', editingRecord.id);

      if (error) throw error;

      alert(t('attendanceAdmin', 'editSuccess', lang));
      setIsEditModalOpen(false);
      setEditingRecord(null);
      fetchAttendanceRecords(selectedDate, selectedMonth, filterMode, selectedEmployeeId);
    } catch (err: any) {
      console.error('Error updating attendance record:', err);
      alert(err.message || t('attendanceAdmin', 'editFailed', lang));
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteAttendance = async (record: any) => {
    if (!record?.id || record.is_leave) return;
    const confirmMsg = `${t('attendanceAdmin', 'confirmDelete', lang)}\n\n${record.user_name} (${record.date})`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', record.id);

      if (error) throw error;

      alert(t('attendanceAdmin', 'deleteSuccess', lang));
      fetchAttendanceRecords(selectedDate, selectedMonth, filterMode, selectedEmployeeId);
    } catch (err: any) {
      console.error('Error deleting attendance record:', err);
      alert(err.message || t('attendanceAdmin', 'deleteFailed', lang));
    }
  };

  const fetchAttendanceRecords = async (
    date: string,
    month: string,
    mode: 'date' | 'month',
    employeeId: string,
    overrideEmployees?: any[]
  ) => {
    if (!employeeId) {
      setAttendanceRecords([]);
      setFilteredRecords([]);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('attendance')
        .select('id,user_id,date,clock_in_time,clock_in_distance,clock_in_within_zone,clock_out_time,clock_out_distance,clock_out_within_zone,is_late_clockout');

      if (employeeId !== 'all') {
        query = query.eq('user_id', employeeId);
      }

      query = query
        .order('date', { ascending: false })
        .order('clock_in_time', { ascending: false });

      if (mode === 'date' && date) {
        query = query.eq('date', date);
      } else if (mode === 'month' && month) {
        const startDate = `${month}-01`;
        const [yearStr, monthStr] = month.split('-');
        let year = parseInt(yearStr);
        let nextMonth = parseInt(monthStr) + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          year += 1;
        }
        const endDate = `${year}-${String(nextMonth).padStart(2, '0')}-01`;
        query = query.gte('date', startDate).lt('date', endDate);
      }

      const { data: records, error } = await query;

      if (error) {
        console.error('Error fetching attendance:', error);
        return;
      }

      // Fetch approved leave requests to inject into the attendance view
      let leaveQuery = supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'Approved');

      if (employeeId !== 'all') {
        leaveQuery = leaveQuery.eq('profile_id', employeeId);
      }

      let filterStartDate = date;
      let filterEndDate = date;

      if (mode === 'date' && date) {
        leaveQuery = leaveQuery.lte('start_date', date).gte('end_date', date);
      } else if (mode === 'month' && month) {
        const startDate = `${month}-01`;
        const [yearStr, monthStr] = month.split('-');
        let year = parseInt(yearStr);
        let nextMonth = parseInt(monthStr) + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          year += 1;
        }
        const endDate = `${year}-${String(nextMonth).padStart(2, '0')}-01`;
        filterStartDate = startDate;
        filterEndDate = endDate;
        // Leave must overlap with the month
        leaveQuery = leaveQuery.lt('start_date', endDate).gte('end_date', startDate);
      }

      const { data: leavesData } = await leaveQuery;

      if (records) {
        const listToSearch = overrideEmployees || uniqueEmployees;
        const enrichedRecords = records.map((r: any) => {
          const employee = listToSearch.find((e: any) => e.id === r.user_id) || profile;
          const nameStr = String(employee?.full_name || employee?.name || 'Unknown');
          return {
            ...r,
            user_name: nameStr
          };
        });

        // Inject mock "On Leave" records for days that have approved leaves but no clock-in
        if (leavesData && leavesData.length > 0) {
          leavesData.forEach((leave: any) => {
            const startDate = new Date(leave.start_date);
            const endDate = new Date(leave.end_date);
            
            // Generate a record for each day in the leave period
            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
              const dayOfWeek = currentDate.getDay();
              // Only inject for weekdays (Mon-Fri)
              if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                const dateStr = currentDate.toISOString().split('T')[0];
                
                // Only add if it falls within the current filter range
                let isWithinFilter = false;
                if (mode === 'date' && dateStr === date) {
                  isWithinFilter = true;
                } else if (mode === 'month' && dateStr >= filterStartDate && dateStr < filterEndDate) {
                  isWithinFilter = true;
                }

                if (isWithinFilter) {
                  // Check if a real attendance record already exists for this user on this day
                  const existingRecord = enrichedRecords.find(r => r.user_id === leave.profile_id && r.date === dateStr);
                  
                  if (!existingRecord) {
                    const employee = listToSearch.find((e: any) => e.id === leave.profile_id) || profile;
                    const empName = String(employee?.full_name || employee?.name || 'Unknown');
                    enrichedRecords.push({
                      id: `leave-${leave.id}-${dateStr}`,
                      user_id: leave.profile_id,
                      user_name: empName,
                      date: dateStr,
                      clock_in_time: null,
                      clock_out_time: null,
                      is_leave: true,
                      leave_type: leave.leave_type
                    });
                  }
                }
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          });
        }

        // Re-sort the enriched records by date descending, then name
        enrichedRecords.sort((a, b) => {
          const dateA = String(a.date || '');
          const dateB = String(b.date || '');
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          const nameA = String(a.user_name || 'Unknown');
          const nameB = String(b.user_name || 'Unknown');
          return nameA.localeCompare(nameB);
        });

        setAttendanceRecords(enrichedRecords);
        setFilteredRecords(enrichedRecords);
      }
    } catch (err) {
      console.error('Exception fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const session = await getCurrentSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`id, department, full_name, salary, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      let roleName = 'No Role';
      let userProfile: any = null;
      if (profileData) {
        if (profileData.roles) {
          const rolesVar = profileData.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        userProfile = { id: profileData.id, department: profileData.department, name: profileData.full_name, role: roleName, salary: profileData.salary };
        setProfile(userProfile);
      }

      // Fetch all active profiles to populate employee search dropdown (excluding resigned)
      let allEmployees: any[] = [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, salary, status')
        .order('full_name', { ascending: true });
      if (profilesData) {
        const activeOnly = profilesData.filter(p => p.status !== 'Resigned' && p.status !== 'Terminated' && p.status !== 'Inactive');
        setUniqueEmployees(activeOnly);
        allEmployees = activeOnly;
      } else if (profileData && profileData.status !== 'Resigned') {
        setUniqueEmployees([profileData]);
        allEmployees = [profileData];
      }

      // Fetch public holidays
      try {
        const { data: holidaysData } = await supabase
          .from('public_holidays')
          .select('*');
        if (holidaysData) {
          setPublicHolidays(holidaysData);
        }
      } catch (err) {
        console.warn('Could not fetch public holidays', err);
      }

      const activeUserId = profileData?.id || session.user.id;
      const initialMode = personalOnly ? 'month' : filterMode;

      if (personalOnly) {
        setSelectedEmployeeId(activeUserId);
        await fetchAttendanceRecords(selectedDate, selectedMonth, initialMode, activeUserId, allEmployees.length > 0 ? allEmployees : [profileData || { id: activeUserId, full_name: 'User' }]);
      } else {
        setSelectedEmployeeId('all');
        await fetchAttendanceRecords(selectedDate, selectedMonth, initialMode, 'all', allEmployees.length > 0 ? allEmployees : [profileData || { id: activeUserId, full_name: 'User' }]);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  const handleFilterModeChange = (mode: 'date' | 'month') => {
    setFilterMode(mode);
    fetchAttendanceRecords(selectedDate, selectedMonth, mode, selectedEmployeeId);
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    fetchAttendanceRecords(date, selectedMonth, filterMode, selectedEmployeeId);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    fetchAttendanceRecords(selectedDate, month, filterMode, selectedEmployeeId);
  };

  const handleEmployeeChange = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    fetchAttendanceRecords(selectedDate, selectedMonth, filterMode, employeeId);
  };

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportMonthlySalary, setExportMonthlySalary] = useState<number>(3000);
  const [exportSalaryAdvance, setExportSalaryAdvance] = useState<number>(0);
  const [exportIrbPcb, setExportIrbPcb] = useState<number>(0);
  const [exportIncludeEpf, setExportIncludeEpf] = useState<boolean>(false);
  const [exportIncludeSocso, setExportIncludeSocso] = useState<boolean>(false);
  const [exportProjectRemainingDays, setExportProjectRemainingDays] = useState<boolean>(true);

  const [empSalaryMap, setEmpSalaryMap] = useState<Record<string, {
    monthlySalary: number;
    salaryAdvance: number;
    irbPcb: number;
    includeEpf: boolean;
    includeSocso: boolean;
    projectRemainingDays: boolean;
    isFromReportTab: boolean;
  }>>({});

  const exportToExcel = () => {
    if (filteredRecords.length === 0) {
      alert(t('attendance', 'noRecordsToExport', lang));
      return;
    }

    const empNames = Array.from(new Set(filteredRecords.map(r => r.user_name || 'Unknown'))).filter(Boolean);
    const initialMap: Record<string, any> = {};

    empNames.forEach(empName => {
      const empProfile = uniqueEmployees.find(e => (e.full_name || e.name) === empName) || (profile?.name === empName ? profile : null);
      const dbSalary = empProfile?.salary ? parseFloat(empProfile.salary) : 0;
      const isFromTab = isFinite(dbSalary) && dbSalary > 0;

      initialMap[empName] = {
        monthlySalary: isFromTab ? dbSalary : 3000,
        salaryAdvance: 0,
        irbPcb: 0,
        includeEpf: false,
        includeSocso: false,
        projectRemainingDays: true,
        isFromReportTab: isFromTab
      };
    });

    setEmpSalaryMap(initialMap);
    setIsExportModalOpen(true);
  };

  const handleEmpSalaryChange = (empName: string, field: string, value: any) => {
    setEmpSalaryMap(prev => ({
      ...prev,
      [empName]: {
        ...prev[empName],
        [field]: value
      }
    }));
  };

  const handleConfirmExport = () => {
    exportAttendanceToExcel(filteredRecords, filterMode, selectedDate, selectedMonth, publicHolidays, {
      monthlySalary: exportMonthlySalary,
      salaryAdvance: exportSalaryAdvance,
      irbPcb: exportIrbPcb,
      includeEpf: exportIncludeEpf,
      includeSocso: exportIncludeSocso,
      projectRemainingDays: exportProjectRemainingDays,
      customSalariesByEmployee: empSalaryMap
    });
    setIsExportModalOpen(false);
  };

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const canEditAttendance = (permissions.edit_attendance || isIT) && !personalOnly;
  const hasAccess = personalOnly || permissions.view_attendance || isIT;

  if (loading || permsLoading) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl">
        {t('attendanceAdmin', 'loading', lang)}
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">

      <div className="p-6 md:p-8 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {personalOnly ? t('attendanceAdmin', 'myTitle', lang) : t('attendanceAdmin', 'title', lang)}
          </h2>
          <p className="text-xs md:text-sm text-indigo-100 mt-1.5 font-medium">
            {personalOnly ? t('attendanceAdmin', 'mySubtitle', lang) : t('attendanceAdmin', 'subtitle', lang)}
          </p>
        </div>
      </div>


      <div className="p-6 md:p-8">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-indigo-600 font-semibold text-sm">{t('attendanceAdmin', 'loading', lang)}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            <div className="space-y-4">

              {!personalOnly && (
                <div className="p-5 rounded-2xl bg-slate-50/30 dark:bg-gray-900/20 border border-slate-200 dark:border-gray-800/80">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-550 mb-2">
                    {t('attendanceAdmin', 'selectEmployee', lang)}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => handleEmployeeChange(e.target.value)}
                      data-custom-select
                      className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all min-h-[48px] appearance-none pr-10 cursor-pointer"
                    >
                      <option value="">{t('attendanceAdmin', 'pleaseSelectEmployee', lang)}</option>
                      <option value="all">{t('attendanceAdmin', 'allEmployees', lang)}</option>
                      {uniqueEmployees.map((emp: any) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500 dark:text-zinc-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter Mode Toggle & Date/Month Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="p-5 rounded-2xl bg-slate-50/30 dark:bg-gray-900/20 border border-slate-200 dark:border-gray-800/80">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-550 mb-2">
                    {t('attendanceAdmin', 'filterBy', lang)}
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFilterModeChange('date')}
                      className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs md:text-sm transition-all min-h-[48px] border ${
                        filterMode === 'date'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100'
                          : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {t('attendanceAdmin', 'byDate', lang)}
                    </button>
                    <button
                      onClick={() => handleFilterModeChange('month')}
                      className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs md:text-sm transition-all min-h-[48px] border ${
                        filterMode === 'month'
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100'
                          : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {t('attendanceAdmin', 'byMonth', lang)}
                    </button>
                  </div>
                </div>

                {/* Date/Month Input */}
                <div className="p-5 rounded-2xl bg-slate-50/30 dark:bg-gray-900/20 border border-slate-200 dark:border-gray-800/80">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-550 mb-2">
                    {filterMode === 'date' ? t('attendanceAdmin', 'selectDate', lang) : t('attendanceAdmin', 'selectMonth', lang)}
                  </label>
                  <input
                    type={filterMode === 'date' ? 'date' : 'month'}
                    value={filterMode === 'date' ? selectedDate : selectedMonth}
                    onChange={(e) => filterMode === 'date' ? handleDateChange(e.target.value) : handleMonthChange(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 transition-all min-h-[48px]"
                  />
                </div>
              </div>


              <button
                onClick={exportToExcel}
                className="w-full px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black text-xs md:text-sm font-semibold tracking-wide transition-all flex items-center justify-center gap-2 min-h-[48px] shadow-sm border border-indigo-600 dark:border-yellow-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                <span>{t('attendanceAdmin', 'exportExcel', lang)} ({filteredRecords.length} {t('attendanceAdmin', 'records', lang)})</span>
              </button>
            </div>


            <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black shadow-sm mt-4 overflow-hidden">
              {/* Mobile Card View (md:hidden) */}
              <div className="md:hidden space-y-3 p-3">
                {!selectedEmployeeId ? (
                  <div className="p-8 text-center text-slate-450 dark:text-zinc-550 font-medium italic bg-slate-50/50 dark:bg-gray-900/30 rounded-xl">
                    {t('attendanceAdmin', 'selectFromDropdown', lang)}
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="p-8 text-center text-slate-450 dark:text-zinc-500 font-medium italic bg-slate-50/50 dark:bg-gray-900/30 rounded-xl">
                    {t('attendanceAdmin', 'noRecords', lang)} {filterMode === 'date' ? selectedDate : selectedMonth}
                  </div>
                ) : (
                  filteredRecords.map((record) => {
                    const formatDateSafe = (dateStr: any, locale: string) => {
                      if (!dateStr) return '-';
                      try {
                        const s = String(dateStr).trim();
                        const parts = s.split('-');
                        if (parts.length === 3) {
                          const year = parseInt(parts[0], 10);
                          const month = parseInt(parts[1], 10) - 1;
                          const day = parseInt(parts[2], 10);
                          const d = new Date(year, month, day);
                          if (!isNaN(d.getTime())) {
                            return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
                          }
                        }
                        const d = new Date(s);
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
                        }
                      } catch (e) {}
                      return String(dateStr);
                    };

                    const formatTimeSafe = (timeStr: any) => {
                      if (!timeStr) return '-';
                      try {
                        const s = String(timeStr).trim();
                        if (s.includes(':') && !s.includes('T')) {
                          const parts = s.split(':');
                          if (parts.length >= 2) {
                            const hh = parseInt(parts[0], 10);
                            const mm = parts[1];
                            if (!isNaN(hh)) {
                              const ampm = hh >= 12 ? 'PM' : 'AM';
                              const displayHh = hh % 12 || 12;
                              return `${String(displayHh).padStart(2, '0')}:${mm} ${ampm}`;
                            }
                          }
                        }
                        const d = new Date(s);
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                      } catch (e) {}
                      return String(timeStr);
                    };

                    return (
                      <div
                        key={record.id}
                        className="p-4 rounded-2xl bg-white dark:bg-gray-850 border border-slate-200 dark:border-gray-800 shadow-xs space-y-3"
                      >
                        {/* Top: Name & Date */}
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                              {personalOnly
                                ? formatDateSafe(record.date, lang === 'bm' ? 'ms-MY' : 'en-US')
                                : (record.user_name === 'Unknown' ? t('attendanceAdmin', 'unknown', lang) : record.user_name)}
                            </h4>
                            {!personalOnly && record.date && (
                              <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono font-medium block mt-0.5">
                                📅 {formatDateSafe(record.date, lang === 'bm' ? 'ms-MY' : 'en-US')}
                              </span>
                            )}
                          </div>

                          {canEditAttendance && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(record)}
                                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20 dark:text-yellow-500 rounded-lg transition-colors"
                                title={t('attendanceAdmin', 'editRecord', lang)}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAttendance(record)}
                                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-400 rounded-lg transition-colors"
                                title={t('attendanceAdmin', 'deleteRecord', lang)}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {record.is_leave ? (
                          <div className="p-3 bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/20 rounded-xl font-semibold text-xs text-center flex items-center justify-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z" />
                            </svg>
                            <span>On Leave {record.leave_type ? `(${record.leave_type})` : ''}</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-gray-900 rounded-xl border border-slate-150 dark:border-gray-800">
                            {/* Check In Block */}
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">
                                🟢 {t('attendanceAdmin', 'colCheckIn', lang)}
                              </span>
                              {record.clock_in_time ? (
                                <div className="mt-1 space-y-1">
                                  <p className="font-mono font-bold text-slate-800 dark:text-zinc-200 text-xs">
                                    {formatTimeSafe(record.clock_in_time)}
                                  </p>
                                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                                    {record.clock_in_distance}{t('attendance', 'away', lang)}
                                  </p>
                                  <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded border ${
                                    record.clock_in_within_zone
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                      : 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50'
                                  }`}>
                                    {record.clock_in_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs mt-1 block font-medium">-</span>
                              )}
                            </div>

                            {/* Check Out Block */}
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">
                                🔴 {t('attendanceAdmin', 'colCheckOut', lang)}
                              </span>
                              {record.clock_out_time ? (
                                <div className="mt-1 space-y-1">
                                  <p className="font-mono font-bold text-slate-800 dark:text-zinc-200 text-xs">
                                    {formatTimeSafe(record.clock_out_time)}
                                  </p>
                                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                                    {record.clock_out_distance !== null ? `${record.clock_out_distance}${t('attendance', 'away', lang)}` : t('attendanceAdmin', 'noLocationData', lang)}
                                  </p>
                                  <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded border ${
                                    record.clock_out_within_zone
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                      : 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50'
                                  }`}>
                                    {record.clock_out_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                                  </span>
                                  {record.is_late_clockout && (
                                    <span className="block text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400 mt-0.5">
                                      {t('attendanceAdmin', 'flaggedLate', lang)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-amber-700 dark:text-yellow-500 font-semibold text-xs bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/30 inline-block mt-1">
                                  {t('attendanceAdmin', 'pending', lang)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[700px] text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">
                        {personalOnly ? t('attendance', 'date', lang) : t('attendanceAdmin', 'colEmployee', lang)}
                      </th>
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colCheckIn', lang)}</th>
                      <th className="px-5 py-3.5 text-center font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colStatus', lang)}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colCheckOut', lang)}</th>
                      <th className="px-5 py-3.5 text-center font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colStatus', lang)}</th>
                      {canEditAttendance && (
                        <th className="px-5 py-3.5 text-center font-semibold text-slate-500 dark:text-zinc-400 text-xs">
                          {t('reports', 'colActions', lang) || 'Actions'}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-805">
                    {!selectedEmployeeId ? (
                      <tr>
                        <td colSpan={canEditAttendance ? 6 : 5} className="px-6 py-12 text-center text-slate-450 dark:text-zinc-550 font-medium italic">
                          {t('attendanceAdmin', 'selectFromDropdown', lang)}
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={canEditAttendance ? 6 : 5} className="px-6 py-12 text-center text-slate-450 dark:text-zinc-500 font-medium italic">
                          {t('attendanceAdmin', 'noRecords', lang)} {filterMode === 'date' ? selectedDate : selectedMonth}
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((record) => {
                        const formatDateSafe = (dateStr: any, locale: string) => {
                          if (!dateStr) return '-';
                          try {
                            const s = String(dateStr).trim();
                            const parts = s.split('-');
                            if (parts.length === 3) {
                              const year = parseInt(parts[0], 10);
                              const month = parseInt(parts[1], 10) - 1;
                              const day = parseInt(parts[2], 10);
                              const d = new Date(year, month, day);
                              if (!isNaN(d.getTime())) {
                                return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
                              }
                            }
                            const d = new Date(s);
                            if (!isNaN(d.getTime())) {
                              return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
                            }
                          } catch (e) {}
                          return String(dateStr);
                        };

                        const formatTimeSafe = (timeStr: any) => {
                          if (!timeStr) return '-';
                          try {
                            const s = String(timeStr).trim();
                            if (s.includes(':') && !s.includes('T')) {
                              const parts = s.split(':');
                              if (parts.length >= 2) {
                                const hh = parseInt(parts[0], 10);
                                const mm = parts[1];
                                if (!isNaN(hh)) {
                                  const ampm = hh >= 12 ? 'PM' : 'AM';
                                  const displayHh = hh % 12 || 12;
                                  return `${String(displayHh).padStart(2, '0')}:${mm} ${ampm}`;
                                }
                              }
                            }
                            const d = new Date(s);
                            if (!isNaN(d.getTime())) {
                              return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }
                          } catch (e) {}
                          return String(timeStr);
                        };

                        return (
                          <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40">
                            <td className="px-5 py-4">
                              {personalOnly ? (
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {formatDateSafe(record.date, lang === 'bm' ? 'ms-MY' : 'en-US')}
                                </p>
                              ) : (
                                <>
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {record.user_name === 'Unknown' ? t('attendanceAdmin', 'unknown', lang) : record.user_name}
                                  </p>
                                  {filterMode === 'month' && record.date && (
                                    <p className="text-base text-slate-600 dark:text-zinc-300 mt-1 font-medium">
                                      {formatDateSafe(record.date, lang === 'bm' ? 'ms-MY' : 'en-US')}
                                    </p>
                                  )}
                                </>
                              )}
                            </td>
                            {record.is_leave ? (
                              <td colSpan={canEditAttendance ? 5 : 4} className="px-5 py-4 text-center">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/20 font-semibold text-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z" />
                                  </svg>
                                  On Leave {record.leave_type ? `(${record.leave_type})` : ''}
                                </span>
                              </td>
                            ) : (
                              <>
                                <td className="px-5 py-4">
                                  {record.clock_in_time ? (
                                    <div>
                                      <p className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">
                                        {formatTimeSafe(record.clock_in_time)}
                                      </p>
                                      <p className="text-[11px] text-slate-450 dark:text-zinc-400 mt-0.5">
                                        {record.clock_in_distance}{t('attendance', 'away', lang)}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 font-medium">-</span>
                                  )}
                                </td>
                                <td className="px-5 py-4 text-center">
                                  {record.clock_in_time && (
                                    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                                      record.clock_in_within_zone
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                        : 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50'
                                    }`}>
                                      {record.clock_in_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-4">
                                  {record.clock_out_time ? (
                                    <div>
                                      <p className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">
                                        {formatTimeSafe(record.clock_out_time)}
                                      </p>
                                      <p className="text-[11px] text-slate-450 dark:text-zinc-400 mt-0.5">
                                        {record.clock_out_distance !== null ? `${record.clock_out_distance}${t('attendance', 'away', lang)}` : t('attendanceAdmin', 'noLocationData', lang)}
                                      </p>
                                      {record.is_late_clockout && (
                                        <span className="mt-1 inline-flex items-center text-[10px] font-semibold uppercase px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50">
                                          {t('attendanceAdmin', 'flaggedLate', lang)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-amber-700 dark:text-yellow-500 font-semibold text-xs bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded-md border border-amber-100 dark:border-amber-900/30">
                                      {t('attendanceAdmin', 'pending', lang)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-4 text-center">
                                  {record.clock_out_time && (
                                    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                                      record.clock_out_within_zone
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                        : 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50'
                                    }`}>
                                      {record.clock_out_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                                    </span>
                                  )}
                                </td>
                                {canEditAttendance && (
                                  <td className="px-5 py-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(record)}
                                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20 dark:text-yellow-500 rounded-lg transition-colors"
                                        title={t('attendanceAdmin', 'editRecord', lang)}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAttendance(record)}
                                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-400 rounded-lg transition-colors"
                                        title={t('attendanceAdmin', 'deleteRecord', lang)}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>


            {filteredRecords.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-6 border-t border-slate-200 dark:border-gray-800">

                <div className="p-5 rounded-2xl border border-slate-200 dark:border-gray-800 bg-slate-50/20 dark:bg-gray-900/40 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-500">{t('attendanceAdmin', 'statTotalIn', lang)}</p>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">
                    {filteredRecords.filter((r) => r.clock_in_time).length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{t('common', 'of', lang)} {filteredRecords.length} {t('attendanceAdmin', 'statEmployees', lang)}</p>
                </div>


                <div className="p-5 rounded-2xl border border-emerald-100 dark:border-yellow-500/30 bg-emerald-50/30 dark:bg-black/10 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-yellow-500">{t('attendanceAdmin', 'statInZone', lang)}</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-300 mt-2">
                    {filteredRecords.filter((r) => r.clock_in_within_zone).length}
                  </p>
                  <p className="text-xs text-emerald-500 dark:text-yellow-500/80 mt-1">{t('attendanceAdmin', 'statOnSite', lang)}</p>
                </div>


                <div className="p-5 rounded-2xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-950/10 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">{t('attendanceAdmin', 'statOutside', lang)}</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">
                    {filteredRecords.filter((r) => r.clock_in_time && !r.clock_in_within_zone).length}
                  </p>
                  <p className="text-xs text-rose-500 dark:text-rose-500/80 mt-1">{t('attendanceAdmin', 'statFlagged', lang)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── EXPORT ATTENDANCE & PAYROLL MODAL ────────────────────────────────────── */}
      {isExportModalOpen && (() => {
        const targetMonthStr = filterMode === 'month' ? selectedMonth : selectedDate.slice(0, 7);
        const [yStr, mStr] = targetMonthStr.split('-');
        const previewYear = parseInt(yStr || '2026');
        const previewMonthIdx = parseInt(mStr || '01') - 1;
        const previewDaysInMonth = new Date(previewYear, previewMonthIdx + 1, 0).getDate();

        let previewWorkingDays = 0;
        let previewRestDays = 0;
        let previewNonWeekendHolidays = 0;

        for (let d = 1; d <= previewDaysInMonth; d++) {
          const dt = new Date(previewYear, previewMonthIdx, d);
          const dayOfWeek = dt.getDay();
          const dStr = `${previewYear}-${String(previewMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          if (isWeekend) {
            previewRestDays++;
          } else {
            previewWorkingDays++;
            if (publicHolidays.some(h => h.date === dStr)) {
              previewNonWeekendHolidays++;
            }
          }
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        let prevSick = 0;
        let prevAnnual = 0;
        let prevHospital = 0;
        let prevUnpaid = 0;
        let prevAwol = 0;

        for (let d = 1; d <= previewDaysInMonth; d++) {
          const dStr = `${previewYear}-${String(previewMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dt = new Date(previewYear, previewMonthIdx, d);
          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
          const isHoliday = publicHolidays.some(h => h.date === dStr);

          const dayRecs = filteredRecords.filter(r => r.date === dStr);
          const leaveRec = dayRecs.find(r => r.is_leave);

          if (leaveRec) {
            const type = (leaveRec.leave_type || '').toLowerCase();
            const dayVal = leaveRec.total_days ? Number(leaveRec.total_days) : (leaveRec.session_type?.includes('Half') ? 0.5 : 1);
            if (type.includes('sick') || type.includes('mc')) prevSick += dayVal;
            else if (type.includes('hospital')) prevHospital += dayVal;
            else if (type.includes('unpaid')) prevUnpaid += dayVal;
            else prevAnnual += dayVal;
          } else if (!isWeekend && !isHoliday && dayRecs.length === 0) {
            const isFutureOrToday = dStr >= todayStr;
            if (isFutureOrToday && exportProjectRemainingDays) {
              // Projected as worked for full month estimation
            } else {
              prevAwol += 1;
            }
          }
        }

        const empSalaries = Object.values(empSalaryMap);
        const previewMonthlySalary = empSalaries.length > 0 ? (empSalaries[0].monthlySalary || 2400) : (exportMonthlySalary || 2400);
        const previewSalaryAdvance = empSalaries.length > 0 ? empSalaries.reduce((sum, e) => sum + (e.salaryAdvance || 0), 0) : exportSalaryAdvance;
        const previewIrbPcb = empSalaries.length > 0 ? empSalaries.reduce((sum, e) => sum + (e.irbPcb || 0), 0) : exportIrbPcb;
        const previewIncludeEpf = empSalaries.length > 0 ? empSalaries.some(e => e.includeEpf) : exportIncludeEpf;
        const previewIncludeSocso = empSalaries.length > 0 ? empSalaries.some(e => e.includeSocso) : exportIncludeSocso;

        const prevTotalUnpaid = prevUnpaid + prevAwol;
        const prevEligibleSalary = prevTotalUnpaid === 0
          ? previewMonthlySalary
          : Math.max(0, previewMonthlySalary - (previewMonthlySalary / previewDaysInMonth) * prevTotalUnpaid);
        const prevEpf = previewIncludeEpf ? Math.round(prevEligibleSalary * 0.11 * 100) / 100 : 0;
        const prevSocso = previewIncludeSocso ? Math.min(19.75, Math.round(prevEligibleSalary * 0.005 * 100) / 100) : 0;
        const prevEis = previewIncludeSocso ? Math.min(7.90, Math.round(prevEligibleSalary * 0.002 * 100) / 100) : 0;
        const prevTotalDeductions = prevEpf + prevSocso + prevEis + previewIrbPcb + previewSalaryAdvance;
        const prevSalaryInHand = Math.max(0, prevEligibleSalary - prevTotalDeductions);

        const formatDaysDisplay = (num: number) => Number.isInteger(num) ? String(Math.round(num)) : String(Number(num.toFixed(1)));
        const paidDaysCountStr = formatDaysDisplay(previewDaysInMonth - prevTotalUnpaid);
        const totalUnpaidDaysStr = formatDaysDisplay(prevTotalUnpaid);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto my-auto">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>📊</span> {t('attendanceAdmin', 'exportModalTitle', lang)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    {t('attendanceAdmin', 'exportModalSub', lang)} ({targetMonthStr})
                  </p>
                </div>
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="p-2 rounded-xl text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Global Projection Option */}
              <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-indigo-900 dark:text-indigo-300 select-none">
                  <input
                    type="checkbox"
                    checked={exportProjectRemainingDays}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setExportProjectRemainingDays(val);
                      setEmpSalaryMap(prev => {
                        const updated: Record<string, any> = {};
                        Object.keys(prev).forEach(k => {
                          updated[k] = { ...prev[k], projectRemainingDays: val };
                        });
                        return updated;
                      });
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                  />
                  <span>🗓️ {t('attendanceAdmin', 'projectRemainingDaysLabel', lang)}</span>
                </label>
              </div>

              {/* Employee Salaries & Payroll Configuration (Aligned to Staff Report) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    {lang === 'bm' ? 'Konfigurasi Gaji Pekerja (Diselaraskan dari Laporan Staf)' : 'Employee Salary Configuration (Aligned from Staff Report)'}
                  </h4>
                </div>

                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {Object.entries(empSalaryMap).map(([empName, opts]) => (
                    <div key={empName} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{empName}</span>
                        {opts.isFromReportTab ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                            ✓ {lang === 'bm' ? 'Selaras Laporan Staf' : 'Aligned to Staff Report'} (RM {opts.monthlySalary.toFixed(2)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                            ✏️ {lang === 'bm' ? 'Input Manual (Gaji Staf Belum Set)' : 'Manual Input (Report Salary Not Set)'}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                            {t('attendanceAdmin', 'monthlySalary', lang)} (RM)
                          </label>
                          <input
                            type="number"
                            value={opts.monthlySalary}
                            onChange={(e) => handleEmpSalaryChange(empName, 'monthlySalary', Number(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                            {t('attendanceAdmin', 'salaryAdvance', lang)} (RM)
                          </label>
                          <input
                            type="number"
                            value={opts.salaryAdvance}
                            onChange={(e) => handleEmpSalaryChange(empName, 'salaryAdvance', Number(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                            {t('attendanceAdmin', 'irbPcb', lang)} (RM)
                          </label>
                          <input
                            type="number"
                            value={opts.irbPcb}
                            onChange={(e) => handleEmpSalaryChange(empName, 'irbPcb', Number(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold pt-1 border-t border-slate-200/60 dark:border-slate-700/40">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-zinc-300 select-none">
                          <input
                            type="checkbox"
                            checked={opts.includeEpf}
                            onChange={(e) => handleEmpSalaryChange(empName, 'includeEpf', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                          />
                          <span>{t('attendanceAdmin', 'includeEpfLabel', lang)}</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-zinc-300 select-none">
                          <input
                            type="checkbox"
                            checked={opts.includeSocso}
                            onChange={(e) => handleEmpSalaryChange(empName, 'includeSocso', e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                          />
                          <span>{t('attendanceAdmin', 'includeSocsoLabel', lang)}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                
                {/* Paid & Days Breakdown Card */}
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                  <div className="font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-400 border-b border-indigo-200 dark:border-indigo-900/60 pb-1.5 flex items-center justify-between">
                    <span>{t('attendanceAdmin', 'paidDaySection', lang)}</span>
                    <span className="text-[10px] bg-indigo-200 dark:bg-indigo-900 px-2 py-0.5 rounded text-indigo-950 dark:text-indigo-200">
                      {paidDaysCountStr} / {formatDaysDisplay(previewDaysInMonth)} {t('common', 'days', lang)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'numDaysInMonth', lang)}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatDaysDisplay(previewDaysInMonth)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'numWorkingDays', lang)}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatDaysDisplay(previewWorkingDays)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'numRestDays', lang)}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatDaysDisplay(previewRestDays)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'additionalHolidaysExclRest', lang)}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatDaysDisplay(previewNonWeekendHolidays)}</span>
                  </div>
                  <div className="pt-1 border-t border-indigo-100 dark:border-indigo-900/40 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">• {t('attendanceAdmin', 'sickLeave', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatDaysDisplay(prevSick)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">• {t('attendanceAdmin', 'annualLeave', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatDaysDisplay(prevAnnual)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">• {t('attendanceAdmin', 'hospitalizationLeave', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatDaysDisplay(prevHospital)}</span>
                    </div>
                  </div>
                </div>

                {/* Unpaid & Rejection Card */}
                <div className="p-4 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 space-y-2">
                  <div className="font-bold uppercase tracking-wider text-rose-900 dark:text-rose-400 border-b border-rose-200 dark:border-rose-900/60 pb-1.5 flex items-center justify-between">
                    <span>{t('attendanceAdmin', 'unpaidDaySection', lang)} & {t('attendanceAdmin', 'rejectionSection', lang)}</span>
                    <span className="text-[10px] bg-rose-200 dark:bg-rose-900 px-2 py-0.5 rounded text-rose-950 dark:text-rose-200">
                      {totalUnpaidDaysStr} {t('common', 'days', lang)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'leaveWithoutPayAwol', lang)}</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">{totalUnpaidDaysStr} day(s)</span>
                  </div>
                  
                  <div className="pt-2 border-t border-rose-100 dark:border-rose-900/40 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'employeeEpf', lang)} (11%)</span>
                      <span className="font-medium text-slate-900 dark:text-white">RM {prevEpf.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'socsoEmployee', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">RM {prevSocso.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'employeeEis', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">RM {prevEis.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'irbPcb', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">RM {exportIrbPcb.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">{t('attendanceAdmin', 'salaryAdvance', lang)}</span>
                      <span className="font-medium text-slate-900 dark:text-white">RM {exportSalaryAdvance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Salary Results Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">
                    {t('attendanceAdmin', 'eligibleSalary', lang)}: <strong className="text-slate-900 dark:text-white">RM {prevEligibleSalary.toFixed(2)}</strong>
                  </p>
                  <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {t('attendanceAdmin', 'salaryInHand', lang)}: RM {prevSalaryInHand.toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={() => setIsExportModalOpen(false)}
                    className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition-all"
                  >
                    {t('common', 'cancel', lang)}
                  </button>
                  <button
                    onClick={handleConfirmExport}
                    className="flex-1 md:flex-initial px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <span>📊</span>
                    <span>{t('attendanceAdmin', 'downloadReport', lang)}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
      {/* Edit Attendance Record Modal */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                {t('attendanceAdmin', 'editTitle', lang)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {editingRecord.user_name}
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 bg-white dark:bg-black">
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  {t('attendance', 'date', lang)}
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {t('attendanceAdmin', 'colCheckIn', lang)}
                  </label>
                  <input
                    type="time"
                    value={editClockIn}
                    onChange={(e) => setEditClockIn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    {t('attendanceAdmin', 'colCheckOut', lang)}
                  </label>
                  <input
                    type="time"
                    value={editClockOut}
                    onChange={(e) => setEditClockOut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-gray-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editInZone}
                    onChange={(e) => setEditInZone(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {t('attendanceAdmin', 'inZone', lang)} (Clock In)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editOutZone}
                    onChange={(e) => setEditOutZone(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {t('attendanceAdmin', 'inZone', lang)} (Clock Out)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editLateClockout}
                    onChange={(e) => setEditLateClockout(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {t('attendanceAdmin', 'flaggedLate', lang)}
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                  }}
                  disabled={isSubmittingEdit}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl transition-all"
                >
                  {t('common', 'cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black font-semibold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingEdit ? t('common', 'saving', lang) : t('common', 'save', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
