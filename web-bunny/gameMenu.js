// gameMenu.js（非module）
// ✅ 右上にハンバーガーメニュー1個だけ作る
// ✅ メニュー項目：🛒ショップ / 🎀お洒落 / 🧸アイテム配置 / 📖図鑑 / 🎵BGM
// ✅ 呼び出し：
//   - shop     : WB.shop.open()
//   - isyou    : ISYOU.openModal()
//   - itemplace: ITEMPLACE.open()   ← ★ここ重要（openModalじゃない）
//   - zukan    : WB.zukan.open("bunny")
//   - bgm      : WB.bgm.openModal()
// ✅ 外側クリックで閉じる

(() => {
  "use strict";

  const UI = {
    btn: "gameHamburgerV1",
    panel: "gameMenuPanelV1",
    style: "gameMenuStyleV1",
  };

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const s = document.createElement("style");
    s.id = UI.style;
    s.textContent = `
#${UI.btn}{
  position:fixed; top:10px; right:10px;
  z-index:2147483100;
  width:44px; height:44px;
  border:none; border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex; align-items:center; justify-content:center;
}
#${UI.btn} .bars{ width:18px; height:14px; position:relative; }
#${UI.btn} .bars i{
  position:absolute; left:0; right:0; height:2px;
  border-radius:2px; background:#333;
}
#${UI.btn} .bars i:nth-child(1){ top:0; }
#${UI.btn} .bars i:nth-child(2){ top:6px; }
#${UI.btn} .bars i:nth-child(3){ top:12px; }

#${UI.panel}{
  position:fixed; top:62px; right:10px;
  z-index:2147483101;
  width:min(280px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:10px;
  display:none;
}
#${UI.panel} .ttl{
  font-weight:1000; letter-spacing:.02em;
  padding:6px 8px 10px;
}
#${UI.panel} .list{
  display:flex; flex-direction:column; gap:8px;
}
#${UI.panel} .item{
  border:none; border-radius:14px;
  padding:10px 12px;
  font-weight:1000;
  background:rgba(0,0,0,.04);
  cursor:pointer;
  text-align:left;
}
#${UI.panel} .item:hover{ background:rgba(0,0,0,.06); }
#${UI.panel} .note{
  margin-top:8px;
  font-size:12px;
  opacity:.75;
  padding:6px 8px 2px;
  line-height:1.35;
}
`;
    document.head.appendChild(s);
  }

  function ensureUI() {
    ensureStyle();

    let btn = document.getElementById(UI.btn);
    let panel = document.getElementById(UI.panel);

    if (!btn) {
      btn = document.createElement("button");
      btn.id = UI.btn;
      btn.type = "button";
      btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
      btn.title = "メニュー";
      document.body.appendChild(btn);
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.id = UI.panel;
      panel.innerHTML = `
        <div class="ttl">🐰 Milkpop メニュー</div>
        <div class="list">
          <button class="item" type="button" data-act="shop">🛒 ショップ</button>
          <button class="item" type="button" data-act="isyou">🎀 お洒落</button>
          <button class="item" type="button" data-act="itemplace">🧸 アイテム配置</button>
          <button class="item" type="button" data-act="zukan">📖 図鑑</button>
          <button class="item" type="button" data-act="bgm">🎵 BGM</button>
        </div>
        <div class="note">
          ※ BGMは一度クリックが必要です。<br>
          ※ アイテム配置：選んだアイテムが透明赤枠で出ます → 置きたい場所をクリックで確定。
        </div>
      `;
      document.body.appendChild(panel);
    }

    return { btn, panel };
  }

  function closePanel(panel) { panel.style.display = "none"; }
  function togglePanel(panel) {
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  }

  function safeCall(fn, retryMs = 140) {
    try { fn(); return; } catch {}
    setTimeout(() => { try { fn(); } catch {} }, retryMs);
  }

  function handleAction(act) {
    if (act === "shop") {
      safeCall(() => window.WB?.shop?.open?.());
      return;
    }
    if (act === "isyou") {
      safeCall(() => window.ISYOU?.openModal?.());
      return;
    }
    if (act === "itemplace") {
      // ✅ 正：ITEMPLACE.open()
      safeCall(() => window.ITEMPLACE?.open?.());

      // 互換：もし openModal を持つ版が来てもOK
      setTimeout(() => {
        if (window.ITEMPLACE?.open) return;
        try { window.ITEMPLACE?.openModal?.(); } catch {}
      }, 0);

      // 互換：WBに生えてる場合
      setTimeout(() => {
        try { window.WB?.itemplace?.open?.(); } catch {}
        try { window.WB?.itemplace?.openModal?.(); } catch {}
      }, 0);
      return;
    }
    if (act === "zukan") {
      safeCall(() => window.WB?.zukan?.open?.("bunny"));
      return;
    }
    if (act === "bgm") {
      safeCall(() => window.WB?.bgm?.openModal?.());
      setTimeout(() => {
        if (window.WB?.bgm?.openModal) return;
        try { window.WB?.bgm?.mountUI?.({ position: "top-right", title: "BGM" }); } catch {}
      }, 0);
      return;
    }
  }

  function boot() {
    const { btn, panel } = ensureUI();

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(panel);
    });

    panel.addEventListener("click", (e) => {
      const b = e.target?.closest?.("[data-act]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      closePanel(panel);
      handleAction(b.getAttribute("data-act"));
    });

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel(panel);
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
