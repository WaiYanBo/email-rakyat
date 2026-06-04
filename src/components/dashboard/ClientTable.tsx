import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getSortValue = (obj: any, key: string) => {
  if (key === 'DATE') {
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
  if (['TOTAL PAID (RM)', 'PENDING (RM)', 'PACKAGE (RM)'].includes(key)) {
    const rawNumber = String(obj[key] || '0').replace(/[^0-9.-]+/g, '');
    return parseFloat(rawNumber) || 0;
  }
  return String(obj[key] || '').toLowerCase().trim();
};

const SortHeader = ({ label, sortKey, currentSort, onClick }: any) => (
  <th
    className="px-4 py-3.5 font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors select-none group whitespace-nowrap text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 sticky top-0 bg-slate-50 dark:bg-zinc-900 z-10 shadow-sm"
    onClick={() => onClick(sortKey)}
  >
    <div className="flex items-center gap-1.5 justify-start">
      <span>{label}</span>
      <span className={`text-[10px] transition-opacity ${currentSort.key === sortKey ? 'text-indigo-600 dark:text-indigo-400 font-bold opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
        {currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </div>
  </th>
);

export default function ClientTable({
  clients,
  canEdit,
  onAddClick,
  onEditClick,
  onViewClick
}: {
  clients: any[],
  canEdit: boolean,
  onAddClick: () => void,
  onEditClick: (client: any) => void,
  onViewClick: (client: any) => void
}) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'DATE', direction: 'desc' });
  const [viewMode, setViewMode] = useState<'standard' | 'expanded'>('standard');
  const [exportScope, setExportScope] = useState<'current' | 'full'>('current');

  const handleSort = (key: string) => {
    setSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const filteredClients = useMemo(() => {
    let result = [...clients];
    const now = new Date();

    if (dateFilter !== 'all') {
      result = result.filter(c => {
        if (!c.DATE) return false;
        const parts = String(c.DATE).trim().split('/');
        if (parts.length === 3) {
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          const month = parseInt(parts[1], 10) - 1;
          if (dateFilter === 'year') return year === now.getFullYear();
          if (dateFilter === 'month') return year === now.getFullYear() && month === now.getMonth();
        }
        return true;
      });
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(c =>
        (c.NAME && String(c.NAME).toLowerCase().includes(lowerSearch)) ||
        (c["IC NUMBER"] && String(c["IC NUMBER"]).toLowerCase().includes(lowerSearch)) ||
        (c["PHONE NUMBER"] && String(c["PHONE NUMBER"]).toLowerCase().includes(lowerSearch)) ||
        (c["CASE CATEGORY"] && String(c["CASE CATEGORY"]).toLowerCase().includes(lowerSearch))
      );
    }

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
  }, [search, dateFilter, sort, clients]);

  const getExportDate = () => new Date().toISOString().split('T')[0];

  const getExportData = () => {
    const baseData = exportScope === 'full' ? clients : filteredClients;

    return baseData.map(client => {
      const { id, _stableKey, updated_at, ...cleanClient } = client;

      if (viewMode === 'standard' && exportScope === 'current') {
        return {
          "Date": cleanClient.DATE || '-',
          "Name": cleanClient.NAME || '-',
          "Phone": cleanClient["PHONE NUMBER"] || '-',
          "IC Number": cleanClient["IC NUMBER"] || '-',
          "Category": cleanClient["CASE CATEGORY"] || '-',
          "Paid (RM)": cleanClient["TOTAL PAID (RM)"] || '0',
          "Pending (RM)": cleanClient["PENDING (RM)"] || '0',
          "Package (RM)": cleanClient["PACKAGE (RM)"] || '0',
          "Status": cleanClient["CASE STATUS"] || '-'
        };
      }

      return cleanClient;
    });
  };

  const handleExportExcel = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return alert("No data to export");
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Client Database");
    XLSX.writeFile(wb, `EmailRakyat_Clients_${getExportDate()}.xlsx`);
  };

  const handleExportCSV = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return alert("No data to export");
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `EmailRakyat_Clients_${getExportDate()}.csv`;
    link.click();
  };

  const handleExportPDF = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return alert("No data to export");

    const doc = new jsPDF('landscape');
    doc.text(`Email Rakyat - Client Database (Exported: ${getExportDate()})`, 14, 15);

    const tableColumn = Object.keys(exportData[0]);
    const tableRows = exportData.map(obj => Object.values(obj).map(v => String(v || '-')));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229] } // Indigo-600
    });
    doc.save(`EmailRakyat_Clients_${getExportDate()}.pdf`);
  };

  return (
    <div className="flex flex-col h-[80vh] md:h-[75vh]">
      <div className="md:hidden flex items-center gap-1.5 text-[11px] text-slate-450 dark:text-zinc-500 font-semibold uppercase tracking-wider mb-2 px-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
        <span>Swipe table horizontally to view more</span>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-slate-205 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800 px-3 md:px-4 bg-slate-50/50 dark:bg-zinc-900/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setViewMode('standard')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'standard' ? 'border-indigo-600 text-indigo-600 dark:border-indigo-500 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            Standard View
          </button>
          <button
            onClick={() => setViewMode('expanded')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'expanded' ? 'border-cyan-600 text-cyan-600 dark:border-cyan-500 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            Expanded View (Full Details)
          </button>
        </div>

        <div className="p-4 border-b border-cyan-700 dark:border-cyan-800 bg-cyan-600 dark:bg-cyan-900 flex-shrink-0">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight hidden lg:block">Client Registry</h3>

            {/* EXPORT BUTTONS & ADD BUTTON */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <select
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as 'current' | 'full')}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 cursor-pointer flex-1 sm:flex-none min-h-[48px] shadow-sm"
              >
                <option value="current">Export Current View</option>
                <option value="full">Export Full Database</option>
              </select>

              <div className="flex bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 flex-1 sm:flex-none justify-center overflow-hidden shadow-sm">
                <button onClick={handleExportCSV} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-150 dark:border-zinc-800 transition-colors min-h-[48px]">CSV</button>
                <button onClick={handleExportExcel} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-150 dark:border-zinc-800 transition-colors min-h-[48px]">Excel</button>
                <button onClick={handleExportPDF} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors min-h-[48px]">PDF</button>
              </div>

              {canEdit && (
                <button
                  onClick={onAddClick}
                  className="text-xs font-semibold bg-white hover:bg-slate-50 text-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:text-white px-4 py-2.5 rounded-xl transition-all shadow-sm w-full sm:w-auto min-h-[48px] flex items-center justify-center gap-1 border border-cyan-100 dark:border-cyan-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>Add Client</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search Client Database..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all min-h-[48px] shadow-sm"
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 cursor-pointer w-full sm:w-auto min-h-[48px] shadow-sm"
            >
              <option value="all">All Dates</option>
              <option value="year">This Year</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin bg-white dark:bg-zinc-950 relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs md:text-sm">
            <thead>
              {viewMode === 'standard' ? (
                <tr>
                  <SortHeader label="Date" sortKey="DATE" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Name" sortKey="NAME" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Phone" sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Pending" sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Paid" sortKey="TOTAL PAID (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Package" sortKey="PACKAGE (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Category" sortKey="CASE CATEGORY" currentSort={sort} onClick={handleSort} />
                  <th className="px-4 py-3.5 font-semibold text-slate-550 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 sticky top-0 right-0 bg-slate-50 dark:bg-zinc-900 z-20 shadow-sm text-left">Actions</th>
                </tr>
              ) : (
                <tr>
                  {Object.keys(filteredClients[0] || {}).filter(k => !['id', '_stableKey', 'updated_at'].includes(k)).map(key => (
                    <SortHeader key={key} label={key} sortKey={key} currentSort={sort} onClick={handleSort} />
                  ))}
                  <th className="px-4 py-3.5 font-semibold text-slate-550 dark:text-zinc-400 border-b border-slate-205 dark:border-zinc-800 sticky top-0 right-0 bg-slate-50 dark:bg-zinc-900 z-20 shadow-sm text-left">Actions</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
              {filteredClients.length > 0 ? filteredClients.map((client) => {
                const rowId = client.id || client.NAME + client["PHONE NUMBER"];
                return (
                  <tr key={rowId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors group relative">

                    {viewMode === 'standard' ? (
                      <>
                        <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-zinc-400">{client.DATE}</td>
                        <td className="px-4 py-3.5 font-bold text-slate-805 dark:text-white min-w-[200px] whitespace-normal leading-snug">{client.NAME}</td>
                        <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-mono min-w-[150px] max-w-[190px] whitespace-normal break-words leading-tight">{client["PHONE NUMBER"]}</td>
                        <td className="px-4 py-3.5 font-mono text-amber-650 dark:text-amber-400">{client["PENDING (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["TOTAL PAID (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["PACKAGE (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 text-slate-750 dark:text-zinc-350">{client["CASE CATEGORY"]}</td>
                      </>
                    ) : (
                      <>
                        {Object.entries(client).filter(([k]) => !['id', '_stableKey', 'updated_at'].includes(k)).map(([k, v]) => (
                          <td key={k} className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 max-w-[150px] truncate" title={String(v || '')}>
                            {String(v || '-')}
                          </td>
                        ))}
                      </>
                    )}

                    {/* Actions Menu - Compact Row Buttons */}
                    <td className="px-4 py-3.5 text-left whitespace-nowrap sticky right-0 bg-white dark:bg-zinc-950 group-hover:bg-slate-50 dark:group-hover:bg-zinc-900 transition-colors shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">
                      <div className="flex items-center justify-start gap-2">
                        <button
                          onClick={() => onViewClick(client)}
                          className="h-8 px-3 flex items-center justify-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold transition-all shadow-sm"
                        >
                          View
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => onEditClick(client)}
                            className="h-8 px-3 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-750 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 border border-slate-205 dark:border-zinc-700 text-xs font-semibold transition-all shadow-sm"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={viewMode === 'standard' ? 10 : 20} className="px-4 py-8 text-center text-xs font-semibold text-slate-505 dark:text-zinc-500 bg-slate-50/20 dark:bg-transparent">
                    No clients found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}