import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';

export default function ClientDataView() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [dbClients, setDbClients] = useState<any[]>([]);
  
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

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); 

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    const clientPayload = {
      NAME: data.NAME,
      'IC NUMBER': data['IC NUMBER'],
      'PHONE NUMBER': data['PHONE NUMBER'],
      DATE: data.DATE,
      'CASE CATEGORY': data['CASE CATEGORY'],
      'CASE STATUS': data['CASE STATUS'],
      'TOTAL PAID (RM)': data['TOTAL PAID (RM)'],
      'PENDING (RM)': data['PENDING (RM)'],
      'PACKAGE (RM)': data['PACKAGE (RM)'],
    };

    try {
      if (editingClient) {
        const { error } = await supabase.from('clients').update(clientPayload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([clientPayload]);
        if (error) throw error;
      }
      window.location.reload(); 
    } catch (err) {
      console.error("Error saving:", err);
      alert("Failed to save to Supabase. Check your connection.");
    } finally {
      setLoading(false);
      handleCloseModal();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-teal-600 dark:text-yellow-500 font-bold animate-pulse text-lg md:text-xl tracking-widest uppercase text-center">
          Loading Client Database...
        </div>
      </div>
    );
  }

  const canEdit = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  const canView = canEdit || ['Intern', 'Contract'].includes(profile?.role);

  if (!canView) {
    return (
      <div className="p-8 md:p-12 rounded-xl bg-white dark:bg-gray-900/50 border border-red-200 dark:border-red-900/50 shadow-lg text-center mt-12">
        <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-red-600 dark:text-red-500 mb-2">Access Denied</h2>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-page-transition pt-12 md:pt-0 relative">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-teal-900 dark:text-white">
          Client Database
        </h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">
          {canEdit ? "Manage and edit client records." : "View client database records (Read-Only)."}
        </p>
      </div>

      <div className="w-full">
        {/* Pass the new onViewClick prop into the table */}
        <ClientTable 
          clients={dbClients} 
          canEdit={canEdit} 
          onAddClick={handleOpenAddModal} 
          onEditClick={handleOpenEditModal} 
          onViewClick={handleOpenViewModal}
        />
      </div>

      {/* ==============================================
          1. VIEW CLIENT DETAILS MODAL (THE NEW POP UP)
          ============================================== */}
      {isViewModalOpen && viewingClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 w-full max-w-4xl rounded-xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
            
            <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h2 className="text-sm md:text-lg font-black uppercase tracking-widest text-teal-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Client Details
              </h2>
              <button onClick={handleCloseViewModal} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin bg-gray-50/50 dark:bg-gray-900/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4">
                {/* Dynamically render EVERY column from Supabase except system IDs */}
                {Object.entries(viewingClient).map(([key, value]) => {
                  if (['id', '_stableKey', 'updated_at'].includes(key)) return null;
                  
                  return (
                    <div key={key} className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-center">
                      <p className="text-[9px] md:text-xs font-bold text-teal-600 dark:text-yellow-500 uppercase tracking-wider mb-1">{key}</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white break-words">
                        {value !== null && value !== '' ? String(value) : <span className="text-gray-400 italic font-normal">Not Provided</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-3 md:p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex justify-end gap-2 md:gap-3">
              {canEdit && (
                <button 
                  onClick={() => {
                    handleCloseViewModal();
                    handleOpenEditModal(viewingClient);
                  }} 
                  className="px-3 md:px-5 py-2 md:py-2.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition-colors shadow-sm min-h-[40px]"
                >
                  Edit Data
                </button>
              )}
              <button onClick={handleCloseViewModal} className="px-3 md:px-5 py-2 md:py-2.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-black transition-colors shadow-md min-h-[40px]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================
          2. ADD / EDIT CLIENT MODAL (EXISTING)
          ============================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 w-[95%] md:w-full max-w-2xl rounded-xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
            
            <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-950">
              <h2 className="text-xs md:text-sm lg:text-lg font-black uppercase tracking-widest text-teal-900 dark:text-white">
                {editingClient ? 'Edit Client Data' : 'Add New Client'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                <svg className="w-4 md:w-5 h-4 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4 scrollbar-thin">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 lg:gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Full Name</label>
                  <input type="text" name="NAME" defaultValue={editingClient?.NAME || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">IC Number</label>
                  <input type="text" name="IC NUMBER" defaultValue={editingClient?.["IC NUMBER"] || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Phone Number</label>
                  <input type="text" name="PHONE NUMBER" defaultValue={editingClient?.["PHONE NUMBER"] || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Date</label>
                  <input type="text" name="DATE" defaultValue={editingClient?.DATE || ''} placeholder="DD/MM/YY" className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Category</label>
                  <input type="text" name="CASE CATEGORY" defaultValue={editingClient?.["CASE CATEGORY"] || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Status</label>
                  <select name="CASE STATUS" defaultValue={editingClient?.["CASE STATUS"] || 'PENDING'} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]">
                    <option value="PENDING">PENDING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DROPPED">DROPPED</option>
                    <option value="KIV">KIV</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Total Paid (RM)</label>
                  <input type="number" name="TOTAL PAID (RM)" step="0.01" defaultValue={editingClient?.["TOTAL PAID (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Pending (RM)</label>
                  <input type="number" name="PENDING (RM)" step="0.01" defaultValue={editingClient?.["PENDING (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Package (RM)</label>
                  <input type="number" name="PACKAGE (RM)" step="0.01" defaultValue={editingClient?.["PACKAGE (RM)"]?.toString().replace(/[^0-9.]/g, '') || ''} className="w-full p-2 md:p-2.5 bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded text-xs md:text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-teal-500 min-h-[40px]" />
                </div>
              </div>

              <div className="mt-4 md:mt-6 flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                <button type="button" onClick={handleCloseModal} className="px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-full sm:w-auto min-h-[40px]">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-black transition-colors shadow-md w-full sm:w-auto min-h-[40px] disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}