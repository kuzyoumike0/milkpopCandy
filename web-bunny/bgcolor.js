// bgcolor.js
// ✔ 朝昼夜(JST)で背景色
// ✔ mirrorball 購入＋設置ON時のみ：
//    - 上中央にミラーボール
//    - ミラーボール位置（中央上）から左右2本スポットライト
//    - スポットは虹色（hue-rotate）＆ゆらゆら揺れる
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

    // bunnyLayerに照明を載せるので absolute を確保
    if (getComputedStyle(bunnyLayer).position === "static") {
      bunnyLayer.style.position = "absolute";
      bunnyLayer.style.inset = "0";
    }
  }

  /* =========================
   * ミラーボール画像（bgLayer）
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgFinalV4",
    styleId: "mirrorballStyleFinalV4",
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

  function setMirror(on) {
    ensureBase();
    ensureMirrorStyle();

    let el = document.getElementById(MIRROR.id);
    if (!on) { el?.remove(); return; }

    if (!el) {
      el = document.createElement("img");
      el.id = MIRROR.id;
      el.src = MIRROR.src;
      el.alt = "mirrorball";
      el.addEventListener("error", () => console.warn("[bgcolor] mirrorball load failed"));
      bgLayer.appendChild(el);
    }
  }

  /* =========================
   * スポットライト（ミラーボール位置から出る）
   * - anchor(50%, top+size*0.62) を光源として、左右に扇形
   * - 2本（左右）でライブ会場感
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotFromCenterStyleV1",
    wrapId:  "mirrorballSpotFromCenterWrapV1",
    leftId:  "mirrorballSpotFromCenterL_V1",
    rightId: "mirrorballSpotFromCenterR_V1",
    z: 2147480000, // bunnyより上、HUDより下
  };

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;
    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbHueSpotV3 {
  0%   { filter: hue-rotate(0deg)   saturate(2.2) brightness(var(--spot-bright,1.15)); }
  100% { filter: hue-rotate(360deg) saturate(2.2) brightness(var(--spot-bright,1.15)); }
}

/* 揺れ（左右で逆位相） */
@keyframes mbSwayLeftV3 {
  0%   { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) - 7deg)); }
  50%  { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) + 7deg)); }
  100% { transform: translateX(-50%) rotate(calc(var(--spot-angle, -14deg) - 7deg)); }
}
@keyframes mbSwayRightV3 {
  0%   { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) + 7deg)); }
  50%  { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) - 7deg)); }
  100% { transform: translateX(-50%) rotate(calc(var(--spot-angle,  14deg) + 7deg)); }
}

#${SPOT.wrapId}{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:${SPOT.z};
  opacity:0;
  transition: opacity .22s ease;
}

/* “光源（ミラーボール）から伸びる扇” */
#${SPOT.wrapId} .spot{
  /* JSでセット */
  --spot-origin-x: 50%;
  --spot-origin-y: 92px;   /* ミラーボール中心付近 */
  --spot-width: 1600px;
  --spot-height: 95vh;
  --spot-opacity: .44;
  --spot-bright: 1.15;
  --spot-angle: 0deg;

  position:absolute;

  /* 光源を基準に置く：left/top が origin */
  left: var(--spot-origin-x);
  top:  var(--spot-origin-y);

  width: var(--spot-width);
  height: var(--spot-height);

  transform-origin: 50% 0%;
  clip-path: polygon(50% 0%, 90% 100%, 10% 100%);

  mix-blend-mode: screen; /* ★うさぎが入ると明るく見える */
  opacity: var(--spot-opacity);
  pointer-events:none;

  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.92) 0%,
      rgba(255,255,255,.46) 18%,
      rgba(255,255,255,0) 60%
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

  filter: blur(1.4px);
  will-change: transform, filter, opacity;
}

#${SPOT.leftId}{
  animation:
    mbHueSpotV3 6.2s linear infinite,
    mbSwayLeftV3 3.1s ease-in-out infinite;
}
#${SPOT.rightId}{
  animation:
    mbHueSpotV3 6.2s linear infinite,
    mbSwayRightV3 3.1s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpots() {
    ensureBase();
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

      // bunnyLayerに載せる（うさぎが照らされる）
      bunnyLayer.appendChild(wrap);
    }
    return wrap;
  }

  function calcSpotOriginY() {
    // ミラーボール中心少し下を光源にする（見た目が自然）
    // top(8px) + size(140) * 0.62 ≒ 95px
    return Math.round(MIRROR.top + MIRROR.size * 0.62);
  }

  function setSpots(on, phase) {
    const wrap = ensureSpots();
    const l = document.getElementById(SPOT.leftId);
    const r = document.getElementById(SPOT.rightId);

    if (!on) {
      wrap.style.opacity = "0";
      return;
    }

    const originY = calcSpotOriginY();
    const night = (phase === "night");

    // ★夜強化
    const width  = night ? "1900px" : "1600px";
    const height = night ? "98vh"   : "92vh";
    const op     = night ? "0.68"   : "0.44";
    const bright = night ? "1.40"   : "1.15";

    // ★左右の開き角（ここで“ライブ感”調整）
    const angleL = night ? "-18deg" : "-14deg";
    const angleR = night ? "18deg"  : "14deg";

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

    // 透明→表示
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
    setSpots(on, phase);
  }

  apply(true);
  setInterval(() => apply(false), 60_000);

  // WBイベントで即反映
  const hook = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    window.WB.on("shop:mirrorball_toggle", () => apply(true));
    return true;
  };
  hook();
  setTimeout(hook, 300);
})();
