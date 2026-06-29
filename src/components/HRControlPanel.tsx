import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import AttendanceView from './AttendanceView';
import PublicHolidaysView from './PublicHolidaysView';
import LeaveSystemView from './LeaveSystemView';

type HRTab = 'attendance' | 'holidays' | 'leave' | 'claims';

export default function HRControlPanel() {
  const [activeTab, setActiveTab] = useState<HRTab>('attendance');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { lang } = usePortalLanguage();
  const { permissions, loading: permsLoading } = usePermissions(profile);

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`id, full_name, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        let roleName = 'No Role';
        if (profileData.roles) {
          const rolesVar = profileData.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        setProfile({
          id: profileData.id,
          name: profileData.full_name,
          department: profileData.department,
          role: roleName,
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  if (loading || permsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('common', 'loading', lang)}
        </div>
      </div>
    );
  }

  const hasAccess = profile?.department === 'Human Resources' || ['HR', 'CFO', 'IT Admin', 'Chairman', 'CEO', 'COO', 'General Manager', 'Head of Department'].includes(profile?.role || '');

  if (!hasAccess) {
    return (
      <div className="p-12 rounded-2xl bg-white dark:bg-gray-900/50 border border-rose-200 dark:border-rose-955/20 shadow-sm text-center mt-12">
        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-455 mb-2">
          {t('common', 'accessDenied', lang)}
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-page-transition pt-12 md:pt-0">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
            {t('hr', 'title', lang)}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 font-medium">
            {t('hr', 'subtitle', lang)}
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex flex-wrap bg-slate-100/50 dark:bg-gray-900/40 p-1.5 rounded-2xl border border-slate-200/80 dark:border-gray-800/80 gap-1.5 w-full md:w-fit">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 md:flex-initial flex items-center justify-center px-5 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all min-h-[48px] whitespace-nowrap ${activeTab === 'attendance'
            ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-gray-800'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-gray-900/20'
            }`}
        >
          <svg className="w-4.5 h-4.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('hr', 'tabAttendance', lang)}
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`flex-1 md:flex-initial flex items-center justify-center px-5 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all min-h-[48px] whitespace-nowrap ${activeTab === 'holidays'
            ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-gray-800'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-gray-900/20'
            }`}
        >
          <svg className="w-4.5 h-4.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t('hr', 'tabHolidays', lang)}
        </button>

        <button
          onClick={() => setActiveTab('leave')}
          className={`flex-1 md:flex-initial flex items-center justify-center px-5 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all min-h-[48px] whitespace-nowrap ${activeTab === 'leave'
              ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-gray-800'
              : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-gray-900/20'
            }`}
        >
          <svg className="w-4.5 h-4.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m12.728 6.364A9 9 0 115.636 5.636 9 9 0 0118.364 12z" />
          </svg>
          {t('hr', 'tabLeave', lang)}
        </button>

        <button
          onClick={() => setActiveTab('claims')}
          className={`flex-1 md:flex-initial flex items-center justify-center px-5 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all min-h-[48px] whitespace-nowrap ${activeTab === 'claims'
            ? 'bg-white dark:bg-gray-850 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-gray-800'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-gray-900/20'
            }`}
        >
          <svg className="w-4.5 h-4.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V15a2 2 0 01-2 2z" />
          </svg>
          {t('hr', 'tabClaims', lang)}
        </button>
      </div>

      {/* Tab Panels with animations */}
      <div className="transition-all duration-300">
        {activeTab === 'attendance' && (
          <div className="animate-fade-in">
            <AttendanceView />
          </div>
        )}

        {activeTab === 'holidays' && (
          <div className="animate-fade-in">
            <PublicHolidaysView />
          </div>
        )}

        {activeTab === 'leave' && (
          <div className="animate-fade-in">
            <LeaveSystemView profile={profile} />
          </div>
        )}

        {activeTab === 'claims' && (
          <div className="animate-fade-in bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl p-8 md:p-16 text-center space-y-6 max-w-4xl mx-auto shadow-sm">
            <div className="inline-flex p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-yellow-500">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V15a2 2 0 01-2 2z" />
              </svg>
            </div>

            <div className="space-y-2 max-w-xl mx-auto">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 dark:bg-yellow-500/10 dark:text-yellow-500 rounded-full text-xs font-bold uppercase tracking-wider">
                {t('hr', 'comingSoon', lang)}
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white pt-2">
                {t('hr', 'tabClaims', lang)}
              </h2>
              <p className="text-sm text-slate-500 dark:text-zinc-405 leading-relaxed pt-2">
                {t('hr', 'claimsPlaceholder', lang)}
              </p>
            </div>

            <div className="pt-4 flex justify-center">
              <div className="flex gap-2 p-1 bg-slate-50 dark:bg-black rounded-xl border border-slate-200 dark:border-gray-800 text-xs font-semibold text-slate-400 dark:text-zinc-500">
                <span className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-850 shadow-sm text-slate-700 dark:text-zinc-300">Phase 2</span>
                <span className="px-3 py-1.5">Expense Claims</span>
                <span className="px-3 py-1.5">Receipt Uploads</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
