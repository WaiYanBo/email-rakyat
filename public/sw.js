// Basic Service Worker to pass PWA criteria
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // We leave this empty. 
  // Simply having a 'fetch' event listener is enough to pass the PWA install criteria
  // without interfering with Supabase API calls or POST requests.
});
