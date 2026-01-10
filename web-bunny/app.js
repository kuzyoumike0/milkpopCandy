(() => {
  "use strict";
  console.log("[app.js] LOADED v16.7 (NEVER outside: absolute layers + stable bounds)", Date.now());

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

  // charge
  const CHARGE_MAX = 100;
  const CHARGE_PER_SEC = 3.0;
  const CHARGE_GAIN_ON_TAP_AFTER_CONSUME = 2;

  // coin value
  const COIN_VALUE_MULTIPLIER = 2;

  /* =========================
   * HARD SIZE (絶対値で扱う)
   * ========================= */
  const WRAP_W = 140;
  const WRAP_H = 140;
  const PAD = 6;

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

  const shoplshopBtn   = document.getElementById("shopBtn");
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
   * ✅ 座標系を強制（これが最重要）
   * - field: 位置基準の親
   * - bunnyLayer/coinLayer: field内で絶対配置
   * - bunnyWrap: 0,0 を基準に translate3d で動かすため absolute 必須
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbAppCoreCssV167")) return;
    const st = document.createElement("style");
    st.id = "wbAppCoreCssV167";
    st.textContent = `
      /* fieldは必ず基準点になる（fixedでもOK。staticは絶対NG） */
      #field{
        position:fixed !important;
        inset:0 !important;
        overflow:hidden !important;
      }

      /* レイヤーはfield内で絶対配置、座標系(0,0)を確定 */
      #bunnyLayer, #coinLayer{
        position:absolute !important;
        inset:0 !important;
        overflow:hidden !important;
      }

      /* wrapは "translate3d(x,y)" を使うので absolute + left/top 0 が必須 */
      .bunnyWrap{
        position:absolute !important;
        left:0 !important;
        top:0 !important;
        width:${WRAP_W}px !important;
        height:${WRAP_H}px !important;
        will-change: transform;
        touch-action: manipulation;
      }

      /* 念のため：画像がはみ出す事故を潰す */
      .bunnyWrap .bunny{
        width:100% !important;
        height:100% !important;
        object-fit:contain !important;
        user-select:none;
        -webkit-user-drag:none;
        pointer-events:auto;
      }

      .wbChargeHart{
        position:absolute;
        z-index:9999;
        pointer-events:none;
        transform:translate(-50%,-50%);
        animation:wbHartBob 1.05s ease-in-out infinite;
        width:40px;
        height:40px;
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
   * WB bus (merge-safe)
   * ========================= */
  const prevWB = (window.WB && typeof window.WB === "object") ? window.WB : {};

  const __events = new Map();
  function localOn(ev, fn) { if (!__events.has(ev)) __events.set(ev, new Set()); __events.get(ev).add(fn); }
  function localOff(ev, fn){ __events.get(ev)?.delete(fn); }
  function localEmit(ev, payload){ __events.get(ev)?.forEach(fn=>{ try{fn(payload);}catch{} }); }

  const on   = (typeof prevWB.on   === "function") ? prevWB.on.bind(prevWB)   : localOn;
  const off  = (typeof prevWB.off  === "function") ? prevWB.off.bind(prevWB)  : localOff;
  const emit = (typeof prevWB.emit === "function") ? prevWB.emit.bind(prevWB) : localEmit;

  /* =========================
   * Utils / Field size（安定版）
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  let FIELD_W = 1, FIELD_H = 1;

  // ✅ getBoundingClientRect が変な値になる環境があるので「clientWidth/Height」を主にする
  function readFieldSize() {
    const cw = Math.round(field.clientWidth || 0);
    const ch = Math.round(field.clientHeight || 0);

    if (cw >= 50 && ch >= 50) return { w: cw, h: ch };

    const r = field.getBoundingClientRect();
    const w = Math.round(r.width || window.innerWidth || 1);
    const h = Math.round(r.height || window.innerHeight || 1);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function refreshFieldSize() {
    const v = readFieldSize();
    FIELD_W = v.w;
    FIELD_H = v.h;
  }

  // ✅ ground を絶対にマイナスにしない
  function groundY() {
    const minGround = Math.max(120, WRAP_H + PAD + 10);
    return Math.max(minGround, FIELD_H - 60);
  }

  // ✅ field が実サイズになるまで待つ（起動直後の0対策）
  async function ensureFieldReady() {
    for (let i = 0; i < 120; i++) { // 最大約6秒
      refreshFieldSize();
      if (FIELD_W >= 200 && FIELD_H >= 200) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    console.warn("[app.js] field size not ready; continue with guarded values");
    return false;
  }

  function worldBounds() {
    refreshFieldSize();
    const gy = groundY();
    const minX = PAD;
    const maxX = Math.max(minX, FIELD_W - WRAP_W - PAD);
    const minY = PAD;
    const maxY = Math.max(minY, gy - WRAP_H);
    return { minX, maxX, minY, maxY, gy };
  }

  // ✅ 画面状態変化（URLバー/回転/ズーム）で必ず救出
  const bunnies = []; // 先に宣言（scheduleRescueAllで参照）
  function scheduleRescueAll() {
    requestAnimationFrame(() => {
      const { minX, maxX, minY, maxY } = worldBounds();
      for (const b of bunnies) {
        b.x = clamp(b.x, minX, maxX);
        b.y = clamp(b.y, minY, maxY);
        b.applyPos();
        b.positionHeart?.();
      }
      emit("resize", {});
    });
  }

  window.addEventListener("resize", scheduleRescueAll, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleRescueAll, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleRescueAll, { passive: true });
  }

  /* =========================
   * Audio
   * ========================= */
  const sePoyo     = new Audio(ASSETS.poyoSE);
  const seBaby     = new Audio(ASSETS.babySE);
  const seCoin     = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  // ✅ BGM.js が先でも後でも OK：registerSE が無ければキューへ
  window.__milkpopSeRegisterQueue = window.__milkpopSeRegisterQueue || [];
  function tryRegisterSE(a) {
    try {
      if (window.WB?.bgm?.registerSE) { window.WB.bgm.registerSE(a); return; }
    } catch {}
    try { window.__milkpopSeRegisterQueue.push(a); } catch {}
  }
  tryRegisterSE(sePoyo);
  tryRegisterSE(seBaby);
  tryRegisterSE(seCoin);
  tryRegisterSE(seTabidati);

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
    try { if (typeof window.WB?.getSEVolume === "function") return clamp(Number(window.WB.getSEVolume()) || 0.85, 0, 1); } catch {}
    const v = Number(window.__milkpopSeVolume);
    return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
  }
  function playSE(a) {
    try {
      unlockAudioOnce();
      a.volume = getSeVolume();
      a.muted = false;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * State
   * ========================= */
  let coins = (() => {
    const n = parseInt(localStorage.getItem(LS.coins) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  })();

  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }
  function updateHud() { coinValueEl.textContent = String(coins); emit("hudUpdated", { coins }); }
  function safeKind(k) { return BUNNY_DEFS[k] ? k : "bunny1"; }

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
    render(){ this.el.style.left = `${this.x}px`; this.el.style.top = `${this.y}px`; }
    update(dt){
      this.floor = groundY();
      this.vy += this.gravity * dt;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;

      if (this.y >= this.floor) {
        this.y = this.floor;
        if (Math.abs(this.vy) > 260) { this.vy = -this.vy * this.bounce; this.vx *= 0.72; }
        else { this.vy = 0; this.vx = 0; }
      }
      this.render();
    }
    collect(){
      if (!this.el || !this.el.isConnected) return;
      coins += (this.tier + 1) * COIN_VALUE_MULTIPLIER;
      saveCoins(); updateHud(); playSE(seCoin);
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
    const baseX = bunny.x + WRAP_W * 0.55;
    const baseY = bunny.y + WRAP_H * 0.82;
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

      // ✅ 初期位置：必ず bounds 内で生成
      const { minX, maxX, minY, maxY, gy } = worldBounds();
      this.x = rand(minX, maxX);
      this.y = clamp(gy - WRAP_H, minY, maxY);

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 45 + Math.random() * 55;

      this.evolveIfNeeded(true);
      this.syncSprite();

      const tap = (e) => {
        e?.preventDefault?.();
        playSE(this.isBaby ? seBaby : sePoyo);

        const plan = this.getDropPlanFromOwnCharge();
        spawnClickCoins(this, plan.count, plan.pickTier);

        this.consumeOwnCharge();
        this.addOwnCharge(CHARGE_GAIN_ON_TAP_AFTER_CONSUME);
      };

      this.wrap.addEventListener("pointerdown", tap);
      this.wrap.addEventListener("click", tap);

      // 画像ロード後も「必ず救出」
      this.el.addEventListener("load", () => {
        this.hardClamp(true);
        this.applyPos();
        this.positionHeart();
      });

      this.hardClamp(true);
      this.applyPos();
    }

    syncSprite() {
      this.el.src = this.isBaby ? ASSETS.babyBunny : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
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
    showHeart(){ const el = this.ensureHeartEl(); el.style.display="block"; this.positionHeart(); }
    hideHeart(){ if (this.hartEl) this.hartEl.style.display="none"; }

    positionHeart() {
      if (!this.hartEl || this.hartEl.style.display === "none") return;
      const x = this.x + WRAP_W * 0.5;
      const y = this.y + WRAP_H * 0.08;
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
        for (let t = 0; t <= maxTier; t++) { const wt = (t + 1) * (t + 1); w.push(wt); sum += wt; }
        let x = Math.random() * sum;
        for (let t = 0; t <= maxTier; t++) { x -= w[t]; if (x <= 0) return t; }
        return maxTier;
      };

      return { count, pickTier };
    }

    evolveIfNeeded(isInit = false) {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (this.kind !== "reabunny" && Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";

      this.syncSprite();
      this.hardClamp(true);
      if (isInit) saveBunnyMeta();
    }

    // ✅ 絶対に外に出さない（毎フレーム適用）
    hardClamp(force = false) {
      const { minX, maxX, minY, maxY, gy } = worldBounds();

      // y は常に地面へ吸着（ただし範囲外は救出）
      const targetY = clamp(gy - WRAP_H, minY, maxY);
      if (force) this.y = targetY;
      else this.y += (targetY - this.y) * 0.35;

      this.x = clamp(this.x, minX, maxX);
      this.y = clamp(this.y, minY, maxY);
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      // ✅ 小数が溜まると境界で“にじみ”が出るので丸めて固定
      const x = Math.round(this.x);
      const y = Math.round(this.y);
      this.wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    update(dt) {
      this.evolveIfNeeded(false);
      this.addOwnCharge(CHARGE_PER_SEC * dt);

      const speedMul = this.isBaby ? BABY_SPEED_MUL : 1.0;
      this.x += this.dir * this.baseSpeed * speedMul * dt;

      const { minX, maxX } = worldBounds();

      // 反射
      if (this.x <= minX) { this.x = minX; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }

      // ✅ 最終救出
      this.hardClamp(false);

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
   * Touch collect (coin only)
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
   * Buttons (emit)
   * ========================= */
  RlshopBtn?.addEventListener("click",   () => { unlockAudioOnce(); emit("ui:shop",   {}); });
  omukaeBtn?.addEventListener("click", () => { unlockAudioOnce(); emit("ui:omukae", {}); });
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
    shopBtn: RlshopBtn, omukaeBtn, hanabiBtn, departBtn, rankBtn, resetBtn, slotBtn,

    get coins() { return coins; },
    set coins(v) { coins = Math.max(0, Math.floor(Number(v) || 0)); saveCoins(); updateHud(); },

    getCoin: () => coins,
    spendCoin: (n) => {
      n = Math.floor(Number(n) || 0);
      if (n <= 0) return true;
      if (coins < n) return false;
      coins -= n;
      saveCoins(); updateHud();
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

    getBunnyCharge: (bornAt) => {
      const t = Number(bornAt);
      const b = bunnies.find(x => x && x.bornAt === t);
      return b ? { charge: b.charge, ready: b.chargeReady } : null;
    },
  };
  window.WB = Object.assign({}, prevWB, api);

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

    // ✅ 毎フレーム救出（絶対外に出さない）
    refreshFieldSize();

    for (const b of bunnies) b.update(dt);
    for (const d of dropsOnField) d.update(dt);

    requestAnimationFrame(tick);
  }

  async function init() {
    await ensureFieldReady();
    refreshFieldSize();

    await initBunnies();
    scheduleRescueAll();

    updateHud();
    emit("bunnyCountChanged", { count: bunnies.length });

    requestAnimationFrame(tick);
  }

  init();
})();
