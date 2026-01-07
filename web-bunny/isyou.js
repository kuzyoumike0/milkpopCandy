// isyou.js
// うさぎ（.bunnyWrap）に帽子画像を装着する
// - assets/isyou/partyhat.png を頭の上に重ねる
// - うさぎ増減に追従（MutationObserver）
// - 旅立ち演出やクリック判定を邪魔しない（pointer-events:none）

(() => {
  const HAT_SRC = "./assets/isyou/partyhat.png";
  const HAT_CLASS = "wbHat";
  const WRAP_SEL = ".bunnyWrap";

  function injectStyles() {
    if (document.getElementById("isyouStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleV1";
    s.textContent = `
/* 帽子 */
${WRAP_SEL}{ position: absolute; } /* 念のため（多くの実装がabsolute） */

${WRAP_SEL} .${HAT_CLASS}{
  position: absolute;
  left: 50%;
  top: -10px;              /* 頭の上 */
  width: 48px;             /* 帽子サイズ */
  height: 48px;
  transform: translateX(-50%) rotate(-10deg);
  transform-origin: 50% 90%;
  pointer-events: none;    /* クリック/旅立ちモードの邪魔をしない */
  user-select: none;
  z-index: 10;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.20));
}

/* うさぎのサイズが大きい場合は帽子も少し大きく（必要なら） */
${WRAP_SEL}.bigBunny .${HAT_CLASS}{
  width: 58px;
  height: 58px;
  top: -14px;
}

/* 旅立ち演出中でも帽子は一緒に消える */
${WRAP_SEL}.departing .${HAT_CLASS}{
  opacity: 1;
}
`;
    document.head.appendChild(s);
  }

  function ensureHat(wrap) {
    if (!wrap || !wrap.classList || !wrap.matches?.(WRAP_SEL)) return;

    // 既に付いてるなら何もしない
    if (wrap.querySelector(`.${HAT_CLASS}`)) return;

    const img = document.createElement("img");
    img.className = HAT_CLASS;
    img.src = HAT_SRC;
    img.alt = "hat";
    img.decoding = "async";
    img.loading = "eager";

    // DOMの最後に追加（うさぎ画像の上に乗る）
    wrap.appendChild(img);
  }

  function applyAll() {
    document.querySelectorAll(WRAP_SEL).forEach(ensureHat);
  }

  function observe() {
    const layer =
      document.getElementById("bunnyLayer") ||
      document.getElementById("field") ||
      document.body;

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // 追加ノードだけ見る
        m.addedNodes?.forEach?.((n) => {
          if (!(n instanceof HTMLElement)) return;

          if (n.matches?.(WRAP_SEL)) ensureHat(n);
          // 子孫に .bunnyWrap が含まれる場合
          n.querySelectorAll?.(WRAP_SEL).forEach(ensureHat);
        });
      }
    });

    mo.observe(layer, { childList: true, subtree: true });
  }

  window.addEventListener("load", () => {
    injectStyles();
    applyAll();
    observe();
  });
})();
