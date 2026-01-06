// hanabi.js
// GIF花火版（assets/hanabi 配下）
// クリックでコイン消費 → 背景に花火GIFを表示

(() => {
  const COST = 200; // 花火1回のコスト
  const BTN_ID = "hanabiBtn";

  const FIREWORKS = [
    "./assets/hanabi/fireworks_ye.gif",
    "./assets/hanabi/fireworks_pi.gif",
    "./assets/hanabi/fireworks_gr.gif",
    "./assets/hanabi/fireworks_re.gif",
    "./assets/hanabi/fireworks_bl.gif",
  ];

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
   * Style
   * ========================= */
  function injectStyles() {
    if (document.getElementById("hanabiGifStyle")) return;
    const s = document.createElement("style");
    s.id = "hanabiGifStyle";
    s.textContent = `
/* 花火ボタン */
#${BTN_ID}{
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147482000;
  border: none;
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 900;
  cursor: pointer;
  background: rgba(255,255,255,.95);
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
}
#${BTN_ID}:active{
  transform: translateY(1px);
}

/* 花火GIF（背景） */
.hanabi-gif{
  position: absolute;
  pointer-events: none;
  z-index: 1; /* bunnyより下 */
  animation: hanabiFade 2.6s ease-out forwards;
}
@keyframes hanabiFade{
  0%{ opacity:0; transform: scale(.6); }
  10%{ opacity:1; }
  80%{ opacity:1; }
  100%{ opacity:0; transform: scale(1.15); }
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Field取得（背景に出す）
   * ========================= */
  function getField() {
    const field = document.getElementById("field") || document.body;

    // relative を保証（背景配置用）
    const cs = getComputedStyle(field);
    if (cs.position === "static") field.style.position = "relative";

    // うさぎ・コインを前面に
    const bunnyLayer = document.getElementById("bunnyLayer");
    const coinLayer = document.getElementById("coinLayer");
    if (bunnyLayer) bunnyLayer.style.zIndex = "3";
    if (coinLayer) coinLayer.style.zIndex = "4";

    return field;
  }

  /* =========================
   * 花火生成
   * ========================= */
  function spawnFirework(field) {
    const img = document.createElement("img");
    img.className = "hanabi-gif";
    img.src = FIREWORKS[Math.floor(Math.random() * FIREWORKS.length)];
    img.alt = "firework";

    const rect = field.getBoundingClientRect();

    // 位置（上〜中央寄り）
    const x = rect.width * (0.1 + Math.random() * 0.8);
    const y = rect.height * (0.05 + Math.random() * 0.45);

    // サイズ（レスポンシブ）
    const size = 120 + Math.random() * 180;

    img.style.left = `${x - size / 2}px`;
    img.style.top  = `${y - size / 2}px`;
    img.style.width = `${size}px`;
    img.style.height = "auto";

    field.appendChild(img);

    // 自動削除
    setTimeout(() => {
      try { img.remove(); } catch {}
    }, 2800);
  }

  /* =========================
   * Button
   * ========================= */
  function ensureButton() {
    let btn =
      document.getElementById(BTN_ID) ||
      [...document.querySelectorAll("button")].find(b =>
        (b.textContent || "").includes("花火")
      );

    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = `🎆 花火（-${COST}）`;
      document.body.appendChild(btn);
    } else {
      btn.id = BTN_ID;
    }

    btn.addEventListener("click", () => {
      const have = getCoin();
      if (have < COST) {
        alert("コインが足りない…！");
        return;
      }

      setCoin(have - COST);

      const field = getField();

      // 3〜5発同時
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        setTimeout(() => spawnFirework(field), i * 220);
      }
    });
  }

  /* =========================
   * Boot
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    ensureButton();
  });
})();
