// gameMenu.js（パッチ例）
// ✅ 右上ハンバーガーに「図鑑」「お洒落」などを追加して、既存ボタンの click() や API を呼ぶ
// ✅ HUDに残すのは「お迎え」「花火」だけ（他はここから起動）

(() => {
  "use strict";

  const MENU_BTN_ID = "gameMenuBtn";
  const MENU_PANEL_ID = "gameMenuPanel";

  const $ = (q, p = document) => p.querySelector(q);

  function ensureStyleOnce() {
    if (document.getElementById("gameMenuStyleV1")) return;
    const s = document.createElement("style");
    s.id = "gameMenuStyleV1";
    s.textContent = `
#${MENU_BTN_ID}{
  position: fixed; right: 10px; top: 10px;
  z-index: 2147483005;
  width: 44px; height: 44px;
  border: none; border-radius: 14px;
  background: rgba(255,255,255,.95);
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
  cursor: pointer;
  display:flex; align-items:center; justify-content:center;
}
#${MENU_BTN_ID} .bars{ width:18px;height:14px; position:relative; }
#${MENU_BTN_ID} .bars i{
  position:absolute; left:0; right:0; height:2px; border-radius:2px; background:#333;
}
#${MENU_BTN_ID} .bars i:nth-child(1){ top:0; }
#${MENU_BTN_ID} .bars i:nth-child(2){ top:6px; }
#${MENU_BTN_ID} .bars i:nth-child(3){ top:12px; }

#${MENU_PANEL_ID}{
  position: fixed; right: 10px; top: 62px;
  z-index: 2147483006;
  width: min(260px, 92vw);
  background: rgba(255,255,255,.98);
  border-radius: 16px;
  box-shadow: 0 18px 44px rgba(0,0,0,.22);
  padding: 10px;
  display:none;
}
#${MENU_PANEL_ID} .item{
  width:100%;
  border:none;
  border-radius: 14px;
  padding: 12px 12px;
  font-weight: 1000;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 24px rgba(0,0,0,.08);
  display:flex; align-items:center; justify-content:space-between;
  margin: 8px 0;
}
#${MENU_PANEL_ID} .item.primary{ background:#ffd6e7; box-shadow:none; }
#${MENU_PANEL_ID} .item small{ opacity:.7; font-weight:900; }
`;
    document.head.appendChild(s);
  }

  function hideHudButtonsExceptKeep() {
    // HUDに残すID（お迎え・花火）
    const keep = new Set(["omukaeBtn", "hanabiBtn"]);
    const hudButtons = document.getElementById("hudButtons");
    if (!hudButtons) return;

    Array.from(hudButtons.querySelectorAll("button")).forEach((b) => {
      if (!b?.id) return;
      if (keep.has(b.id)) return;
      b.style.display = "none";
    });
  }

  function togglePanel(panel) {
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  }

  function closePanel(panel) {
    panel.style.display = "none";
  }

  function safeClick(id) {
    const el = document.getElementById(id);
    if (el) el.click();
  }

  function ensureUI() {
    ensureStyleOnce();

    if (!document.getElementById(MENU_BTN_ID)) {
      const btn = document.createElement("button");
      btn.id = MENU_BTN_ID;
      btn.type = "button";
      btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
      btn.title = "メニュー";
      document.body.appendChild(btn);
    }

    if (!document.getElementById(MENU_PANEL_ID)) {
      const panel = document.createElement("div");
      panel.id = MENU_PANEL_ID;
      document.body.appendChild(panel);
    }

    const btn = document.getElementById(MENU_BTN_ID);
    const panel = document.getElementById(MENU_PANEL_ID);

    // メニュー項目（ここに「図鑑」「お洒落」追加）
    panel.innerHTML = `
      <button class="item primary" type="button" data-act="shop">🛍️ ショップ <small>（shop.js）</small></button>
      <button class="item" type="button" data-act="slot">🎰 スロット</button>
      <button class="item" type="button" data-act="depart">✈️ 旅立ち</button>
      <button class="item" type="button" data-act="reset">♻️ リセット</button>

      <button class="item" type="button" data-act="zukan">📖 図鑑</button>
      <button class="item" type="button" data-act="isyou">🎀 お洒落</button>
    `;

    btn.onclick = () => togglePanel(panel);

    panel.querySelectorAll("[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.getAttribute("data-act");
        closePanel(panel);

        // クリックで音解放（BGM/SE対策）
        try { window.WB?.unlockAudioOnce?.(); } catch {}

        if (act === "shop")   return safeClick("shopBtn");   // shop.js 側のボタン挙動
        if (act === "slot")   return safeClick("slotBtn");
        if (act === "depart") return safeClick("departBtn");
        if (act === "reset")  return safeClick("resetBtn");

        // ✅ 追加：図鑑（zukan.js）
        if (act === "zukan") {
          try { window.WB?.zukan?.open?.("bunny"); return; } catch {}
          // まだロード前なら遅延で再挑戦
          setTimeout(() => { try { window.WB?.zukan?.open?.("bunny"); } catch {} }, 120);
          return;
        }

        // ✅ 追加：お洒落（isyou.js）
        if (act === "isyou") {
          try { window.ISYOU?.openModal?.(); return; } catch {}
          setTimeout(() => { try { window.ISYOU?.openModal?.(); } catch {} }, 120);
          return;
        }
      });
    });

    // 外側クリックで閉じる
    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel(panel);
    });

    hideHudButtonsExceptKeep();
  }

  window.addEventListener("load", ensureUI);
})();
