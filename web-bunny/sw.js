const CACHE_NAME = "web-bunny-cache-v7"; // ★必ず上げる
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./bgcolor.js",
  "./tenki.js",
  "./hanabi.js",
  "./omukae.js",
  "./zisseki.js",
  "./syougou.js",
  "./zukan.js",
  "./tabidati.js",
  "./slot.js",
  "./manifest.webmanifest",

  "./assets/bunny.png",
  "./assets/bunny1.png",
  "./assets/bunny3.png",
  "./assets/bunny4.png",
  "./assets/bunny5.png",
  "./assets/reabunny.png",
  "./assets/hart.png",

  "./assets/coin1.png",
  "./assets/coin2.png",
  "./assets/coin3.png",
  "./assets/coin4.png",

  "./assets/poyo.mp3",
  "./assets/coin.mp3",

  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ★自分のドメイン以外は触らない
  if (url.origin !== location.origin) return;

  // ★GET以外は触らない
  if (req.method !== "GET") return;

  // ★HTMLは常にネット優先（壊れたキャッシュで無限読み込みを防ぐ）
  const isHTML = req.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req).then((res) => res).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // ★それ以外は cache-first（ASSETS中心）
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
