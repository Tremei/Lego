// Service Worker: App offline verfügbar machen + Teilebilder zwischenspeichern
const APP_CACHE = "lego-app-v2";
const IMG_CACHE = "lego-img-v1";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP_CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Teilelisten-API nie cachen (Daten liegen ohnehin lokal in der App)
  if (url.hostname === "rebrickable.com") return;

  // Bilder von Rebrickable: erst Cache, sonst laden und merken
  if (url.hostname.endsWith("rebrickable.com")) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req, {ignoreVary: true});
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Eigene App-Dateien: zuerst Netz (für Updates), offline aus dem Cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(APP_CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match("./index.html")))
    );
  }
});
