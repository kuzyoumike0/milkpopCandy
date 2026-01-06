(() => {
  if (!window.WB) return;
  const WB = window.WB;

  // 旅立ちモードON/OFF
  let departMode = false;

  // 軽い通知（CSSが無くても表示はされる）
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 1600);
  }

  function setDepartMode(on) {
    departMode = !!on;
    try { WB.departBtn?.classList.toggle("on", departMode); } catch {}
    toast(departMode ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggleDepartMode() {
    WB.unlockAudioOnce();
    setDepartMode(!departMode);
  }

  // 指定のうさぎを旅立たせる
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
      return false;
    }

    // 支払い
    WB.coins -= WB.DEPART_COST;
    WB.saveCoins();
    WB.updateHud();
    WB.refreshShopUI?.();

    // SE
    WB.playSE(WB.seTabidati);

    // 記録＆メッセージ（app.js側の関数を使用）
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

    return true;
  }

  // 旅立ちモード中：うさぎクリックを横取り（通常クリックでコインが出る処理を止める）
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

  // 旅立ちボタン
  if (WB.departBtn) {
    WB.departBtn.addEventListener("click", toggleDepartMode);
  }

  // うさぎクリック横取り（キャプチャが重要）
  document.addEventListener("pointerdown", onPointerDownCapture, true);

  // 外部に出したいなら
  WB.tabidati = {
    setDepartMode,
    toggleDepartMode,
    departBunny,
    get departMode() { return departMode; },
  };
})();
