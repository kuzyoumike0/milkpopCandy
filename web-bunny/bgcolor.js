// bgcolor.js
// ✅ 朝・昼・夜を「JST」で判定して #bgLayer / #field に直接適用
// ✅ mirrorball（購入済み＆ON）なら「ミラーボール画像＋スポットライトだけ」出す
// ✅ 重要：光（スポット）は “必ずミラーボール位置（画面中央上）からのみ” 出る
// ✅ くるくる回るディスコ背景（全面回転色）は出さない（=スポットのみ）
// ✅ スポットは2本（左右）
// ✅ ゆらゆら揺れる + 虹色に変化
// ✅ 夜だけ強化（明るさ/濃さUP）
// ✅ うさぎがスポットに入ると少し明るく見える（簡易：bunnyWrap に軽いbrightness）

(() => {
  "use strict";

  const bgLayer = document.getElementById("bgLayer");
  const field   = document.getElementById("field");
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
   * Mirrorball state
   * ========================= */
  function hasMirrorballOwned() {
    // 1) WB.shop があれば優先
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    // 2) owned LS
    try {
      const raw = localStorage.getItem("milkpop_shop_owned_v1");
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j?.mirrorball;
    } catch { return false; }
  }

  function isMirrorballEnabled() {
    // 1) WB.shop があれば優先
    try { if (typeof window.WB?.shop?.isMirrorballEnabled === "function") return !!window.WB.shop.isMirrorballEnabled(); } catch {}
    // 2) state LS（無ければ true 扱い）
    try {
      const raw = localStorage.getItem("milkpop_shop_state_v1");
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === "object" && "mirrorballEnabled" in j) return !!j.mirrorballEnabled;
    } catch {}
    return true;
  }

  /* =========================
   * Base ensure (black bug killer)
   * ========================= */
  function ensureBgLayerReady() {
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";
    bgLayer.style.overflow = "hidden";
  }

  /* =========================
   * Mirrorball image
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgV1",
    styleId: "mirrorballImgStyleV1",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 20,
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
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.25));
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorball(on) {
    ensureBgLayerReady();
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
   * Spotlight (ONLY from mirrorball)
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleV7",
    wrapId:  "mirrorballSpotWrapV7",
    leftId:  "mirrorballSpotLeftV7",
    rightId: "mirrorballSpotRightV7",
    z: 12, // ミラーボールより下
  };

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;

    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbHueV7 {
  0%   { filter: hue-rotate(0deg)    saturate(1.6) brightness(1.08); }
  100% { filter: hue-rotate(360deg)  saturate(1.6) brightness(1.08); }
}

/* ゆらゆら（左右で位相ズラし） */
@keyframes mbSwayL_V7 {
  0%   { transform: translateX(-50%) rotate(-22deg); }
  50%  { transform: translateX(-50%) rotate(-28deg); }
  100% { transform: translateX(-50%) rotate(-22deg); }
}
@keyframes mbSwayR_V7 {
  0%   { transform: translateX(-50%) rotate( 22deg); }
  50%  { transform: translateX(-50%) rotate( 28deg); }
  100% { transform: translateX(-50%) rotate( 22deg); }
}

#${SPOT.wrapId}{
  position:absolute;
  inset:0;
  z-index:${SPOT.z};
  pointer-events:none;
  overflow:hidden;
  opacity:0;
  transition: opacity .25s ease;
}

/* “光源はミラーボール位置だけ” を保証：
   top:${MIRROR.top + MIRROR.size*0.62}px; left:50% 固定 */
#${SPOT.wrapId} .beam{
  position:absolute;
  left:50%;
  top:${Math.round(MIRROR.top + MIRROR.size * 0.62)}px; /* ★光源＝ミラーボール直下 */
  width:180vmax;
  height:180vmax;
  transform-origin: 50% 0%;
  mix-blend-mode: screen;
  opacity:.55;

  /* 三角コーン（中心が明るく、端は薄い） */
  background:
    conic-gradient(from 0deg,
      rgba(255,255,255,0) 0deg,
      rgba(255,255,255,0) 120deg,
      rgba(255,255,255,.00) 150deg,
      rgba(255,255,255,.34) 180deg,
      rgba(255,255,255,.00) 210deg,
      rgba(255,255,255,0) 240deg,
      rgba(255,255,255,0) 360deg
    );
  mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 32%, rgba(0,0,0,0) 72%);
  -webkit-mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 32%, rgba(0,0,0,0) 72%);

  animation: mbHueV7 6.8s linear infinite;
  will-change: transform, filter;
}

/* ここで “左右のコーン角度だけ” 変える（起点は同じ） */
#${SPOT.leftId}{
  animation:
    mbHueV7 6.8s linear infinite,
    mbSwayL_V7 2.8s ease-in-out infinite;
}
#${SPOT.rightId}{
  animation:
    mbHueV7 6.8s linear infinite,
    mbSwayR_V7 2.9s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpotWrap() {
    ensureBgLayerReady();
    ensureSpotStyle();

    let wrap = document.getElementById(SPOT.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = SPOT.wrapId;

      // ★ これ以外の光源レイヤーを作らない（=余計な光は出ない）
      const left = document.createElement("div");
      left.id = SPOT.leftId;
      left.className = "beam";

      const right = document.createElement("div");
      right.id = SPOT.rightId;
      right.className = "beam";

      wrap.appendChild(left);
      wrap.appendChild(right);

      // bgLayerの先頭へ（背景の上・ミラーボールの下）
      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  function setSpotEnabled(on, phase) {
    const wrap = ensureSpotWrap();
    wrap.style.opacity = on ? "1" : "0";

    // 夜だけ強化（濃さUP）
    const nightBoost = (phase === "night") ? 1.0 : 0.0;
    const left = document.getElementById(SPOT.leftId);
    const right = document.getElementById(SPOT.rightId);
    if (left && right) {
      const op = on ? (0.55 + nightBoost * 0.20) : 0;
      left.style.opacity = String(op);
      right.style.opacity = String(op);
    }
  }

  /* =========================
   * Bunny brighten when in spot (cheap)
   * ========================= */
  // ざっくり：中央付近（スポットの届く場所）にいる bunnyWrap を少し明るくする
  // ※当たり判定は軽量に、30fps未満でOK
  let bunnyBrightTimer = null;

  function setBunnySpotGlowEnabled(on, phase) {
    // いったん全部戻す
    const wraps = document.querySelectorAll(".bunnyWrap");
    wraps.forEach(w => { w.style.filter = ""; });

    if (!on) {
      if (bunnyBrightTimer) { clearInterval(bunnyBrightTimer); bunnyBrightTimer = null; }
      return;
    }

    const boost = (phase === "night") ? 1.18 : 1.10;

    if (bunnyBrightTimer) clearInterval(bunnyBrightTimer);
    bunnyBrightTimer = setInterval(() => {
      const fieldRect = field?.getBoundingClientRect?.();
      if (!fieldRect) return;

      const centerX = fieldRect.left + fieldRect.width * 0.5;
      const originY = fieldRect.top + (MIRROR.top + MIRROR.size * 0.62);

      // スポットの広がりを雑に判定（下に行くほど横幅が広い）
      const nodes = document.querySelectorAll(".bunnyWrap");
      nodes.forEach(w => {
        const r = w.getBoundingClientRect();
        const x = r.left + r.width * 0.5;
        const y = r.top  + r.height * 0.8;

        const dy = Math.max(0, y - originY);
        const allowed = 120 + dy * 0.85; // 下ほど広がる
        const inside = Math.abs(x - centerX) < allowed;

        w.style.filter = inside ? `brightness(${boost})` : "";
      });
    }, 120);
  }

  /* =========================
   * Kill “other lights” if残骸がある場合
   * ========================= */
  // 以前の disco/sparkle 等の残骸IDを消す（あなたの過去版で増殖した可能性がある）
  const GARBAGE_IDS = [
    "mirrorballDiscoWrapV1","mirrorballDiscoWrapV2","mirrorballDiscoWrapV3","mirrorballDiscoWrapV4","mirrorballDiscoWrapV5","mirrorballDiscoWrapV6",
    "mirrorballSparkleLayerV1","mirrorballSparkleLayerV2","mirrorballSparkleLayerV3",
    "mirrorballDiscoSpinV1","mirrorballDiscoBeamsV1","mirrorballDiscoDustV1",
    "mirrorballDiscoSpinV2","mirrorballDiscoBeamsV2","mirrorballDiscoDustV2",
    "mirrorballDiscoSpinV3","mirrorballDiscoBeamsV3","mirrorballDiscoDustV3",
    "mirrorballDiscoSpinV4","mirrorballDiscoBeamsV4","mirrorballDiscoDustV4",
  ];
  function cleanupOldLights() {
    for (const id of GARBAGE_IDS) {
      try { document.getElementById(id)?.remove(); } catch {}
    }
  }

  /* =========================
   * apply
   * ========================= */
  let lastPhase = "";

  function apply(force = false) {
    cleanupOldLights();

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    // 背景（ここで “黒固定” を絶対にしない）
    if (force || phase !== lastPhase) {
      lastPhase = phase;
      const bg = THEMES[phase] || THEMES.day;
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;

      window.WB?.emit?.("bg:changed", { phase, hour: h });
    }

    // ミラーボールとスポット
    const owned = hasMirrorballOwned();
    const enabled = isMirrorballEnabled();
    const on = owned && enabled;

    ensureMirrorball(on);
    setSpotEnabled(on, phase);
    setBunnySpotGlowEnabled(on, phase);
  }

  // 初回
  apply(true);

  // 1分ごと（時間帯切替）
  setInterval(() => apply(false), 60 * 1000);

  /* =========================
   * WB hook
   * ========================= */
  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    window.WB.on("bg:mirrorball_toggle", () => apply(true));
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
