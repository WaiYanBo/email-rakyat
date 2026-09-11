/**
 * Notification Service for Client Consultations & Follow-Up System
 * Supports HTML5 Web Notification API and PWA Service Worker Notifications
 * (Chrome/Edge Android, Samsung Internet, iOS Safari 16.4+ standalone PWA, Desktop)
 */

export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationSupported()) return false;
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

  const options: NotificationOptions = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: `followup-${payload.id}`,
    data: {
      url: '/portal/temujanji',
      appointmentId: payload.id
    }
  };

  try {
    // 1. Try Service Worker Notification (Primary for mobile PWA)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }

    // 2. Fallback to standard Window Notification
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      window.location.href = '/portal/temujanji';
    };
    return true;
  } catch (err) {
    console.warn('Failed to dispatch device notification:', err);
    return false;
  }
};

/**
 * Checks all appointments and dispatches device notifications for due follow-ups.
 * Uses localStorage cache to ensure notifications are triggered only once per day per client.
 */
export const checkAndDispatchDueFollowUps = async (
  appointments: any[],
  lang: 'en' | 'bm' = 'en'
): Promise<number> => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return 0;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const dueAppointments = appointments.filter((apt) => {
    if (!apt.follow_up_date) return false;
    const isPending = !apt.follow_up_status || apt.follow_up_status === 'pending';
    return isPending && apt.follow_up_date <= todayStr;
  });

  let dispatchedCount = 0;

  for (const apt of dueAppointments) {
    const storageKey = `notified-followup-${apt.id}-${todayStr}`;
    if (localStorage.getItem(storageKey)) {
      continue; // Already notified today
    }

    const success = await sendFollowUpDeviceNotification({
      id: apt.id,
      clientName: apt.client_name,
      category: apt.case_category || 'General',
      picName: apt.pic_name,
      followUpDate: apt.follow_up_date,
      followUpTime: apt.follow_up_time,
      notes: apt.follow_up_notes
    }, lang);

    if (success) {
      localStorage.setItem(storageKey, 'true');
      dispatchedCount++;
    }
  }

  return dispatchedCount;
};
