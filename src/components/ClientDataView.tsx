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

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select(`full_name, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile({
          name: profileData.full_name,
          department: profileData.department,
          role: profileData.roles?.role_name || 'No Role',
        });
      }

      // Load clients
      const { data: clientsData } = await supabase.from('clients').select('*');
        
      if (clientsData) {
        const safeData = clientsData.map((c, idx) => ({
          ...c,
          _stableKey: c.id || c.No || c.NO || c['IC NUMBER'] || `fallback-row-${idx}`
        }));
        setDbClients(safeData);
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

  const canEdit = ['COO', 'CFO'].includes(profile?.role);

  return (
    <div className="space-y-4 md:space-y-6 animate-page-transition pt-12 md:pt-0 overflow-x-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-teal-900 dark:text-white">
          Client Database
        </h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">
          Manage and view all client information
        </p>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <ClientTable clients={dbClients} canEdit={canEdit} />
      </div>
    </div>
  );
}
