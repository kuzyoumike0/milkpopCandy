(() => {
  if (!window.WB) return;
  const WB = window.WB;

  let running = false;
  let timer = null;

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

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try { WB.departBtn?.classList.remove("on"); } catch {}
  }

  function departOne() {
    if (WB.bunnies.length <= 1) return false;
    if (WB.coins < WB.DEPART_COST) return false;

    const b = WB.bunnies[WB.bunnies.length - 1];

    WB.coins -= WB.DEPART_COST;
    WB.saveCoins();
    WB.updateHud();

    WB.playSE(WB.seTabidati);

    recordFarewell(b.kind);
    showFarewellMessage(b.kind);

    WB.removeBunnyInstance(b);

    return true;
  }

  function start() {
    if (running) return;
    running = true;
    try { WB.departBtn?.classList.add("on"); } catch {}

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
    showFarewellMessage,
    recordFarewell,
    get running() { return running; },
  };
})();
