import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AttendanceView() {
  const [profile, setProfile] = useState<any>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);

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

      await fetchAttendanceRecords();
      setLoading(false);
    };

    loadData();
  }, []);

  const fetchAttendanceRecords = async () => {
    try {
      const { data: records, error } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false })
        .order('check_in_time', { ascending: false });

      if (error) {
        console.error('Error fetching attendance:', error);
        return;
      }

      if (records) {
        setAttendanceRecords(records);
        filterRecordsByDate(records, selectedDate);
      }
    } catch (err) {
      console.error('Exception fetching attendance:', err);
    }
  };

  const filterRecordsByDate = (records: any[], date: string) => {
    const filtered = records.filter((r) => r.date === date);
    setFilteredRecords(filtered);
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    filterRecordsByDate(attendanceRecords, date);
  };

  // Only HR and CFO can view
  if (profile?.role && !['HR', 'CFO'].includes(profile.role)) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900/80 dark:to-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-xl overflow-hidden hover:shadow-2xl transition-shadow">
      {/* Header */}
      <div className="p-8 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 dark:from-purple-900 dark:via-purple-800 dark:to-pink-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
              <span className="text-4xl">👥</span> Attendance Records
            </h2>
            <p className="text-sm text-purple-100 mt-2 font-medium">View employee check-in/check-out with location verification</p>
          </div>
          <div className="text-5xl opacity-20">📊</div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-purple-600 font-bold text-sm">Loading attendance records...</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Date Filter */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 backdrop-blur">
              <label className="block text-xs font-black uppercase tracking-widest text-purple-700 dark:text-purple-300 mb-3">📅 Filter by Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-4 py-3 border-2 border-purple-200 dark:border-purple-700 rounded-xl bg-white dark:bg-gray-800/50 text-sm font-semibold text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
              />
            </div>

            {/* Records Table */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700/50 border-b-2 border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-left font-black text-gray-900 dark:text-white uppercase tracking-wider text-xs">👤 Employee</th>
                      <th className="px-6 py-4 text-left font-black text-gray-900 dark:text-white uppercase tracking-wider text-xs">🟢 Check In</th>
                      <th className="px-6 py-4 text-center font-black text-gray-900 dark:text-white uppercase tracking-wider text-xs">Status</th>
                      <th className="px-6 py-4 text-left font-black text-gray-900 dark:text-white uppercase tracking-wider text-xs">🔴 Check Out</th>
                      <th className="px-6 py-4 text-center font-black text-gray-900 dark:text-white uppercase tracking-wider text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <div className="text-4xl mb-2">📭</div>
                          <p className="text-gray-500 dark:text-gray-400 font-semibold">No records found for {selectedDate}</p>
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((record, idx) => (
                        <tr key={record.id} className={`border-b border-gray-200 dark:border-gray-700 transition-all hover:bg-purple-50/50 dark:hover:bg-purple-900/10 ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800/30' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}>
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900 dark:text-white">{record.user_name}</p>
                          </td>
                          <td className="px-6 py-4">
                            {record.check_in_time ? (
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white text-base">
                                  {new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  📍 {record.check_in_distance}m away
                                </p>
                              </div>
                            ) : (
                              <span className="text-gray-400 font-semibold">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {record.check_in_time && (
                              <span className={`inline-flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg backdrop-blur ${
                                record.check_in_within_zone
                                  ? 'bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : 'bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              }`}>
                                {record.check_in_within_zone ? '✓ In Zone' : '⚠️ OUTSIDE'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {record.check_out_time ? (
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white text-base">
                                  {new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  📍 {record.check_out_distance}m away
                                </p>
                              </div>
                            ) : (
                              <span className="text-yellow-600 dark:text-yellow-400 font-bold text-sm">⏳ Pending</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {record.check_out_time && (
                              <span className={`inline-flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg backdrop-blur ${
                                record.check_out_within_zone
                                  ? 'bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                  : 'bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              }`}>
                                {record.check_out_within_zone ? '✓ In Zone' : '⚠️ OUTSIDE'}
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

            {/* Statistics */}
            {filteredRecords.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Total Checked In */}
                <div className="relative p-6 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 overflow-hidden">
                  <div className="absolute top-0 right-0 text-6xl opacity-10">👥</div>
                  <p className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 relative z-10">Total Checked In</p>
                  <p className="text-4xl font-black text-blue-900 dark:text-blue-100 mt-2 relative z-10">
                    {filteredRecords.filter((r) => r.check_in_time).length}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 relative z-10">of {filteredRecords.length} employees</p>
                </div>

                {/* In Zone */}
                <div className="relative p-6 rounded-2xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 overflow-hidden">
                  <div className="absolute top-0 right-0 text-6xl opacity-10">✓</div>
                  <p className="text-xs font-black uppercase tracking-widest text-green-700 dark:text-green-300 relative z-10">In Zone</p>
                  <p className="text-4xl font-black text-green-900 dark:text-green-100 mt-2 relative z-10">
                    {filteredRecords.filter((r) => r.check_in_within_zone).length}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 relative z-10">on-site attendance</p>
                </div>

                {/* Outside Zone */}
                <div className="relative p-6 rounded-2xl border-2 border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/30 dark:to-red-800/20 overflow-hidden">
                  <div className="absolute top-0 right-0 text-6xl opacity-10">⚠️</div>
                  <p className="text-xs font-black uppercase tracking-widest text-red-700 dark:text-red-300 relative z-10">Outside Zone</p>
                  <p className="text-4xl font-black text-red-900 dark:text-red-100 mt-2 relative z-10">
                    {filteredRecords.filter((r) => r.check_in_time && !r.check_in_within_zone).length}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 relative z-10">flagged records</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
