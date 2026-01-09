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
   * ========================= */
  (function injectCssOnce() {
    if (document.getElementById("wbPerBunnyChargeCss_v2")) return;
    const st = document.createElement("style");
    st.id = "wbPerBunnyChargeCss_v2";
    st.textContent = `
      .coin{ width:26px !important; height:26px !important; }
      .bunnyWrap.babyWrap{ transform: scale(0.78); transform-origin: bottom center; }
      .wbChargeHart {
        position:absolute; z-index:9999; pointer-events:none;
        transform: translate(-50%, -50%);
        animation: wbHartBob 1.05s ease-in-out infinite;
        width:28px; height:28px;
      }
      @keyframes wbHartBob {
        0%{ transform:translate(-50%,-50%) translateY(0) rotate(-3deg); }
        50%{ transform:translate(-50%,-50%) translateY(-7px) rotate(3deg); }
        100%{ transform:translate(-50%,-50%) translateY(0) rotate(-3deg); }
      }
    `;
    document.head.appendChild(st);
  })();

  /* =========================
   * State / Storage helpers
   * ========================= */
  let coins = parseInt(localStorage.getItem(LS.coins) || "0", 10) || 0;
  function saveCoins(){ localStorage.setItem(LS.coins, String(coins)); }
  function updateHud(){ coinValueEl.textContent = String(coins); }

  /* =========================
   * 以降も含めて v16.3 は変更なし
   * ========================= */

})();
