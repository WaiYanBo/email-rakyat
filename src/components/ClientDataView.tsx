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
import PermissionDenied from './PermissionDenied';
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
              } catch (err) { }
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
              } catch (err) { }
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
  const [dbClients, setDbClients] = useState<any[]>([]);
  const { lang } = usePortalLanguage();
  const { profile, permissions, isITAdmin, loading: permsLoading } = usePermissions();

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
  const [policeReportsList, setPoliceReportsList] = useState<{ date: string, no: string }[]>([{ date: '', no: '' }]);
  const [ipList, setIpList] = useState<{ date: string, no: string, pem: string, officer: string }[]>([{ date: '', no: '', pem: '', officer: '' }]);
  const [selectedIpk, setSelectedIpk] = useState('');
  const [selectedIpd, setSelectedIpd] = useState('');
  const [selectedBalai, setSelectedBalai] = useState('');
  const [isCustomIpk, setIsCustomIpk] = useState(false);
  const [isCustomIpd, setIsCustomIpd] = useState(false);
  const [isCustomBalai, setIsCustomBalai] = useState(false);

  // CASE CATEGORY STATE & REGISTRATION
  const [registeredCategories, setRegisteredCategories] = useState<string[]>(() => {
    const defaults = ["Ah Long", "Kredit Komuniti", "Bank", "Scam Victim"];
    try {
      const saved = localStorage.getItem('custom_case_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return Array.from(new Set([...defaults, ...parsed]));
        }
      }
    } catch (e) { }
    return defaults;
  });
  const [isCustomCaseCategory, setIsCustomCaseCategory] = useState(false);
  const [selectedCaseCategory, setSelectedCaseCategory] = useState('Ah Long');
  const [customCaseCategoryVal, setCustomCaseCategoryVal] = useState('');

  const registerNewCategory = (cat: string) => {
    const trimmed = cat.trim();
    if (!trimmed) return;
    setRegisteredCategories(prev => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed];
      try {
        localStorage.setItem(
          'custom_case_categories',
          JSON.stringify(updated.filter(c => !["Ah Long", "Kredit Komuniti", "Bank", "Scam Victim"].includes(c)))
        );
      } catch (e) { }
      return updated;
    });
  };

  const [paymentList, setPaymentList] = useState<{ amount: string, date: string }[]>([]);
  // MODAL STATE - VIEW (NEW)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<any>(null);

  const [billingRecords, setBillingRecords] = useState<any[]>([]);
  const [agreementFiles, setAgreementFiles] = useState<any[]>([]);
  const [paymentReceipts, setPaymentReceipts] = useState<{ [stage: string]: any }>({});
  const [isUploadingAgreement, setIsUploadingAgreement] = useState(false);
  const [uploadingReceiptStage, setUploadingReceiptStage] = useState<string | null>(null);

  const agreementFileInputRef = useRef<HTMLInputElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const targetReceiptStageRef = useRef<string | null>(null);

  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const loadClientDocuments = async (clientId: string, clientNo?: any, clientName?: string) => {
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

      // 2. List Invoices from both unified Clients folder and legacy Finance folder
      const [uInvoicesRes, lInvoicesRes] = await Promise.all([
        supabase.storage.from('company_drive').list(`Clients/${clientFolder}/Invoices`, { limit: 100 }),
        supabase.storage.from('company_drive').list(`Finance/billing_documents/Invoices/${clientFolder}`, { limit: 100 })
      ]);

      // 3. List Official Receipts from both unified Clients folder and legacy Finance folder
      const [uReceiptsRes, lReceiptsRes] = await Promise.all([
        supabase.storage.from('company_drive').list(`Clients/${clientFolder}/Receipts`, { limit: 100 }),
        supabase.storage.from('company_drive').list(`Finance/billing_documents/Receipts/${clientFolder}`, { limit: 100 })
      ]);

      // 4. List Agreements from unified Clients folder
      const { data: storageAgreements } = await supabase.storage
        .from('company_drive')
        .list(`Clients/${clientFolder}/Agreements`, { limit: 100 });

      // 5. List Client Installment Payment Receipts
      const { data: storagePayments } = await supabase.storage
        .from('company_drive')
        .list(`Clients/${clientFolder}/Payments`, { limit: 100 });

      // Build unified invoices list (deduplicating by filename / ref_number)
      const invoicesMap = new Map();
      const processInvoice = (file: any, folderPrefix: string) => {
        if (!file || file.name === '.keep') return;
        const refNumber = file.name.replace('.pdf', '');
        const dbRec = dbMap.get(refNumber);
        const filePath = `${folderPrefix}/${file.name}`;
        const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(filePath);

        invoicesMap.set(refNumber, {
          id: dbRec?.id || file.id || refNumber,
          document_type: 'invoice',
          ref_number: refNumber,
          amount: dbRec?.amount || 0,
          created_at: file.created_at || dbRec?.created_at || new Date().toISOString(),
          drive_url: publicUrlData?.publicUrl || dbRec?.drive_url || '',
          filePath
        });
      };

      if (uInvoicesRes.data) uInvoicesRes.data.forEach(f => processInvoice(f, `Clients/${clientFolder}/Invoices`));
      if (lInvoicesRes.data) lInvoicesRes.data.forEach(f => {
        const refNumber = f.name.replace('.pdf', '');
        if (!invoicesMap.has(refNumber)) {
          processInvoice(f, `Finance/billing_documents/Invoices/${clientFolder}`);
        }
      });

      // Build unified official receipts list (deduplicating by filename / ref_number)
      const receiptsMap = new Map();
      const processReceipt = (file: any, folderPrefix: string) => {
        if (!file || file.name === '.keep') return;
        const refNumber = file.name.replace('.pdf', '');
        const dbRec = dbMap.get(refNumber);
        const filePath = `${folderPrefix}/${file.name}`;
        const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(filePath);

        receiptsMap.set(refNumber, {
          id: dbRec?.id || file.id || refNumber,
          document_type: 'receipt',
          ref_number: refNumber,
          amount: dbRec?.amount || 0,
          created_at: file.created_at || dbRec?.created_at || new Date().toISOString(),
          drive_url: publicUrlData?.publicUrl || dbRec?.drive_url || '',
          filePath
        });
      };

      if (uReceiptsRes.data) uReceiptsRes.data.forEach(f => processReceipt(f, `Clients/${clientFolder}/Receipts`));
      if (lReceiptsRes.data) lReceiptsRes.data.forEach(f => {
        const refNumber = f.name.replace('.pdf', '');
        if (!receiptsMap.has(refNumber)) {
          processReceipt(f, `Finance/billing_documents/Receipts/${clientFolder}`);
        }
      });

      setBillingRecords([...Array.from(invoicesMap.values()), ...Array.from(receiptsMap.values())]);

      // Process Agreements
      const loadedAgreements: any[] = [];
      if (storageAgreements) {
        storageAgreements.forEach(f => {
          if (f.name === '.keep') return;
          const filePath = `Clients/${clientFolder}/Agreements/${f.name}`;
          const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(filePath);
          loadedAgreements.push({
            id: f.id || f.name,
            name: f.name,
            created_at: f.created_at || new Date().toISOString(),
            size: f.metadata?.size || 0,
            drive_url: publicUrlData?.publicUrl || filePath,
            filePath
          });
        });
      }
      // If DB has agreement_url and not in storage list, include it
      if (viewingClient?.agreement_url && loadedAgreements.length === 0) {
        loadedAgreements.push({
          id: 'db-agreement',
          name: viewingClient.agreement_name || 'Agreement_Form.pdf',
          created_at: viewingClient.agreement_date || new Date().toISOString(),
          size: 0,
          drive_url: viewingClient.agreement_url,
          filePath: viewingClient.agreement_url
        });
      }
      setAgreementFiles(loadedAgreements);

      // Process Client Installment Payment Receipts
      const loadedPaymentsMap: { [stage: string]: any } = {};
      let dbReceipts: Record<string, any> = {};
      if (typeof viewingClient?.payment_receipts === 'string') {
        try { dbReceipts = JSON.parse(viewingClient.payment_receipts); } catch {}
      } else if (viewingClient?.payment_receipts && typeof viewingClient.payment_receipts === 'object') {
        dbReceipts = { ...viewingClient.payment_receipts };
      }
      Object.entries(dbReceipts).forEach(([k, v]: [string, any]) => {
        loadedPaymentsMap[k.toLowerCase()] = v;
        loadedPaymentsMap[k] = v;
      });

      let hasOrphanSync = false;
      if (storagePayments) {
        storagePayments.forEach(f => {
          if (!f.name || f.name === '.keep') return;
          const filePath = `Clients/${clientFolder}/Payments/${f.name}`;
          const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(filePath);
          const lower = f.name.toLowerCase();

          // Find which payment stage this matches (e.g. 1st, 2nd, 3rd, etc.)
          const stages = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
          const matchedStage = stages.find(st => lower.includes(st) || lower.includes(`payment_${st.replace(/[^0-9]/g, '')}`));

          if (matchedStage) {
            const receiptItem = {
              id: f.id || f.name,
              fileName: f.name,
              created_at: f.created_at || new Date().toISOString(),
              size: f.metadata?.size || 0,
              drive_url: publicUrlData?.publicUrl || filePath,
              filePath,
              url: publicUrlData?.publicUrl || filePath
            };
            loadedPaymentsMap[matchedStage] = receiptItem;
            loadedPaymentsMap[matchedStage.toLowerCase()] = receiptItem;

            if (!dbReceipts[matchedStage.toLowerCase()] && !dbReceipts[matchedStage]) {
              dbReceipts[matchedStage.toLowerCase()] = receiptItem;
              dbReceipts[matchedStage] = receiptItem;
              hasOrphanSync = true;
            }
          }
        });
      }

      // Auto-sync storage receipts to DB if client has receipts in storage not recorded in DB
      if (hasOrphanSync && clientId && !clientId.startsWith('virtual-')) {
        try {
          await supabase.from('clients').update({
            payment_receipts: dbReceipts
          }).eq('id', clientId);
          setRefreshTrigger(prev => prev + 1);
        } catch (_syncErr) {
          console.warn('Notice auto-syncing storage receipts to database:', _syncErr);
        }
      }

      setPaymentReceipts(loadedPaymentsMap);
    } catch (err) {
      console.error('Error loading client documents:', err);
    }
  };

  const safeDecodeUri = (rawUrl: string): string => {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
      return decodeURIComponent(decodeURIComponent(rawUrl));
    } catch {
      try {
        return decodeURIComponent(rawUrl);
      } catch {
        return rawUrl;
      }
    }
  };

  const handleViewDocument = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    if (!url) return;

    try {
      let bucket = 'company_drive';
      let path = '';

      const decodedUrl = safeDecodeUri(url);

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

      path = path.split('?')[0].split('#')[0].replace(/^\/+/, '');

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

  const handleUploadAgreement = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingClient) return;
    setIsUploadingAgreement(true);
    try {
      const actualNo = viewingClient?.No ?? viewingClient?.NO ?? '';
      const actualName = viewingClient?.NAME ?? '';
      const safeClientName = String(actualName).replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
      const clientNoVal = actualNo !== undefined && actualNo !== null && actualNo !== '' ? actualNo : '0';
      const clientFolder = `${clientNoVal} ${safeClientName}`;

      const ext = file.name.split('.').pop() || 'pdf';
      const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `Agreement_${clientNoVal}_${safeOriginalName}`;
      const filePath = `Clients/${clientFolder}/Agreements/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company_drive')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('company_drive')
        .getPublicUrl(filePath);

      // Gracefully update database record if columns exist
      try {
        await supabase.from('clients').update({
          agreement_url: publicUrlData?.publicUrl || filePath,
          agreement_name: file.name,
          agreement_date: new Date().toLocaleDateString('en-GB')
        }).eq('id', viewingClient.id);
      } catch (_dbErr) {
        console.warn('Could not update agreement fields in clients table (columns may not exist yet):', _dbErr);
      }

      await loadClientDocuments(viewingClient.id, actualNo, actualName);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Error uploading agreement:', err);
      alert('Error uploading agreement: ' + (err.message || err));
    } finally {
      setIsUploadingAgreement(false);
      if (agreementFileInputRef.current) agreementFileInputRef.current.value = '';
    }
  };

  const handleUploadPaymentReceipt = async (e: React.ChangeEvent<HTMLInputElement>, stagePrefix: string) => {
    const file = e.target.files?.[0];
    if (!file || !viewingClient) return;
    setUploadingReceiptStage(stagePrefix);
    try {
      const actualNo = viewingClient?.No ?? viewingClient?.NO ?? '';
      const actualName = viewingClient?.NAME ?? '';
      const safeClientName = String(actualName).replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
      const clientNoVal = actualNo !== undefined && actualNo !== null && actualNo !== '' ? actualNo : '0';
      const clientFolder = `${clientNoVal} ${safeClientName}`;

      const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `Receipt_${stagePrefix}_Payment_${safeOriginalName}`;
      const filePath = `Clients/${clientFolder}/Payments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company_drive')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('company_drive')
        .getPublicUrl(filePath);

      // Gracefully update payment_receipts map in DB if column exists
      try {
        let existingReceipts: Record<string, any> = {};
        if (typeof viewingClient.payment_receipts === 'string') {
          try { existingReceipts = JSON.parse(viewingClient.payment_receipts); } catch {}
        } else if (viewingClient.payment_receipts && typeof viewingClient.payment_receipts === 'object') {
          existingReceipts = { ...viewingClient.payment_receipts };
        }

        const receiptItem = {
          url: publicUrlData?.publicUrl || filePath,
          fileName: file.name,
          filePath,
          uploadedAt: new Date().toISOString()
        };

        const updatedReceipts = {
          ...existingReceipts,
          [stagePrefix.toLowerCase()]: receiptItem,
          [stagePrefix]: receiptItem
        };

        await supabase.from('clients').update({
          payment_receipts: updatedReceipts
        }).eq('id', viewingClient.id);

        setViewingClient((prev: any) => prev ? { ...prev, payment_receipts: updatedReceipts } : prev);
      } catch (_dbErr) {
        console.warn('Could not update payment_receipts in clients table (column may not exist yet):', _dbErr);
      }

      await loadClientDocuments(viewingClient.id, actualNo, actualName);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Error uploading payment receipt:', err);
      alert('Error uploading payment receipt: ' + (err.message || err));
    } finally {
      setUploadingReceiptStage(null);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (filePath: string, docType: 'agreement' | 'payment_receipt') => {
    if (!window.confirm(lang === 'bm' ? 'Adakah anda pasti mahu memadam fail ini?' : 'Are you sure you want to delete this file?')) return;
    try {
      const { error } = await supabase.storage.from('company_drive').remove([filePath]);
      if (error) throw error;

      if (viewingClient?.id) {
        if (docType === 'agreement') {
          await supabase.from('clients').update({
            agreement_url: null,
            agreement_name: null,
            agreement_date: null
          }).eq('id', viewingClient.id);

          setViewingClient((prev: any) => prev ? {
            ...prev,
            agreement_url: null,
            agreement_name: null,
            agreement_date: null
          } : prev);
        } else if (docType === 'payment_receipt') {
          let existingReceipts: Record<string, any> = {};
          if (typeof viewingClient.payment_receipts === 'string') {
            try { existingReceipts = JSON.parse(viewingClient.payment_receipts); } catch {}
          } else if (viewingClient.payment_receipts && typeof viewingClient.payment_receipts === 'object') {
            existingReceipts = { ...viewingClient.payment_receipts };
          }

          Object.keys(existingReceipts).forEach(k => {
            const item = existingReceipts[k];
            if (item?.filePath === filePath || item?.url === filePath || (item?.fileName && filePath.includes(item.fileName))) {
              delete existingReceipts[k];
            }
          });

          await supabase.from('clients').update({
            payment_receipts: existingReceipts
          }).eq('id', viewingClient.id);

          setViewingClient((prev: any) => prev ? { ...prev, payment_receipts: existingReceipts } : prev);
        }

        await loadClientDocuments(viewingClient.id, viewingClient.No ?? viewingClient.NO ?? '', viewingClient.NAME ?? '');
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('Error deleting document:', err);
      alert('Error deleting document: ' + (err.message || err));
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

      const decodedUrl = safeDecodeUri(url);

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

      oldPath = oldPath.split('?')[0].split('#')[0].replace(/^\/+/, '');

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
      } else if (newPathWithUniqueName.includes('Clients/')) {
        trashPath = newPathWithUniqueName.replace('Clients/', 'Clients/Trash/');
      } else {
        trashPath = `Clients/Trash/${newPathWithUniqueName}`;
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
        loadClientDocuments(viewingClient.id, viewingClient.No ?? viewingClient.NO ?? '', viewingClient.NAME ?? '');
      }
    } catch (err: any) {
      console.error('Error deleting billing record:', err);
      alert('Error deleting billing record: ' + (err.message || err));
    }
  };

  useEffect(() => {
    if (viewingClient?.id) {
      loadClientDocuments(viewingClient.id, viewingClient.No ?? viewingClient.NO ?? '', viewingClient.NAME ?? '');
    } else {
      setBillingRecords([]);
      setAgreementFiles([]);
      setPaymentReceipts({});
    }
  }, [viewingClient]);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'standard' | 'expanded' | 'lod' | 'potential'>('standard');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [storageFolders, setStorageFolders] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isIT = isITAdmin || profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
  const canViewClients = isIT || Boolean(permissions?.view_clients || permissions?.edit_clients);
  const canEditClients = isIT || Boolean(permissions?.edit_clients);
  const canEdit = canEditClients;
  const canViewLoD = isIT || Boolean(permissions?.view_lod || permissions?.manage_lod);
  const canManageLoD = isIT || Boolean(permissions?.manage_lod);
  const canViewPotential = isIT || Boolean(permissions?.view_potential_clients || permissions?.manage_potential_clients);
  const canManagePotential = isIT || Boolean(permissions?.manage_potential_clients);
  const canExport = isIT || Boolean(permissions?.export_data);

  const hasAnyClientAccess = canViewClients || canViewLoD || canViewPotential || canEditClients || canManageLoD || canManagePotential;

  // Dynamically adjust viewMode if user lacks permission for the current active tab
  useEffect(() => {
    if (permsLoading) return;
    if (viewMode === 'standard' || viewMode === 'expanded') {
      if (!canViewClients) {
        if (canViewPotential) setViewMode('potential');
        else if (canViewLoD) setViewMode('lod');
      }
    } else if (viewMode === 'lod') {
      if (!canViewLoD) {
        if (canViewPotential) setViewMode('potential');
        else if (canViewClients) setViewMode('standard');
      }
    } else if (viewMode === 'potential') {
      if (!canViewPotential) {
        if (canViewClients) setViewMode('standard');
        else if (canViewLoD) setViewMode('lod');
      }
    }
  }, [permsLoading, canViewClients, canViewLoD, canViewPotential, viewMode]);

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

        const { data: clientFoldersData } = await supabase.storage
          .from('company_drive')
          .list('Clients', { limit: 1000 });

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
        if (clientFoldersData) {
          clientFoldersData.forEach(f => {
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
          }
        }

        const canFetchClients = canViewClients || canViewLoD;

        if (canFetchClients) {
          let query = supabase.from('clients');

          query = query.select('*', { count: 'exact' });

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
    const canAdd = viewMode === 'lod' ? canManageLoD : canEditClients;
    if (!canAdd) {
      alert(lang === 'bm' ? 'Akses ditolak: Anda tidak mempunyai kebenaran untuk menambah klien.' : 'Access denied: You do not have permission to add clients.');
      return;
    }
    setEditingClient(null);
    setPoliceReportsList([{ date: '', no: '' }]);
    setIpList([{ date: '', no: '', pem: '', officer: '' }]);
    setSelectedIpk('');
    setSelectedIpd('');
    setSelectedBalai('');
    setIsCustomIpk(false);
    setIsCustomIpd(false);
    setIsCustomBalai(false);
    setSelectedCaseCategory('Ah Long');
    setIsCustomCaseCategory(false);
    setCustomCaseCategoryVal('');
    setPaymentList([]);
    setIsModalOpen(true);
  };
  const handleOpenEditModal = async (client: any) => {
    const canEditAny = viewMode === 'lod' ? canManageLoD : (canEditClients || canManageLoD);
    if (!canEditAny) {
      alert(lang === 'bm' ? 'Akses ditolak: Anda tidak mempunyai kebenaran untuk mengemas kini maklumat klien.' : 'Access denied: You do not have permission to edit clients.');
      return;
    }
    setEditingClient(client);
    setIsModalOpen(true);
    let currentData = client;
    if (client?.id && !client.isVirtual) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data) {
        currentData = { ...data, _stableKey: client._stableKey };
      }
    }

    // Safely parse payment_receipts
    let currentReceipts: Record<string, any> = {};
    if (typeof currentData?.payment_receipts === 'string') {
      try { currentReceipts = JSON.parse(currentData.payment_receipts); } catch {}
    } else if (currentData?.payment_receipts && typeof currentData.payment_receipts === 'object') {
      currentReceipts = { ...currentData.payment_receipts };
    }

    // Check storage for any previously uploaded receipts not yet registered in payment_receipts
    const actualNo = currentData?.No ?? currentData?.NO ?? '';
    const actualName = currentData?.NAME ?? '';
    const safeClientName = String(actualName).replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
    const clientNoVal = actualNo !== undefined && actualNo !== null && actualNo !== '' ? actualNo : '0';
    const clientFolder = `${clientNoVal} ${safeClientName}`;

    try {
      const { data: storagePayments } = await supabase.storage
        .from('company_drive')
        .list(`Clients/${clientFolder}/Payments`, { limit: 100 });

      if (storagePayments && storagePayments.length > 0) {
        let synced = false;
        const stages = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        storagePayments.forEach(f => {
          if (!f.name || f.name === '.keep') return;
          const lower = f.name.toLowerCase();
          const matchedStage = stages.find(st => lower.includes(st) || lower.includes(`payment_${st.replace(/[^0-9]/g, '')}`));
          if (matchedStage) {
            const stageLower = matchedStage.toLowerCase();
            if (!currentReceipts[stageLower] && !currentReceipts[matchedStage]) {
              const filePath = `Clients/${clientFolder}/Payments/${f.name}`;
              const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(filePath);
              const rObj = {
                id: f.id || f.name,
                fileName: f.name,
                filePath,
                url: publicUrlData?.publicUrl || filePath,
                drive_url: publicUrlData?.publicUrl || filePath,
                uploadedAt: f.created_at || new Date().toISOString()
              };
              currentReceipts[stageLower] = rObj;
              currentReceipts[matchedStage] = rObj;
              synced = true;
            }
          }
        });

        if (synced && currentData?.id && !currentData.isVirtual) {
          try {
            await supabase.from('clients').update({ payment_receipts: currentReceipts }).eq('id', currentData.id);
            setRefreshTrigger(prev => prev + 1);
          } catch (_syncErr) {
            console.warn('Notice syncing storage receipts in edit modal:', _syncErr);
          }
        }
      }
    } catch (_storageErr) {
      console.warn('Notice scanning storage in edit modal:', _storageErr);
    }

    currentData.payment_receipts = currentReceipts;
    setEditingClient(currentData);

    let parsedReports = [];
    if (currentData?.police_report_no && currentData.police_report_no.trim().startsWith('[')) {
      try { parsedReports = JSON.parse(currentData.police_report_no); } catch (e) { }
    } else if (currentData?.police_report_no || currentData?.police_report_date) {
      parsedReports = [{ date: currentData.police_report_date || '', no: currentData.police_report_no || '' }];
    }
    if (parsedReports.length === 0) parsedReports = [{ date: '', no: '' }];
    setPoliceReportsList(parsedReports);

    let parsedIps = [];
    if (currentData?.ip_no && currentData.ip_no.trim().startsWith('[')) {
      try { parsedIps = JSON.parse(currentData.ip_no); } catch (e) { }
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

    const currentCat = currentData?.['CASE CATEGORY'] || '';
    if (currentCat && currentCat !== '-') {
      registerNewCategory(currentCat);
      setSelectedCaseCategory(currentCat);
    } else {
      setSelectedCaseCategory('Ah Long');
    }
    setIsCustomCaseCategory(false);
    setCustomCaseCategoryVal('');

    const payments = [];
    for (let i = 1; i <= 10; i++) {
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
    const isIT = isITAdmin || profile?.department?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it' || profile?.role?.toLowerCase() === 'it admin';
    const canExport = isIT || Boolean(permissions?.export_data);
    if (!canExport) {
      alert(lang === 'bm' ? 'Akses ditolak: Anda tidak mempunyai kebenaran untuk mengeksport data.' : 'Access denied: You do not have permission to export data.');
      return [];
    }
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
    const canSave = isIT || canEditClients || canManageLoD;
    if (!canSave) {
      alert(lang === 'bm' ? 'Akses ditolak: Anda tidak mempunyai kebenaran untuk menyimpan maklumat klien.' : 'Access denied: You do not have permission to save client data.');
      return;
    }
    setIsSaving(true);

    try {
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

      let autoTotalPaid = 0;
      for (let i = 0; i < 10; i++) {
        autoTotalPaid += parseSafeAmount(data[`payment_amt_${i}`]);
      }
      const pkg = parseSafeAmount(data['PACKAGE (RM)']);
      const autoPending = Math.max(0, pkg - autoTotalPaid);

      const getPaymentValue = (val: any) => {
        if (val === undefined || val === null || String(val).trim() === '') return null;
        return parseSafeAmount(val);
      };

      let rawPhone = sanitizeInput((data['PHONE NUMBER'] as string) || '', 30).trim();
      let formattedPhone = rawPhone;
      if (rawPhone && !rawPhone.startsWith('+')) {
        if (rawPhone.startsWith('60')) formattedPhone = `+${rawPhone}`;
        else if (rawPhone.startsWith('0')) formattedPhone = `+60${rawPhone.slice(1)}`;
        else formattedPhone = `+60${rawPhone}`;
      }

      const clientName = sanitizeInput((data.NAME as string) || '', 100).trim();
      // Basic validation
      if (!clientName) {
        alert(lang === 'bm' ? 'Nama klien diperlukan.' : 'Client name is required.');
        setIsSaving(false);
        return;
      }

      // Installment dependency validation
      for (let i = 0; i < 10; i++) {
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

      const clientPayload = {
        No: data.No ? parseInt(data.No as string, 10) : null,
        NAME: clientName,
        'IC NUMBER': sanitizeInput((data['IC NUMBER'] as string) || '', 20),
        'PHONE NUMBER': formattedPhone,
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
        '7th PAYMENT': getPaymentValue(data['payment_amt_6']),
        '7th PAYMENT DATE': sanitizeInput((data['payment_date_6'] as string) || '', 20),
        '8th PAYMENT': getPaymentValue(data['payment_amt_7']),
        '8th PAYMENT DATE': sanitizeInput((data['payment_date_7'] as string) || '', 20),
        '9th PAYMENT': getPaymentValue(data['payment_amt_8']),
        '9th PAYMENT DATE': sanitizeInput((data['payment_date_8'] as string) || '', 20),
        '10th PAYMENT': getPaymentValue(data['payment_amt_9']),
        '10th PAYMENT DATE': sanitizeInput((data['payment_date_9'] as string) || '', 20),
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

      let savedClientId = editingClient?.id;
      if (editingClient && !editingClient.isVirtual) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', editingClient.id);
        if (error) throw error;
        await writeAuditLog('UPDATE', editingClient.id, clientPayload);
      } else {
        const { data: insertedData, error } = await supabase.from('clients').insert([clientPayload]).select('id').single();
        if (error) throw error;
        if (insertedData) savedClientId = insertedData.id;
      }

      // Process file uploads from the form into unified Client folder: Clients/{clientFolder}/...
      try {
        const safeClientName = clientName.replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
        const clientNoVal = (data.No ? String(data.No) : '') || (editingClient?.No ?? editingClient?.NO ?? '0');
        const clientFolder = `${clientNoVal} ${safeClientName}`;
        const formElement = e.target as HTMLFormElement;

        // 1. Agreement file upload
        const agreementInput = formElement.querySelector('input[name="agreement_file"]') as HTMLInputElement;
        if (agreementInput?.files?.[0]) {
          const agFile = agreementInput.files[0];
          const safeOriginalName = agFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const agFileName = `Agreement_${clientNoVal}_${safeOriginalName}`;
          const agPath = `Clients/${clientFolder}/Agreements/${agFileName}`;
          const { error: agErr } = await supabase.storage.from('company_drive').upload(agPath, agFile, { upsert: true });
          if (agErr) {
            console.error('Agreement upload error:', agErr);
          } else {
            const { data: agUrlData } = supabase.storage.from('company_drive').getPublicUrl(agPath);
            if (savedClientId) {
              try {
                await supabase.from('clients').update({
                  agreement_url: agUrlData?.publicUrl || agPath,
                  agreement_name: agFile.name,
                  agreement_date: new Date().toLocaleDateString('en-GB')
                }).eq('id', savedClientId);
              } catch (_e) {}
            }
          }
        }

        // 2. Installment payment receipts
        let updatedReceiptsMap: Record<string, any> = {};
        if (typeof editingClient?.payment_receipts === 'string') {
          try {
            updatedReceiptsMap = JSON.parse(editingClient.payment_receipts);
          } catch {}
        } else if (editingClient?.payment_receipts && typeof editingClient.payment_receipts === 'object') {
          updatedReceiptsMap = { ...editingClient.payment_receipts };
        }

        let hasNewReceiptUpload = false;

        for (let i = 0; i < 10; i++) {
          const pInput = formElement.querySelector(`input[name="payment_receipt_file_${i}"]`) as HTMLInputElement;
          if (pInput?.files?.[0]) {
            const rFile = pInput.files[0];
            const prefix = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
            const safeOriginalName = rFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const rFileName = `Receipt_${prefix}_Payment_${safeOriginalName}`;
            const rPath = `Clients/${clientFolder}/Payments/${rFileName}`;
            const { error: rUploadError } = await supabase.storage.from('company_drive').upload(rPath, rFile, { upsert: true });

            if (rUploadError) {
              console.error(`Error uploading receipt for ${prefix} payment:`, rUploadError);
            } else {
              const { data: publicUrlData } = supabase.storage.from('company_drive').getPublicUrl(rPath);
              const receiptInfo = {
                url: publicUrlData?.publicUrl || rPath,
                drive_url: publicUrlData?.publicUrl || rPath,
                filePath: rPath,
                fileName: rFile.name,
                uploadedAt: new Date().toISOString()
              };
              updatedReceiptsMap[prefix.toLowerCase()] = receiptInfo;
              updatedReceiptsMap[prefix] = receiptInfo;
              hasNewReceiptUpload = true;
            }
          }
        }

        if (hasNewReceiptUpload && savedClientId) {
          try {
            await supabase.from('clients').update({
              payment_receipts: updatedReceiptsMap
            }).eq('id', savedClientId);
          } catch (recErr) {
            console.warn('Could not update payment_receipts in clients table:', recErr);
          }
        }
      } catch (uploadErr) {
        console.warn('Non-critical file upload notice in save client:', uploadErr);
      }

      setRefreshTrigger(prev => prev + 1);
      handleCloseModal();
    } catch (err: any) {
      console.error('Failed to save client:', err);
      alert(t('clients', 'failedToSave', lang) + (err?.message ? `: ${err.message}` : ''));
    } finally {
      setIsSaving(false);
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

  if (!permsLoading && !hasAnyClientAccess) {
    return (
      <PermissionDenied
        title={lang === 'bm' ? 'Akses Pangkalan Data Klien Terhad' : 'Client Database Access Restricted'}
        message={lang === 'bm'
          ? 'Akaun anda tidak mempunyai kebenaran untuk melihat modul klien atau sub-halamannya. Sila hubungi Pentadbir Sistem untuk memohon akses.'
          : 'Your account does not have permission to view the client module or any of its sections. Please contact your System Administrator to request access.'}
      />
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
            {canEditClients || canManageLoD || canManagePotential ? t('clients', 'manageSubtitle', lang) : t('clients', 'viewSubtitle', lang)}
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
            canEdit={canEditClients}
            canViewClients={canViewClients}
            canViewLoD={canViewLoD}
            canManageLoD={canManageLoD}
            canViewPotential={canViewPotential}
            canManagePotential={canManagePotential}
            canExport={canExport}
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
            onClientConverted={() => setRefreshTrigger(prev => prev + 1)}
          />
        </div>

        {/* ==============================================
          1. VIEW CLIENT DETAILS MODAL
          ============================================== */}
        {isViewModalOpen && viewingClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-6xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh]">

              <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                    {t('clients', 'clientCaseProfile', lang)}
                  </h2>
                  {(() => {
                    const actualNo = viewingClient?.No ?? viewingClient?.NO ?? '0';
                    const actualName = viewingClient?.NAME ?? '';
                    const safeClientName = String(actualName).replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
                    const clientFolder = `${actualNo} ${safeClientName}`;
                    return (
                      <a
                        href={`/portal/pemacu?path=Clients/${encodeURIComponent(clientFolder)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-indigo-600 dark:hover:text-yellow-400 transition-colors shadow-sm"
                        title={t('clients', 'clientDriveTooltip', lang)}
                      >
                        <span>📂</span>
                        <span className="hidden sm:inline">{t('clients', 'openInDrive', lang)}</span>
                      </a>
                    );
                  })()}
                </div>
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
                          try { parsedReports = JSON.parse(viewingClient.police_report_no); } catch (e) { }
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
                        try { parsedIps = JSON.parse(viewingClient.ip_no); } catch (e) { }
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

                {/* 4. Borang Perjanjian Klien (Agreement Form) */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <SectionHeader
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      }
                      title={t('clients', 'agreementForm', lang)}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={agreementFileInputRef}
                        onChange={handleUploadAgreement}
                        accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                        className="hidden"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => agreementFileInputRef.current?.click()}
                          disabled={isUploadingAgreement}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isUploadingAgreement ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              <span>{lang === 'bm' ? 'Memuat naik...' : 'Uploading...'}</span>
                            </>
                          ) : (
                            <>
                              <span>📄</span>
                              <span>{agreementFiles.length > 0 ? t('clients', 'replaceAgreement', lang) : t('clients', 'uploadAgreement', lang)}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {agreementFiles.length === 0 ? (
                    <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 mt-0.5">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {t('clients', 'noAgreementYet', lang)}
                          </h4>
                          <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                            {t('clients', 'agreementSubtitle', lang)}
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => agreementFileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                        >
                          + {t('clients', 'uploadAgreement', lang)}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {agreementFiles.map((file, idx) => (
                        <div key={file.id || idx} className="bg-white dark:bg-gray-900 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl p-3.5 shadow-sm flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                              <span className="text-lg">📜</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  {lang === 'bm' ? 'Perjanjian Rasmi' : 'Official Agreement'}
                                </span>
                              </div>
                              <p className="font-semibold text-xs text-slate-900 dark:text-white truncate mt-0.5" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                                {new Date(file.created_at).toLocaleDateString()} &middot; {file.size ? (file.size > 1024*1024 ? `${(file.size/(1024*1024)).toFixed(1)} MB` : `${Math.round(file.size/1024)} KB`) : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={(e) => handleViewDocument(e, file.drive_url || file.filePath)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              {t('clients', 'viewDoc', lang)}
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteDocument(file.filePath, 'agreement')}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title={lang === 'bm' ? 'Padam Perjanjian' : 'Delete Agreement'}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

                {/* Installment Payment Schedule & Client Receipts */}
                {(() => {
                  const paymentIndices = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
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
                      <div className="flex justify-between items-center mb-4">
                        <SectionHeader
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          }
                          title={t('clients', 'paymentSchedule', lang)}
                        />
                        <input
                          type="file"
                          ref={receiptFileInputRef}
                          onChange={(e) => {
                            if (targetReceiptStageRef.current) {
                              handleUploadPaymentReceipt(e, targetReceiptStageRef.current);
                            }
                          }}
                          accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                          className="hidden"
                        />
                      </div>
                      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800/80 rounded-xl p-4 shadow-sm divide-y divide-slate-100 dark:divide-gray-800">
                        {payments.map(p => {
                          const ordinalLabel = lang === 'bm'
                            ? `Bayaran Ke-${p.prefix.replace(/[^0-9]/g, '')}`
                            : `${p.prefix} Payment`;
                          const formattedAmt = String(p.amount).startsWith('RM') ? p.amount : `RM ${p.amount}`;
                          const stageKey = p.prefix.toLowerCase();
                          const receiptFile = paymentReceipts[stageKey] || paymentReceipts[p.prefix];
                          const hasReceipt = Boolean(receiptFile && (receiptFile.drive_url || receiptFile.filePath || receiptFile.url));

                          return (
                            <div key={p.prefix} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 first:pt-0 last:pb-0 gap-2 text-sm font-semibold">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-800 dark:text-white">{ordinalLabel}</span>
                                  {/* Non-annoying receipt status pill */}
                                  {hasReceipt ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                                      <span>📎</span> {t('clients', 'receiptAttached', lang)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40" title={t('clients', 'receiptMissingNotice', lang)}>
                                      <span>⚠️</span> {t('clients', 'noReceipt', lang)}
                                    </span>
                                  )}
                                </div>
                                {p.date && <span className="text-xs text-slate-450 dark:text-zinc-500 font-mono font-medium">{p.date}</span>}
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formattedAmt}</span>

                                {/* Receipt action button */}
                                <div className="flex items-center gap-1.5">
                                  {hasReceipt ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => handleViewDocument(e, receiptFile.drive_url || receiptFile.filePath || receiptFile.url)}
                                        className="h-7 px-2.5 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                      >
                                        <span>👁️</span> {t('clients', 'viewDoc', lang)}
                                      </button>
                                      {canEdit && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            targetReceiptStageRef.current = p.prefix;
                                            receiptFileInputRef.current?.click();
                                          }}
                                          className="h-7 px-2 flex items-center text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-400 text-xs font-semibold transition-colors cursor-pointer"
                                          title={lang === 'bm' ? 'Ganti Resit' : 'Replace Receipt'}
                                        >
                                          🔄
                                        </button>
                                      )}
                                      {canEdit && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteDocument(receiptFile.filePath, 'payment_receipt')}
                                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                          title={lang === 'bm' ? 'Padam Resit' : 'Delete Receipt'}
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          targetReceiptStageRef.current = p.prefix;
                                          receiptFileInputRef.current?.click();
                                        }}
                                        disabled={uploadingReceiptStage === p.prefix}
                                        className="h-7 px-2.5 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                      >
                                        {uploadingReceiptStage === p.prefix ? (
                                          <>
                                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                            <span>...</span>
                                          </>
                                        ) : (
                                          <>
                                            <span>+</span>
                                            <span>{t('clients', 'uploadClientReceipt', lang)}</span>
                                          </>
                                        )}
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
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
                <a
                  href={`/portal/temujanji?action=new&clientType=active&clientId=${viewingClient.id}&clientName=${encodeURIComponent(viewingClient.NAME || '')}&phone=${encodeURIComponent(viewingClient['PHONE NUMBER'] || '')}&ic=${encodeURIComponent(viewingClient['IC NUMBER'] || '')}&category=${encodeURIComponent(viewingClient['CASE CATEGORY'] || '')}`}
                  className="px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center justify-center gap-1.5 min-h-[48px]"
                >
                  <span>📅</span>
                  <span>{lang === 'bm' ? 'Jadualkan Temujanji' : 'Schedule Appointment'}</span>
                </a>
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
                      viewingClient['6TH PAYMENT'] ?? viewingClient['6th PAYMENT'] ?? viewingClient['6th payment'],
                      viewingClient['7TH PAYMENT'] ?? viewingClient['7th PAYMENT'] ?? viewingClient['7th payment'],
                      viewingClient['8TH PAYMENT'] ?? viewingClient['8th PAYMENT'] ?? viewingClient['8th payment'],
                      viewingClient['9TH PAYMENT'] ?? viewingClient['9th PAYMENT'] ?? viewingClient['9th payment'],
                      viewingClient['10TH PAYMENT'] ?? viewingClient['10th PAYMENT'] ?? viewingClient['10th payment']
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

              <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900 flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                  {editingClient ? t('clients', 'editClientRecord', lang) : t('clients', 'addClient', lang)}
                </h2>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveClient} noValidate className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-black">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. Personal Information */}
                    <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'personalInfo', lang)}</h3>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">No</label>
                      <input type="number" name="No" defaultValue={editingClient?.No ?? editingClient?.NO ?? ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
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
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                          {t('clients', 'phoneNumberLabel', lang)}
                        </label>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                          {lang === 'bm' ? 'Lalai: +60 (Boleh diedit untuk luar negara)' : 'Default: +60 (Editable for overseas)'}
                        </span>
                      </div>
                      <input
                        type="text"
                        name="PHONE NUMBER"
                        defaultValue={editingClient?.["PHONE NUMBER"] || '+60 '}
                        placeholder="+60 12-345 6789"
                        className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'emailLabel', lang)}</label>
                      <input type="text" name="EMAIL" defaultValue={editingClient?.EMAIL === '-' ? '' : (editingClient?.EMAIL || '')} placeholder="client@example.com" className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
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
                        setPoliceReportsList([...policeReportsList, { date: '', no: '' }]);
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
                        setIpList([...ipList, { date: '', no: '', pem: '', officer: '' }]);
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

                  {/* 4. Borang Perjanjian Klien (Agreement Form) */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{t('clients', 'agreementForm', lang)}</h3>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">{t('clients', 'agreementSubtitle', lang)}</span>
                  </div>
                  <div className="sm:col-span-2 space-y-2 bg-slate-50 dark:bg-gray-800/30 p-4 rounded-xl border border-slate-100 dark:border-gray-800">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                      {lang === 'bm' ? 'Muat Naik Salinan Borang Perjanjian Fizikal (PDF / Gambar)' : 'Upload Physical Agreement Scanned Copy (PDF / Image)'}
                    </label>
                    <input
                      type="file"
                      name="agreement_file"
                      accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                      className="w-full text-xs text-slate-500 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-zinc-800 dark:file:text-yellow-400 cursor-pointer"
                    />
                    {editingClient?.agreement_url && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
                        <span>✓</span> {lang === 'bm' ? 'Perjanjian telah dimuat naik sebelum ini (pilih fail baru jika mahu menggantikannya).' : 'Agreement previously uploaded (choose a new file to replace).'}
                      </p>
                    )}
                  </div>

                  {/* 5. Financial Details */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{lang === 'bm' ? 'Maklumat Kewangan & Pakej' : 'Financial & Package Details'}</h3>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'servicePackage', lang)} (RM)</label>
                    <input type="number" name="PACKAGE (RM)" step="any" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} onChange={handleFinancialChange} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'totalPaidReceived', lang)} (RM)</label>
                    <input type="number" name="TOTAL PAID (RM)" step="any" readOnly defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none min-h-[48px] cursor-not-allowed opacity-80" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">{t('clients', 'pendingBalance', lang)} (RM)</label>
                    <input type="number" name="PENDING (RM)" step="any" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Invoice Ref No</label>
                    <input type="text" name="Invoice Ref No" defaultValue={editingClient?.["Invoice Ref No"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                  </div>

                  {/* Dynamic payments Scheduler */}
                  <div className="sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mt-4 mb-1 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">{lang === 'bm' ? 'Jadual Ansuran Pembayaran' : 'Installment Payment Schedule'}</h4>
                    {paymentList.length < 10 && (
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
                        className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors cursor-pointer"
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
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-500/40 transition-colors cursor-pointer"
                      >
                        ×
                      </button>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                          {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`} Payment
                        </label>
                        <input type="number" name={`payment_amt_${idx}`} step="any" defaultValue={pay.amount} onChange={handleFinancialChange} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                      </div>
                      <DateInput
                        name={`payment_date_${idx}`}
                        label={lang === 'bm' ? `Tarikh Bayaran ${idx + 1} (DD/MM/YYYY)` : `Payment Date ${idx + 1} (DD/MM/YYYY)`}
                        defaultValue={pay.date}
                        lang={lang}
                      />
                      <div className="sm:col-span-2 space-y-1 mt-1 pt-2 border-t border-slate-200/60 dark:border-gray-700/50">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
                          {lang === 'bm' ? `Resit / Slip Bayaran Klien (Ansuran Ke-${idx + 1})` : `Client Receipt / Bank Slip (${idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`} Payment)`}
                        </label>
                        <input
                          type="file"
                          name={`payment_receipt_file_${idx}`}
                          accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                          className="w-full text-xs text-slate-500 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-200 dark:file:bg-zinc-700 file:text-slate-700 dark:file:text-zinc-200 cursor-pointer"
                        />
                        {(() => {
                          const prefix = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`;
                          let rMap: any = {};
                          if (typeof editingClient?.payment_receipts === 'string') {
                            try { rMap = JSON.parse(editingClient.payment_receipts); } catch {}
                          } else if (editingClient?.payment_receipts && typeof editingClient.payment_receipts === 'object') {
                            rMap = editingClient.payment_receipts;
                          }
                          const existing = rMap[prefix.toLowerCase()] || rMap[prefix];
                          if (!existing) return null;
                          const rUrl = existing.url || existing.drive_url || existing.filePath;
                          return (
                            <div className="flex items-center justify-between text-[11px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 mt-1.5">
                              <span className="flex items-center gap-1.5 truncate">
                                <span>📎</span>
                                <span className="font-semibold">{existing.fileName || (lang === 'bm' ? 'Resit telah dilampirkan' : 'Receipt uploaded')}</span>
                                <span className="text-slate-400 dark:text-zinc-500">({lang === 'bm' ? 'pilih fail baru untuk ganti' : 'choose new file to replace'})</span>
                              </span>
                              {rUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => handleViewDocument(e, rUrl)}
                                  className="text-emerald-700 dark:text-emerald-300 font-bold hover:underline ml-2 flex-shrink-0 cursor-pointer flex items-center gap-1"
                                >
                                  <span>👁️</span>
                                  <span>{lang === 'bm' ? 'Lihat Resit' : 'View Receipt'}</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
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

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                        {t('clients', 'caseCategoryLabel', lang)}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (isCustomCaseCategory) {
                            setIsCustomCaseCategory(false);
                          } else {
                            setIsCustomCaseCategory(true);
                            setCustomCaseCategoryVal('');
                          }
                        }}
                        className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-500 underline cursor-pointer font-bold"
                      >
                        {isCustomCaseCategory
                          ? (lang === 'bm' ? '↩️ Pilih Senarai' : '↩️ Pick Dropdown')
                          : (lang === 'bm' ? '✏️ + Tambah Kategori Manual' : '✏️ + Add Custom Category')}
                      </button>
                    </div>

                    {isCustomCaseCategory ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          name="CASE CATEGORY"
                          value={customCaseCategoryVal}
                          onChange={(e) => setCustomCaseCategoryVal(e.target.value)}
                          onBlur={() => {
                            if (customCaseCategoryVal.trim()) {
                              registerNewCategory(customCaseCategoryVal);
                            }
                          }}
                          placeholder={lang === 'bm' ? 'Masukkan Kategori Kes Baru (cth: Scam Victim / E-Wallet)' : 'Enter New Case Category (e.g. Scam Victim / E-Wallet)'}
                          className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customCaseCategoryVal.trim()) {
                              registerNewCategory(customCaseCategoryVal);
                              setSelectedCaseCategory(customCaseCategoryVal.trim());
                              setIsCustomCaseCategory(false);
                            }
                          }}
                          className="px-3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:text-black font-bold text-xs rounded-xl flex-shrink-0 transition-colors cursor-pointer min-h-[48px]"
                          title={lang === 'bm' ? 'Daftar Kategori' : 'Register Category'}
                        >
                          + Add
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          name="CASE CATEGORY"
                          value={selectedCaseCategory}
                          onChange={(e) => {
                            if (e.target.value === '__ADD_CUSTOM__') {
                              setIsCustomCaseCategory(true);
                              setCustomCaseCategoryVal('');
                            } else {
                              setSelectedCaseCategory(e.target.value);
                            }
                          }}
                          className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer appearance-none"
                        >
                          {registeredCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__ADD_CUSTOM__" className="font-bold text-indigo-600 dark:text-yellow-500">
                            {lang === 'bm' ? '+ Add' : '+ Add'}
                          </option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-zinc-550 flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

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

                  </div>
                </div>

                {/* Sticky Modal Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900 flex flex-col sm:flex-row justify-between items-center gap-3 flex-shrink-0">
                  <div className="w-full sm:w-auto">
                    {editingClient && (['CEO', 'CFO', 'IT Admin'].includes(profile?.role) || profile?.role?.toLowerCase() === 'it admin' || profile?.role?.toLowerCase() === 'it' || profile?.department?.toLowerCase() === 'it' || permissions?.manage_access_control) && (
                      <button
                        type="button"
                        onClick={handleDeleteClient}
                        className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/15 dark:text-rose-400 dark:hover:bg-rose-900/30 border border-rose-200/50 dark:border-rose-950/20 transition-all w-full sm:w-auto min-h-[44px]"
                      >
                        {t('clients', 'deleteClient', lang)}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-gray-700 transition-colors w-full sm:w-auto min-h-[44px]"
                    >
                      {t('clients', 'cancel', lang)}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-6 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-yellow-500 dark:text-black border-0 dark:hover:bg-yellow-400 transition-colors shadow-sm w-full sm:w-auto min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>{t('clients', 'saving', lang)}</span>
                        </>
                      ) : (
                        <span>{t('clients', 'saveChanges', lang)}</span>
                      )}
                    </button>
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