/* app.js — Milkpop牧場（お迎え=omukae.js依存版）
 * - 初期：bunny.png（大人）2匹
 * - お迎え（shopBtn）は app.js では購入処理しない
 *   → WB.emit("omukae:open", { catalog }) を投げるだけ
 *   → omukae.js が UI / 支払い / 生成を担当
 *
 * - omukae.js から使う用API:
 *   - WB.spendCoin(cost)
 *   - WB.createBunny({ isBaby:true, targetAdultSrc:ASSET.bunny1|3|4|5 })
 *   - WB.omukaeCatalog（商品一覧）
 *
 * - クリック時のみコインドロップ（放置ドロップなし）
 * - coin価値: coin1=1 / coin2=5 / coin3=10 / coin4=100
 * - ゲージ量でティア(1..4)決定（1低〜4高）
 * - MAX到達“瞬間だけ”ハートふわふわ演出（MAX中は表示のみ）
 * - baby→3分で進化：targetAdultSrc があればそれへ進化
 *   - ただし targetAdultSrc が bunny1 の場合のみ 0.5% で reabunny
 * - reset：うさぎ + 所持コイン + 落ちコインのみ初期化（他LS保持）
 */

(() => {
  "use strict";

  /* =========================
   * Inject CSS (hart fuwafuwa)
   * ========================= */
  (() => {
    const css = `
      @keyframes wbHartFuwa {
        0%   { transform: translate(-50%, -100%) translateY(0)   scale(1); }
        25%  { transform: translate(-50%, -100%) translateY(-6px) scale(1.06); }
        50%  { transform: translate(-50%, -100%) translateY(0)   scale(1); }
        75%  { transform: translate(-50%, -100%) translateY(-4px) scale(1.04); }
        100% { transform: translate(-50%, -100%) translateY(0)   scale(1); }
      }
      .wb-hart-fuwafuwa { animation: wbHartFuwa 1.2s ease-in-out 2; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  })();

  /* =========================
   * Helpers
   * ========================= */
  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const now = () => Date.now();

  /* =========================
   * DOM
   * ========================= */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");   // お迎え（omukae.jsが処理）
  const slotBtn = $("#slotBtn");
  const departBtn = $("#departBtn");
  const resetBtn = $("#resetBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] required DOM not found");
    return;
  }

  // クリック不能対策（レイヤーを明示）
  bunnyLayer.style.position = bunnyLayer.style.position || "absolute";
  bunnyLayer.style.inset = bunnyLayer.style.inset || "0";
  bunnyLayer.style.zIndex = "20";

  coinLayer.style.position = coinLayer.style.position || "absolute";
  coinLayer.style.inset = coinLayer.style.inset || "0";
  coinLayer.style.zIndex = "30";

  /* =========================
   * Constants
   * ========================= */
  const LS = {
    coin: "wb_coin_v1",
    bunnies: "wb_bunnies_v10_omukaeDepends",
  };

  const ASSET = {
    bunny: "./assets/bunny.png",
    bunny1: "./assets/bunny1.png",
    bunny3: "./assets/bunny3.png",
    bunny4: "./assets/bunny4.png",
    bunny5: "./assets/bunny5.png",
    reabunny: "./assets/reabunny.png",

    baby: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coin1: "./assets/coin1.png",
    coin2: "./assets/coin2.png",
    coin3: "./assets/coin3.png",
    coin4: "./assets/coin4.png",

    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  // omukae.js が参照する「商品一覧」(コストは仮。omukae.js側で上書きしてもOK)
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

  const START_BUNNIES = 2;

  const CLICK_COOLDOWN_MS = 1000;
  const BABY_GROW_MS = 3 * 60 * 1000;

  const COIN_FOOT_Y_OFFSET = 6;

  const SIZE = {
    adultW: 96,
    adultH: 96,
    babyScale: 0.65,
    coinW: 28,
    coinH: 28,
    hartW: 36,
    hartH: 36,
  };

  const GAUGE = {
    max: 100,
    perSec: 4,
    drainOnDrop: 35,
    showHartAt: 100,
  };

  // bunny1指定の時だけ 0.5% で reabunny
  const REA_RULE = { fromBunny1ToReaChance: 0.005 };

  /* =========================
   * Audio
   * ========================= */
  const SE = {
    poyo: new Audio(ASSET.sePoyo),
    coin: new Audio(ASSET.seCoin),
  };
  SE.poyo.preload = "auto";
  SE.coin.preload = "auto";

  function playSE(aud) {
    try { aud.currentTime = 0; aud.play(); } catch {}
  }

  /* =========================
   * State
   * ========================= */
  let coin = 0;
  const bunnies = [];
  const spawnedCoins = new Map();

  let rafId = 0;
  let lastTickAt = now();

  /* =========================
   * Storage
   * ========================= */
  function loadCoin() {
    const n = Number(localStorage.getItem(LS.coin) || "0");
    coin = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    coinValueEl.textContent = String(coin);
  }
  function saveCoin() {
    localStorage.setItem(LS.coin, String(coin));
  }

  function loadBunnies() {
    try {
      const raw = localStorage.getItem(LS.bunnies);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => ({
          bornAt: Number(x?.bornAt),
          x: Number(x?.x),
          dir: Number(x?.dir),
          isBaby: !!x?.isBaby,
          growAt: Number(x?.growAt || 0),
          gauge: Number(x?.gauge || 0),
          maxAnimArmed: x?.maxAnimArmed !== false,
          adultSrc: typeof x?.adultSrc === "string" ? x.adultSrc : "",
          targetAdultSrc: typeof x?.targetAdultSrc === "string" ? x.targetAdultSrc : "",
        }))
        .filter((x) => Number.isFinite(x.bornAt));
    } catch {
      return [];
    }
  }

  function saveBunnies() {
    const data = bunnies.map((b) => ({
      bornAt: b.bornAt,
      x: Math.round(b.x),
      dir: b.dir,
      isBaby: b.isBaby,
      growAt: b.growAt,
      gauge: Math.round(b.gauge),
      maxAnimArmed: b.maxAnimArmed,
      adultSrc: b.adultSrc || "",
      targetAdultSrc: b.targetAdultSrc || "",
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* =========================
   * Coin
   * ========================= */
  function renderCoin() { coinValueEl.textContent = String(coin); }

  function addCoin(n) {
    coin = Math.max(0, coin + Math.floor(n));
    renderCoin();
    saveCoin();
  }

  function spendCoin(n) {
    n = Math.floor(n);
    if (coin < n) return false;
    coin -= n;
    renderCoin();
    saveCoin();
    return true;
  }

  function getFloorY() {
    return Math.max(0, field.clientHeight - 74);
  }

  function tierFromGauge(g) {
    g = clamp(g, 0, GAUGE.max);
    if (g < 25) return 1;
    if (g < 50) return 2;
    if (g < 75) return 3;
    return 4;
  }

  function spawnCoinAtTier(tier, x, y) {
    const def = COIN_TIER[tier] || COIN_TIER[1];
    const id = now() + Math.floor(Math.random() * 9999);

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.alt = `coin-tier-${tier}`;
    el.draggable = false;

    const floorY = getFloorY();
    const px = clamp(x, 0, field.clientWidth - SIZE.coinW);
    const py = clamp(y, 0, floorY);

    el.style.position = "absolute";
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.width = `${SIZE.coinW}px`;
    el.style.height = `${SIZE.coinH}px`;
    el.style.pointerEvents = "auto";
    el.style.userSelect = "none";
    el.style.zIndex = "40";

    const collect = () => {
      if (!spawnedCoins.has(id)) return;
      spawnedCoins.delete(id);
      el.remove();
      playSE(SE.coin);
      addCoin(def.value);
    };

    el.addEventListener("mouseenter", collect, { passive: true });
    el.addEventListener("click", collect);

    coinLayer.appendChild(el);
    spawnedCoins.set(id, el);
    return id;
  }

  function clearAllSpawnedCoins() {
    for (const el of spawnedCoins.values()) {
      try { el.remove(); } catch {}
    }
    spawnedCoins.clear();
  }

  /* =========================
   * Bunny
   * ========================= */
  function bunnyW(b) {
    return b.isBaby ? Math.round(SIZE.adultW * SIZE.babyScale) : SIZE.adultW;
  }
  function bunnyH(b) {
    return b.isBaby ? Math.round(SIZE.adultH * SIZE.babyScale) : SIZE.adultH;
  }
  function applyBunnySize(b) {
    b.el.style.width = `${bunnyW(b)}px`;
    b.el.style.height = `${bunnyH(b)}px`;
  }
  function applyBunnyTransform(b) {
    const flip = b.dir >= 0 ? 1 : -1;
    b.el.style.transform = `scaleX(${flip})`;
  }
  function clampBunnyInField(b) {
    const w = bunnyW(b);
    const h = bunnyH(b);
    const maxX = Math.max(0, field.clientWidth - w);
    const floorY = getFloorY();
    const y = clamp(floorY - h + 22, 0, floorY);
    b.x = clamp(b.x, 0, maxX);
    b.y = y;
  }

  function ensureHart(b) {
    if (b.hartEl) return;
    const h = document.createElement("img");
    h.className = "hart";
    h.src = ASSET.hart;
    h.alt = "hart";
    h.draggable = false;

    h.style.position = "absolute";
    h.style.width = `${SIZE.hartW}px`;
    h.style.height = `${SIZE.hartH}px`;
    h.style.pointerEvents = "none";
    h.style.userSelect = "none";
    h.style.opacity = "0";
    h.style.transform = "translate(-50%, -100%)";
    h.style.zIndex = "25";

    bunnyLayer.appendChild(h);
    b.hartEl = h;
  }

  function playHartFuwa(b) {
    b.hartEl.classList.remove("wb-hart-fuwafuwa");
    void b.hartEl.offsetWidth;
    b.hartEl.classList.add("wb-hart-fuwafuwa");
    setTimeout(() => b.hartEl?.classList.remove("wb-hart-fuwafuwa"), 2800);
  }

  function updateHart(b) {
    ensureHart(b);

    const w = bunnyW(b);
    const cx = b.x + w * 0.5;
    const topY = b.y - 6;

    b.hartEl.style.left = `${cx}px`;
    b.hartEl.style.top = `${topY}px`;

    const isMax = b.gauge >= GAUGE.showHartAt;
    b.hartEl.style.opacity = isMax ? "1" : "0";

    if (isMax && b.maxAnimArmed) {
      b.maxAnimArmed = false;
      playHartFuwa(b);
      saveBunnies();
    } else if (!isMax && !b.maxAnimArmed) {
      b.maxAnimArmed = true;
      saveBunnies();
    }
  }

  function calcDropCount(b) {
    if (b.isBaby) return 1;
    const step = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);
    return clamp(1 + step + (b.gauge >= GAUGE.max ? 1 : 0), 1, 8);
  }

  function drainGaugeOnDrop(b) {
    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
  }

  function dropCoinsFromBunny(b) {
    const w = bunnyW(b);
    const h = bunnyH(b);
    const footX = b.x + w * 0.5;
    const footY = b.y + h - COIN_FOOT_Y_OFFSET;

    const tier = b.isBaby ? 1 : tierFromGauge(b.gauge);
    const count = calcDropCount(b);

    for (let i = 0; i < count; i++) {
      const cx = footX + rand(-10, 10) - SIZE.coinW / 2;
      const cy = footY + rand(-4, 2) - SIZE.coinH / 2;
      spawnCoinAtTier(tier, cx, cy);
    }

    if (!b.isBaby) {
      drainGaugeOnDrop(b);
      updateHart(b);
      saveBunnies();
    }
  }

  function evolveBaby(b) {
    // 指定進化があればそれ、なければ通常bunny
    let target = b.targetAdultSrc || ASSET.bunny;

    // bunny1指定だけ 0.5% で reabunny に昇格
    if (target === ASSET.bunny1 && Math.random() < REA_RULE.fromBunny1ToReaChance) {
      target = ASSET.reabunny;
    }

    b.isBaby = false;
    b.growAt = 0;
    b.adultSrc = target;

    b.el.src = b.adultSrc;
    applyBunnySize(b);
    clampBunnyInField(b);
    saveBunnies();
  }

  function createBunny({
    isBaby = false,
    x,
    dir,
    bornAt,
    growAt,
    gauge,
    maxAnimArmed,
    adultSrc,
    targetAdultSrc,
  } = {}) {
    const el = document.createElement("img");
    el.className = "bunny";
    el.draggable = false;
    el.alt = "bunny";

    const b = {
      bornAt: Number.isFinite(bornAt) ? bornAt : now(),
      x: Number.isFinite(x) ? x : rand(40, Math.max(41, field.clientWidth - 120)),
      y: 0,
      vx: rand(0.25, 0.6),
      dir: Number.isFinite(dir) ? Math.sign(dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      isBaby: !!isBaby,
      growAt: Number.isFinite(growAt) && growAt > 0 ? growAt : (isBaby ? now() + BABY_GROW_MS : 0),
      lastClickAt: 0,
      gauge: Number.isFinite(gauge) ? clamp(gauge, 0, GAUGE.max) : 0,
      maxAnimArmed: (maxAnimArmed !== false),
      adultSrc: typeof adultSrc === "string" ? adultSrc : "",
      targetAdultSrc: typeof targetAdultSrc === "string" ? targetAdultSrc : "",
      el,
      hartEl: null,
    };

    if (b.isBaby) {
      el.src = ASSET.baby;
      b.adultSrc = "";
    } else {
      b.adultSrc = b.adultSrc || ASSET.bunny;
      el.src = b.adultSrc;
    }

    // クリック不能対策（強制）
    el.style.position = "absolute";
    el.style.pointerEvents = "auto";
    el.style.zIndex = "60";
    el.style.userSelect = "none";
    el.style.webkitUserSelect = "none";
    el.style.touchAction = "manipulation";

    applyBunnySize(b);
    clampBunnyInField(b);
    applyBunnyTransform(b);

    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;

    ensureHart(b);
    updateHart(b);

    const onTap = (ev) => {
      ev?.stopPropagation?.();
      const t = now();
      if (t - b.lastClickAt < CLICK_COOLDOWN_MS) return;
      b.lastClickAt = t;

      playSE(SE.poyo);
      dropCoinsFromBunny(b);
    };
    el.addEventListener("pointerdown", onTap);
    el.addEventListener("click", onTap);

    bunnyLayer.appendChild(el);
    bunnies.push(b);
    saveBunnies();
    return b;
  }

  function clearAllBunnies() {
    for (const b of bunnies) {
      try { b.el.remove(); } catch {}
      try { b.hartEl?.remove(); } catch {}
    }
    bunnies.length = 0;
  }

  /* =========================
   * Loop
   * ========================= */
  function step() {
    const t = now();
    const dtSec = Math.max(0, Math.min(0.2, (t - lastTickAt) / 1000));
    lastTickAt = t;

    for (const b of bunnies) {
      if (b.isBaby && b.growAt && t >= b.growAt) {
        evolveBaby(b);
      }

      if (!b.isBaby) {
        b.gauge = clamp(b.gauge + GAUGE.perSec * dtSec, 0, GAUGE.max);
      } else {
        b.gauge = 0;
      }

      b.x += b.vx * b.dir;
      const w = bunnyW(b);
      const maxX = Math.max(0, field.clientWidth - w);
      if (b.x <= 0) { b.x = 0; b.dir = 1; }
      else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }

      clampBunnyInField(b);
      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${b.y}px`;
      applyBunnyTransform(b);

      updateHart(b);
    }

    rafId = requestAnimationFrame(step);
  }

  function onResize() {
    for (const b of bunnies) {
      clampBunnyInField(b);
      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${b.y}px`;
      updateHart(b);
    }
    saveBunnies();
  }

  /* =========================
   * WB (Public API) — omukae.js用
   * ========================= */
  const WB = (window.WB = window.WB || {});
  WB.assets = ASSET;
  WB.omukaeCatalog = OMUKAE_CATALOG;

  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  WB.createBunny = (opts = {}) => createBunny(opts);

  WB.resetCoreOnly = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    clearAllSpawnedCoins();
    clearAllBunnies();

    localStorage.removeItem(LS.bunnies);
    localStorage.removeItem(LS.coin);

    coin = 0;
    renderCoin();
    saveCoin();

    lastTickAt = now();

    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ isBaby: false, adultSrc: ASSET.bunny });
    }

    rafId = requestAnimationFrame(step);
  };

  const listeners = new Map();
  WB.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WB.emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch {} }
  };

  /* =========================
   * Buttons
   * ========================= */
  // ★お迎えボタンは omukae.js へ通知するだけ
  shopBtn?.addEventListener("click", () => {
    WB.emit("omukae:open", { catalog: WB.omukaeCatalog });
  });

  slotBtn?.addEventListener("click", () => WB.emit("ui:slot", {}));
  departBtn?.addEventListener("click", () => WB.emit("ui:depart", {}));

  resetBtn?.addEventListener("click", () => {
    if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;
    WB.resetCoreOnly();
    WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
  });

  /* =========================
   * Boot
   * ========================= */
  loadCoin();

  const saved = loadBunnies();
  if (saved.length > 0) {
    for (const s of saved) {
      createBunny({
        bornAt: s.bornAt,
        x: Number.isFinite(s.x) ? s.x : undefined,
        dir: Number.isFinite(s.dir) ? s.dir : undefined,
        isBaby: !!s.isBaby,
        growAt: Number.isFinite(s.growAt) ? s.growAt : 0,
        gauge: Number.isFinite(s.gauge) ? s.gauge : 0,
        maxAnimArmed: s.maxAnimArmed !== false,
        adultSrc: s.adultSrc || "",
        targetAdultSrc: s.targetAdultSrc || "",
      });
    }
  } else {
    // 初回起動：bunny 2匹（大人）
    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ isBaby: false, adultSrc: ASSET.bunny });
    }
  }

  window.addEventListener("resize", onResize);

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", { version: "app.js-core-v10-omukaeDepends", startBunnies: bunnies.length });
})();
