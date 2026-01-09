// bgcolor.js
// ✅ 朝昼夜(JST)で背景色
// ✅ mirrorball 購入済み + 設置ON のときだけ：ミラーボール画像＋ディスコ背景＋中央上スポットライト
// ✅ 背景が黒くなる事故を避ける（bgLayer/field両方に適用）
// ✅ shop.js の ON/OFF に対応（milkpop_shop_state_v1 / WB.shop.isMirrorballEnabled）

(() => {
  "use strict";

  const field  = document.getElementById("field");
  const bgLayer= document.getElementById("bgLayer");
  if (!field || !bgLayer) return;

  /* =========================
   * Time themes (JST)
   * ========================= */
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

  /* =========================
   * Mirrorball owned/enabled
   * ========================= */
  function hasMirrorballOwned() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      const j = raw ? JSON.parse(raw) : null;
      return !!j?.mirrorball;
    } catch { return false; }
  }

  function isMirrorballEnabled() {
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      const j = raw ? JSON.parse(raw) : null;
      return (j && typeof j.mirrorballEnabled === "boolean") ? j.mirrorballEnabled : true;
    } catch {
      return true;
    }
  }

  /* =========================
   * Base layer safety
   * ========================= */
  function ensureLayerPositions() {
    // bgLayerを確実に全面にする
    const bcs = getComputedStyle(bgLayer);
    if (bcs.position === "static") bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";
    bgLayer.style.width = "100%";
    bgLayer.style.height = "100%";
    bgLayer.style.pointerEvents = "none";

    // field側も保険
    const fcs = getComputedStyle(field);
    if (fcs.position === "static") field.style.position = "fixed";
    field.style.inset = "0";
    field.style.overflow = "hidden";
  }

  /* =========================
   * Mirrorball image (put on FIELD for certainty)
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV2",
    styleId: "mirrorballImgStyleV2",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 2, // 背景より上、うさぎより下にしたいなら 2（bunnyLayerが2なら同等なので 3でもOK）
  };

  function ensureMirrorballStyle() {
    if (document.getElementById(MIRROR.styleId)) return;
    const st = document.createElement("style");
    st.id = MIRROR.styleId;
    st.textContent = `
#${MIRROR.id}{
  position:absolute;
  left:50%;
  top:${MIRROR.top}px;
  transform:translateX(-50%);
  width:${MIRROR.size}px;
  height:auto;
  z-index:${MIRROR.z};
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.28));
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorball(on) {
    ensureMirrorballStyle();

    const old = document.getElementById(MIRROR.id);
    if (!on) {
      try { old?.remove(); } catch {}
      return;
    }

    let img = old;
    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR.id;
      img.alt = "mirrorball";
      img.src = MIRROR.src;
      img.addEventListener("error", () => {
        console.warn("[bgcolor] mirrorball load failed:", MIRROR.src);
      });
      field.appendChild(img); // ★ bgLayerではなくfield直下
    } else {
      if (img.getAttribute("src") !== MIRROR.src) img.src = MIRROR.src;
    }
  }

  /* =========================
   * Disco overlay + Spotlight
   * ========================= */
  const FX = {
    styleId: "mirrorballFxStyleV2",
    wrapId:  "mirrorballFxWrapV2",
    spinId:  "mirrorballFxSpinV2",
    beamsId: "mirrorballFxBeamsV2",
    dustId:  "mirrorballFxDustV2",
    spotId:  "mirrorballFxSpotV2",
    z: 1, // bgLayer上
  };

  function ensureFxStyle() {
    if (document.getElementById(FX.styleId)) return;
    const st = document.createElement("style");
    st.id = FX.styleId;
    st.textContent = `
@keyframes mbSpinHueV2 {
  0%   { transform: rotate(0deg) scale(1.05); filter: hue-rotate(0deg) saturate(1.7) brightness(1.18); }
  100% { transform: rotate(360deg) scale(1.05); filter: hue-rotate(360deg) saturate(1.7) brightness(1.18); }
}
@keyframes mbBeamSweepV2 {
  0%   { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
  25%  { opacity: .34; }
  50%  { transform: translate3d( 45%,  12%, 0) rotate(22deg); opacity: .16; }
  75%  { opacity: .36; }
  100% { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
}
@keyframes mbDustDriftV2 {
  0%   { transform: translate3d(-2%, -1%, 0); opacity: .22; }
  50%  { transform: translate3d( 2%,  1%, 0); opacity: .45; }
  100% { transform: translate3d(-2%, -1%, 0); opacity: .22; }
}
@keyframes mbSpotPulseV2 {
  0%,100% { opacity:.35; filter: hue-rotate(0deg) saturate(1.8) brightness(1.15); }
  50%     { opacity:.60; filter: hue-rotate(180deg) saturate(1.8) brightness(1.2); }
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

/* 中心回転ライト */
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
  animation: mbSpinHueV2 5.2s linear infinite;
  will-change: transform, filter;
}

/* 走るビーム */
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
  animation: mbBeamSweepV2 2.8s ease-in-out infinite;
  will-change: transform, opacity;
}

/* キラ粒 */
#${FX.dustId}{
  position:absolute;
  inset:-12%;
  mix-blend-mode: screen;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.55) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 120px 120px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.38) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 160px 160px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.35) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 140px 140px,
    radial-gradient(circle at 80% 30%, rgba(255,255,255,.30) 0 1.2px, rgba(255,255,255,0) 3px) 0 0 / 180px 180px;
  animation: mbDustDriftV2 1.7s ease-in-out infinite;
  will-change: transform, opacity;
}

/* ★中央上から注ぐスポットライト */
#${FX.spotId}{
  position:absolute;
  left:50%;
  top:-10px;
  width:min(680px, 92vw);
  height:90vh;
  transform: translateX(-50%);
  mix-blend-mode: screen;
  pointer-events:none;
  opacity:.0;

  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.72) 0%,
      rgba(255,255,255,.35) 18%,
      rgba(255,255,255,.12) 42%,
      rgba(255,255,255,0) 70%
    ),
    conic-gradient(from 90deg at 50% 0%,
      rgba(255,  0,160,.16),
      rgba(255,180,  0,.16),
      rgba(255,255,  0,.16),
      rgba(  0,255,180,.16),
      rgba(  0,180,255,.16),
      rgba(140,  0,255,.16),
      rgba(255,  0,160,.16)
    );

  clip-path: polygon(50% 0%, 76% 100%, 24% 100%);
  filter: blur(1px);
  animation: mbSpotPulseV2 2.4s ease-in-out infinite;
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

      // bgLayer + field 両方に塗って「黒化」を根絶
      bgLayer.style.background = THEMES[phase];
      field.style.background = THEMES[phase];

      try { window.WB?.emit?.("bg:changed", { phase, hour: h }); } catch {}
    }

    const owned = hasMirrorballOwned();
    const enabled = isMirrorballEnabled();
    const on = owned && enabled;

    ensureMirrorball(on);
    setFxEnabled(on);
  }

  // 初回
  apply(true);

  // 1分ごと
  setInterval(() => apply(false), 60 * 1000);

  // 変更イベントで即反映
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
