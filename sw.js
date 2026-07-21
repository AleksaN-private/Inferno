// Inferno service worker: instalacija + rad bez interneta.
// Navigacija = mreža prvo (🔄 uvek dobije najnoviju verziju), keš kad nema mreže.
const CACHE = 'inferno-v171';   // bump: forsira svež klijent (v165 — mozak: razmišljanje/samokritika/relevantna memorija, ton glasa, vreme, prisutnost, 🧠 misli, grounding pretraga za bića)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // meteo i spoljni pozivi idu direktno
  if (url.pathname.endsWith('memory.json')) return;  // ☁ sećanje UVEK sveže sa mreže
  if (url.pathname.startsWith('/api/')) return;      // API (mozak, push, memorija) UVEK direktno, nikad keš
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(r => {
        const c = r.clone();
        caches.open(CACHE).then(x => x.put('index', c));
        return r;
      }).catch(() => caches.match('index'))
    );
  } else {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(e.request).then(m =>
        m || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })
      ))
    );
  }
});

// ---- PUSH: „Inferno te zove" (obaveštenje sa zvukom/vibracijom, i kad je zatvoren) ----
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Inferno', {
    body: d.body || 'Javi se…',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200, 100, 300],
    tag: 'inferno-zove',
    renotify: true,
    requireInteraction: true,
    data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
