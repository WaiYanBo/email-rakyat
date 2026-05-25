import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';

export default function DashboardView() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [dbClients, setDbClients] = useState<any[]>([]);
  
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('portal-theme') as 'light' | 'dark' | null;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setTheme(savedTheme);
      }
    } catch (error) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('portal-theme', theme);
      const htmlElement = document.documentElement;
      if (theme === 'dark') {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
    } catch (error) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
        setProfile({
          name: profileData.full_name,
          department: profileData.department,
          role: profileData.roles?.role_name || 'No Role',
        });
      }

      const { data: clientsData } = await supabase.from('clients').select('*');
        
      if (clientsData) {
        const safeData = clientsData.map((c, idx) => ({
          ...c,
          _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
        }));
        setDbClients(safeData);
      }
      setLoading(false);
    }
    loadDashboard();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/portal/login';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-yellow-600 dark:text-yellow-500 font-bold animate-pulse text-xl tracking-widest uppercase">
          Memuatkan Data Sistem...
        </div>
      </div>
    );
  }

  const isIT = profile?.role === 'IT Admin';
  const isExec = ['Chairman', 'CEO', 'COO', 'CFO'].includes(profile?.role);
  const canEdit = ['COO', 'CFO'].includes(profile?.role);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl transition-colors duration-300 min-h-[80vh] p-8 text-gray-900 dark:text-gray-100">
        
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-gray-200 dark:border-gray-700 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-widest text-gray-900 dark:text-white">
            {profile?.role} Dashboard
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="font-bold uppercase tracking-wider text-xs px-3 py-1.5 rounded-md bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30">
              {profile?.name} • {profile?.department} Dept
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 transition-all cursor-pointer shadow-sm"
            title="Tukar Tema"
          >
            {theme === 'light' ? (
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            ) : (
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            )}
          </button>

          <button 
            onClick={handleLogout}
            className="px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 dark:border-red-500/50 shadow-sm"
          >
            Log Keluar
          </button>
        </div>
      </div>

      <div className="pt-8">
        {isIT && (
          <div className="p-6 rounded-2xl shadow-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
             <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">Kawalan IT Admin</h3>
             <p className="text-gray-500 dark:text-gray-400 text-sm">System management tools will be placed here.</p>
          </div>
        )}

        {isExec && (
          <div className="flex flex-col gap-8">
            <ClientTable clients={dbClients} canEdit={canEdit} />
          </div>
        )}

        {!isIT && !isExec && (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl shadow-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 uppercase tracking-wide">Akses Terhad</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Anda tidak mempunyai kebenaran untuk melihat data ini.</p>
          </div>
        )}
      </div>

    </div>
  );
}