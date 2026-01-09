// bgcolor.js（修正版：ミラーボールOFFできる／SPOTはONと完全同期／軽量化）
// ✅ ミラーボールを設置ONにしたらスポットライトもつく（= on の時だけ）
// ✅ ただし OFF を強制でONに戻さない（OFFできないバグ根絶）
// ✅ localStorageフック / requestAnimationFrame / リセット耐性 / 軽量化 / 残骸掃除つき

(() => {
  "use strict";

  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_STATE = "milkpop_shop_state_v1";

  const GARBAGE_ID_PREFIXES = [
    "mirrorballDisco",
    "mirrorballSparkle",
    "mirrorballSpotWrapV",
    "mirrorballSpotLeftV",
    "mirrorballSpotRightV",
    "mirrorballImgV",
  ];

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

  const getBgLayer = () => document.getElementById("bgLayer");
  const getField   = () => document.getElementById("field");

  function ensureBgLayerReady(bgLayer) {
    if (!bgLayer) return;
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";
    bgLayer.style.overflow = "hidden";
  }

  function safeParseLS(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function hasMirrorballOwned() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    const j = safeParseLS(LS_OWNED);
    return !!j?.mirrorball;
  }

  function isMirrorballEnabled() {
    // WB.shop優先
    try {
      if (typeof window.WB?.shop?.isMirrorballEnabled === "function") {
        const v = window.WB.shop.isMirrorballEnabled();
        return (typeof v === "boolean") ? v : !!v;
      }
      const wbState = window.WB?.shop?.state;
      if (wbState && typeof wbState.mirrorballEnabled === "boolean") return wbState.mirrorballEnabled;
    } catch {}

    // LS fallback
    const j = safeParseLS(LS_STATE);
    if (j && typeof j === "object" && "mirrorballEnabled" in j) return !!j.mirrorballEnabled;

    // 古い環境はON扱い
    return true;
  }

  function cleanupAllMirrorballStuff(root = document) {
    // 過去版id残骸を削除
    try {
      const all = root.querySelectorAll("[id]");
      all.forEach(el => {
        const id = String(el.id || "");
        for (const p of GARBAGE_ID_PREFIXES) {
          if (id.startsWith(p)) { try { el.remove(); } catch {} break; }
        }
      });
    } catch {}

    // src一致（id違い残骸）
    try {
      root.querySelectorAll('img[src*="mirrorball.png"], img[src*="/mirrorball.png"]').forEach(el => {
        if (el.id === MIRROR.id) return;
        try { el.remove(); } catch {}
      });
    } catch {}
  }

  /* =========================
   * Mirrorball image
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgFINAL",
    styleId: "mirrorballImgStyleFINAL",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 30,
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

  function ensureMirrorball(bgLayer, on) {
    if (!bgLayer) return;

    ensureBgLayerReady(bgLayer);
    ensureMirrorballStyle();

    if (!on) {
      try { document.getElementById(MIRROR.id)?.remove(); } catch {}
      return;
    }

    // ON時：残骸を消してから1個だけ
    cleanupAllMirrorballStuff(bgLayer);

    let img = document.getElementById(MIRROR.id);
    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR.id;
      img.alt = "mirrorball";
      img.src = MIRROR.src;
      img.draggable = false;
      bgLayer.appendChild(img);
    } else if (img.getAttribute("src") !== MIRROR.src) {
      img.src = MIRROR.src;
    }
  }

  /* =========================
   * Spotlight
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleFINAL",
    wrapId:  "mirrorballSpotWrapFINAL",
    leftId:  "mirrorballSpotLeftFINAL",
    rightId: "mirrorballSpotRightFINAL",
    z: 18,
    widthVmax: 210,
    coreOpacity: 0.52,
    nightAdd: 0.22,
    swayDegA: 18,
    swayDegB: 28,
  };

  function spotOriginTopPx() {
    return Math.round(MIRROR.top + MIRROR.size * 0.62);
  }

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;

    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbHueFINAL {
  0%   { filter: hue-rotate(0deg)    saturate(1.7) brightness(1.10); }
  100% { filter: hue-rotate(360deg)  saturate(1.7) brightness(1.10); }
}
@keyframes mbSwayL_FINAL {
  0%   { transform: translateX(-50%) rotate(-${SPOT.swayDegA}deg); }
  50%  { transform: translateX(-50%) rotate(-${SPOT.swayDegB}deg); }
  100% { transform: translateX(-50%) rotate(-${SPOT.swayDegA}deg); }
}
@keyframes mbSwayR_FINAL {
  0%   { transform: translateX(-50%) rotate(${SPOT.swayDegA}deg); }
  50%  { transform: translateX(-50%) rotate(${SPOT.swayDegB}deg); }
  100% { transform: translateX(-50%) rotate(${SPOT.swayDegA}deg); }
}

#${SPOT.wrapId}{
  position:absolute;
  inset:0;
  z-index:${SPOT.z};
  pointer-events:none;
  overflow:hidden;
  opacity:0;
  transition: opacity .20s ease;
}

#${SPOT.wrapId} .beam{
  position:absolute;
  left:50%;
  top:${spotOriginTopPx()}px;

  width:${SPOT.widthVmax}vmax;
  height:${SPOT.widthVmax}vmax;

  transform-origin: 50% 0%;
  mix-blend-mode: screen;
  opacity:${SPOT.coreOpacity};

  background:
    conic-gradient(from 0deg,
      rgba(255,255,255,0)   0deg,
      rgba(255,255,255,0)  118deg,
      rgba(255,255,255,.00) 150deg,
      rgba(255,255,255,.40) 180deg,
      rgba(255,255,255,.00) 210deg,
      rgba(255,255,255,0)  242deg,
      rgba(255,255,255,0)  360deg
    );

  mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 34%, rgba(0,0,0,0) 74%);
  -webkit-mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 34%, rgba(0,0,0,0) 74%);

  animation: mbHueFINAL 6.6s linear infinite;
  will-change: transform, filter, opacity;
}

#${SPOT.leftId}{
  animation: mbHueFINAL 6.6s linear infinite, mbSwayL_FINAL 2.9s ease-in-out infinite;
}
#${SPOT.rightId}{
  animation: mbHueFINAL 6.6s linear infinite, mbSwayR_FINAL 3.1s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpotWrap(bgLayer) {
    if (!bgLayer) return null;
    ensureBgLayerReady(bgLayer);
    ensureSpotStyle();

    let wrap = document.getElementById(SPOT.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = SPOT.wrapId;

      const left = document.createElement("div");
      left.id = SPOT.leftId;
      left.className = "beam";

      const right = document.createElement("div");
      right.id = SPOT.rightId;
      right.className = "beam";

      wrap.appendChild(left);
      wrap.appendChild(right);

      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  function removeSpot() {
    try { document.getElementById(SPOT.wrapId)?.remove(); } catch {}
  }

  function setSpotEnabled(bgLayer, on, phase) {
    if (!bgLayer) return;

    if (!on) {
      removeSpot();
      return;
    }

    const wrap = ensureSpotWrap(bgLayer);
    if (!wrap) return;

    wrap.style.opacity = "1";

    const add = (phase === "night") ? SPOT.nightAdd : 0;
    const left = document.getElementById(SPOT.leftId);
    const right = document.getElementById(SPOT.rightId);
    if (left && right) {
      const op = String(SPOT.coreOpacity + add);
      if (left.style.opacity !== op) left.style.opacity = op;
      if (right.style.opacity !== op) right.style.opacity = op;
    }
  }

  /* =========================
   * Bunny brighten (light)
   * ========================= */
  let bunnyBrightTimer = null;
  let cachedFieldRect = null;
  let cachedFieldRectAt = 0;
  const FIELD_RECT_TTL = 800;

  function stopBunnyGlow() {
    if (bunnyBrightTimer) { clearInterval(bunnyBrightTimer); bunnyBrightTimer = null; }
    document.querySelectorAll(".bunnyWrap").forEach(w => { w.style.filter = ""; });
  }

  function getFieldRect(field) {
    const now = Date.now();
    if (cachedFieldRect && (now - cachedFieldRectAt) < FIELD_RECT_TTL) return cachedFieldRect;
    cachedFieldRect = field.getBoundingClientRect();
    cachedFieldRectAt = now;
    return cachedFieldRect;
  }

  function startBunnyGlow(on, phase) {
    if (!on) { stopBunnyGlow(); return; }

    const field = getField();
    if (!field) { stopBunnyGlow(); return; }

    const boost = (phase === "night") ? 1.20 : 1.10;
    const tick = 350;

    if (bunnyBrightTimer) clearInterval(bunnyBrightTimer);
    bunnyBrightTimer = setInterval(() => {
      const fieldEl = getField();
      if (!fieldEl) { stopBunnyGlow(); return; }

      const fr = getFieldRect(fieldEl);
      const centerX = fr.left + fr.width * 0.5;
      const originY = fr.top + spotOriginTopPx();

      const wraps = document.querySelectorAll(".bunnyWrap");
      if (!wraps.length) return;

      wraps.forEach(w => {
        const r = w.getBoundingClientRect();
        const x = r.left + r.width * 0.5;
        const y = r.top  + r.height * 0.8;

        const dy = Math.max(0, y - originY);
        const allowed = 130 + dy * 0.90;
        const inside = Math.abs(x - centerX) < allowed;

        const want = inside ? `brightness(${boost})` : "";
        if (w.style.filter !== want) w.style.filter = want;
      });
    }, tick);
  }

  /* =========================
   * Apply
   * ========================= */
  let lastPhase = "";
  let lastOn = null;

  let applyQueued = false;
  function requestApply(force = false) {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      apply(force);
    });
  }

  function apply(force = false) {
    const bgLayer = getBgLayer();
    const field = getField();
    if (!bgLayer) return;

    ensureBgLayerReady(bgLayer);

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      const bg = THEMES[phase] || THEMES.day;
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;
      try { window.WB?.emit?.("bg:changed", { phase, hour: h }); } catch {}
    }

    const owned = hasMirrorballOwned();
    const enabled = isMirrorballEnabled();

    // ★唯一の真実：OFFを勝手にONに戻さない
    const on = owned && enabled;

    // onが変わってない & forceでないなら最小更新
    if (!force && lastOn === on) {
      setSpotEnabled(bgLayer, on, phase);
      startBunnyGlow(on, phase);
      return;
    }
    lastOn = on;

    if (!on) {
      // OFFに切り替わった瞬間だけ重め掃除
      ensureMirrorball(bgLayer, false);
      removeSpot();
      stopBunnyGlow();
      cleanupAllMirrorballStuff(document);
      return;
    }

    // ON
    ensureMirrorball(bgLayer, true);
    setSpotEnabled(bgLayer, true, phase);
    startBunnyGlow(true, phase);
  }

  /* =========================
   * Boot / Watch
   * ========================= */
  let tries = 0;
  const bootTimer = setInterval(() => {
    tries++;
    requestApply(true);
    if (getBgLayer() || tries >= 80) clearInterval(bootTimer);
  }, 50);

  setInterval(() => requestApply(false), 60 * 1000);

  const invalidateRect = () => { cachedFieldRect = null; cachedFieldRectAt = 0; };
  window.addEventListener("resize", invalidateRect, { passive: true });
  window.addEventListener("scroll", invalidateRect, { passive: true });

  const hookWB = () => {
    if (!window.WB?.on) return false;
    [
      "core:reset_partial",
      "core:ready",
      "bg:mirrorball_changed",
      "bg:mirrorball_toggle",
      "shop:changed",
      "shop:state_changed",
      "shop:toggled",
    ].forEach(ev => {
      try { window.WB.on(ev, () => requestApply(true)); } catch {}
    });
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);

  // localStorage更新を同タブで拾う
  (function hookLocalStorage() {
    try {
      const _setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => {
        _setItem(k, v);
        if (k === LS_STATE || k === LS_OWNED) requestApply(true);
      };
    } catch {}
  })();

  window.addEventListener("storage", (e) => {
    if (e && (e.key === LS_STATE || e.key === LS_OWNED)) requestApply(true);
  });
})();
