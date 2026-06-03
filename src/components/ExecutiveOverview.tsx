import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sanitizeInput, sanitizeLongText } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { translateText } from '../utils/translator';
import { createPortal } from 'react-dom';

export default function ExecutiveOverview() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const { lang } = usePortalLanguage();
  
  // --- REAL-TIME ANNOUNCEMENT STATE (Synced from Supabase) ---
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isPostingNotice, setIsPostingNotice] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilterType, setHistoryFilterType] = useState<string>('All');
  const [historyFilterDate, setHistoryFilterDate] = useState<string>('');

  // --- ANNOUNCEMENT TRANSLATION STATE ---
  const [translatedAnnouncements, setTranslatedAnnouncements] = useState<Record<string, { title: string; content: string; lang: 'en' | 'bm' }>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTranslate = async (id: string, currentTitle: string, currentContent: string) => {
    if (translatedAnnouncements[id]) {
      const updated = { ...translatedAnnouncements };
      delete updated[id];
      setTranslatedAnnouncements(updated);
      return;
    }

    const containsMalay = /\b(dan|yang|untuk|dengan|adalah|ialah|syarikat|kakitangan|notis|kepada|kami|saya|akan|telah|oleh|keputusan|sumber|manusia|hari|ini)\b/i.test(currentContent + " " + currentTitle);
    const targetLang: 'en' | 'bm' = containsMalay ? 'en' : 'bm';

    setTranslatingIds(prev => ({ ...prev, [id]: true }));
    try {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(currentTitle, targetLang),
        translateText(currentContent, targetLang)
      ]);
      setTranslatedAnnouncements(prev => ({
        ...prev,
        [id]: { title: translatedTitle, content: translatedContent, lang: targetLang }
      }));
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslatingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  // FETCH ANNOUNCEMENTS FROM DATABASE
  const fetchAnnouncements = async () => {
    try {
      const { data: announcementsData, error } = await supabase
        .from('announcements')
        .select('*')
        .lte('scheduled_at', new Date().toISOString()) // Only show announcements scheduled for today or earlier
        .order('scheduled_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching announcements:', error);
        return;
      }
      
      if (announcementsData) {
        const formatted = announcementsData.map((a: any) => ({
          id: a.id,
          type: a.type || 'Info',
          title: a.title,
          content: a.content,
          author: a.author_name,
          date: new Date(a.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          scheduled_at: a.scheduled_at,
          created_at: a.created_at
        }));
        setAnnouncements(formatted);
        console.log('Announcements fetched:', formatted.length);
      }
    } catch (err) {
      console.error('Exception fetching announcements:', err);
    }
  };

  useEffect(() => {
    async function loadDashboard() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('No session found, redirecting to login');
          return window.location.href = '/portal/login';
        }

        console.log('Session user:', session.user.email);

        // Query profile with explicit relationship
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(`full_name, role_id, roles(role_name)`)
          .eq('id', session.user.id)
          .single();
        
        if (profileError) {
          console.error('Profile fetch error:', profileError);
        }

        let roleName = 'No Role';
        if (profileData) {
          console.log('Profile data:', profileData);
          console.log('Roles field:', profileData.roles);
          console.log('Role ID:', profileData.role_id);
          
          // Check if roles relationship loaded (might be object or array)
          if (profileData.roles) {
            if (Array.isArray(profileData.roles)) {
              roleName = profileData.roles[0]?.role_name || 'No Role';
              console.log('Loaded role from array:', roleName);
            } else {
              roleName = profileData.roles?.role_name || 'No Role';
              console.log('Loaded role from object:', roleName);
            }
          } else if (profileData.role_id) {
            // Fallback: fetch role directly if relationship didn't load
            console.log('Relationship didn\'t load, querying roles table with role_id:', profileData.role_id);
            const { data: roleData, error: roleError } = await supabase.from('roles').select('role_name').eq('id', profileData.role_id).single();
            if (roleError) {
              console.error('Error fetching role:', roleError);
            } else {
              roleName = roleData?.role_name || 'No Role';
              console.log('Loaded role from fallback query:', roleName);
            }
          } else {
            console.warn('No roles relationship and no role_id found - user has no role assigned!');
          }
          setProfile({ name: profileData.full_name, role: roleName });
          console.log('Set profile:', { name: profileData.full_name, role: roleName, roleId: profileData.role_id });
          console.log('✅ Final roleName for access check:', roleName);
        }

      if (['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Department Head', 'Manager'].includes(roleName)) {
        const { data: clientsData } = await supabase.from('clients').select('*');
        if (clientsData) {
          const pCases = clientsData.filter(c => parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) > 5000).sort((a,b) => parseFloat(String(b['PENDING (RM)']).replace(/[^0-9.-]+/g, '')) - parseFloat(String(a['PENDING (RM)']).replace(/[^0-9.-]+/g, ''))).slice(0, 5);
          setHighPriorityCases(pCases);

          let totalPending = 0; let completed = 0; let dropped = 0; let pending = 0;
          clientsData.forEach(c => {
            if (String(c['CASE STATUS']).includes('COMPLETED')) completed++;
            else if (String(c['CASE STATUS']).includes('DROPPED')) dropped++;
            else pending++;
            totalPending += parseFloat(String(c['PENDING (RM)'] || '0').replace(/[^0-9.-]+/g, '')) || 0;
          });
          setStats({ totalClients: clientsData.length, completed, dropped, pending, totalPending });
        }
      }

      // 1. Initial Load of Announcements
      await fetchAnnouncements();

      setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        setLoading(false);
      }
    }
    loadDashboard();

    // 2. Setup Real-time Listener for Announcements
    console.log('Setting up real-time listener for announcements...');
    const subscription = supabase
      .channel('public:announcements')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'announcements'
        },
        async (payload) => {
          console.log('Announcement change detected:', payload.eventType, payload);
          // Re-fetch all announcements when changes occur
          await fetchAnnouncements();
        }
      )
      .subscribe((status) => {
        console.log('Announcements subscription status:', status);
      });

    // Cleanup: Remove listener on component unmount
    return () => {
      console.log('Unsubscribing from announcements listener');
      subscription.unsubscribe();
    };
  }, []);

  const handlePostNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPostingNotice(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const announcementDate = formData.get('scheduled_date');
    
    // ── Sanitize all user input before storing ───────────────────────────
    const rawTitle = (formData.get('title') as string) || '';
    const rawContent = (formData.get('content') as string) || '';
    const rawType = (formData.get('type') as string) || 'Info';

    const cleanTitle = sanitizeInput(rawTitle, 200);
    const cleanContent = sanitizeLongText(rawContent);
    // Whitelist announcement types — reject anything not in list
    const allowedTypes = ['Info', 'Memo', 'Urgent'];
    const cleanType = allowedTypes.includes(rawType) ? rawType : 'Info';

    if (!cleanTitle) {
      alert('Announcement title is required.');
      setIsPostingNotice(false);
      return;
    }
    if (!cleanContent) {
      alert('Announcement content is required.');
      setIsPostingNotice(false);
      return;
    }
    
    // Combine date with current time for scheduling
    const scheduledDateTime = announcementDate 
      ? new Date(`${announcementDate}T00:00:00`).toISOString()
      : new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert([
          {
            title: cleanTitle,
            content: cleanContent,
            type: cleanType,
            author_name: sanitizeInput(profile?.name || 'Unknown', 100),
            scheduled_at: scheduledDateTime,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) {
        alert('Failed to post announcement. Please try again.');
      } else {
        setIsNoticeModalOpen(false);
        (e.target as HTMLFormElement).reset();
        // Real-time listener will automatically update the UI
      }
    } catch (_err) {
      alert('Error posting announcement. Please try again.');
    } finally {
      setIsPostingNotice(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-teal-600 font-bold animate-pulse text-xl uppercase">{t('common', 'loadingDashboard', lang)}</div></div>;

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  // Separate announcements into today and past
  const getTodayAnnouncements = () => {
    const todayStr = getTodayDateString();
    return announcements.filter(a => a.scheduled_at.split('T')[0] === todayStr);
  };

  const getPastAnnouncements = () => {
    const todayStr = getTodayDateString();
    return announcements.filter(a => a.scheduled_at.split('T')[0] < todayStr);
  };

  // Get announcements to display on main page
  const getDisplayedAnnouncements = () => {
    const todayAnnouncements = getTodayAnnouncements();
    const pastAnnouncements = getPastAnnouncements();
    
    // Always show all today's announcements
    let displayed = [...todayAnnouncements];
    
    // Fill up to 3 items minimum with latest past announcements
    const neededCount = 3 - displayed.length;
    if (neededCount > 0) {
      displayed = [...displayed, ...pastAnnouncements.slice(0, neededCount)];
    }
    
    return displayed;
  };

  // Get past announcements for history with optional filters
  const getHistoryAnnouncements = () => {
    let filtered = getPastAnnouncements();
    
    if (historyFilterType !== 'All') {
      filtered = filtered.filter(a => a.type === historyFilterType);
    }
    
    if (historyFilterDate) {
      filtered = filtered.filter(a => a.scheduled_at.split('T')[0] === historyFilterDate);
    }
    
    return filtered;
  };

  const isIT = profile?.role?.toLowerCase() === 'it admin';
  const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Department Head', 'Manager']
    .some(role => profile?.role?.toLowerCase() === role.toLowerCase());
  const todayCount = getTodayAnnouncements().length;
  const pastCount = getPastAnnouncements().length;
  const displayedAnnouncements = getDisplayedAnnouncements();

  // Debug logging for access control
  console.log('🔍 Announcement Access Debug:', {
    userRole: profile?.role,
    isIT,
    hasFullAccess,
    canPostAnnouncements: hasFullAccess,
    allowedRoles: ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin', 'Department Head', 'Manager']
  });

  return (
    <div className="space-y-10 md:space-y-12 animate-page-transition pt-12 md:pt-0 relative mb-8 md:mb-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-teal-900 dark:text-white">{t('overview', 'pageTitle', lang)} <span className="text-teal-600 dark:text-yellow-500">{t('overview', 'pageHighlight', lang)}</span></h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">{t('overview', 'welcomeBack', lang)} <span className="font-bold text-teal-800 dark:text-gray-200">{profile?.name}</span> ({profile?.role})</p>
      </div>

      {/* ANNOUNCEMENTS SECTION */}
      {!showHistory ? (
        <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg overflow-hidden mt-12 mb-12">
          <div className="p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex justify-between items-center">
            <div>
              <h2 className="text-lg md:text-xl font-black uppercase tracking-widest text-teal-900 dark:text-white flex items-center gap-2">📢 {t('overview', 'announcements', lang)}</h2>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-0.5">
                <p>🔴 {t('overview', 'today', lang)}: <span className="font-bold text-teal-600 dark:text-teal-400">{todayCount}</span> | 📜 {t('overview', 'archive', lang)}: <span className="font-bold text-orange-600 dark:text-orange-400">{pastCount}</span></p>
              </div>
            </div>
            <div className="flex gap-2 flex-col sm:flex-row">
              {pastCount > 0 && (
                <button onClick={() => setShowHistory(true)} className="text-xs md:text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-lg shadow-md hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition-all">
                  📜 {t('overview', 'viewHistory', lang)}
                </button>
              )}
              {hasFullAccess && (
                <button onClick={() => setIsNoticeModalOpen(true)} className="text-xs md:text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-teal-600 to-teal-700 text-white px-4 py-3 rounded-lg shadow-md hover:shadow-lg hover:from-teal-700 hover:to-teal-800 transition-all">
                  {t('overview', 'postNotice', lang)}
                </button>
              )}
            </div>
          </div>
          <div className="p-8 flex flex-col gap-6 max-h-[600px] overflow-y-auto scrollbar-thin">
            {displayedAnnouncements.length === 0 ? (
              <div className="text-center py-12 w-full">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview', 'noAnnouncements', lang)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('overview', 'checkBack', lang)}</p>
              </div>
            ) : (
              displayedAnnouncements.map((a) => {
                const isTranslated = !!translatedAnnouncements[a.id];
                const displayTitle = isTranslated ? translatedAnnouncements[a.id].title : a.title;
                const displayContent = isTranslated ? translatedAnnouncements[a.id].content : a.content;

                return (
                  <div key={a.id} className={`p-5 rounded-2xl border transition-all flex flex-col justify-between h-48 ${
                    getTodayAnnouncements().some(t => t.id === a.id)
                      ? 'border-teal-200 dark:border-teal-800/50 bg-gradient-to-br from-teal-50/40 to-teal-50/20 dark:from-teal-900/20 dark:to-teal-800/10'
                      : 'border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-800/30 dark:to-gray-900/30 opacity-95 hover:opacity-100'
                  } hover:shadow-lg`}>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest whitespace-nowrap ${
                          a.type === 'Urgent' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' 
                            : a.type === 'Memo' 
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' 
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}>
                          {a.type === 'Urgent' && '🔴 '}
                          {a.type === 'Memo' && '📝 '}
                          {a.type === 'Info' && 'ℹ️ '}
                          {a.type}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{a.date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1" title={displayTitle}>{displayTitle}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis whitespace-pre-wrap">{displayContent}</p>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0" title={a.author}>
                        <span className="flex-shrink-0">✏️</span>
                        <span className="font-semibold truncate max-w-[100px] md:max-w-[140px]">{a.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleTranslate(a.id, a.title, a.content)}
                          disabled={translatingIds[a.id]}
                          type="button"
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-teal-50 dark:bg-gray-800/30 hover:bg-teal-100 dark:hover:bg-gray-800/60 text-teal-600 dark:text-yellow-500 border border-teal-100 dark:border-gray-700 transition-all text-xs flex-shrink-0"
                          title="Translate / Terjemah"
                        >
                          {translatingIds[a.id] ? '...' : '🌐'}
                        </button>
                        <button
                          onClick={() => setSelectedAnnouncement(a)}
                          type="button"
                          className="h-8 px-4 flex items-center justify-center rounded-lg bg-teal-600 dark:bg-yellow-500 text-white dark:text-black hover:bg-teal-700 dark:hover:bg-yellow-600 text-[10px] font-black uppercase tracking-wider transition-all shadow-sm hover:shadow flex-shrink-0"
                        >
                          {lang === 'bm' ? 'Baca' : 'Read'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* HISTORY VIEW */
        <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-lg overflow-hidden mt-12 mb-12">
          <div className="p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/20 flex justify-between items-center">
            <div>
              <h2 className="text-lg md:text-xl font-black uppercase tracking-widest text-orange-900 dark:text-white flex items-center gap-2">📜 {t('overview', 'announcementHistory', lang)}</h2>
              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">{t('overview', 'historySubtitle', lang)}</p>
            </div>
            <button onClick={() => setShowHistory(false)} className="text-xs md:text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-teal-600 to-teal-700 text-white px-4 py-3 rounded-lg shadow-md hover:shadow-lg hover:from-teal-700 hover:to-teal-800 transition-all">{t('overview', 'backToToday', lang)}</button>
          </div>
          
          {/* Filter Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Type Filter */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 block">{t('overview', 'filterByType', lang)}</label>
                <select 
                  value={historyFilterType}
                  onChange={(e) => setHistoryFilterType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                >
                  <option value="All">{t('overview', 'allTypes', lang)}</option>
                  <option value="Info">ℹ️ {t('overview', 'infoBadge', lang)}</option>
                  <option value="Memo">📝 {t('overview', 'memoBadge', lang)}</option>
                  <option value="Urgent">🔴 {t('overview', 'urgentBadge', lang)}</option>
                </select>
              </div>
              
              {/* Date Filter */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 block">{t('overview', 'filterByDate', lang)}</label>
                <input 
                  type="date" 
                  value={historyFilterDate}
                  onChange={(e) => setHistoryFilterDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
              </div>
            </div>
            {(historyFilterType !== 'All' || historyFilterDate) && (
              <button 
                onClick={() => {
                  setHistoryFilterType('All');
                  setHistoryFilterDate('');
                }}
                className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
              >
                {t('overview', 'clearFilters', lang)}
              </button>
            )}
          </div>
          
          {/* History Content */}
          <div className="p-8 flex flex-col gap-6 max-h-[600px] overflow-y-auto scrollbar-thin">
            {getHistoryAnnouncements().length === 0 ? (
              <div className="text-center py-12 w-full">
                <div className="text-4xl mb-3">🗂️</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview', 'noFound', lang)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('overview', 'adjustFilters', lang)}</p>
              </div>
            ) : (
              getHistoryAnnouncements().map((a) => {
                const isTranslated = !!translatedAnnouncements[a.id];
                const displayTitle = isTranslated ? translatedAnnouncements[a.id].title : a.title;
                const displayContent = isTranslated ? translatedAnnouncements[a.id].content : a.content;

                return (
                  <div key={a.id} className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-800/30 dark:to-gray-900/30 hover:shadow-lg transition-all flex flex-col justify-between h-48">
                    <div className="space-y-2">
                      <div className="flex flex-row justify-between items-start gap-2">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest whitespace-nowrap ${
                          a.type === 'Urgent' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' 
                            : a.type === 'Memo' 
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' 
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}>
                          {a.type === 'Urgent' && '🔴 '}
                          {a.type === 'Memo' && '📝 '}
                          {a.type === 'Info' && 'ℹ️ '}
                          {a.type}
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{a.date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1" title={displayTitle}>{displayTitle}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis whitespace-pre-wrap">{displayContent}</p>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0" title={a.author}>
                        <span className="flex-shrink-0">✏️</span>
                        <span className="font-semibold truncate max-w-[100px] md:max-w-[140px]">{a.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleTranslate(a.id, a.title, a.content)}
                          disabled={translatingIds[a.id]}
                          type="button"
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-teal-50 dark:bg-gray-800/30 hover:bg-teal-100 dark:hover:bg-gray-800/60 text-teal-600 dark:text-yellow-500 border border-teal-100 dark:border-gray-700 transition-all text-xs flex-shrink-0"
                          title="Translate / Terjemah"
                        >
                          {translatingIds[a.id] ? '...' : '🌐'}
                        </button>
                        <button
                          onClick={() => setSelectedAnnouncement(a)}
                          type="button"
                          className="h-8 px-4 flex items-center justify-center rounded-lg bg-teal-600 dark:bg-yellow-500 text-white dark:text-black hover:bg-teal-700 dark:hover:bg-yellow-600 text-[10px] font-black uppercase tracking-wider transition-all shadow-sm hover:shadow flex-shrink-0"
                        >
                          {lang === 'bm' ? 'Baca' : 'Read'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* POST NOTICE MODAL */}
      {mounted && isNoticeModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-gray-900 w-[95%] max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
            {/* Modal Header */}
            <div className="p-6 md:p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-teal-50 to-teal-100/50 dark:from-teal-900/20 dark:to-teal-800/20 flex justify-between items-center">
              <div>
                <h2 className="text-sm md:text-lg font-black uppercase tracking-widest text-teal-900 dark:text-white">{t('overview', 'postNewAnnouncement', lang)}</h2>
                <p className="text-[10px] md:text-xs text-teal-700 dark:text-teal-300 mt-1">{t('overview', 'postSubtitle', lang)}</p>
              </div>
              <button onClick={() => setIsNoticeModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handlePostNotice} className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {/* Title Input */}
              <div>
                <label className="block text-xs md:text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">{t('overview', 'announcementTitle', lang)}</label>
                <input 
                  type="text" 
                  name="title" 
                  required 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  placeholder="e.g., Q3 Quarterly Meeting" 
                  disabled={isPostingNotice} 
                />
              </div>

              {/* Urgency Level */}
              <div>
                <label className="block text-xs md:text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">{t('overview', 'urgencyLevel', lang)}</label>
                <select 
                  name="type" 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm font-bold focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  disabled={isPostingNotice}
                >
                  <option value="Info">ℹ️ Info (Standard)</option>
                  <option value="Memo">📝 Memo (Important)</option>
                  <option value="Urgent">🔴 Urgent (Critical)</option>
                </select>
              </div>

              {/* Date Picker */}
              <div>
                <label className="block text-xs md:text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">{t('overview', 'announcementDate', lang)}</label>
                <input 
                  type="date" 
                  name="scheduled_date" 
                  defaultValue={new Date().toISOString().split('T')[0]} 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all" 
                  disabled={isPostingNotice} 
                />
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-[10px] md:text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <span className="font-bold block mb-1">How it works:</span>
                     <span className="text-blue-600 dark:text-blue-400">Past dates</span> = Historical records<br/>
                     <span className="text-blue-600 dark:text-blue-400">Today</span> = Publish immediately<br/>
                     <span className="text-blue-600 dark:text-blue-400">Future dates</span> = Schedule for later
                  </p>
                </div>
              </div>

              {/* Content Area */}
              <div>
                <label className="block text-xs md:text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-2">{t('overview', 'messageContent', lang)}</label>
                <textarea 
                  name="content" 
                  required 
                  rows={5} 
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all resize-none" 
                  placeholder="Write your announcement here... Be clear and concise."
                  disabled={isPostingNotice}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-800">
                <button 
                  type="button"
                  onClick={() => setIsNoticeModalOpen(false)}
                  className="px-5 py-2.5 md:px-6 md:py-3 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  disabled={isPostingNotice}
                >
                  {t('overview', 'cancel', lang)}
                </button>
                <button 
                  type="submit" 
                  disabled={isPostingNotice} 
                  className="px-6 py-2.5 md:px-8 md:py-3 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-teal-600 to-teal-700 text-white hover:from-teal-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                >
                  {isPostingNotice ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      {t('overview', 'posting', lang)}
                    </span>
                  ) : (
                    t('overview', 'postToDashboard', lang)
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

     {/* DETAILED ANNOUNCEMENT VIEW MODAL */}
      {mounted && selectedAnnouncement && createPortal(
        (() => {
          const isTranslated = !!translatedAnnouncements[selectedAnnouncement.id];
          const modalTitle = isTranslated ? translatedAnnouncements[selectedAnnouncement.id].title : selectedAnnouncement.title;
          const modalContent = isTranslated ? translatedAnnouncements[selectedAnnouncement.id].content : selectedAnnouncement.content;
          
          return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
              <div className="bg-white dark:bg-gray-900 w-[95%] max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800 animate-fade-in">
                {/* Modal Header */}
                <div className="p-6 md:p-8 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-teal-50 to-teal-100/50 dark:from-teal-900/20 dark:to-teal-800/20 flex justify-between items-start gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] md:text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                        selectedAnnouncement.type === 'Urgent' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' 
                          : selectedAnnouncement.type === 'Memo' 
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' 
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      }`}>
                        {selectedAnnouncement.type}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{selectedAnnouncement.date}</span>
                    </div>
                    <h2 className="text-sm md:text-lg font-black text-gray-900 dark:text-white leading-snug">{modalTitle}</h2>
                  </div>
                  <button onClick={() => setSelectedAnnouncement(null)} className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[50vh] text-xs md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {modalContent}
                </div>

                {/* Modal Footer */}
                <div className="p-5 md:p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex justify-between items-center">
                  <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">✏️ Posted by <span className="font-semibold">{selectedAnnouncement.author}</span></span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTranslate(selectedAnnouncement.id, selectedAnnouncement.title, selectedAnnouncement.content)}
                      disabled={translatingIds[selectedAnnouncement.id]}
                      type="button"
                      className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-yellow-500 hover:text-teal-800 dark:hover:text-yellow-400 transition-colors flex items-center gap-1 bg-teal-100/50 dark:bg-gray-800 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-teal-200 dark:border-gray-700"
                    >
                      <span>🌐</span>
                      {translatingIds[selectedAnnouncement.id] ? '...' : isTranslated ? (lang === 'bm' ? 'Tunjuk Asal' : 'Show Original') : (lang === 'bm' ? 'Terjemah' : 'Translate')}
                    </button>
                    <button 
                      onClick={() => setSelectedAnnouncement(null)}
                      type="button"
                      className="px-4 py-1.5 md:px-5 md:py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all"
                    >
                      {lang === 'bm' ? 'Tutup' : 'Close'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* EXECUTIVE SNAPSHOT (Bottom Section) */}
      {hasFullAccess && !isIT && stats && (
         <div className="space-y-8 pt-8 border-t border-gray-200 dark:border-gray-800">
           <h2 className="text-lg font-black uppercase tracking-widest">{t('overview', 'executiveSnapshot', lang)}</h2>
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10"><p className="text-[10px] font-bold text-blue-600 uppercase">{t('overview', 'totalClients', lang)}</p><p className="text-3xl font-black text-blue-700 mt-3">{stats.totalClients}</p></div>
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10"><p className="text-[10px] font-bold text-emerald-600 uppercase">{t('overview', 'completed', lang)}</p><p className="text-3xl font-black text-emerald-700 mt-3">{stats.completed}</p></div>
            <div className="p-6 rounded-2xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-500/10"><p className="text-[10px] font-bold text-yellow-600 uppercase">{t('overview', 'pending', lang)}</p><p className="text-3xl font-black text-yellow-700 mt-3">{stats.pending}</p></div>
            <div className="p-6 rounded-2xl bg-red-50 border border-red-200 dark:bg-red-500/10"><p className="text-[10px] font-bold text-red-600 uppercase">{t('overview', 'dropped', lang)}</p><p className="text-3xl font-black text-red-700 mt-3">{stats.dropped}</p></div>
          </div>
         </div>
      )}
    </div>
  );
}