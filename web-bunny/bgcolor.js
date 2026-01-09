// bgcolor.js
// ✔ 朝昼夜(JST)で背景色
// ✔ mirrorball 購入＋設置ON時：
//    - 上中央にミラーボール
//    - 虹色スポットライトのみ（揺れる）
// ✖ 回転ディスコ色は完全削除
// ✔ 黒背景化バグ根絶

(() => {
  "use strict";

  const field   = document.getElementById("field");
  const bgLayer = document.getElementById("bgLayer");
  if (!field || !bgLayer) return;

  /* =========================
   * 時間帯テーマ（JST）
   * ========================= */
  const MORNING = { start: 5,  end: 10 };
  const DAY     = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  function getJSTHour() {
    const p = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    return Number(p.find(x => x.type === "hour")?.value ?? 0);
  }

  function phaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  /* =========================
   * Mirrorball 所有・設置判定
   * ========================= */
  function isOwned() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    try {
      const j = JSON.parse(localStorage.getItem("milkpop_shop_owned_v1") || "{}");
      return !!j.mirrorball;
    } catch { return false; }
  }

  function isEnabled() {
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const j = JSON.parse(localStorage.getItem("milkpop_shop_state_v1") || "{}");
      return !!j.mirrorballEnabled;
    } catch { return false; }
  }

  /* =========================
   * レイアウト保険
   * ========================= */
  function ensureBase() {
    if (getComputedStyle(bgLayer).position === "static") {
      bgLayer.style.position = "absolute";
    }
    bgLayer.style.inset = "0";
    bgLayer.style.pointerEvents = "none";
  }

  /* =========================
   * ミラーボール画像
   * ========================= */
  const MIRROR_ID = "mirrorballImgFinal";
  if (!document.getElementById("mirrorballStyleFinal")) {
    const st = document.createElement("style");
    st.id = "mirrorballStyleFinal";
    st.textContent = `
#${MIRROR_ID}{
  position:absolute;
  left:50%;
  top:8px;
  transform:translateX(-50%);
  width:140px;
  z-index:6;
  pointer-events:none;
  filter: drop-shadow(0 14px 30px rgba(0,0,0,.28));
}`;
    document.head.appendChild(st);
  }

  function setMirror(on) {
    ensureBase();
    let el = document.getElementById(MIRROR_ID);
    if (!on) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("img");
      el.id = MIRROR_ID;
      el.src = "./assets/bg/mirrorball.png";
      el.alt = "mirrorball";
      bgLayer.appendChild(el);
    }
  }

  /* =========================
   * スポットライト（揺れ＋虹）
   * ========================= */
  const SPOT_ID = "mirrorballSpotFinal";
  if (!document.getElementById("spotStyleFinal")) {
    const st = document.createElement("style");
    st.id = "spotStyleFinal";
    st.textContent = `
@keyframes spotSway {
  0%   { transform: translateX(-50%) rotate(-10deg); }
  50%  { transform: translateX(-50%) rotate(10deg); }
  100% { transform: translateX(-50%) rotate(-10deg); }
}
@keyframes spotHue {
  0%   { filter:hue-rotate(0deg)   saturate(1.8) brightness(1.2); }
  100% { filter:hue-rotate(360deg) saturate(1.8) brightness(1.2); }
}
#${SPOT_ID}{
  position:absolute;
  left:50%;
  top:-12px;
  width:1200px;
  height:92vh;
  transform-origin:50% 5%;
  clip-path:polygon(50% 0%, 88% 100%, 12% 100%);
  background:radial-gradient(circle at 50% 0%,
    rgba(255,255,255,.9) 0%,
    rgba(255,255,255,.55) 20%,
    rgba(255,255,255,.25) 45%,
    rgba(255,255,255,0) 75%
  );
  mix-blend-mode:screen;
  filter:blur(1.2px);
  z-index:5;
  opacity:0;
  pointer-events:none;
  animation:
    spotSway 3.6s ease-in-out infinite,
    spotHue  6.2s linear infinite;
}`;
    document.head.appendChild(st);
  }

  function setSpot(on) {
    ensureBase();
    let el = document.getElementById(SPOT_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = SPOT_ID;
      bgLayer.insertBefore(el, bgLayer.firstChild);
    }
    el.style.opacity = on ? "1" : "0";
  }

  /* =========================
   * apply
   * ========================= */
  let last = "";
  function apply(force = false) {
    ensureBase();

    const phase = phaseByHour(getJSTHour());
    if (force || phase !== last) {
      last = phase;
      bgLayer.style.background = THEMES[phase];
      field.style.background   = THEMES[phase];
    }

    const on = isOwned() && isEnabled();
    setMirror(on);
    setSpot(on);
  }

  apply(true);
  setInterval(() => apply(false), 60_000);

  const hook = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:ready", apply);
    window.WB.on("bg:mirrorball_changed", apply);
    return true;
  };
  hook();
  setTimeout(hook, 300);
})();
