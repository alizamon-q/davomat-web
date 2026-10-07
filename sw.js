
const CACHE="davomat-v2-fast-device";
const ASSETS=["./","index.html","style.css","app.js","config.js","manifest.webmanifest","assets/logo.png","assets/icon-192.png","assets/icon-512.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",e=>{
  if(e.request.url.includes("script.google.com")||e.request.url.includes("googleusercontent.com")) return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
