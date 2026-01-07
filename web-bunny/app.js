/* app.js — Milkpop牧場（クリックドロップ専用 + ゲージ内部 + MAXハート）
 * - ゲージUIは表示しない（内部で増える）
 * - 放置でコインは落とさない（クリック時のみ）
 * - ゲージMAX(100)の時だけ hart.png をうさぎ上に表示
 * - コイン画像は assets/coin1.png〜coin4.png を使用
 * - うさぎクリックでコインを落とす（1秒クール） + poyo.mp3
 * - コイン回収は hover / click + coin.mp3
 * - お迎え（shopBtn）：コイン消費で baby 追加→3分で成長
 * - window.WB を提供（拡張JSが参照）
 */

(() => {
  "use strict";

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
    bunnies: "wb_bunnies_v4_clickOnlyGauge", // bornAt + gauge
  };

  const ASSET = {
    bunny: "./assets/bunny.png",
    baby: "./assets/babybunny.png",
    hart: "./assets/hart.png",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  const START_BUNNIES = 2;

  const CLICK_COIN_COOLDOWN_MS = 1000;

  // baby→adult 進化
  const BABY_GROW_MS = 3 * 60 * 1000; // 3分

  // コイン表示位置（うさぎの足元）
  const COIN_FOOT_Y_OFFSET = 6;

  // お迎えコスト
  const SHOP_COST = 200;

  // サイズ
  const SIZE = {
    adultW: 96,
    adultH: 96,
    babyScale: 0.72,
    coinW: 28,
    coinH: 28,
    hartW: 36,
    hartH: 36,
  };

  /* =========================
   * Gauge (internal)
   * ========================= */
  const GAUGE = {
    max: 100,
    perSec: 4,        // 1秒あたりの増加（UI無しで内部だけ貯める）
    drainOnDrop: 35,  // クリックで落としたら減る
    showHartAt: 100,  // MAXの時だけハート表示
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
  const coins = new Map();

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
          y: Number(x?.y),
          dir: Number(x?.dir),
          isBaby: !!x?.isBaby,
          growAt: Number(x?.growAt || 0),
          gauge: Number(x?.gauge || 0),
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
      y: Math.round(b.y),
      dir: b.dir,
      isBaby: b.isBaby,
      growAt: b.growAt,
      gauge: Math.round(b.gauge),
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* =========================
   * Coin API
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

  function pickCoinSrc() {
    // coin1〜4 をランダム
    const i = Math.floor(Math.random() * ASSET.coins.length);
    return ASSET.coins[i];
  }

  function spawnCoinAt(x, y) {
    const id = now() + Math.floor(Math.random() * 9999);

    const el = document.createElement("img");
    el.className = "coin";
    el.src = pickCoinSrc();
    el.alt = "coin";
    el.draggable = false;

    // 画像が無い等でも回収処理は動くフォールバック
    el.onerror = () => {
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
      if (!coins.has(id)) return;
      coins.delete(id);
      el.remove();
      playSE(SE.coin);
      addCoin(1);
    };

    el.addEventListener("mouseenter", collect, { passive: true });
    el.addEventListener("click", collect);

    coinLayer.appendChild(el);
    coins.set(id, el);
    return id;
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

  function updateHart(b) {
    ensureHart(b);

    const w = bunnyW(b);
    const cx = b.x + w * 0.5;
    const topY = b.y - 6;

    b.hartEl.style.left = `${cx}px`;
    b.hartEl.style.top = `${topY}px`;

    // ✅ MAXの時だけハート
    b.hartEl.style.opacity = (b.gauge >= GAUGE.showHartAt) ? "1" : "0";
  }

  function createBunny({ isBaby, x, dir, bornAt, growAt, gauge } = {}) {
    const el = document.createElement("img");
    el.className = "bunny";
    el.draggable = false;
    el.alt = "bunny";

    /** @type {BunnyState} */
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
      el,
      hartEl: null,
    };

    el.src = b.isBaby ? ASSET.baby : ASSET.bunny;

    el.style.position = "absolute";
    el.style.left = "0px";
    el.style.top = "0px";
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

    // ✅ クリック時のみコインを落とす
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

  // ゲージ量でコイン枚数を増やす（adultのみ）
  function calcDropCount(b) {
    if (b.isBaby) return 1;

    // 0-24:+0 / 25-49:+1 / 50-74:+2 / 75-99:+3 / 100:+4
    const bonus = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);

    // ベース 1〜2
    const base = (Math.random() < 0.55) ? 1 : 2;

    // MAX時はさらに+1（気持ちよく）
    const maxExtra = (b.gauge >= GAUGE.max) ? 1 : 0;

    return clamp(base + bonus + maxExtra, 1, 12);
  }

  function drainGaugeOnDrop(b) {
    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
  }

  function dropCoinsFromBunny(b, reason = "click") {
    const w = bunnyW(b);
    const h = bunnyH(b);
    const footX = b.x + w * 0.5;
    const footY = b.y + h - COIN_FOOT_Y_OFFSET;

    const count = calcDropCount(b);

    for (let i = 0; i < count; i++) {
      const cx = footX + rand(-10, 10) - SIZE.coinW / 2;
      const cy = footY + rand(-4, 2) - SIZE.coinH / 2;
      spawnCoinAt(cx, cy);
    }

    // ゲージ減＆ハート更新（adultのみ）
    if (!b.isBaby) {
      drainGaugeOnDrop(b);
      updateHart(b);
      saveBunnies();
    }

    WB.emit("coin:drop", { bornAt: b.bornAt, count, reason, gauge: b.gauge });
  }

  function removeBunnyByBornAt(bornAt) {
    const idx = bunnies.findIndex((b) => b.bornAt === bornAt);
    if (idx === -1) return false;
    const b = bunnies[idx];
    b.el.remove();
    b.hartEl?.remove();
    bunnies.splice(idx, 1);
    saveBunnies();
    WB.emit("bunny:remove", { bornAt });
    return true;
  }

  /* =========================
   * Loop
   * ========================= */
  function step() {
    const t = now();
    const dtSec = Math.max(0, Math.min(0.2, (t - lastTickAt) / 1000));
    lastTickAt = t;

    for (const b of bunnies) {
      // 成長
      if (b.isBaby && b.growAt && t >= b.growAt) {
        b.isBaby = false;
        b.growAt = 0;
        b.el.src = ASSET.bunny;
        applyBunnySize(b);
        clampBunnyInField(b);
        WB.emit("bunny:grow", { bornAt: b.bornAt });
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
        b.x = 0;
        b.dir = 1;
      } else if (b.x >= maxX) {
        b.x = maxX;
        b.dir = -1;
      }

      clampBunnyInField(b);

      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${b.y}px`;
      applyBunnyTransform(b);

      // ハートはMAXの時だけ表示 & 追従
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

  resetBtn?.addEventListener("click", () => {
    if (!confirm("データをリセットします。よろしいですか？")) return;
    localStorage.removeItem(LS.coin);
    localStorage.removeItem(LS.bunnies);
    location.reload();
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
    }));

  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.removeBunny = (bornAt) => removeBunnyByBornAt(bornAt);
  WB.spawnCoinAt = (x, y) => spawnCoinAt(x, y);

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
      try {
        fn(payload);
      } catch (_) {}
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
      });
    }
  } else {
    for (let i = 0; i < START_BUNNIES; i++) createBunny({ isBaby: false });
  }

  window.addEventListener("resize", onResize);

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", {
    version: "app.js-core-v4-clickOnlyGauge-coin1to4",
    startBunnies: bunnies.length,
  });
})();
