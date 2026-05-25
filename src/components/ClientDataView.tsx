import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ClientTable from './dashboard/ClientTable';

export default function ClientDataView() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [dbClients, setDbClients] = useState<any[]>([]);

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

        // Determine who can fetch the data
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-teal-600 dark:text-yellow-500 font-bold animate-pulse text-lg md:text-xl tracking-widest uppercase text-center">
          Loading Client Database...
        </div>
      </div>
    );
  }

  // Define exact permissions
  const canEdit = ['Chairman', 'CEO', 'COO', 'CFO', 'General Manager', 'IT Admin'].includes(profile?.role);
  const canView = canEdit || ['Intern', 'Contract'].includes(profile?.role);

  // Failsafe: If somehow a totally unregistered role gets here, block them
  if (!canView) {
    return (
      <div className="space-y-4 md:space-y-6 animate-page-transition pt-12 md:pt-0">
        <div className="p-8 md:p-12 rounded-xl bg-white dark:bg-gray-900/50 border border-red-200 dark:border-red-900/50 shadow-lg text-center mt-12">
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-widest text-red-600 dark:text-red-500 mb-2">
            Akses Ditolak
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Akaun anda ({profile?.role}) tidak mempunyai kebenaran untuk mengakses Pangkalan Data Klien.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-page-transition pt-12 md:pt-0 overflow-x-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-teal-900 dark:text-white">
          Client Database
        </h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">
          {canEdit 
            ? "Urus dan edit maklumat pangkalan data klien." 
            : "Papar maklumat pangkalan data klien (Akses Edit Ditolak)."}
        </p>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        {/* We pass `canEdit` down. The ClientTable will naturally hide edit/add buttons if false! */}
        <ClientTable clients={dbClients} canEdit={canEdit} />
      </div>
    </div>
  );
}