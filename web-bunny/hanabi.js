// hanabi.js（即表示版）
// - GIFを事前プリロード（初回クリックでもすぐ動く）
// - 1クリック=1発 / コイン-2000 / SE1回
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

  const HANABI_SE_SRC = "./assets/hanabi/hanabi.se";

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
    if (document.getElementById("hanabiGifStyleV3")) return;
    const s = document.createElement("style");
    s.id = "hanabiGifStyleV3";
    s.textContent = `
.hanabi-gif{
  position:absolute;
  pointer-events:none; /* ★邪魔しない */
  z-index:1;           /* ★うさぎ/コインより下 */
  opacity:1;
  animation: hanabiFade 2.8s ease-out forwards;
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
   * GIF preload（初回遅延対策）
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

    try {
      if (img.decode) await img.decode();
    } catch {}

    return img;
  }

  async function preloadAll() {
    await Promise.all(FIREWORKS.map(preloadOne));
  }

  /* =========================
   * 花火生成（1発）
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

  function spawnFirework(field) {
    const src = pickSrc();
    const cached = preloadImgs.get(src);

    const img = document.createElement("img");
    img.className = "hanabi-gif";
    img.alt = "firework";
    img.src = cached ? cached.src : src;

    const rect = getRectSafe(field);

    const x = rect.width * (0.15 + Math.random() * 0.7);
    const y = rect.height * (0.08 + Math.random() * 0.35);

    // ★サイズを大きくする（ここが本体）
    // 以前: 180〜360
    // 今回: 320〜520 くらい（迫力）
    const size = 320 + Math.random() * 200;

    img.style.left = `${x - size / 2}px`;
    img.style.top  = `${y - size / 2}px`;
    img.style.width = `${size}px`;
    img.style.height = "auto";

    field.appendChild(img);

    requestAnimationFrame(() => {
      img.style.opacity = "1";
    });

    playHanabiSE();

    setTimeout(() => {
      try { img.remove(); } catch {}
    }, 3000);

    preloadOne(pickSrc()).catch(() => {});
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

    // 二重登録防止
    btn.onclick = null;
    btn.addEventListener("click", () => {
      const have = getCoin();
      if (have < COST) {
        alert("コインが足りない…！");
        return;
      }
      setCoin(have - COST);
      spawnFirework(getField());
    });
  }

  window.addEventListener("load", () => {
    injectStyles();
    ensureButton();
    preloadAll().catch(() => {});
  });
})();
