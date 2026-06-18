import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';
import { sanitizeInput } from '../utils/security';

interface PublicHoliday {
  id: string;
  date: string;
  name: string;
}

export default function PublicHolidaysView() {
  const [profile, setProfile] = useState<any>(null);
  const { permissions, loading: permsLoading } = usePermissions(profile);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const { lang } = usePortalLanguage();

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`id, department, full_name, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      let roleName = 'No Role';
      if (profileData) {
        if (profileData.roles) {
          const rolesVar = profileData.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        setProfile({ id: profileData.id, department: profileData.department, name: profileData.full_name, role: roleName });
      }

      fetchHolidays();
    };

    loadData();
  }, []);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching holidays, table might not exist yet:', error);
      } else if (data) {
        setHolidays(data);
      }
    } catch (err) {
      console.error('Exception fetching holidays:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const cleanName = sanitizeInput(newName, 100);
    const cleanDate = newDate; // Date picker ensures format, but DB enforces it too

    if (!cleanDate || !cleanName) return;

    try {
      if (editingId) {
        const { error } = await supabase
          .from('public_holidays')
          .update({ date: cleanDate, name: cleanName })
          .eq('id', editingId);

        if (!error) {
          setHolidays(holidays.map(h => h.id === editingId ? { ...h, date: cleanDate, name: cleanName } : h));
        }
      } else {
        const { data, error } = await supabase
          .from('public_holidays')
          .insert([{ date: cleanDate, name: cleanName }])
          .select();

        if (!error && data) {
          setHolidays([...holidays, data[0]].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        }
      }
      resetForm();
    } catch (err) {
      console.error('Error saving holiday:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === 'bm' ? 'Adakah anda pasti untuk memadam cuti ini?' : 'Are you sure you want to delete this holiday?')) return;

    try {
      const { error } = await supabase
        .from('public_holidays')
        .delete()
        .eq('id', id);

      if (!error) {
        setHolidays(holidays.filter(h => h.id !== id));
      }
    } catch (err) {
      console.error('Error deleting holiday:', err);
    }
  };

  const handleEdit = (holiday: PublicHoliday) => {
    setEditingId(holiday.id);
    setNewDate(holiday.date);
    setNewName(holiday.name);
    setIsEditing(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setNewDate('');
    setNewName('');
    setIsEditing(false);
  };

  const hasAccess = permissions.view_attendance || ['HR', 'CFO', 'IT Admin'].includes(profile?.role || '');

  if (loading || permsLoading) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl">
        {lang === 'bm' ? 'Memuatkan Rekod Cuti Umum...' : 'Loading Public Holidays...'}
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-6 md:p-8 border-b border-indigo-950 dark:border-gray-800 bg-indigo-950 dark:bg-gray-900 flex justify-between items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {lang === 'bm' ? 'Cuti Umum Tahunan' : 'Annual Public Holidays'}
          </h2>
          <p className="text-xs md:text-sm text-indigo-100 mt-1.5 font-medium">
            {lang === 'bm' ? 'Urus senarai cuti umum untuk sistem kehadiran' : 'Manage the list of public holidays for the attendance system'}
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-white text-indigo-950 dark:bg-yellow-500 dark:text-black font-semibold rounded-xl text-sm shadow-sm hover:bg-indigo-50 dark:hover:bg-yellow-400 transition-colors"
          >
            {lang === 'bm' ? '+ Tambah Cuti' : '+ Add Holiday'}
          </button>
        )}
      </div>

      <div className="p-6 md:p-8">
        {isEditing && (
          <div className="mb-8 p-6 bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-slate-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100 mb-4">
              {editingId ? (lang === 'bm' ? 'Kemaskini Cuti' : 'Edit Holiday') : (lang === 'bm' ? 'Tambah Cuti Baru' : 'Add New Holiday')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                  {lang === 'bm' ? 'Tarikh Cuti' : 'Holiday Date'}
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                  {lang === 'bm' ? 'Nama Cuti' : 'Holiday Name'}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Merdeka Day"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {lang === 'bm' ? 'Batal' : 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={!newDate || !newName}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black rounded-lg transition-colors disabled:opacity-50"
              >
                {lang === 'bm' ? 'Simpan' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-black">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-zinc-400 text-xs w-32">{lang === 'bm' ? 'Tarikh' : 'Date'}</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-zinc-400 text-xs">{lang === 'bm' ? 'Nama Cuti' : 'Holiday Name'}</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-zinc-400 text-xs text-right w-24">{lang === 'bm' ? 'Tindakan' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-500 dark:text-zinc-400 italic">
                    {lang === 'bm' ? 'Tiada cuti umum direkodkan.' : 'No public holidays recorded.'}
                    <br />
                    <span className="text-xs text-indigo-500 mt-2 block">
                      {lang === 'bm' ? '(Sila pastikan skrip SQL public_holidays telah dijalankan di Supabase)' : '(Ensure the public_holidays SQL script has been run in Supabase)'}
                    </span>
                  </td>
                </tr>
              ) : (
                holidays.map(holiday => (
                  <tr key={holiday.id} className="hover:bg-slate-50 dark:hover:bg-gray-900/40">
                    <td className="px-5 py-3 font-medium text-slate-700 dark:text-zinc-200">
                      {new Date(holiday.date).toLocaleDateString(lang === 'bm' ? 'ms-MY' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                      {holiday.name}
                    </td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button onClick={() => handleEdit(holiday)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium text-sm">
                        {lang === 'bm' ? 'Edit' : 'Edit'}
                      </button>
                      <button onClick={() => handleDelete(holiday.id)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium text-sm">
                        {lang === 'bm' ? 'Padam' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
