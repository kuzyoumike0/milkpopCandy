// app.js — Milkpop牧場（コア）
// v16.4: ✅「画面外に行く」根絶（field座標系をJSで強制固定 + clamp強化 + viewport変動救出）
(() => {
  "use strict";
  console.log("[app.js] LOADED v16.4 (hard clamp + field fixed layout)", Date.now());

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

    coins: [
      "./assets/coin1.png", // tier0
      "./assets/coin2.png", // tier1
      "./assets/coin3.png", // tier2
      "./assets/coin4.png", // tier3
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
   * Charge（個体ごと / UIなし）
   * ========================= */
  const CHARGE_MAX = 100;
  const CHARGE_PER_SEC = 3.0; // 約34秒で満タン
  const CHARGE_GAIN_ON_TAP_AFTER_CONSUME = 2;

  /* =========================
   * Coin boost
   * ========================= */
  const COIN_VALUE_MULTIPLIER = 2;

  /* =========================
   * Storage
   * ========================= */
  const LS = {
    coins:     "wb_coins_v6",
    bunnies:   "wb_bunnies_v6",
    dex:       "wb_dex_v1",
    unchi:     "wb_unchi_v1",       // unchi.js 側が使う
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

  const shopBtn     = document.getElementById("shopBtn");
  const omukaeBtn   = document.getElementById("omukaeBtn");
  const hanabiBtn   = document.getElementById("hanabiBtn");
  const departBtn   = document.getElementById("departBtn");
  const resetBtn    = document.getElementById("resetBtn");
  const rankBtn     = document.getElementById("rankBtn");
  const slotBtn     = document.getElementById("slotBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] 必要DOMが見つかりません (#field/#bunnyLayer/#coinLayer/#coinValue)");
    return;
  }

  /* =========================
   * ✅超重要：fieldを「座標系の基準」に強制固定（CSSが欠けても直す）
   * - これが無いと、iPad/Chrome/URLバー伸縮等で x/y が狂って「画面外」になります
   * ========================= */
  function forceFieldLayout() {
    const hud = document.getElementById("hud");
    const hudH = hud ? Math.ceil(hud.getBoundingClientRect().height || 56) : 56;

    // fieldを画面に固定＆overflowで外を見せない
    try {
      field.style.position = "fixed";
      field.style.left = "0";
      field.style.right = "0";
      field.style.top = `${hudH}px`;
      field.style.bottom = "0";
      field.style.overflow = "hidden";
      field.style.touchAction = "manipulation";
    } catch {}

    // レイヤーはfield内にピッタリ
    const layers = [
      document.getElementById("bgLayer"),
      document.getElementById("tenkiLayer"),
      bunnyLayer,
      coinLayer,
    ].filter(Boolean);

    for (const el of layers) {
      try {
        el.style.position = "absolute";
        el.style.left = "0";
        el.style.top = "0";
        el.style.right = "0";
        el.style.bottom = "0";
      } catch {}
    }
  }

  // 起動直後・フォント反映・HUD高さ変化などを拾って複数回かける
  forceFieldLayout();
  setTimeout(forceFieldLayout, 0);
  setTimeout(forceFieldLayout, 200);
  setTimeout(forceFieldLayout, 800);

  /* =========================
   * WB bus（merge-safe）
   * ========================= */
  const prevWB = (window.WB && typeof window.WB === "object") ? window.WB : {};

  const __events = new Map();
  function localOn(ev, fn)  { if (!__events.has(ev)) __events.set(ev, new Set()); __events.get(ev).add(fn); }
  function localOff(ev, fn) { __events.get(ev)?.delete(fn); }
  function localEmit(ev, payload) { __events.get(ev)?.forEach(fn => { try { fn(payload); } catch {} }); }

  const on   = (typeof prevWB.on   === "function") ? prevWB.on.bind(prevWB)   : localOn;
  const off  = (typeof prevWB.off  === "function") ? prevWB.off.bind(prevWB)  : localOff;
  const emit = (typeof prevWB.emit === "function") ? prevWB.emit.bind(prevWB) : localEmit;

  /* =========================
   * Utils / Field size
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  let FIELD_W = 1, FIELD_H = 1;

  function refreshFieldSize() {
    // “fieldが0”になる環境対策：rect優先
    const r = field.getBoundingClientRect();
    FIELD_W = Math.max(1, Math.round(r.width  || field.clientWidth  || 1));
    FIELD_H = Math.max(1, Math.round(r.height || field.clientHeight || 1));
  }

  function groundY() {
    // 画面が潰れても地面がマイナスにならない
    const minGround = 140;
    return Math.max(minGround, FIELD_H - 60);
  }

  async function ensureFieldReady() {
    for (let i = 0; i < 80; i++) { // ~4秒
      forceFieldLayout();
      refreshFieldSize();
      if (FIELD_W >= 160 && FIELD_H >= 180) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    console.warn("[app.js] field size not ready; continue (guarded)");
    return false;
  }

  // viewport変動（iOS URLバー等）も拾う
  const scheduleRescue = (() => {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        forceFieldLayout();
        refreshFieldSize();
        rescueAll("viewport-change");
      });
    };
  })();

  window.addEventListener("resize", scheduleRescue, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleRescue, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleRescue, { passive: true });
  }

  /* =========================
   * Audio
   * ========================= */
  const sePoyo     = new Audio(ASSETS.poyoSE);
  const seBaby     = new Audio(ASSETS.babySE);
  const seCoin     = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  // ✅ BGM.js があるなら登録（スライダー追従）
  try { prevWB?.bgm?.registerSE?.(sePoyo); } catch {}
  try { prevWB?.bgm?.registerSE?.(seBaby); } catch {}
  try { prevWB?.bgm?.registerSE?.(seCoin); } catch {}
  try { prevWB?.bgm?.registerSE?.(seTabidati); } catch {}

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

  function getSeVolume() {
    try {
      if (typeof window.WB?.getSEVolume === "function") {
        return clamp(Number(window.WB.getSEVolume()) || 0.85, 0, 1);
      }
    } catch {}
    const v = Number(window.__milkpopSeVolume);
    return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
  }

  function playSE(a) {
    try {
      a.volume = getSeVolume();
      a.muted = false;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * CSS injection（最低限）
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbAppCoreCssV164")) return;
    const st = document.createElement("style");
    st.id = "wbAppCoreCssV164";
    st.textContent = `
      #bunnyLayer{ position:absolute; inset:0; }
      .bunnyWrap{ position:absolute; width:140px; height:140px; pointer-events:auto; }
      .bunnyWrap.flip{ transform: scaleX(-1); transform-origin: 50% 50%; }
      .bunny{ width:140px; height:auto; display:block; user-select:none; -webkit-user-drag:none; }

      .coin{ width:22px !important; height:22px !important; position:absolute; user-select:none; -webkit-user-drag:none; }

      .wbChargeHart{
        position:absolute; z-index:9999; pointer-events:none;
        transform:translate(-50%,-50%);
        animation:wbHartBob 1.05s ease-in-out infinite;
        width:40px; height:40px;
        filter:drop-shadow(0 6px 10px rgba(0,0,0,.18));
      }
      @keyframes wbHartBob{
        0%{transform:translate(-50%,-50%) translateY(0) rotate(-3deg) scale(1);}
        50%{transform:translate(-50%,-50%) translateY(-7px) rotate(3deg) scale(1.03);}
        100%{transform:translate(-50%,-50%) translateY(0) rotate(-3deg) scale(1);}
      }
    `;
    document.head.appendChild(st);
  })();

  /* =========================
   * State
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

  const bunnies = [];
  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return null;
      return arr.map(x => ({ bornAt: Number(x?.bornAt) || Date.now(), kind: safeKind(x?.kind) }));
    } catch { return null; }
  }
  function saveBunnyMeta() {
    localStorage.setItem(LS.bunnies, JSON.stringify(bunnies.map(b => ({ bornAt: b.bornAt, kind: b.kind }))));
  }

  /* =========================
   * Drops
   * ========================= */
  const dropsOnField = [];
  const dropByEl = new WeakMap();

  class CoinDrop {
    constructor(x, y, tierIndex = 0) {
      this.x = x; this.y = y;
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

      // ✅ コインが画面外に飛んだら救出（左右だけ）
      const pad = 2;
      if (this.x < pad) this.x = pad;
      if (this.x > FIELD_W - 22 - pad) this.x = FIELD_W - 22 - pad;

      this.render();
    }

    collect() {
      if (!this.el || !this.el.isConnected) return;

      coins += (this.tier + 1) * COIN_VALUE_MULTIPLIER;
      saveCoins();
      updateHud();
      playSE(seCoin);

      try { this.el.remove(); } catch {}
      const idx = dropsOnField.indexOf(this);
      if (idx >= 0) dropsOnField.splice(idx, 1);
    }
  }

  function spawnCoinDropAt(x, y, tier = 0) {
    const c = new CoinDrop(x, y, tier);
    dropsOnField.push(c);
    return c;
  }

  function spawnClickCoins(bunny, count = 1, tierPicker = () => 0) {
    // ✅ offset基準で安定（transform/ズームでも破綻しにくい）
    const baseX = bunny.x + 140 * 0.55;
    const baseY = bunny.y + 140 * 0.82;

    for (let i = 0; i < count; i++) {
      spawnCoinDropAt(baseX + rand(-14, 14), baseY + rand(-6, 6), tierPicker());
    }
  }

  /* =========================
   * Bunny
   * ========================= */
  class Bunny {
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = Number(bornAt) || Date.now();
      this.kind   = safeKind(kind);
      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.charge = 0;
      this.chargeReady = false;
      this.hartEl = null;

      refreshFieldSize();

      // ✅ 初期位置を「必ず画面内」に作る
      this.x = rand(8, Math.max(9, FIELD_W - 140 - 8));
      this.y = clamp(groundY() - 140, 8, Math.max(8, FIELD_H - 140 - 8));

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 45 + Math.random() * 55;

      this.evolveIfNeeded(true);
      this.syncSprite();

      const tap = (e) => {
        e?.preventDefault?.();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);

        const plan = this.getDropPlanFromOwnCharge();
        spawnClickCoins(this, plan.count, plan.pickTier);

        this.consumeOwnCharge();
        this.addOwnCharge(CHARGE_GAIN_ON_TAP_AFTER_CONSUME);
      };

      this.wrap.addEventListener("pointerdown", tap);
      this.wrap.addEventListener("click", tap);

      this.el.addEventListener("load", () => {
        this.clampInside(true);
        this.applyPos();
        this.positionHeart();
      });

      this.clampInside(true);
      this.applyPos();
    }

    syncSprite() {
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
      field.appendChild(el); // field直下（最前面）
      this.hartEl = el;
      return el;
    }
    showHeart(){ const el = this.ensureHeartEl(); el.style.display = "block"; this.positionHeart(); }
    hideHeart(){ if (this.hartEl) this.hartEl.style.display = "none"; }

    positionHeart() {
      if (!this.hartEl || this.hartEl.style.display === "none") return;
      // ✅ x/y から計算（getBoundingClientRect依存をやめてズレ根絶）
      const x = this.x + 140 * 0.50;
      const y = this.y + 140 * 0.08;
      this.hartEl.style.left = `${x}px`;
      this.hartEl.style.top  = `${y}px`;
    }

    addOwnCharge(delta) {
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

    getChargeRatio() { return clamp(this.charge / CHARGE_MAX, 0, 1); }

    getDropPlanFromOwnCharge() {
      const r = this.getChargeRatio();
      const count = 3 + Math.floor(r * 15);
      const maxTier = Math.floor(r * 3 + 1e-9);

      const pickTier = () => {
        if (maxTier <= 0) return 0;
        let sum = 0;
        const w = [];
        for (let t = 0; t <= maxTier; t++) {
          const wt = (t + 1) * (t + 1);
          w.push(wt); sum += wt;
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

    clampInside(force = false) {
      refreshFieldSize();

      const PAD = 8;
      const w = 140;
      const h = 140;

      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      const gy = groundY();
      const minY = PAD;
      const maxY = Math.max(minY, gy - h);

      if (force) {
        this.x = clamp(this.x, minX, maxX);
        this.y = clamp(this.y, minY, maxY);
        return;
      }
      if (this.x < minX || this.x > maxX) this.x = clamp(this.x, minX, maxX);
      if (this.y < minY || this.y > maxY) this.y = clamp(this.y, minY, maxY);
    }

    evolveIfNeeded(isInit = false) {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (this.kind !== "reabunny" && Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";

      this.syncSprite();
      this.clampInside(true);
      if (isInit) saveBunnyMeta();
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top  = `${this.y}px`;
    }

    update(dt) {
      this.evolveIfNeeded(false);
      this.addOwnCharge(CHARGE_PER_SEC * dt);

      const speedMul = this.isBaby ? BABY_SPEED_MUL : 1.0;
      this.x += this.dir * this.baseSpeed * speedMul * dt;

      // ✅ 地面へ追従（viewport変動でも浮かない）
      const gy = groundY();
      const targetY = gy - 140;
      this.y += (targetY - this.y) * 0.28;

      // x反射（絶対に範囲外へ行かせない）
      const PAD = 8;
      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - 140 - PAD);

      if (this.x <= minX) { this.x = minX; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }

      this.clampInside(false);
      this.applyPos();

      if (this.chargeReady) this.positionHeart();
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
   * Touch collect（コインだけ）
   * ========================= */
  let touchCollectActive = false;
  let touchPointerId = null;

  function collectAtClientPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const target = el.classList?.contains("coin") ? el : el.closest?.(".coin");
    if (!target) return;
    const drop = dropByEl.get(target);
    if (drop?.collect) drop.collect();
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
  omukaeBtn?.addEventListener("click", () => { unlockAudioOnce(); emit("ui:omukae", {}); });
  hanabiBtn?.addEventListener("click", () => { unlockAudioOnce(); emit("ui:hanabi", {}); });
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
   * WB merge
   * ========================= */
  const api = {
    on, off, emit,
    ASSETS, BUNNY_DEFS, LS, DEPART_COST,

    field, bunnyLayer, coinLayer,
    shopBtn, omukaeBtn, hanabiBtn, departBtn, rankBtn, resetBtn, slotBtn,

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

    spawnCoinDropAt,

    saveCoins,
    saveBunnyMeta,

    unlockAudioOnce,
    playSE,
    seTabidati,

    updateHud,

    // デバッグ
    getBunnyCharge: (bornAt) => {
      const t = Number(bornAt);
      const b = bunnies.find(x => x && x.bornAt === t);
      return b ? { charge: b.charge, ready: b.chargeReady } : null;
    },
  };

  window.WB = Object.assign({}, prevWB, api);

  /* =========================
   * ✅ 全員救出（外に出てたら戻す）
   * ========================= */
  function rescueAll(reason = "") {
    refreshFieldSize();
    for (const b of bunnies) {
      try {
        b.clampInside(true);
        b.applyPos();
        b.positionHeart?.();
      } catch {}
    }
    if (reason) console.log("[app.js] rescueAll:", reason, "FIELD:", FIELD_W, FIELD_H);
    emit("resize", {});
  }

  /* =========================
   * Init / Loop
   * ========================= */
  async function initBunnies() {
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

  async function init() {
    await ensureFieldReady();
    forceFieldLayout();
    refreshFieldSize();

    await initBunnies();
    updateHud();
    emit("bunnyCountChanged", { count: bunnies.length });

    rescueAll("init");
    requestAnimationFrame(tick);

    // 追加保険：一定間隔で「外に出た子だけ」救出（viewportバグ対策）
    setInterval(() => {
      forceFieldLayout();
      refreshFieldSize();
      rescueAll("interval");
    }, 4000);
  }

  init();
})();
