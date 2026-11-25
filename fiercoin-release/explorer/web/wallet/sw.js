// Keeps a copy of the wallet on the phone, so it still opens with no internet
// (to pay over mesh radio). Live data from /api/ always comes from the network.
const CACHE = 'firc-wallet-v1';
const FILES = ['./', 'index.html', 'firc-lib.js', 'mesh.js', 'qrcode.js', 'jsQR.js', 'miner.js',
  'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive), the saved copy if there's no answer within 5 seconds.
function fromNetwork(req) {
  return new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('slow')), 5000);
    fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); bad(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fromNetwork(e.request)
    .then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })
      .then((r) => r || caches.match('index.html'))));
});
