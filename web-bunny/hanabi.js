// hanabi.js（即表示版・強化）
// - GIFを事前プリロード（初回クリックでもすぐ動く）
// - 1クリック=1発 / コイン-2000 / SE1回
// - 当たり時だけ特大：イベント購読 + window.HANABI.jackpot() で起動
// - 連打でランダム倍率：短時間連打ほど倍率が伸びやすい
// - うさぎ・コインは邪魔しない（pointer-events:none / 低z-index）

(() => {
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

  // ===== サイズ基本（通常）=====
  const BASE_SIZE_MIN = 320;
  const BASE_SIZE_MAX = 520;

  // ===== 連打倍率（通常クリック用）=====
  const STREAK_WINDOW_MS = 900;
  const STREAK_RESET_MS  = 1400;
  const STREAK_MAX = 8;
  const MULT_MIN = 0.85;
  const MULT_MAX = 1.35;
  const MULT_STREAK_BONUS = 0.10;
  const MULT_CAP = 2.10;

  // ===== 当たり特大倍率 =====
  const JACKPOT_MULT_MIN = 2.2;
  const JACKPOT_MULT_MAX = 3.0;

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Coin HUD
   * ========================= */
  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
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
   * Style
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
   * Field & z-index整備
   * ========================= */
  function getField() {
    const field = document.getElementById("field") || document.body;
    const cs = getComputedStyle(field);
    if (cs.position === "static") field.style.position = "relative";

    const bunnyLayer = document.getElementById("bunnyLayer");
    const coinLayer = document.getElementById("coinLayer");
    if (bunnyLayer) bunnyLayer.style.zIndex = "3";
    if (coinLayer) coinLayer.style.zIndex = "4";

    return field;
  }

  /* =========================
   * GIF preload
   * ========================= */
  const preloadImgs = new Map(); // src -> HTMLImageElement

  async function preloadOne(src) {
    if (preloadImgs.has(src)) return preloadImgs.get(src);

    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    const p = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
    });

    img.src = src;
    preloadImgs.set(src, img);

    await p;

    try { if (img.decode) await img.decode(); } catch {}

    return img;
  }

  async function preloadAll() {
    await Promise.all(FIREWORKS.map(preloadOne));
  }

  /* =========================
   * 花火生成
   * ========================= */
  function getRectSafe(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) {
      return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    }
    return r;
  }

  function pickSrc() {
    return FIREWORKS[(Math.random() * FIREWORKS.length) | 0];
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // ==== 連打管理 ====
  let streak = 0;
  let lastClickAt = 0;

  function updateStreak(now) {
    const dt = now - lastClickAt;

    if (dt > STREAK_RESET_MS) {
      streak = 1;
    } else if (dt <= STREAK_WINDOW_MS) {
      streak = Math.min(STREAK_MAX, streak + 1);
    } else {
      streak = 1;
    }

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

  function spawnFirework(field, opts = {}) {
    const {
      multiplier = 1,
      forceBig = false,
      costCoin = false,
    } = opts;

    if (costCoin) {
      const have = getCoin();
      if (have < COST) {
        alert("コインが足りない…！");
        return false;
      }
      setCoin(have - COST);
    }

    const src = pickSrc();
    const cached = preloadImgs.get(src);

    const img = document.createElement("img");
    img.className = "hanabi-gif";
    img.alt = "firework";
    img.src = cached ? cached.src : src;

    const rect = getRectSafe(field);

    const x = rect.width * (0.15 + Math.random() * 0.7);
    const y = rect.height * (0.08 + Math.random() * 0.35);

    let baseSize = rand(BASE_SIZE_MIN, BASE_SIZE_MAX);
    if (forceBig) baseSize *= 1.15;

    const size = Math.floor(baseSize * multiplier);

    img.style.left = `${x - size / 2}px`;
    img.style.top  = `${y - size / 2}px`;
    img.style.width = `${size}px`;
    img.style.height = "auto";

    field.appendChild(img);

    requestAnimationFrame(() => { img.style.opacity = "1"; });

    playHanabiSE();

    setTimeout(() => { try { img.remove(); } catch {} }, 3000);

    preloadOne(pickSrc()).catch(() => {});
    return true;
  }

  /* =========================
   * Button mount（HUD）
   * ========================= */
  function findMount() {
    return document.getElementById("hudButtons")
      || document.getElementById("hud")
      || document.body;
  }

  function ensureButton() {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = [...document.querySelectorAll("button")].find(b =>
        (b.textContent || "").includes("花火")
      ) || null;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
    }

    btn.id = BTN_ID;
    btn.textContent = `🎆 花火（-${COST}）`;

    const mount = findMount();
    if (btn.parentElement !== mount) mount.appendChild(btn);

    btn.onclick = null;

    btn.addEventListener("click", () => {
      const now = Date.now();
      const mult = calcTapMultiplier(now);

      spawnFirework(getField(), {
        multiplier: mult,
        forceBig: false,
        costCoin: true,
      });

      // ✅ 花火カウント（直呼び）
      try { window.SYOUGOU?.add?.("hanabi", 1); } catch {}
      try { window.WB?.emit?.("hanabiFired"); } catch {}
      try { window.dispatchEvent(new CustomEvent("wb:hanabi")); } catch {}
    });
  }

  /* =========================
   * 当たり（特大）連携
   * ========================= */
  function jackpotFire() {
    const mult = rand(JACKPOT_MULT_MIN, JACKPOT_MULT_MAX);
    spawnFirework(getField(), {
      multiplier: mult,
      forceBig: true,
      costCoin: false,
    });

    // ✅ 当たり花火カウントも入れてOK（必要なら外して）
    try { window.SYOUGOU?.add?.("hanabi", 1); } catch {}
    try { window.WB?.emit?.("hanabiFired"); } catch {}
    try { window.dispatchEvent(new CustomEvent("wb:hanabi")); } catch {}
  }

  window.HANABI = window.HANABI || {};
  window.HANABI.fire = (opts = {}) => spawnFirework(getField(), opts);
  window.HANABI.jackpot = () => jackpotFire();

  ["milkpop:slotWin", "slot:win", "slotWin", "jackpot"].forEach((name) => {
    window.addEventListener(name, () => jackpotFire());
  });

  window.addEventListener("load", () => {
    injectStyles();
    ensureButton();
    preloadAll().catch(() => {});
  });
})();
