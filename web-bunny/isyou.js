// ✅ V30.0 PATCH：赤枠が「必ず出る」修正版（hat overlay方式は維持）
// 変更点：#isyouSelectBox を overlay内ではなく body 直下に置いて position:fixed 追従に変更

(() => {
  "use strict";

  // ====== ここだけ追加/差し替え ======
  function ensureSelectBoxFixed() {
    let box = document.getElementById("isyouSelectBoxFixed");
    if (!box) {
      box = document.createElement("div");
      box.id = "isyouSelectBoxFixed";
      box.style.cssText = `
        position: fixed;
        left: -9999px; top: -9999px;
        width: 0px; height: 0px;
        pointer-events: none;
        z-index: 2147483650;
        border-radius: 18px;
        box-sizing: border-box;
        border: 4px solid rgba(255, 64, 64, .95);
        box-shadow:
          0 0 0 3px rgba(255,255,255,.95),
          0 14px 34px rgba(0,0,0,.22);
      `;
      document.body.appendChild(box);
    }
    return box;
  }

  function hideSelectBoxFixed() {
    const box = ensureSelectBoxFixed();
    box.style.left = "-9999px";
    box.style.top = "-9999px";
    box.style.width = "0px";
    box.style.height = "0px";
  }

  function syncSelectBoxFixedToImg(img) {
    const box = ensureSelectBoxFixed();
    if (!img || !img.isConnected) { hideSelectBoxFixed(); return; }

    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  // ====== ここから：あなたのV30.0コードに「上書きフック」するだけ ======
  // 1) 既存の isyouSelectBox を使わない（見えない原因）
  // 2) selectImg() と applyEquipsAll() 内の sync を fixed版に差し替え

  // 既にV30.0が読み込まれてる前提でパッチ当て
  // （差し替え運用なら、V30.0の中にこの fixed 実装を直接コピペしてOK）
  const tryPatch = () => {
    const ISYOU = window.ISYOU;
    if (!ISYOU || !ISYOU._state) return false;

    // state参照
    const state = ISYOU._state;

    // 公開されてない関数には触れられないので、
    // クリック時に「常に追従」させる保険を入れる（最強で確実）
    const tick = () => {
      if (state.mode === "equip" && state.selectedImg) {
        syncSelectBoxFixedToImg(state.selectedImg);
      } else {
        hideSelectBoxFixed();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // resize/scrollでも追従
    window.addEventListener("resize", () => {
      if (state.mode === "equip" && state.selectedImg) syncSelectBoxFixedToImg(state.selectedImg);
    }, { passive: true });
    window.addEventListener("scroll", () => {
      if (state.mode === "equip" && state.selectedImg) syncSelectBoxFixedToImg(state.selectedImg);
    }, { passive: true });

    console.log("[isyou] patched: select box fixed");
    return true;
  };

  // すぐ/遅延でパッチ試行
  if (!tryPatch()) {
    let t = 0;
    const id = setInterval(() => {
      t++;
      if (tryPatch() || t > 100) clearInterval(id);
    }, 50);
  }
})();
