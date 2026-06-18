import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export default function CheckInCheckOut() {
  const [profile, setProfile] = useState<any>(null);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [forgotCheckoutRecords, setForgotCheckoutRecords] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLateCheckoutModalOpen, setIsLateCheckoutModalOpen] = useState(false);
  const [lateCheckoutRecord, setLateCheckoutRecord] = useState<any>(null);
  const [lateCheckoutTime, setLateCheckoutTime] = useState('');
  const [isSubmittingLateCheckout, setIsSubmittingLateCheckout] = useState(false);
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

  // Calculate working hours between check in and check out
  const calculateWorkingHours = (checkInTime: string, checkOutTime: string | null): { hours: number; minutes: number } | null => {
    if (!checkInTime || !checkOutTime) return null;

    const checkIn = new Date(checkInTime);
    const checkOut = new Date(checkOutTime);
    const diffMs = checkOut.getTime() - checkIn.getTime();

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  // Fetch attendance records efficiently
  const fetchForgotCheckoutRecords = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch forgot checkouts specifically (server-side filtering)
      const { data: forgotRecords, error: forgotError } = await supabase
        .from('attendance')
        .select('*')
        .not('date', 'eq', today)
        .not('check_in_time', 'is', null)
        .is('check_out_time', null)
        .order('date', { ascending: false });

      if (forgotError) {
        console.error('Error fetching forgot checkout records:', forgotError);
      } else if (forgotRecords) {
        setForgotCheckoutRecords(forgotRecords);
      }

      // 2. Fetch a limited set of recent records for general view/export
      const { data: recentRecords, error: allErr } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false })
        .limit(300);

      if (allErr) {
         console.error('Error fetching recent attendance records:', allErr);
      } else if (recentRecords) {
         setAllRecords(recentRecords);
      }
    } catch (err) {
      console.error('Exception fetching records:', err);
    }
  };

  // Memoized filtered forgot checkout records
  const filteredForgotRecords = useMemo(() => {
    let result = [...forgotCheckoutRecords];

    if (detailFilterEmployee) {
      result = result.filter(r => r.user_name?.toLowerCase().includes(detailFilterEmployee.toLowerCase()));
    }

    if (detailFilterMode === 'day' && detailFilterDay) {
      result = result.filter(r => r.date === detailFilterDay);
    } else if (detailFilterMode === 'month' && detailFilterMonth) {
      result = result.filter(r => r.date?.startsWith(detailFilterMonth));
    }

    return result;
  }, [forgotCheckoutRecords, detailFilterEmployee, detailFilterMode, detailFilterDay, detailFilterMonth]);

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

  const exportForgotCheckoutsToExcel = () => {
    if (filteredForgotRecords.length === 0) {
      alert('No records to export');
      return;
    }

    const exportData = filteredForgotRecords.map(record => ({
      'Employee Name': record.user_name || '-',
      'Date': record.date || '-',
      'Check In Time': record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-',
      'Status': 'Forgot Checkout (No Checkout)'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Forgot Checkouts');

    const colWidths = [20, 15, 15, 25];
    ws['!cols'] = colWidths.map(width => ({ wch: width }));

    const filename = `Forgot_Checkouts_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportWorkingHoursToExcel = () => {
    if (filteredAllRecords.length === 0) {
      alert('No records to export');
      return;
    }

    const exportData = filteredAllRecords.map(record => {
      const workingHours = calculateWorkingHours(record.check_in_time, record.check_out_time);
      const isShortDay = workingHours && workingHours.hours < MINIMUM_WORK_HOURS;
      const isForgot = record.check_in_time && !record.check_out_time;

      let flagStatus = 'Full';
      if (isForgot) flagStatus = 'No Checkout';
      else if (record.is_late_checkout) flagStatus = 'Late Checkout (Flagged)';
      else if (isShortDay) flagStatus = 'Short Day (<9h)';

      return {
        'Employee Name': record.user_name || '-',
        'Date': record.date || '-',
        'Check In Time': record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-',
        'Check Out Time': record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-',
        'Hours Worked': workingHours ? `${workingHours.hours}h ${workingHours.minutes}m` : '-',
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

  const checkLocationPermission = async () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported');
      return false;
    }

    setLocationStatus('Requesting location...');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationStatus('Location accessed');
          setHasLocationPermission(true);
          resolve(true);
        },
        (error) => {
          setLocationStatus('Location access denied');
          setHasLocationPermission(false);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const getLocationAndCheckIn = async (type: 'check_in' | 'check_out') => {
    setIsProcessing(true);

    try {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported on this device');
        setIsProcessing(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const distance = calculateDistance(OFFICE_LAT, OFFICE_LNG, latitude, longitude);
          const isWithinZone = distance <= ZONE_RADIUS_METERS;

          // Get current user
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            alert('Session expired');
            setIsProcessing(false);
            return;
          }

          // Get today's record
          const today = new Date().toISOString().split('T')[0];
          const { data: existingRecord } = await supabase
            .from('attendance')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('date', today)
            .single();

          const attendanceData = {
            user_id: session.user.id,
            user_name: profile?.name,
            date: today,
            [type === 'check_in' ? 'check_in_time' : 'check_out_time']: new Date().toISOString(),
            [type === 'check_in' ? 'check_in_latitude' : 'check_out_latitude']: latitude,
            [type === 'check_in' ? 'check_in_longitude' : 'check_out_longitude']: longitude,
            [type === 'check_in' ? 'check_in_distance' : 'check_out_distance']: Math.round(distance),
            [type === 'check_in' ? 'check_in_within_zone' : 'check_out_within_zone']: isWithinZone,
            [type === 'check_in' ? 'check_in_accuracy' : 'check_out_accuracy']: Math.round(accuracy)
          };

          let error;
          if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
              .from('attendance')
              .update(attendanceData)
              .eq('id', existingRecord.id);
            error = updateError;
          } else {
            // Create new record
            const { error: insertError } = await supabase
              .from('attendance')
              .insert([attendanceData]);
            error = insertError;
          }

          if (error) {
            console.error(`Error recording ${type}:`, error);
            alert(`Failed to record ${type}`);
          } else {
            setLocationStatus(`${type === 'check_in' ? 'Checked in' : 'Checked out'} - ${isWithinZone ? 'In Zone' : 'OUTSIDE ZONE'} (${Math.round(distance)}m)`);
            await fetchTodayRecord();
          }
          setIsProcessing(false);
        },
        (error) => {
          console.error('Geolocation error:', error);
          alert('Failed to get location. Please enable location services.');
          setLocationStatus('Location access failed');
          setIsProcessing(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      console.error('Error:', err);
      setIsProcessing(false);
    }
  };

  const handleOpenLateCheckoutModal = (record: any) => {
    setLateCheckoutRecord(record);
    setLateCheckoutTime('18:00');
    setIsLateCheckoutModalOpen(true);
  };

  const handleLateCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lateCheckoutRecord || !lateCheckoutTime) return;

    setIsSubmittingLateCheckout(true);

    try {
      // Get location coordinates if possible (non-blocking)
      let latitude: number | null = null;
      let longitude: number | null = null;
      let distance: number | null = null;
      let withinZone = false;
      let accuracy: number | null = null;

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          accuracy = Math.round(position.coords.accuracy);
          distance = Math.round(calculateDistance(OFFICE_LAT, OFFICE_LNG, latitude, longitude));
          withinZone = distance <= ZONE_RADIUS_METERS;
        } catch (err) {
          console.warn('Geolocation failed or timed out for late checkout submission:', err);
        }
      }

      // Construct checkout timestamp from the record date and input time
      const [year, month, day] = lateCheckoutRecord.date.split('-').map(Number);
      const [hours, minutes] = lateCheckoutTime.split(':').map(Number);
      const actualCheckoutDate = new Date(year, month - 1, day, hours, minutes);
      const checkoutTimeISO = actualCheckoutDate.toISOString();

      // Check if checkout time is after checkin time
      const checkInTime = new Date(lateCheckoutRecord.check_in_time);
      if (actualCheckoutDate <= checkInTime) {
        alert(`Actual check-out time must be after check-in time (${checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`);
        setIsSubmittingLateCheckout(false);
        return;
      }

      // Update attendance record
      const updateData = {
        check_out_time: checkoutTimeISO,
        check_out_latitude: latitude,
        check_out_longitude: longitude,
        check_out_distance: distance,
        check_out_within_zone: withinZone,
        check_out_accuracy: accuracy,
        is_late_checkout: true,
        late_checkout_flagged: true,
        late_checkout_reported_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('attendance')
        .update(updateData)
        .eq('id', lateCheckoutRecord.id);

      if (updateError) {
        console.error('Error updating late checkout:', updateError);
        alert('Failed to submit late checkout record.');
        setIsSubmittingLateCheckout(false);
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
          record_id: lateCheckoutRecord.id,
          changes: {
            note: `Late checkout resolved for date ${lateCheckoutRecord.date}. Stated actual checkout time: ${lateCheckoutTime}`,
            check_out_time: checkoutTimeISO,
            is_late_checkout: true,
            late_checkout_reported_at: new Date().toISOString(),
            submission_distance: distance !== null ? `${distance}m` : 'Unknown'
          },
          created_at: new Date().toISOString()
        };

        await supabase.from('audit_logs').insert([auditPayload]);
      }

      alert('Late checkout has been submitted successfully and flagged to CFO, HR, IT.');
      setIsLateCheckoutModalOpen(false);
      setLateCheckoutRecord(null);
      setLateCheckoutTime('');

      // Refresh lists
      await fetchTodayRecord();
      await fetchForgotCheckoutRecords();
    } catch (err) {
      console.error('Exception during late checkout submit:', err);
      alert('An error occurred during submission.');
    } finally {
      setIsSubmittingLateCheckout(false);
    }
  };

  const fetchTodayRecord = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = new Date().toISOString().split('T')[0];
      const { data: record } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .single();

      if (record) {
        setTodayRecord(record);
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
        .select(`full_name, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile({ name: profileData.full_name, role: profileData.roles?.role_name });
      }

      await fetchTodayRecord();
      await fetchForgotCheckoutRecords();
      setLoading(false);
    };

    loadData();
  }, []);

  // Don't show for Chairman, CEO
  if (profile?.role && ['Chairman', 'CEO'].includes(profile.role)) {
    return null;
  }
  const isPrivilegedRole = profile?.role && ['HR', 'CFO', 'IT Admin'].includes(profile.role);

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden mb-8">

      <div className="p-6 md:p-8 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Time Tracking
          </h2>
          <p className="text-xs md:text-sm text-indigo-100 mt-1.5 font-medium">
            Check in and check out with GPS location verification
          </p>
        </div>
      </div>


      <div className="p-6 md:p-8">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-indigo-600 font-semibold text-sm">Loading attendance data...</div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Today's Status Card */}
            {todayRecord && (
              <div className="p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-gray-800 bg-slate-50/30 dark:bg-gray-900/20">
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-550">Today's Status</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Check In</p>
                        {todayRecord.check_in_time && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-black/20 dark:text-yellow-500 dark:border-yellow-500/30">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                            </svg>
                            <span>Checked In</span>
                          </span>
                        )}
                      </div>
                      {todayRecord.check_in_time ? (
                        <div className="space-y-3">
                          <p className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                            {new Date(todayRecord.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-md border ${
                              todayRecord.check_in_within_zone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/50'
                                : 'bg-rose-50 text-rose-800 border-rose-205 dark:bg-rose-955/20 dark:text-rose-400 dark:border-rose-900/50'
                            }`}>
                              {todayRecord.check_in_within_zone ? 'In Zone' : 'Outside Zone'}
                            </span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-md border border-slate-200 dark:border-gray-700">
                              {todayRecord.check_in_distance}m away
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg text-slate-400 dark:text-zinc-550 font-medium py-2">Not checked in yet</p>
                      )}
                    </div>
                  </div>


                  <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Check Out</p>
                        {todayRecord.check_out_time && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/30">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                            </svg>
                            <span>Checked Out</span>
                          </span>
                        )}
                      </div>
                      {todayRecord.check_out_time ? (
                        <div className="space-y-3">
                          <p className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                            {new Date(todayRecord.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-md border ${
                              todayRecord.check_out_within_zone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500/50'
                                : 'bg-rose-50 text-rose-800 border-rose-205 dark:bg-rose-955/20 dark:text-rose-400 dark:border-rose-900/50'
                            }`}>
                              {todayRecord.check_out_within_zone ? 'In Zone' : 'Outside Zone'}
                            </span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-gray-800 px-3 py-1 rounded-md border border-slate-200 dark:border-gray-700">
                              {todayRecord.check_out_distance}m away
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg text-slate-400 dark:text-zinc-550 font-medium py-2">Not checked out yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => getLocationAndCheckIn('check_in')}
                disabled={isProcessing || (todayRecord?.check_in_time && !todayRecord?.check_out_time)}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[48px] shadow-sm flex items-center justify-center"
              >
                <div className="flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Check In</span>
                  )}
                </div>
              </button>

              <button
                onClick={() => getLocationAndCheckIn('check_out')}
                disabled={isProcessing || !todayRecord?.check_in_time || todayRecord?.check_out_time}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all min-h-[48px] shadow-sm flex items-center justify-center"
              >
                <div className="flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Check Out</span>
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

            {/* Forgot Checkout & Working Hours Section */}
            <div className="space-y-6 pt-6 border-t border-slate-200 dark:border-gray-800">

              {(forgotCheckoutRecords.length > 0 || isPrivilegedRole) && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full px-5 py-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-gray-900/40 dark:hover:bg-zinc-900/80 border border-slate-200 dark:border-gray-800 transition-all font-semibold text-slate-700 dark:text-zinc-200 flex items-center justify-between min-h-[48px]"
                >
                  <span className="text-sm">
                    {showDetails ? 'Hide Detailed Overview' : `Show Detailed Overview (${forgotCheckoutRecords.length} unresolved checkouts)`}
                  </span>
                  <span className="text-xs transition-transform duration-200">{showDetails ? '▲' : '▼'}</span>
                </button>
              )}

              {/* Filters Card for Privileged Roles (HR, CFO, IT) */}
              {showDetails && isPrivilegedRole && (
                <div className="p-5 rounded-2xl bg-slate-55/30 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-800/80 space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Filter Attendance Logs
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Employee Name</label>
                      <input
                        type="text"
                        placeholder="Search employee..."
                        value={detailFilterEmployee}
                        onChange={(e) => setDetailFilterEmployee(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px] placeholder-slate-400 dark:placeholder-zinc-500"
                      />
                    </div>


                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Time Range</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('all')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'all' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('day')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'day' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          Day
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailFilterMode('month')}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${detailFilterMode === 'month' ? 'bg-slate-900 text-white border-slate-900 dark:bg-zinc-100 dark:text-zinc-950' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-zinc-700'}`}
                        >
                          Month
                        </button>
                      </div>
                    </div>


                    <div className="space-y-1">
                      {detailFilterMode === 'day' && (
                        <>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Select Date</label>
                          <input
                            type="date"
                            value={detailFilterDay}
                            onChange={(e) => setDetailFilterDay(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                          />
                        </>
                      )}
                      {detailFilterMode === 'month' && (
                        <>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Select Month</label>
                          <input
                            type="month"
                            value={detailFilterMonth}
                            onChange={(e) => setDetailFilterMonth(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                          />
                        </>
                      )}
                      {detailFilterMode === 'all' && (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                          Showing all records
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
                      Clear Filters
                    </button>
                  )}
                </div>
              )}

              {/* Forgot Checkout Alert - Only shown when details are expanded */}
              {showDetails && (forgotCheckoutRecords.length > 0 || isPrivilegedRole) && (
                <div className="p-5 rounded-2xl bg-rose-50/20 dark:bg-rose-955/5 border border-rose-100 dark:border-rose-950/20">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-semibold text-rose-800 dark:text-rose-400 text-base">Forgot to Check Out</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Please resolve your incomplete checkout logs.</p>
                      </div>
                      {isPrivilegedRole && filteredForgotRecords.length > 0 && (
                        <button
                          onClick={exportForgotCheckoutsToExcel}
                          className="px-4 py-2 bg-white hover:bg-rose-50 dark:bg-gray-800 dark:hover:bg-zinc-700 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 h-9"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                          </svg>
                          <span>Export Excel</span>
                        </button>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-rose-100 dark:border-rose-950/30">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs md:text-sm">
                          <thead>
                            <tr className="bg-rose-50/30 dark:bg-rose-955/10 border-b border-rose-100 dark:border-rose-900/30">
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-350">Employee</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-350">Date</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-350">Check In</th>
                              <th className="px-4 py-3 font-semibold text-rose-800 dark:text-rose-350">Status</th>
                              <th className="px-4 py-3 text-right font-semibold text-rose-800 dark:text-rose-350">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100/40 dark:divide-rose-900/20 text-slate-700 dark:text-zinc-300">
                            {filteredForgotRecords.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-rose-700 dark:text-rose-400 font-medium italic bg-white dark:bg-black">
                                  No forgot checkout records found matching filters
                                </td>
                              </tr>
                            ) : (
                              filteredForgotRecords.map((record) => (
                                <tr key={record.id} className="hover:bg-rose-50/10 dark:hover:bg-rose-955/5 bg-white dark:bg-black">
                                  <td className="px-4 py-3.5 font-semibold text-slate-905 dark:text-white">{record.user_name}</td>
                                  <td className="px-4 py-3.5 font-mono">{record.date}</td>
                                  <td className="px-4 py-3.5">
                                    {new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50/50 text-rose-800 dark:bg-rose-955/20 dark:text-rose-400">
                                      No Checkout
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    {record.user_id === currentUserId ? (
                                      <button
                                        onClick={() => handleOpenLateCheckoutModal(record)}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white text-xs font-semibold rounded-lg shadow transition-all h-9 flex items-center justify-center inline-flex"
                                      >
                                        Check Out
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-400 italic">Not Self</span>
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
                <div className="p-5 rounded-2xl bg-slate-50/50 dark:bg-gray-900/30 border border-slate-205 dark:border-gray-800">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-white text-base">
                          Working Hours Summary
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Logs of recent working hours and compliance flags.</p>
                      </div>
                      {isPrivilegedRole && filteredAllRecords.length > 0 && (
                        <button
                          onClick={exportWorkingHoursToExcel}
                          className="px-4 py-2 bg-white hover:bg-slate-100 dark:bg-gray-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-gray-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 h-9"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                          </svg>
                          <span>Export Excel</span>
                        </button>
                      )}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs md:text-sm">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                              <th className="px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">Employee</th>
                              <th className="px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">Date</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">Check In</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">Check Out</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">Hours</th>
                              <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-zinc-300">Flag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 dark:divide-gray-800 text-slate-700 dark:text-zinc-300">
                            {filteredAllRecords.length === 0 ? (
                               <tr>
                                 <td colSpan={6} className="px-4 py-6 text-center text-slate-500 font-medium italic">
                                   No attendance records found matching filters
                                 </td>
                               </tr>
                            ) : (
                               (isPrivilegedRole ? filteredAllRecords : filteredAllRecords.slice(0, 20)).map((record) => {
                                 const workingHours = calculateWorkingHours(record.check_in_time, record.check_out_time);
                                 const isShortDay = workingHours && workingHours.hours < MINIMUM_WORK_HOURS;
                                 const isForgotCheckout = record.check_in_time && !record.check_out_time;

                                 return (
                                   <tr
                                     key={record.id}
                                     className={`hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 ${
                                       isForgotCheckout ? 'bg-rose-50/20 dark:bg-rose-955/5' : isShortDay ? 'bg-amber-50/20 dark:bg-amber-955/5' : ''
                                     }`}
                                   >
                                     <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">{record.user_name}</td>
                                     <td className="px-4 py-3.5 font-mono">{record.date}</td>
                                     <td className="px-4 py-3.5 text-center">
                                       {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center">
                                       {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center font-semibold text-slate-900 dark:text-white">
                                       {workingHours ? `${workingHours.hours}h ${workingHours.minutes}m` : '-'}
                                     </td>
                                     <td className="px-4 py-3.5 text-center">
                                       {isForgotCheckout ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-805 dark:bg-rose-955/20 dark:text-rose-400">
                                           No Checkout
                                         </span>
                                       ) : record.is_late_checkout ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-805 dark:bg-rose-955/20 dark:text-rose-400" title="Flagged warning to CFO, HR, IT">
                                           Late Checkout
                                         </span>
                                       ) : isShortDay ? (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-805 dark:bg-amber-955/20 dark:text-yellow-500">
                                           &lt; 9 Hours
                                         </span>
                                       ) : (
                                         <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-805 dark:bg-black/20 dark:text-yellow-500">
                                           Full Day
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
                      <span>Records shown: {isPrivilegedRole ? filteredAllRecords.length : Math.min(20, filteredAllRecords.length)}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500/20 border border-rose-350 rounded"></span> Red = Forgot/Late Checkout</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500/20 border border-amber-350 rounded"></span> Yellow = Short Day (&lt;9 hours)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-white border border-slate-200 rounded"></span> White = Compliant Full Day</span>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {isLateCheckoutModalOpen && lateCheckoutRecord && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
                <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">

                  <div className="p-6 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                      Resolve Checkout
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Stating actual checkout time for past date</p>
                  </div>


                  <form onSubmit={handleLateCheckoutSubmit} className="p-6 space-y-4 bg-white dark:bg-black">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">Date</p>
                      <p className="text-sm font-semibold text-slate-805 dark:text-white bg-slate-50 dark:bg-black p-2.5 rounded-xl border border-slate-205 dark:border-gray-800">{lateCheckoutRecord.date}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">Check In Time</p>
                      <p className="text-sm font-semibold text-slate-805 dark:text-white bg-slate-50 dark:bg-black p-2.5 rounded-xl border border-slate-205 dark:border-gray-800">
                        {new Date(lateCheckoutRecord.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="lateCheckoutTime" className="block text-xs text-slate-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
                        Stated Actual Checkout Time
                      </label>
                      <input
                        type="time"
                        id="lateCheckoutTime"
                        value={lateCheckoutTime}
                        onChange={(e) => setLateCheckoutTime(e.target.value)}
                        required
                        className="w-full px-4 py-3 border border-slate-200 dark:border-gray-800 rounded-xl bg-white dark:bg-black text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                      />
                      <p className="text-[11px] text-rose-600 dark:text-rose-455 font-medium leading-relaxed">
                        ⚠️ Submitting this will flag a late check-out warning to the CFO, HR, and IT Admin.
                      </p>
                    </div>


                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-gray-800/80">
                      <button
                        type="button"
                        onClick={() => {
                          setIsLateCheckoutModalOpen(false);
                          setLateCheckoutRecord(null);
                        }}
                        disabled={isSubmittingLateCheckout}
                        className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl transition-all min-h-[48px] shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingLateCheckout}
                        className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black font-semibold text-xs rounded-xl shadow transition-all min-h-[48px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isSubmittingLateCheckout ? (
                          <>
                            <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <span>Submit</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
