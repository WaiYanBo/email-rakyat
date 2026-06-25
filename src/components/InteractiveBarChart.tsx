import React, { useState, useEffect, useRef } from 'react';

export interface BarChartItem {
  key: string;
  label: string;
  value: number;
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

  const paddingLeft = 15;
  const paddingRight = 15;
  const axisOffset = 25;
  const paddingY = 20;

  // Calculate coordinates and grid constraints
  const scrollWidth = paddingLeft + paddingRight + 2 * axisOffset + (data.length - 1) * dayWidth;
  const maxVal = Math.max(...data.map(d => d.value), maxOverride, 1);

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
    const walk = (x - startX) * 1.5; // Scroll speed multiplier
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current || data.length === 0 || !onScrollChange) return;
    const container = scrollContainerRef.current;
    const sLeft = container.scrollLeft;
    const width = container.clientWidth;

    const step = (scrollWidth - paddingLeft - paddingRight - 2 * axisOffset) / (data.length - 1);
    const visible = data.filter((_, index) => {
      const x = paddingLeft + axisOffset + index * step;
      return x >= sLeft && x <= sLeft + width;
    });
    onScrollChange(visible);
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      // Delay slightly to ensure scroll position is registered and layouts are computed
      const timer = setTimeout(() => {
        handleScroll();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [data]);

  return (
    <div className="flex items-stretch min-h-[180px] w-full">
      {/* Y Axis Labels (Static on the Left) */}
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
          {data.map((d, index) => {
            const step = (scrollWidth - paddingLeft - paddingRight - 2 * axisOffset) / (data.length - 1);
            const x = paddingLeft + axisOffset + index * step;
            const barWidth = 32;
            
            // Height calculations
            const activeHeight = d.value > 0 ? (d.value / maxVal) * (chartHeight - 2 * paddingY) : 4;
            const y = chartHeight - paddingY - activeHeight;
            
            const isHovered = hoveredBar === index;

            return (
              <g 
                key={index} 
                className={onBarClick ? 'cursor-pointer' : 'cursor-default'}
                onMouseEnter={() => setHoveredBar(index)}
                onMouseLeave={() => setHoveredBar(null)}
                onClick={() => onBarClick?.(d)}
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
                    <stop offset="0%" stopColor={barColorGradStart} />
                    <stop offset="100%" stopColor={barColorGradEnd} />
                  </linearGradient>
                  <linearGradient id={`barGradHover-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={barColorHoverStart} />
                    <stop offset="100%" stopColor={barColorHoverEnd} />
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
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Custom Tooltip */}
        {hoveredBar !== null && data[hoveredBar] && (
          <div 
            className="absolute z-20 p-3 rounded-xl bg-white/95 dark:bg-zinc-900/95 border border-slate-200 dark:border-zinc-800 shadow-xl backdrop-blur-sm pointer-events-none flex flex-col gap-1 transition-all text-xs min-w-[170px] whitespace-nowrap"
            style={{
              left: `${Math.min(
                Math.max(20, (paddingLeft + axisOffset + hoveredBar * ((scrollWidth - paddingLeft - paddingRight - 2 * axisOffset) / (data.length - 1))) - 85),
                scrollWidth - 190
              )}px`,
              bottom: '50px',
            }}
          >
            <div className="font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-zinc-800 pb-1">
              {data[hoveredBar].tooltipData.title}
            </div>
            {data[hoveredBar].tooltipData.items.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-0.5 pt-1">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-500 dark:text-zinc-300 font-medium">{item.label}</span>
                  <span className="font-bold text-slate-800 dark:text-white">{item.value}</span>
                </div>
                {item.badge && (
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
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
