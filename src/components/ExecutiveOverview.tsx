import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Client {
  [key: string]: any;
  NAME?: string;
  'PENDING (RM)'?: string | number;
  'CASE CATEGORY'?: string;
  'CASE STATUS'?: string;
  DATE?: string;
}

export default function ExecutiveOverview() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<Client[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  
  const PRIORITY_THRESHOLD = 5000;

  useEffect(() => {
    async function loadDashboard() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`full_name, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        const roleName = profileData.roles?.role_name || 'No Role';
        setProfile({
          name: profileData.full_name,
          department: profileData.department,
          role: roleName,
        });

        // Add General Manager to Full Access
        const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(roleName);

        if (hasFullAccess) {
          const { data: clientsData } = await supabase.from('clients').select('*');
          
          if (clientsData) {
            setAllClients(clientsData);
            
            const priorityCases = clientsData
              .filter((c: Client) => {
                const pendingRM = parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                return pendingRM > PRIORITY_THRESHOLD;
              })
              .sort((a: Client, b: Client) => {
                const pendingA = parseFloat(String(a['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                const pendingB = parseFloat(String(b['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                return pendingB - pendingA; 
              })
              .slice(0, 5); 
            
            setHighPriorityCases(priorityCases);
          }
        }
      }

      setLoading(false);
    }

    loadDashboard();
  }, []);

  const getTotalStats = () => {
    const stats = { totalClients: allClients.length, completed: 0, pending: 0, dropped: 0, totalPending: 0 };
    allClients.forEach((c) => {
      if (String(c['CASE STATUS']).includes('COMPLETED')) stats.completed++;
      else if (String(c['CASE STATUS']).includes('DROPPED')) stats.dropped++;
      else stats.pending++;
      const pendingRM = parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
      stats.totalPending += pendingRM;
    });
    return stats;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-teal-600 dark:text-yellow-500 font-bold animate-pulse text-lg md:text-xl tracking-widest uppercase text-center">
          Loading Overview...
        </div>
      </div>
    );
  }

  const isIT = profile?.role === 'IT Admin';
  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  const stats = hasFullAccess ? getTotalStats() : null;

  return (
    <div className="space-y-6 md:space-y-8 animate-page-transition">
      <div className="flex flex-col gap-2 pt-12 md:pt-0">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-teal-900 dark:text-white">
          {hasFullAccess && !isIT ? 'Executive Overview' : isIT ? 'IT Admin Dashboard' : 'Staff Portal'}
        </h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">
          You are logged in as <span className="font-semibold text-teal-600 dark:text-yellow-500">{profile?.role}</span>
        </p>
      </div>

      {/* --- EXECUTIVE & GM ONLY VIEW --- */}
      {hasFullAccess && !isIT && stats && (
        <>
          {/* FIX: Changed to grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 so mobile has full-width cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-500/10 dark:to-blue-600/10 border border-blue-200 dark:border-blue-500/30 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-[10px] md:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Clients</p>
              <p className="text-3xl font-black text-blue-700 dark:text-blue-300 mt-1">{stats.totalClients}</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-500/10 dark:to-emerald-600/10 border border-emerald-200 dark:border-emerald-500/30 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-[10px] md:text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed</p>
              <p className="text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{stats.completed}</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-500/10 dark:to-yellow-600/10 border border-yellow-200 dark:border-yellow-500/30 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-[10px] md:text-xs font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Pending</p>
              <p className="text-3xl font-black text-yellow-700 dark:text-yellow-300 mt-1">{stats.pending}</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-500/10 dark:to-red-600/10 border border-red-200 dark:border-red-500/30 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-[10px] md:text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Dropped</p>
              <p className="text-3xl font-black text-red-700 dark:text-red-300 mt-1">{stats.dropped}</p>
            </div>
          </div>

          <div className="p-4 md:p-6 rounded-xl md:rounded-2xl bg-white dark:bg-gray-900/50 border-2 border-red-200 dark:border-red-500/30 shadow-lg dark:shadow-2xl overflow-hidden">
            <div className="mb-4 md:mb-6">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white">High Priority Cases</h2>
              <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 mt-2">Cases with balance over RM{PRIORITY_THRESHOLD.toLocaleString()} require immediate attention</p>
            </div>
            {highPriorityCases.length > 0 ? (
              <div className="space-y-2 md:space-y-3">
                {highPriorityCases.map((client, idx) => {
                  const pendingRM = parseFloat(String(client['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                  return (
                    <div key={idx} className="p-3 md:p-4 bg-gradient-to-r from-red-50 to-transparent dark:from-red-500/5 dark:to-transparent border border-red-200 dark:border-red-500/30 rounded-lg hover:shadow-md transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base md:text-lg text-gray-900 dark:text-white truncate">{client.NAME || 'N/A'}</p>
                          <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">Category: <span className="font-semibold">{client['CASE CATEGORY'] || 'N/A'}</span></p>
                          <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate">Status: <span className={`font-semibold ${String(client['CASE STATUS']).includes('COMPLETED') ? 'text-emerald-600 dark:text-emerald-400' : String(client['CASE STATUS']).includes('DROPPED') ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>{client['CASE STATUS'] || 'N/A'}</span></p>
                        </div>
                        <div className="text-left sm:text-right flex-shrink-0">
                          <p className="text-[9px] md:text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Outstanding Balance</p>
                          <p className="text-xl md:text-2xl font-black text-red-600 dark:text-red-400">RM{pendingRM.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 md:py-12 text-center">
                <p className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-2">No High Priority Cases</p>
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 rounded-xl md:rounded-2xl bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-2xl">
            <h3 className="text-lg md:text-xl font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-4">Financial Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <p className="text-[9px] md:text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Total Outstanding Amount</p>
                <p className="text-3xl md:text-4xl font-black text-red-600 dark:text-red-400 mt-2 break-words">RM{stats.totalPending.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* --- IT ADMIN ONLY VIEW --- */}
      {isIT && (
        <div className="p-8 md:p-12 rounded-xl md:rounded-2xl bg-white dark:bg-gray-900/50 border border-teal-200 dark:border-gray-700 shadow-lg text-center">
          <svg className="w-16 h-16 mx-auto text-teal-600 dark:text-teal-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white mb-2">IT Admin System</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">Server settings and database configuration operating normally.</p>
        </div>
      )}

      {/* --- RESTRICTED (INTERN & CONTRACT) VIEW --- */}
      {!isIT && !hasFullAccess && (
        <div className="p-8 md:p-12 rounded-xl md:rounded-2xl bg-white dark:bg-gray-900/50 border border-teal-200 dark:border-gray-700 shadow-lg text-center">
          <svg className="w-16 h-16 mx-auto text-teal-600 dark:text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white mb-2">Welcome</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Please use the <strong className="text-teal-700 dark:text-white">Clients</strong> menu on the left to view the database list.
          </p>
        </div>
      )}
    </div>
  );
}