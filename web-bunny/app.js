/* app.js — Milkpop牧場（安定版 v12.3 FIX）
 * ✅ coinが小さい→大きく
 * ✅ coinが浮く→床に着地を保証（top/leftアニメ）
 * ✅ babybunnyが出る→強制排除（毎フレーム＋DOM監視）
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
  console.log("[app.js] LOADED v12.3 FIX", Date.now());

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

    // baby画像は持っていても、表示はさせない（排除対象）
    baby: "./assets/babybunny.png",

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
  const CLICK_COOLDOWN_MS = 1000;

  const GAUGE = { max: 100, perSec: 4, drainOnDrop: 35 };

  // ★ coinサイズ：大きくする（ここで調整）
  const COIN_W = 48, COIN_H = 48;

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
  const spawnedCoins = new Map();
  let rafId = 0;
  let lastTickAt = now();

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

  // ★ baby復元を絶対させない：isBaby/growAtは無視
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
        // 強制adult
        isBaby: false,
        growAt: 0,
        gauge: Number(x?.gauge || 0), // ゲージは残してOK（嫌なら0固定で）
        maxAnimArmed: x?.maxAnimArmed !== false,
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

  /* ===== Coin: 回収しやすい(当たり拡張+マグネット) ===== */
  let mouseX = -9999, mouseY = -9999;
  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  function spawnCoinAtTier(tier, x, y) {
    const def = COIN_TIER[tier] || COIN_TIER[1];
    const id = now() + Math.floor(Math.random() * 9999);

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.alt = `coin-tier-${tier}`;
    el.draggable = false;

    // サイズ固定（CSSより強い）
    el.style.width = `${COIN_W}px`;
    el.style.height = `${COIN_H}px`;
    el.style.position = "absolute";
    el.style.pointerEvents = "auto";
    el.style.userSelect = "none";

    const floorY = getFloorY();
    // 出現点（足元付近）
    const startX = clamp(x, 0, field.clientWidth - COIN_W);
    const startY = clamp(y, 0, floorY - COIN_H);

    // ★着地点（必ず床に置く＝浮かない）
    const landY = clamp(floorY - COIN_H + 2, 0, floorY - COIN_H + 2);

    // 「雨みたいにぶわッ」：上に持ち上がって散って落ちる
    const dx = rand(-120, 120);
    const up = rand(90, 170);
    const landX = clamp(startX + dx, 0, field.clientWidth - COIN_W);

    el.style.left = `${startX}px`;
    el.style.top  = `${landY}px`; // ★最終は必ず床（浮きを根絶）

    // ★top/leftでアニメ（transform浮き問題を根絶）
    const midX = clamp(startX + dx * 0.25, 0, field.clientWidth - COIN_W);
    const midY = clamp(landY - up, 0, landY);

    const dur = rand(520, 820);

    el.animate(
      [
        { left: `${startX}px`, top: `${landY}px`, opacity: 0, transform: "scale(0.7)" },
        { left: `${midX}px`,   top: `${midY}px`,  opacity: 1, transform: "scale(1.08)", offset: 0.35 },
        { left: `${landX}px`,  top: `${landY + 10}px`, opacity: 1, transform: "scale(1)", offset: 0.85 },
        { left: `${landX}px`,  top: `${landY}px`, opacity: 1, transform: "scale(1)" },
      ],
      { duration: dur, easing: "cubic-bezier(.15,.9,.2,1)", fill: "forwards" }
    );

    // 当たり判定拡張（見た目はそのまま）
    el.style.padding = "16px";
    el.style.margin  = "-16px";

    const collect = () => {
      if (!spawnedCoins.has(id)) return;
      spawnedCoins.delete(id);
      el.remove();
      playSE(SE.coin);
      addCoin(def.value);
    };
    el.addEventListener("mouseenter", collect, { passive: true });
    el.addEventListener("click", collect);

    // マグネット吸着
    const MAGNET_RADIUS = 190;
    const MAGNET_SPEED = 0.30;
    const magnetStep = () => {
      if (!spawnedCoins.has(id)) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dxm = mouseX - cx;
      const dym = mouseY - cy;
      const d = Math.hypot(dxm, dym);
      if (d < MAGNET_RADIUS) {
        el.style.left = `${el.offsetLeft + dxm * MAGNET_SPEED}px`;
        el.style.top  = `${el.offsetTop  + dym * MAGNET_SPEED}px`;
      }
      requestAnimationFrame(magnetStep);
    };
    requestAnimationFrame(magnetStep);

    coinLayer.appendChild(el);
    spawnedCoins.set(id, el);
    return id;
  }

  function clearAllSpawnedCoins() {
    for (const el of spawnedCoins.values()) { try { el.remove(); } catch {} }
    spawnedCoins.clear();
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
    b.wrap.classList.remove("baby"); // ★常にbabyクラス排除
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

    // 足元（湧き出し）
    const footX = b.x + 70;
    const footY = b.y + 140 - 22;

    for (let i = 0; i < count; i++) {
      const cx = footX + rand(-12, 12) - COIN_W / 2;
      const cy = footY + rand(-6, 2) - COIN_H / 2;
      spawnCoinAtTier(tier, cx, cy);
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

    // ★isBabyは絶対無視＆baby画像も禁止
    const adultSrc =
      (typeof opts.adultSrc === "string" && opts.adultSrc && !opts.adultSrc.includes("babybunny"))
        ? opts.adultSrc
        : ASSET.bunny;

    const b = {
      bornAt: Number.isFinite(opts.bornAt) ? opts.bornAt : now(),
      x: Number.isFinite(opts.x) ? opts.x : rand(40, Math.max(41, field.clientWidth - 180)),
      y: 0,
      vx: rand(0.25, 0.6),
      dir: Number.isFinite(opts.dir) ? Math.sign(opts.dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      isBaby: false,
      growAt: 0,
      lastClickAt: 0,
      gauge: Number.isFinite(opts.gauge) ? clamp(opts.gauge, 0, GAUGE.max) : 0,
      maxAnimArmed: (opts.maxAnimArmed !== false),
      adultSrc,
      targetAdultSrc: (typeof opts.targetAdultSrc === "string" ? opts.targetAdultSrc : ""),
      wrap, img, heart,
    };

    wrap.classList.remove("baby");
    wrap.classList.toggle("flip", b.dir < 0);

    img.src = b.adultSrc;

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

  /* ===== baby強制排除（混入しても即矯正） ===== */
  function sanitizeBabyBunnyDOM() {
    const imgs = bunnyLayer.querySelectorAll("img.bunny");
    imgs.forEach((img) => {
      const src = (img.getAttribute("src") || "");
      if (src.includes("babybunny")) {
        // 親のwrapからadultSrcを推測できないので、まずbunnyに戻す
        img.setAttribute("src", ASSET.bunny);
      }
      const wrap = img.closest(".bunnyWrap");
      if (wrap) wrap.classList.remove("baby");
    });
  }

  // DOM監視（omukae.js等が直接DOM入れても即直す）
  const mo = new MutationObserver(() => sanitizeBabyBunnyDOM());
  mo.observe(bunnyLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "class"] });

  /* ===== Loop ===== */
  function step() {
    const t = now();
    const dtSec = Math.max(0, Math.min(0.2, (t - lastTickAt) / 1000));
    lastTickAt = t;

    for (const b of bunnies) {
      b.gauge = clamp(b.gauge + GAUGE.perSec * dtSec, 0, GAUGE.max);

      b.x += b.vx * b.dir;
      const maxX = Math.max(0, field.clientWidth - 140);
      if (b.x <= 0) { b.x = 0; b.dir = 1; }
      else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }

      placeWrap(b);
      updateHeart(b);
    }

    // 念のため：毎フレーム矯正（負荷軽い）
    sanitizeBabyBunnyDOM();

    rafId = requestAnimationFrame(step);
  }

  window.addEventListener("resize", () => {
    for (const b of bunnies) placeWrap(b);
    saveBunnies();
  });

  /* ===== WB public ===== */
  WB.assets = ASSET;
  WB.omukaeCatalog = OMUKAE_CATALOG;

  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  // ★外部から isBaby:true で呼ばれても、createBunny側で無視される
  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.getBunnies = () => bunnies;

  WB.resetCoreOnly = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    clearAllSpawnedCoins();
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
  if (shopBtn) {
    shopBtn.addEventListener("click", () => {
      console.log("[ui] shop click");
      WB.emit("omukae:open", { catalog: WB.omukaeCatalog });
      WB.omukae?.openShopModal?.();
    });
  } else {
    console.warn("[ui] shopBtn not found");
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      console.log("[ui] reset click");
      if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;
      WB.resetCoreOnly();
      WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
    });
  } else {
    console.warn("[ui] resetBtn not found");
  }

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
        gauge: 0, // 初期にゲージを残したくないなら0固定
      });
    }
  } else {
    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ adultSrc: ASSET.bunny });
    }
  }

  sanitizeBabyBunnyDOM();

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", { version: "app.js-core-v12.3-fix", startBunnies: bunnies.length });
})();
