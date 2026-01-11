// tabidati.js（v13.4：✅WB待機で早期return根絶 + #departBtn優先 + ui:depart対応 + クリックで旅立ち）
(() => {
  "use strict";

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found"));
        }
      }, TICK_MS);
    });
  }

  waitForWB().then((WB) => {
    const DEFAULT_COST = 2000;
    const getCost = () => (Number.isFinite(WB.DEPART_COST) ? WB.DEPART_COST : DEFAULT_COST);

    let departMode = false;

    const BTN_ID = "departBtnV1";
    const LEGACY_BTN_ID = "departBtn";
    const BANNER_ID = "departModeBannerV1";

    function getBunnyList() {
      if (typeof WB.getBunnies === "function") return WB.getBunnies();
      if (Array.isArray(WB.bunnies)) return WB.bunnies;
      return [];
    }

    function getCoins() {
      if (typeof WB.getCoin === "function") return WB.getCoin();
      if (typeof WB.coins === "number") return WB.coins;
      return 0;
    }

    function spendCoins(amount) {
      if (typeof WB.spendCoin === "function") return WB.spendCoin(amount);
      if (typeof WB.coins === "number") {
        if (WB.coins < amount) return false;
        WB.coins -= amount;
        WB.saveCoins?.();
        WB.updateHud?.();
        return true;
      }
      return false;
    }

    function ensureStyles() {
      if (document.getElementById("tabidatiStyleV134")) return;
      const s = document.createElement("style");
      s.id = "tabidatiStyleV134";
      s.textContent = `
.tabidatiToast{
  position: fixed; left: 50%; top: 10%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(0,0,0,.78); color:#fff;
  border-radius: 16px; padding: 10px 14px;
  font-weight: 900; box-shadow: 0 18px 50px rgba(0,0,0,.26);
  max-width: min(92vw, 520px); text-align:center;
  opacity:0;
  animation: tabToastIn .18s ease-out forwards, tabToastOut .28s ease-in forwards;
  animation-delay: 0ms, 1.25s;
  white-space: pre-line;
}
@keyframes tabToastIn{ from{opacity:0; transform:translate(-50%,-80%);} to{opacity:1; transform:translate(-50%,-50%);} }
@keyframes tabToastOut{ from{opacity:1; transform:translate(-50%,-50%);} to{opacity:0; transform:translate(-50%,-30%);} }

#${BANNER_ID}{
  position: fixed;
  left: 50%;
  top: calc(8px + 44px);
  transform: translateX(-50%);
  z-index: 2147483647;
  background: rgba(255, 56, 56, .92);
  color: #fff;
  padding: 8px 12px;
  border-radius: 14px;
  font-weight: 1000;
  box-shadow: 0 18px 55px rgba(255,56,56,.26);
  max-width: min(720px, 92vw);
  display: none;
  pointer-events: none;
}

#${LEGACY_BTN_ID}.on, #${BTN_ID}.on{
  background: rgba(255, 64, 64, .12) !important;
  outline: 3px solid rgba(255,64,64,.72) !important;
  outline-offset: 2px;
  box-shadow: 0 10px 26px rgba(255,64,64,.18);
}

body.departModeOn .bunnyWrap{ outline:none; }
body.departModeOn .bunnyWrap:hover{
  outline: 5px solid rgba(255, 64, 64, .95);
  outline-offset: 3px;
  border-radius: 18px;
  box-shadow: 0 0 0 6px rgba(255,64,64,.14);
}
body.departModeOn .bunnyWrap.departTarget{
  outline: 5px solid rgba(255, 64, 64, .98);
  outline-offset: 3px;
  border-radius: 18px;
  box-shadow: 0 0 0 6px rgba(255,64,64,.16);
}
.bunnyWrap.departing{
  pointer-events:none !important;
  transition: transform 520ms ease, opacity 520ms ease, filter 520ms ease;
  transform: translateY(-18px) scale(0.98);
  opacity: 0;
}
`;
      document.head.appendChild(s);
    }

    function toast(msg) {
      ensureStyles();
      const text = String(msg ?? "").trim();
      if (!text) return;
      const el = document.createElement("div");
      el.className = "tabidatiToast";
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, 1800);
    }

    function ensureBanner() {
      ensureStyles();
      let el = document.getElementById(BANNER_ID);
      if (el) return el;
      el = document.createElement("div");
      el.id = BANNER_ID;
      el.textContent = "✈️ 旅立ちモード：うさぎをクリックで旅立ち（もう一度押すとOFF）";
      document.body.appendChild(el);
      return el;
    }

    function setBannerVisible(on) {
      const el = ensureBanner();
      el.style.display = on ? "block" : "none";
    }

    function ensureDepartBtn() {
      ensureStyles();

      const legacy = document.getElementById(LEGACY_BTN_ID);
      if (legacy) {
        if (!legacy.__tabidatiBoundV134) {
          legacy.__tabidatiBoundV134 = true;
          legacy.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { WB.unlockAudioOnce?.(); } catch {}
            toggleDepartMode();
          }, { passive: false });
        }
        return legacy;
      }

      let btn = document.getElementById(BTN_ID);
      if (btn) return btn;

      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.textContent = "旅立ち";

      const hudButtons = document.getElementById("hudButtons");
      const hud = document.getElementById("hud") || document.body;
      if (hudButtons) hudButtons.appendChild(btn);
      else hud.appendChild(btn);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { WB.unlockAudioOnce?.(); } catch {}
        toggleDepartMode();
      }, { passive: false });

      return btn;
    }

    function updateBtnUI() {
      try { document.getElementById(LEGACY_BTN_ID)?.classList.toggle("on", departMode); } catch {}
      try { document.getElementById(BTN_ID)?.classList.toggle("on", departMode); } catch {}
      try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
    }

    function clearTargets() {
      try { document.querySelectorAll(".bunnyWrap.departTarget").forEach(el => el.classList.remove("departTarget")); } catch {}
    }

    function setDepartMode(on) {
      departMode = !!on;
      updateBtnUI();
      try { document.body.classList.toggle("departModeOn", departMode); } catch {}
      setBannerVisible(departMode);
      if (!departMode) clearTargets();
      toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
    }

    function toggleDepartMode() {
      setDepartMode(!departMode);
    }

    async function departBunny(bunny) {
      const list = getBunnyList();
      if (list.length <= 1) { toast("最後の1匹は旅立たせられないよ"); return false; }

      const cost = getCost();
      if (getCoins() < cost) { toast(`コイン不足（必要：${cost}🪙）`); return false; }
      if (!spendCoins(cost)) { toast(`コイン不足（必要：${cost}🪙）`); return false; }

      try { if (WB.playSE && WB.seTabidati) WB.playSE(WB.seTabidati); } catch {}

      try { WB.recordFarewell?.(bunny.kind || bunny.adultSrc || ""); } catch {}
      try { WB.showFarewellMessage?.(bunny.kind || ""); } catch {}

      try { bunny.hideHeart?.(); } catch {}
      try { bunny.hartEl?.remove?.(); } catch {}
      try { bunny.wrap?.querySelector?.(".wbChargeHart")?.remove?.(); } catch {}

      const w = bunny.wrap;
      try {
        w?.classList.add("departing");
        await new Promise(r => setTimeout(r, 520));
      } catch {}

      let removed = false;
      if (typeof WB.removeBunnyInstance === "function") {
        try { removed = !!WB.removeBunnyInstance(bunny); } catch { removed = false; }
      }
      if (!removed) {
        const idx = list.indexOf(bunny);
        if (idx >= 0) list.splice(idx, 1);
        try { w?.remove?.(); } catch {}
        try { WB.saveBunnyMeta?.(); } catch {}
        try { WB.emit?.("bunnyCountChanged", { count: list.length }); } catch {}
      }

      try { window.SYOUGOU?.add?.("tabidachi", 1); } catch {}
      try { WB.emit?.("tabidachi"); } catch {}

      return true;
    }

    function onPointerDownCapture(e) {
      if (!departMode) return;
      if (e.button != null && e.button !== 0) return;

      const wrap = e.target?.closest?.(".bunnyWrap");
      if (!wrap) return;

      clearTargets();
      wrap.classList.add("departTarget");

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      const list = getBunnyList();
      const bunny = list.find(b => b && b.wrap === wrap);
      if (!bunny) return;

      departBunny(bunny);
    }

    // bind
    ensureDepartBtn();
    ensureBanner();
    setBannerVisible(false);

    // ui:depart (app.js) でも反応
    try {
      if (typeof WB.on === "function" && !WB.__tabidatiUiDepartBoundV134) {
        WB.__tabidatiUiDepartBoundV134 = true;
        WB.on("ui:depart", () => {
          try { WB.unlockAudioOnce?.(); } catch {}
          toggleDepartMode();
        });
      }
    } catch {}

    document.addEventListener("pointerdown", onPointerDownCapture, true);

    WB.tabidati = { setDepartMode, toggleDepartMode, departBunny, get departMode(){ return departMode; } };

    console.log("[tabidati] ready v13.4", { departBtn: !!document.getElementById("departBtn") });
  }).catch((e) => {
    console.warn("[tabidati] WB wait failed:", e?.message || e);
  });
})();
