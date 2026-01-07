// tabidati.js（互換強化版）
// - 旅立ちモードON/OFF
// - 旅立ち時：コスト支払い / SE / 記録 / メッセージ / うさぎ削除
// - 旅立ちモード中：うさぎホバーで赤縁取り
// - 旅立ちモード中：うさぎが画面外へ行かないよう位置クランプ（はみ出し防止）
// - 「長い空白メッセージ」対策：専用トーストCSSで表示
// - ✅ WB新旧互換：getBunnies/getCoin/spendCoin 優先

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  // 旅立ちモードON/OFF
  let departMode = false;

  // はみ出し防止クランプ用
  let clampTimer = null;

  /* =========================
   * 互換ヘルパ
   * ========================= */
  const getBunnies = () => {
    if (typeof WB.getBunnies === "function") return WB.getBunnies();
    if (Array.isArray(WB.bunnies)) return WB.bunnies;
    return [];
  };

  const getCoins = () => {
    if (typeof WB.getCoin === "function") return WB.getCoin();
    if (typeof WB.coins === "number") return WB.coins;
    return 0;
  };

  const spendCoins = (amount) => {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return true;

    // 新API優先
    if (typeof WB.spendCoin === "function") return !!WB.spendCoin(amount);

    // 旧互換
    if (typeof WB.coins === "number" && WB.coins >= amount) {
      WB.coins -= amount;
      try { WB.saveCoins?.(); } catch {}
      try { WB.updateHud?.(); } catch {}
      return true;
    }
    return false;
  };

  const emitBunnyCountChanged = () => {
    const list = getBunnies();
    try { WB.emit?.("bunnyCountChanged", { count: list.length }); } catch {}
  };

  /* =========================
   * Toast（専用CSSで空白バグ回避）
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
  white-space: pre-wrap;
}
@keyframes tabToastIn{
  from { opacity:0; transform:translate(-50%,-80%); }
  to   { opacity:1; transform:translate(-50%,-50%); }
}
@keyframes tabToastOut{
  from { opacity:1; transform:translate(-50%,-50%); }
  to   { opacity:0; transform:translate(-50%,-30%); }
}

/* ===== 旅立ちモード：ホバー赤縁取り ===== */
body.departModeOn .bunnyWrap{
  outline: none;
}
body.departModeOn .bunnyWrap:hover{
  outline: 4px solid rgba(255, 64, 64, .85);
  outline-offset: 3px;
  border-radius: 18px;
}

/* 旅立ち中のフェード */
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
   * 旅立ちモードの見た目
   * ========================= */
  function setDepartMode(on) {
    departMode = !!on;

    // ボタン見た目
    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}

    // bodyにクラス（ホバー赤縁取りなど）
    try { document.body.classList.toggle("departModeOn", departMode); } catch {}

    // はみ出し防止をON/OFF
    if (departMode) startClamp();
    else stopClamp();

    toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggleDepartMode() {
    try { WB.unlockAudioOnce?.(); } catch {}
    setDepartMode(!departMode);
  }

  /* =========================
   * はみ出し防止（フィールド内にクランプ）
   * ========================= */
  function startClamp() {
    stopClamp();

    const field = document.getElementById("field");
    const layer = document.getElementById("bunnyLayer") || field;
    if (!layer) return;

    // 100msごとに「うさぎwrap」がフィールド外へ出ていないか補正
    clampTimer = setInterval(() => {
      if (!departMode) return;

      const area = layer || field;
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

        // ★ left/top が auto（= レイアウト制御が別）の場合は触らない（事故防止）
        const leftStr = (w.style.left || cs.left || "").trim();
        const topStr  = (w.style.top  || cs.top  || "").trim();
        if (!leftStr || !topStr || leftStr === "auto" || topStr === "auto") continue;

        const left = parseFloat(leftStr) || 0;
        const top  = parseFloat(topStr)  || 0;

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
   * 旅立ち実行
   * ========================= */
  async function departBunny(bunny) {
    if (!bunny) return false;

    const list = getBunnies();

    // 最後の1匹は残す
    if (list.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }

    // コスト不足
    const cost = Number(WB.DEPART_COST ?? 0) || 0;
    if (getCoins() < cost) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }

    // 支払い（新API優先）
    if (!spendCoins(cost)) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }

    // 追加UI更新（あれば）
    try { WB.updateHud?.(); } catch {}
    try { WB.omukae?.refreshShopUI?.(); } catch {}
    try { WB.refreshShopUI?.(); } catch {}

    // SE
    try { WB.playSE?.(WB.seTabidati); } catch {}

    // 記録＆メッセージ（あれば）
    try { WB.recordFarewell?.(bunny.kind); } catch {}
    try { WB.showFarewellMessage?.(bunny.kind); } catch {}

    // 配列から外して、以降の移動/ロジック対象から除外
    const idx = list.indexOf(bunny);
    if (idx >= 0) list.splice(idx, 1);
    emitBunnyCountChanged();

    // 旅立ち演出：軽くフェードしてからDOM削除
    try {
      const w = bunny.wrap;
      if (w) {
        w.classList.add("departing");
        await new Promise((r) => setTimeout(r, 520));
        try { w.remove(); } catch {}
      }
    } catch {
      try { bunny.wrap?.remove(); } catch {}
    }

    // 保存＆実績チェック（あれば）
    try { WB.saveBunnies?.(); } catch {}
    try { WB.saveBunnyMeta?.(); } catch {}
    try { WB.checkUnlocks?.(); } catch {}

    // イベント通知（任意で他モジュールが追従できる）
    try { WB.emit?.("bunnyDeparted", { kind: bunny.kind, bornAt: bunny.bornAt }); } catch {}

    return true;
  }

  /* =========================
   * 旅立ちモード中：クリック横取り
   * ========================= */
  function onPointerDownCapture(e) {
    if (!departMode) return;

    // 左クリック/タップのみ
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    // ★通常のクリック処理（コイン生成）を止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const list = getBunnies();
    const bunny = list.find(b => b?.wrap === wrap);
    if (!bunny) return;

    departBunny(bunny);
  }

  /* =========================
   * Hook
   * ========================= */
  // departBtn が WB に無い場合もあるので、DOMからも拾う
  const domDepartBtn = WB.departBtn || document.getElementById("departBtn");
  if (domDepartBtn) {
    domDepartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDepartMode();
    });
    // WBにも載せておく（他モジュール用）
    try { WB.departBtn = domDepartBtn; } catch {}
  }

  // うさぎクリック横取り（キャプチャが重要）
  document.addEventListener("pointerdown", onPointerDownCapture, true);

  // 外部公開
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
  };
})();
