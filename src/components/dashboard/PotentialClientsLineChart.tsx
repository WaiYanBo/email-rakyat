import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { PotentialClient } from './PotentialClientsView';
import { t } from '../../lib/portalI18n';

export interface PotentialClientsLineChartProps {
  clients: PotentialClient[];
  lang: 'en' | 'bm';
  staffList?: string[];
  onPeriodSelect?: (periodLabel: string, periodClients: PotentialClient[]) => void;
  selectedPeriodLabel?: string | null;
  onClearPeriodSelect?: () => void;
}

export function parseClientDate(dateStr?: string | null, createdAt?: string | null): Date | null {
  if (dateStr && typeof dateStr === 'string' && dateStr.trim()) {
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const parts = s.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
    }
    const parts = s.replace(/-/g, '/').split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
      } else {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
      }
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  if (createdAt && typeof createdAt === 'string' && createdAt.trim()) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const monthNamesShortEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthNamesShortBm = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis'];
const monthNamesFullEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthNamesFullBm = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];

export interface BucketData {
  key: string;
  label: string;
  fullTitle: string;
  dateStart: Date;
  dateEnd: Date;
  total: number;
  high: number;
  medium: number;
  low: number;
  converted: number;
  cumulative: number;
  clients: PotentialClient[];
}

function getCurvedPath(points: { x: number; y: number }[], minY = 0, maxY = 999999): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i > 0 ? i - 1 : i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    cp1y = Math.min(Math.max(cp1y, minY), maxY);
    cp2y = Math.min(Math.max(cp2y, minY), maxY);

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

function getAreaPath(points: { x: number; y: number }[], baseY: number, minY = 0, maxY = 999999): string {
  if (points.length < 2) return '';
  const curve = getCurvedPath(points, minY, maxY);
  const firstX = points[0].x.toFixed(1);
  const lastX = points[points.length - 1].x.toFixed(1);
  return `${curve} L ${lastX} ${baseY.toFixed(1)} L ${firstX} ${baseY.toFixed(1)} Z`;
}

function getNiceMax(max: number): number {
  if (max <= 0) return 5;
  if (max <= 5) return 5;
  if (max <= 10) return 10;
  if (max <= 20) return 20;
  if (max <= 50) return Math.ceil(max / 10) * 10;
  if (max <= 100) return Math.ceil(max / 20) * 20;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const frac = max / exp;
  let niceFrac = 10;
  if (frac <= 1.5) niceFrac = 2;
  else if (frac <= 3) niceFrac = 4;
  else if (frac <= 5) niceFrac = 6;
  else niceFrac = 10;
  return Math.ceil(niceFrac * exp);
}

export default function PotentialClientsLineChart({
  clients,
  lang,
  staffList = [],
  onPeriodSelect,
  selectedPeriodLabel,
  onClearPeriodSelect
}: PotentialClientsLineChartProps) {
  const [timeRange, setTimeRange] = useState<'all' | 'year' | '6months' | '90days' | '30days' | 'month'>('year');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [granularity, setGranularity] = useState<'auto' | 'day' | 'week' | 'month'>('auto');
  const [potentialFilter, setPotentialFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [chartMode, setChartMode] = useState<'breakdown' | 'single' | 'cumulative'>('breakdown');

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const [visibleSeries, setVisibleSeries] = useState({
    total: true,
    high: true,
    medium: true,
    low: true,
    converted: true
  });

  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [viewportHeight, setViewportHeight] = useState<number>(() => typeof window !== 'undefined' ? window.innerHeight : 800);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.round(rect.width || containerRef.current.clientWidth);
      if (w > 0) setContainerWidth(w);
    }
    if (typeof window !== 'undefined') {
      setViewportHeight(window.innerHeight);
    }
  }, []);

  useEffect(() => {
    updateDimensions();

    const ro = new ResizeObserver(() => {
      updateDimensions();
      requestAnimationFrame(updateDimensions);
    });

    if (containerRef.current) ro.observe(containerRef.current);

    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateDimensions);
    }
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', updateDimensions);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateDimensions);
      }
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', updateDimensions);
      }
    };
  }, [updateDimensions]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    clients.forEach(c => {
      if (c.case_category && c.case_category.trim()) {
        set.add(c.case_category.trim());
      }
    });
    return Array.from(set).sort();
  }, [clients]);

  const availableStaff = useMemo(() => {
    const set = new Set<string>(staffList);
    clients.forEach(c => {
      if (c.lead_by && c.lead_by.trim()) {
        set.add(c.lead_by.trim());
      }
    });
    return Array.from(set).sort();
  }, [clients, staffList]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    const currentYear = new Date().getFullYear();
    set.add(currentYear);
    clients.forEach(c => {
      const d = parseClientDate(c.date, c.created_at);
      if (d) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [clients]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (timeRange !== 'year') count++;
    if (selectedYear !== 'all') count++;
    if (granularity !== 'auto') count++;
    if (potentialFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (staffFilter !== 'all') count++;
    return count;
  }, [timeRange, selectedYear, granularity, potentialFilter, statusFilter, categoryFilter, staffFilter]);

  const effectiveGranularity = useMemo<'day' | 'week' | 'month'>(() => {
    if (granularity !== 'auto') return granularity;
    if (timeRange === '30days' || timeRange === 'month') return 'day';
    if (timeRange === '90days' || timeRange === '6months') return 'week';
    return 'month';
  }, [granularity, timeRange]);

  const dimensionFilteredClients = useMemo(() => {
    return clients.filter(c => {
      if (potentialFilter !== 'all' && c.potential_level !== potentialFilter) return false;
      if (statusFilter !== 'all') {
        const cStatus = (c.status || 'New').toLowerCase();
        if (cStatus !== statusFilter.toLowerCase()) return false;
      }
      if (categoryFilter !== 'all' && c.case_category !== categoryFilter) return false;
      if (staffFilter !== 'all' && c.lead_by !== staffFilter) return false;
      return true;
    });
  }, [clients, potentialFilter, statusFilter, categoryFilter, staffFilter]);

  const timeWindow = useMemo<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (selectedYear !== 'all') {
      const yr = parseInt(selectedYear, 10);
      return {
        start: new Date(yr, 0, 1, 0, 0, 0, 0),
        end: new Date(yr, 11, 31, 23, 59, 59, 999)
      };
    }

    if (timeRange === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end: lastDay };
    }

    if (timeRange === '30days') {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    if (timeRange === '90days') {
      const start = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }

    if (timeRange === '6months') {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
      return { start, end };
    }

    if (timeRange === 'year') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end: endOfYear };
    }

    let earliest = new Date(now.getFullYear(), 0, 1);
    dimensionFilteredClients.forEach(c => {
      const d = parseClientDate(c.date, c.created_at);
      if (d && d < earliest) earliest = d;
    });
    earliest.setHours(0, 0, 0, 0);
    return { start: earliest, end };
  }, [timeRange, selectedYear, dimensionFilteredClients]);

  const chartBuckets = useMemo<BucketData[]>(() => {
    const { start, end } = timeWindow;
    const buckets: BucketData[] = [];

    if (effectiveGranularity === 'day') {
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const maxDays = 120;
      let count = 0;

      while (cur <= end && count < maxDays) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const d = cur.getDate();
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const shortMonth = lang === 'bm' ? monthNamesShortBm[m] : monthNamesShortEn[m];
        const fullMonth = lang === 'bm' ? monthNamesFullBm[m] : monthNamesFullEn[m];
        const label = `${d} ${shortMonth}`;
        const fullTitle = `${d} ${fullMonth} ${y}`;

        const dayStart = new Date(y, m, d, 0, 0, 0, 0);
        const dayEnd = new Date(y, m, d, 23, 59, 59, 999);

        buckets.push({
          key,
          label,
          fullTitle,
          dateStart: dayStart,
          dateEnd: dayEnd,
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
          converted: 0,
          cumulative: 0,
          clients: []
        });

        cur.setDate(cur.getDate() + 1);
        count++;
      }
    } else if (effectiveGranularity === 'week') {
      const cur = new Date(start);
      const dayOfWeek = cur.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      cur.setDate(cur.getDate() + diffToMonday);
      cur.setHours(0, 0, 0, 0);

      const maxWeeks = 60;
      let count = 0;

      while (cur <= end && count < maxWeeks) {
        const weekStart = new Date(cur);
        const weekEnd = new Date(cur);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const mStart = weekStart.getMonth();
        const dStart = weekStart.getDate();
        const mEnd = weekEnd.getMonth();
        const dEnd = weekEnd.getDate();
        const y = weekStart.getFullYear();

        const sMonth = lang === 'bm' ? monthNamesShortBm[mStart] : monthNamesShortEn[mStart];
        const eMonth = lang === 'bm' ? monthNamesShortBm[mEnd] : monthNamesShortEn[mEnd];

        const label = `${dStart} ${sMonth}`;
        const fullTitle = `${dStart} ${sMonth} - ${dEnd} ${eMonth} ${y}`;
        const key = `week-${y}-${mStart + 1}-${dStart}`;

        buckets.push({
          key,
          label,
          fullTitle,
          dateStart: weekStart,
          dateEnd: weekEnd,
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
          converted: 0,
          cumulative: 0,
          clients: []
        });

        cur.setDate(cur.getDate() + 7);
        count++;
      }
    } else {
      const startYear = start.getFullYear();
      const startMonth = start.getMonth();
      const endYear = end.getFullYear();
      const endMonth = end.getMonth();

      let curY = startYear;
      let curM = startMonth;

      while (curY < endYear || (curY === endYear && curM <= endMonth)) {
        const mStart = new Date(curY, curM, 1, 0, 0, 0, 0);
        const mEnd = new Date(curY, curM + 1, 0, 23, 59, 59, 999);
        const shortName = lang === 'bm' ? monthNamesShortBm[curM] : monthNamesShortEn[curM];
        const fullName = lang === 'bm' ? monthNamesFullBm[curM] : monthNamesFullEn[curM];

        const label = startYear === endYear ? shortName : `${shortName} '${String(curY).slice(-2)}`;
        const fullTitle = `${fullName} ${curY}`;
        const key = `${curY}-${String(curM + 1).padStart(2, '0')}`;

        buckets.push({
          key,
          label,
          fullTitle,
          dateStart: mStart,
          dateEnd: mEnd,
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
          converted: 0,
          cumulative: 0,
          clients: []
        });

        curM++;
        if (curM > 11) {
          curM = 0;
          curY++;
        }
      }
    }

    if (buckets.length === 0) return [];

    dimensionFilteredClients.forEach(client => {
      const d = parseClientDate(client.date, client.created_at);
      if (!d) return;

      const t = d.getTime();
      const bucket = buckets.find(b => t >= b.dateStart.getTime() && t <= b.dateEnd.getTime());
      if (bucket) {
        bucket.total += 1;
        if (client.potential_level === 'High') bucket.high += 1;
        else if (client.potential_level === 'Medium') bucket.medium += 1;
        else if (client.potential_level === 'Low') bucket.low += 1;

        if (client.status === 'Converted') bucket.converted += 1;
        bucket.clients.push(client);
      }
    });

    let running = 0;
    buckets.forEach(b => {
      running += b.total;
      b.cumulative = running;
    });

    return buckets;
  }, [timeWindow, effectiveGranularity, dimensionFilteredClients, lang]);

  const summaryStats = useMemo(() => {
    const totalInPeriod = chartBuckets.reduce((acc, b) => acc + b.total, 0);
    const highInPeriod = chartBuckets.reduce((acc, b) => acc + b.high, 0);
    const convertedInPeriod = chartBuckets.reduce((acc, b) => acc + b.converted, 0);

    let peakBucket: BucketData | null = null;
    chartBuckets.forEach(b => {
      if (!peakBucket || b.total > peakBucket.total) {
        peakBucket = b;
      }
    });

    const conversionRate = totalInPeriod > 0 ? Math.round((convertedInPeriod / totalInPeriod) * 100) : 0;
    const highRatio = totalInPeriod > 0 ? Math.round((highInPeriod / totalInPeriod) * 100) : 0;

    return {
      total: totalInPeriod,
      high: highInPeriod,
      highRatio,
      converted: convertedInPeriod,
      conversionRate,
      peak: peakBucket && (peakBucket as BucketData).total > 0 ? peakBucket : null
    };
  }, [chartBuckets]);

  const isUltraNarrow = containerWidth < 340; // Galaxy Z Fold cover screen (280px - 320px)
  const isMobileScreen = containerWidth < 640; // Standard mobile phones
  const isTabletScreen = containerWidth >= 640 && containerWidth < 1024; // iPads, Surface, Foldable unfolded
  const isLandscapeCompact = viewportHeight < 480; // Phone or foldable in short landscape orientation

  const chartHeight = useMemo(() => {
    if (isLandscapeCompact) return 185;
    if (isUltraNarrow) return 210;
    if (isMobileScreen) return 235;
    return 270;
  }, [isLandscapeCompact, isUltraNarrow, isMobileScreen]);

  const yAxisWidth = isUltraNarrow ? 30 : 38;
  const paddingLeft = isUltraNarrow ? 10 : 14;
  const paddingRight = isUltraNarrow ? 12 : 18;
  const paddingTop = isLandscapeCompact ? 16 : 20;
  const paddingBottom = isLandscapeCompact ? 28 : 34;

  const minStepX = isUltraNarrow ? 38 : (isMobileScreen ? 34 : 28);
  const minCalculatedWidth = paddingLeft + paddingRight + Math.max(0, chartBuckets.length - 1) * minStepX;
  const availableScrollWidth = Math.max(containerWidth - yAxisWidth - 16, 180);
  const isScrollable = minCalculatedWidth > availableScrollWidth;
  const activeCanvasWidth = isScrollable ? minCalculatedWidth : availableScrollWidth;

  const maxDataVal = useMemo(() => {
    if (chartBuckets.length === 0) return 5;
    if (chartMode === 'cumulative') {
      return Math.max(...chartBuckets.map(b => b.cumulative), 1);
    }
    const maxVals = chartBuckets.map(b => {
      if (chartMode === 'single') return b.total;
      let m = 0;
      if (visibleSeries.total) m = Math.max(m, b.total);
      if (visibleSeries.high) m = Math.max(m, b.high);
      if (visibleSeries.medium) m = Math.max(m, b.medium);
      if (visibleSeries.low) m = Math.max(m, b.low);
      if (visibleSeries.converted) m = Math.max(m, b.converted);
      return m;
    });
    return Math.max(...maxVals, 1);
  }, [chartBuckets, chartMode, visibleSeries]);

  const niceMax = useMemo(() => getNiceMax(maxDataVal), [maxDataVal]);

  const plotPoints = useMemo(() => {
    if (chartBuckets.length === 0) {
      return { total: [], high: [], medium: [], low: [], converted: [], cumulative: [] };
    }

    const usableWidth = activeCanvasWidth - paddingLeft - paddingRight;
    const usableHeight = chartHeight - paddingTop - paddingBottom;
    const stepX = chartBuckets.length > 1 ? usableWidth / (chartBuckets.length - 1) : usableWidth / 2;

    const getY = (val: number) => {
      const ratio = val / niceMax;
      return chartHeight - paddingBottom - ratio * usableHeight;
    };

    const getX = (idx: number) => {
      if (chartBuckets.length === 1) return paddingLeft + usableWidth / 2;
      return paddingLeft + idx * stepX;
    };

    return {
      total: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.total), value: b.total, bucket: b })),
      high: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.high), value: b.high, bucket: b })),
      medium: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.medium), value: b.medium, bucket: b })),
      low: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.low), value: b.low, bucket: b })),
      converted: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.converted), value: b.converted, bucket: b })),
      cumulative: chartBuckets.map((b, i) => ({ x: getX(i), y: getY(b.cumulative), value: b.cumulative, bucket: b }))
    };
  }, [chartBuckets, activeCanvasWidth, niceMax, chartHeight, paddingLeft, paddingRight, paddingTop, paddingBottom]);

  const xLabelInterval = useMemo(() => {
    const len = chartBuckets.length;
    if (isScrollable) {
      if (len <= 16) return 1;
      if (len <= 35) return 2;
      return 3;
    }
    if (len <= 8) return 1;
    if (len <= 14) return 2;
    if (len <= 26) return 3;
    return Math.ceil(len / 8);
  }, [chartBuckets.length, isScrollable]);

  const isAnyFilterActive = activeFiltersCount > 0 || chartMode !== 'breakdown';

  const handleResetFilters = () => {
    setTimeRange('year');
    setSelectedYear('all');
    setGranularity('auto');
    setPotentialFilter('all');
    setStatusFilter('all');
    setCategoryFilter('all');
    setStaffFilter('all');
    setChartMode('breakdown');
    setVisibleSeries({ total: true, high: true, medium: true, low: true, converted: true });
    if (onClearPeriodSelect) onClearPeriodSelect();
  };

  const baseY = chartHeight - paddingBottom;

  const paths = useMemo(() => {
    return {
      total: {
        line: getCurvedPath(plotPoints.total, paddingTop, baseY),
        area: getAreaPath(plotPoints.total, baseY, paddingTop, baseY)
      },
      high: {
        line: getCurvedPath(plotPoints.high, paddingTop, baseY),
        area: getAreaPath(plotPoints.high, baseY, paddingTop, baseY)
      },
      medium: {
        line: getCurvedPath(plotPoints.medium, paddingTop, baseY),
        area: getAreaPath(plotPoints.medium, baseY, paddingTop, baseY)
      },
      low: {
        line: getCurvedPath(plotPoints.low, paddingTop, baseY),
        area: getAreaPath(plotPoints.low, baseY, paddingTop, baseY)
      },
      converted: {
        line: getCurvedPath(plotPoints.converted, paddingTop, baseY),
        area: getAreaPath(plotPoints.converted, baseY, paddingTop, baseY)
      },
      cumulative: {
        line: getCurvedPath(plotPoints.cumulative, paddingTop, baseY),
        area: getAreaPath(plotPoints.cumulative, baseY, paddingTop, baseY)
      }
    };
  }, [plotPoints, baseY, paddingTop]);

  const activeBucket = hoveredIndex !== null && chartBuckets[hoveredIndex] ? chartBuckets[hoveredIndex] : null;

  const handlePointerScrub = useCallback((clientX: number) => {
    if (!svgRef.current || chartBuckets.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;

    let closestIdx = 0;
    let minDiff = Infinity;
    plotPoints.total.forEach((pt, idx) => {
      const diff = Math.abs(pt.x - x);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoveredIndex(closestIdx);
  }, [chartBuckets.length, plotPoints.total]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    handlePointerScrub(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 1 || e.pointerType === 'touch' || e.pointerType === 'pen') {
      handlePointerScrub(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      handlePointerScrub(e.touches[0].clientX);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      handlePointerScrub(e.touches[0].clientX);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        paddingLeft: 'max(0px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0px, env(safe-area-inset-right, 0px))'
      }}
      className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden flex flex-col mb-4 sm:mb-6 transition-all duration-200"
    >
      <div className="p-3 sm:p-5 border-b border-slate-100 dark:border-gray-800/80 bg-slate-50/50 dark:bg-gray-900/80 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-yellow-400 flex items-center justify-center font-bold shadow-inner flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                  {lang === 'bm' ? 'Analisis Trend Klien Berpotensi' : 'Potential Clients Trend & Acquisition'}
                </h3>
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-yellow-500/20 dark:text-yellow-300">
                  {lang === 'bm' ? 'Carta Garisan' : 'Line Chart'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5 hidden xs:block truncate">
                {lang === 'bm'
                  ? 'Jejak pergerakan prospek, aliran tahap potensi, dan pertumbuhan klien mengikut masa'
                  : 'Track prospect inflow, potential level trends, and client pipeline growth over time'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-between sm:justify-end flex-wrap">
            <div className="flex items-center bg-white dark:bg-gray-800 p-0.5 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm text-xs font-semibold flex-1 sm:flex-none justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => setChartMode('breakdown')}
                className={`flex-1 sm:flex-none px-2 xs:px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center text-[10px] sm:text-xs ${
                  chartMode === 'breakdown'
                    ? 'bg-amber-500 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bm' ? 'Pecahan' : 'Breakdown'}
              </button>
              <button
                type="button"
                onClick={() => setChartMode('single')}
                className={`flex-1 sm:flex-none px-2 xs:px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center text-[10px] sm:text-xs ${
                  chartMode === 'single'
                    ? 'bg-amber-500 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bm' ? 'Tunggal' : 'Single'}
              </button>
              <button
                type="button"
                onClick={() => setChartMode('cumulative')}
                className={`flex-1 sm:flex-none px-2 xs:px-2.5 sm:px-3 py-1.5 rounded-lg transition-all text-center text-[10px] sm:text-xs ${
                  chartMode === 'cumulative'
                    ? 'bg-amber-500 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bm' ? 'Kumulatif' : 'Cumulative'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileFiltersOpen(prev => !prev)}
              className="lg:hidden flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold shadow-sm min-h-[38px]"
            >
              <span>⚙️</span>
              <span className="text-[11px] sm:text-xs">{lang === 'bm' ? 'Tapisan' : 'Filters'}</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              <span className="text-[10px] ml-0.5">{isMobileFiltersOpen ? '▲' : '▼'}</span>
            </button>

            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-gray-700 transition-colors flex items-center gap-1.5 shadow-sm min-h-[38px]"
                title="Reset all filters"
              >
                <span>↺</span>
                <span className="hidden sm:inline">{lang === 'bm' ? 'Set Semula' : 'Reset'}</span>
              </button>
            )}
          </div>
        </div>

        <div className={`${isMobileFiltersOpen ? 'grid' : 'hidden lg:grid'} ${isUltraNarrow ? 'grid-cols-1' : 'grid-cols-2'} sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 pt-1 transition-all`}>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Julat Masa' : 'Time Range'}
            </label>
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => {
                  setTimeRange(e.target.value as any);
                  if (e.target.value !== 'all') setSelectedYear('all');
                }}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="year">{lang === 'bm' ? 'Tahun Ini (2026)' : 'This Year'}</option>
                <option value="6months">{lang === 'bm' ? '6 Bulan Lepas' : 'Last 6 Months'}</option>
                <option value="90days">{lang === 'bm' ? '90 Hari Lepas' : 'Last 90 Days'}</option>
                <option value="30days">{lang === 'bm' ? '30 Hari Lepas' : 'Last 30 Days'}</option>
                <option value="month">{lang === 'bm' ? 'Bulan Ini' : 'This Month'}</option>
                <option value="all">{lang === 'bm' ? 'Semua Masa' : 'All Time'}</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Tahun Khusus' : 'Specific Year'}
            </label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="all">{lang === 'bm' ? 'Semua / Default' : 'All / Default'}</option>
                {availableYears.map(yr => (
                  <option key={yr} value={String(yr)}>{yr}</option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Sela Masa' : 'Interval'}
            </label>
            <div className="relative">
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as any)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="auto">{lang === 'bm' ? 'Auto (Pintar)' : 'Auto (Smart)'}</option>
                <option value="day">{lang === 'bm' ? 'Harian (Hari)' : 'Daily (Day)'}</option>
                <option value="week">{lang === 'bm' ? 'Mingguan (Minggu)' : 'Weekly (Week)'}</option>
                <option value="month">{lang === 'bm' ? 'Bulanan (Bulan)' : 'Monthly (Month)'}</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Tahap Potensi' : 'Potential Level'}
            </label>
            <div className="relative">
              <select
                value={potentialFilter}
                onChange={(e) => setPotentialFilter(e.target.value as any)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="all">{lang === 'bm' ? 'Semua Tahap' : 'All Potentials'}</option>
                <option value="High">{t('clients', 'highPotential', lang)}</option>
                <option value="Medium">{t('clients', 'mediumPotential', lang)}</option>
                <option value="Low">{t('clients', 'lowPotential', lang)}</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Kategori Kes' : 'Case Category'}
            </label>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="all">{lang === 'bm' ? 'Semua Kategori' : 'All Categories'}</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'Dibawa Oleh' : 'Lead By (Staff)'}
            </label>
            <div className="relative">
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-800 dark:text-zinc-200 text-xs font-semibold rounded-xl py-2 pl-2.5 sm:pl-3 pr-7 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm appearance-none truncate min-h-[40px]"
              >
                <option value="all">{lang === 'bm' ? 'Semua Staf' : 'All Staff'}</option>
                {availableStaff.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {chartMode === 'breakdown' && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 border-t border-slate-100 dark:border-gray-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mr-1 hidden sm:inline">
              {lang === 'bm' ? 'Papar Garisan:' : 'Series Lines:'}
            </span>

            <button
              type="button"
              onClick={() => setVisibleSeries(prev => ({ ...prev, total: !prev.total }))}
              className={`flex items-center gap-1.5 px-2 xs:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all border ${
                visibleSeries.total
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-zinc-500 border-transparent opacity-60 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm"></span>
              <span>{lang === 'bm' ? 'Jumlah' : 'Total Leads'}</span>
            </button>

            <button
              type="button"
              onClick={() => setVisibleSeries(prev => ({ ...prev, high: !prev.high }))}
              className={`flex items-center gap-1.5 px-2 xs:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all border ${
                visibleSeries.high
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-zinc-500 border-transparent opacity-60 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
              <span>{t('clients', 'highPotential', lang)}</span>
            </button>

            <button
              type="button"
              onClick={() => setVisibleSeries(prev => ({ ...prev, medium: !prev.medium }))}
              className={`flex items-center gap-1.5 px-2 xs:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all border ${
                visibleSeries.medium
                  ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-zinc-500 border-transparent opacity-60 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block shadow-sm"></span>
              <span>{t('clients', 'mediumPotential', lang)}</span>
            </button>

            <button
              type="button"
              onClick={() => setVisibleSeries(prev => ({ ...prev, low: !prev.low }))}
              className={`flex items-center gap-1.5 px-2 xs:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all border ${
                visibleSeries.low
                  ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-zinc-500 border-transparent opacity-60 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-sm"></span>
              <span>{t('clients', 'lowPotential', lang)}</span>
            </button>

            <button
              type="button"
              onClick={() => setVisibleSeries(prev => ({ ...prev, converted: !prev.converted }))}
              className={`flex items-center gap-1.5 px-2 xs:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all border ${
                visibleSeries.converted
                  ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30'
                  : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-zinc-500 border-transparent opacity-60 line-through'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block shadow-sm"></span>
              <span>{lang === 'bm' ? 'Ditukar' : 'Converted'}</span>
            </button>
          </div>
        )}
      </div>

      <div className={`grid ${isUltraNarrow ? 'grid-cols-1' : 'grid-cols-2'} md:grid-cols-4 gap-2 sm:gap-3 p-2.5 sm:p-4 bg-white dark:bg-gray-900 border-b border-slate-100 dark:border-gray-800`}>
        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-gray-800/60 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between min-w-0">
          <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider truncate">
            {lang === 'bm' ? 'Jumlah Prospek' : 'Leads in Range'}
          </span>
          <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1 truncate">
            <span className="text-base xs:text-lg sm:text-2xl font-black text-slate-900 dark:text-white">
              {summaryStats.total}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-zinc-400 truncate">
              {lang === 'bm' ? 'prospek' : 'prospects'}
            </span>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-gray-800/60 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between min-w-0">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider truncate">
            {lang === 'bm' ? 'Potensi Tinggi' : 'High Potential'}
          </span>
          <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1 truncate">
            <span className="text-base xs:text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {summaryStats.high}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-600/80 dark:text-emerald-400/80">
              ({summaryStats.highRatio}%)
            </span>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-gray-800/60 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between min-w-0">
          <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider truncate">
            {lang === 'bm' ? 'Kadar Penukaran' : 'Conversion Rate'}
          </span>
          <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1 truncate">
            <span className="text-base xs:text-lg sm:text-2xl font-black text-cyan-600 dark:text-cyan-400">
              {summaryStats.conversionRate}%
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-zinc-400 truncate">
              ({summaryStats.converted})
            </span>
          </div>
        </div>

        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-gray-800/60 rounded-xl border border-slate-100 dark:border-gray-700/60 flex flex-col justify-between min-w-0">
          <span className="text-[10px] font-bold text-amber-600 dark:text-yellow-400 uppercase tracking-wider truncate">
            {lang === 'bm' ? 'Tempoh Puncak' : 'Peak Period'}
          </span>
          <div className="flex items-baseline gap-1 mt-1 truncate">
            {summaryStats.peak ? (
              <>
                <span className="text-sm xs:text-base sm:text-lg font-black text-amber-600 dark:text-yellow-400 truncate">
                  {summaryStats.peak.label}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                  ({summaryStats.peak.total})
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold text-slate-400 dark:text-zinc-500">-</span>
            )}
          </div>
        </div>
      </div>

      {selectedPeriodLabel && (
        <div className="px-3 sm:px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <span className="text-amber-500 font-bold flex-shrink-0">🔍</span>
            <span className="truncate">
              {lang === 'bm' ? 'Ditapis:' : 'Filtered:'}{' '}
              <strong className="underline">{selectedPeriodLabel}</strong>
            </span>
          </div>
          {onClearPeriodSelect && (
            <button
              type="button"
              onClick={onClearPeriodSelect}
              className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm flex-shrink-0"
            >
              ✕ {lang === 'bm' ? 'Kosongkan' : 'Clear'}
            </button>
          )}
        </div>
      )}

      {activeBucket && isMobileScreen && (
        <div className="px-3 py-1.5 bg-slate-50 dark:bg-gray-800/90 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between text-[11px] animate-fade-in">
          <div className="font-extrabold text-slate-800 dark:text-white flex items-center gap-1 truncate min-w-0">
            <span>📅</span>
            <span className="truncate">{activeBucket.fullTitle}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold flex-shrink-0 ml-2">
            <span className="text-amber-600 dark:text-yellow-400 whitespace-nowrap">
              {activeBucket.total} {lang === 'bm' ? 'prospek' : 'leads'}
            </span>
            {chartMode === 'breakdown' && (
              <span className="text-emerald-600 text-[10px] hidden xs:inline whitespace-nowrap">
                ({activeBucket.high} H / {activeBucket.medium} M)
              </span>
            )}
          </div>
        </div>
      )}

      <div className="relative p-1.5 xs:p-2 sm:p-4 w-full bg-white dark:bg-gray-900/40 select-none">
        {chartBuckets.length === 0 ? (
          <div className="h-48 sm:h-64 flex flex-col items-center justify-center text-center p-3 sm:p-6 text-slate-400 dark:text-zinc-500">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-xl mb-2">
              📈
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-zinc-300">
              {lang === 'bm' ? 'Tiada data untuk tapisan ini' : 'No prospective client data for this filter'}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-sm">
              {lang === 'bm'
                ? 'Cuba ubah julat masa atau kosongkan pilihan tapisan kategori / tahap potensi.'
                : 'Try adjusting the time range or clearing the category and potential level filters.'}
            </p>
            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-3 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
              >
                {lang === 'bm' ? 'Tetapkan Semula Tapisan' : 'Reset Filters'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-stretch w-full relative">
            <svg
              width={yAxisWidth}
              height={chartHeight}
              className="flex-shrink-0 text-[10px] fill-slate-400 dark:fill-zinc-500 font-bold select-none border-r border-slate-200/80 dark:border-gray-800/80 bg-white dark:bg-gray-900 z-10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = chartHeight - paddingBottom - ratio * (chartHeight - paddingTop - paddingBottom);
                const val = Math.round(ratio * niceMax);

                return (
                  <text key={idx} x={yAxisWidth - 5} y={y + 3.5} textAnchor="end">
                    {val}
                  </text>
                );
              })}
            </svg>

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin select-none relative touch-pan-x overscroll-x-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <svg
                ref={svgRef}
                width={activeCanvasWidth}
                height={chartHeight}
                viewBox={`0 0 ${activeCanvasWidth} ${chartHeight}`}
                className="overflow-visible cursor-crosshair touch-manipulation"
                onMouseLeave={() => setHoveredIndex(null)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <defs>
                  <filter id="lineGlowAdaptive" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
                  </filter>

                  <linearGradient id="totalGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="highGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="mediumGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="lowGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="convertedGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>

                  <linearGradient id="cumulativeGradA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = chartHeight - paddingBottom - ratio * (chartHeight - paddingTop - paddingBottom);

                  return (
                    <line
                      key={idx}
                      x1={0}
                      y1={y}
                      x2={activeCanvasWidth}
                      y2={y}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray={idx === 0 ? undefined : '4,4'}
                      className={idx === 0 ? 'text-slate-300 dark:text-gray-700' : 'text-slate-200 dark:text-gray-800'}
                    />
                  );
                })}

                {chartMode === 'cumulative' && (
                  <g>
                    {paths.cumulative.area && (
                      <path d={paths.cumulative.area} fill="url(#cumulativeGradA)" className="transition-all duration-300" />
                    )}
                    {paths.cumulative.line && (
                      <path
                        d={paths.cumulative.line}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#lineGlowAdaptive)"
                        className="transition-all duration-300"
                      />
                    )}
                    {plotPoints.cumulative.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredIndex === i ? 6 : 3.5}
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth={hoveredIndex === i ? 2.5 : 1.5}
                        className="transition-all duration-200 cursor-pointer"
                      />
                    ))}
                  </g>
                )}

                {chartMode === 'single' && (
                  <g>
                    {paths.total.area && (
                      <path d={paths.total.area} fill="url(#totalGradA)" className="transition-all duration-300" />
                    )}
                    {paths.total.line && (
                      <path
                        d={paths.total.line}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#lineGlowAdaptive)"
                        className="transition-all duration-300"
                      />
                    )}
                    {plotPoints.total.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredIndex === i ? 6 : 3.5}
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth={hoveredIndex === i ? 2.5 : 1.5}
                        className="transition-all duration-200 cursor-pointer"
                      />
                    ))}
                  </g>
                )}

                {chartMode === 'breakdown' && (
                  <>
                    {visibleSeries.converted && (
                      <g>
                        {paths.converted.area && (
                          <path d={paths.converted.area} fill="url(#convertedGradA)" className="transition-all duration-300" />
                        )}
                        {paths.converted.line && (
                          <path
                            d={paths.converted.line}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        )}
                      </g>
                    )}

                    {visibleSeries.low && (
                      <g>
                        {paths.low.area && (
                          <path d={paths.low.area} fill="url(#lowGradA)" className="transition-all duration-300" />
                        )}
                        {paths.low.line && (
                          <path
                            d={paths.low.line}
                            fill="none"
                            stroke="#8b5cf6"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        )}
                      </g>
                    )}

                    {visibleSeries.medium && (
                      <g>
                        {paths.medium.area && (
                          <path d={paths.medium.area} fill="url(#mediumGradA)" className="transition-all duration-300" />
                        )}
                        {paths.medium.line && (
                          <path
                            d={paths.medium.line}
                            fill="none"
                            stroke="#f97316"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        )}
                      </g>
                    )}

                    {visibleSeries.high && (
                      <g>
                        {paths.high.area && (
                          <path d={paths.high.area} fill="url(#highGradA)" className="transition-all duration-300" />
                        )}
                        {paths.high.line && (
                          <path
                            d={paths.high.line}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        )}
                      </g>
                    )}

                    {visibleSeries.total && (
                      <g>
                        {paths.total.area && (
                          <path d={paths.total.area} fill="url(#totalGradA)" className="transition-all duration-300" />
                        )}
                        {paths.total.line && (
                          <path
                            d={paths.total.line}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#lineGlowAdaptive)"
                            className="transition-all duration-300"
                          />
                        )}
                      </g>
                    )}

                    {chartBuckets.map((_, i) => {
                      const isHov = hoveredIndex === i;
                      return (
                        <g key={i}>
                          {visibleSeries.converted && (
                            <circle
                              cx={plotPoints.converted[i].x}
                              cy={plotPoints.converted[i].y}
                              r={isHov ? 5 : 2.5}
                              fill="#06b6d4"
                              stroke="#ffffff"
                              strokeWidth={isHov ? 2 : 1}
                              className="transition-all duration-150"
                            />
                          )}
                          {visibleSeries.low && (
                            <circle
                              cx={plotPoints.low[i].x}
                              cy={plotPoints.low[i].y}
                              r={isHov ? 5 : 2.5}
                              fill="#8b5cf6"
                              stroke="#ffffff"
                              strokeWidth={isHov ? 2 : 1}
                              className="transition-all duration-150"
                            />
                          )}
                          {visibleSeries.medium && (
                            <circle
                              cx={plotPoints.medium[i].x}
                              cy={plotPoints.medium[i].y}
                              r={isHov ? 5 : 2.5}
                              fill="#f97316"
                              stroke="#ffffff"
                              strokeWidth={isHov ? 2 : 1}
                              className="transition-all duration-150"
                            />
                          )}
                          {visibleSeries.high && (
                            <circle
                              cx={plotPoints.high[i].x}
                              cy={plotPoints.high[i].y}
                              r={isHov ? 5 : 2.5}
                              fill="#10b981"
                              stroke="#ffffff"
                              strokeWidth={isHov ? 2 : 1}
                              className="transition-all duration-150"
                            />
                          )}
                          {visibleSeries.total && (
                            <circle
                              cx={plotPoints.total[i].x}
                              cy={plotPoints.total[i].y}
                              r={isHov ? 6 : 3.5}
                              fill="#f59e0b"
                              stroke="#ffffff"
                              strokeWidth={isHov ? 2.5 : 1.5}
                              className="transition-all duration-150"
                            />
                          )}
                        </g>
                      );
                    })}
                  </>
                )}

                {hoveredIndex !== null && chartBuckets[hoveredIndex] && (
                  <g>
                    <line
                      x1={plotPoints.total[hoveredIndex].x}
                      y1={paddingTop}
                      x2={plotPoints.total[hoveredIndex].x}
                      y2={baseY}
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeDasharray="3,3"
                      className="opacity-75"
                    />
                    <rect
                      x={plotPoints.total[hoveredIndex].x - 14}
                      y={paddingTop}
                      width={28}
                      height={baseY - paddingTop}
                      fill="currentColor"
                      className="text-amber-500/10 pointer-events-none"
                    />
                  </g>
                )}

                {chartBuckets.map((bucket, idx) => {
                  const usableWidth = activeCanvasWidth - paddingLeft - paddingRight;
                  const stepX = chartBuckets.length > 1 ? usableWidth / (chartBuckets.length - 1) : usableWidth;
                  const hitWidth = Math.max(stepX, 28);
                  const xPos = plotPoints.total[idx].x - hitWidth / 2;

                  return (
                    <rect
                      key={bucket.key}
                      x={xPos}
                      y={paddingTop}
                      width={hitWidth}
                      height={baseY - paddingTop + 20}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onClick={() => {
                        if (onPeriodSelect) {
                          onPeriodSelect(bucket.fullTitle, bucket.clients);
                        }
                      }}
                    />
                  );
                })}

                {chartBuckets.map((bucket, idx) => {
                  const showLabel = idx % xLabelInterval === 0 || idx === chartBuckets.length - 1;
                  if (!showLabel) return null;

                  const pt = plotPoints.total[idx];
                  const isHov = hoveredIndex === idx;

                  return (
                    <g key={bucket.key}>
                      <line
                        x1={pt.x}
                        y1={baseY}
                        x2={pt.x}
                        y2={baseY + 4}
                        stroke="currentColor"
                        className="text-slate-300 dark:text-gray-700"
                      />
                      <text
                        x={pt.x}
                        y={baseY + (isLandscapeCompact ? 13 : 16)}
                        textAnchor="middle"
                        className={`text-[9px] sm:text-[10px] font-bold transition-colors ${
                          isHov
                            ? 'fill-amber-600 dark:fill-yellow-400 font-black'
                            : 'fill-slate-400 dark:fill-zinc-500'
                        }`}
                      >
                        {bucket.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {activeBucket && hoveredIndex !== null && !isMobileScreen && (
                <div
                  className="absolute z-40 pointer-events-none transition-all duration-75 flex flex-col gap-1.5 sm:gap-2 p-2.5 sm:p-3.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200 dark:border-zinc-700 shadow-2xl text-xs min-w-[180px] sm:min-w-[210px]"
                  style={{
                    left: `${Math.min(
                      Math.max(8, plotPoints.total[hoveredIndex].x - 90),
                      activeCanvasWidth - (isUltraNarrow ? 175 : 220)
                    )}px`,
                    top: isLandscapeCompact ? '4px' : '8px'
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1">
                    <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                      <span>📅</span>
                      <span className="truncate max-w-[130px] sm:max-w-[150px]">{activeBucket.fullTitle}</span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-yellow-500/20 text-amber-700 dark:text-yellow-400 flex-shrink-0">
                      {activeBucket.total}
                    </span>
                  </div>

                  {chartMode === 'cumulative' ? (
                    <div className="flex justify-between items-center py-0.5">
                      <span className="font-semibold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        {lang === 'bm' ? 'Kumulatif:' : 'Cumulative:'}
                      </span>
                      <strong className="text-blue-600 dark:text-blue-400 text-sm">
                        {activeBucket.cumulative}
                      </strong>
                    </div>
                  ) : (
                    <div className="space-y-1 pt-0.5 text-[11px]">
                      <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {t('clients', 'highPotential', lang)}:
                        </span>
                        <strong className="font-bold">{activeBucket.high}</strong>
                      </div>

                      <div className="flex justify-between items-center text-orange-600 dark:text-orange-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                          {t('clients', 'mediumPotential', lang)}:
                        </span>
                        <strong className="font-bold">{activeBucket.medium}</strong>
                      </div>

                      <div className="flex justify-between items-center text-purple-600 dark:text-purple-400">
                        <span className="font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          {t('clients', 'lowPotential', lang)}:
                        </span>
                        <strong className="font-bold">{activeBucket.low}</strong>
                      </div>

                      <div className="flex justify-between items-center text-cyan-600 dark:text-cyan-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                        <span className="font-semibold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                          {lang === 'bm' ? 'Klien Ditukar:' : 'Converted:'}
                        </span>
                        <strong className="font-bold">{activeBucket.converted}</strong>
                      </div>
                    </div>
                  )}

                  {onPeriodSelect && (
                    <div className="text-[9px] text-center font-bold text-amber-600 dark:text-yellow-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                      💡 {lang === 'bm' ? 'Klik untuk tapis jadual' : 'Click to filter table'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-slate-50/70 dark:bg-gray-900/60 border-t border-slate-100 dark:border-gray-800 text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-amber-500 font-bold flex-shrink-0">★</span>
          <span className="truncate">
            {isScrollable
              ? lang === 'bm'
                ? '← Leret carta secara mendatar untuk lihat semua tarikh. Sentuh untuk lihat statistik.'
                : '← Swipe chart horizontally to explore all dates. Touch & drag to inspect numbers.'
              : lang === 'bm'
                ? 'Klik mana-mana titik pada carta untuk menapis senarai klien berpotensi di bawah.'
                : 'Click any data point on the line chart to filter the client table below.'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-zinc-300 flex-shrink-0">
          <span>{lang === 'bm' ? 'Sela:' : 'Interval:'}</span>
          <span className="capitalize font-bold text-amber-600 dark:text-yellow-500">
            {effectiveGranularity}
          </span>
        </div>
      </div>
    </div>
  );
}
