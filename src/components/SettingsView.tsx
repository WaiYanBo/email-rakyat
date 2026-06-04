import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sanitizeInput, isValidName, isStrongPassword } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import AccessControlView from './AccessControlView';

export default function SettingsView() {
  const [profile, setProfile] = useState<any>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'access'>('profile');
  
  // Profile Form State
  const [fullName, setFullName] = useState('');
  
  // Password Form State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Status/Alert State
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const { lang, setLang } = usePortalLanguage();

  // Fetch Profile & Session
  const loadUserSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }
      setSessionUser(session.user);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`full_name, department, salary, status, role_id, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();
      
      if (profileError) {
        console.error('Error fetching profile:', profileError);
      }

      let roleName = 'No Role';
      if (profileData) {
        setFullName(profileData.full_name || '');
        
        // Handle roles relationship
        if (profileData.roles) {
          if (Array.isArray(profileData.roles)) {
            roleName = profileData.roles[0]?.role_name || 'No Role';
          } else {
            roleName = profileData.roles?.role_name || 'No Role';
          }
        } else if (profileData.role_id) {
          const { data: roleData } = await supabase.from('roles').select('role_name').eq('id', profileData.role_id).single();
          if (roleData) roleName = roleData.role_name;
        }
        
        setProfile({
          ...profileData,
          role_name: roleName
        });
      }
      setLoading(false);
    } catch (err) {
      console.error('Settings load error:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserSettings();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);

    const cleanName = sanitizeInput(fullName.trim());
    if (!cleanName) {
      setProfileMessage({ type: 'error', text: 'Name cannot be empty or contain invalid characters.' });
      setIsSavingProfile(false);
      return;
    }
    if (!isValidName(cleanName)) {
      setProfileMessage({ type: 'error', text: 'Name contains invalid characters. Only letters, spaces, hyphens, and apostrophes are allowed.' });
      setIsSavingProfile(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: cleanName })
        .eq('id', sessionUser.id);

      if (error) throw error;

      setProfileMessage({ type: 'success', text: 'Profile updated successfully! Refreshing...' });
      
      // Reload page to propagate profile changes to sidebar immediately
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!oldPassword || oldPassword.length < 1) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    const strength = isStrongPassword(newPassword);
    if (!strength.valid) {
      setPasswordMessage({ type: 'error', text: strength.message });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (oldPassword === newPassword) {
      setPasswordMessage({ type: 'error', text: 'New password must be different from your current password.' });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: sessionUser.email!,
        password: oldPassword,
      });

      if (verifyError) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
        setIsUpdatingPassword(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;

      setPasswordMessage({ type: 'success', text: 'Password updated successfully! Please use your new password on next login.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (_err) {
      setPasswordMessage({ type: 'error', text: 'Failed to update password. Please try again.' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('settings', 'loadingSettings', lang)}
        </div>
      </div>
    );
  }


  const roleName = profile?.role_name || profile?.roles?.role_name || profile?.role || 'Unknown';
  const isITAdmin = roleName === 'IT Admin';

  return (
    <div className="space-y-6">
      {isITAdmin && (
        <div className="flex bg-slate-100/50 dark:bg-zinc-900/40 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 w-full sm:w-fit mx-auto mt-4 md:mt-0">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
              activeTab === 'profile' 
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {t('settings', 'editProfile', lang)}
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
              activeTab === 'access' 
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Access Control (Admin)
          </button>
        </div>
      )}

      {activeTab === 'access' && isITAdmin ? (
        <AccessControlView />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-page-transition pt-4 md:pt-0">

      
      {/* LEFT COLUMN: Profile Overview Card */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Header Graphic */}
          <div className="h-32 bg-gradient-to-r from-indigo-900 to-indigo-950 flex items-end justify-center pb-4 relative">
            <div className="absolute top-4 right-4 bg-indigo-550/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30 text-[10px] font-semibold uppercase tracking-wider shadow-sm">
              {profile?.status || 'Active'}
            </div>
            {/* Avatar */}
            <div className="w-20 h-20 bg-slate-50 dark:bg-zinc-800 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-lg font-bold text-indigo-600 dark:text-indigo-400 shadow-md transform translate-y-8 uppercase">
              {profile?.full_name?.slice(0, 2) || 'ST'}
            </div>
          </div>
          
          {/* Summary Info */}
          <div className="pt-12 pb-8 px-6 text-center space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white truncate">
                {profile?.full_name || 'Staff Member'}
              </h2>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">{t('settings', 'userLabel', lang)} • {roleName}</p>
            </div>
            
            <div className="border-t border-slate-100 dark:border-zinc-800/80 pt-4 space-y-3 text-left text-xs font-medium">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-450 dark:text-zinc-400">Email</span>
                <span className="text-slate-800 dark:text-zinc-200 font-semibold truncate max-w-[180px]" title={sessionUser?.email}>
                  {sessionUser?.email || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-450 dark:text-zinc-400">Department</span>
                <span className="text-slate-800 dark:text-zinc-200 font-semibold">{profile?.department || '-'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-455 dark:text-zinc-400">Base Salary</span>
                <span className="text-slate-800 dark:text-zinc-200 font-mono font-semibold">
                  {profile?.salary ? `RM ${parseFloat(profile.salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'RM 0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notice Box */}
        <div className="p-5 rounded-2xl bg-indigo-50/15 dark:bg-indigo-950/5 border border-indigo-100/50 dark:border-indigo-950/20 shadow-sm">
          <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            Employee Notice
          </h4>
          <p className="text-xs font-medium text-slate-650 dark:text-zinc-400 leading-relaxed">
            {lang === 'bm'
              ? <>Maklumat sensitif seperti jabatan, jawatan, gaji, dan status pekerjaan hanya boleh diubah oleh jabatan Sumber Manusia atau Pengurusan Eksekutif. Sila hubungi HR jika terdapat maklumat yang tidak tepat.</>
              : <>Sensitive information such as department, designation role, salary, and employment status can only be modified by the Human Resources or Executive management department. Please contact HR if any details are incorrect.</>
            }
          </p>
        </div>

        {/* Language Preference Card */}
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-205 dark:border-zinc-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            {lang === 'bm' ? 'Pilihan Bahasa' : 'Language Preference'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            {lang === 'bm' ? 'Pilih bahasa paparan kegemaran anda untuk Portal Kakitangan.' : 'Select your preferred display language for the Staff Portal.'}
          </p>
          <div className="flex items-center rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 p-0.5">
            <button
              onClick={() => setLang('en')}
              type="button"
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wider transition-all rounded-lg min-h-[44px] ${
                lang === 'en'
                  ? 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLang('bm')}
              type="button"
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wider transition-all rounded-lg min-h-[44px] ${
                lang === 'bm'
                  ? 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              BM
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Edit Profile & Password Change */}
      <div className="lg:col-span-2 space-y-6 md:space-y-8">
        
        {/* Card 1: Personal Details */}
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-indigo-700 dark:border-indigo-800 bg-indigo-600 dark:bg-indigo-900">
            <h3 className="text-base font-bold text-white tracking-tight">{t('settings', 'editProfile', lang)}</h3>
            <p className="text-xs text-indigo-100 mt-1 font-medium">{t('settings', 'editProfileSub', lang)}</p>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="p-6 space-y-4 bg-white dark:bg-zinc-950">
            {profileMessage && (
              <div className={`p-4 rounded-xl border text-xs font-semibold ${
                profileMessage.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-955/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-350' 
                  : 'bg-rose-50 dark:bg-rose-955/20 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-350'
              }`}>
                {profileMessage.text}
              </div>
            )}
            
            <div className="space-y-1">
              <label htmlFor="settings-full-name" className="block text-xs font-semibold text-slate-450 dark:text-zinc-400 uppercase tracking-wider">{t('settings', 'fullName', lang)}</label>
              <input
                id="settings-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isSavingProfile}
                maxLength={100}
                autoComplete="name"
                aria-label="Full name"
                className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50 min-h-[48px]"
                placeholder={t('settings', 'enterFullName', lang)}
              />
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={isSavingProfile}
                className="px-6 py-3 rounded-xl text-xs md:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 border border-indigo-600 disabled:opacity-50 transition-all shadow-sm min-h-[48px]"
              >
                {isSavingProfile ? t('settings', 'saving', lang) : t('settings', 'updateProfile', lang)}
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Account Security */}
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-indigo-700 dark:border-indigo-800 bg-indigo-600 dark:bg-indigo-900">
            <h3 className="text-base font-bold text-white tracking-tight">{t('settings', 'accountSecurity', lang)}</h3>
            <p className="text-xs text-indigo-100 mt-1 font-medium">{t('settings', 'accountSecuritySub', lang)}</p>
          </div>
          
          <form onSubmit={handleUpdatePassword} className="p-6 space-y-4 bg-white dark:bg-zinc-950">
            {passwordMessage && (
              <div className={`p-4 rounded-xl border text-xs font-semibold ${
                passwordMessage.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-955/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-850 dark:text-emerald-350' 
                  : 'bg-rose-50 dark:bg-rose-955/20 border-rose-100 dark:border-rose-900/30 text-rose-850 dark:text-rose-350'
              }`}>
                {passwordMessage.text}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="settings-old-pw" className="block text-xs font-semibold text-slate-455 dark:text-zinc-400 uppercase tracking-wider">{t('settings', 'currentPassword', lang)}</label>
                <input
                  id="settings-old-pw"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  disabled={isUpdatingPassword}
                  maxLength={128}
                  autoComplete="current-password"
                  aria-label="Current password"
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50 min-h-[48px]"
                  placeholder={t('settings', 'enterCurrentPw', lang)}
                />
              </div>

              {/* Password policy hint */}
              <div className="p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 rounded-xl text-xs text-slate-500 dark:text-zinc-400 font-medium leading-relaxed">
                <span className="font-semibold text-slate-700 dark:text-zinc-200 uppercase tracking-wide block mb-0.5">{t('settings', 'pwRequirements', lang)}</span>
                {t('settings', 'pwRequirementsDetail', lang)}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="settings-new-pw" className="block text-xs font-semibold text-slate-455 dark:text-zinc-400 uppercase tracking-wider">{t('settings', 'newPassword', lang)}</label>
                  <input
                    id="settings-new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={isUpdatingPassword}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-label="New password"
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50 min-h-[48px]"
                    placeholder={t('settings', 'min8Chars', lang)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="settings-confirm-pw" className="block text-xs font-semibold text-slate-455 dark:text-zinc-400 uppercase tracking-wider">{t('settings', 'confirmPassword', lang)}</label>
                  <input
                    id="settings-confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isUpdatingPassword}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-label="Confirm new password"
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50 min-h-[48px]"
                    placeholder={t('settings', 'confirmNewPw', lang)}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={isUpdatingPassword}
                className="px-6 py-3 rounded-xl text-xs md:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 border border-indigo-600 disabled:opacity-50 transition-all shadow-sm min-h-[48px]"
              >
                {isUpdatingPassword ? t('settings', 'updating', lang) : t('settings', 'changePassword', lang)}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
      )}
    </div>
  );
}
