// tabidati.js（v13.2：旅立ちモード可視化 強化版）
// ✅ 旅立ちモードON/OFFが一目で分かる：ボタンON + 画面上ヒント帯
// ✅ 旅立ちモード中：全うさぎ常時「赤枠」＋ホバーでさらに強調
// ✅ クリックで旅立たせる（capture）
// ✅ 既存HUDの #departBtn を優先して使う（＝二重生成しない）
// ✅ app.js(ui:depart) でも反応

(() => {
  "use strict";
  if (!window.WB) return;
  const WB = window.WB;

  const DEFAULT_COST = 2000;
  const getCost = () => (Number.isFinite(WB.DEPART_COST) ? WB.DEPART_COST : DEFAULT_COST);

  let departMode = false;
  let clampTimer = null;

  const BTN_ID = "departBtnV1";
  const LEGACY_BTN_ID = "departBtn";
  const BANNER_ID = "departModeBannerV1";

  /* =========================
   * Helpers（WB互換）
   * ========================= */
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

  /* =========================
   * Styles
   * ========================= */
  function ensureStyles() {
    if (document.getElementById("tabidatiStyleV132")) return;
    const s = document.createElement("style");
    s.id = "tabidatiStyleV132";
    s.textContent = `
/* ===== toast ===== */
.tabidatiToast{
  position: fixed;
  left: 50%;
  top: 10%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(0,0,0,.78);
  color: #fff;
  border-radius: 16px;
  padding: 10px 14px;
  font-weight: 900;
  box-shadow: 0 18px 50px rgba(0,0,0,.26);
  max-width: min(92vw, 520px);
  text-align: center;
  letter-spacing: .02em;
  opacity: 0;
  animation: tabToastIn .18s ease-out forwards, tabToastOut .28s ease-in forwards;
  animation-delay: 0ms, 1.25s;
  white-space: pre-line;
}
@keyframes tabToastIn{
  from { opacity:0; transform:translate(-50%,-80%); }
  to   { opacity:1; transform:translate(-50%,-50%); }
}
@keyframes tabToastOut{
  from { opacity:1; transform:translate(-50%,-50%); }
  to   { opacity:0; transform:translate(-50%,-30%); }
}

/* ===== depart mode banner ===== */
#${BANNER_ID}{
  position: fixed;
  left: 50%;
  top: calc(8px + 44px); /* HUDの下あたり */
  transform: translateX(-50%);
  z-index: 2147483647;
  background: rgba(255, 56, 56, .92);
  color: #fff;
  padding: 8px 12px;
  border-radius: 14px;
  font-weight: 1000;
  letter-spacing: .02em;
  box-shadow: 0 18px 55px rgba(255,56,56,.26);
  max-width: min(720px, 92vw);
  display: none;
  pointer-events: none;
}

/* ===== ON表示（ボタン） ===== */
#${LEGACY_BTN_ID}.on, #${BTN_ID}.on{
  background: rgba(255, 64, 64, .12) !important;
  outline: 3px solid rgba(255,64,64,.70) !important;
  outline-offset: 2px;
  box-shadow: 0 12px 30px rgba(255,64,64,.22);
}

/* ===== 旅立ちモード：全うさぎ常時 赤枠 ===== */
body.departModeOn .bunnyWrap{
  outline: 4px solid rgba(255, 64, 64, .72);
  outline-offset: 3px;
  border-radius: 18px;
}
body.departModeOn .bunnyWrap:hover{
  outline: 5px solid rgba(255, 64, 64, .98);
  box-shadow: 0 0 0 6px rgba(255,64,64,.14);
}

/* departing演出 */
.bunnyWrap.departing{
  pointer-events: none !important;
  filter: saturate(1.05);
  transition: transform 520ms ease, opacity 520ms ease, filter 520ms ease;
  transform: translateY(-18px) scale(0.98);
  opacity: 0;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Toast
   * ========================= */
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

  /* =========================
   * Banner
   * ========================= */
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

  /* =========================
   * HUD Button（既存 #departBtn を優先）
   * ========================= */
  function ensureDepartBtn() {
    ensureStyles();

    const legacy = document.getElementById(LEGACY_BTN_ID);
    if (legacy) {
      if (!legacy.__tabidatiBoundV132) {
        legacy.__tabidatiBoundV132 = true;
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

  /* =========================
   * Mode
   * ========================= */
  function setDepartMode(on) {
    departMode = !!on;

    updateBtnUI();
    try { document.body.classList.toggle("departModeOn", departMode); } catch {}
    setBannerVisible(departMode);

    if (departMode) startClamp();
    else stopClamp();

    toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggleDepartMode() {
    setDepartMode(!departMode);
  }

  /* =========================
   * Clamp（軽め）
   * ========================= */
  function startClamp() {
    stopClamp();
    const layer = document.getElementById("bunnyLayer") || document.getElementById("field");
    if (!layer) return;

    clampTimer = setInterval(() => {
      if (!departMode) return;
      const ar = layer.getBoundingClientRect();
      if (!ar.width || !ar.height) return;
      // transform運用のため、ここでは何もしない（暴走防止だけ）
    }, 140);
  }

  function stopClamp() {
    if (clampTimer) {
      clearInterval(clampTimer);
      clampTimer = null;
    }
  }

  /* =========================
   * Depart core
   * ========================= */
  async function departBunny(bunny) {
    if (!bunny) return false;

    const list = getBunnyList();
    if (list.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }

    const cost = getCost();
    if (getCoins() < cost) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }
    if (!spendCoins(cost)) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }

    try { if (WB.playSE && WB.seTabidati) WB.playSE(WB.seTabidati); } catch {}

    try { WB.recordFarewell?.(bunny.kind || bunny.adultSrc || ""); } catch {}
    try { WB.showFarewellMessage?.(bunny.kind || ""); } catch {}

    // hart消し
    try { bunny.hideHeart?.(); } catch {}
    try { bunny.hartEl?.remove?.(); } catch {}
    try { bunny.wrap?.querySelector?.(".wbChargeHart")?.remove?.(); } catch {}

    // アニメ
    const w = bunny.wrap;
    try {
      if (w) {
        w.classList.add("departing");
        await new Promise((r) => setTimeout(r, 520));
      }
    } catch {}

    // remove
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

    try { WB.checkUnlocks?.(); } catch {}

    try { window.SYOUGOU?.add?.("tabidachi", 1); } catch {}
    try { WB.emit?.("tabidachi"); } catch {}
    try { window.dispatchEvent(new CustomEvent("wb:tabidachi")); } catch {}

    return true;
  }

  /* =========================
   * Click to depart（capture）
   * ========================= */
  function onPointerDownCapture(e) {
    if (!departMode) return;
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const list = getBunnyList();
    const bunny = list.find((b) => b && b.wrap === wrap);
    if (!bunny) return;

    departBunny(bunny);
  }

  /* =========================
   * Bind
   * ========================= */
  ensureDepartBtn();
  ensureBanner();
  setBannerVisible(false);

  // WB.departBtn 互換
  if (WB.departBtn && !WB.departBtn.__tabidatiBoundV132) {
    WB.departBtn.__tabidatiBoundV132 = true;
    WB.departBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDepartMode();
    }, { passive: false });
  }

  // app.js emit("ui:depart") 互換
  try {
    if (typeof WB.on === "function" && !WB.__tabidatiUiDepartBoundV132) {
      WB.__tabidatiUiDepartBoundV132 = true;
      WB.on("ui:depart", () => {
        try { WB.unlockAudioOnce?.(); } catch {}
        toggleDepartMode();
      });
    }
  } catch {}

  document.addEventListener("pointerdown", onPointerDownCapture, true);

  /* =========================
   * Public
   * ========================= */
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
    btnId: (document.getElementById(LEGACY_BTN_ID) ? LEGACY_BTN_ID : BTN_ID),
  };

  console.log("[tabidati] ready v13.2 (depart mode visual enhanced)", {
    using: (document.getElementById(LEGACY_BTN_ID) ? LEGACY_BTN_ID : BTN_ID),
  });
})();
