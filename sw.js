// Service Worker: App offline verfügbar machen + Teilebilder zwischenspeichern
const APP_CACHE = "lego-app-v4";
const IMG_CACHE = "lego-img-v1";
const APP_FILES = ["./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];

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

  // Seitenaufruf (Navigation): immer frisch vom Netz, offline aus dem Cache.
  // Safari zeigt eine leere Seite, wenn ein Service Worker eine umgeleitete Antwort liefert –
  // deshalb wird die Antwort hier "sauber" neu verpackt.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const net = await fetch(req.url, {credentials: "same-origin", cache: "no-store"});
        const body = await net.blob();
        const res = new Response(body, {status: net.status, statusText: net.statusText, headers: {"Content-Type": net.headers.get("Content-Type") || "text/html; charset=utf-8"}});
        if (net.ok) (await caches.open(APP_CACHE)).put("./index.html", res.clone());
        return res;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Übrige eigene Dateien (Icons, Manifest): Netz zuerst, offline aus dem Cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || Response.error()))
    );
  }
});
