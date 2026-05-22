import { useState, useMemo } from 'react';

// Stabilized date parser
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
    className="p-4 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors select-none group whitespace-nowrap text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 sticky top-0 z-10" 
    onClick={() => onClick(sortKey)}
  >
    <div className="flex items-center gap-2">
      {label}
      <span className={`text-[10px] ${currentSort.key === sortKey ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
        {currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </div>
  </th>
);

export default function ClientTable({ clients, canEdit }: { clients: any[], canEdit: boolean }) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'DATE', direction: 'desc' });

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

      const nameA = String(a.NAME || '').toLowerCase();
      const nameB = String(b.NAME || '').toLowerCase();
      if (nameA < nameB) return sort.direction === 'asc' ? -1 : 1;
      if (nameA > nameB) return sort.direction === 'asc' ? 1 : -1;

      return 0;
    });

    return result;
  }, [search, dateFilter, sort, clients]);

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl transition-colors duration-300">
      
      {/* Table Header & Controls */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-widest">Pangkalan Data Klien</h3>
          {canEdit && (
            <button className="text-xs font-bold uppercase tracking-wider bg-yellow-500 hover:bg-yellow-600 text-white dark:text-black px-5 py-2.5 rounded-lg transition-colors shadow-sm">
              + Tambah Klien
            </button>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input 
              type="text" 
              placeholder="Cari Nama, IC, Telefon, atau Kategori..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all placeholder-gray-400 dark:placeholder-gray-600"
            />
          </div>
          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 cursor-pointer transition-all"
          >
            <option value="all">Semua Tarikh</option>
            <option value="year">Daftar Tahun Ini</option>
            <option value="month">Daftar Bulan Ini</option>
          </select>
        </div>
      </div>

      {/* The Table */}
      <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <table className="w-full text-left border-collapse relative">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider">
              <SortHeader label="Tarikh" sortKey="DATE" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Nama" sortKey="NAME" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Telefon" sortKey="PHONE NUMBER" currentSort={sort} onClick={handleSort} />
              <SortHeader label="IC Number" sortKey="IC NUMBER" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Kategori" sortKey="CASE CATEGORY" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Dibayar (RM)" sortKey="TOTAL PAID (RM)" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Baki (RM)" sortKey="PENDING (RM)" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Pakej (RM)" sortKey="PACKAGE (RM)" currentSort={sort} onClick={handleSort} />
              <SortHeader label="Status" sortKey="CASE STATUS" currentSort={sort} onClick={handleSort} />
              {canEdit && <SortHeader label="Tindakan" sortKey="actions" currentSort={{key: ''}} onClick={() => {}} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
  {filteredClients.map((client) => {
    // This creates a permanent ID from the client data itself. 
    // It will NEVER stick because it doesn't rely on the order (index).
    const rowId = client.NAME + client["PHONE NUMBER"] + client.DATE;
    
    return (
      <tr key={rowId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
        <td className="p-4 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{client.DATE}</td>
        <td className="p-4 text-xs font-semibold text-gray-900 dark:text-white">{client.NAME}</td>
        <td className="p-4 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{client["PHONE NUMBER"]}</td>
        <td className="p-4 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{client["IC NUMBER"]}</td>
        <td className="p-4 text-xs text-gray-600 dark:text-gray-300">{client["CASE CATEGORY"]}</td>
        <td className="p-4 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">{client["TOTAL PAID (RM)"] || '0'}</td>
        <td className="p-4 text-xs font-mono font-medium text-red-600 dark:text-red-400">{client["PENDING (RM)"] || '0'}</td>
        <td className="p-4 text-xs font-mono font-medium text-blue-600 dark:text-blue-400">{client["PACKAGE (RM)"] || '0'}</td>
        <td className="p-4">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider whitespace-nowrap
            ${String(client["CASE STATUS"]).includes('COMPLETED') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500' 
            : String(client["CASE STATUS"]).includes('DROPPED') ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-500' 
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-500'}`}>
            {client["CASE STATUS"]}
          </span>
        </td>
        {canEdit && (
          <td className="p-4 text-right whitespace-nowrap">
            <button className="text-[11px] text-yellow-600 dark:text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-400 font-bold uppercase transition-colors">Ubah</button>
          </td>
        )}
      </tr>
    );
  })}
</tbody>
        </table>
      </div>
    </div>
  );
}