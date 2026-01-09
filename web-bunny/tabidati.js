// tabidati.js（v13.0：旅立ちボタンを「お迎え/スロット」と同じHUD列に自動追加）
// - 旅立ちモードON/OFF
// - 旅立ち時：コスト支払い / SE / 記録 / メッセージ / うさぎ削除
// - 旅立ちモード中：うさぎホバーで赤縁取り
// - 旅立ちモード中：うさぎが画面外へ行かないよう位置クランプ（はみ出し防止）
// - 「長い空白メッセージ」対策：専用トーストCSSで表示
// ✅ SYOUGOU.add("tabidachi") を直接呼ぶ（あれば）
// ✅ FIX: 旅立ち後に hart.png が残らない（bunny.hideHeart/hartEl/removeBunnyInstance）
// ✅ 旅立ちボタンは HUD(#hudButtons) に自動で置く（無ければ #hud 末尾）
// ✅ 既存の WB.departBtn があっても壊さない（あればそれも反応）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  const DEFAULT_COST = 2000;
  const getCost = () => (Number.isFinite(WB.DEPART_COST) ? WB.DEPART_COST : DEFAULT_COST);

  let departMode = false;
  let clampTimer = null;

  const BTN_ID = "departBtnV1"; // ← HUDに置くボタンID

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

/* ✅ HUDボタン見た目（他ボタンと揃える・ON状態） */
#${BTN_ID}{
  position: relative;
}
#${BTN_ID}.on{
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
   * HUD Button（お迎えと同じように置く）
   * ========================= */
  function ensureDepartBtn() {
    ensureToastStyles();

    // すでにあるならそれを使う
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "旅立ち";

    // 置き場所：#hudButtons が最優先
    const hudButtons = document.getElementById("hudButtons");
    const hud = document.getElementById("hud") || document.body;

    if (hudButtons) hudButtons.appendChild(btn);
    else hud.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { WB.unlockAudioOnce?.(); } catch {}
      toggleDepartMode();
    });

    return btn;
  }

  function updateBtnUI() {
    // WB.departBtn（既存）と新ボタンの両方を同期
    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
    try { document.getElementById(BTN_ID)?.classList.toggle("on", departMode); } catch {}
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
   * ========================= */
  function startClamp() {
    stopClamp();

    const field = document.getElementById("field");
    const layer = document.getElementById("bunnyLayer") || field;
    if (!layer) return;

    clampTimer = setInterval(() => {
      if (!departMode) return;

      const area = (layer || field);
      const ar = area.getBoundingClientRect();
      if (!ar.width || !ar.height) return;

      const wraps = Array.from(document.querySelectorAll(".bunnyWrap"));
      for (const w of wraps) {
        if (!w || !w.isConnected) continue;

        const r = w.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        const overL = ar.left - r.left;
        const overR = r.right - ar.right;
        const overT = ar.top - r.top;
        const overB = r.bottom - ar.bottom;

        if (overL <= 0 && overR <= 0 && overT <= 0 && overB <= 0) continue;

        const cs = getComputedStyle(w);
        const left = parseFloat(w.style.left || cs.left || "0") || 0;
        const top  = parseFloat(w.style.top  || cs.top  || "0") || 0;

        let nx = left;
        let ny = top;

        if (overL > 0) nx += overL;
        if (overR > 0) nx -= overR;
        if (overT > 0) ny += overT;
        if (overB > 0) ny -= overB;

        if (Number.isFinite(nx)) w.style.left = `${nx}px`;
        if (Number.isFinite(ny)) w.style.top  = `${ny}px`;
      }
    }, 100);
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
  // ✅ ボタンをHUDに作る（お迎えと同じ列）
  ensureDepartBtn();

  // 既存の WB.departBtn がある環境でも動かす（互換）
  if (WB.departBtn && !WB.departBtn.__tabidatiBound) {
    WB.departBtn.__tabidatiBound = true;
    WB.departBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDepartMode();
    });
  }

  document.addEventListener("pointerdown", onPointerDownCapture, true);

  /* =========================
   * Public
   * ========================= */
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
    btnId: BTN_ID,
  };
})();
