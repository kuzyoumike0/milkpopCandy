// tabidati.js
// 旅立ちモード：ON/OFFの視認性UP + 旅立ちメッセージ読み込み（フォールバック付き）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * 状態
   * ========================= */
  let departMode = false;
  let overlayEl = null;

  const OVERLAY_ID = "wbDepartOverlayV1";
  const STYLE_ID = "wbDepartStyleV1";

  /* =========================
   * UI/Style
   * ========================= */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
/* ボタン点灯（既存class on を強化） */
#departBtn.on{
  background: #ffd6e7;
  box-shadow: 0 12px 32px rgba(0,0,0,.14);
  outline: 3px solid rgba(255, 120, 180, .55);
}

/* 旅立ちモード中はカーソルを分かりやすく */
body.wbDepartModeOn, body.wbDepartModeOn *{
  cursor: crosshair !important;
}

/* 画面上に帯（オーバーレイ） */
#${OVERLAY_ID}{
  position: fixed;
  left: 50%;
  top: 9%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  width: min(760px, 94vw);
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 18px 60px rgba(0,0,0,.22);
  display:none;
  user-select:none;
  pointer-events:none;
}
#${OVERLAY_ID}.on{ display:block; }
#${OVERLAY_ID} .row{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
#${OVERLAY_ID} .left{
  display:flex;
  flex-direction: column;
  gap: 4px;
}
#${OVERLAY_ID} .title{
  font-weight: 1000;
}
#${OVERLAY_ID} .sub{
  font-weight: 900;
  font-size: 12px;
  opacity: .78;
}
#${OVERLAY_ID} .right{
  display:flex;
  align-items:center;
  gap: 10px;
}
#${OVERLAY_ID} .pill{
  display:inline-flex;
  align-items:center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 1000;
  font-size: 12px;
}
#${OVERLAY_ID} .warn{
  background: rgba(255, 120, 120, .16);
}
#${OVERLAY_ID} .ok{
  background: rgba(120, 210, 255, .20);
}

/* toast（既存 .farewellMilestone が無い場合の最低限） */
.farewellMilestone{
  position: fixed;
  left: 50%;
  top: 14%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(255,255,255,.96);
  border-radius: 16px;
  padding: 12px 16px;
  font-weight: 1000;
  box-shadow: 0 16px 40px rgba(0,0,0,.18);
  opacity: 0;
  animation: wbToastIn .2s ease-out forwards, wbToastOut .32s ease-in forwards;
  animation-delay: 0ms, 1.2s;
  white-space: nowrap;
}
@keyframes wbToastIn{
  from { opacity: 0; transform: translate(-50%, -70%); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes wbToastOut{
  from { opacity: 1; transform: translate(-50%, -50%); }
  to   { opacity: 0; transform: translate(-50%, -35%); }
}
`;
    document.head.appendChild(s);
  }

  function ensureOverlay() {
    ensureStyles();
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.innerHTML = `
      <div class="row">
        <div class="left">
          <div class="title">✈️ 旅立ちモード：ON（うさぎをクリック）</div>
          <div class="sub">※ 通常のクリック（コイン生成）は無効になります</div>
        </div>
        <div class="right">
          <span class="pill warn" data-cost>コスト：--</span>
          <span class="pill ok" data-left>残り：--</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function updateOverlay() {
    if (!departMode) return;
    const el = ensureOverlay();
    const costEl = el.querySelector("[data-cost]");
    const leftEl = el.querySelector("[data-left]");

    const cost = Number(WB.DEPART_COST || 0);
    const coins = Number(WB.coins || 0);
    const can = coins >= cost;

    if (costEl) costEl.textContent = `コスト：${cost}🪙`;
    if (leftEl) {
      leftEl.textContent = can ? `所持：${coins}🪙` : `不足：${Math.max(0, cost - coins)}🪙`;
      leftEl.classList.toggle("warn", !can);
      leftEl.classList.toggle("ok", can);
    }
  }

  /* =========================
   * 通知
   * ========================= */
  function toast(msg, ms = 1600) {
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, ms);
  }

  /* =========================
   * 旅立ちメッセージ読み込み
   * ========================= */
  // farewell_messages.js が読み込まれていれば WB.showFarewellMessage がある想定。
  // 無い場合はここで簡易フォールバックを提供。
  function ensureFarewellMessage() {
    if (typeof WB.showFarewellMessage === "function") return;

    const FALLBACK = {
      bunny1: ["またね。ここで過ごした日々は宝物だよ。", "小さな足音が、遠ざかっていった。"],
      bunny3: ["安定は強さ。次の空へ行こう。", "整った歩幅で旅立った。"],
      bunny4: ["眩しい足跡を残して、次の舞台へ。", "大きな背中が風に消えた。"],
      bunny5: ["王者のまま旅に出る。", "空いた場所が、広く感じる。"],
      reabunny: ["幻は掴めた瞬間から消える。…分かってたのに。", "会えたこと自体が贈り物だった。"],
    };

    WB.showFarewellMessage = (kind) => {
      const k = String(kind || "");
      const arr = FALLBACK[k] || ["旅立ちは、静かにやってくる。"];
      const line = arr[(Math.random() * arr.length) | 0];
      toast(`🕊️ ${line}`, 2600);
    };
  }

  /* =========================
   * モード切替
   * ========================= */
  function setDepartMode(on) {
    ensureFarewellMessage();
    departMode = !!on;

    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
    document.body.classList.toggle("wbDepartModeOn", departMode);

    const ov = ensureOverlay();
    ov.classList.toggle("on", departMode);

    if (departMode) {
      toast("✈️ 旅立ちモード：ON（うさぎをクリック）");
      updateOverlay();
    } else {
      toast("🛑 旅立ちモード：OFF");
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

    // 最後の1匹は残す
    if (WB.bunnies.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }

    // コスト不足
    if (WB.coins < WB.DEPART_COST) {
      toast(`コイン不足（必要：${WB.DEPART_COST}🪙）`);
      updateOverlay();
      return false;
    }

    // 支払い
    WB.coins -= WB.DEPART_COST;
    WB.saveCoins?.();
    WB.updateHud?.();
    WB.refreshShopUI?.();

    // SE
    WB.playSE?.(WB.seTabidati);

    // 記録＆メッセージ
    WB.recordFarewell?.(bunny.kind);
    WB.showFarewellMessage?.(bunny.kind);

    // 配列から削除
    const idx = WB.bunnies.indexOf(bunny);
    if (idx >= 0) WB.bunnies.splice(idx, 1);

    // DOM削除
    try { bunny.wrap?.remove(); } catch {}

    // 保存＆実績チェック
    WB.saveBunnyMeta?.();
    WB.checkUnlocks?.();

    updateOverlay();
    return true;
  }

  /* =========================
   * 旅立ちモード中クリック横取り（キャプチャ）
   * ========================= */
  function onPointerDownCapture(e) {
    if (!departMode) return;

    // 左クリック/タップのみ
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    // 通常クリック（コイン生成）を止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const bunny = WB.bunnies.find((b) => b.wrap === wrap);
    if (!bunny) return;

    departBunny(bunny);
  }

  /* =========================
   * ボタン/イベント
   * ========================= */
  ensureFarewellMessage();
  ensureOverlay();

  if (WB.departBtn) {
    WB.departBtn.addEventListener("click", toggleDepartMode);
  }

  document.addEventListener("pointerdown", onPointerDownCapture, true);

  // コイン変化で帯表示も更新（できる範囲で）
  const cv = document.getElementById("coinValue");
  if (cv) {
    const mo = new MutationObserver(() => updateOverlay());
    mo.observe(cv, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener("resize", () => {
    if (departMode) updateOverlay();
  });

  /* =========================
   * External
   * ========================= */
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
  };
})();
