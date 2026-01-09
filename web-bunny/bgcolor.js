// bgcolor.js
// 朝・昼・夜を「日本時間(JST)」で判定して #bgLayer に直接適用（確実）
// reset後に背景が黒くなる対策：イベントでも再適用
// ✅ mirrorball（購入済み）なら「上中央に設置」＋「ディスコ背景」ON（回転ライト＋走るビーム＋キラ粒＋中央上スポットライト）
// ✅ FIX: bgLayer のサイズ/position を強制して「見えない」を根絶
// ✅ FIX: shop状態(mirrorballEnabled) を確実に参照して「外す」を反映

(() => {
  "use strict";

  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

  /* =========================
   * ensure bgLayer is visible area
   * ========================= */
  function ensureBgLayerBox() {
    try {
      // #bgLayer が空divでCSSが効いてない環境でも確実に「画面いっぱい」にする
      const st = bgLayer.style;
      if (!st.position || st.position === "static") st.position = "absolute";
      if (!st.inset) st.inset = "0";
      if (!st.width) st.width = "100%";
      if (!st.height) st.height = "100%";
      if (!st.overflow) st.overflow = "hidden";
      if (!st.pointerEvents) st.pointerEvents = "none";

      // field側も黒落ち防止
      if (field) {
        const fs = field.style;
        if (!fs.position || fs.position === "static") fs.position = "relative";
        if (!fs.overflow) fs.overflow = "hidden";
      }
    } catch {}
  }
  ensureBgLayerBox();

  /* =========================
   * Time themes (JST)
   * ========================= */
  const MORNING = { start: 5, end: 10 };
  const DAY = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day: "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night: "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  function getJSTHour() {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  }

  function getPhaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  /* =========================
   * Mirrorball owned / enabled
   * ========================= */
  function hasMirrorballOwned() {
    // WB優先
    try {
      if (window.WB?.shop?.isOwned?.("mirrorball")) return true;
    } catch {}
    // LSフォールバック
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j?.mirrorball;
    } catch {
      return false;
    }
  }

  function isMirrorballEnabled() {
    // WB優先
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}

    // LSフォールバック
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j.mirrorballEnabled === "boolean") return j.mirrorballEnabled;
    } catch {}

    // 既定ON
    return true;
  }

  /* =========================
   * Mirrorball image placement
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV2",
    styleId: "mirrorballImgStyleV2",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 20, // 光より上
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
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.32));
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorball(on) {
    ensureBgLayerBox();
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
      img.draggable = false;
      img.addEventListener("error", () => console.warn("[bgcolor] mirrorball load failed:", MIRROR.src));
      bgLayer.appendChild(img);
    } else {
      if (img.getAttribute("src") !== MIRROR.src) img.src = MIRROR.src;
    }
  }

  /* =========================
   * Disco overlay layers
   * ========================= */
  const DISCO = {
    styleId: "mirrorballDiscoStyleV3",
    wrapId: "mirrorballDiscoWrapV3",
    spotId: "mirrorballDiscoSpotV3",   // ★スポットライト
    spinId: "mirrorballDiscoSpinV3",   // 回転ライト
    beamsId: "mirrorballDiscoBeamsV3", // 走るビーム
    dustId: "mirrorballDiscoDustV3",   // キラ粒
    z: 10, // bgLayer内
  };

  function ensureDiscoStyle() {
    if (document.getElementById(DISCO.styleId)) return;

    const st = document.createElement("style");
    st.id = DISCO.styleId;
    st.textContent = `
@keyframes mbSpinHueV3 {
  0%   { transform: rotate(0deg) scale(1.05); filter: hue-rotate(0deg) saturate(1.8) brightness(1.18); }
  100% { transform: rotate(360deg) scale(1.05); filter: hue-rotate(360deg) saturate(1.8) brightness(1.18); }
}
@keyframes mbBeamSweepV3 {
  0%   { transform: translate3d(-40%, -20%, 0) rotate(22deg); opacity: .18; }
  25%  { opacity: .52; }
  50%  { transform: translate3d( 40%,  10%, 0) rotate(22deg); opacity: .24; }
  75%  { opacity: .58; }
  100% { transform: translate3d(-40%, -20%, 0) rotate(22deg); opacity: .18; }
}
@keyframes mbDustDriftV3 {
  0%   { transform: translate3d(-2%, -1%, 0); opacity: .30; }
  50%  { transform: translate3d( 2%,  1%, 0); opacity: .60; }
  100% { transform: translate3d(-2%, -1%, 0); opacity: .30; }
}
@keyframes mbSpotPulseV3 {
  0%,100% { opacity: .55; transform: translateX(-50%) scaleY(1); }
  50%     { opacity: .85; transform: translateX(-50%) scaleY(1.05); }
}
@keyframes mbSpotSweepV3 {
  0%   { transform: translateX(-50%) rotate(-5deg); }
  50%  { transform: translateX(-50%) rotate( 5deg); }
  100% { transform: translateX(-50%) rotate(-5deg); }
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

/* ★中央上スポットライト：clip-path + フォールバック(ぼかし円錐) */
#${DISCO.spotId}{
  position:absolute;
  left:50%;
  top:-22px;
  width:140vmin;
  height:140vmin;
  transform: translateX(-50%);
  transform-origin: 50% 0%;
  pointer-events:none;

  /* clip-path が効かない環境対策 */
  -webkit-clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);

  /* 目に見える強さ（昼でも出るように濃いめ） */
  background:
    radial-gradient(circle at 50% 6%,
      rgba(255,255,255,.95) 0%,
      rgba(255,255,255,.45) 16%,
      rgba(255,255,255,.18) 36%,
      rgba(255,255,255,0) 72%
    ),
    conic-gradient(from 180deg at 50% 12%,
      rgba(255,  0,160,.18),
      rgba(255,180,  0,.18),
      rgba(255,255,  0,.18),
      rgba(  0,255,180,.18),
      rgba(  0,180,255,.18),
      rgba(140,  0,255,.18),
      rgba(255,  0,160,.18)
    );

  /* blend を screen + 通常見えるように少しだけ足す */
  mix-blend-mode: screen;
  filter: blur(.2px) saturate(1.4) brightness(1.15);
  opacity: 1;

  animation:
    mbSpotPulseV3 1.7s ease-in-out infinite,
    mbSpotSweepV3 2.8s ease-in-out infinite;
  will-change: transform, opacity;
}

/* 回転するディスコライト */
#${DISCO.spinId}{
  position:absolute;
  left:50%;
  top:0;
  width:160vmax;
  height:160vmax;
  transform: translateX(-50%);
  transform-origin: 50% 18%;
  mix-blend-mode: screen;
  opacity:.62;

  background:
    radial-gradient(circle at 50% 12%, rgba(255,255,255,.65) 0 12%, rgba(255,255,255,0) 38%),
    conic-gradient(from 0deg,
      rgba(255,  0,160,.26),
      rgba(255,180,  0,.26),
      rgba(255,255,  0,.26),
      rgba(  0,255,180,.26),
      rgba(  0,180,255,.26),
      rgba(140,  0,255,.26),
      rgba(255,  0,160,.26)
    );
  animation: mbSpinHueV3 4.8s linear infinite;
  will-change: transform, filter;
}

/* 走るビーム */
#${DISCO.beamsId}{
  position:absolute;
  inset:-30%;
  mix-blend-mode: screen;
  background:
    repeating-linear-gradient(
      115deg,
      rgba(255,255,255,0) 0px,
      rgba(255,255,255,0) 22px,
      rgba(255,255,255,.22) 34px,
      rgba(255,255,255,0) 52px,
      rgba(255,255,255,0) 76px
    );
  filter: saturate(1.35) contrast(1.08);
  animation: mbBeamSweepV3 2.6s ease-in-out infinite;
  will-change: transform, opacity;
}

/* キラ粒 */
#${DISCO.dustId}{
  position:absolute;
  inset:-12%;
  mix-blend-mode: screen;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.70) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 120px 120px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.48) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 160px 160px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.42) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 140px 140px,
    radial-gradient(circle at 80% 30%, rgba(255,255,255,.36) 0 1.2px, rgba(255,255,255,0) 3px) 0 0 / 180px 180px;
  filter: saturate(1.4);
  animation: mbDustDriftV3 1.5s ease-in-out infinite;
  will-change: transform, opacity;
}
`;
    document.head.appendChild(st);
  }

  function ensureDiscoLayers() {
    ensureBgLayerBox();
    ensureDiscoStyle();

    let wrap = document.getElementById(DISCO.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = DISCO.wrapId;

      const spot = document.createElement("div");
      spot.id = DISCO.spotId;

      const spin = document.createElement("div");
      spin.id = DISCO.spinId;

      const beams = document.createElement("div");
      beams.id = DISCO.beamsId;

      const dust = document.createElement("div");
      dust.id = DISCO.dustId;

      wrap.appendChild(spot);
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
    ensureBgLayerBox();

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      bgLayer.style.background = THEMES[phase];
      if (field) field.style.background = THEMES[phase];
      window.WB?.emit?.("bg:changed", { phase, hour: h });
    }

    const owned = hasMirrorballOwned();
    const enabled = isMirrorballEnabled();
    const on = owned && enabled;

    ensureMirrorball(on);
    setDiscoEnabled(on);
  }

  // 初回
  apply(true);

  // 1分ごと
  setInterval(() => apply(false), 60 * 1000);

  /* =========================
   * WB hook
   * ========================= */
  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true)); // 購入/設置切替
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
