// QC Field Book – service worker: makes the app open and work without internet.
// When you change app files, bump VERSION so phones pick up the new files quickly.
const VERSION = 'qcfb-2026-10-30-2';
const SHELL = [
  './', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './vendor/supabase.js', './vendor/jspdf.umd.min.js', './vendor/pptxgen.bundle.js',
  './fonts/BeVietnamPro-Regular.ttf', './fonts/BeVietnamPro-Bold.ttf',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
const RUNTIME = 'qcfb-runtime';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (data, sign-in, photos) always goes to the network – the app keeps its own offline copy.
  if (/supabase\.(co|in)$/.test(url.hostname)) return;

  // Google Fonts: serve from cache, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Big libraries, fonts, icons never change between versions: cache first.
  if (/\/(vendor|fonts|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r;
    })));
    return;
  }

  // App pages and code: try the network (max 3 s) so updates arrive, otherwise use the saved copy.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './index.html' : req;
    try {
      const r = await Promise.race([fetch(req), timeout(3000)]);
      if (r && r.ok) { cache.put(key, r.clone()); return r; }
      throw new Error('bad response');
    } catch (err) {
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
