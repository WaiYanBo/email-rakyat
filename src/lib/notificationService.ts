/**
 * Notification Service for Client Consultations & Follow-Up System
 * Supports HTML5 Web Notification API and PWA Service Worker Notifications
 * (Chrome/Edge Android, Samsung Internet, iOS Safari 16.4+ standalone PWA, Desktop)
 */

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
    // If on iPhone in regular Safari browser tab, explain Apple's requirement
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
    // 1. Try Service Worker Notification (Primary for mobile PWA, with 400ms timeout to avoid hanging)
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

    // 2. Fallback to standard Window Notification
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

/**
 * Sends an immediate test/confirmation notification when user enables device alerts
 */
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

/**
 * Audio Engine & Chime Player
 * Employs a multi-tiered mobile audio pipeline:
 * 1. Persistent pre-loaded HTML5 Audio element (routes through Android/iOS media stream)
 * 2. Pre-decoded Web Audio API AudioBuffer for instant zero-latency playback
 * 3. High-volume dual-tone harmonic oscillator synthesis fallback
 * 4. Device haptic vibration via navigator.vibrate()
 */
let globalAudioCtx: AudioContext | null = null;
let cachedAudioBuffer: AudioBuffer | null = null;
let persistentAudioEl: HTMLAudioElement | null = null;

// Initialize persistent audio element on script load
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
    // 1. Warm up & authorize persistent HTML5 Audio
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

    // 2. Unlock & Resume Web Audio Context
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      if (!globalAudioCtx) {
        globalAudioCtx = new AudioCtx();
      }
      if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
      }

      // Pre-fetch and decode audio buffer for zero-latency playback
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

// Automatically bind audio unlock to the first user gesture
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

export const playNotificationChime = () => {
  if (typeof window === 'undefined') return;

  // 1. Physical Haptic Vibration on Android and supported mobile devices
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }
  } catch (_vErr) {}

  // 2. Play HTML5 Audio element
  try {
    if (!persistentAudioEl) {
      persistentAudioEl = new Audio('/sounds/chime.wav');
      persistentAudioEl.preload = 'auto';
    }
    persistentAudioEl.currentTime = 0;
    persistentAudioEl.volume = 1.0;
    const p = persistentAudioEl.play();
    if (p !== undefined) {
      p.catch(() => {
        // Fallback: Create and play fresh audio instance
        try {
          const fresh = new Audio('/sounds/chime.wav');
          fresh.volume = 1.0;
          fresh.play().catch(() => {});
        } catch (_fErr) {}
      });
    }
  } catch (_err) {}

  // 3. Play pre-decoded AudioBuffer or synthesize via Web Audio API
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = globalAudioCtx || new AudioCtx();
      if (!globalAudioCtx) globalAudioCtx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (cachedAudioBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = cachedAudioBuffer;
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.0;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
      } else {
        // Fallback: High-clarity dual-tone bell chime (880Hz A5 -> 1175Hz D6 with harmonics)
        const now = ctx.currentTime;

        // Tone 1: 880Hz + 1760Hz
        const osc1 = ctx.createOscillator();
        const osc1Harm = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc1Harm.type = 'sine';
        osc1Harm.frequency.setValueAtTime(1760, now);
        gain1.gain.setValueAtTime(0.7, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        osc1Harm.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1Harm.start(now);
        osc1.stop(now + 0.4);
        osc1Harm.stop(now + 0.4);

        // Tone 2: 1174.66Hz + 2349Hz (starting at 0.14s)
        const osc2 = ctx.createOscillator();
        const osc2Harm = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174.66, now + 0.14);
        osc2Harm.type = 'sine';
        osc2Harm.frequency.setValueAtTime(2349.32, now + 0.14);
        gain2.gain.setValueAtTime(0.8, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        osc2Harm.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.14);
        osc2Harm.start(now + 0.14);
        osc2.stop(now + 0.65);
        osc2Harm.stop(now + 0.65);
      }
    }
  } catch (_e) {}
};

/**
 * Plays an urgent multi-cycle alarm chime (3 rings spaced apart)
 * with aggressive haptic vibration to ensure the user notices the alert immediately.
 */
export const playUrgentAlertChime = (repeatCount: number = 3) => {
  if (typeof window === 'undefined') return;
  let count = 0;
  playNotificationChime();
  count++;

  const timer = setInterval(() => {
    if (count >= repeatCount) {
      clearInterval(timer);
      return;
    }
    playNotificationChime();
    count++;
  }, 900);
};

/**
 * Tab Title Flashing Engine
 * Alternates browser tab title with an urgent alarm icon so users in background tabs notice immediately.
 */
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

/**
 * Snoozes an appointment reminder for N minutes (default 5 minutes)
 */
export const snoozeAppointmentAlert = (appointmentId: string, minutes: number = 5) => {
  if (typeof window === 'undefined') return;
  const snoozeUntil = Date.now() + minutes * 60 * 1000;
  sessionStorage.setItem(`snoozed-until-${appointmentId}`, String(snoozeUntil));
  stopTitleFlashing();
};

/**
 * Universal Device Notification Dispatcher with fast Service Worker timeout
 * Configured for maximum Android & Desktop visibility (Heads-up pop-down alert)
 */
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
    vibrate: [500, 150, 500, 150, 500, 150, 500], // Strong urgent vibration pattern
    silent: false, // Forces device notification sound
    renotify: true, // Wakes screen & forces new alert
    requireInteraction: true, // Pinned on screen until user interacts with it
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

/**
/**
 * Helper to parse any 12H time string ("09:00 AM", "11:30 pagi", "1:00 PM") to total minutes from midnight (0-1439)
 */
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

/**
 * Monitors today's appointments and triggers multi-stage alerts:
 * 1. 15 Minutes Before: Warning reminder
 * 2. 0 Minutes (At Time / NOW): Urgent "Meeting Starting Now" alarm
 */
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
    // Check if user snoozed this appointment
    if (typeof window !== 'undefined') {
      const snoozedUntilStr = sessionStorage.getItem(`snoozed-until-${apt.id}`);
      if (snoozedUntilStr && Date.now() < parseInt(snoozedUntilStr, 10)) {
        continue;
      }
    }

    const aptMins = parseTimeToMinutes(apt.appointment_time);
    const minutesLeft = aptMins - currentTotalMins;

    // ── STAGE 2: EXACT MEETING TIME (0m to -5m / Starting Now) ──
    if (minutesLeft <= 0 && minutesLeft >= -5) {
      const nowKey = `alerted-now-${apt.id}-${todayStr}`;
      const alreadyAlertedNow = typeof window !== 'undefined' && sessionStorage.getItem(nowKey);

      if (!alreadyAlertedNow) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(nowKey, 'true');
        }

        // 1. Play Urgent 3-Cycle Alarm Sound & Vibration
        playUrgentAlertChime(3);

        // 2. Start Flashing Browser Tab Title
        startTitleFlashing(
          lang === 'bm'
            ? `TEMUJANJI SEKARANG: ${apt.client_name}`
            : `MEETING NOW: ${apt.client_name}`
        );

        // 3. Dispatch High-Priority Heads-Up Device Notification
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
    }
    // ── STAGE 1: 15 MINUTES BEFORE MEETING (1m to 15m) ──
    else if (minutesLeft > 0 && minutesLeft <= 15) {
      const earlyKey = `alerted-15m-${apt.id}-${todayStr}`;
      const alreadyAlerted15m = typeof window !== 'undefined' && sessionStorage.getItem(earlyKey);

      if (!alreadyAlerted15m) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(earlyKey, 'true');
        }

        // 1. Play Urgent 3-Cycle Chime
        playUrgentAlertChime(3);

        // 2. Start Flashing Browser Tab Title
        startTitleFlashing(
          lang === 'bm'
            ? `[15 MINIT] ${apt.client_name}`
            : `[15 MINS] ${apt.client_name}`
        );

        // 3. Dispatch Device Notification
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

/**
 * Checks all appointments and dispatches device notifications for due follow-ups.
 * Returns triggered follow-ups for in-app alert display.
 */
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
