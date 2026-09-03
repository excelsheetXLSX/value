/* There is no network data in this app — every byte is app shell, precached
   on install so the app opens instantly and works with no signal.

   Serving purely cache-first was wrong: a deploy could not reach a phone that
   already had the app, so a fixed bug stayed visibly broken. Every response is
   now served from cache AND revalidated against the network in the background,
   and when a new worker takes over the page reloads itself once. Offline is
   unaffected — the network half just fails and the cache answers. */

const CACHE_VERSION = 'v5';
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

/* fetch past the HTTP cache — GitHub Pages serves these with max-age, and a
   revalidation that a stale browser cache can answer revalidates nothing */
function fresh(url, key){
  return fetch(url, {cache: 'reload', credentials: 'same-origin'}).then(res => {
    if(res.ok && res.type === 'basic'){
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(key, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   /* never cache anything external */

  /* A navigation is always the app shell — index.html answers it, so a deep
     link or a refresh works with no network at all. */
  const key = req.mode === 'navigate' ? 'index.html' : req;

  e.respondWith(
    caches.match(key).then(hit => {
      /* the catch matters even when the cache answers: offline, this fetch
         always rejects, and an uncaught rejection per request is noise */
      const net = fresh(req.mode === 'navigate' ? 'index.html' : req.url, key)
        .catch(() => hit || caches.match('index.html'));
      /* answer from cache straight away; the network copy lands in the cache
         for next time. With nothing cached yet, wait for the network. */
      return hit || net;
    })
  );
});
