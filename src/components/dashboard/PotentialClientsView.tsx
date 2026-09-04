import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { usePortalLanguage } from '../../hooks/usePortalLanguage';
import { t } from '../../lib/portalI18n';
import { sanitizeInput } from '../../utils/security';

export interface PotentialClient {
  id: string;
  full_name: string;
  ic_number: string | null;
  phone_number: string | null;
  email: string | null;
  address: string | null;
  date: string | null;
  case_category: string | null;
  potential_level: 'High' | 'Medium' | 'Low';
  lead_by: string | null;
  notes: string | null;
  status: string | null;
  created_at?: string;
  updated_at?: string;
}

interface PotentialClientsViewProps {
  canEdit: boolean;
  onClientConverted?: () => void;
}

export default function PotentialClientsView({ canEdit, onClientConverted }: PotentialClientsViewProps) {
  const { lang } = usePortalLanguage();

  const [clients, setClients] = useState<PotentialClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissingError, setTableMissingError] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [potentialFilter, setPotentialFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'year' | 'month'>('all');
  const [sortKey, setSortKey] = useState<keyof PotentialClient>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Staff members for "Lead By" dropdown
  const [staffList, setStaffList] = useState<string[]>([]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [activeClient, setActiveClient] = useState<PotentialClient | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    ic_number: '',
    phone_number: '+60 ',
    email: '',
    address: '',
    date: '',
    case_category: 'Ah Long',
    custom_case_category: '',
    is_custom_category: false,
    potential_level: 'High' as 'High' | 'Medium' | 'Low',
    lead_by: '',
    custom_lead_by: '',
    is_custom_lead: false,
    notes: '',
    status: 'New'
  });
  const [submitting, setSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load Staff List from profiles for "Lead By" selector
  useEffect(() => {
    async function fetchStaff() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, status')
          .order('full_name', { ascending: true });

        if (!error && data) {
          const names = data
            .filter(p => p.status !== 'Resigned' && p.status !== 'Terminated' && p.status !== 'Inactive')
            .map(p => p.full_name?.trim())
            .filter((n): n is string => Boolean(n && n.length > 0));
          setStaffList(Array.from(new Set(names)));
        }
      } catch (err) {
        console.error('Error fetching staff list for Lead By:', err);
      }
    }
    fetchStaff();
  }, []);

  // Fetch Potential Clients
  const fetchPotentialClients = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      setTableMissingError(false);

      const { data, error } = await supabase
        .from('potential_clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Table doesn't exist yet in Supabase (42P01)
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          setTableMissingError(true);
        } else {
          setFetchError(error.message);
        }
        setClients([]);
        return;
      }

      setClients(data || []);
    } catch (err: any) {
      console.error('Error loading potential clients:', err);
      setFetchError(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPotentialClients();
  }, []);

  // Format today's date in DD/MM/YYYY
  const getTodayFormatted = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleOpenAddModal = () => {
    setFormData({
      full_name: '',
      ic_number: '',
      phone_number: '+60 ',
      email: '',
      address: '',
      date: getTodayFormatted(),
      case_category: 'Ah Long',
      custom_case_category: '',
      is_custom_category: false,
      potential_level: 'High',
      lead_by: staffList.length > 0 ? staffList[0] : '',
      custom_lead_by: '',
      is_custom_lead: false,
      notes: '',
      status: 'New'
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (client: PotentialClient) => {
    setActiveClient(client);
    const standardCategories = ['Ah Long', 'Kredit Komuniti', 'Bank', 'Scam Victim', 'Kemalangan', 'Tuntutan Sivil', 'Lain-lain'];
    const isCustomCat = Boolean(client.case_category && !standardCategories.includes(client.case_category));

    const isCustomLead = Boolean(client.lead_by && !staffList.includes(client.lead_by));

    setFormData({
      full_name: client.full_name || '',
      ic_number: client.ic_number || '',
      phone_number: client.phone_number || '+60',
      email: client.email || '',
      address: client.address || '',
      date: client.date || '',
      case_category: isCustomCat ? 'Custom' : (client.case_category || 'Ah Long'),
      custom_case_category: isCustomCat ? (client.case_category || '') : '',
      is_custom_category: isCustomCat,
      potential_level: client.potential_level || 'High',
      lead_by: isCustomLead ? 'Custom' : (client.lead_by || ''),
      custom_lead_by: isCustomLead ? (client.lead_by || '') : '',
      is_custom_lead: isCustomLead,
      notes: client.notes || '',
      status: client.status || 'New'
    });
    setIsEditModalOpen(true);
  };

  const handleOpenViewModal = (client: PotentialClient) => {
    setActiveClient(client);
    setIsViewModalOpen(true);
  };

  // Submit Handler for Add / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      alert(lang === 'bm' ? 'Sila masukkan nama penuh klien.' : 'Please enter the client full name.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();

      const finalCategory = formData.is_custom_category
        ? sanitizeInput(formData.custom_case_category, 100)
        : sanitizeInput(formData.case_category, 100);

      const finalLeadBy = formData.is_custom_lead
        ? sanitizeInput(formData.custom_lead_by, 150)
        : sanitizeInput(formData.lead_by, 150);

      let cleanPhone = formData.phone_number ? formData.phone_number.trim() : '';
      if (cleanPhone === '+60' || cleanPhone === '+60 ') {
        cleanPhone = '';
      } else if (cleanPhone && !cleanPhone.startsWith('+')) {
        if (cleanPhone.startsWith('60')) {
          cleanPhone = `+${cleanPhone}`;
        } else if (cleanPhone.startsWith('0')) {
          cleanPhone = `+60${cleanPhone.slice(1)}`;
        } else {
          cleanPhone = `+60${cleanPhone}`;
        }
      }

      const payload = {
        full_name: sanitizeInput(formData.full_name, 255),
        ic_number: sanitizeInput(formData.ic_number, 50),
        phone_number: cleanPhone ? sanitizeInput(cleanPhone, 50) : null,
        email: sanitizeInput(formData.email, 150),
        address: sanitizeInput(formData.address, 500),
        date: sanitizeInput(formData.date, 30),
        case_category: finalCategory || null,
        potential_level: formData.potential_level,
        lead_by: finalLeadBy || null,
        notes: sanitizeInput(formData.notes, 2000),
        status: sanitizeInput(formData.status, 50),
        updated_at: new Date().toISOString()
      };

      if (isEditModalOpen && activeClient) {
        const { error } = await supabase
          .from('potential_clients')
          .update(payload)
          .eq('id', activeClient.id);

        if (error) throw error;
        setIsEditModalOpen(false);
      } else {
        const insertPayload = {
          ...payload,
          created_by: session?.user?.id || null,
          created_at: new Date().toISOString()
        };
        const { error } = await supabase
          .from('potential_clients')
          .insert([insertPayload]);

        if (error) throw error;
        setIsAddModalOpen(false);
      }

      await fetchPotentialClients();
    } catch (err: any) {
      console.error('Error saving potential client:', err);
      alert((lang === 'bm' ? 'Gagal menyimpan: ' : 'Failed to save: ') + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Record
  const handleDelete = async (client: PotentialClient) => {
    if (!canEdit) return;
    const confirmMsg = t('clients', 'deletePotentialConfirm', lang).replace('{name}', client.full_name);
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('potential_clients')
        .delete()
        .eq('id', client.id);

      if (error) throw error;
      await fetchPotentialClients();
      if (isViewModalOpen) setIsViewModalOpen(false);
    } catch (err: any) {
      console.error('Error deleting potential client:', err);
      alert((lang === 'bm' ? 'Gagal memadam: ' : 'Failed to delete: ') + (err.message || err));
    }
  };

  // Convert Potential Client to Active Client
  const handleConvertToActive = async (client: PotentialClient) => {
    if (!canEdit) return;
    const confirmMsg = t('clients', 'confirmConvertToActive', lang).replace('{name}', client.full_name);
    if (!window.confirm(confirmMsg)) return;

    try {
      // 1. Insert into clients table
      const newClientPayload = {
        NAME: client.full_name,
        "IC NUMBER": client.ic_number || '-',
        "PHONE NUMBER": client.phone_number || '-',
        EMAIL: client.email || '',
        ADDRESS: client.address || '',
        "CASE CATEGORY": client.case_category || '-',
        DATE: client.date || getTodayFormatted(),
        "CASE STATUS": 'ACTIVE / INVESTIGATION',
        "TOTAL PAID (RM)": '0',
        "PENDING (RM)": '0',
        "PACKAGE (RM)": '0',
      };

      const { error: insertErr } = await supabase
        .from('clients')
        .insert([newClientPayload]);

      if (insertErr) {
        throw new Error(`Failed to create active client: ${insertErr.message}`);
      }

      // 2. Update potential_clients status to 'Converted'
      await supabase
        .from('potential_clients')
        .update({ status: 'Converted', updated_at: new Date().toISOString() })
        .eq('id', client.id);

      alert(
        lang === 'bm'
          ? `Klien "${client.full_name}" telah berjaya ditukarkan ke Pangkalan Data Klien Aktif!`
          : `Client "${client.full_name}" successfully converted to Active Client Database!`
      );

      await fetchPotentialClients();
      if (onClientConverted) onClientConverted();
      if (isViewModalOpen) setIsViewModalOpen(false);
    } catch (err: any) {
      console.error('Error converting client:', err);
      alert((lang === 'bm' ? 'Ralat menukar klien: ' : 'Error converting client: ') + (err.message || err));
    }
  };

  // Filtering & Sorting
  const filteredClients = useMemo(() => {
    let result = [...clients];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        return (
          (c.full_name && c.full_name.toLowerCase().includes(q)) ||
          (c.ic_number && c.ic_number.toLowerCase().includes(q)) ||
          (c.phone_number && c.phone_number.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.case_category && c.case_category.toLowerCase().includes(q)) ||
          (c.lead_by && c.lead_by.toLowerCase().includes(q)) ||
          (c.potential_level && c.potential_level.toLowerCase().includes(q))
        );
      });
    }

    // Potential Filter
    if (potentialFilter !== 'all') {
      result = result.filter(c => c.potential_level === potentialFilter);
    }

    // Date Filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const currentYear = String(now.getFullYear());
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

      result = result.filter(c => {
        if (!c.date) return false;
        const parts = c.date.replace(/-/g, '/').split('/');
        if (parts.length === 3) {
          const m = parts[1].padStart(2, '0');
          let y = parts[2];
          if (y.length === 2) y = `20${y}`;

          if (dateFilter === 'year') {
            return y === currentYear;
          }
          if (dateFilter === 'month') {
            return y === currentYear && m === currentMonth;
          }
        }
        return false;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === 'date') {
        const parseD = (str: string | null) => {
          if (!str) return 0;
          const parts = str.replace(/-/g, '/').split('/');
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10) || 0;
            const m = parseInt(parts[1], 10) || 0;
            let y = parseInt(parts[2], 10) || 0;
            if (y < 100) y += 2000;
            return y * 10000 + m * 100 + d;
          }
          return 0;
        };
        valA = parseD(valA);
        valB = parseD(valB);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [clients, searchQuery, potentialFilter, dateFilter, sortKey, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / pageSize) || 1;
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClients.slice(start, start + pageSize);
  }, [filteredClients, currentPage, pageSize]);

  const handleSort = (key: keyof PotentialClient) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const total = clients.length;
    const high = clients.filter(c => c.potential_level === 'High').length;
    const medium = clients.filter(c => c.potential_level === 'Medium').length;
    const low = clients.filter(c => c.potential_level === 'Low').length;
    const converted = clients.filter(c => c.status === 'Converted').length;
    return { total, high, medium, low, converted };
  }, [clients]);

  // Export handlers
  const getExportData = () => {
    return filteredClients.map((c, idx) => ({
      No: idx + 1,
      [lang === 'bm' ? 'Nama Penuh' : 'Full Name']: c.full_name || '-',
      [lang === 'bm' ? 'No. Kad Pengenalan' : 'IC Number']: c.ic_number || '-',
      [lang === 'bm' ? 'No. Telefon' : 'Phone Number']: c.phone_number || '-',
      [lang === 'bm' ? 'E-mel' : 'Email']: c.email || '-',
      [lang === 'bm' ? 'Alamat' : 'Address']: c.address || '-',
      [lang === 'bm' ? 'Tarikh' : 'Date']: c.date || '-',
      [lang === 'bm' ? 'Kategori Kes' : 'Case Category']: c.case_category || '-',
      [lang === 'bm' ? 'Tahap Potensi' : 'Potential Level']: `${c.potential_level} Potential`,
      [lang === 'bm' ? 'Dibawa Oleh' : 'Lead By']: c.lead_by || '-',
      [lang === 'bm' ? 'Catatan' : 'Notes']: c.notes || '-',
      [lang === 'bm' ? 'Status' : 'Status']: c.status || 'New',
    }));
  };

  const handleExportCSV = async () => {
    const data = getExportData();
    if (data.length === 0) return alert(lang === 'bm' ? 'Tiada rekod untuk dieksport.' : 'No records to export.');
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EmailRakyat_Potential_Clients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportExcel = async () => {
    const data = getExportData();
    if (data.length === 0) return alert(lang === 'bm' ? 'Tiada rekod untuk dieksport.' : 'No records to export.');
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Potential Clients');
    XLSX.writeFile(wb, `EmailRakyat_Potential_Clients_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = async () => {
    const data = getExportData();
    if (data.length === 0) return alert(lang === 'bm' ? 'Tiada rekod untuk dieksport.' : 'No records to export.');
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('landscape');
    const dateStr = new Date().toISOString().split('T')[0];
    doc.text(`Email Rakyat - Potential Clients Directory (${dateStr})`, 14, 15);

    const tableColumn = Object.keys(data[0]);
    const tableRows = data.map(obj => Object.values(obj).map(v => String(v || '-')));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11] } // amber header
    });

    doc.save(`EmailRakyat_Potential_Clients_${dateStr}.pdf`);
  };

  // Helper Badge Color
  const getPotentialBadge = (level: 'High' | 'Medium' | 'Low') => {
    switch (level) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('clients', 'highPotential', lang)}
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {t('clients', 'mediumPotential', lang)}
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            {t('clients', 'lowPotential', lang)}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-auto w-full">
      {/* Table Missing Alert Banner */}
      {tableMissingError && (
        <div className="p-4 mb-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-yellow-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                {lang === 'bm' ? 'Pangkalan Data Klien Berpotensi Belum Dicipta' : 'Potential Clients Database Table Not Created Yet'}
              </h4>
              <p className="text-xs text-amber-800 dark:text-zinc-400 mt-0.5">
                {lang === 'bm'
                  ? 'Sila jalankan skrip fail database/CREATE_POTENTIAL_CLIENTS_TABLE.sql di dalam Supabase SQL Editor anda untuk mengaktifkan pangkalan data ini.'
                  : 'Please run the SQL file database/CREATE_POTENTIAL_CLIENTS_TABLE.sql in your Supabase SQL Editor to enable this database.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.potential_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  ic_number TEXT,
  phone_number TEXT,
  email TEXT,
  address TEXT,
  date TEXT,
  case_category TEXT,
  potential_level TEXT NOT NULL DEFAULT 'High',
  lead_by TEXT,
  notes TEXT,
  status TEXT DEFAULT 'New',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.potential_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read potential_clients" ON public.potential_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert potential_clients" ON public.potential_clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update potential_clients" ON public.potential_clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete potential_clients" ON public.potential_clients FOR DELETE TO authenticated USING (true);`);
              setCopySuccess(true);
              setTimeout(() => setCopySuccess(false), 2500);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 flex-shrink-0"
          >
            {copySuccess ? '✓ Copied SQL!' : 'Copy SQL Script'}
          </button>
        </div>
      )}

      {/* Top Controls Header */}
      <div className="p-3 sm:p-4 border-b border-amber-600/40 dark:border-amber-500/30 bg-amber-600 dark:bg-gray-900 flex-shrink-0 rounded-t-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 dark:bg-amber-500/20 text-white dark:text-yellow-400 flex items-center justify-center font-bold">
              ★
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('clients', 'potentialRegistry', lang)}
              </h3>
              <p className="text-[11px] text-amber-100 dark:text-zinc-400 font-medium">
                {lang === 'bm'
                  ? 'Rekod prospek klien baru sebelum pendaftaran rasmi kes'
                  : 'Track prospective new clients prior to official case onboarding'}
              </p>
            </div>
          </div>

          {/* Action buttons (Export + Add) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <div className="flex bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 flex-1 sm:flex-none justify-center overflow-hidden shadow-sm h-[42px] sm:h-[48px] items-center">
              <button
                onClick={handleExportCSV}
                className="flex-1 sm:flex-none text-xs font-semibold px-3 sm:px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-200 dark:border-gray-800 transition-colors h-full flex items-center justify-center"
              >
                CSV
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 sm:flex-none text-xs font-semibold px-3 sm:px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-r border-slate-200 dark:border-gray-800 transition-colors h-full flex items-center justify-center"
              >
                Excel
              </button>
              <button
                onClick={handleExportPDF}
                className="flex-1 sm:flex-none text-xs font-semibold px-3 sm:px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors h-full flex items-center justify-center"
              >
                PDF
              </button>
            </div>

            {canEdit && (
              <button
                onClick={handleOpenAddModal}
                className="text-xs font-semibold bg-white hover:bg-slate-50 text-amber-700 dark:bg-yellow-500 dark:text-black dark:hover:bg-yellow-400 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shadow-sm w-full sm:w-auto h-[42px] sm:h-[48px] flex items-center justify-center gap-1.5 border border-amber-200 dark:border-yellow-500/50 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                </svg>
                <span>{t('clients', 'addPotentialClient', lang)}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Search bar */}
          <div className="col-span-2 sm:col-span-6 relative">
            <input
              type="text"
              placeholder={lang === 'bm' ? 'Cari nama, IC, no. telefon, kategori, staf...' : 'Search name, IC, phone, category, staff...'}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition-all h-[42px] sm:h-[48px] shadow-sm"
            />
          </div>

          {/* Potential Level Filter */}
          <div className="col-span-1 sm:col-span-3 relative">
            <select
              value={potentialFilter}
              onChange={(e) => { setPotentialFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2.5 sm:py-3 pl-3 sm:pl-4 pr-7 sm:pr-10 focus:outline-none focus:border-amber-500 cursor-pointer h-[42px] sm:h-[48px] shadow-sm appearance-none truncate"
            >
              <option value="all">{t('clients', 'allPotentials', lang)}</option>
              <option value="High">{t('clients', 'highPotential', lang)}</option>
              <option value="Medium">{t('clients', 'mediumPotential', lang)}</option>
              <option value="Low">{t('clients', 'lowPotential', lang)}</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Date Filter */}
          <div className="col-span-1 sm:col-span-3 relative">
            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl py-2.5 sm:py-3 pl-3 sm:pl-4 pr-7 sm:pr-10 focus:outline-none focus:border-amber-500 cursor-pointer h-[42px] sm:h-[48px] shadow-sm appearance-none truncate"
            >
              <option value="all">{t('clients', 'allDates', lang)}</option>
              <option value="year">{t('clients', 'thisYear', lang)}</option>
              <option value="month">{t('clients', 'thisMonth', lang)}</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Card System for Potential Clients (Phones only - Vertical, No Horizontal Scrolling) */}
      <div className="block md:hidden flex-1 p-3 space-y-3 bg-slate-50/70 dark:bg-black/90 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>{lang === 'bm' ? 'Memuatkan senarai klien berpotensi...' : 'Loading potential clients...'}</span>
            </div>
          </div>
        ) : paginatedClients.length > 0 ? (
          paginatedClients.map((client, index) => {
            const rowNum = (currentPage - 1) * pageSize + index + 1;
            return (
              <div
                key={client.id}
                className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm space-y-3 hover:border-slate-300 dark:hover:border-gray-700 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-gray-800/80 pb-2.5">
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-zinc-500">
                        #{rowNum}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                        {client.full_name}
                      </h4>
                      {client.status === 'Converted' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                          Converted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 flex-wrap pt-0.5">
                      {client.phone_number && (
                        <div className="flex items-center gap-1.5 font-mono">
                          <span>📞 {client.phone_number}</span>
                          <a
                            href={`https://wa.me/${client.phone_number.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 dark:text-emerald-400 font-bold"
                          >
                            WhatsApp
                          </a>
                        </div>
                      )}
                      {client.ic_number && (
                        <span className="font-mono text-[11px] text-slate-400">IC: {client.ic_number}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {getPotentialBadge(client.potential_level)}
                  </div>
                </div>

                {/* Details 2-col Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 dark:bg-gray-800/40 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold block">
                      {lang === 'bm' ? 'Kategori Kes' : 'Case Category'}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate block mt-0.5">
                      {client.case_category || '-'}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-gray-800/40 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-bold block">
                      {t('clients', 'leadBy', lang)}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate block mt-0.5">
                      {client.lead_by ? `👤 ${client.lead_by}` : '-'}
                    </span>
                  </div>
                </div>

                {/* Date & Address / Email */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 px-1 flex-wrap gap-1">
                  <span>📅 {client.date || '-'}</span>
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="text-cyan-600 dark:text-cyan-400 truncate max-w-[170px]">
                      ✉️ {client.email}
                    </a>
                  )}
                </div>

                {client.address && (
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 px-1 truncate" title={client.address}>
                    📍 {client.address}
                  </div>
                )}

                {client.notes && (
                  <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-2.5 rounded-xl text-xs text-slate-700 dark:text-zinc-300 italic">
                    "{client.notes}"
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleOpenViewModal(client)}
                    className="flex-1 py-2.5 px-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>👁️</span>
                    <span>{t('clients', 'viewDoc', lang)}</span>
                  </button>

                  {canEdit && (
                    <>
                      <button
                        onClick={() => handleOpenEditModal(client)}
                        className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <span>✏️</span>
                        <span>{t('reports', 'editBtn', lang)}</span>
                      </button>

                      {client.status !== 'Converted' && (
                        <button
                          onClick={() => handleConvertToActive(client)}
                          className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm flex-shrink-0"
                          title={t('clients', 'convertToActiveClient', lang)}
                        >
                          <span>★</span>
                          <span>{lang === 'bm' ? 'Tukar' : 'Convert'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(client)}
                        className="h-[38px] w-[38px] flex items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 text-xs font-bold flex-shrink-0"
                        title="Delete Record"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs font-semibold text-slate-400 dark:text-zinc-500 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800">
            {t('clients', 'noClientsFound', lang)}
          </div>
        )}
      </div>

      {/* Desktop Main Table (Laptops / Tablets / Desktops only) */}
      <div className="hidden md:block flex-1 overflow-auto scrollbar-thin bg-white dark:bg-black relative border-b border-slate-200 dark:border-gray-800">
        <table className="w-full min-w-[1100px] text-left border-collapse whitespace-nowrap text-xs md:text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-gray-900/90 border-b border-slate-200 dark:border-gray-800">
              <th className="px-4 py-3.5 font-semibold text-slate-500 dark:text-zinc-400 w-12 text-center">#</th>
              <th
                onClick={() => handleSort('full_name')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{lang === 'bm' ? 'Nama Penuh' : 'Full Name'}</span>
                  {sortKey === 'full_name' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th
                onClick={() => handleSort('ic_number')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>IC</span>
                  {sortKey === 'ic_number' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th
                onClick={() => handleSort('phone_number')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{lang === 'bm' ? 'No. Telefon' : 'Phone Number'}</span>
                  {sortKey === 'phone_number' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300">
                <span>{lang === 'bm' ? 'E-mel' : 'Email'}</span>
              </th>
              <th className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 max-w-[200px]">
                <span>{lang === 'bm' ? 'Alamat' : 'Address'}</span>
              </th>
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{lang === 'bm' ? 'Tarikh' : 'Date'}</span>
                  {sortKey === 'date' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th
                onClick={() => handleSort('case_category')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{lang === 'bm' ? 'Kategori Kes' : 'Case Category'}</span>
                  {sortKey === 'case_category' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th
                onClick={() => handleSort('potential_level')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t('clients', 'potentialLevel', lang)}</span>
                  {sortKey === 'potential_level' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th
                onClick={() => handleSort('lead_by')}
                className="px-4 py-3.5 font-semibold text-slate-700 dark:text-zinc-300 cursor-pointer hover:text-amber-600 dark:hover:text-yellow-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t('clients', 'leadBy', lang)}</span>
                  {sortKey === 'lead_by' && (sortDirection === 'asc' ? '▲' : '▼')}
                </div>
              </th>
              <th className="px-3 sm:px-4 py-3 sm:py-3.5 font-semibold text-slate-500 dark:text-zinc-400 md:sticky md:right-0 bg-slate-50 dark:bg-gray-900 md:z-20 md:shadow-sm text-left">
                {t('clients', 'actions', lang)}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span>{lang === 'bm' ? 'Memuatkan senarai klien berpotensi...' : 'Loading potential clients...'}</span>
                  </div>
                </td>
              </tr>
            ) : paginatedClients.length > 0 ? (
              paginatedClients.map((client, index) => {
                const rowNum = (currentPage - 1) * pageSize + index + 1;
                return (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition-colors group"
                  >
                    <td className="px-4 py-3.5 text-center font-mono text-slate-400 dark:text-zinc-500 text-xs">
                      {rowNum}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <span>{client.full_name}</span>
                        {client.status === 'Converted' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                            Converted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-zinc-300 text-xs">
                      {client.ic_number || '-'}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-zinc-300 text-xs">
                      {client.phone_number ? (
                        <div className="flex items-center gap-1.5">
                          <span>{client.phone_number}</span>
                          <a
                            href={`https://wa.me/${client.phone_number.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                            title="WhatsApp Client"
                          >
                            💬
                          </a>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300 text-xs">
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="hover:underline text-cyan-600 dark:text-cyan-400">
                          {client.email}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-300 text-xs max-w-[200px] truncate" title={client.address || ''}>
                      {client.address || '-'}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-zinc-400 text-xs">
                      {client.date || '-'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 text-xs font-medium">
                      {client.case_category || '-'}
                    </td>
                    <td className="px-4 py-3.5">
                      {getPotentialBadge(client.potential_level)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-zinc-300 text-xs font-semibold">
                      {client.lead_by ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-zinc-200">
                          👤 {client.lead_by}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-left whitespace-nowrap md:sticky md:right-0 bg-white dark:bg-black group-hover:bg-slate-50 dark:group-hover:bg-zinc-900 transition-colors md:shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.06)] md:z-10">
                      <div className="flex items-center justify-start gap-1 sm:gap-1.5">
                        <button
                          onClick={() => handleOpenViewModal(client)}
                          className="h-7 px-2 sm:px-2.5 flex items-center justify-center rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] sm:text-xs font-semibold transition-all shadow-sm"
                          title="View Profile"
                        >
                          {t('clients', 'viewDoc', lang)}
                        </button>

                        {canEdit && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(client)}
                              className="h-7 px-2 sm:px-2.5 flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-gray-700 text-[11px] sm:text-xs font-semibold transition-all shadow-sm"
                              title="Edit Client"
                            >
                              {t('reports', 'editBtn', lang)}
                            </button>

                            {client.status !== 'Converted' && (
                              <button
                                onClick={() => handleConvertToActive(client)}
                                className="h-7 px-2 sm:px-2.5 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-semibold transition-all shadow-sm"
                                title={t('clients', 'convertToActiveClient', lang)}
                              >
                                {lang === 'bm' ? '+ Tukar' : '+ Convert'}
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(client)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40 text-xs font-bold transition-all"
                              title="Delete Record"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-xs font-semibold text-slate-400 dark:text-zinc-500 bg-slate-50/20 dark:bg-transparent">
                  {t('clients', 'noClientsFound', lang)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-gray-900/50 border-b border-slate-200 dark:border-gray-800 text-xs">
        <div className="text-slate-500 dark:text-zinc-400 font-medium">
          {lang === 'bm'
            ? `Menunjukkan ${filteredClients.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} hingga ${Math.min(currentPage * pageSize, filteredClients.length)} daripada ${filteredClients.length} klien berpotensi`
            : `Showing ${filteredClients.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to ${Math.min(currentPage * pageSize, filteredClients.length)} of ${filteredClients.length} potential clients`}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {t('clients', 'prev', lang)}
          </button>
          <span className="px-2 font-bold text-slate-700 dark:text-zinc-300">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {t('clients', 'next', lang)}
          </button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="mt-6 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex items-center gap-2 pb-1">
          <span className="text-amber-500 text-base">★</span>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            {lang === 'bm' ? 'Ringkasan Klien Berpotensi' : 'Potential Clients Overview'}
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Prospects */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {lang === 'bm' ? 'Jumlah Klien Berpotensi' : 'Total Potential Clients'}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-amber-600 dark:text-yellow-500 mt-2">
              {metrics.total}
            </span>
          </div>

          {/* High Potential */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] md:text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              {t('clients', 'highPotential', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
              {metrics.high}
            </span>
          </div>

          {/* Medium Potential */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] md:text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              {t('clients', 'mediumPotential', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">
              {metrics.medium}
            </span>
          </div>

          {/* Low Potential */}
          <div className="bg-slate-50 dark:bg-gray-900/80 border border-slate-100 dark:border-gray-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] md:text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {t('clients', 'lowPotential', lang)}
            </span>
            <span className="text-xl md:text-2xl font-extrabold text-slate-600 dark:text-zinc-300 mt-2">
              {metrics.low}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          ADD / EDIT POTENTIAL CLIENT MODAL
          ========================================================= */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-lg">★</span>
                <h2 className="text-base font-bold text-slate-800 dark:text-white">
                  {isEditModalOpen
                    ? t('clients', 'editPotentialClient', lang)
                    : t('clients', 'addPotentialClient', lang)}
                </h2>
              </div>
              <button
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
              {/* Row 1: Full Name */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                  {lang === 'bm' ? 'Nama Penuh *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g. Ahmad bin Razak"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Row 2: IC & Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                    {lang === 'bm' ? 'No. Kad Pengenalan (IC)' : 'IC / Passport'}
                  </label>
                  <input
                    type="text"
                    value={formData.ic_number}
                    onChange={(e) => setFormData({ ...formData, ic_number: e.target.value })}
                    placeholder="e.g. 950101-14-5555"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                      {lang === 'bm' ? 'No. Telefon' : 'Phone Number'}
                    </label>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                      {lang === 'bm' ? 'Lalai: +60 (Boleh diedit untuk luar negara)' : 'Default: +60 (Editable for overseas)'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="+60 12-345 6789"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Row 3: Email & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                    {lang === 'bm' ? 'E-mel' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                    {lang === 'bm' ? 'Tarikh Pertanyaan (DD/MM/YYYY)' : 'Enquiry Date (DD/MM/YYYY)'}
                  </label>
                  <input
                    type="text"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Row 4: Address */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                  {lang === 'bm' ? 'Alamat Kediaman / Premis' : 'Address'}
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. No 12, Jalan Telawi, Bangsar, 59100 Kuala Lumpur"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Row 5: Case Category */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                  {lang === 'bm' ? 'Kategori Kes' : 'Case Category'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={formData.is_custom_category ? 'Custom' : formData.case_category}
                    onChange={(e) => {
                      if (e.target.value === 'Custom') {
                        setFormData({ ...formData, is_custom_category: true });
                      } else {
                        setFormData({ ...formData, is_custom_category: false, case_category: e.target.value });
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Ah Long">Ah Long</option>
                    <option value="Kredit Komuniti">Kredit Komuniti</option>
                    <option value="Bank">Bank</option>
                    <option value="Scam Victim">Scam Victim</option>
                    <option value="Kemalangan">Kemalangan</option>
                    <option value="Tuntutan Sivil">Tuntutan Sivil</option>
                    <option value="Custom">{lang === 'bm' ? '+ Kategori Lain (Taip Sendiri)' : '+ Custom Category'}</option>
                  </select>

                  {formData.is_custom_category && (
                    <input
                      type="text"
                      required
                      value={formData.custom_case_category}
                      onChange={(e) => setFormData({ ...formData, custom_case_category: e.target.value })}
                      placeholder={lang === 'bm' ? 'Masukkan kategori baru...' : 'Enter custom category...'}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-amber-300 dark:border-amber-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              </div>

              {/* Row 6: Potential Level & Lead By */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Potential Level */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                    {t('clients', 'potentialLevel', lang)}
                  </label>
                  <select
                    value={formData.potential_level}
                    onChange={(e) => setFormData({ ...formData, potential_level: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="High">🟢 {t('clients', 'highPotential', lang)}</option>
                    <option value="Medium">🟡 {t('clients', 'mediumPotential', lang)}</option>
                    <option value="Low">⚪ {t('clients', 'lowPotential', lang)}</option>
                  </select>
                </div>

                {/* Lead By */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                    {t('clients', 'leadBy', lang)} ({lang === 'bm' ? 'Nama Staf' : 'Staff Member'})
                  </label>
                  <div className="space-y-2">
                    <select
                      value={formData.is_custom_lead ? 'Custom' : formData.lead_by}
                      onChange={(e) => {
                        if (e.target.value === 'Custom') {
                          setFormData({ ...formData, is_custom_lead: true });
                        } else {
                          setFormData({ ...formData, is_custom_lead: false, lead_by: e.target.value });
                        }
                      }}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">{lang === 'bm' ? '-- Pilih Staf --' : '-- Select Staff Member --'}</option>
                      {staffList.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="Custom">{lang === 'bm' ? '+ Nama Lain (Taip Sendiri)' : '+ Enter Name Manually'}</option>
                    </select>

                    {formData.is_custom_lead && (
                      <input
                        type="text"
                        required
                        value={formData.custom_lead_by}
                        onChange={(e) => setFormData({ ...formData, custom_lead_by: e.target.value })}
                        placeholder={lang === 'bm' ? 'Masukkan nama staf...' : 'Enter staff name...'}
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-amber-300 dark:border-amber-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Row 7: Notes */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
                  {lang === 'bm' ? 'Catatan & Ringkasan Pertanyaan' : 'Notes & Enquiry Remarks'}
                </label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={lang === 'bm' ? 'Butiran isu klien, potensi pembayaran, tindakan susulan...' : 'Case background, discussion details, quotation, next steps...'}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {lang === 'bm' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <span>{lang === 'bm' ? 'Menyimpan...' : 'Saving...'}</span>
                  ) : (
                    <span>{isEditModalOpen ? (lang === 'bm' ? 'Kemas Kini Rekod' : 'Update Record') : (lang === 'bm' ? 'Simpan Klien' : 'Save Client')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW POTENTIAL CLIENT PROFILE MODAL
          ========================================================= */}
      {isViewModalOpen && activeClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <div className="flex items-center gap-2.5">
                <span className="text-amber-500 text-xl">★</span>
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-white">
                    {activeClient.full_name}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                    {t('clients', 'viewPotentialClient', lang)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
              {/* Top Banner with Potential & Status */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-gray-900/80 border border-slate-200/80 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase">
                    {t('clients', 'potentialLevel', lang)}:
                  </span>
                  {getPotentialBadge(activeClient.potential_level)}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase">
                    Status:
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {activeClient.status || 'New'}
                  </span>
                </div>
              </div>

              {/* Contact & Personal Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">IC Number</span>
                  <p className="text-sm font-bold text-slate-800 dark:text-white mt-1 font-mono">
                    {activeClient.ic_number || '-'}
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                    {lang === 'bm' ? 'No. Telefon' : 'Phone Number'}
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-white font-mono">
                      {activeClient.phone_number || '-'}
                    </p>
                    {activeClient.phone_number && (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${activeClient.phone_number}`}
                          className="px-2 py-1 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 text-xs font-semibold rounded-lg hover:underline"
                        >
                          Call
                        </a>
                        <a
                          href={`https://wa.me/${activeClient.phone_number.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-lg hover:underline"
                        >
                          WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">Email</span>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">
                    {activeClient.email ? (
                      <a href={`mailto:${activeClient.email}`} className="text-cyan-600 dark:text-cyan-400 hover:underline">
                        {activeClient.email}
                      </a>
                    ) : '-'}
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                    {lang === 'bm' ? 'Tarikh Pertanyaan' : 'Enquiry Date'}
                  </span>
                  <p className="text-sm font-bold text-slate-800 dark:text-white mt-1 font-mono">
                    {activeClient.date || '-'}
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                    {lang === 'bm' ? 'Kategori Kes' : 'Case Category'}
                  </span>
                  <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
                    {activeClient.case_category || '-'}
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                    {t('clients', 'leadBy', lang)} ({lang === 'bm' ? 'Staf yang Membawa' : 'Staff Handler'})
                  </span>
                  <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">
                    {activeClient.lead_by ? `👤 ${activeClient.lead_by}` : '-'}
                  </p>
                </div>
              </div>

              {/* Address */}
              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                  {lang === 'bm' ? 'Alamat' : 'Address'}
                </span>
                <p className="text-sm text-slate-800 dark:text-zinc-200 mt-1">
                  {activeClient.address || '-'}
                </p>
              </div>

              {/* Notes */}
              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                  {lang === 'bm' ? 'Catatan Tambahan' : 'Notes / Remarks'}
                </span>
                <p className="text-sm text-slate-800 dark:text-zinc-200 mt-1 whitespace-pre-wrap">
                  {activeClient.notes || (lang === 'bm' ? 'Tiada catatan dimasukkan.' : 'No notes added.')}
                </p>
              </div>

              {/* Actions footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-gray-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href="/portal/temujanji"
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                  >
                    <span>📅</span>
                    <span>{lang === 'bm' ? 'Jadualkan Temujanji' : 'Schedule Appointment'}</span>
                  </a>

                  {canEdit && activeClient.status !== 'Converted' && (
                    <button
                      onClick={() => handleConvertToActive(activeClient)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <span>★</span>
                      <span>{t('clients', 'convertToActiveClient', lang)}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {canEdit && (
                    <>
                      <button
                        onClick={() => {
                          setIsViewModalOpen(false);
                          handleOpenEditModal(activeClient);
                        }}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 dark:bg-gray-800 dark:text-zinc-200 border border-slate-200 dark:border-gray-700 text-xs font-semibold transition-all shadow-sm"
                      >
                        {t('reports', 'editBtn', lang)}
                      </button>
                      <button
                        onClick={() => handleDelete(activeClient)}
                        className="px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 text-xs font-semibold transition-all"
                      >
                        {t('clients', 'deleteClient', lang)}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-gray-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {lang === 'bm' ? 'Tutup' : 'Close'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
