(() => {
  "use strict";
  console.log("[app.js] LOADED FIX v16.1 (time-based charge)", Date.now());

  /* =========================
   * Assets / Defs
   * ========================= */
  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",

    ougonUnchi: "./assets/ougonunchi.png",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  const BUNNY_DEFS = {
    bunny1:  { label: "通常みるぽ",     img: "./assets/bunny1.png",  price: 300,   coinMul: 0.55, desc: "基本のうさぎ。コインは控えめ。" },
    bunny3:  { label: "毒タイプみるぽ", img: "./assets/bunny3.png",  price: 1800,  coinMul: 1.0,  desc: "安定してコインを稼ぐ中級うさぎ。" },
    bunny4:  { label: "水タイプみるぽ", img: "./assets/bunny4.png",  price: 6000,  coinMul: 1.8,  desc: "大量のコインを生み出す上級うさぎ。" },
    bunny5:  { label: "お正月みるぽ",   img: "./assets/bunny5.png",  price: 20000, coinMul: 2.8,  desc: "牧場最上級クラス。圧倒的生産力。" },
    reabunny:{ label: "黄金レアみるぽ", img: "./assets/reabunny.png", price: 0,     coinMul: 4.0,  desc: "突然変異でのみ現れる幻のうさぎ。" },
  };

  /* =========================
   * Balance
   * ========================= */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL   = 0.65;
  const REA_EVOLVE_RATE  = 0.01;

  const DEPART_COST = 10;

  /* =========================
   * Charge（時間経過で貯まる / UI表示あり）
   * - ✅ 時間経過でチャージ（クリックや回収では増えない）
   * - 満タン中ずっと hart.png を表示（上下ゆらゆら）
   * - 満タン中のクリック：多め＆高ティアでドロップ → ゲージ消費(0) → ハート消える
   * ========================= */
  const CHARGE_MAX = 100;

  // ✅ たまる速さ（例：1秒に 2 貯まる → 50秒で満タン）
  const CHARGE_PER_SEC = 2.0;

  // ✅ 初期チャージ
  const INITIAL_CHARGE = 0;

  let charge = clamp(INITIAL_CHARGE, 0, CHARGE_MAX);
  let chargeReady = (charge >= CHARGE_MAX);

  /* =========================
   * Storage
   * ========================= */
  const LS = {
    coins:     "wb_coins_v6",
    bunnies:   "wb_bunnies_v6",
    dex:       "wb_dex_v1",
    unchi:     "wb_unchi_v1",
    title:     "wb_title_v1",
    titleList: "wb_title_list_v1",
  };

  /* =========================
   * DOM
   * ========================= */
  const field      = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer  = document.getElementById("coinLayer");
  const coinValueEl= document.getElementById("coinValue");

  const shopBtn    = document.getElementById("shopBtn");
  const departBtn  = document.getElementById("departBtn");
  const resetBtn   = document.getElementById("resetBtn");
  const rankBtn    = document.getElementById("rankBtn");
  const slotBtn    = document.getElementById("slotBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] 必要DOMが見つかりません");
    return;
  }

  /* =========================
   * Event bus（WB互換）
   * ========================= */
  const __events = new Map();
  function on(ev, fn) {
    if (!__events.has(ev)) __events.set(ev, new Set());
    __events.get(ev).add(fn);
  }
  function off(ev, fn) { __events.get(ev)?.delete(fn); }
  function emit(ev, payload) {
    __events.get(ev)?.forEach((fn) => { try { fn(payload); } catch {} });
  }

  /* =========================
   * Utils / Field size cache
   * ========================= */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  const rand  = (a, b) => a + Math.random() * (b - a);

  let FIELD_W = 1, FIELD_H = 1;
  function refreshFieldSize() {
    FIELD_W = Math.max(1, field.clientWidth  || field.getBoundingClientRect().width  || 1);
    FIELD_H = Math.max(1, field.clientHeight || field.getBoundingClientRect().height || 1);
  }
  refreshFieldSize();
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });

  function groundY() { return FIELD_H - 60; }

  /* =========================
   * Audio
   * ========================= */
  const sePoyo     = new Audio(ASSETS.poyoSE);
  const seBaby     = new Audio(ASSETS.babySE);
  const seCoin     = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      sePoyo.muted = true;
      sePoyo.currentTime = 0;
      sePoyo.play()
        .then(() => { sePoyo.pause(); sePoyo.currentTime = 0; sePoyo.muted = false; })
        .catch(() => (sePoyo.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(a) {
    try { a.currentTime = 0; a.play().catch(() => {}); } catch {}
  }

  /* =========================
   * CSS injection（コイン小さく / ゲージUI / ハートゆらゆら）
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbChargeUiCss")) return;
    const st = document.createElement("style");
    st.id = "wbChargeUiCss";
    st.textContent = `
      .coin{ width:22px !important; height:22px !important; }

      /* ゲージUI */
      #wbChargeHud {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 9998;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.75);
        backdrop-filter: blur(6px);
        box-shadow: 0 10px 30px rgba(0,0,0,.10);
        font-size: 12px;
      }
      #wbChargeLabel { opacity: .9; white-space: nowrap; }
      #wbChargeBar {
        width: 140px;
        height: 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.12);
        overflow: hidden;
      }
      #wbChargeFill {
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(255,120,190,.9), rgba(255,200,120,.95));
        transform-origin: left center;
        transition: width 120ms ease;
      }
      #wbChargePct { min-width: 36px; text-align: right; opacity: .85; }

      /* ハート */
      .wbChargeHart {
        position:absolute;
        z-index:9999;
        pointer-events:none;
        user-select:none;
        -webkit-user-drag:none;
        transform: translate(-50%, -50%);
        animation: wbHartFloat 1.15s ease-in-out infinite;
        filter: drop-shadow(0 8px 14px rgba(0,0,0,.18));
        width:30px; height:30px; /* ✅ 小さめ */
      }
      @keyframes wbHartFloat {
        0%   { transform: translate(-50%, -50%) translateY(0px)   rotate(-4deg) scale(1); }
        50%  { transform: translate(-50%, -50%) translateY(-10px) rotate( 4deg) scale(1.07); }
        100% { transform: translate(-50%, -50%) translateY(0px)   rotate(-4deg) scale(1); }
      }
    `;
    document.head.appendChild(st);
  })();

  /* =========================
   * Charge UI（右上に表示）
   * ========================= */
  let chargeHudEl = null;
  let chargeFillEl = null;
  let chargePctEl = null;

  function ensureChargeHud() {
    if (chargeHudEl && chargeHudEl.isConnected) return;

    const hud = document.createElement("div");
    hud.id = "wbChargeHud";

    const label = document.createElement("div");
    label.id = "wbChargeLabel";
    label.textContent = "⏳ チャージ";

    const bar = document.createElement("div");
    bar.id = "wbChargeBar";

    const fill = document.createElement("div");
    fill.id = "wbChargeFill";
    bar.appendChild(fill);

    const pct = document.createElement("div");
    pct.id = "wbChargePct";
    pct.textContent = "0%";

    hud.appendChild(label);
    hud.appendChild(bar);
    hud.appendChild(pct);

    document.body.appendChild(hud);

    chargeHudEl = hud;
    chargeFillEl = fill;
    chargePctEl = pct;
  }

  function updateChargeHud() {
    ensureChargeHud();
    const r = clamp(charge / CHARGE_MAX, 0, 1);
    const pct = Math.round(r * 100);
    if (chargeFillEl) chargeFillEl.style.width = `${pct}%`;
    if (chargePctEl) chargePctEl.textContent = `${pct}%`;
  }

  /* =========================
   * Persistent Heart（満タン中ずっと表示）
   * ========================= */
  let chargeHartEl = null;
  let chargeHartTargetBornAt = null;

  function ensureChargeHartEl() {
    if (chargeHartEl && chargeHartEl.isConnected) return chargeHartEl;
    const el = document.createElement("img");
    el.className = "wbChargeHart";
    el.src = ASSETS.hart;
    el.draggable = false;
    el.style.display = "none";
    field.appendChild(el);
    chargeHartEl = el;
    return el;
  }

  function getBunnyByBornAt(bornAt) {
    const t = Number(bornAt);
    if (!Number.isFinite(t)) return null;
    for (const b of bunnies) if (b.bornAt === t) return b;
    return null;
  }

  function pickRandomBunny() {
    return bunnies.length ? bunnies[Math.floor(Math.random() * bunnies.length)] : null;
  }

  function showChargeHeart(targetBunny) {
    const el = ensureChargeHartEl();
    const b = targetBunny || pickRandomBunny();
    if (!b) return;
    chargeHartTargetBornAt = b.bornAt;
    el.style.display = "block";
    positionChargeHeart();
  }

  function hideChargeHeart() {
    if (!chargeHartEl) return;
    chargeHartEl.style.display = "none";
    chargeHartTargetBornAt = null;
  }

  function positionChargeHeart() {
    if (!chargeHartEl || chargeHartEl.style.display === "none") return;

    const b = getBunnyByBornAt(chargeHartTargetBornAt) || pickRandomBunny();
    if (!b) { hideChargeHeart(); return; }
    chargeHartTargetBornAt = b.bornAt;

    const r  = b.wrap.getBoundingClientRect();
    const fr = field.getBoundingClientRect();

    const x = (r.left - fr.left) + r.width * 0.5;
    const y = (r.top  - fr.top)  + r.height * 0.05;

    chargeHartEl.style.left = `${x}px`;
    chargeHartEl.style.top  = `${y}px`;
  }

  /* =========================
   * Charge helpers（時間経過）
   * ========================= */
  function setCharge(v) {
    const prevReady = chargeReady;
    charge = clamp(v, 0, CHARGE_MAX);
    chargeReady = (charge >= CHARGE_MAX);

    if (!prevReady && chargeReady) {
      showChargeHeart(null);
      emit("chargeReady", {});
    } else if (prevReady && !chargeReady) {
      hideChargeHeart();
      emit("chargeConsumed", {});
    }
    updateChargeHud();
  }

  function addChargeByTime(dtSeconds) {
    if (chargeReady) return;
    const add = CHARGE_PER_SEC * dtSeconds;
    if (add <= 0) return;
    setCharge(charge + add);
  }

  function consumeCharge() {
    setCharge(0);
  }

  function getChargeRatio() {
    return clamp(charge / CHARGE_MAX, 0, 1);
  }

  function getDropPlanFromCharge() {
    const r = getChargeRatio(); // 0..1
    const count = 1 + Math.floor(r * 9);        // 1..10
    const maxTier = Math.floor(r * 3 + 1e-9);   // 0..3

    const pickTier = () => {
      if (maxTier <= 0) return 0;

      // 高ティア優遇：w(t)=(t+1)^2
      let sum = 0;
      const w = [];
      for (let t = 0; t <= maxTier; t++) {
        const wt = (t + 1) * (t + 1);
        w.push(wt);
        sum += wt;
      }
      let x = Math.random() * sum;
      for (let t = 0; t <= maxTier; t++) {
        x -= w[t];
        if (x <= 0) return t;
      }
      return maxTier;
    };

    return { count, pickTier };
  }

  /* =========================
   * State / Storage helpers
   * ========================= */
  let coins = (() => {
    const n = parseInt(localStorage.getItem(LS.coins) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  })();

  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    emit("hudUpdated", { coins });
  }

  function safeKind(k) { return BUNNY_DEFS[k] ? k : "bunny1"; }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return null;
      return arr.map(x => ({
        bornAt: Number(x?.bornAt) || Date.now(),
        kind: safeKind(x?.kind),
      }));
    } catch { return null; }
  }

  function saveBunnyMeta() {
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map(b => ({ bornAt: b.bornAt, kind: b.kind })))
    );
  }

  /* =========================
   * Drops（ティア対応）
   * ========================= */
  const dropsOnField = [];
  const dropByEl = new WeakMap();

  class CoinDrop {
    constructor(x, y, tierIndex = 0) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() * 2 - 1) * 110;
      this.vy = -(420 + Math.random() * 240);
      this.gravity = 2200;
      this.bounce  = 0.22 + Math.random() * 0.12;
      this.floor   = groundY();

      const el = document.createElement("img");
      el.className = "coin";
      this.tier = clamp(Math.floor(tierIndex), 0, ASSETS.coins.length - 1);
      el.src = ASSETS.coins[this.tier];
      el.draggable = false;
      this.el = el;

      dropByEl.set(el, this);
      el.addEventListener("pointerenter", () => this.collect());
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.collect(); });
      el.addEventListener("click", () => this.collect());

      coinLayer.appendChild(el);
      this.render();
    }
    render() {
      this.el.style.left = `${this.x}px`;
      this.el.style.top  = `${this.y}px`;
    }
    update(dt) {
      this.floor = groundY();
      this.vy += this.gravity * dt;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;

      if (this.y >= this.floor) {
        this.y = this.floor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
          this.vx *= 0.72;
        } else {
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }
    collect() {
      if (!this.el || !this.el.isConnected) return;

      coins += (this.tier + 1);
      saveCoins();
      updateHud();
      playSE(seCoin);

      try { this.el.remove(); } catch {}
      const idx = dropsOnField.indexOf(this);
      if (idx >= 0) dropsOnField.splice(idx, 1);
    }
  }

  function spawnClickCoins(bunny, count = 1, tierPicker = () => 0) {
    const r  = bunny.wrap.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    const baseX  = (r.left - fr.left) + r.width  * 0.55;
    const baseY  = (r.top  - fr.top)  + r.height * 0.82;

    for (let i = 0; i < count; i++) {
      const x = baseX + rand(-14, 14);
      const y = baseY + rand(-6, 6);
      const tier = tierPicker();
      const c = new CoinDrop(x, y, tier);
      dropsOnField.push(c);
    }
  }

  /* =========================
   * Bunny
   * ========================= */
  const bunnies = [];

  class Bunny {
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = Number(bornAt) || Date.now();
      this.kind   = safeKind(kind);
      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";
      this.wrap.style.position = "absolute";
      this.wrap.style.left = "0px";
      this.wrap.style.top  = "0px";

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      refreshFieldSize();
      this.x = rand(20, Math.max(21, FIELD_W - 140));
      this.y = groundY() - 120;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;

      this.evolveIfNeeded(true);
      this.syncSprite();

      const tap = (e) => {
        e?.preventDefault?.();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);

        if (chargeReady) {
          const { count, pickTier } = getDropPlanFromCharge();
          spawnClickCoins(this, count, pickTier);
          consumeCharge();
          return;
        }

        // 通常は coin1 1枚だけ
        spawnClickCoins(this, 1, () => 0);
      };

      this.wrap.addEventListener("pointerdown", tap);
      this.wrap.addEventListener("click", tap);

      this.el.addEventListener("load", () => {
        this.clampInside();
        this.applyPos();
      });

      this.clampInside();
      this.applyPos();
    }

    syncSprite() {
      this.el.src = this.isBaby
        ? ASSETS.babyBunny
        : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
    }

    getWrapWidth() {
      const w1 = this.wrap.offsetWidth || 0;
      if (w1 > 0) return w1;
      const w2 = this.wrap.getBoundingClientRect().width || 0;
      return Math.max(1, w2 || 140);
    }

    clampInside() {
      refreshFieldSize();
      const w = this.getWrapWidth();
      const PAD = 6;
      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);
      this.x = clamp(this.x, minX, maxX);
      this.y = groundY() - 120;
    }

    evolveIfNeeded(isInit = false) {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;

      if (this.kind !== "reabunny" && Math.random() < REA_EVOLVE_RATE) {
        this.kind = "reabunny";
      }

      this.syncSprite();
      this.clampInside();

      if (isInit) saveBunnyMeta();
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top  = `${this.y}px`;
    }

    update(dt) {
      this.evolveIfNeeded(false);

      const speedMul = this.isBaby ? BABY_SPEED_MUL : 1.0;
      this.x += this.dir * this.baseSpeed * speedMul * dt;

      const w = this.getWrapWidth();
      const PAD = 6;
      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      if (this.x <= minX) { this.x = minX; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }

      this.applyPos();
    }
  }

  function spawnBunny(kind = "bunny1", bornAt = Date.now()) {
    const b = new Bunny(bornAt, kind);
    bunnies.push(b);
    saveBunnyMeta();
    emit("bunnyCountChanged", { count: bunnies.length });
    return b;
  }

  function removeBunnyInstance(b) {
    const idx = bunnies.indexOf(b);
    if (idx < 0) return false;
    try { b.wrap.remove(); } catch {}
    bunnies.splice(idx, 1);
    saveBunnyMeta();
    emit("bunnyCountChanged", { count: bunnies.length });
    return true;
  }

  /* =========================
   * Touch: スライド回収（コインだけ）
   * ========================= */
  let touchCollectActive = false;
  let touchPointerId = null;

  function collectAtClientPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const target = (el.classList?.contains("coin") || el.classList?.contains("ougonunchi"))
      ? el
      : el.closest?.(".coin, .ougonunchi");
    if (!target) return;
    const drop = dropByEl.get(target);
    if (drop && typeof drop.collect === "function") drop.collect();
  }

  field.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    touchCollectActive = true;
    touchPointerId = e.pointerId;
    collectAtClientPoint(e.clientX, e.clientY);
  }, { passive: true });

  field.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") return;
    if (!touchCollectActive) return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    collectAtClientPoint(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    touchCollectActive = false;
    touchPointerId = null;
  }, { passive: true });

  window.addEventListener("pointercancel", (e) => {
    if (e.pointerType !== "touch") return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    touchCollectActive = false;
    touchPointerId = null;
  }, { passive: true });

  /* =========================
   * Buttons（emit only）
   * ========================= */
  shopBtn?.addEventListener("click",  () => { unlockAudioOnce(); emit("ui:shop",  {}); });
  departBtn?.addEventListener("click",() => { unlockAudioOnce(); emit("ui:depart",{}); });
  rankBtn?.addEventListener("click",  () => { unlockAudioOnce(); emit("ui:rank",  {}); });
  slotBtn?.addEventListener("click",  () => { unlockAudioOnce(); emit("ui:slot",  {}); });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      unlockAudioOnce();
      if (!confirm("リセットしますか？")) return;
      localStorage.removeItem(LS.coins);
      localStorage.removeItem(LS.bunnies);
      localStorage.removeItem(LS.dex);
      localStorage.removeItem(LS.unchi);
      localStorage.removeItem(LS.title);
      localStorage.removeItem(LS.titleList);
      emit("resetRequested", {});
      location.reload();
    });
  }

  /* =========================
   * WB Public API（他JSが使う）
   * ========================= */
  window.WB = {
    on, off, emit,
    ASSETS, BUNNY_DEFS, LS, DEPART_COST,
    field, shopBtn, departBtn, rankBtn, resetBtn, slotBtn,

    get coins() { return coins; },
    set coins(v) {
      coins = Math.max(0, Math.floor(Number(v) || 0));
      saveCoins();
      updateHud();
    },

    getCoin: () => coins,
    spendCoin: (n) => {
      n = Math.floor(Number(n) || 0);
      if (n <= 0) return true;
      if (coins < n) return false;
      coins -= n;
      saveCoins();
      updateHud();
      return true;
    },

    bunnies,
    getBunnies: () => bunnies,
    spawnBunny,
    removeBunnyInstance,

    saveCoins,
    saveBunnyMeta,

    unlockAudioOnce,
    playSE,
    seTabidati,

    updateHud,

    // charge
    getCharge: () => charge,
    isChargeReady: () => !!chargeReady,
    consumeCharge,
    setCharge,
  };

  /* =========================
   * Init / Loop
   * ========================= */
  function initBunnies() {
    const meta = loadBunnyMeta();

    if (meta && meta.length) {
      meta.forEach(m => spawnBunny(m.kind, m.bornAt));
      saveBunnyMeta();
      return;
    }

    const t = Date.now();
    spawnBunny("bunny1", t - BABY_DURATION_MS - 1000);
    spawnBunny("bunny1", t - BABY_DURATION_MS - 2000);
    saveBunnyMeta();
  }

  let lastFrame = performance.now();
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    // ✅ 時間経過でチャージ
    addChargeByTime(dt);

    for (const b of bunnies) b.update(dt);
    for (const d of dropsOnField) d.update(dt);

    if (chargeReady) positionChargeHeart();

    requestAnimationFrame(tick);
  }

  function init() {
    refreshFieldSize();
    initBunnies();
    updateHud();

    // UI初期表示
    updateChargeHud();
    if (chargeReady) showChargeHeart(null);

    emit("bunnyCountChanged", { count: bunnies.length });

    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      refreshFieldSize();
      for (const b of bunnies) { b.clampInside(); b.applyPos(); }
      emit("resize", {});
    }, { passive: true });
  }

  init();
})();
