// bgcolor.js
// 朝・昼・夜を「日本時間(JST)」で判定して #bgLayer に直接適用（確実）
// reset後に背景が黒くなる対策：イベントでも再適用
// ✅ mirrorball（購入済み）なら「上中央に設置」＋「虹キラ」ON

(() => {
  const bgLayer = document.getElementById("bgLayer");
  const field = document.getElementById("field");
  if (!bgLayer) return;

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
   * Mirrorball owned?
   * ========================= */
  function hasMirrorballOwned() {
    // 1) WB.shop があるならそれ優先（将来拡張に強い）
    try {
      if (window.WB?.shop?.isOwned?.("mirrorball")) return true;
    } catch {}

    // 2) shop.js のlocalStorage（今の実装）
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j?.mirrorball;
    } catch {
      return false;
    }
  }

  /* =========================
   * Mirrorball image placement
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV1",
    styleId: "mirrorballImgStyleV1",
    src: "./assets/bg/mirrorball.png",
    top: 8,          // 上からpx
    size: 140,       // 幅px（好みで調整）
    z: 5,            // bgLayer内の重なり（sparkleより上にしたいなら調整）
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
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorball(enabled) {
    // bgLayerが子要素を置けるように
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";

    ensureMirrorballStyle();

    const old = document.getElementById(MIRROR.id);

    if (!enabled) {
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
   * Sparkle overlay (rainbow)
   * ========================= */
  const SPARKLE = {
    styleId: "mirrorballSparkleStyleV1",
    layerId: "mirrorballSparkleLayerV1",
    z: 4, // ミラーボール画像の下にしたいので MIRROR.z より小さく
  };

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

#${SPARKLE.layerId}{
  position:absolute;
  inset:-12%;
  pointer-events:none;
  z-index:${SPARKLE.z};
  mix-blend-mode: screen;
  opacity:0;
  transition: opacity .25s ease;

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

  /* =========================
   * apply
   * ========================= */
  let last = "";
  function apply(force = false) {
    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== last) {
      last = phase;

      bgLayer.style.background = THEMES[phase];
      if (field) field.style.background = THEMES[phase];

      window.WB?.emit?.("bg:changed", { phase, hour: h });
    }

    // ✅ mirrorballの設置/解除
    const owned = hasMirrorballOwned();
    ensureMirrorball(owned);
    setSparkleEnabled(owned);
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
    window.WB.on("bg:mirrorball_changed", () => apply(true)); // 購入直後
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
