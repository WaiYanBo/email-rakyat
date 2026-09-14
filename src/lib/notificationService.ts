export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isStandalonePWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
};

export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationSupported()) {
    if (isIOS() && !isStandalonePWA()) {
      if (typeof window !== 'undefined') {
        alert(
          window.location.search.includes('lang=bm')
            ? 'Untuk Pengguna iPhone: Apple memerlukan laman ini ditambah ke Skrin Utama (Home Screen) untuk membolehkan notifikasi. Sila tekan ikon Kongsi (Share) di Safari dan pilih "Tambah ke Skrin Utama" (Add to Home Screen).'
            : 'For iPhone Users: Apple iOS requires adding this portal to your Home Screen to enable notifications. In Safari, tap the Share icon and select "Add to Home Screen".'
        );
      }
    }
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return false;
  }
};

/**
 * Automatically prompts the user for notification permissions as soon as they use the portal,
 * ensuring prompts appear immediately and on first tap/click.
 */
export const initAutoNotificationRequest = () => {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  const tryRequest = async () => {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_e) {}
    }
  };

  // 1. Try immediately on execution
  tryRequest();

  // 2. Also bind to the first user touch/click/pointer interaction across the portal
  const onFirstInteraction = () => {
    tryRequest();
    window.removeEventListener('click', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
  };

  window.addEventListener('click', onFirstInteraction, { once: true, passive: true });
  window.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true });
  window.addEventListener('pointerdown', onFirstInteraction, { once: true, passive: true });
  window.addEventListener('keydown', onFirstInteraction, { once: true, passive: true });
};

// Automatically run on portal load
if (typeof window !== 'undefined') {
  initAutoNotificationRequest();
}

export interface FollowUpNotificationPayload {
  id: string;
  clientName: string;
  category: string;
  picName: string;
  followUpDate: string;
  followUpTime?: string;
  notes?: string;
}

export const sendFollowUpDeviceNotification = async (
  payload: FollowUpNotificationPayload,
  lang: 'en' | 'bm' = 'en'
): Promise<boolean> => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = lang === 'bm'
    ? `Susulan Temujanji: ${payload.clientName}`
    : `Follow-Up Due Today: ${payload.clientName}`;

  const timeStr = payload.followUpTime ? ` (${payload.followUpTime})` : '';
  const body = lang === 'bm'
    ? `Konsultasi ${payload.category} bersama ${payload.picName}${timeStr}.${payload.notes ? ' Catatan: ' + payload.notes : ''}`
    : `${payload.category} consultation with ${payload.picName}${timeStr}.${payload.notes ? ' Note: ' + payload.notes : ''}`;

  const options: any = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: `followup-${payload.id}`,
    vibrate: [300, 100, 300, 100, 300],
    silent: false,
    renotify: true,
    requireInteraction: true,
    data: {
      url: '/portal/temujanji',
      appointmentId: payload.id
    }
  };

  try {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 400))
        ]);
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          return true;
        }
      } catch (swErr) {
        console.warn('Service worker notification error, falling back:', swErr);
      }
    }

    if ('Notification' in window) {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        window.location.href = '/portal/temujanji';
      };
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to dispatch device notification:', err);
    return false;
  }
};

export const sendConfirmationDeviceNotification = async (
  lang: 'en' | 'bm' = 'en'
): Promise<boolean> => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = lang === 'bm'
    ? 'Notifikasi Peranti Diaktifkan'
    : 'Device Alerts Activated';

  const body = lang === 'bm'
    ? 'Peringatan temujanji susulan kini aktif! Anda akan menerima makluman pada pagi tarikh susulan klien.'
    : 'Follow-up alerts are now active! You will be notified on the morning of scheduled client follow-ups.';

  const options: NotificationOptions = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'alerts-activated-confirmation'
  };

  try {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 400))
        ]);
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          return true;
        }
      } catch (swErr) {
        console.warn('Service worker confirmation error, falling back:', swErr);
      }
    }

    if ('Notification' in window) {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        window.location.href = '/portal/temujanji';
      };
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to dispatch confirmation notification:', err);
    return false;
  }
};

let globalAudioCtx: AudioContext | null = null;
let cachedAudioBuffer: AudioBuffer | null = null;
let persistentAudioEl: HTMLAudioElement | null = null;

if (typeof window !== 'undefined') {
  try {
    persistentAudioEl = new Audio('/sounds/chime.wav');
    persistentAudioEl.preload = 'auto';
    persistentAudioEl.volume = 1.0;
  } catch (_e) {}
}

export const unlockAudio = () => {
  if (typeof window === 'undefined') return;
  try {
    if (!persistentAudioEl) {
      persistentAudioEl = new Audio('/sounds/chime.wav');
      persistentAudioEl.preload = 'auto';
    }
    persistentAudioEl.volume = 0.001;
    persistentAudioEl.play().then(() => {
      persistentAudioEl?.pause();
      if (persistentAudioEl) {
        persistentAudioEl.currentTime = 0;
        persistentAudioEl.volume = 1.0;
      }
    }).catch(() => {});

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      if (!globalAudioCtx) {
        globalAudioCtx = new AudioCtx();
      }
      if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
      }

      if (!cachedAudioBuffer && globalAudioCtx) {
        fetch('/sounds/chime.wav')
          .then(res => res.arrayBuffer())
          .then(buf => globalAudioCtx!.decodeAudioData(buf))
          .then(decoded => {
            cachedAudioBuffer = decoded;
          })
          .catch(() => {});
      }
    }
  } catch (_e) {}
};

if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    unlockAudio();
    window.removeEventListener('click', handleInteraction);
    window.removeEventListener('touchstart', handleInteraction);
    window.removeEventListener('touchend', handleInteraction);
    window.removeEventListener('pointerdown', handleInteraction);
  };
  window.addEventListener('click', handleInteraction, { once: true, passive: true });
  window.addEventListener('touchstart', handleInteraction, { once: true, passive: true });
  window.addEventListener('touchend', handleInteraction, { once: true, passive: true });
  window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true });
}

export const isAlertSoundMuted = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('portal_alert_muted') === 'true';
};

export const setAlertSoundMuted = (muted: boolean) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('portal_alert_muted', String(muted));
  window.dispatchEvent(new CustomEvent('portalAlertMuteChanged', { detail: { muted } }));
};

/**
 * Synthesizes an elegant, soothing executive chime (warm C-major acoustic triad).
 * Zero harsh frequencies, zero ear fatigue.
 */
const playSyntheticExecutiveChime = (ctx: AudioContext) => {
  try {
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.32, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    masterGain.connect(filter);
    filter.connect(ctx.destination);

    // Warm, pleasant 3-note executive chime: C5 (523.25 Hz), E5 (659.25 Hz), G5 (783.99 Hz)
    const chimeNotes = [
      { freq: 523.25, offset: 0, duration: 0.75, gain: 0.28 },
      { freq: 659.25, offset: 0.09, duration: 0.75, gain: 0.25 },
      { freq: 783.99, offset: 0.18, duration: 0.95, gain: 0.22 }
    ];

    chimeNotes.forEach(({ freq, offset, duration, gain }) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);

      // Acoustic attack and smooth exponential decay
      noteGain.gain.setValueAtTime(0.0001, now + offset);
      noteGain.gain.exponentialRampToValueAtTime(gain, now + offset + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(now + offset);
      osc.stop(now + offset + duration);
    });
  } catch (_e) {}
};

const playWebAudioChimeFallback = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = globalAudioCtx || new AudioCtx();
    if (!globalAudioCtx) globalAudioCtx = ctx;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (cachedAudioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = cachedAudioBuffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.6;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } else {
      playSyntheticExecutiveChime(ctx);
    }
  } catch (_e) {}
};

export const playNotificationChime = () => {
  if (typeof window === 'undefined') return;

  // Respect user's mute setting
  if (isAlertSoundMuted()) {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 75, 150]);
      }
    } catch (_v) {}
    return;
  }

  // Gentle vibration on supported mobile devices
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 80, 200]);
    }
  } catch (_vErr) {}

  // Try playing the clean audio element first
  try {
    if (!persistentAudioEl) {
      persistentAudioEl = new Audio('/sounds/chime.wav');
      persistentAudioEl.preload = 'auto';
    }
    persistentAudioEl.currentTime = 0;
    persistentAudioEl.volume = 0.65;
    const p = persistentAudioEl.play();
    if (p !== undefined) {
      p.catch(() => {
        // If file playback blocked, fallback to Web Audio
        playWebAudioChimeFallback();
      });
    }
  } catch (_err) {
    playWebAudioChimeFallback();
  }
};

export const playUrgentAlertChime = (repeatCount: number = 1) => {
  if (typeof window === 'undefined') return;
  if (isAlertSoundMuted()) return;

  playNotificationChime();

  // If repeated, space gently by 1600ms rather than a rapid repeating siren
  if (repeatCount > 1) {
    let count = 1;
    const timer = setInterval(() => {
      if (count >= repeatCount || isAlertSoundMuted()) {
        clearInterval(timer);
        return;
      }
      playNotificationChime();
      count++;
    }, 1600);
  }
};

let titleFlashInterval: any = null;
let originalDocumentTitle: string = '';

export const startTitleFlashing = (alertText: string) => {
  if (typeof document === 'undefined') return;
  if (titleFlashInterval) clearInterval(titleFlashInterval);
  originalDocumentTitle = document.title;
  let toggle = false;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? `🚨 ${alertText}` : originalDocumentTitle;
    toggle = !toggle;
  }, 1000);
};

export const stopTitleFlashing = () => {
  if (typeof document === 'undefined') return;
  if (titleFlashInterval) {
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
  }
  if (originalDocumentTitle) {
    document.title = originalDocumentTitle;
  }
};

export const snoozeAppointmentAlert = (appointmentId: string, minutes: number = 5) => {
  if (typeof window === 'undefined') return;
  const snoozeUntil = Date.now() + minutes * 60 * 1000;
  sessionStorage.setItem(`snoozed-until-${appointmentId}`, String(snoozeUntil));
  stopTitleFlashing();
};

export const sendUniversalDeviceNotification = async (
  title: string,
  body: string,
  tag: string,
  url: string = '/portal/temujanji'
): Promise<boolean> => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const options: any = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag,
    vibrate: [500, 150, 500, 150, 500, 150, 500],
    silent: false,
    renotify: true,
    requireInteraction: true,
    timestamp: Date.now(),
    actions: [
      { action: 'open', title: 'Buka Dosier / Open' }
    ],
    data: { url }
  };

  try {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 400))
        ]);
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          return true;
        }
      } catch (_e) {}
    }

    if ('Notification' in window) {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        window.location.href = url;
      };
      return true;
    }
  } catch (err) {
    console.warn('Failed to dispatch universal notification:', err);
  }
  return false;
};

export const parseTimeToMinutes = (timeStr: string = ''): number => {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm|pagi|petang|malam)?/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase() || '';

  const isPM = period.includes('pm') || period.includes('petang') || period.includes('malam');
  const isAM = period.includes('am') || period.includes('pagi');

  if (isPM && h < 12) {
    h += 12;
  } else if (isAM && h === 12) {
    h = 0;
  }
  return h * 60 + m;
};

export interface AlertTriggerResult {
  id: string;
  type: 'upcoming_15m' | 'starting_now' | 'followup_due';
  clientName: string;
  picName: string;
  timeStr: string;
  category: string;
  notes?: string;
  phone?: string;
  location?: string;
  minutesLeft?: number;
  appointment: any;
}

export const checkAndDispatchUpcomingAlerts = async (
  appointments: any[],
  lang: 'en' | 'bm' = 'en'
): Promise<AlertTriggerResult[]> => {
  const triggered: AlertTriggerResult[] = [];
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();

  const activeTodayApts = appointments.filter(
    (a) => a.appointment_date === todayStr && a.status !== 'Cancelled' && a.status !== 'Completed'
  );

  for (const apt of activeTodayApts) {
    if (typeof window !== 'undefined') {
      const snoozedUntilStr = sessionStorage.getItem(`snoozed-until-${apt.id}`);
      if (snoozedUntilStr && Date.now() < parseInt(snoozedUntilStr, 10)) {
        continue;
      }
    }

    const aptMins = parseTimeToMinutes(apt.appointment_time);
    const minutesLeft = aptMins - currentTotalMins;

    if (minutesLeft <= 0 && minutesLeft >= -5) {
      const nowKey = `alerted-now-${apt.id}-${todayStr}`;
      const alreadyAlertedNow = typeof window !== 'undefined' && sessionStorage.getItem(nowKey);

      if (!alreadyAlertedNow) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(nowKey, 'true');
        }

        playUrgentAlertChime(3);

        startTitleFlashing(
          lang === 'bm'
            ? `TEMUJANJI SEKARANG: ${apt.client_name}`
            : `MEETING NOW: ${apt.client_name}`
        );

        const title = lang === 'bm'
          ? `🚨 TEMUJANJI BERMULA SEKARANG: ${apt.client_name}`
          : `🚨 MEETING STARTING NOW: ${apt.client_name}`;

        const body = lang === 'bm'
          ? `Masa temujanji (${apt.appointment_time}) telah tiba! Konsultasi ${apt.case_category || 'Am'} bersama ${apt.pic_name} sedang bermula.`
          : `Meeting time (${apt.appointment_time}) has arrived! Consultation for ${apt.case_category || 'General'} with ${apt.pic_name} is starting now.`;

        sendUniversalDeviceNotification(title, body, `now-${apt.id}`);

        triggered.push({
          id: `${apt.id}-now`,
          type: 'starting_now',
          clientName: apt.client_name,
          picName: apt.pic_name,
          timeStr: apt.appointment_time,
          category: apt.case_category || 'General',
          notes: apt.notes,
          phone: apt.client_phone,
          location: apt.location,
          minutesLeft: 0,
          appointment: apt
        });
      }
    } else if (minutesLeft > 0 && minutesLeft <= 15) {
      const earlyKey = `alerted-15m-${apt.id}-${todayStr}`;
      const alreadyAlerted15m = typeof window !== 'undefined' && sessionStorage.getItem(earlyKey);

      if (!alreadyAlerted15m) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(earlyKey, 'true');
        }

        playUrgentAlertChime(3);

        startTitleFlashing(
          lang === 'bm'
            ? `[15 MINIT] ${apt.client_name}`
            : `[15 MINS] ${apt.client_name}`
        );

        const minText = lang === 'bm' ? `dalam ${minutesLeft} minit` : `in ${minutesLeft} mins`;

        const title = lang === 'bm'
          ? `⏰ Temujanji ${minText}: ${apt.client_name}`
          : `⏰ Meeting ${minText}: ${apt.client_name}`;

        const body = lang === 'bm'
          ? `Konsultasi bersama ${apt.pic_name} pada ${apt.appointment_time} (${apt.case_category || 'Am'}).`
          : `Consultation with ${apt.pic_name} at ${apt.appointment_time} (${apt.case_category || 'General'}).`;

        sendUniversalDeviceNotification(title, body, `upcoming-${apt.id}`);

        triggered.push({
          id: `${apt.id}-15m`,
          type: 'upcoming_15m',
          clientName: apt.client_name,
          picName: apt.pic_name,
          timeStr: apt.appointment_time,
          category: apt.case_category || 'General',
          notes: apt.notes,
          phone: apt.client_phone,
          location: apt.location,
          minutesLeft,
          appointment: apt
        });
      }
    }
  }

  return triggered;
};

export const checkAndDispatchDueFollowUps = async (
  appointments: any[],
  lang: 'en' | 'bm' = 'en'
): Promise<AlertTriggerResult[]> => {
  const triggered: AlertTriggerResult[] = [];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const dueAppointments = appointments.filter((apt) => {
    if (!apt.follow_up_date) return false;
    const isPending = !apt.follow_up_status || apt.follow_up_status === 'pending';
    return isPending && apt.follow_up_date <= todayStr;
  });

  for (const apt of dueAppointments) {
    const storageKey = `notified-followup-${apt.id}-${todayStr}`;
    const alreadyNotified = typeof window !== 'undefined' && localStorage.getItem(storageKey);

    if (!alreadyNotified) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, 'true');
      }

      playUrgentAlertChime(2);

      await sendFollowUpDeviceNotification({
        id: apt.id,
        clientName: apt.client_name,
        category: apt.case_category || 'General',
        picName: apt.pic_name,
        followUpDate: apt.follow_up_date,
        followUpTime: apt.follow_up_time,
        notes: apt.follow_up_notes
      }, lang);

      triggered.push({
        id: `${apt.id}-followup`,
        type: 'followup_due',
        clientName: apt.client_name,
        picName: apt.pic_name,
        timeStr: apt.follow_up_time || (lang === 'bm' ? 'Hari Ini' : 'Today'),
        category: apt.case_category || 'General',
        notes: apt.follow_up_notes,
        phone: apt.client_phone,
        location: apt.location,
        appointment: apt
      });
    }
  }

  return triggered;
};
