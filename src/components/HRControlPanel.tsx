import { useState, useEffect } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import AttendanceView from './AttendanceView';
import PublicHolidaysView from './PublicHolidaysView';
import LeaveSystemView from './LeaveSystemView';
import ClaimSystemView from './ClaimSystemView';

import PermissionDenied from './PermissionDenied';

type HRTab = 'attendance' | 'holidays' | 'leave' | 'claims';

export default function HRControlPanel() {
  const [activeTab, setActiveTab] = useState<HRTab>('attendance');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { lang } = usePortalLanguage();
  const { permissions, loading: permsLoading } = usePermissions(profile);

  useEffect(() => {
    async function loadProfile() {
      const session = await getCurrentSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`id, full_name, department, status, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        if (profileData.status === 'Resigned' || profileData.status === 'Terminated' || profileData.status === 'Inactive') {
          await supabase.auth.signOut();
          window.location.href = '/portal/login?error=terminated';
          return;
        }

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

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const hasAccess = permissions?.manage_hr || isIT;

  if (!hasAccess) {
    return (
      <PermissionDenied
        title={lang === 'bm' ? 'Akses Panel Kawalan HR Terhad' : 'HR Control Panel Access Restricted'}
        message={lang === 'bm'
          ? 'Akaun anda tidak mempunyai kebenaran untuk menguruskan fungsi Sumber Manusia (HR). Sila hubungi Pentadbir Sistem jika anda memerlukan akses.'
          : 'Your account does not have permission to manage Human Resources functions. Please contact your System Administrator if you require access.'}
      />
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
      <div className="flex flex-wrap bg-slate-100/50 dark:bg-zinc-900/60 p-1.5 rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 gap-1.5 w-full md:w-fit">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 md:flex-initial flex items-center justify-center px-5 py-3 rounded-xl text-xs md:text-sm font-semibold transition-all min-h-[48px] whitespace-nowrap ${activeTab === 'attendance'
            ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-zinc-700'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-zinc-800/20'
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
            ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-zinc-700'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-zinc-800/20'
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
              ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-zinc-700'
              : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-zinc-800/20'
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
            ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 shadow-sm border border-slate-200/50 dark:border-zinc-700'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100/30 dark:hover:bg-zinc-800/20'
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
          <div className="animate-fade-in">
            <ClaimSystemView mode="admin" profile={profile} />
          </div>
        )}
      </div>
    </div>
  );
}
