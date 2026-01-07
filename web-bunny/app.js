(() => {
  /* =========================
   * Bunny牧場 app.js（本体）— FIX
   * - うさぎクリックできない：coinLayer吸い込み根絶 + wrapクリック強化
   * - お洒落ボタン：HUDへ強制追加（isyou.jsが無くてもボタンは出る）
   * - 初期baby：即大人（起動直後からbunny表示）
   * - 初期2体：削除（自動スポーンしない）
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
  };

  /* ===== DOM ===== */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");
  const hud = document.getElementById("hud");

  const shopBtn = document.getElementById("shopBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn = document.getElementById("resetBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) return;

  /* =========================
   * CSS保険：coinLayerがクリックを吸わない
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

  /* ===== Utils ===== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const safeKind = (k) => (BUNNY_DEFS[k] ? k : "bunny1");

  /* ===== field rect cache ===== */
  let FIELD_W = 1;
  let FIELD_H = 1;
  function refreshFieldSize() {
    FIELD_W = Math.max(1, field.clientWidth || field.getBoundingClientRect().width || 1);
    FIELD_H = Math.max(1, field.clientHeight || field.getBoundingClientRect().height || 1);
  }
  refreshFieldSize();
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });

  function groundY() { return FIELD_H - 60; }

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
      sePoyo.play()
        .then(() => { sePoyo.pause(); sePoyo.currentTime = 0; sePoyo.muted = false; })
        .catch(() => (sePoyo.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(a) {
    try { a.currentTime = 0; a.play().catch(() => {}); } catch {}
  }

  /* ===== Coins ===== */
  let coins = Math.floor(Number(localStorage.getItem(LS.coins) || 0));
  if (!Number.isFinite(coins)) coins = 0;

  function updateHud() { coinValueEl.textContent = String(coins); }
  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }

  /* =========================
   * お洒落ボタン：HUDへ強制追加
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

    hud.appendChild(btn);
    return btn;
  }
  const isyouBtn = ensureIsyouBtn();

  /* =========================
   * Bunny class（初期baby即大人化）
   * ========================= */
  const bunnies = [];
  let lastFrame = performance.now();

  class Bunny {
    constructor(kind = "bunny1", bornAt = Date.now()) {
      this.kind = safeKind(kind);
      this.bornAt = bornAt;

      // ★要望：初期babyはすぐbunnyにする → bornAtを強制的に「大人扱い」に寄せる
      // （spawn時に bornAt を古く渡せば最初から大人）
      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";
      this.wrap.style.position = "absolute";
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

      // クリック確実：wrapで拾う（coinLayer吸い込みがあっても大丈夫に）
      const tap = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        unlockAudioOnce();
        playSE(this.isBaby ? seBaby : sePoyo);
        emit("bunny:click", { bunny: this });
      };
      this.wrap.addEventListener("pointerdown", tap, { passive: false });
      this.wrap.addEventListener("click", tap);

      this.syncSprite();
      this.clampInside();
      this.applyPos();
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

    syncSprite() {
      this.el.src = this.isBaby ? ASSETS.babyBunny : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
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
   * Save / Load（最低限）
   * ========================= */
  function saveBunnyMeta() {
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map(b => ({ kind: b.kind, bornAt: b.bornAt })))
    );
  }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return [];
      return arr.map(x => ({
        kind: safeKind(x?.kind),
        bornAt: Number(x?.bornAt) || Date.now(),
      }));
    } catch {
      return [];
    }
  }

  /* =========================
   * Bunny ops
   * ========================= */
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
   * Init / Loop
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;
    for (const b of bunnies) b.update(dt);
    requestAnimationFrame(tick);
  }

  function init() {
    // ★要望：初期のbunny2体は削除 → 保存が無いなら自動スポーンしない
    const meta = loadBunnyMeta();

    if (meta.length > 0) {
      // ★要望：初期babyはすぐbunnyにする → 起動時にbaby判定の個体を強制「大人化」
      const t = Date.now();
      const adultBornAt = t - BABY_DURATION_MS - 1500;

      meta.forEach((m, i) => {
        const isBaby = (t - m.bornAt) < BABY_DURATION_MS;
        const bornAt = isBaby ? (adultBornAt - i * 500) : m.bornAt; // 強制大人化
        spawnBunny(m.kind, bornAt);
      });

      // baby残留を潰すため保存し直し
      saveBunnyMeta();
    }

    updateHud();
    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      refreshFieldSize();
      for (const b of bunnies) { b.clampInside(); b.applyPos(); }
      emit("resize", {});
    }, { passive: true });

    emit("bunnyCountChanged", { count: bunnies.length });
  }

  /* =========================
   * WB Export（他JSが拾えるように）
   * ========================= */
  window.WB = window.WB || {};
  window.WB.on = on;
  window.WB.off = off;
  window.WB.emit = emit;

  window.WB.bunnies = bunnies;
  window.WB.spawnBunny = spawnBunny;
  window.WB.removeBunnyInstance = removeBunnyInstance;

  window.WB.playSE = playSE;
  window.WB.updateHud = updateHud;
  window.WB.unlockAudioOnce = unlockAudioOnce;

  window.WB.DEPART_COST = DEPART_COST;
  window.WB.seTabidati = seTabidati;

  window.WB.getCoin = () => coins;
  window.WB.spendCoin = (n) => {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return true;
    if (coins < n) return false;
    coins -= n;
    saveCoins();
    updateHud();
    return true;
  };

  // ボタン参照も渡しておく（tabidati/isyou/omukae側で使える）
  window.WB.shopBtn = shopBtn || null;
  window.WB.departBtn = departBtn || null;
  window.WB.resetBtn = resetBtn || null;
  window.WB.isyouBtn = isyouBtn || null;

  /* =========================
   * ボタン：イベントを投げる（他モジュールが拾う）
   * ========================= */
  shopBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    emit("ui:shop", {});
  });

  departBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    emit("ui:depart", {});
  });

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    unlockAudioOnce();
    if (!confirm("リセットしますか？")) return;
    localStorage.removeItem(LS.coins);
    localStorage.removeItem(LS.bunnies);
    emit("resetRequested", {});
    location.reload();
  });

  init();
})();
