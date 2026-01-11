// saku.js（うさぎの足元に saku.png を配置 + 風に揺れる）
// - 各 bunnyWrap の「足元」に追従
// - pointer-events:none（操作を邪魔しない）
// - transformのみ更新（軽量）
// - 風揺れはCSS（GPU合成寄り）

(() => {
  "use strict";
  if (window.__SAKU_FOOT_V1__) return;
  window.__SAKU_FOOT_V1__ = true;

  const SRC = "./assets/saku.png";
  const STYLE_ID = "sakuFootCssV1";
  const CLASS_SAKU = "milkpopSakuFootV1";

  /* =========================
   * CSS（風に揺れる：軽量）
   * ========================= */
  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
@keyframes milkpopSakuFootSwayV1{
  0%   { transform: translate3d(-50%, 0, 0) rotate(-1.4deg); }
  50%  { transform: translate3d(-50%, 0, 0) rotate( 1.4deg); }
  100% { transform: translate3d(-50%, 0, 0) rotate(-1.4deg); }
}
.${CLASS_SAKU}{
  position: absolute;
  left: 50%;
  bottom: -6px;              /* ← 足元ちょい下 */
  width: 28px;               /* ← さりげないサイズ */
  height: auto;
  pointer-events: none;
  user-select: none;
  opacity: 0.95;
  z-index: 3;                /* うさぎより下・地面感 */
  transform: translate3d(-50%, 0, 0);
  will-change: transform;
  animation: milkpopSakuFootSwayV1 6.2s ease-in-out infinite;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * 生成 / 追従
   * ========================= */
  function attachToBunnyWrap(wrap) {
    if (!wrap || !wrap.isConnected) return;
    if (wrap.querySelector(`.${CLASS_SAKU}`)) return;

    // bunnyWrap を基準にする
    const cs = getComputedStyle(wrap);
    if (cs.position === "static") {
      wrap.style.position = "relative";
    }

    const img = document.createElement("img");
    img.src = SRC;
    img.alt = "saku";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.className = CLASS_SAKU;

    wrap.appendChild(img);
  }

  function scanAndAttach() {
    const wraps = document.querySelectorAll(".bunnyWrap");
    wraps.forEach(attachToBunnyWrap);
  }

  /* =========================
   * 初期化 & 監視
   * ========================= */
  function init() {
    ensureCss();
    scanAndAttach();

    // うさぎ増減・再生成対策（軽量ポーリング）
    setInterval(scanAndAttach, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  console.log("[saku] attached to bunny feet");
})();
