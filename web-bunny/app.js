(() => {
  "use strict";

  /* =========================
   * Bunny牧場 app.js（本体）— FIX: 画面外に出ない + 連携復活
   * - 初期baby排除
   * - ボタン連携（お迎え/旅立ち/リセット/お洒落）
   * - WBイベントバス（on/off/emit）
   * ========================= */

  /* ===== Assets ===== */
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

  /* ===== Bunny defs ===== */
  const BUNNY_DEFS = {
    bunny1: { img: "./assets/bunny1.png", coinMul: 0.55 },
    bunny3: { img: "./assets/bunny3.png", coinMul: 1.0 },
    bunny4: { img: "./assets/bunny4.png", coinMul: 1.8 },
    bunny5: { img: "./assets/bunny5.png", coinMul: 2.8 },
    reabunny: { img: "./assets/reabunny.png", coinMul: 4.0 },
  };

  /* ===== Balance ===== */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;
  const REA_EVOLVE_RATE = 0.01;
  const DEPART_COST = 10;

  /* ===== Storage ===== */
  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6",
    dex: "wb_dex_v1",
    unchi: "wb_unchi_v1",
    title: "wb_title_v1",
    titleList: "wb_title_list_v1",
  };

  /* ===== DOM ===== */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  const shopBtn = document.getElementById("shopBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn = document.getElementById("resetBtn");
  const rankBtn = document.getElementById("rankBtn");
  const hud = document.getElementById("hud");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] 必要DOMが見つかりません");
    return;
  }

  /* =========================
   * HUDが押せない対策：最前面 + クリック可能を明示
   * （CSSがあっても上書きで安全側へ）
   * ========================= */
  (() => {
    const st = document.createElement("style");
    st.textContent = `
      #hud{ position:fixed; z-index:2147483000; pointer-events:auto; }
      #hud *{ pointer-events:auto; }
      #field{ position:fixed; inset:0; }
      #bunnyLayer{ position:absolute; inset:0; z-index:30; pointer-events:auto; }
      #coinLayer{ position:absolute; inset:0; z-index:40; pointer-events:auto; }

      .bunnyWrap{ position:absolute; width:140px; height:140px; pointer-events:auto; z-index:35; }
      .bunny{ pointer-events:none; user-select:none; -webkit-user-drag:none; }
    `;
    document.head.appendChild(st);
  })();

  /* ===== Utils ===== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ===== field rect cache ===== */
  let FIELD_W = 0;
  let FIELD_H = 0;
  function refreshFieldSize() {
    FIELD_W = Math.max(1, field.clientWidth || field.getBoundingClientRect().width || 1);
    FIELD_H = Math.max(1, field.clientHeight || field.getBoundingClientRect().height || 1);
  }
  refreshFieldSize();
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });

  function groundY() { return FIELD_H - 60; }

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

  /* ===== Audio ===== */
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

  /* ===== State ===== */
  let coins = parseInt(localStorage.getItem(LS.coins) || "0", 10);
  if (!Number.isFinite(coins)) coins = 0;

  const bunnies = [];
  let lastFrame = performance.now();

  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    emit("hudUpdated", { coins });
  }

  /* =========================
   * Bunny class
   * ========================= */
  class Bunny {
    constructor(kind = "bunny1", bornAt = Date.now()) {
      this.kind = kind;
      this.bornAt = bornAt;

      // ★ isBaby を bornAt から決める（初期baby排除の土台）
      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";
      this.wrap.style.left = "0px";
      this.wrap.style.top = "0px";

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
      this.vx = 0;

      this.syncSprite();

      // 画像ロード後に実測幅でclamp
      this.el.addEventListener("load", () => {
        this.clampInside();
        this.applyPos();
      });

      // ★クリック（旅立ちモードでtabidati.jsがキャプチャしてても、通常はここで反応）
      const tap = (e) => {
        e.preventDefault();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);
        emit("bunny:click", { bunny: this });
      };
      this.wrap.addEventListener("pointerdown", tap);

      this.clampInside();
      this.applyPos();
    }

    syncSprite() {
      if (this.isBaby) {
        this.el.src = ASSETS.babyBunny;
      } else {
        this.el.src = BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img;
      }
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

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";

      this.syncSprite();

      // 進化で幅変わるので即clamp
      this.clampInside();
      this.applyPos();
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
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

  /* =========================
   * Bunny ops（他モジュール用）
   * ========================= */
  function spawnBunny(kind = "bunny1", bornAt = Date.now()) {
    const b = new Bunny(kind, bornAt);
    bunnies.push(b);
    emit("bunnyCountChanged", { count: bunnies.length });
    return b;
  }

  function removeBunnyInstance(b) {
    const idx = bunnies.indexOf(b);
    if (idx < 0) return false;
    try { b.wrap.remove(); } catch {}
    bunnies.splice(idx, 1);
    emit("bunnyCountChanged", { count: bunnies.length });
    return true;
  }

  /* =========================
   * Buttons（押せない問題の核をここで復活）
   * ========================= */
  // 旅立ちボタン：tabidati.jsに渡すイベント
  departBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    emit("ui:depart", {});
  });

  // お迎えボタン：omukae.js が直接 listener を貼る想定でも、保険でイベントも出す
  shopBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    emit("ui:shop", {});
  });

  // リセット（本体で処理）
  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
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

  /* =========================
   * WB export（上書きじゃなく “核” を提供）
   * ========================= */
  window.WB = {
    // event bus
    on, off, emit,

    // defs
    ASSETS, BUNNY_DEFS, LS, DEPART_COST,

    // dom
    field, shopBtn, departBtn, resetBtn, rankBtn, hud,

    // coins互換
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

    // state
    get coins() { return coins; },
    set coins(v) {
      coins = Math.max(0, Math.floor(Number(v) || 0));
      saveCoins();
      updateHud();
    },

    // ui/audio
    updateHud,
    unlockAudioOnce,
    playSE,
    seTabidati,

    // bunnies
    bunnies,
    spawnBunny,
    removeBunnyInstance,
  };

  /* =========================
   * Loop
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    for (const b of bunnies) b.update(dt);

    requestAnimationFrame(tick);
  }

  function init() {
    // ★初期2体は必ず大人（bornAtを過去にする）
    const t = Date.now();
    spawnBunny("bunny1", t - BABY_DURATION_MS - 1000);
    spawnBunny("bunny1", t - BABY_DURATION_MS - 2000);

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
