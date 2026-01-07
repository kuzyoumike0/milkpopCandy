// bgcolor.js
// 朝・昼・夜を「日本時間(JST)」で判定して #bgLayer に直接適用（確実）
// reset後に背景が黒くなる対策：イベントでも再適用

(() => {
  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

  // 時間帯（好みで調整OK）
  const MORNING = { start: 5,  end: 10 }; // 05:00〜09:59
  const DAY     = { start: 10, end: 17 }; // 10:00〜16:59

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  function getJSTHour() {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === "hour")?.value ?? 0);
  }

  function getPhaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  let last = "";
  function apply(force = false) {
    const h = getJSTHour();
    const phase = getPhaseByHour(h);
    if (!force && phase === last) return;
    last = phase;

    // ★ #bgLayer に確実に反映
    bgLayer.style.background = THEMES[phase];

    // ★ 保険：#field 側も同じ色に（bgLayerが一瞬消えても黒にならない）
    if (field) field.style.background = THEMES[phase];

    window.WB?.emit?.("bg:changed", { phase, hour: h });
  }

  // 初回
  apply(true);

  // 1分ごと
  setInterval(() => apply(false), 60 * 1000);

  // ★ reset時に即反映（WBがある場合）
  // app.jsが emit("core:reset_partial") しているのでそこにフック
  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));
    return true;
  };

  // すぐ試す + 少し遅延してもう一回（読み込み順対策）
  hookWB();
  setTimeout(hookWB, 300);
})();
