import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';

export default function DashboardView() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [dbClients, setDbClients] = useState<any[]>([]);
  
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    // Load theme from localStorage after component mounts
    try {
      const savedTheme = localStorage.getItem('portal-theme') as 'light' | 'dark' | null;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setTheme(savedTheme);
      }
    } catch (error) {
      // localStorage might not be available
    }
    setThemeLoaded(true);
  }, []);

  // Save theme to localStorage and apply to document whenever it changes
  useEffect(() => {
    if (themeLoaded) {
      try {
        localStorage.setItem('portal-theme', theme);
      } catch (error) {
        // localStorage might not be available
      }
      
      // Apply dark class to html element for Tailwind dark mode
      const htmlElement = document.documentElement;
      if (theme === 'dark') {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
    }
  }, [theme, themeLoaded]);

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
    <div 
      style={{
        backgroundColor: theme === 'dark' ? '#0f172a' : '#f3f4f6',
        color: theme === 'dark' ? '#f3f4f6' : '#111827',
        padding: '2rem',
        borderRadius: '1rem',
        border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e5e7eb',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        transition: 'background-color 0.3s, color 0.3s, border-color 0.3s',
        minHeight: '80vh'
      }}
    >
        
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e5e7eb', paddingBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.125em', color: theme === 'dark' ? '#ffffff' : '#111827' }}>
            {profile?.role} Dashboard
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <span style={{ fontWeight: 'bold', letterSpacing: '0.075em', textTransform: 'uppercase', fontSize: '0.75rem', backgroundColor: theme === 'dark' ? '#fef3c7' : '#fef3c7', color: theme === 'dark' ? '#92400e' : '#92400e', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: theme === 'dark' ? '1px solid #fde68a' : '1px solid #fde68a' }}>
              {profile?.name} • {profile?.department} Dept
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={toggleTheme}
            style={{
              padding: '0.625rem',
              borderRadius: '0.5rem',
              backgroundColor: theme === 'dark' ? '#1f2937' : '#e5e7eb',
              border: theme === 'dark' ? '1px solid #374151' : '1px solid #d1d5db',
              color: theme === 'dark' ? '#d1d5db' : '#374151',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#111827' : '#d1d5db';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#1f2937' : '#e5e7eb';
            }}
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
            style={{
              padding: '0.625rem 1.5rem',
              backgroundColor: theme === 'dark' ? '#7f1d1d' : '#fee2e2',
              border: theme === 'dark' ? '1px solid #dc2626' : '1px solid #fca5a5',
              color: theme === 'dark' ? '#fca5a5' : '#dc2626',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.075em',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#991b1b' : '#fecaca';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#7f1d1d' : '#fee2e2';
            }}
          >
            Log Keluar
          </button>
        </div>
      </div>

      <div style={{ paddingTop: '2rem' }}>
        {isIT && (
          <div style={{ padding: '1.5rem', backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb', borderRadius: '1rem', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
             <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kawalan IT Admin</h3>
             <p style={{ color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: '0.875rem' }}>System management tools will be placed here.</p>
          </div>
        )}

        {isExec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <ClientTable clients={dbClients} canEdit={canEdit} />
          </div>
        )}

        {!isIT && !isExec && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff', border: theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb', borderRadius: '1rem', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Akses Terhad</h3>
            <p style={{ color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: '0.875rem' }}>Anda tidak mempunyai kebenaran untuk melihat data ini.</p>
          </div>
        )}
      </div>

    </div>
  );
}