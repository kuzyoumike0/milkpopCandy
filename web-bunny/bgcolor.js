// bgcolor.js（FIX版）
// ✅ #bgLayer が高さ0で見えない問題を根絶（強制CSS注入）
// ✅ 朝昼夜(JST)で背景色
// ✅ mirrorball：購入済み && 設置ON の時だけ表示
// ✅ スポット2本（中央上＝ミラーボール位置から出る）
// ✅ スポットは揺れる＋虹色変化
// ✅ 夜だけ強化
// ✖ 背景くるくる回るディスコ色は出さない

(() => {
  "use strict";

  const field      = document.getElementById("field");
  const bgLayer    = document.getElementById("bgLayer");
  const bunnyLayer = document.getElementById("bunnyLayer");
  if (!field || !bgLayer || !bunnyLayer) {
    console.warn("[bgcolor] required layers missing", { field: !!field, bgLayer: !!bgLayer, bunnyLayer: !!bunnyLayer });
    return;
  }

  /* =========================
   * 強制レイヤーCSS（これが重要）
   * ========================= */
  const LAYER_STYLE_ID = "bgcolorLayerFixStyleV1";
  function ensureLayerCSS() {
    if (document.getElementById(LAYER_STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = LAYER_STYLE_ID;
    st.textContent = `
/* bgcolor.js inject */
#field{ position:fixed !important; inset:0 !important; overflow:hidden !important; }
#bgLayer{
  position:absolute !important;
  inset:0 !important;
  width:100% !important;
  height:100% !important;
  z-index:0 !important;
  pointer-events:none !important;
}
#tenkiLayer{ position:absolute !important; inset:0 !important; z-index:2 !important; pointer-events:none !important; }
#bunnyLayer{ position:absolute !important; inset:0 !important; z-index:3 !important; }
#coinLayer{  position:absolute !important; inset:0 !important; z-index:4 !important; }
`;
    document.head.appendChild(st);
  }

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
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === "hour")?.value ?? 0);
  }
  function phaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  /* =========================
   * Mirrorball owned / enabled
   * ========================= */
  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_STATE = "milkpop_shop_state_v1";

  function isOwnedMirrorball() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    try {
      const j = JSON.parse(localStorage.getItem(LS_OWNED) || "{}");
      return !!j.mirrorball;
    } catch { return false; }
  }

  function isEnabledMirrorball() {
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const j = JSON.parse(localStorage.getItem(LS_STATE) || "{}");
      if (typeof j.mirrorballEnabled === "boolean") return !!j.mirrorballEnabled;
      return true; // state未保存ならON扱い
    } catch { return true; }
  }

  /* =========================
   * ミラーボール（bgLayer）
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgFinalV1",
    styleId: "mirrorballImgFinalStyleV1",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 6,
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
  filter: drop-shadow(0 14px 30px rgba(0,0,0,.28));
}`;
    document.head.appendChild(st);
  }

  function setMirrorball(on) {
    ensureLayerCSS();
    ensureMirrorStyle();

    let img = document.getElementById(MIRROR.id);
    if (!on) { img?.remove(); return; }

    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR.id;
      img.alt = "mirrorball";
      img.src = MIRROR.src;
      img.draggable = false;
      img.addEventListener("error", () => console.warn("[bgcolor] mirrorball load failed:", MIRROR.src));
      bgLayer.appendChild(img);
    }
  }

  /* =========================
   * スポットライト（bunnyLayerに載せる）
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleV1",
    wrapId:  "mirrorballSpotWrapV1",
    leftId:  "mirrorballSpotLeftV1",
    rightId: "mirrorballSpotRightV1",
    z: 2147480000,
  };

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;
    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbHueSpotV1 {
  0%   { filter: hue-rotate(0deg) saturate(2.2) brightness(var(--spot-bright,1.15)); }
  100% { filter: hue-rotate(360deg) saturate(2.2) brightness(var(--spot-bright,1.15)); }
}
@keyframes mbSwayLeftV1 {
  0%   { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) - 8deg)); }
  50%  { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) + 8deg)); }
  100% { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) - 8deg)); }
}
@keyframes mbSwayRightV1 {
  0%   { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) + 8deg)); }
  50%  { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) - 8deg)); }
  100% { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) + 8deg)); }
}

#${SPOT.wrapId}{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:${SPOT.z};
  opacity:0;
  transition: opacity .22s ease;
}

#${SPOT.wrapId} .spot{
  --spot-origin-x: 50%;
  --spot-origin-y: 96px;
  --spot-width: 1700px;
  --spot-height: 92vh;
  --spot-opacity: .46;
  --spot-bright: 1.18;
  --spot-angle: 0deg;

  position:absolute;
  left: var(--spot-origin-x);
  top:  var(--spot-origin-y);

  width: var(--spot-width);
  height: var(--spot-height);

  transform-origin: 50% 0%;
  clip-path: polygon(50% 0%, 92% 100%, 8% 100%);

  mix-blend-mode: screen;
  opacity: var(--spot-opacity);

  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.92) 0%,
      rgba(255,255,255,.45) 18%,
      rgba(255,255,255,0) 62%
    ),
    linear-gradient(90deg,
      rgba(255,  0,160,.58),
      rgba(255,180,  0,.58),
      rgba(255,255,  0,.54),
      rgba(  0,255,180,.58),
      rgba(  0,180,255,.58),
      rgba(140,  0,255,.58),
      rgba(255,  0,160,.58)
    );

  filter: blur(1.2px);
  will-change: transform, filter, opacity;
}

#${SPOT.leftId}{
  animation: mbHueSpotV1 6.2s linear infinite, mbSwayLeftV1 3.2s ease-in-out infinite;
}
#${SPOT.rightId}{
  animation: mbHueSpotV1 6.2s linear infinite, mbSwayRightV1 3.2s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpotDOM() {
    ensureLayerCSS();
    ensureSpotStyle();

    let wrap = document.getElementById(SPOT.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = SPOT.wrapId;

      const l = document.createElement("div");
      l.id = SPOT.leftId;
      l.className = "spot";

      const r = document.createElement("div");
      r.id = SPOT.rightId;
      r.className = "spot";

      wrap.appendChild(l);
      wrap.appendChild(r);

      bunnyLayer.appendChild(wrap);
    }
    return wrap;
  }

  function calcOriginY() {
    // ミラーボール中心少し下を光源に（見た目が自然）
    return Math.round(MIRROR.top + MIRROR.size * 0.62);
  }

  function setSpotlights(on, phase) {
    const wrap = ensureSpotDOM();
    const l = document.getElementById(SPOT.leftId);
    const r = document.getElementById(SPOT.rightId);

    if (!on) {
      wrap.style.opacity = "0";
      return;
    }

    const originY = calcOriginY();
    const night = (phase === "night");

    const width  = night ? "2100px" : "1700px";
    const height = night ? "98vh"   : "92vh";
    const op     = night ? "0.74"   : "0.46";
    const bright = night ? "1.45"   : "1.18";

    const angleL = night ? "-19deg" : "-14deg";
    const angleR = night ? "19deg"  : "14deg";

    for (const el of [l, r]) {
      if (!el) continue;
      el.style.setProperty("--spot-origin-x", "50%");
      el.style.setProperty("--spot-origin-y", `${originY}px`);
      el.style.setProperty("--spot-width", width);
      el.style.setProperty("--spot-height", height);
      el.style.setProperty("--spot-opacity", op);
      el.style.setProperty("--spot-bright", bright);
    }
    if (l) l.style.setProperty("--spot-angle", angleL);
    if (r) r.style.setProperty("--spot-angle", angleR);

    wrap.style.opacity = "1";
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";
  function apply(force = false) {
    ensureLayerCSS();

    const phase = phaseByHour(getJSTHour());
    if (force || phase !== lastPhase) {
      lastPhase = phase;
      bgLayer.style.background = THEMES[phase];
      field.style.background   = THEMES[phase];
      window.WB?.emit?.("bg:changed", { phase });
    }

    const on = isOwnedMirrorball() && isEnabledMirrorball();
    setMirrorball(on);
    setSpotlights(on, phase);
  }

  apply(true);
  setInterval(() => apply(false), 60_000);

  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    window.WB.on("shop:mirrorball_toggle", () => apply(true));
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
