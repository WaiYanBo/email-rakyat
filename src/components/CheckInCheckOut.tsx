import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function CheckInCheckOut() {
  const [profile, setProfile] = useState<any>(null);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  // Office coordinates
  const OFFICE_LAT = 3.0750624396122763;
  const OFFICE_LNG = 101.61250689446412;
  const ZONE_RADIUS_METERS = 200;

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

  const checkLocationPermission = async () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported');
      return false;
    }
    
    // For browsers, permission is checked when we try to get location
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

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`full_name, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile({ name: profileData.full_name, role: profileData.roles?.role_name });
      }

      await fetchTodayRecord();
      setLoading(false);
    };

    loadData();
  }, []);

  // Don't show for Chairman, CEO
  if (profile?.role && ['Chairman', 'CEO'].includes(profile.role)) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-xl overflow-hidden hover:shadow-2xl transition-shadow">
      {/* Header */}
      <div className="p-8 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
              <span className="text-4xl">⏰</span> Time Tracking
            </h2>
            <p className="text-sm text-blue-100 mt-2 font-medium">Check in and out with GPS location verification</p>
          </div>
          <div className="text-5xl opacity-20">📍</div>
        </div>
      </div>

      {/* Content */}
      <div className="p-10">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-blue-600 font-bold text-sm">Loading attendance data...</div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Today's Status Card */}
            {todayRecord && (
              <div className="p-8 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/80 to-cyan-50/50 dark:from-blue-900/20 dark:to-cyan-900/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">📋</span>
                  <p className="text-sm font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Today's Status</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                  {/* Check In Card */}
                  <div className="p-5 rounded-xl bg-white/60 dark:bg-gray-800/40 border border-blue-100 dark:border-blue-800/50 backdrop-blur">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">✓ Check In</p>
                      {todayRecord.check_in_time && <span className="text-2xl">🟢</span>}
                    </div>
                    {todayRecord.check_in_time ? (
                      <div className="space-y-3">
                        <p className="text-2xl font-black text-gray-900 dark:text-white">
                          {new Date(todayRecord.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur ${
                            todayRecord.check_in_within_zone
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}>
                            {todayRecord.check_in_within_zone ? '✓ In Zone' : '⚠️ OUTSIDE ZONE'}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                            {todayRecord.check_in_distance}m away
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-lg text-gray-400 font-semibold">Not checked in yet</p>
                    )}
                  </div>

                  {/* Check Out Card */}
                  <div className="p-5 rounded-xl bg-white/60 dark:bg-gray-800/40 border border-red-100 dark:border-red-800/50 backdrop-blur">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">✗ Check Out</p>
                      {todayRecord.check_out_time && <span className="text-2xl">🔴</span>}
                    </div>
                    {todayRecord.check_out_time ? (
                      <div className="space-y-3">
                        <p className="text-2xl font-black text-gray-900 dark:text-white">
                          {new Date(todayRecord.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur ${
                            todayRecord.check_out_within_zone
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}>
                            {todayRecord.check_out_within_zone ? '✓ In Zone' : '⚠️ OUTSIDE ZONE'}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
                            {todayRecord.check_out_distance}m away
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-lg text-gray-400 font-semibold">Not checked out yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
              <button
                onClick={() => getLocationAndCheckIn('check_in')}
                disabled={isProcessing || (todayRecord?.check_in_time && !todayRecord?.check_out_time)}
                className="group relative px-6 py-4 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 group-hover:shadow-lg group-disabled:opacity-50"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <span>✓</span> Check In
                    </>
                  )}
                </div>
              </button>
              
              <button
                onClick={() => getLocationAndCheckIn('check_out')}
                disabled={isProcessing || !todayRecord?.check_in_time || todayRecord?.check_out_time}
                className="group relative px-6 py-4 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 dark:from-red-600 dark:to-rose-700 group-hover:shadow-lg group-disabled:opacity-50"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-rose-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative flex items-center justify-center gap-2">
                  {isProcessing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <span>✗</span> Check Out
                    </>
                  )}
                </div>
              </button>
            </div>

            {/* Location Status */}
            {locationStatus && (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 backdrop-blur mt-2">
                <p className="text-sm text-center font-semibold text-blue-700 dark:text-blue-300">
                  <span className="inline-block mr-2">📍</span>{locationStatus}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
