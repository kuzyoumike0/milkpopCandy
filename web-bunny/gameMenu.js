// gameMenu.js（非module）V2.9.1
// ✅ zukan.js を best-effort で確実に開く（WB.zukan / ZUKAN / 旧ボタン / emit）

(() => {
  "use strict";

  const UI = {
    btn:   "gameHamburgerV1",
    panel: "gameMenuPanelV1",
    style: "gameMenuStyleV1",
  };

  const HOLD_RESET_MS = 1500;
  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Style
   * ========================= */
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
  width:min(300px, 94vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:10px;
  display:none;
}
#${UI.panel} .ttl{ font-weight:1000; padding:6px 8px 10px; }
#${UI.panel} .list{ display:flex; flex-direction:column; gap:8px; }
#${UI.panel} .item{
  border:none; border-radius:14px;
  padding:10px 12px;
  font-weight:1000;
  background:rgba(0,0,0,.04);
  cursor:pointer;
  text-align:left;
}
#${UI.panel} .item:hover{ background:rgba(0,0,0,.06); }
#${UI.panel} .item.danger{ background:#ffe0e0; }

#${UI.panel} .hold{ position:relative; overflow:hidden; }
#${UI.panel} .hold .fill{
  position:absolute; inset:0;
  width:0%;
  background:rgba(0,0,0,.08);
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * UI
   * ========================= */
  function ensureUI() {
    ensureStyle();

    let btn = document.getElementById(UI.btn);
    let panel = document.getElementById(UI.panel);

    if (!btn) {
      btn = document.createElement("button");
      btn.id = UI.btn;
      btn.innerHTML = `<span class="bars"><i></i><i></i><i></i></span>`;
      document.body.appendChild(btn);
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.id = UI.panel;
      panel.innerHTML = `
        <div class="ttl">🐰 Milkpop メニュー</div>
        <div class="list">
          <button class="item" data-act="shop">🛒 ショップ</button>
          <button class="item" data-act="itemplace">🧸 アイテム配置</button>
          <button class="item" data-act="isyou">🎀 お洒落</button>
          <button class="item" data-act="slot">🎰 スロット</button>
          <button class="item" data-act="zukan">📖 図鑑</button>
          <button class="item" data-act="bgm">🎵 BGM</button>
          <button class="item" data-act="prestige">🌟 転生</button>

          <button class="item danger hold" data-act="reset">
            🔥 牧場を完全リセット（長押し）
            <i class="fill"></i>
          </button>
        </div>
      `;
      document.body.appendChild(panel);
    }

    return { btn, panel };
  }

  /* =========================
   * Slot best effort
   * ========================= */
  function openSlotBestEffort() {
    try { if (window.WB?.slot?.open) return window.WB.slot.open(); } catch {}
    try { if (window.SLOT?.open) return window.SLOT.open(); } catch {}

    const btn = document.getElementById("slotBtn");
    if (btn) {
      try { btn.click(); return; } catch {}
      try { btn.dispatchEvent(new MouseEvent("click", { bubbles:true })); return; } catch {}
    }
    console.warn("[gameMenu] slot open failed");
  }

  /* =========================
   * 🎀 isyou best effort
   * ========================= */
  function openIsyouBestEffort() {
    try { if (window.ISYOU?.openModal) return window.ISYOU.openModal(); } catch {}
    try { if (window.WB?.isyou?.open) return window.WB.isyou.open(); } catch {}
    try { if (window.WB?.isyou?.openModal) return window.WB.isyou.openModal(); } catch {}

    const btn = document.getElementById("isyouBtn");
    if (btn) {
      try { btn.click(); return; } catch {}
      try { btn.dispatchEvent(new MouseEvent("click", { bubbles:true })); return; } catch {}
    }

    console.warn("[gameMenu] isyou open failed (ISYOU.openModal not found)");
    try { window.WB?.toast?.("お洒落がまだ読み込まれてない…！"); } catch {}
  }

  /* =========================
   * 📖 zukan best effort（ここが追加）
   * ========================= */
  function openZukanBestEffort() {
    // 1) 正規っぽいAPI
    try { if (window.WB?.zukan?.open) return window.WB.zukan.open("bunny"); } catch {}
    try { if (window.ZUKAN?.open) return window.ZUKAN.open("bunny"); } catch {}
    try { if (window.WB?.zukan?.openModal) return window.WB.zukan.openModal("bunny"); } catch {}
    try { if (window.ZUKAN?.openModal) return window.ZUKAN.openModal("bunny"); } catch {}

    // 2) event で開く実装も吸収（zukan.js が WB.on("ui:zukan") を見てる場合）
    try { window.WB?.emit?.("ui:zukan", { tab: "bunny" }); } catch {}
    try { window.WB?.emit?.("zukan:open", { tab: "bunny" }); } catch {}
    try { window.dispatchEvent(new CustomEvent("wb:zukanOpen", { detail: { tab: "bunny" } })); } catch {}

    // 3) 旧ボタンが存在するなら押す（最終手段）
    const cand =
      document.getElementById("zukanBtn") ||
      [...document.querySelectorAll("button")].find(b => (b.textContent || "").includes("図鑑"));
    if (cand) {
      try { cand.click(); return; } catch {}
      try { cand.dispatchEvent(new MouseEvent("click", { bubbles:true })); return; } catch {}
    }

    console.warn("[gameMenu] zukan open failed (no API / no button)");
    try { window.WB?.toast?.("図鑑がまだ読み込まれてない…！"); } catch {}
  }

  /* =========================
   * Actions
   * ========================= */
  function handleAction(act) {
    try {
      if (act === "shop")       return window.WB?.shop?.open?.();
      if (act === "itemplace")  return window.ITEMPLACE?.open?.();
      if (act === "isyou")      return openIsyouBestEffort();
      if (act === "slot")       return openSlotBestEffort();
      if (act === "zukan")      return openZukanBestEffort(); // ✅ ここを差し替え
      if (act === "bgm")        return window.WB?.bgm?.openModal?.();
      if (act === "prestige")   return window.WB?.prestige?.open?.();
    } catch (e) {
      console.warn("[gameMenu] action failed:", act, e);
    }
  }

  /* =========================
   * 🔥 Complete Reset
   * ========================= */
  async function completeReset() {
    try { window.WB?.emit?.("core:reset_all"); } catch {}
    try { localStorage.clear(); } catch {}

    if (indexedDB?.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    }

    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    } catch {}

    setTimeout(() => {
      location.href = location.pathname + "?reset=" + Date.now();
    }, 300);
  }

  /* =========================
   * Boot
   * ========================= */
  function boot() {
    const { btn, panel } = ensureUI();

    btn.onclick = () => {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    };

    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "reset") return;
      panel.style.display = "none";
      handleAction(act);
    });

    let holding=false, holdAt=0, raf=0;
    panel.addEventListener("pointerdown", (e) => {
      const b = e.target.closest('[data-act="reset"]');
      if (!b) return;
      holding=true; holdAt=Date.now();
      const fill=b.querySelector(".fill");

      const step=()=>{
        if(!holding) return;
        const p=Math.min(1,(Date.now()-holdAt)/HOLD_RESET_MS);
        if(fill) fill.style.width=`${p*100}%`;
        if(p>=1){ holding=false; completeReset(); return; }
        raf=requestAnimationFrame(step);
      };
      step();
    });

    ["pointerup","pointerleave","pointercancel"].forEach(ev=>{
      panel.addEventListener(ev,()=>{
        holding=false;
        panel.querySelector(".fill")?.style.setProperty("width","0%");
        if(raf) cancelAnimationFrame(raf);
      });
    });

    console.log("[gameMenu] ready v2.9.1 (+zukan best-effort)");
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
