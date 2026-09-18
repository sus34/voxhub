// Deliberately network-only. This is a realtime app: a cache would happily
// serve a stale bundle after a deploy and desync everyone. The service worker
// exists only so the browser offers "install as app".
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
