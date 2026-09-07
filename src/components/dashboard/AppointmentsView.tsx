import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { t } from '../../lib/portalI18n';
import { usePortalLanguage } from '../../hooks/usePortalLanguage';
import { usePermissions } from '../../hooks/usePermissions';
import PermissionDenied from '../PermissionDenied';

export interface Appointment {
  id: string;
  client_name: string;
  client_phone?: string;
  client_ic?: string;
  client_id?: string;
  potential_client_id?: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // e.g. "11:00 AM" or "11:00 pagi"
  case_category: string;
  pic_name: string;
  location: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'No-Show';
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface ClientOption {
  id: string;
  name: string;
  phone?: string;
  ic?: string;
  category?: string;
  type: 'potential' | 'active';
}

// ─── 12-HOUR TIME PARSING & NORMALIZATION ENGINE ───────────────────────────
// Converts any 12H time string ("09:00 AM", "1:00 PM", "11:30 am", "12:00 PM") to total minutes from midnight (0 - 1439)
export const parseTimeToMinutes = (timeStr: string = ''): number => {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm|pagi|petang|malam)?/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase() || '';

  const isPM = period.includes('pm') || period.includes('petang') || period.includes('malam');
  const isAM = period.includes('am') || period.includes('pagi');

  if (isPM && h < 12) {
    h += 12;
  } else if (isAM && h === 12) {
    h = 0;
  } else if (!isPM && !isAM && h >= 12 && h < 24) {
    // Already in 24h format e.g. 13:00 -> 1:00 PM
  }
  return h * 60 + m;
};

// Standardizes time strictly to 12-Hour format "hh:mm AM/PM"
export const formatToStandard12H = (timeStr: string = ''): string => {
  if (!timeStr) return '11:00 AM';
  const totalMins = parseTimeToMinutes(timeStr);
  let h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

// Formats any Date object to local YYYY-MM-DD string without UTC timezone offset corruption
export const formatDateToYYYYMMDD = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Converts appointment date (YYYY-MM-DD) and appointment time string to exact epoch millisecond timestamp
export const getAppointmentTimestamp = (dateStr: string = '', timeStr: string = ''): number => {
  if (!dateStr) return 0;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return 0;
  const totalMins = parseTimeToMinutes(timeStr);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return new Date(parts[0], parts[1] - 1, parts[2], h, m, 0, 0).getTime();
};

export default function AppointmentsView() {
  // Global synchronized portal language hook
  const { lang, setLang } = usePortalLanguage();
  const { profile, permissions, isITAdmin, loading: loadingPerms } = usePermissions();

  const canView = isITAdmin || Boolean(permissions?.view_appointments);
  const canManage = isITAdmin || Boolean(permissions?.manage_appointments);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissingError, setTableMissingError] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // View Mode: Month, Week, Day, List
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPIC, setFilterPIC] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (filterPIC !== 'all') count++;
    if (filterCategory !== 'all') count++;
    if (filterStatus !== 'all') count++;
    return count;
  }, [searchQuery, filterPIC, filterCategory, filterStatus]);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '+60 ',
    client_ic: '',
    client_id: '',
    potential_client_id: '',
    appointment_date: formatDateToYYYYMMDD(new Date()),
    appointment_time: '11:00 AM',
    case_category: 'Loan Shark',
    custom_category: '',
    is_custom_category: false,
    pic_name: 'Azizul',
    custom_pic: '',
    is_custom_pic: false,
    location: 'Office Consultation',
    status: 'Scheduled' as Appointment['status'],
    notes: ''
  });

  const [staffList, setStaffList] = useState<string[]>(['Azizul', 'Mr. Jazz', 'Shazz', 'Shahniza', 'Shahrizul Azri', 'Akmar']);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [sqlCopySuccess, setSqlCopySuccess] = useState(false);

  // ─── GRAB-STYLE SCHEDULE RIDE TIME PICKER STATE ──────────────────────────
  const [showGrabTimePicker, setShowGrabTimePicker] = useState(false);
  const [pickerHour, setPickerHour] = useState('11');
  const [pickerMinute, setPickerMinute] = useState('00');
  const [pickerPeriod, setPickerPeriod] = useState<'AM' | 'PM'>('AM');

  const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const toggleGrabTimePicker = () => {
    if (!showGrabTimePicker) {
      // Parse current typed appointment_time to sync with picker rollers
      const timeStr = formData.appointment_time || '11:00 AM';
      const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm|pagi|petang|malam)?/i);
      if (match) {
        let h = parseInt(match[1], 10);
        let m = match[2] ? match[2] : '00';
        let p: 'AM' | 'PM' = 'AM';
        if (match[3]) {
          const pLower = match[3].toLowerCase();
          if (pLower.includes('pm') || pLower.includes('petang') || pLower.includes('malam')) {
            p = 'PM';
          }
        } else if (h >= 12) {
          p = 'PM';
          if (h > 12) h -= 12;
        }
        if (h === 0) h = 12;
        setPickerHour(String(h > 12 ? h - 12 : h).padStart(2, '0'));
        setPickerMinute(m.padStart(2, '0'));
        setPickerPeriod(p);
      }
      setShowGrabTimePicker(true);
    } else {
      setShowGrabTimePicker(false);
    }
  };

  const handleSelectHour = (h: string) => {
    setPickerHour(h);
    const newTime = `${h}:${pickerMinute} ${pickerPeriod}`;
    setFormData(prev => ({ ...prev, appointment_time: newTime }));
  };

  const handleSelectMinute = (m: string) => {
    setPickerMinute(m);
    const newTime = `${pickerHour}:${m} ${pickerPeriod}`;
    setFormData(prev => ({ ...prev, appointment_time: newTime }));
  };

  const handleSelectPeriod = (p: 'AM' | 'PM') => {
    setPickerPeriod(p);
    const newTime = `${pickerHour}:${pickerMinute} ${p}`;
    setFormData(prev => ({ ...prev, appointment_time: newTime }));
  };

  // Luggage Lock Offset & Spin Helpers (Ensures selected item is ALWAYS centered)
  const getPrevHour = (current: string) => {
    const h = parseInt(current, 10) || 12;
    const prev = h === 1 ? 12 : h - 1;
    return String(prev).padStart(2, '0');
  };

  const getNextHour = (current: string) => {
    const h = parseInt(current, 10) || 12;
    const next = h === 12 ? 1 : h + 1;
    return String(next).padStart(2, '0');
  };

  const getPrevMinute = (current: string) => {
    const m = parseInt(current, 10) || 0;
    if (m % 5 === 0) {
      return String((m - 5 + 60) % 60).padStart(2, '0');
    }
    // Nearest multiple of 5 below (e.g. 11 -> 10)
    return String(Math.floor(m / 5) * 5).padStart(2, '0');
  };

  const getNextMinute = (current: string) => {
    const m = parseInt(current, 10) || 0;
    if (m % 5 === 0) {
      return String((m + 5) % 60).padStart(2, '0');
    }
    // Nearest multiple of 5 above (e.g. 11 -> 15)
    return String((Math.ceil(m / 5) * 5) % 60).padStart(2, '0');
  };

  const spinHour = (direction: -1 | 1) => {
    const nextH = direction === -1 ? getPrevHour(pickerHour) : getNextHour(pickerHour);
    handleSelectHour(nextH);
  };

  const spinMinute = (direction: -1 | 1) => {
    const nextM = direction === -1 ? getPrevMinute(pickerMinute) : getNextMinute(pickerMinute);
    handleSelectMinute(nextM);
  };

  const spinPeriod = () => {
    handleSelectPeriod(pickerPeriod === 'AM' ? 'PM' : 'AM');
  };

  const handleSelectPresetTime = (preset: string) => {
    setFormData(prev => ({ ...prev, appointment_time: preset }));
    const match = preset.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      setPickerHour(match[1].padStart(2, '0'));
      setPickerMinute(match[2]);
      setPickerPeriod(match[3].toUpperCase() as 'AM' | 'PM');
    }
  };

  // Fetch Staff List from profiles for PIC dropdown (excluding resigned)
  useEffect(() => {
    async function loadStaff() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, status')
          .order('full_name', { ascending: true });
        
        const defaultStaff = ['Azizul', 'Mr. Jazz', 'Shazz', 'Shahniza', 'Shahrizul Azri'];
        if (!error && data) {
          const names = data
            .filter(p => p.status !== 'Resigned' && p.status !== 'Terminated' && p.status !== 'Inactive')
            .map(p => p.full_name?.trim())
            .filter((n): n is string => Boolean(n && n.length > 0));
          const merged = Array.from(new Set([...defaultStaff, ...names]));
          setStaffList(merged);
        } else {
          setStaffList(defaultStaff);
        }
      } catch (err) {
        setStaffList(['Azizul', 'Mr. Jazz', 'Shazz', 'Shahniza', 'Shahrizul Azri']);
      }
    }
    loadStaff();
  }, []);

  // Load Client Options (both Potential Clients and Active Clients) for autofill
  useEffect(() => {
    async function loadClients() {
      try {
        const options: ClientOption[] = [];

        // 1. Potential Clients
        const { data: potData } = await supabase
          .from('potential_clients')
          .select('id, full_name, phone_number, ic_number, case_category')
          .order('full_name', { ascending: true })
          .limit(1000);

        if (potData) {
          potData.forEach(p => {
            if (p.full_name) {
              options.push({
                id: p.id,
                name: `${p.full_name} (${lang === 'bm' ? 'Prospek' : 'Lead / Prospect'})`,
                phone: p.phone_number,
                ic: p.ic_number,
                category: p.case_category,
                type: 'potential'
              });
            }
          });
        }

        // 2. Active Clients
        const { data: actData } = await supabase
          .from('clients')
          .select('id, NAME, "PHONE NUMBER", "IC NUMBER", "CASE CATEGORY"')
          .order('NAME', { ascending: true })
          .limit(1000);

        if (actData) {
          actData.forEach((c: any) => {
            if (c.NAME) {
              options.push({
                id: c.id,
                name: `${c.NAME} (${lang === 'bm' ? 'Klien Aktif' : 'Active Client'})`,
                phone: c["PHONE NUMBER"],
                ic: c["IC NUMBER"],
                category: c["CASE CATEGORY"],
                type: 'active'
              });
            }
          });
        }

        setClientOptions(options);
      } catch (err) {
        console.error('Error fetching client autofill options:', err);
      }
    }
    loadClients();
  }, [lang]);

  // Fetch Appointments (Optimized with smart query limit to protect memory & responsiveness)
  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      setTableMissingError(false);

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .limit(1500);

      if (error) {
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          setTableMissingError(true);
        } else {
          setFetchError(error.message);
        }
        setAppointments([]);
        return;
      }

      setAppointments(data || []);
    } catch (err: any) {
      console.error('Error fetching appointments:', err);
      setFetchError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // Format Helper for Group WhatsApp Broadcast
  const generateWhatsAppGroupMessage = (apt: {
    client_name: string;
    appointment_date: string;
    appointment_time: string;
    case_category: string;
    pic_name: string;
  }) => {
    // Format date as DD/MM/YYYY
    let formattedDate = apt.appointment_date;
    if (apt.appointment_date && apt.appointment_date.includes('-')) {
      const parts = apt.appointment_date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    return `*ER Advocacy Client Appointment*
* Client: ${apt.client_name || '-'}
* Date: ${formattedDate}
* Time: ${apt.appointment_time || '-'}
* Client's Category: ${apt.case_category || '-'}
* PIC: ${apt.pic_name || '-'}

Please take note. Thank you.`;
  };

  // Helper for Client WhatsApp Reminder (Bilingual: English & BM)
  const generateClientReminderMessage = (apt: Appointment) => {
    let formattedDate = apt.appointment_date;
    if (apt.appointment_date && apt.appointment_date.includes('-')) {
      const parts = apt.appointment_date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    if (lang === 'en') {
      return `Dear ${apt.client_name},

Your consultation appointment with ER Advocacy has been scheduled as follows:
📅 Date: ${formattedDate}
⏰ Time: ${apt.appointment_time}
🏢 Location / Mode: ${apt.location || 'ER Advocacy Office'}
👤 Officer In Charge: ${apt.pic_name}

Please let us know if you have any questions or require rescheduling. Thank you.`;
    }

    return `Salam sejahtera ${apt.client_name},

Temujanji anda bersama ER Advocacy telah dijadualkan seperti butiran berikut:
📅 Tarikh: ${formattedDate}
⏰ Masa: ${apt.appointment_time}
🏢 Mod / Lokasi: ${apt.location || 'Pejabat ER Advocacy'}
👤 PIC Bertugas: ${apt.pic_name}

Sila maklumkan sekiranya terdapat sebarang pertanyaan atau perubahan masa. Terima kasih.`;
  };

  // Helper for Group WhatsApp Broadcast (Rescheduled)
  const generateWhatsAppRescheduleGroupMessage = (apt: {
    client_name: string;
    appointment_date: string;
    appointment_time: string;
    case_category: string;
    pic_name: string;
  }) => {
    let formattedDate = apt.appointment_date;
    if (apt.appointment_date && apt.appointment_date.includes('-')) {
      const parts = apt.appointment_date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    return `*🔔 ER Advocacy Client Appointment [JADUAL SEMULA / RESCHEDULED]*
* Client: ${apt.client_name || '-'}
* Tarikh Baharu / New Date: ${formattedDate}
* Masa Baharu / New Time: ${apt.appointment_time || '-'}
* Kategori / Category: ${apt.case_category || '-'}
* PIC: ${apt.pic_name || '-'}

Sila kemas kini jadual anda. Please update your schedule. Thank you.`;
  };

  // Helper for Client WhatsApp Reschedule Notice
  const generateClientRescheduleMessage = (apt: Appointment) => {
    let formattedDate = apt.appointment_date;
    if (apt.appointment_date && apt.appointment_date.includes('-')) {
      const parts = apt.appointment_date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    if (lang === 'en') {
      return `Dear ${apt.client_name},

Kindly be informed that your consultation appointment with ER Advocacy has been RESCHEDULED to:
📅 New Date: ${formattedDate}
⏰ New Time: ${apt.appointment_time}
🏢 Location / Mode: ${apt.location || 'ER Advocacy Office'}
👤 Officer In Charge: ${apt.pic_name}

Please let us know if this timing works for you. Thank you.`;
    }

    return `Salam sejahtera ${apt.client_name},

Dimaklumkan bahawa temujanji konsultasi anda bersama ER Advocacy telah DIJADUALKAN SEMULA seperti butiran berikut:
📅 Tarikh Baharu: ${formattedDate}
⏰ Masa Baharu: ${apt.appointment_time}
🏢 Mod / Lokasi: ${apt.location || 'Pejabat ER Advocacy'}
👤 PIC Bertugas: ${apt.pic_name}

Sila maklumkan sekiranya waktu ini sesuai untuk anda. Terima kasih.`;
  };

  // 1-Click WhatsApp Group Broadcast Action
  const handleShareToWhatsAppGroup = (apt: {
    client_name: string;
    appointment_date: string;
    appointment_time: string;
    case_category: string;
    pic_name: string;
  }) => {
    const text = generateWhatsAppGroupMessage(apt);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopyFeedback(apt.client_name);
    setTimeout(() => setCopyFeedback(null), 3500);

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  // 1-Click WhatsApp Group Reschedule Broadcast Action
  const handleShareRescheduleToWhatsAppGroup = (apt: {
    client_name: string;
    appointment_date: string;
    appointment_time: string;
    case_category: string;
    pic_name: string;
  }) => {
    const text = generateWhatsAppRescheduleGroupMessage(apt);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopyFeedback(apt.client_name);
    setTimeout(() => setCopyFeedback(null), 3500);

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  // 1-Click Client Reminder Action
  const handleSendClientReminder = (apt: Appointment) => {
    const cleanPhone = (apt.client_phone || '').replace(/[^0-9]/g, '');
    const text = generateClientReminderMessage(apt);
    
    if (cleanPhone) {
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
      alert(t('appointments', 'noPhoneMsg', lang));
    }
  };

  // 1-Click Client Reschedule Notice Action
  const handleSendClientRescheduleNotice = (apt: Appointment) => {
    const cleanPhone = (apt.client_phone || '').replace(/[^0-9]/g, '');
    const text = generateClientRescheduleMessage(apt);
    
    if (cleanPhone) {
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
      alert(t('appointments', 'noPhoneMsg', lang));
    }
  };

  // Filtered & Chronologically Sorted (12-Hour) Appointments
  const filteredAppointments = useMemo(() => {
    const list = appointments.filter(apt => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          apt.client_name?.toLowerCase().includes(q) ||
          apt.client_phone?.toLowerCase().includes(q) ||
          apt.client_ic?.toLowerCase().includes(q) ||
          apt.pic_name?.toLowerCase().includes(q) ||
          apt.case_category?.toLowerCase().includes(q) ||
          apt.notes?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Filter PIC
      if (filterPIC !== 'all' && apt.pic_name !== filterPIC) {
        return false;
      }

      // Filter Category
      if (filterCategory !== 'all' && apt.case_category !== filterCategory) {
        return false;
      }

      // Filter Status
      if (filterStatus !== 'all' && apt.status !== filterStatus) {
        return false;
      }

      return true;
    });

    // Strictly 12-Hour Chronological Sort: Date ASC -> Time (Minutes from midnight) ASC -> Client Name ASC
    return list.sort((a, b) => {
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date.localeCompare(b.appointment_date);
      }
      const diff = parseTimeToMinutes(a.appointment_time) - parseTimeToMinutes(b.appointment_time);
      if (diff !== 0) return diff;
      return (a.client_name || '').localeCompare(b.client_name || '');
    });
  }, [appointments, searchQuery, filterPIC, filterCategory, filterStatus]);

  // Reactive Clash Detection Set (Identifies appointments overlapping within 45 mins for the same PIC, including cross-midnight schedules)
  const clashingAppointmentIds = useMemo(() => {
    const clashSet = new Set<string>();
    const activeList = appointments.filter(a => a.status !== 'Cancelled');
    const MS_45_MIN = 45 * 60 * 1000;
    
    for (let i = 0; i < activeList.length; i++) {
      for (let j = i + 1; j < activeList.length; j++) {
        const a1 = activeList[i];
        const a2 = activeList[j];
        const pic1 = (a1.pic_name || '').toLowerCase().trim();
        const pic2 = (a2.pic_name || '').toLowerCase().trim();
        if (pic1 && pic1 === pic2) {
          const ts1 = getAppointmentTimestamp(a1.appointment_date, a1.appointment_time);
          const ts2 = getAppointmentTimestamp(a2.appointment_date, a2.appointment_time);
          // Flag overlap across midnight and all calendar boundaries if within 45 minutes
          if (ts1 > 0 && ts2 > 0 && Math.abs(ts1 - ts2) < MS_45_MIN) {
            clashSet.add(a1.id);
            clashSet.add(a2.id);
          }
        }
      }
    }

    return clashSet;
  }, [appointments]);

  // Live Modal Clash Detector (Advisory warning banner for overlapping timeslots within 45 mins, handling midnight transitions)
  const formClashAppointment = useMemo(() => {
    if (!formData.appointment_date || !formData.appointment_time) return null;
    const currentFormTs = getAppointmentTimestamp(formData.appointment_date, formData.appointment_time);
    const currentPic = (formData.is_custom_pic ? formData.custom_pic : formData.pic_name || '').toLowerCase().trim();
    const MS_45_MIN = 45 * 60 * 1000;
    
    return appointments.find(a => {
      if (isEditModalOpen && activeAppointment && a.id === activeAppointment.id) return false;
      if (a.status === 'Cancelled') return false;
      const aPic = (a.pic_name || '').toLowerCase().trim();
      const picMatch = currentPic ? aPic === currentPic : true;
      if (!picMatch) return false;
      const aTs = getAppointmentTimestamp(a.appointment_date, a.appointment_time);
      return aTs > 0 && currentFormTs > 0 && Math.abs(aTs - currentFormTs) < MS_45_MIN;
    });
  }, [formData.appointment_date, formData.appointment_time, formData.pic_name, formData.custom_pic, formData.is_custom_pic, appointments, isEditModalOpen, activeAppointment]);

  // ─── PENDING OUTCOME RESOLUTION (Scheduled Timestamp + 3-Hour Buffer Elapsed) ──────
  const [hidePendingOutcomeBanner, setHidePendingOutcomeBanner] = useState(false);
  const [expandedPendingOutcome, setExpandedPendingOutcome] = useState(true);

  const pendingOutcomeAppointments = useMemo(() => {
    const now = new Date();
    const BUFFER_MS = 3 * 60 * 60 * 1000; // 3 hours window after appointment scheduled start

    return appointments.filter(a => {
      // Only track active consultations that are still awaiting a final outcome
      if (a.status !== 'Scheduled' && a.status !== 'In Progress') return false;
      if (!a.appointment_date) return false;

      const parts = a.appointment_date.split('-').map(Number);
      if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return false;
      const [y, m, d] = parts;
      const scheduledMins = parseTimeToMinutes(a.appointment_time);
      const hour = Math.floor(scheduledMins / 60);
      const min = scheduledMins % 60;

      // Construct accurate Date object in local time to robustly handle midnight/day-rollovers
      const scheduledDate = new Date(y, m - 1, d, hour, min, 0, 0);
      const thresholdDate = new Date(scheduledDate.getTime() + BUFFER_MS);

      return now >= thresholdDate;
    });
  }, [appointments]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayStr = formatDateToYYYYMMDD(new Date());
    
    // Calculate week start and end
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon = 0
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    let totalToday = 0;
    let totalUpcoming = 0;
    let totalCompleted = 0;

    appointments.forEach(a => {
      if (a.appointment_date === todayStr) totalToday++;
      if (a.status === 'Completed') totalCompleted++;

      const aDate = new Date(a.appointment_date);
      if (aDate >= startOfWeek && aDate <= endOfWeek && a.status === 'Scheduled') {
        totalUpcoming++;
      }
    });

    return {
      today: totalToday,
      upcoming: totalUpcoming,
      completed: totalCompleted,
      total: appointments.length
    };
  }, [appointments]);

  // Date Navigation Helpers
  const handlePrevDate = () => {
    const next = new Date(currentDate);
    if (calendarView === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else if (calendarView === 'week') {
      next.setDate(next.getDate() - 7);
    } else if (calendarView === 'day') {
      next.setDate(next.getDate() - 1);
    }
    setCurrentDate(next);
  };

  const handleNextDate = () => {
    const next = new Date(currentDate);
    if (calendarView === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else if (calendarView === 'week') {
      next.setDate(next.getDate() + 7);
    } else if (calendarView === 'day') {
      next.setDate(next.getDate() + 1);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Format Header Title based on active calendar view and selected language
  const headerDateTitle = useMemo(() => {
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsBm = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
    const months = lang === 'bm' ? monthsBm : monthsEn;

    const y = currentDate.getFullYear();
    const m = months[currentDate.getMonth()];
    const d = currentDate.getDate();

    if (calendarView === 'month') {
      return `${m} ${y}`;
    }

    if (calendarView === 'day') {
      const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const daysBm = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
      const dayName = (lang === 'bm' ? daysBm : daysEn)[currentDate.getDay()];
      return `${dayName}, ${d} ${m} ${y}`;
    }

    if (calendarView === 'week') {
      const dayOfWeek = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const startMonth = months[start.getMonth()];
      const endMonth = months[end.getMonth()];

      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} ${startMonth} ${y}`;
      } else {
        return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth} ${y}`;
      }
    }

    return `${m} ${y}`;
  }, [currentDate, calendarView, lang]);

  // Navigate directly to Day View when clicking on a calendar day
  const handleSelectDayView = (dateStr: string) => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      // Create local date object at noon (12:00) to prevent any boundary shift
      setCurrentDate(new Date(y, m - 1, d, 12, 0, 0));
      setCalendarView('day');
    }
  };

  // Open Add Modal (Restricted to canManage)
  const handleOpenAddModal = (initialDate?: string) => {
    if (!canManage) {
      alert(lang === 'bm' ? 'Akses Terhad: Anda tidak mempunyai kebenaran untuk menambah temujanji.' : 'Access Restricted: You do not have permission to add appointments.');
      return;
    }
    setFormData({
      client_name: '',
      client_phone: '+60 ',
      client_ic: '',
      client_id: '',
      potential_client_id: '',
      appointment_date: initialDate || formatDateToYYYYMMDD(new Date()),
      appointment_time: '11:00 AM',
      case_category: 'Loan Shark',
      custom_category: '',
      is_custom_category: false,
      pic_name: 'Azizul',
      custom_pic: '',
      is_custom_pic: false,
      location: 'Office Consultation',
      status: 'Scheduled',
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  // Autofill client fields when chosen from dropdown
  const handleSelectClientOption = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    if (!selectedVal) {
      setFormData(prev => ({
        ...prev,
        client_id: '',
        potential_client_id: ''
      }));
      return;
    }

    const opt = clientOptions.find(o => `${o.type}_${o.id}` === selectedVal);
    if (opt) {
      setFormData(prev => ({
        ...prev,
        client_name: opt.name.replace(/\s*\(.*?\)/g, '').trim(),
        client_phone: opt.phone || prev.client_phone,
        client_ic: opt.ic || prev.client_ic,
        case_category: opt.category || prev.case_category,
        client_id: opt.type === 'active' ? opt.id : '',
        potential_client_id: opt.type === 'potential' ? opt.id : ''
      }));
    }
  };

  // Handle client name manual typing to prevent linked ID desync
  const handleClientNameChange = (newName: string) => {
    setFormData(prev => {
      // Check if user changed the name away from an autofilled client
      const hadAutofilled = Boolean(prev.client_id || prev.potential_client_id);
      return {
        ...prev,
        client_name: newName,
        // Clear linked IDs if the user edits or changes the client name to avoid wrong DB relation
        client_id: hadAutofilled && prev.client_name !== newName ? '' : prev.client_id,
        potential_client_id: hadAutofilled && prev.client_name !== newName ? '' : prev.potential_client_id
      };
    });
  };

  // Open Edit Modal (Restricted to canManage)
  const handleOpenEditModal = (apt: Appointment) => {
    if (!canManage) {
      alert(lang === 'bm' ? 'Akses Terhad: Anda tidak mempunyai kebenaran untuk menjadual semula atau menyunting temujanji.' : 'Access Restricted: You do not have permission to reschedule or edit appointments.');
      return;
    }
    setActiveAppointment(apt);
    const standardCategories = ['Loan Shark', 'Ah Long', 'Kredit Komuniti', 'Bank', 'Scam Victim', 'Kemalangan', 'Tuntutan Sivil'];
    const isCustomCat = Boolean(apt.case_category && !standardCategories.includes(apt.case_category));
    const isCustomPIC = Boolean(apt.pic_name && !staffList.includes(apt.pic_name));

    setFormData({
      client_name: apt.client_name || '',
      client_phone: apt.client_phone || '+60 ',
      client_ic: apt.client_ic || '',
      client_id: apt.client_id || '',
      potential_client_id: apt.potential_client_id || '',
      appointment_date: apt.appointment_date || '',
      appointment_time: apt.appointment_time || '11:00 AM',
      case_category: isCustomCat ? 'Custom' : (apt.case_category || 'Loan Shark'),
      custom_category: isCustomCat ? apt.case_category : '',
      is_custom_category: isCustomCat,
      pic_name: isCustomPIC ? 'Custom' : (apt.pic_name || 'Azizul'),
      custom_pic: isCustomPIC ? apt.pic_name : '',
      is_custom_pic: isCustomPIC,
      location: apt.location || 'Office Consultation',
      status: apt.status || 'Scheduled',
      notes: apt.notes || ''
    });
    setIsEditModalOpen(true);
  };

  // Save Appointment Form (Supports both "Save Only" and "Save & Share to WhatsApp Group")
  const handleSubmitForm = async (shareToGroup: boolean = false) => {
    if (!canManage) {
      alert(lang === 'bm' ? 'Akses Terhad: Anda tidak mempunyai kebenaran untuk menyimpan perubahan temujanji.' : 'Access Restricted: You do not have permission to save appointment changes.');
      return;
    }
    if (!formData.client_name.trim()) {
      alert(t('appointments', 'clientNameRequired', lang));
      return;
    }
    if (!formData.appointment_date) {
      alert(t('appointments', 'dateRequired', lang));
      return;
    }

    // Guard against empty Custom Category
    if (formData.is_custom_category && !formData.custom_category.trim()) {
      alert(lang === 'bm' ? 'Sila taip nama kategori tersuai anda.' : 'Please enter your custom case category name.');
      return;
    }

    // Guard against empty Custom PIC (prevents accidental misassignment)
    if (formData.is_custom_pic && !formData.custom_pic.trim()) {
      alert(lang === 'bm' ? 'Sila taip nama pegawai / PIC tersuai anda.' : 'Please enter the custom officer / PIC name.');
      return;
    }

    try {
      setSubmitting(true);
      const finalCategory = formData.is_custom_category
        ? formData.custom_category.trim()
        : formData.case_category;

      const finalPIC = formData.is_custom_pic
        ? formData.custom_pic.trim()
        : formData.pic_name;

      let cleanPhone = formData.client_phone ? formData.client_phone.trim() : '';
      if (cleanPhone === '+60' || cleanPhone === '+60 ') {
        cleanPhone = '';
      }

      const payload: any = {
        client_name: formData.client_name.trim(),
        client_phone: cleanPhone || null,
        client_ic: formData.client_ic?.trim() || null,
        client_id: formData.client_id || null,
        potential_client_id: formData.potential_client_id || null,
        appointment_date: formData.appointment_date,
        appointment_time: formatToStandard12H(formData.appointment_time),
        case_category: finalCategory,
        pic_name: finalPIC,
        location: formData.location,
        status: formData.status,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (isEditModalOpen && activeAppointment) {
        const { error } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', activeAppointment.id);

        if (error) throw error;
      } else {
        // Enforce audit trail metadata on new appointments
        payload.created_by = profile?.id || null;
        payload.created_by_name = profile?.full_name || 'Staff User';

        const { error } = await supabase
          .from('appointments')
          .insert([payload]);

        if (error) throw error;
      }

      // Close modal and refresh list
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      await fetchAppointments();

      // If user requested Share to WhatsApp Group, trigger 1-click broadcast immediately!
      if (shareToGroup) {
        if (isEditModalOpen) {
          handleShareRescheduleToWhatsAppGroup({
            client_name: payload.client_name,
            appointment_date: payload.appointment_date,
            appointment_time: payload.appointment_time,
            case_category: payload.case_category,
            pic_name: payload.pic_name
          });
        } else {
          handleShareToWhatsAppGroup({
            client_name: payload.client_name,
            appointment_date: payload.appointment_date,
            appointment_time: payload.appointment_time,
            case_category: payload.case_category,
            pic_name: payload.pic_name
          });
        }
      }
    } catch (err: any) {
      console.error('Error saving appointment:', err);
      alert(`${lang === 'bm' ? 'Gagal menyimpan temujanji' : 'Failed to save appointment'}: ${err.message || 'Error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Appointment (Restricted to canManage)
  const handleDelete = async (apt: Appointment) => {
    if (!canManage) {
      alert(lang === 'bm' ? 'Akses Terhad: Anda tidak mempunyai kebenaran untuk memadam temujanji.' : 'Access Restricted: You do not have permission to delete appointments.');
      return;
    }
    const confirmMsg = t('appointments', 'deleteConfirm', lang).replace('{name}', apt.client_name);
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', apt.id);

      if (error) throw error;
      setIsViewModalOpen(false);
      await fetchAppointments();
    } catch (err: any) {
      alert(`${lang === 'bm' ? 'Gagal memadam temujanji' : 'Failed to delete appointment'}: ${err.message}`);
    }
  };

  // Quick Status Toggle (Restricted to canManage)
  const handleUpdateStatus = async (apt: Appointment, newStatus: Appointment['status']) => {
    if (!canManage) {
      alert(lang === 'bm' ? 'Akses Terhad: Anda tidak mempunyai kebenaran untuk menukar status temujanji.' : 'Access Restricted: You do not have permission to update appointment status.');
      return;
    }
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', apt.id);

      if (error) throw error;
      await fetchAppointments();
      if (activeAppointment && activeAppointment.id === apt.id) {
        setActiveAppointment({ ...activeAppointment, status: newStatus });
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert(`${lang === 'bm' ? 'Gagal mengemas kini status temujanji' : 'Failed to update appointment status'}: ${err.message || 'Error'}`);
    }
  };

  // Status Badge Colors with dynamic language localization
  const getStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'Completed':
        return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">✓ {t('appointments', 'completed', lang)}</span>;
      case 'In Progress':
        return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">⚡ {t('appointments', 'inProgress', lang)}</span>;
      case 'Cancelled':
        return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">✕ {t('appointments', 'cancelled', lang)}</span>;
      case 'No-Show':
        return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">{t('appointments', 'noShow', lang)}</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">📅 {t('appointments', 'scheduled', lang)}</span>;
    }
  };

  // Copy SQL script for missing table fallback
  const handleCopySQL = () => {
    const sql = `-- Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_ic TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    potential_client_id UUID REFERENCES public.potential_clients(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    appointment_time TEXT NOT NULL,
    case_category TEXT NOT NULL DEFAULT 'Loan Shark',
    pic_name TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'Office Consultation',
    status TEXT NOT NULL DEFAULT 'Scheduled',
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_appointment_permission(u_id UUID, perm_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = u_id AND r.role_name IN ('IT Admin', 'HR', 'CFO', 'Director', 'BOD')
  ) THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.access_permissions
    WHERE (target_type = 'user' AND target_id = u_id::text AND (permissions->>perm_type)::boolean = true)
       OR (target_type = 'department' AND target_id = (SELECT department FROM public.profiles WHERE id = u_id) AND (permissions->>perm_type)::boolean = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Appointments SELECT Policy" ON public.appointments FOR SELECT TO authenticated
  USING (public.has_appointment_permission(auth.uid(), 'view_appointments') OR public.has_appointment_permission(auth.uid(), 'manage_appointments'));

CREATE POLICY "Appointments INSERT Policy" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.has_appointment_permission(auth.uid(), 'manage_appointments'));

CREATE POLICY "Appointments UPDATE Policy" ON public.appointments FOR UPDATE TO authenticated
  USING (public.has_appointment_permission(auth.uid(), 'manage_appointments'))
  WITH CHECK (public.has_appointment_permission(auth.uid(), 'manage_appointments'));

CREATE POLICY "Appointments DELETE Policy" ON public.appointments FOR DELETE TO authenticated
  USING (public.has_appointment_permission(auth.uid(), 'manage_appointments'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;`;
    navigator.clipboard.writeText(sql);
    setSqlCopySuccess(true);
    setTimeout(() => setSqlCopySuccess(false), 3000);
  };

  if (!loadingPerms && !canView) {
    return (
      <PermissionDenied
        title={lang === 'bm' ? 'Akses Temujanji Klien Terhad' : 'Client Appointments Access Restricted'}
        message={lang === 'bm'
          ? 'Akaun anda tidak mempunyai kebenaran untuk melihat atau menguruskan temujanji klien. Sila hubungi Pentadbir Sistem jika anda memerlukan akses.'
          : 'Your account does not have permission to view or manage client appointments. Please contact your System Administrator if you require access.'}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full space-y-4">
      {/* Toast Feedback */}
      {copyFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-400">
          <span className="text-lg">📢</span>
          <div>
            <div className="font-bold text-xs">{t('appointments', 'broadcastCopied', lang)}</div>
            <div className="text-[11px] opacity-90">{t('appointments', 'readyToPaste', lang)}</div>
          </div>
        </div>
      )}

      {/* Missing Table Banner */}
      {tableMissingError && (
        <div className="bg-amber-500/10 border-2 border-dashed border-amber-500/40 rounded-2xl p-4 sm:p-5 text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-bold text-sm flex items-center gap-2">
              <span>⚠️</span> {t('appointments', 'tableMissingTitle', lang)}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('appointments', 'tableMissingDesc', lang)}
            </p>
          </div>
          <button
            onClick={handleCopySQL}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            {sqlCopySuccess ? t('appointments', 'sqlCopied', lang) : t('appointments', 'copySql', lang)}
          </button>
        </div>
      )}

      {/* ─── PENDING OUTCOME RESOLUTION BANNER (Restricted to canManage users only) ─── */}
      {canManage && pendingOutcomeAppointments.length > 0 && !hidePendingOutcomeBanner && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/40 rounded-2xl p-3 sm:p-4 shadow-sm space-y-2.5 sm:space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs sm:text-sm flex-shrink-0">
                ⏳
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1">
                    <span>{t('appointments', 'pendingOutcomeTitle', lang)}</span>
                  </h4>
                  <span className="px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-black bg-amber-500 text-slate-950 font-mono">
                    {pendingOutcomeAppointments.length}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 hidden sm:block">
                  {t('appointments', 'pendingOutcomeSub', lang)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpandedPendingOutcome(!expandedPendingOutcome)}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-amber-500/20 text-slate-500 dark:text-zinc-400 text-xs font-bold transition-colors cursor-pointer"
                title={expandedPendingOutcome ? 'Collapse' : 'Expand'}
              >
                {expandedPendingOutcome ? '▲' : '▼'}
              </button>
              <button
                type="button"
                onClick={() => setHidePendingOutcomeBanner(true)}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-amber-500/20 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold transition-colors cursor-pointer"
                title="Dismiss for this session"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Pending Appointments Cards List */}
          {expandedPendingOutcome && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 pt-0.5">
              {pendingOutcomeAppointments.map(apt => (
                <div
                  key={apt.id}
                  className="bg-white/95 dark:bg-gray-900/95 border border-amber-500/30 rounded-xl p-2.5 sm:p-3 shadow-xs space-y-2 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] sm:text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          📅 {apt.appointment_date} • ⏰ {apt.appointment_time}
                        </span>
                      </div>
                      <h5 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {apt.client_name}
                      </h5>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                        <span>👤 {apt.pic_name}</span>
                        <span>•</span>
                        <span className="truncate">🏷️ {apt.case_category}</span>
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Action Buttons - Responsive 2x2 grid on mobile */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                    {/* Selesai / Completed */}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(apt, 'Completed')}
                      className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] sm:text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>✓</span>
                      <span>{t('appointments', 'quickCompleted', lang)}</span>
                    </button>

                    {/* Batal / Cancelled */}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(apt, 'Cancelled')}
                      className="py-1.5 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] sm:text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>✕</span>
                      <span>{t('appointments', 'quickCancelled', lang)}</span>
                    </button>

                    {/* Tidak Hadir / No-Show */}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(apt, 'No-Show')}
                      className="py-1.5 px-2 bg-slate-700 hover:bg-slate-800 text-zinc-100 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>🚫</span>
                      <span>{t('appointments', 'quickNoShow', lang)}</span>
                    </button>

                    {/* Jadual Semula / Reschedule */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(apt)}
                      className="py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-[10px] sm:text-[11px] font-black transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>🗓️</span>
                      <span>{t('appointments', 'quickReschedule', lang)}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics Summary Row: Compact Strip on Mobile, 4 Cards on Desktop */}
      {/* 1. Mobile Compact Metrics Strip */}
      <div className="grid grid-cols-4 sm:hidden bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-2.5 shadow-xs text-center divide-x divide-slate-100 dark:divide-gray-800/80">
        <div className="px-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-tight block truncate">
            {lang === 'bm' ? 'Hari Ini' : 'Today'}
          </span>
          <span className="text-lg font-black text-indigo-600 dark:text-yellow-400 font-mono">
            {metrics.today}
          </span>
        </div>
        <div className="px-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-tight block truncate">
            {lang === 'bm' ? 'Minggu' : 'Week'}
          </span>
          <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 font-mono">
            {metrics.upcoming}
          </span>
        </div>
        <div className="px-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-tight block truncate">
            {lang === 'bm' ? 'Selesai' : 'Done'}
          </span>
          <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {metrics.completed}
          </span>
        </div>
        <div className="px-1">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-tight block truncate">
            {lang === 'bm' ? 'Jumlah' : 'Total'}
          </span>
          <span className="text-lg font-black text-slate-800 dark:text-zinc-100 font-mono">
            {metrics.total}
          </span>
        </div>
      </div>

      {/* 2. Desktop 4-Card Metrics Grid */}
      <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {t('appointments', 'totalToday', lang)}
            </span>
            <span className="text-lg">🔔</span>
          </div>
          <div className="text-2xl font-extrabold text-indigo-600 dark:text-yellow-500 mt-1 font-mono">
            {metrics.today}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {t('appointments', 'totalUpcoming', lang)}
            </span>
            <span className="text-lg">📅</span>
          </div>
          <div className="text-2xl font-extrabold text-cyan-600 dark:text-cyan-400 mt-1 font-mono">
            {metrics.upcoming}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {t('appointments', 'totalCompleted', lang)}
            </span>
            <span className="text-lg">✓</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            {metrics.completed}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {t('appointments', 'totalAll', lang)}
            </span>
            <span className="text-lg">📋</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-800 dark:text-zinc-100 mt-1 font-mono">
            {metrics.total}
          </div>
        </div>
      </div>

      {/* Main Calendar Card Container */}
      <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">
        {/* Top Header & Calendar Controls */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/80 space-y-2.5">
          {/* ─── MOBILE CONTROLS (Spacious 2-Row Layout with Dropdown View Switcher) ─── */}
          <div className="sm:hidden space-y-2.5">
            {/* Mobile Row 1: Date Navigation + Add Button (if canManage) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-0.5 shadow-xs">
                  <button
                    onClick={handlePrevDate}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                    title="Previous"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleToday}
                    className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
                  >
                    {t('appointments', 'today', lang)}
                  </button>
                  <button
                    onClick={handleNextDate}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                    title="Next"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                  {headerDateTitle}
                </h3>
              </div>

              {/* + New Button (Protected) */}
              {canManage && (
                <button
                  onClick={() => handleOpenAddModal()}
                  className="h-9 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>{lang === 'bm' ? 'Temujanji' : 'New'}</span>
                </button>
              )}
            </div>

            {/* Mobile Row 2: Clean Dropdown View Selector (Default Month) + Language Switcher */}
            <div className="flex items-center gap-2">
              {/* Native Dropdown for View Mode */}
              <div className="relative flex-1">
                <select
                  value={calendarView}
                  onChange={(e) => setCalendarView(e.target.value as any)}
                  className="w-full appearance-none h-9 pl-3 pr-8 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl text-xs font-extrabold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-amber-400 shadow-xs cursor-pointer"
                >
                  <option value="month">📅 {lang === 'bm' ? 'Paparan Bulan (Month)' : 'Month View'}</option>
                  <option value="week">📆 {lang === 'bm' ? 'Paparan Minggu (Week)' : 'Week View'}</option>
                  <option value="day">🕒 {lang === 'bm' ? 'Paparan Hari (Day)' : 'Day View'}</option>
                  <option value="list">📋 {lang === 'bm' ? 'Paparan Senarai (List)' : 'List View'}</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 dark:text-zinc-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Language Switcher */}
              <div className="flex bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-0.5 shadow-xs flex-shrink-0 h-9 items-center">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-500 dark:text-zinc-400'}`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang('bm')}
                  className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all ${lang === 'bm' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-500 dark:text-zinc-400'}`}
                >
                  BM
                </button>
              </div>
            </div>
          </div>

          {/* ─── DESKTOP CONTROLS (Spacious Horizontal Header) ─── */}
          <div className="hidden sm:flex items-center justify-between gap-3">
            {/* Left: Date Navigation */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-1 shadow-sm">
                <button
                  onClick={handlePrevDate}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors"
                  title="Previous"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleToday}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t('appointments', 'today', lang)}
                </button>
                <button
                  onClick={handleNextDate}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors"
                  title="Next"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                {headerDateTitle}
              </h3>
            </div>

            {/* Right: View Switchers + Language Switcher + Add Button */}
            <div className="flex items-center gap-2">
              {/* View Mode Tabs */}
              <div className="flex bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-1 shadow-sm">
                <button
                  onClick={() => setCalendarView('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarView === 'month' ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {lang === 'bm' ? 'Bulan' : 'Month'}
                </button>
                <button
                  onClick={() => setCalendarView('week')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarView === 'week' ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {lang === 'bm' ? 'Minggu' : 'Week'}
                </button>
                <button
                  onClick={() => setCalendarView('day')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarView === 'day' ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {lang === 'bm' ? 'Hari' : 'Day'}
                </button>
                <button
                  onClick={() => setCalendarView('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarView === 'list' ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  {lang === 'bm' ? 'Senarai' : 'List'}
                </button>
              </div>

              {/* Language Switcher */}
              <div className="flex bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400'}`}
                  title="Switch to English"
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang('bm')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'bm' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400'}`}
                  title="Tukar ke Bahasa Melayu"
                >
                  BM
                </button>
              </div>

              {/* + Add Appointment Button (Protected) */}
              {canManage && (
                <button
                  onClick={() => handleOpenAddModal()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>{t('appointments', 'newAppointment', lang)}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── FILTERS BAR (Expandable on Mobile, Grid on Desktop) ─── */}
        <div className="p-3 sm:p-3.5 border-b border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs">
          {/* Mobile Filter Header: Search input + Filter toggle button */}
          <div className="sm:hidden space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={t('appointments', 'searchPlaceholder', lang)}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className={`h-9 px-3 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  showMobileFilters || activeFilterCount > 0
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs'
                    : 'bg-slate-50 dark:bg-gray-800/80 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-gray-700'
                }`}
              >
                <span>⚙️</span>
                <span>{lang === 'bm' ? 'Tapis' : 'Filter'}</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-slate-950 text-amber-400 text-[10px] font-black flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Expandable Filter Dropdowns on Mobile */}
            {showMobileFilters && (
              <div className="pt-2 border-t border-slate-100 dark:border-gray-800 space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="grid grid-cols-1 gap-2">
                  <select
                    value={filterPIC}
                    onChange={(e) => setFilterPIC(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
                  >
                    <option value="all">{t('appointments', 'allPics', lang)}</option>
                    {staffList.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full h-9 px-3 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
                    >
                      <option value="all">{t('appointments', 'allCategories', lang)}</option>
                      <option value="Loan Shark">Loan Shark / Ah Long</option>
                      <option value="Kredit Komuniti">Kredit Komuniti</option>
                      <option value="Bank">Bank</option>
                      <option value="Scam Victim">Scam Victim</option>
                      <option value="Kemalangan">{lang === 'bm' ? 'Kemalangan' : 'Accident'}</option>
                      <option value="Tuntutan Sivil">{lang === 'bm' ? 'Tuntutan Sivil' : 'Civil Claims'}</option>
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full h-9 px-3 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
                    >
                      <option value="all">{t('appointments', 'allStatuses', lang)}</option>
                      <option value="Scheduled">{t('appointments', 'scheduled', lang)}</option>
                      <option value="In Progress">{t('appointments', 'inProgress', lang)}</option>
                      <option value="Completed">{t('appointments', 'completed', lang)}</option>
                      <option value="Cancelled">{t('appointments', 'cancelled', lang)}</option>
                      <option value="No-Show">{t('appointments', 'noShow', lang)}</option>
                    </select>
                  </div>
                </div>

                {/* Reset Filters on Mobile if any active */}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterPIC('all');
                      setFilterCategory('all');
                      setFilterStatus('all');
                      setSearchQuery('');
                    }}
                    className="w-full py-1.5 text-center text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-900/40"
                  >
                    ✕ {lang === 'bm' ? 'Kosongkan Semua Tapisan' : 'Reset All Filters'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Desktop 4-Column Filter Grid */}
          <div className="hidden sm:grid grid-cols-4 gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder={t('appointments', 'searchPlaceholder', lang)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* PIC Filter */}
            <div>
              <select
                value={filterPIC}
                onChange={(e) => setFilterPIC(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="all">{t('appointments', 'allPics', lang)}</option>
                {staffList.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="all">{t('appointments', 'allCategories', lang)}</option>
                <option value="Loan Shark">Loan Shark / Ah Long</option>
                <option value="Kredit Komuniti">Kredit Komuniti</option>
                <option value="Bank">Bank</option>
                <option value="Scam Victim">Scam Victim</option>
                <option value="Kemalangan">{lang === 'bm' ? 'Kemalangan' : 'Accident'}</option>
                <option value="Tuntutan Sivil">{lang === 'bm' ? 'Tuntutan Sivil' : 'Civil Claims'}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="all">{t('appointments', 'allStatuses', lang)}</option>
                <option value="Scheduled">{t('appointments', 'scheduled', lang)}</option>
                <option value="In Progress">{t('appointments', 'inProgress', lang)}</option>
                <option value="Completed">{t('appointments', 'completed', lang)}</option>
                <option value="Cancelled">{t('appointments', 'cancelled', lang)}</option>
                <option value="No-Show">{t('appointments', 'noShow', lang)}</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── CALENDAR VIEWS BODY ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-black p-2 sm:p-4">
          {/* 1. MONTH VIEW */}
          {calendarView === 'month' && (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
              {/* Day Headers (Mon - Sun) */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-gray-800 bg-slate-50/90 dark:bg-gray-900/90 text-center text-xs font-bold text-slate-500 dark:text-zinc-400 py-2.5">
                <div>{lang === 'bm' ? 'Isn' : 'Mon'}</div>
                <div>{lang === 'bm' ? 'Sel' : 'Tue'}</div>
                <div>{lang === 'bm' ? 'Rab' : 'Wed'}</div>
                <div>{lang === 'bm' ? 'Kha' : 'Thu'}</div>
                <div>{lang === 'bm' ? 'Jum' : 'Fri'}</div>
                <div>{lang === 'bm' ? 'Sab' : 'Sat'}</div>
                <div>{lang === 'bm' ? 'Ahd' : 'Sun'}</div>
              </div>

              {/* 7x5 or 7x6 Calendar Grid */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-gray-800/60">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();

                  const firstDayOfMonth = new Date(year, month, 1);
                  // Monday = 0, Sunday = 6
                  const startDayIndex = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;

                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const daysInPrevMonth = new Date(year, month, 0).getDate();

                  const cells = [];
                  const todayStr = formatDateToYYYYMMDD(new Date());

                  // 1. Previous Month Spillover Days
                  for (let i = startDayIndex - 1; i >= 0; i--) {
                    const d = daysInPrevMonth - i;
                    cells.push({
                      dayNum: d,
                      dateStr: '',
                      isCurrentMonth: false
                    });
                  }

                  // 2. Current Month Days
                  for (let d = 1; d <= daysInMonth; d++) {
                    const mPadded = String(month + 1).padStart(2, '0');
                    const dPadded = String(d).padStart(2, '0');
                    const dateStr = `${year}-${mPadded}-${dPadded}`;
                    cells.push({
                      dayNum: d,
                      dateStr: dateStr,
                      isCurrentMonth: true,
                      isToday: dateStr === todayStr
                    });
                  }

                  // 3. Next Month Spillover Days to complete grid rows
                  const remaining = (7 - (cells.length % 7)) % 7;
                  for (let d = 1; d <= remaining; d++) {
                    cells.push({
                      dayNum: d,
                      dateStr: '',
                      isCurrentMonth: false
                    });
                  }

                  return cells.map((cell, idx) => {
                    if (!cell.isCurrentMonth) {
                      return (
                        <div key={`empty_${idx}`} className="min-h-[85px] sm:min-h-[115px] p-1.5 bg-slate-50/30 dark:bg-gray-950/40 text-slate-300 dark:text-zinc-700 text-xs select-none">
                          <span className="font-mono text-[11px] font-semibold">{cell.dayNum}</span>
                        </div>
                      );
                    }

                    const dayApts = filteredAppointments.filter(a => a.appointment_date === cell.dateStr);

                    return (
                      <div
                        key={cell.dateStr}
                        onClick={() => handleSelectDayView(cell.dateStr)}
                        className={`min-h-[72px] sm:min-h-[110px] p-1 sm:p-2 transition-colors cursor-pointer hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 flex flex-col justify-between group ${cell.isToday ? 'bg-indigo-50/40 dark:bg-yellow-500/5' : 'bg-white dark:bg-gray-900'}`}
                        title={lang === 'bm' ? `Klik untuk lihat jadual penuh (${cell.dateStr})` : `Click to view day timeline (${cell.dateStr})`}
                      >
                        <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                          <span className={`inline-flex items-center justify-center w-4 h-4 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-bold font-mono ${cell.isToday ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black' : 'text-slate-700 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-yellow-400'}`}>
                            {cell.dayNum}
                          </span>
                          {dayApts.length > 0 && (
                            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 dark:text-zinc-500">
                              {dayApts.length}<span className="hidden sm:inline"> {lang === 'bm' ? 'janji' : 'apt'}</span>
                            </span>
                          )}
                        </div>

                        {/* Appointments Pills in this Day */}
                        <div className="space-y-0.5 sm:space-y-1 flex-1 overflow-hidden">
                          {dayApts.slice(0, 2).map((apt) => {
                            const isClash = clashingAppointmentIds.has(apt.id);
                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveAppointment(apt);
                                  setIsViewModalOpen(true);
                                }}
                                className={`px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold truncate transition-all shadow-xs border ${
                                  isClash
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700'
                                    : apt.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800'
                                }`}
                                title={`${isClash ? '[CLASH / PERTINDIHAN] ' : ''}${apt.appointment_time} - ${apt.client_name} (${apt.pic_name})`}
                              >
                                {isClash && <span className="mr-0.5 text-amber-600 dark:text-amber-400 font-bold">⚠️</span>}
                                <span className="font-mono opacity-80 mr-0.5 sm:mr-1">{apt.appointment_time.slice(0, 5)}</span>
                                <span className="hidden sm:inline">{apt.client_name}</span>
                              </div>
                            );
                          })}

                          {dayApts.length > 2 && (
                            <div className="text-[8px] sm:text-[9px] font-bold text-slate-400 dark:text-zinc-500 text-center">
                              +{dayApts.length - 2}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 2. WEEK VIEW */}
          {calendarView === 'week' && (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-gray-800 min-w-[700px]">
                {(() => {
                  const dayOfWeek = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
                  const startOfWeek = new Date(currentDate);
                  startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

                  const weekDays = [];
                  const todayStr = formatDateToYYYYMMDD(new Date());

                  for (let i = 0; i < 7; i++) {
                    const d = new Date(startOfWeek);
                    d.setDate(startOfWeek.getDate() + i);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${day}`;

                    const daysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    const daysBm = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'];
                    const dayLabel = (lang === 'bm' ? daysBm : daysEn)[i];

                    weekDays.push({
                      dayLabel,
                      dayNum: d.getDate(),
                      dateStr,
                      isToday: dateStr === todayStr
                    });
                  }

                  return weekDays.map((col) => {
                    const colApts = filteredAppointments.filter(a => a.appointment_date === col.dateStr);

                    return (
                      <div key={col.dateStr} className="flex flex-col min-h-[450px]">
                        {/* Day Header - Click to switch to Day View */}
                        <div 
                          onClick={() => handleSelectDayView(col.dateStr)}
                          className={`p-3 text-center border-b border-slate-200 dark:border-gray-800 cursor-pointer hover:bg-slate-100/90 dark:hover:bg-zinc-800/80 transition-colors ${col.isToday ? 'bg-indigo-50/80 dark:bg-yellow-500/10' : 'bg-slate-50/60 dark:bg-gray-900/60'}`}
                          title={lang === 'bm' ? `Klik untuk lihat jadual penuh (${col.dateStr})` : `Click to view day timeline (${col.dateStr})`}
                        >
                          <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase">{col.dayLabel}</div>
                          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-extrabold font-mono mt-0.5 ${col.isToday ? 'bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black' : 'text-slate-800 dark:text-zinc-100'}`}>
                            {col.dayNum}
                          </div>
                        </div>

                        {/* Appointments Stack - Click switches to Day View */}
                        <div
                          onClick={() => handleSelectDayView(col.dateStr)}
                          className="flex-1 p-2 space-y-2 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-zinc-900/50 transition-colors"
                          title={lang === 'bm' ? `Klik untuk lihat jadual penuh (${col.dateStr})` : `Click to view day timeline (${col.dateStr})`}
                        >
                          {colApts.length > 0 ? (
                            colApts.map(apt => {
                              const isClash = clashingAppointmentIds.has(apt.id);
                              return (
                                <div
                                  key={apt.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveAppointment(apt);
                                    setIsViewModalOpen(true);
                                  }}
                                  className={`bg-white dark:bg-gray-800 border ${
                                    isClash
                                      ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40 bg-amber-50/20 dark:bg-amber-950/20'
                                      : 'border-slate-200 dark:border-gray-700'
                                  } rounded-xl p-2.5 shadow-sm space-y-1.5 hover:border-indigo-400 dark:hover:border-yellow-500 transition-all cursor-pointer`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-yellow-400 flex items-center gap-1">
                                      {isClash && <span title="Time slot clash with same PIC" className="text-amber-500 font-extrabold">⚠️</span>}
                                      <span>⏰ {apt.appointment_time}</span>
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {isClash && (
                                        <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                          {t('appointments', 'timeClash', lang)}
                                        </span>
                                      )}
                                      {getStatusBadge(apt.status)}
                                    </div>
                                  </div>
                                  <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                    {apt.client_name}
                                  </h5>
                                  <div className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                                    <span>🏷️ {apt.case_category}</span>
                                    <span>👤 {apt.pic_name}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="h-full flex items-center justify-center text-[11px] text-slate-300 dark:text-zinc-700 italic">
                              {lang === 'bm' ? '— Tiada temujanji —' : '— No appointments —'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 3. DAY VIEW */}
          {calendarView === 'day' && (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-gray-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('appointments', 'timelineTitle', lang)}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {t('appointments', 'scheduledCount', lang).replace(
                      '{count}',
                      String(filteredAppointments.filter(a => a.appointment_date === formatDateToYYYYMMDD(currentDate)).length)
                    )}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleOpenAddModal(formatDateToYYYYMMDD(currentDate))}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-yellow-500/10 text-indigo-600 dark:text-yellow-400 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                  >
                    {t('appointments', 'addSlotToday', lang)}
                  </button>
                )}
              </div>

              {/* Day Schedule Cards */}
              <div className="space-y-3">
                {(() => {
                  const activeDateStr = formatDateToYYYYMMDD(currentDate);
                  const dayApts = filteredAppointments.filter(a => a.appointment_date === activeDateStr);

                  if (dayApts.length === 0) {
                    return (
                      <div className="py-16 text-center text-xs font-semibold text-slate-400 dark:text-zinc-500">
                        {t('appointments', 'noAppointmentsToday', lang)}
                      </div>
                    );
                  }

                  return dayApts.map((apt) => {
                    const isClash = clashingAppointmentIds.has(apt.id);
                    return (
                      <div
                        key={apt.id}
                        className={`border ${
                          isClash
                            ? 'border-amber-400 dark:border-amber-500/80 ring-1 ring-amber-400/30 bg-amber-50/20 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30'
                        } rounded-2xl p-4 shadow-sm space-y-3 hover:border-slate-300 dark:hover:border-gray-700 transition-all`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold bg-indigo-600 text-white dark:bg-yellow-500 dark:text-black flex items-center gap-1">
                                {isClash && <span>⚠️</span>}
                                <span>⏰ {apt.appointment_time}</span>
                              </span>
                              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                                {apt.client_name}
                              </h4>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-3 pt-0.5">
                              {apt.client_phone && <span>📞 {apt.client_phone}</span>}
                              <span>📍 {apt.location}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isClash && (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                {t('appointments', 'timeClash', lang)}
                              </span>
                            )}
                            {getStatusBadge(apt.status)}
                          </div>
                        </div>

                        {/* Details 2-col */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-slate-100 dark:border-gray-800">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              {t('appointments', 'category', lang)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">{apt.case_category}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              {t('appointments', 'pic', lang)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">👤 {apt.pic_name}</span>
                          </div>
                        </div>

                        {apt.notes && (
                          <div className="text-xs text-slate-600 dark:text-zinc-300 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 rounded-xl italic border border-amber-100 dark:border-amber-900/30">
                            "{apt.notes}"
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={() => handleShareToWhatsAppGroup(apt)}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <span>📢</span>
                            <span>{t('appointments', 'copyGroupFormat', lang)}</span>
                          </button>
                          {apt.client_phone && (
                            <button
                              onClick={() => handleSendClientReminder(apt)}
                              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                            >
                              <span>💬</span>
                              <span>{t('appointments', 'sendClientReminder', lang)}</span>
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => handleOpenEditModal(apt)}
                              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <span>🗓️</span>
                              <span>{t('appointments', 'reschedule', lang)}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 4. AGENDA / LIST VIEW (Desktop Table + Mobile Cards) */}
          {calendarView === 'list' && (
            <div className="space-y-3">
              {/* Mobile Cards for Phones */}
              <div className="block md:hidden space-y-3">
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map(apt => {
                    const isClash = clashingAppointmentIds.has(apt.id);
                    return (
                      <div
                        key={apt.id}
                        className={`bg-white dark:bg-gray-900 border ${
                          isClash ? 'border-amber-400 dark:border-amber-500/80 ring-1 ring-amber-400/20' : 'border-slate-200 dark:border-gray-800'
                        } rounded-2xl p-4 shadow-sm space-y-3`}
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-gray-800 pb-2.5">
                          <div className="space-y-0.5">
                            <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-yellow-400 flex items-center gap-1">
                              {isClash && <span className="text-amber-500 font-extrabold">⚠️</span>}
                              <span>📅 {apt.appointment_date} • ⏰ {apt.appointment_time}</span>
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {apt.client_name}
                            </h4>
                            {apt.client_phone && (
                              <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                                📞 {apt.client_phone}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isClash && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                {t('appointments', 'timeClash', lang)}
                              </span>
                            )}
                            {getStatusBadge(apt.status)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-gray-800/40 p-2.5 rounded-xl">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              {t('appointments', 'category', lang)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">{apt.case_category}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              {t('appointments', 'pic', lang)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">👤 {apt.pic_name}</span>
                          </div>
                        </div>

                        <div className={`grid ${canManage ? 'grid-cols-2' : 'grid-cols-1'} gap-2 pt-1.5`}>
                          <button
                            type="button"
                            onClick={() => handleShareToWhatsAppGroup(apt)}
                            className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                          >
                            <span>📢</span>
                            <span className="truncate">{t('appointments', 'groupBroadcast', lang)}</span>
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(apt)}
                              className="h-10 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                            >
                              <span>🗓️</span>
                              <span className="truncate">{t('appointments', 'reschedule', lang)}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs font-semibold text-slate-400 dark:text-zinc-500 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800">
                    {t('appointments', 'noAppointments', lang)}
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-800 text-slate-500 dark:text-zinc-400">
                      <th className="px-4 py-3.5 font-bold">{lang === 'bm' ? 'Tarikh & Masa' : 'Date & Time'}</th>
                      <th className="px-4 py-3.5 font-bold">{t('appointments', 'clientName', lang)}</th>
                      <th className="px-4 py-3.5 font-bold">{t('appointments', 'phone', lang)}</th>
                      <th className="px-4 py-3.5 font-bold">{t('appointments', 'category', lang)}</th>
                      <th className="px-4 py-3.5 font-bold">{t('appointments', 'pic', lang)}</th>
                      <th className="px-4 py-3.5 font-bold">{t('appointments', 'status', lang)}</th>
                      <th className="px-4 py-3.5 font-bold text-right">{t('appointments', 'actions', lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {filteredAppointments.length > 0 ? (
                      filteredAppointments.map(apt => {
                        const isClash = clashingAppointmentIds.has(apt.id);
                        return (
                          <tr key={apt.id} className={`hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors ${isClash ? 'bg-amber-50/30 dark:bg-amber-950/15' : ''}`}>
                            <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200 font-bold">
                              <div>{apt.appointment_date}</div>
                              <div className="text-[11px] text-indigo-600 dark:text-yellow-400 font-semibold flex items-center gap-1">
                                {isClash && <span title="Time slot clash with same PIC" className="text-amber-500 font-bold">⚠️</span>}
                                <span>{apt.appointment_time}</span>
                                {isClash && (
                                  <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    {t('appointments', 'timeClash', lang)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                              {apt.client_name}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-zinc-400">
                              {apt.client_phone || '-'}
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-medium">
                              {apt.case_category}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-zinc-200">
                              👤 {apt.pic_name}
                            </td>
                            <td className="px-4 py-3.5">
                              {getStatusBadge(apt.status)}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleShareToWhatsAppGroup(apt)}
                                  className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs flex items-center gap-1"
                                  title={t('appointments', 'copyGroupFormat', lang)}
                                >
                                  <span>📢</span>
                                  <span>{t('appointments', 'groupBroadcast', lang)}</span>
                                </button>
                                {apt.client_phone && (
                                  <button
                                    onClick={() => handleSendClientReminder(apt)}
                                    className="h-7 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold transition-all shadow-xs flex items-center gap-1"
                                    title={t('appointments', 'sendClientReminder', lang)}
                                  >
                                    <span>💬</span>
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                    onClick={() => handleOpenEditModal(apt)}
                                    className="h-7 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80 font-bold transition-all flex items-center gap-1"
                                    title={t('appointments', 'reschedule', lang)}
                                  >
                                    <span>🗓️</span>
                                    <span>{t('appointments', 'reschedule', lang)}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400 dark:text-zinc-500 font-semibold">
                          {t('appointments', 'noAppointments', lang)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── ADD / EDIT APPOINTMENT MODAL ─────────────────────────────────── */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header (Fixed at top) */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-gray-800 px-5 py-4 flex-shrink-0 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-yellow-500/20 text-indigo-600 dark:text-yellow-400 flex items-center justify-center font-bold">
                  📅
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isEditModalOpen ? t('appointments', 'rescheduleAppointment', lang) : t('appointments', 'newAppointment', lang)}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                    {isEditModalOpen ? t('appointments', 'rescheduleSubtitle', lang) : t('appointments', 'modalSubtitle', lang)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="h-8 w-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {/* Quick Autofill Selector from Database */}
              {!isEditModalOpen && clientOptions.length > 0 && (
                <div className="bg-indigo-50/50 dark:bg-yellow-500/5 p-3 rounded-xl border border-indigo-100 dark:border-yellow-500/20 space-y-1">
                  <label className="block text-[11px] font-bold text-indigo-900 dark:text-yellow-400 uppercase tracking-wide">
                    ⚡ {t('appointments', 'selectExistingClient', lang)}
                  </label>
                  <select
                    onChange={handleSelectClientOption}
                    defaultValue=""
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-yellow-500/30 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none"
                  >
                    <option value="">{t('appointments', 'typeCustomClient', lang)}</option>
                    {clientOptions.map(c => (
                      <option key={`${c.type}_${c.id}`} value={`${c.type}_${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-3.5 text-xs">
                {/* Client Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    {t('appointments', 'clientName', lang)} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'bm' ? 'cth: Mohd Amirul' : 'e.g. Mohd Amirul'}
                    value={formData.client_name}
                    onChange={(e) => handleClientNameChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {/* Phone & Location in 2 columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {t('appointments', 'phone', lang)}
                    </label>
                    <input
                      type="text"
                      placeholder="+60 12-345 6789"
                      value={formData.client_phone}
                      onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {t('appointments', 'location', lang)}
                    </label>
                    <select
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="Office Consultation">{t('appointments', 'officeConsultation', lang)}</option>
                      <option value="Phone Call">{t('appointments', 'phoneConsultation', lang)}</option>
                      <option value="Google Meet">{t('appointments', 'onlineMeeting', lang)}</option>
                      <option value="On-Site Visit">{t('appointments', 'onSiteVisit', lang)}</option>
                    </select>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {t('appointments', 'date', lang)} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.appointment_date}
                      onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                        {t('appointments', 'time', lang)} <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={toggleGrabTimePicker}
                        className="text-[11px] text-amber-500 dark:text-amber-400 hover:text-amber-300 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>⏰</span>
                        <span>{lang === 'bm' ? 'Pilih Waktu' : 'Pick Time'}</span>
                      </button>
                    </div>

                    {/* Clicking anywhere on this input or box opens the clock immediately */}
                    <div 
                      onClick={() => { if (!showGrabTimePicker) toggleGrabTimePicker(); }}
                      className="relative cursor-pointer group"
                    >
                      <input
                        type="text"
                        placeholder={lang === 'bm' ? 'cth: 11:00 AM / 11 pagi' : 'e.g. 11:00 AM'}
                        value={formData.appointment_time}
                        onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                        onClick={() => { if (!showGrabTimePicker) toggleGrabTimePicker(); }}
                        className="w-full pl-3.5 pr-11 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-400 cursor-pointer transition-colors"
                        required
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGrabTimePicker();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-zinc-300 group-hover:text-amber-500 transition-colors text-base cursor-pointer"
                        title={lang === 'bm' ? 'Buka penetapan waktu' : 'Open time dial'}
                      >
                        ⏰
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Time Pills under Date & Time */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">
                    {t('appointments', 'commonTimes', lang)}
                  </span>
                  {['9:00 AM', '10:00 AM', '11:00 AM', '2:30 PM', '4:00 PM', '5:00 PM'].map(tStr => (
                    <button
                      key={tStr}
                      type="button"
                      onClick={() => handleSelectPresetTime(tStr)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                        formData.appointment_time === tStr
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      }`}
                    >
                      {tStr}
                    </button>
                  ))}
                </div>

                {/* Category & PIC */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {t('appointments', 'category', lang)}
                    </label>
                    <select
                      value={formData.case_category}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({
                          ...formData,
                          case_category: val,
                          is_custom_category: val === 'Custom'
                        });
                      }}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Loan Shark">Loan Shark / Ah Long</option>
                      <option value="Kredit Komuniti">Kredit Komuniti</option>
                      <option value="Bank">Bank</option>
                      <option value="Scam Victim">Scam Victim</option>
                      <option value="Kemalangan">{lang === 'bm' ? 'Kemalangan' : 'Accident'}</option>
                      <option value="Tuntutan Sivil">{lang === 'bm' ? 'Tuntutan Sivil' : 'Civil Claims'}</option>
                      <option value="Custom">{t('appointments', 'customCategory', lang)}</option>
                    </select>
                    {formData.is_custom_category && (
                      <input
                        type="text"
                        placeholder={lang === 'bm' ? 'Taip kategori...' : 'Type category...'}
                        value={formData.custom_category}
                        onChange={(e) => setFormData({ ...formData, custom_category: e.target.value })}
                        className="w-full mt-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {t('appointments', 'pic', lang)}
                    </label>
                    <select
                      value={formData.pic_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({
                          ...formData,
                          pic_name: val,
                          is_custom_pic: val === 'Custom'
                        });
                      }}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      {staffList.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="Custom">{t('appointments', 'customPic', lang)}</option>
                    </select>
                    {formData.is_custom_pic && (
                      <input
                        type="text"
                        placeholder={lang === 'bm' ? 'Nama pegawai...' : 'Officer name...'}
                        value={formData.custom_pic}
                        onChange={(e) => setFormData({ ...formData, custom_pic: e.target.value })}
                        className="w-full mt-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-semibold"
                      />
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    {t('appointments', 'status', lang)}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="Scheduled">{t('appointments', 'scheduled', lang)}</option>
                    <option value="In Progress">{t('appointments', 'inProgress', lang)}</option>
                    <option value="Completed">{t('appointments', 'completed', lang)}</option>
                    <option value="Cancelled">{t('appointments', 'cancelled', lang)}</option>
                    <option value="No-Show">{t('appointments', 'noShow', lang)}</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    {t('appointments', 'notes', lang)}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={t('appointments', 'notesPlaceholder', lang)}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Live Non-blocking Time Clash Advisory Banner */}
                {formClashAppointment && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in">
                    <span className="text-base flex-shrink-0">⚠️</span>
                    <div className="space-y-0.5">
                      <span className="font-bold block text-amber-900 dark:text-amber-300">
                        {t('appointments', 'timeClash', lang)}
                      </span>
                      <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                        {t('appointments', 'clashNotice', lang)
                          .replace('{pic}', formClashAppointment.pic_name || '-')
                          .replace('{time}', formClashAppointment.appointment_time || '-')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Template Preview Box */}
                <div className="bg-slate-50 dark:bg-gray-800/60 p-3 rounded-xl border border-slate-200 dark:border-gray-700 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    {t('appointments', 'whatsappGroupFormat', lang)}
                  </div>
                  <pre className="text-[11px] font-mono text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-tight bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-slate-100 dark:border-gray-800 max-h-28 overflow-y-auto">
                    {generateWhatsAppGroupMessage({
                      client_name: formData.client_name,
                      appointment_date: formData.appointment_date,
                      appointment_time: formData.appointment_time,
                      case_category: formData.is_custom_category ? formData.custom_category : formData.case_category,
                      pic_name: formData.is_custom_pic ? formData.custom_pic : formData.pic_name
                    })}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Actions (Fixed at bottom) */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-gray-800 flex-shrink-0 bg-slate-50 dark:bg-gray-900/90 flex flex-col sm:flex-row items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {t('appointments', 'cancel', lang)}
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto flex-1 sm:justify-end">
                {/* Save Only / Save Reschedule */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitForm(false)}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl bg-white dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-gray-700 font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isEditModalOpen ? t('appointments', 'saveReschedule', lang) : t('appointments', 'saveOnly', lang)}
                </button>

                {/* 1-Click Save & Share WhatsApp / Reschedule & Share WhatsApp */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitForm(true)}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <span>📢</span>
                  <span>{submitting ? t('appointments', 'saving', lang) : (isEditModalOpen ? t('appointments', 'rescheduleAndShareWhatsApp', lang) : t('appointments', 'saveAndShareWhatsApp', lang))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CLIENT APPOINTMENT TIME PICKER MODAL (SIGNATURE GOLDEN THEME) ─── */}
      {showGrabTimePicker && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowGrabTimePicker(false)}
        >
          <div 
            className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-sm max-h-[88vh] overflow-y-auto p-4 sm:p-5 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-200 text-white overscroll-contain flex flex-col shadow-amber-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Signature Golden Theme */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black text-sm shadow-md shadow-amber-500/30">
                  ⏰
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
                      {lang === 'bm' ? 'Jadualkan Temujanji' : 'Schedule Appointment'}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-amber-950/80 text-amber-300 border border-amber-800">
                      LIVE
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-200">
                    {lang === 'bm' ? 'Tetapkan Masa Temujanji' : 'Set Appointment Time'}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGrabTimePicker(false)}
                className="h-7 w-7 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Editable Digital Time Display (Recessed Pill Dial) */}
            <div className="bg-slate-950/90 p-3 rounded-2xl border border-amber-500/20 text-center flex-shrink-0 shadow-inner">
              <div className="text-[10px] font-bold text-amber-400/90 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5">
                <span>⚡</span>
                <span>{lang === 'bm' ? 'Waktu Dipilih (Boleh Taip Terus)' : 'Selected Time (Editable)'}</span>
              </div>
              <div className="flex items-center justify-center">
                <input
                  type="text"
                  value={formData.appointment_time}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, appointment_time: val });
                    const match = val.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm|pagi|petang|malam)?/i);
                    if (match) {
                      let h = parseInt(match[1], 10);
                      let m = match[2] ? match[2] : '00';
                      let p: 'AM' | 'PM' = 'AM';
                      if (match[3] && (match[3].toLowerCase().includes('pm') || match[3].toLowerCase().includes('petang') || match[3].toLowerCase().includes('malam'))) {
                        p = 'PM';
                      } else if (h >= 12) {
                        p = 'PM';
                        if (h > 12) h -= 12;
                      }
                      if (h === 0) h = 12;
                      setPickerHour(String(h > 12 ? h - 12 : h).padStart(2, '0'));
                      setPickerMinute(m.padStart(2, '0'));
                      setPickerPeriod(p);
                    }
                  }}
                  placeholder="11:00 AM"
                  className="w-52 text-center text-3xl font-black font-mono tracking-widest text-amber-400 bg-slate-900/80 px-3 py-1 rounded-xl border border-amber-500/30 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none transition-all shadow-md"
                />
              </div>
            </div>

            {/* ─── LUGGAGE LOCK 3D TUMBLER WHEELS (SIGNATURE GOLDEN THEME) ─── */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between text-[9px] font-extrabold text-amber-400/80 uppercase tracking-wider px-1">
                <span>🔒 {lang === 'bm' ? 'Kunci Bagasi (Pilihan Tengah)' : 'Luggage Lock (Center Fixed)'}</span>
                <span>{lang === 'bm' ? 'Klik ▲ ▼ / Pusing' : 'Click ▲ ▼ / Scroll'}</span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
                {/* 1. Column Headers (Positioned cleanly at the top of each drum) */}
                <div className="grid grid-cols-3 gap-2 mb-1.5 text-center">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    {lang === 'bm' ? 'Jam' : 'Hour'}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    {lang === 'bm' ? 'Minit' : 'Minute'}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    {lang === 'bm' ? 'Waktu' : 'Period'}
                  </span>
                </div>

                {/* 2. Top Stepper Row (▲) */}
                <div className="grid grid-cols-3 gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => spinHour(-1)}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Pusing Jam Naik' : 'Spin Hour Up'}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => spinMinute(-1)}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Pusing Minit Naik' : 'Spin Minute Up'}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={spinPeriod}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Tukar AM / PM' : 'Toggle AM / PM'}
                  >
                    ▲
                  </button>
                </div>

                {/* 3. Drum Tumbler Box - Exactly 3 rows: Top (32px), Center (44px), Bottom (32px) = 108px Total */}
                <div className="relative grid grid-cols-3 gap-2 h-[108px] bg-slate-900/60 rounded-xl border border-slate-800/60 overflow-hidden">
                  {/* SIGNATURE GOLDEN SELECTION LENS BAR (Clean lens without colliding edge dots) */}
                  <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-11 border-y-2 border-amber-400 bg-amber-400/15 rounded-xl z-10 shadow-lg shadow-amber-500/20" />

                  {/* HOUR DRUM */}
                  <div 
                    onWheel={(e) => {
                      e.preventDefault();
                      spinHour(e.deltaY > 0 ? 1 : -1);
                    }}
                    className="h-full flex flex-col justify-between items-center select-none cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={() => spinHour(-1)}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 hover:text-amber-300 transition-colors flex items-center justify-center"
                    >
                      {getPrevHour(pickerHour)}
                    </button>
                    <div className="h-11 w-full flex items-center justify-center relative z-20">
                      <span className="text-2xl font-black font-mono tracking-wider text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                        {pickerHour}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => spinHour(1)}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 hover:text-amber-300 transition-colors flex items-center justify-center"
                    >
                      {getNextHour(pickerHour)}
                    </button>
                  </div>

                  {/* MINUTE DRUM */}
                  <div 
                    onWheel={(e) => {
                      e.preventDefault();
                      spinMinute(e.deltaY > 0 ? 1 : -1);
                    }}
                    className="h-full flex flex-col justify-between items-center select-none cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={() => spinMinute(-1)}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 hover:text-amber-300 transition-colors flex items-center justify-center"
                    >
                      {getPrevMinute(pickerMinute)}
                    </button>
                    <div className="h-11 w-full flex items-center justify-center relative z-20">
                      <span className="text-2xl font-black font-mono tracking-wider text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                        {pickerMinute}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => spinMinute(1)}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 hover:text-amber-300 transition-colors flex items-center justify-center"
                    >
                      {getNextMinute(pickerMinute)}
                    </button>
                  </div>

                  {/* PERIOD DRUM (Centered font-mono typography matching Hour & Minute) */}
                  <div 
                    onWheel={(e) => {
                      e.preventDefault();
                      spinPeriod();
                    }}
                    onClick={spinPeriod}
                    className="h-full flex flex-col justify-between items-center select-none cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={spinPeriod}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 flex items-center justify-center gap-1 opacity-40 hover:opacity-80 transition-opacity"
                    >
                      <span>{pickerPeriod === 'AM' ? 'PM' : 'AM'}</span>
                    </button>

                    <div className="h-11 w-full flex items-center justify-center gap-1.5 relative z-20">
                      <span className="text-xs">
                        {pickerPeriod === 'AM' ? '☀️' : '🌙'}
                      </span>
                      <span className="text-2xl font-black font-mono tracking-wider text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]">
                        {pickerPeriod}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={spinPeriod}
                      className="h-8 w-full text-xs font-mono font-bold text-slate-500 flex items-center justify-center gap-1 opacity-40 hover:opacity-80 transition-opacity"
                    >
                      <span>{pickerPeriod === 'AM' ? 'PM' : 'AM'}</span>
                    </button>
                  </div>
                </div>

                {/* 4. Bottom Stepper Row (▼) */}
                <div className="grid grid-cols-3 gap-2 mt-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => spinHour(1)}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Pusing Jam Turun' : 'Spin Hour Down'}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => spinMinute(1)}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Pusing Minit Turun' : 'Spin Minute Down'}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={spinPeriod}
                    className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/60 text-slate-400 hover:text-amber-400 text-xs font-black transition-colors flex items-center justify-center cursor-pointer border border-slate-800 active:scale-95"
                    title={lang === 'bm' ? 'Tukar AM / PM' : 'Toggle AM / PM'}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* Popular Shortcuts (Golden Accents + Complete Malaysian Business Slot List) */}
            <div className="space-y-1.5 flex-shrink-0">
              <span className="text-[9px] font-bold text-amber-400/80 uppercase tracking-wider block">
                ⚡ {lang === 'bm' ? 'Slot Paling Popular' : 'Popular Time Slots'}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {['9:00 AM', '10:00 AM', '11:00 AM', '11:30 AM', '12:00 PM', '2:00 PM', '2:30 PM', '3:00 PM', '4:00 PM', '5:00 PM'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPresetTime(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      formData.appointment_time === preset
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/25 ring-1 ring-amber-300'
                        : 'bg-slate-800/90 hover:bg-amber-950/50 text-slate-300 hover:text-amber-400 border border-slate-700/80'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons: Batal / Cancel & Selesai / Done */}
            <div className="flex items-center gap-2 w-full flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowGrabTimePicker(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {t('appointments', 'cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => setShowGrabTimePicker(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>✓</span>
                <span>{lang === 'bm' ? `Selesai: ${pickerHour}:${pickerMinute} ${pickerPeriod}` : `Done: ${pickerHour}:${pickerMinute} ${pickerPeriod}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW APPOINTMENT DOSSIER MODAL ──────────────────────────────── */}
      {isViewModalOpen && activeAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header (Fixed) */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-gray-800 p-4 sm:p-5 flex-shrink-0 bg-white dark:bg-gray-900">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeAppointment.client_name}
                  </h3>
                  {getStatusBadge(activeAppointment.status)}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {activeAppointment.id.slice(0, 8)}...
                </div>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="h-8 w-8 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 overscroll-contain">
              {/* Schedule Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-50 dark:bg-gray-800/40 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {lang === 'bm' ? 'Tarikh & Masa' : 'Date & Time'}
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white block mt-0.5 font-mono">
                    📅 {activeAppointment.appointment_date} • ⏰ {activeAppointment.appointment_time}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-gray-800/40 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {t('appointments', 'pic', lang)}
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white block mt-0.5">
                    👤 {activeAppointment.pic_name}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-gray-800/40 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {t('appointments', 'category', lang)}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 block mt-0.5">
                    🏷️ {activeAppointment.case_category}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-gray-800/40 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {t('appointments', 'location', lang)}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 block mt-0.5">
                    📍 {activeAppointment.location}
                  </span>
                </div>
              </div>

              {/* Clash Alert in View Modal */}
              {clashingAppointmentIds.has(activeAppointment.id) && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <span className="text-base flex-shrink-0">⚠️</span>
                  <div>
                    <span className="font-bold block text-amber-900 dark:text-amber-300">
                      {t('appointments', 'timeClash', lang)}
                    </span>
                    <span className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
                      {lang === 'bm'
                        ? `Terdapat temujanji lain pada tarikh & masa yang sama bersama ${activeAppointment.pic_name}.`
                        : `Another appointment is scheduled at this exact date & time with ${activeAppointment.pic_name}.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div className="flex items-center justify-between text-xs bg-indigo-50/50 dark:bg-yellow-500/5 p-3 rounded-xl border border-indigo-100 dark:border-yellow-500/20">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {t('appointments', 'phone', lang)}
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    📞 {activeAppointment.client_phone || '-'}
                  </span>
                </div>
                {activeAppointment.client_phone && (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://wa.me/${activeAppointment.client_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-700"
                    >
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${activeAppointment.client_phone}`}
                      className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-bold shadow-xs hover:bg-cyan-700"
                    >
                      Call
                    </a>
                  </div>
                )}
              </div>

              {/* Notes */}
              {activeAppointment.notes && (
                <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-xl text-xs text-slate-700 dark:text-zinc-300 italic">
                  "{activeAppointment.notes}"
                </div>
              )}

              {/* Quick WhatsApp Actions */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => handleShareToWhatsAppGroup(activeAppointment)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>📢</span>
                  <span>{t('appointments', 'copyGroupFormat', lang)}</span>
                </button>

                {activeAppointment.client_phone && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSendClientReminder(activeAppointment)}
                      className="w-full py-2 px-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>💬</span>
                      <span>{t('appointments', 'sendClientReminder', lang)}</span>
                    </button>
                    <button
                      onClick={() => handleSendClientRescheduleNotice(activeAppointment)}
                      className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>🗓️</span>
                      <span>{t('appointments', 'sendClientReschedule', lang)}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Status & Edit Actions (Protected) */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-gray-800 flex-shrink-0 bg-slate-50 dark:bg-gray-900/90 flex items-center justify-between gap-2">
              {canManage ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {activeAppointment.status !== 'Completed' && (
                      <button
                        onClick={() => handleUpdateStatus(activeAppointment, 'Completed')}
                        className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-lg text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                      >
                        {t('appointments', 'markCompleted', lang)}
                      </button>
                    )}
                    {activeAppointment.status !== 'Cancelled' && (
                      <button
                        onClick={() => handleUpdateStatus(activeAppointment, 'Cancelled')}
                        className="px-2.5 py-1.5 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg text-xs font-bold hover:bg-rose-100 cursor-pointer"
                      >
                        {t('appointments', 'markCancelled', lang)}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setIsViewModalOpen(false);
                        handleOpenEditModal(activeAppointment);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>🗓️</span>
                      <span>{t('appointments', 'reschedule', lang)}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(activeAppointment)}
                      className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg text-xs font-bold cursor-pointer"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <span>👁️</span>
                    <span>{lang === 'bm' ? 'Mod Paparan Sahaja' : 'View Only Mode'}</span>
                  </span>
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    {t('appointments', 'cancel', lang)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
