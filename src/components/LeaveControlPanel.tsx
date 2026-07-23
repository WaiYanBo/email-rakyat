import { useState, useEffect } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import LeaveSystemView from './LeaveSystemView';

export default function LeaveControlPanel() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { lang } = usePortalLanguage();

  useEffect(() => {
    async function loadProfile() {
      const session = await getCurrentSession();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('common', 'loading', lang)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-page-transition pt-12 md:pt-0">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
            {t('sidebar', 'navLeave', lang)}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 font-medium">
            Manage your personal leave balance and requests.
          </p>
        </div>
      </div>

      <div className="transition-all duration-300">
        <div className="animate-fade-in">
          <LeaveSystemView profile={profile} />
        </div>
      </div>
    </div>
  );
}
