import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Cropper from 'react-easy-crop';
import { t } from '../lib/portalI18n';
import type { Language } from '../lib/portalI18n';

interface ProfilePhotoUploadProps {
  userId: string;
  initialAvatarUrl: string | null;
  userInitials: string;
  onUploadSuccess: (url: string) => void;
  lang?: Language;
}

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.src = url
  })

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // We DO NOT apply the background here anymore. 
  // We just extract the cropped portion of the original image.
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) resolve(file)
      else reject(new Error("Canvas to Blob failed"))
    }, 'image/jpeg', 0.95)
  })
}
export default function ProfilePhotoUpload({ 
  userId, 
  initialAvatarUrl, 
  userInitials,
  onUploadSuccess,
  lang = 'en'
}: ProfilePhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  
  // Cropper State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  
  // Menu & View State
  const [showMenu, setShowMenu] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleContainerClick = () => {
    if (isUploading) return;
    if (avatarUrl) {
      setShowMenu(!showMenu);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleUpdatePhoto = () => {
    setShowMenu(false);
    fileInputRef.current?.click();
  };

  const handleRemovePhoto = async () => {
    try {
      setIsUploading(true);
      setShowMenu(false);
      setError(null);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (updateError) throw updateError;
      
      setAvatarUrl(null);
      onUploadSuccess('');
      } catch (err: any) {
      setError(err.message || t('settings', 'removeFailed', lang));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        setError(t('settings', 'invalidImage', lang));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t('settings', 'imageTooLarge', lang));
        return;
      }
      
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setShowCropModal(true);
      setError(null);
      
      // Reset input so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropSave = async () => {
    if (!selectedImage || !croppedAreaPixels) return;
    
    try {
      setIsUploading(true);
      setError(null);

      // 1. Get the cropped image blob
      const croppedBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      if (!croppedBlob) throw new Error(t('settings', 'cropFailed', lang));

      // 2. Draw onto a BLACK background
      const finalCanvas = document.createElement('canvas');
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error("Canvas error");

      const faceImg = new Image();
      const faceImgUrl = URL.createObjectURL(croppedBlob);
      await new Promise((resolve, reject) => {
        faceImg.onload = resolve;
        faceImg.onerror = reject;
        faceImg.src = faceImgUrl;
      });

      finalCanvas.width = faceImg.width;
      finalCanvas.height = faceImg.height;

      // Pure Black Background
      finalCtx.fillStyle = '#000000';
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      finalCtx.drawImage(faceImg, 0, 0);

      URL.revokeObjectURL(faceImgUrl);

      const finalUploadBlob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Final canvas to blob failed"));
        }, 'image/jpeg', 0.95);
      });

      // 4. Upload to Supabase Storage
      const filePath = `${userId}/avatar-${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, finalUploadBlob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`${t('settings', 'uploadFailed', lang)} ${uploadError.message}`);
      }

      // 3. Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
        
      const newUrl = publicUrlData.publicUrl;

      // 4. Update profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Success
      setAvatarUrl(newUrl);
      onUploadSuccess(newUrl);
      
      // Close Modal & Cleanup
      setShowCropModal(false);
      URL.revokeObjectURL(selectedImage);
      setSelectedImage(null);

    } catch (err: any) {
      console.error('Profile photo upload error:', err);
      setError(err.message || t('settings', 'updateFailed', lang));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseModal = () => {
    setShowCropModal(false);
    if (selectedImage) URL.revokeObjectURL(selectedImage);
    setSelectedImage(null);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" ref={menuRef}>
        <div 
          onClick={handleContainerClick}
          className={`relative w-24 h-24 rounded-full border-4 border-white dark:border-gray-900 shadow-md transform translate-y-8 flex items-center justify-center overflow-hidden cursor-pointer group ${isUploading && !showCropModal ? 'opacity-70 pointer-events-none' : ''} bg-gray-100 dark:bg-gray-800`}
        >
          {isUploading && !showCropModal && (
            <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <svg className="animate-spin h-6 w-6 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}

          {!isUploading && !showCropModal && (
            <div className="absolute inset-0 z-10 bg-black/50 hidden group-hover:flex items-center justify-center transition-opacity">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
          )}

          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <img src="/logo.png" alt="Default Profile" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Dropdown Menu */}
        {showMenu && avatarUrl && (
          <div className="absolute top-full mt-10 left-1/2 -translate-x-1/2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-30 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <button onClick={() => { setShowViewModal(true); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {t('settings', 'viewPhoto', lang)}
            </button>
            <button onClick={handleUpdatePhoto} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-yellow-500 hover:bg-gray-800 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {t('settings', 'updatePhoto', lang)}
            </button>
            <button onClick={handleRemovePhoto} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-gray-800 mt-1 pt-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              {t('settings', 'removePhoto', lang)}
            </button>
          </div>
        )}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/jpeg, image/png, image/webp" 
        className="hidden" 
      />

      {error && (
        <div className="mt-10 text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 text-center max-w-[200px]">
          {error}
        </div>
      )}

      {/* Cropper Modal */}
      {showCropModal && selectedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 rounded-xl max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-gray-700">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">{t('settings', 'adjustImage', lang)}</h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative w-full h-[350px] bg-black">
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={true}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            
            <div className="p-5 flex flex-col gap-5 bg-gray-900">
              <div className="flex items-center gap-4 text-gray-300 text-sm font-medium">
                <span className="w-10">{t('settings', 'zoom', lang)}</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                />
              </div>
              <button 
                onClick={handleCropSave}
                disabled={isUploading}
                className="w-full py-3 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 transition-all flex justify-center items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{t('settings', 'savingPhoto', lang)}</span>
                  </>
                ) : t('settings', 'useThisPhoto', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && avatarUrl && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowViewModal(false)}>
           <div className="relative max-w-lg w-full h-auto p-4 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
             <img src={avatarUrl} alt="Profile Full" className="w-full h-auto rounded-full border-4 border-gray-800 shadow-2xl object-cover" />
             <button onClick={() => setShowViewModal(false)} className="mt-8 text-white/70 hover:text-white bg-gray-900/50 p-3 rounded-full backdrop-blur-md transition-colors border border-gray-700">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
           </div>
         </div>
      )}
    </div>
  );
}
