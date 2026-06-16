import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

export default function PortalSidebar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { lang, setLang } = usePortalLanguage();
  const { permissions } = usePermissions(profile);

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
        .select(`id, full_name, department, avatar_url, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile({
          id: profileData.id,
          name: profileData.full_name,
          department: profileData.department,
          avatar_url: profileData.avatar_url,
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
    try {
      sessionStorage.clear();
    } catch (e) {
      // ignore
    }
    await supabase.auth.signOut();
    window.location.href = '/portal/login';
  };

  const isActive = (path: string) => {
    if (path === '/portal' || path === '/portal/') {
      return currentPath === '/portal' || currentPath === '/portal/' || currentPath === '/portal/index.astro';
    }
    return currentPath.startsWith(path);
  };

  // Renders navigation item details with clean icons
  const getNavItems = () => {
    if (!profile) return [];

    const canViewClients = permissions?.view_clients || false;
    const canViewReports = permissions?.view_staff || false;
    const canManageDrive = permissions?.manage_drive || false;
    const canViewAttendance = permissions?.view_attendance || ['HR', 'CFO', 'IT Admin'].includes(profile?.role || '');

    const items = [
      {
        label: t('sidebar', 'navOverview', lang),
        path: '/portal',
        activeClass: 'bg-blue-50/70 text-blue-700 border-blue-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        )
      }
    ];

    if (canViewClients) {
      items.push({
        label: t('sidebar', 'navClients', lang),
        path: '/portal/klien',
        activeClass: 'bg-cyan-50/70 text-cyan-700 border-cyan-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
        )
      });
    }

    if (canViewReports) {
      items.push({
        label: t('sidebar', 'navReports', lang),
        path: '/portal/laporan',
        activeClass: 'bg-purple-50/70 text-purple-700 border-purple-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        )
      });
    }

    if (canViewAttendance) {
      items.push({
        label: lang === 'bm' ? 'Sumber Manusia' : 'Human Resources',
        path: '/portal/hr',
        activeClass: 'bg-rose-50/70 text-rose-700 border-rose-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )
      });
    }

    if (canManageDrive) {
      items.push({
        label: t('sidebar', 'navDrive', lang),
        path: '/portal/pemacu',
        activeClass: 'bg-emerald-50/70 text-emerald-700 border-emerald-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        )
      });
    }

    items.push({
      label: t('sidebar', 'navSettings', lang),
      path: '/portal/tetapan',
      activeClass: 'bg-indigo-50/70 text-indigo-700 border-indigo-600 dark:bg-yellow-500/10 dark:text-yellow-500 dark:border-yellow-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      )
    });

    return items;
  };

  const navItems = getNavItems();

  if (loading) {
    return (
      <div className="fixed left-0 top-0 h-[100dvh] w-full md:w-64 bg-slate-50 dark:bg-black border-r border-slate-200 dark:border-gray-800 flex items-center justify-center z-40">
        <div className="text-slate-600 dark:text-zinc-400 text-sm font-semibold tracking-wide animate-pulse">
          {t('common', 'loading', lang)}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 md:hidden z-50 p-2 rounded-xl bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-md hover:shadow-lg transition-all min-h-[48px] min-w-[48px] flex items-center justify-center"
        aria-label="Toggle Menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
          )}
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm md:hidden z-30" onClick={() => setIsOpen(false)} />
      )}

      <div className={`fixed left-0 top-0 h-[100dvh] w-full sm:w-72 md:w-64 bg-slate-50 dark:bg-black border-r border-slate-200 dark:border-gray-900/60 flex flex-col z-40 overflow-y-auto transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-5 border-b border-slate-200 dark:border-gray-900/60 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo-v2.svg" alt="Logo" className="h-6 w-6 flex-shrink-0" />
              <h1 className="text-base font-bold text-indigo-900 dark:text-yellow-500 tracking-wide truncate">
                Staff <span className="text-slate-500 dark:text-slate-400 font-medium">Portal</span>
              </h1>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex-shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <a href="/" className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-zinc-300 dark:hover:text-white bg-white hover:bg-slate-100 dark:bg-gray-900 dark:hover:bg-zinc-800 transition-all border border-slate-200 dark:border-gray-800/80 shadow-sm min-h-[48px]">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            <span className="truncate">{t('sidebar', 'mainWebsite', lang)}</span>
          </a>
        </div>

        <a href="/portal/tetapan" className="p-4 mx-3 mt-4 bg-slate-100/50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800/80 rounded-xl flex-shrink-0 block hover:bg-slate-200/50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer group">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2 block">
            {t('sidebar', 'userLabel', lang)}
          </p>
          <div className="flex items-center gap-3 mb-2">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-800 shadow-sm" />
            ) : (
              <img src="/logo.png" alt="Default Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-800 shadow-sm" />
            )}
            <p className="text-sm font-bold text-slate-800 dark:text-zinc-150 truncate">{profile?.name || 'User'}</p>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] px-2.5 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-yellow-500/10 dark:text-yellow-500 rounded-md border border-indigo-100 dark:border-indigo-950/40 font-semibold tracking-wide truncate">
              {profile?.role}
            </span>
            <span className="text-[10px] px-2.5 py-0.5 bg-slate-200/60 text-slate-700 dark:bg-gray-800/80 dark:text-zinc-300 rounded-md border border-slate-200 dark:border-gray-700/60 font-semibold tracking-wide truncate">
              {profile?.department}
            </span>
          </div>
        </a>

        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest px-3 mb-2.5">
            {t('sidebar', 'mainMenu', lang)}
          </p>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <a
                  href={item.path}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all block min-h-[48px] flex items-center gap-3 border-l-4 ${
                    isActive(item.path)
                      ? `${item.activeClass} font-semibold shadow-sm`
                      : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900/65 hover:text-slate-900 dark:hover:text-zinc-200 border-transparent'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-slate-200 dark:border-gray-900/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 flex-shrink-0 bg-slate-50/40 dark:bg-gray-900/40">

          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
              {t('sidebar', 'language', lang)}
            </span>
            <div className="flex items-center rounded-lg overflow-hidden border border-slate-200 dark:border-gray-800 bg-slate-100 dark:bg-gray-900 p-0.5">
              <button
                onClick={() => setLang('en')}
                aria-label="Switch to English"
                className={`px-3 py-1 text-[10px] font-semibold tracking-wider transition-all rounded ${
                  lang === 'en'
                    ? 'bg-white dark:bg-gray-800 text-slate-800 dark:text-zinc-100 shadow-sm'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang('bm')}
                aria-label="Tukar ke Bahasa Malaysia"
                className={`px-3 py-1 text-[10px] font-semibold tracking-wider transition-all rounded ${
                  lang === 'bm'
                    ? 'bg-white dark:bg-gray-800 text-slate-800 dark:text-zinc-100 shadow-sm'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                BM
              </button>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className="w-full px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-gray-900 dark:hover:bg-zinc-850/80 text-slate-600 hover:text-slate-900 dark:text-zinc-350 dark:hover:text-white text-xs font-semibold transition-all border border-slate-200 dark:border-gray-800 shadow-sm min-h-[48px] flex items-center justify-center gap-2"
          >
            {theme === 'light' ? (
              <>
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                </svg>
                <span>{t('sidebar', 'darkMode', lang)}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z"/>
                </svg>
                <span>{t('sidebar', 'lightMode', lang)}</span>
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 rounded-xl bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-950/30 text-xs font-semibold transition-all min-h-[48px] flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            <span>{t('sidebar', 'logout', lang)}</span>
          </button>
        </div>
      </div>
    </>
  );
}