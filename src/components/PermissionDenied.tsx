import React from 'react';
import { usePortalLanguage } from '../hooks/usePortalLanguage';
import { t } from '../lib/portalI18n';

interface PermissionDeniedProps {
  title?: string;
  message?: string;
}

export default function PermissionDenied({ title, message }: PermissionDeniedProps) {
  const { lang } = usePortalLanguage();
  const isBm = lang === 'bm';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-lg space-y-5 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
            {title || (isBm ? 'Akses Terhad' : 'Access Restricted')}
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
            {message || (isBm
              ? 'Anda tidak mempunyai kebenaran untuk mengakses modul ini. Sila hubungi Pentadbir Sistem jika anda memerlukan akses.'
              : 'You do not have permission to access this module. If you require access, please contact your System Administrator.')}
          </p>
        </div>

        <div className="pt-2">
          <a
            href="/portal"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-slate-950 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <span>&larr;</span>
            <span>{isBm ? 'Kembali ke Gambaran Keseluruhan' : 'Return to Overview'}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
