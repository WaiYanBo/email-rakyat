import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { usePortalLanguage } from '../../hooks/usePortalLanguage';
import {
  checkAndDispatchUpcomingAlerts,
  checkAndDispatchDueFollowUps,
  playUrgentAlertChime,
  stopTitleFlashing,
  snoozeAppointmentAlert,
  type AlertTriggerResult
} from '../../lib/notificationService';

export default function PortalAlertSystem() {
  const { lang } = usePortalLanguage();
  const [modalAlert, setModalAlert] = useState<AlertTriggerResult | null>(null);

  const fetchAndCheckAlerts = async () => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;

      // Fetch active appointments for today or due follow-ups
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .or(`appointment_date.eq.${todayStr},follow_up_date.lte.${todayStr}`)
        .not('status', 'in', '("Cancelled","Completed")')
        .limit(250);

      if (error || !data || data.length === 0) return;

      const [upcoming, followUps] = await Promise.all([
        checkAndDispatchUpcomingAlerts(data, lang),
        checkAndDispatchDueFollowUps(data, lang)
      ]);

      const allTriggered = [...upcoming, ...followUps];
      if (allTriggered.length > 0) {
        // Pop up the most urgent alert on screen immediately
        const highestPriority = allTriggered.find(a => a.type === 'starting_now') || allTriggered[0];
        setModalAlert(highestPriority);

        // Notify local view if on /portal/temujanji
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('portalAppointmentAlert', {
            detail: { alerts: allTriggered }
          }));
        }
      }
    } catch (err) {
      console.warn('Error running global appointment alert checks:', err);
    }
  };

  useEffect(() => {
    // Initial check after short delay to let session establish
    const initialTimer = setTimeout(() => {
      fetchAndCheckAlerts();
    }, 2500);

    // 20-Second heartbeat interval for real-time minute accuracy
    const interval = setInterval(() => {
      fetchAndCheckAlerts();
    }, 20000);

    // Listen for custom test alerts triggered by user
    const handleTestAlert = (e: any) => {
      if (e?.detail) {
        setModalAlert(e.detail);
      }
    };
    window.addEventListener('triggerGlobalTestAlert', handleTestAlert);

    // Clear flashing tab title when user refocuses or clicks window
    const handleFocus = () => {
      if (!modalAlert) {
        stopTitleFlashing();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('triggerGlobalTestAlert', handleTestAlert);
      window.removeEventListener('focus', handleFocus);
    };
  }, [lang]);

  const handleDismiss = () => {
    stopTitleFlashing();
    setModalAlert(null);
  };

  const handleSnooze = () => {
    if (modalAlert?.appointment?.id) {
      snoozeAppointmentAlert(modalAlert.appointment.id, 5);
    }
    stopTitleFlashing();
    setModalAlert(null);
  };

  const handleReplayChime = () => {
    playUrgentAlertChime(2);
  };

  const handleOpenDossier = () => {
    stopTitleFlashing();
    const aptId = modalAlert?.appointment?.id || '';
    setModalAlert(null);
    if (typeof window !== 'undefined') {
      window.location.href = `/portal/temujanji?appointmentId=${aptId}&action=dossier`;
    }
  };

  if (!modalAlert) return null;

  const isStartingNow = modalAlert.type === 'starting_now';
  const isUpcoming = modalAlert.type === 'upcoming_15m';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
          isStartingNow
            ? 'bg-slate-950 border-red-500/50 shadow-red-950/50'
            : isUpcoming
            ? 'bg-slate-950 border-amber-500/50 shadow-amber-950/50'
            : 'bg-slate-950 border-cyan-500/50 shadow-cyan-950/50'
        }`}
      >
        {/* Top Glowing Urgency Header Bar */}
        <div
          className={`px-5 py-4 flex items-center justify-between border-b ${
            isStartingNow
              ? 'bg-gradient-to-r from-red-600/30 via-red-600/20 to-orange-600/20 border-red-500/30 text-red-200'
              : isUpcoming
              ? 'bg-gradient-to-r from-amber-600/30 via-amber-600/20 to-yellow-600/20 border-amber-500/30 text-amber-200'
              : 'bg-gradient-to-r from-cyan-600/30 via-blue-600/20 to-indigo-600/20 border-cyan-500/30 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3.5 h-3.5 rounded-full animate-ping flex-shrink-0 ${
                isStartingNow ? 'bg-red-500' : isUpcoming ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
            />
            <span className="text-xs font-black uppercase tracking-wider">
              {isStartingNow
                ? (lang === 'bm' ? 'Peringatan Kecemasan: Temujanji Bermula Sekarang!' : 'Urgent Alert: Meeting Starting Now!')
                : isUpcoming
                ? (lang === 'bm' ? `Peringatan: Temujanji Dalam ${modalAlert.minutesLeft ?? 15} Minit!` : `Reminder: Meeting in ${modalAlert.minutesLeft ?? 15} Minutes!`)
                : (lang === 'bm' ? 'Tindakan Susulan Temujanji Hari Ini' : 'Follow-Up Due Today')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleReplayChime}
            title={lang === 'bm' ? 'Mainkan Semula Loceng' : 'Replay Alarm Sound'}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <span>{lang === 'bm' ? 'Bunyi' : 'Sound'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                isStartingNow
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : isUpcoming
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              }`}>
                {modalAlert.category}
              </span>
              <span className="text-xs font-bold text-slate-400">
                {modalAlert.timeStr}
              </span>
            </div>

            <h3 className="text-2xl font-black text-white tracking-tight">
              {modalAlert.clientName}
            </h3>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{lang === 'bm' ? 'Pegawai Bertugas (PIC):' : 'Assigned PIC:'}</span>
              <span className="font-bold text-white">{modalAlert.picName}</span>
            </div>

            {modalAlert.location && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{lang === 'bm' ? 'Lokasi Konsultasi:' : 'Location:'}</span>
                <span className="font-bold text-slate-200">{modalAlert.location}</span>
              </div>
            )}

            {modalAlert.phone && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{lang === 'bm' ? 'No. Telefon Klien:' : 'Phone Number:'}</span>
                <span className="font-bold text-slate-200">{modalAlert.phone}</span>
              </div>
            )}

            {modalAlert.notes && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-slate-400 block mb-0.5">{lang === 'bm' ? 'Catatan Temujanji:' : 'Appointment Notes:'}</span>
                <p className="italic text-slate-300 bg-black/30 p-2 rounded-lg">
                  "{modalAlert.notes}"
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleOpenDossier}
              className={`py-3 px-4 rounded-xl text-xs font-black transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 ${
                isStartingNow
                  ? 'bg-red-500 hover:bg-red-400 text-slate-950'
                  : isUpcoming
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>{lang === 'bm' ? 'Buka Dosier Klien' : 'Open Client Dossier'}</span>
            </button>

            {modalAlert.phone ? (
              <a
                href={`https://wa.me/${modalAlert.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  lang === 'bm'
                    ? `Salam sejahtera ${modalAlert.clientName}, ini adalah peringatan mengenai temujanji konsultasi anda pada ${modalAlert.timeStr} bersama ${modalAlert.picName}.`
                    : `Hello ${modalAlert.clientName}, this is a reminder regarding your scheduled consultation at ${modalAlert.timeStr} with ${modalAlert.picName}.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="py-3 px-4 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                </svg>
                <span>WhatsApp</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleSnooze}
                className="py-3 px-4 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{lang === 'bm' ? 'Tangguh 5 Minit (Snooze)' : 'Snooze (5 Mins)'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
            {modalAlert.phone && (
              <button
                type="button"
                onClick={handleSnooze}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{lang === 'bm' ? 'Tangguh 5 Minit' : 'Snooze 5 Mins'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className="ml-auto text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 font-bold"
            >
              <span>{lang === 'bm' ? 'Sahkan & Tutup' : 'Acknowledge & Close'}</span>
              <span>&times;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
