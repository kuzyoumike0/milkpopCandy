// bgcolor.js
// 朝・昼・夜をJST判定で #bgLayer に適用
// ✅ mirrorball（購入済み＆設置ON）で「ミラーボール表示」＋「ディスコ演出ON」

(() => {
  "use strict";

  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

  // ★ bgLayer が見えるように保険（style.cssが壊れてても最低限表示）
  function ensureBgLayerFill() {
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "absolute";
    if (!bgLayer.style.inset) bgLayer.style.inset = "0";
    if (!bgLayer.style.left) bgLayer.style.left = "0";
    if (!bgLayer.style.top) bgLayer.style.top = "0";
    if (!bgLayer.style.width) bgLayer.style.width = "100%";
    if (!bgLayer.style.height) bgLayer.style.height = "100%";
    bgLayer.style.pointerEvents = "none";
  }
  ensureBgLayerFill();

  /* =========================
   * Time themes (JST)
   * ========================= */
  const MORNING = { start: 5, end: 10 };
  const DAY = { start: 10, end: 17 };

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

  function isMirrorballEnabled() {
    try {
      const fn = window.WB?.shop?.isMirrorballEnabled;
      if (typeof fn === "function") return !!fn();
    } catch {}
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      const j = raw ? JSON.parse(raw) : null;
      if (!j || typeof j !== "object") return true;
      return !!j.mirrorballEnabled;
    } catch { return true; }
  }

  /* =========================
   * Mirrorball img
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV2",
    styleId: "mirrorballImgStyleV2",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 8,
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
      img.src = MIRROR.src;
      img.alt = "mirrorball";
      bgLayer.appendChild(img);
    }
  }

  /* =========================
   * Disco overlay
   * ========================= */
  const DISCO = {
    styleId: "mirrorballDiscoStyleV2",
    wrapId:  "mirrorballDiscoWrapV2",
    spinId:  "mirrorballDiscoSpinV2",
    beamsId: "mirrorballDiscoBeamsV2",
    dustId:  "mirrorballDiscoDustV2",
    z: 6,
  };

  function ensureDiscoStyle() {
    if (document.getElementById(DISCO.styleId)) return;
    const st = document.createElement("style");
    st.id = DISCO.styleId;
    st.textContent = `
@keyframes mbSpinHueV3 {
  0%   { transform: rotate(0deg) scale(1.06); filter: hue-rotate(0deg) saturate(1.8) brightness(1.2); }
  100% { transform: rotate(360deg) scale(1.06); filter: hue-rotate(360deg) saturate(1.8) brightness(1.2); }
}
@keyframes mbBeamSweepV3 {
  0%   { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
  30%  { opacity: .40; }
  60%  { transform: translate3d( 45%,  15%, 0) rotate(22deg); opacity: .18; }
  100% { transform: translate3d(-45%, -25%, 0) rotate(22deg); opacity: .10; }
}
@keyframes mbDustDriftV3 {
  0%   { transform: translate3d(-2%, -1%, 0); opacity: .18; }
  50%  { transform: translate3d( 2%,  1%, 0); opacity: .45; }
  100% { transform: translate3d(-2%, -1%, 0); opacity: .18; }
}

#${DISCO.wrapId}{
  position:absolute;
  inset:0;
  z-index:${DISCO.z};
  pointer-events:none;
  overflow:hidden;
  opacity:0;
  transition: opacity .25s ease;
}

/* 回転ライト */
#${DISCO.spinId}{
  position:absolute;
  left:50%;
  top:-10vmax;
  width:160vmax;
  height:160vmax;
  transform: translateX(-50%);
  transform-origin: 50% 20%;
  mix-blend-mode: screen;
  opacity:.65;

  background:
    radial-gradient(circle at 50% 18%, rgba(255,255,255,.55) 0 10%, rgba(255,255,255,0) 34%),
    conic-gradient(from 0deg,
      rgba(255,  0,160,.26),
      rgba(255,180,  0,.26),
      rgba(255,255,  0,.26),
      rgba(  0,255,180,.26),
      rgba(  0,180,255,.26),
      rgba(140,  0,255,.26),
      rgba(255,  0,160,.26)
    );
  animation: mbSpinHueV3 4.6s linear infinite;
}

/* 走るビーム */
#${DISCO.beamsId}{
  position:absolute;
  inset:-35%;
  mix-blend-mode: screen;
  background:
    repeating-linear-gradient(
      115deg,
      rgba(255,255,255,0) 0px,
      rgba(255,255,255,0) 18px,
      rgba(255,255,255,.22) 30px,
      rgba(255,255,255,0) 48px,
      rgba(255,255,255,0) 70px
    );
  filter: saturate(1.5) contrast(1.1);
  animation: mbBeamSweepV3 2.2s ease-in-out infinite;
}

/* キラ粒 */
#${DISCO.dustId}{
  position:absolute;
  inset:-12%;
  mix-blend-mode: screen;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.65) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 110px 110px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.45) 0 1.6px, rgba(255,255,255,0) 3px) 0 0 / 150px 150px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.40) 0 1.6px, rgba(255,255,255,0) 3px) 0 0 / 130px 130px,
    radial-gradient(circle at 80% 30%, rgba(255,255,255,.36) 0 1.2px, rgba(255,255,255,0) 3px) 0 0 / 170px 170px;
  animation: mbDustDriftV3 1.35s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureDiscoLayers() {
    ensureDiscoStyle();
    let wrap = document.getElementById(DISCO.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = DISCO.wrapId;

      const spin = document.createElement("div");
      spin.id = DISCO.spinId;

      const beams = document.createElement("div");
      beams.id = DISCO.beamsId;

      const dust = document.createElement("div");
      dust.id = DISCO.dustId;

      wrap.appendChild(spin);
      wrap.appendChild(beams);
      wrap.appendChild(dust);

      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  function setDiscoEnabled(on) {
    const wrap = ensureDiscoLayers();
    wrap.style.opacity = on ? "1" : "0";
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";
  function apply(force = false) {
    ensureBgLayerFill();

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      bgLayer.style.background = THEMES[phase];
      if (field) field.style.background = THEMES[phase];
      window.WB?.emit?.("bg:changed", { phase, hour: h });
    }

    const on = hasMirrorballOwned() && isMirrorballEnabled();
    ensureMirrorball(on);
    setDiscoEnabled(on);
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
