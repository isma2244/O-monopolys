const CACHE = 'o-monopolis-multiplayer-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.js',
  './manifest.json',
  './assets/board.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
