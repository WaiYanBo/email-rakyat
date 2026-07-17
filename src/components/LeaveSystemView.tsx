import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import type { Language } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

interface LeaveBalance {
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
  hospitalisation_total: number;
  hospitalisation_used: number;
  maternity_total: number;
  maternity_used: number;
  paternity_total: number;
  paternity_used: number;
  unpaid_used: number;
}

interface LeaveRequest {
  id: string;
  profile_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  session_type: string;
  total_days: number;
  reason: string;
  attachment_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    department: string;
  };
}

interface StaffBalanceWithProfile {
  id: string;
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
  hospitalisation_total: number;
  hospitalisation_used: number;
  maternity_total: number;
  maternity_used: number;
  paternity_total: number;
  paternity_used: number;
  unpaid_used: number;
  profiles: {
    full_name: string;
    department: string;
  };
}

interface LeaveSystemViewProps {
  profile: any;
}

export default function LeaveSystemView({ profile }: LeaveSystemViewProps) {
  const { lang } = usePortalLanguage() as { lang: Language };
  const { permissions } = usePermissions(profile);
  const [activeSubTab, setActiveSubTab] = useState<'myleaves' | 'dashboard'>('myleaves');
  const [dashboardSubTab, setDashboardSubTab] = useState<'pending' | 'balances' | 'calendar'>('pending');

  // Employee states
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);

  // Form states
  const [leaveType, setLeaveType] = useState('Annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sessionType, setSessionType] = useState('Full Day');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [daysCount, setDaysCount] = useState(0);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dashboard / Admin states
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [staffBalances, setStaffBalances] = useState<StaffBalanceWithProfile[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<LeaveRequest[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Rejection modal states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<LeaveRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Edit balances states
  const [selectedStaffBalanceId, setSelectedStaffBalanceId] = useState<string>('');
  const [isEditingBalancesInline, setIsEditingBalancesInline] = useState(false);
  const [editAnnualTotal, setEditAnnualTotal] = useState<string>('0');
  const [editSickTotal, setEditSickTotal] = useState<string>('0');
  const [editHospitalisationTotal, setEditHospitalisationTotal] = useState<string>('0');
  const [editMaternityTotal, setEditMaternityTotal] = useState<string>('0');
  const [editPaternityTotal, setEditPaternityTotal] = useState<string>('0');
  const [isUpdatingBalances, setIsUpdatingBalances] = useState(false);

  // Calendar navigation states
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const isApprover = profile?.department === 'Human Resources' || permissions.edit_staff || isIT;
  const isActionAllowed = ['CEO', 'CFO', 'COO', 'CPO'].includes(profile?.role || '');

  useEffect(() => {
    fetchEmployeeData();
    fetchHolidays();
    if (isApprover) {
      fetchAdminData();
    }
  }, [profile, isApprover]);

  useEffect(() => {
    if (staffBalances.length > 0 && !selectedStaffBalanceId) {
      setSelectedStaffBalanceId(staffBalances[0].id);
    }
  }, [staffBalances, selectedStaffBalanceId]);

  // Recalculate working days dynamically when inputs change
  useEffect(() => {
    if (startDate && endDate) {
      const days = calculateWorkingDays(startDate, endDate, sessionType, holidays);
      setDaysCount(days);
    } else {
      setDaysCount(0);
    }
  }, [startDate, endDate, sessionType, holidays]);

  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('public_holidays')
        .select('date');
      if (error) throw error;
      if (data) {
        setHolidays(data.map((h: any) => h.date));
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
    }
  };

  const fetchEmployeeData = async () => {
    if (!profile?.id) return;
    setBalancesLoading(true);
    try {
      // 1. Fetch balances
      const { data: balanceData, error: balanceError } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('profile_id', profile.id)
        .single();

      if (balanceError && balanceError.code !== 'PGRST116') throw balanceError;
      if (balanceData) {
        setBalance(balanceData);
      }

      // 2. Fetch requests (joining approver details)
      const { data: requestData, error: requestError } = await supabase
        .from('leave_requests')
        .select('*, approver:profiles!approved_by(full_name, roles(role_name))')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });

      if (requestError) throw requestError;
      if (requestData) {
        setRequests(requestData);
      }
    } catch (err) {
      console.error('Error loading employee leave data:', err);
    } finally {
      setBalancesLoading(false);
    }
  };

  const fetchAdminData = async () => {
    setAdminLoading(true);
    try {
      // 1. Fetch pending
      const { data: pendingData, error: pendingError } = await supabase
        .from('leave_requests')
        .select('*, profiles!profile_id(full_name, department)')
        .eq('status', 'Pending')
        .order('created_at', { ascending: true });
      if (pendingError) throw pendingError;
      setPendingRequests(pendingData || []);

      // 2. Fetch balances (joining roles to exclude BOD)
      const { data: balancesData, error: balancesError } = await supabase
        .from('leave_balances')
        .select('*, profiles(full_name, department, roles(role_name))');
      if (balancesError) throw balancesError;
      
      const filteredBalances = (balancesData || []).filter((sb: any) => {
        const dept = sb.profiles?.department?.toUpperCase();
        
        let roleName = '';
        if (sb.profiles?.roles) {
          const rolesVar = sb.profiles.roles as any;
          roleName = Array.isArray(rolesVar) ? (rolesVar[0]?.role_name || '') : (rolesVar?.role_name || '');
        }
        roleName = roleName.toUpperCase();

        const isBOD = dept === 'BOD' || dept === 'BOARD' || ['CHAIRMAN', 'CEO', 'COO', 'CFO', 'CPO'].includes(roleName);
        return !isBOD;
      });
      setStaffBalances(filteredBalances);

      // 3. Fetch approved leaves for calendar
      const { data: approvedData, error: approvedError } = await supabase
        .from('leave_requests')
        .select('*, profiles!profile_id(full_name, department)')
        .eq('status', 'Approved');
      if (approvedError) throw approvedError;
      setApprovedRequests(approvedData || []);
    } catch (err) {
      console.error('Error loading admin leave data:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  const calculateWorkingDays = (
    startStr: string,
    endStr: string,
    session: string,
    holidayList: string[]
  ): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (end < start) return 0;

    if (session !== 'Full Day' && startStr === endStr) {
      return 0.5;
    }

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sat (6) and Sun (0)
        const dateString = current.toISOString().split('T')[0];
        if (!holidayList.includes(dateString)) {
          count++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!startDate || !endDate || !reason) {
      setFormError(t('leave', 'fillRequired', lang));
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setFormError(t('leave', 'invalidDates', lang));
      return;
    }

    if (sessionType !== 'Full Day' && startDate !== endDate) {
      setFormError(lang === 'bm' ? 'Sesi separuh hari hanya boleh dipilih untuk tarikh mula dan tamat yang sama.' : 'Half day session is only allowed if start and end dates match.');
      return;
    }

    if (daysCount <= 0) {
      setFormError(lang === 'bm' ? 'Permohonan tidak mengandungi hari bekerja.' : 'Request duration does not include any working days.');
      return;
    }

    // Check balances
    if (balance) {
      const remainingAnnual = balance.annual_total - balance.annual_used;
      const remainingSick = balance.sick_total - balance.sick_used;
      const remainingHosp = balance.hospitalisation_total - balance.hospitalisation_used;
      const remainingMat = balance.maternity_total - balance.maternity_used;
      const remainingPat = balance.paternity_total - balance.paternity_used;

      if (leaveType === 'Annual' && daysCount > remainingAnnual) {
        setFormError(t('leave', 'insufficientBalance', lang));
        return;
      }
      if (leaveType === 'Sick' && daysCount > remainingSick) {
        setFormError(t('leave', 'insufficientBalance', lang));
        return;
      }
      if (leaveType === 'Hospitalisation' && daysCount > remainingHosp) {
        setFormError(t('leave', 'insufficientBalance', lang));
        return;
      }
      if (leaveType === 'Maternity' && daysCount > remainingMat) {
        setFormError(t('leave', 'insufficientBalance', lang));
        return;
      }
      if (leaveType === 'Paternity' && daysCount > remainingPat) {
        setFormError(t('leave', 'insufficientBalance', lang));
        return;
      }
    }

    setFormSubmitting(true);

    try {
      let attachmentUrl = null;

      // Handle Attachment Upload
      if (file) {
        const fileExt = file.name.split('.').pop();
        const filePath = `${profile.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('leave_attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        attachmentUrl = filePath;
      }

      // Submit leave request
      const { error: submitError } = await supabase
        .from('leave_requests')
        .insert([
          {
            profile_id: profile.id,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            session_type: sessionType,
            total_days: daysCount,
            reason: reason,
            attachment_url: attachmentUrl,
            status: 'Pending',
          },
        ]);

      if (submitError) throw submitError;

      alert(t('leave', 'successSubmit', lang));

      // Reset form
      setStartDate('');
      setEndDate('');
      setReason('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      fetchEmployeeData();
      if (isApprover) fetchAdminData();
    } catch (err: any) {
      console.error('Error submitting leave:', err);
      setFormError(t('leave', 'errorSubmit', lang));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCancelRequest = async (item: LeaveRequest) => {
    if (!window.confirm(t('leave', 'cancelConfirm', lang))) return;

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'Cancelled' })
        .eq('id', item.id);

      if (error) throw error;

      alert(t('leave', 'successCancel', lang));
      fetchEmployeeData();
      if (isApprover) fetchAdminData();
    } catch (err) {
      console.error('Error cancelling leave:', err);
    }
  };

  const handleApprove = async (item: LeaveRequest) => {
    if (!window.confirm(t('leave', 'confirmApprove', lang))) return;

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'Approved', approved_by: profile.id })
        .eq('id', item.id);

      if (error) throw error;

      alert(t('leave', 'successApprove', lang));
      fetchAdminData();
      fetchEmployeeData();
    } catch (err) {
      console.error('Error approving request:', err);
    }
  };

  const handleRejectClick = (item: LeaveRequest) => {
    setRejectingItem(item);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectingItem || !rejectionReason.trim()) return;

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'Rejected',
          approved_by: profile.id,
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', rejectingItem.id);

      if (error) throw error;

      alert(t('leave', 'successReject', lang));
      setShowRejectModal(false);
      setRejectingItem(null);
      fetchAdminData();
      fetchEmployeeData();
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const handleEditBalancesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffBalanceId) return;

    setIsUpdatingBalances(true);
    try {
      const { error } = await supabase
        .from('leave_balances')
        .update({
          annual_total: parseFloat(editAnnualTotal) || 0.0,
          sick_total: parseFloat(editSickTotal) || 0.0,
          hospitalisation_total: parseFloat(editHospitalisationTotal) || 0.0,
          maternity_total: parseFloat(editMaternityTotal) || 0.0,
          paternity_total: parseFloat(editPaternityTotal) || 0.0,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedStaffBalanceId);

      if (error) throw error;

      alert(lang === 'bm' ? 'Baki cuti kakitangan berjaya dikemas kini!' : 'Staff leave balances successfully updated!');
      setIsEditingBalancesInline(false);
      fetchAdminData();
    } catch (err: any) {
      console.error('Error updating leave balances:', err);
      alert(lang === 'bm' ? 'Gagal mengemas kini baki cuti: ' + err.message : 'Failed to update leave balances: ' + err.message);
    } finally {
      setIsUpdatingBalances(false);
    }
  };

  const handleDownloadProof = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('leave_attachments')
        .createSignedUrl(path, 300);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      console.error('Error fetching download link:', err);
    }
  };

  // Calendar helper calculations
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentCalendarDate);
    const startOffset = getFirstDayOfMonth(currentCalendarDate);
    const monthName = currentCalendarDate.toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-US', { month: 'long', year: 'numeric' });
    const weekDays = lang === 'bm' ? ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const cells: React.ReactNode[] = [];

    // Empty cells for alignment
    for (let i = 0; i < startOffset; i++) {
      cells.push(<div key={`empty-${i}`} className="bg-slate-50/50 dark:bg-black/10 min-h-[90px] border-b border-r border-slate-100 dark:border-zinc-800"></div>);
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
      const cellDateStr = cellDate.toISOString().split('T')[0];

      // Find approved leaves overlapping this day
      const leavesOnThisDay = approvedRequests.filter((req) => {
        const start = new Date(req.start_date);
        const end = new Date(req.end_date);
        return cellDate >= start && cellDate <= end;
      });

      const isHoliday = holidays.includes(cellDateStr);
      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;

      cells.push(
        <div key={day} className={`min-h-[90px] border-b border-r border-slate-100 dark:border-zinc-800 p-1 flex flex-col justify-between ${isHoliday ? 'bg-indigo-500/5' : isWeekend ? 'bg-slate-50/30 dark:bg-black/10' : 'bg-white dark:bg-zinc-900/10'
          }`}>
          <div className="flex justify-between items-center px-1">
            <span className={`text-xs font-bold ${isHoliday ? 'text-indigo-600 dark:text-yellow-500' : isWeekend ? 'text-slate-400' : 'text-slate-700 dark:text-zinc-300'
              }`}>
              {day}
            </span>
            {isHoliday && (
              <span className="text-[8px] bg-indigo-50 text-indigo-700 dark:bg-yellow-500/10 dark:text-yellow-500 px-1 py-0.5 rounded font-black max-w-[50px] truncate" title="Public Holiday">
                HOLIDAY
              </span>
            )}
          </div>

          <div className="space-y-0.5 mt-1 overflow-y-auto max-h-[60px] pr-0.5 scrollbar-thin">
            {leavesOnThisDay.map((leave) => (
              <div
                key={leave.id}
                className="text-[9px] font-semibold px-1 py-0.5 rounded truncate bg-indigo-50 border border-indigo-150 text-indigo-755 dark:bg-zinc-850 dark:border-zinc-700 dark:text-yellow-500/80 shadow-xs"
                title={`${leave.profiles?.full_name} (${t('leave', leave.leave_type.toLowerCase(), lang)})`}
              >
                {leave.profiles?.full_name.split(' ')[0]} ({leave.leave_type[0]}L)
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950 shadow-sm animate-fade-in">
        {/* Month Selector header */}
        <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider">{monthName}</span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-l border-t border-slate-100 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 gap-0">
          {/* Weekday headers */}
          {weekDays.map((wd) => (
            <div key={wd} className="text-center py-2 text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 border-b border-r border-slate-150 dark:border-zinc-800">
              {wd}
            </div>
          ))}
          {cells}
        </div>
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500 border border-amber-100 dark:border-amber-500/25 rounded-md text-[10px] font-black uppercase tracking-wider">
            {t('leave', 'statusPending', lang)}
          </span>
        );
      case 'Approved':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500 border border-emerald-100 dark:border-emerald-500/25 rounded-md text-[10px] font-black uppercase tracking-wider">
            {t('leave', 'statusApproved', lang)}
          </span>
        );
      case 'Rejected':
        return (
          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-500 border border-rose-100 dark:border-rose-500/25 rounded-md text-[10px] font-black uppercase tracking-wider">
            {t('leave', 'statusRejected', lang)}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 bg-slate-50 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-150 dark:border-zinc-700 rounded-md text-[10px] font-black uppercase tracking-wider">
            {t('leave', 'statusCancelled', lang)}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Switch Header tabs for Employee View vs Admin View */}
      {isApprover && (
        <div className="flex bg-slate-100/50 dark:bg-gray-900/40 p-1 rounded-xl border border-slate-200/80 dark:border-gray-800/80 w-fit gap-1">
          <button
            onClick={() => setActiveSubTab('myleaves')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all min-h-[38px] ${activeSubTab === 'myleaves'
                ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-yellow-500 shadow-sm'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
          >
            {t('leave', 'tabMyLeave', lang)}
          </button>
          <button
            onClick={() => setActiveSubTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all min-h-[38px] ${activeSubTab === 'dashboard'
                ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-yellow-500 shadow-sm'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
          >
            {t('leave', 'tabDashboard', lang)}
          </button>
        </div>
      )}

      {activeSubTab === 'myleaves' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Side: Balances Cards + Submit Form */}
          <div className="lg:col-span-2 space-y-8">
            {/* Balances Board */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-550 mb-4">
                My Leave Balances
              </h3>
              {balancesLoading ? (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-500 animate-pulse bg-slate-50/50 dark:bg-zinc-900/20 border border-slate-100 dark:border-zinc-800 rounded-xl">
                  {t('leave', 'loadingBalances', lang)}
                </div>
              ) : !balance ? (
                <div className="p-8 text-center text-rose-500 bg-rose-50/50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-950/20 rounded-xl">
                  {t('leave', 'noBalancesFound', lang)}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {/* Annual Leave */}
                  <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/10 dark:from-indigo-950/20 dark:to-indigo-900/5 border border-indigo-150/40 dark:border-indigo-900/20 p-4 rounded-2xl shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400 block mb-1">
                      {t('leave', 'annual', lang)}
                    </span>
                    <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                      {balance.annual_total - balance.annual_used} <span className="text-xs font-semibold text-slate-400">/ {balance.annual_total} {t('leave', 'days', lang)}</span>
                    </p>
                    <div className="w-full bg-slate-200/50 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (balance.annual_used / balance.annual_total) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Sick Leave */}
                  <div className="bg-gradient-to-br from-amber-50/50 to-amber-100/10 dark:from-amber-950/20 dark:to-amber-900/5 border border-amber-150/40 dark:border-amber-900/20 p-4 rounded-2xl shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400 block mb-1">
                      {t('leave', 'sick', lang)}
                    </span>
                    <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                      {balance.sick_total - balance.sick_used} <span className="text-xs font-semibold text-slate-400">/ {balance.sick_total} {t('leave', 'days', lang)}</span>
                    </p>
                    <div className="w-full bg-slate-200/50 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (balance.sick_used / balance.sick_total) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Hospitalisation */}
                  <div className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-900/5 border border-emerald-150/40 dark:border-emerald-900/20 p-4 rounded-2xl shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 dark:text-emerald-400 block mb-1">
                      {t('leave', 'hospitalisation', lang)}
                    </span>
                    <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                      {balance.hospitalisation_total - balance.hospitalisation_used} <span className="text-xs font-semibold text-slate-400">/ {balance.hospitalisation_total} {t('leave', 'days', lang)}</span>
                    </p>
                    <div className="w-full bg-slate-200/50 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (balance.hospitalisation_used / balance.hospitalisation_total) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Family Support Leaves (Maternity/Paternity/Unpaid) */}
                  <div className="bg-gradient-to-br from-rose-50/50 to-rose-100/10 dark:from-rose-950/20 dark:to-rose-900/5 border border-rose-150/40 dark:border-rose-900/20 p-4 rounded-2xl shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-455 block mb-1">
                      Maternity / Paternity
                    </span>
                    <p className="text-lg font-black text-slate-800 dark:text-white">
                      Mat: {balance.maternity_total - balance.maternity_used}d
                    </p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">
                      Pat: {balance.paternity_total - balance.paternity_used}d
                    </p>
                  </div>

                  {/* Unpaid Leave Info */}
                  <div className="bg-gradient-to-br from-slate-50/50 to-slate-100/10 dark:from-zinc-900/30 dark:to-zinc-850/10 border border-slate-200/40 dark:border-zinc-800 p-4 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-1">
                      {t('leave', 'unpaid', lang)}
                    </span>
                    <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                      {balance.unpaid_used} <span className="text-xs font-semibold text-slate-400">{t('leave', 'used', lang)}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Leave History List */}
            <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6">
              <h3 className="text-sm font-bold text-slate-850 dark:text-zinc-200 mb-4">
                {t('leave', 'myRequests', lang)}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colType', lang)}</th>
                      <th className="py-2.5 pb-3 font-semibold">{t('leave', 'startDate', lang)}</th>
                      <th className="py-2.5 pb-3 font-semibold">{t('leave', 'endDate', lang)}</th>
                      <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colDuration', lang)}</th>
                      <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colStatus', lang)}</th>
                      <th className="py-2.5 pb-3 font-semibold text-right">{t('leave', 'colActions', lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-zinc-900/50">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-zinc-500 italic">
                          {t('leave', 'noHistory', lang)}
                        </td>
                      </tr>
                    ) : (
                      requests.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/20">
                          <td className="py-3 font-bold text-slate-700 dark:text-zinc-300">
                            {t('leave', item.leave_type.toLowerCase(), lang)}
                            {item.session_type !== 'Full Day' && (
                              <span className="block text-[9px] text-slate-400 dark:text-zinc-500 font-medium">
                                ({item.session_type})
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-slate-500 dark:text-zinc-400">
                            {new Date(item.start_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-slate-500 dark:text-zinc-400">
                            {new Date(item.end_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 font-bold text-slate-700 dark:text-zinc-200">
                            {item.total_days} {item.total_days === 1 ? t('leave', 'day', lang) : t('leave', 'days', lang)}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col gap-1 items-start">
                              {getStatusBadge(item.status)}
                              
                              {/* Display who approved or rejected the request */}
                              {(item.status === 'Approved' || item.status === 'Rejected') && (item as any).approver && (
                                <span className="text-[9px] text-slate-400 dark:text-zinc-550 font-medium leading-tight">
                                  {item.status === 'Approved' ? 'Approved' : 'Rejected'} by: <br/>
                                  <strong className="text-slate-600 dark:text-zinc-300">{(item as any).approver.full_name}</strong> {(() => {
                                    const approver = (item as any).approver;
                                    const rolesVar = approver.roles;
                                    const roleName = Array.isArray(rolesVar) ? (rolesVar[0]?.role_name || '') : (rolesVar?.role_name || '');
                                    return roleName ? `(${roleName})` : '';
                                  })()}
                                </span>
                              )}

                              {item.status === 'Rejected' && item.rejection_reason && (
                                <span className="text-[10px] text-rose-500 italic font-medium mt-1">
                                  "{item.rejection_reason}"
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            {item.status === 'Pending' && (
                              <button
                                onClick={() => handleCancelRequest(item)}
                                className="px-2.5 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md border border-rose-100 font-bold transition-colors"
                              >
                                {t('leave', 'cancelBtn', lang)}
                              </button>
                            )}
                            {item.attachment_url && (
                              <button
                                onClick={() => handleDownloadProof(item.attachment_url!)}
                                className="px-2 py-1 text-[10px] bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 rounded-md border border-slate-200 dark:border-zinc-700 font-bold transition-colors ml-2"
                              >
                                MC
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Side: Apply Form panel */}
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 h-fit">
            <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200 mb-5 pb-2 border-b border-slate-100 dark:border-zinc-800">
              {t('leave', 'applyLeave', lang)}
            </h3>

            <form onSubmit={handleApplyLeave} className="space-y-4">
              {formError && (
                <div className="p-3 text-xs font-semibold bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-500 border border-rose-150 dark:border-rose-500/20 rounded-xl">
                  {formError}
                </div>
              )}

              {/* Leave Type */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                  {t('leave', 'leaveType', lang)}
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Annual">{t('leave', 'annual', lang)}</option>
                  <option value="Sick">{t('leave', 'sick', lang)}</option>
                  <option value="Hospitalisation">{t('leave', 'hospitalisation', lang)}</option>
                  <option value="Maternity">{t('leave', 'maternity', lang)}</option>
                  <option value="Paternity">{t('leave', 'paternity', lang)}</option>
                  <option value="Compassionate">{t('leave', 'compassionate', lang)}</option>
                  <option value="Marriage">{t('leave', 'marriage', lang)}</option>
                  <option value="Emergency">{t('leave', 'emergency', lang)}</option>
                  <option value="Unpaid">{t('leave', 'unpaid', lang)}</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                  {t('leave', 'startDate', lang)}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onClick={(e) => {}}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                  {t('leave', 'endDate', lang)}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onClick={(e) => {}}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Session Type (Half Day vs Full Day) - Only shown/relevant if same date */}
              {startDate === endDate && startDate !== '' && (
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                    {t('leave', 'session', lang)}
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg">
                    {['Full Day', 'AM Half', 'PM Half'].map((sess) => (
                      <button
                        key={sess}
                        type="button"
                        onClick={() => setSessionType(sess)}
                        className={`py-1 text-[9px] font-bold rounded ${sessionType === sess
                            ? 'bg-white dark:bg-gray-800 text-indigo-650 dark:text-yellow-500 shadow-sm'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                          }`}
                      >
                        {sess === 'Full Day' ? t('leave', 'fullDay', lang) : sess === 'AM Half' ? 'AM' : 'PM'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Calculation Days Display */}
              {startDate && endDate && (
                <div className="py-2.5 px-3.5 bg-slate-50 dark:bg-zinc-900/50 border border-slate-150 dark:border-zinc-800 rounded-xl flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">{t('leave', 'daysCalculated', lang)}</span>
                  <span className="text-slate-800 dark:text-white font-black text-sm">
                    {daysCount} {daysCount === 1 ? t('leave', 'day', lang) : t('leave', 'days', lang)}
                  </span>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                  {t('leave', 'reason', lang)}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('leave', 'reasonPlaceholder', lang)}
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              {/* File Attachment */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500 tracking-wider mb-1.5">
                  {t('leave', 'attachment', lang)}
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 px-3 focus:outline-none file:mr-4 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-indigo-50 file:text-indigo-700 dark:file:bg-yellow-500/10 dark:file:text-yellow-500"
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={formSubmitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {formSubmitting ? t('common', 'loading', lang) : t('leave', 'submitRequest', lang)}
              </button>
            </form>
          </div>
        </div>
      ) : (
        // HR/Manager views
        <div className="space-y-8 animate-fade-in">
          {/* Sub menu controls */}
          <div className="flex bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-1 w-fit gap-1">
            <button
              onClick={() => setDashboardSubTab('pending')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${dashboardSubTab === 'pending'
                  ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              {lang === 'bm' ? 'Kelulusan' : 'Approvals'} ({pendingRequests.length})
            </button>
            <button
              onClick={() => setDashboardSubTab('balances')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${dashboardSubTab === 'balances'
                  ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              {lang === 'bm' ? 'Semua Baki' : 'Staff Balances'}
            </button>
            <button
              onClick={() => setDashboardSubTab('calendar')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${dashboardSubTab === 'calendar'
                  ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              {lang === 'bm' ? 'Kalendar Roster' : 'Roster Calendar'}
            </button>
          </div>

          {adminLoading ? (
            <div className="p-16 text-center text-slate-500 animate-pulse bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl">
              {t('common', 'loading', lang)}
            </div>
          ) : (
            <>
              {/* Approvals tab */}
              {dashboardSubTab === 'pending' && (
                <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6">
                  <h3 className="text-sm font-bold text-slate-850 dark:text-zinc-200 mb-4">
                    {t('leave', 'pendingApprovals', lang)}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colEmployee', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colType', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'startDate', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'endDate', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colDuration', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'reason', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold">{t('leave', 'colAttachment', lang)}</th>
                          <th className="py-2.5 pb-3 font-semibold text-right">{t('leave', 'colActions', lang)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-zinc-900/50">
                        {pendingRequests.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-400 dark:text-zinc-500 italic">
                              {t('leave', 'noPending', lang)}
                            </td>
                          </tr>
                        ) : (
                          pendingRequests.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/20">
                              <td className="py-3 font-bold text-slate-800 dark:text-zinc-200">
                                {item.profiles?.full_name}
                                <span className="block text-[10px] text-slate-450 dark:text-zinc-500 font-medium">
                                  {item.profiles?.department}
                                </span>
                              </td>
                              <td className="py-3 text-slate-700 dark:text-zinc-300 font-semibold">
                                {t('leave', item.leave_type.toLowerCase(), lang)}
                                {item.session_type !== 'Full Day' && (
                                  <span className="block text-[9px] text-slate-400 dark:text-zinc-500 font-medium">
                                    ({item.session_type})
                                  </span>
                                )}
                              </td>
                              <td className="py-3 text-slate-500 dark:text-zinc-400">
                                {new Date(item.start_date).toLocaleDateString()}
                              </td>
                              <td className="py-3 text-slate-500 dark:text-zinc-400">
                                {new Date(item.end_date).toLocaleDateString()}
                              </td>
                              <td className="py-3 font-black text-slate-800 dark:text-zinc-200">
                                {item.total_days} {item.total_days === 1 ? t('leave', 'day', lang) : t('leave', 'days', lang)}
                              </td>
                              <td className="py-3 text-slate-500 dark:text-zinc-400 max-w-[200px] truncate" title={item.reason}>
                                {item.reason}
                              </td>
                              <td className="py-3">
                                {item.attachment_url ? (
                                  <button
                                    onClick={() => handleDownloadProof(item.attachment_url!)}
                                    className="text-indigo-600 hover:text-indigo-800 dark:text-yellow-500 dark:hover:text-yellow-400 font-bold"
                                  >
                                    {t('leave', 'viewAttachment', lang)}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">--</span>
                                )}
                              </td>
                              <td className="py-3 text-right space-x-2 whitespace-nowrap">
                                {isActionAllowed ? (
                                  <>
                                    <button
                                      onClick={() => handleApprove(item)}
                                      className="px-2.5 py-1 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 font-bold transition-colors"
                                    >
                                      {t('leave', 'approveBtn', lang)}
                                    </button>
                                    <button
                                      onClick={() => handleRejectClick(item)}
                                      className="px-2.5 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md border border-rose-200 font-bold transition-colors"
                                    >
                                      {t('leave', 'rejectBtn', lang)}
                                    </button>
                                  </>
                                ) : (
                                  getStatusBadge(item.status)
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Balances Directory tab (WP / Gov style select & edit) */}
              {dashboardSubTab === 'balances' && (
                <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-850 dark:text-zinc-200 mb-2">
                      {t('leave', 'staffBalances', lang)}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
                      {lang === 'bm' 
                        ? 'Sila pilih seorang kakitangan dari senarai untuk melihat dan melaraskan peruntukan baki cuti mereka.' 
                        : 'Select a staff member from the dropdown to view and adjust their leave entitlement balances.'}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-450 dark:text-zinc-500">
                        {lang === 'bm' ? 'Pilih Kakitangan:' : 'Select Staff:'}
                      </label>
                      <select
                        value={selectedStaffBalanceId}
                        onChange={(e) => {
                          setSelectedStaffBalanceId(e.target.value);
                          setIsEditingBalancesInline(false);
                        }}
                        className="w-full sm:w-96 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {staffBalances.map((sb) => (
                          <option key={sb.id} value={sb.id}>
                            {sb.profiles?.full_name || 'System User'} {sb.profiles?.department ? `(${sb.profiles.department})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const currentRecord = staffBalances.find(sb => sb.id === selectedStaffBalanceId);
                    if (!currentRecord) {
                      return (
                        <div className="p-8 text-center text-slate-400 dark:text-zinc-550 bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-100 dark:border-zinc-800 rounded-xl">
                          {lang === 'bm' ? 'Sila pilih kakitangan.' : 'Please select a staff member.'}
                        </div>
                      );
                    }

                    if (isEditingBalancesInline) {
                      // WORDPRESS / GOVT WP-TABLE STYLE EDIT VIEW!
                      return (
                        <form onSubmit={handleEditBalancesSubmit} className="bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-150 dark:border-zinc-800/85 rounded-2xl p-6 space-y-6">
                          <div className="pb-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-black uppercase text-indigo-900 dark:text-yellow-500">
                                {lang === 'bm' ? 'Ubah Peruntukan Baki Cuti' : 'Adjust Leave Entitlement Settings'}
                              </h4>
                              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                                {currentRecord.profiles?.full_name} · {currentRecord.profiles?.department || 'No Department'}
                              </p>
                            </div>
                          </div>

                          {/* wordpress/govt form-table styled rows */}
                          <div className="space-y-4 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            
                            {/* Annual Leave Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 py-3 border-b border-slate-100 dark:border-zinc-800/40 items-center gap-2">
                              <label className="font-bold text-slate-700 dark:text-zinc-300 md:col-span-1">
                                {t('leave', 'annual', lang)}
                              </label>
                              <div className="md:col-span-2 space-y-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editAnnualTotal}
                                  onChange={(e) => setEditAnnualTotal(e.target.value)}
                                  className="w-32 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  required
                                />
                                <p className="text-[10px] text-slate-400 dark:text-zinc-550 font-medium">
                                  {lang === 'bm' 
                                    ? 'Jumlah hari peruntukan Cuti Tahunan. Tetapkan ke 0 jika tidak layak (contohnya freelance atau kontraktor).' 
                                    : 'Total allocated days for Annual Leave. Set to 0 if not entitled (e.g. freelance or contract worker).'}
                                </p>
                              </div>
                            </div>

                            {/* Sick Leave Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 py-3 border-b border-slate-100 dark:border-zinc-800/40 items-center gap-2">
                              <label className="font-bold text-slate-700 dark:text-zinc-300 md:col-span-1">
                                {t('leave', 'sick', lang)}
                              </label>
                              <div className="md:col-span-2 space-y-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editSickTotal}
                                  onChange={(e) => setEditSickTotal(e.target.value)}
                                  className="w-32 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  required
                                />
                                <p className="text-[10px] text-slate-400 dark:text-zinc-550 font-medium">
                                  {lang === 'bm'
                                    ? 'Jumlah hari peruntukan Cuti Sakit. Tetapkan ke 0 jika tidak layak.'
                                    : 'Total allocated days for Sick Leave. Set to 0 if not entitled.'}
                                </p>
                              </div>
                            </div>

                            {/* Hospitalisation Leave Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 py-3 border-b border-slate-100 dark:border-zinc-800/40 items-center gap-2">
                              <label className="font-bold text-slate-700 dark:text-zinc-300 md:col-span-1">
                                {t('leave', 'hospitalisation', lang)}
                              </label>
                              <div className="md:col-span-2 space-y-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editHospitalisationTotal}
                                  onChange={(e) => setEditHospitalisationTotal(e.target.value)}
                                  className="w-32 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  required
                                />
                                <p className="text-[10px] text-slate-450 dark:text-zinc-550 font-medium">
                                  {lang === 'bm'
                                    ? 'Peruntukan Cuti Hospitalisasi (Standard: 60 hari).'
                                    : 'Allocated Hospitalisation Leave days (Standard: 60 days).'}
                                </p>
                              </div>
                            </div>

                            {/* Maternity Leave Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 py-3 border-b border-slate-100 dark:border-zinc-800/40 items-center gap-2">
                              <label className="font-bold text-slate-700 dark:text-zinc-300 md:col-span-1">
                                Maternity Leave
                              </label>
                              <div className="md:col-span-2 space-y-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editMaternityTotal}
                                  onChange={(e) => setEditMaternityTotal(e.target.value)}
                                  className="w-32 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  required
                                />
                                <p className="text-[10px] text-slate-450 dark:text-zinc-550 font-medium">
                                  {lang === 'bm'
                                    ? 'Peruntukan Cuti Bersalin untuk kakitangan wanita (Standard: 98 hari).'
                                    : 'Maternity Leave days for female employees (Standard: 98 days).'}
                                </p>
                              </div>
                            </div>

                            {/* Paternity Leave Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 py-3 border-slate-100 dark:border-zinc-800/40 items-center gap-2">
                              <label className="font-bold text-slate-700 dark:text-zinc-300 md:col-span-1">
                                Paternity Leave
                              </label>
                              <div className="md:col-span-2 space-y-1">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={editPaternityTotal}
                                  onChange={(e) => setEditPaternityTotal(e.target.value)}
                                  className="w-32 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  required
                                />
                                <p className="text-[10px] text-slate-450 dark:text-zinc-550 font-medium">
                                  {lang === 'bm'
                                    ? 'Peruntukan Cuti Paternity untuk kakitangan lelaki (Standard: 7 hari).'
                                    : 'Paternity Leave days for male employees (Standard: 7 days).'}
                                </p>
                              </div>
                            </div>

                          </div>

                          <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setIsEditingBalancesInline(false)}
                              className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white hover:bg-slate-100 border border-slate-200 dark:bg-zinc-850 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-800 rounded-xl transition-all"
                            >
                              {t('leave', 'cancelBtn', lang)}
                            </button>
                            <button
                              type="submit"
                              disabled={isUpdatingBalances}
                              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black rounded-xl transition-all disabled:opacity-50"
                            >
                              {isUpdatingBalances 
                                ? t('common', 'loading', lang) 
                                : (lang === 'bm' ? 'Simpan Perubahan' : 'Save Changes')}
                            </button>
                          </div>
                        </form>
                      );
                    }

                    // NORMAL VIEW DETAILS PANEL
                    return (
                      <div className="bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-150 dark:border-zinc-800/80 rounded-2xl p-6 space-y-6">
                        <div className="pb-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wide">
                              {lang === 'bm' ? 'Perincian Kelayakan Cuti' : 'Leave Entitlement Details'}
                            </h4>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-550 font-bold uppercase tracking-wider mt-0.5">
                              {currentRecord.profiles?.full_name} · {currentRecord.profiles?.department || 'No Department'}
                            </p>
                          </div>
                          
                          {isActionAllowed && (
                            <button
                              onClick={() => {
                                setEditAnnualTotal(currentRecord.annual_total.toString());
                                setEditSickTotal(currentRecord.sick_total.toString());
                                setEditHospitalisationTotal(currentRecord.hospitalisation_total.toString());
                                setEditMaternityTotal(currentRecord.maternity_total.toString());
                                setEditPaternityTotal(currentRecord.paternity_total.toString());
                                setIsEditingBalancesInline(true);
                              }}
                              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                              <span>{lang === 'bm' ? 'Ubah Entri' : 'Edit Entitlements'}</span>
                            </button>
                          )}
                        </div>

                        {/* Large, high contrast detail metrics */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          
                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              {t('leave', 'annual', lang)}
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.annual_total - currentRecord.annual_used} <span className="text-xs font-semibold text-slate-400">/ {currentRecord.annual_total} {t('leave', 'days', lang)} {lang === 'bm' ? 'baki' : 'remaining'}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{currentRecord.annual_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'}</p>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              {t('leave', 'sick', lang)}
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.sick_total - currentRecord.sick_used} <span className="text-xs font-semibold text-slate-400">/ {currentRecord.sick_total} {t('leave', 'days', lang)}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{currentRecord.sick_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'}</p>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              {t('leave', 'hospitalisation', lang)}
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.hospitalisation_total - currentRecord.hospitalisation_used} <span className="text-xs font-semibold text-slate-400">/ {currentRecord.hospitalisation_total} {t('leave', 'days', lang)}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{currentRecord.hospitalisation_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'}</p>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              Maternity Leave
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.maternity_total - currentRecord.maternity_used} <span className="text-xs font-semibold text-slate-400">/ {currentRecord.maternity_total} {t('leave', 'days', lang)}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{currentRecord.maternity_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'}</p>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              Paternity Leave
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.paternity_total - currentRecord.paternity_used} <span className="text-xs font-semibold text-slate-400">/ {currentRecord.paternity_total} {t('leave', 'days', lang)}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{currentRecord.paternity_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'}</p>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block mb-1">
                              {t('leave', 'unpaid', lang)}
                            </span>
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              {currentRecord.unpaid_used} <span className="text-xs font-semibold text-slate-400">{t('leave', 'used', lang)}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{lang === 'bm' ? 'Cuti tanpa gaji yang telah diluluskan' : 'Approved unpaid leave days'}</p>
                          </div>

                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Roster Calendar tab */}
              {dashboardSubTab === 'calendar' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                        {t('leave', 'leaveCalendar', lang)}
                      </h3>
                      <p className="text-[10px] text-slate-450 dark:text-zinc-500 font-semibold mt-0.5">
                        Overview of active approved leaves for this month
                      </p>
                    </div>
                  </div>
                  {renderCalendar()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Rejection reason modal */}
      {showRejectModal && rejectingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-zinc-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-950/50">
              <h3 className="text-slate-800 dark:text-white font-black text-sm uppercase tracking-wider">{t('leave', 'rejectionTitle', lang)}</h3>
              <button
                onClick={() => { setShowRejectModal(false); setRejectingItem(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-zinc-550 tracking-wider mb-1.5">
                  {t('leave', 'rejectionReasonLabel', lang)}
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={t('leave', 'rejectionPlaceholder', lang)}
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectingItem(null); }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  {t('leave', 'cancelBtn', lang)}
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={!rejectionReason.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-500/10 dark:text-rose-500 rounded-xl border border-rose-100 dark:border-rose-500/20 disabled:opacity-50 transition-colors"
                >
                  {t('leave', 'rejectBtn', lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
