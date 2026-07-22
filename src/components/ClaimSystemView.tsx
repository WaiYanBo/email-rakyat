import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';
import { sanitizeInput } from '../utils/security';

export default function ClaimSystemView() {
  const { lang } = usePortalLanguage();
  const isBm = lang === 'bm';

  // State
  const [profile, setProfile] = useState<any>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [loading, setLoading] = useState(true);

  // Entitlement & Stats State
  const [entitlement, setEntitlement] = useState<{ medical_total: number; medical_used: number }>({
    medical_total: 500.00,
    medical_used: 0.00
  });

  // Claims List State
  const [claims, setClaims] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'pending' | 'draft' | 'approved' | 'rejected' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<any>(null);

  // Form State
  const [claimType, setClaimType] = useState<'Meal' | 'Mileage' | 'Medical' | 'Other'>('Meal');
  const [claimDate, setClaimDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actualAmount, setActualAmount] = useState<string>('');

  // Mileage specific
  const [startLocation, setStartLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicleType, setVehicleType] = useState<'Car' | 'Motorcycle'>('Car');
  const [distanceKm, setDistanceKm] = useState<string>('');

  // Receipt File State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [existingReceiptName, setExistingReceiptName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Rejection Modal State
  const [rejectModalClaim, setRejectModalClaim] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // View Receipt Modal State
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [viewReceiptTitle, setViewReceiptTitle] = useState<string>('');

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/portal/login';
        return;
      }

      // 1. Load Profile & Role
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, department, avatar_url, roles ( role_name )')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        let roleName = 'Staff';
        if (profileData.roles) {
          const r = profileData.roles as any;
          roleName = Array.isArray(r) ? (r[0]?.role_name || 'Staff') : (r?.role_name || 'Staff');
        }

        const userProfile = {
          id: profileData.id,
          full_name: profileData.full_name,
          department: profileData.department,
          avatar_url: profileData.avatar_url,
          role: roleName
        };

        setProfile(userProfile);

        const approverRoles = ['IT Admin', 'HR', 'CFO', 'CEO', 'Chairman', 'COO', 'General Manager', 'Head of Department'];
        const isUserApprover = approverRoles.includes(roleName);
        setIsApprover(isUserApprover);
        if (!isUserApprover) {
          setActiveTab('my');
        }

        // 2. Load Medical Entitlement
        const currentYear = new Date().getFullYear();
        const { data: entData } = await supabase
          .from('claim_entitlements')
          .select('medical_total, medical_used')
          .eq('profile_id', profileData.id)
          .eq('year', currentYear)
          .single();

        if (entData) {
          setEntitlement({
            medical_total: Number(entData.medical_total) || 500.00,
            medical_used: Number(entData.medical_used) || 0.00
          });
        }

        // 3. Load Claims
        await fetchClaims(userProfile.id, isUserApprover);
      }
    } catch (err) {
      console.error('Error initializing Claims module:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClaims = async (profileId: string, approver: boolean) => {
    let query = supabase.from('claims').select('*').order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching claims:', error);
      return;
    }
    setClaims(data || []);
  };

  // Live Calculation Helpers
  const remainingMedical = Math.max(0, entitlement.medical_total - entitlement.medical_used);

  const calculateLivePayable = () => {
    const act = Math.max(0, parseFloat(actualAmount) || 0);
    if (claimType === 'Meal') {
      return Math.min(act, 7.00);
    } else if (claimType === 'Mileage') {
      const dist = Math.max(0, parseFloat(distanceKm) || 0);
      const rate = vehicleType === 'Motorcycle' ? 0.20 : 0.60;
      return Math.round(dist * rate * 100) / 100;
    } else if (claimType === 'Medical') {
      return Math.min(act, remainingMedical);
    }
    return act;
  };

  // Modal Reset
  const openNewClaimModal = () => {
    setEditingClaim(null);
    setClaimType('Meal');
    setClaimDate(new Date().toISOString().split('T')[0]);
    setTitle('');
    setDescription('');
    setActualAmount('');
    setStartLocation('');
    setDestination('');
    setVehicleType('Car');
    setDistanceKm('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(null);
    setExistingReceiptName(null);
    setIsModalOpen(true);
  };

  const openEditClaimModal = (claim: any) => {
    setEditingClaim(claim);
    setClaimType(claim.claim_type || 'Meal');
    setClaimDate(claim.claim_date || new Date().toISOString().split('T')[0]);
    setTitle(claim.title || '');
    setDescription(claim.description || '');
    setActualAmount(claim.actual_amount ? String(claim.actual_amount) : '');
    setStartLocation(claim.start_location || '');
    setDestination(claim.destination || '');
    setVehicleType(claim.vehicle_type || 'Car');
    setDistanceKm(claim.distance_km ? String(claim.distance_km) : '');
    setReceiptFile(null);
    setReceiptPreview(null);
    setExistingReceiptPath(claim.receipt_path || null);
    setExistingReceiptName(claim.receipt_name || null);
    setIsModalOpen(true);
  };

  // Handle File Change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert(isBm ? 'Saiz fail melebihi 10MB.' : 'File size exceeds 10MB limit.');
        return;
      }
      setReceiptFile(file);
      if (file.type.startsWith('image/')) {
        setReceiptPreview(URL.createObjectURL(file));
      } else {
        setReceiptPreview(null);
      }
    }
  };

  // Save or Submit Claim Handler
  const handleSaveClaim = async (targetStatus: 'Draft' | 'Pending Approval') => {
    if (!profile) return;

    if (!title.trim()) {
      alert(isBm ? 'Sila masukkan tajuk tuntutan.' : 'Please enter a title for the claim.');
      return;
    }

    if (targetStatus === 'Pending Approval' && !receiptFile && !existingReceiptPath) {
      alert(isBm ? 'Sila muat naik resit sebelum menghantar tuntutan.' : 'Please upload a receipt file before submitting the claim.');
      return;
    }

    if (claimType === 'Meal' && (!actualAmount || parseFloat(actualAmount) <= 0)) {
      alert(isBm ? 'Sila masukkan jumlah resit yang sah.' : 'Please enter a valid receipt amount.');
      return;
    }

    if (claimType === 'Mileage') {
      if (!startLocation.trim() || !destination.trim()) {
        alert(isBm ? 'Sila masukkan lokasi awal dan destinasi.' : 'Please enter start location and destination.');
        return;
      }
      if (!distanceKm || parseFloat(distanceKm) <= 0) {
        alert(isBm ? 'Sila masukkan jarak (KM) yang sah.' : 'Please enter a valid distance in KM.');
        return;
      }
    }

    if (claimType === 'Medical' && (!actualAmount || parseFloat(actualAmount) <= 0)) {
      alert(isBm ? 'Sila masukkan jumlah tuntutan perubatan.' : 'Please enter a valid medical claim amount.');
      return;
    }

    try {
      setUploadingFile(true);
      let receiptPath = existingReceiptPath;
      let receiptName = existingReceiptName;

      // 1. Upload File if new file selected
      if (receiptFile) {
        const staffFolderName = `${profile.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_${profile.id.slice(0, 6)}`;
        const timeStamp = Date.now();
        const cleanFileName = receiptFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uploadPath = `${staffFolderName}/${timeStamp}_${cleanFileName}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('claim-receipts')
          .upload(uploadPath, receiptFile, { upsert: true });

        if (uploadErr) {
          console.error('Storage upload error:', uploadErr);
          alert(isBm ? 'Gagal memuat naik resit. Sila cuba lagi.' : 'Failed to upload receipt file. Please try again.');
          setUploadingFile(false);
          return;
        }

        receiptPath = uploadData.path;
        receiptName = receiptFile.name;
      }

      // 2. Prepare Database Payload
      const computedActual = claimType === 'Mileage'
        ? Math.round(Math.max(0, parseFloat(distanceKm) || 0) * (vehicleType === 'Motorcycle' ? 0.20 : 0.60) * 100) / 100
        : Math.max(0, parseFloat(actualAmount) || 0);

      const payload: any = {
        profile_id: profile.id,
        staff_name: profile.full_name,
        claim_type: claimType,
        claim_date: claimDate,
        title: sanitizeInput(title),
        description: sanitizeInput(description),
        actual_amount: computedActual,
        start_location: claimType === 'Mileage' ? sanitizeInput(startLocation) : null,
        destination: claimType === 'Mileage' ? sanitizeInput(destination) : null,
        vehicle_type: claimType === 'Mileage' ? vehicleType : null,
        distance_km: claimType === 'Mileage' ? Math.max(0, parseFloat(distanceKm) || 0) : 0,
        receipt_path: receiptPath,
        receipt_name: receiptName,
        status: targetStatus,
        rejection_reason: targetStatus === 'Pending Approval' ? null : (editingClaim?.rejection_reason || null),
        updated_at: new Date().toISOString()
      };

      if (editingClaim) {
        const { error } = await supabase.from('claims').update(payload).eq('id', editingClaim.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('claims').insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      await loadInitialData();
    } catch (err: any) {
      console.error('Save claim error:', err);
      alert(err.message || 'An error occurred while saving claim.');
    } finally {
      setUploadingFile(false);
    }
  };

  // Delete Draft
  const handleDeleteClaim = async (id: string) => {
    if (!confirm(isBm ? 'Adakah anda pasti mahu memadam draf ini?' : 'Are you sure you want to delete this draft?')) return;
    try {
      const targetClaim = claims.find(c => c.id === id);
      if (targetClaim?.receipt_path) {
        await supabase.storage.from('claim-receipts').remove([targetClaim.receipt_path]);
      }
      const { error } = await supabase.from('claims').delete().eq('id', id);
      if (error) throw error;
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete claim.');
    }
  };

  // Approve Claim Handler
  const handleApproveClaim = async (claim: any) => {
    if (!profile || !isApprover) return;
    try {
      setSubmittingAction(true);
      const { error } = await supabase
        .from('claims')
        .update({
          status: 'Approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', claim.id);

      if (error) throw error;
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve claim.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Reject Claim Handler (Mandatory Reason)
  const handleConfirmReject = async () => {
    if (!rejectModalClaim || !profile) return;
    if (!rejectionReason.trim()) {
      alert(isBm ? 'Sebab penolakan adalah wajib.' : 'Rejection remark is mandatory.');
      return;
    }

    try {
      setSubmittingAction(true);
      const { error } = await supabase
        .from('claims')
        .update({
          status: 'Rejected',
          approved_by: profile.id,
          rejection_reason: sanitizeInput(rejectionReason),
          approved_at: new Date().toISOString()
        })
        .eq('id', rejectModalClaim.id);

      if (error) throw error;
      setRejectModalClaim(null);
      setRejectionReason('');
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject claim.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Mark as Paid Handler
  const handleMarkAsPaid = async (claim: any) => {
    if (!profile || !isApprover) return;
    try {
      setSubmittingAction(true);
      const { error } = await supabase
        .from('claims')
        .update({
          status: 'Paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', claim.id);

      if (error) throw error;
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to mark claim as paid.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // View Receipt Signed URL Handler
  const handleViewReceipt = async (claim: any) => {
    if (!claim.receipt_path) return;
    try {
      const { data, error } = await supabase.storage
        .from('claim-receipts')
        .createSignedUrl(claim.receipt_path, 300); // 5 min signed URL

      if (error) throw error;

      if (data?.signedUrl) {
        setViewReceiptUrl(data.signedUrl);
        setViewReceiptTitle(`${claim.claim_no} - ${claim.title}`);
      }
    } catch (err: any) {
      console.error('Error fetching signed receipt URL:', err);
      alert(isBm ? 'Gagal membuka resit keselamatan.' : 'Unable to view secure receipt attachment.');
    }
  };

  // Filtered Claims List
  const filteredClaims = claims.filter(c => {
    if (activeTab === 'my') {
      if (c.profile_id !== profile?.id) return false;
    } else if (activeTab === 'pending') {
      if (c.status !== 'Pending Approval') return false;
    } else if (activeTab === 'draft') {
      if (c.status !== 'Draft') return false;
    } else if (activeTab === 'approved') {
      if (c.status !== 'Approved') return false;
    } else if (activeTab === 'rejected') {
      if (c.status !== 'Rejected') return false;
    } else if (activeTab === 'paid') {
      if (c.status !== 'Paid') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNo = (c.claim_no || '').toLowerCase().includes(q);
      const matchTitle = (c.title || '').toLowerCase().includes(q);
      const matchStaff = (c.staff_name || '').toLowerCase().includes(q);
      const matchType = (c.claim_type || '').toLowerCase().includes(q);
      return matchNo || matchTitle || matchStaff || matchType;
    }

    return true;
  });

  // Calculate Summary Stats
  const pendingCount = claims.filter(c => c.status === 'Pending Approval').length;
  const approvedThisMonth = claims.filter(c => {
    if (c.status !== 'Approved' && c.status !== 'Paid') return false;
    const dateStr = c.approved_at || c.paid_at || c.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((sum, c) => sum + Number(c.payable_amount || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
          {t('common', 'loading', lang)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Quick Overview Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-slate-200/80 dark:border-gray-800 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>💳</span>
            <span>{t('claims', 'pageTitle', lang)}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t('claims', 'pageSubtitle', lang)}
          </p>
        </div>

        <button
          onClick={openNewClaimModal}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-slate-950 font-extrabold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>{t('claims', 'newClaimBtn', lang)}</span>
        </button>
      </div>

      {/* 2. Medical Entitlement & Summary Cards (Identical Cards & SVG Icons) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        {/* Card A: Medical Entitlement Card */}
        <div className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-5 rounded-2xl border border-slate-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between h-full">
          <div>
            <div className="flex justify-between items-center gap-2 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                {t('claims', 'medicalBalanceTitle', lang)} ({new Date().getFullYear()})
              </p>
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20 text-base font-extrabold">
                🏥
              </div>
            </div>

            <div className="my-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  RM {remainingMedical.toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">
                  / RM {entitlement.medical_total.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden my-3">
              <div
                className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (remainingMedical / entitlement.medical_total) * 100)}%` }}
              ></div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium pt-1">
            {t('claims', 'medicalUsed', lang)}: RM {entitlement.medical_used.toFixed(2)}
          </p>
        </div>

        {/* Card B: Pending Approval Claims */}
        <div className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-5 rounded-2xl border border-slate-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between h-full">
          <div>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
              {isBm ? 'Menunggu Kelulusan' : 'Pending Approval'}
            </p>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                {pendingCount}
              </span>
              <span className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
                {isBm ? 'tuntutan' : 'claims'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 pt-1">
            {isApprover ? (isBm ? 'Memerlukan kelulusan anda' : 'Requires your approval') : (isBm ? 'Dalam proses semakan HR/Pengurusan' : 'Under HR/Management review')}
          </p>
        </div>

        {/* Card C: Total Approved This Month */}
        <div className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-5 rounded-2xl border border-slate-200/80 dark:border-gray-800 shadow-sm flex flex-col justify-between h-full sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
              {isBm ? 'Diluluskan Bulan Ini' : 'Approved This Month'}
            </p>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                RM {approvedThisMonth.toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 pt-1">
            {isBm ? 'Jumlah bayaran perbelanjaan yang disahkan' : 'Total verified expense payout'}
          </p>
        </div>
      </div>

      {/* 3. Claims Directory Filters & Search */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200/80 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-wrap sm:flex-nowrap">
            {isApprover && (
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'all'
                  ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                {isBm ? 'Semua (Kakitangan)' : 'All Staff Claims'} ({claims.length})
              </button>
            )}
            <button
              onClick={() => setActiveTab('my')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'my'
                ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {isBm ? 'Tuntutan Saya' : 'My Claims'}
            </button>
            {isApprover && (
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === 'pending'
                  ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span>{isBm ? 'Menunggu Kelulusan' : 'Pending Review'}</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-rose-600 text-white rounded-full font-bold">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'draft'
                ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {isBm ? 'Draf' : 'Drafts'}
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'approved'
                ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {isBm ? 'Diluluskan' : 'Approved'}
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'rejected'
                ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {isBm ? 'Ditolak' : 'Rejected'}
            </button>
            <button
              onClick={() => setActiveTab('paid')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === 'paid'
                ? 'bg-amber-500 text-slate-950 dark:bg-yellow-500 dark:text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {isBm ? 'Dibayar' : 'Paid'}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64 flex-shrink-0">
            <input
              type="text"
              placeholder={isBm ? 'Cari no tuntutan, tajuk...' : 'Search claim no, title...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 dark:focus:border-yellow-500 shadow-sm"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Claims Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr className="bg-slate-100/90 dark:bg-gray-800/80 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-gray-800 uppercase text-[11px] tracking-wider">
                <th className="px-4 py-3.5 w-[140px]">{t('claims', 'colClaimNo', lang)}</th>
                <th className="px-4 py-3.5 w-[110px]">{t('claims', 'colDate', lang)}</th>
                <th className="px-4 py-3.5 w-[150px]">{t('claims', 'colStaff', lang)}</th>
                <th className="px-4 py-3.5 min-w-[200px]">{t('claims', 'colTypeTitle', lang)}</th>
                <th className="px-4 py-3.5 w-[130px]">{t('claims', 'colReceiptAmount', lang)}</th>
                <th className="px-4 py-3.5 w-[140px]">{t('claims', 'colPayableAmount', lang)}</th>
                <th className="px-4 py-3.5 w-[110px] text-center">{t('claims', 'colReceipt', lang)}</th>
                <th className="px-4 py-3.5 w-[140px] text-center">{t('claims', 'colStatus', lang)}</th>
                <th className="px-4 py-3.5 w-[130px] text-right">{t('claims', 'colActions', lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {filteredClaims.length > 0 ? (
                filteredClaims.map((c) => {
                  const isOwner = c.profile_id === profile?.id;
                  const canEditDraft = isOwner && (c.status === 'Draft' || c.status === 'Rejected');

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-zinc-200">
                        {c.claim_no}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                        {c.claim_date}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                        {c.staff_name || 'Staff'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-zinc-100">
                            {c.claim_type === 'Meal' && '🍱 Meal'}
                            {c.claim_type === 'Mileage' && '🚗 Mileage'}
                            {c.claim_type === 'Medical' && '🏥 Medical'}
                            {c.claim_type === 'Other' && '📄 Other'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">{c.title}</span>
                          {c.claim_type === 'Mileage' && (
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 italic">
                              {c.vehicle_type} ({c.distance_km} KM: {c.start_location} → {c.destination})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-zinc-400">
                        RM {Number(c.actual_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-extrabold text-indigo-600 dark:text-yellow-400">
                        RM {Number(c.payable_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {c.receipt_path ? (
                          <button
                            onClick={() => handleViewReceipt(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition-all cursor-pointer"
                          >
                            <span>📎 {isBm ? 'Lihat' : 'View'}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-600 italic">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {c.status === 'Draft' && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                            📝 {t('claims', 'statusDraft', lang)}
                          </span>
                        )}
                        {c.status === 'Pending Approval' && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            ⏳ {t('claims', 'statusPending', lang)}
                          </span>
                        )}
                        {c.status === 'Approved' && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            ✅ {t('claims', 'statusApproved', lang)}
                          </span>
                        )}
                        {c.status === 'Rejected' && (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                              ❌ {t('claims', 'statusRejected', lang)}
                            </span>
                            {c.rejection_reason && (
                              <span className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 italic max-w-[150px] truncate" title={c.rejection_reason}>
                                "{c.rejection_reason}"
                              </span>
                            )}
                          </div>
                        )}
                        {c.status === 'Paid' && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                            💰 {t('claims', 'statusPaid', lang)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEditDraft && (
                            <>
                              <button
                                onClick={() => openEditClaimModal(c)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-bold cursor-pointer"
                              >
                                {t('claims', 'btnEdit', lang)}
                              </button>
                              {c.status === 'Draft' && (
                                <button
                                  onClick={() => handleDeleteClaim(c.id)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold cursor-pointer"
                                >
                                  {t('claims', 'btnDelete', lang)}
                                </button>
                              )}
                            </>
                          )}

                          {isApprover && c.status === 'Pending Approval' && (
                            <>
                              <button
                                onClick={() => handleApproveClaim(c)}
                                disabled={submittingAction}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                              >
                                {t('claims', 'btnApprove', lang)}
                              </button>
                              <button
                                onClick={() => {
                                  setRejectModalClaim(c);
                                  setRejectionReason('');
                                }}
                                disabled={submittingAction}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                              >
                                {t('claims', 'btnReject', lang)}
                              </button>
                            </>
                          )}

                          {isApprover && c.status === 'Approved' && (
                            <button
                              onClick={() => handleMarkAsPaid(c)}
                              disabled={submittingAction}
                              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                            >
                              {t('claims', 'btnMarkPaid', lang)}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-3xl opacity-40">📥</span>
                      <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                        {isBm ? 'Tiada tuntutan dijumpai.' : 'No claims found.'}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500">
                        {isBm ? 'Klik "+ Hantar Tuntutan Baharu" untuk mencipta tuntutan.' : 'Click "+ Submit New Claim" to create a new expense request.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. New / Edit Claim Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-gray-800 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 dark:border-gray-800 flex justify-between items-center bg-slate-50/50 dark:bg-gray-800/40">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingClaim ? (isBm ? 'Kemaskini Tuntutan' : 'Edit Claim') : (isBm ? 'Hantar Tuntutan Baharu' : 'Submit New Expense Claim')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Type Switcher */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wide">
                  {isBm ? 'Jenis Tuntutan' : 'Claim Category'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setClaimType('Meal')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${claimType === 'Meal'
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-yellow-500 dark:text-slate-950 dark:border-yellow-500 shadow-sm'
                      : 'border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    🍱 {isBm ? 'Elaun Makan' : 'Meal (RM7 Cap)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimType('Mileage')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${claimType === 'Mileage'
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-yellow-500 dark:text-slate-950 dark:border-yellow-500 shadow-sm'
                      : 'border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    🚗 {isBm ? 'Perbatuan (KM)' : 'Mileage'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimType('Medical')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${claimType === 'Medical'
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-yellow-500 dark:text-slate-950 dark:border-yellow-500 shadow-sm'
                      : 'border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    🏥 {isBm ? 'Perubatan' : 'Medical'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimType('Other')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${claimType === 'Other'
                      ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-yellow-500 dark:text-slate-950 dark:border-yellow-500 shadow-sm'
                      : 'border-slate-200 dark:border-gray-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    📄 {isBm ? 'Lain-lain / Am' : 'General'}
                  </button>
                </div>
              </div>

              {/* Basic Details: Date & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide mb-1">
                    {isBm ? 'Tarikh Tuntutan' : 'Claim Date'}
                  </label>
                  <input
                    type="date"
                    value={claimDate}
                    onChange={(e) => setClaimDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide mb-1">
                    {isBm ? 'Tajuk Tuntutan' : 'Claim Title / Purpose'}
                  </label>
                  <input
                    type="text"
                    placeholder={isBm ? 'cth: Makan Tengah Hari Lawatan Tapak' : 'e.g. Client Site Visit Lunch'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Dynamic Inputs per Claim Type */}

              {/* A. MEAL CLAIM FORM */}
              {claimType === 'Meal' && (
                <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">
                      {isBm ? 'Jumlah Resit Sebenar (RM)' : 'Actual Receipt Amount (RM)'}
                    </label>
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      ⚡ {isBm ? 'Maksimum: RM 7.00' : 'Cap: RM 7.00'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-lg font-extrabold text-slate-900 dark:text-white"
                  />

                  <div className="flex justify-between items-center text-xs pt-1 border-t border-indigo-100/70 dark:border-indigo-900/40">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">
                      {isBm ? 'Jumlah Layak Dibayar (Automatik):' : 'Automatically Payable Amount:'}
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      RM {calculateLivePayable().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* B. MILEAGE CLAIM FORM */}
              {claimType === 'Mileage' && (
                <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide mb-1">
                        {isBm ? 'Lokasi Awal' : 'Start Location'}
                      </label>
                      <input
                        type="text"
                        placeholder={isBm ? 'cth: Pejabat ER Advocaci' : 'e.g. ER Advocacy Office'}
                        value={startLocation}
                        onChange={(e) => setStartLocation(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide mb-1">
                        {isBm ? 'Destinasi' : 'Destination'}
                      </label>
                      <input
                        type="text"
                        placeholder={isBm ? 'cth: Taman Medan' : 'e.g. Taman Medan'}
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide mb-1">
                        {isBm ? 'Jenis Kenderaan' : 'Vehicle Type'}
                      </label>
                      <select
                        value={vehicleType}
                        onChange={(e: any) => setVehicleType(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
                      >
                        <option value="Car">🚗 {isBm ? 'Kereta (RM 0.60 / KM)' : 'Car (RM 0.60 / KM)'}</option>
                        <option value="Motorcycle">🏍️ {isBm ? 'Motosikal (RM 0.20 / KM)' : 'Motorcycle (RM 0.20 / KM)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide mb-1">
                        {isBm ? 'Jumlah Jarak (KM)' : 'Total Distance (KM)'}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={distanceKm}
                        onChange={(e) => setDistanceKm(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">
                      {isBm ? 'Jumlah Tuntutan Perbatuan Layak:' : 'Calculated Mileage Amount:'}
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      RM {calculateLivePayable().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* C. MEDICAL CLAIM FORM */}
              {claimType === 'Medical' && (
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wide">
                      {isBm ? 'Jumlah Resit Perubatan (RM)' : 'Actual Medical Receipt Amount (RM)'}
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {isBm ? `Baki Masih Ada: RM ${remainingMedical.toFixed(2)}` : `Remaining Balance: RM ${remainingMedical.toFixed(2)}`}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 rounded-xl text-lg font-extrabold text-slate-900 dark:text-white"
                  />

                  {parseFloat(actualAmount) > remainingMedical && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium italic">
                      ⚠️ {isBm ? `Jumlah resit melebihi baki perubatan. Tuntutan akan dihafal pada RM ${remainingMedical.toFixed(2)}.` : `Receipt exceeds balance. Payable amount will be capped at RM ${remainingMedical.toFixed(2)}.`}
                    </p>
                  )}

                  <div className="flex justify-between items-center text-xs pt-1 border-t border-emerald-100/70 dark:border-emerald-900/40">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">
                      {isBm ? 'Jumlah Layak Dibayar:' : 'Calculated Payable Amount:'}
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      RM {calculateLivePayable().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* D. GENERAL CLAIM FORM */}
              {claimType === 'Other' && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide mb-1">
                      {isBm ? 'Jumlah Resit (RM)' : 'Receipt Amount (RM)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={actualAmount}
                      onChange={(e) => setActualAmount(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-lg font-extrabold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Description textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wide mb-1">
                  {isBm ? 'Keterangan Lanjut' : 'Description / Remarks'}
                </label>
                <textarea
                  rows={2}
                  placeholder={isBm ? 'Catatan tambahan...' : 'Add details...'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                ></textarea>
              </div>

              {/* File Attachment Uploader */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide mb-1">
                  📎 {isBm ? 'Muat Naik Resit (Wajib - JPG, PNG, PDF)' : 'Upload Receipt File (Required - JPG, PNG, PDF)'}
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-gray-700 hover:border-indigo-500 rounded-2xl p-4 text-center bg-slate-50/50 dark:bg-gray-800/30 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="receipt-file-input"
                  />
                  <label htmlFor="receipt-file-input" className="cursor-pointer flex flex-col items-center justify-center gap-1">
                    <span className="text-2xl">📤</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-yellow-400 hover:underline">
                      {receiptFile ? receiptFile.name : (existingReceiptName || (isBm ? 'Pilih resit untuk dimuat naik' : 'Click to select receipt file'))}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                      {isBm ? 'Format yang disokong: JPG, PNG, PDF (Maksimum 10MB)' : 'Formats: JPG, PNG, PDF (Max 10MB)'}
                    </span>
                  </label>
                </div>

                {receiptPreview && (
                  <div className="mt-3 relative w-32 h-32 rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 shadow-sm">
                    <img src={receiptPreview} alt="Receipt preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/40 flex flex-col sm:flex-row justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 dark:border-gray-700 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                {isBm ? 'Batal' : 'Cancel'}
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => handleSaveClaim('Draft')}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 shadow-sm transition-all cursor-pointer"
                >
                  📝 {t('claims', 'saveDraftBtn', lang)}
                </button>
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => handleSaveClaim('Pending Approval')}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 text-white dark:text-slate-950 text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {uploadingFile ? (isBm ? 'Memuat naik...' : 'Saving...') : `✨ ${t('claims', 'submitClaimBtn', lang)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Mandatory Rejection Reason Modal */}
      {rejectModalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-gray-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>❌</span>
              <span>{isBm ? 'Tolak Tuntutan' : 'Reject Claim'}</span>
            </h3>

            <p className="text-xs text-slate-600 dark:text-zinc-400">
              {isBm ? 'Sila berikan sebab penolakan yang wajib supaya kakitangan memahami sebab tuntutan ditolak.' : 'Please provide a mandatory rejection remark so the employee understands why it was rejected.'}
            </p>

            <div>
              <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-1">
                * {isBm ? 'Catatan Penolakan (Wajib)' : 'Rejection Reason (Mandatory)'}
              </label>
              <textarea
                rows={3}
                required
                placeholder={t('claims', 'rejectReasonPlaceholder', lang)}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-rose-300 dark:border-rose-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              ></textarea>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalClaim(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-gray-700 text-xs font-bold text-slate-600 dark:text-zinc-300"
              >
                {isBm ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={submittingAction || !rejectionReason.trim()}
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {submittingAction ? (isBm ? 'Memproses...' : 'Processing...') : (isBm ? 'Sahkan Penolakan' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Secure Receipt Viewer Modal */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-gray-800/40">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                📎 {viewReceiptTitle}
              </h3>
              <button
                onClick={() => setViewReceiptUrl(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-100/50 dark:bg-black/40">
              {viewReceiptUrl.includes('.pdf') ? (
                <iframe src={viewReceiptUrl} className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-gray-800"></iframe>
              ) : (
                <img src={viewReceiptUrl} alt="Secure Receipt" className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md" />
              )}
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-gray-800 text-right bg-slate-50 dark:bg-gray-800/40">
              <a
                href={viewReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all inline-block"
              >
                {isBm ? '🔗 Buka Dalam Tab Baharu' : '🔗 Open in New Tab'}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
