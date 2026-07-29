const CACHE='o-monopolis-v5-20260729-1';
const CORE=['./','./index.html','./styles.css','./app.js','./data.js','./manifest.json','./assets/board.webp','./assets/board.jpg','./assets/icon-192.png','./assets/icon-512.png','./assets/ambient-piornedo.wav'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(res=>{if(res.ok&&new URL(event.request.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(event.request,res.clone()));return res;})));});
