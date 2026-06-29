import * as XLSX from 'xlsx-js-style';

// Helper to format duration in milliseconds to HH:MM:SS
function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Helper to extract HH:MM:SS from an ISO date string
function extractTime(isoString: string): string {
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const exportAttendanceToExcel = (
  records: any[],
  filterMode: 'date' | 'month',
  selectedDate: string,
  selectedMonth: string,
  publicHolidays: any[] = []
) => {
  if (!records || records.length === 0) return;

  // Determine the month to generate calendar for.
  const targetMonthStr = filterMode === 'month' ? selectedMonth : selectedDate.slice(0, 7);
  const [yearStr, monthStr] = targetMonthStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-indexed for Date

  // Generate calendar weeks for the month
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];

  // Pad the first week if the month doesn't start on Sunday
  const startDay = startDate.getDay(); // 0 is Sunday
  for (let i = 0; i < startDay; i++) {
    const padDate = new Date(year, month, 1 - (startDay - i));
    currentWeek.push(padDate);
  }

  for (let d = 1; d <= endDate.getDate(); d++) {
    const currentDate = new Date(year, month, d);
    currentWeek.push(currentDate);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Pad the last week if the month doesn't end on Saturday
  if (currentWeek.length > 0) {
    const daysToPad = 7 - currentWeek.length;
    const lastDate = currentWeek[currentWeek.length - 1];
    for (let i = 1; i <= daysToPad; i++) {
      const padDate = new Date(lastDate);
      padDate.setDate(lastDate.getDate() + i);
      currentWeek.push(padDate);
    }
    weeks.push(currentWeek);
  }

  // Group records by employee
  const recordsByEmployee: Record<string, any[]> = {};
  records.forEach(r => {
    const empName = r.user_name || 'Unknown';
    if (!recordsByEmployee[empName]) {
      recordsByEmployee[empName] = [];
    }
    recordsByEmployee[empName].push(r);
  });

  const wb = XLSX.utils.book_new();
  const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  Object.entries(recordsByEmployee).forEach(([empName, empRecords]) => {
    // Map records by date string 'YYYY-MM-DD' for easy lookup (supporting multiple records per day)
    const recordsByDate: Record<string, any[]> = {};
    empRecords.forEach(r => {
      if (r.date) {
        if (!recordsByDate[r.date]) {
          recordsByDate[r.date] = [];
        }
        recordsByDate[r.date].push(r);
      }
    });

    const aoa: any[][] = [];

    // Title row
    aoa.push([`Attendance Report: ${empName} - ${targetMonthStr}`, '', '', '', '', '', '', '']);
    aoa.push(['', '', '', '', '', '', '', '']); // Empty row

    weeks.forEach((week, weekIdx) => {
      aoa.push([`Week ${weekIdx + 1}`, '', '', '', '', '', '', '']);
      aoa.push(['Metrics', ...DAYS_OF_WEEK]);

      const dateRow: any[] = ['Date'];
      const clockInRow: any[] = ['Clock In Time'];
      const clockOutRow: any[] = ['Clock Out Time'];
      const totalWorkRow: any[] = ['Total Working Time'];
      const breakRow: any[] = ['Break'];
      const totalHoursRow: any[] = ['Total Hours'];
      const maxWorkRow: any[] = ['Max Working Time'];
      const overtimeRow: any[] = ['Overtime'];

      week.forEach(day => {
        const y = day.getFullYear();
        const m = String(day.getMonth() + 1).padStart(2, '0');
        const d = String(day.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`; // Local YYYY-MM-DD

        dateRow.push(`${d}/${m}/${y}`);

        const dayRecords = recordsByDate[dateStr] || [];
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

        // Check for public holiday
        const holiday = publicHolidays.find(h => h.date === dateStr);
        const isPublicHoliday = !!holiday;

        let defaultStatus = isWeekend ? (day.getDay() === 0 ? 'Rest Day' : 'Off Day') : 'N/A';
        if (isPublicHoliday) {
          defaultStatus = holiday.name;
        }

        if (dayRecords.length > 0) {
          // Check if this day is a leave day
          const leaveRecord = dayRecords.find(r => r.is_leave);
          
          if (leaveRecord) {
            const leaveMsg = `On Leave (${leaveRecord.leave_type || 'Approved'})`;
            clockInRow.push(leaveMsg);
            clockOutRow.push(leaveMsg);
            totalWorkRow.push('N/A');
            breakRow.push('N/A');
            totalHoursRow.push('N/A');
            maxWorkRow.push('N/A');
            overtimeRow.push('N/A');
          } else {
            // Sort by clock_in_time ascending
            dayRecords.sort((a, b) => new Date(a.clock_in_time).getTime() - new Date(b.clock_in_time).getTime());

            const firstRecord = dayRecords[0];
            const lastRecord = dayRecords[dayRecords.length - 1];
            const isCompleted = dayRecords.every(r => r.clock_out_time);

          // 1. Clock In Time (first clock-in of the day)
          clockInRow.push(firstRecord.clock_in_time ? extractTime(firstRecord.clock_in_time) : 'N/A');

          // 2. Clock Out Time (last clock-out of the day, or 'No Clockout' if incomplete)
          clockOutRow.push(isCompleted ? extractTime(lastRecord.clock_out_time) : 'No Clockout');

          // 3. Sum of durations of all completed sessions on this day
          let totalWorkMs = 0;
          dayRecords.forEach(r => {
            if (r.clock_in_time && r.clock_out_time) {
              totalWorkMs += new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime();
            }
          });
          totalWorkRow.push(formatDuration(totalWorkMs));

          // 4. Calculate gaps between shifts as part of break time
          let gapMs = 0;
          for (let i = 0; i < dayRecords.length - 1; i++) {
            const prevOut = dayRecords[i].clock_out_time;
            const nextIn = dayRecords[i + 1].clock_in_time;
            if (prevOut && nextIn) {
              const gap = new Date(nextIn).getTime() - new Date(prevOut).getTime();
              if (gap > 0) gapMs += gap;
            }
          }

          // 5. Total break time: 1 hour default + gaps
          const originalBreakMs = 60 * 60 * 1000; // 1 hour
          const totalBreakMs = originalBreakMs + gapMs;
          breakRow.push(formatDuration(totalBreakMs));

          // 6. Total Hours: totalWorkMs - originalBreakMs (only if completed)
          if (isCompleted) {
            const totalHoursMs = Math.max(0, totalWorkMs - originalBreakMs);
            totalHoursRow.push(formatDuration(totalHoursMs));

            // 7. Overtime: totalHoursMs - 8 hours
            const maxWorkMs = 8 * 60 * 60 * 1000; // 8 hours
            const overtimeMs = Math.max(0, totalHoursMs - maxWorkMs);
            overtimeRow.push(formatDuration(overtimeMs));
          } else {
            totalHoursRow.push('N/A');
            overtimeRow.push('N/A');
          }

          maxWorkRow.push('08:00:00');
          }
        } else {
          clockInRow.push(defaultStatus);
          clockOutRow.push(defaultStatus);
          totalWorkRow.push('N/A');
          breakRow.push('N/A');
          totalHoursRow.push('N/A');
          maxWorkRow.push('N/A');
          overtimeRow.push('N/A');
        }
      });

      aoa.push(dateRow);
      aoa.push(clockInRow);
      aoa.push(clockOutRow);
      aoa.push(totalWorkRow);
      aoa.push(breakRow);
      aoa.push(totalHoursRow);
      aoa.push(maxWorkRow);
      aoa.push(overtimeRow);

      aoa.push(['', '', '', '', '', '', '', '']); // Spacer between weeks
      aoa.push(['', '', '', '', '', '', '', '']); // Spacer
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Apply styling
    Object.keys(ws).forEach(key => {
      if (key.startsWith('!')) return; // Skip metadata keys like !cols, !ref

      const decoded = XLSX.utils.decode_cell(key);
      const r = decoded.r;
      const c = decoded.c;

      const cell = ws[key];
      const val = String(cell.v || '').trim();

      const isDaysRow = ["Metrics", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(val);
      const isWeekCount = val.startsWith("Week ");
      const isNA = val === "N/A" || val === "No Clockout" || val === "Rest Day" || val === "Off Day";
      const isTitle = val.startsWith("Attendance Report:");
      const isDate = /^\d{2}\/\d{2}\/\d{4}$/.test(val);

      if (!cell.s) cell.s = {};

      // 1. Bold Formatting
      if (c === 0 || isDaysRow || isWeekCount || isNA || isTitle || isDate) {
        cell.s.font = { bold: true };
      }

      let isHeaderRow = false;
      let isPublicHolidayCol = false;

      if (r >= 3 && c >= 0 && c <= 7) {
        const offsetRow = r - 3;
        const rowInBlock = offsetRow % 12;
        if (rowInBlock === 0 || rowInBlock === 1) {
          isHeaderRow = true; // Metrics or Date row
        }

        // Check if the current column is a public holiday by looking at the Date row
        if (c >= 1 && rowInBlock <= 8) {
          const blockStartRow = r - rowInBlock;
          const dateCellRef = XLSX.utils.encode_cell({ r: blockStartRow + 1, c: c });
          const dateCell = ws[dateCellRef];
          if (dateCell && dateCell.v) {
            const parts = String(dateCell.v).split('/');
            if (parts.length === 3) {
              const [d, m, y] = parts;
              const dateStr = `${y}-${m}-${d}`;
              if (publicHolidays.some(h => h.date === dateStr)) {
                isPublicHolidayCol = true;
              }
            }
          }
        }
      }

      // 2. Background Color / Highlighting
      if (isPublicHolidayCol) {
        cell.s.fill = { fgColor: { rgb: "FFE1BEE7" } }; // Light Purple for Public Holidays
      } else if (val === "Rest Day") {
        cell.s.fill = { fgColor: { rgb: "FFFFCDD2" } }; // Light Red for Sunday
      } else if (val === "Off Day") {
        cell.s.fill = { fgColor: { rgb: "FFFFE082" } }; // Light Amber/Yellow for Saturday
      } else if (isHeaderRow) {
        cell.s.fill = { fgColor: { rgb: "FFDCEDC8" } }; // Light Green for Metrics/Date rows
      } else {
        cell.s.fill = { fgColor: { rgb: "FFFFFFFF" } }; // White for everything else
      }

      // 3. Bold Outer Borders for Weekly Blocks
      // A weekly block starts at r = 3 + idx*12 and ends at r = 11 + idx*12 (9 rows total per box)
      // Each week adds exactly 12 rows to the sheet (2 header + 8 data + 2 spacer)
      if (r >= 3 && c >= 0 && c <= 7) {
        const offsetRow = r - 3;
        const rowInBlock = offsetRow % 12;

        // Rows 0 to 8 within a block represent the 9 rows of the table (Metrics down to Overtime)
        if (rowInBlock <= 8) {
          const border: any = {};
          if (rowInBlock === 0) border.top = { style: "medium", color: { rgb: "FF000000" } };
          if (rowInBlock === 8) border.bottom = { style: "medium", color: { rgb: "FF000000" } };
          if (c === 0) border.left = { style: "medium", color: { rgb: "FF000000" } };
          if (c === 7) border.right = { style: "medium", color: { rgb: "FF000000" } };

          if (Object.keys(border).length > 0) {
            cell.s.border = border;
          }
        }
      }
    });

    // Hide default Excel gridlines for a clean "white background" look globally
    ws['!views'] = [{ showGridLines: false }];

    // Merge the title row (row 0) across the first 6 columns (A1 to F1) so long names aren't cut off
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }
    ];

    // Make columns a bit wider for visibility
    const colWidths = [20, 15, 15, 15, 15, 15, 15, 15];
    ws['!cols'] = colWidths.map(width => ({ wch: width }));

    // Clean sheet name (Excel limits to 31 chars and no special chars)
    let sheetName = empName.replace(/[\\/?*\[\]]/g, '').substring(0, 31);
    if (!sheetName) sheetName = 'Sheet';

    // Ensure unique sheet name in case of duplicates
    let suffix = 1;
    let finalSheetName = sheetName;
    while (wb.SheetNames.includes(finalSheetName)) {
      finalSheetName = `${sheetName.substring(0, 28)}_${suffix}`;
      suffix++;
    }

    XLSX.utils.book_append_sheet(wb, ws, finalSheetName);
  });

  const filename = `Attendance_${targetMonthStr}.xlsx`;
  XLSX.writeFile(wb, filename);
};
