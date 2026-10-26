// Doce Veneno service worker.
// Keeps the app's own files so it opens with weak or no internet. Stock data (/api) is never cached here:
// the page keeps its own last copy and shows it as read-only, so a stale list is never mistaken for the real one.
const CACHE = 'dv-shell-v1';
const SHELL = ['/', '/style.css', '/js/config.js', '/js/variants.js', '/js/app.js', '/manifest.webmanifest',
    '/imagens/Logo%20Site%203.png', '/icons/icon-192.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const req = e.request, url = new URL(req.url);
    if (req.method !== 'GET') return;
    // Fonts: cache first, they never change.
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
            const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
        })));
        return;
    }
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
    // App files: network first (always the newest version when online), cached copy when offline.
    e.respondWith(fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});

// Notifications sent by the server (see /api/push/*).
self.addEventListener('push', e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
    e.waitUntil(self.registration.showNotification(d.title || 'Doce Veneno', {
        body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/' },
    }));
});
self.addEventListener('notificationclick', e => {
    e.notification.close();
    const target = new URL(e.notification.data?.url || '/', self.location.origin).href;
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const open = list.find(c => c.url.startsWith(self.location.origin));
        if (open) return open.focus().then(w => w.navigate(target)).catch(() => self.clients.openWindow(target));
        return self.clients.openWindow(target);
    }));
});
