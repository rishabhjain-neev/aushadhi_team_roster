const CACHE = 'aushadhi-v2';
const FILES = [
  './',
  './index.html',
  './css/aushadhi.css',
  './js/aushadhi.js',
  './data/Aushadhi_Database.xlsx'
];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES))
));
self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(r => r || fetch(e.request))
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k!==CACHE).map(k=>caches.delete(k))))
));
