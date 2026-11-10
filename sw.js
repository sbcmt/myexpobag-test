/** MY EXPO BAG — fresh-on-open network-only PWA worker. UI version 1.0.1. */
'use strict';
// No CacheStorage, no stale-while-revalidate, no offline app shell. A stale
// product price must never be preferred over the public live version.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Only delete legacy caches using THIS app's own prefixes. Other GitHub
    // Pages projects can share an origin; their storage must not be touched.
    const all=await caches.keys();
    await Promise.all(all.filter(name=>/^(my-expo-bag-|meb-)/i.test(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=='GET' || url.origin!==self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith(fetch(req,{cache:'no-store'}));
});
