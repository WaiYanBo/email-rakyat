import React, { useState, useEffect, useRef } from 'react';

export interface BarChartItem {
  key: string;
  label: string;
  value: number;
  isLeave?: boolean;
  isHoliday?: boolean;
  tooltipData: {
    title: string;
    items: { label: string; value: string | number; badge?: { text: string; type: 'success' | 'warning' | 'info' } }[];
  };
}

interface InteractiveBarChartProps {
  data: BarChartItem[];
  chartHeight?: number;
  dayWidth?: number;
  yAxisSuffix?: string;
  maxOverride?: number;
  barColorGradStart?: string;
  barColorGradEnd?: string;
  barColorHoverStart?: string;
  barColorHoverEnd?: string;
  onScrollChange?: (visibleItems: BarChartItem[]) => void;
  onBarClick?: (item: BarChartItem) => void;
}

export default function InteractiveBarChart({
  data,
  chartHeight = 160,
  dayWidth = 65,
  yAxisSuffix = '',
  maxOverride = 12,
  barColorGradStart = '#818cf8',
  barColorGradEnd = '#4f46e5',
  barColorHoverStart = '#fbbf24',
  barColorHoverEnd = '#f59e0b',
  onScrollChange,
  onBarClick
}: InteractiveBarChartProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const paddingLeft = 15;
  const paddingRight = 15;
  const axisOffset = 25;
  const paddingY = 28;

  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const update = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth);
      }
    };
    update();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(scrollContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const minContentWidth = paddingLeft + paddingRight + 2 * axisOffset + Math.max(0, data.length - 1) * dayWidth;
  const scrollWidth = Math.max(containerWidth, minContentWidth, 240);
  const maxVal = Math.max(...data.map(d => d.value), maxOverride, 1);

  const getBarX = (index: number) => {
    if (data.length <= 1) {
      return scrollWidth / 2;
    }
    const availableWidth = scrollWidth - paddingLeft - paddingRight - 2 * axisOffset;
    const step = availableWidth / (data.length - 1);
    return paddingLeft + axisOffset + index * step;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!scrollContainerRef.current) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.clientX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !scrollContainerRef.current) return;
    
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      handlePointerUp(e);
      return;
    }

    if (e.pointerType === 'mouse') {
      const x = e.clientX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX) * 1.5; // Scroll speed multiplier
      
      if (Math.abs(x - startX) > 5) {
        setHasDragged(true);
      }
      
      e.preventDefault();
      scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setTimeout(() => setHasDragged(false), 50);
  };

  const handleBarClickWrapper = (d: BarChartItem) => {
    if (!hasDragged && onBarClick) {
      onBarClick(d);
    }
  };

  const scrollTicking = useRef(false);

  const handleScroll = () => {
    if (!scrollContainerRef.current || data.length === 0 || !onScrollChange) return;
    
    if (!scrollTicking.current) {
      window.requestAnimationFrame(() => {
        if (!scrollContainerRef.current) {
            scrollTicking.current = false;
            return;
        }
        const container = scrollContainerRef.current;
        const sLeft = container.scrollLeft;
        const width = container.clientWidth;

        const visible = data.filter((_, index) => {
          const x = getBarX(index);
          return x >= sLeft && x <= sLeft + width;
        });
        onScrollChange(visible);
        scrollTicking.current = false;
      });
      scrollTicking.current = true;
    }
  };


  const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const lastDateStr = data.length > 0 ? data[data.length - 1].key : '';
  const lastMonthNum = lastDateStr ? parseInt(lastDateStr.split('-')[1], 10) : 0;
  const displayMonth = lastMonthNum > 0 ? monthNamesEn[lastMonthNum - 1] : '';

  return (
    <div className="flex items-stretch min-h-[180px] w-full relative">
      {displayMonth && (
        <div className="absolute top-2 right-4 text-sm font-black uppercase tracking-widest text-slate-200 dark:text-zinc-800/50 select-none pointer-events-none z-0">
          {displayMonth}
        </div>
      )}
      <svg 
        width="40" 
        height={chartHeight} 
        className="flex-shrink-0 text-[10px] fill-slate-400 dark:fill-zinc-500 font-semibold select-none mr-2"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingY + ratio * (chartHeight - 2 * paddingY);
          const val = Math.round((maxVal - ratio * maxVal) * 10) / 10;
          return (
            <text key={idx} x="35" y={y + 4} textAnchor="end">
              {val}{yAxisSuffix}
            </text>
          );
        })}
      </svg>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin select-none relative touch-pan-x overscroll-x-contain"
        style={{ overflowAnchor: 'none' }}
      >
        <svg 
          width={scrollWidth} 
          height={chartHeight}
          viewBox={`0 0 ${scrollWidth} ${chartHeight}`} 
          className="text-slate-305 dark:text-zinc-700 cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
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

          {data.map((d, index) => {
            const x = getBarX(index);
            const barWidth = 32;
            
            const activeHeight = d.value > 0 ? (d.value / maxVal) * (chartHeight - 2 * paddingY) : 4;
            const y = chartHeight - paddingY - activeHeight;
            
            const isHovered = hoveredBar === index;

            const dayPart = d.key.split('-')[2];
            const hasSubLabel = Boolean(
              dayPart && 
              d.label !== dayPart && 
              d.label !== String(parseInt(dayPart, 10))
            );

            return (
              <g 
                key={d.label} 
                className={onBarClick ? 'cursor-pointer' : 'cursor-default'}
                onMouseEnter={() => setHoveredBar(index)}
                onMouseLeave={() => setHoveredBar(null)}
                onClick={() => handleBarClickWrapper(d)}
                onPointerDown={(e) => e.stopPropagation()} // Prevent parent from starting a drag if tapping
              >
                <rect 
                  x={x - barWidth/2 - 10} 
                  y={paddingY} 
                  width={barWidth + 20} 
                  height={chartHeight - 2 * paddingY} 
                  fill="transparent" 
                />

                <defs>
                  <linearGradient id={`barGrad-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.isLeave ? '#fbbf24' : (d.isHoliday ? '#22d3ee' : barColorGradStart)} />
                    <stop offset="100%" stopColor={d.isLeave ? '#ea580c' : (d.isHoliday ? '#0891b2' : barColorGradEnd)} />
                  </linearGradient>
                  <linearGradient id={`barGradHover-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.isLeave ? '#fde047' : (d.isHoliday ? '#67e8f9' : barColorHoverStart)} />
                    <stop offset="100%" stopColor={d.isLeave ? '#f97316' : (d.isHoliday ? '#06b6d4' : barColorHoverEnd)} />
                  </linearGradient>
                </defs>

                <rect 
                  x={x - barWidth / 2} 
                  y={y} 
                  width={barWidth} 
                  height={Math.max(activeHeight, 4)} 
                  rx={6} 
                  ry={6}
                  fill={isHovered ? `url(#barGradHover-${d.key})` : `url(#barGrad-${d.key})`}
                  className="transition-all duration-300 ease-out shadow-sm opacity-90 hover:opacity-100" 
                />

                <text 
                  x={x} 
                  y={hasSubLabel ? chartHeight - 14 : chartHeight - 8} 
                  textAnchor="middle" 
                  className={`text-[10px] font-bold ${isHovered ? 'fill-indigo-600 dark:fill-yellow-500' : 'fill-slate-500 dark:fill-zinc-400'}`}
                >
                  {d.label}
                </text>
                {hasSubLabel && (
                  <text 
                    x={x} 
                    y={chartHeight - 2} 
                    textAnchor="middle" 
                    className={`text-[9px] font-semibold ${isHovered ? 'fill-indigo-400 dark:fill-yellow-600/70' : 'fill-slate-400 dark:fill-zinc-500'}`}
                  >
                    {dayPart}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoveredBar !== null && data[hoveredBar] && (
          <div 
            className="absolute z-50 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-xl pointer-events-none flex flex-col gap-1.5 transition-all text-xs min-w-[170px] whitespace-nowrap"
            style={{
              left: `${Math.min(
                Math.max(10, getBarX(hoveredBar) - 85),
                scrollWidth - 180
              )}px`,
              bottom: '40px',
              opacity: isDragging ? 0 : 1
            }}
          >
            <div className="font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-zinc-800 pb-1.5">
              {data[hoveredBar].tooltipData.title}
            </div>
            {data[hoveredBar].tooltipData.items.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1 pt-1">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-600 dark:text-zinc-300 font-semibold">{item.label}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
                </div>
                {item.badge && (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {item.badge.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
