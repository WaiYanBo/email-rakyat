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
  selectedMonth: string
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
    // Map records by date string 'YYYY-MM-DD' for easy lookup
    const recordsByDate: Record<string, any> = {};
    empRecords.forEach(r => {
      if (r.date) recordsByDate[r.date] = r;
    });

    const aoa: any[][] = [];

    // Title row
    aoa.push([`Attendance Report: ${empName} - ${targetMonthStr}`, '', '', '', '', '', '', '']);
    aoa.push(['', '', '', '', '', '', '', '']); // Empty row

    weeks.forEach((week, weekIdx) => {
      // Table Header
      aoa.push([`Week ${weekIdx + 1}`, '', '', '', '', '', '', '']);
      aoa.push(['Metrics', ...DAYS_OF_WEEK]);

      // Rows
      const dateRow: any[] = ['Date'];
      const checkInRow: any[] = ['Check In Time'];
      const checkOutRow: any[] = ['Check Out Time'];
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

        const record = recordsByDate[dateStr];
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const defaultStatus = isWeekend ? (day.getDay() === 0 ? 'Rest Day' : 'Off Day') : 'N/A';

        if (record && record.check_in_time) {
          checkInRow.push(extractTime(record.check_in_time));

          if (record.check_out_time) {
            checkOutRow.push(extractTime(record.check_out_time));

            const checkIn = new Date(record.check_in_time);
            const checkOut = new Date(record.check_out_time);
            const workMs = checkOut.getTime() - checkIn.getTime();
            totalWorkRow.push(formatDuration(workMs));

            const breakMs = 60 * 60 * 1000; // 1 hour
            breakRow.push('01:00:00');

            const totalHoursMs = Math.max(0, workMs - breakMs);
            totalHoursRow.push(formatDuration(totalHoursMs));

            const maxWorkMs = 8 * 60 * 60 * 1000; // 8 hours
            maxWorkRow.push('08:00:00');

            const overtimeMs = Math.max(0, totalHoursMs - maxWorkMs);
            overtimeRow.push(formatDuration(overtimeMs));
          } else {
            checkOutRow.push('No Checkout');
            totalWorkRow.push('N/A');
            breakRow.push('01:00:00');
            totalHoursRow.push('N/A');
            maxWorkRow.push('08:00:00');
            overtimeRow.push('N/A');
          }
        } else {
          checkInRow.push(defaultStatus);
          checkOutRow.push(defaultStatus);
          totalWorkRow.push('N/A');
          breakRow.push('N/A');
          totalHoursRow.push('N/A');
          maxWorkRow.push('N/A');
          overtimeRow.push('N/A');
        }
      });

      aoa.push(dateRow);
      aoa.push(checkInRow);
      aoa.push(checkOutRow);
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
      const isNA = val === "N/A" || val === "No Checkout" || val === "Rest Day" || val === "Off Day";
      const isTitle = val.startsWith("Attendance Report:");
      const isDate = /^\d{2}\/\d{2}\/\d{4}$/.test(val);

      if (!cell.s) cell.s = {};

      // 1. Bold Formatting
      if (c === 0 || isDaysRow || isWeekCount || isNA || isTitle || isDate) {
        cell.s.font = { bold: true };
      }

      let isHeaderRow = false;
      if (r >= 3 && c >= 0 && c <= 7) {
        const offsetRow = r - 3;
        const rowInBlock = offsetRow % 12;
        if (rowInBlock === 0 || rowInBlock === 1) {
          isHeaderRow = true; // Metrics or Date row
        }
      }

      // 2. Background Color / Highlighting
      if (val === "Rest Day") {
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
