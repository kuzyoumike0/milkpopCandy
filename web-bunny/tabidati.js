// tabidati.js
// - 旅立ちモードON/OFF
// - 旅立ち時：コスト支払い / SE / 記録 / メッセージ / うさぎ削除
// - 旅立ちモード中：うさぎホバーで赤縁取り
// - 旅立ちモード中：うさぎが画面外へ行かないよう位置クランプ（はみ出し防止）
// - 「長い空白メッセージ」対策：専用トーストCSSで表示

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  // 旅立ちモードON/OFF
  let departMode = false;

  // はみ出し防止クランプ用
  let clampTimer = null;

  /* =========================
   * Toast（専用CSSで空白バグ回避）
   * ========================= */
  function ensureToastStyles() {
    if (document.getElementById("tabidatiToastStyleV1")) return;
    const s = document.createElement("style");
    s.id = "tabidatiToastStyleV1";
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
    if (!text) return; // 空文字は出さない（空白バグ対策）
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

    // 100msごとに「うさぎwrap」がフィールド外へ出ていないか補正
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

        // はみ出し量（viewport座標）
        const overL = ar.left - r.left;
        const overR = r.right - ar.right;
        const overT = ar.top - r.top;
        const overB = r.bottom - ar.bottom;

        if (overL <= 0 && overR <= 0 && overT <= 0 && overB <= 0) continue;

        // style.left/top を px で持っている前提で補正（多くの実装がこれ）
        const cs = getComputedStyle(w);
        const left = parseFloat(w.style.left || cs.left || "0") || 0;
        const top  = parseFloat(w.style.top  || cs.top  || "0") || 0;

        // viewportでのズレを「px」補正として反映
        let nx = left;
        let ny = top;

        if (overL > 0) nx += overL;
        if (overR > 0) nx -= overR;
        if (overT > 0) ny += overT;
        if (overB > 0) ny -= overB;

        // 念のため無限値ガード
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

    // 最後の1匹は残す
    if (WB.bunnies.length <= 1) {
      toast("最後の1匹は旅立たせられないよ");
      return false;
    }

    // コスト不足
    if (WB.coins < WB.DEPART_COST) {
      toast(`コイン不足（必要：${WB.DEPART_COST}🪙）`);
      return false;
    }

    // 支払い
    WB.coins -= WB.DEPART_COST;
    WB.saveCoins?.();
    WB.updateHud?.();
    WB.refreshShopUI?.();

    // SE
    WB.playSE?.(WB.seTabidati);

    // 記録＆メッセージ（app.js側が持ってる想定）
    WB.recordFarewell?.(bunny.kind);
    WB.showFarewellMessage?.(bunny.kind);

    // まず配列から外して、以降の移動/ロジック対象から除外（←これで画面外へ暴走しづらい）
    const idx = WB.bunnies.indexOf(bunny);
    if (idx >= 0) WB.bunnies.splice(idx, 1);

    // 旅立ち演出：軽くフェードしてからDOM削除
    try {
      const w = bunny.wrap;
      if (w) {
        w.classList.add("departing");
        // 少し待ってから削除
        await new Promise((r) => setTimeout(r, 520));
        try { w.remove(); } catch {}
      }
    } catch {
      try { bunny.wrap?.remove(); } catch {}
    }

    // 保存＆実績チェック
    WB.saveBunnyMeta?.();
    WB.checkUnlocks?.();

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

    // wrapから対象インスタンスを特定
    const bunny = WB.bunnies.find(b => b.wrap === wrap);
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
