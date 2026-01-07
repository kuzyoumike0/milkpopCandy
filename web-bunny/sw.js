const CACHE_NAME = "web-bunny-cache-v2"; // ★必ず上げる（v3でもOK）

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/bunny.png",
  "./assets/babybunny.png",
  "./assets/hart.png",
  "./assets/coin.mp3",
  "./assets/poyo.mp3",
  "./assets/coin1.png",
  "./assets/coin2.png",
  "./assets/coin3.png",
  "./assets/coin4.png",
  "./assets/bunny1.png",
  "./assets/bunny3.png",
  "./assets/bunny4.png",
  "./assets/bunny5.png",
  "./assets/reabunny.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// ★更新が起きやすいファイルは network-first で取りに行く
const NETWORK_FIRST = new Set([
  new URL("./app.js", self.location).toString(),
  new URL("./style.css", self.location).toString(),
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET以外はSWで触らない
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 同一オリジンのみ
  if (url.origin !== self.location.origin) return;

  // ★ app.js/style.css は network-first
  if (NETWORK_FIRST.has(url.toString())) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // それ以外は cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
