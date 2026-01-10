// bgcolor.js（V13：転生フラグ(牧場の星)で背景切替 + mirrorballスポットはV12継承）
// ✅ 朝昼夜 背景をJSTで自動
// ✅ 転生（牧場の星 >= 1）なら “転生テーマ” に切替（朝昼夜は転生版）
// ✅ mirrorball：購入済み + enabled=true + placed=true のときだけ有効
// ✅ スポットライト：幅広い虹2本 / 左右ゆらゆら / hue回転
// ✅ 光源位置：itemPlace が置いた #itemPlace_mirrorball の位置から算出（ズレ根絶）
// ✅ 軽量：rAF1本 / 30秒ごと再同期 / OFF時は残骸ゼロ

(() => {
  "use strict";

  /* =========================
   * Storage Keys
   * ========================= */
  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_IP_EN = "milkpop_itemplace_enabled_v1";
  const LS_IP_ST = "milkpop_itemplace_v10"; // ✅ itemPlace.js V10 と一致

  // ✅ 転生（牧場の星）
  const LS_STARS = "wb_stars_v1"; // number

  /* =========================
   * DOM IDs
   * ========================= */
  const BG_ID    = "bgLayer";
  const FIELD_ID = "field";

  const MIRROR_DOM_ID = "itemPlace_mirrorball"; // ✅ itemPlace が作る実物
  const MIRROR_IMG_FALLBACK = {
    id: "bgMirrorballImgV13",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 40,
  };

  /* =========================
   * Mirrorball FX
   * ========================= */
  const FX = {
    wrapId: "bgMirrorFXWrapV13",
    leftId: "bgMirrorFXLeftV13",
    rightId:"bgMirrorFXRightV13",
    styleId:"bgMirrorFXStyleV13",
    z: 25,

    width: 520,
    height: 860,
    blur: 4.0,
    opacityDay: 0.52,
    opacityNight: 0.76,

    baseAngleL: -20,
    baseAngleR:  20,
    swayDeg: 14,
    swaySpeed: 0.00155,

    hueSpeed: 0.035,

    // ミラーボール画像の光源（だいたい球の下）
    anchorX: 0.50,
    anchorY: 0.62,
  };

  /* =========================
   * Time Phase
   * ========================= */
  const MORNING = { start: 5, end: 10 };
  const DAY     = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  // ✅ 転生テーマ（“次元が上”）
  const REINC_THEMES = {
    morning: "linear-gradient(180deg, #fff0c9 0%, #ffd2f0 46%, #f7fbff 100%)",
    day:     "linear-gradient(180deg, #bff4ff 0%, #d4fff1 46%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #090a21 0%, #141a4a 48%, #3a1a66 100%)",
  };

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function getStars() {
    const n = Number(localStorage.getItem(LS_STARS) || "0");
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  function isReincarnated() {
    return getStars() >= 1;
  }

  function getJSTHour() {
    try {
      const parts = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      return Number(parts.find(p => p.type === "hour")?.value ?? 0);
    } catch {
      return new Date().getHours();
    }
  }

  function getPhaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  function ensureLayerReady(el) {
    if (!el) return;
    try {
      const cs = getComputedStyle(el);
      if (cs.position === "static") el.style.position = "relative";
    } catch {}
    el.style.overflow = "hidden";
  }

  /* =========================
   * Mirrorball ON Conditions
   * ========================= */
  function isOwnedMirrorball() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    const j = safeParse(localStorage.getItem(LS_OWNED));
    return !!j?.mirrorball;
  }

  function itemPlaceEnabledMirrorball() {
    const en = safeParse(localStorage.getItem(LS_IP_EN)) || {};
    if (typeof en.mirrorball !== "boolean") return true;
    return !!en.mirrorball;
  }

  function itemPlacePlacedMirrorball() {
    const st = safeParse(localStorage.getItem(LS_IP_ST)) || {};
    const s = st?.mirrorball;
    return !!(s && typeof s === "object" && s.placed === true);
  }

  function shouldOn() {
    if (!isOwnedMirrorball()) return false;
    if (!itemPlaceEnabledMirrorball()) return false;
    if (!itemPlacePlacedMirrorball()) return false;
    return true;
  }

  function cleanupFX() {
    try { document.getElementById(FX.wrapId)?.remove(); } catch {}
  }
  function cleanupMirrorFallbackImg() {
    try { document.getElementById(MIRROR_IMG_FALLBACK.id)?.remove(); } catch {}
  }

  /* =========================
   * Mirrorball fallback image
   * ========================= */
  function ensureMirrorFallbackStyle() {
    const id = "bgMirrorballStyleV13";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
#${MIRROR_IMG_FALLBACK.id}{
  position:absolute;
  left:50%;
  top:${MIRROR_IMG_FALLBACK.top}px;
  transform:translateX(-50%);
  width:${MIRROR_IMG_FALLBACK.size}px;
  height:auto;
  z-index:${MIRROR_IMG_FALLBACK.z};
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.25));
}`;
    document.head.appendChild(st);
  }

  function ensureMirrorFallbackImg(bgLayer, on) {
    if (!bgLayer) return;
    ensureLayerReady(bgLayer);
    ensureMirrorFallbackStyle();

    const real = document.getElementById(MIRROR_DOM_ID);
    if (real && real.isConnected) {
      cleanupMirrorFallbackImg();
      return;
    }

    if (!on) { cleanupMirrorFallbackImg(); return; }

    let img = document.getElementById(MIRROR_IMG_FALLBACK.id);
    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR_IMG_FALLBACK.id;
      img.alt = "mirrorball";
      img.src = MIRROR_IMG_FALLBACK.src;
      img.draggable = false;
      bgLayer.appendChild(img);
    } else if (img.getAttribute("src") !== MIRROR_IMG_FALLBACK.src) {
      img.src = MIRROR_IMG_FALLBACK.src;
    }
  }

  /* =========================
   * FX beams
   * ========================= */
  function ensureFXStyle() {
    if (document.getElementById(FX.styleId)) return;
    const st = document.createElement("style");
    st.id = FX.styleId;
    st.textContent = `
#${FX.wrapId}{
  position:absolute;
  inset:0;
  pointer-events:none;
  overflow:hidden;
  z-index:${FX.z};
  display:none;
}
#${FX.wrapId} .beam{
  position:absolute;
  left:0; top:0;
  transform-origin: 50% 0%;
  pointer-events:none;
  mix-blend-mode: screen;
  border-radius: 18px;
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  background: linear-gradient(90deg,
    rgba(255,0,80,.92) 0%,
    rgba(255,140,0,.92) 14%,
    rgba(255,230,0,.92) 28%,
    rgba(0,255,120,.92) 42%,
    rgba(0,210,255,.92) 56%,
    rgba(0,120,255,.92) 70%,
    rgba(170,70,255,.92) 84%,
    rgba(255,0,180,.92) 100%
  );
  box-shadow: 0 0 40px rgba(255,255,255,.15) inset;
}`;
    document.head.appendChild(st);
  }

  function ensureFX(bgLayer) {
    if (!bgLayer) return null;
    ensureLayerReady(bgLayer);
    ensureFXStyle();

    let wrap = document.getElementById(FX.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = FX.wrapId;
      wrap.innerHTML = `<div class="beam" id="${FX.leftId}"></div><div class="beam" id="${FX.rightId}"></div>`;
      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    } else {
      if (wrap.parentElement !== bgLayer) bgLayer.insertBefore(wrap, bgLayer.firstChild);
      else if (bgLayer.firstChild !== wrap) bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  function getAnchorInBg(bgLayer) {
    const br = bgLayer.getBoundingClientRect();
    if (!br.width || !br.height) return null;

    const real = document.getElementById(MIRROR_DOM_ID);
    if (real && real.isConnected) {
      const r = real.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        const x = (r.left + r.width * FX.anchorX) - br.left;
        const y = (r.top  + r.height * FX.anchorY) - br.top;
        return { x, y };
      }
    }

    const field = document.getElementById(FIELD_ID);
    if (!field) return null;

    const st = safeParse(localStorage.getItem(LS_IP_ST)) || {};
    const s = st?.mirrorball;
    if (!s || !s.placed) return null;

    const fr = field.getBoundingClientRect();
    const x = (fr.left + Number(s.x || 0) + MIRROR_IMG_FALLBACK.size * FX.anchorX) - br.left;
    const y = (fr.top  + Number(s.y || 0) + MIRROR_IMG_FALLBACK.size * FX.anchorY) - br.top;
    return { x, y };
  }

  function syncFXLayout(phase) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
    if (!bgLayer) return;

    ensureLayerReady(bgLayer);
    if (field) ensureLayerReady(field);

    const on = shouldOn();

    ensureMirrorFallbackImg(bgLayer, on);

    const fxWrap = ensureFX(bgLayer);
    if (!fxWrap) return;

    if (!on) {
      fxWrap.style.display = "none";
      cleanupFX();
      return;
    }

    const a = getAnchorInBg(bgLayer);
    if (!a) { fxWrap.style.display = "none"; return; }

    fxWrap.style.display = "block";

    const L = document.getElementById(FX.leftId);
    const R = document.getElementById(FX.rightId);
    if (!L || !R) return;

    const op = (phase === "night") ? FX.opacityNight : FX.opacityDay;

    const common = (el) => {
      el.style.left = `${Math.round(a.x)}px`;
      el.style.top  = `${Math.round(a.y)}px`;
      el.style.width  = `${FX.width}px`;
      el.style.height = `${FX.height}px`;
      el.style.opacity = String(op);
      el.style.filter = `blur(${FX.blur}px) saturate(1.35)`;
    };

    common(L);
    common(R);

    L.style.transform = `translateX(-50%) rotate(${FX.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${FX.baseAngleR}deg)`;
  }

  /* =========================
   * Apply background (phase + reincarnation)
   * ========================= */
  let lastPhase = "";
  let lastReinc = null;

  function applyBg(force = false) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
    if (!bgLayer) return;

    ensureLayerReady(bgLayer);
    if (field) ensureLayerReady(field);

    const h = getJSTHour();
    const phase = getPhaseByHour(h);
    const reinc = isReincarnated();

    if (force || phase !== lastPhase || reinc !== lastReinc) {
      lastPhase = phase;
      lastReinc = reinc;

      const bg = (reinc ? (REINC_THEMES[phase] || REINC_THEMES.day) : (THEMES[phase] || THEMES.day));
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;

      bgLayer.dataset.reincarnated = reinc ? "1" : "0";
      if (field) field.dataset.reincarnated = reinc ? "1" : "0";
    }

    syncFXLayout(phase);
  }

  /* =========================
   * Animation loop (mirrorball beams)
   * ========================= */
  let __raf = 0;
  function startLoop() {
    cancelAnimationFrame(__raf);
    const tick = (t) => {
      __raf = requestAnimationFrame(tick);

      if (!shouldOn()) return;

      const L = document.getElementById(FX.leftId);
      const R = document.getElementById(FX.rightId);
      if (!L || !R) return;

      const s1 = Math.sin(t * FX.swaySpeed);
      const s2 = Math.sin(t * (FX.swaySpeed * 1.07) + 1.4);

      const angL = FX.baseAngleL + s1 * FX.swayDeg;
      const angR = FX.baseAngleR - s2 * FX.swayDeg;

      L.style.transform = `translateX(-50%) rotate(${angL.toFixed(2)}deg)`;
      R.style.transform = `translateX(-50%) rotate(${angR.toFixed(2)}deg)`;

      const hue = (t * FX.hueSpeed) % 360;
      const f = `blur(${FX.blur}px) saturate(1.35) hue-rotate(${hue.toFixed(1)}deg)`;
      L.style.filter = f;
      R.style.filter = f;
    };
    __raf = requestAnimationFrame(tick);
  }

  function hookStorageChange() {
    try {
      const _setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => {
        _setItem(k, v);
        if (k === LS_OWNED || k === LS_IP_EN || k === LS_IP_ST || k === LS_STARS) applyBg(true);
      };
    } catch {}
    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === LS_OWNED || e.key === LS_IP_EN || e.key === LS_IP_ST || e.key === LS_STARS) applyBg(true);
    });
  }

  function hookWB() {
    if (!window.WB?.on) return;
    const evs = [
      "shop:changed",
      "itemplace:enabled_changed",
      "itemplace:owned_changed",
      "itemplace:state_changed",
      "core:ready",
      "core:reset_partial",
      "reincarnated",
      "starsChanged",
    ];
    evs.forEach(ev => {
      try { window.WB.on(ev, () => applyBg(true)); } catch {}
    });
  }

  (function boot() {
    applyBg(true);
    startLoop();
    hookStorageChange();
    hookWB();

    setInterval(() => applyBg(false), 30_000);
    window.addEventListener("resize", () => applyBg(true), { passive: true });
    window.addEventListener("scroll",  () => applyBg(true), { passive: true });
  })();
})();
