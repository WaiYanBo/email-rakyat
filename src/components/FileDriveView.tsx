import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { usePermissions } from '../hooks/usePermissions';

// A simple utility to format bytes
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Helper utility to list all files recursively under a folder in Supabase Storage
async function listAllFilesRecursive(path: string): Promise<string[]> {
  const allFiles: string[] = [];
  async function traverse(current: string) {
    const { data, error } = await supabase.storage.from('company_drive').list(current, { limit: 1000 });
    if (error) throw error;
    if (!data) return;
    for (const item of data) {
      const fullItemPath = current ? `${current}/${item.name}` : item.name;
      if (item.id === null) {
        // It's a folder, traverse it recursively
        await traverse(fullItemPath);
      } else {
        // It's a file
        allFiles.push(fullItemPath);
      }
    }
  }
  await traverse(path);
  return allFiles;
}

interface ImageThumbnailProps {
  item: any;
  currentPath: string | null;
}

function ImageThumbnail({ item, currentPath }: ImageThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchThumbnail() {
      try {
        setLoading(true);
        setError(false);
        const filePath = item.fullPath || (currentPath ? `${currentPath}/${item.name}` : item.name);
        const { data, error: err } = await supabase.storage
          .from('company_drive')
          .createSignedUrl(filePath, 300);

        if (err) throw err;
        if (active && data) {
          setUrl(data.signedUrl);
        }
      } catch (e) {
        console.error('Error fetching thumbnail:', e);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchThumbnail();
    return () => {
      active = false;
    };
  }, [item.name, currentPath]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-zinc-800 animate-pulse">
        <svg className="w-6 h-6 text-slate-450 dark:text-zinc-650 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-zinc-850 text-slate-400 dark:text-zinc-600">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375 0 11-.75 0 .375 0 01.75 0z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={item.name}
      loading="lazy"
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

export default function FileDriveView() {
  const { lang } = usePortalLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  const { permissions, loading: permsLoading } = usePermissions(userProfile);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState<any | null>(null);
  const [activeOverFolder, setActiveOverFolder] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clickTrackerRef = useRef<{ id: string; time: number } | null>(null);

  const handleItemClickWithDoubleClick = (
    e: React.MouseEvent,
    item: any,
    onDoubleClickAction: () => void
  ) => {
    e.stopPropagation();
    setSelectedItem(item);
    
    const now = Date.now();
    const tracker = clickTrackerRef.current;
    const itemId = item.id ? `file-${item.name}` : `folder-${item.name}`;

    if (tracker && tracker.id === itemId && (now - tracker.time) < 350) {
      clickTrackerRef.current = null;
      onDoubleClickAction();
    } else {
      clickTrackerRef.current = { id: itemId, time: now };
    }
  };

  // Google Drive layout and sorting states
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'updated_at' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [allRecursiveItems, setAllRecursiveItems] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [crumbSubfolders, setCrumbSubfolders] = useState<any[]>([]);
  const [loadingCrumbSubfolders, setLoadingCrumbSubfolders] = useState(false);

  useEffect(() => {
    const handleWindowClick = () => {
      setActiveMenu(null);
    };
    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

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
        let roleName = 'No Role';
        if (profile.roles) {
          const rolesVar = profile.roles as any;
          if (Array.isArray(rolesVar)) {
            roleName = rolesVar[0]?.role_name || 'No Role';
          } else {
            roleName = rolesVar?.role_name || 'No Role';
          }
        }
        setUserProfile({
          id: profile.id,
          department: profile.department,
          role: roleName,
        });
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (userProfile && !permsLoading) {
      const isGlobal = permissions?.manage_drive || false;
      setIsGlobalAdmin(isGlobal);

      if (currentPath === null) {
        if (!isGlobal && userProfile.department) {
          setCurrentPath(userProfile.department);
        } else {
          setCurrentPath('');
        }
      }
    }
  }, [userProfile, permissions, permsLoading]);

  useEffect(() => {
    if (currentPath !== null) {
      fetchItems();
      setAllRecursiveItems(null);
      setSearchQuery('');
    }
  }, [currentPath]);

  const fetchRecursiveItems = async (path: string) => {
    setSearchLoading(true);
    try {
      const flatList: any[] = [];
      async function traverse(dir: string) {
        const { data, error } = await supabase.storage.from('company_drive').list(dir, { limit: 1000 });
        if (error) throw error;
        if (!data) return;
        for (const item of data) {
          if (item.name === '.keep') continue;
          const fullPath = dir ? `${dir}/${item.name}` : item.name;
          flatList.push({
            ...item,
            fullPath,
            parentDir: dir
          });
          if (item.id === null) {
            await traverse(fullPath);
          }
        }
      }
      await traverse(path);
      setAllRecursiveItems(flatList);
    } catch (err) {
      console.error('Error fetching recursive search items:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() !== '' && allRecursiveItems === null && currentPath !== null) {
      fetchRecursiveItems(currentPath);
    }
  }, [searchQuery, allRecursiveItems, currentPath]);

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

  const fetchSubfoldersForCrumb = async (path: string) => {
    setLoadingCrumbSubfolders(true);
    setCrumbSubfolders([]);
    try {
      const { data, error } = await supabase.storage
        .from('company_drive')
        .list(path, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });
      if (error) throw error;
      const foldersOnly = data?.filter(item => !item.id && item.name !== '.keep') || [];
      const mapped = foldersOnly.map(f => ({
        ...f,
        fullPath: path ? `${path}/${f.name}` : f.name
      }));
      setCrumbSubfolders(mapped);
    } catch (err) {
      console.error('Error fetching subfolders for crumb:', err);
    } finally {
      setLoadingCrumbSubfolders(false);
    }
  };

  const navigateTo = (folderName: string) => {
    setCurrentPath(prev => prev ? `${prev}/${folderName}` : folderName);
  };

  const navigateToFolder = (item: any) => {
    if (item.fullPath) {
      setCurrentPath(item.fullPath);
    } else {
      setCurrentPath(prev => prev ? `${prev}/${item.name}` : item.name);
    }
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
      alert(`${t('drive', 'failedCreateFolder', lang)}${err.message || ''}`);
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
      alert(`${t('drive', 'failedUploadFile', lang)}${err.message || ''}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show upload overlay if we are NOT dragging an internal item
    if (!draggedItem) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // If dragging an internal item, ignore external drop handler
    if (draggedItem) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploading(true);
      try {
        for (const file of files) {
          const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
          const { error } = await supabase.storage.from('company_drive').upload(filePath, file, {
            upsert: true
          });
          if (error) throw error;
        }
        fetchItems();
      } catch (err: any) {
        alert(lang === 'bm' ? `Gagal memuat naik: ${err.message}` : `Failed to upload: ${err.message}`);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleItemDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData('text/plain', item.name);
    setDraggedItem(item);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) {
      const isFolder = !draggedItem.id;
      // Prevent dragging a folder into itself
      if (isFolder && draggedItem.name === folderName) return;
      setActiveOverFolder(folderName);
    }
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveOverFolder(null);
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveOverFolder(null);

    if (!draggedItem) return;
    const isFolder = !draggedItem.id;
    if (isFolder && draggedItem.name === targetFolderName) return;

    setUploading(true);
    try {
      const oldPath = draggedItem.fullPath || (currentPath ? `${currentPath}/${draggedItem.name}` : draggedItem.name);
      const newPath = currentPath ? `${currentPath}/${targetFolderName}/${draggedItem.name}` : `${targetFolderName}/${draggedItem.name}`;

      if (isFolder) {
        // Move files inside folder recursively
        const allFiles = await listAllFilesRecursive(oldPath);
        if (allFiles.length > 0) {
          for (const file of allFiles) {
            const relativePath = file.substring(oldPath.length);
            const fileNewPath = `${newPath}${relativePath}`;
            const { error } = await supabase.storage.from('company_drive').move(file, fileNewPath);
            if (error) throw error;
          }
        } else {
          // If empty folder, move the keep file or write a new one
          try {
            const { error } = await supabase.storage.from('company_drive').move(`${oldPath}/.keep`, `${newPath}/.keep`);
            if (error) {
              const folderPath = `${newPath}/.keep`;
              const dummyBlob = new Blob([''], { type: 'text/plain' });
              await supabase.storage.from('company_drive').upload(folderPath, dummyBlob);
            }
          } catch {
            const folderPath = `${newPath}/.keep`;
            const dummyBlob = new Blob([''], { type: 'text/plain' });
            await supabase.storage.from('company_drive').upload(folderPath, dummyBlob);
          }
        }
      } else {
        const { error } = await supabase.storage.from('company_drive').move(oldPath, newPath);
        if (error) throw error;
      }

      setDraggedItem(null);
      fetchItems();
    } catch (err: any) {
      alert(lang === 'bm' ? `Gagal memindahkan: ${err.message}` : `Failed to move: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTrash(true);
  };

  const handleTrashDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTrash(false);
  };

  const handleTrashDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTrash(false);

    if (!draggedItem) return;

    if (!window.confirm(lang === 'bm'
      ? `Adakah anda pasti mahu memadamkan "${draggedItem.name}" secara kekal?`
      : `Are you sure you want to permanently delete "${draggedItem.name}"?`
    )) {
      setDraggedItem(null);
      return;
    }

    setUploading(true);
    try {
      const isFolder = !draggedItem.id;
      let filesToDelete: string[] = [];

      if (isFolder) {
        const folderPrefix = draggedItem.fullPath || (currentPath ? `${currentPath}/${draggedItem.name}` : draggedItem.name);
        filesToDelete = await listAllFilesRecursive(folderPrefix);
        if (filesToDelete.length === 0) {
          filesToDelete = [`${folderPrefix}/.keep`];
        }
      } else {
        filesToDelete = [draggedItem.fullPath || (currentPath ? `${currentPath}/${draggedItem.name}` : draggedItem.name)];
      }

      const { error } = await supabase.storage.from('company_drive').remove(filesToDelete);
      if (error) throw error;

      setDraggedItem(null);
      setSelectedItem(null);
      fetchItems();
    } catch (err: any) {
      alert(lang === 'bm' ? `Gagal memadam: ${err.message}` : `Failed to delete: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    setUploading(true);
    try {
      const isFolder = !selectedItem.id;
      let filesToDelete: string[] = [];

      if (isFolder) {
        const folderPrefix = selectedItem.fullPath || (currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name);
        filesToDelete = await listAllFilesRecursive(folderPrefix);
        if (filesToDelete.length === 0) {
          filesToDelete = [`${folderPrefix}/.keep`];
        }
      } else {
        filesToDelete = [selectedItem.fullPath || (currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name)];
      }

      const { error } = await supabase.storage.from('company_drive').remove(filesToDelete);
      if (error) throw error;

      setIsDeleteOpen(false);
      setSelectedItem(null);
      fetchItems();
    } catch (err: any) {
      alert(lang === 'bm' ? `Gagal memadam: ${err.message}` : `Failed to delete: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return;
    setUploading(true);
    try {
      const isFolder = !selectedItem.id;
      const oldPath = selectedItem.fullPath || (currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name);
      
      let parentPathPrefix = '';
      if (selectedItem.fullPath) {
        const parts = selectedItem.fullPath.split('/');
        parts.pop();
        parentPathPrefix = parts.join('/');
      } else {
        parentPathPrefix = currentPath || '';
      }
      
      const newPath = parentPathPrefix ? `${parentPathPrefix}/${renameValue.trim()}` : renameValue.trim();

      if (isFolder) {
        // Find all files in the folder recursively and move them
        const allFiles = await listAllFilesRecursive(oldPath);
        if (allFiles.length > 0) {
          for (const file of allFiles) {
            const relativePath = file.substring(oldPath.length);
            const fileNewPath = `${newPath}${relativePath}`;
            const { error } = await supabase.storage.from('company_drive').move(file, fileNewPath);
            if (error) throw error;
          }
        } else {
          // If empty folder, move the .keep file or write a new one
          try {
            const { error } = await supabase.storage.from('company_drive').move(`${oldPath}/.keep`, `${newPath}/.keep`);
            if (error) {
              const folderPath = `${newPath}/.keep`;
              const dummyBlob = new Blob([''], { type: 'text/plain' });
              await supabase.storage.from('company_drive').upload(folderPath, dummyBlob);
            }
          } catch {
            const folderPath = `${newPath}/.keep`;
            const dummyBlob = new Blob([''], { type: 'text/plain' });
            await supabase.storage.from('company_drive').upload(folderPath, dummyBlob);
          }
        }
      } else {
        const { error } = await supabase.storage.from('company_drive').move(oldPath, newPath);
        if (error) throw error;
      }

      setIsRenameOpen(false);
      fetchItems();
    } catch (err: any) {
      alert(lang === 'bm' ? `Gagal menamakan semula: ${err.message}` : `Failed to rename: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedItem || !selectedItem.id) return;
    try {
      const filePath = selectedItem.fullPath || (currentPath ? `${currentPath}/${selectedItem.name}` : selectedItem.name);
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
      alert(lang === 'bm' ? `Gagal memuat turun: ${err.message}` : `Failed to download: ${err.message}`);
    }
  };

  const handlePreview = async (item: any) => {
    if (!item || !item.id) return;
    setPreviewItem(item);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setTextPreviewContent(null);
    try {
      const filePath = item.fullPath || (currentPath ? `${currentPath}/${item.name}` : item.name);
      const { data, error } = await supabase.storage.from('company_drive').createSignedUrl(filePath, 300);
      if (error) throw error;
      setPreviewUrl(data.signedUrl);

      const ext = item.name.split('.').pop()?.toLowerCase();
      const textExtensions = ['txt', 'json', 'sql', 'js', 'jsx', 'ts', 'tsx', 'md', 'html', 'css', 'yaml', 'yml'];
      if (ext && textExtensions.includes(ext)) {
        const response = await fetch(data.signedUrl);
        if (response.ok) {
          const text = await response.text();
          setTextPreviewContent(text.substring(0, 1024 * 1024)); // Cap at 1MB
        }
      }
    } catch (err: any) {
      console.error('Failed to generate preview URL:', err);
      alert(lang === 'bm' ? `Gagal memuatkan pratonton: ${err.message}` : `Failed to load preview: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleHeaderClick = (field: 'name' | 'updated_at' | 'size') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const getSmallFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': 
        return (
          <div className="w-5 h-5 bg-rose-50 dark:bg-rose-500/10 rounded flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
        );
      case 'doc':
      case 'docx': 
        return (
          <div className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 rounded flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
        );
      case 'xls':
      case 'xlsx': 
        return (
          <div className="w-5 h-5 bg-green-50 dark:bg-green-500/10 rounded flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
        );
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp': 
        return (
          <div className="w-5 h-5 bg-amber-50 dark:bg-amber-500/10 rounded flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default: 
        return (
          <div className="w-5 h-5 bg-slate-100 dark:bg-zinc-800 rounded flex items-center justify-center text-slate-500 dark:text-zinc-400 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
        );
    }
  };

  const renderVisualPreview = (item: any) => {
    const ext = item.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return (
          <div className="w-full h-full relative overflow-hidden bg-slate-100 dark:bg-zinc-950 flex items-center justify-center">
            <ImageThumbnail item={item} currentPath={currentPath} />
          </div>
        );
      case 'pdf':
        return (
          <div className="w-full h-full bg-slate-100 dark:bg-zinc-950 flex items-center justify-center p-3">
            <div className="w-20 h-28 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-850 shadow-sm rounded-sm flex flex-col p-2 relative overflow-hidden select-none">
              <div className="w-full h-1 bg-rose-500/80 rounded-full mb-1" />
              <div className="w-10 h-1 bg-slate-200 dark:bg-zinc-800 rounded-full mb-1" />
              <div className="w-12 h-1 bg-slate-200 dark:bg-zinc-800 rounded-full mb-2" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-1.5 py-0.5 bg-rose-600 text-[9px] font-black text-white rounded shadow-sm tracking-wider flex items-center justify-center">
                  PDF
                </div>
              </div>
              <div className="mt-auto space-y-1">
                <div className="w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full" />
                <div className="w-4/5 h-1 bg-slate-100 dark:bg-zinc-800 rounded-full" />
              </div>
            </div>
          </div>
        );
      case 'xls':
      case 'xlsx':
        return (
          <div className="w-full h-full bg-slate-100 dark:bg-zinc-950 flex items-center justify-center p-3">
            <div className="w-24 h-28 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-850 shadow-sm rounded-sm flex flex-col overflow-hidden select-none">
              <div className="h-3.5 bg-green-700 w-full flex items-center px-1 gap-1">
                <div className="w-1 h-1 bg-white/50 rounded-full" />
                <div className="w-5 h-1 bg-white/70 rounded-full" />
              </div>
              <div className="flex-1 grid grid-cols-4 gap-0.5 p-0.5 bg-slate-50 dark:bg-zinc-850">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 border-[0.5px] border-slate-100/80 dark:border-zinc-800/80 rounded-[1px] flex items-center justify-center">
                    {i === 2 && <div className="w-2 h-0.5 bg-green-200 dark:bg-green-800/40 rounded-full" />}
                    {i === 5 && <div className="w-2 h-0.5 bg-slate-150 dark:bg-zinc-800 rounded-full" />}
                    {i === 9 && <div className="w-3 h-0.5 bg-green-300 dark:bg-green-700/30 rounded-full" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'doc':
      case 'docx':
        return (
          <div className="w-full h-full bg-slate-100 dark:bg-zinc-950 flex items-center justify-center p-3">
            <div className="w-20 h-28 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-850 shadow-sm rounded-sm flex flex-col p-2 select-none">
              <div className="w-full h-1 bg-blue-600 rounded-full mb-1.5" />
              <div className="space-y-1 flex-1">
                <div className="w-4/5 h-0.5 bg-slate-250 dark:bg-zinc-800 rounded-full" />
                <div className="w-full h-0.5 bg-slate-150 dark:bg-zinc-850 rounded-full" />
                <div className="w-11/12 h-0.5 bg-slate-150 dark:bg-zinc-850 rounded-full" />
                <div className="w-full h-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded flex items-center justify-center my-0.5">
                  <svg className="w-2.5 h-2.5 text-blue-500 dark:text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375 0 11-.75 0 .375 0 01.75 0z" />
                  </svg>
                </div>
                <div className="w-5/6 h-0.5 bg-slate-150 dark:bg-zinc-850 rounded-full" />
                <div className="w-2/3 h-0.5 bg-slate-150 dark:bg-zinc-850 rounded-full" />
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-slate-100 dark:bg-zinc-950 flex items-center justify-center p-3">
            <div className="w-20 h-28 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-850 shadow-sm rounded-sm flex flex-col p-2 items-center justify-center select-none relative">
              <svg className="w-8 h-8 text-slate-400 dark:text-zinc-605" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              {ext && (
                <span className="mt-1.5 text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest bg-slate-100 dark:bg-zinc-800 px-1 py-0.5 rounded shadow-sm">
                  {ext}
                </span>
              )}
            </div>
          </div>
        );
    }
  };

  const renderBackGridItem = () => {
    return (
      <div
        onClick={navigateUp}
        className="group cursor-pointer bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-4 h-16 flex items-center gap-3 hover:border-indigo-300 dark:hover:border-yellow-500/50 hover:shadow-md transition-all relative overflow-hidden select-none"
      >
        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-black flex items-center justify-center text-slate-500 dark:text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-yellow-500 transition-colors flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </div>
        <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-white transition-colors">
          {lang === 'bm' ? 'Kembali' : 'Back'}
        </span>
      </div>
    );
  };

  const renderFolderGridItem = (item: any) => {
    const isSelected = selectedItem?.name === item.name;
    const isBeingDragged = draggedItem && draggedItem.name === item.name && !draggedItem.id;

    return (
      <div
        key={item.name}
        onClick={(e) => handleItemClickWithDoubleClick(e, item, () => navigateToFolder(item))}
        draggable={true}
        onDragStart={(e) => handleItemDragStart(e, item)}
        onDragEnd={() => setDraggedItem(null)}
        onDragOver={(e) => handleFolderDragOver(e, item.name)}
        onDragLeave={(e) => handleFolderDragLeave(e)}
        onDrop={(e) => handleFolderDrop(e, item.name)}
        className={`group cursor-pointer bg-white dark:bg-gray-900 border rounded-xl px-4 h-16 flex items-center gap-3 transition-all relative select-none touch-manipulation ${
          isBeingDragged ? 'opacity-40 scale-95 border-dashed border-indigo-400 dark:border-yellow-500/50' : ''
        } ${
          isSelected 
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-yellow-500 dark:ring-yellow-500/20 shadow-md bg-indigo-50/30 dark:bg-yellow-500/5' 
            : activeOverFolder === item.name
              ? 'border-dashed border-2 border-indigo-600 bg-indigo-50/50 dark:border-yellow-500 dark:bg-yellow-500/10 scale-95 shadow-md z-10'
              : 'border-slate-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-gray-700 hover:shadow-sm'
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          {getFolderIcon()}
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate block" title={item.name}>
            {item.name}
          </span>
        </div>
        
        <div className="relative flex-shrink-0 ml-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedItem(item);
              setActiveMenu(activeMenu === `folder-${item.name}` ? null : `folder-${item.name}`);
            }}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-gray-850 rounded-full text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          
          {activeMenu === `folder-${item.name}` && (
            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 z-40 text-left">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(null);
                  setSelectedItem(item);
                  setShowDetailsPanel(true);
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-305 hover:bg-slate-100 dark:hover:bg-zinc-905 transition-colors flex items-center gap-2 font-semibold"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                {lang === 'bm' ? 'Maklumat' : 'Details'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(null);
                  setRenameValue(item.name);
                  setIsRenameOpen(true);
                }}
                className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-350 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
                {lang === 'bm' ? 'Nama Semula' : 'Rename'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(null);
                  setIsDeleteOpen(true);
                }}
                className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-2 font-semibold"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {lang === 'bm' ? 'Padam' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFileGridItem = (item: any) => {
    const isSelected = selectedItem?.name === item.name;
    const isBeingDragged = draggedItem && draggedItem.name === item.name && draggedItem.id;

    return (
      <div
        key={item.name}
        onClick={(e) => handleItemClickWithDoubleClick(e, item, () => handlePreview(item))}
        draggable={true}
        onDragStart={(e) => handleItemDragStart(e, item)}
        onDragEnd={() => setDraggedItem(null)}
        className={`group cursor-pointer bg-white dark:bg-gray-900 border rounded-2xl flex flex-col justify-between transition-all h-60 relative select-none touch-manipulation ${
          isBeingDragged ? 'opacity-40 scale-95 border-dashed border-indigo-400 dark:border-yellow-500/50' : ''
        } ${
          isSelected 
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-yellow-500 dark:ring-yellow-500/20 shadow-md bg-indigo-50/10 dark:bg-yellow-500/5' 
            : 'border-slate-200 dark:border-gray-800 hover:border-indigo-355 dark:hover:border-gray-700 hover:shadow-md'
        }`}
      >
        <div className="w-full px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 dark:border-gray-850/80 bg-slate-50/40 dark:bg-black/10 flex-shrink-0">
          {getSmallFileIcon(item.name)}
          <span className={`text-xs font-bold truncate flex-1 ${isSelected ? 'text-indigo-755 dark:text-yellow-500' : 'text-slate-700 dark:text-zinc-205'}`} title={item.name}>
            {item.name}
          </span>
          
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItem(item);
                setActiveMenu(activeMenu === `file-${item.name}` ? null : `file-${item.name}`);
              }}
              className="p-1 hover:bg-slate-150 dark:hover:bg-gray-800 rounded-full text-slate-400 hover:text-slate-600 dark:text-zinc-550 dark:hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            
            {activeMenu === `file-${item.name}` && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 z-40 text-left">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(null);
                    setSelectedItem(item);
                    setShowDetailsPanel(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-305 hover:bg-slate-100 dark:hover:bg-zinc-905 transition-colors flex items-center gap-2 font-semibold"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  {t('drive', 'viewDetails', lang)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(null);
                    handlePreview(item);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-305 hover:bg-slate-100 dark:hover:bg-zinc-905 transition-colors flex items-center gap-2 font-semibold"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('drive', 'preview', lang)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(null);
                    handleDownload();
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-305 hover:bg-slate-100 dark:hover:bg-zinc-905 transition-colors flex items-center gap-2 font-semibold"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {t('drive', 'download', lang)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(null);
                    setRenameValue(item.name);
                    setIsRenameOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-305 hover:bg-slate-100 dark:hover:bg-zinc-905 transition-colors flex items-center gap-2 font-semibold"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                  {t('drive', 'rename', lang)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(null);
                    setIsDeleteOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-2 font-semibold"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  {t('drive', 'delete', lang)}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-50 dark:bg-black/30 flex items-center justify-center relative border-b border-slate-100 dark:border-zinc-850/80 transition-colors overflow-hidden">
          {renderVisualPreview(item)}
          
          <div className="absolute inset-0 bg-black/10 dark:bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
            <button
              onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
              className="px-3 py-1.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:text-indigo-650 dark:hover:text-yellow-500 scale-90 group-hover:scale-100 transition-all font-bold flex items-center gap-1.5 text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('drive', 'preview', lang)}
            </button>
          </div>
        </div>

        <div className="w-full px-3 py-2 bg-white dark:bg-gray-900 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-zinc-550 font-bold uppercase tracking-wider">
            {formatBytes(item.metadata?.size || 0)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-zinc-550 font-bold">
            {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '--'}
          </span>
        </div>
      </div>
    );
  };

  const renderFolderRow = (item: any) => {
    const isSelected = selectedItem?.name === item.name;
    const isBeingDragged = draggedItem && draggedItem.name === item.name && !draggedItem.id;

    return (
      <tr
        key={item.name}
        onClick={(e) => handleItemClickWithDoubleClick(e, item, () => navigateToFolder(item))}
        draggable={true}
        onDragStart={(e) => handleItemDragStart(e, item)}
        onDragEnd={() => setDraggedItem(null)}
        onDragOver={(e) => handleFolderDragOver(e, item.name)}
        onDragLeave={(e) => handleFolderDragLeave(e)}
        onDrop={(e) => handleFolderDrop(e, item.name)}
        className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors select-none touch-manipulation ${
          isBeingDragged ? 'opacity-40 bg-indigo-50/20 dark:bg-yellow-500/5' : ''
        } ${
          isSelected 
            ? 'bg-indigo-50/40 dark:bg-yellow-500/5 font-semibold text-indigo-900 dark:text-yellow-555' 
            : activeOverFolder === item.name
              ? 'bg-indigo-50 dark:bg-yellow-500/10 border-2 border-dashed border-indigo-650'
              : ''
        }`}
      >
        <td className="py-3 px-4 font-bold flex items-center gap-3">
          <div className="text-indigo-650 dark:text-yellow-500">
            {getFolderIcon()}
          </div>
          <span className="truncate max-w-xs sm:max-w-md text-slate-800 dark:text-zinc-200" title={item.name}>{item.name}</span>
        </td>
        <td className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-zinc-400">
          {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '--'}
        </td>
        <td className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-zinc-400">
          --
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItem(item);
                setShowDetailsPanel(true);
              }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-650 dark:hover:text-yellow-500 transition-colors"
              title={t('drive', 'viewDetails', lang)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigateToFolder(item); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-650 dark:hover:text-yellow-500 transition-colors"
              title="Open Folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setIsRenameOpen(true); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-yellow-555 transition-colors"
              title="Rename"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setIsDeleteOpen(true); }}
              className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-rose-600 transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderFileRow = (item: any) => {
    const isSelected = selectedItem?.name === item.name;
    const isBeingDragged = draggedItem && draggedItem.name === item.name && draggedItem.id;

    return (
      <tr
        key={item.name}
        onClick={(e) => handleItemClickWithDoubleClick(e, item, () => handlePreview(item))}
        draggable={true}
        onDragStart={(e) => handleItemDragStart(e, item)}
        onDragEnd={() => setDraggedItem(null)}
        className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors select-none touch-manipulation ${
          isBeingDragged ? 'opacity-40 bg-indigo-50/20 dark:bg-yellow-500/5' : ''
        } ${
          isSelected ? 'bg-indigo-50/40 dark:bg-yellow-500/5 font-semibold text-indigo-900 dark:text-yellow-500' : ''
        }`}
      >
        <td className="py-3 px-4 flex items-center gap-3">
          <div className="flex-shrink-0">
            {getFileIcon(item.name)}
          </div>
          <span className="truncate max-w-xs sm:max-w-md text-slate-800 dark:text-zinc-200" title={item.name}>{item.name}</span>
        </td>
        <td className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-zinc-400">
          {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '--'}
        </td>
        <td className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-zinc-400">
          {formatBytes(item.metadata?.size || 0)}
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItem(item);
                setShowDetailsPanel(true);
              }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-650 dark:hover:text-yellow-500 transition-colors"
              title={t('drive', 'viewDetails', lang)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-yellow-500 transition-colors"
              title="Preview File"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); handleDownload(); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-yellow-500 transition-colors"
              title="Download"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setIsRenameOpen(true); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-yellow-500 transition-colors"
              title="Rename"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setIsDeleteOpen(true); }}
              className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-rose-600 transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderListView = () => {
    return (
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[650px] border-collapse text-left text-sm text-slate-600 dark:text-zinc-350">
          <thead>
            <tr className="border-b border-slate-200 dark:border-gray-800 text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider select-none">
              <th 
                className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors"
                onClick={() => handleHeaderClick('name')}
              >
                <div className="flex items-center gap-1">
                  {t('drive', 'name', lang)}
                  {sortBy === 'name' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                </div>
              </th>
              <th 
                className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors"
                onClick={() => handleHeaderClick('updated_at')}
              >
                <div className="flex items-center gap-1">
                  {t('drive', 'lastModified', lang)}
                  {sortBy === 'updated_at' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                </div>
              </th>
              <th 
                className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-white transition-colors"
                onClick={() => handleHeaderClick('size')}
              >
                <div className="flex items-center gap-1">
                  {t('drive', 'size', lang)}
                  {sortBy === 'size' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                </div>
              </th>
              <th className="py-3 px-4 text-right">{t('clients', 'actions', lang)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800/80">
            {currentPath !== '' && searchQuery === '' && (
              <tr 
                onClick={navigateUp}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <td className="py-3 px-4 font-bold flex items-center gap-3 text-slate-500 hover:text-indigo-650 dark:text-zinc-400 dark:hover:text-yellow-500">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </div>
                  <span>.. ({t('drive', 'back', lang)})</span>
                </td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            )}
            {sortedFolders.map(folder => renderFolderRow(folder))}
            {sortedFiles.map(file => renderFileRow(file))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPreviewModal = () => {
    if (!previewItem) return null;

    const ext = previewItem.name.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '');
    const isPDF = ext === 'pdf';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
    const isText = textPreviewContent !== null;

    return (
      <div className="fixed inset-0 bg-slate-905/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden animate-scale-in">
          
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-900 shadow-sm border border-slate-200/50 dark:border-zinc-800 flex items-center justify-center flex-shrink-0">
                {getFileIcon(previewItem.name)}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white truncate" title={previewItem.name}>
                  {previewItem.name}
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-zinc-550 font-bold mt-0.5 uppercase tracking-wider">
                  {previewItem.metadata?.mimetype || 'Unknown Type'} • {formatBytes(previewItem.metadata?.size || 0)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedItem(previewItem);
                  handleDownload();
                }}
                className="p-2 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:text-indigo-650 dark:hover:text-yellow-500 transition-all shadow-sm"
                title={t('drive', 'download', lang)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
              
              <button
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewUrl(null);
                  setTextPreviewContent(null);
                }}
                className="p-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl text-rose-600 transition-all"
                title={t('drive', 'close', lang)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-50/50 dark:bg-black/30 flex items-center justify-center p-4 md:p-6 overflow-auto relative">
            {previewLoading && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent dark:border-yellow-500 dark:border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-slate-400 dark:text-zinc-550 font-bold uppercase tracking-wider">
                  {t('drive', 'loadingPreview', lang)}
                </p>
              </div>
            )}

            {!previewLoading && !previewUrl && (
              <div className="text-center p-6 max-w-sm">
                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center text-rose-505 mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h4 className="font-bold text-slate-700 dark:text-zinc-300">{t('drive', 'previewError', lang)}</h4>
                <p className="text-xs text-slate-500 mt-2">{t('drive', 'failedPreviewUrl', lang)}</p>
              </div>
            )}

            {!previewLoading && previewUrl && (
              <>
                {isImage && (
                  <div className="max-w-full max-h-full flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt={previewItem.name}
                      className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-md border border-slate-200 dark:border-zinc-800"
                    />
                  </div>
                )}

                {isPDF && (
                  <iframe
                    src={previewUrl}
                    title={previewItem.name}
                    className="w-full h-full rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-inner bg-white"
                  />
                )}

                {isOffice && (
                  <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`}
                    title={previewItem.name}
                    className="w-full h-full rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-inner bg-white"
                    frameBorder="0"
                  />
                )}

                {isText && (
                  <div className="w-full h-full flex flex-col bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800/80 p-4 shadow-inner">
                    <div className="flex justify-between items-center mb-3 flex-shrink-0">
                      <span className="text-xs text-slate-400 dark:text-zinc-550 font-bold uppercase tracking-wider">
                        {t('drive', 'textContent', lang)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(textPreviewContent || '');
                          alert(t('drive', 'copiedClipboard', lang));
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
                        </svg>
                        {t('drive', 'copy', lang)}
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto text-xs font-mono text-left p-4 bg-slate-50 dark:bg-black rounded-xl text-slate-800 dark:text-zinc-200 border border-slate-100 dark:border-zinc-900 select-text leading-relaxed">
                      {textPreviewContent}
                    </pre>
                  </div>
                )}

                {!isImage && !isPDF && !isOffice && !isText && (
                  <div className="text-center p-8 bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 max-w-sm shadow-md">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center text-slate-400 dark:text-zinc-600 mx-auto mb-4">
                      {getFileIcon(previewItem.name)}
                    </div>
                    <h4 className="font-bold text-slate-700 dark:text-zinc-350">{previewItem.name}</h4>
                    <p className="text-xs text-slate-505 mt-2 mb-6">
                      {t('drive', 'previewNotSupported', lang)}
                    </p>
                    <button
                      onClick={() => {
                        setSelectedItem(previewItem);
                        handleDownload();
                      }}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-black text-white font-bold rounded-xl text-xs shadow-md transition-colors inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      {t('drive', 'downloadFile', lang)}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Filter and sort items dynamically in the frontend
  const itemsToFilter = (searchQuery.trim() !== '' && allRecursiveItems !== null)
    ? allRecursiveItems
    : items;

  const filteredItems = itemsToFilter.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = filteredItems.filter(item => !item.id);
  const files = filteredItems.filter(item => item.id);

  const sortedFolders = [...folders].sort((a, b) => {
    const valA = a.name;
    const valB = b.name;
    return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === 'name') {
      return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (sortBy === 'size') {
      const sizeA = a.metadata?.size || 0;
      const sizeB = b.metadata?.size || 0;
      return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
    } else {
      const dateA = new Date(a.updated_at || 0).getTime();
      const dateB = new Date(b.updated_at || 0).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    }
  });

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
    <div className="space-y-6 md:space-y-8 animate-page-transition pt-12 md:pt-0 h-full flex flex-col">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-teal-900 dark:text-white">
          {t('drive', 'pageTitle', lang)}
        </h1>
        <p className="text-xs md:text-sm text-teal-700 dark:text-gray-400">
          {t('drive', 'pageSubtitle', lang)}
        </p>
      </div>

      <div className="animate-fade-in relative w-full h-[calc(100vh-220px)] flex flex-col bg-white dark:bg-gray-900/50 border border-slate-200 dark:border-gray-800 rounded-3xl shadow-sm">
      {/* Top action header containing breadcrumbs and upload controls */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-gray-800 bg-white/50 dark:bg-zinc-950/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
        
        {/* Breadcrumbs Navigation */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold py-1">

          {isGlobalAdmin && (
            <div className="relative flex items-center group/crumb">
              <button
                onClick={() => setCurrentPath('')}
                className={`px-2.5 py-1 rounded-l-lg transition-colors whitespace-nowrap ${currentPath === '' ? 'text-indigo-750 bg-indigo-50 dark:text-yellow-500 dark:bg-yellow-500/10' : 'text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-gray-800'}`}
              >
                {t('drive', 'breadcrumbRoot', lang)}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const isMenuOpen = activeMenu === 'crumb-root';
                  setActiveMenu(isMenuOpen ? null : 'crumb-root');
                  if (!isMenuOpen) {
                    fetchSubfoldersForCrumb('');
                  }
                }}
                className="px-1.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-r-lg text-slate-400 dark:text-gray-500 hover:text-slate-750 dark:hover:text-white transition-colors"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              
              {activeMenu === 'crumb-root' && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 z-50 text-left">
                  <div className="px-3 py-1 text-[10px] font-black text-slate-405 dark:text-zinc-550 uppercase tracking-wider">
                    {t('drive', 'folders', lang)}
                  </div>
                  {loadingCrumbSubfolders ? (
                    <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-zinc-500 italic">
                      {t('common', 'loading', lang)}
                    </div>
                  ) : crumbSubfolders.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-zinc-500 italic">
                      {t('drive', 'noFolders', lang)}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto">
                      {crumbSubfolders.map((folder) => (
                        <button
                          key={folder.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(null);
                            setCurrentPath(folder.fullPath);
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-350 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                        >
                          <svg className="w-3.5 h-3.5 text-indigo-500 dark:text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          </svg>
                          <span className="truncate">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-slate-100 dark:border-zinc-800 my-1"></div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(null);
                      setCurrentPath('');
                      setIsCreateFolderOpen(true);
                    }}
                    className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-350 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t('drive', 'newFolder', lang)}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(null);
                      setCurrentPath('');
                      fileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-1.5 text-xs text-slate-755 dark:text-zinc-350 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {t('drive', 'uploadFile', lang)}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isGlobalAdmin && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-slate-400 dark:text-gray-500 whitespace-nowrap font-bold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              {t('drive', 'pageTitle', lang)}
            </div>
          )}

          {breadcrumbs.map((crumb, idx) => {
            const isDeptRoot = !isGlobalAdmin && idx === 0;
            const pathStr = breadcrumbs.slice(0, idx + 1).join('/');
            const parentPath = breadcrumbs.slice(0, idx).join('/');

            return (
              <React.Fragment key={idx}>
                <svg className="w-3.5 h-3.5 text-slate-300 dark:text-gray-650 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
                <div className="relative flex items-center group/crumb bg-slate-50/50 dark:bg-zinc-900/30 border border-slate-200/50 dark:border-zinc-800/50 rounded-lg shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition-colors">
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="px-2.5 py-1 whitespace-nowrap text-xs font-bold text-indigo-750 bg-indigo-50/60 dark:text-yellow-500 dark:bg-yellow-500/10 rounded-l-lg">
                      {crumb}
                    </span>
                  ) : (
                    <button
                      onClick={() => navigateToCrumb(idx)}
                      className="px-2.5 py-1 transition-colors whitespace-nowrap text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-gray-800 rounded-l-lg"
                    >
                      {crumb}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const isMenuOpen = activeMenu === `crumb-${idx}`;
                      setActiveMenu(isMenuOpen ? null : `crumb-${idx}`);
                      if (!isMenuOpen) {
                        fetchSubfoldersForCrumb(parentPath);
                      }
                    }}
                    className="px-1.5 py-1.5 hover:bg-slate-200 dark:hover:bg-gray-800/80 border-l border-slate-200/50 dark:border-zinc-800/50 text-slate-450 dark:text-zinc-500 hover:text-slate-750 dark:hover:text-white transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  
                  {activeMenu === `crumb-${idx}` && (
                    <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 z-50 text-left">
                      <div className="px-3 py-1 text-[10px] font-black text-slate-405 dark:text-zinc-550 uppercase tracking-wider">
                        {t('drive', 'folders', lang)}
                      </div>
                      {loadingCrumbSubfolders ? (
                        <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-zinc-500 italic">
                          {t('common', 'loading', lang)}
                        </div>
                      ) : crumbSubfolders.length === 0 ? (
                        <div className="px-3 py-1.5 text-xs text-slate-400 dark:text-zinc-500 italic">
                          {t('drive', 'noFolders', lang)}
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto">
                          {crumbSubfolders.map((folder) => (
                            <button
                              key={folder.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null);
                                setCurrentPath(folder.fullPath);
                              }}
                              className="w-full px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                            >
                              <svg className="w-3.5 h-3.5 text-indigo-500 dark:text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                              </svg>
                              <span className="truncate">{folder.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-slate-100 dark:border-zinc-800 my-1"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(null);
                          setCurrentPath(pathStr);
                          setIsCreateFolderOpen(true);
                        }}
                        className="w-full px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        {t('drive', 'newFolder', lang)}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(null);
                          setCurrentPath(pathStr);
                          fileInputRef.current?.click();
                        }}
                        className="w-full px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {t('drive', 'uploadFile', lang)}
                      </button>
                      
                      {(!isDeptRoot || isGlobalAdmin) && (
                        <>
                          <div className="border-t border-slate-100 dark:border-zinc-800 my-1"></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(null);
                              setSelectedItem({ name: crumb, id: null, fullPath: pathStr });
                              setRenameValue(crumb);
                              setIsRenameOpen(true);
                            }}
                            className="w-full px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-2 font-semibold text-left"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                            {t('drive', 'rename', lang)}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(null);
                              setSelectedItem({ name: crumb, id: null, fullPath: pathStr });
                              setIsDeleteOpen(true);
                            }}
                            className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-2 font-semibold text-left"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            {t('drive', 'delete', lang)}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action buttons on the right */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-shrink-0">
          <button
            onClick={() => setIsCreateFolderOpen(true)}
            className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700/65 text-slate-750 dark:text-zinc-300 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('drive', 'newFolder', lang)}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:text-black dark:hover:bg-yellow-450 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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

      {/* Main Workspace Body wrapper */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">

        {/* Left Side: Storage area workspace */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Controls toolbar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-slate-50/60 dark:bg-black/10 px-6 py-3.5 border-b border-slate-100 dark:border-gray-800/80 flex-shrink-0">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-450 dark:text-zinc-550">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={t('drive', 'searchPlaceholder', lang)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black/40 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider mr-1">{t('drive', 'sortByLabel', lang)}</span>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-yellow-500"
                >
                  <option value="name">{t('drive', 'name', lang)}</option>
                  <option value="updated_at">{t('drive', 'lastModified', lang)}</option>
                  <option value="size">{t('drive', 'size', lang)}</option>
                </select>

                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1.5 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortOrder === 'asc' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-1l-4 4m0 0l-4-4m4 4V8" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="h-5 w-[1px] bg-slate-200 dark:bg-gray-800 mx-1"></div>

              <div className="flex bg-slate-100 dark:bg-gray-950 p-1 rounded-xl border border-slate-200 dark:border-gray-800">
                <button
                  onClick={() => setLayoutMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${layoutMode === 'grid' ? 'bg-white dark:bg-zinc-900 text-indigo-650 dark:text-yellow-500 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-350'}`}
                  title="Grid View"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setLayoutMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${layoutMode === 'list' ? 'bg-white dark:bg-zinc-900 text-indigo-650 dark:text-yellow-500 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-350'}`}
                  title="List View"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>


          {/* Storage Area Workspace */}
          <div
            className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-black/5 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 bg-indigo-600/10 dark:bg-yellow-500/10 backdrop-blur-[2px] border-2 border-dashed border-indigo-600 dark:border-yellow-500 rounded-3xl m-2 flex flex-col items-center justify-center z-30 transition-all duration-300 pointer-events-none">
                <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl shadow-xl flex flex-col items-center gap-3 border border-slate-100 dark:border-gray-800">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-yellow-500/10 flex items-center justify-center text-indigo-600 dark:text-yellow-500 animate-bounce">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-855 dark:text-white">
                    {t('drive', 'dropToUpload', lang)}
                  </p>
                </div>
              </div>
            )}
            {loading || searchLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-pulse text-slate-400 font-semibold">{t('common', 'loading', lang)}</div>
              </div>
            ) : (searchQuery.trim() !== '' && filteredItems.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 bg-slate-50 dark:bg-zinc-900/50 rounded-full flex items-center justify-center mb-4 text-slate-400">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-750 dark:text-zinc-300">
                  {t('drive', 'noFilesFound', lang)}
                </h3>
                <p className="text-xs text-slate-505 mt-2">
                  {t('drive', 'noFilesMatch', lang)}
                </p>
              </div>
            ) : layoutMode === 'grid' ? (
              <div className="space-y-6">
                {/* Folders grid section */}
                {((searchQuery === '' && currentPath !== '') || sortedFolders.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-455 dark:text-zinc-550 uppercase tracking-widest">{t('drive', 'folders', lang)}</h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                      {currentPath !== '' && searchQuery === '' && renderBackGridItem()}
                      {sortedFolders.map(folder => renderFolderGridItem(folder))}
                    </div>
                  </div>
                )}

                {/* Files grid section */}
                {sortedFiles.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-405 dark:text-zinc-550 uppercase tracking-widest">{t('drive', 'files', lang)}</h3>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
                      {sortedFiles.map(file => renderFileGridItem(file))}
                    </div>
                  </div>
                )}

                {/* Empty folder message inside grid view */}
                {sortedFolders.length === 0 && sortedFiles.length === 0 && (
                  <div className="flex flex-col items-center justify-center text-center p-8 py-20">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-gray-800/80 rounded-full flex items-center justify-center mb-4 text-indigo-300 dark:text-gray-600">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-zinc-350">{t('drive', 'emptyFolder', lang)}</h3>
                    <p className="text-xs text-slate-500 mt-2">{t('drive', 'dragDrop', lang)}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {renderListView()}
                
                {/* Empty folder message inside list view */}
                {sortedFolders.length === 0 && sortedFiles.length === 0 && (
                  <div className="flex flex-col items-center justify-center text-center p-8 py-16">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-gray-800/80 rounded-full flex items-center justify-center mb-3 text-indigo-300 dark:text-gray-655">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <h4 className="font-bold text-slate-750 dark:text-zinc-300 text-sm">{t('drive', 'emptyFolder', lang)}</h4>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right side details panel (inside the container box) */}
        {selectedItem && showDetailsPanel && (
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-150 dark:border-gray-800 bg-white/70 dark:bg-black/30 p-6 flex flex-col min-h-0 flex-shrink-0 overflow-y-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('drive', 'fileDetails', lang)}</h3>
              <button onClick={() => { setSelectedItem(null); setShowDetailsPanel(false); }} className="p-1 text-slate-400 hover:text-slate-650 dark:hover:text-white bg-slate-100 dark:bg-gray-800 rounded-full">
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
              {selectedItem.id ? (
                <span className="text-xs font-semibold text-slate-500 mt-2 bg-slate-200 dark:bg-gray-800 px-2.5 py-1 rounded-md">
                  {formatBytes(selectedItem.metadata?.size || 0)}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-500 mt-2 bg-slate-200 dark:bg-gray-800 px-2.5 py-1 rounded-md">
                  Folder
                </span>
              )}
            </div>

            <div className="space-y-4 text-sm mb-8 flex-1">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('drive', 'type', lang)}</p>
                <p className="font-medium text-slate-700 dark:text-zinc-300">
                  {selectedItem.id ? (selectedItem.metadata?.mimetype || 'Unknown') : 'Directory'}
                </p>
              </div>
              {selectedItem.updated_at && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('drive', 'lastModified', lang)}</p>
                  <p className="font-medium text-slate-700 dark:text-zinc-300">{new Date(selectedItem.updated_at).toLocaleString()}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              {selectedItem.id && (
                <button onClick={handleDownload} className="w-full py-2.5 bg-indigo-50 dark:bg-yellow-500/10 text-indigo-700 dark:text-yellow-500 font-bold rounded-xl hover:bg-indigo-100 dark:hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {t('drive', 'download', lang)}
                </button>
              )}
              <button onClick={() => { setRenameValue(selectedItem.name); setIsRenameOpen(true); }} className="w-full py-2.5 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-zinc-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                {t('drive', 'rename', lang)}
              </button>
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

      {/* Floating Premium Dustbin Area */}
      <div 
        onDragOver={handleTrashDragOver}
        onDragLeave={handleTrashDragLeave}
        onDrop={handleTrashDrop}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-4 rounded-3xl border-2 backdrop-blur-xl transition-all duration-300 ${
          draggedItem 
            ? 'translate-y-0 opacity-100 scale-100 pointer-events-auto shadow-2xl' 
            : 'translate-y-20 opacity-0 scale-90 pointer-events-none'
        } ${
          isOverTrash 
            ? 'bg-rose-500/20 border-rose-500 text-rose-600 shadow-rose-500/25 ring-4 ring-rose-500/20 scale-105' 
            : 'bg-white/95 dark:bg-zinc-950/95 border-slate-200 dark:border-zinc-800 text-slate-500 hover:border-rose-400 hover:text-rose-600 dark:hover:border-rose-500/50'
        }`}
      >
        <div className={`p-3 rounded-2xl transition-all duration-300 ${isOverTrash ? 'bg-rose-500 text-white animate-pulse' : 'bg-rose-50/50 dark:bg-rose-500/10 text-rose-500'}`}>
          <svg className={`w-8 h-8 ${isOverTrash ? 'scale-110' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <div className="text-left select-none">
          <p className={`text-sm font-black tracking-wide uppercase ${isOverTrash ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}>
            {t('drive', 'dropToDelete', lang)}
          </p>
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">
            {draggedItem ? t('drive', 'permanentlyDelete', lang).replace('{name}', draggedItem.name) : ''}
          </p>
        </div>
      </div>

      {renderPreviewModal()}

    </div>
  </div>
  );
}
