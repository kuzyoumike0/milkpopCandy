const CACHE_NAME = "web-bunny-cache-v8";

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

async function safeAddAll(cache, urls) {
  // ★404が混じっても install を失敗させない
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-cache" });
      if (res && res.ok) await cache.put(u, res);
      // res.ok じゃない（404等）はスキップ
    } catch {
      // ネット不調でもスキップ（install失敗させない）
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await safeAddAll(cache, ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

function isHTMLRequest(req) {
  return req.headers.get("accept")?.includes("text/html");
}

function isStaticLike(url) {
  return (
    url.pathname.endsWith(".js")  ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")||
    url.pathname.endsWith(".webp")||
    url.pathname.endsWith(".gif") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;
  if (req.method !== "GET") return;

  // ★復旧用：?nosw=1 が付いてたらネット優先（SWのせいで詰むのを防ぐ）
  if (url.searchParams.get("nosw") === "1") {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // ★HTML: network-first（失敗時にキャッシュ）
  if (isHTMLRequest(req)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  // ★静的ファイル: stale-while-revalidate（表示を止めない）
  if (isStaticLike(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      const fetchPromise = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);

      // まずキャッシュ即返し、無ければネット（失敗時はキャッシュ）
      if (cached) return cached;
      const net = await fetchPromise;
      return net || cached;
    })());
    return;
  }

  // ★その他: ひとまずネット優先＋キャッシュフォールバック
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
