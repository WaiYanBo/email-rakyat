import { useState, useMemo, useEffect } from 'react';

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
  if (['TOTAL PAID (RM)', 'PENDING (RM)', 'PACKAGE (RM)', '1st PAYMENT', '2nd PAYMENT', '3rd PAYMENT', '4th PAYMENT', '5th PAYMENT', '6th PAYMENT'].includes(key)) {
    const rawNumber = String(obj[key] || '0').replace(/[^0-9.-]+/g, '');
    return parseFloat(rawNumber) || 0;
  }
  return String(obj[key] || '').toLowerCase().trim();
};

const hasPendingAmount = (pendingVal: any) => {
  const num = parseFloat(String(pendingVal || '0').replace(/[^0-9.-]+/g, ''));
  return !isNaN(num) && num > 0;
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
  viewMode: 'standard' | 'expanded',
  onViewModeChange: (mode: 'standard' | 'expanded') => void,
  onExportFull: () => Promise<any[]>,
  onAddClick: () => void,
  onEditClick: (client: any) => void,
  onViewClick: (client: any) => void
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'DATE', direction: 'desc' });
  const [exportScope, setExportScope] = useState<'current' | 'full'>('current');
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to first page when data (or search/filters) changes
  useEffect(() => {
    setCurrentPage(1);
  }, [clients, sort]);

  const handleSort = (key: string) => {
    setSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedClients = useMemo(() => {
    let result = [...clients];

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
  }, [sort, clients]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * 25;
    return sortedClients.slice(start, start + 25);
  }, [sortedClients, currentPage]);

  const getExportDate = () => new Date().toISOString().split('T')[0];

  const getExportData = async () => {
    const baseData = exportScope === 'full' ? await onExportFull() : sortedClients;

    return baseData.map(client => {
      const { id, _stableKey, updated_at, ...cleanClient } = client;

      if (viewMode === 'standard' && exportScope === 'current') {
        return {
          "Name": cleanClient.NAME || '-',
          "Phone": cleanClient["PHONE NUMBER"] || '-',
          "IC Number": cleanClient["IC NUMBER"] || '-',
          "Category": cleanClient["CASE CATEGORY"] || '-',
          "Paid (RM)": cleanClient["TOTAL PAID (RM)"] || '0',
          "Pending (RM)": cleanClient["PENDING (RM)"] || '0',
          "Package (RM)": cleanClient["PACKAGE (RM)"] || '0',
          "Status": cleanClient["CASE STATUS"] || '-',
          "Investigation Paper": cleanClient["Investigation Paper"] || '-',
          "Report": cleanClient.Report || '-',
          "Action Taken by police": cleanClient["Action Taken by police"] || '-',
          "Date": cleanClient.DATE || '-',
        };
      }

      return cleanClient;
    });
  };

  const handleExportExcel = async () => {
    const exportData = await getExportData();
    if (exportData.length === 0) return alert("No data to export");
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Client Database");
    XLSX.writeFile(wb, `EmailRakyat_Clients_${getExportDate()}.xlsx`);
  };

  const handleExportCSV = async () => {
    const exportData = await getExportData();
    if (exportData.length === 0) return alert("No data to export");
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
    if (exportData.length === 0) return alert("No data to export");

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
        if (data.section === 'body' && (tableColumn[data.column.index] === 'Name' || tableColumn[data.column.index] === 'NAME')) {
           const rowData = exportData[data.row.index];
           const pendingVal = rowData["Pending (RM)"] || rowData["PENDING (RM)"];
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
        <span>Swipe table horizontally to view more</span>
      </div>

      <div className="bg-white dark:bg-gray-900/50 border border-slate-205 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">


        <div className="flex border-b border-slate-200 dark:border-gray-800 px-3 md:px-4 bg-slate-50/50 dark:bg-gray-900/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => onViewModeChange('standard')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'standard' ? 'border-indigo-600 text-indigo-600 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            Standard View
          </button>
          <button
            onClick={() => onViewModeChange('expanded')}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${viewMode === 'expanded' ? 'border-cyan-600 text-cyan-600 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            Expanded View (Full Details)
          </button>
        </div>

        <div className="p-4 border-b border-cyan-700 dark:border-yellow-500/50 bg-cyan-600 dark:bg-gray-900 flex-shrink-0">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight hidden lg:block">Client Registry</h3>

            {/* EXPORT BUTTONS & ADD BUTTON */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <select
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as 'current' | 'full')}
                className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 cursor-pointer flex-1 sm:flex-none min-h-[48px] shadow-sm"
              >
                <option value="current">Export Current View</option>
                <option value="full">Export Full Database</option>
              </select>

              <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 flex-1 sm:flex-none justify-center overflow-hidden shadow-sm">
                <button onClick={handleExportCSV} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-150 dark:border-gray-800 transition-colors min-h-[48px]">CSV</button>
                <button onClick={handleExportExcel} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-150 dark:border-gray-800 transition-colors min-h-[48px]">Excel</button>
                <button onClick={handleExportPDF} className="flex-1 sm:flex-none text-xs font-semibold px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors min-h-[48px]">PDF</button>
              </div>

              {canEdit && (
                <button
                  onClick={onAddClick}
                  className="text-xs font-semibold bg-white hover:bg-slate-50 text-cyan-700 dark:bg-yellow-500 dark:text-black font-semibold border-0 dark:hover:bg-yellow-400 dark:text-white px-4 py-2.5 rounded-xl transition-all shadow-sm w-full sm:w-auto min-h-[48px] flex items-center justify-center gap-1 border border-cyan-100 dark:border-yellow-500/50"
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
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all min-h-[48px] shadow-sm"
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => onDateFilterChange(e.target.value)}
              className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 cursor-pointer w-full sm:w-auto min-h-[48px] shadow-sm"
            >
              <option value="all">All Dates</option>
              <option value="year">This Year</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin bg-white dark:bg-black relative">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs md:text-sm">
            <thead>
              {viewMode === 'standard' ? (
                <tr>
                  <SortHeader label="Name" sortKey="NAME" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Phone" sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Pending" sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Paid" sortKey="TOTAL PAID (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Package" sortKey="PACKAGE (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Investigation Paper" sortKey="Investigation Paper" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Report" sortKey="Report" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Action Taken" sortKey="Action Taken by police" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Category" sortKey="CASE CATEGORY" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Date" sortKey="DATE" currentSort={sort} onClick={handleSort} />
                  <th className="px-4 py-3.5 font-semibold text-slate-550 dark:text-zinc-400 border-b border-slate-200 dark:border-gray-800 sticky top-0 right-0 bg-slate-50 dark:bg-gray-900 z-20 shadow-sm text-left">Actions</th>
                </tr>
              ) : (
                <tr>
                  {Object.keys(clients[0] || {}).filter(k => !['id', '_stableKey', 'updated_at'].includes(k)).map(key => (
                    <SortHeader key={key} label={key} sortKey={key} currentSort={sort} onClick={handleSort} />
                  ))}
                  <th className="px-4 py-3.5 font-semibold text-slate-550 dark:text-zinc-400 border-b border-slate-205 dark:border-gray-800 sticky top-0 right-0 bg-slate-50 dark:bg-gray-900 z-20 shadow-sm text-left">Actions</th>
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-150 dark:divide-gray-800">
              {paginatedClients.length > 0 ? paginatedClients.map((client) => {
                const rowId = client.id || client.NAME + client["PHONE NUMBER"];
                const isPending = hasPendingAmount(client["PENDING (RM)"]);
                const nameHighlightClasses = isPending
                  ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100 font-bold"
                  : "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100 font-bold";

                return (
                  <tr key={rowId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition-colors group relative">

                    {viewMode === 'standard' ? (
                      <>
                        <td className={`px-4 py-3.5 min-w-[200px] whitespace-normal leading-snug ${nameHighlightClasses}`}>{client.NAME}</td>
                        <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 font-mono min-w-[150px] max-w-[190px] whitespace-normal break-words leading-tight">{client["PHONE NUMBER"]}</td>
                        <td className="px-4 py-3.5 font-mono text-amber-650 dark:text-yellow-500">{client["PENDING (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["TOTAL PAID (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-800 dark:text-zinc-200">{client["PACKAGE (RM)"] || '0'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300 max-w-[150px] truncate" title={client["Investigation Paper"] || ''}>{client["Investigation Paper"] || '-'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300 max-w-[150px] truncate" title={client.Report || ''}>{client.Report || '-'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300 max-w-[150px] truncate" title={client["Action Taken by police"] || ''}>{client["Action Taken by police"] || '-'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300">{client["CASE CATEGORY"]}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-zinc-400">{client.DATE}</td>
                      </>
                    ) : (
                      <>
                        {Object.entries(client).filter(([k]) => !['id', '_stableKey', 'updated_at'].includes(k)).map(([k, v]) => (
                          <td key={k} className={`px-4 py-3.5 max-w-[150px] truncate ${k === 'NAME' ? nameHighlightClasses : 'text-slate-700 dark:text-zinc-300'}`} title={String(v || '')}>
                            {String(v || '-')}
                          </td>
                        ))}
                      </>
                    )}


                    <td className="px-4 py-3.5 text-left whitespace-nowrap sticky right-0 bg-white dark:bg-black group-hover:bg-slate-50 dark:group-hover:bg-zinc-900 transition-colors shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">
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
                            className="h-8 px-3 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-750 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-750 border border-slate-205 dark:border-gray-700 text-xs font-semibold transition-all shadow-sm"
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

        {(() => {
          const totalRecords = sortedClients.length;
          const totalPages = Math.ceil(totalRecords / 25) || 1;
          const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * 25 + 1;
          const endRecord = Math.min(currentPage * 25, totalRecords);

          return (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/80">
              <div className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                Showing <span className="font-semibold text-slate-800 dark:text-white">{startRecord}</span> to <span className="font-semibold text-slate-800 dark:text-white">{endRecord}</span> of <span className="font-semibold text-slate-800 dark:text-white">{totalRecords}</span> clients
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
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  <span className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 dark:bg-yellow-500 text-white dark:text-black shadow-sm">
                    {currentPage}
                  </span>
                  <span className="text-slate-450 dark:text-zinc-500 text-xs font-semibold px-2">
                    of {totalPages}
                  </span>
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}