// bgcolor.js
// ✔ 朝昼夜(JST)で背景色
// ✔ mirrorball 購入＋設置ON時のみ：
//    - 上中央にミラーボール
//    - 左右2本の虹スポットライト（ゆらゆら＋色相回転）
//    - スポットは bunnyLayer 上に乗るので、うさぎが入ると少し明るく見える
// ✔ 夜だけスポット強化（太く・明るく・濃く）
// ✖ 背景が回転するディスコ色は出さない

(() => {
  "use strict";

  const field      = document.getElementById("field");
  const bgLayer    = document.getElementById("bgLayer");
  const bunnyLayer = document.getElementById("bunnyLayer");
  if (!field || !bgLayer || !bunnyLayer) return;

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
    // shop.js 側にON/OFFがあれば尊重、なければON扱い
    try {
      const v = window.WB?.shop?.isMirrorballEnabled?.();
      if (typeof v === "boolean") return v;
    } catch {}
    try {
      const j = JSON.parse(localStorage.getItem("milkpop_shop_state_v1") || "{}");
      if (typeof j.mirrorballEnabled === "boolean") return !!j.mirrorballEnabled;
      return true;
    } catch { return true; }
  }

  /* =========================
   * ベース保険（黒化防止）
   * ========================= */
  function ensureBase() {
    // bgLayerは背景担当
    bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";
    bgLayer.style.pointerEvents = "none";

    // bunnyLayerは照明レイヤを載せるので absolute/relative を確保
    if (getComputedStyle(bunnyLayer).position === "static") {
      bunnyLayer.style.position = "absolute";
      bunnyLayer.style.inset = "0";
    }
  }

  /* =========================
   * ミラーボール画像（bgLayer）
   * ========================= */
  const MIRROR_ID = "mirrorballImgFinalV3";

  if (!document.getElementById("mirrorballStyleFinalV3")) {
    const st = document.createElement("style");
    st.id = "mirrorballStyleFinalV3";
    st.textContent = `
#${MIRROR_ID}{
  position:absolute;
  left:50%;
  top:8px;
  transform:translateX(-50%);
  width:140px;
  height:auto;
  z-index:6;
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
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
      el.addEventListener("error", () => console.warn("[bgcolor] mirrorball load failed"));
      bgLayer.appendChild(el);
    }
  }

  /* =========================
   * 虹スポットライト（左右2本 / bunnyLayer上）
   * ========================= */
  const SPOT_WRAP = "mirrorballSpotWrapV1";
  const SPOT_L    = "mirrorballSpotL_V1";
  const SPOT_R    = "mirrorballSpotR_V1";

  if (!document.getElementById("spot2StyleV1")) {
    const st = document.createElement("style");
    st.id = "spot2StyleV1";
    st.textContent = `
@keyframes spotHue2V1 {
  0%   { filter: hue-rotate(0deg)   saturate(2.15) brightness(var(--spot-bright,1.15)); }
  100% { filter: hue-rotate(360deg) saturate(2.15) brightness(var(--spot-bright,1.15)); }
}
/* 左右で揺れを逆にして“ライブ感” */
@keyframes spotSwayLeftV1 {
  0%   { transform: translateX(-50%) rotate(-16deg) scaleY(1.00); }
  50%  { transform: translateX(-50%) rotate( -6deg) scaleY(1.03); }
  100% { transform: translateX(-50%) rotate(-16deg) scaleY(1.00); }
}
@keyframes spotSwayRightV1 {
  0%   { transform: translateX(-50%) rotate( 16deg) scaleY(1.00); }
  50%  { transform: translateX(-50%) rotate(  6deg) scaleY(1.03); }
  100% { transform: translateX(-50%) rotate( 16deg) scaleY(1.00); }
}

/* ラップ（ON/OFFはここで一括） */
#${SPOT_WRAP}{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:2147480000; /* bunnyより上、HUDより下 */
  opacity:0;
  transition: opacity .22s ease;
}

/* 共通スポット */
#${SPOT_WRAP} .spot{
  --spot-width: 1200px;   /* JSで調整 */
  --spot-opacity: .42;    /* JSで調整 */
  --spot-bright: 1.15;    /* JSで調整 */

  position:absolute;
  top:-14px;
  width: var(--spot-width);
  height: 92vh;

  transform-origin:50% 6%;
  clip-path: polygon(50% 0%, 88% 100%, 12% 100%);
  pointer-events:none;

  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.92) 0%,
      rgba(255,255,255,.45) 18%,
      rgba(255,255,255,0) 58%
    ),
    linear-gradient(90deg,
      rgba(255,  0,160,.55),
      rgba(255,180,  0,.55),
      rgba(255,255,  0,.50),
      rgba(  0,255,180,.55),
      rgba(  0,180,255,.55),
      rgba(140,  0,255,.55),
      rgba(255,  0,160,.55)
    );

  mix-blend-mode: screen; /* ★うさぎがスポット内で明るく見える */
  opacity: var(--spot-opacity);
  filter: blur(1.35px);

  animation:
    spotHue2V1 6.2s linear infinite;
  will-change: transform, filter, opacity;
}

/* 左右配置 */
#${SPOT_L}{
  left:38%;
  animation:
    spotSwayLeftV1  3.2s ease-in-out infinite,
    spotHue2V1      6.2s linear infinite;
}
#${SPOT_R}{
  left:62%;
  animation:
    spotSwayRightV1 3.2s ease-in-out infinite,
    spotHue2V1      6.2s linear infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpot2() {
    let wrap = document.getElementById(SPOT_WRAP);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = SPOT_WRAP;

      const l = document.createElement("div");
      l.id = SPOT_L;
      l.className = "spot";

      const r = document.createElement("div");
      r.id = SPOT_R;
      r.className = "spot";

      wrap.appendChild(l);
      wrap.appendChild(r);

      // bunnyLayerの上に重ねる（うさぎが照らされる）
      bunnyLayer.appendChild(wrap);
    }
    return wrap;
  }

  function setSpot2(on, phase) {
    const wrap = ensureSpot2();
    if (!on) {
      wrap.style.opacity = "0";
      return;
    }

    const night = (phase === "night");
    const w = night ? "1500px" : "1200px";
    const op = night ? "0.62" : "0.42";
    const br = night ? "1.35" : "1.15";

    const l = document.getElementById(SPOT_L);
    const r = document.getElementById(SPOT_R);
    if (l) {
      l.style.setProperty("--spot-width", w);
      l.style.setProperty("--spot-opacity", op);
      l.style.setProperty("--spot-bright", br);
    }
    if (r) {
      r.style.setProperty("--spot-width", w);
      r.style.setProperty("--spot-opacity", op);
      r.style.setProperty("--spot-bright", br);
    }

    wrap.style.opacity = "1";
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";
  function apply(force = false) {
    ensureBase();

    const phase = phaseByHour(getJSTHour());
    if (force || phase !== lastPhase) {
      lastPhase = phase;
      bgLayer.style.background = THEMES[phase];
      field.style.background   = THEMES[phase];
      window.WB?.emit?.("bg:changed", { phase });
    }

    // ★ミラーボールを設置していない時はスポットを出さない
    const on = isOwned() && isEnabled();
    setMirror(on);
    setSpot2(on, phase);
  }

  apply(true);
  setInterval(() => apply(false), 60_000);

  // WBイベントで即反映
  const hook = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    window.WB.on("shop:mirrorball_toggle", () => apply(true)); // shop.js側でemitしてもOK
    return true;
  };
  hook();
  setTimeout(hook, 300);
})();
