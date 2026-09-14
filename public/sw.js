// Basic Service Worker to pass PWA criteria
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

// Push event handler: wakes up device and displays notification on lock screen when push payload arrives
self.addEventListener('push', (event) => {
  let data = {
    title: 'Peringatan Temujanji / Meeting Alert',
    body: 'Anda mempunyai temujanji atau tindakan susulan.',
    url: '/portal/temujanji',
    tag: 'portal-push-alert'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign({}, data, parsed);
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || 'portal-push-alert',
    vibrate: [300, 100, 300, 100, 300],
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/portal/temujanji'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler: opens or focuses the appointments portal
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/portal/temujanji';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/portal/temujanji') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

