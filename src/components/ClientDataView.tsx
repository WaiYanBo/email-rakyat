import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';
import { sanitizeInput, parseSafeAmount } from '../utils/security';
import { BillingGenerator } from './dashboard/BillingGenerator';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { ErrorBoundary } from './ErrorBoundary';

export default function ClientDataView() {
  const [loading, setLoading] = useState(true);
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
  const [viewMode, setViewMode] = useState<'standard' | 'expanded'>('standard');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [storageFolders, setStorageFolders] = useState<string[]>([]);

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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = '/portal/login';
          return;
        }

        let currentProfile = profile;
        if (!currentProfile) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select(`full_name, department, roles ( role_name ), role_id`)
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
             const yearStr = String(now.getFullYear()).slice(-2);
             const monthStr = String(now.getMonth() + 1).padStart(2, '0');

             if (dateFilter === 'year') {
                query = query.like('DATE', `%/${yearStr}`);
             } else if (dateFilter === 'month') {
                query = query.like('DATE', `%/${monthStr}/${yearStr}`);
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
  }, [permissions, searchQuery, dateFilter, viewMode, storageFolders]);

  const handleOpenAddModal = () => { setEditingClient(null); setIsModalOpen(true); };
  const handleOpenEditModal = async (client: any) => {
    setEditingClient(client);
    setIsModalOpen(true);
    if (client?.id && !client.isVirtual) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data) setEditingClient({ ...data, _stableKey: client._stableKey });
    }
  };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingClient(null); };

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

    setLoading(true);
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
          setLoading(false);
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
      window.location.reload();
    } catch (err) {
      console.error('Error deleting client:', err);
      alert(lang === 'bm' ? 'Ralat semasa memadam klien. Sila cuba lagi.' : 'Error deleting client. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    // ── Sanitize every field before touching the database ────────────────────
    const allowedStatuses = ['PENDING', 'COMPLETED', 'DROPPED', 'KIV'];
    const rawStatus = (data['CASE STATUS'] as string) || 'PENDING';

    const clientPayload = {
      No: data.No ? parseInt(data.No as string, 10) : null,
      NAME: sanitizeInput((data.NAME as string) || '', 100),
      'IC NUMBER': sanitizeInput((data['IC NUMBER'] as string) || '', 20),
      'PHONE NUMBER': sanitizeInput((data['PHONE NUMBER'] as string) || '', 20),
      DATE: sanitizeInput((data.DATE as string) || '', 20),
      'CASE CATEGORY': sanitizeInput((data['CASE CATEGORY'] as string) || '', 100),
      // Whitelist-based: only accept known status values
      'CASE STATUS': allowedStatuses.includes(rawStatus) ? rawStatus : 'PENDING',
      'TOTAL PAID (RM)': parseSafeAmount(data['TOTAL PAID (RM)']),
      'PENDING (RM)': parseSafeAmount(data['PENDING (RM)']),
      'PACKAGE (RM)': parseSafeAmount(data['PACKAGE (RM)']),
      ADDRESS: sanitizeInput((data.ADDRESS as string) || '', 500),
      EMAIL: sanitizeInput((data.EMAIL as string) || '', 100),
      REMARK: sanitizeInput((data.REMARK as string) || '', 1000),
      '1st PAYMENT': parseSafeAmount(data['1st PAYMENT']),
      '1st PAYMENT DATE': sanitizeInput((data['1st PAYMENT DATE'] as string) || '', 20),
      '2nd PAYMENT': parseSafeAmount(data['2nd PAYMENT']),
      '2nd PAYMENT DATE': sanitizeInput((data['2nd PAYMENT DATE'] as string) || '', 20),
      '3rd PAYMENT': parseSafeAmount(data['3rd PAYMENT']),
      '3rd PAYMENT DATE': sanitizeInput((data['3rd PAYMENT DATE'] as string) || '', 20),
      '4th PAYMENT': parseSafeAmount(data['4th PAYMENT']),
      '4th PAYMENT DATE': sanitizeInput((data['4th PAYMENT DATE'] as string) || '', 20),
      '5th PAYMENT': parseSafeAmount(data['5th PAYMENT']),
      '5th PAYMENT DATE': sanitizeInput((data['5th PAYMENT DATE'] as string) || '', 20),
      '6th PAYMENT': parseSafeAmount(data['6th PAYMENT']),
      '6th PAYMENT DATE': sanitizeInput((data['6th PAYMENT DATE'] as string) || '', 20),
      'Invoice Ref No': sanitizeInput((data['Invoice Ref No'] as string) || '', 100),
      'Investigation Paper': sanitizeInput((data['Investigation Paper'] as string) || '', 500),
      'Report': sanitizeInput((data.Report as string) || '', 500),
      'Action Taken by police': sanitizeInput((data['Action Taken by police'] as string) || '', 500),
    };

    // Basic validation
    if (!clientPayload.NAME) {
      alert(lang === 'bm' ? 'Nama klien diperlukan.' : 'Client name is required.');
      setLoading(false);
      return;
    }

    try {
      if (editingClient && !editingClient.isVirtual) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([clientPayload]);
        if (error) throw error;
      }
      window.location.reload();
    } catch (_err) {
      alert(t('clients', 'failedToSave', lang));
    } finally {
      setLoading(false);
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

  const canEdit = permissions?.edit_clients || false;
  const canView = permissions?.view_clients || false;

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
          <div className="bg-white dark:bg-black border border-slate-200 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                {t('clients', 'clientCaseProfile', lang)}
              </h2>
              <button
                onClick={handleCloseViewModal}
                className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-gray-900/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(viewingClient).map(([key, value]) => {
                  if (['id', '_stableKey', 'updated_at'].includes(key)) return null;
                  if (/(1st|2nd|3rd|4th|5th|6th)\s+payment/i.test(key)) return null;

                  return (
                    <div key={key} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">{getLabel(key)}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">
                        {value !== null && value !== '' ? String(value) : <span className="text-slate-400 dark:text-zinc-600 italic font-normal">{t('clients', 'notProvided', lang)}</span>}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* PAYMENTS SECTION */}
              {(() => {
                const paymentIndices = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
                const payments = paymentIndices.map(prefix => {
                  const amountKey = Object.keys(viewingClient).find(k => k.toLowerCase() === `${prefix.toLowerCase()} payment`);
                  const dateKey = Object.keys(viewingClient).find(k => k.toLowerCase() === `${prefix.toLowerCase()} payment date`);
                  
                  const amount = amountKey ? viewingClient[amountKey] : null;
                  const date = dateKey ? viewingClient[dateKey] : null;
                  
                  return { prefix, amount, date };
                }).filter(p => (p.amount !== null && p.amount !== '') || (p.date !== null && p.date !== ''));

                if (payments.length === 0) return null;

                return (
                  <div className="mt-8 border-t border-slate-200 dark:border-gray-800 pt-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">{t('clients', 'paymentSchedule', lang)}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {payments.map(p => (
                         <div key={p.prefix} className="flex w-full bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800/80 shadow-sm overflow-hidden">
                            <div className="flex-1 p-4 border-r border-slate-100 dark:border-gray-800/80 w-1/2">
                               <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">
                                 {lang === 'bm' ? `Amaun Pembayaran Ke-${p.prefix === '1st' ? '1' : p.prefix === '2nd' ? '2' : p.prefix === '3rd' ? '3' : p.prefix === '4th' ? '4' : p.prefix === '5th' ? '5' : '6'}` : `${p.prefix} Payment Amount`}
                               </p>
                               <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 break-words">
                                 {p.amount !== null && p.amount !== '' ? (String(p.amount).startsWith('RM') ? p.amount : `RM ${p.amount}`) : <span className="text-slate-400 italic font-normal text-xs">-</span>}
                               </p>
                            </div>
                            <div className="flex-1 p-4 w-1/2">
                               <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">
                                 {lang === 'bm' ? `Tarikh Pembayaran Ke-${p.prefix === '1st' ? '1' : p.prefix === '2nd' ? '2' : p.prefix === '3rd' ? '3' : p.prefix === '4th' ? '4' : p.prefix === '5th' ? '5' : '6'}` : `${p.prefix} Payment Date`}
                               </p>
                               <p className="text-sm font-semibold text-slate-805 dark:text-white break-words">
                                 {p.date !== null && p.date !== '' ? String(p.date) : <span className="text-slate-400 italic font-normal text-xs">-</span>}
                               </p>
                            </div>
                         </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* BILLING & DOCUMENTS SECTION */}
              <div className="mt-8 border-t border-slate-200 dark:border-gray-800 pt-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('clients', 'billingDocs', lang)}</h3>
                  <button
                    onClick={() => setIsBillingModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    {t('clients', 'generateDoc', lang)}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800 shadow-sm">
                    <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">{t('clients', 'invoices', lang)}</h4>
                    {billingRecords.filter(r => r.document_type === 'invoice').length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-zinc-600 italic">{t('clients', 'noInvoices', lang)}</p>
                    ) : (
                      <ul className="space-y-3">
                        {billingRecords.filter(r => r.document_type === 'invoice').map(record => (
                          <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                              <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(record.created_at).toLocaleDateString()} &middot; ${Number(record.amount).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {record.drive_url ? (
                                <a
                                  href="#"
                                  onClick={(e) => handleViewDocument(e, record.drive_url)}
                                  className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 px-3 py-1.5 rounded-md font-semibold text-xs transition-colors"
                                >
                                  {t('clients', 'viewDoc', lang)}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">Processing...</span>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteBillingRecord(record)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-55 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
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


                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800 shadow-sm">
                    <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">{t('clients', 'receipts', lang)}</h4>
                    {billingRecords.filter(r => r.document_type === 'receipt').length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-zinc-600 italic">{t('clients', 'noReceipts', lang)}</p>
                    ) : (
                      <ul className="space-y-3">
                        {billingRecords.filter(r => r.document_type === 'receipt').map(record => (
                          <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                              <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(record.created_at).toLocaleDateString()} &middot; ${Number(record.amount).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {record.drive_url ? (
                                <a
                                  href="#"
                                  onClick={(e) => handleViewDocument(e, record.drive_url)}
                                  className="text-emerald-600 hover:text-emerald-805 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 dark:text-emerald-400 px-3 py-1.5 rounded-md font-semibold text-xs transition-colors"
                                >
                                  {t('clients', 'viewDoc', lang)}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">Processing...</span>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteBillingRecord(record)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-55 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
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
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-gray-800/80 bg-white dark:bg-black flex justify-end gap-3">
              {canEdit && (
                <button
                  onClick={() => {
                    handleCloseViewModal();
                    handleOpenEditModal(viewingClient);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-808 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[48px]"
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
                className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 rounded-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-black">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2 border-b border-slate-100 dark:border-gray-800 pb-2 mb-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">No</label>
                  <input type="number" name="No" defaultValue={editingClient?.No || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Full Name</label>
                  <input type="text" name="NAME" defaultValue={editingClient?.NAME || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">IC Number</label>
                  <input type="text" name="IC NUMBER" defaultValue={editingClient?.["IC NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Phone Number</label>
                  <input type="text" name="PHONE NUMBER" defaultValue={editingClient?.["PHONE NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Email</label>
                  <input type="email" name="EMAIL" defaultValue={editingClient?.EMAIL || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Address</label>
                  <input type="text" name="ADDRESS" defaultValue={editingClient?.ADDRESS || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Date (DD/MM/YY)</label>
                  <input type="text" name="DATE" defaultValue={editingClient?.DATE || ''} placeholder="DD/MM/YY" className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Category</label>
                  <input type="text" name="CASE CATEGORY" defaultValue={editingClient?.["CASE CATEGORY"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Case Status</label>
                  <select name="CASE STATUS" defaultValue={editingClient?.["CASE STATUS"] || 'PENDING'} className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer">
                    <option value="PENDING">PENDING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DROPPED">DROPPED</option>
                    <option value="KIV">KIV</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Invoice Ref No</label>
                  <input type="text" name="Invoice Ref No" defaultValue={editingClient?.["Invoice Ref No"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>

                <div className="sm:col-span-2 mt-4 pb-2 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Financial Details</h3>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Package Value (RM)</label>
                  <input type="number" name="PACKAGE (RM)" step="0.01" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Total Paid (RM)</label>
                  <input type="number" name="TOTAL PAID (RM)" step="0.01" defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Pending (RM)</label>
                  <input type="number" name="PENDING (RM)" step="0.01" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>

                {/* PAYMENTS */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">1st Payment</label>
                  <input type="number" name="1st PAYMENT" step="0.01" defaultValue={editingClient?.["1st PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">1st Payment Date</label>
                  <input type="text" name="1st PAYMENT DATE" defaultValue={editingClient?.["1st PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">2nd Payment</label>
                  <input type="number" name="2nd PAYMENT" step="0.01" defaultValue={editingClient?.["2nd PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">2nd Payment Date</label>
                  <input type="text" name="2nd PAYMENT DATE" defaultValue={editingClient?.["2nd PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">3rd Payment</label>
                  <input type="number" name="3rd PAYMENT" step="0.01" defaultValue={editingClient?.["3rd PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">3rd Payment Date</label>
                  <input type="text" name="3rd PAYMENT DATE" defaultValue={editingClient?.["3rd PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">4th Payment</label>
                  <input type="number" name="4th PAYMENT" step="0.01" defaultValue={editingClient?.["4th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">4th Payment Date</label>
                  <input type="text" name="4th PAYMENT DATE" defaultValue={editingClient?.["4th PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">5th Payment</label>
                  <input type="number" name="5th PAYMENT" step="0.01" defaultValue={editingClient?.["5th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">5th Payment Date</label>
                  <input type="text" name="5th PAYMENT DATE" defaultValue={editingClient?.["5th PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">6th Payment</label>
                  <input type="number" name="6th PAYMENT" step="0.01" defaultValue={editingClient?.["6th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">6th Payment Date</label>
                  <input type="text" name="6th PAYMENT DATE" defaultValue={editingClient?.["6th PAYMENT DATE"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>

                <div className="sm:col-span-2 mt-4 pb-2 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Additional Notes</h3>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Investigation Paper</label>
                  <input type="text" name="Investigation Paper" defaultValue={editingClient?.["Investigation Paper"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Report</label>
                  <input type="text" name="Report" defaultValue={editingClient?.Report || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Action Taken by police</label>
                  <input type="text" name="Action Taken by police" defaultValue={editingClient?.["Action Taken by police"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Remark</label>
                  <textarea name="REMARK" defaultValue={editingClient?.REMARK || ''} rows={3} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"></textarea>
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-gray-800/80 gap-3">
                <div className="w-full sm:w-auto">
                  {editingClient && ['CEO', 'CFO', 'IT Admin'].includes(profile?.role) && (
                    <button
                      type="button"
                      onClick={handleDeleteClient}
                      className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-955/15 dark:text-rose-400 dark:hover:bg-rose-900/30 border border-rose-200/50 dark:border-rose-950/20 transition-all w-full sm:w-auto min-h-[48px]"
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
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-yellow-500 dark:text-black font-semibold border-0 dark:hover:bg-yellow-400 dark:text-white transition-colors shadow-sm w-full sm:w-auto min-h-[48px] disabled:opacity-50"
                  >
                    {loading ? t('clients', 'saving', lang) : t('clients', 'saveChanges', lang)}
                  </button>
                </div>
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