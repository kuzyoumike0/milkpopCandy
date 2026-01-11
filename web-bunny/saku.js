// saku.js（画面の左右下に saku.png を固定配置 + 風に揺れる）
// - position: fixed（画面基準）
// - pointer-events:none（操作を邪魔しない）
// - CSSアニメのみで軽量
// - 左右で少し揺れを変えて自然に

(() => {
  "use strict";
  if (window.__SAKU_EDGE_V1__) return;
  window.__SAKU_EDGE_V1__ = true;

  const SRC = "./assets/saku.png";
  const STYLE_ID = "sakuEdgeCssV1";

  /* =========================
   * CSS（風に揺れる・軽量）
   * ========================= */
  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
@keyframes sakuSwayLeftV1{
  0%   { transform: rotate(-1.6deg); }
  50%  { transform: rotate( 1.2deg); }
  100% { transform: rotate(-1.6deg); }
}
@keyframes sakuSwayRightV1{
  0%   { transform: scaleX(-1) rotate(-1.2deg); }
  50%  { transform: scaleX(-1) rotate( 1.6deg); }
  100% { transform: scaleX(-1) rotate(-1.2deg); }
}

.milkpopSakuEdge{
  position: fixed;
  bottom: 4px;                 /* 地面に少し埋まる感じ */
  width: 64px;                 /* さりげないサイズ */
  height: auto;
  pointer-events: none;
  user-select: none;
  opacity: 0.95;
  z-index: 4;                  /* 背景より上・HUDより下 */
  transform-origin: bottom center;
  will-change: transform;
}

#sakuEdgeLeft{
  left: 6px;
  animation: sakuSwayLeftV1 6.8s ease-in-out infinite;
}

#sakuEdgeRight{
  right: 6px;
  animation: sakuSwayRightV1 7.4s ease-in-out infinite;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * DOM生成
   * ========================= */
  function create(id) {
    if (document.getElementById(id)) return;

    const img = document.createElement("img");
    img.id = id;
    img.src = SRC;
    img.alt = "saku";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.className = "milkpopSakuEdge";

    document.body.appendChild(img);
  }

  function init() {
    ensureCss();
    create("sakuEdgeLeft");
    create("sakuEdgeRight");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  console.log("[saku] edge-bottom ready");
})();
