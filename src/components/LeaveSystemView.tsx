import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import type { Language } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { calculateLeaveAccrual, type AccrualCalculation } from './ReportsView';

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
  const [employeeAccrual, setEmployeeAccrual] = useState<AccrualCalculation | null>(null);
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

  const userRole = (profile?.role || '').toUpperCase();
  const userDept = (profile?.department || '').toLowerCase();
  const isIT = userDept === 'it' || userRole.includes('IT');
  const isExecutive = ['CEO', 'CFO', 'COO', 'CPO', 'DIRECTOR', 'CHAIRMAN', 'PRESIDENT', 'MANAGEMENT'].includes(userRole);
  const isHR = userDept === 'human resources' || userRole.includes('HR') || userRole.includes('HUMAN RESOURCE');
  const hasHRPerms = Boolean(permissions?.manage_hr || permissions?.edit_staff || permissions?.manage_leave);

  // Approvers who can view the admin tabs
  const isApprover = isHR || hasHRPerms || isIT || isExecutive || userRole.includes('ADMIN');
  // Authorized users who can edit entitlements and take actions
  const isActionAllowed = isHR || hasHRPerms || isIT || isExecutive || userRole.includes('ADMIN');

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
      // 1. Fetch balances and employee profile details
      const [balanceRes, profileRes] = await Promise.all([
        supabase.from('leave_balances').select('*').eq('profile_id', profile.id).single(),
        supabase.from('profiles').select('id, full_name, remarks, roles(role_name)').eq('id', profile.id).single()
      ]);

      if (balanceRes.error && balanceRes.error.code !== 'PGRST116') throw balanceRes.error;

      let sDate = '';
      let eDate = '';
      let empType = 'Contract of Service';
      let isWorking = true;

      const myProf = profileRes.data;
      if (myProf?.roles?.role_name?.toLowerCase().includes('intern')) {
        empType = 'Internship';
      }
      if (myProf?.remarks) {
        const match = myProf.remarks.match(/<!--EMP_META:(.*?)-->/);
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

      if (balanceRes.data) {
        setBalance(balanceRes.data);
        const myAcc = calculateLeaveAccrual(sDate, eDate, balanceRes.data.annual_total, empType, isWorking);
        setEmployeeAccrual(myAcc);
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
      // 1. Fetch pending requests
      const { data: pendingData, error: pendingError } = await supabase
        .from('leave_requests')
        .select('*, profiles!profile_id(full_name, department, status)')
        .eq('status', 'Pending')
        .order('created_at', { ascending: true });
      if (pendingError) console.warn('Pending requests fetch warning:', pendingError);
      const activePending = (pendingData || []).filter((r: any) => r.profiles?.status !== 'Resigned' && r.profiles?.status !== 'Terminated');
      setPendingRequests(activePending);

      // 2. Fetch all active staff profiles
      const { data: allProfiles, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, department, status, remarks, roles(role_name)')
        .order('full_name', { ascending: true });

      if (profError) {
        console.error('Error loading profiles for leave balances:', profError);
      }

      // Filter out resigned / terminated staff (keeps ALL active staff, including developer/BOD/management)
      const activeProfiles = (allProfiles || []).filter((p: any) => 
        p.status !== 'Resigned' && p.status !== 'Terminated' && p.status !== 'Inactive'
      );

      // Fetch all existing balances
      const { data: rawBalances, error: balancesError } = await supabase
        .from('leave_balances')
        .select('*');

      if (balancesError) {
        console.warn('Error fetching leave_balances:', balancesError);
      }

      const balancesByProfileId = new Map((rawBalances || []).map((b: any) => [b.profile_id, b]));

      // Merge so EVERY active staff member ALWAYS appears in the Staff Balances dropdown!
      const unifiedBalances = activeProfiles.map((p: any) => {
        const existing = balancesByProfileId.get(p.id);
        if (existing) {
          return {
            ...existing,
            profiles: p
          };
        }
        // If staff member doesn't have a record in leave_balances yet, generate default
        return {
          id: p.id,
          profile_id: p.id,
          annual_total: 14.0,
          annual_used: 0.0,
          sick_total: 14.0,
          sick_used: 0.0,
          hospitalisation_total: 60.0,
          hospitalisation_used: 0.0,
          maternity_total: 98.0,
          maternity_used: 0.0,
          paternity_total: 7.0,
          paternity_used: 0.0,
          unpaid_used: 0.0,
          profiles: p
        };
      });

      setStaffBalances(unifiedBalances);
      if (unifiedBalances.length > 0) {
        setSelectedStaffBalanceId((prev) => {
          if (prev && unifiedBalances.some((b: any) => b.id === prev)) return prev;
          return unifiedBalances[0].id;
        });
      }

      // 3. Fetch approved leaves for calendar (excluding resigned staff)
      const { data: approvedData, error: approvedError } = await supabase
        .from('leave_requests')
        .select('*, profiles!profile_id(full_name, department, status)')
        .eq('status', 'Approved');
      if (approvedError) console.warn('Approved calendar fetch warning:', approvedError);
      const activeApproved = (approvedData || []).filter((r: any) => r.profiles?.status !== 'Resigned' && r.profiles?.status !== 'Terminated');
      setApprovedRequests(activeApproved);
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
      // Annual leave available right now is strictly what has been accrued to date:
      const yearCap = employeeAccrual?.isEligible 
        ? employeeAccrual.proRatedYearTotal 
        : (employeeAccrual?.isEligible === false ? 0 : balance.annual_total);
      const availableAnnualAccrued = employeeAccrual?.isEligible
        ? Math.max(0, employeeAccrual.accruedDays - balance.annual_used)
        : Math.max(0, balance.annual_total - balance.annual_used);

      const remainingSick = balance.sick_total - balance.sick_used;
      const remainingHosp = balance.hospitalisation_total - balance.hospitalisation_used;
      const remainingMat = balance.maternity_total - balance.maternity_used;
      const remainingPat = balance.paternity_total - balance.paternity_used;

      if (leaveType === 'Annual') {
        if (employeeAccrual && !employeeAccrual.isEligible) {
          setFormError(lang === 'bm'
            ? 'Kakitangan di bawah Kontrak Perkhidmatan (Contract for Service) tidak layak untuk Cuti Tahunan berbayar.'
            : 'Contract for Service workers are not entitled to paid Annual Leave.');
          return;
        }

        if (daysCount > availableAnnualAccrued) {
          setFormError(lang === 'bm'
            ? `Baki cuti tahunan yang telah terkumpul (accrued) setakat ini ialah ${availableAnnualAccrued} hari (daripada had kelayakan tahun ${new Date().getFullYear()}: ${yearCap} hari). Anda tidak boleh memohon melebihi baki yang telah diperoleh.`
            : `You have only accrued ${availableAnnualAccrued} day(s) to date (out of ${yearCap} days total for ${new Date().getFullYear()}). You cannot apply for ${daysCount} day(s).`);
          return;
        }
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

    const currentRecord = staffBalances.find(sb => sb.id === selectedStaffBalanceId);
    const targetProfileId = currentRecord?.profile_id || currentRecord?.profiles?.id || selectedStaffBalanceId;

    setIsUpdatingBalances(true);
    try {
      const { error } = await supabase
        .from('leave_balances')
        .upsert({
          profile_id: targetProfileId,
          annual_total: parseFloat(editAnnualTotal) || 0.0,
          sick_total: parseFloat(editSickTotal) || 0.0,
          hospitalisation_total: parseFloat(editHospitalisationTotal) || 0.0,
          maternity_total: parseFloat(editMaternityTotal) || 0.0,
          paternity_total: parseFloat(editPaternityTotal) || 0.0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'profile_id' });

      if (error) throw error;

      alert(lang === 'bm' ? 'Baki cuti kakitangan berjaya dikemas kini!' : 'Staff leave balances successfully updated!');
      setIsEditingBalancesInline(false);
      await fetchAdminData();
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
                className="text-[9px] font-semibold px-1 py-0.5 rounded truncate bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-yellow-500/80 shadow-xs"
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
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 shadow-sm'
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
                  {(() => {
                    const yearCap = employeeAccrual?.isEligible 
                      ? employeeAccrual.proRatedYearTotal 
                      : (employeeAccrual?.isEligible === false ? 0 : balance.annual_total);
                    const availableAnnualAccrued = employeeAccrual?.isEligible
                      ? Math.max(0, employeeAccrual.accruedDays - balance.annual_used)
                      : Math.max(0, balance.annual_total - balance.annual_used);

                    return (
                      <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/10 dark:from-indigo-950/20 dark:to-indigo-900/5 border border-indigo-150/40 dark:border-indigo-900/20 p-4 rounded-2xl shadow-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                            {t('leave', 'annual', lang)}
                          </span>
                          {employeeAccrual?.isEligible && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-yellow-400 border border-amber-200 dark:border-amber-800">
                              Month-by-Month Accrual
                            </span>
                          )}
                        </div>

                        <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                          {availableAnnualAccrued} <span className="text-xs font-semibold text-slate-400">/ {yearCap} {t('leave', 'days', lang)}</span>
                        </p>

                        <div className="w-full bg-slate-200/50 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-2">
                          <div
                            className="bg-indigo-500 h-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (balance.annual_used / (yearCap || 1)) * 100)}%` }}
                          ></div>
                        </div>

                        {employeeAccrual?.isEligible && (
                          <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40 space-y-0.5">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-slate-500 dark:text-zinc-400">Available Accrued Balance:</span>
                              <span className="text-amber-500 dark:text-yellow-400 font-mono font-black">
                                {availableAnnualAccrued} / {yearCap}d
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-400 dark:text-zinc-500">
                              Accrued {employeeAccrual.accruedDays}d so far ({employeeAccrual.monthlyRate} d/mo) · Year Cap: {yearCap}d
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                  <div className="bg-gradient-to-br from-slate-50/50 to-slate-100/10 dark:from-zinc-900/30 dark:to-zinc-900/10 border border-slate-200/40 dark:border-zinc-800 p-4 rounded-2xl shadow-xs col-span-2 sm:col-span-1">
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
            <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-200 flex items-center gap-2">
                  <span>{t('leave', 'myRequests', lang)}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                    {requests.length}
                  </span>
                </h3>
              </div>

              {requests.length === 0 ? (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-500 italic bg-slate-50 dark:bg-zinc-900/30 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                  {t('leave', 'noHistory', lang)}
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-50/70 dark:bg-zinc-900/50 border border-slate-200/80 dark:border-zinc-800/80 rounded-xl p-3.5 sm:p-4 space-y-3 transition-all hover:border-slate-300 dark:hover:border-zinc-700"
                    >
                      {/* Top row: Type & Status */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {t('leave', item.leave_type.toLowerCase(), lang)}
                            {item.session_type !== 'Full Day' && ` (${item.session_type})`}
                          </span>
                          <span className="font-bold text-xs text-slate-700 dark:text-zinc-300">
                            ⏱️ {item.total_days} {item.total_days === 1 ? t('leave', 'day', lang) : t('leave', 'days', lang)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-2 rounded-lg border border-slate-150 dark:border-zinc-800/80">
                        <span>📅 {new Date(item.start_date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        <span>→</span>
                        <span>{new Date(item.end_date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>

                      {/* Reason Submitted */}
                      {item.reason && (
                        <div className="text-xs bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-slate-150 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 break-words whitespace-pre-wrap">
                          <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-zinc-500 block mb-0.5">💬 {t('leave', 'reason', lang)}:</span>
                          {item.reason}
                        </div>
                      )}

                      {/* Approver details */}
                      {(item.status === 'Approved' || item.status === 'Rejected') && (item as any).approver && (
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 bg-white/60 dark:bg-zinc-950/60 p-2 rounded-lg border border-slate-100 dark:border-zinc-800/60 flex items-center justify-between flex-wrap gap-2">
                          <span>
                            {item.status === 'Approved' ? '✓ Diluluskan oleh / Approved by' : '✕ Ditolak oleh / Rejected by'}: <strong className="text-slate-800 dark:text-zinc-200">{(item as any).approver.full_name}</strong>
                          </span>
                        </div>
                      )}

                      {/* Rejection Reason Alert Box */}
                      {item.status === 'Rejected' && item.rejection_reason && (
                        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                          <span className="text-[10px] font-black uppercase tracking-wider block mb-0.5">⚠️ Sebab Penolakan / Reason for Rejection:</span>
                          "{item.rejection_reason}"
                        </div>
                      )}

                      {/* Actions footer */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div>
                          {item.attachment_url && (
                            <button
                              type="button"
                              onClick={() => handleDownloadProof(item.attachment_url!)}
                              className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg border border-slate-200 dark:border-zinc-700 font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>📎</span>
                              <span>{t('leave', 'viewAttachment', lang)}</span>
                            </button>
                          )}
                        </div>

                        {item.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => handleCancelRequest(item)}
                            className="px-3 py-1.5 text-xs bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-800 font-bold transition-colors cursor-pointer"
                          >
                            {t('leave', 'cancelBtn', lang)}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          <div className="flex flex-wrap bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-1 w-full sm:w-fit gap-1">
            <button
              onClick={() => setDashboardSubTab('pending')}
              className={`px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial text-center ${dashboardSubTab === 'pending'
                  ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              {lang === 'bm' ? 'Kelulusan' : 'Approvals'} ({pendingRequests.length})
            </button>
            <button
              onClick={() => setDashboardSubTab('balances')}
              className={`px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial text-center ${dashboardSubTab === 'balances'
                  ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
              {lang === 'bm' ? 'Semua Baki' : 'Staff Balances'}
            </button>
            <button
              onClick={() => setDashboardSubTab('calendar')}
              className={`px-3.5 sm:px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-initial text-center ${dashboardSubTab === 'calendar'
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
              {/* Approvals tab */}
              {dashboardSubTab === 'pending' && (
                <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-zinc-200 flex items-center gap-2">
                        <span>{t('leave', 'pendingApprovals', lang)}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          {pendingRequests.length}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                        {lang === 'bm' ? 'Permohonan cuti yang menunggu semakan dan kelulusan pengurusan.' : 'Leave applications awaiting management review and approval.'}
                      </p>
                    </div>
                  </div>

                  {pendingRequests.length === 0 ? (
                    <div className="p-8 sm:p-12 text-center bg-slate-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800">
                      <span className="text-3xl block mb-2">🎉</span>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                        {lang === 'bm' ? 'Tiada Permohonan Menunggu' : 'No Pending Requests'}
                      </h4>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                        {t('leave', 'noPending', lang)}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {pendingRequests.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white dark:bg-zinc-900/70 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3.5 relative group"
                        >
                          {/* Top Header: Employee details + Leave Type & Status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                                {item.profiles?.full_name ? item.profiles.full_name.slice(0, 2).toUpperCase() : 'ST'}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                  {item.profiles?.full_name || 'Staff Member'}
                                </h4>
                                <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium block mt-0.5">
                                  {item.profiles?.department || 'General'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-xs">
                                {t('leave', item.leave_type.toLowerCase(), lang)}
                                {item.session_type !== 'Full Day' && ` (${item.session_type})`}
                              </span>
                              {getStatusBadge(item.status)}
                            </div>
                          </div>

                          {/* Date Range & Duration Highlight */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-zinc-950/80 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">
                                {t('leave', 'startDate', lang)}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono block mt-0.5">
                                📅 {new Date(item.start_date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">
                                {t('leave', 'endDate', lang)}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono block mt-0.5">
                                📅 {new Date(item.end_date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 block">
                                {t('leave', 'colDuration', lang)}
                              </span>
                              <span className="font-black text-amber-500 dark:text-amber-400 text-sm block mt-0.5">
                                ⏱️ {item.total_days} {item.total_days === 1 ? t('leave', 'day', lang) : t('leave', 'days', lang)}
                              </span>
                            </div>
                          </div>

                          {/* FULL REASON (100% VISIBLE, NEVER TRUNCATED, PHONE OPTIMIZED) */}
                          <div className="space-y-1.5 flex-1">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                              <span>💬</span>
                              <span>{t('leave', 'reason', lang)}:</span>
                            </span>
                            <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/90 border border-slate-200/90 dark:border-zinc-800 rounded-xl text-xs text-slate-800 dark:text-zinc-200 leading-relaxed break-words whitespace-pre-wrap select-text">
                              {item.reason ? (
                                item.reason
                              ) : (
                                <span className="italic text-slate-400">
                                  {lang === 'bm' ? 'Tiada alasan dinyatakan.' : 'No reason provided.'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Attachment Link */}
                          {item.attachment_url && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => handleDownloadProof(item.attachment_url!)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-all border border-slate-200 dark:border-zinc-700 cursor-pointer"
                              >
                                <span>📎</span>
                                <span>{t('leave', 'viewAttachment', lang)} (MC / Proof)</span>
                              </button>
                            </div>
                          )}

                          {/* Action Buttons: Approve / Reject (Mobile-first, prominent, touch-friendly) */}
                          {isActionAllowed && item.status === 'Pending' && (
                            <div className="pt-3 border-t border-slate-150 dark:border-zinc-800/80 flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => handleApprove(item)}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <span>✓</span>
                                <span>{t('leave', 'approveBtn', lang)}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectClick(item)}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <span>✕</span>
                                <span>{t('leave', 'rejectBtn', lang)}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Balances Directory tab (WP / Gov style select & edit) */}
              {dashboardSubTab === 'balances' && (
                <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-200 mb-2">
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
                        <form onSubmit={handleEditBalancesSubmit} className="bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800/85 rounded-2xl p-6 space-y-6">
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
                              className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white hover:bg-slate-100 border border-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 rounded-xl transition-all"
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
                          
                          {(() => {
                            let empType = currentRecord.profiles?.employment_type;
                            let sDate = currentRecord.profiles?.start_date;
                            let eDate = currentRecord.profiles?.end_date;
                            let isWorking = currentRecord.profiles?.is_currently_working;

                            if (currentRecord.profiles?.remarks) {
                              const match = currentRecord.profiles.remarks.match(/<!--EMP_META:(.*?)-->/);
                              if (match) {
                                try {
                                  const meta = JSON.parse(match[1]);
                                  if (!empType && meta.type) empType = meta.type;
                                  if (!sDate && meta.start) sDate = meta.start;
                                  if (!eDate && meta.end) eDate = meta.end;
                                  if (isWorking === undefined && typeof meta.active === 'boolean') isWorking = meta.active;
                                } catch (e) {}
                              }
                            }

                            const accrual = calculateLeaveAccrual(sDate, eDate, currentRecord.annual_total, empType, isWorking);
                            const yearCap = accrual.isEligible ? accrual.proRatedYearTotal : currentRecord.annual_total;
                            const availableAccrued = accrual.isEligible
                              ? Math.max(0, accrual.accruedDays - currentRecord.annual_used)
                              : Math.max(0, currentRecord.annual_total - currentRecord.annual_used);

                            return (
                              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 p-4 rounded-xl shadow-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 dark:text-zinc-550 block">
                                    {t('leave', 'annual', lang)}
                                  </span>
                                  {accrual.isEligible && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-yellow-400 border border-amber-200 dark:border-amber-800">
                                      Accrued Balance
                                    </span>
                                  )}
                                </div>

                                <p className="text-xl font-black text-slate-800 dark:text-white">
                                  {availableAccrued} <span className="text-xs font-semibold text-slate-400">/ {yearCap} {t('leave', 'days', lang)} {lang === 'bm' ? 'baki terkumpul' : 'accrued available'}</span>
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {currentRecord.annual_used} {lang === 'bm' ? 'hari telah digunakan' : 'days used'} · Year Cap: {yearCap}d (Baseline: {currentRecord.annual_total}d/yr)
                                </p>

                                {/* Month-by-Month Accrued To Date */}
                                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80 text-[10px]">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400 font-medium">📅 Accrued to Date:</span>
                                    <span className="font-bold text-amber-500 dark:text-yellow-400 font-mono">
                                      {accrual.isEligible ? `${accrual.accruedDays} / ${yearCap} Days` : 'Contract for Service (0d)'}
                                    </span>
                                  </div>
                                  {accrual.isEligible && (
                                    <span className="text-slate-400 block text-[9px] mt-0.5">
                                      ({accrual.completedMonthsThisYear}/{accrual.monthsInYear} mos in {new Date().getFullYear()} · {accrual.monthlyRate} d/mo)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

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
