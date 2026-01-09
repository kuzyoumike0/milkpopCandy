// bgcolor.js
// ✅ 朝昼夜(JST)で背景色
// ✅ mirrorball 購入済み + 設置ON のときだけ：
//    - 上中央に mirrorball.png を表示
//    - 中央上スポットライト（太め）だけON（ディスコ回転色やビームや粒は無し）
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

  // 壊れてる/無い時はOFF（勝手にONへ戻さない）
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
    id: "mirrorballImgV3",
    styleId: "mirrorballImgStyleV3",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 5, // spotlightより上にしたいなら大きく
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
   * Spotlight only (NO disco color)
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleV3",
    id: "mirrorballSpotV3",
    z: 4, // bgLayer内：ミラーボール画像より下
    width: 980, // ★幅（大きくしたいならここ）
  };

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;
    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbSpotPulseOnlyV3 {
  0%,100% { opacity:.35; }
  50%     { opacity:.70; }
}

#${SPOT.id}{
  position:absolute;
  left:50%;
  top:-10px;

  width:min(${SPOT.width}px, 98vw);
  height:92vh;

  transform: translateX(-50%);
  z-index:${SPOT.z};
  pointer-events:none;

  /* ★白いスポットライトだけ */
  background:
    radial-gradient(circle at 50% 0%,
      rgba(255,255,255,.85) 0%,
      rgba(255,255,255,.45) 18%,
      rgba(255,255,255,.18) 46%,
      rgba(255,255,255,0) 74%
    );

  /* ★光の形（上が細く、下が広い） */
  clip-path: polygon(50% 0%, 86% 100%, 14% 100%);

  mix-blend-mode: screen;
  filter: blur(1px);
  opacity:0;
  animation: mbSpotPulseOnlyV3 2.4s ease-in-out infinite;
  will-change: opacity;
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
      // ★ミラーボール画像より後ろにしたいので先頭に
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
