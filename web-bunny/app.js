(() => {
  "use strict";
  console.log("[app.js] LOADED v16.3 (idle drop OFF + baby size stable via wrap-scale)", Date.now());

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
    bunny1:   { label: "通常みるぽ",     img: "./assets/bunny1.png",   price: 300,   coinMul: 0.55, desc: "基本のうさぎ。コインは控えめ。" },
    bunny3:   { label: "毒タイプみるぽ", img: "./assets/bunny3.png",   price: 1800,  coinMul: 1.0,  desc: "安定してコインを稼ぐ中級うさぎ。" },
    bunny4:   { label: "水タイプみるぽ", img: "./assets/bunny4.png",   price: 6000,  coinMul: 1.8,  desc: "大量のコインを生み出す上級うさぎ。" },
    bunny5:   { label: "お正月みるぽ",   img: "./assets/bunny5.png",   price: 20000, coinMul: 2.8,  desc: "牧場最上級クラス。圧倒的生産力。" },
    reabunny: { label: "黄金レアみるぽ", img: "./assets/reabunny.png", price: 0,     coinMul: 4.0,  desc: "突然変異でのみ現れる幻のうさぎ。" },
  };

  /* =========================
   * Balance
   * ========================= */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL   = 0.65;
  const REA_EVOLVE_RATE  = 0.01;

  const DEPART_COST = 10;

  /* =========================
   * Charge（個体ごと / UIなし）
   * - baby はチャージしない（ゲージ無し・ハート無し）
   * ========================= */
  const CHARGE_MAX = 100;
  const CHARGE_PER_SEC = 3.0;
  const CHARGE_GAIN_ON_TAP_AFTER_CONSUME = 2;

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
  const field       = document.getElementById("field");
  const bunnyLayer  = document.getElementById("bunnyLayer");
  const coinLayer   = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  const shopBtn   = document.getElementById("shopBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn  = document.getElementById("resetBtn");
  const rankBtn   = document.getElementById("rankBtn");
  const slotBtn   = document.getElementById("slotBtn");

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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
   * CSS injection
   * - コイン小さく
   * - ハート小さめ＆ゆらゆら
   * - ✅ babyは img ではなく wrap を縮める（transform競合対策）
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbPerBunnyChargeCss_v2")) return;
    const st = document.createElement("style");
    st.id = "wbPerBunnyChargeCss_v2";
    st.textContent = `
      .coin{
        width:26px !important;
        height:26px !important;
      }

      /* ✅ babyはwrapごと縮める（imgのtransform競合を回避） */
      .bunnyWrap.babyWrap{
        transform: scale(0.78);
        transform-origin: bottom center;
      }

      /* ✅ hart.png を小さく */
      .wbChargeHart {
        position:absolute;
        z-index:9999;
        pointer-events:none;
        user-select:none;
        -webkit-user-drag:none;
        transform: translate(-50%, -50%);
        animation: wbHartBob 1.05s ease-in-out infinite;
        filter: drop-shadow(0 6px 10px rgba(0,0,0,.18));
        width:28px;
        height:28px;
      }
      @keyframes wbHartBob {
        0%   { transform: translate(-50%, -50%) translateY(0px) rotate(-3deg) scale(1); }
        50%  { transform: translate(-50%, -50%) translateY(-7px) rotate(3deg) scale(1.03); }
        100% { transform: translate(-50%, -50%) translateY(0px) rotate(-3deg) scale(1); }
      }
    `;
    document.head.appendChild(st);
  })();

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

      // coin1=+1, coin2=+2, coin3=+3, coin4=+4
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

      this.charge = 0;
      this.chargeReady = false;

      this.hartEl = null;

      refreshFieldSize();
      this.x = rand(20, Math.max(21, FIELD_W - 140));
      this.y = groundY() - 120;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;

      this.evolveIfNeeded(true);
      this.syncSprite();

      const tap = (e) => {
        // ✅ 装着モード中はコイン落としをしない（お洒落の付け替え優先）
        if (document.body.classList.contains("isyouEquipMode")) return;

        e?.preventDefault?.();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);

        // babyはcoin1 1枚だけ
        if (this.isBaby) {
          spawnClickCoins(this, 1, () => 0);
          return;
        }

        const plan = this.getDropPlanFromOwnCharge();
        spawnClickCoins(this, plan.count, plan.pickTier);

        this.consumeOwnCharge();
        this.addOwnCharge(CHARGE_GAIN_ON_TAP_AFTER_CONSUME);
      };

      this.wrap.addEventListener("pointerdown", tap);
      this.wrap.addEventListener("click", tap);

      this.el.addEventListener("load", () => {
        this.clampInside();
        this.applyPos();
        this.positionHeart();
      });

      this.clampInside();
      this.applyPos();
    }

    syncSprite() {
      // ✅ babyはwrapごと縮める（transform競合に強い）
      this.wrap.classList.toggle("babyWrap", this.isBaby);

      // classは保険で残す（他JSが参照してもOK）
      this.el.classList.toggle("baby", this.isBaby);

      this.el.src = this.isBaby
        ? ASSETS.babyBunny
        : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
    }

    ensureHeartEl() {
      if (this.hartEl && this.hartEl.isConnected) return this.hartEl;
      const el = document.createElement("img");
      el.className = "wbChargeHart";
      el.src = ASSETS.hart;
      el.draggable = false;
      el.style.display = "none";
      field.appendChild(el);
      this.hartEl = el;
      return el;
    }

    showHeart() {
      const el = this.ensureHeartEl();
      el.style.display = "block";
      this.positionHeart();
    }

    hideHeart() {
      if (!this.hartEl) return;
      this.hartEl.style.display = "none";
    }

    positionHeart() {
      if (!this.hartEl || this.hartEl.style.display === "none") return;
      const r  = this.wrap.getBoundingClientRect();
      const fr = field.getBoundingClientRect();
      const x = (r.left - fr.left) + r.width * 0.5;
      const y = (r.top  - fr.top)  + r.height * 0.08;
      this.hartEl.style.left = `${x}px`;
      this.hartEl.style.top  = `${y}px`;
    }

    addOwnCharge(delta) {
      if (this.isBaby) return;
      if (this.chargeReady) return;
      delta = Number(delta) || 0;
      if (delta <= 0) return;

      this.charge = clamp(this.charge + delta, 0, CHARGE_MAX);
      if (this.charge >= CHARGE_MAX) {
        this.charge = CHARGE_MAX;
        this.chargeReady = true;
        this.showHeart();
        emit("bunnyChargeReady", { bornAt: this.bornAt });
      }
    }

    consumeOwnCharge() {
      this.charge = 0;
      this.chargeReady = false;
      this.hideHeart();
      emit("bunnyChargeConsumed", { bornAt: this.bornAt });
    }

    getChargeRatio() {
      return clamp(this.charge / CHARGE_MAX, 0, 1);
    }

    getDropPlanFromOwnCharge() {
      const r0 = this.getChargeRatio();
      const mul = (BUNNY_DEFS[this.kind]?.coinMul ?? 1.0);
      const r = Math.min(1, r0 * (1.15 + mul * 0.15));

      const count = clamp(
        Math.floor((2 + r * 24) * mul),
        2,
        60
      );

      const maxTier = clamp(
        Math.floor(r * 3 + mul * 0.35),
        0,
        ASSETS.coins.length - 1
      );

      const pickTier = () => {
        if (maxTier <= 0) return 0;

        const p = 2.2 + mul * 0.35;
        let sum = 0;
        const w = [];
        for (let t = 0; t <= maxTier; t++) {
          const wt = Math.pow(t + 1, p);
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

    // ✅ 放置排出は無効化
    idleDrop(dt) { /* idle drop OFF */ }

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

      // ✅ 保険：baby中は常にwrapクラス維持（他JSが触っても戻す）
      if (this.isBaby) this.wrap.classList.add("babyWrap");
      else this.wrap.classList.remove("babyWrap");

      // ✅ 放置排出しない
      // this.idleDrop(dt);

      this.addOwnCharge(CHARGE_PER_SEC * dt);

      const speedMul = this.isBaby ? BABY_SPEED_MUL : 1.0;
      this.x += this.dir * this.baseSpeed * speedMul * dt;

      const w = this.getWrapWidth();
      const PAD = 6;
      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      if (this.x <= minX) { this.x = minX; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }

      this.applyPos();

      if (!this.isBaby && this.chargeReady) this.positionHeart();
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
    try { b.hartEl?.remove(); } catch {}
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
  shopBtn?.addEventListener("click",   () => { unlockAudioOnce(); emit("ui:shop",   {}); });
  departBtn?.addEventListener("click", () => { unlockAudioOnce(); emit("ui:depart", {}); });
  rankBtn?.addEventListener("click",   () => { unlockAudioOnce(); emit("ui:rank",   {}); });
  slotBtn?.addEventListener("click",   () => { unlockAudioOnce(); emit("ui:slot",   {}); });

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

    getBunnyCharge: (bornAt) => {
      const t = Number(bornAt);
      const b = bunnies.find(x => x && x.bornAt === t);
      return b ? { charge: b.charge, ready: b.chargeReady, isBaby: b.isBaby } : null;
    },
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

    for (const b of bunnies) b.update(dt);
    for (const d of dropsOnField) d.update(dt);

    requestAnimationFrame(tick);
  }

  function init() {
    refreshFieldSize();
    initBunnies();
    updateHud();
    emit("bunnyCountChanged", { count: bunnies.length });

    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      refreshFieldSize();
      for (const b of bunnies) { b.clampInside(); b.applyPos(); b.positionHeart?.(); }
      emit("resize", {});
    }, { passive: true });
  }

  init();
})();
