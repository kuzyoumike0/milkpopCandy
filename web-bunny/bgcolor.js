// bgcolor.js
// 朝・昼・夜を「時間」で判定して背景をグラデで切り替える（軽量）
// JST想定（ブラウザが日本時間ならそのまま）

(() => {
  const root = document.documentElement;

  // 時間帯（好みで調整OK）
  const MORNING = { start: 5,  end: 10 };  // 05:00〜09:59
  const DAY     = { start: 10, end: 17 };  // 10:00〜16:59
  const NIGHT   = { start: 17, end: 5  };  // 17:00〜04:59（跨ぎ）

  // 背景テーマ（グラデ）
  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  function getPhaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  let last = "";
  function apply() {
    const now = new Date();
    const h = now.getHours(); // ローカル時間（日本ならJST）
    const phase = getPhaseByHour(h);

    if (phase !== last) {
      root.style.setProperty("--bg", THEMES[phase]);
      last = phase;
    }
  }

  // 初回
  apply();

  // 1分に1回チェック（軽い）
  setInterval(apply, 60 * 1000);
})();
