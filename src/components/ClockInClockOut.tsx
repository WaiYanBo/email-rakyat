import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

export default function ClockInClockOut() {
  const { lang } = usePortalLanguage();
  const [profile, setProfile] = useState<any>(null);
  const { permissions, loading: permsLoading } = usePermissions(profile);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [todayLeave, setTodayLeave] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [forgotClockoutRecords, setForgotClockoutRecords] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLateClockoutModalOpen, setIsLateClockoutModalOpen] = useState(false);
  const [lateClockoutRecord, setLateClockoutRecord] = useState<any>(null);
  const [lateClockoutTime, setLateClockoutTime] = useState('');
  const [isSubmittingLateClockout, setIsSubmittingLateClockout] = useState(false);
  const [detailFilterEmployee, setDetailFilterEmployee] = useState('');
  const [detailFilterMode, setDetailFilterMode] = useState<'all' | 'day' | 'month'>('all');
  const [detailFilterDay, setDetailFilterDay] = useState('');
  const [detailFilterMonth, setDetailFilterMonth] = useState('');

  // Office coordinates
  const OFFICE_LAT = 3.0750624396122763;
  const OFFICE_LNG = 101.61250689446412;
  const ZONE_RADIUS_METERS = 200;
  const MINIMUM_WORK_HOURS = 9;

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate working hours between clock in and clock out
  const calculateWorkingHours = (clockInTime: string, clockOutTime: string | null): { hours: number; minutes: number } | null => {
    if (!clockInTime || !clockOutTime) return null;

    const clockIn = new Date(clockInTime);
    const clockOut = new Date(clockOutTime);
    const diffMs = clockOut.getTime() - clockIn.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  // Fetch attendance records efficiently
  const fetchForgotClockoutRecords = async (userId?: string, isPrivileged?: boolean) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const privileged = isPrivileged;

      // 1. Fetch forgot clockouts specifically (server-side filtering)
      let forgotQuery = supabase
        .from('attendance')
        .select('*')
        .not('date', 'eq', today)
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null)
        .order('date', { ascending: false });

      if (!privileged && userId) {
        forgotQuery = forgotQuery.eq('user_id', userId);
      }

      const { data: forgotRecords, error: forgotError } = await forgotQuery;

      if (forgotError) {
        console.error('Error fetching forgot clockout records:', forgotError);
      } else if (forgotRecords) {
        setForgotClockoutRecords(forgotRecords);
      }

      // 2. Fetch a limited set of recent records for general view/export
      let allQuery = supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false })
        .limit(300);

      if (!privileged && userId) {
        allQuery = allQuery.eq('user_id', userId);
      }

      const { data: recentRecords, error: allErr } = await allQuery;

      // 3. Fetch approved leave requests to inject into the history
      let leaveQuery = supabase
        .from('leave_requests')
        .select('*, profiles!profile_id(full_name)')
        .eq('status', 'Approved');

      if (!privileged && userId) {
        leaveQuery = leaveQuery.eq('profile_id', userId);
      }

      const { data: leavesData } = await leaveQuery;

      if (allErr) {
         console.error('Error fetching recent attendance records:', allErr);
      } else if (recentRecords) {
         const { data: allProfiles } = await supabase
           .from('profiles')
           .select('id, full_name');
         const profilesMap = new Map((allProfiles || []).map(p => [p.id, p.full_name]));

         const enrichedRecords = recentRecords.map((r: any) => ({
           ...r,
           user_name: profilesMap.get(r.user_id) || r.user_name || 'Unknown'
         }));

         if (leavesData && leavesData.length > 0) {
           leavesData.forEach((leave: any) => {
             const startDate = new Date(leave.start_date);
             const endDate = new Date(leave.end_date);
             let currentDate = new Date(startDate);
             while (currentDate <= endDate) {
               const dayOfWeek = currentDate.getDay();
               // Mon-Fri only
               if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                 const dateStr = currentDate.toISOString().split('T')[0];
                 const existingRecord = enrichedRecords.find(r => r.user_id === leave.profile_id && r.date === dateStr);
                 if (!existingRecord) {
                   enrichedRecords.push({
                     id: `leave-${leave.id}-${dateStr}`,
                     user_id: leave.profile_id,
                     user_name: leave.profiles?.full_name || profilesMap.get(leave.profile_id) || 'Unknown',
                     date: dateStr,
                     clock_in_time: null,
                     clock_out_time: null,
                     is_leave: true,
                     leave_type: leave.leave_type
                   });
                 }
               }
               currentDate.setDate(currentDate.getDate() + 1);
             }
           });
         }

         // Sort enriched records by date descending, then user_name ascending
         enrichedRecords.sort((a: any, b: any) => {
           if (a.date !== b.date) return b.date.localeCompare(a.date);
           return (a.user_name || '').localeCompare(b.user_name || '');
         });

         setAllRecords(enrichedRecords);
      }
    } catch (err) {
      console.error('Exception fetching records:', err);
    }
  };

  // Memoized filtered forgot clockout records
  const filteredForgotRecords = useMemo(() => {
    let result = [...forgotClockoutRecords];

    if (detailFilterEmployee) {
      result = result.filter(r => r.user_name?.toLowerCase().includes(detailFilterEmployee.toLowerCase()));
    }

    if (detailFilterMode === 'day' && detailFilterDay) {
      result = result.filter(r => r.date === detailFilterDay);
    } else if (detailFilterMode === 'month' && detailFilterMonth) {
      result = result.filter(r => r.date?.startsWith(detailFilterMonth));
    }

    return result;
  }, [forgotClockoutRecords, detailFilterEmployee, detailFilterMode, detailFilterDay, detailFilterMonth]);

  // Memoized filtered all records
  const filteredAllRecords = useMemo(() => {
    let result = [...allRecords];

    if (detailFilterEmployee) {
      result = result.filter(r => r.user_name?.toLowerCase().includes(detailFilterEmployee.toLowerCase()));
    }

    if (detailFilterMode === 'day' && detailFilterDay) {
      result = result.filter(r => r.date === detailFilterDay);
    } else if (detailFilterMode === 'month' && detailFilterMonth) {
      result = result.filter(r => r.date?.startsWith(detailFilterMonth));
    }

    return result;
  }, [allRecords, detailFilterEmployee, detailFilterMode, detailFilterDay, detailFilterMonth]);

  const exportForgotClockoutsToExcel = () => {
    if (filteredForgotRecords.length === 0) {
      alert(t('attendance', 'noRecordsToExport', lang));
      return;
    }

    const exportData = filteredForgotRecords.map(record => ({
      'Employee Name': record.user_name || '-',
      'Date': record.date || '-',
      'Clock In Time': record.clock_in_time ? new Date(record.clock_in_time).toLocaleTimeString() : '-',
      'Status': 'Forgot Clockout (No Clockout)'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Forgot Clockouts');

    const colWidths = [20, 15, 15, 25];
    ws['!cols'] = colWidths.map(width => ({ wch: width }));

    const filename = `Forgot_Clockouts_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportWorkingHoursToExcel = () => {
    if (filteredAllRecords.length === 0) {
      alert(t('attendance', 'noRecordsToExport', lang));
      return;
    }

    // Group by employee name + date to support multiple daily shifts
    const grouped: Record<string, any[]> = {};
    filteredAllRecords.forEach(record => {
      const key = `${record.user_name || 'Unknown'}_${record.date || 'NoDate'}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(record);
    });

    const exportData = Object.values(grouped).map(dayRecords => {
      // Sort by clock_in_time ascending
      dayRecords.sort((a, b) => new Date(a.clock_in_time).getTime() - new Date(b.clock_in_time).getTime());

      const firstRecord = dayRecords[0];
      const lastRecord = dayRecords[dayRecords.length - 1];
      const isCompleted = dayRecords.every(r => r.clock_out_time);
      const isForgot = dayRecords.some(r => r.clock_in_time && !r.clock_out_time);
      const isLateClockout = dayRecords.some(r => r.is_late_clockout);

      if (firstRecord.is_leave) {
        let leaveTypeName = firstRecord.leave_type || 'On Leave';
        if (leaveTypeName.toLowerCase() === 'sick') leaveTypeName = 'Sick Leave';
        else if (leaveTypeName.toLowerCase() === 'annual') leaveTypeName = 'Annual Leave';
        else if (leaveTypeName.toLowerCase() === 'hospitalisation') leaveTypeName = 'Hospitalisation Leave';
        else if (leaveTypeName.toLowerCase() === 'maternity') leaveTypeName = 'Maternity Leave';
        else if (leaveTypeName.toLowerCase() === 'paternity') leaveTypeName = 'Paternity Leave';
        else if (leaveTypeName.toLowerCase() === 'unpaid') leaveTypeName = 'Unpaid Leave';

        return {
          'Employee Name': firstRecord.user_name || '-',
          'Date': firstRecord.date || '-',
          'Clock In Time': leaveTypeName,
          'Clock Out Time': leaveTypeName,
          'Hours Worked': '-',
          'Status Flag': leaveTypeName
        };
      }

      // Sum of working times of all completed shifts
      let totalWorkMs = 0;
      dayRecords.forEach(r => {
        if (r.clock_in_time && r.clock_out_time) {
          totalWorkMs += new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime();
        }
      });

      const totalHours = totalWorkMs / (1000 * 60 * 60);
      const workingHours = {
        hours: Math.floor(totalHours),
        minutes: Math.round((totalHours % 1) * 60)
      };

      // Subtract 1 hour default break for short day check
      const adjustedHours = Math.max(0, totalHours - 1);
      const isShortDay = isCompleted && adjustedHours < MINIMUM_WORK_HOURS;

      let flagStatus = 'Full';
      if (isForgot) flagStatus = 'No Clockout';
      else if (isLateClockout) flagStatus = 'Late Clockout (Flagged)';
      else if (isShortDay) flagStatus = `Short Day (<${MINIMUM_WORK_HOURS}h)`;

      return {
        'Employee Name': firstRecord.user_name || '-',
        'Date': firstRecord.date || '-',
        'Clock In Time': firstRecord.clock_in_time ? new Date(firstRecord.clock_in_time).toLocaleTimeString() : '-',
        'Clock Out Time': isCompleted ? new Date(lastRecord.clock_out_time).toLocaleTimeString() : (isForgot ? 'No Clockout' : '-'),
        'Hours Worked': isCompleted ? `${workingHours.hours}h ${workingHours.minutes}m` : '-',
        'Status Flag': flagStatus
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Working Hours Summary');

    const colWidths = [20, 15, 15, 15, 15, 25];
    ws['!cols'] = colWidths.map(width => ({ wch: width }));

    const filename = `Working_Hours_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Helper to run a single geolocation request with a safety timeout net
  const getSingleLocation = (options: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      let finished = false;

      // Timeout safety net to handle Safari "doing nothing" hang bug
      const safetyTimeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new DOMException("Location request timed out (safety net)", "TimeoutError"));
        }
      }, (options.timeout || 10000) + 1500); // 1.5s grace period over standard timeout

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!finished) {
            finished = true;
            clearTimeout(safetyTimeoutId);
            resolve(position);
          }
        },
        (error) => {
          if (!finished) {
            finished = true;
            clearTimeout(safetyTimeoutId);
            reject(error);
          }
        },
        options
      );
    });
  };

  // Robust location helper with sequential fallbacks (High Accuracy -> Low Accuracy/Wi-Fi -> Cached last resort)
  const getCurrentPositionWithFallback = async (): Promise<GeolocationPosition> => {
    if (!navigator.geolocation) {
      throw new DOMException("Geolocation not supported", "NotSupportedError");
    }

    // Attempt 1: High accuracy, fresh position, moderate timeout (10 seconds)
    try {
      console.log("Attempt 1: high accuracy");
      return await getSingleLocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    } catch (err: any) {
      console.warn("Attempt 1 (High Accuracy) failed:", err);
      // Code 1 is PERMISSION_DENIED. If user denied permission, do not retry.
      if (err.code === 1) {
        throw err;
      }

      // Attempt 2: Fallback to lower accuracy (much faster, works indoors using Wi-Fi / Cell towers)
      try {
        console.log("Attempt 2: lower accuracy fallback");
        return await getSingleLocation({
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 10000 // Accept position up to 10s old
        });
      } catch (err2: any) {
        console.warn("Attempt 2 (Low Accuracy) failed:", err2);
        if (err2.code === 1) {
          throw err2;
        }

        // Attempt 3: Cached position fallback (as a last resort)
        try {
          console.log("Attempt 3: cached position fallback");
          return await getSingleLocation({
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: Infinity // Allow any cached position
          });
        } catch (err3) {
          console.error("All geolocation attempts failed:", err3);
          throw err3;
        }
      }
    }
  };

  // Actionable instruction text for iOS users facing permission issues
  const getActionableErrorMessage = (error: any): string => {
    const isBm = lang === 'bm';
    
    // Check if it's permission denied (code 1)
    if (error.code === 1) {
      return isBm
        ? "Akses lokasi ditolak.\n\nSila dayakan akses lokasi untuk Safari/Chrome di iPhone anda:\n1. Buka Settings > Privacy & Security > Location Services.\n2. Pastikan Location Services dihidupkan.\n3. Skrol ke bawah dan pilih Safari / Chrome.\n4. Pilih 'While Using the App' dan hidupkan 'Precise Location'."
        : "Location access denied.\n\nPlease enable location access for Safari/Chrome on your iPhone:\n1. Go to Settings > Privacy & Security > Location Services.\n2. Ensure Location Services is turned ON.\n3. Scroll down and select Safari / Chrome.\n4. Select 'While Using the App' and turn ON 'Precise Location'.";
    }
    
    // Other errors (timeout/unavailable/safety-net)
    return isBm
      ? "Gagal mendapatkan lokasi.\n\nTips untuk iPhone:\n1. Pastikan Wi-Fi dihidupkan (ia membantu carian lokasi dalam bangunan).\n2. Gerak berhampiran tingkap atau kawasan terbuka untuk isyarat GPS lebih kuat.\n3. Periksa tetapan lokasi anda."
      : "Failed to get location.\n\nTips for iPhone:\n1. Ensure Wi-Fi is turned ON (helps with indoor location positioning).\n2. Move near a window or open area for a stronger GPS signal.\n3. Check your device location settings.";
  };

  const checkLocationPermission = async () => {
    if (!navigator.geolocation) {
      setLocationStatus(t('attendance', 'geolocationNotSupported', lang));
      return false;
    }

    setLocationStatus(t('attendance', 'requestingLocation', lang));

    try {
      await getCurrentPositionWithFallback();
      setLocationStatus(t('attendance', 'locationAccessed', lang));
      setHasLocationPermission(true);
      return true;
    } catch (error) {
      setLocationStatus(t('attendance', 'locationAccessDenied', lang));
      setHasLocationPermission(false);
      return false;
    }
  };

  const getLocationAndClockIn = async (type: 'clock_in' | 'clock_out') => {
    setIsProcessing(true);
    setLocationStatus(t('attendance', 'requestingLocation', lang));

    try {
      if (!navigator.geolocation) {
        alert(t('attendance', 'geolocationNotSupported', lang));
        setIsProcessing(false);
        return;
      }

      const position = await getCurrentPositionWithFallback();
      const { latitude, longitude, accuracy } = position.coords;
      const distance = calculateDistance(OFFICE_LAT, OFFICE_LNG, latitude, longitude);
      const isWithinZone = distance <= ZONE_RADIUS_METERS;

      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert(t('attendance', 'sessionExpired', lang));
        setIsProcessing(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Get today's active record (where clock_out_time is null)
      const { data: activeRecord } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      let error;

      if (type === 'clock_in') {
        if (activeRecord) {
          alert(lang === 'bm' ? 'Anda sudah daftar masuk. Sila daftar keluar dahulu.' : 'You are already clocked in. Please clock out first.');
          setIsProcessing(false);
          return;
        }

        const attendanceData = {
          user_id: session.user.id,
          user_name: profile?.name,
          date: today,
          clock_in_time: new Date().toISOString(),
          clock_in_latitude: latitude,
          clock_in_longitude: longitude,
          clock_in_distance: Math.round(distance),
          clock_in_within_zone: isWithinZone,
          clock_in_accuracy: Math.round(accuracy)
        };

        const { error: insertError } = await supabase
          .from('attendance')
          .insert([attendanceData]);
        error = insertError;
      } else {
        if (!activeRecord) {
          alert(lang === 'bm' ? 'Tiada rekod daftar masuk aktif ditemui untuk daftar keluar.' : 'No active clock-in session found to clock out from.');
          setIsProcessing(false);
          return;
        }

        const attendanceData = {
          clock_out_time: new Date().toISOString(),
          clock_out_latitude: latitude,
          clock_out_longitude: longitude,
          clock_out_distance: Math.round(distance),
          clock_out_within_zone: isWithinZone,
          clock_out_accuracy: Math.round(accuracy)
        };

        const { error: updateError } = await supabase
          .from('attendance')
          .update(attendanceData)
          .eq('id', activeRecord.id);
        error = updateError;
      }

      if (error) {
        console.error(`Error recording ${type}:`, error);
        alert(`${t('attendance', 'failedToRecord', lang)} ${type === 'clock_in' ? (lang === 'bm' ? 'daftar masuk' : 'clock in') : (lang === 'bm' ? 'daftar keluar' : 'clock out')}`);
      } else {
        const typeStr = type === 'clock_in' ? t('attendance', 'checkedIn', lang) : t('attendance', 'checkedOut', lang);
        const zoneStr = isWithinZone ? t('attendance', 'inZone', lang) : t('attendance', 'outsideZone', lang);
        const awayStr = lang === 'bm' ? `${Math.round(distance)}m dari pejabat` : `${Math.round(distance)}m away`;
        setLocationStatus(`${typeStr} - ${zoneStr} (${awayStr})`);
        await fetchTodayRecord();
      }
    } catch (err: any) {
      console.error('Geolocation error:', err);
      const errMsg = getActionableErrorMessage(err);
      alert(errMsg);
      setLocationStatus(t('attendance', 'locationAccessFailed', lang));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenLateClockoutModal = (record: any) => {
    setLateClockoutRecord(record);
    setLateClockoutTime('18:00');
    setIsLateClockoutModalOpen(true);
  };

  const handleLateClockoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lateClockoutRecord || !lateClockoutTime) return;

    setIsSubmittingLateClockout(true);

    try {
      // Get location coordinates if possible (non-blocking)
      let latitude: number | null = null;
      let longitude: number | null = null;
      let distance: number | null = null;
      let withinZone = false;
      let accuracy: number | null = null;

      if (navigator.geolocation) {
        try {
          const position = await getCurrentPositionWithFallback();
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          accuracy = Math.round(position.coords.accuracy);
          distance = Math.round(calculateDistance(OFFICE_LAT, OFFICE_LNG, latitude, longitude));
          withinZone = distance <= ZONE_RADIUS_METERS;
        } catch (err) {
          console.warn('Geolocation failed or timed out for late clockout submission:', err);
        }
      }

      // Construct clockout timestamp from the record date and input time
      const [year, month, day] = lateClockoutRecord.date.split('-').map(Number);
      const [hours, minutes] = lateClockoutTime.split(':').map(Number);
      const actualClockoutDate = new Date(year, month - 1, day, hours, minutes);
      const clockoutTimeISO = actualClockoutDate.toISOString();

      // Check if clockout time is after clockin time
      const clockInTime = new Date(lateClockoutRecord.clock_in_time);
      if (actualClockoutDate <= clockInTime) {
        const timeFormatted = clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const clockOutAfterClockInMsg = lang === 'bm'
          ? `Waktu daftar keluar sebenar mestilah selepas waktu daftar masuk (${timeFormatted}).`
          : `Actual clock-out time must be after clock-in time (${timeFormatted}).`;
        alert(clockOutAfterClockInMsg);
        setIsSubmittingLateClockout(false);
        return;
      }

      // Update attendance record
      const updateData = {
        clock_out_time: clockoutTimeISO,
        clock_out_latitude: latitude,
        clock_out_longitude: longitude,
        clock_out_distance: distance,
        clock_out_within_zone: withinZone,
        clock_out_accuracy: accuracy,
        is_late_clockout: true,
        late_clockout_flagged: true,
        late_clockout_reported_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('attendance')
        .update(updateData)
        .eq('id', lateClockoutRecord.id);

      if (updateError) {
        console.error('Error updating late clockout:', updateError);
        alert(t('attendance', 'failedSubmitLateCheckout', lang));
        setIsSubmittingLateClockout(false);
        return;
      }

      // Write audit log entry
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const auditPayload = {
          user_id: session.user.id,
          user_name: profile?.name || 'Unknown',
          user_role: profile?.role || 'No Role',
          table_name: 'attendance',
          action: 'UPDATE',
          record_id: lateClockoutRecord.id,
          changes: {
            note: `Late clockout resolved for date ${lateClockoutRecord.date}. Stated actual clockout time: ${lateClockoutTime}`,
            clock_out_time: clockoutTimeISO,
            is_late_clockout: true,
            late_clockout_reported_at: new Date().toISOString(),
            submission_distance: distance !== null ? `${distance}m` : 'Unknown'
          },
          created_at: new Date().toISOString()
        };

        await supabase.from('audit_logs').insert([auditPayload]);
      }

      alert(t('attendance', 'lateCheckoutSuccess', lang));
      setIsLateClockoutModalOpen(false);
      setLateClockoutRecord(null);
      setLateClockoutTime('');

      // Refresh lists
      await fetchTodayRecord();
      await fetchForgotClockoutRecords();
    } catch (err) {
      console.error('Exception during late clockout submit:', err);
      alert(t('attendance', 'errorSubmission', lang));
    } finally {
      setIsSubmittingLateClockout(false);
    }
  };

  const fetchTodayRecord = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = new Date().toISOString().split('T')[0];
      const { data: records, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .order('clock_in_time', { ascending: false });

      if (error) {
        console.error('Error fetching today records:', error);
        return;
      }

      if (records && records.length > 0) {
        // Find if there's any active clock-in (where clock_out_time is null)
        const activeRecord = records.find(r => !r.clock_out_time);
        if (activeRecord) {
          setTodayRecord(activeRecord);
        } else {
          // If no active session, set the latest completed session
          setTodayRecord(records[0]);
        }
      } else {
        setTodayRecord(null);
      }

      // Check if user is on leave today
      const { data: leaves, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('profile_id', session.user.id)
        .eq('status', 'Approved')
        .lte('start_date', today)
        .gte('end_date', today);

      if (leaveError) {
        console.error('Error fetching today leave:', leaveError);
      } else if (leaves && leaves.length > 0) {
        setTodayLeave(leaves[0]);
      } else {
        setTodayLeave(null);
      }
    } catch (err) {
      console.error('Error fetching today record:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      setCurrentUserId(session.user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`full_name, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      let currentRole = '';
      if (profileData) {
        const rolesVar = profileData.roles as any;
        currentRole = rolesVar ? (Array.isArray(rolesVar) ? (rolesVar[0]?.role_name || '') : (rolesVar?.role_name || '')) : '';
        setProfile({ id: session.user.id, name: profileData.full_name, role: currentRole, department: profileData.department });
      }

      await fetchTodayRecord();
      setLoading(false);
    };

    loadData();
  }, []);

  useEffect(() => {
    if (profile?.id && !permsLoading) {
      const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
      const isPrivileged = permissions.view_attendance || isIT;
      fetchForgotClockoutRecords(profile.id, isPrivileged);
    }
  }, [profile, permsLoading, permissions]);

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const isPrivilegedRole = permissions.view_attendance || isIT;

  if (loading || permsLoading) {
    return (
      <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden p-6 md:p-8">
        <div className="text-center py-16">
          <div className="inline-block">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
            <div className="text-indigo-600 font-semibold text-sm">{t('attendance', 'loadingAttendance', lang)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">

      <div className="p-6 md:p-8 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {t('attendance', 'timeTracking', lang)}
          </h2>
          <p className="text-xs md:text-sm text-indigo-100 mt-1.5 font-medium">
            {t('attendance', 'subtitle', lang)}
          </p>
        </div>
      </div>


      <div className="p-6 md:p-8">
        <div className="space-y-8">
          {/* Today's Status Card */}
            {todayRecord && (
              <div className="p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-gray-800 bg-slate-50/30 dark:bg-gray-900/20">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-550">{t('attendance', 'todayStatus', lang)}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{t('attendanceAdmin', 'colCheckIn', lang)}</p>
                        {todayRecord.clock_in_time && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                            </svg>
                            <span>{t('attendance', 'checkedIn', lang)}</span>
                          </span>
                        )}
                      </div>
                      {todayRecord.clock_in_time ? (
                        <div className="space-y-3">
                          <p className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                            {new Date(todayRecord.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-md border ${
                              todayRecord.clock_in_within_zone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30'
                            }`}>
                              {todayRecord.clock_in_within_zone ? t('attendance', 'inZone', lang) : t('attendance', 'outsideZone', lang)}
                            </span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-md border border-slate-200 dark:border-gray-700">
                              {todayRecord.clock_in_distance}{t('attendance', 'away', lang)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg text-slate-400 dark:text-zinc-500 font-medium py-2">{t('attendance', 'notCheckedIn', lang)}</p>
                      )}
                    </div>
                  </div>


                  <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{t('attendanceAdmin', 'colCheckOut', lang)}</p>
                        {todayRecord.clock_out_time && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                            </svg>
                            <span>{t('attendance', 'checkedOut', lang)}</span>
                          </span>
                        )}
                      </div>
                      {todayRecord.clock_out_time ? (
                        <div className="space-y-3">
                          <p className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                            {new Date(todayRecord.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-md border ${
                              todayRecord.clock_out_within_zone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30'
                            }`}>
                              {todayRecord.clock_out_within_zone ? t('attendance', 'inZone', lang) : t('attendance', 'outsideZone', lang)}
                            </span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-md border border-slate-200 dark:border-gray-700">
                              {todayRecord.clock_out_distance}{t('attendance', 'away', lang)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg text-slate-400 dark:text-zinc-550 font-medium py-2">{t('attendance', 'notCheckedOut', lang)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {todayLeave && (
              <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 dark:bg-yellow-500/10 dark:border-yellow-500/20 mb-6 flex items-start gap-4 shadow-sm">
                <div className="p-2.5 bg-indigo-100 rounded-xl dark:bg-yellow-500/20 text-indigo-700 dark:text-yellow-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-indigo-900 dark:text-yellow-500 mb-1">
                    You have an approved leave today ({todayLeave.leave_type || 'Leave'}).
                  </h3>
                  <p className="text-xs text-indigo-700 dark:text-yellow-500/80 font-medium">
                    Enjoy your time off! Clock-in functions have been disabled to prevent accidental time logs.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => getLocationAndClockIn('clock_in')}
                disabled={isProcessing || (todayRecord?.clock_in_time && !todayRecord?.clock_out_time) || !!todayLeave}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[48px] shadow-sm flex items-center justify-center"
              >
                <div className="flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      <span>{t('attendance', 'processing', lang)}</span>
                    </>
                  ) : (
                    <span>{t('attendance', 'checkInBtn', lang)}</span>
                  )}
                </div>
              </button>

              <button
                onClick={() => getLocationAndClockIn('clock_out')}
                disabled={isProcessing || !todayRecord?.clock_in_time || todayRecord?.clock_out_time || !!todayLeave}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[48px] shadow-sm flex items-center justify-center"
              >
                <div className="flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      <span>{t('attendance', 'processing', lang)}</span>
                    </>
                  ) : (
                    <span>{t('attendance', 'checkOutBtn', lang)}</span>
                  )}
                </div>
              </button>
            </div>


            {locationStatus && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800/80 mt-2">
                <p className="text-xs text-center font-medium text-slate-505 dark:text-zinc-400">
                  {locationStatus}
                </p>
              </div>
            )}

            {/* Forgot Clockout & Working Hours Section */}
            <div className="space-y-6 pt-6 border-t border-slate-200 dark:border-gray-800">

              {(forgotClockoutRecords.length > 0 || isPrivilegedRole) && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full px-5 py-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-gray-900/40 dark:hover:bg-zinc-900/80 border border-slate-200 dark:border-gray-800 transition-all font-semibold text-slate-700 dark:text-zinc-200 flex items-center justify-between min-h-[48px]"
                >
                  <span className="text-sm">
                    {showDetails ? t('attendance', 'hideDetailedOverview', lang) : `${t('attendance', 'showDetailedOverview', lang)} (${forgotClockoutRecords.length} ${t('attendance', 'unresolvedCheckouts', lang)})`}
                  </span>
                  <span className="text-xs transition-transform duration-200">{showDetails ? '▲' : '▼'}</span>
                </button>
              )}

              {/* Filters Card for Privileged Roles (HR, CFO, IT) */}
              {showDetails && isPrivilegedRole && (
                <div className="p-5 rounded-2xl bg-slate-50/30 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-800/80 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    {t('attendance', 'filterAttendanceLogs', lang)}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-550">{t('attendance', 'employeeName', lang)}</label>
                      <input
                        type="text"
                        placeholder={t('attendance', 'searchEmployeePlaceholder', lang)}
                        value={detailFilterEmployee}
                        onChange={(e) => setDetailFilterEmployee(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px] placeholder-slate-400 dark:placeholder-zinc-500"
                      />
                    </div>


                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-550">{t('attendance', 'timeRange', lang)}</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('all')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'all' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          {t('attendance', 'allRange', lang)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('day')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'day' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          {t('attendance', 'dayRange', lang)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('month')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'month' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          {t('attendance', 'monthRange', lang)}
                        </button>
                      </div>
                    </div>


                    <div className="space-y-1">
                      {detailFilterMode === 'day' && (
                        <>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-550">{t('attendance', 'selectDate', lang)}</label>
                          <input
                            type="date"
                            value={detailFilterDay}
                            onChange={(e) => setDetailFilterDay(e.target.value)}
                            onClick={(e) => {}}
                            className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                          />
                        </>
                      )}
                      {detailFilterMode === 'month' && (
                        <>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-550">{t('attendance', 'selectMonth', lang)}</label>
                          <input
                            type="month"
                            value={detailFilterMonth}
                            onChange={(e) => setDetailFilterMonth(e.target.value)}
                            onClick={(e) => {}}
                            className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                          />
                        </>
                      )}
                      {detailFilterMode === 'all' && (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                          {t('attendance', 'showingAllRecords', lang)}
                        </div>
                      )}
                    </div>
                  </div>


                  {(detailFilterEmployee || detailFilterDay || detailFilterMonth) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailFilterEmployee('');
                        setDetailFilterDay('');
                        setDetailFilterMonth('');
                        setDetailFilterMode('all');
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 uppercase tracking-wider block"
                    >
                      {t('attendance', 'clearFilters', lang)}
                    </button>
                  )}
                </div>
              )}

              {/* Forgot Clockout Alert - Only shown when details are expanded */}
              {showDetails && (forgotClockoutRecords.length > 0 || isPrivilegedRole) && (
                <div className="p-5 rounded-2xl bg-rose-50/10 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/20">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-semibold text-rose-800 dark:text-rose-400 text-base">{t('attendance', 'forgotCheckout', lang)}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{t('attendance', 'forgotCheckoutSub', lang)}</p>
                      </div>
                      {isPrivilegedRole && filteredForgotRecords.length > 0 && (
                        <button
                          onClick={exportForgotClockoutsToExcel}
                          className="px-4 py-2 bg-white hover:bg-rose-50 dark:bg-gray-800 dark:hover:bg-zinc-700 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 h-9"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                          </svg>
                          <span>{t('attendance', 'exportExcel', lang)}</span>
                        </button>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-rose-100 dark:border-rose-900/20">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[650px] text-left border-collapse text-xs md:text-sm">
                          <thead>
                            <tr className="bg-rose-50/30 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/30">
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-300">{t('attendance', 'employee', lang)}</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-300">{t('attendance', 'date', lang)}</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-300">{t('attendanceAdmin', 'colCheckIn', lang)}</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-300">{t('attendance', 'status', lang)}</th>
                              <th className="px-4 py-3 text-right font-semibold text-rose-800 dark:text-rose-300">{t('reports', 'colActions', lang)}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100/40 dark:divide-rose-900/20 text-slate-700 dark:text-zinc-300">
                            {filteredForgotRecords.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-rose-700 dark:text-rose-400 font-medium italic bg-white dark:bg-black">
                                  {t('attendance', 'noForgotRecords', lang)}
                                </td>
                              </tr>
                            ) : (
                              filteredForgotRecords.map((record) => (
                                <tr key={record.id} className="hover:bg-rose-50/10 dark:hover:bg-rose-950/5 bg-white dark:bg-black">
                                  <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">{record.user_name}</td>
                                  <td className="px-4 py-3.5 font-mono">{record.date}</td>
                                  <td className="px-4 py-3.5">
                                    {new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400">
                                      {t('attendance', 'noCheckout', lang).replace('⚠️ ', '')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    {record.user_id === currentUserId ? (
                                      <button
                                        onClick={() => handleOpenLateClockoutModal(record)}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white text-xs font-semibold rounded-lg shadow transition-all h-9 flex items-center justify-center inline-flex"
                                      >
                                        {t('attendance', 'checkOutBtn', lang).replace('✗ ', '')}
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-400 dark:text-zinc-550 italic">{t('attendance', 'notSelf', lang)}</span>
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
                </div>
              )}

              {/* Working Hours Summary - Only shown when details are expanded */}
              {showDetails && (
                <div className="p-5 rounded-2xl bg-slate-50/50 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-800">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-white text-base">
                          {t('attendance', 'workingHours', lang)}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{t('attendance', 'workingHoursLogs', lang)}</p>
                      </div>
                      {isPrivilegedRole && filteredAllRecords.length > 0 && (
                        <button
                          onClick={exportWorkingHoursToExcel}
                          className="px-4 py-2 bg-white hover:bg-slate-100 dark:bg-gray-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-gray-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 h-9"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                          </svg>
                          <span>{t('attendance', 'exportExcel', lang)}</span>
                        </button>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[750px] text-left border-collapse text-xs md:text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                              <th className="px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">{t('attendance', 'employee', lang)}</th>
                              <th className="px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">{t('attendance', 'date', lang)}</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">{t('attendanceAdmin', 'colCheckIn', lang)}</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">{t('attendanceAdmin', 'colCheckOut', lang)}</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">{t('attendance', 'hours', lang)}</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">{t('attendance', 'flag', lang)}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 dark:divide-gray-800 text-slate-700 dark:text-zinc-300">
                            {filteredAllRecords.length === 0 ? (
                               <tr>
                                 <td colSpan={6} className="px-4 py-6 text-center text-slate-500 font-medium italic">
                                   {t('attendance', 'noAttendanceRecords', lang)}
                                 </td>
                               </tr>
                            ) : (
                               (isPrivilegedRole ? filteredAllRecords : filteredAllRecords.slice(0, 20)).map((record) => {
                                 const workingHours = calculateWorkingHours(record.clock_in_time, record.clock_out_time);
                                 const isShortDay = workingHours && workingHours.hours < MINIMUM_WORK_HOURS;
                                 const isForgotCheckout = record.clock_in_time && !record.clock_out_time;

                                 if (record.is_leave) {
                                    let leaveTypeName = record.leave_type || 'Leave';
                                    if (leaveTypeName.toLowerCase() === 'sick') leaveTypeName = 'Sick Leave';
                                    else if (leaveTypeName.toLowerCase() === 'annual') leaveTypeName = 'Annual Leave';
                                    else if (leaveTypeName.toLowerCase() === 'hospitalisation') leaveTypeName = 'Hospitalisation Leave';
                                    else if (leaveTypeName.toLowerCase() === 'maternity') leaveTypeName = 'Maternity Leave';
                                    else if (leaveTypeName.toLowerCase() === 'paternity') leaveTypeName = 'Paternity Leave';
                                    else if (leaveTypeName.toLowerCase() === 'unpaid') leaveTypeName = 'Unpaid Leave';
                                    
                                    if (leaveTypeName && leaveTypeName.length > 0) {
                                      leaveTypeName = leaveTypeName.charAt(0).toUpperCase() + leaveTypeName.slice(1);
                                    }

                                    return (
                                      <tr
                                        key={record.id}
                                        className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 bg-indigo-50/5 dark:bg-yellow-500/5"
                                      >
                                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">{record.user_name}</td>
                                        <td className="px-4 py-3.5 font-mono">{record.date}</td>
                                        <td colSpan={4} className="px-4 py-3.5 text-center">
                                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/20 font-semibold text-xs">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z" />
                                            </svg>
                                            {lang === 'bm' ? 'Cuti Diluluskan' : 'On Leave'} {leaveTypeName ? `(${leaveTypeName})` : ''}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                   <tr
                                     key={record.id}
                                     className={`hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 ${
                                       isForgotCheckout ? 'bg-rose-50/40 dark:bg-rose-500/5' : isShortDay ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''
                                     }`}
                                   >
                                     <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">{record.user_name}</td>
                                     <td className="px-4 py-3.5 font-mono">{record.date}</td>
                                     <td className="px-4 py-3.5 text-center">
                                       {record.clock_in_time ? new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center">
                                       {record.clock_out_time ? new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center font-semibold text-slate-900 dark:text-white">
                                       {workingHours ? `${workingHours.hours}${lang === 'bm' ? 'j' : 'h'} ${workingHours.minutes}m` : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center">
                                       {isForgotCheckout ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400">
                                           {t('attendance', 'noCheckout', lang).replace('⚠️ ', '')}
                                         </span>
                                       ) : record.is_late_clockout ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400" title="Flagged warning to CFO, HR, IT">
                                           {lang === 'bm' ? 'Keluar Lewat' : 'Late Clockout'}
                                         </span>
                                       ) : isShortDay ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
                                           {lang === 'bm' ? '< 9 Jam' : '< 9 Hours'}
                                         </span>
                                       ) : (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400">
                                           {lang === 'bm' ? 'Hari Penuh' : 'Full Day'}
                                         </span>
                                       )}
                                     </td>
                                   </tr>
                                 );
                               })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex gap-4 flex-wrap text-xs text-slate-500 border-t border-slate-100 dark:border-gray-800 pt-3">
                      <span>{t('attendance', 'recordsShown', lang)}: {isPrivilegedRole ? filteredAllRecords.length : Math.min(20, filteredAllRecords.length)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-500 dark:bg-rose-400 rounded-full border border-rose-600 dark:border-rose-500/30 flex-shrink-0"></span> {t('attendance', 'redNoteDesc', lang)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-500 dark:bg-amber-400 rounded-full border border-amber-600 dark:border-amber-500/30 flex-shrink-0"></span> {t('attendance', 'yellowNoteDesc', lang)}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full border border-emerald-600 dark:border-emerald-500/30 flex-shrink-0"></span> {t('attendance', 'whiteNoteDesc', lang)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {isLateClockoutModalOpen && lateClockoutRecord && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">

                  <div className="p-6 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                      {t('attendance', 'resolveCheckout', lang)}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">{t('attendance', 'statingActualCheckout', lang)}</p>
                  </div>


                  <form onSubmit={handleLateClockoutSubmit} className="p-6 space-y-4 bg-white dark:bg-black">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 dark:text-zinc-550 font-semibold uppercase tracking-wider">{t('attendance', 'date', lang)}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white bg-slate-50 dark:bg-black p-2.5 rounded-xl border border-slate-200 dark:border-gray-800">{lateClockoutRecord.date}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 dark:text-zinc-550 font-semibold uppercase tracking-wider">{t('attendanceAdmin', 'colCheckIn', lang)}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white bg-slate-50 dark:bg-black p-2.5 rounded-xl border border-slate-200 dark:border-gray-800">
                        {new Date(lateClockoutRecord.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="lateClockoutTime" className="block text-xs text-slate-400 dark:text-zinc-550 font-semibold uppercase tracking-wider">
                        {t('attendance', 'statedActualCheckout', lang)}
                      </label>
                      <input
                        type="time"
                        id="lateClockoutTime"
                        value={lateClockoutTime}
                        onChange={(e) => setLateClockoutTime(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                      />
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium leading-relaxed">
                        {t('attendance', 'warningLateCheckoutSubmit', lang)}
                      </p>
                    </div>


                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-gray-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          setIsLateClockoutModalOpen(false);
                          setLateClockoutRecord(null);
                        }}
                        disabled={isSubmittingLateClockout}
                        className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl transition-all min-h-[48px] shadow-sm"
                      >
                        {t('attendance', 'cancel', lang)}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingLateClockout}
                        className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black font-semibold text-xs rounded-xl shadow transition-all min-h-[48px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isSubmittingLateClockout ? (
                          <>
                            <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>{t('attendance', 'submitting', lang)}</span>
                          </>
                        ) : (
                          <span>{t('attendance', 'submit', lang)}</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
