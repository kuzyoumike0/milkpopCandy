// bgcolor.js
// 朝・昼・夜を「日本時間(JST)」で判定して #bgLayer に直接適用（確実）
// reset後に背景が黒くなる対策：イベントでも再適用
// ✅ mirrorball（購入済み）なら「上中央に設置」＋「ディスコ背景」ON（回転ライト＋走るビーム＋キラ粒＋中央上スポットライト）

(() => {
  "use strict";

  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

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
   * Mirrorball owned? / enabled?
   * ========================= */
  function hasMirrorballOwned() {
    try {
      if (window.WB?.shop?.isOwned?.("mirrorball")) return true;
    } catch {}
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
    // 1) shop.js がWBに提供していればそれ優先
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}

    // 2) 状態ストレージ（shop.js側）
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j.mirrorballEnabled === "boolean") return j.mirrorballEnabled;
    } catch {}

    // 既定：ON
    return true;
  }

  /* =========================
   * Mirrorball image placement
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV1",
    styleId: "mirrorballImgStyleV1",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 8, // ディスコ光より少し上
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
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";
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
      bgLayer.appendChild(img);
    } else {
      if (img.getAttribute("src") !== MIRROR.src) img.src = MIRROR.src;
    }
  }

  /* =========================
   * Disco overlay layers (inside bgLayer)
   * ========================= */
  const DISCO = {
    styleId: "mirrorballDiscoStyleV2",
    wrapId: "mirrorballDiscoWrapV2",
    spotId: "mirrorballDiscoSpotV2", // ★中央上スポットライト
    spinId: "mirrorballDiscoSpinV2", // 回転する色光
    beamsId: "mirrorballDiscoBeamsV2", // 走るビーム
    dustId: "mirrorballDiscoDustV2", // キラ粒
    z: 6,
  };

  function ensureDiscoStyle() {
    if (document.getElementById(DISCO.styleId)) return;

    const st = document.createElement("style");
    st.id = DISCO.styleId;
    st.textContent = `
@keyframes mbSpinHueV2 {
  0%   { transform: rotate(0deg) scale(1.05); filter: hue-rotate(0deg) saturate(1.6) brightness(1.15); }
  100% { transform: rotate(360deg) scale(1.05); filter: hue-rotate(360deg) saturate(1.6) brightness(1.15); }
}
@keyframes mbBeamSweepV2 {
  0%   { transform: translate3d(-40%, -20%, 0) rotate(22deg); opacity: .12; }
  25%  { opacity: .35; }
  50%  { transform: translate3d( 40%,  10%, 0) rotate(22deg); opacity: .18; }
  75%  { opacity: .38; }
  100% { transform: translate3d(-40%, -20%, 0) rotate(22deg); opacity: .12; }
}
@keyframes mbDustDriftV2 {
  0%   { transform: translate3d(-2%, -1%, 0); opacity: .25; }
  50%  { transform: translate3d( 2%,  1%, 0); opacity: .45; }
  100% { transform: translate3d(-2%, -1%, 0); opacity: .25; }
}

/* ★スポットライト（中央上から注ぐ光） */
@keyframes mbSpotPulseV2 {
  0%,100% { opacity: .42; transform: translateX(-50%) scaleY(1); }
  50%     { opacity: .62; transform: translateX(-50%) scaleY(1.04); }
}
@keyframes mbSpotSweepV2 {
  0%   { transform: translateX(-50%) rotate(-4deg); }
  50%  { transform: translateX(-50%) rotate( 4deg); }
  100% { transform: translateX(-50%) rotate(-4deg); }
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

/* ★中央上スポットライト円錐 */
#${DISCO.spotId}{
  position:absolute;
  left:50%;
  top:-18px;
  width:120vmin;
  height:120vmin;
  transform: translateX(-50%);
  transform-origin: 50% 0%;
  pointer-events:none;
  mix-blend-mode: screen;

  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);

  background:
    radial-gradient(circle at 50% 6%,
      rgba(255,255,255,.65) 0%,
      rgba(255,255,255,.22) 18%,
      rgba(255,255,255,.10) 38%,
      rgba(255,255,255,0) 72%
    ),
    conic-gradient(from 180deg at 50% 10%,
      rgba(255,  0,160,.14),
      rgba(255,180,  0,.14),
      rgba(255,255,  0,.14),
      rgba(  0,255,180,.14),
      rgba(  0,180,255,.14),
      rgba(140,  0,255,.14),
      rgba(255,  0,160,.14)
    );

  filter: blur(.5px) saturate(1.3);
  opacity:1; /* ★見えない時はまずここ */
  animation:
    mbSpotPulseV2 1.8s ease-in-out infinite,
    mbSpotSweepV2 2.6s ease-in-out infinite;
  will-change: transform, opacity;
}

/* 回転するディスコライト（中心がミラーボールっぽい） */
#${DISCO.spinId}{
  position:absolute;
  left:50%;
  top:0;
  width:140vmax;
  height:140vmax;
  transform: translateX(-50%);
  transform-origin: 50% 18%;
  mix-blend-mode: screen;
  opacity:.55;

  background:
    radial-gradient(circle at 50% 12%, rgba(255,255,255,.55) 0 12%, rgba(255,255,255,0) 35%),
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

/* 走るビーム（斜めスポット） */
#${DISCO.beamsId}{
  position:absolute;
  inset:-30%;
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
  filter: saturate(1.3) contrast(1.05);
  animation: mbBeamSweepV2 2.8s ease-in-out infinite;
  will-change: transform, opacity;
}

/* キラ粒（細かい反射） */
#${DISCO.dustId}{
  position:absolute;
  inset:-12%;
  mix-blend-mode: screen;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,255,255,.55) 0 2px, rgba(255,255,255,0) 3px) 0 0 / 120px 120px,
    radial-gradient(circle at 65% 52%, rgba(255,255,255,.38) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 160px 160px,
    radial-gradient(circle at 45% 78%, rgba(255,255,255,.35) 0 1.5px, rgba(255,255,255,0) 3px) 0 0 / 140px 140px,
    radial-gradient(circle at 80% 30%, rgba(255,255,255,.30) 0 1.2px, rgba(255,255,255,0) 3px) 0 0 / 180px 180px;
  filter: hue-rotate(0deg) saturate(1.4);
  animation: mbDustDriftV2 1.7s ease-in-out infinite;
  will-change: transform, opacity;
}
`;
    document.head.appendChild(st);
  }

  function ensureDiscoLayers() {
    ensureDiscoStyle();

    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";

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

      // 追加順：スポット → 回転 → ビーム → 粒（おすすめ）
      wrap.appendChild(spot);
      wrap.appendChild(spin);
      wrap.appendChild(beams);
      wrap.appendChild(dust);

      // bgLayerの先頭（後ろ）に入れる
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

  // 1分ごと（時間帯反映）
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
