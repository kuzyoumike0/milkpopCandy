/* app.js — Milkpop牧場（軽量化 v12.4 LIGHT）
 * ✅ 重くて止まる問題を根本解決：
 *  - コインごとのRAF/animateを廃止 → 全コインを1本のループで更新
 *  - マグネットも全体で1本
 *  - コイン最大数を制限（多すぎると古いのを消す）
 *  - baby排除は「追加時だけ」＋軽いObserver（毎フレーム禁止）
 *
 * - 初期：bunny.png（大人）2匹
 * - お迎え：WB.emit("omukae:open") + 可能ならWB.omukae.openShopModal()
 * - クリック時のみコインドロップ（放置なし）
 * - coin価値: 1/5/10/100（coin1..4）
 * - ゲージ量でティア(1..4)
 * - MAX到達「瞬間だけ」ハートふわ（MAX中は表示だけ）
 * - reset：うさぎ+所持コイン+落ちコインのみ初期化（他LS保持）
 */

(() => {
  "use strict";
  console.log("[app.js] LOADED v12.4 LIGHT", Date.now());

  /* ===== helpers ===== */
  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const now = () => Date.now();

  /* ===== DOM ===== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");
  const resetBtn = $("#resetBtn");
  const slotBtn = $("#slotBtn");
  const departBtn = $("#departBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] required DOM not found");
    return;
  }

  /* ===== constants ===== */
  const ASSET = {
    bunny: "./assets/bunny.png",
    bunny1: "./assets/bunny1.png",
    bunny3: "./assets/bunny3.png",
    bunny4: "./assets/bunny4.png",
    bunny5: "./assets/bunny5.png",
    reabunny: "./assets/reabunny.png",

    baby: "./assets/babybunny.png", // あるが表示させない（矯正対象）

    hart: "./assets/hart.png",

    coin1: "./assets/coin1.png",
    coin2: "./assets/coin2.png",
    coin3: "./assets/coin3.png",
    coin4: "./assets/coin4.png",

    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  const OMUKAE_CATALOG = [
    { key: "bunny1", name: "bunny1", src: ASSET.bunny1, cost: 200 },
    { key: "bunny3", name: "bunny3", src: ASSET.bunny3, cost: 200 },
    { key: "bunny4", name: "bunny4", src: ASSET.bunny4, cost: 200 },
    { key: "bunny5", name: "bunny5", src: ASSET.bunny5, cost: 200 },
  ];

  const COIN_TIER = {
    1: { src: ASSET.coin1, value: 1 },
    2: { src: ASSET.coin2, value: 5 },
    3: { src: ASSET.coin3, value: 10 },
    4: { src: ASSET.coin4, value: 100 },
  };

  const LS = {
    coin: "wb_coin_v1",
    bunnies: "wb_bunnies_v12_wrapStable",
    legacyBunnyKeys: [
      "wb_bunnies_v10_omukaeDepends",
      "wb_bunnies_v11_wrapCss",
      "wb_bunnies_v9",
      "wb_bunnies_v8",
    ],
  };

  const START_BUNNIES = 2;
  const CLICK_COOLDOWN_MS = 900;

  const GAUGE = { max: 100, perSec: 4, drainOnDrop: 35 };

  // ★コイン見た目サイズ（大きめ）
  const COIN_W = 56, COIN_H = 56;

  // ★コイン上限（重さ対策）
  const MAX_COINS_ON_FIELD = 180;

  // ★マグネット（軽量：全体で1回だけ）
  const MAGNET_RADIUS = 190;
  const MAGNET_SPEED = 0.30;

  /* ===== Audio ===== */
  const SE = {
    poyo: new Audio(ASSET.sePoyo),
    coin: new Audio(ASSET.seCoin),
  };
  SE.poyo.preload = "auto";
  SE.coin.preload = "auto";
  const playSE = (aud) => { try { aud.currentTime = 0; aud.play(); } catch {} };

  /* ===== WB event bus ===== */
  const WB = (window.WB = window.WB || {});
  const listeners = new Map();
  WB.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WB.emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
  };

  /* ===== State ===== */
  let coin = 0;
  const bunnies = [];

  // ★コイン物理：配列で管理（ここが軽い）
  const coins = []; // {id, tier, value, el, x, y, vx, vy, life, collected}
  let nextCoinId = 1;

  let rafId = 0;
  let lastTickAt = now();

  /* ===== mouse for magnet ===== */
  let mouseX = -9999, mouseY = -9999;
  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  /* ===== Storage ===== */
  function loadCoin() {
    const n = Number(localStorage.getItem(LS.coin) || "0");
    coin = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    coinValueEl.textContent = String(coin);
  }
  function saveCoin() { localStorage.setItem(LS.coin, String(coin)); }
  function renderCoin() { coinValueEl.textContent = String(coin); }

  function addCoin(n) {
    coin = Math.max(0, coin + Math.floor(n));
    renderCoin(); saveCoin();
  }
  function spendCoin(n) {
    n = Math.floor(n);
    if (coin < n) return false;
    coin -= n;
    renderCoin(); saveCoin();
    return true;
  }

  function loadBunnies() {
    try {
      const raw = localStorage.getItem(LS.bunnies);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(x => ({
        bornAt: Number(x?.bornAt),
        x: Number(x?.x),
        dir: Number(x?.dir),
        // ★強制adult復元
        isBaby: false,
        growAt: 0,
        gauge: 0,
        maxAnimArmed: true,
        adultSrc: typeof x?.adultSrc === "string" ? x.adultSrc : "",
        targetAdultSrc: typeof x?.targetAdultSrc === "string" ? x.targetAdultSrc : "",
      })).filter(x => Number.isFinite(x.bornAt));
    } catch { return []; }
  }

  function saveBunnies() {
    const data = bunnies.map(b => ({
      bornAt: b.bornAt,
      x: Math.round(b.x),
      dir: b.dir,
      isBaby: false,
      growAt: 0,
      gauge: Math.round(b.gauge),
      maxAnimArmed: b.maxAnimArmed,
      adultSrc: b.adultSrc || "",
      targetAdultSrc: b.targetAdultSrc || "",
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* ===== util ===== */
  function getFloorY() { return Math.max(0, field.clientHeight - 74); }

  function tierFromGauge(g) {
    g = clamp(g, 0, GAUGE.max);
    if (g < 25) return 1;
    if (g < 50) return 2;
    if (g < 75) return 3;
    return 4;
  }

  /* ===== baby排除（軽量版） ===== */
  function sanitizeBabyOnce() {
    const imgs = bunnyLayer.querySelectorAll("img.bunny");
    imgs.forEach((img) => {
      const src = (img.getAttribute("src") || "");
      if (src.includes("babybunny")) img.setAttribute("src", ASSET.bunny);
      const wrap = img.closest(".bunnyWrap");
      if (wrap) wrap.classList.remove("baby");
    });
  }

  // ★Observerは「追加時だけ」反応させる（連打しない）
  let sanitizeQueued = false;
  const mo = new MutationObserver(() => {
    if (sanitizeQueued) return;
    sanitizeQueued = true;
    queueMicrotask(() => {
      sanitizeQueued = false;
      sanitizeBabyOnce();
    });
  });
  mo.observe(bunnyLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class"] });

  /* ===== Coin spawn/collect（軽量） ===== */
  function collectCoin(c) {
    if (c.collected) return;
    c.collected = true;
    try { c.el.remove(); } catch {}
    addCoin(c.value);
    playSE(SE.coin);
  }

  function spawnCoin(tier, x, y) {
    const def = COIN_TIER[tier] || COIN_TIER[1];

    // 上限超過：古いのから消す（重さ対策）
    while (coins.length >= MAX_COINS_ON_FIELD) {
      const old = coins.shift();
      if (old && !old.collected) { try { old.el.remove(); } catch {} }
    }

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.draggable = false;

    el.style.position = "absolute";
    el.style.width = `${COIN_W}px`;
    el.style.height = `${COIN_H}px`;
    el.style.pointerEvents = "auto";
    el.style.userSelect = "none";

    // 当たり判定拡張（見た目そのまま）
    el.style.padding = "16px";
    el.style.margin  = "-16px";

    const floorY = getFloorY();
    const sx = clamp(x, 0, field.clientWidth - COIN_W);
    const sy = clamp(y, 0, floorY - COIN_H);

    // 「ぶわッ」：初速で散る（物理で）
    const c = {
      id: nextCoinId++,
      tier,
      value: def.value,
      el,
      x: sx,
      y: sy,
      vx: rand(-220, 220),  // px/sec
      vy: rand(-520, -320), // 上へ
      life: 8.0,            // 秒（長く残りすぎ防止）
      collected: false,
    };

    el.style.left = `${c.x}px`;
    el.style.top  = `${c.y}px`;

    el.addEventListener("mouseenter", () => collectCoin(c), { passive: true });
    el.addEventListener("click", () => collectCoin(c));

    coinLayer.appendChild(el);
    coins.push(c);
  }

  function clearAllCoins() {
    for (const c of coins) { try { c.el.remove(); } catch {} }
    coins.length = 0;
  }

  /* ===== Bunny ===== */
  function placeWrap(b) {
    const maxX = Math.max(0, field.clientWidth - 140);
    b.x = clamp(b.x, 0, maxX);

    const floorY = getFloorY();
    b.y = clamp(floorY - 140 + 22, 0, floorY);

    b.wrap.style.left = `${b.x}px`;
    b.wrap.style.top  = `${b.y}px`;

    b.wrap.classList.toggle("flip", b.dir < 0);
    b.wrap.classList.remove("baby");
  }

  function setHeartState(b, state) {
    b.heart.classList.remove("visible", "show");
    b.heart.style.opacity = "0";
    if (state === "visible") { b.heart.classList.add("visible"); b.heart.style.opacity = "1"; }
    if (state === "show")    { b.heart.classList.add("show");    b.heart.style.opacity = "1"; }
  }

  function updateHeart(b) {
    const isMax = b.gauge >= GAUGE.max;
    if (!isMax) {
      b.maxAnimArmed = true;
      setHeartState(b, "hide");
      return;
    }
    if (b.maxAnimArmed) {
      b.maxAnimArmed = false;
      setHeartState(b, "show");
      setTimeout(() => setHeartState(b, "visible"), 2600);
      saveBunnies();
    } else {
      setHeartState(b, "visible");
    }
  }

  function calcDropCount(b) {
    const step = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);
    return clamp(1 + step + (b.gauge >= GAUGE.max ? 1 : 0), 1, 8);
  }

  function dropCoinsFromBunny(b) {
    const tier = tierFromGauge(b.gauge);
    const count = calcDropCount(b);

    const footX = b.x + 70;
    const footY = b.y + 140 - 22;

    for (let i = 0; i < count; i++) {
      spawnCoin(tier, footX + rand(-10, 10) - COIN_W / 2, footY + rand(-4, 2) - COIN_H / 2);
    }

    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
    updateHeart(b);
    saveBunnies();
  }

  function createBunny(opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = "bunnyWrap";

    const img = document.createElement("img");
    img.className = "bunny";
    img.draggable = false;
    img.alt = "bunny";

    const heart = document.createElement("img");
    heart.className = "bunnyHeart";
    heart.src = ASSET.hart;
    heart.alt = "heart";
    heart.draggable = false;

    wrap.appendChild(img);
    wrap.appendChild(heart);
    bunnyLayer.appendChild(wrap);

    // ★baby指定やbaby画像は無視
    const adultSrc =
      (typeof opts.adultSrc === "string" && opts.adultSrc && !opts.adultSrc.includes("babybunny"))
        ? opts.adultSrc
        : ASSET.bunny;

    const b = {
      bornAt: Number.isFinite(opts.bornAt) ? opts.bornAt : now(),
      x: Number.isFinite(opts.x) ? opts.x : rand(40, Math.max(41, field.clientWidth - 180)),
      y: 0,
      vx: rand(18, 34), // px/sec（ゆっくり）
      dir: Number.isFinite(opts.dir) ? Math.sign(opts.dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      lastClickAt: 0,
      gauge: 0,
      maxAnimArmed: true,
      adultSrc,
      targetAdultSrc: (typeof opts.targetAdultSrc === "string" ? opts.targetAdultSrc : ""),
      wrap, img, heart,
    };

    img.src = b.adultSrc;
    wrap.classList.remove("baby");
    wrap.classList.toggle("flip", b.dir < 0);

    setHeartState(b, "hide");
    placeWrap(b);
    updateHeart(b);

    const onTap = (ev) => {
      ev?.stopPropagation?.();
      const t = now();
      if (t - b.lastClickAt < CLICK_COOLDOWN_MS) return;
      b.lastClickAt = t;

      playSE(SE.poyo);
      dropCoinsFromBunny(b);
    };

    wrap.addEventListener("pointerdown", onTap);
    wrap.addEventListener("click", onTap);

    bunnies.push(b);
    saveBunnies();
    return b;
  }

  function clearAllBunnies() {
    for (const b of bunnies) { try { b.wrap.remove(); } catch {} }
    bunnies.length = 0;
  }

  /* ===== Main loop（うさぎ＋コインを1本で更新） ===== */
  function step() {
    const t = now();
    const dt = Math.max(0, Math.min(0.033, (t - lastTickAt) / 1000)); // 最大33ms
    lastTickAt = t;

    // --- bunny ---
    for (const b of bunnies) {
      b.gauge = clamp(b.gauge + GAUGE.perSec * dt, 0, GAUGE.max);

      b.x += b.vx * dt * b.dir;
      const maxX = Math.max(0, field.clientWidth - 140);
      if (b.x <= 0) { b.x = 0; b.dir = 1; }
      else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }

      placeWrap(b);
      updateHeart(b);
    }

    // --- coins physics ---
    const floorY = getFloorY() - COIN_H + 2;
    const g = 1400; // gravity px/sec^2

    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (c.collected) { coins.splice(i, 1); continue; }

      // life減衰（残りすぎ対策）
      c.life -= dt;
      if (c.life <= 0) {
        try { c.el.remove(); } catch {}
        coins.splice(i, 1);
        continue;
      }

      // gravity
      c.vy += g * dt;

      // magnet（近い時だけ）
      const r = c.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dxm = mouseX - cx;
      const dym = mouseY - cy;
      const d = Math.hypot(dxm, dym);
      if (d < MAGNET_RADIUS) {
        c.vx += dxm * MAGNET_SPEED * 8 * dt;
        c.vy += dym * MAGNET_SPEED * 8 * dt;
      }

      // integrate
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // bounds & floor bounce
      c.x = clamp(c.x, 0, field.clientWidth - COIN_W);

      if (c.y >= floorY) {
        c.y = floorY;
        if (Math.abs(c.vy) > 80) c.vy *= -0.32; // 小さくバウンド
        else c.vy = 0;
        c.vx *= 0.88; // 摩擦
      }

      c.el.style.left = `${c.x}px`;
      c.el.style.top  = `${c.y}px`;
    }

    rafId = requestAnimationFrame(step);
  }

  /* ===== WB public ===== */
  WB.assets = ASSET;
  WB.omukaeCatalog = OMUKAE_CATALOG;
  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.getBunnies = () => bunnies;

  WB.resetCoreOnly = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    clearAllCoins();
    clearAllBunnies();

    localStorage.removeItem(LS.bunnies);
    localStorage.removeItem(LS.coin);
    for (const k of LS.legacyBunnyKeys) localStorage.removeItem(k);

    coin = 0;
    renderCoin();
    saveCoin();

    lastTickAt = now();

    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ adultSrc: ASSET.bunny });
    }

    rafId = requestAnimationFrame(step);
  };

  /* ===== Buttons ===== */
  shopBtn?.addEventListener("click", () => {
    console.log("[ui] shop click");
    WB.emit("omukae:open", { catalog: WB.omukaeCatalog });
    WB.omukae?.openShopModal?.();
  });

  resetBtn?.addEventListener("click", () => {
    console.log("[ui] reset click");
    if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;
    WB.resetCoreOnly();
    WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
  });

  slotBtn?.addEventListener("click", () => WB.emit("ui:slot", {}));
  departBtn?.addEventListener("click", () => WB.emit("ui:depart", {}));

  /* ===== Boot ===== */
  for (const k of LS.legacyBunnyKeys) {
    try { localStorage.removeItem(k); } catch {}
  }

  loadCoin();

  const saved = loadBunnies();
  if (saved.length > 0) {
    for (const s of saved) {
      createBunny({
        bornAt: s.bornAt,
        x: Number.isFinite(s.x) ? s.x : undefined,
        dir: Number.isFinite(s.dir) ? s.dir : undefined,
        adultSrc: (s.adultSrc || ASSET.bunny),
        targetAdultSrc: s.targetAdultSrc || "",
      });
    }
  } else {
    for (let i = 0; i < START_BUNNIES; i++) createBunny({ adultSrc: ASSET.bunny });
  }

  sanitizeBabyOnce();

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", { version: "app.js-core-v12.4-light", startBunnies: bunnies.length });
})();
