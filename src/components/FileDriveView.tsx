import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

// A simple utility to format bytes
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function FileDriveView() {
  const { lang } = usePortalLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(`id, department, roles ( role_name )`)
        .eq('id', session.user.id)
        .single();

      if (profile) {
        setUserProfile(profile);
        const roleName = profile.roles?.role_name;
        const globalAdmins = ['IT Admin', 'Chairman', 'CEO', 'COO', 'CFO'];
        const isGlobal = globalAdmins.includes(roleName);
        setIsGlobalAdmin(isGlobal);

        // If not global admin, enforce starting path to their department folder
        if (!isGlobal && profile.department) {
          setCurrentPath(profile.department);
        } else {
          setCurrentPath(''); // Root for global admins
        }
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (currentPath !== null) {
      fetchItems();
    }
  }, [currentPath]);

  const fetchItems = async () => {
    if (currentPath === null) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('company_drive')
        .list(currentPath, {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) throw error;

      // Filter out the dummy .keep files but keep the folders
      const validItems = data?.filter(item => item.name !== '.keep') || [];
      setItems(validItems);
      setSelectedItem(null);
    } catch (err) {
      console.error('Error fetching drive items:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (folderName: string) => {
    setCurrentPath(prev => prev ? `${prev}/${folderName}` : folderName);
  };

  const navigateUp = () => {
    setCurrentPath(prev => {
      if (!prev) return '';
      const parts = prev.split('/').filter(Boolean);
      parts.pop();
      const newPath = parts.join('/');

      // Prevent non-admins from going to root
      if (!isGlobalAdmin && userProfile?.department && !newPath.startsWith(userProfile.department)) {
        return userProfile.department;
      }
      return newPath;
    });
  };

  const navigateToCrumb = (index: number) => {
    setCurrentPath(prev => {
      if (!prev) return '';
      const parts = prev.split('/').filter(Boolean);
      const newPath = parts.slice(0, index + 1).join('/');

      // Prevent non-admins from going to root or outside their department
      if (!isGlobalAdmin && userProfile?.department && !newPath.startsWith(userProfile.department)) {
        return userProfile.department;
      }
      return newPath;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setUploading(true);
    try {
      // Create a dummy file to instantiate the folder
      const folderPath = currentPath ? `${currentPath}/${newFolderName.trim()}/.keep` : `${newFolderName.trim()}/.keep`;
      const dummyBlob = new Blob([''], { type: 'text/plain' });

      const { error } = await supabase.storage.from('company_drive').upload(folderPath, dummyBlob);
      if (error) throw error;

      setNewFolderName('');
      setIsCreateFolderOpen(false);
      fetchItems();
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const { error } = await supabase.storage.from('company_drive').upload(filePath, file, {
        upsert: true
      });
      if (error) throw error;
      fetchItems();
    } catch (err: any) {
      alert(`Failed to upload file: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    setUploading(true);
    try {
      const isFolder = !selectedItem.id;
      let filesToDelete = [];

      if (isFolder) {
        // Find all files in the folder
        const folderPrefix = currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name;
        const { data: folderContents } = await supabase.storage.from('company_drive').list(folderPrefix);

        if (folderContents && folderContents.length > 0) {
          filesToDelete = folderContents.map(f => `${folderPrefix}/${f.name}`);
        } else {
          filesToDelete = [`${folderPrefix}/.keep`];
        }
      } else {
        filesToDelete = [currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name];
      }

      const { error } = await supabase.storage.from('company_drive').remove(filesToDelete);
      if (error) throw error;

      setIsDeleteOpen(false);
      setSelectedItem(null);
      fetchItems();
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return;
    setUploading(true);
    try {
      const isFolder = !selectedItem.id;
      const oldPath = currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name;
      const newPath = currentPath ? `${currentPath}/${renameValue.trim()}` : renameValue.trim();

      if (isFolder) {
        alert("Folder renaming is not natively supported without moving all files. Coming soon.");
      } else {
        const { error } = await supabase.storage.from('company_drive').move(oldPath, newPath);
        if (error) throw error;
      }

      setIsRenameOpen(false);
      fetchItems();
    } catch (err: any) {
      alert(`Failed to rename: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedItem || !selectedItem.id) return;
    try {
      const filePath = currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name;
      const { data, error } = await supabase.storage.from('company_drive').download(filePath);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedItem.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Failed to download: ${err.message}`);
    }
  };

  const breadcrumbs = (currentPath || '').split('/').filter(Boolean);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch(ext) {
      case 'pdf': return <svg className="w-8 h-8 text-rose-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>;
      case 'doc':
      case 'docx': return <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>;
      case 'xls':
      case 'xlsx': return <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return <svg className="w-8 h-8 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>;
      default: return <svg className="w-8 h-8 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>;
    }
  };

  const getFolderIcon = () => (
    <svg className="w-8 h-8 text-indigo-500 dark:text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );

  return (
    <div className="space-y-6 animate-fade-in relative max-w-6xl mx-auto h-[calc(100vh-120px)] flex flex-col">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/70 dark:bg-black/50 backdrop-blur-xl p-5 sm:p-6 rounded-3xl border border-white/50 dark:border-gray-800 shadow-sm flex-shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <svg className="w-8 h-8 text-indigo-600 dark:text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            {t('drive', 'pageTitle', lang)}
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 font-medium">{t('drive', 'pageSubtitle', lang)}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsCreateFolderOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-xl text-sm font-bold border border-slate-200 dark:border-gray-700 shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('drive', 'newFolder', lang)}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-black text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 dark:shadow-yellow-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? t('drive', 'uploading', lang) : t('drive', 'uploadFile', lang)}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

        <div className="flex-1 bg-white/70 dark:bg-black/50 backdrop-blur-xl border border-white/50 dark:border-gray-800 shadow-sm rounded-3xl flex flex-col min-h-0 overflow-hidden relative">

          <div className="p-4 border-b border-slate-100 dark:border-gray-800/80 flex items-center gap-2 text-sm font-semibold overflow-x-auto">
            {isGlobalAdmin && (
              <button
                onClick={() => setCurrentPath('')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${currentPath === '' ? 'text-indigo-700 bg-indigo-50 dark:text-yellow-500 dark:bg-yellow-500/10' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-gray-800'}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                Drive
              </button>
            )}

            {!isGlobalAdmin && breadcrumbs.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 dark:text-gray-500 whitespace-nowrap">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                Company Drive
              </div>
            )}

            {breadcrumbs.map((crumb, idx) => {
              // Hide breadcrumbs outside of department for non-admins to avoid confusion?
              // Actually, the department folder IS the first crumb.
              const isDeptRoot = !isGlobalAdmin && idx === 0;

              return (
                <React.Fragment key={idx}>
                  {(isGlobalAdmin || idx > 0) && (
                    <svg className="w-4 h-4 text-slate-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <button
                    onClick={() => navigateToCrumb(idx)}
                    disabled={isDeptRoot}
                    className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${idx === breadcrumbs.length - 1 ? 'text-indigo-700 bg-indigo-50 dark:text-yellow-500 dark:bg-yellow-500/10' : isDeptRoot ? 'text-slate-700 bg-slate-100 dark:text-zinc-300 dark:bg-gray-800 cursor-default' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-gray-800'}`}
                  >
                    {crumb}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-black/20">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-pulse text-slate-400 font-semibold">{t('common', 'loading', lang)}</div>
              </div>
            ) : items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 bg-indigo-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-indigo-300 dark:text-gray-600">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-zinc-300">{t('drive', 'emptyFolder', lang)}</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">{t('drive', 'dragDrop', lang)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {currentPath !== '' && (!userProfile || isGlobalAdmin || currentPath !== userProfile.department) && (
                  <div
                    onClick={navigateUp}
                    className="group cursor-pointer bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:border-indigo-300 dark:hover:border-yellow-500/50 hover:shadow-md transition-all h-36"
                  >
                    <div className="w-12 h-12 bg-slate-100 dark:bg-black rounded-full flex items-center justify-center text-slate-500 dark:text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-yellow-500 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-600 dark:text-zinc-400">Back</span>
                  </div>
                )}

                {items.map((item) => {
                  const isFolder = !item.id; // Supabase list returns id=null for prefix "folders"
                  const isSelected = selectedItem?.name === item.name;

                  return (
                    <div
                      key={item.name}
                      onClick={() => isFolder ? navigateTo(item.name) : setSelectedItem(item)}
                      className={`group cursor-pointer bg-white dark:bg-gray-900 border rounded-2xl p-4 flex flex-col items-center justify-center gap-3 transition-all h-36 relative overflow-hidden ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-yellow-500 dark:ring-yellow-500/20 shadow-md bg-indigo-50/30 dark:bg-yellow-500/5' : 'border-slate-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-gray-600 hover:shadow-sm'}`}
                    >
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${isFolder ? 'bg-indigo-50 dark:bg-gray-800' : 'bg-slate-50 dark:bg-black'}`}>
                        {isFolder ? getFolderIcon() : getFileIcon(item.name)}
                      </div>
                      <span className={`text-xs font-bold text-center w-full truncate px-2 ${isSelected ? 'text-indigo-700 dark:text-yellow-500' : 'text-slate-700 dark:text-zinc-300'}`}>
                        {item.name}
                      </span>

                      {!isFolder && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }} className="p-1.5 bg-white/90 dark:bg-black/90 backdrop-blur rounded-lg shadow-sm text-slate-400 hover:text-indigo-600 dark:hover:text-yellow-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selectedItem && (
          <div className="w-full lg:w-80 bg-white/70 dark:bg-black/50 backdrop-blur-xl border border-white/50 dark:border-gray-800 shadow-sm rounded-3xl p-6 flex flex-col min-h-0 animate-fade-in flex-shrink-0">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('drive', 'fileDetails', lang)}</h3>
              <button onClick={() => setSelectedItem(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-gray-800 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col items-center mb-6 p-6 bg-slate-50 dark:bg-gray-900/50 rounded-2xl border border-slate-100 dark:border-gray-800">
              <div className="w-20 h-20 mb-4 bg-white dark:bg-black rounded-2xl shadow-sm flex items-center justify-center border border-slate-100 dark:border-gray-800">
                {!selectedItem.id ? getFolderIcon() : getFileIcon(selectedItem.name)}
              </div>
              <h4 className="font-bold text-slate-800 dark:text-white text-center break-all">{selectedItem.name}</h4>
              {selectedItem.id && <span className="text-xs font-semibold text-slate-500 mt-2 bg-slate-200 dark:bg-gray-800 px-2.5 py-1 rounded-md">{formatBytes(selectedItem.metadata?.size || 0)}</span>}
            </div>

            {selectedItem.id && (
              <div className="space-y-4 text-sm mb-8 flex-1">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('drive', 'type', lang)}</p>
                  <p className="font-medium text-slate-700 dark:text-zinc-300">{selectedItem.metadata?.mimetype || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('drive', 'lastModified', lang)}</p>
                  <p className="font-medium text-slate-700 dark:text-zinc-300">{new Date(selectedItem.updated_at).toLocaleString()}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-auto">
              {selectedItem.id && (
                <button onClick={handleDownload} className="w-full py-2.5 bg-indigo-50 dark:bg-yellow-500/10 text-indigo-700 dark:text-yellow-500 font-bold rounded-xl hover:bg-indigo-100 dark:hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {t('drive', 'download', lang)}
                </button>
              )}
              {selectedItem.id && (
                <button onClick={() => { setRenameValue(selectedItem.name); setIsRenameOpen(true); }} className="w-full py-2.5 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-zinc-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  {t('drive', 'rename', lang)}
                </button>
              )}
              <button onClick={() => setIsDeleteOpen(true)} className="w-full py-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-bold rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('drive', 'delete', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {isCreateFolderOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-gray-800 animate-scale-in">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t('drive', 'newFolder', lang)}</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('drive', 'folderName', lang)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 outline-none transition-all mb-6 font-medium"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setIsCreateFolderOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                {t('drive', 'cancel', lang)}
              </button>
              <button onClick={handleCreateFolder} disabled={uploading || !newFolderName.trim()} className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 dark:bg-yellow-500 dark:text-black hover:bg-indigo-700 dark:hover:bg-yellow-600 rounded-xl shadow-md transition-colors disabled:opacity-50">
                {t('drive', 'create', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRenameOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-gray-800 animate-scale-in">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t('drive', 'rename', lang)}</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 outline-none transition-all mb-6 font-medium"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setIsRenameOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                {t('drive', 'cancel', lang)}
              </button>
              <button onClick={handleRename} disabled={uploading || !renameValue.trim() || renameValue === selectedItem?.name} className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 dark:bg-yellow-500 dark:text-black hover:bg-indigo-700 dark:hover:bg-yellow-600 rounded-xl shadow-md transition-colors disabled:opacity-50">
                {t('drive', 'rename', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-gray-800 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('drive', 'delete', lang)}</h3>
            <p className="text-slate-500 dark:text-zinc-400 mb-6">{t('drive', 'confirmDelete', lang)}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setIsDeleteOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                {t('drive', 'cancel', lang)}
              </button>
              <button onClick={handleDelete} disabled={uploading} className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-colors disabled:opacity-50">
                {t('drive', 'deleteConfirmBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
