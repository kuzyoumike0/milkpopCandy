// gameMenu.js（非module）
// ✅ 右上にハンバーガーメニュー1個だけ作る
// ✅ メニュー項目：🎀お洒落 / 📖図鑑 / 🎵BGM / 🛍️ショップ
// ✅ それぞれ：ISYOU.openModal / WB.zukan.open / WB.bgm.openModal / shop（WB.shop.open or #shopBtn.click）
// ✅ 他スクリプトより先に読み込まれてもOK（呼び出しはクリック時）
// ✅ 外側クリックで閉じる
// ✅ HUDから消しても動くように「shopBtnが無くてもWB.shop.open/SHOP.open」を優先

(() => {
  "use strict";

  const UI = {
    btn: "gameHamburgerV1",
    panel: "gameMenuPanelV1",
    style: "gameMenuStyleV1",
  };

  const $ = (q, p = document) => p.querySelector(q);

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
  width:min(260px, 92vw);
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
          <button class="item" type="button" data-act="isyou">🎀 お洒落</button>
          <button class="item" type="button" data-act="zukan">📖 図鑑</button>
          <button class="item" type="button" data-act="bgm">🎵 BGM</button>
          <button class="item" type="button" data-act="shop">🛍️ ショップ</button>
        </div>
        <div class="note">
          ※ 画面クリックで音が解放されます（BGMは一度クリックが必要）
        </div>
      `;
      document.body.appendChild(panel);
    }

    return { btn, panel };
  }

  function closePanel(panel) {
    panel.style.display = "none";
  }
  function togglePanel(panel) {
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  }

  function safeCall(fn, retryMs = 140) {
    try { fn(); return; } catch {}
    setTimeout(() => { try { fn(); } catch {} }, retryMs);
  }

  // ✅ shop.js を「#shopBtn専用」にしていても開けるように
  // 優先順位：
  // 1) window.SHOP.open()（もし用意しているなら）
  // 2) window.WB.shop.open()
  // 3) #shopBtn.click()（DOMが残っていれば）
  function openShop() {
    safeCall(() => {
      if (window.SHOP?.open) return window.SHOP.open();
      if (window.WB?.shop?.open) return window.WB.shop.open();

      const btn = document.getElementById("shopBtn");
      if (btn) btn.click();
    });
  }

  function handleAction(act) {
    if (act === "isyou") {
      safeCall(() => window.ISYOU?.openModal?.());
      return;
    }
    if (act === "zukan") {
      safeCall(() => window.WB?.zukan?.open?.("bunny"));
      return;
    }
    if (act === "bgm") {
      // ✅ BGM.js（モーダル版）で openModal を提供
      safeCall(() => window.WB?.bgm?.openModal?.());

      // 互換：もし openModal が無い旧版なら mountUI を呼ぶ
      setTimeout(() => {
        if (window.WB?.bgm?.openModal) return;
        try { window.WB?.bgm?.mountUI?.({ position: "top-right", title: "BGM" }); } catch {}
      }, 0);
      return;
    }
    if (act === "shop") {
      openShop();
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

    // 外側クリックで閉じる
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
