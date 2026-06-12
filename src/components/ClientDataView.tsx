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
  
  // MODAL STATE - ADD & EDIT
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  // MODAL STATE - VIEW (NEW)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<any>(null);

  // BILLING STATE
  const [billingRecords, setBillingRecords] = useState<any[]>([]);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const loadBillingRecords = async (clientId: string) => {
    const { data, error } = await supabase
      .from('billing_records')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setBillingRecords(data);
    }
  };

  useEffect(() => {
    if (viewingClient?.id) {
      loadBillingRecords(viewingClient.id);
    } else {
      setBillingRecords([]);
    }
  }, [viewingClient]);

  // SEARCH AND FILTER STATE
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'standard' | 'expanded'>('standard');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
            query = query.select('id,DATE,NAME,"PHONE NUMBER","IC NUMBER","CASE CATEGORY","TOTAL PAID (RM)","PENDING (RM)","PACKAGE (RM)","CASE STATUS","Investigation Paper",Report,"Action Taken by police"', { count: 'exact' });
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

          query = query.order('id', { ascending: false });

          const from = (currentPage - 1) * 25;
          const to = from + 25 - 1;
          query = query.range(from, to);

          const { data: clientsData, count, error } = await query;
            
          if (clientsData && isMounted) {
            const safeData = clientsData.map((c, idx) => ({
              ...c,
              _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
            }));
            setDbClients(safeData);
            if (count !== null && count !== undefined) {
              setTotalCount(count);
            }
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
  }, [permissions, searchQuery, dateFilter, viewMode, currentPage]);

  // --- HANDLERS ---
  const handleOpenAddModal = () => { setEditingClient(null); setIsModalOpen(true); };
  const handleOpenEditModal = async (client: any) => { 
    setEditingClient(client); 
    setIsModalOpen(true); 
    if (client?.id) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data) setEditingClient({ ...data, _stableKey: client._stableKey });
    }
  };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingClient(null); };

  // New Handlers for the View Detail Box
  const handleOpenViewModal = async (client: any) => { 
    setViewingClient(client); 
    setIsViewModalOpen(true); 
    if (client?.id) {
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

  const handleDeleteClient = async () => {
    if (!editingClient) return;

    if (!window.confirm(lang === 'bm' 
      ? `Adakah anda pasti mahu memadamkan klien "${editingClient.NAME}"?` 
      : `Are you sure you want to delete client "${editingClient.NAME}"?`
    )) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', editingClient.id);

      if (error) {
        alert('Failed to delete client. Please try again.');
      } else {
        await writeAuditLog('DELETE', editingClient.id, {
          NAME: editingClient.NAME,
          'IC NUMBER': editingClient['IC NUMBER'],
          'PHONE NUMBER': editingClient['PHONE NUMBER'],
          'CASE STATUS': editingClient['CASE STATUS']
        });
        handleCloseModal();
        window.location.reload();
      }
    } catch (err) {
      console.error('Error deleting client:', err);
      alert('Error deleting client. Please try again.');
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
      '2nd PAYMENT': parseSafeAmount(data['2nd PAYMENT']),
      '3rd PAYMENT': parseSafeAmount(data['3rd PAYMENT']),
      '4th PAYMENT': parseSafeAmount(data['4th PAYMENT']),
      '5th PAYMENT': parseSafeAmount(data['5th PAYMENT']),
      '6th PAYMENT': parseSafeAmount(data['6th PAYMENT']),
      'Invoice Ref No': sanitizeInput((data['Invoice Ref No'] as string) || '', 100),
      'Investigation Paper': sanitizeInput((data['Investigation Paper'] as string) || '', 500),
      'Report': sanitizeInput((data.Report as string) || '', 500),
      'Action Taken by police': sanitizeInput((data['Action Taken by police'] as string) || '', 500),
    };

    // Basic validation
    if (!clientPayload.NAME) {
      alert('Client name is required.');
      setLoading(false);
      return;
    }

    try {
      if (editingClient) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([clientPayload]);
        if (error) throw error;
      }
      window.location.reload(); 
    } catch (_err) {
      alert('Failed to save. Please check your connection and try again.');
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
          onSearchChange={(q) => { setSearchQuery(q); setCurrentPage(1); }}
          dateFilter={dateFilter}
          onDateFilterChange={(df) => { setDateFilter(df); setCurrentPage(1); }}
          viewMode={viewMode}
          onViewModeChange={(vm) => { setViewMode(vm); setCurrentPage(1); }}
          currentPage={currentPage}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
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
          <div className="bg-white dark:bg-black border border-slate-205 dark:border-gray-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                Client Case Profile
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
                  
                  return (
                    <div key={key} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-800/80 flex flex-col justify-center shadow-sm">
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">{key}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">
                        {value !== null && value !== '' ? String(value) : <span className="text-slate-400 dark:text-zinc-600 italic font-normal">Not Provided</span>}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* BILLING & DOCUMENTS SECTION */}
              <div className="mt-8 border-t border-slate-200 dark:border-gray-800 pt-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Billing & Documents</h3>
                  <button
                    onClick={() => setIsBillingModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Generate Document
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Invoices Column */}
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800 shadow-sm">
                    <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">Invoices</h4>
                    {billingRecords.filter(r => r.document_type === 'invoice').length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-zinc-600 italic">No invoices generated yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {billingRecords.filter(r => r.document_type === 'invoice').map(record => (
                          <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                              <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(record.created_at).toLocaleDateString()} &middot; ${Number(record.amount).toFixed(2)}</p>
                            </div>
                            {record.drive_url ? (
                              <a href={record.drive_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 px-3 py-1.5 rounded-md font-semibold text-xs transition-colors">
                                View
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">Processing...</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Receipts Column */}
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-slate-200 dark:border-gray-800 shadow-sm">
                    <h4 className="font-semibold text-slate-700 dark:text-zinc-300 mb-4 border-b border-slate-100 dark:border-gray-800 pb-2">Receipts</h4>
                    {billingRecords.filter(r => r.document_type === 'receipt').length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-zinc-600 italic">No receipts generated yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {billingRecords.filter(r => r.document_type === 'receipt').map(record => (
                          <li key={record.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-gray-800/50 rounded-lg border border-slate-100 dark:border-gray-800">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white">{record.ref_number}</p>
                              <p className="text-xs text-slate-500 dark:text-zinc-400">{new Date(record.created_at).toLocaleDateString()} &middot; ${Number(record.amount).toFixed(2)}</p>
                            </div>
                            {record.drive_url ? (
                              <a href={record.drive_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 dark:text-emerald-400 px-3 py-1.5 rounded-md font-semibold text-xs transition-colors">
                                View
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">Processing...</span>
                            )}
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
                  className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[48px]"
                >
                  Edit Data
                </button>
              )}
              <button 
                onClick={handleCloseViewModal} 
                className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-900 hover:bg-black text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white transition-colors min-h-[48px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BILLING GENERATOR MODAL */}
      {isBillingModalOpen && viewingClient && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[95vh] flex flex-col">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setIsBillingModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors flex items-center gap-2"
              >
                <span className="text-sm font-semibold">Close</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto rounded-xl shadow-2xl bg-white">
            <BillingGenerator
              clientData={{
                id: viewingClient.id,
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
          <div className="bg-white dark:bg-black border border-slate-205 dark:border-gray-800 w-[95%] md:w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-900">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight">
                {editingClient ? 'Edit Client Record' : 'Add New Client'}
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
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Full Name</label>
                  <input type="text" name="NAME" defaultValue={editingClient?.NAME || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">IC Number</label>
                  <input type="text" name="IC NUMBER" defaultValue={editingClient?.["IC NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Phone Number</label>
                  <input type="text" name="PHONE NUMBER" defaultValue={editingClient?.["PHONE NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Email</label>
                  <input type="email" name="EMAIL" defaultValue={editingClient?.EMAIL || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Address</label>
                  <input type="text" name="ADDRESS" defaultValue={editingClient?.ADDRESS || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Date (DD/MM/YY)</label>
                  <input type="text" name="DATE" defaultValue={editingClient?.DATE || ''} placeholder="DD/MM/YY" className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Category</label>
                  <input type="text" name="CASE CATEGORY" defaultValue={editingClient?.["CASE CATEGORY"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
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
                  <input type="text" name="Invoice Ref No" defaultValue={editingClient?.["Invoice Ref No"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>

                <div className="sm:col-span-2 mt-4 pb-2 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Financial Details</h3>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Package Value (RM)</label>
                  <input type="number" name="PACKAGE (RM)" step="0.01" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Total Paid (RM)</label>
                  <input type="number" name="TOTAL PAID (RM)" step="0.01" defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Pending (RM)</label>
                  <input type="number" name="PENDING (RM)" step="0.01" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">1st Payment</label>
                  <input type="number" name="1st PAYMENT" step="0.01" defaultValue={editingClient?.["1st PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">2nd Payment</label>
                  <input type="number" name="2nd PAYMENT" step="0.01" defaultValue={editingClient?.["2nd PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">3rd Payment</label>
                  <input type="number" name="3rd PAYMENT" step="0.01" defaultValue={editingClient?.["3rd PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">4th Payment</label>
                  <input type="number" name="4th PAYMENT" step="0.01" defaultValue={editingClient?.["4th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">5th Payment</label>
                  <input type="number" name="5th PAYMENT" step="0.01" defaultValue={editingClient?.["5th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">6th Payment</label>
                  <input type="number" name="6th PAYMENT" step="0.01" defaultValue={editingClient?.["6th PAYMENT"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>

                <div className="sm:col-span-2 mt-4 pb-2 border-b border-slate-200 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Additional Notes</h3>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Investigation Paper</label>
                  <input type="text" name="Investigation Paper" defaultValue={editingClient?.["Investigation Paper"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Report</label>
                  <input type="text" name="Report" defaultValue={editingClient?.Report || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Action Taken by police</label>
                  <input type="text" name="Action Taken by police" defaultValue={editingClient?.["Action Taken by police"] || ''} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Remark</label>
                  <textarea name="REMARK" defaultValue={editingClient?.REMARK || ''} rows={3} className="w-full px-4 py-3 bg-white dark:bg-gray-900/40 border border-slate-205 dark:border-gray-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"></textarea>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-gray-800/80 gap-3">
                <div className="w-full sm:w-auto">
                  {editingClient && ['CEO', 'CFO', 'IT Admin'].includes(profile?.role) && (
                    <button 
                      type="button" 
                      onClick={handleDeleteClient} 
                      className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-955/15 dark:text-rose-400 dark:hover:bg-rose-900/30 border border-rose-200/50 dark:border-rose-950/20 transition-all w-full sm:w-auto min-h-[48px]"
                    >
                      Delete Client
                    </button>
                  )}
                </div>
                <div className="flex gap-3 w-full sm:w-auto justify-end">
                  <button 
                    type="button" 
                    onClick={handleCloseModal} 
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-gray-700 transition-colors w-full sm:w-auto min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-yellow-500 dark:text-black font-semibold border-0 dark:hover:bg-yellow-400 dark:text-white transition-colors shadow-sm w-full sm:w-auto min-h-[48px] disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
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