import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';
import { sanitizeInput, parseSafeAmount } from '../utils/security';
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

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`full_name, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        const roleName = profileData.roles?.role_name || 'No Role';
        setProfile({
          name: profileData.full_name,
          department: profileData.department,
          role: roleName,
        });

        const hasFullAccess = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(roleName);
        const hasViewAccess = ['Intern', 'Contract'].includes(roleName);
        
        if (hasFullAccess || hasViewAccess) {
          const { data: clientsData } = await supabase.from('clients').select('*');
            
          if (clientsData) {
            const safeData = clientsData.map((c, idx) => ({
              ...c,
              _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
            }));
            setDbClients(safeData);
          }
        }
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // --- HANDLERS ---
  const handleOpenAddModal = () => { setEditingClient(null); setIsModalOpen(true); };
  const handleOpenEditModal = (client: any) => { setEditingClient(client); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingClient(null); };

  // New Handlers for the View Detail Box
  const handleOpenViewModal = (client: any) => { setViewingClient(client); setIsViewModalOpen(true); };
  const handleCloseViewModal = () => { setIsViewModalOpen(false); setViewingClient(null); };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-indigo-600 font-semibold animate-pulse text-lg tracking-wide">
          {t('common', 'loading', lang)}
        </div>
      </div>
    );
  }

  const canEdit = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  const canView = canEdit || ['Intern', 'Contract'].includes(profile?.role);

  if (!canView) {
    return (
      <div className="p-8 md:p-12 rounded-2xl bg-white dark:bg-zinc-900/50 border border-rose-200 dark:border-rose-950/20 shadow-sm text-center mt-12">
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
        <ClientTable 
          clients={dbClients} 
          canEdit={canEdit} 
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
          <div className="bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900">
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

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-zinc-900/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(viewingClient).map(([key, value]) => {
                  if (['id', '_stableKey', 'updated_at'].includes(key)) return null;
                  
                  return (
                    <div key={key} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800/80 flex flex-col justify-center shadow-sm">
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-550 uppercase tracking-wider mb-1">{key}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white break-words">
                        {value !== null && value !== '' ? String(value) : <span className="text-slate-400 dark:text-zinc-600 italic font-normal">Not Provided</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex justify-end gap-3">
              {canEdit && (
                <button 
                  onClick={() => {
                    handleCloseViewModal();
                    handleOpenEditModal(viewingClient);
                  }} 
                  className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[48px]"
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

      {/* ==============================================
          2. ADD / EDIT CLIENT MODAL
          ============================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-950 border border-slate-205 dark:border-zinc-800 w-[95%] md:w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900">
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

            <form onSubmit={handleSaveClient} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-zinc-950">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Full Name</label>
                  <input type="text" name="NAME" defaultValue={editingClient?.NAME || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">IC Number</label>
                  <input type="text" name="IC NUMBER" defaultValue={editingClient?.["IC NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Phone Number</label>
                  <input type="text" name="PHONE NUMBER" defaultValue={editingClient?.["PHONE NUMBER"] || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Date (DD/MM/YY)</label>
                  <input type="text" name="DATE" defaultValue={editingClient?.DATE || ''} placeholder="DD/MM/YY" className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Category</label>
                  <input type="text" name="CASE CATEGORY" defaultValue={editingClient?.["CASE CATEGORY"] || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Case Status</label>
                  <select name="CASE STATUS" defaultValue={editingClient?.["CASE STATUS"] || 'PENDING'} className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[48px] cursor-pointer">
                    <option value="PENDING">PENDING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DROPPED">DROPPED</option>
                    <option value="KIV">KIV</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Total Paid (RM)</label>
                  <input type="number" name="TOTAL PAID (RM)" step="0.01" defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Pending (RM)</label>
                  <input type="number" name="PENDING (RM)" step="0.01" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">Package Value (RM)</label>
                  <input type="number" name="PACKAGE (RM)" step="0.01" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full px-4 py-3 bg-white dark:bg-zinc-900/40 border border-slate-205 dark:border-zinc-800 rounded-xl text-sm font-semibold text-slate-905 dark:text-white focus:outline-none focus:border-indigo-500 min-h-[48px]" />
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-zinc-800/80 gap-3">
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
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors w-full sm:w-auto min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className="px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:text-white transition-colors shadow-sm w-full sm:w-auto min-h-[48px] disabled:opacity-50"
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