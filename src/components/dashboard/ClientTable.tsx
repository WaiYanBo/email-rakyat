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
    className="px-2 md:px-3 py-2.5 font-bold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none group whitespace-nowrap text-[11px] md:text-xs text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 sticky top-0 bg-gray-100 dark:bg-gray-800 z-10 shadow-sm" 
    onClick={() => onClick(sortKey)}
  >
    <div className="flex items-center gap-1.5">
      {label}
      <span className={`text-[10px] ${currentSort.key === sortKey ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
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

  // ==========================================
  // EXPORT FUNCTIONS
  // ==========================================
  const getExportDate = () => new Date().toISOString().split('T')[0];

  const getExportData = () => {
    // 'full' means raw Supabase data. 'current' means filtered by search/date.
    const baseData = exportScope === 'full' ? clients : filteredClients;

    return baseData.map(client => {
      // Clean system IDs out automatically
      const { id, _stableKey, updated_at, ...cleanClient } = client;

      // If they are on Standard View AND Current Scope, only export standard columns
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
      
      // If Expanded View OR Full Export, export everything remaining in Supabase
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
    
    // Automatically map columns based on what data is being exported
    const tableColumn = Object.keys(exportData[0]);
    const tableRows = exportData.map(obj => Object.values(obj).map(v => String(v || '-')));

    autoTable(doc, { 
      head: [tableColumn], 
      body: tableRows, 
      startY: 20,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [13, 148, 136] }
    });
    doc.save(`EmailRakyat_Clients_${getExportDate()}.pdf`);
  };

  return (
    <div className="flex flex-col h-[80vh] md:h-[75vh]">
      <div className="md:hidden flex items-center gap-2 text-[10px] text-teal-600 dark:text-yellow-500 font-bold uppercase tracking-wider mb-2 px-1">
        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
        Swipe table horizontally to view more
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
        
        {/* NEW TABS SECTION */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-3 md:px-4 bg-gray-50 dark:bg-gray-950 overflow-x-auto scrollbar-none">
          <button 
            onClick={() => setViewMode('standard')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${viewMode === 'standard' ? 'border-teal-600 text-teal-700 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Standard View
          </button>
          <button 
            onClick={() => setViewMode('expanded')}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${viewMode === 'expanded' ? 'border-teal-600 text-teal-700 dark:border-yellow-500 dark:text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Expanded View (Full Details)
          </button>
        </div>

        <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
            <h3 className="text-xs md:text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest hidden lg:block">Database</h3>
            
            {/* EXPORT BUTTONS & ADD BUTTON */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <select 
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as 'current' | 'full')}
                className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] md:text-xs font-bold uppercase rounded-md py-1.5 px-2 focus:ring-1 focus:ring-teal-500 cursor-pointer flex-1 sm:flex-none"
              >
                <option value="current">Export Current View</option>
                <option value="full">Export Full Database</option>
              </select>

              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-md border border-gray-200 dark:border-gray-700 flex-1 sm:flex-none justify-center">
                <button onClick={handleExportCSV} className="text-[10px] font-bold px-2 md:px-3 py-1.5 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">CSV</button>
                <button onClick={handleExportExcel} className="text-[10px] font-bold px-2 md:px-3 py-1.5 rounded hover:bg-white dark:hover:bg-gray-700 text-emerald-600 dark:text-emerald-400 transition-colors">Excel</button>
                <button onClick={handleExportPDF} className="text-[10px] font-bold px-2 md:px-3 py-1.5 rounded hover:bg-white dark:hover:bg-gray-700 text-red-600 dark:text-red-400 transition-colors">PDF</button>
              </div>
              
              {canEdit && (
                <button 
                  onClick={onAddClick}
                  className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-black px-3 md:px-4 py-2 rounded-md transition-colors shadow-sm w-full sm:w-auto mt-2 sm:mt-0"
                >
                  + Add Client
                </button>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </span>
              <input 
                type="text" 
                placeholder="Search Database..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] md:text-xs text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 dark:focus:ring-yellow-500 transition-all min-h-[40px]"
              />
            </div>
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[11px] md:text-xs rounded-md py-2 px-3 focus:ring-1 focus:ring-teal-500 cursor-pointer w-full sm:w-auto"
            >
              <option value="all">All Dates</option>
              <option value="year">This Year</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 bg-white dark:bg-gray-900 relative">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              {viewMode === 'standard' ? (
                <tr>
                  <SortHeader label="Date" sortKey="DATE" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Name" sortKey="NAME" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Phone" sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="ID" sortKey="IC NUMBER" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Category" sortKey="CASE CATEGORY" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Paid" sortKey="TOTAL PAID (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Pending" sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Package" sortKey="PACKAGE (RM)" currentSort={sort} onClick={handleSort} />
                  <SortHeader label="Status" sortKey="CASE STATUS" currentSort={sort} onClick={handleSort} />
                  <th className="px-2 md:px-3 py-2.5 font-bold text-[11px] md:text-xs text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 sticky top-0 right-0 bg-gray-100 dark:bg-gray-800 z-20 shadow-sm text-right">Actions</th>
                </tr>
              ) : (
                <tr>
                  {Object.keys(filteredClients[0] || {}).filter(k => !['id', '_stableKey', 'updated_at'].includes(k)).map(key => (
                    <SortHeader key={key} label={key} sortKey={key} currentSort={sort} onClick={handleSort} />
                  ))}
                  <th className="px-2 md:px-3 py-2.5 font-bold text-[11px] md:text-xs text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 sticky top-0 right-0 bg-gray-100 dark:bg-gray-800 z-20 shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.1)] text-right">Actions</th>
                </tr>
              )}
            </thead>
            
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredClients.length > 0 ? filteredClients.map((client) => {
                const rowId = client.id || client.NAME + client["PHONE NUMBER"];
                return (
                  <tr key={rowId} className="hover:bg-teal-50/50 dark:hover:bg-gray-800/50 transition-colors group text-[11px] md:text-xs relative">
                    
                    {viewMode === 'standard' ? (
                      <>
                        <td className="px-2 md:px-3 py-2.5 font-mono text-gray-500 dark:text-gray-400">{client.DATE}</td>
                        <td className="px-2 md:px-3 py-2.5 font-bold text-gray-900 dark:text-white truncate max-w-[120px] md:max-w-[150px]">{client.NAME}</td>
                        <td className="px-2 md:px-3 py-2.5 text-gray-600 dark:text-gray-400">{client["PHONE NUMBER"]}</td>
                        <td className="px-2 md:px-3 py-2.5 text-gray-600 dark:text-gray-400">{client["IC NUMBER"]}</td>
                        <td className="px-2 md:px-3 py-2.5 text-gray-600 dark:text-gray-300">{client["CASE CATEGORY"]}</td>
                        <td className="px-2 md:px-3 py-2.5 font-mono text-emerald-600 dark:text-emerald-400">{client["TOTAL PAID (RM)"] || '0'}</td>
                        <td className="px-2 md:px-3 py-2.5 font-mono text-red-600 dark:text-red-400">{client["PENDING (RM)"] || '0'}</td>
                        <td className="px-2 md:px-3 py-2.5 font-mono text-blue-600 dark:text-blue-400">{client["PACKAGE (RM)"] || '0'}</td>
                        <td className="px-2 md:px-3 py-2.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider
                            ${String(client["CASE STATUS"]).includes('COMPLETED') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
                            : String(client["CASE STATUS"]).includes('DROPPED') ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' 
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'}`}>
                            {client["CASE STATUS"]}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        {Object.entries(client).filter(([k]) => !['id', '_stableKey', 'updated_at'].includes(k)).map(([k, v]) => (
                          <td key={k} className="px-2 md:px-3 py-2.5 text-gray-600 dark:text-gray-300 max-w-[150px] truncate" title={String(v || '')}>
                            {String(v || '-')}
                          </td>
                        ))}
                      </>
                    )}

                    {/* Actions Menu - Sticky Right Edge */}
                    <td className="px-2 md:px-3 py-2.5 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-gray-900 group-hover:bg-teal-50 dark:group-hover:bg-gray-800 transition-colors shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.1)] z-10">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => onViewClick(client)}
                          className="text-[9px] bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-400 px-2 md:px-3 py-1 md:py-1.5 rounded font-bold uppercase transition-colors border border-blue-200 dark:border-blue-500/30 shadow-sm min-h-[36px] md:min-h-[40px]"
                        >
                          View
                        </button>
                        {canEdit && (
                          <button 
                            onClick={() => onEditClick(client)}
                            className="text-[9px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 md:px-3 py-1 md:py-1.5 rounded font-bold uppercase transition-colors border border-gray-200 dark:border-gray-700 shadow-sm min-h-[36px] md:min-h-[40px]"
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
                  <td colSpan={viewMode === 'standard' ? 10 : 20} className="px-3 py-8 text-center text-xs text-gray-500 bg-gray-50/50 dark:bg-transparent">
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