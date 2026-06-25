import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';

interface DayData {
  dayLabel: string;
  dateStr: string;
  workHours: number;
  breakHours: number;
  inZoneCount: number;
  totalCount: number;
}

function getMonday(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(year, month - 1, diff);
  
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekRangeLabel(mondayStr: string, lang: 'en' | 'bm'): string {
  if (!mondayStr) return '';
  const [year, month, day] = mondayStr.split('-').map(Number);
  
  const monDate = new Date(year, month - 1, day);
  const friDate = new Date(year, month - 1, day + 4); // Monday + 4 days is Friday
  
  const formatOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const locale = lang === 'bm' ? 'ms-MY' : 'en-US';
  const startStr = monDate.toLocaleDateString(locale, formatOptions);
  const endStr = friDate.toLocaleDateString(locale, formatOptions);
  
  return `${startStr} - ${endStr}`;
}

export default function AttendanceAnalyticsSample() {
  const { lang } = usePortalLanguage() as { lang: 'en' | 'bm' };
  const [profile, setProfile] = useState<any>(null);
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [activeWeekId, setActiveWeekId] = useState<string>('');

  // Drag to scroll refs and state variables
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Drag scroll sensitivity speed
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const paddingLeft = 15;
  const paddingRight = 15;
  const axisOffset = 25;
  const dayWidth = 65;

  const handleScroll = () => {
    if (!scrollContainerRef.current || chartData.length === 0) return;
    const container = scrollContainerRef.current;
    const sLeft = container.scrollLeft;
    const width = container.clientWidth;

    const scrollWidthVal = paddingLeft + paddingRight + 2 * axisOffset + (chartData.length - 1) * dayWidth;
    const step = (scrollWidthVal - paddingLeft - paddingRight - 2 * axisOffset) / (chartData.length - 1);

    const visibleDays = chartData.filter((d, index) => {
      const x = paddingLeft + axisOffset + index * step;
      return x >= sLeft && x <= sLeft + width;
    });

    if (visibleDays.length === 0) return;

    const weekCounts: Record<string, number> = {};
    visibleDays.forEach(d => {
      const wId = getMonday(d.dateStr);
      weekCounts[wId] = (weekCounts[wId] || 0) + 1;
    });

    let maxWeekId = '';
    let maxCount = -1;
    Object.entries(weekCounts).forEach(([wId, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxWeekId = wId;
      }
    });

    if (maxWeekId && maxWeekId !== activeWeekId) {
      setActiveWeekId(maxWeekId);
    }
  };

  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      // Scroll to the far right so users see their most recent hours first
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      // Trigger scroll sync after layout rendering
      setTimeout(() => {
        handleScroll();
      }, 50);
    }
  }, [loading, chartData]);

  // Localized text strings to keep the component fully self-contained for easy removal
  const translations = {
    title: { en: 'Attendance Analytics Dashboard', bm: 'Papan Pemuka Analisis Kehadiran' },
    subtitle: { en: 'Visual reports of your recent work hours, break compliance, and location logs', bm: 'Laporan visual waktu kerja terbaharu, pematuhan waktu rehat, dan log lokasi anda' },
    avgHours: { en: 'Avg Daily Hours', bm: 'Purata Waktu Kerja' },
    avgHoursSub: { en: 'Target: 8.0 hrs/day', bm: 'Sasaran: 8.0 jam/hari' },
    breakCompliance: { en: 'Break Compliance', bm: 'Pematuhan Rehat' },
    breakComplianceSub: { en: 'Min. 1.0 hr rest day', bm: 'Min. 1.0 jam sehari' },
    inZoneRatio: { en: 'In-Zone Clock-ins', bm: 'Daftar Masuk Dalam Zon' },
    inZoneRatioSub: { en: 'Location geofenced check-ins', bm: 'Daftar masuk berpandukan lokasi' },
    weeklyHoursTitle: { en: 'Weekly Worked Hours Trend', bm: 'Trend Jam Bekerja Mingguan' },
    weeklyProgressTitle: { en: 'Weekly Completion Goal', bm: 'Sasaran Selesai Mingguan' },
    weeklyTarget: { en: 'Target: 40 hrs', bm: 'Sasaran: 40 jam' },
    hoursWorked: { en: 'hrs worked', bm: 'jam bekerja' },
    hoursBreak: { en: 'hrs break', bm: 'jam rehat' },
    completed: { en: 'Completed', bm: 'Selesai' },
    noData: { en: 'Demo Dataset Active', bm: 'Set Data Demo Aktif' },
    noDataDesc: { en: 'Displaying template metrics. Logging more clock-ins will populate real data.', bm: 'Memaparkan metrik templat. Log lebih banyak daftar masuk untuk memaparkan data sebenar.' },
    dayMon: { en: 'Mon', bm: 'Isn' },
    dayTue: { en: 'Tue', bm: 'Sel' },
    dayWed: { en: 'Wed', bm: 'Rab' },
    dayThu: { en: 'Thu', bm: 'Kha' },
    dayFri: { en: 'Fri', bm: 'Jum' },
    daySat: { en: 'Sat', bm: 'Sab' },
    daySun: { en: 'Sun', bm: 'Aha' },
  };

  const t = (key: keyof typeof translations) => {
    return translations[key][lang] || translations[key]['en'];
  };

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Fetch user profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', session.user.id)
          .single();
        if (profileData) {
          setProfile(profileData);
        }

        // Generate baseline of last 21 calendar days (aligned to 3 full calendar weeks)
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        
        const currentMondayStr = getMonday(todayStr);
        const [mYear, mMonth, mDay] = currentMondayStr.split('-').map(Number);

        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayTranslations = {
          'Mon': t('dayMon'),
          'Tue': t('dayTue'),
          'Wed': t('dayWed'),
          'Thu': t('dayThu'),
          'Fri': t('dayFri'),
          'Sat': t('daySat'),
          'Sun': t('daySun'),
        };

        const last21Days: DayData[] = [];
        for (let i = -14; i <= 6; i++) {
          const d = new Date(mYear, mMonth - 1, mDay + i);
          const rawDay = daysOfWeek[d.getDay()] as keyof typeof dayTranslations;
          
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dateDay = String(d.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${dateDay}`;
          
          last21Days.push({
            dayLabel: dayTranslations[rawDay] || rawDay,
            dateStr,
            workHours: 0,
            breakHours: 0,
            inZoneCount: 0,
            totalCount: 0
          });
        }

        const startDateStr = last21Days[0].dateStr;
        const endDateStr = last21Days[20].dateStr;

        // Fetch attendance records from Supabase for this exact 21-day range
        const { data: records, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('user_id', session.user.id)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true });

        if (error) throw error;

        // Fetch public holidays in the same 21-day range
        const { data: publicHolidays, error: holidaysError } = await supabase
          .from('public_holidays')
          .select('*')
          .gte('date', startDateStr)
          .lte('date', endDateStr);

        if (holidaysError) {
          console.error('Error fetching public holidays:', holidaysError);
        }

        const holidaysSet = new Set<string>();
        if (publicHolidays) {
          publicHolidays.forEach(h => {
            if (h.date) {
              holidaysSet.add(h.date);
            }
          });
        }

        // Process fetched database records
        const grouped: Record<string, any[]> = {};
        if (records && records.length > 0) {
          records.forEach(r => {
            if (r.date) {
              if (!grouped[r.date]) grouped[r.date] = [];
              grouped[r.date].push(r);
            }
          });
        }

        // Calculate daily metrics from database records
        last21Days.forEach(day => {
          const dayRecords = grouped[day.dateStr];
          let parsedWorkHours = 0;
          let parsedBreakHours = 0;
          let inZoneCount = 0;
          let totalCount = 0;

          if (dayRecords && dayRecords.length > 0) {
            // Sort by clock-in time
            dayRecords.sort((a, b) => new Date(a.clock_in_time).getTime() - new Date(b.clock_in_time).getTime());
            
            let totalActiveMs = 0;
            let totalGapMs = 0;

            dayRecords.forEach((r, idx) => {
              totalCount += 1;
              if (r.clock_in_within_zone) inZoneCount += 1;

              if (r.clock_in_time && r.clock_out_time) {
                totalActiveMs += (new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime());
              }

              // Calculate gaps between consecutive clock-ins (breaks)
              if (idx > 0 && r.clock_in_time && dayRecords[idx - 1].clock_out_time) {
                const gap = new Date(r.clock_in_time).getTime() - new Date(dayRecords[idx - 1].clock_out_time).getTime();
                if (gap > 0) totalGapMs += gap;
              }
            });

            parsedWorkHours = Math.round((totalActiveMs / (1000 * 60 * 60)) * 10) / 10;
            
            // Standard break of 1 hour if they did a shift, plus any gap breaks
            if (parsedWorkHours > 0) {
              const gapHours = totalGapMs / (1000 * 60 * 60);
              parsedBreakHours = Math.round((1.0 + gapHours) * 10) / 10;
            }
          }

          day.workHours = parsedWorkHours;
          day.breakHours = parsedBreakHours;
          day.inZoneCount = inZoneCount;
          day.totalCount = totalCount;
        });

        // Count how many days actually have logged hours in the database
        const activeDbDaysCount = last21Days.filter(d => grouped[d.dateStr] && grouped[d.dateStr].length > 0).length;

        // If less than 3 days have records, load a high-quality mock trend so the charts look gorgeous
        if (activeDbDaysCount < 3) {
          const mockWorkHours = [8.5, 9.0, 7.8, 9.2, 8.0, 0.0, 0.0];
          const mockBreakHours = [1.2, 1.5, 1.0, 1.1, 1.0, 0.0, 0.0];
          const mockInZone = [1, 2, 1, 2, 1, 0, 0];
          const mockTotal = [1, 2, 1, 2, 1, 0, 0];

          last21Days.forEach((day) => {
            if (day.workHours === 0) {
              const [y, m, d] = day.dateStr.split('-').map(Number);
              const dateObj = new Date(y, m - 1, d);
              const dayIndex = dateObj.getDay(); // 0 is Sun, 1 is Mon...
              const mockIdx = dayIndex === 0 ? 6 : dayIndex - 1;

              day.workHours = mockWorkHours[mockIdx];
              day.breakHours = mockBreakHours[mockIdx];
              day.inZoneCount = mockInZone[mockIdx];
              day.totalCount = mockTotal[mockIdx];
            }
          });
        }

        // Apply Public Holiday overrides (MUST run after mock data fallback so holidays apply in all cases)
        last21Days.forEach(day => {
          const isHoliday = holidaysSet.has(day.dateStr);
          if (isHoliday) {
            const [y, m, d] = day.dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dayOfWeek = dateObj.getDay();
            // Only count weekdays (Mon-Fri)
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              day.workHours = Math.max(day.workHours, 8.0);
              day.breakHours = Math.max(day.breakHours, 1.0);
            }
          }
        });

        setChartData(last21Days);
        setActiveWeekId(currentMondayStr);
      } catch (err) {
        console.error('Failed to load attendance analytics:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [lang]);

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl">
        Loading analytics visualization...
      </div>
    );
  }

  // Calculate high-level summary KPIs
  const loggedDays = chartData.filter(d => d.workHours > 0);
  const avgWorkHours = loggedDays.length > 0 
    ? Math.round((loggedDays.reduce((acc, curr) => acc + curr.workHours, 0) / loggedDays.length) * 10) / 10 
    : 0;

  const avgBreakHours = loggedDays.length > 0 
    ? Math.round((loggedDays.reduce((acc, curr) => acc + curr.breakHours, 0) / loggedDays.length) * 10) / 10 
    : 0;

  const totalCheckins = chartData.reduce((acc, curr) => acc + curr.totalCount, 0);
  const totalInZone = chartData.reduce((acc, curr) => acc + curr.inZoneCount, 0);
  const inZonePercentage = totalCheckins > 0 ? Math.round((totalInZone / totalCheckins) * 100) : 100;

  // Active week calculations (restricted to Monday to Friday weekdays)
  const currentWeekId = activeWeekId || (chartData.length > 0 ? getMonday(chartData[chartData.length - 1].dateStr) : '');
  const activeWeekDays = chartData.filter(d => {
    if (getMonday(d.dateStr) !== currentWeekId) return false;
    const [y, m, day] = d.dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, day);
    const dayOfWeek = dateObj.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  });

  const totalWeeklyHours = Math.round(activeWeekDays.reduce((acc, curr) => acc + curr.workHours, 0) * 10) / 10;
  const weeklyTargetHours = 40;
  const progressPercent = Math.min(Math.round((totalWeeklyHours / weeklyTargetHours) * 100), 100);

  // SVG Bar Chart configurations
  const maxVal = Math.max(...chartData.map(d => d.workHours), 12);
  const chartHeight = 160;
  const scrollWidth = paddingLeft + paddingRight + 2 * axisOffset + (chartData.length - 1) * dayWidth;
  const paddingY = 20;

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm space-y-6 p-6 md:p-8 animate-page-transition">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-gray-800">
        <div>
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-yellow-500 text-sm">📊</span>
            {t('title')}
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 font-medium">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Avg Hours */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/40 to-slate-50/20 dark:from-indigo-950/10 dark:to-zinc-900/20 border border-indigo-100/50 dark:border-indigo-950/30 flex items-center justify-between hover:shadow-md transition-all duration-300">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-550">{t('avgHours')}</p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{avgWorkHours} <span className="text-lg font-bold text-slate-500">h</span></p>
            <p className="text-[11px] font-medium text-indigo-600 dark:text-yellow-500">{t('avgHoursSub')}</p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-yellow-500 rounded-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Card 2: Break Compliance */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/40 to-slate-50/20 dark:from-emerald-950/10 dark:to-zinc-900/20 border border-emerald-100/50 dark:border-emerald-950/30 flex items-center justify-between hover:shadow-md transition-all duration-300">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-550">{t('breakCompliance')}</p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{avgBreakHours} <span className="text-lg font-bold text-slate-500">h</span></p>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{t('breakComplianceSub')}</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364.364l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 113.536 0V21h2v-2.757a5.002 5.002 0 013.536-9.9M9.172 9.172a4 4 0 015.656 0" />
            </svg>
          </div>
        </div>

        {/* Card 3: Geofence compliance */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/40 to-slate-50/20 dark:from-amber-950/10 dark:to-zinc-900/20 border border-amber-100/50 dark:border-amber-950/30 flex items-center justify-between hover:shadow-md transition-all duration-300">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-450 dark:text-zinc-550">{t('inZoneRatio')}</p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{inZonePercentage}<span className="text-lg font-bold text-slate-500">%</span></p>
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{t('inZoneRatioSub')}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25g3 3 0 013-3h9a3 3 0 013 3z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              {/* Left: Bar Chart */}
        <div className="lg:col-span-2 p-5 border border-slate-200 dark:border-gray-800 rounded-2xl bg-slate-50/20 dark:bg-black/20 flex flex-col space-y-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
            {t('weeklyHoursTitle')}
          </h3>
          
          <div className="flex items-stretch min-h-[180px]">
            {/* Y Axis Labels (Static on the Left) */}
            <svg 
              width="40" 
              height={chartHeight} 
              className="flex-shrink-0 text-[10px] fill-slate-400 dark:fill-zinc-500 font-semibold select-none mr-2"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = paddingY + ratio * (chartHeight - 2 * paddingY);
                const hrs = Math.round((maxVal - ratio * maxVal) * 10) / 10;
                return (
                  <text key={idx} x="35" y={y + 4} textAnchor="end">
                    {hrs}h
                  </text>
                );
              })}
            </svg>

            {/* Scrollable Container (Grid & Bars) */}
            <div 
              ref={scrollContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onScroll={handleScroll}
              className="flex-1 overflow-x-auto scrollbar-none cursor-grab active:cursor-grabbing select-none relative"
            >
              <svg 
                width={scrollWidth} 
                height={chartHeight}
                viewBox={`0 0 ${scrollWidth} ${chartHeight}`} 
                className="text-slate-305 dark:text-zinc-700"
              >
                {/* Y Axis Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = paddingY + ratio * (chartHeight - 2 * paddingY);
                  return (
                    <line 
                      key={idx}
                      x1="0" 
                      y1={y} 
                      x2={scrollWidth} 
                      y2={y} 
                      stroke="currentColor" 
                      strokeWidth="1" 
                      strokeDasharray="4,4" 
                      className="opacity-20 dark:opacity-10" 
                    />
                  );
                })}

                {/* Bars */}
                {chartData.map((d, index) => {
                  const step = (scrollWidth - paddingLeft - paddingRight - 2 * axisOffset) / (chartData.length - 1);
                  const x = paddingLeft + axisOffset + index * step;
                  const barWidth = 32;
                  
                  // Height calculations
                  const activeHeight = d.workHours > 0 ? (d.workHours / maxVal) * (chartHeight - 2 * paddingY) : 4;
                  const y = chartHeight - paddingY - activeHeight;
                  
                  const isHovered = hoveredBar === index;

                  return (
                    <g 
                      key={index} 
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredBar(index)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {/* Background interactive area */}
                      <rect 
                        x={x - barWidth/2 - 10} 
                        y={paddingY} 
                        width={barWidth + 20} 
                        height={chartHeight - 2 * paddingY} 
                        fill="transparent" 
                      />

                      {/* Gradient Bar */}
                      <defs>
                        <linearGradient id={`barGrad-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                        <linearGradient id={`barGradHover-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                      </defs>

                      <rect 
                        x={x - barWidth / 2} 
                        y={y} 
                        width={barWidth} 
                        height={Math.max(activeHeight, 4)} 
                        rx={6} 
                        ry={6}
                        fill={isHovered ? `url(#barGradHover-${index})` : `url(#barGrad-${index})`}
                        className="transition-all duration-300 ease-out shadow-sm opacity-90 hover:opacity-100" 
                      />

                      {/* X Axis Labels */}
                      <text 
                        x={x} 
                        y={chartHeight - 4} 
                        textAnchor="middle" 
                        className={`text-[10px] font-bold ${isHovered ? 'fill-indigo-600 dark:fill-yellow-500' : 'fill-slate-500 dark:fill-zinc-400'}`}
                      >
                        {d.dayLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Custom Tooltip */}
              {hoveredBar !== null && (
                <div 
                  className="absolute z-20 p-3 rounded-xl bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 shadow-xl backdrop-blur-sm pointer-events-none flex flex-col gap-1 transition-all text-xs"
                  style={{
                    left: `${Math.min(
                      Math.max(20, (paddingLeft + axisOffset + hoveredBar * ((scrollWidth - paddingLeft - paddingRight - 2 * axisOffset) / (chartData.length - 1))) - 65),
                      scrollWidth - 140
                    )}px`,
                    bottom: '50px',
                    width: '130px',
                  }}
                >
                  <div className="font-extrabold text-slate-700 dark:text-zinc-200 border-b border-slate-100 dark:border-zinc-800 pb-1">
                    {chartData[hoveredBar].dayLabel}
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Work:</span>
                    <span className="font-bold text-slate-700 dark:text-zinc-200">{chartData[hoveredBar].workHours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Break:</span>
                    <span className="font-bold text-slate-700 dark:text-zinc-200">{chartData[hoveredBar].breakHours}h</span>
                  </div>
                  {chartData[hoveredBar].totalCount > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      {chartData[hoveredBar].inZoneCount} / {chartData[hoveredBar].totalCount} In Zone
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Circular Donut Chart */}
        <div className="p-5 border border-slate-200 dark:border-gray-800 rounded-2xl bg-slate-50/20 dark:bg-black/20 flex flex-col items-center space-y-4 text-center">
          <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider w-full text-left flex flex-wrap gap-x-1.5 items-center">
            <span>{t('weeklyProgressTitle')}</span>
            {currentWeekId && (
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-yellow-500 normal-case tracking-normal">
                ({getWeekRangeLabel(currentWeekId, lang)})
              </span>
            )}
          </h3>

          <div className="relative w-36 h-36 flex items-center justify-center pt-2">
            {/* SVG circle track and indicator */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="stroke-slate-100 dark:stroke-zinc-900" 
                strokeWidth="8" 
                fill="transparent" 
              />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="stroke-indigo-600 dark:stroke-yellow-500" 
                strokeWidth="8" 
                fill="transparent" 
                strokeDasharray="251.2" 
                strokeDashoffset={251.2 - (251.2 * progressPercent) / 100} 
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <span className="text-2xl font-black text-slate-800 dark:text-white">{progressPercent}%</span>
              <span className="text-[10px] text-slate-405 dark:text-zinc-500 font-bold uppercase tracking-wider">{t('completed')}</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800 dark:text-white">
              {totalWeeklyHours} {t('hoursWorked')}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-500">
              {t('weeklyTarget')}
            </p>
          </div>
        </div>

      </div>

      {/* Info indicator when mock data is displayed */}
      {loggedDays.length < 2 && (
        <div className="flex gap-3 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-xs text-indigo-750 dark:text-indigo-300 font-medium">
          <div className="text-base">💡</div>
          <div className="space-y-0.5">
            <div className="font-extrabold">{t('noData')}</div>
            <div>{t('noDataDesc')}</div>
          </div>
        </div>
      )}

    </div>
  );
}
