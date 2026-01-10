(() => {
  "use strict";
  console.log("[app.js] LOADED v16.3 (no-outside clamp + field-ready init)", Date.now());

  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",
    coins: ["./assets/coin1.png","./assets/coin2.png","./assets/coin3.png","./assets/coin4.png"],
  };

  const BUNNY_DEFS = {
    bunny1:  { label: "通常みるぽ",     img: "./assets/bunny1.png",  price: 300,   coinMul: 0.55, desc: "基本のうさぎ。コインは控えめ。" },
    bunny3:  { label: "毒タイプみるぽ", img: "./assets/bunny3.png",  price: 1800,  coinMul: 1.0,  desc: "安定してコインを稼ぐ中級うさぎ。" },
    bunny4:  { label: "水タイプみるぽ", img: "./assets/bunny4.png",  price: 6000,  coinMul: 1.8,  desc: "大量のコインを生み出す上級うさぎ。" },
    bunny5:  { label: "お正月みるぽ",   img: "./assets/bunny5.png",  price: 20000, coinMul: 2.8,  desc: "牧場最上級クラス。圧倒的生産力。" },
    reabunny:{ label: "黄金レアみるぽ", img: "./assets/reabunny.png", price: 0,     coinMul: 4.0,  desc: "突然変異でのみ現れる幻のうさぎ。" },
  };

  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL   = 0.65;
  const REA_EVOLVE_RATE  = 0.01;

  const DEPART_COST = 10;

  const CHARGE_MAX = 100;
  const CHARGE_PER_SEC = 3.0;
  const CHARGE_GAIN_ON_TAP_AFTER_CONSUME = 2;
  const COIN_VALUE_MULTIPLIER = 2;

  const LS = {
    coins:     "wb_coins_v6",
    bunnies:   "wb_bunnies_v6",
    dex:       "wb_dex_v1",
    unchi:     "wb_unchi_v1",
    title:     "wb_title_v1",
    titleList: "wb_title_list_v1",
  };

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
   * Utils / Field size
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  let FIELD_W = 1, FIELD_H = 1;

  function refreshFieldSize() {
    // 0になりやすい環境対策：getBoundingClientRect優先
    const r = field.getBoundingClientRect();
    FIELD_W = Math.max(1, Math.round(r.width  || field.clientWidth  || 1));
    FIELD_H = Math.max(1, Math.round(r.height || field.clientHeight || 1));
  }

  // ✅ groundを安全化（高さが潰れても地面がマイナスにならない）
  function groundY() {
    // 画面が小さくても最低この辺に地面が来る
    const minGround = 120;
    return Math.max(minGround, FIELD_H - 60);
  }

  // ✅ 初期化前にfieldが実サイズになるまで待つ
  async function ensureFieldReady() {
    for (let i = 0; i < 80; i++) { // 最大約4秒（50ms×80）
      refreshFieldSize();
      if (FIELD_W >= 100 && FIELD_H >= 120) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    // 最悪でも続行（ただしminGroundが守る）
    console.warn("[app.js] field size not ready; continue with guarded groundY()");
    return false;
  }

  // resize系（URLバー/回転/ズーム）も拾う
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });
    window.visualViewport.addEventListener("scroll", () => requestAnimationFrame(refreshFieldSize), { passive: true });
  }

  /* =========================
   * Audio
   * ========================= */
  const sePoyo     = new Audio(ASSETS.poyoSE);
  const seBaby     = new Audio(ASSETS.babySE);
  const seCoin     = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

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
    try { if (typeof window.WB?.getSEVolume === "function") return clamp(Number(window.WB.getSEVolume()) || 0.85, 0, 1); } catch {}
    const v = Number(window.__milkpopSeVolume);
    return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
  }
  function playSE(a) {
    try { a.volume = getSeVolume(); a.muted = false; a.currentTime = 0; a.play().catch(()=>{}); } catch {}
  }

  /* =========================
   * CSS minimal
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbAppCoreCssV163")) return;
    const st = document.createElement("style");
    st.id = "wbAppCoreCssV163";
    st.textContent = `
      #bunnyLayer{ position:absolute; inset:0; }
      .bunnyWrap{ position:absolute; width:140px; height:140px; pointer-events:auto; }
      .bunnyWrap.flip{ transform: scaleX(-1); transform-origin: 50% 50%; }
      .bunny{ width:140px; height:auto; display:block; user-select:none; -webkit-user-drag:none; }
      .coin{ width:22px !important; height:22px !important; position:absolute; user-select:none; -webkit-user-drag:none; }
      .wbChargeHart{ position:absolute; z-index:9999; pointer-events:none; transform:translate(-50%,-50%); animation:wbHartBob 1.05s ease-in-out infinite; width:40px; height:40px; filter:drop-shadow(0 6px 10px rgba(0,0,0,.18));}
      @keyframes wbHartBob{0%{transform:translate(-50%,-50%) translateY(0) rotate(-3deg) scale(1);}50%{transform:translate(-50%,-50%) translateY(-7px) rotate(3deg) scale(1.03);}100%{transform:translate(-50%,-50%) translateY(0) rotate(-3deg) scale(1);}}
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
  function updateHud() { coinValueEl.textContent = String(coins); emit("hudUpdated", { coins }); }
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
    const r  = bunny.wrap.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    const baseX  = (r.left - fr.left) + r.width  * 0.55;
    const baseY  = (r.top  - fr.top)  + r.height * 0.82;
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

      // ✅ 画面外に行くのを強力に抑える：初期dir/speedも安全
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
      const r  = this.wrap.getBoundingClientRect();
      const fr = field.getBoundingClientRect();
      const x = (r.left - fr.left) + r.width * 0.5;
      const y = (r.top  - fr.top)  + r.height * 0.08;
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

    // ✅ サイズが取れない時でも140扱いに固定してズレを抑える
    getWrapWidth() {
      const w = this.wrap.offsetWidth || this.wrap.getBoundingClientRect().width || 140;
      return Math.max(80, Math.round(w));
    }
    getWrapHeight() {
      const h = this.wrap.offsetHeight || this.wrap.getBoundingClientRect().height || 140;
      return Math.max(80, Math.round(h));
    }

    // ✅ xもyも“画面内”に強制
    clampInside(force = false) {
      refreshFieldSize();

      const w = this.getWrapWidth();
      const h = this.getWrapHeight();
      const PAD = 6;

      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      // yの範囲：上はPAD、下はground - h（地面より下へ出さない）
      const gy = groundY();
      const minY = PAD;
      const maxY = Math.max(minY, gy - h);

      // 通常は地面付近に寄せるが、外に出てたら救出
      if (force) {
        this.x = clamp(this.x, minX, maxX);
        this.y = clamp(this.y, minY, maxY);
        return;
      }

      // “外に出てる時だけ”救出（毎回固定しすぎない）
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

      // ✅ yは基本“地面位置”へ寄せる（ただし外へは出さない）
      // 画面高さが変動しても追従
      const h = this.getWrapHeight();
      const gy = groundY();
      const targetY = gy - h;            // 地面ぴったり
      this.y += (targetY - this.y) * 0.25; // ふわっと追従

      // x反射
      const w = this.getWrapWidth();
      const PAD = 6;
      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      if (this.x <= minX) { this.x = minX; this.dir = 1; }
      else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }

      // ✅ 毎フレーム救出（外に出たら戻す）
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
  shopBtn?.addEventListener("click",   () => { unlockAudioOnce(); emit("ui:shop",   {}); });
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
    shopBtn, omukaeBtn, hanabiBtn, departBtn, rankBtn, resetBtn, slotBtn,
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
  function saveCoins(){ localStorage.setItem(LS.coins, String(coins)); }

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
    refreshFieldSize();
    await initBunnies();
    updateHud();
    emit("bunnyCountChanged", { count: bunnies.length });

    requestAnimationFrame(tick);

    // resize時は全員を救出
    const rescueAll = () => {
      refreshFieldSize();
      for (const b of bunnies) { b.clampInside(true); b.applyPos(); b.positionHeart?.(); }
      emit("resize", {});
    };
    window.addEventListener("resize", () => requestAnimationFrame(rescueAll), { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => requestAnimationFrame(rescueAll), { passive: true });
      window.visualViewport.addEventListener("scroll", () => requestAnimationFrame(rescueAll), { passive: true });
    }
  }

  init();
})();
