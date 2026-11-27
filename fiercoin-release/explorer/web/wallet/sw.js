// Keeps a copy of the wallet on the phone, so it still opens with no internet
// (to pay over mesh radio). Live data from /api/ always comes from the network.
const CACHE = 'firc-wallet-v1';
const FILES = ['./', 'index.html', 'firc-lib.js', 'mesh.js', 'fierpay.js', 'qrcode.js', 'jsQR.js', 'miner.js',
  'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'coin.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive), the saved copy if there's no good answer within 5 seconds.
// A server error page (500 and up, e.g. the Explorer is stopped behind Caddy) counts as no answer.
// An answer that arrives after the 5 seconds still updates the saved copy, so a phone on a slow
// link gets the new wallet next time instead of keeping the old one forever.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const net = fetch(e.request).then((r) => {
    if (r.status >= 500) throw new Error('server error ' + r.status);
    if (r.ok) { const copy = r.clone(); return caches.open(CACHE).then((c) => c.put(e.request, copy)).then(() => r); }
    return r;
  });
  e.waitUntil(net.catch(() => {})); // keep the worker alive until a late answer is saved
  const saved = () => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'));
  e.respondWith(new Promise((ok) => {
    let done = false;
    const fallback = () => { if (done) return; done = true; saved().then((r) => ok(r || net)); };
    const t = setTimeout(fallback, 5000);
    net.then((r) => { if (!done) { done = true; clearTimeout(t); ok(r); } }, () => { clearTimeout(t); fallback(); });
  }));
});
