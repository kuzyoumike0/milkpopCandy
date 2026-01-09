// bgcolor.js
// ✅ 朝昼夜(JST)で背景色
// ✅ mirrorball 購入済み + 設置ON のときだけ：
//    - 上中央に mirrorball.png を表示
//    - スポットライトを「ゆらゆら」揺らす
//    - スポットライト色が「虹色に変化」する（背景の回転ディスコ色は無し）
// ✅ 背景黒化を避ける（bgLayer/field 両方に適用）

(() => {
  "use strict";

  const field   = document.getElementById("field");
  const bgLayer = document.getElementById("bgLayer");
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

  // 無い/壊れてる時はOFF
  function isMirrorballEnabled() {
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      if (!raw) return false;
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return false;
      return !!j.mirrorballEnabled;
    } catch { return false; }
  }

  function ensureBaseLayout() {
    const bcs = getComputedStyle(bgLayer);
    if (bcs.position === "static") bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";
    bgLayer.style.pointerEvents = "none";
  }

  /* =========================
   * Mirrorball image
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV4",
    styleId: "mirrorballImgStyleV4",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 6, // スポットより上
  };

  function ensureMirrorStyle() {
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

  function setMirrorVisible(on) {
    ensureBaseLayout();
    ensureMirrorStyle();

    const old = document.getElementById(MIRROR.id);
    if (!on) { try { old?.remove(); } catch {} return; }

    let img = old;
    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR.id;
      img.alt = "mirrorball";
      img.src = MIRROR.src;
      img.addEventListener("error", () => {
        console.warn("[bgcolor] mirrorball load failed:", MIRROR.src);
      });
      bgLayer.appendChild(img);
    } else if (img.getAttribute("src") !== MIRROR.src) {
      img.src = MIRROR.src;
    }
  }

  /* =========================
   * Spotlight (Sway + Rainbow)
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleV4",
    id: "mirrorballSpotV4",
    z: 5,                 // ミラーボールより下
    width: 1200,          // ★幅（大きめ）
    heightVh: 92,         // 高さ
    swayDeg: 10,          // 左右に揺れる角度
    swaySec: 3.4,         // 揺れ周期
    hueSec: 6.2,          // 虹変化周期
    baseOpacity: 0.62,    // 基本の濃さ
  };

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;
    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbSpotSwayV4 {
  0%   { transform: translateX(-50%) rotate(-${SPOT.swayDeg}deg); }
  50%  { transform: translateX(-50%) rotate(${SPOT.swayDeg}deg); }
  100% { transform: translateX(-50%) rotate(-${SPOT.swayDeg}deg); }
}
@keyframes mbSpotPulseV4 {
  0%,100% { opacity: ${Math.max(0, SPOT.baseOpacity - 0.18)}; }
  50%     { opacity: ${Math.min(1, SPOT.baseOpacity + 0.18)}; }
}
@keyframes mbSpotHueV4 {
  0%   { filter: hue-rotate(0deg)   saturate(1.8) brightness(1.2); }
  100% { filter: hue-rotate(360deg) saturate(1.8) brightness(1.2); }
}

#${SPOT.id}{
  position:absolute;
  left:50%;
  top:-10px;

  width:min(${SPOT.width}px, 98vw);
  height:${SPOT.heightVh}vh;

  transform-origin: 50% 6%;
  z-index:${SPOT.z};
  pointer-events:none;

  /* ★スポットライト本体（白ベース） */
  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.92) 0%,
      rgba(255,255,255,.55) 18%,
      rgba(255,255,255,.22) 46%,
      rgba(255,255,255,0) 76%
    );

  /* ★光の形（上が細く、下が広い） */
  clip-path: polygon(50% 0%, 88% 100%, 12% 100%);

  /* ★虹っぽく見せる（hue-rotateが効くようにscreen合成） */
  mix-blend-mode: screen;

  /* ふんわり */
  filter: blur(1.2px);
  opacity:0;

  animation:
    mbSpotSwayV4 ${SPOT.swaySec}s ease-in-out infinite,
    mbSpotPulseV4 2.6s ease-in-out infinite,
    mbSpotHueV4 ${SPOT.hueSec}s linear infinite;

  will-change: transform, opacity, filter;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpotEl() {
    ensureBaseLayout();
    ensureSpotStyle();
    let el = document.getElementById(SPOT.id);
    if (!el) {
      el = document.createElement("div");
      el.id = SPOT.id;
      // bgLayerの後ろ側へ（先頭に）
      bgLayer.insertBefore(el, bgLayer.firstChild);
    }
    return el;
  }

  function setSpotEnabled(on) {
    const el = ensureSpotEl();
    el.style.opacity = on ? "1" : "0";
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";
  function apply(force = false) {
    ensureBaseLayout();

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;

      // ★bgLayer/field 両方へ（黒化根絶）
      bgLayer.style.background = THEMES[phase];
      field.style.background   = THEMES[phase];

      try { window.WB?.emit?.("bg:changed", { phase, hour: h }); } catch {}
    }

    const on = hasMirrorballOwned() && isMirrorballEnabled();
    setMirrorVisible(on);
    setSpotEnabled(on);
  }

  // 初回
  apply(true);

  // 1分ごと
  setInterval(() => apply(false), 60 * 1000);

  // WB hook
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
