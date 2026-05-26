import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ExecutiveOverview() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // --- REAL-TIME ANNOUNCEMENT STATE (Synced from Supabase) ---
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isPostingNotice, setIsPostingNotice] = useState(false);

  // FETCH ANNOUNCEMENTS FROM DATABASE
  const fetchAnnouncements = async () => {
    try {
      const { data: announcementsData, error } = await supabase
        .from('announcements')
        .select('*')
        .lte('scheduled_at', new Date().toISOString()) // Only show announcements scheduled for today or earlier
        .order('scheduled_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching announcements:', error);
        return;
      }
      
      if (announcementsData) {
        const formatted = announcementsData.map((a: any) => ({
          id: a.id,
          type: a.type || 'Info',
          title: a.title,
          content: a.content,
          author: a.author_name,
          date: new Date(a.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          scheduled_at: a.scheduled_at,
          created_at: a.created_at
        }));
        setAnnouncements(formatted);
        console.log('Announcements fetched:', formatted.length);
      }
    } catch (err) {
      console.error('Exception fetching announcements:', err);
    }
  };

  useEffect(() => {
    async function loadDashboard() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return window.location.href = '/portal/login';

      const { data: profileData } = await supabase.from('profiles').select(`full_name, roles ( role_name )`).eq('id', session.user.id).single();
      
      let roleName = 'No Role';
      if (profileData) {
        roleName = profileData.roles?.role_name || 'No Role';
        setProfile({ name: profileData.full_name, role: roleName });
      }

      if (['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(roleName)) {
        const { data: clientsData } = await supabase.from('clients').select('*');
        if (clientsData) {
          const pCases = clientsData.filter(c => parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) > 5000).sort((a,b) => parseFloat(String(b['PENDING (RM)']).replace(/[^0-9.-]+/g, '')) - parseFloat(String(a['PENDING (RM)']).replace(/[^0-9.-]+/g, ''))).slice(0, 5);
          setHighPriorityCases(pCases);

          let totalPending = 0; let completed = 0; let dropped = 0; let pending = 0;
          clientsData.forEach(c => {
            if (String(c['CASE STATUS']).includes('COMPLETED')) completed++;
            else if (String(c['CASE STATUS']).includes('DROPPED')) dropped++;
            else pending++;
            totalPending += parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
          });
          setStats({ totalClients: clientsData.length, completed, dropped, pending, totalPending });
        }
      }

      // 1. Initial Load of Announcements
      await fetchAnnouncements();

      setLoading(false);
    }
    loadDashboard();

    // 2. Setup Real-time Listener for Announcements
    console.log('Setting up real-time listener for announcements...');
    const subscription = supabase
      .channel('public:announcements')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'announcements'
        },
        async (payload) => {
          console.log('Announcement change detected:', payload.eventType, payload);
          // Re-fetch all announcements when changes occur
          await fetchAnnouncements();
        }
      )
      .subscribe((status) => {
        console.log('Announcements subscription status:', status);
      });

    // Cleanup: Remove listener on component unmount
    return () => {
      console.log('Unsubscribing from announcements listener');
      subscription.unsubscribe();
    };
  }, []);

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPostingNotice(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const announcementDate = formData.get('scheduled_date');
    
    // Combine date with current time for scheduling
    const scheduledDateTime = announcementDate 
      ? new Date(`${announcementDate}T00:00:00`).toISOString()
      : new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert([
          {
            title: formData.get('title'),
            content: formData.get('content'),
            type: formData.get('type'),
            author_name: profile?.name,
            scheduled_at: scheduledDateTime,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) {
        console.error('Error posting announcement:', error);
        alert('Failed to post announcement. Please try again.');
      } else {
        console.log('Announcement posted successfully:', data);
        setIsNoticeModalOpen(false);
        (e.target as HTMLFormElement).reset();
        // Real-time listener will automatically update the UI
      }
    } catch (err) {
      console.error('Exception posting announcement:', err);
      alert('Error posting announcement');
    } finally {
      setIsPostingNotice(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-teal-600 font-bold animate-pulse text-xl uppercase">Loading Dashboard...</div></div>;

  const isIT = profile?.role === 'IT Admin';
  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);

  return (
    <div className="space-y-10 md:space-y-12 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-teal-900 dark:text-white">Portal <span className="text-teal-600 dark:text-yellow-500">Home</span></h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">Selamat kembali, <span className="font-bold text-teal-800 dark:text-gray-200">{profile?.name}</span> ({profile?.role})</p>
      </div>

      {/* ANNOUNCEMENTS SECTION */}
      <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg overflow-hidden">
        <div className="p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex justify-between items-center">
          <div>
            <h2 className="text-lg md:text-xl font-black uppercase tracking-widest text-teal-900 dark:text-white flex items-center gap-2">📢 Company Announcements</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
          </div>
          {hasFullAccess && (
            <button onClick={() => setIsNoticeModalOpen(true)} className="text-xs md:text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-teal-600 to-teal-700 text-white px-4 py-3 rounded-lg shadow-md hover:shadow-lg hover:from-teal-700 hover:to-teal-800 transition-all">+ Post Notice</button>
          )}
        </div>
        <div className="p-8 space-y-5 max-h-[500px] overflow-y-auto scrollbar-thin">
          {announcements.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No announcements yet.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Check back soon for updates!</p>
            </div>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="p-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-800/30 dark:to-gray-900/30 hover:shadow-md transition-all">
                <div className="flex flex-col sm:flex-row justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest whitespace-nowrap ${
                      a.type === 'Urgent' 
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' 
                        : a.type === 'Memo' 
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' 
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {a.type === 'Urgent' && '🔴 '}
                      {a.type === 'Memo' && '📝 '}
                      {a.type === 'Info' && 'ℹ️ '}
                      {a.type}
                    </span>
                    <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-white">{a.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <span>{a.date}</span>
                  </div>
                </div>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{a.content}</p>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">✏️ <span className="font-semibold">{a.author}</span></p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* POST NOTICE MODAL */}
      {isNoticeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 w-[95%] max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
            {/* Modal Header */}
            <div className="p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-teal-50 to-teal-100/50 dark:from-teal-900/20 dark:to-teal-800/20 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black uppercase tracking-widest text-teal-900 dark:text-white">Post New Announcement</h2>
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">Share important updates with your team</p>
              </div>
              <button onClick={() => setIsNoticeModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handlePostNotice} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {/* Title Input */}
              <div>
                <label className="block text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">📌 Announcement Title</label>
                <input 
                  type="text" 
                  name="title" 
                  required 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  placeholder="e.g., Q3 Quarterly Meeting" 
                  disabled={isPostingNotice} 
                />
              </div>

              {/* Urgency Level */}
              <div>
                <label className="block text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">🚨 Urgency Level</label>
                <select 
                  name="type" 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm font-bold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  disabled={isPostingNotice}
                >
                  <option value="Info">ℹ️ Info (Standard)</option>
                  <option value="Memo">📝 Memo (Important)</option>
                  <option value="Urgent">🔴 Urgent (Critical)</option>
                </select>
              </div>

              {/* Date Picker */}
              <div>
                <label className="block text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">📅 Announcement Date</label>
                <input 
                  type="date" 
                  name="scheduled_date" 
                  defaultValue={new Date().toISOString().split('T')[0]} 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  disabled={isPostingNotice} 
                />
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <span className="font-bold block mb-1">How it works:</span>
                     <span className="text-blue-600 dark:text-blue-400">Past dates</span> = Historical records<br/>
                     <span className="text-blue-600 dark:text-blue-400">Today</span> = Publish immediately<br/>
                     <span className="text-blue-600 dark:text-blue-400">Future dates</span> = Schedule for later
                  </p>
                </div>
              </div>

              {/* Content Area */}
              <div>
                <label className="block text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">✍️ Message Content</label>
                <textarea 
                  name="content" 
                  required 
                  rows={5} 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all resize-none" 
                  placeholder="Write your announcement here... Be clear and concise."
                  disabled={isPostingNotice}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-800">
                <button 
                  type="button"
                  onClick={() => setIsNoticeModalOpen(false)}
                  className="px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  disabled={isPostingNotice}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isPostingNotice} 
                  className="px-8 py-3 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-teal-600 to-teal-700 text-white hover:from-teal-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                >
                  {isPostingNotice ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      Posting...
                    </span>
                  ) : (
                    '✨ Post to Dashboard'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTIVE SNAPSHOT (Bottom Section) */}
      {hasFullAccess && !isIT && stats && (
         <div className="space-y-8 pt-8 border-t border-gray-200 dark:border-gray-800">
           <h2 className="text-lg font-black uppercase tracking-widest">Executive Snapshot</h2>
           {/* ... Kept your beautiful stats grid exactly the same ... */}
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10"><p className="text-[10px] font-bold text-blue-600 uppercase">Total Clients</p><p className="text-3xl font-black text-blue-700 mt-3">{stats.totalClients}</p></div>
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10"><p className="text-[10px] font-bold text-emerald-600 uppercase">Completed</p><p className="text-3xl font-black text-emerald-700 mt-3">{stats.completed}</p></div>
            <div className="p-6 rounded-2xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10"><p className="text-[10px] font-bold text-yellow-600 uppercase">Pending</p><p className="text-3xl font-black text-yellow-700 mt-3">{stats.pending}</p></div>
            <div className="p-6 rounded-2xl bg-red-50 border border-red-200 dark:bg-red-500/10"><p className="text-[10px] font-bold text-red-600 uppercase">Dropped</p><p className="text-3xl font-black text-red-700 mt-3">{stats.dropped}</p></div>
          </div>
         </div>
      )}
    </div>
  );
}