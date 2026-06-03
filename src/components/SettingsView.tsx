import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sanitizeInput, isValidName, isStrongPassword } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

export default function SettingsView() {
  const [profile, setProfile] = useState<any>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  
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
      // Avoid leaking raw error details to the UI
      setProfileMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    // ── Input length guards ──────────────────────────────────────────────
    if (!oldPassword || oldPassword.length < 1) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    // ── Enforce strong password policy ───────────────────────────────────
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
      // 1. Verify current (old) password by attempting re-authentication
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: sessionUser.email!,
        password: oldPassword,
      });

      if (verifyError) {
        // Generic message — don't reveal whether account exists
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' });
        setIsUpdatingPassword(false);
        return;
      }

      // 2. Update to new password
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
        <div className="text-teal-600 dark:text-yellow-500 font-bold animate-pulse text-lg md:text-xl tracking-widest uppercase">
          {t('settings', 'loadingSettings', lang)}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-page-transition pt-12 md:pt-0">
      
      {/* LEFT COLUMN: Profile Overview Card */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white dark:bg-gray-900/50 border border-teal-100 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm">
          {/* Header Graphic */}
          <div className="h-32 bg-gradient-to-r from-teal-600 via-teal-500 to-yellow-500 dark:from-teal-900 dark:via-teal-800 dark:to-yellow-600/50 flex items-end justify-center pb-4 relative">
            <div className="absolute top-4 right-4 bg-teal-100/20 dark:bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                {profile?.status || 'Active'}
              </span>
            </div>
            {/* Avatar Placeholder */}
            <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full border-4 border-white dark:border-gray-950 flex items-center justify-center text-3xl shadow-lg transform translate-y-8">
              👤
            </div>
          </div>
          
          {/* Summary Info */}
          <div className="pt-12 pb-8 px-6 text-center space-y-4">
            <div>
              <h2 className="text-xl font-black text-teal-900 dark:text-white truncate">
                {profile?.full_name || 'Staff Member'}
              </h2>
              <p className="text-[10px] font-bold text-teal-500 dark:text-gray-500 uppercase tracking-widest">{t('settings', 'userLabel', lang)}</p>
            </div>
            
            <div className="border-t border-gray-100 dark:border-gray-800/80 pt-4 space-y-3 text-left text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">Email</span>
                <span className="text-teal-950 dark:text-white font-bold truncate max-w-[180px]" title={sessionUser?.email}>
                  {sessionUser?.email || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">Department</span>
                <span className="text-teal-950 dark:text-white font-bold">{profile?.department || '-'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">Base Salary</span>
                <span className="text-teal-950 dark:text-white font-mono font-bold">
                  {profile?.salary ? `RM ${parseFloat(profile.salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'RM 0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Informative Notice Box */}
        <div className="p-5 rounded-2xl bg-teal-50/50 dark:bg-gray-900/30 border border-teal-100/80 dark:border-gray-800/60 backdrop-blur-sm">
          <h4 className="text-xs font-black text-teal-800 dark:text-yellow-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span>ℹ️</span> Employee Notice
          </h4>
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 leading-relaxed">
            {lang === 'bm'
              ? <>Maklumat sensitif seperti jabatan, jawatan, gaji, dan status pekerjaan hanya boleh diubah oleh jabatan <strong>Sumber Manusia</strong> atau <strong>Pengurusan Eksekutif</strong>. Sila hubungi HR jika terdapat maklumat yang tidak tepat.</>
              : <>Sensitive information such as department, designation role, salary, and employment status can only be modified by the <strong>Human Resources</strong> or <strong>Executive management</strong> department. Please contact HR if any details are incorrect.</>
            }
          </p>
        </div>

        {/* Language Preference Card */}
        <div className="bg-white dark:bg-gray-900/50 border border-teal-100 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm p-6 space-y-4">
          <h3 className="text-xs font-black text-teal-800 dark:text-yellow-500 uppercase tracking-widest flex items-center gap-1.5">
            <span>🌐</span> {lang === 'bm' ? 'Pilihan Bahasa' : 'Language Preference'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {lang === 'bm' ? 'Pilih bahasa paparan kegemaran anda untuk Portal Kakitangan.' : 'Select your preferred display language for the Staff Portal.'}
          </p>
          <div className="flex items-center rounded-xl overflow-hidden border border-teal-200 dark:border-gray-700 bg-teal-100 dark:bg-gray-800/50">
            <button
              onClick={() => setLang('en')}
              type="button"
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                lang === 'en'
                  ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-md'
                  : 'text-teal-700 dark:text-gray-400 hover:bg-teal-200 dark:hover:bg-gray-850'
              }`}
            >
              English (EN)
            </button>
            <button
              onClick={() => setLang('bm')}
              type="button"
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                lang === 'bm'
                  ? 'bg-teal-600 dark:bg-yellow-500 text-white dark:text-black shadow-md'
                  : 'text-teal-700 dark:text-gray-400 hover:bg-teal-200 dark:hover:bg-gray-850'
              }`}
            >
              Bahasa Malaysia (BM)
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Edit Profile & Password Change */}
      <div className="lg:col-span-2 space-y-6 md:space-y-8">
        
        {/* Card 1: Personal Details */}
        <div className="bg-white dark:bg-gray-900/50 border border-teal-100 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800/80 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
            <h3 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white">{t('settings', 'editProfile', lang)}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings', 'editProfileSub', lang)}</p>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
            {profileMessage && (
              <div className={`p-4 rounded-xl border text-xs font-semibold ${
                profileMessage.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300' 
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'
              }`}>
                {profileMessage.text}
              </div>
            )}
            
            <div className="space-y-1">
              <label htmlFor="settings-full-name" className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('settings', 'fullName', lang)}</label>
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
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-xs md:text-sm text-gray-950 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-yellow-500 transition-all disabled:opacity-50 min-h-[44px]"
                placeholder={t('settings', 'enterFullName', lang)}
              />
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 dark:bg-yellow-500 text-white dark:text-black hover:bg-teal-700 dark:hover:bg-yellow-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center gap-2 min-h-[40px]"
              >
                {isSavingProfile ? t('settings', 'saving', lang) : t('settings', 'updateProfile', lang)}
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Account Security */}
        <div className="bg-white dark:bg-gray-900/50 border border-teal-100 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800/80 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
            <h3 className="text-base font-black uppercase tracking-wider text-gray-900 dark:text-white">{t('settings', 'accountSecurity', lang)}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings', 'accountSecuritySub', lang)}</p>
          </div>
          
          <form onSubmit={handleUpdatePassword} className="p-6 space-y-4">
            {passwordMessage && (
              <div className={`p-4 rounded-xl border text-xs font-semibold ${
                passwordMessage.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300' 
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'
              }`}>
                {passwordMessage.text}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="settings-old-pw" className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('settings', 'currentPassword', lang)}</label>
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
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-xs md:text-sm text-gray-950 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-yellow-500 transition-all disabled:opacity-50 min-h-[44px]"
                  placeholder={t('settings', 'enterCurrentPw', lang)}
                />
              </div>

              {/* Password policy hint */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                <span className="font-bold block mb-1">{t('settings', 'pwRequirements', lang)}</span>
                {t('settings', 'pwRequirementsDetail', lang)}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="settings-new-pw" className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('settings', 'newPassword', lang)}</label>
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-xs md:text-sm text-gray-950 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-yellow-500 transition-all disabled:opacity-50 min-h-[44px]"
                    placeholder={t('settings', 'min8Chars', lang)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="settings-confirm-pw" className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('settings', 'confirmPassword', lang)}</label>
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-xs md:text-sm text-gray-950 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 dark:focus:border-yellow-500 transition-all disabled:opacity-50 min-h-[44px]"
                    placeholder={t('settings', 'confirmNewPw', lang)}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit" 
                disabled={isUpdatingPassword}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 dark:bg-yellow-500 text-white dark:text-black hover:bg-teal-700 dark:hover:bg-yellow-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center gap-2 min-h-[40px]"
              >
                {isUpdatingPassword ? t('settings', 'updating', lang) : t('settings', 'changePassword', lang)}
              </button>
            </div>
          </form>
        </div>

      </div>

    </div>
  );
}
