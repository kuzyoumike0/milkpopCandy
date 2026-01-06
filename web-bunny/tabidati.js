(() => {
  if (!window.WB) return;

  const WB = window.WB;

  let running = false;
  let timer = null;

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    // ボタン見た目があるなら（CSSで .on を使う想定）
    try { WB.departBtn?.classList.remove("on"); } catch {}
  }

  function departOne() {
    // 最後の1匹は残す（空になると寂しい＆挙動事故防止）
    if (WB.bunnies.length <= 1) return false;

    if (WB.coins < WB.DEPART_COST) return false;

    // 1匹選ぶ（ここは「最後尾」＝最後の要素）
    const b = WB.bunnies[WB.bunnies.length - 1];

    // 支払い
    WB.coins -= WB.DEPART_COST;
    WB.saveCoins();
    WB.updateHud();

    // 効果音
    WB.playSE(WB.seTabidati);

    // 図鑑：旅立ち回数
    WB.recordFarewell(b.kind);

    // メッセージ
    WB.showFarewellMessage(b.kind);

    // 消す
    WB.removeBunnyInstance(b);

    return true;
  }

  function start() {
    if (running) return;
    running = true;

    try { WB.departBtn?.classList.add("on"); } catch {}

    // 連続旅立ち（再クリックで停止）
    timer = setInterval(() => {
      const ok = departOne();
      if (!ok) stop();
    }, 650);
  }

  function toggle() {
    WB.unlockAudioOnce();
    if (running) stop();
    else start();
  }

  if (WB.departBtn) {
    WB.departBtn.addEventListener("click", toggle);
  }

  WB.tabidati = {
    start,
    stop,
    toggle,
    departOne,
    get running() { return running; },
  };
})();
