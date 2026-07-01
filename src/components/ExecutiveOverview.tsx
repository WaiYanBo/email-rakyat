import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sanitizeInput, sanitizeLongText } from '../utils/security';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { translateText } from '../utils/translator';
import { createPortal } from 'react-dom';

export default function ExecutiveOverview() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [highPriorityCases, setHighPriorityCases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [staffOnLeaveCount, setStaffOnLeaveCount] = useState<number>(0);
  const { lang } = usePortalLanguage();
  const { permissions, loading: permsLoading } = usePermissions(profile);

  // --- REAL-TIME ANNOUNCEMENT STATE (Synced from Supabase) ---
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isPostingNotice, setIsPostingNotice] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilterType, setHistoryFilterType] = useState<string>('All');
  const [historyFilterMonth, setHistoryFilterMonth] = useState<string>('All');

  const [translatedAnnouncements, setTranslatedAnnouncements] = useState<Record<string, { title: string; content: string; lang: 'en' | 'bm' }>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [editingNotice, setEditingNotice] = useState<any | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeMenuId) return;
    const closeMenu = () => setActiveMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [activeMenuId]);

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

  const fetchAnnouncements = async () => {
    try {
      const { data: announcementsData, error } = await supabase
        .from('announcements')
        .select('*')
        .lte('scheduled_at', new Date().toISOString()) // Only show announcements scheduled for today or earlier
        .order('scheduled_at', { ascending: false })
        .limit(100);

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
          .select(`id, department, full_name, role_id, roles(role_name)`)
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
          setProfile({
            id: profileData.id,
            department: profileData.department,
            name: profileData.full_name,
            role: roleName
          });
          console.log('Set profile:', { id: profileData.id, department: profileData.department, name: profileData.full_name, role: roleName, roleId: profileData.role_id });
          console.log('✅ Final roleName for access check:', roleName);
        }

        // 1. Initial Load of Announcements
        await fetchAnnouncements();

        // Fetch staff on leave today
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: leaveCount, error: leaveErr } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Approved')
          .lte('start_date', todayStr)
          .gte('end_date', todayStr);
          
        if (!leaveErr) {
          setStaffOnLeaveCount(leaveCount || 0);
        }

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
      supabase.removeChannel(subscription);
    };
  }, []);

  useEffect(() => {
    async function loadStats() {
      if (profile?.id && !permsLoading) {
        const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
        if (permissions.view_snapshot || isIT) {
          try {
            const [totalRes, completedRes, droppedRes] = await Promise.all([
              supabase.from('clients').select('*', { count: 'exact', head: true }),
              supabase.from('clients').select('*', { count: 'exact', head: true }).ilike('CASE STATUS', '%COMPLETED%'),
              supabase.from('clients').select('*', { count: 'exact', head: true }).ilike('CASE STATUS', '%DROPPED%')
            ]);

            const totalClients = totalRes.count || 0;
            const completed = completedRes.count || 0;
            const dropped = droppedRes.count || 0;
            const pending = totalClients - completed - dropped;

            setStats({
              totalClients,
              completed,
              dropped,
              pending,
              totalPending: 0
            });
            setHighPriorityCases([]);
          } catch (err) {
            console.error('Error fetching stats:', err);
          }
        }
      }
    }
    loadStats();
  }, [profile, permsLoading, permissions]);

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const hasAccess = permissions.view_snapshot || isIT;

  const writeAuditLog = async (action: 'INSERT' | 'UPDATE' | 'DELETE', recordId: string, changes: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const recordUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(recordId))
        ? recordId
        : null;

      const payload = {
        user_id: session.user.id,
        user_name: profile?.name || 'Unknown',
        user_role: profile?.role || 'No Role',
        table_name: 'announcements',
        action: action,
        record_id: recordUuid,
        changes: {
          ...changes,
          original_record_id: recordId
        },
        created_at: new Date().toISOString()
      };

      await supabase.from('audit_logs').insert([payload]);
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  };

  const handleOpenEditModal = (a: any) => {
    setEditingNotice(a);
    setIsNoticeModalOpen(true);
  };

  const handleCloseNoticeModal = () => {
    setIsNoticeModalOpen(false);
    setEditingNotice(null);
  };

  const handleDeleteNotice = async (id: string, title: string, content: string, type: string, scheduled_at: string) => {
    if (!window.confirm(lang === 'bm' ? `Adakah anda pasti mahu memadamkan pengumuman "${title}"?` : `Are you sure you want to delete the announcement "${title}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) {
        alert(t('overview', 'failedDelete', lang));
      } else {
        await writeAuditLog('DELETE', id, {
          title,
          content,
          type,
          scheduled_at
        });
        // Fallback: manually update state if real-time listener is slow or replication is disabled
        setAnnouncements(prev => prev.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error('Error deleting announcement:', err);
      alert(t('overview', 'errorDelete', lang));
    }
  };

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
      alert(t('overview', 'titleRequired', lang));
      setIsPostingNotice(false);
      return;
    }
    if (!cleanContent) {
      alert(t('overview', 'contentRequired', lang));
      setIsPostingNotice(false);
      return;
    }

    // Combine date with current time for scheduling
    const scheduledDateTime = announcementDate
      ? new Date(`${announcementDate}T00:00:00`).toISOString()
      : new Date().toISOString();

    try {
      if (editingNotice) {
        const { data, error } = await supabase
          .from('announcements')
          .update({
            title: cleanTitle,
            content: cleanContent,
            type: cleanType,
            scheduled_at: scheduledDateTime
          })
          .eq('id', editingNotice.id)
          .select();

        if (error) {
          alert(t('overview', 'failedUpdate', lang));
        } else {
          await writeAuditLog('UPDATE', editingNotice.id, {
            before: {
              title: editingNotice.title,
              type: editingNotice.type,
              content: editingNotice.content,
              scheduled_at: editingNotice.scheduled_at
            },
            after: {
              title: cleanTitle,
              type: cleanType,
              content: cleanContent,
              scheduled_at: scheduledDateTime
            }
          });
          handleCloseNoticeModal();
          // Instant local state update
          await fetchAnnouncements();
        }
      } else {
        const { data, error } = await supabase
          .from('announcements')
          .insert([
            {
              title: cleanTitle,
              content: cleanContent,
              type: cleanType,
              author_name: sanitizeInput(profile?.name || 'Unknown', 100),
              author_id: profile?.id,
              scheduled_at: scheduledDateTime,
              created_at: new Date().toISOString()
            }
          ])
          .select();

        if (error) {
          console.error('Insert announcement error:', error);
          alert(`${t('overview', 'failedPost', lang)}${error.message || ''}`);
        } else {
          const newRecord = data?.[0];
          if (newRecord) {
            await writeAuditLog('INSERT', newRecord.id, {
              title: cleanTitle,
              type: cleanType,
              content: cleanContent,
              scheduled_at: scheduledDateTime
            });
          }
          handleCloseNoticeModal();
          (e.target as HTMLFormElement).reset();
          // Instant local state update
          await fetchAnnouncements();
        }
      }
    } catch (_err) {
      alert(t('overview', 'errorSave', lang));
    } finally {
      setIsPostingNotice(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('common', 'loadingDashboard', lang)}
        </div>
      </div>
    );
  }

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

  // Get all unique Year-Month combinations from past announcements for the month filter dropdown
  const getUniqueMonths = () => {
    const past = getPastAnnouncements();
    const months = past.map(a => a.scheduled_at.substring(0, 7)); // 'YYYY-MM'
    return Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));
  };

  const getMonthLabel = (yearMonth: string, currentLang: 'en' | 'bm') => {
    try {
      const [year, month] = yearMonth.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString(currentLang === 'bm' ? 'ms-MY' : 'en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
      return yearMonth;
    }
  };

  // Get past announcements for history with optional filters
  const getHistoryAnnouncements = () => {
    let filtered = getPastAnnouncements();

    if (historyFilterType !== 'All') {
      filtered = filtered.filter(a => a.type === historyFilterType);
    }

    if (historyFilterMonth !== 'All') {
      filtered = filtered.filter(a => a.scheduled_at.substring(0, 7) === historyFilterMonth);
    }

    return filtered;
  };

  const hasFullAccess = permissions?.view_snapshot || false;
  const todayCount = getTodayAnnouncements().length;
  const pastCount = getPastAnnouncements().length;
  const displayedAnnouncements = getDisplayedAnnouncements();

  return (
    <div className="space-y-8 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl md:text-3xl font-bold text-indigo-900 dark:text-yellow-500 tracking-tight">
            {t('overview', 'pageTitle', lang)}{' '}
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              {t('overview', 'pageHighlight', lang)}
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
            {t('overview', 'welcomeBack', lang)}{' '}
            <span className="font-semibold text-slate-800 dark:text-zinc-200">{profile?.name}</span>{' '}
            ({profile?.role})
          </p>
        </div>
        
        {staffOnLeaveCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 dark:bg-yellow-500/10 dark:border-yellow-500/20 rounded-xl shadow-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 dark:bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 dark:bg-yellow-500"></span>
            </span>
            <span className="text-sm font-semibold text-indigo-700 dark:text-yellow-500">
              {staffOnLeaveCount} Staff on Leave Today
            </span>
          </div>
        )}
      </div>


      {!showHistory ? (
        <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden mt-6">
          <div className="p-6 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {t('overview', 'announcements', lang)}
              </h2>
              <div className="text-xs text-indigo-100 mt-1 font-medium col-span-2">
                <span className="text-indigo-100">{t('overview', 'today', lang)}: <span className="font-bold text-white">{todayCount}</span></span>
                <span className="mx-2 text-indigo-300">|</span>
                <span className="text-indigo-100">{t('overview', 'archive', lang)}: <span className="font-bold text-white">{pastCount}</span></span>
              </div>
            </div>
            <div className="flex gap-2.5 w-full sm:w-auto">
              {pastCount > 0 && (
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex-1 sm:flex-none text-xs font-semibold bg-indigo-700 hover:bg-indigo-800 text-white dark:bg-gray-800 dark:hover:bg-gray-700 px-4 py-2.5 rounded-xl border border-indigo-500 dark:border-yellow-500/50 transition-all min-h-[48px] flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {t('overview', 'viewHistory', lang)}
                </button>
              )}
              {hasFullAccess && (
                <button
                  onClick={() => setIsNoticeModalOpen(true)}
                  className="flex-1 sm:flex-none text-xs font-semibold bg-white hover:bg-slate-50 text-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black px-4 py-2.5 rounded-xl transition-all min-h-[48px] flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {t('overview', 'postNotice', lang)}
                </button>
              )}
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4 max-h-[600px] overflow-y-auto scrollbar-thin">
            {displayedAnnouncements.length === 0 ? (
              <div className="text-center py-12 w-full">
                <p className="text-sm text-slate-500 dark:text-zinc-400">{t('overview', 'noAnnouncements', lang)}</p>
                <p className="text-xs text-slate-400 dark:text-zinc-550 mt-1">{t('overview', 'checkBack', lang)}</p>
              </div>
            ) : (
              displayedAnnouncements.map((a) => {
                const isTranslated = !!translatedAnnouncements[a.id];
                const displayTitle = isTranslated ? translatedAnnouncements[a.id].title : a.title;
                const displayContent = isTranslated ? translatedAnnouncements[a.id].content : a.content;
                const isToday = getTodayAnnouncements().some(t => t.id === a.id);

                return (
                  <div
                    key={a.id}
                    className={`p-5 rounded-xl border transition-all ${isToday
                      ? 'border-indigo-200 dark:border-yellow-500/50/40 bg-indigo-50/10 dark:bg-black/5'
                      : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900/40'
                      } hover:border-indigo-300 dark:hover:border-zinc-700 hover:shadow-sm`}
                  >
                    {/* Top row: type badge + date + actions menu */}
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border tracking-wide whitespace-nowrap ${a.type === 'Urgent'
                          ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
                          : a.type === 'Memo'
                            ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-yellow-500 dark:border-amber-900/30'
                            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-700/60 dark:text-zinc-100 dark:border-zinc-600/60'
                          }`}>
                          {a.type}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500">{a.date}</span>
                      </div>
                      {hasFullAccess && (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === a.id ? null : a.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Actions"
                            type="button"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 12a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </button>
                          {activeMenuId === a.id && (
                            <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-black border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden py-1 animate-fade-in">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(a);
                                  setActiveMenuId(null);
                                }}
                                type="button"
                                className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                              >
                                {lang === 'bm' ? 'Kemaskini' : 'Edit'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNotice(a.id, a.title, a.content, a.type, a.scheduled_at);
                                  setActiveMenuId(null);
                                }}
                                type="button"
                                className="w-full px-4 py-2 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                              >
                                {lang === 'bm' ? 'Padam' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title & content */}
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 mb-1" title={displayTitle}>
                      {displayTitle}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis whitespace-pre-wrap mb-4">
                      {displayContent}
                    </p>

                    {/* Footer: author + action buttons — always inside the card */}
                    <div className="pt-3 border-t border-slate-100 dark:border-gray-800/80 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-semibold truncate min-w-0" title={a.author}>
                        {a.author}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTranslate(a.id, a.title, a.content)}
                          disabled={translatingIds[a.id]}
                          type="button"
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-gray-700 transition-all flex-shrink-0"
                          title="Translate / Terjemah"
                        >
                          {translatingIds[a.id] ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2a2.5 2.5 0 002.5-2.5V10a2 2 0 00-2-2h-1a2 2 0 01-2-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v.935M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedAnnouncement(a)}
                          type="button"
                          className="h-8 px-4 rounded-lg bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-black dark:hover:bg-white text-xs font-semibold transition-all shadow-sm flex-shrink-0"
                        >
                          {t('overview', 'read', lang)}
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
        <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden mt-6">
          <div className="p-6 border-b border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-indigo-900 dark:text-yellow-500 tracking-tight">
                {t('overview', 'announcementHistory', lang)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">{t('overview', 'historySubtitle', lang)}</p>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 transition-all min-h-[48px] flex items-center justify-center gap-1.5 shadow-sm"
            >
              {t('overview', 'backToToday', lang)}
            </button>
          </div>


          <div className="p-5 border-b border-slate-200 dark:border-gray-800 bg-slate-50/30 dark:bg-gray-900/20 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide block">{t('overview', 'filterByType', lang)}</label>
                <select
                  value={historyFilterType}
                  onChange={(e) => setHistoryFilterType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-medium text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all cursor-pointer"
                >
                  <option value="All">{t('overview', 'allTypes', lang)}</option>
                  <option value="Info">{t('overview', 'infoBadge', lang)}</option>
                  <option value="Memo">{t('overview', 'memoBadge', lang)}</option>
                  <option value="Urgent">{t('overview', 'urgentBadge', lang)}</option>
                </select>
              </div>


              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide block">
                  {t('overview', 'filterByMonth', lang)}
                </label>
                <select
                  value={historyFilterMonth}
                  onChange={(e) => setHistoryFilterMonth(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-medium text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all cursor-pointer"
                >
                  <option value="All">{t('overview', 'allMonths', lang)}</option>
                  {getUniqueMonths().map(ym => (
                    <option key={ym} value={ym}>
                      {getMonthLabel(ym, lang)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {(historyFilterType !== 'All' || historyFilterMonth !== 'All') && (
              <button
                onClick={() => {
                  setHistoryFilterType('All');
                  setHistoryFilterMonth('All');
                }}
                className="text-xs font-bold text-indigo-600 dark:text-yellow-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors uppercase tracking-wider block"
              >
                {t('overview', 'clearFilters', lang)}
              </button>
            )}
          </div>


          <div className="p-6 flex flex-col gap-4 max-h-[600px] overflow-y-auto scrollbar-thin">
            {getHistoryAnnouncements().length === 0 ? (
              <div className="text-center py-12 w-full">
                <p className="text-sm text-slate-500 dark:text-zinc-400">{t('overview', 'noFound', lang)}</p>
                <p className="text-xs text-slate-400 dark:text-zinc-550 mt-1">{t('overview', 'adjustFilters', lang)}</p>
              </div>
            ) : (
              getHistoryAnnouncements().map((a) => {
                const isTranslated = !!translatedAnnouncements[a.id];
                const displayTitle = isTranslated ? translatedAnnouncements[a.id].title : a.title;
                const displayContent = isTranslated ? translatedAnnouncements[a.id].content : a.content;

                return (
                  <div key={a.id} className="p-5 rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 hover:border-slate-350 dark:hover:border-zinc-700 hover:shadow-sm transition-all flex flex-col justify-between min-h-[160px]">
                    <div className="space-y-2">
                      <div className="flex flex-row justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border tracking-wide whitespace-nowrap ${a.type === 'Urgent'
                            ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30'
                            : a.type === 'Memo'
                              ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-yellow-500 dark:border-amber-900/30'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-gray-800 dark:text-zinc-300 dark:border-gray-700'
                            }`}>
                            {a.type}
                          </span>
                          <span className="text-[11px] text-slate-450 dark:text-zinc-500">{a.date}</span>
                        </div>
                        {hasFullAccess && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === a.id ? null : a.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-105 dark:hover:bg-zinc-800 transition-colors"
                              title="Actions"
                              type="button"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 12a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </button>
                            {activeMenuId === a.id && (
                              <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-black border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden py-1 animate-fade-in">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditModal(a);
                                    setActiveMenuId(null);
                                  }}
                                  type="button"
                                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-705 dark:text-zinc-305 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                                >
                                  {lang === 'bm' ? 'Kemaskini' : 'Edit'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNotice(a.id, a.title, a.content, a.type, a.scheduled_at);
                                    setActiveMenuId(null);
                                  }}
                                  type="button"
                                  className="w-full px-4 py-2 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-55/10 dark:hover:bg-rose-950/20 transition-colors"
                                >
                                  {lang === 'bm' ? 'Padam' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1" title={displayTitle}>
                        {displayTitle}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis whitespace-pre-wrap">
                        {displayContent}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-gray-800 flex justify-between items-center gap-4">
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400 truncate min-w-0" title={a.author}>
                        <span className="font-semibold truncate">{a.author}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleTranslate(a.id, a.title, a.content)}
                          disabled={translatingIds[a.id]}
                          type="button"
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 border border-slate-202 dark:border-gray-700 transition-all text-xs"
                          title="Translate / Terjemah"
                        >
                          {translatingIds[a.id] ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2a2.5 2.5 0 002.5-2.5V10a2 2 0 00-2-2h-1a2 2 0 01-2-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v.935M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedAnnouncement(a)}
                          type="button"
                          className="h-8 px-3 rounded-lg bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-black dark:hover:bg-white text-xs font-semibold transition-all shadow-sm"
                        >
                          {t('overview', 'read', lang)}
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

      {/* POST/EDIT NOTICE MODAL */}
      {mounted && isNoticeModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-black w-[95%] max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200 dark:border-gray-800">

            <div className="p-5 border-b border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-indigo-900 dark:text-yellow-500 tracking-tight">
                  {editingNotice
                    ? t('overview', 'editAnnouncement', lang)
                    : t('overview', 'postNewAnnouncement', lang)
                  }
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 font-medium">
                  {editingNotice
                    ? t('overview', 'editSubtitle', lang)
                    : t('overview', 'postSubtitle', lang)
                  }
                </p>
              </div>
              <button
                onClick={handleCloseNoticeModal}
                className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-55/10 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>


            <form key={editingNotice ? editingNotice.id : 'new-notice'} onSubmit={handlePostNotice} className="p-6 md:p-8 space-y-5 overflow-y-auto max-h-[70vh] bg-white dark:bg-black">

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{t('overview', 'announcementTitle', lang)}</label>
                <input
                  type="text"
                  name="title"
                  required
                  defaultValue={editingNotice ? editingNotice.title : ''}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-medium text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all disabled:opacity-50 min-h-[48px]"
                  placeholder={t('overview', 'titlePlaceholder', lang)}
                  disabled={isPostingNotice}
                />
              </div>


              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-500">{t('overview', 'urgencyLevel', lang)}</label>
                <select
                  name="type"
                  defaultValue={editingNotice ? editingNotice.type : 'Info'}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
                  disabled={isPostingNotice}
                >
                  <option value="Info">ℹ️ {t('overview', 'infoBadge', lang)} ({lang === 'bm' ? 'Standard' : 'Standard'})</option>
                  <option value="Memo">📝 {t('overview', 'memoBadge', lang)} ({lang === 'bm' ? 'Penting' : 'Important'})</option>
                  <option value="Urgent">⚠️ {t('overview', 'urgentBadge', lang)} ({lang === 'bm' ? 'Kritikal' : 'Critical'})</option>
                </select>
              </div>


              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-500">{t('overview', 'announcementDate', lang)}</label>
                <input
                  type="date"
                  name="scheduled_date"
                  defaultValue={editingNotice ? editingNotice.scheduled_at.split('T')[0] : new Date().toISOString().split('T')[0]}
                  onClick={(e) => {}}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-medium text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all disabled:opacity-50 min-h-[48px]"
                  disabled={isPostingNotice}
                />
                <div className="mt-2 p-3 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800/80 rounded-xl">
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                    <span className="font-semibold block mb-0.5">{lang === 'bm' ? 'Tetapan Penerbitan:' : 'Publish Settings:'}</span>
                    {lang === 'bm' ? 'Tarikh lepas akan diletakkan dalam sejarah. Tarikh masa hadapan akan menjadualkan siaran ini untuk kemudian.' : 'Past dates will be placed in history. Future dates will schedule this post for later.'}
                  </p>
                </div>
              </div>


              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-500">{t('overview', 'messageContent', lang)}</label>
                <textarea
                  name="content"
                  required
                  rows={5}
                  defaultValue={editingNotice ? editingNotice.content : ''}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm font-medium text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all resize-none disabled:opacity-50"
                  placeholder={t('overview', 'messagePlaceholder', lang)}
                  disabled={isPostingNotice}
                />
              </div>


              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-gray-800/80">
                <button
                  type="button"
                  onClick={handleCloseNoticeModal}
                  className="px-5 py-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all min-h-[48px]"
                  disabled={isPostingNotice}
                >
                  {t('overview', 'cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={isPostingNotice}
                  className="px-5 py-3 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px]"
                >
                  {isPostingNotice ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                      {editingNotice ? t('overview', 'saving', lang) : t('overview', 'posting', lang)}
                    </span>
                  ) : (
                    editingNotice ? t('overview', 'saveChanges', lang) : t('overview', 'postToDashboard', lang)
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {mounted && selectedAnnouncement && createPortal(
        (() => {
          const isTranslated = !!translatedAnnouncements[selectedAnnouncement.id];
          const modalTitle = isTranslated ? translatedAnnouncements[selectedAnnouncement.id].title : selectedAnnouncement.title;
          const modalContent = isTranslated ? translatedAnnouncements[selectedAnnouncement.id].content : selectedAnnouncement.content;

          return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white dark:bg-black w-[95%] max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-200 dark:border-gray-800">

                <div className="p-6 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900 flex justify-between items-start gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border tracking-wide uppercase ${selectedAnnouncement.type === 'Urgent'
                        ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30'
                        : selectedAnnouncement.type === 'Memo'
                          ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-yellow-500 dark:border-amber-900/30'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-gray-800 dark:text-zinc-350 dark:border-gray-700'
                        }`}>
                        {selectedAnnouncement.type}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400 font-semibold">{selectedAnnouncement.date}</span>
                    </div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug tracking-tight">{modalTitle}</h2>
                  </div>
                  <button onClick={() => setSelectedAnnouncement(null)} className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-55/10 rounded-xl flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>


                <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[50vh] text-sm text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-black">
                  {modalContent}
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-gray-800/80 bg-slate-50 dark:bg-gray-900/50 flex justify-between items-center gap-4">
                  <span className="text-xs text-slate-500 dark:text-zinc-455">{t('overview', 'postedBy', lang)} <span className="font-semibold">{selectedAnnouncement.author}</span></span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTranslate(selectedAnnouncement.id, selectedAnnouncement.title, selectedAnnouncement.content)}
                      disabled={translatingIds[selectedAnnouncement.id]}
                      type="button"
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 transition-all min-h-[48px] flex items-center gap-1.5 shadow-sm"
                    >
                      {translatingIds[selectedAnnouncement.id] ? '...' : isTranslated ? t('overview', 'original', lang) : t('overview', 'translate', lang)}
                    </button>
                    <button
                      onClick={() => setSelectedAnnouncement(null)}
                      type="button"
                      className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white transition-all min-h-[48px]"
                    >
                      {t('clients', 'close', lang)}
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
        <div className="space-y-6 pt-8 border-t border-slate-200 dark:border-gray-800/80">
          <h2 className="text-lg font-semibold text-indigo-900 dark:text-yellow-500 tracking-tight">{t('overview', 'executiveSnapshot', lang)}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-202 dark:bg-gray-900/40 dark:border-gray-800/80 shadow-sm"><p className="text-[11px] font-semibold text-slate-450 dark:text-zinc-500 uppercase tracking-wide">{t('overview', 'totalClients', lang)}</p><p className="text-3xl font-bold text-slate-800 dark:text-white mt-2">{stats.totalClients}</p></div>
            <div className="p-5 rounded-2xl bg-emerald-50/30 border border-emerald-100 dark:bg-black/10 dark:border-yellow-500/30 shadow-sm"><p className="text-[11px] font-semibold text-emerald-600 dark:text-yellow-500 uppercase tracking-wide">{t('overview', 'completed', lang)}</p><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-405 mt-2">{stats.completed}</p></div>
            <div className="p-5 rounded-2xl bg-amber-50/30 border border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30 shadow-sm"><p className="text-[11px] font-semibold text-amber-600 dark:text-yellow-500 uppercase tracking-wide">{t('overview', 'pending', lang)}</p><p className="text-3xl font-bold text-amber-600 dark:text-amber-405 mt-2">{stats.pending}</p></div>
            <div className="p-5 rounded-2xl bg-rose-50/30 border border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30 shadow-sm"><p className="text-[11px] font-semibold text-rose-650 dark:text-rose-455 uppercase tracking-wide">{t('overview', 'dropped', lang)}</p><p className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">{stats.dropped}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}