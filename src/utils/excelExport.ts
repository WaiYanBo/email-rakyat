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

// Helper to format day counts as whole integer if integer, or 1-decimal float if half-day
function formatDays(days: number): number {
  return Number.isInteger(days) ? Math.round(days) : Number(days.toFixed(1));
}

// Helper to format signed duration in milliseconds to (±)HH:MM:SS
function formatDurationSigned(ms: number): string {
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

export interface PayrollOptions {
  monthlySalary?: number;
  salaryAdvance?: number;
  irbPcb?: number;
  includeEpf?: boolean;
  includeSocso?: boolean;
  projectRemainingDays?: boolean;
  customSalariesByEmployee?: Record<string, { monthlySalary?: number; salaryAdvance?: number; irbPcb?: number; includeEpf?: boolean; includeSocso?: boolean; projectRemainingDays?: boolean }>;
}

export const exportAttendanceToExcel = (
  records: any[],
  filterMode: 'date' | 'month',
  selectedDate: string,
  selectedMonth: string,
  publicHolidays: any[] = [],
  payrollOptions: PayrollOptions = {}
) => {
  if (!records || records.length === 0) return;

  // Determine the month to generate calendar for.
  const targetMonthStr = filterMode === 'month' ? selectedMonth : selectedDate.slice(0, 7);
  const [yearStr, monthStr] = targetMonthStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-indexed for Date

  // Days in month
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  // Today local date string for future date comparison (YYYY-MM-DD)
  const todayLocal = new Date();
  const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

  // Working days (Mon-Fri) & Rest days (Sat-Sun) in month
  let totalWorkingDaysInMonth = 0;
  let totalRestDaysInMonth = 0;
  let nonWeekendHolidaysCount = 0;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dayOfWeek = dt.getDay(); // 0 = Sun, 6 = Sat
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${mStr}-${dStr}`;

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) {
      totalRestDaysInMonth++;
    } else {
      totalWorkingDaysInMonth++;
      if (publicHolidays.some(h => h.date === dateStr)) {
        nonWeekendHolidaysCount++;
      }
    }
  }

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
  const isSingleEmp = Object.keys(recordsByEmployee).length === 1;

  // ─── 1. BUILD WEEKLY ATTENDANCE SHEETS (WEEK 1, WEEK 2, WEEK 3...) ─────────
  Object.entries(recordsByEmployee).forEach(([empName, empRecords]) => {
    const recordsByDate: Record<string, any[]> = {};
    empRecords.forEach(r => {
      if (r.date) {
        if (!recordsByDate[r.date]) {
          recordsByDate[r.date] = [];
        }
        recordsByDate[r.date].push(r);
      }
    });

    // Compute weekly & grand totals for this employee
    const weekTotals: { hoursMs: number; otMs: number; hasData: boolean }[] = [];
    let grandTotalHoursMs = 0;
    let grandTotalOtMs = 0;

    weeks.forEach(wDays => {
      let wHoursMs = 0;
      let wOtMs = 0;
      let wHasData = false;

      wDays.forEach(day => {
        const y = day.getFullYear();
        const m = String(day.getMonth() + 1).padStart(2, '0');
        const d = String(day.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const dayRecords = recordsByDate[dateStr] || [];
        if (dayRecords.length > 0 && !dayRecords.some(r => r.is_leave)) {
          const isCompleted = dayRecords.every(r => r.clock_out_time);
          if (isCompleted) {
            wHasData = true;
            let totalWorkMs = 0;
            dayRecords.forEach(r => {
              if (r.clock_in_time && r.clock_out_time) {
                totalWorkMs += new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime();
              }
            });
            const originalBreakMs = 60 * 60 * 1000;
            const totalHoursMs = Math.max(0, totalWorkMs - originalBreakMs);
            const maxWorkMs = 8 * 60 * 60 * 1000;
            const overtimeMs = totalHoursMs - maxWorkMs;

            wHoursMs += totalHoursMs;
            wOtMs += overtimeMs;
          }
        }
      });

      weekTotals.push({ hoursMs: wHoursMs, otMs: wOtMs, hasData: wHasData });
      if (wHasData) {
        grandTotalHoursMs += wHoursMs;
        grandTotalOtMs += wOtMs;
      }
    });

    weeks.forEach((week, weekIdx) => {
      const aoaWeek: any[][] = [];
      const weekTitle = `Week ${weekIdx + 1}`;
      aoaWeek.push([`Attendance Log: ${empName} - ${weekTitle} (${targetMonthStr})`, '', '', '', '', '', '', '']);
      aoaWeek.push(['', '', '', '', '', '', '', '']);
      aoaWeek.push(['Metrics', ...DAYS_OF_WEEK]);

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
        const dateStr = `${y}-${m}-${d}`;

        dateRow.push(`${d}/${m}/${y}`);

        const dayRecords = recordsByDate[dateStr] || [];
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

        const holiday = publicHolidays.find(h => h.date === dateStr);
        const isPublicHoliday = !!holiday;

        let defaultStatus = isWeekend ? (day.getDay() === 0 ? 'Rest Day' : 'Off Day') : 'N/A';
        if (isPublicHoliday) {
          defaultStatus = holiday.name;
        }

        if (dayRecords.length > 0) {
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
            dayRecords.sort((a, b) => new Date(a.clock_in_time).getTime() - new Date(b.clock_in_time).getTime());

            const firstRecord = dayRecords[0];
            const lastRecord = dayRecords[dayRecords.length - 1];
            const isCompleted = dayRecords.every(r => r.clock_out_time);

            clockInRow.push(firstRecord.clock_in_time ? extractTime(firstRecord.clock_in_time) : 'N/A');
            clockOutRow.push(isCompleted ? extractTime(lastRecord.clock_out_time) : 'No Clockout');

            let totalWorkMs = 0;
            dayRecords.forEach(r => {
              if (r.clock_in_time && r.clock_out_time) {
                totalWorkMs += new Date(r.clock_out_time).getTime() - new Date(r.clock_in_time).getTime();
              }
            });
            totalWorkRow.push(formatDuration(totalWorkMs));

            let gapMs = 0;
            for (let i = 0; i < dayRecords.length - 1; i++) {
              const prevOut = dayRecords[i].clock_out_time;
              const nextIn = dayRecords[i + 1].clock_in_time;
              if (prevOut && nextIn) {
                const gap = new Date(nextIn).getTime() - new Date(prevOut).getTime();
                if (gap > 0) gapMs += gap;
              }
            }

            const originalBreakMs = 60 * 60 * 1000; // 1 hour
            const totalBreakMs = originalBreakMs + gapMs;
            breakRow.push(formatDuration(totalBreakMs));

            if (isCompleted) {
              const totalHoursMs = Math.max(0, totalWorkMs - originalBreakMs);
              totalHoursRow.push(formatDuration(totalHoursMs));

              const maxWorkMs = 8 * 60 * 60 * 1000; // 8 hours
              const overtimeMs = Math.max(0, totalHoursMs - maxWorkMs);
              overtimeRow.push(formatDurationSigned(overtimeMs));
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

      aoaWeek.push(dateRow);
      aoaWeek.push(clockInRow);
      aoaWeek.push(clockOutRow);
      aoaWeek.push(totalWorkRow);
      aoaWeek.push(breakRow);
      aoaWeek.push(totalHoursRow);
      aoaWeek.push(maxWorkRow);
      aoaWeek.push(overtimeRow);

      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=11 spacer
      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=12 spacer

      // ─── 2 ROW WEEKLY & OVERTIME TOTALS TABLE ─────────────────────────
      const summaryHeader = ['', ...weeks.map((_, i) => `Week ${i + 1}`), 'TOTAL'];
      const summaryHoursRow = ['TOTAL WEEKLY HOURS', ...weekTotals.map(w => w.hasData ? formatDurationSigned(w.hoursMs) : ''), formatDurationSigned(grandTotalHoursMs)];
      const summaryOtRow = ['TOTAL OVERTIME', ...weekTotals.map(w => w.hasData ? formatDurationSigned(w.otMs) : ''), formatDurationSigned(grandTotalOtMs)];

      aoaWeek.push(summaryHeader);   // r=13
      aoaWeek.push(summaryHoursRow); // r=14
      aoaWeek.push(summaryOtRow);    // r=15

      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=16 spacer
      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=17 spacer

      // ─── EXACT NOTES & TO DO / COMMENT SECTION ─────────────────────────
      aoaWeek.push(['NOTES', '', '', '', 'TO DO', '', '', '']); // r=18
      aoaWeek.push(['- Jika tiada clock in & clock out (melainkan MC atau annual leave), anda akan', '', '', '', '- Isi dekat kotak warna kuning sahaja mengikut format waktu', '', '', '']); // r=19
      aoaWeek.push(['dikira AWOL (Absent Without Leave). Gaji tidak akan dikira pada hari tersebut', '', '', '', 'berdasarkan live location clock in & clock out anda di dalam', '', '', '']); // r=20
      aoaWeek.push(['- Jika tiada clock out, gaji akan dikira setengah hari sahaja melainkan ada', '', '', '', '- Jangan usik kotak lain. Terdapat formula yang telah ditetapkan di', '', '', '']); // r=21
      aoaWeek.push(['bukti atau saksi lain yang boleh menyokong fakta tersebut.', '', '', '', 'kotak-kotak lain tersebut.', '', '', '']); // r=22
      aoaWeek.push(['- Jika tiada clock in & clock out tetapi anda telah memohon cuti awal terlebih', '', '', '', '', '', '', '']); // r=23
      aoaWeek.push(['dahulu, tindakan tatatertib tidak akan diambil terhadap anda, hanya gaji tidak', '', '', '', 'COMMENT', '', '', '']); // r=24
      aoaWeek.push(['- Overtime boleh diganti pada hari lain tetapi memerlukan kelulusan bertulis', '', '', '', '', '', '', '']); // r=25
      aoaWeek.push(['CFO sebagai bukti.', '', '', '', '', '', '', '']); // r=26
      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=27 (comment line)
      aoaWeek.push(['', '', '', '', '', '', '', '']); // r=28 (comment line)

      const weekWs = XLSX.utils.aoa_to_sheet(aoaWeek);

      const weekMerges: any[] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      ];

      for (let nr = 18; nr <= 28; nr++) {
        weekMerges.push({ s: { r: nr, c: 0 }, e: { r: nr, c: 3 } });
        weekMerges.push({ s: { r: nr, c: 4 }, e: { r: nr, c: 7 } });
      }

      // Apply styling to week sheet
      Object.keys(weekWs).forEach(key => {
        if (key.startsWith('!')) return;

        const decoded = XLSX.utils.decode_cell(key);
        const r = decoded.r;
        const c = decoded.c;

        const cell = weekWs[key];
        const val = typeof cell.v === 'string' ? cell.v.trim() : String(cell.v || '').trim();

        const isDaysRow = ["Metrics", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(val);
        const isNA = val === "N/A" || val === "No Clockout" || val === "Rest Day" || val === "Off Day";
        const isTitle = val.startsWith("Attendance Log:");
        const isDate = /^\d{2}\/\d{2}\/\d{4}$/.test(val);

        if (!cell.s) cell.s = {};

        // Weekly & Overtime Totals table styling (r=13..15)
        if (r >= 13 && r <= 15) {
          cell.s.fill = { fgColor: { rgb: "FFF8FAFC" } }; // Soft slate 50
          cell.s.border = {
            top: { style: "thin", color: { rgb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { rgb: "FFE2E8F0" } },
            left: { style: "thin", color: { rgb: "FFE2E8F0" } },
            right: { style: "thin", color: { rgb: "FFE2E8F0" } }
          };
          if (r === 13 || c === 0) {
            cell.s.font = { bold: true };
          }
          if (c >= 1) {
            cell.s.alignment = { horizontal: "center" };
          }
          return;
        }

        // Notes & TO DO / COMMENT section formatting (r=18..28)
        if (r >= 18 && r <= 28) {
          const isGreenHeader = val === "NOTES" || val === "TO DO" || val === "COMMENT";
          if (isGreenHeader) {
            cell.s.font = { bold: true, color: { rgb: "FF16A34A" }, sz: 11 };
            cell.s.border = { bottom: { style: "thin", color: { rgb: "FF16A34A" } } };
          } else {
            cell.s.font = { color: { rgb: "FF374151" }, sz: 9.5 };
            cell.s.border = { bottom: { style: "thin", color: { rgb: "FFE5E7EB" } } };
          }
          return;
        }

        if (c === 0 || isDaysRow || isNA || isTitle || isDate) {
          cell.s.font = { bold: true };
        }

        let isHeaderRow = r === 2;
        let isPublicHolidayCol = false;

        if (c >= 1 && r >= 3 && r <= 10) {
          const dateCellRef = XLSX.utils.encode_cell({ r: 3, c: c });
          const dateCell = weekWs[dateCellRef];
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

        if (isTitle) {
          cell.s.fill = { fgColor: { rgb: "FF1E1B4B" } };
          cell.s.font = { bold: true, color: { rgb: "FFFFFFFF" }, sz: 11 };
        } else if (isPublicHolidayCol) {
          cell.s.fill = { fgColor: { rgb: "FFE1BEE7" } };
        } else if (val === "Rest Day") {
          cell.s.fill = { fgColor: { rgb: "FFFFCDD2" } };
        } else if (val === "Off Day") {
          cell.s.fill = { fgColor: { rgb: "FFFFE082" } };
        } else if (isHeaderRow) {
          cell.s.fill = { fgColor: { rgb: "FFDCEDC8" } };
        }
      });

      weekWs['!views'] = [{ showGridLines: true }];
      weekWs['!merges'] = weekMerges;

      const colWidths = [24, 16, 16, 16, 16, 16, 16, 16];
      weekWs['!cols'] = colWidths.map(width => ({ wch: width }));

      const tabName = isSingleEmp ? `Week ${weekIdx + 1}` : `${empName.substring(0, 10)} - W${weekIdx + 1}`;
      XLSX.utils.book_append_sheet(wb, weekWs, tabName);
    });
  });

  // ─── 2. BUILD PAYROLL SUMMARY WORKSHEET AT THE VERY END (LAST SHEET!) ─────
  const summaryAoa: any[][] = [];
  summaryAoa.push([`Payroll & Attendance Summary: ${targetMonthStr}`, '']);
  summaryAoa.push(['', '']);

  // Track row indices for styling, currency formatting, and formula generation
  const highlightRows: number[] = [];
  const headerSectionRows: number[] = [];
  const titleRows: number[] = [];
  const salaryCurrencyRows: number[] = [];

  titleRows.push(0);

  Object.entries(recordsByEmployee).forEach(([empName, empRecords]) => {
    const recordsByDate: Record<string, any[]> = {};
    empRecords.forEach(r => {
      if (r.date) {
        if (!recordsByDate[r.date]) {
          recordsByDate[r.date] = [];
        }
        recordsByDate[r.date].push(r);
      }
    });

    const empPayrollOpts = payrollOptions.customSalariesByEmployee?.[empName] || {};
    const shouldProjectRemainingDays = empPayrollOpts.projectRemainingDays ?? payrollOptions.projectRemainingDays ?? true;

    let sickLeaveDays = 0;
    let annualLeaveDays = 0;
    let hospitalizationLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let awolDays = 0;

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      const dt = new Date(year, month, d);
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const isPublicHoliday = publicHolidays.some(h => h.date === dateStr);

      const dayRecs = recordsByDate[dateStr] || [];
      const leaveRec = dayRecs.find(r => r.is_leave);

      if (leaveRec) {
        const type = (leaveRec.leave_type || '').toLowerCase();
        const dayVal = leaveRec.total_days ? Number(leaveRec.total_days) : (leaveRec.session_type?.includes('Half') ? 0.5 : 1);
        if (type.includes('sick') || type.includes('mc')) sickLeaveDays += dayVal;
        else if (type.includes('hospital')) hospitalizationLeaveDays += dayVal;
        else if (type.includes('unpaid')) unpaidLeaveDays += dayVal;
        else annualLeaveDays += dayVal;
      } else if (!isWeekend && !isPublicHoliday && dayRecs.length === 0) {
        const isFutureOrToday = dateStr >= todayStr;
        if (isFutureOrToday && shouldProjectRemainingDays) {
          // Future days projected as worked
        } else {
          awolDays++;
        }
      }
    }

    const totalUnpaidDays = unpaidLeaveDays + awolDays;

    const empBaseSalary = empPayrollOpts.monthlySalary ?? payrollOptions.monthlySalary ?? 3000;
    const empSalaryAdvance = empPayrollOpts.salaryAdvance ?? payrollOptions.salaryAdvance ?? 0;
    const empIrbPcb = empPayrollOpts.irbPcb ?? payrollOptions.irbPcb ?? 0;
    const shouldCalcEpf = empPayrollOpts.includeEpf ?? payrollOptions.includeEpf ?? false;
    const shouldCalcSocso = empPayrollOpts.includeSocso ?? payrollOptions.includeSocso ?? false;

    const eligibleSalary = totalUnpaidDays === 0
      ? empBaseSalary
      : Math.max(0, empBaseSalary - (empBaseSalary / totalDaysInMonth) * totalUnpaidDays);
    const employeeEpf = shouldCalcEpf ? Math.round(eligibleSalary * 0.11 * 100) / 100 : 0;
    const socsoEmployee = shouldCalcSocso ? Math.min(19.75, Math.round(eligibleSalary * 0.005 * 100) / 100) : 0;
    const employeeEis = shouldCalcSocso ? Math.min(7.90, Math.round(eligibleSalary * 0.002 * 100) / 100) : 0;

    const totalDeductions = employeeEpf + socsoEmployee + employeeEis + empIrbPcb + empSalaryAdvance;
    const salaryInHand = Math.max(0, eligibleSalary - totalDeductions);

    // Starting row index in summaryAoa for this employee block
    const blockStartRow = summaryAoa.length;

    headerSectionRows.push(blockStartRow);
    summaryAoa.push([`ATTENDANCE & PAYROLL SUMMARY: ${empName}`, '']);

    const daysInMonthRow = blockStartRow + 1 + 1; // 1-based Excel row
    summaryAoa.push(['Number of days in the month', formatDays(totalDaysInMonth)]);

    headerSectionRows.push(blockStartRow + 2);
    summaryAoa.push(['PAID DAY', '']);

    summaryAoa.push(['Number of working days', formatDays(totalWorkingDaysInMonth)]);
    summaryAoa.push(['Number of rest days', formatDays(totalRestDaysInMonth)]);
    summaryAoa.push(['The number of additional holidays does not include holidays falling on rest days', formatDays(nonWeekendHolidaysCount)]);
    summaryAoa.push(['Sick leave', formatDays(sickLeaveDays)]);
    summaryAoa.push(['Annual leave', formatDays(annualLeaveDays)]);
    summaryAoa.push(['Hospitalization leave', formatDays(hospitalizationLeaveDays)]);

    headerSectionRows.push(blockStartRow + 9);
    summaryAoa.push(['UNPAID DAY', '']);

    const unpaidRow = blockStartRow + 10 + 1; // 1-based Excel row
    summaryAoa.push(['Leave without pay / AWOL', formatDays(totalUnpaidDays)]);

    headerSectionRows.push(blockStartRow + 11);
    summaryAoa.push(['SALARY BREAKDOWN', '']);

    const baseSalRowIdx = blockStartRow + 12;
    const baseSalRow = baseSalRowIdx + 1; // 1-based Excel row
    salaryCurrencyRows.push(baseSalRowIdx);
    summaryAoa.push(['Monthly salary', empBaseSalary]);

    const eligSalRowIdx = blockStartRow + 13;
    const eligSalRow = eligSalRowIdx + 1; // 1-based Excel row
    highlightRows.push(eligSalRowIdx);
    salaryCurrencyRows.push(eligSalRowIdx);
    summaryAoa.push([
      'Eligible salary for the month',
      { t: 'n', f: `IF(B${unpaidRow}=0, B${baseSalRow}, MAX(0, B${baseSalRow} - (B${baseSalRow}/B${daysInMonthRow})*B${unpaidRow}))`, v: eligibleSalary }
    ]);

    headerSectionRows.push(blockStartRow + 14);
    summaryAoa.push(['REJECTION (DEDUCTIONS)', '']);

    const epfRowIdx = blockStartRow + 15;
    const epfRow = epfRowIdx + 1;
    salaryCurrencyRows.push(epfRowIdx);
    summaryAoa.push(['Employee EPF', shouldCalcEpf ? { t: 'n', f: `ROUND(B${eligSalRow}*0.11, 2)`, v: employeeEpf } : 0]);

    const socsoRowIdx = blockStartRow + 16;
    const socsoRow = socsoRowIdx + 1;
    salaryCurrencyRows.push(socsoRowIdx);
    summaryAoa.push(['SOCSO employee', shouldCalcSocso ? { t: 'n', f: `MIN(19.75, ROUND(B${eligSalRow}*0.005, 2))`, v: socsoEmployee } : 0]);

    const eisRowIdx = blockStartRow + 17;
    const eisRow = eisRowIdx + 1;
    salaryCurrencyRows.push(eisRowIdx);
    summaryAoa.push(['Employee EIS', shouldCalcSocso ? { t: 'n', f: `MIN(7.90, ROUND(B${eligSalRow}*0.002, 2))`, v: employeeEis } : 0]);

    const pcbRowIdx = blockStartRow + 18;
    const pcbRow = pcbRowIdx + 1;
    salaryCurrencyRows.push(pcbRowIdx);
    summaryAoa.push(['IRB PCB', empIrbPcb]);

    const advRowIdx = blockStartRow + 19;
    const advRow = advRowIdx + 1;
    salaryCurrencyRows.push(advRowIdx);
    summaryAoa.push(['Salary advance', empSalaryAdvance]);

    const netSalRowIdx = blockStartRow + 20;
    highlightRows.push(netSalRowIdx);
    salaryCurrencyRows.push(netSalRowIdx);
    summaryAoa.push([
      'Salary in hand',
      { t: 'n', f: `MAX(0, B${eligSalRow} - SUM(B${epfRow}:B${advRow}))`, v: salaryInHand }
    ]);

    summaryAoa.push(['', '']);
    summaryAoa.push(['', '']);
  });

  const summaryNotesStartRow = summaryAoa.length;

  // ─── EXACT NOTES & TO DO / COMMENT SECTION FOR PAYROLL SUMMARY ───────────
  summaryAoa.push(['NOTES', '', '', '', 'TO DO', '', '', '']); // summaryNotesStartRow + 0
  summaryAoa.push(['- Jika tiada clock in & clock out (melainkan MC atau annual leave), anda akan', '', '', '', '- Isi dekat kotak warna kuning sahaja mengikut format waktu', '', '', '']); // + 1
  summaryAoa.push(['dikira AWOL (Absent Without Leave). Gaji tidak akan dikira pada hari tersebut', '', '', '', 'berdasarkan live location clock in & clock out anda di dalam', '', '', '']); // + 2
  summaryAoa.push(['- Jika tiada clock out, gaji akan dikira setengah hari sahaja melainkan ada', '', '', '', '- Jangan usik kotak lain. Terdapat formula yang telah ditetapkan di', '', '', '']); // + 3
  summaryAoa.push(['bukti atau saksi lain yang boleh menyokong fakta tersebut.', '', '', '', 'kotak-kotak lain tersebut.', '', '', '']); // + 4
  summaryAoa.push(['- Jika tiada clock in & clock out tetapi anda telah memohon cuti awal terlebih', '', '', '', '', '', '', '']); // + 5
  summaryAoa.push(['dahulu, tindakan tatatertib tidak akan diambil terhadap anda, hanya gaji tidak', '', '', '', 'COMMENT', '', '', '']); // + 6
  summaryAoa.push(['- Overtime boleh diganti pada hari lain tetapi memerlukan kelulusan bertulis', '', '', '', '', '', '', '']); // + 7
  summaryAoa.push(['CFO sebagai bukti.', '', '', '', '', '', '', '']); // + 8
  summaryAoa.push(['', '', '', '', '', '', '', '']); // + 9
  summaryAoa.push(['', '', '', '', '', '', '', '']); // + 10

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);

  // Apply styling to Summary Worksheet
  const mergesSummary: any[] = [];
  mergesSummary.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });

  for (let nr = summaryNotesStartRow; nr <= summaryNotesStartRow + 10; nr++) {
    mergesSummary.push({ s: { r: nr, c: 0 }, e: { r: nr, c: 3 } });
    mergesSummary.push({ s: { r: nr, c: 4 }, e: { r: nr, c: 7 } });
  }

  Object.keys(summaryWs).forEach(key => {
    if (key.startsWith('!')) return;

    const decoded = XLSX.utils.decode_cell(key);
    const r = decoded.r;
    const c = decoded.c;

    const cell = summaryWs[key];
    const val = typeof cell.v === 'string' ? cell.v.trim() : String(cell.v || '').trim();

    if (!cell.s) cell.s = {};

    // Notes formatting on Summary sheet
    if (r >= summaryNotesStartRow && r <= summaryNotesStartRow + 10) {
      const isGreenHeader = val === "NOTES" || val === "TO DO" || val === "COMMENT";
      if (isGreenHeader) {
        cell.s.font = { bold: true, color: { rgb: "FF16A34A" }, sz: 11 };
        cell.s.border = { bottom: { style: "thin", color: { rgb: "FF16A34A" } } };
      } else {
        cell.s.font = { color: { rgb: "FF374151" }, sz: 9.5 };
        cell.s.border = { bottom: { style: "thin", color: { rgb: "FFE5E7EB" } } };
      }
      return;
    }

    const isTitle = titleRows.includes(r);
    const isSection = headerSectionRows.includes(r);
    const isHighlight = highlightRows.includes(r);
    const isSalaryCurrency = salaryCurrencyRows.includes(r);

    if (isTitle) {
      cell.s.fill = { fgColor: { rgb: "FF0F172A" } }; // Slate-950
      cell.s.font = { bold: true, color: { rgb: "FFFFFFFF" }, sz: 12 };
    } else if (isSection) {
      cell.s.fill = { fgColor: { rgb: "FF1E293B" } }; // Slate-800
      cell.s.font = { bold: true, color: { rgb: "FFFFFFFF" } };
      if (c === 0 && !mergesSummary.some(m => m.s.r === r)) {
        mergesSummary.push({ s: { r: r, c: 0 }, e: { r: r, c: 1 } });
      }
    } else if (isHighlight && (c === 0 || c === 1)) {
      // High-End Mint Emerald Highlight for BOTH Column A and Column B!
      cell.s.fill = { fgColor: { rgb: "FFDCFCE7" } }; // Emerald-100 Light Mint
      cell.s.font = { bold: true, color: { rgb: "FF14532D" } }; // Dark Emerald-900 text
      cell.s.border = {
        top: { style: "thin", color: { rgb: "FF166534" } },
        bottom: { style: "thin", color: { rgb: "FF166534" } }
      };
    } else if (c === 0) {
      cell.s.font = { bold: true };
    }

    // Currency format ONLY for Salary & Deduction rows in column B
    if (c === 1 && isSalaryCurrency) {
      cell.z = '"RM "#,##0.00';
    }
  });

  summaryWs['!views'] = [{ showGridLines: false }];
  summaryWs['!merges'] = mergesSummary;
  summaryWs['!cols'] = [{ wch: 58 }, { wch: 24 }];

  // Append Payroll Summary as the VERY LAST SHEET (TAB)!
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Payroll Summary');

  const filename = `Attendance_Payroll_${targetMonthStr}.xlsx`;
  XLSX.writeFile(wb, filename);
};

