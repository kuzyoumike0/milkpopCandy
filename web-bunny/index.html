// bgcolor.js
// ✅ 朝昼夜(JST)で背景色
// ✅ mirrorball 購入済み + 設置ON のときだけ：ディスコ背景＋中央上スポットライト（太め）
// ✅ 背景黒化を避ける（bgLayer/field 両方に適用）

(() => {
  "use strict";

  const field  = document.getElementById("field");
  const bgLayer= document.getElementById("bgLayer");
  if (!field || !bgLayer) return;

  const MORNING = { start: 5,  end: 10 };
  const DAY     = { start: 10, end: 17 };

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

  function hasMirrorballOwned() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      const j = raw ? JSON.parse(raw) : null;
      return !!j?.mirrorball;
    } catch { return false; }
  }

  // ★ここが重要：読めない時は OFF（勝手にONへ戻さない）
  function isMirrorballEnabled() {
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      if (!raw) return false;               // ★状態が無い＝OFF
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return false;
      return !!j.mirrorballEnabled;
    } catch {
      return false;
    }
  }

  function ensureLayerPositions() {
    const bcs = getComputedStyle(bgLayer);
    if (bcs.position === "static") bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";
    bgLayer.style.width = "100%";
    bgLayer.style.height = "100%";
    bgLayer.style.pointerEvents = "none";

    const fcs = getComputedStyle(field);
    if (fcs.position === "static") field.style.position = "fixed";
    field.style.inset = "0";
    field.style.overflow = "hidden";
  }

  /* =========================
   * FX (disco + spotlight)
   * ========================= */
  const FX = {
    styleId: "mirrorballFxStyleV3",
    wrapId:  "mirrorballFxWrapV3",
    spinId:  "mirrorballFxSpinV3",
    beamsId: "mirrorballFxBeamsV3",
    dustId:  "mirrorballFxDustV3",
    spotId:  "mirrorballFxSpotV3",
    z: 1,
  };

  function ensureFxStyle() {
    if (document.getElementById(FX.styleId)) return;
    const st = document.createElement("style");
    st.id = FX.styleId;
    st.textContent = `
@keyframes mbSpinHueV3 {
  0%   { transform: rotate(0deg) scale(1.05); filter: hue-rotate(0deg) saturate(1.7) brightness(1.18); }
  100% { transform: rotate(360deg) scale(1.05); filter: hue-rotate(360deg) saturate(1.7) brightness(1.18); }
}
@keyframes mbBeamSweepV3 {
  0%   { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
  25%  { opacity: .34; }
  50%  { transform: translate3d( 45%,  12%, 0) rotate(22deg); opacity: .16; }
  75%  { opacity: .36; }
  100% { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
}
@keyframes mbDustDriftV3 {
  0%   { transform: translate3d(-2%, -1%, 0); opacity: .22; }
  50%  { transform: translate3d( 2%,  1%, 0); opacity: .45; }
  100% { transform: translate3d(-2%, -1%, 0); opacity: .22; }
}
@keyframes mbSpotPulseV3 {
  0%,100% { opacity:.38; filter: hue-rotate(0deg) saturate(1.9) brightness(1.15); }
  50%     { opacity:.72; filter: hue-rotate(180deg) saturate(1.9) brightness(1.22); }
}

#${FX.wrapId}{
  position:absolute;
  inset:0;
  z-index:${FX.z};
  pointer-events:none;
  overflow:hidden;
  opacity:0;
  transition: opacity .25s ease;
}
#${FX.spinId}{
  position:absolute;
  left:50%;
  top:-20vmax;
  width:140vmax;
  height:140vmax;
  transform: translateX(-50%);
  transform-origin: 50% 20%;
  mix-blend-mode: screen;
  opacity:.55;
  background:
    radial-gradient(circle at 50% 18%, rgba(255,255,255,.55) 0 12%, rgba(255,255,255,0) 38%),
    conic-gradient(from 0deg,
      rgba(255,  0,160,.22),
      rgba(255,180,  0,.22),
      rgba(255,255,  0,.22),
      rgba(  0,255,180,.22),
      rgba(  0,180,255,.22),
      rgba(140,  0,255,.22),
      rgba(255,  0,160,.22)
    );
  animation: mbSpinHueV3 5.2s linear infinite;
  will-change: transform, filter;
}
#${FX.beamsId}{
  position:absolute;
  inset:-35%;
  mix-blend-mode: screen;
  background:
    repeating-linear-gradient(
      115deg,
      rgba(255,255,255,0) 0px,
      rgba(255,255,255,0) 24px,
      rgba(255,255,255,.18) 34px,
      rgba(255,255,255,0) 52px,
      rgba(255,255,255,0) 74px
    );
  filter: saturate(1.35) contrast(1.08);
  animation: mbBeamSweepV3 2.8s ease-in-out infinite;
  will-change: transform, opacity;
}
#${FX.dustId}{
  position:absolute;
  inset:-12%;
  mix-blend-mode: screen;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.55) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 120px 120px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.38) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 160px 160px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.35) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 140px 140px,
    radial-gradient(circle at 80% 30%, rgba(255,255,255,.30) 0 1.2px, rgba(255,255,255,0) 3px) 0 0 / 180px 180px;
  animation: mbDustDriftV3 1.7s ease-in-out infinite;
  will-change: transform, opacity;
}

/* ★中央上スポットライト：幅を大きく */
#${FX.spotId}{
  position:absolute;
  left:50%;
  top:-10px;

  width:min(980px, 98vw);   /* ★太くした */
  height:92vh;

  transform: translateX(-50%);
  mix-blend-mode: screen;
  pointer-events:none;
  opacity:0;

  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.78) 0%,
      rgba(255,255,255,.38) 18%,
      rgba(255,255,255,.14) 46%,
      rgba(255,255,255,0) 74%
    ),
    conic-gradient(from 90deg at 50% 0%,
      rgba(255,  0,160,.18),
      rgba(255,180,  0,.18),
      rgba(255,255,  0,.18),
      rgba(  0,255,180,.18),
      rgba(  0,180,255,.18),
      rgba(140,  0,255,.18),
      rgba(255,  0,160,.18)
    );

  /* ★扇を太く（下端を広げる） */
  clip-path: polygon(50% 0%, 84% 100%, 16% 100%);

  filter: blur(1px);
  animation: mbSpotPulseV3 2.4s ease-in-out infinite;
  will-change: opacity, filter;
}
`;
    document.head.appendChild(st);
  }

  function ensureFxWrap() {
    ensureFxStyle();
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";

    let wrap = document.getElementById(FX.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = FX.wrapId;

      const spin = document.createElement("div"); spin.id = FX.spinId;
      const beams = document.createElement("div"); beams.id = FX.beamsId;
      const dust = document.createElement("div"); dust.id = FX.dustId;
      const spot = document.createElement("div"); spot.id = FX.spotId;

      wrap.appendChild(spin);
      wrap.appendChild(beams);
      wrap.appendChild(dust);
      wrap.appendChild(spot);

      bgLayer.appendChild(wrap);
    }
    return wrap;
  }

  function setFxEnabled(on) {
    const wrap = ensureFxWrap();
    wrap.style.opacity = on ? "1" : "0";
    const spot = document.getElementById(FX.spotId);
    if (spot) spot.style.opacity = on ? "1" : "0";
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";
  function apply(force = false) {
    ensureLayerPositions();

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      bgLayer.style.background = THEMES[phase];
      field.style.background = THEMES[phase];
      try { window.WB?.emit?.("bg:changed", { phase, hour: h }); } catch {}
    }

    const on = hasMirrorballOwned() && isMirrorballEnabled();
    setFxEnabled(on);
  }

  apply(true);
  setInterval(() => apply(false), 60 * 1000);

  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
