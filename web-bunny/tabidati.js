// tabidati.js（v13.1：✅既存HUDの #departBtn を優先して使う + 二重UI根絶 + app.js(ui:depart)でも反応）
// - 旅立ちモードON/OFF
// - 旅立ち時：コスト支払い / SE / 記録 / メッセージ / うさぎ削除
// - 旅立ちモード中：うさぎホバーで赤縁取り
// - 旅立ちモード中：うさぎが画面外へ行かないよう位置クランプ（※transform運用の環境では軽め）
// - 「長い空白メッセージ」対策：専用トーストCSSで表示
// ✅ SYOUGOU.add("tabidachi") を直接呼ぶ（あれば）
// ✅ FIX: 旅立ち後に hart.png が残らない（bunny.hideHeart/hartEl/removeBunnyInstance）
// ✅ 旅立ちボタン：
//    - index.html に #departBtn があるならそれを使う（＝二重生成しない）
//    - 無い場合だけ departBtnV1 を生成（旧互換）
// ✅ app.js が emit("ui:depart") しても旅立ちモードをトグル（HUDボタンと同等）
// ✅ 既存の WB.departBtn があっても壊さない（あればそれも反応）

(() => {
  "use strict";
  if (!window.WB) return;
  const WB = window.WB;

  const DEFAULT_COST = 2000;
  const getCost = () => (Number.isFinite(WB.DEPART_COST) ? WB.DEPART_COST : DEFAULT_COST);

  let departMode = false;
  let clampTimer = null;

  // 旧版が作ってたボタンID（互換用）
  const BTN_ID = "departBtnV1";

  // ✅ index.html の既存ボタンID（あなたのHUD）
  const LEGACY_BTN_ID = "departBtn";

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
   * Toast
   * ========================= */
  function ensureToastStyles() {
    if (document.getElementById("tabidatiToastStyleV2")) return;
    const s = document.createElement("style");
    s.id = "tabidatiToastStyleV2";
    s.textContent = `
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

body.departModeOn .bunnyWrap{ outline: none; }
body.departModeOn .bunnyWrap:hover{
  outline: 4px solid rgba(255, 64, 64, .85);
  outline-offset: 3px;
  border-radius: 18px;
}

.bunnyWrap.departing{
  pointer-events: none !important;
  filter: saturate(1.05);
  transition: transform 520ms ease, opacity 520ms ease, filter 520ms ease;
  transform: translateY(-18px) scale(0.98);
  opacity: 0;
}

/* ✅ ON表示：departBtn / departBtnV1 の両方に効く */
#${LEGACY_BTN_ID}, #${BTN_ID}{
  position: relative;
}
#${LEGACY_BTN_ID}.on, #${BTN_ID}.on{
  outline: 3px solid rgba(255,64,64,.55);
  outline-offset: 2px;
  box-shadow: 0 10px 26px rgba(255,64,64,.18);
}
`;
    document.head.appendChild(s);
  }

  function toast(msg) {
    ensureToastStyles();
    const text = String(msg ?? "").trim();
    if (!text) return;
    const el = document.createElement("div");
    el.className = "tabidatiToast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 1800);
  }

  /* =========================
   * HUD Button（既存 #departBtn を優先）
   * ========================= */
  function ensureDepartBtn() {
    ensureToastStyles();

    // ✅ 1) まず index.html の departBtn を最優先で使う（＝二重生成根絶）
    const legacy = document.getElementById(LEGACY_BTN_ID);
    if (legacy) {
      if (!legacy.__tabidatiBoundV131) {
        legacy.__tabidatiBoundV131 = true;
        legacy.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          try { WB.unlockAudioOnce?.(); } catch {}
          toggleDepartMode();
        }, { passive: false });
      }
      return legacy;
    }

    // ✅ 2) 既に departBtnV1 があるならそれを使う
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;

    // ✅ 3) 無い時だけ作る（旧互換）
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
    // ✅ 既存departBtn と departBtnV1 を両方同期（存在するものだけ）
    try { document.getElementById(LEGACY_BTN_ID)?.classList.toggle("on", departMode); } catch {}
    try { document.getElementById(BTN_ID)?.classList.toggle("on", departMode); } catch {}
    // ✅ さらに WB.departBtn が別に参照を持ってる環境も同期
    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
  }

  /* =========================
   * Mode
   * ========================= */
  function setDepartMode(on) {
    departMode = !!on;

    updateBtnUI();
    try { document.body.classList.toggle("departModeOn", departMode); } catch {}

    if (departMode) startClamp();
    else stopClamp();

    toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggleDepartMode() {
    setDepartMode(!departMode);
  }

  /* =========================
   * Clamp（旅立ち中はみ出し防止）
   * ※ app.js は translate3d で動かしてるので left/top 直しは効きにくい環境がある
   *   → “暴走しない軽め”にしておく（無理に位置を書き換えない）
   * ========================= */
  function startClamp() {
    stopClamp();

    const field = document.getElementById("field");
    const layer = document.getElementById("bunnyLayer") || field;
    if (!layer) return;

    clampTimer = setInterval(() => {
      if (!departMode) return;

      const ar = layer.getBoundingClientRect();
      if (!ar.width || !ar.height) return;

      // ✅ transform運用環境では無理にleft/top触らない（ズレるだけになりがち）
      // 必要なら app.js 側に「旅立ちモード中は hardClamp 強め」みたいに寄せるのが正攻法
    }, 120);
  }

  function stopClamp() {
    if (clampTimer) {
      clearInterval(clampTimer);
      clampTimer = null;
    }
  }

  /* =========================
   * Depart core（FIX: hart残り）
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

    // ✅ 旅立ちアニメ中に hart が残らないよう、先に消す
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

    // ✅ 正攻法：WB.removeBunnyInstance を優先（wrap/hart/配列/保存/emitまで）
    let removed = false;
    if (typeof WB.removeBunnyInstance === "function") {
      try { removed = !!WB.removeBunnyInstance(bunny); } catch { removed = false; }
    }

    // フォールバック（旧環境）
    if (!removed) {
      const idx = list.indexOf(bunny);
      if (idx >= 0) list.splice(idx, 1);

      try { w?.remove?.(); } catch {}
      try { WB.saveBunnyMeta?.(); } catch {}
      try { WB.emit?.("bunnyCountChanged", { count: list.length }); } catch {}
    }

    // 他モジュール通知
    try { WB.checkUnlocks?.(); } catch {}

    // ✅ 称号カウント
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
  // ✅ ボタン準備（既存 #departBtn があるならそれにバインドされる）
  ensureDepartBtn();

  // ✅ 旧互換：WB.departBtn がどこかで設定されてる環境でも反応させる
  // （index.html の departBtn を WB.departBtn に入れてない環境があるため）
  if (WB.departBtn && !WB.departBtn.__tabidatiBoundV131) {
    WB.departBtn.__tabidatiBoundV131 = true;
    WB.departBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDepartMode();
    }, { passive: false });
  }

  // ✅ app.js の emit("ui:depart") でもトグル（HUDボタンと同じ動き）
  try {
    if (typeof WB.on === "function" && !WB.__tabidatiUiDepartBoundV131) {
      WB.__tabidatiUiDepartBoundV131 = true;
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

  console.log("[tabidati] ready v13.1 (use existing departBtn first)", {
    using: (document.getElementById(LEGACY_BTN_ID) ? LEGACY_BTN_ID : BTN_ID),
  });
})();
