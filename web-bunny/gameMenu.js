// gameMenu.js — 右上ハンバーガーメニュー
// ✅ HUDのボタンは「お迎え(omukae)」「花火(hanabi)」だけ残す
// ✅ それ以外の既存ボタンは非表示にして、メニューから click() で呼ぶ
// ✅ 「お洒落」→ window.ISYOU.openModal()
// ✅ 「BGM」→ window.BGM.open()（BGM.jsをモーダル化した前提）

(() => {
  "use strict";

  const MENU = {
    btnId: "gameHamburgerBtnV1",
    panelId: "gameHamburgerPanelV1",
    styleId: "gameHamburgerStyleV1",
  };

  const KEEP_VISIBLE = new Set(["omukaeBtn", "hanabiBtn"]); // ここだけHUDに残す
  const HIDE_IDS = [
    "shopBtn",
    "slotBtn",
    "departBtn",
    "resetBtn",
    // もし他にもHUDにボタンがあるならここに追加
    // "zukanBtn", "zissekiBtn" ...
  ];

  const $ = (q, p = document) => p.querySelector(q);

  function ensureStyle() {
    if (document.getElementById(MENU.styleId)) return;
    const s = document.createElement("style");
    s.id = MENU.styleId;
    s.textContent = `
#${MENU.btnId}{
  position:fixed;
  top:10px; right:10px;
  width:46px; height:46px;
  border:none; border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  z-index:2147483005;
  display:flex; align-items:center; justify-content:center;
}
#${MENU.btnId} .bars{ width:18px; height:14px; position:relative; }
#${MENU.btnId} .bars i{
  position:absolute; left:0; right:0; height:2px; border-radius:2px; background:#333;
}
#${MENU.btnId} .bars i:nth-child(1){ top:0; }
#${MENU.btnId} .bars i:nth-child(2){ top:6px; }
#${MENU.btnId} .bars i:nth-child(3){ top:12px; }

#${MENU.panelId}{
  position:fixed;
  top:62px; right:10px;
  width:min(320px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px;
  z-index:2147483006;
  display:none;
}
#${MENU.panelId} .head{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; margin-bottom:10px;
}
#${MENU.panelId} .ttl{ font-weight:1000; }
#${MENU.panelId} .close{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:1000;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
  cursor:pointer;
}
#${MENU.panelId} .list{ display:flex; flex-direction:column; gap:8px; }
#${MENU.panelId} .item{
  border:none; border-radius:14px;
  padding:10px 12px;
  background:rgba(0,0,0,.03);
  font-weight:1000;
  text-align:left;
  cursor:pointer;
}
#${MENU.panelId} .item:hover{ background:rgba(0,0,0,.06); }
#${MENU.panelId} .mini{
  font-size:12px; opacity:.75; font-weight:900;
  margin-top:8px;
}
`;
    document.head.appendChild(s);
  }

  function hideHudButtons() {
    // hudButtons内の「残したいボタン」以外を非表示にする（存在すれば）
    const box = document.getElementById("hudButtons");
    if (!box) return;

    // ID指定で非表示
    for (const id of HIDE_IDS) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }

    // 念のため：hudButtons直下のbuttonも走査して残すもの以外を非表示
    box.querySelectorAll("button").forEach((b) => {
      const id = b.id || "";
      if (!id) return;
      if (KEEP_VISIBLE.has(id)) return;
      // isyou.js等が作ったボタンも消したいならここで消せる
      b.style.display = "none";
    });
  }

  function clickById(id) {
    const el = document.getElementById(id);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  function openMenu() {
    const panel = document.getElementById(MENU.panelId);
    if (panel) panel.style.display = "block";
  }
  function closeMenu() {
    const panel = document.getElementById(MENU.panelId);
    if (panel) panel.style.display = "none";
  }
  function toggleMenu() {
    const panel = document.getElementById(MENU.panelId);
    if (!panel) return;
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  }

  function ensureUI() {
    ensureStyle();

    // 既存あれば作り直さない
    if (!document.getElementById(MENU.btnId)) {
      const btn = document.createElement("button");
      btn.id = MENU.btnId;
      btn.type = "button";
      btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
      btn.title = "メニュー";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleMenu();
      });
      document.body.appendChild(btn);
    }

    if (!document.getElementById(MENU.panelId)) {
      const panel = document.createElement("div");
      panel.id = MENU.panelId;
      panel.innerHTML = `
        <div class="head">
          <div class="ttl">🍬 メニュー</div>
          <button class="close" type="button" id="gameMenuCloseBtnV1">×</button>
        </div>
        <div class="list">
          <button class="item" type="button" data-act="shop">🛍️ ショップ</button>
          <button class="item" type="button" data-act="slot">🎰 スロット</button>
          <button class="item" type="button" data-act="depart">🧳 旅立ち</button>
          <button class="item" type="button" data-act="reset">♻️ リセット</button>

          <button class="item" type="button" data-act="isyou">🎀 お洒落</button>
          <button class="item" type="button" data-act="bgm">🎵 BGM</button>
        </div>
        <div class="mini">※ お迎え/花火は左側のボタンのままです</div>
      `;
      document.body.appendChild(panel);

      panel.querySelector("#gameMenuCloseBtnV1")?.addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
      });

      panel.querySelectorAll("[data-act]").forEach((b) => {
        b.addEventListener("click", () => {
          const act = b.getAttribute("data-act");
          // 実行後は閉じる（好みで）
          closeMenu();

          if (act === "shop")   return clickById("shopBtn");
          if (act === "slot")   return clickById("slotBtn");
          if (act === "depart") return clickById("departBtn");
          if (act === "reset")  return clickById("resetBtn");

          if (act === "isyou") {
            try { window.ISYOU?.openModal?.(); } catch {}
            return;
          }
          if (act === "bgm") {
            try { window.BGM?.open?.(); } catch {}
            return;
          }
        });
      });

      // 外側クリックで閉じる
      document.addEventListener("pointerdown", (e) => {
        const panelEl = document.getElementById(MENU.panelId);
        const btnEl = document.getElementById(MENU.btnId);
        if (!panelEl || panelEl.style.display !== "block") return;
        if (panelEl.contains(e.target) || btnEl?.contains(e.target)) return;
        closeMenu();
      });
    }
  }

  function boot() {
    ensureUI();
    hideHudButtons();

    // ボタンが後から出る場合にも対応（念のため）
    setTimeout(hideHudButtons, 300);
    setTimeout(hideHudButtons, 900);
    setTimeout(hideHudButtons, 1600);
  }

  window.addEventListener("load", boot);

  // デバッグ用
  window.GAMEMENU = { open: openMenu, close: closeMenu, refreshHide: hideHudButtons };
})();
