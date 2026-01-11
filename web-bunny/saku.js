// saku.js（画面左右に saku.png を固定表示 + 風に揺れるCSSアニメ）
// - pointer-events:none（操作の邪魔をしない）
// - fixed配置（スクロール無しでも安定）
// - 右側は反転して左右対称
// - アニメは transform だけ（軽量・GPU合成寄り）
// - z-index: 背景より上 / HUDより下 くらい

(() => {
  "use strict";

  if (window.__SAKU_V1__) return;
  window.__SAKU_V1__ = true;

  const SRC = "./assets/saku.png";

  const ID_L = "sakuLeftV1";
  const ID_R = "sakuRightV1";
  const STYLE_ID = "sakuCssV1";

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
@keyframes milkpopSakuSwayV1{
  0%   { transform: translate3d(0, -50%, 0) rotate(-1.2deg); }
  50%  { transform: translate3d(0, -50%, 0) rotate( 1.2deg); }
  100% { transform: translate3d(0, -50%, 0) rotate(-1.2deg); }
}
.milkpopSakuV1{
  position: fixed;
  top: 50%;
  width: 72px;            /* ←好みで調整 */
  height: auto;
  pointer-events: none;
  user-select: none;
  z-index: 5;             /* 背景より上、HUDより下 */
  opacity: 0.95;
  will-change: transform; /* 軽量化 */
  transform: translate3d(0, -50%, 0);
  animation: milkpopSakuSwayV1 5.8s ease-in-out infinite;
}
.milkpopSakuV1.right{
  transform: translate3d(0, -50%, 0) scaleX(-1);
}
@media (max-width: 420px){
  .milkpopSakuV1{ width: 58px; }
}
`;
    document.head.appendChild(s);
  }

  function create(side) {
    const img = document.createElement("img");
    img.src = SRC;
    img.alt = "saku";
    img.decoding = "async";
    img.loading = "eager";
    img.draggable = false;

    img.className = "milkpopSakuV1" + (side === "right" ? " right" : "");

    if (side === "left") {
      img.id = ID_L;
      img.style.left = "6px";
    } else {
      img.id = ID_R;
      img.style.right = "6px";
    }

    document.body.appendChild(img);
    return img;
  }

  function init() {
    ensureCss();

    // 二重生成防止
    if (!document.getElementById(ID_L)) create("left");
    if (!document.getElementById(ID_R)) create("right");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
