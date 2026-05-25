import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function PortalSidebar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

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

  useEffect(() => {
    async function loadProfile() {
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
      setLoading(false);
    }
    loadProfile();
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [currentPath]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/portal/login';
  };

  const isActive = (path: string) => {
    if (path === '/portal' || path === '/portal/') {
      return currentPath === '/portal' || currentPath === '/portal/' || currentPath === '/portal/index.astro';
    }
    return currentPath.startsWith(path);
  };

  // ROLE-BASED NAVIGATION LOGIC
  const getNavItems = () => {
    if (!profile) return [];
    
    // Define the role groups
    const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile.role);
    const hasViewAccess = ['Intern', 'Contract'].includes(profile.role);
    const canViewClients = hasFullAccess || hasViewAccess;
    
    const items = [{ label: 'Overview', path: '/portal' }];
    
    // Both Full Access and View Access can see the Clients menu
    if (canViewClients) {
      items.push({ label: 'Clients', path: '/portal/klien' });
    }
    
    // ONLY Full Access can see Reports
    if (hasFullAccess) {
      items.push({ label: 'Reports', path: '/portal/laporan' });
    }
    
    items.push({ label: 'Settings', path: '/portal/tetapan' });
    
    return items;
  };

  const navItems = getNavItems();

  if (loading) {
    return (
      <div className="fixed left-0 top-0 h-screen w-full md:w-64 bg-teal-50 dark:bg-black border-r border-teal-200 dark:border-gray-900 flex items-center justify-center z-40">
        <div className="text-teal-600 dark:text-yellow-500 text-sm font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 md:hidden z-50 p-2 rounded-lg bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-lg hover:shadow-xl transition-shadow min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Toggle Menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          )}
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 md:hidden z-30" onClick={() => setIsOpen(false)} />
      )}

      <div className={`fixed left-0 top-0 h-screen w-full sm:w-72 md:w-64 bg-teal-50 dark:bg-black border-r border-teal-200 dark:border-gray-900 flex flex-col shadow-2xl z-40 overflow-y-auto transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-teal-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo-v2.svg" alt="Logo" className="h-6 w-6 flex-shrink-0" />
              <h1 className="text-sm md:text-lg font-black text-teal-900 dark:text-white uppercase tracking-widest truncate">
                Portal <span className="text-yellow-500">Admin</span>
              </h1>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 text-teal-600 dark:text-gray-400 flex-shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <a href="/" className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest text-teal-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-gray-800/50 hover:text-teal-900 dark:hover:text-white transition-all border border-teal-200 dark:border-gray-700 min-h-[40px]">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            <span className="truncate">Main Website</span>
          </a>
        </div>

        <div className="p-4 mx-2 mt-4 bg-teal-100 dark:bg-gray-900/50 border border-teal-200 dark:border-gray-800/50 rounded-lg flex-shrink-0">
          <p className="text-xs font-bold text-teal-600 dark:text-gray-400 uppercase tracking-wider mb-1">User</p>
          <p className="text-xs md:text-sm font-semibold text-teal-900 dark:text-white truncate">{profile?.name || 'User'}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="text-[9px] md:text-[10px] px-2 py-1 bg-teal-200 dark:bg-yellow-500/10 text-teal-700 dark:text-yellow-400 rounded border border-teal-300 dark:border-yellow-500/30 font-semibold uppercase tracking-wider truncate">
              {profile?.role}
            </span>
            <span className="text-[9px] md:text-[10px] px-2 py-1 bg-teal-200 dark:bg-yellow-500/10 text-teal-700 dark:text-yellow-400 rounded border border-teal-300 dark:border-yellow-500/30 font-semibold uppercase tracking-wider truncate">
              {profile?.department}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          <p className="text-xs font-bold text-teal-600 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Main Menu</p>
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <a
                  href={item.path}
                  className={`px-4 py-3 rounded-lg text-xs md:text-sm font-semibold uppercase tracking-wider transition-all block min-h-[44px] flex items-center ${
                    isActive(item.path)
                      ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-lg scale-105'
                      : 'text-teal-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-gray-800/50 hover:text-teal-900 dark:hover:text-white hover:translate-x-1'
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-teal-200 dark:border-gray-800 p-4 space-y-2 flex-shrink-0 bg-teal-50/50 dark:bg-gray-950/50">
          <button
            onClick={toggleTheme}
            className="w-full px-4 py-2.5 rounded-lg bg-teal-100 dark:bg-gray-800/50 hover:bg-teal-200 dark:hover:bg-gray-700/50 text-teal-700 dark:text-gray-300 hover:text-teal-900 dark:hover:text-white text-xs font-semibold uppercase tracking-wider transition-all border border-teal-200 dark:border-gray-700 min-h-[44px]"
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 rounded-lg bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 hover:text-red-700 text-xs font-semibold uppercase tracking-wider transition-all border border-red-200 dark:border-red-500/30 min-h-[44px]"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
}