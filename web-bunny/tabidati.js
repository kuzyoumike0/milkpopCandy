(() => {
  if (!window.WB) return;
  const WB = window.WB;

  let running = false;

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 1800);
  }

  function showFarewellMessage(kind) {
    const texts = [
      "またどこかで会えるよ。",
      "ありがとう。元気でね。",
      "やさしい時間をありがとう。",
      "旅立ちは、はじまり。",
      "ずっと忘れないよ。",
    ];
    const def = WB.BUNNY_DEFS[kind];
    const name = def?.label ?? "うさぎ";
    const msg = `${name} は旅立っていった…`;

    const el = document.createElement("div");
    el.className = "farewellMsg";
    el.textContent = msg + " " + texts[Math.floor(Math.random() * texts.length)];
    document.body.appendChild(el);

    setTimeout(() => { try { el.remove(); } catch {} }, 2600);
  }

  function showFarewellMilestone(kind, count) {
    const isRea = kind === "reabunny";
    let text = "";
    if (count === 10) text = "たくさんの別れが、記憶になった。";
    if (count === 20) text = "見送ることにも、意味が宿りはじめた。";
    if (count === 50) text = "それでも忘れなかった。その名前を。";
    if (!text) return;

    const el = document.createElement("div");
    el.className = "farewellMilestone" + (isRea ? " rea" : "");
    el.textContent = isRea ? `reabunny ─ ${text}` : `${kind} ─ ${text}`;
    document.body.appendChild(el);

    setTimeout(() => { try { el.remove(); } catch {} }, 3200);
  }

  function recordFarewell(kind) {
    const dex = WB.dex || {};
    if (!dex[kind]) dex[kind] = { seen: true, farewell: 0 };
    dex[kind].seen = true;
    dex[kind].farewell = (dex[kind].farewell || 0) + 1;

    const c = dex[kind].farewell;
    if (c === 10 || c === 20 || c === 50) showFarewellMilestone(kind, c);

    WB.dex = dex;
    WB.saveDex();
  }

  function setMode(on) {
    running = !!on;
    try {
      WB.departBtn?.classList.toggle("on", running);
    } catch {}
    toast(running ? "✈️ 旅立ちモード：ON（うさぎをクリック）" : "🛑 旅立ちモード：OFF");
  }

  function toggle() {
    WB.unlockAudioOnce();
    setMode(!running);
  }

  // 旅立たせる本体（クリックした個体）
  function departBunny(bunny) {
    if (!bunny) return false;

    // 最後の1匹は不可
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

    // SE
    WB.playSE(WB.seTabidati);

    // 記録＆メッセージ
    recordFarewell(bunny.kind);
    showFarewellMessage(bunny.kind);

    // 削除
    WB.removeBunnyInstance(bunny);

    return true;
  }

  // 旅立ちモード中の「うさぎクリック」を横取り（キャプチャで先に取る）
  function onFieldPointerDownCapture(e) {
    if (!running) return;

    // 左クリック/タップのみ
    if (e.button != null && e.button !== 0) return;

    const t = e.target;
    if (!t) return;

    // bunnyWrap / bunny を特定
    const wrap = t.closest?.(".bunnyWrap");
    if (!wrap) return;

    // ★通常の「コイン生成クリック」を止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // wrap→インスタンス特定（WB.bunnies から探す）
    const bunny = WB.bunnies.find(b => b.wrap === wrap);
    if (!bunny) return;

    departBunny(bunny);
  }

  // ボタン
  if (WB.departBtn) {
    WB.departBtn.addEventListener("click", toggle);
  }

  // クリック横取り（キャプチャが重要）
  WB.field.addEventListener("pointerdown", onFieldPointerDownCapture, true);

  // 外部API
  WB.tabidati = {
    setMode,
    toggle,
    departBunny,
    recordFarewell,
    showFarewellMessage,
    get running() { return running; },
  };
})();
