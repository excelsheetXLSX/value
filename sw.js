/* There is no network data in this app — every byte is app shell. So the
   whole thing is precached on install and served from cache first, and the
   only thing that ever invalidates it is bumping CACHE_VERSION on deploy. */

const CACHE_VERSION = 'v2';
const CACHE = `value-${CACHE_VERSION}`;

const SHELL = [
  '.',
  'index.html',
  'manifest.json',
  'src/styles.css',
  'src/app.js',
  'src/units.js',
  'src/store.js',
  'src/color.js',
  'fonts/manrope-latin.woff2',
  'fonts/manrope-latin-ext.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-any-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   /* never cache anything external */

  /* A navigation is always the app shell — serve index.html so a deep link or
     a refresh works with no network at all. */
  if(req.mode === 'navigate'){
    e.respondWith(
      caches.match('index.html').then(hit => hit || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      /* cache anything in scope we didn't precache (a new icon size, say) */
      if(res.ok && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
