// Service worker Tribune : coquille hors ligne, cache des données, réception des notifications push.
const VERSION = "tribune-v2.0.0";
const SHELL = ["./", "index.html", "styles.css", "app.js", "detect.js", "catalog.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION + "-shell").then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Données : réseau d'abord, dernière réponse connue si hors ligne
  if (url.pathname.startsWith("/espn/") || /espn\.com$/.test(url.hostname)) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION + "-data").then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || new Response(JSON.stringify({ error: "hors ligne" }), { status: 503, headers: { "Content-Type": "application/json" } }))));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Coquille : cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION + "-shell").then(c => c.put(e.request, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Tribune", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Tribune", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (new URL(c.url).origin === self.location.origin) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
