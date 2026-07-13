import { useState, useMemo, useEffect } from 'react';
import { usePortalLanguage } from '../../hooks/usePortalLanguage';
import { t } from '../../lib/portalI18n';
import InteractiveBarChart, { type BarChartItem } from '../InteractiveBarChart';

const getSortValue = (obj: any, key: string) => {
  if (key === 'DATE') {
    if (obj._parsedDateVal !== undefined) return obj._parsedDateVal;
    const s = String(obj.DATE || '').trim().toUpperCase();
    if (s === 'KIV' || s === 'PENDING' || s === '') return 0;
    const parts = s.replace(/-/g, '/').split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0]) || 0;
      const m = parseInt(parts[1]) || 0;
      let y = parseInt(parts[2]) || 0;
      if (y < 100) y += 2000;
      return y * 10000 + m * 100 + d;
    }
    return 0;
  }
  if (['No', 'NO'].includes(key)) {
    if (obj._parsedNoVal !== undefined) return obj._parsedNoVal;
    const val = obj.No ?? obj.NO;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }
  if (['TOTAL PAID (RM)', 'PENDING (RM)', 'PACKAGE (RM)', '1st PAYMENT', '2nd PAYMENT', '3rd PAYMENT', '4th PAYMENT', '5th PAYMENT', '6th PAYMENT'].includes(key)) {
    if (obj._parsedNumericValues?.[key] !== undefined) return obj._parsedNumericValues[key];
    const rawNumber = String(obj[key] || '0').replace(/[^0-9.-]+/g, '');
    return parseFloat(rawNumber) || 0;
  }
  return String(obj[key] || '').toLowerCase().trim();
};

const hasPendingAmount = (pendingVal: any) => {
  const num = parseFloat(String(pendingVal || '0').replace(/[^0-9.-]+/g, ''));
  return !isNaN(num) && num > 0;
};

const translateBmMonths = (str: string): string => {
  const bmToEn: Record<string, string> = {
    'JANUARI': 'JANUARY',
    'FEBRUARI': 'FEBRUARY',
    'MAC': 'MARCH',
    'MEI': 'MAY',
    'JUN': 'JUNE',
    'JULAI': 'JULY',
    'OGOS': 'AUGUST',
    'OKTOBER': 'OCTOBER',
    'DISEMBER': 'DECEMBER'
  };
  let result = str;
  for (const [bm, en] of Object.entries(bmToEn)) {
    result = result.replace(new RegExp(bm, 'g'), en);
  }
  return result;
};

const parseDateString = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  const s = translateBmMonths(String(dateStr).trim().toUpperCase());
  if (s === 'KIV' || s === 'PENDING' || s === '' || s === '-') return null;

  // Try ISO YYYY-MM-DD first
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // Try DD/MM/YYYY or YYYY/MM/DD or standard splits
  const parts = s.replace(/-/g, '/').split('/');
  if (parts.length === 3) {
    const part0 = parts[0].trim();
    const part2 = parts[2].trim().split(/\s+/)[0];
    
    if (part0.length === 4) {
      // YYYY/MM/DD format
      const y = parseInt(part0, 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(part2, 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        const date = new Date(y, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      }
    } else {
      // DD/MM/YYYY format
      const d = parseInt(part0, 10);
      const m = parseInt(parts[1], 10);
      let y = parseInt(part2, 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        if (y < 100) y += 2000;
        const date = new Date(y, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      }
    }
  }

  // Fallback to standard JS Date parsing
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const getStageLabel = (stageName: string, lang: string) => {
  const isBm = lang === 'bm';
  if (stageName.includes('1st')) return isBm ? 'Bayaran Pertama' : '1st Payment';
  if (stageName.includes('2nd')) return isBm ? 'Bayaran Ke-2' : '2nd Payment';
  if (stageName.includes('3rd')) return isBm ? 'Bayaran Ke-3' : '3rd Payment';
  if (stageName.includes('4th')) return isBm ? 'Bayaran Ke-4' : '4th Payment';
  if (stageName.includes('5th')) return isBm ? 'Bayaran Ke-5' : '5th Payment';
  if (stageName.includes('6th')) return isBm ? 'Bayaran Ke-6' : '6th Payment';
  if (stageName.includes('None')) return isBm ? 'Tiada (Kes Didaftarkan)' : 'None (Case Registered)';
  return stageName;
};

const getLastPaymentInfo = (client: any) => {
  const paymentStages = [
    { name: '1st Payment', dateKey: '1st PAYMENT DATE', amtKey: '1st PAYMENT' },
    { name: '2nd Payment', dateKey: '2nd PAYMENT DATE', amtKey: '2nd PAYMENT' },
    { name: '3rd Payment', dateKey: '3rd PAYMENT DATE', amtKey: '3rd PAYMENT' },
    { name: '4th Payment', dateKey: '4th PAYMENT DATE', amtKey: '4th PAYMENT' },
    { name: '5th Payment', dateKey: '5th PAYMENT DATE', amtKey: '5th PAYMENT' },
    { name: '6th Payment', dateKey: '6th PAYMENT DATE', amtKey: '6th PAYMENT' }
  ];

  // Scan backwards from 6th down to 1st
  for (let i = paymentStages.length - 1; i >= 0; i--) {
    const stage = paymentStages[i];
    const amt = parseAmount(client[stage.amtKey]);
    const dateStr = client[stage.dateKey];
    if (amt > 0 && dateStr && String(dateStr).trim() !== '') {
      const parsedDate = parseDateString(dateStr);
      if (parsedDate) {
        return {
          stage: stage.name,
          date: parsedDate,
          dateStr: dateStr,
          amount: amt
        };
      }
    }
  }

  // Fallback to case Date if no payment has been made yet
  const caseDateStr = client.DATE;
  if (caseDateStr && String(caseDateStr).trim() !== '') {
    const parsedCaseDate = parseDateString(caseDateStr);
    if (parsedCaseDate) {
      return {
        stage: 'None (Case Registered)',
        date: parsedCaseDate,
        dateStr: caseDateStr,
        amount: 0
      };
    }
  }

  return null;
};

const parseAmount = (val: any): number => {
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(clean) || 0;
};

const parseMonthYear = (dateStr: any) => {
  if (!dateStr) return null;
  const s = String(dateStr).trim().toUpperCase();
  if (s === 'KIV' || s === 'PENDING' || s === '') return null;
  const parts = s.replace(/-/g, '/').split('/');
  if (parts.length === 3) {
    const m = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
      if (y < 100) y += 2000;
      return { month: m, year: y, key: `${y}-${String(m).padStart(2, '0')}` };
    }
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    let y = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
      if (y < 100) y += 2000;
      return { month: m, year: y, key: `${y}-${String(m).padStart(2, '0')}` };
    }
  }
  return null;
};

const formatCurrency = (value: number): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const SortHeader = ({ label, sortKey, currentSort, onClick }: any) => (
  <th
    className="px-4 py-3.5 font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors select-none group whitespace-nowrap text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-gray-800 sticky top-0 bg-slate-50 dark:bg-gray-900 z-10 shadow-sm"
    onClick={() => onClick(sortKey)}
  >
    <div className="flex items-center gap-1.5 justify-start">
      <span>{label}</span>
      <span className={`text-[10px] transition-opacity ${currentSort.key === sortKey ? 'text-indigo-600 dark:text-yellow-500 font-bold opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
        {currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </div>
  </th>
);

const EXPANDED_COLUMNS_ORDER = [
  'No', 'NAME', 'IC NUMBER', 'PHONE NUMBER', 'EMAIL', 'ADDRESS', 'DATE',
  'CASE CATEGORY', 'CASE STATUS',
  'PACKAGE (RM)', 'TOTAL PAID (RM)', 'PENDING (RM)',
  '1st PAYMENT', '1st PAYMENT DATE', '2nd PAYMENT', '2nd PAYMENT DATE', '3rd PAYMENT', '3rd PAYMENT DATE',
  '4th PAYMENT', '4th PAYMENT DATE', '5th PAYMENT', '5th PAYMENT DATE', '6th PAYMENT', '6th PAYMENT DATE',
  'Invoice Ref No', 'REMARK',
  'lod_date', 'lod_claim_amount', 'lod_remark',
  'police_report_date', 'police_report_no',
  'ip_date', 'ip_no', 'ip_pem1', 'ip_officer',
  'report_location_ipk', 'report_location_ipd', 'report_location_balai',
  'resolution_status'
];

const IGNORED_KEYS = [
  'id', '_stableKey', 'updated_at', 'created_at', 'deleted_at', 
  'isVirtual', 'folderName', 'Investigation Paper', 'Report', 'Action Taken by police',
  'lastPaymentStage', 'lastPaymentDate', 'lastPaymentDateStr', 'overdueDays', 'overdue_days'
];

const getOrderedKeys = (clientObj: any) => {
  const availableKeys = Object.keys(clientObj || {});
  const orderedKeys = EXPANDED_COLUMNS_ORDER.filter(k => availableKeys.includes(k));
  const extraKeys = availableKeys.filter(k => 
    !EXPANDED_COLUMNS_ORDER.includes(k) && 
    !IGNORED_KEYS.includes(k) &&
    !k.startsWith('_')
  );
  return [...orderedKeys, ...extraKeys];
};

const getExportHeaderLabel = (key: string, lang: string) => {
  const isBm = lang === 'bm';
  switch (key) {
    case 'No':
      return isBm ? 'No.' : 'No.';
    case 'NAME':
      return isBm ? 'Nama Penuh' : 'Full Name';
    case 'IC NUMBER':
      return isBm ? 'No. Kad Pengenalan' : 'IC Number';
    case 'PHONE NUMBER':
      return isBm ? 'No. Telefon' : 'Phone Number';
    case 'EMAIL':
      return isBm ? 'E-mel' : 'Email';
    case 'ADDRESS':
      return isBm ? 'Alamat' : 'Address';
    case 'DATE':
      return isBm ? 'Tarikh' : 'Date';
    case 'CASE CATEGORY':
      return isBm ? 'Kategori Kes' : 'Case Category';
    case 'CASE STATUS':
      return isBm ? 'Status Kes' : 'Case Status';
    case 'lod_date':
      return isBm ? 'Tarikh LoD' : 'LoD Date';
    case 'lod_claim_amount':
      return isBm ? 'Jumlah Tuntutan LoD' : 'LoD Claim Amount';
    case 'lod_remark':
      return isBm ? 'Catatan LoD' : 'LoD Remark';
    case 'police_report_date':
      return isBm ? 'Tarikh Laporan Polis' : 'Police Report Date';
    case 'police_report_no':
      return isBm ? 'No. Laporan Polis' : 'Police Report No.';
    case 'ip_date':
      return isBm ? 'Tarikh Kertas Siasatan' : 'IP Date';
    case 'ip_no':
      return isBm ? 'No. Kertas Siasatan' : 'IP No.';
    case 'ip_pem1':
      return isBm ? 'PEM 1' : 'PEM 1';
    case 'ip_officer':
      return isBm ? 'Pegawai Penyiasat (IO)' : 'Investigation Officer (IO)';
    case 'report_location_ipk':
      return isBm ? 'IPK' : 'IPK';
    case 'report_location_ipd':
      return isBm ? 'IPD' : 'IPD';
    case 'report_location_balai':
      return isBm ? 'Balai Polis' : 'Police Station';
    case 'PACKAGE (RM)':
      return isBm ? 'Pakej (RM)' : 'Package (RM)';
    case 'TOTAL PAID (RM)':
      return isBm ? 'Jumlah Dibayar (RM)' : 'Total Paid (RM)';
    case 'PENDING (RM)':
      return isBm ? 'Belum Bayar (RM)' : 'Pending (RM)';
    case '1st PAYMENT':
      return isBm ? 'Bayaran Pertama (RM)' : '1st Payment (RM)';
    case '1st PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Pertama' : '1st Payment Date';
    case '2nd PAYMENT':
      return isBm ? 'Bayaran Ke-2 (RM)' : '2nd Payment (RM)';
    case '2nd PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Ke-2' : '2nd Payment Date';
    case '3rd PAYMENT':
      return isBm ? 'Bayaran Ke-3 (RM)' : '3rd Payment (RM)';
    case '3rd PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Ke-3' : '3rd Payment Date';
    case '4th PAYMENT':
      return isBm ? 'Bayaran Ke-4 (RM)' : '4th Payment (RM)';
    case '4th PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Ke-4' : '4th Payment Date';
    case '5th PAYMENT':
      return isBm ? 'Bayaran Ke-5 (RM)' : '5th Payment (RM)';
    case '5th PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Ke-5' : '5th Payment Date';
    case '6th PAYMENT':
      return isBm ? 'Bayaran Ke-6 (RM)' : '6th Payment (RM)';
    case '6th PAYMENT DATE':
      return isBm ? 'Tarikh Bayaran Ke-6' : '6th Payment Date';
    case 'Invoice Ref No':
      return isBm ? 'No. Rujukan Invois' : 'Invoice Ref No';
    case 'REMARK':
      return isBm ? 'Catatan' : 'Remark';
    case 'resolution_status':
      return isBm ? 'Status Penyelesaian' : 'Resolution Status';
    default:
      return key;
  }
};

const formatJsonValue = (val: any) => {
  if (!val) return '-';
  const str = String(val).trim();
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const validItems = parsed.filter(item => 
          Object.values(item).some(v => v !== '' && v !== null && v !== undefined)
        );
        if (validItems.length === 0) return '-';
        return validItems.map(item => {
          if (item.no && item.date) {
            let extra = '';
            if (item.pem) extra += `, PEM: ${item.pem}`;
            if (item.officer) extra += `, IO: ${item.officer}`;
            return `${item.no} (${item.date}${extra})`;
          } else if (item.no) {
            let extra = '';
            if (item.pem) extra += `, PEM: ${item.pem}`;
            if (item.officer) extra += `, IO: ${item.officer}`;
            return `${item.no}${extra ? ` (${extra.substring(2)})` : ''}`;
          } else if (item.date) {
            return `Date: ${item.date}`;
          }
          return Object.values(item).filter(Boolean).join(', ');
        }).join('; ');
      }
    } catch (e) {}
  }
  const strV = str.replace(/\s/g, '');
  if (strV === '[]' || strV === '[{date:,no:}]' || strV === '[{date:,no:,pem:,officer:}]') return '-';
  return val;
};

const isNumericKey = (key: string) => {
  return [
    'No', 'NO',
    'PACKAGE (RM)', 'TOTAL PAID (RM)', 'PENDING (RM)',
    '1st PAYMENT', '2nd PAYMENT', '3rd PAYMENT', '4th PAYMENT', '5th PAYMENT', '6th PAYMENT'
  ].includes(key);
};

const formatStandardClient = (client: any, lang: string) => {
  const noVal = client.No ?? client.NO;
  return {
    [lang === 'bm' ? 'No.' : 'No.']: noVal !== null && noVal !== undefined && !isNaN(Number(noVal)) ? Number(noVal) : '-',
    [lang === 'bm' ? 'Nama Penuh' : 'Full Name']: client.NAME || '-',
    [lang === 'bm' ? 'No. Telefon' : 'Phone Number']: client["PHONE NUMBER"] || '-',
    [lang === 'bm' ? 'No. Kad Pengenalan' : 'IC Number']: client["IC NUMBER"] || '-',
    [lang === 'bm' ? 'Kategori Kes' : 'Case Category']: client["CASE CATEGORY"] || '-',
    [lang === 'bm' ? 'Jumlah Dibayar (RM)' : 'Total Paid (RM)']: parseAmount(client["TOTAL PAID (RM)"]),
    [lang === 'bm' ? 'Belum Bayar (RM)' : 'Pending (RM)']: parseAmount(client["PENDING (RM)"]),
    [lang === 'bm' ? 'Pakej (RM)' : 'Package (RM)']: parseAmount(client["PACKAGE (RM)"]),
    [lang === 'bm' ? 'Status Kes' : 'Case Status']: client["CASE STATUS"] || '-',
    [lang === 'bm' ? 'Kertas Siasatan' : 'Investigation Paper']: client["Investigation Paper"] || '-',
    [lang === 'bm' ? 'Laporan' : 'Report']: client.Report || '-',
    [lang === 'bm' ? 'Tindakan Pihak Polis' : 'Action Taken by police']: client["Action Taken by police"] || '-',
    [lang === 'bm' ? 'Tarikh' : 'Date']: client.DATE || '-'
  };
};

const formatExpandedClient = (client: any, lang: string, orderedKeys: string[]) => {
  const formatted: Record<string, any> = {};
  for (const key of orderedKeys) {
    const label = getExportHeaderLabel(key, lang);
    const val = client[key];
    
    if (key === 'No') {
      const numVal = val !== null && val !== undefined ? Number(val) : null;
      formatted[label] = numVal !== null && !isNaN(numVal) ? numVal : '-';
    } else if (isNumericKey(key)) {
      formatted[label] = val !== null && val !== undefined ? parseAmount(val) : 0;
    } else if (key === 'police_report_no' || key === 'ip_no') {
      formatted[label] = formatJsonValue(val);
    } else {
      formatted[label] = val !== undefined && val !== null ? String(val).trim() || '-' : '-';
    }
  }
  return formatted;
};

const formatLodClient = (client: any, lang: string) => {
  const payInfo = getLastPaymentInfo(client);
  const overdueDays = payInfo && payInfo.date 
    ? Math.max(0, Math.floor((Date.now() - payInfo.date.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
    
  const weeks = Math.floor(overdueDays / 7);
  const days = overdueDays % 7;
  
  let durationStr = lang === 'bm'
    ? `${weeks} minggu, ${days} hari`
    : `${weeks} weeks, ${days} days`;
  
  if (weeks === 0 && days === 0) {
    durationStr = lang === 'bm' ? 'Hari Ini' : 'Today';
  }
  
  if (!payInfo || payInfo.date === null) {
    durationStr = '-';
  }

  return {
    [lang === 'bm' ? 'No.' : 'No.']: client.No ?? client.NO ?? '-',
    [lang === 'bm' ? 'Nama Penuh' : 'Full Name']: client.NAME || '-',
    [lang === 'bm' ? 'No. Telefon' : 'Phone Number']: client["PHONE NUMBER"] || '-',
    [lang === 'bm' ? 'Status Kes' : 'Case Status']: client["CASE STATUS"] || '-',
    [lang === 'bm' ? 'Belum Bayar (RM)' : 'Pending (RM)']: parseAmount(client["PENDING (RM)"]),
    [lang === 'bm' ? 'Peringkat Terakhir' : 'Last Payment Stage']: getStageLabel(payInfo ? payInfo.stage : 'None (Case Registered)', lang),
    [lang === 'bm' ? 'Tarikh Bayaran Terakhir' : 'Last Payment Date']: payInfo ? payInfo.dateStr : '-',
    [lang === 'bm' ? 'Tempoh Tunggakan' : 'Overdue Duration']: durationStr,
    [lang === 'bm' ? 'Tarikh LoD' : 'LoD Date']: client.lod_date || (lang === 'bm' ? 'Belum Dihantar' : 'Not Sent')
  };
};

export default function ClientTable({
  clients,
  canEdit,
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  viewMode,
  onViewModeChange,
  onExportFull,
  onAddClick,
  onEditClick,
  onViewClick
}: {
  clients: any[],
  canEdit: boolean,
  searchQuery: string,
  onSearchChange: (q: string) => void,
  dateFilter: string,
  onDateFilterChange: (df: string) => void,
  viewMode: 'standard' | 'expanded' | 'lod',
  onViewModeChange: (mode: 'standard' | 'expanded' | 'lod') => void,
  onExportFull: () => Promise<any[]>,
  onAddClick: () => void,
  onEditClick: (client: any) => void,
  onViewClick: (client: any) => void
}) {
  const { lang } = usePortalLanguage();
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'DATE', direction: 'desc' });
  const [exportScope, setExportScope] = useState<'current' | 'full'>('current');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState('all');

  const getLabel = (key: string) => {
    const k = key.toUpperCase();
    if (k === 'NAME') return lang === 'bm' ? 'Nama Penuh' : 'Full Name';
    if (k === 'IC NUMBER' || k === 'IC') return lang === 'bm' ? 'No. Kad Pengenalan' : 'IC Number';
    if (k === 'PHONE NUMBER' || k === 'PHONE') return lang === 'bm' ? 'No. Telefon' : 'Phone Number';
    if (k === 'EMAIL') return lang === 'bm' ? 'E-mel' : 'Email';
    if (k === 'ADDRESS') return lang === 'bm' ? 'Alamat' : 'Address';
    if (k === 'DATE') return lang === 'bm' ? 'Tarikh' : 'Date';
    if (k === 'CASE CATEGORY' || k === 'CATEGORY') return lang === 'bm' ? 'Kategori Kes' : 'Case Category';
    if (k === 'CASE STATUS' || k === 'STATUS') return lang === 'bm' ? 'Status Kes' : 'Case Status';
    if (k === 'INVOICE REF NO') return lang === 'bm' ? 'No. Rujukan Invois' : 'Invoice Ref No';
    if (k === 'INVESTIGATION PAPER') return lang === 'bm' ? 'Kertas Siasatan' : 'Investigation Paper';
    if (k === 'REPORT') return lang === 'bm' ? 'Laporan' : 'Report';
    if (k === 'ACTION TAKEN BY POLICE' || k === 'ACTION TAKEN') return lang === 'bm' ? 'Tindakan Pihak Polis' : 'Action Taken by police';
    if (k === 'REMARK') return lang === 'bm' ? 'Catatan' : 'Remark';
    if (k === 'NO') return lang === 'bm' ? 'No' : 'No';
    if (k === 'PACKAGE (RM)' || k === 'PACKAGE') return lang === 'bm' ? 'Pakej (RM)' : 'Package (RM)';
    if (k === 'TOTAL PAID (RM)' || k === 'PAID') return lang === 'bm' ? 'Jumlah Dibayar (RM)' : 'Total Paid (RM)';
    if (k === 'PENDING (RM)' || k === 'PENDING') return lang === 'bm' ? 'Belum Bayar (RM)' : 'Pending (RM)';
    return key;
  };

  const processedClients = useMemo(() => {
    return clients.map(client => {
      // Pre-parse DATE
      let parsedDateVal = 0;
      const s = String(client.DATE || '').trim().toUpperCase();
      if (s !== 'KIV' && s !== 'PENDING' && s !== '') {
        const parts = s.replace(/-/g, '/').split('/');
        if (parts.length === 3) {
          const d = parseInt(parts[0], 10) || 0;
          const m = parseInt(parts[1], 10) || 0;
          let y = parseInt(parts[2], 10) || 0;
          if (y < 100) y += 2000;
          parsedDateVal = y * 10000 + m * 100 + d;
        }
      }

      // Pre-parse numeric columns
      const numericValues: Record<string, number> = {};
      const numericKeys = ['TOTAL PAID (RM)', 'PENDING (RM)', 'PACKAGE (RM)', '1st PAYMENT', '2nd PAYMENT', '3rd PAYMENT', '4th PAYMENT', '5th PAYMENT', '6th PAYMENT'];
      for (const k of numericKeys) {
        const raw = String(client[k] || '0').replace(/[^0-9.-]+/g, '');
        numericValues[k] = parseFloat(raw) || 0;
      }

      // Pre-parse No
      const valNo = client.No ?? client.NO;
      const numNo = Number(valNo);
      const parsedNoVal = isNaN(numNo) ? 0 : numNo;

      return {
        ...client,
        _parsedDateVal: parsedDateVal,
        _parsedNoVal: parsedNoVal,
        _parsedNumericValues: numericValues
      };
    });
  }, [clients]);

  const lodClients = useMemo(() => {
    return processedClients
      .filter(c => hasPendingAmount(c["PENDING (RM)"]))
      .map(c => {
        const payInfo = getLastPaymentInfo(c);
        const overdueDays = payInfo && payInfo.date 
          ? Math.max(0, Math.floor((Date.now() - payInfo.date.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        return {
          ...c,
          lastPaymentStage: payInfo ? payInfo.stage : 'None (Case Registered)',
          lastPaymentDate: payInfo ? payInfo.date : null,
          lastPaymentDateStr: payInfo ? payInfo.dateStr : '-',
          overdueDays: overdueDays,
        };
      });
  }, [processedClients]);

  const sortedLodClients = useMemo(() => {
    let result = [...lodClients];

    result.sort((a: any, b: any) => {
      let valA, valB;
      if (sort.key === 'last_payment_stage') {
        valA = a.lastPaymentStage;
        valB = b.lastPaymentStage;
      } else if (sort.key === 'last_payment_date') {
        valA = a.lastPaymentDate ? a.lastPaymentDate.getTime() : 0;
        valB = b.lastPaymentDate ? b.lastPaymentDate.getTime() : 0;
      } else if (sort.key === 'overdue_days') {
        valA = a.overdueDays;
        valB = b.overdueDays;
      } else {
        valA = getSortValue(a, sort.key);
        valB = getSortValue(b, sort.key);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        if (valA !== valB) return sort.direction === 'asc' ? valA - valB : valB - valA;
      } else {
        const strA = String(valA || '').toLowerCase().trim();
        const strB = String(valB || '').toLowerCase().trim();
        if (strA < strB) return sort.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [sort, lodClients]);

  // Reset to first page when search/filters/sort changes, but not when clients data updates (like on edit)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, sort, selectedMonth, viewMode]);

  // Clamp page if records decrease (e.g. on delete or mode change)
  useEffect(() => {
    const totalRecords = viewMode === 'lod' ? lodClients.length : processedClients.length;
    const totalPages = Math.ceil(totalRecords / 25) || 1;
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [processedClients.length, lodClients.length, currentPage, viewMode]);

  const handleSort = (key: string) => {
    setSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedClients = useMemo(() => {
    let result = [...processedClients];

    result.sort((a: any, b: any) => {
      const valA = getSortValue(a, sort.key);
      const valB = getSortValue(b, sort.key);

      if (typeof valA === 'number' && typeof valB === 'number') {
        if (valA !== valB) return sort.direction === 'asc' ? valA - valB : valB - valA;
      } else {
        if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [sort, processedClients]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * 25;
    const list = viewMode === 'lod' ? sortedLodClients : sortedClients;
    return list.slice(start, start + 25);
  }, [sortedClients, sortedLodClients, currentPage, viewMode]);

  const summaryClients = useMemo(() => {
    if (selectedMonth === 'all') {
      return processedClients;
    }
    return processedClients.filter(client => {
      const parsed = parseMonthYear(client.DATE);
      return parsed && parsed.key === selectedMonth;
    });
  }, [processedClients, selectedMonth]);

  const totalClients = summaryClients.length;

  const totalPackage = useMemo(() => {
    return summaryClients.reduce((acc, client) => acc + parseAmount(client["PACKAGE (RM)"]), 0);
  }, [summaryClients]);

  const totalPaid = useMemo(() => {
    return summaryClients.reduce((acc, client) => acc + parseAmount(client["TOTAL PAID (RM)"]), 0);
  }, [summaryClients]);

  const totalPending = useMemo(() => {
    return summaryClients.reduce((acc, client) => acc + parseAmount(client["PENDING (RM)"]), 0);
  }, [summaryClients]);

  const uniqueMonths = useMemo(() => {
    const monthsMap = new Map<string, { month: number; year: number }>();
    processedClients.forEach(client => {
      const parsed = parseMonthYear(client.DATE);
      if (parsed) {
        monthsMap.set(parsed.key, { month: parsed.month, year: parsed.year });
      }
    });

    const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthNamesBm = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

    return Array.from(monthsMap.entries())
      .map(([key, value]) => {
        const name = lang === 'bm' ? monthNamesBm[value.month - 1] : monthNamesEn[value.month - 1];
        return {
          value: key,
          label: `${name} ${value.year}`,
          year: value.year,
          month: value.month
        };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  }, [processedClients, lang]);

  const monthlyCount = summaryClients.length;

  const clientChartData = useMemo(() => {
    if (selectedMonth === 'all') {
      const monthsAsc = [...uniqueMonths].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });

      if (monthsAsc.length === 0) return [];

      return monthsAsc.map(m => {
        const monthClients = processedClients.filter(client => {
          const parsed = parseMonthYear(client.DATE);
          return parsed && parsed.key === m.value;
        });

        const totalPaidMonth = monthClients.reduce((acc, c) => acc + parseAmount(c["TOTAL PAID (RM)"]), 0);
        const totalPendingMonth = monthClients.reduce((acc, c) => acc + parseAmount(c["PENDING (RM)"]), 0);

        const monthNameShortEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthNameShortBm = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
        const shortName = lang === 'bm' ? monthNameShortBm[m.month - 1] : monthNameShortEn[m.month - 1];
        const shortLabel = `${shortName} ${String(m.year).slice(-2)}`;

        return {
          key: m.value,
          label: shortLabel,
          value: monthClients.length,
          tooltipData: {
            title: m.label,
            items: [
              { label: lang === 'bm' ? 'Klien:' : 'Clients:', value: monthClients.length },
              { label: lang === 'bm' ? 'Dibayar:' : 'Paid:', value: `RM ${formatCurrency(totalPaidMonth)}` },
              { label: lang === 'bm' ? 'Belum Bayar:' : 'Pending:', value: `RM ${formatCurrency(totalPendingMonth)}` }
            ]
          }
        } as BarChartItem;
      });
    } else {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      
      const daysList: BarChartItem[] = [];
      const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthNamesBm = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
      const name = lang === 'bm' ? monthNamesBm[month - 1] : monthNamesEn[month - 1];

      for (let day = 1; day <= daysInMonth; day++) {
        const dayClients = processedClients.filter(client => {
          const parsed = parseMonthYear(client.DATE);
          if (!parsed || parsed.key !== selectedMonth) return false;
          
          const dVal = client._parsedDateVal;
          if (dVal > 0) {
            const dayNum = dVal % 100;
            return dayNum === day;
          }
          return false;
        });

        const totalPaidDay = dayClients.reduce((acc, c) => acc + parseAmount(c["TOTAL PAID (RM)"]), 0);
        const totalPendingDay = dayClients.reduce((acc, c) => acc + parseAmount(c["PENDING (RM)"]), 0);

        const dateStr = `${day} ${name} ${year}`;

        daysList.push({
          key: `${selectedMonth}-${String(day).padStart(2, '0')}`,
          label: String(day),
          value: dayClients.length,
          tooltipData: {
            title: dateStr,
            items: [
              { label: lang === 'bm' ? 'Klien:' : 'Clients:', value: dayClients.length },
              { label: lang === 'bm' ? 'Dibayar:' : 'Paid:', value: `RM ${formatCurrency(totalPaidDay)}` },
              { label: lang === 'bm' ? 'Belum Bayar:' : 'Pending:', value: `RM ${formatCurrency(totalPendingDay)}` }
            ]
          }
        });
      }

      return daysList;
    }
  }, [processedClients, selectedMonth, lang, uniqueMonths]);

  const getExportDate = () => new Date().toISOString().split('T')[0];

  const getExportData = async () => {
    let baseData = exportScope === 'full' ? await onExportFull() : sortedClients;

    // Always sort by "No" ascending if exportScope is "full" (as requested by user)
    if (exportScope === 'full') {
      baseData = [...baseData].sort((a: any, b: any) => {
        const noA = a.No !== null && a.No !== undefined ? Number(a.No) : (a.NO !== null && a.NO !== undefined ? Number(a.NO) : Infinity);
        const noB = b.No !== null && b.No !== undefined ? Number(b.No) : (b.NO !== null && b.NO !== undefined ? Number(b.NO) : Infinity);
        if (noA === noB) return 0;
        if (isNaN(noA)) return 1;
        if (isNaN(noB)) return -1;
        return noA - noB;
      });
    }

    // Determine ordering keys for expanded view if needed
    const sampleClient = baseData[0] || {};
    const orderedKeys = getOrderedKeys(sampleClient);

    return baseData.map(client => {
      // Export Full Database always exports all columns (expanded).
      // Export Current View exports based on the active viewMode.
      if (exportScope === 'full') {
        return formatExpandedClient(client, lang, orderedKeys);
      }
      
      if (viewMode === 'lod') {
        return formatLodClient(client, lang);
      } else if (viewMode === 'expanded') {
        return formatExpandedClient(client, lang, orderedKeys);
      } else {
        return formatStandardClient(client, lang);
      }
    });
  };

  const handleExportExcel = async () => {
    const exportData = await getExportData();
    if (exportData.length === 0) return alert(t('attendance', 'noRecordsToExport', lang));
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Client Database");
    XLSX.writeFile(wb, `EmailRakyat_Clients_${getExportDate()}.xlsx`);
  };

  const handleExportCSV = async () => {
    const exportData = await getExportData();
    if (exportData.length === 0) return alert(t('attendance', 'noRecordsToExport', lang));
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `EmailRakyat_Clients_${getExportDate()}.csv`;
    link.click();
  };

  const handleExportPDF = async () => {
    const exportData = await getExportData();
    if (exportData.length === 0) return alert(t('attendance', 'noRecordsToExport', lang));

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('landscape');
    doc.text(`Email Rakyat - Client Database (Exported: ${getExportDate()})`, 14, 15);

    const tableColumn = Object.keys(exportData[0]);
    const tableRows = exportData.map(obj => Object.values(obj).map(v => String(v || '-')));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
      didParseCell: (data) => {
        const colHeader = tableColumn[data.column.index];
        if (data.section === 'body' && (colHeader === 'Name' || colHeader === 'NAME' || colHeader === 'Full Name' || colHeader === 'Nama Penuh')) {
           const rowData = exportData[data.row.index];
           const pendingVal = rowData["Pending (RM)"] || rowData["PENDING (RM)"] || rowData["Belum Bayar (RM)"];
           const isPending = hasPendingAmount(pendingVal);
           if (isPending) {
             data.cell.styles.fillColor = [254, 226, 226]; // light red (red-100)
             data.cell.styles.textColor = [127, 29, 29]; // high contrast dark red (red-900)
             data.cell.styles.fontStyle = 'bold';
           } else {
             data.cell.styles.fillColor = [220, 252, 231]; // light green (green-100)
             data.cell.styles.textColor = [20, 83, 45]; // high contrast dark green (green-900)
             data.cell.styles.fontStyle = 'bold';
           }
        }
      }
    });
    doc.save(`EmailRakyat_Clients_${getExportDate()}.pdf`);
  };

  return (
    <div className="flex flex-col h-auto w-full">
      <div className="md:hidden flex items-center gap-1.5 text-[11px] text-slate-450 dark:text-zinc-500 font-semibold uppercase tracking-wider mb-2 px-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
        <span>{t('clients', 'swipeHint', lang)}</span>
      </div>

      <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">


        <div className="flex border-b border-slate-200 dark:border-gray-800 px-3 md:px-4 bg-slate-50/50 dark:bg-gray-900/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => onViewModeChange('standard')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'standard' ? 'border-indigo-600 text-indigo-600 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            {t('clients', 'standardView', lang)}
          </button>
          <button
            onClick={() => onViewModeChange('expanded')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'expanded' ? 'border-cyan-600 text-cyan-600 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            {t('clients', 'expandedView', lang)}
          </button>
          <button
            onClick={() => onViewModeChange('lod')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'lod' ? 'border-rose-600 text-rose-600 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            {lang === 'bm' ? 'Surat Tuntutan (LoD)' : 'Letter of Demand (LoD)'}
          </button>
        </div>

        <div className="p-4 border-b border-cyan-700 dark:border-yellow-500/50 bg-cyan-600 dark:bg-gray-900 flex-shrink-0">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight hidden lg:block">{t('clients', 'clientRegistry', lang)}</h3>

            {/* EXPORT BUTTONS & ADD BUTTON */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value as 'current' | 'full')}
                  data-custom-select
                  className="w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-indigo-500 cursor-pointer h-[48px] shadow-sm appearance-none"
                >
                  <option value="current">{t('clients', 'exportCurrentView', lang)}</option>
                  <option value="full">{t('clients', 'exportFullDatabase', lang)}</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 flex-1 sm:flex-none justify-center overflow-hidden shadow-sm h-[48px] items-center">
                <button onClick={handleExportCSV} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-200 dark:border-gray-800 transition-colors h-full flex items-center justify-center">CSV</button>
                <button onClick={handleExportExcel} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-200 dark:border-gray-800 transition-colors h-full flex items-center justify-center">Excel</button>
                <button onClick={handleExportPDF} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors h-full flex items-center justify-center">PDF</button>
              </div>

              {canEdit && (
                <button
                  onClick={onAddClick}
                  className="text-xs font-semibold bg-white hover:bg-slate-50 text-cyan-700 dark:bg-yellow-500 dark:text-black font-semibold border-0 dark:hover:bg-yellow-400 dark:text-white px-4 py-2.5 rounded-xl transition-all shadow-sm w-full sm:w-auto h-[48px] flex items-center justify-center gap-1 border border-cyan-100 dark:border-yellow-500/50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>{t('clients', 'addClient', lang)}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t('clients', 'searchPlaceholder', lang)}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all h-[48px] shadow-sm"
              />
            </div>
            <div className="relative w-full sm:w-auto">
              <select
                value={dateFilter}
                onChange={(e) => onDateFilterChange(e.target.value)}
                data-custom-select
                className="w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-indigo-500 cursor-pointer h-[48px] shadow-sm appearance-none min-w-[140px]"
              >
                <option value="all">{t('clients', 'allDates', lang)}</option>
                <option value="year">{t('clients', 'thisYear', lang)}</option>
                <option value="month">{t('clients', 'thisMonth', lang)}</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-500 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin bg-white dark:bg-black relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs md:text-sm">
            <thead>
              {viewMode === 'standard' ? (
                <tr>
                  <SortHeader label={getLabel("NAME")} sortKey="NAME" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PHONE")} sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PENDING")} sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PAID")} sortKey="TOTAL PAID (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PACKAGE")} sortKey="PACKAGE (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("CATEGORY")} sortKey="CASE CATEGORY" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("DATE")} sortKey="DATE" currentSort={sort} onClick={handleSort} />
                  <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-gray-800 sticky top-0 right-0 bg-slate-50 dark:bg-gray-900 z-20 shadow-sm text-left">{t('clients', 'actions', lang)}</th>
                </tr>
              ) : viewMode === 'lod' ? (
                <tr>
                  <SortHeader label={getLabel("NO")} sortKey="No" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("NAME")} sortKey="NAME" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PHONE")} sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={lang === 'bm' ? 'Status Kes' : 'Case Status'} sortKey="CASE STATUS" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={getLabel("PENDING")} sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={lang === 'bm' ? 'Peringkat Terakhir' : 'Last Payment Stage'} sortKey="last_payment_stage" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={lang === 'bm' ? 'Tarikh Bayaran Terakhir' : 'Last Payment Date'} sortKey="last_payment_date" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={lang === 'bm' ? 'Tempoh Tunggakan' : 'Overdue Duration'} sortKey="overdue_days" currentSort={sort} onClick={handleSort} />
                  <SortHeader label={lang === 'bm' ? 'Tarikh LoD' : 'LoD Date'} sortKey="lod_date" currentSort={sort} onClick={handleSort} />
                  <th className="px-4 py-3.5 font-semibold text-slate-505 dark:text-zinc-400 border-b border-slate-200 dark:border-gray-800 sticky top-0 right-0 bg-slate-50 dark:bg-gray-900 z-20 shadow-sm text-left">{t('clients', 'actions', lang)}</th>
                </tr>
              ) : (
                <tr>
                  {getOrderedKeys(clients[0] || {}).map(key => (
                    <SortHeader key={key} label={getLabel(key)} sortKey={key} currentSort={sort} onClick={handleSort} />
                  ))}
                  <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-gray-800 sticky top-0 right-0 bg-slate-50 dark:bg-gray-900 z-20 shadow-sm text-left">{t('clients', 'actions', lang)}</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-150 dark:divide-gray-800">
              {paginatedClients.length > 0 ? paginatedClients.map((client) => {
                const rowId = client.id || client.NAME + client["PHONE NUMBER"];
                
                if (viewMode === 'lod') {
                  const overdueDays = client.overdueDays || 0;
                  const weeks = Math.floor(overdueDays / 7);
                  const days = overdueDays % 7;
                  
                  let durationStr = '';
                  if (lang === 'bm') {
                    durationStr = `${weeks} minggu, ${days} hari`;
                  } else {
                    const weekStr = weeks === 1 ? 'week' : 'weeks';
                    const dayStr = days === 1 ? 'day' : 'days';
                    durationStr = `${weeks} ${weekStr}, ${days} ${dayStr}`;
                  }
                  
                  if (weeks === 0 && days === 0) {
                    durationStr = lang === 'bm' ? 'Hari Ini' : 'Today';
                  }

                  let durationBadgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 font-semibold";
                  if (overdueDays > 0) {
                    if (weeks < 2) {
                      durationBadgeClass = "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 font-semibold";
                    } else if (weeks < 4) {
                      durationBadgeClass = "bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30 font-semibold";
                    } else {
                      durationBadgeClass = "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30 font-bold";
                    }
                  }

                  if (client.lastPaymentDate === null) {
                    durationStr = '-';
                    durationBadgeClass = "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700/50 font-semibold";
                  }

                  return (
                    <tr key={rowId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors group relative">
                      <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-mono">{client.No ?? client.NO ?? '-'}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white min-w-[180px] whitespace-normal leading-snug">{client.NAME}</td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-mono">{client["PHONE NUMBER"] || '-'}</td>
                      <td className="px-4 py-3.5 text-slate-500 dark:text-zinc-400">{client["CASE STATUS"] || '-'}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-zinc-300 font-semibold">RM {formatCurrency(parseAmount(client["PENDING (RM)"]))}</td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300">{getStageLabel(client.lastPaymentStage, lang)}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-zinc-400">{client.lastPaymentDateStr}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs ${durationBadgeClass}`}>
                          {durationStr}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-zinc-400">{client.lod_date || (lang === 'bm' ? 'Belum Dihantar' : 'Not Sent')}</td>
                      
                      <td className="px-4 py-3.5 text-left whitespace-nowrap sticky right-0 bg-white dark:bg-black group-hover:bg-slate-50 dark:group-hover:bg-zinc-900 transition-colors shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">
                        <div className="flex items-center justify-start gap-2">
                          <button
                            onClick={() => onViewClick(client)}
                            className="h-8 px-3 flex items-center justify-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-all shadow-sm"
                          >
                            {t('clients', 'viewDoc', lang)}
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => onEditClick(client)}
                              className="h-8 px-3 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm"
                            >
                              {lang === 'bm' ? 'Rekod LoD' : 'Record LoD'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const isPending = hasPendingAmount(client["PENDING (RM)"]);
                const nameHighlightClasses = client.isVirtual
                  ? "bg-slate-100 text-slate-700 dark:bg-zinc-800/40 dark:text-zinc-300 italic"
                  : isPending
                  ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100 font-bold"
                  : "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100 font-bold";

                return (
                  <tr key={rowId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors group relative">

                    {viewMode === 'standard' ? (
                      <>
                        <td className={`px-4 py-3.5 min-w-[200px] whitespace-normal leading-snug ${nameHighlightClasses}`}>
                          <div className="flex items-center gap-1.5">
                            {client.isVirtual && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex-shrink-0">
                                Storage
                              </span>
                            )}
                            <span>{client.NAME}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-mono min-w-[150px] max-w-[190px] whitespace-normal break-words leading-tight">{client["PHONE NUMBER"]}</td>
                        <td className="px-4 py-3.5 font-mono text-amber-600 dark:text-yellow-500">{client["PENDING (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["TOTAL PAID (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["PACKAGE (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300">{client["CASE CATEGORY"]}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-zinc-400">{client.DATE}</td>
                      </>
                    ) : (
                      <>
                        {getOrderedKeys(client).map((k) => {
                          const v = client[k];
                          
                          let displayVal = v;
                          if (['1st PAYMENT', '2nd PAYMENT', '3rd PAYMENT', '4th PAYMENT', '5th PAYMENT', '6th PAYMENT'].includes(k)) {
                            const dateKey = `${k} DATE`;
                            const dateVal = client[dateKey];
                            const parsedAmt = parseAmount(v);
                            if (parsedAmt === 0) {
                              const isDateEmpty = !dateVal || String(dateVal).trim() === '' || String(dateVal).trim() === '-';
                              if (isDateEmpty) {
                                displayVal = null;
                              }
                            }
                          }

                          const hasValue = displayVal !== null && displayVal !== undefined && String(displayVal).trim() !== '';
                          const textRepresentation = hasValue ? String(displayVal) : '-';

                          return (
                          <td key={k} className={`px-4 py-3.5 max-w-[150px] truncate ${k === 'NAME' ? nameHighlightClasses : 'text-slate-700 dark:text-zinc-300'}`} title={hasValue ? String(displayVal) : ''}>
                            {k === 'NAME' && client.isVirtual ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex-shrink-0">
                                  Storage
                                </span>
                                <span>{textRepresentation}</span>
                              </div>
                            ) : textRepresentation.startsWith('[') ? (
                                (() => {
                                  try {
                                    const parsed = JSON.parse(textRepresentation);
                                    if (Array.isArray(parsed)) {
                                      const validItems = parsed.filter(item => Object.values(item).some(val => val !== '' && val !== null));
                                      return validItems.length > 0 ? `${validItems.length} Items` : '-';
                                    }
                                  } catch (e) {
                                    const strV = textRepresentation.replace(/\s/g, '');
                                    if (strV === '[{date:,no:}]' || strV === '[{date:,no:,pem:,officer:}]') return '-';
                                    if (strV.includes('[{') && strV.includes('}]')) {
                                      return `${strV.split('},{').length} Items`;
                                    }
                                  }
                                  return textRepresentation;
                                })()
                              ) : (
                                textRepresentation
                              )}
                          </td>
                        );
                        })}
                      </>
                    )}


                    <td className="px-4 py-3.5 text-left whitespace-nowrap sticky right-0 bg-white dark:bg-black group-hover:bg-slate-50 dark:group-hover:bg-zinc-900 transition-colors shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">
                      <div className="flex items-center justify-start gap-2">
                        <button
                          onClick={() => onViewClick(client)}
                          className="h-8 px-3 flex items-center justify-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-all shadow-sm"
                        >
                          {t('clients', 'viewDoc', lang)}
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => onEditClick(client)}
                            className="h-8 px-3 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 text-xs font-semibold transition-all shadow-sm"
                          >
                            {t('reports', 'editBtn', lang)}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={viewMode === 'standard' ? 10 : viewMode === 'lod' ? 10 : 20} className="px-4 py-8 text-center text-xs font-semibold text-slate-505 dark:text-zinc-500 bg-slate-50/20 dark:bg-transparent">
                    {t('clients', 'noClientsFound', lang)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(() => {
          const totalRecords = viewMode === 'lod' ? sortedLodClients.length : sortedClients.length;
          const totalPages = Math.ceil(totalRecords / 25) || 1;
          const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * 25 + 1;
          const endRecord = Math.min(currentPage * 25, totalRecords);

          return (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/80">
              <div className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                {lang === 'bm' ? (
                  <>
                    Menunjukkan <span className="font-semibold text-slate-800 dark:text-white">{startRecord}</span> hingga <span className="font-semibold text-slate-800 dark:text-white">{endRecord}</span> daripada <span className="font-semibold text-slate-800 dark:text-white">{totalRecords}</span> klien
                  </>
                ) : (
                  <>
                    Showing <span className="font-semibold text-slate-800 dark:text-white">{startRecord}</span> to <span className="font-semibold text-slate-800 dark:text-white">{endRecord}</span> of <span className="font-semibold text-slate-800 dark:text-white">{totalRecords}</span> clients
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{t('clients', 'prev', lang)}</span>
                </button>

                <div className="flex items-center gap-1">
                  <span className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 dark:bg-yellow-500 text-white dark:text-black shadow-sm">
                    {currentPage}
                  </span>
                  <span className="text-slate-450 dark:text-zinc-550 text-xs font-semibold px-2">
                    {t('common', 'of', lang)} {totalPages}
                  </span>
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>{t('clients', 'next', lang)}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Dynamic Summary Cards & Month Registry Count Filter */}
      <div className="mt-6 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-2 pb-1">
          <svg className="w-5 h-5 text-cyan-600 dark:text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
          </svg>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            {t('clients', 'financialClientSummary', lang)}
          </h4>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Clients */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-200 dark:hover:border-gray-700/80 transition-all">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t('clients', 'totalClients', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-cyan-700 dark:text-yellow-500 mt-2">
              {totalClients}
            </span>
          </div>

          {/* Card 2: Total Package */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-200 dark:hover:border-gray-700/80 transition-all">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t('clients', 'totalPackageSum', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white mt-2">
              RM {formatCurrency(totalPackage)}
            </span>
          </div>

          {/* Card 3: Collected Amount */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-200 dark:hover:border-gray-700/80 transition-all">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t('clients', 'collectedAmountSum', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-emerald-600 dark:text-emerald-500 mt-2">
              RM {formatCurrency(totalPaid)}
            </span>
          </div>

          {/* Card 4: Pending Amount */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-200 dark:hover:border-gray-700/80 transition-all">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t('clients', 'pendingAmountSum', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-rose-600 dark:text-rose-500 mt-2">
              RM {formatCurrency(totalPending)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-gray-800" />

        {/* Month Registry Count Filter Sub-section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                {t('clients', 'monthlyRegistration', lang)}
              </h5>
              <p className="text-xs text-slate-400 dark:text-zinc-550">
                {t('clients', 'monthlyRegistrationSub', lang)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  data-custom-select
                  className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2 pl-3 pr-10 focus:outline-none focus:border-indigo-500 cursor-pointer min-h-[40px] shadow-sm min-w-[160px] appearance-none"
                >
                  <option value="all">
                    {t('clients', 'allMonthsOption', lang)}
                  </option>
                  {uniqueMonths.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="bg-cyan-50 dark:bg-yellow-500/10 border border-cyan-100 dark:border-yellow-500/20 px-4 py-2 rounded-xl flex items-center gap-2 min-h-[40px]">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                  {lang === 'bm' ? 'Klien:' : 'Clients:'}
                </span>
                <span className="text-sm font-extrabold text-cyan-600 dark:text-yellow-500">
                  {monthlyCount}
                </span>
              </div>
            </div>
          </div>

          {/* Registration Trend Chart */}
          {clientChartData.length > 0 && (
            <div className="p-5 border border-slate-100 dark:border-gray-800/80 rounded-2xl bg-slate-50/20 dark:bg-black/20 flex flex-col space-y-4">
              <InteractiveBarChart
                data={clientChartData}
                maxOverride={5}
                yAxisSuffix=""
                barColorGradStart="#22d3ee"
                barColorGradEnd="#0891b2"
                barColorHoverStart="#fbbf24"
                barColorHoverEnd="#f59e0b"
                onBarClick={selectedMonth === 'all' ? (item) => setSelectedMonth(item.key) : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}