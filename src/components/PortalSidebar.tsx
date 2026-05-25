 import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function PortalSidebar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [isOpen, setIsOpen] = useState(false); // Mobile menu state - starts closed

  // Get current path
  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  // Load theme
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('portal-theme') as 'light' | 'dark' | null;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setTheme(savedTheme);
      }
    } catch (error) {}
  }, []);

  // Apply theme
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

  // Load profile
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

  // Close menu on navigation
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

  const navItems = [
    { label: 'Overview', path: '/portal' },
    { label: 'Clients', path: '/portal/klien' },
    { label: 'Reports', path: '/portal/laporan' },
    { label: 'Settings', path: '/portal/tetapan' },
  ];

  if (loading) {
    return (
      <div className="fixed left-0 top-0 h-screen w-full md:w-64 bg-teal-50 dark:bg-black border-r border-teal-200 dark:border-gray-900 flex items-center justify-center z-40">
        <div className="text-teal-600 dark:text-yellow-500 text-sm font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Menu Button - Only visible on small screens */}
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

      {/* Mobile Overlay - Closes menu when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-screen w-full sm:w-72 md:w-64 bg-teal-50 dark:bg-black border-r border-teal-200 dark:border-gray-900 flex flex-col shadow-2xl z-40 overflow-y-auto animate-slide-in transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Top Section - Branding & Back Button */}
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
              aria-label="Close Menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          {/* Back to Main Website */}
          <a 
            href="/" 
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest text-teal-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-gray-800/50 hover:text-teal-900 dark:hover:text-white transition-all border border-teal-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-gray-600 min-h-[40px]"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            <span className="truncate">Main Website</span>
          </a>
        </div>

        {/* Profile Section */}
        <div className="p-4 mx-2 mt-4 bg-teal-100 dark:bg-gray-900/50 border border-teal-200 dark:border-gray-800/50 rounded-lg flex-shrink-0 animate-fade-in" style={{ animationDelay: '0.1s' }}>
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

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          <p className="text-xs font-bold text-teal-600 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Main Menu</p>
          <ul className="space-y-2">
            {navItems.map((item, idx) => (
              <li key={item.path} style={{ animationDelay: `${0.15 + idx * 0.05}s` }} className="animate-fade-in">
                <a
                  href={item.path}
                  className={`px-4 py-3 rounded-lg text-xs md:text-sm font-semibold uppercase tracking-wider transition-all block touch-manipulation min-h-[44px] flex items-center ${
                    isActive(item.path)
                      ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-lg scale-105'
                      : 'text-teal-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-gray-800/50 hover:text-teal-900 dark:hover:text-white hover:translate-x-1 active:bg-teal-200 dark:active:bg-gray-700'
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer Actions */}
        <div className="border-t border-teal-200 dark:border-gray-800 p-4 space-y-2 flex-shrink-0 animate-fade-in bg-teal-50/50 dark:bg-gray-950/50" style={{ animationDelay: '0.35s' }}>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-full px-4 py-2.5 rounded-lg bg-teal-100 dark:bg-gray-800/50 hover:bg-teal-200 dark:hover:bg-gray-700/50 text-teal-700 dark:text-gray-300 hover:text-teal-900 dark:hover:text-white text-xs font-semibold uppercase tracking-wider transition-all border border-teal-200 dark:border-gray-700 touch-manipulation active:bg-teal-300 dark:active:bg-gray-600 min-h-[44px]"
            title="Toggle Theme"
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 rounded-lg bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs font-semibold uppercase tracking-wider transition-all border border-red-200 dark:border-red-500/30 touch-manipulation active:bg-red-300 dark:active:bg-red-500/30 min-h-[44px]"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  );
}
