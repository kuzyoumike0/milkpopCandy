(() => {
  "use strict";

  /* =========================
   * Bunny牧場 app.js（本体）— FIX
   * - coinLayerがクリックを吸う問題を根絶
   * - うさぎクリック復活（wrapで拾う）
   * - お洒落ボタンをHUDへ自動追加
   * - 起動時：babyを即大人化
   * - 初期bunny2体スポーンを廃止（＝初期2体削除）
   * ========================= */

  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",
  };

  const BUNNY_DEFS = {
    bunny1: { img: "./assets/bunny1.png" },
    bunny3: { img: "./assets/bunny3.png" },
    bunny4: { img: "./assets/bunny4.png" },
    bunny5: { img: "./assets/bunny5.png" },
    reabunny: { img: "./assets/reabunny.png" },
  };

  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;
  const REA_EVOLVE_RATE = 0.01;
  const DEPART_COST = 10;

  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6",
  };

  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  const hud = document.getElementById("hud");
  const shopBtn = document.getElementById("shopBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn = document.getElementById("resetBtn");
  const rankBtn = document.getElementById("rankBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) return;

  /* =========================
   * CSS保険：coinLayer吸い込み根絶
   * ========================= */
  (() => {
    const st = document.createElement("style");
    st.textContent = `
      #coinLayer{ pointer-events:none !important; } /* ←最重要 */
      .coin, .ougonunchi{ pointer-events:auto !important; }
      .bunnyWrap{ pointer-events:auto !important; z-index:35; }
      .bunny{ pointer-events:none !important; }
      #hud{ z-index:2147483000 !important; pointer-events:auto !important; }
      #hud *{ pointer-events:auto !important; }
    `;
    document.head.appendChild(st);
  })();

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
   * Audio
   * ========================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      sePoyo.muted = true;
      sePoyo.currentTime = 0;
      sePoyo.play().then(() => {
        sePoyo.pause(); sePoyo.currentTime = 0; sePoyo.muted = false;
      }).catch(() => (sePoyo.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(a) {
    try { a.currentTime = 0; a.play().catch(() => {}); } catch {}
  }

  /* =========================
   * Field size
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  let FIELD_W = 1, FIELD_H = 1;
  function refreshFieldSize() {
    FIELD_W = Math.max(1, field.clientWidth || field.getBoundingClientRect().width || 1);
    FIELD_H = Math.max(1, field.clientHeight || field.getBoundingClientRect().height || 1);
  }
  function groundY() { return FIELD_H - 60; }
  refreshFieldSize();
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });

  /* =========================
   * Coins
   * ========================= */
  let coins = parseInt(localStorage.getItem(LS.coins) || "0", 10);
  if (!Number.isFinite(coins)) coins = 0;

  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }
  function updateHud() { coinValueEl.textContent = String(coins); }

  /* =========================
   * Bunny meta load/save
   * ========================= */
  function safeKind(k) { return BUNNY_DEFS[k] ? k : "bunny1"; }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return [];
      return arr.map(x => ({
        kind: safeKind(x?.kind),
        bornAt: Number(x?.bornAt) || Date.now(),
      }));
    } catch { return []; }
  }

  function saveBunnyMeta() {
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map(b => ({ kind: b.kind, bornAt: b.bornAt })))
    );
  }

  /* =========================
   * Bunny
   * ========================= */
  const bunnies = [];

  class Bunny {
    constructor(kind, bornAt) {
      this.kind = safeKind(kind);
      this.bornAt = bornAt;

      // 起動時のbabyは「即大人化」したいので、init側でbornAtを補正する
      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";
      this.wrap.style.position = "absolute";

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

      this.syncSprite();

      // クリック確実（wrapで拾う）
      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);
        emit("bunny:click", { bunny: this });
      });

      this.clampInside();
      this.applyPos();
    }

    syncSprite() {
      if (this.isBaby) this.el.src = ASSETS.babyBunny;
      else this.el.src = BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img;
    }

    getWrapWidth() {
      const w = this.wrap.getBoundingClientRect().width || 140;
      return Math.max(60, w);
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

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";
      this.syncSprite();
      this.clampInside();
      this.applyPos();
      saveBunnyMeta();
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top  = `${this.y}px`;
    }

    update(dt) {
      this.evolveIfNeeded();

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
    const b = new Bunny(kind, bornAt);
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
   * お洒落ボタンをHUDへ強制追加
   * ========================= */
  function ensureIsyouBtn() {
    if (!hud) return null;
    let btn = document.getElementById("isyouBtn");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.textContent = "お洒落";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      unlockAudioOnce();
      emit("ui:isyou", {});
    });

    // 右端に追加（好みで挿入位置変えてOK）
    hud.appendChild(btn);
    return btn;
  }
  const isyouBtn = ensureIsyouBtn();

  /* =========================
   * ボタンイベント（他モジュールが拾えるように）
   * ========================= */
  shopBtn?.addEventListener("click", (e) => { e.preventDefault(); unlockAudioOnce(); emit("ui:shop", {}); });
  departBtn?.addEventListener("click", (e) => { e.preventDefault(); unlockAudioOnce(); emit("ui:depart", {}); });

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    if (!confirm("リセットしますか？")) return;
    localStorage.removeItem(LS.coins);
    localStorage.removeItem(LS.bunnies);
    emit("resetRequested", {});
    location.reload();
  });

  /* =========================
   * WB API（isyou/tabidati/omukaeが使う土台）
   * ========================= */
  window.WB = {
    on, off, emit,
    ASSETS, BUNNY_DEFS, LS, DEPART_COST,
    field, hud,
    shopBtn, departBtn, resetBtn, rankBtn,
    isyouBtn,

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

    get coins() { return coins; },
    set coins(v) {
      coins = Math.max(0, Math.floor(Number(v) || 0));
      saveCoins();
      updateHud();
    },

    updateHud,
    unlockAudioOnce,
    playSE,
    seTabidati,

    bunnies,
    spawnBunny,
    removeBunnyInstance,
    saveBunnyMeta,
  };

  /* =========================
   * Init / Loop
   * ========================= */
  let lastFrame = performance.now();

  function initBunnies() {
    const meta = loadBunnyMeta();

    // ★要望：初期2体は削除 → 保存が無い場合は「自動スポーンしない」
    // （最低1匹欲しいなら、ここで1匹だけ大人をspawnに変えてOK）
    if (!meta || meta.length === 0) {
      // 何も出さない（ユーザー要望：初期2体削除）
      return;
    }

    // ★保存データにbabyが残ってても「即大人化」
    const t = Date.now();
    const adultBornAt = t - BABY_DURATION_MS - 1000;

    meta.forEach((m, i) => {
      const isBaby = (t - m.bornAt) < BABY_DURATION_MS;
      const bornAt = isBaby ? (adultBornAt - i * 500) : m.bornAt;
      spawnBunny(m.kind, bornAt);
    });

    // “baby残留” を確実に潰すため保存し直す
    saveBunnyMeta();
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;
    for (const b of bunnies) b.update(dt);
    requestAnimationFrame(tick);
  }

  function init() {
    initBunnies();
    updateHud();
    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      refreshFieldSize();
      for (const b of bunnies) { b.clampInside(); b.applyPos(); }
      emit("resize", {});
    }, { passive: true });

    emit("bunnyCountChanged", { count: bunnies.length });
  }

  init();
})();
