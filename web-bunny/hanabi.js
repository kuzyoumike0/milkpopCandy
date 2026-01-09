// hanabi.js（即表示版・強化 / FIX: 称号・実績が確実にカウントされる完全版）
// - GIF事前プリロード（初回でも即表示）
// - 1クリック=1発 / コイン-2000 / SE1回
// - 成功時のみカウント（コイン不足時は加算しない）
// - 連打でランダム倍率（短時間ほど伸びる）
// - 当たり（特大）：外部イベント/slot連携で発火
// - うさぎ・コインは邪魔しない（pointer-events:none / 低z-index）
//
// ✅ HUD残留ポリシー
//   ・花火ボタンは「#hudButtons」に必ず追加（ハンバーガーに入れない）
//   ・#hudButtons が未生成の瞬間があっても wait してから追加（body誤配置防止）
//
// ✅ 実績/称号
//   ・成功時に必ず WB.emit("sy:add",{key:"hanabi", n:1}) を投げる
//   ・WB が無い/遅い環境でも retry で SYOUGOU に加算
//   ・zisseki.js は sy:add を拾って進捗に反映（推奨）

(() => {
  "use strict";

  /* =========================
   * Config
   * ========================= */
  const COST = 2000;
  const BTN_ID = "hanabiBtn";

  const FIREWORKS = [
    "./assets/hanabi/fireworks_ye.gif",
    "./assets/hanabi/fireworks_pi.gif",
    "./assets/hanabi/fireworks_gr.gif",
    "./assets/hanabi/fireworks_re.gif",
    "./assets/hanabi/fireworks_bl.gif",
  ];

  const HANABI_SE_SRC = "./assets/hanabi/hanabi.mp3";

  // サイズ（通常）
  const BASE_SIZE_MIN = 320;
  const BASE_SIZE_MAX = 520;

  // 連打倍率
  const STREAK_WINDOW_MS = 900;
  const STREAK_RESET_MS  = 1400;
  const STREAK_MAX = 8;
  const MULT_MIN = 0.85;
  const MULT_MAX = 1.35;
  const MULT_STREAK_BONUS = 0.10;
  const MULT_CAP = 2.10;

  // 当たり（特大）
  const JACKPOT_MULT_MIN = 2.2;
  const JACKPOT_MULT_MAX = 3.0;

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Tiny toast（alert廃止で軽量）
   * ========================= */
  const TOAST_ID = "hanabiToastV1";
  function toast(msg) {
    try {
      let el = document.getElementById(TOAST_ID);
      if (!el) {
        el = document.createElement("div");
        el.id = TOAST_ID;
        el.style.cssText = `
position:fixed; left:50%; top:64px; transform:translateX(-50%);
z-index:2147483647;
background:rgba(0,0,0,.78); color:#fff;
padding:10px 12px; border-radius:14px;
font-weight:900; font-size:13px;
box-shadow:0 14px 40px rgba(0,0,0,.25);
pointer-events:none; opacity:0; transition:opacity .18s ease;`;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1100);
    } catch {}
  }

  /* =========================
   * SYOUGOU Safe Add（retry）
   * ========================= */
  const __syQueue = [];
  let __syRetryTimer = null;

  function __syCallAdd(k, n) {
    try {
      const S = window.SYOUGOU;
      const fn =
        (typeof S?.add === "function" && S.add) ||
        (typeof S?.inc === "function" && S.inc) ||
        (typeof S?.plus === "function" && S.plus);
      if (!fn) return false;

      // キー存在チェック（取れる実装のみ）
      try {
        const keys =
          (Array.isArray(S.keys) && S.keys) ||
          (Array.isArray(S.KEYS) && S.KEYS) ||
          (S.map && typeof S.map === "object" ? Object.keys(S.map) : null) ||
          (S.defs && typeof S.defs === "object" ? Object.keys(S.defs) : null);
        if (keys && !keys.includes(k)) {
          console.warn("[hanabi][syougou] unknown key:", k);
          return false;
        }
      } catch {}

      fn.call(S, k, n);
      try { S.save?.(); } catch {}
      try { S.render?.(); } catch {}
      try { S.update?.(); } catch {}
      try { S.updateHud?.(); } catch {}
      return true;
    } catch {
      return false;
    }
  }

  function syAdd(key, n = 1) {
    if (__syCallAdd(key, n)) return true;

    // WB 統一窓口（zisseki.js が拾う）
    try { window.WB?.emit?.("sy:add", { key, n }); } catch {}

    __syQueue.push([key, n]);
    if (!__syRetryTimer) {
      let tries = 0;
      __syRetryTimer = setInterval(() => {
        tries++;
        for (let i = 0; i < __syQueue.length; i++) {
          const [k, a] = __syQueue[i];
          if (__syCallAdd(k, a)) {
            __syQueue.splice(i, 1);
            i--;
          }
        }
        if (__syQueue.length === 0) {
          clearInterval(__syRetryTimer);
          __syRetryTimer = null;
          return;
        }
        if (tries >= 300) {
          console.warn("[hanabi][syougou] retry timeout:", __syQueue);
          clearInterval(__syRetryTimer);
          __syRetryTimer = null;
        }
      }, 200);
    }
    return false;
  }

  /* =========================
   * Coin helpers（WB優先）
   * ========================= */
  function getCoin() {
    try {
      if (window.WB?.getCoin) return Number(window.WB.getCoin()) || 0;
      if (typeof window.WB?.coins === "number") return window.WB.coins;
    } catch {}
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }

  function spendCoin(amount) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return true;

    try {
      if (typeof window.WB?.spendCoin === "function") {
        return !!window.WB.spendCoin(amount);
      }
    } catch {}

    const have = getCoin();
    if (have < amount) return false;

    try { window.WB.coins = have - amount; } catch {}
    const el = $("#coinValue");
    if (el) el.textContent = String(have - amount);
    return true;
  }

  /* =========================
   * Audio
   * ========================= */
  const hanabiSE = new Audio(HANABI_SE_SRC);
  hanabiSE.volume = 0.8;

  function playHanabiSE() {
    try {
      hanabiSE.currentTime = 0;
      hanabiSE.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("hanabiGifStyleV4")) return;
    const s = document.createElement("style");
    s.id = "hanabiGifStyleV4";
    s.textContent = `
.hanabi-gif{
  position:absolute;
  pointer-events:none;
  z-index:1;
  opacity:1;
  animation: hanabiFade 2.9s ease-out forwards;
  will-change: transform, opacity;
}
@keyframes hanabiFade{
  0%{ opacity:0; transform: scale(.55); }
  10%{ opacity:1; }
  82%{ opacity:1; }
  100%{ opacity:0; transform: scale(1.25); }
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Field / z-index
   * ========================= */
  function getField() {
    const field = document.getElementById("field") || document.body;
    const cs = getComputedStyle(field);
    if (cs.position === "static") field.style.position = "relative";

    const bunnyLayer = document.getElementById("bunnyLayer");
    const coinLayer  = document.getElementById("coinLayer");
    if (bunnyLayer) bunnyLayer.style.zIndex = "3";
    if (coinLayer)  coinLayer.style.zIndex  = "4";
    return field;
  }

  /* =========================
   * Preload
   * ========================= */
  const preloadImgs = new Map();

  function preloadOne(src) {
    if (preloadImgs.has(src)) return Promise.resolve(preloadImgs.get(src));
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    const p = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
    });
    img.src = src;
    preloadImgs.set(src, img);
    return p;
  }

  function preloadAll() {
    return Promise.all(FIREWORKS.map(preloadOne));
  }

  /* =========================
   * Utils
   * ========================= */
  function pickSrc() {
    return FIREWORKS[(Math.random() * FIREWORKS.length) | 0];
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function getRectSafe(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) {
      return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    }
    return r;
  }

  /* =========================
   * 連打倍率
   * ========================= */
  let streak = 0;
  let lastClickAt = 0;

  function updateStreak(now) {
    const dt = now - lastClickAt;
    if (dt > STREAK_RESET_MS) streak = 1;
    else if (dt <= STREAK_WINDOW_MS) streak = Math.min(STREAK_MAX, streak + 1);
    else streak = 1;
    lastClickAt = now;
    return streak;
  }

  function calcTapMultiplier(now) {
    const s = updateStreak(now);
    const bonus = Math.min(MULT_CAP - MULT_MAX, (s - 1) * MULT_STREAK_BONUS);
    const max = Math.min(MULT_CAP, MULT_MAX + bonus);
    const min = MULT_MIN;
    const t = Math.random();
    const biased = 1 - Math.pow(1 - t, 1 + (s * 0.35));
    return min + (max - min) * biased;
  }

  /* =========================
   * Firework
   * ========================= */
  function spawnFirework(field, opts = {}) {
    const { multiplier = 1, forceBig = false, costCoin = false } = opts;

    if (costCoin && !spendCoin(COST)) {
      toast("🪙 コインが足りない…！");
      return false;
    }

    const src = pickSrc();
    const cached = preloadImgs.get(src);

    const img = document.createElement("img");
    img.className = "hanabi-gif";
    img.alt = "firework";
    img.src = cached ? cached.src : src;

    const rect = getRectSafe(field);
    const x = rect.width  * (0.15 + Math.random() * 0.7);
    const y = rect.height * (0.08 + Math.random() * 0.35);

    let baseSize = rand(BASE_SIZE_MIN, BASE_SIZE_MAX);
    if (forceBig) baseSize *= 1.15;

    const size = Math.floor(baseSize * multiplier);
    img.style.left = `${x - size / 2}px`;
    img.style.top  = `${y - size / 2}px`;
    img.style.width = `${size}px`;

    field.appendChild(img);
    requestAnimationFrame(() => { img.style.opacity = "1"; });

    playHanabiSE();
    setTimeout(() => { try { img.remove(); } catch {} }, 3000);

    preloadOne(pickSrc()).catch(() => {});
    return true;
  }

  /* =========================
   * 成功時処理（称号・実績）
   * ========================= */
  function onHanabiSuccess(isJackpot = false) {
    syAdd("hanabi", 1);
    try { window.WB?.emit?.("sy:add", { key: "hanabi", n: 1 }); } catch {}
    try { window.WB?.emit?.("hanabiFired", { jackpot: !!isJackpot }); } catch {}
    try { window.dispatchEvent(new CustomEvent("wb:hanabi", { detail: { jackpot: !!isJackpot } })); } catch {}
  }

  /* =========================
   * Wait helpers（hudButtons生成待ち）
   * ========================= */
  function waitForElm(getter, timeoutMs = 12000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const v = getter();
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error("timeout")); }
      }, 50);
    });
  }

  /* =========================
   * Button（HUDに固定・二重bind防止）
   * ========================= */
  function ensureButton(parent) {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = BTN_ID;
      btn.textContent = `🎆 花火（-${COST}）`;
      parent.appendChild(btn);
    } else {
      // ✅ もし別の場所に居たら HUD側へ戻す（body誤配置の回収）
      if (btn.parentElement !== parent) parent.appendChild(btn);
    }

    // ✅ 二重にイベントが増殖しないようにガード
    if (btn.__hanabiBound) return;
    btn.__hanabiBound = true;

    btn.addEventListener("click", () => {
      const now = Date.now();
      const mult = calcTapMultiplier(now);
      const ok = spawnFirework(getField(), { multiplier: mult, forceBig: false, costCoin: true });
      if (ok) onHanabiSuccess(false);
    });
  }

  /* =========================
   * Jackpot hook
   * ========================= */
  function jackpotFire() {
    const mult = rand(JACKPOT_MULT_MIN, JACKPOT_MULT_MAX);
    const ok = spawnFirework(getField(), { multiplier: mult, forceBig: true, costCoin: false });
    if (ok) onHanabiSuccess(true);
  }

  window.HANABI = window.HANABI || {};
  window.HANABI.fire = (opts = {}) => spawnFirework(getField(), opts);
  window.HANABI.jackpot = () => jackpotFire();

  ["milkpop:slotWin", "slot:win", "slotWin", "jackpot"].forEach((name) => {
    window.addEventListener(name, () => jackpotFire());
  });

  /* =========================
   * Boot
   * ========================= */
  async function boot() {
    injectStyles();
    preloadAll().catch(() => {});

    // ✅ 必ずHUD側に出す
    let parent = null;
    try {
      parent = await waitForElm(() => document.getElementById("hudButtons"), 12000);
    } catch {
      parent = document.getElementById("hud") || document.body;
    }
    ensureButton(parent);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    window.addEventListener("load", boot, { once: true });
  }
})();
