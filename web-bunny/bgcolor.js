// bgcolor.js
// 朝・昼・夜を「日本時間(JST)」で判定して #bgLayer に直接適用（確実）
// reset後に背景が黒くなる対策：イベントでも再適用
// ✅ mirrorball設置(購入済み)の時だけ、背景を虹色にキラキラさせる（オーバーレイ）

(() => {
  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

  // =========================
  // Mirrorball sparkle overlay
  // =========================
  const SPARKLE = {
    styleId: "mirrorballSparkleStyleV1",
    layerId: "mirrorballSparkleLayerV1",
  };

  function hasMirrorballOwned() {
    // shop.js の購入状態（localStorage）を見る
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j?.mirrorball;
    } catch {
      return false;
    }
  }

  function ensureSparkleStyle() {
    if (document.getElementById(SPARKLE.styleId)) return;

    const st = document.createElement("style");
    st.id = SPARKLE.styleId;
    st.textContent = `
@keyframes mbHueSpinV1 {
  0%   { filter: hue-rotate(0deg) saturate(1.35) brightness(1.05); }
  100% { filter: hue-rotate(360deg) saturate(1.35) brightness(1.05); }
}
@keyframes mbDriftV1 {
  0%   { transform: translate3d(-6%, -4%, 0) rotate(0.0001deg); }
  50%  { transform: translate3d( 6%,  4%, 0) rotate(0.0001deg); }
  100% { transform: translate3d(-6%, -4%, 0) rotate(0.0001deg); }
}
@keyframes mbTwinkleV1 {
  0%,100% { opacity: .22; }
  50%     { opacity: .42; }
}

/* オーバーレイ本体（bgLayerの上に重ねる） */
#${SPARKLE.layerId}{
  position:absolute;
  inset:-12%;
  pointer-events:none;
  z-index:4; /* 背景より上。ミラーボール画像(z)より下/上は好みで調整 */
  mix-blend-mode: screen;
  opacity:0;
  transition: opacity .25s ease;

  /* 虹っぽい層 + キラ粒っぽい層（擬似的） */
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.45) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 120px 120px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.35) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 160px 160px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.32) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 140px 140px,
    conic-gradient(from 0deg,
      rgba(255,  0,130,.22),
      rgba(255,140,  0,.22),
      rgba(255,255,  0,.22),
      rgba(  0,255,140,.22),
      rgba(  0,180,255,.22),
      rgba(120,  0,255,.22),
      rgba(255,  0,130,.22)
    );

  animation:
    mbHueSpinV1 6.5s linear infinite,
    mbDriftV1 3.8s ease-in-out infinite,
    mbTwinkleV1 1.6s ease-in-out infinite;
  will-change: transform, filter, opacity;
}
`;
    document.head.appendChild(st);
  }

  function ensureSparkleLayer() {
    ensureSparkleStyle();

    // bgLayerが absolute 子を持てるように（念のため）
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";

    let layer = document.getElementById(SPARKLE.layerId);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = SPARKLE.layerId;
      bgLayer.appendChild(layer);
    }
    return layer;
  }

  function setSparkleEnabled(enabled) {
    const layer = ensureSparkleLayer();
    layer.style.opacity = enabled ? "1" : "0";
  }

  // =========================
  // Time-based background
  // =========================

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

    // 背景は朝昼夜で切替
    if (force || phase !== last) {
      last = phase;

      bgLayer.style.background = THEMES[phase];
      if (field) field.style.background = THEMES[phase];

      window.WB?.emit?.("bg:changed", { phase, hour: h });
    }

    // ✅ mirrorball設置時だけキラキラON（phaseと独立）
    setSparkleEnabled(hasMirrorballOwned());
  }

  // 初回
  apply(true);

  // 1分ごと
  setInterval(() => apply(false), 60 * 1000);

  // ★ reset時に即反映（WBがある場合）
  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));

    // shop.jsが購入直後に emit する想定（入れてあるなら即反映）
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    return true;
  };

  hookWB();
  setTimeout(hookWB, 300);
})();
