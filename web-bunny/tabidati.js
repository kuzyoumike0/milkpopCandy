// tabidati.js（v12.8 app.js対応）
// - 旅立ちモードON/OFF
// - 旅立ち時：コスト支払い / SE / 記録 / メッセージ / うさぎ削除
// - 旅立ちモード中：うさぎホバーで赤縁取り
// - 旅立ちモード中：うさぎが画面外へ行かないよう位置クランプ（はみ出し防止）
// - 「長い空白メッセージ」対策：専用トーストCSSで表示

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  // ===== 設定 =====
  const DEFAULT_COST = 2000; // WB.DEPART_COST が無い場合のデフォルト
  const getCost = () => (Number.isFinite(WB.DEPART_COST) ? WB.DEPART_COST : DEFAULT_COST);

  // 旅立ちモードON/OFF
  let departMode = false;

  // はみ出し防止クランプ用
  let clampTimer = null;

  /* =========================
   * WB互換ヘルパ（v12.8対応）
   * ========================= */
  function getBunnyList() {
    // v12.8: getBunnies()
    if (typeof WB.getBunnies === "function") return WB.getBunnies();
    // 旧
    if (Array.isArray(WB.bunnies)) return WB.bunnies;
    return [];
  }

  function getCoins() {
    if (typeof WB.getCoin === "function") return WB.getCoin();
    if (typeof WB.coins === "number") return WB.coins;
    return 0;
  }

  function spendCoins(amount) {
    // v12.8: spendCoin()
    if (typeof WB.spendCoin === "function") return WB.spendCoin(amount);
    // 旧
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

/* ===== 旅立ちモード：ホバー赤縁取り ===== */
body.departModeOn .bunnyWrap{ outline: none; }
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

    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
    try { document.body.classList.toggle("departModeOn", departMode); } catch {}

    if (departMode) startClamp();
    else stopClamp();

    toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggleDepartMode() {
    // BGM.jsのunlockと競合しないよう、あれば呼ぶ（無くてもOK）
    WB.unlockAudioOnce?.();
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
   * 旅立ち実行
   * ========================= */
  async function departBunny(bunny) {
    if (!bunny) return false;

    const list = getBunnyList();

    // 最後の1匹は残す
    if (list.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }

    const cost = getCost();

    // コスト不足
    if (getCoins() < cost) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }

    // 支払い
    if (!spendCoins(cost)) {
      toast(`コイン不足（必要：${cost}🪙）`);
      return false;
    }

    // SE（tabidati専用SEがあるならそれを鳴らす）
    try {
      if (WB.playSE && WB.seTabidati) WB.playSE(WB.seTabidati);
    } catch {}

    // 記録＆メッセージ
    try { WB.recordFarewell?.(bunny.kind || bunny.adultSrc || ""); } catch {}
    try { WB.showFarewellMessage?.(bunny.kind || ""); } catch {}

    // 配列から外す（v12.8のbunnies配列参照を直接いじる）
    const idx = list.indexOf(bunny);
    if (idx >= 0) list.splice(idx, 1);

    // 旅立ち演出
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

    // 保存＆解除チェック
    try { WB.saveBunnyMeta?.(); } catch {}
    try { WB.checkUnlocks?.(); } catch {}

    // v12.8では saveBunnies は app.js 内部だけだけど、旅立ち後に保存させたい
    // → 旅立ち後に bunnies が変わるので、createBunny内のsaveBunniesは動かない。
    // ここで emit しておく（必要なら app.js 側で拾える）
    try { WB.emit?.("bunnyCountChanged", { count: list.length }); } catch {}

    return true;
  }

  /* =========================
   * 旅立ちモード中：クリック横取り
   * ========================= */
  function onPointerDownCapture(e) {
    if (!departMode) return;
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const list = getBunnyList();
    const bunny = list.find(b => b.wrap === wrap);
    if (!bunny) return;

    departBunny(bunny);
  }

  /* =========================
   * Hook
   * ========================= */
  if (WB.departBtn) {
    WB.departBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDepartMode();
    });
  }

  document.addEventListener("pointerdown", onPointerDownCapture, true);

  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
  };
})();
