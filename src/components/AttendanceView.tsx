import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { exportAttendanceToExcel } from '../utils/excelExport';
export default function AttendanceView() {
  const [profile, setProfile] = useState<any>(null);
  const { permissions, loading: permsLoading } = usePermissions(profile);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'date' | 'month'>('date');
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [uniqueEmployees, setUniqueEmployees] = useState<any[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const { lang } = usePortalLanguage();

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`id, department, full_name, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      let roleName = 'No Role';
      if (profileData) {
        if (profileData.roles) {
          const rolesVar = profileData.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        setProfile({ id: profileData.id, department: profileData.department, name: profileData.full_name, role: roleName });
      }

      // Fetch all profiles to populate employee search dropdown
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      if (profilesData) {
        setUniqueEmployees(profilesData);
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

      setLoading(false);
    };

    loadData();
  }, []);

  const fetchAttendanceRecords = async (date: string, month: string, mode: 'date' | 'month', employeeId: string) => {
    if (!employeeId) {
      setAttendanceRecords([]);
      setFilteredRecords([]);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('attendance')
        .select('id,user_id,date,check_in_time,check_in_distance,check_in_within_zone,check_out_time,check_out_distance,check_out_within_zone,is_late_checkout');

      if (employeeId !== 'all') {
        query = query.eq('user_id', employeeId);
      }

      query = query
        .order('date', { ascending: false })
        .order('check_in_time', { ascending: false });

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

      if (records) {
        const enrichedRecords = records.map((r: any) => {
          const employee = uniqueEmployees.find((e: any) => e.id === r.user_id);
          return {
            ...r,
            user_name: employee ? employee.full_name : 'Unknown'
          };
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

  const exportToExcel = () => {
    if (filteredRecords.length === 0) {
      alert('No records to export');
      return;
    }

    // Call the new utility function
    exportAttendanceToExcel(filteredRecords, filterMode, selectedDate, selectedMonth, publicHolidays);
  };

  const hasAccess = permissions.view_attendance || ['HR', 'CFO', 'IT Admin'].includes(profile?.role || '');

  if (loading || permsLoading) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl">
        Loading Attendance Records...
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden mb-8 shadow-sm">

      <div className="p-6 md:p-8 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {t('attendanceAdmin', 'title', lang)}
          </h2>
          <p className="text-xs md:text-sm text-indigo-100 mt-1.5 font-medium">
            {t('attendanceAdmin', 'subtitle', lang)}
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

              <div className="p-5 rounded-2xl bg-slate-50/30 dark:bg-gray-900/20 border border-slate-200 dark:border-gray-800/80">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-550 mb-2">
                  {lang === 'bm' ? 'Pilih Pekerja' : 'Select Employee'}
                </label>
                <div className="relative">
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-205 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all min-h-[48px] appearance-none pr-10 cursor-pointer"
                  >
                    <option value="">{lang === 'bm' ? 'Sila Pilih Pekerja...' : 'Please Select Employee...'}</option>
                    <option value="all">{lang === 'bm' ? 'Semua Pekerja' : 'All Employees'}</option>
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


            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black shadow-sm mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colEmployee', lang)}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colCheckIn', lang)}</th>
                      <th className="px-5 py-3.5 text-center font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colStatus', lang)}</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colCheckOut', lang)}</th>
                      <th className="px-5 py-3.5 text-center font-semibold text-slate-500 dark:text-zinc-400 text-xs">{t('attendanceAdmin', 'colStatus', lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-zinc-805">
                    {!selectedEmployeeId ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-450 dark:text-zinc-500 font-medium italic">
                          {lang === 'bm' ? 'Sila pilih pekerja dari senarai di atas.' : 'Please select an employee from the dropdown list above.'}
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-450 dark:text-zinc-500 font-medium italic">
                          {t('attendanceAdmin', 'noRecords', lang)} {filterMode === 'date' ? selectedDate : selectedMonth}
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((record, idx) => (
                        <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900 dark:text-white">{record.user_name}</p>
                            {filterMode === 'month' && record.date && (
                              <p className="text-base text-slate-600 dark:text-zinc-300 mt-1 font-medium">
                                {new Date(record.date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-US', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {record.check_in_time ? (
                              <div>
                                <p className="font-semibold text-slate-805 dark:text-zinc-150 text-sm">
                                  {new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-[11px] text-slate-450 dark:text-zinc-400 mt-0.5">
                                  {record.check_in_distance}m away
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium">-</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {record.check_in_time && (
                              <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                                record.check_in_within_zone
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                  : 'bg-rose-50 text-rose-800 border-rose-105 dark:bg-rose-955/20 dark:text-rose-400 dark:border-rose-900/50'
                              }`}>
                                {record.check_in_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {record.check_out_time ? (
                              <div>
                                <p className="font-semibold text-slate-805 dark:text-zinc-155 text-sm">
                                  {new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-[11px] text-slate-450 dark:text-zinc-400 mt-0.5">
                                  {record.check_out_distance !== null ? `${record.check_out_distance}m away` : 'No location data'}
                                </p>
                                {record.is_late_checkout && (
                                  <span className="mt-1 inline-flex items-center text-[10px] font-semibold uppercase px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-955/20 dark:text-rose-400 dark:border-rose-900/50">
                                    Flagged Late
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-705 dark:text-yellow-500 font-semibold text-xs bg-amber-50 dark:bg-amber-955/20 px-2.5 py-1 rounded-md border border-amber-105 dark:border-amber-900/30">
                                {t('attendanceAdmin', 'pending', lang)}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {record.check_out_time && (
                              <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${
                                record.check_out_within_zone
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30'
                                  : 'bg-rose-50 text-rose-800 border-rose-105 dark:bg-rose-955/20 dark:text-rose-400 dark:border-rose-900/50'
                              }`}>
                                {record.check_out_within_zone ? t('attendanceAdmin', 'inZone', lang) : t('attendanceAdmin', 'outside', lang)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>


            {filteredRecords.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-6 border-t border-slate-200 dark:border-gray-800">

                <div className="p-5 rounded-2xl border border-slate-200 dark:border-gray-800 bg-slate-50/20 dark:bg-gray-900/40 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-500">{t('attendanceAdmin', 'statTotalIn', lang)}</p>
                  <p className="text-3xl font-bold text-slate-805 dark:text-white mt-2">
                    {filteredRecords.filter((r) => r.check_in_time).length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{t('common', 'of', lang)} {filteredRecords.length} {t('attendanceAdmin', 'statEmployees', lang)}</p>
                </div>


                <div className="p-5 rounded-2xl border border-emerald-100 dark:border-yellow-500/30 bg-emerald-50/30 dark:bg-black/10 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-yellow-500">{t('attendanceAdmin', 'statInZone', lang)}</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-300 mt-2">
                    {filteredRecords.filter((r) => r.check_in_within_zone).length}
                  </p>
                  <p className="text-xs text-emerald-500 dark:text-yellow-500/80 mt-1">{t('attendanceAdmin', 'statOnSite', lang)}</p>
                </div>


                <div className="p-5 rounded-2xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-955/10 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-455">{t('attendanceAdmin', 'statOutside', lang)}</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">
                    {filteredRecords.filter((r) => r.check_in_time && !r.check_in_within_zone).length}
                  </p>
                  <p className="text-xs text-rose-500 dark:text-rose-500/80 mt-1">{t('attendanceAdmin', 'statFlagged', lang)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
