/* app.js — Milkpop牧場（クリックドロップ + ティアコイン + MAXハート演出 + 部分リセット）
 * - コイン価値: coin1=1 / coin2=5 / coin3=10 / coin4=100
 * - ゲージ量でティア(1..4)決定（1が低、4が高）
 * - クリック時のみコインを落とす（放置ドロップなし）
 * - MAX到達“瞬間だけ”ハートふわふわ演出
 * - reabunny は bunny1 から 0.5% で進化
 * - reset は「うさぎ + 所持コイン」だけ初期化（他の保存データは保持）
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
      .wb-hart-fuwafuwa {
        animation: wbHartFuwa 1.2s ease-in-out 2;
      }
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

  const shopBtn = $("#shopBtn");
  const slotBtn = $("#slotBtn");
  const departBtn = $("#departBtn");
  const resetBtn = $("#resetBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] required DOM not found");
    return;
  }

  /* =========================
   * Constants
   * ========================= */
  const LS = {
    coin: "wb_coin_v1",
    bunnies: "wb_bunnies_v6_tierCoin_resetPartial",
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

  const COIN_TIER = {
    1: { src: ASSET.coin1, value: 1 },
    2: { src: ASSET.coin2, value: 5 },
    3: { src: ASSET.coin3, value: 10 },
    4: { src: ASSET.coin4, value: 100 },
  };

  const START_BUNNIES = 2;
  const SHOP_COST = 200;

  const CLICK_COIN_COOLDOWN_MS = 1000;
  const BABY_GROW_MS = 3 * 60 * 1000; // 3分

  const COIN_FOOT_Y_OFFSET = 6;

  const SIZE = {
    adultW: 96,
    adultH: 96,
    babyScale: 0.65, // babyを小さく
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

  // reabunny は bunny1 から 0.5% の確率で進化
  const REA_RULE = {
    fromBunny1ToReaChance: 0.005,
  };

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
    try {
      aud.currentTime = 0;
      aud.play();
    } catch (_) {}
  }

  /* =========================
   * State
   * ========================= */
  let coin = 0;

  /** @type {Array<BunnyState>} */
  const bunnies = [];

  /** @type {Map<number, HTMLElement>} */
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
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* =========================
   * Coin (value + tier)
   * ========================= */
  function renderCoin() {
    coinValueEl.textContent = String(coin);
  }

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

  /** ゲージ量でティア決定（1が低、4が高） */
  function tierFromGauge(g) {
    g = clamp(g, 0, GAUGE.max);
    if (g < 25) return 1;
    if (g < 50) return 2;
    if (g < 75) return 3;
    return 4; // 75〜100
  }

  function spawnCoinAtTier(tier, x, y) {
    const def = COIN_TIER[tier] || COIN_TIER[1];
    const id = now() + Math.floor(Math.random() * 9999);

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.alt = `coin-tier-${tier}`;
    el.draggable = false;

    el.onerror = () => {
      // 画像が無い場合も回収だけ動く
      el.removeAttribute("src");
      el.style.width = `${SIZE.coinW}px`;
      el.style.height = `${SIZE.coinH}px`;
      el.style.background = "rgba(255,215,0,0.25)";
      el.style.border = "1px solid rgba(255,215,0,0.6)";
      el.style.borderRadius = "999px";
      el.style.boxSizing = "border-box";
    };

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

    const collect = () => {
      if (!spawnedCoins.has(id)) return;
      spawnedCoins.delete(id);
      el.remove();
      playSE(SE.coin);
      addCoin(def.value); // ✅ tierごとの価値で加算
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
  /**
   * @typedef {Object} BunnyState
   * @property {number} bornAt
   * @property {number} x
   * @property {number} y
   * @property {number} vx
   * @property {number} dir
   * @property {boolean} isBaby
   * @property {number} growAt
   * @property {number} lastClickAt
   * @property {number} gauge
   * @property {boolean} maxAnimArmed
   * @property {string} adultSrc
   * @property {HTMLImageElement} el
   * @property {HTMLImageElement} hartEl
   */

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

    bunnyLayer.appendChild(h);
    b.hartEl = h;
  }

  function playHartFuwa(b) {
    b.hartEl.classList.remove("wb-hart-fuwafuwa");
    void b.hartEl.offsetWidth; // reflow
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

    // ✅ MAX到達“瞬間だけ”ふわふわ
    if (isMax && b.maxAnimArmed) {
      b.maxAnimArmed = false;
      playHartFuwa(b);
      saveBunnies();
    } else if (!isMax && !b.maxAnimArmed) {
      // 次回MAX到達に備える
      b.maxAnimArmed = true;
      saveBunnies();
    }
  }

  function chooseAdultSrc() {
    const base = [ASSET.bunny, ASSET.bunny1, ASSET.bunny3, ASSET.bunny4, ASSET.bunny5];
    const picked = base[Math.floor(Math.random() * base.length)];
    if (picked === ASSET.bunny1 && Math.random() < REA_RULE.fromBunny1ToReaChance) {
      return ASSET.reabunny;
    }
    return picked;
  }

  function createBunny({ isBaby, x, dir, bornAt, growAt, gauge, maxAnimArmed, adultSrc } = {}) {
    const el = document.createElement("img");
    el.className = "bunny";
    el.draggable = false;
    el.alt = "bunny";

    const isBabyBool = !!isBaby;

    /** @type {BunnyState} */
    const b = {
      bornAt: Number.isFinite(bornAt) ? bornAt : now(),
      x: Number.isFinite(x) ? x : rand(40, Math.max(41, field.clientWidth - 120)),
      y: 0,
      vx: rand(0.25, 0.6),
      dir: Number.isFinite(dir) ? Math.sign(dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      isBaby: isBabyBool,
      growAt: Number.isFinite(growAt) && growAt > 0 ? growAt : (isBabyBool ? now() + BABY_GROW_MS : 0),
      lastClickAt: 0,
      gauge: Number.isFinite(gauge) ? clamp(gauge, 0, GAUGE.max) : 0,
      maxAnimArmed: (maxAnimArmed !== false),
      adultSrc: typeof adultSrc === "string" && adultSrc ? adultSrc : (isBabyBool ? "" : chooseAdultSrc()),
      el,
      hartEl: null,
    };

    el.src = b.isBaby ? ASSET.baby : (b.adultSrc || chooseAdultSrc());

    el.style.position = "absolute";
    el.style.userSelect = "none";
    el.style.webkitUserSelect = "none";
    el.style.touchAction = "manipulation";

    applyBunnySize(b);
    applyBunnyTransform(b);
    clampBunnyInField(b);

    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;

    ensureHart(b);
    updateHart(b);

    // ✅ クリック時のみコインドロップ
    el.addEventListener("click", () => {
      const t = now();
      if (t - b.lastClickAt < CLICK_COIN_COOLDOWN_MS) return;
      b.lastClickAt = t;

      playSE(SE.poyo);
      dropCoinsFromBunny(b, "click");
    });

    bunnyLayer.appendChild(el);
    bunnies.push(b);
    saveBunnies();
    return b;
  }

  function calcDropCount(b) {
    if (b.isBaby) return 1;

    // クリック1回で “枚数” もゲージで少し増える（ティアは別で決まる）
    // 0-24: 1枚 / 25-49: 2枚 / 50-74: 3枚 / 75-99: 4枚 / 100: 5枚
    const step = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);
    return clamp(1 + step + (b.gauge >= GAUGE.max ? 1 : 0), 1, 8);
  }

  function drainGaugeOnDrop(b) {
    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
  }

  function dropCoinsFromBunny(b, reason = "click") {
    const w = bunnyW(b);
    const h = bunnyH(b);

    const footX = b.x + w * 0.5;
    const footY = b.y + h - COIN_FOOT_Y_OFFSET;

    // ✅ ティアはゲージ量で決定（1が低、4が高）
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

    WB.emit("coin:drop", { bornAt: b.bornAt, count, reason, gauge: b.gauge, tier });
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
      // 成長：baby -> adult（ここでadult画像確定）
      if (b.isBaby && b.growAt && t >= b.growAt) {
        b.isBaby = false;
        b.growAt = 0;
        b.adultSrc = chooseAdultSrc();
        b.el.src = b.adultSrc;
        applyBunnySize(b);
        clampBunnyInField(b);
        WB.emit("bunny:grow", { bornAt: b.bornAt, adultSrc: b.adultSrc });
        saveBunnies();
      }

      // ゲージ増加（adultのみ / UIは出さない）
      if (!b.isBaby) {
        b.gauge = clamp(b.gauge + GAUGE.perSec * dtSec, 0, GAUGE.max);
      } else {
        b.gauge = 0;
      }

      // 移動（画面外に出ない）
      b.x += b.vx * b.dir;
      const w = bunnyW(b);
      const maxX = Math.max(0, field.clientWidth - w);

      if (b.x <= 0) {
        b.x = 0; b.dir = 1;
      } else if (b.x >= maxX) {
        b.x = maxX; b.dir = -1;
      }

      clampBunnyInField(b);
      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${b.y}px`;
      applyBunnyTransform(b);

      // ハート：MAXのみ表示 / 到達瞬間だけ演出
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
   * Buttons
   * ========================= */
  shopBtn?.addEventListener("click", () => {
    if (!spendCoin(SHOP_COST)) {
      alert(`コインが足りません（${SHOP_COST}必要）`);
      return;
    }
    const b = createBunny({ isBaby: true });
    WB.emit("shop:buy", { bornAt: b.bornAt, cost: SHOP_COST });
  });

  slotBtn?.addEventListener("click", () => WB.emit("ui:slot", {}));
  departBtn?.addEventListener("click", () => WB.emit("ui:depart", {}));

  // ✅ リセット：うさぎ + 所持コイン + 画面上の落ちコインだけ初期化（他データは残す）
  resetBtn?.addEventListener("click", () => {
    if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;

    // ループ停止
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    // 画面から削除
    clearAllSpawnedCoins();
    clearAllBunnies();

    // 保存データはこの2つだけ消す（他モジュールのlocalStorageは保持）
    localStorage.removeItem(LS.bunnies);
    localStorage.removeItem(LS.coin);

    // 状態初期化
    coin = 0;
    renderCoin();
    saveCoin();

    lastTickAt = now();

    // 初期うさぎ復帰
    for (let i = 0; i < START_BUNNIES; i++) createBunny({ isBaby: false });

    // ループ再開
    rafId = requestAnimationFrame(step);

    WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
  });

  /* =========================
   * WB (Public API)
   * ========================= */
  const WB = (window.WB = window.WB || {});
  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  WB.getBunnies = () =>
    bunnies.map((b) => ({
      bornAt: b.bornAt,
      x: b.x,
      y: b.y,
      dir: b.dir,
      isBaby: b.isBaby,
      gauge: b.gauge,
      adultSrc: b.adultSrc || "",
    }));

  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.spawnCoinAtTier = (tier, x, y) => spawnCoinAtTier(tier, x, y);

  const listeners = new Map();
  WB.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WB.emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (_) {}
    }
  };

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
      });
    }
  } else {
    for (let i = 0; i < START_BUNNIES; i++) createBunny({ isBaby: false });
  }

  window.addEventListener("resize", onResize);

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", {
    version: "app.js-core-v6-tierCoin-resetPartial",
    startBunnies: bunnies.length,
  });
})();
