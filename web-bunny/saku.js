// saku.js（画面左右に saku.png を固定表示）
// - pointer-events:none（操作の邪魔をしない）
// - レスポンシブ対応
// - HUD/天気/アイテムより下、背景より上

(() => {
  "use strict";

  const SRC = "./assets/saku.png";

  function createSaku(side) {
    const img = document.createElement("img");
    img.src = SRC;
    img.alt = "saku";

    Object.assign(img.style, {
      position: "fixed",
      top: "50%",
      transform: "translateY(-50%)",
      width: "72px",          // ← 好みで調整
      height: "auto",
      pointerEvents: "none",  // クリック貫通
      zIndex: 5,              // 背景より上・HUDより下
      opacity: "0.95",
      userSelect: "none",
    });

    if (side === "left") {
      img.style.left = "6px";
    } else {
      img.style.right = "6px";
      img.style.transform = "translateY(-50%) scaleX(-1)"; // ← 右は反転（左右対称）
    }

    document.body.appendChild(img);
    return img;
  }

  function init() {
    // 二重生成防止
    if (document.getElementById("sakuLeft")) return;

    const left = createSaku("left");
    const right = createSaku("right");

    left.id = "sakuLeft";
    right.id = "sakuRight";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
