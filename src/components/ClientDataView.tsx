import { useEffect, useState, useRef } from 'react';
import { supabase, getCurrentSession } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';
import { sanitizeInput, parseSafeAmount } from '../utils/security';
import { BillingGenerator } from './dashboard/BillingGenerator';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { ErrorBoundary } from './ErrorBoundary';
import { policeLocations } from '../utils/policeLocations';
const DateInput = ({ name, label, defaultValue, lang, required }: { name: string; label: string; defaultValue: string; lang: 'en' | 'bm'; required?: boolean }) => {
  const [val, setVal] = useState(defaultValue || '');
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVal(defaultValue || '');
  }, [defaultValue]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDate = e.target.value;
    if (!rawDate) return;
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      setVal(formatted);
    }
  };

  const getPickerValue = () => {
    if (!val) return '';
    const parts = val.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month}-${day}`;
    }
    return '';
  };

  return (
    <div className="space-y-1 relative">
      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type="text"
          name={name}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onClick={() => {
            if (dateRef.current) {
              try {
                if (typeof dateRef.current.showPicker === 'function') {
                  dateRef.current.showPicker();
                } else {
                  dateRef.current.click();
                }
              } catch (err) {}
            }
          }}
          placeholder="DD/MM/YYYY"
          required={required}
          className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
        />
        <button
          type="button"
          onClick={() => {
            if (dateRef.current) {
              try {
                if (typeof dateRef.current.showPicker === 'function') {
                  dateRef.current.showPicker();
                } else {
                  dateRef.current.click();
                }
              } catch (err) {}
            }
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600 dark:hover:text-yellow-500 cursor-pointer p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center"
          title={lang === 'bm' ? 'Pilih Tarikh' : 'Choose Date'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <input
          type="date"
          ref={dateRef}
          value={getPickerValue()}
          onChange={handleDateChange}
          className="absolute opacity-0 pointer-events-none w-0 h-0 right-0 bottom-0"
        />
      </div>
    </div>
  );
};

const ViewField = ({ label, value, lang }: { label: string; value: any; lang: 'en' | 'bm' }) => (
  <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
    <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">{label}</p>
    <p className="text-sm font-semibold text-slate-805 dark:text-white break-words">
      {value !== null && value !== undefined && String(value).trim() !== '' ? (
        String(value)
      ) : (
        <span className="text-slate-400 dark:text-zinc-650 italic font-normal">{lang === 'bm' ? 'Tiada Maklumat' : 'Not Provided'}</span>
      )}
    </p>
  </div>
);

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="flex items-center gap-2 mb-4 mt-6 first:mt-0">
    <div className="p-1.5 bg-indigo-50 dark:bg-zinc-800 text-indigo-600 dark:text-yellow-500 rounded-lg">
      {icon}
    </div>
    <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
      {title}
    </h3>
  </div>
);

export default function ClientDataView() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [dbClients, setDbClients] = useState<any[]>([]);
  const { lang } = usePortalLanguage();
  const { permissions, loading: permsLoading } = usePermissions(profile);

  const getLabel = (key: string) => {
    const k = key.toUpperCase();
    if (k === 'NAME') return lang === 'bm' ? 'Nama Penuh' : 'Full Name';
    if (k === 'IC NUMBER') return lang === 'bm' ? 'No. Kad Pengenalan' : 'IC Number';
    if (k === 'PHONE NUMBER') return lang === 'bm' ? 'No. Telefon' : 'Phone Number';
    if (k === 'EMAIL') return lang === 'bm' ? 'E-mel' : 'Email';
    if (k === 'ADDRESS') return lang === 'bm' ? 'Alamat' : 'Address';
    if (k === 'DATE') return lang === 'bm' ? 'Tarikh' : 'Date';
    if (k === 'CASE CATEGORY') return lang === 'bm' ? 'Kategori Kes' : 'Case Category';
    if (k === 'CASE STATUS') return lang === 'bm' ? 'Status Kes' : 'Case Status';
    if (k === 'INVOICE REF NO') return lang === 'bm' ? 'No. Rujukan Invois' : 'Invoice Ref No';
    if (k === 'INVESTIGATION PAPER') return lang === 'bm' ? 'Kertas Siasatan' : 'Investigation Paper';
    if (k === 'REPORT') return lang === 'bm' ? 'Laporan' : 'Report';
    if (k === 'ACTION TAKEN BY POLICE') return lang === 'bm' ? 'Tindakan Pihak Polis' : 'Action Taken by police';
    if (k === 'REMARK') return lang === 'bm' ? 'Catatan' : 'Remark';
    if (k === 'NO') return lang === 'bm' ? 'No' : 'No';
    if (k === 'PACKAGE (RM)') return lang === 'bm' ? 'Pakej (RM)' : 'Package (RM)';
    if (k === 'TOTAL PAID (RM)') return lang === 'bm' ? 'Jumlah Dibayar (RM)' : 'Total Paid (RM)';
    if (k === 'PENDING (RM)') return lang === 'bm' ? 'Belum Bayar (RM)' : 'Pending (RM)';
    return key;
  };

  // MODAL STATE - ADD & EDIT
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [policeReportsList, setPoliceReportsList] = useState<{date: string, no: string}[]>([{date: '', no: ''}]);
  const [ipList, setIpList] = useState<{date: string, no: string, pem: string, officer: string}[]>([{date: '', no: '', pem: '', officer: ''}]);
  const [selectedIpk, setSelectedIpk] = useState('');
  const [selectedIpd, setSelectedIpd] = useState('');
  const [selectedBalai, setSelectedBalai] = useState('');
  const [isCustomIpk, setIsCustomIpk] = useState(false);
  const [isCustomIpd, setIsCustomIpd] = useState(false);
  const [isCustomBalai, setIsCustomBalai] = useState(false);
  const [paymentList, setPaymentList] = useState<{amount: string, date: string}[]>([]);
  // MODAL STATE - VIEW (NEW)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<any>(null);

  const [billingRecords, setBillingRecords] = useState<any[]>([]);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const loadBillingRecords = async (clientId: string, clientNo?: any, clientName?: string) => {
    try {
      const actualNo = clientNo !== undefined ? clientNo : (viewingClient?.No ?? viewingClient?.NO ?? '');
      const actualName = clientName !== undefined ? clientName : (viewingClient?.NAME ?? '');

      const safeClientName = String(actualName).replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
      const clientNoVal = actualNo !== undefined && actualNo !== null && actualNo !== '' ? actualNo : '0';
      const clientFolder = `${clientNoVal} ${safeClientName}`;

      // 1. Fetch metadata records from billing_records database to get amounts
      const { data: dbRecords, error: dbError } = await supabase
        .from('billing_records')
        .select('*')
        .eq('client_id', clientId)
        .is('deleted_at', null);

      const dbMap = new Map();
      if (!dbError && dbRecords) {
        dbRecords.forEach(r => {
          dbMap.set(r.ref_number, r);
        });
      }

      // 2. List files from company_drive storage under Invoices
      const { data: storageInvoices, error: errInv } = await supabase.storage
        .from('company_drive')
        .list(`Finance/billing_documents/Invoices/${clientFolder}`, { limit: 100 });

      // 3. List files from company_drive storage under Receipts
      const { data: storageReceipts, error: errRec } = await supabase.storage
        .from('company_drive')
        .list(`Finance/billing_documents/Receipts/${clientFolder}`, { limit: 100 });

      const invoicesList: any[] = [];
      if (!errInv && storageInvoices) {
        storageInvoices.forEach(file => {
          if (file.name === '.keep') return;
          const refNumber = file.name.replace('.pdf', '');
          const dbRec = dbMap.get(refNumber);

          const filePath = `Finance/billing_documents/Invoices/${clientFolder}/${file.name}`;
          const { data: publicUrlData } = supabase.storage
            .from('company_drive')
            .getPublicUrl(filePath);

          invoicesList.push({
            id: dbRec?.id || file.id || refNumber,
            document_type: 'invoice',
            ref_number: refNumber,
            amount: dbRec?.amount || 0,
            created_at: file.created_at || dbRec?.created_at || new Date().toISOString(),
            drive_url: publicUrlData?.publicUrl || dbRec?.drive_url || '',
          });
        });
      }

      const receiptsList: any[] = [];
      if (!errRec && storageReceipts) {
        storageReceipts.forEach(file => {
          if (file.name === '.keep') return;
          const refNumber = file.name.replace('.pdf', '');
          const dbRec = dbMap.get(refNumber);

          const filePath = `Finance/billing_documents/Receipts/${clientFolder}/${file.name}`;
          const { data: publicUrlData } = supabase.storage
            .from('company_drive')
            .getPublicUrl(filePath);

          receiptsList.push({
            id: dbRec?.id || file.id || refNumber,
            document_type: 'receipt',
            ref_number: refNumber,
            amount: dbRec?.amount || 0,
            created_at: file.created_at || dbRec?.created_at || new Date().toISOString(),
            drive_url: publicUrlData?.publicUrl || dbRec?.drive_url || '',
          });
        });
      }

      setBillingRecords([...invoicesList, ...receiptsList]);
    } catch (err) {
      console.error('Error loading billing documents:', err);
    }
  };

  const handleViewDocument = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    if (!url) return;

    try {
      let bucket = 'company_drive';
      let path = '';

      const decodedUrl = decodeURIComponent(decodeURIComponent(url));

      if (decodedUrl.includes('company_drive/')) {
        bucket = 'company_drive';
        const idx = decodedUrl.indexOf('company_drive/');
        path = decodedUrl.substring(idx + 'company_drive/'.length);
      } else if (decodedUrl.includes('billing_documents/')) {
        bucket = 'billing_documents';
        const idx = decodedUrl.indexOf('billing_documents/');
        path = decodedUrl.substring(idx + 'billing_documents/'.length);
      } else {
        path = decodedUrl;
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 300);

      if (error) {
        throw error;
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Error generating signed URL:', err);
      alert('Error opening document: ' + (err.message || err));
    }
  };

  const handleDeleteBillingRecord = async (record: any) => {
    if (!window.confirm(lang === 'bm'
      ? `Adakah anda pasti mahu memadam "${record.ref_number}" ke tong sampah?`
      : `Are you sure you want to move "${record.ref_number}" to trash?`
    )) {
      return;
    }

    try {
      let bucket = 'company_drive';
      let oldPath = '';
      const url = record.drive_url;

      const decodedUrl = decodeURIComponent(decodeURIComponent(url));

      if (decodedUrl.includes('company_drive/')) {
        bucket = 'company_drive';
        const idx = decodedUrl.indexOf('company_drive/');
        oldPath = decodedUrl.substring(idx + 'company_drive/'.length);
      } else if (decodedUrl.includes('billing_documents/')) {
        bucket = 'billing_documents';
        const idx = decodedUrl.indexOf('billing_documents/');
        oldPath = decodedUrl.substring(idx + 'billing_documents/'.length);
      } else {
        oldPath = decodedUrl;
      }

      let trashPath = '';
      const pathParts = oldPath.split('/');
      const fileName = pathParts.pop();
      let uniqueFileName = fileName;
      if (fileName && fileName.endsWith('.pdf')) {
        const baseName = fileName.substring(0, fileName.length - 4);
        uniqueFileName = `${baseName}_deleted_${Date.now()}.pdf`;
      } else if (fileName) {
        uniqueFileName = `${fileName}_deleted_${Date.now()}`;
      }
      const newPathWithUniqueName = [...pathParts, uniqueFileName].join('/');

      if (newPathWithUniqueName.includes('Finance/billing_documents/')) {
        trashPath = newPathWithUniqueName.replace('Finance/billing_documents/', 'Finance/billing_documents/Trash/');
      } else {
        trashPath = `Finance/billing_documents/Trash/${newPathWithUniqueName}`;
      }

      // Move file in storage
      const { error: moveError } = await supabase.storage
        .from(bucket)
        .move(oldPath, trashPath);

      if (moveError) {
        throw new Error(`Storage move failed: ${moveError.message}`);
      }

      // Generate the new public URL for the trash path
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(trashPath);
      const trashUrl = publicUrlData?.publicUrl || '';

      const deletedRef = `${record.ref_number}_deleted_${Date.now()}`;

      // Soft delete in database by updating deleted_at, drive_url and ref_number
      const { error: dbError } = await supabase
        .from('billing_records')
        .update({
          deleted_at: new Date().toISOString(),
          drive_url: trashUrl,
          ref_number: deletedRef
        })
        .eq('id', record.id);

      if (dbError) {
        throw dbError;
      }

      // Reload records
      if (viewingClient?.id) {
        loadBillingRecords(viewingClient.id, viewingClient.No ?? viewingClient.NO ?? '', viewingClient.NAME ?? '');
      }
    } catch (err: any) {
      console.error('Error deleting billing record:', err);
      alert('Error deleting billing record: ' + (err.message || err));
    }
  };

  useEffect(() => {
    if (viewingClient?.id) {
      loadBillingRecords(viewingClient.id, viewingClient.No ?? viewingClient.NO ?? '', viewingClient.NAME ?? '');
    } else {
      setBillingRecords([]);
    }
  }, [viewingClient]);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'standard' | 'expanded' | 'lod'>('standard');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [storageFolders, setStorageFolders] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchVal = params.get('search') || params.get('q');
    if (searchVal) {
      setSearchQuery(searchVal);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadStorageFolders() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const { data: invoiceFoldersData } = await supabase.storage
          .from('company_drive')
          .list('Finance/billing_documents/Invoices', { limit: 1000 });

        const { data: receiptFoldersData } = await supabase.storage
          .from('company_drive')
          .list('Finance/billing_documents/Receipts', { limit: 1000 });

        const folderNames = new Set<string>();
        if (invoiceFoldersData) {
          invoiceFoldersData.forEach(f => {
            if (!f.id && f.name !== '.keep' && f.name !== 'Trash') {
              folderNames.add(f.name);
            }
          });
        }
        if (receiptFoldersData) {
          receiptFoldersData.forEach(f => {
            if (!f.id && f.name !== '.keep' && f.name !== 'Trash') {
              folderNames.add(f.name);
            }
          });
        }
        if (isMounted) {
          setStorageFolders(Array.from(folderNames));
        }
      } catch (e) {
        console.error('Error listing storage folders:', e);
      }
    }
    loadStorageFolders();
    return () => {
      isMounted = false;
    };
  }, [permissions]);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      async function loadData() {
        const session = await getCurrentSession();
        if (!session) {
          window.location.href = '/portal/login';
          return;
        }

        let currentProfile = profile;
        if (!currentProfile) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select(`full_name, department, roles(role_name), role_id`)
            .eq('id', session.user.id)
            .single();

          if (profileData) {
            let roleName = 'No Role';
            if (profileData.roles) {
              if (Array.isArray(profileData.roles)) {
                roleName = profileData.roles[0]?.role_name || 'No Role';
              } else {
                roleName = profileData.roles?.role_name || 'No Role';
              }
            } else if (profileData.role_id) {
              const { data: roleData } = await supabase.from('roles').select('role_name').eq('id', profileData.role_id).single();
              if (roleData) roleName = roleData.role_name;
            }

            currentProfile = {
              id: session.user.id,
              name: profileData.full_name,
              department: profileData.department,
              role: roleName,
            };
            if (isMounted) setProfile(currentProfile);
          }
        }

        const canViewClients = permissions?.view_clients || false;

        if (canViewClients) {
          let query = supabase.from('clients');

          if (viewMode === 'standard') {
            query = query.select('id,NAME,"PHONE NUMBER","IC NUMBER","CASE CATEGORY","TOTAL PAID (RM)","PENDING (RM)","PACKAGE (RM)","CASE STATUS","Investigation Paper",Report,"Action Taken by police",DATE', { count: 'exact' });
          } else {
            query = query.select('*', { count: 'exact' });
          }

          if (searchQuery) {
            query = query.or(`NAME.ilike.%${searchQuery}%,"IC NUMBER".ilike.%${searchQuery}%,"PHONE NUMBER".ilike.%${searchQuery}%,"CASE CATEGORY".ilike.%${searchQuery}%`);
          }

          if (dateFilter !== 'all') {
            const now = new Date();
            const yearFull = String(now.getFullYear()); // '2026'
            const monthNum = now.getMonth() + 1; // 1-12
            const monthPadded = String(monthNum).padStart(2, '0'); // '06'
            const monthUnpadded = String(monthNum); // '6'

            if (dateFilter === 'year') {
              query = query.like('DATE', `%/${yearFull}`);
            } else if (dateFilter === 'month') {
              // Handle both '6' and '06' month format: e.g. "19/06/2026" or "9/6/2026"
              if (monthPadded !== monthUnpadded) {
                query = query.or(`DATE.like.%/${monthPadded}/${yearFull},DATE.like.%/${monthUnpadded}/${yearFull}`);
              } else {
                query = query.like('DATE', `%/${monthPadded}/${yearFull}`);
              }
            }
          }

          // No pagination on the server-side anymore - fetch all to allow global sorting
          const { data: clientsData, error } = await query;

          // Storage folders are already loaded in state, so we do not list them again on search/filter changes.

          const parsedFolders = storageFolders.map(folderName => {
            const match = folderName.match(/^(\d+)\s+(.+)$/);
            if (match) {
              return {
                folderName,
                No: parseInt(match[1], 10),
                NAME: match[2].trim()
              };
            }
            return {
              folderName,
              No: null,
              NAME: folderName.trim()
            };
          });

          const dbClientsList = clientsData || [];
          const virtualClients: any[] = [];

          parsedFolders.forEach(pf => {
            const match = dbClientsList.find(c => {
              const dbNo = c.No ?? c.NO;
              const dbName = c.NAME;

              const noMatch = dbNo !== null && dbNo !== undefined && pf.No !== null && pf.No !== undefined && Number(dbNo) === Number(pf.No);
              const nameMatch = dbName && pf.NAME && dbName.toLowerCase().trim() === pf.NAME.toLowerCase().trim();

              return noMatch || nameMatch;
            });

            if (!match) {
              virtualClients.push({
                id: `virtual-${pf.folderName}`,
                No: pf.No,
                NAME: pf.NAME,
                "PHONE NUMBER": '-',
                "IC NUMBER": '-',
                "CASE CATEGORY": '-',
                "TOTAL PAID (RM)": '0',
                "PENDING (RM)": '0',
                "PACKAGE (RM)": '0',
                "CASE STATUS": 'PENDING',
                "Investigation Paper": '-',
                Report: '-',
                "Action Taken by police": '-',
                DATE: '-',
                isVirtual: true,
                folderName: pf.folderName
              });
            }
          });

          let filteredVirtuals = virtualClients;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filteredVirtuals = virtualClients.filter(vc =>
              vc.NAME.toLowerCase().includes(q) ||
              (vc.No && String(vc.No).includes(q))
            );
          }

          if (clientsData && isMounted) {
            const combined = [...clientsData, ...filteredVirtuals];
            const safeData = combined.map((c, idx) => ({
              ...c,
              _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
            }));
            setDbClients(safeData);
            setFetchError(null);
          } else if (error) {
            console.error('Error fetching clients:', error);
            if (isMounted) setFetchError(error.message || JSON.stringify(error));
          }
        }
        if (isMounted) setLoading(false);
      }
      loadData();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [permissions, searchQuery, dateFilter, viewMode, storageFolders, refreshTrigger]);

  const handleOpenAddModal = () => { 
    setEditingClient(null); 
    setPoliceReportsList([{date: '', no: ''}]);
    setIpList([{date: '', no: '', pem: '', officer: ''}]);
    setSelectedIpk('');
    setSelectedIpd('');
    setSelectedBalai('');
    setIsCustomIpk(false);
    setIsCustomIpd(false);
    setIsCustomBalai(false);
    setPaymentList([]);
    setIsModalOpen(true); 
  };
  const handleOpenEditModal = async (client: any) => {
    setEditingClient(client);
    setIsModalOpen(true);
    let currentData = client;
    if (client?.id && !client.isVirtual) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data) {
        currentData = { ...data, _stableKey: client._stableKey };
        setEditingClient(currentData);
      }
    }
    
    let parsedReports = [];
    if (currentData?.police_report_no && currentData.police_report_no.trim().startsWith('[')) {
       try { parsedReports = JSON.parse(currentData.police_report_no); } catch(e){}
    } else if (currentData?.police_report_no || currentData?.police_report_date) {
       parsedReports = [{ date: currentData.police_report_date || '', no: currentData.police_report_no || '' }];
    }
    if (parsedReports.length === 0) parsedReports = [{ date: '', no: '' }];
    setPoliceReportsList(parsedReports);

    let parsedIps = [];
    if (currentData?.ip_no && currentData.ip_no.trim().startsWith('[')) {
       try { parsedIps = JSON.parse(currentData.ip_no); } catch(e){}
    } else if (currentData?.ip_no || currentData?.ip_date || currentData?.ip_pem1 || currentData?.ip_officer) {
       parsedIps = [{ 
         date: currentData.ip_date || '', 
         no: currentData.ip_no || '',
         pem: currentData.ip_pem1 || '',
         officer: currentData.ip_officer || ''
       }];
    }
    if (parsedIps.length === 0) parsedIps = [{ date: '', no: '', pem: '', officer: '' }];
    setIpList(parsedIps);
    
    const currentIpk = currentData?.report_location_ipk || '';
    const currentIpd = currentData?.report_location_ipd || '';
    const currentBalai = currentData?.report_location_balai || '';

    setSelectedIpk(currentIpk);
    setSelectedIpd(currentIpd);
    setSelectedBalai(currentBalai);

    const hasIpk = Boolean(currentIpk && policeLocations[currentIpk]);
    const hasIpd = Boolean(currentIpd && currentIpk && policeLocations[currentIpk]?.[currentIpd]);
    const hasBalai = Boolean(currentBalai && currentIpk && currentIpd && policeLocations[currentIpk]?.[currentIpd]?.includes(currentBalai));

    setIsCustomIpk(Boolean(currentIpk && !hasIpk));
    setIsCustomIpd(Boolean(currentIpd && !hasIpd));
    setIsCustomBalai(Boolean(currentBalai && !hasBalai));

    const payments = [];
    for (let i = 1; i <= 6; i++) {
      const prefix = i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`;
      const amt = currentData?.[`${prefix} PAYMENT`];
      const dt = currentData?.[`${prefix} PAYMENT DATE`];
      if (amt || dt) {
        payments.push({ amount: amt?.toString() || '', date: dt || '' });
      }
    }
    setPaymentList(payments);

    // Ensure DOM input calculations match the exact data mathematically on mount
    setTimeout(handleFinancialChange, 150);
  };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingClient(null); setSelectedIpk(''); setSelectedIpd(''); setPaymentList([]); };

  // New Handlers for the View Detail Box
  const handleOpenViewModal = async (client: any) => {
    setViewingClient(client);
    setIsViewModalOpen(true);
    if (client?.id && !client.isVirtual) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data) setViewingClient({ ...data, _stableKey: client._stableKey });
    }
  };
  const handleCloseViewModal = () => { setIsViewModalOpen(false); setViewingClient(null); };

  const handleExportFull = async () => {
    const { data: clientsData } = await supabase.from('clients').select('*');
    if (!clientsData) return [];
    return clientsData.map((c, idx) => ({
      ...c,
      _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
    }));
  };

  const writeAuditLog = async (action: 'INSERT' | 'UPDATE' | 'DELETE', recordId: string, changes: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const recordUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(recordId))
        ? recordId
        : null;

      const payload = {
        user_id: session.user.id,
        user_name: profile?.name || 'Unknown',
        user_role: profile?.role || 'No Role',
        table_name: 'clients',
        action: action,
        record_id: recordUuid,
        changes: {
          ...changes,
          original_record_id: recordId
        },
        created_at: new Date().toISOString()
      };

      await supabase.from('audit_logs').insert([payload]);
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  };

  const moveFolderToTrash = async (oldFolderPath: string) => {
    try {
      const allFiles: string[] = [];
      async function traverse(current: string) {
        const { data, error } = await supabase.storage.from('company_drive').list(current, { limit: 1000 });
        if (error) return;
        if (!data) return;
        for (const item of data) {
          const fullItemPath = current ? `${current}/${item.name}` : item.name;
          if (item.id === null) {
            await traverse(fullItemPath);
          } else {
            allFiles.push(fullItemPath);
          }
        }
      }

      await traverse(oldFolderPath);

      if (allFiles.length > 0) {
        for (const file of allFiles) {
          const pathParts = file.split('/');
          const fileName = pathParts.pop();
          let uniqueFileName = fileName;
          if (fileName && fileName.endsWith('.pdf')) {
            const baseName = fileName.substring(0, fileName.length - 4);
            uniqueFileName = `${baseName}_deleted_${Date.now()}.pdf`;
          } else if (fileName) {
            uniqueFileName = `${fileName}_deleted_${Date.now()}`;
          }
          const newPathWithUniqueName = [...pathParts, uniqueFileName].join('/');

          let trashPath = '';
          if (newPathWithUniqueName.includes('Finance/billing_documents/')) {
            trashPath = newPathWithUniqueName.replace('Finance/billing_documents/', 'Finance/billing_documents/Trash/');
          } else {
            trashPath = `Finance/billing_documents/Trash/${newPathWithUniqueName}`;
          }

          await supabase.storage.from('company_drive').move(file, trashPath);

          const refNumber = file.split('/').pop()?.replace('.pdf', '');
          if (refNumber) {
            const { data: publicUrlData } = supabase.storage
              .from('company_drive')
              .getPublicUrl(trashPath);
            const trashUrl = publicUrlData?.publicUrl || '';

            const deletedRefNumber = `${refNumber}_deleted_${Date.now()}`;

            await supabase
              .from('billing_records')
              .update({
                deleted_at: new Date().toISOString(),
                drive_url: trashUrl,
                ref_number: deletedRefNumber
              })
              .eq('ref_number', refNumber);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to move folder ${oldFolderPath} to trash:`, err);
    }
  };

  const handleDeleteClient = async () => {
    if (!editingClient) return;

    if (!window.confirm(t('clients', 'confirmDelete', lang).replace('{name}', editingClient.NAME || ''))) {
      return;
    }

    setIsSaving(true);
    try {
      const clientNoVal = editingClient.No ?? editingClient.NO ?? '';
      const safeClientName = (editingClient.NAME || '').replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
      const clientFolder = `${clientNoVal} ${safeClientName}`;

      const invoicesFolderPath = `Finance/billing_documents/Invoices/${clientFolder}`;
      const receiptsFolderPath = `Finance/billing_documents/Receipts/${clientFolder}`;

      await moveFolderToTrash(invoicesFolderPath);
      await moveFolderToTrash(receiptsFolderPath);

      if (!editingClient.isVirtual) {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', editingClient.id);

        if (error) {
          alert(lang === 'bm' ? 'Gagal memadam klien. Sila cuba lagi.' : 'Failed to delete client. Please try again.');
          setIsSaving(false);
          return;
        }

        await writeAuditLog('DELETE', editingClient.id, {
          NAME: editingClient.NAME,
          'IC NUMBER': editingClient['IC NUMBER'],
          'PHONE NUMBER': editingClient['PHONE NUMBER'],
          'CASE STATUS': editingClient['CASE STATUS']
        });
      }

      handleCloseModal();
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Error deleting client:', err);
      alert(lang === 'bm' ? 'Ralat semasa memadam klien. Sila cuba lagi.' : 'Error deleting client. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinancialChange = () => {
    const pkgInput = document.querySelector('input[name="PACKAGE (RM)"]') as HTMLInputElement;
    const pendingInput = document.querySelector('input[name="PENDING (RM)"]') as HTMLInputElement;
    const paidInput = document.querySelector('input[name="TOTAL PAID (RM)"]') as HTMLInputElement;

    let totalPaid = 0;
    document.querySelectorAll('input[name^="payment_amt_"]').forEach((input) => {
      totalPaid += parseFloat((input as HTMLInputElement).value) || 0;
    });

    if (paidInput) {
       paidInput.value = totalPaid % 1 === 0 ? totalPaid.toString() : totalPaid.toFixed(2);
    }

    if (pkgInput && pendingInput) {
      const pkgVal = parseFloat(pkgInput.value) || 0;
      const pendingVal = Math.max(0, pkgVal - totalPaid);
      pendingInput.value = pendingVal % 1 === 0 ? pendingVal.toString() : pendingVal.toFixed(2);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    const gatheredReports = [];
    let idx = 0;
    while (true) {
       const dKey = `report_date_${idx}`;
       const nKey = `report_no_${idx}`;
       if (!data.hasOwnProperty(nKey) && !data.hasOwnProperty(dKey)) {
         break;
       }
       const dVal = sanitizeInput((data[dKey] as string) || '', 50);
       const nVal = sanitizeInput((data[nKey] as string) || '', 200);
       if (dVal || nVal) {
         gatheredReports.push({ date: dVal, no: nVal });
       }
       idx++;
    }
    const reportsJson = JSON.stringify(gatheredReports);

    const gatheredIps = [];
    let ipIdx = 0;
    while (true) {
       const dKey = `ip_date_${ipIdx}`;
       const nKey = `ip_no_${ipIdx}`;
       const pKey = `ip_pem_${ipIdx}`;
       const oKey = `ip_officer_${ipIdx}`;
       if (!data.hasOwnProperty(nKey) && !data.hasOwnProperty(dKey) && !data.hasOwnProperty(pKey) && !data.hasOwnProperty(oKey)) {
         break;
       }
       const dVal = sanitizeInput((data[dKey] as string) || '', 50);
       const nVal = sanitizeInput((data[nKey] as string) || '', 200);
       const pVal = sanitizeInput((data[pKey] as string) || '', 100);
       const oVal = sanitizeInput((data[oKey] as string) || '', 200);
       if (dVal || nVal || pVal || oVal) {
         gatheredIps.push({ date: dVal, no: nVal, pem: pVal, officer: oVal });
       }
       ipIdx++;
    }
    const ipsJson = JSON.stringify(gatheredIps);

    // ── Sanitize every field before touching the database ────────────────────
    const allowedStatuses = ['PENDING', 'COMPLETED', 'DROPPED', 'KIV'];
    const rawStatus = (data['CASE STATUS'] as string) || 'PENDING';

    const p1 = parseSafeAmount(data['payment_amt_0']);
    const p2 = parseSafeAmount(data['payment_amt_1']);
    const p3 = parseSafeAmount(data['payment_amt_2']);
    const p4 = parseSafeAmount(data['payment_amt_3']);
    const p5 = parseSafeAmount(data['payment_amt_4']);
    const p6 = parseSafeAmount(data['payment_amt_5']);
    const autoTotalPaid = p1 + p2 + p3 + p4 + p5 + p6;
    const pkg = parseSafeAmount(data['PACKAGE (RM)']);
    const autoPending = Math.max(0, pkg - autoTotalPaid);
    
    const getPaymentValue = (val: any) => {
      if (val === undefined || val === null || String(val).trim() === '') return null;
      return parseSafeAmount(val);
    };
 
    const clientPayload = {
      No: data.No ? parseInt(data.No as string, 10) : null,
      NAME: sanitizeInput((data.NAME as string) || '', 100),
      'IC NUMBER': sanitizeInput((data['IC NUMBER'] as string) || '', 20),
      'PHONE NUMBER': sanitizeInput((data['PHONE NUMBER'] as string) || '', 20),
      DATE: sanitizeInput((data.DATE as string) || '', 20),
      'CASE CATEGORY': sanitizeInput((data['CASE CATEGORY'] as string) || '', 100),
      // Whitelist-based: only accept known status values
      'CASE STATUS': allowedStatuses.includes(rawStatus) ? rawStatus : 'PENDING',
      'TOTAL PAID (RM)': autoTotalPaid,
      'PENDING (RM)': autoPending,
      'PACKAGE (RM)': pkg,
      ADDRESS: sanitizeInput((data.ADDRESS as string) || '', 500),
      EMAIL: sanitizeInput((data.EMAIL as string) || '', 100),
      REMARK: sanitizeInput((data.REMARK as string) || '', 1000),
      '1st PAYMENT': getPaymentValue(data['payment_amt_0']),
      '1st PAYMENT DATE': sanitizeInput((data['payment_date_0'] as string) || '', 20),
      '2nd PAYMENT': getPaymentValue(data['payment_amt_1']),
      '2nd PAYMENT DATE': sanitizeInput((data['payment_date_1'] as string) || '', 20),
      '3rd PAYMENT': getPaymentValue(data['payment_amt_2']),
      '3rd PAYMENT DATE': sanitizeInput((data['payment_date_2'] as string) || '', 20),
      '4th PAYMENT': getPaymentValue(data['payment_amt_3']),
      '4th PAYMENT DATE': sanitizeInput((data['payment_date_3'] as string) || '', 20),
      '5th PAYMENT': getPaymentValue(data['payment_amt_4']),
      '5th PAYMENT DATE': sanitizeInput((data['payment_date_4'] as string) || '', 20),
      '6th PAYMENT': getPaymentValue(data['payment_amt_5']),
      '6th PAYMENT DATE': sanitizeInput((data['payment_date_5'] as string) || '', 20),
      'Invoice Ref No': sanitizeInput((data['Invoice Ref No'] as string) || '', 100),
      'Investigation Paper': sanitizeInput((data['Investigation Paper'] as string) || '', 500),
      'Report': sanitizeInput((data.Report as string) || '', 500),
      'Action Taken by police': sanitizeInput((data['Action Taken by police'] as string) || '', 500),
      police_report_date: gatheredReports.length > 0 ? gatheredReports[0].date : '',
      police_report_no: reportsJson,
      ip_date: gatheredIps.length > 0 ? gatheredIps[0].date : '',
      ip_no: ipsJson,
      ip_pem1: gatheredIps.length > 0 ? gatheredIps[0].pem : '',
      ip_officer: gatheredIps.length > 0 ? gatheredIps[0].officer : '',
      report_location_balai: sanitizeInput((data.report_location_balai as string) || '', 200),
      report_location_ipd: sanitizeInput((data.report_location_ipd as string) || '', 200),
      report_location_ipk: sanitizeInput((data.report_location_ipk as string) || '', 200),
      lod_date: sanitizeInput((data.lod_date as string) || '', 20),
      lod_claim_amount: sanitizeInput((data.lod_claim_amount as string) || '', 50),
      lod_remark: sanitizeInput((data.lod_remark as string) || '', 1000),
    };

    // Basic validation
    if (!clientPayload.NAME) {
      alert(lang === 'bm' ? 'Nama klien diperlukan.' : 'Client name is required.');
      setIsSaving(false);
      return;
    }

    // Installment dependency validation
    for (let i = 0; i < 6; i++) {
      const amtVal = data[`payment_amt_${i}`];
      const dateVal = data[`payment_date_${i}`];
      const hasAmt = amtVal !== undefined && amtVal !== null && String(amtVal).trim() !== '';
      const hasDate = dateVal !== undefined && dateVal !== null && String(dateVal).trim() !== '';

      if (hasAmt !== hasDate) {
        const ordinal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
        if (lang === 'bm') {
          alert(`Bagi ansuran ke-${i + 1}, sila pastikan kedua-dua Jumlah Bayaran dan Tarikh diisi.`);
        } else {
          alert(`For the ${ordinal} installment payment, both Payment Amount and Payment Date must be filled.`);
        }
        setIsSaving(false);
        return;
      }
    }

    try {
      if (editingClient && !editingClient.isVirtual) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([clientPayload]);
        if (error) throw error;
      }
      setRefreshTrigger(prev => prev + 1);
    } catch (_err) {
      alert(t('clients', 'failedToSave', lang));
    } finally {
      setIsSaving(false);
      handleCloseModal();
    }
  };

  if (loading || permsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('common', 'loading', lang)}
        </div>
      </div>
    );
  }

  const isIT = profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const canEdit = permissions?.edit_clients || isIT;
  const canView = permissions?.view_clients || isIT;

  if (!canView) {
    return (
      <div className="p-8 md:p-12 rounded-2xl bg-white dark:bg-gray-900/50 border border-rose-200 dark:border-rose-950/20 shadow-sm text-center mt-12">
        <h2 className="text-lg font-bold text-rose-600 dark:text-rose-455 mb-2">{t('common', 'accessDenied', lang)}</h2>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6 animate-page-transition pt-12 md:pt-0 relative">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
            {t('clients', 'pageTitle', lang)}
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
            {canEdit ? t('clients', 'manageSubtitle', lang) : t('clients', 'viewSubtitle', lang)}
          </p>
        </div>

        <div className="w-full">
          {fetchError && (
            <div className="mb-4 p-4 bg-red-100 text-red-900 border border-red-200 rounded-xl">
              <h3 className="font-bold">Error fetching data from Supabase:</h3>
              <p className="font-mono text-sm">{fetchError}</p>
            </div>
          )}
          <ClientTable
            clients={dbClients}
            canEdit={canEdit}
            searchQuery={searchQuery}
            onSearchChange={(q) => { setSearchQuery(q); }}
            dateFilter={dateFilter}
            onDateFilterChange={(df) => { setDateFilter(df); }}
            viewMode={viewMode}
            onViewModeChange={(vm) => { setViewMode(vm); }}
            onExportFull={handleExportFull}
            onAddClick={handleOpenAddModal}
            onEditClick={handleOpenEditModal}
            onViewClick={handleOpenViewModal}
          />
        </div>

        {/* ==============================================
          1. VIEW CLIENT DETAILS MODAL
          ============================================== */}
        {isViewModalOpen && viewingClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-6xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh]">

              <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                  {t('clients', 'clientCaseProfile', lang)}
                </h2>
                <button
                  onClick={handleCloseViewModal}
                  className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-gray-900/10 space-y-6">
                {/* 1. Personal Information */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    }
                    title={t('clients', 'personalInfo', lang)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <ViewField label={t('clients', 'nama', lang)} value={viewingClient.NAME} lang={lang} />
                    <ViewField label={t('clients', 'alamat', lang)} value={viewingClient.ADDRESS} lang={lang} />
                    <ViewField label={t('clients', 'icNumberLabel', lang)} value={viewingClient['IC NUMBER']} lang={lang} />
                    <ViewField label={t('clients', 'phoneNumberLabel', lang)} value={viewingClient['PHONE NUMBER']} lang={lang} />
                    <ViewField label={t('clients', 'emailLabel', lang)} value={viewingClient.EMAIL} lang={lang} />
                    <ViewField label={t('clients', 'dateLabel', lang) || (lang === 'bm' ? 'Tarikh' : 'Date')} value={viewingClient.DATE} lang={lang} />
                  </div>
                </div>

                {/* 2. Laporan polis & lokasi laporan */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    }
                    title={t('clients', 'policeReport', lang)}
                  />
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                       {(() => {
                          let parsedReports = [];
                          if (viewingClient.police_report_no && String(viewingClient.police_report_no).trim().startsWith('[')) {
                             try { parsedReports = JSON.parse(viewingClient.police_report_no); } catch(e){}
                          } else if (viewingClient.police_report_no || viewingClient.police_report_date) {
                             parsedReports = [{ date: viewingClient.police_report_date || '', no: viewingClient.police_report_no || '' }];
                          }
                          
                          if (parsedReports.length === 0) {
                             return <div className="text-sm font-semibold text-slate-400 dark:text-zinc-650 italic">{lang === 'bm' ? 'Tiada Maklumat' : 'Not Provided'}</div>;
                          }

                          return parsedReports.map((rp: any, idx: number) => (
                            <div key={idx} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                               {parsedReports.length > 1 && (
                                 <div className="absolute top-0 right-0 bg-slate-100 dark:bg-gray-800 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-zinc-400 rounded-bl-xl border-b border-l border-slate-200 dark:border-gray-700">
                                   Report #{idx + 1}
                                 </div>
                               )}
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                 <ViewField label={t('clients', 'reportDate', lang)} value={rp.date} lang={lang} />
                                 <ViewField label={t('clients', 'reportNo', lang)} value={rp.no} lang={lang} />
                               </div>
                            </div>
                          ));
                       })()}
                    </div>
                    {/* Lokasi Laporan */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-gray-800">
                      <ViewField label={`${t('clients', 'policeStation', lang)}`} value={viewingClient.report_location_balai} lang={lang} />
                      <ViewField label={`${t('clients', 'districtPolice', lang)}`} value={viewingClient.report_location_ipd} lang={lang} />
                      <ViewField label={`${t('clients', 'statePolice', lang)}`} value={viewingClient.report_location_ipk} lang={lang} />
                    </div>
                  </div>
                </div>

                {/* 3. Kertas Siasatan (IP) */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    }
                    title={t('clients', 'investigationPaper', lang)}
                  />
                  <div className="flex flex-col gap-3">
                     {(() => {
                        let parsedIps = [];
                        if (viewingClient.ip_no && String(viewingClient.ip_no).trim().startsWith('[')) {
                           try { parsedIps = JSON.parse(viewingClient.ip_no); } catch(e){}
                        } else if (viewingClient.ip_no || viewingClient.ip_date || viewingClient.ip_pem1 || viewingClient.ip_officer) {
                           parsedIps = [{ 
                             date: viewingClient.ip_date || '', 
                             no: viewingClient.ip_no || '',
                             pem: viewingClient.ip_pem1 || '',
                             officer: viewingClient.ip_officer || ''
                           }];
                        }
                        
                        if (parsedIps.length === 0) {
                           return <div className="text-sm font-semibold text-slate-400 dark:text-zinc-650 italic">{lang === 'bm' ? 'Tiada Maklumat' : 'Not Provided'}</div>;
                        }

                        return parsedIps.map((ip: any, idx: number) => (
                          <div key={idx} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                             {parsedIps.length > 1 && (
                               <div className="absolute top-0 right-0 bg-slate-100 dark:bg-gray-800 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-zinc-400 rounded-bl-xl border-b border-l border-slate-200 dark:border-gray-700">
                                 IP #{idx + 1}
                               </div>
                             )}
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                               <ViewField label={t('clients', 'ipDate', lang)} value={ip.date} lang={lang} />
                               <ViewField label={t('clients', 'ipNo', lang)} value={ip.no} lang={lang} />
                               <ViewField label={t('clients', 'ipPem1', lang)} value={ip.pem} lang={lang} />
                               <ViewField label={t('clients', 'ipOfficer', lang)} value={ip.officer} lang={lang} />
                             </div>
                          </div>
                        ));
                     })()}
                  </div>
                </div>

                {/* 5. Financial Overview & Case Categories */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                    title={lang === 'bm' ? 'Maklumat Kewangan' : 'Financial Information'}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ViewField
                      label={t('clients', 'servicePackage', lang)}
                      value={viewingClient['PACKAGE (RM)'] !== null && viewingClient['PACKAGE (RM)'] !== '' ? `RM ${viewingClient['PACKAGE (RM)']}` : ''}
                      lang={lang}
                    />
                    <ViewField
                      label={t('clients', 'pendingBalance', lang)}
                      value={viewingClient['PENDING (RM)'] !== null && viewingClient['PENDING (RM)'] !== '' ? `RM ${viewingClient['PENDING (RM)']}` : ''}
                      lang={lang}
                    />
                    <ViewField
                      label={t('clients', 'totalPaidReceived', lang)}
                      value={viewingClient['TOTAL PAID (RM)'] !== null && viewingClient['TOTAL PAID (RM)'] !== '' ? `RM ${viewingClient['TOTAL PAID (RM)']}` : ''}
                      lang={lang}
                    />
                  </div>
                </div>

                {/* Installment Payment Schedule */}
                {(() => {
                  const paymentIndices = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
                  const payments = paymentIndices.map(prefix => {
                    const amountKey = Object.keys(viewingClient).find(k => k.toLowerCase() === `${prefix.toLowerCase()} payment`);
                    const dateKey = Object.keys(viewingClient).find(k => k.toLowerCase() === `${prefix.toLowerCase()} payment date`);

                    const amount = amountKey ? viewingClient[amountKey] : null;
                    const date = dateKey ? viewingClient[dateKey] : null;

                    return { prefix, amount, date };
                  }).filter(p => p.amount !== null && p.amount !== '' && p.amount !== 0 && p.amount !== '0');

                  if (payments.length === 0) return null;

                  return (
                    <div>
                      <SectionHeader
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        }
                        title={t('clients', 'paymentSchedule', lang)}
                      />
                      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800/80 rounded-xl p-4 shadow-sm divide-y divide-slate-100 dark:divide-gray-800">
                        {payments.map(p => {
                          const ordinalLabel = lang === 'bm'
                            ? `Bayaran Ke-${p.prefix === '1st' ? '1' : p.prefix === '2nd' ? '2' : p.prefix === '3rd' ? '3' : p.prefix === '4th' ? '4' : p.prefix === '5th' ? '5' : '6'}`
                            : `${p.prefix} Payment`;
                          const formattedAmt = String(p.amount).startsWith('RM') ? p.amount : `RM ${p.amount}`;
                          return (
                            <div key={p.prefix} className="flex justify-between items-center py-3 first:pt-0 last:pb-0 text-sm font-semibold">
                              <div className="flex flex-col">
                                <span className="text-slate-800 dark:text-white">{ordinalLabel}</span>
                                {p.date && <span className="text-xs text-slate-450 dark:text-zinc-500 font-mono font-medium">{p.date}</span>}
                              </div>
                              <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formattedAmt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 6. rekod pembayaran */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <SectionHeader
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 112-2h2a2 2 0 012 2" />
                        </svg>
                      }
                      title={t('clients', 'paymentRecord', lang)}
                    />
                    <button
                      onClick={() => setIsBillingModalOpen(true)}
                      className="px-3.5 py-1.5 bg-blue-650 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
                    >
                      {t('clients', 'generateDoc', lang)}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Invoices Column */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800/80 shadow-sm">
                      <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">
                        {lang === 'bm' ? 'Invois (Invoices)' : 'Invoices'}
                      </h4>
                      {billingRecords.filter(r => r.document_type === 'invoice').length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-zinc-650 italic">
                          {lang === 'bm' ? 'Tiada invois dijana lagi.' : 'No invoices generated yet.'}
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {billingRecords.filter(r => r.document_type === 'invoice').map(record => (
                            <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                              <div>
                                <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                                  {new Date(record.created_at).toLocaleDateString()} &middot; RM {Number(record.amount).toFixed(2)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {record.drive_url ? (
                                  <a
                                    href="#"
                                    onClick={(e) => handleViewDocument(e, record.drive_url)}
                                    className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 px-2.5 py-1.5 rounded-md font-semibold text-xs transition-colors"
                                  >
                                    {t('clients', 'viewDoc', lang)}
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">Processing...</span>
                                )}
                                {canEdit && (
                                  <button
                                    onClick={() => handleDeleteBillingRecord(record)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/35 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                                    title="Delete"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Receipts Column */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800/80 shadow-sm">
                      <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">
                        {lang === 'bm' ? 'Resit (Receipts)' : 'Receipts'}
                      </h4>
                      {billingRecords.filter(r => r.document_type === 'receipt').length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-zinc-650 italic">
                          {lang === 'bm' ? 'Tiada resit dijana lagi.' : 'No receipts generated yet.'}
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {billingRecords.filter(r => r.document_type === 'receipt').map(record => (
                            <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                              <div>
                                <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                                  {new Date(record.created_at).toLocaleDateString()} &middot; RM {Number(record.amount).toFixed(2)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {record.drive_url ? (
                                  <a
                                    href="#"
                                    onClick={(e) => handleViewDocument(e, record.drive_url)}
                                    className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 dark:text-emerald-400 px-2.5 py-1.5 rounded-md font-semibold text-xs transition-colors"
                                  >
                                    {t('clients', 'viewDoc', lang)}
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">Processing...</span>
                                )}
                                {canEdit && (
                                  <button
                                    onClick={() => handleDeleteBillingRecord(record)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/35 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                                    title="Delete"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* 7. Status & Kategori Kes */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 112-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    }
                    title={lang === 'bm' ? 'Status & Kategori Kes' : 'Case Status & Category'}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <ViewField label={t('clients', 'caseStatusLabel', lang)} value={viewingClient['CASE STATUS']} lang={lang} />
                    <ViewField label={t('clients', 'caseCategoryLabel', lang)} value={viewingClient['CASE CATEGORY']} lang={lang} />
                    <ViewField label={t('clients', 'remarkCatatan', lang)} value={viewingClient.REMARK} lang={lang} />
                  </div>
                </div>

                {/* 8. Letter of Demand (LoD) */}
                <div>
                  <SectionHeader
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    }
                    title={t('clients', 'lodTitle', lang)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ViewField label={`${t('clients', 'lodDate', lang)}`} value={viewingClient.lod_date} lang={lang} />
                    <ViewField
                      label={`${t('clients', 'lodClaimAmount', lang)}`}
                      value={viewingClient.lod_claim_amount !== null && viewingClient.lod_claim_amount !== '' && !isNaN(Number(viewingClient.lod_claim_amount)) ? `RM ${viewingClient.lod_claim_amount}` : viewingClient.lod_claim_amount}
                      lang={lang}
                    />
                    <ViewField label={`${t('clients', 'lodRemark', lang)}`} value={viewingClient.lod_remark} lang={lang} />
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 dark:border-gray-800/80 bg-white dark:bg-black flex justify-end gap-3">
                {canEdit && (
                  <button
                    onClick={() => {
                      handleCloseViewModal();
                      handleOpenEditModal(viewingClient);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[48px]"
                  >
                    {t('clients', 'editData', lang)}
                  </button>
                )}
                <button
                  onClick={handleCloseViewModal}
                  className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white transition-colors min-h-[48px]"
                >
                  {t('clients', 'close', lang)}
                </button>
              </div>
            </div>
          </div>
        )}


        {isBillingModalOpen && viewingClient && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
            <div className="relative w-full max-w-xl max-h-[95vh] flex flex-col">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setIsBillingModalOpen(false)}
                  className="text-white/70 hover:text-white transition-colors flex items-center gap-2"
                >
                  <span className="text-sm font-semibold">{t('clients', 'close', lang)}</span>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto rounded-xl shadow-2xl bg-white">
                <BillingGenerator
                  clientData={{
                    id: viewingClient.id,
                    clientNo: viewingClient.No ?? viewingClient.NO ?? '',
                    name: viewingClient.NAME || 'N/A',
                    ic: viewingClient['IC NUMBER'] || 'N/A',
                    address: viewingClient.ADDRESS || 'N/A',
                    payments: [
                      viewingClient['1ST PAYMENT'] ?? viewingClient['1st PAYMENT'] ?? viewingClient['1st payment'],
                      viewingClient['2ND PAYMENT'] ?? viewingClient['2nd PAYMENT'] ?? viewingClient['2nd payment'],
                      viewingClient['3RD PAYMENT'] ?? viewingClient['3rd PAYMENT'] ?? viewingClient['3rd payment'],
                      viewingClient['4TH PAYMENT'] ?? viewingClient['4th PAYMENT'] ?? viewingClient['4th payment'],
                      viewingClient['5TH PAYMENT'] ?? viewingClient['5th PAYMENT'] ?? viewingClient['5th payment'],
                      viewingClient['6TH PAYMENT'] ?? viewingClient['6th PAYMENT'] ?? viewingClient['6th payment']
                    ]
                  }}
                  onSuccess={() => {
                    setTimeout(() => {
                      setIsBillingModalOpen(false);
                      loadBillingRecords(viewingClient.id);
                    }, 1500);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ==============================================
          2. ADD / EDIT CLIENT MODAL
          ============================================== */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-[95%] md:w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

              <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                  {editingClient ? t('clients', 'editClientRecord', lang) : t('clients', 'addClient', lang)}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveClient} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-black">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 1. Personal Information */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'personalInfo', lang)}</h3>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">No</label>
                    <input type="number" name="No" defaultValue={editingClient?.No || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'nama', lang)}</label>
                    <input type="text" name="NAME" defaultValue={editingClient?.NAME || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'alamat', lang)}</label>
                    <input type="text" name="ADDRESS" defaultValue={editingClient?.ADDRESS || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'icNumberLabel', lang)}</label>
                    <input type="text" name="IC NUMBER" defaultValue={editingClient?.["IC NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'phoneNumberLabel', lang)}</label>
                    <input type="text" name="PHONE NUMBER" defaultValue={editingClient?.["PHONE NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'emailLabel', lang)}</label>
                    <input type="email" name="EMAIL" defaultValue={editingClient?.EMAIL || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <DateInput
                    name="DATE"
                    label={`${t('clients', 'dateLabel', lang) || (lang === 'bm' ? 'Tarikh' : 'Date')} (DD/MM/YYYY)`}
                    defaultValue={editingClient?.DATE || ''}
                    lang={lang}
                  />

                  {/* 2. Laporan Polis */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'policeReport', lang)}</h3>
                    <button 
                      type="button" 
                      onClick={() => {
                        const lastIdx = policeReportsList.length - 1;
                        if (lastIdx >= 0) {
                          const lastDate = (document.querySelector(`input[name="report_date_${lastIdx}"]`) as HTMLInputElement)?.value;
                          const lastNo = (document.querySelector(`input[name="report_no_${lastIdx}"]`) as HTMLInputElement)?.value;
                          if (!lastDate?.trim() && !lastNo?.trim()) {
                            alert(lang === 'bm' ? 'Sila isikan laporan sebelumnya terlebih dahulu sebelum menambah yang baru.' : 'Please fill out the previous report first before adding a new one.');
                            return;
                          }
                        }
                        setPoliceReportsList([...policeReportsList, {date:'', no:''}]);
                      }} 
                      className="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:hover:bg-yellow-500/20 text-[10px] font-bold rounded-lg transition-colors uppercase tracking-wider"
                    >
                       + ADD
                    </button>
                  </div>
                  
                  {policeReportsList.map((rp, idx) => (
                    <div key={`pr-${idx}`} className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 dark:bg-gray-800/30 p-4 rounded-xl border border-slate-100 dark:border-gray-800 relative mt-2">
                         {policeReportsList.length > 1 && (
                           <button 
                             type="button" 
                             onClick={() => setPoliceReportsList(policeReportsList.filter((_, i) => i !== idx))} 
                             className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-500/40 transition-colors shadow-sm"
                           >
                             ×
                           </button>
                         )}
                       <DateInput
                         name={`report_date_${idx}`}
                         label={`${t('clients', 'reportDate', lang)} (DD/MM/YYYY)`}
                         defaultValue={rp.date}
                         lang={lang}
                       />
                       <div className="space-y-1">
                         <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'reportNo', lang)}</label>
                         <input type="text" name={`report_no_${idx}`} defaultValue={rp.no} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                       </div>
                    </div>
                  ))}

                  {/* Lokasi Laporan Header & Quick Toggle */}
                  <div className="sm:col-span-2 mt-4 mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      {t('clients', 'reportLocation', lang)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const turnOnManual = !isCustomIpk || !isCustomIpd || !isCustomBalai;
                        setIsCustomIpk(turnOnManual);
                        setIsCustomIpd(turnOnManual);
                        setIsCustomBalai(turnOnManual);
                      }}
                      className="text-[11px] font-bold text-indigo-600 dark:text-yellow-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {isCustomIpk && isCustomIpd && isCustomBalai ? (
                        <>{lang === 'bm' ? '📋 Tukar ke Mod Dropdown' : '📋 Switch to Dropdown Mode'}</>
                      ) : (
                        <>{lang === 'bm' ? '✏️ Tukar ke Mod Taip Manual' : '✏️ Switch to Manual Mode'}</>
                      )}
                    </button>
                  </div>

                  {/* 1. IPK (Kontinjen / Negeri) */}
                  <div className="sm:col-span-2 space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                        {`${t('clients', 'statePolice', lang)}`}
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomIpk(!isCustomIpk)}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-500 underline cursor-pointer"
                      >
                        {isCustomIpk ? (lang === 'bm' ? '↩️ Pilih Senarai' : '↩️ Pick Dropdown') : (lang === 'bm' ? '✏️ Taip Manual' : '✏️ Type Manually')}
                      </button>
                    </div>

                    {isCustomIpk ? (
                      <input
                        type="text"
                        name="report_location_ipk"
                        value={selectedIpk}
                        onChange={(e) => {
                          setSelectedIpk(e.target.value);
                          setSelectedIpd('');
                        }}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                        placeholder={lang === 'bm' ? 'Masukkan IPK / Negeri (cth: IPK Selangor Baru)' : 'Enter IPK / State (e.g. New IPK)'}
                      />
                    ) : (
                      <select
                        name="report_location_ipk"
                        value={selectedIpk}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomIpk(true);
                            setSelectedIpk('');
                            setSelectedIpd('');
                          } else {
                            setSelectedIpk(e.target.value);
                            setSelectedIpd('');
                          }
                        }}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer"
                      >
                        <option value="">{lang === 'bm' ? '-- Pilih Kontinjen / Negeri (IPK) --' : '-- Select Police Contingent / State (IPK) --'}</option>
                        {Object.keys(policeLocations).map(ipk => (
                          <option key={ipk} value={ipk}>{ipk}</option>
                        ))}
                        <option value="__CUSTOM__" className="font-bold text-indigo-600 dark:text-yellow-500">
                          ✏️ {lang === 'bm' ? '+ Taip IPK Baru / Custom Manual...' : '+ Type Custom IPK Manually...'}
                        </option>
                      </select>
                    )}
                  </div>

                  {/* 2. IPD (Ibu Pejabat Polis Daerah) */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                        {`${t('clients', 'districtPolice', lang)}`}
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomIpd(!isCustomIpd)}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-500 underline cursor-pointer"
                      >
                        {isCustomIpd ? (lang === 'bm' ? '↩️ Pilih Senarai' : '↩️ Pick Dropdown') : (lang === 'bm' ? '✏️ Taip Manual' : '✏️ Type Manually')}
                      </button>
                    </div>

                    {isCustomIpd ? (
                      <input
                        type="text"
                        name="report_location_ipd"
                        value={selectedIpd}
                        onChange={(e) => setSelectedIpd(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                        placeholder={lang === 'bm' ? 'Masukkan IPD (cth: IPD Kuala Langat Baru)' : 'Enter IPD (e.g. New IPD)'}
                      />
                    ) : (
                      <select
                        name="report_location_ipd"
                        value={selectedIpd}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomIpd(true);
                            setSelectedIpd('');
                          } else {
                            setSelectedIpd(e.target.value);
                          }
                        }}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer"
                      >
                        <option value="">{lang === 'bm' ? '-- Pilih Daerah (IPD) --' : '-- Select District (IPD) --'}</option>
                        {selectedIpk && policeLocations[selectedIpk] ? (
                          Object.keys(policeLocations[selectedIpk]).map(ipd => (
                            <option key={ipd} value={ipd}>{ipd}</option>
                          ))
                        ) : null}
                        <option value="__CUSTOM__" className="font-bold text-indigo-600 dark:text-yellow-500">
                          ✏️ {lang === 'bm' ? '+ Taip IPD Baru / Custom Manual...' : '+ Type Custom IPD Manually...'}
                        </option>
                      </select>
                    )}
                  </div>

                  {/* 3. Balai Polis */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                        {`${t('clients', 'policeStation', lang)}`}
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomBalai(!isCustomBalai)}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-500 underline cursor-pointer"
                      >
                        {isCustomBalai ? (lang === 'bm' ? '↩️ Pilih Senarai' : '↩️ Pick Dropdown') : (lang === 'bm' ? '✏️ Taip Manual' : '✏️ Type Manually')}
                      </button>
                    </div>

                    {isCustomBalai ? (
                      <input
                        type="text"
                        name="report_location_balai"
                        value={selectedBalai}
                        onChange={(e) => setSelectedBalai(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                        placeholder={lang === 'bm' ? 'Masukkan Balai (cth: Balai Polis Banting)' : 'Enter Police Station'}
                      />
                    ) : (
                      <select
                        name="report_location_balai"
                        value={selectedBalai}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomBalai(true);
                            setSelectedBalai('');
                          } else {
                            setSelectedBalai(e.target.value);
                          }
                        }}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer"
                      >
                        <option value="">{lang === 'bm' ? '-- Pilih Balai Polis --' : '-- Select Police Station --'}</option>
                        {selectedIpk && selectedIpd && policeLocations[selectedIpk]?.[selectedIpd] ? (
                          policeLocations[selectedIpk][selectedIpd].map(balai => (
                            <option key={balai} value={balai}>{balai}</option>
                          ))
                        ) : null}
                        <option value="__CUSTOM__" className="font-bold text-indigo-600 dark:text-yellow-500">
                          ✏️ {lang === 'bm' ? '+ Taip Balai Baru / Custom Manual...' : '+ Type Custom Station Manually...'}
                        </option>
                      </select>
                    )}
                  </div>

                  {/* 3. Kertas Siasatan (IP) */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'investigationPaper', lang)}</h3>
                    <button 
                      type="button" 
                      onClick={() => {
                        const lastIdx = ipList.length - 1;
                        if (lastIdx >= 0) {
                          const lastNo = (document.querySelector(`input[name="ip_no_${lastIdx}"]`) as HTMLInputElement)?.value;
                          const lastPem = (document.querySelector(`select[name="ip_pem_${lastIdx}"]`) as HTMLSelectElement)?.value;
                          if (!lastNo?.trim() && !lastPem?.trim()) {
                            alert(lang === 'bm' ? 'Sila isikan kertas siasatan sebelumnya terlebih dahulu sebelum menambah yang baru.' : 'Please fill out the previous investigation paper first before adding a new one.');
                            return;
                          }
                        }
                        setIpList([...ipList, {date:'', no:'', pem:'', officer:''}]);
                      }} 
                      className="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-yellow-500/10 dark:text-yellow-500 dark:hover:bg-yellow-500/20 text-[10px] font-bold rounded-lg transition-colors uppercase tracking-wider"
                    >
                       + ADD
                    </button>
                  </div>
                  
                  {ipList.map((ip, idx) => (
                    <div key={`ip-${idx}`} className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end bg-slate-50 dark:bg-gray-800/30 p-4 rounded-xl border border-slate-100 dark:border-gray-800 relative mt-2">
                         {ipList.length > 1 && (
                           <button 
                             type="button" 
                             onClick={() => setIpList(ipList.filter((_, i) => i !== idx))} 
                             className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-500/40 transition-colors shadow-sm z-10"
                           >
                             ×
                           </button>
                         )}
                       <DateInput
                         name={`ip_date_${idx}`}
                         label={`${t('clients', 'ipDate', lang)} (DD/MM/YYYY)`}
                         defaultValue={ip.date}
                         lang={lang}
                       />
                       <div className="space-y-1">
                         <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'ipNo', lang)}</label>
                         <input type="text" name={`ip_no_${idx}`} defaultValue={ip.no} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                       </div>
                       <div className="space-y-1">
                         <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'ipPem1', lang)}</label>
                         <select name={`ip_pem_${idx}`} defaultValue={ip.pem} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]">
                           <option value="">{lang === 'bm' ? 'Pilih PEM' : 'Select PEM'}</option>
                           <option value="PEM 1">PEM 1</option>
                           <option value="PEM 2">PEM 2</option>
                           <option value="PEM 3">PEM 3</option>
                           <option value="PEM 4">PEM 4</option>
                         </select>
                       </div>
                       <div className="space-y-1">
                         <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'ipOfficer', lang)}</label>
                         <input type="text" name={`ip_officer_${idx}`} defaultValue={ip.officer} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                       </div>
                    </div>
                  ))}

                  {/* 4. Financial Details */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{lang === 'bm' ? 'Maklumat Kewangan & Pakej' : 'Financial & Package Details'}</h3>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'servicePackage', lang)} (RM)</label>
                    <input type="number" name="PACKAGE (RM)" step="0.01" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} onChange={handleFinancialChange} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'totalPaidReceived', lang)} (RM)</label>
                    <input type="number" name="TOTAL PAID (RM)" step="0.01" readOnly defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none min-h-[48px] cursor-not-allowed opacity-80" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'pendingBalance', lang)} (RM)</label>
                    <input type="number" name="PENDING (RM)" step="0.01" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Invoice Ref No</label>
                    <input type="text" name="Invoice Ref No" defaultValue={editingClient?.["Invoice Ref No"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>

                  {/* Dynamic payments Scheduler */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">{lang === 'bm' ? 'Jadual Ansuran Pembayaran' : 'Installment Payment Schedule'}</h4>
                    {paymentList.length < 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          const currentTotal = paymentList.length;
                          // Find first unfilled payment block if user didn't fill previous ones
                          const isPreviousFilled = paymentList.every(p => {
                            const amt = document.querySelector(`input[name="payment_amt_${paymentList.indexOf(p)}"]`) as HTMLInputElement;
                            const dt = document.querySelector(`input[name="payment_date_${paymentList.indexOf(p)}"]`) as HTMLInputElement;
                            return (amt && amt.value) || (dt && dt.value);
                          });
                          if (!isPreviousFilled && currentTotal > 0) {
                            alert(lang === 'bm' ? 'Sila isikan maklumat bayaran sebelumnya dahulu.' : 'Please fill in the previous payment details first.');
                            return;
                          }
                          setPaymentList([...paymentList, { amount: '', date: '' }]);
                        }}
                        className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                      >
                        + ADD
                      </button>
                    )}
                  </div>
                  {paymentList.map((pay, idx) => (
                    <div key={`pay-${idx}`} className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-slate-50 dark:bg-gray-800/30 p-4 rounded-xl border border-slate-100 dark:border-gray-800 relative">
                        <button 
                          type="button" 
                          onClick={() => {
                            const newList = [...paymentList];
                            newList.splice(idx, 1);
                            setPaymentList(newList);
                            setTimeout(handleFinancialChange, 100);
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-500/40 transition-colors"
                        >
                           ×
                        </button>
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                            {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`} Payment
                          </label>
                          <input type="number" name={`payment_amt_${idx}`} step="0.01" defaultValue={pay.amount} onChange={handleFinancialChange} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                        </div>
                        <DateInput
                          name={`payment_date_${idx}`}
                          label={lang === 'bm' ? `Tarikh Bayaran ${idx + 1} (DD/MM/YYYY)` : `Payment Date ${idx + 1} (DD/MM/YYYY)`}
                          defaultValue={pay.date}
                          lang={lang}
                        />
                    </div>
                  ))}
                  {/* 6. Case & Resolution Details */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{lang === 'bm' ? 'Status & Kategori Kes' : 'Case Status & Category'}</h3>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'caseStatusLabel', lang)}</label>
                    <div className="relative">
                      <select name="CASE STATUS" defaultValue={editingClient?.["CASE STATUS"] || 'PENDING'} data-custom-select className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer appearance-none">
                        <option value="PENDING">PENDING</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="DROPPED">DROPPED</option>
                        <option value="KIV">KIV</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-550 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const currentVal = editingClient?.["CASE CATEGORY"] || '';
                    const options = ["Ah Long", "Kredit Komuniti", "Bank"];
                    const showCustomOption = currentVal && !options.includes(currentVal);
                    return (
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'caseCategoryLabel', lang)}</label>
                        <div className="relative">
                          <select name="CASE CATEGORY" defaultValue={currentVal || 'Ah Long'} className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer appearance-none">
                            <option value="Ah Long">Ah Long</option>
                            <option value="Kredit Komuniti">Kredit Komuniti</option>
                            <option value="Bank">Bank</option>
                            {showCustomOption && <option value={currentVal}>{currentVal}</option>}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-550 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'remarkCatatan', lang)}</label>
                    <textarea name="REMARK" defaultValue={editingClient?.REMARK || ''} rows={3} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none min-h-[100px]"></textarea>
                  </div>

                  {/* 7. Letter of Demand (LoD) */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'lodTitle', lang)}</h3>
                  </div>
                  <DateInput
                    name="lod_date"
                    label={`${t('clients', 'lodDate', lang)} (DD/MM/YYYY)`}
                    defaultValue={editingClient?.lod_date || ''}
                    lang={lang}
                  />
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{`${t('clients', 'lodClaimAmount', lang)}`}</label>
                    <input type="text" name="lod_claim_amount" defaultValue={editingClient?.lod_claim_amount || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{`${t('clients', 'lodRemark', lang)}`}</label>
                    <input type="text" name="lod_remark" defaultValue={editingClient?.lod_remark || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>

                  {/* Legacy Fields Kept in background for compatibility, hidden */}
                  <input type="hidden" name="Investigation Paper" defaultValue={editingClient?.["Investigation Paper"] || ''} />
                  <input type="hidden" name="Report" defaultValue={editingClient?.Report || ''} />
                  <input type="hidden" name="Action Taken by police" defaultValue={editingClient?.["Action Taken by police"] || ''} />

                  <div className="sm:col-span-2 mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-gray-800/80 gap-3">
                    <div className="w-full sm:w-auto">
                      {editingClient && (['CEO', 'CFO', 'IT Admin'].includes(profile?.role) || profile?.role?.toLowerCase() === 'it admin' || profile?.role?.toLowerCase() === 'it' || profile?.department?.toLowerCase() === 'it' || permissions?.manage_access_control) && (
                        <button
                          type="button"
                          onClick={handleDeleteClient}
                          className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/15 dark:text-rose-400 dark:hover:bg-rose-900/30 border border-rose-200/50 dark:border-rose-950/20 transition-all w-full sm:w-auto min-h-[48px]"
                        >
                          {t('clients', 'deleteClient', lang)}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-gray-700 transition-colors w-full sm:w-auto min-h-[48px]"
                      >
                        {t('clients', 'cancel', lang)}
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-yellow-500 dark:text-black font-semibold border-0 dark:hover:bg-yellow-400 dark:text-white transition-colors shadow-sm w-full sm:w-auto min-h-[48px] disabled:opacity-50"
                      >
                        {isSaving ? t('clients', 'saving', lang) : t('clients', 'saveChanges', lang)}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}