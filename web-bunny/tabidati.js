// tabidati.js
// 旅立ちモード：視認性UP / 赤縁ホバー / 旅立ちメッセージ / 空白バグ対策（farewellMilestone不使用）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * 状態
   * ========================= */
  let departMode = false;
  let overlayEl = null;
  let lastHoverWrap = null;

  const OVERLAY_ID = "wbDepartOverlayV1";
  const STYLE_ID   = "wbDepartStyleV2";

  /* =========================
   * Style
   * ========================= */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
/* ===== toast（独自クラス：既存CSSと衝突しない） ===== */
.wbToast{
  position: fixed;
  left: 50%;
  top: 14%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  pointer-events: none;
  background: rgba(255,255,255,.96);
  border-radius: 16px;
  padding: 12px 16px;
  font-weight: 900;
  color: #222;
  box-shadow: 0 16px 40px rgba(0,0,0,.18);
  white-space: nowrap;
  opacity: 0;
  transition: opacity .18s ease, transform .18s ease, filter .18s ease;
  filter: blur(0px);
}
.wbToast.on{
  opacity: 1;
}
.wbToast.out{
  opacity: 0;
  transform: translate(-50%, -35%);
  filter: blur(1px);
}

/* ボタン点灯 */
#departBtn.on{
  background:#ffd6e7;
  outline:3px solid rgba(255,120,180,.55);
}

/* カーソル */
body.wbDepartModeOn, body.wbDepartModeOn *{
  cursor: crosshair !important;
}

/* ===== オーバーレイ ===== */
#${OVERLAY_ID}{
  position:fixed;
  left:50%;
  top:9%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  width:min(760px,94vw);
  padding:12px 14px;
  border-radius:16px;
  background:rgba(255,255,255,.86);
  box-shadow:0 18px 60px rgba(0,0,0,.18);
  display:none;
  pointer-events:none;
  font-weight: 900;
  color:#222;
}
#${OVERLAY_ID}.on{ display:block; }

/* ===== うさぎ赤縁 ===== */
body.wbDepartModeOn .bunnyWrap{
  position:relative;
  transition:transform .12s ease, filter .12s ease;
}
body.wbDepartModeOn .bunnyWrap::before{
  content:"";
  position:absolute;
  inset:-6px;
  border-radius:16px;
  border:3px solid rgba(255,70,70,0);
  box-shadow:0 0 0 rgba(255,70,70,0);
  opacity:0;
  pointer-events:none;
  transition:.12s ease;
}
body.wbDepartModeOn .bunnyWrap.wbDepartHover{
  transform:translateY(-1px) scale(1.02);
  filter:drop-shadow(0 0 14px rgba(255,80,80,.55));
}
body.wbDepartModeOn .bunnyWrap.wbDepartHover::before{
  opacity:1;
  border-color:rgba(255,70,70,.78);
  box-shadow:0 0 18px rgba(255,70,70,.35);
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Toast（空白が出ない）
   * ========================= */
  function toast(msg, ms = 1600) {
    if (!msg) return;
    ensureStyles();

    const el = document.createElement("div");
    el.className = "wbToast";
    el.textContent = msg;

    // 念のため：既存CSSに何があってもレイアウト参加しないよう固定
    el.style.position = "fixed";
    el.style.display = "inline-block";
    el.style.margin = "0";
    el.style.height = "auto";
    el.style.minHeight = "0";
    el.style.maxHeight = "none";

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("on"));

    setTimeout(() => el.classList.add("out"), Math.max(0, ms - 260));
    setTimeout(() => { try { el.remove(); } catch {} }, ms + 140);
  }

  /* =========================
   * Overlay
   * ========================= */
  function ensureOverlay() {
    ensureStyles();
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.textContent = "✈️ 旅立ちモード：ON（うさぎをクリック）";
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  /* =========================
   * Farewell message（fallback）
   * ========================= */
  function ensureFarewellMessage() {
    if (typeof WB.showFarewellMessage === "function") return;

    const FALLBACK = {
      bunny1: ["またね。ここでの時間は宝物だよ。"],
      bunny3: ["安定は強さ。次の空へ。"],
      bunny4: ["眩しい足跡を残して旅立った。"],
      bunny5: ["王者のまま、去っていった。"],
      reabunny: ["幻は掴めた瞬間から消える。"],
    };

    WB.showFarewellMessage = (kind) => {
      const arr = FALLBACK[kind] || ["旅立ちは静かに訪れる。"];
      toast(`🕊️ ${arr[(Math.random() * arr.length) | 0]}`, 2600);
    };
  }

  /* =========================
   * Hover管理
   * ========================= */
  function setHoverWrap(wrap) {
    if (lastHoverWrap && lastHoverWrap !== wrap) {
      lastHoverWrap.classList.remove("wbDepartHover");
    }
    lastHoverWrap = wrap;
    if (wrap) wrap.classList.add("wbDepartHover");
  }

  /* =========================
   * モード切替
   * ========================= */
  function setDepartMode(on) {
    ensureFarewellMessage();
    departMode = !!on;

    document.body.classList.toggle("wbDepartModeOn", departMode);
    WB.departBtn?.classList.toggle("on", departMode);

    ensureOverlay().classList.toggle("on", departMode);

    if (departMode) toast("✈️ 旅立ちモード：ON");
    else {
      toast("🛑 旅立ちモード：OFF");
      setHoverWrap(null);
    }
  }

  function toggleDepartMode() {
    WB.unlockAudioOnce?.();
    setDepartMode(!departMode);
  }

  /* =========================
   * 旅立ち処理
   * ========================= */
  function departBunny(bunny) {
    if (!bunny) return false;

    if (WB.bunnies.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }
    if (WB.coins < WB.DEPART_COST) {
      toast(`コイン不足（${WB.DEPART_COST}🪙）`);
      return false;
    }

    WB.coins -= WB.DEPART_COST;
    WB.saveCoins?.();
    WB.updateHud?.();

    WB.playSE?.(WB.seTabidati);
    WB.recordFarewell?.(bunny.kind);
    WB.showFarewellMessage?.(bunny.kind);

    const idx = WB.bunnies.indexOf(bunny);
    if (idx >= 0) WB.bunnies.splice(idx, 1);
    bunny.wrap?.remove();

    WB.saveBunnyMeta?.();
    WB.checkUnlocks?.();
    return true;
  }

  /* =========================
   * イベント横取り
   * ========================= */
  function onPointerDownCapture(e) {
    if (!departMode) return;
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    setHoverWrap(wrap);
    const bunny = WB.bunnies.find((b) => b.wrap === wrap);
    if (bunny) departBunny(bunny);
  }

  function onPointerMoveCapture(e) {
    if (!departMode) return;
    setHoverWrap(e.target?.closest?.(".bunnyWrap") || null);
  }

  /* =========================
   * Bind
   * ========================= */
  ensureStyles();
  ensureOverlay();
  ensureFarewellMessage();

  WB.departBtn?.addEventListener("click", toggleDepartMode);
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("pointermove", onPointerMoveCapture, true);

  /* =========================
   * 外部公開
   * ========================= */
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
  };
})();
