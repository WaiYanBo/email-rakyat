import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ExecutiveOverview() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // --- MOCK ANNOUNCEMENT STATE (For Prototyping) ---
  const [announcements, setAnnouncements] = useState<any[]>([
    { id: 1, type: 'Urgent', title: 'Server Maintenance Notice', date: '28 May 2026', author: 'IT Dept', content: 'Sistem pangkalan data akan ditutup sementara pada jam 12:00 AM hingga 2:00 AM malam ini.' },
    { id: 2, type: 'Memo', title: 'Cuti Umum Hari Keputeraan Agong', date: '25 May 2026', author: 'HR Dept', content: 'Ibu pejabat akan ditutup pada hari Isnin minggu hadapan bersempena cuti umum.' }
  ]);

  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);

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
      setLoading(false);
    }
    loadDashboard();
  }, []);

  const handlePostNotice = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const newNotice = {
      id: Date.now(),
      type: formData.get('type'),
      title: formData.get('title'),
      author: profile?.name, // Auto tag the logged-in user
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      content: formData.get('content')
    };
    setAnnouncements(prev => [newNotice, ...prev]);
    setIsNoticeModalOpen(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-teal-600 font-bold animate-pulse text-xl uppercase">Loading Dashboard...</div></div>;

  const isIT = profile?.role === 'IT Admin';
  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);

  return (
    <div className="space-y-6 md:space-y-8 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-teal-900 dark:text-white">Portal <span className="text-teal-600 dark:text-yellow-500">Home</span></h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">Selamat kembali, <span className="font-bold text-teal-800 dark:text-gray-200">{profile?.name}</span> ({profile?.role})</p>
      </div>

      {/* ANNOUNCEMENTS SECTION */}
      <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex justify-between items-center">
          <h2 className="text-sm md:text-lg font-black uppercase tracking-widest text-teal-900 dark:text-white flex items-center gap-2">Company Announcements</h2>
          {hasFullAccess && (
            <button onClick={() => setIsNoticeModalOpen(true)} className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-teal-600 text-white px-3 py-2 rounded-md shadow-sm">+ Post Notice</button>
          )}
        </div>
        <div className="p-4 md:p-6 space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin">
          {announcements.map((a) => (
            <div key={a.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex flex-col sm:flex-row justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${a.type === 'Urgent' ? 'bg-red-100 text-red-700' : a.type === 'Memo' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>{a.type}</span>
                  <h3 className="text-sm md:text-base font-bold">{a.title}</h3>
                </div>
                <span className="text-[10px] text-gray-500">{a.date} • {a.author}</span>
              </div>
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-300">{a.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* POST NOTICE MODAL */}
      {isNoticeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 w-[95%] max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h2 className="text-sm font-black uppercase tracking-widest text-teal-900 dark:text-white">Post New Announcement</h2>
              <button onClick={() => setIsNoticeModalOpen(false)} className="text-gray-400 hover:text-red-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            <form onSubmit={handlePostNotice} className="p-5 space-y-4">
              <div><label className="block text-xs font-bold uppercase mb-1">Notice Title</label><input type="text" name="title" required className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" placeholder="e.g., Q3 Meeting Schedule" /></div>
              <div><label className="block text-xs font-bold uppercase mb-1">Urgency Level</label><select name="type" className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm font-bold"><option value="Info">Info (Standard)</option><option value="Memo">Memo (Important)</option><option value="Urgent">Urgent (Critical)</option></select></div>
              <div><label className="block text-xs font-bold uppercase mb-1">Message Content</label><textarea name="content" required rows={4} className="w-full p-2.5 border rounded bg-gray-50 dark:bg-black/50 text-sm" placeholder="Write your announcement here..."></textarea></div>
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200"><button type="submit" className="px-5 py-2.5 rounded-lg text-xs font-bold uppercase bg-teal-600 text-white w-full sm:w-auto">Post to Dashboard</button></div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTIVE SNAPSHOT (Bottom Section) */}
      {hasFullAccess && !isIT && stats && (
         <div className="space-y-6 pt-4 border-t border-gray-200 dark:border-gray-800">
           <h2 className="text-lg font-black uppercase tracking-widest">Executive Snapshot</h2>
           {/* ... Kept your beautiful stats grid exactly the same ... */}
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10"><p className="text-[10px] font-bold text-blue-600 uppercase">Total Clients</p><p className="text-2xl font-black text-blue-700">{stats.totalClients}</p></div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10"><p className="text-[10px] font-bold text-emerald-600 uppercase">Completed</p><p className="text-2xl font-black text-emerald-700">{stats.completed}</p></div>
            <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10"><p className="text-[10px] font-bold text-yellow-600 uppercase">Pending</p><p className="text-2xl font-black text-yellow-700">{stats.pending}</p></div>
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-500/10"><p className="text-[10px] font-bold text-red-600 uppercase">Dropped</p><p className="text-2xl font-black text-red-700">{stats.dropped}</p></div>
          </div>
         </div>
      )}
    </div>
  );
}