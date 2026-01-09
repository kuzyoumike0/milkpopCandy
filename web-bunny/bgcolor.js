// bgcolor.js（V11.1：スポットライトが“置いたミラーボール位置”から必ず出る FIX）
// ✅ 朝昼夜 背景をJSTで自動
// ✅ ミラーボール：購入済み + itemPlaceで enabled=true + placed=true のときだけ表示
// ✅ ミラーボール画像も「itemPlaceで置いた座標」に同期（中央固定はしない）
// ✅ スポットライト：幅広い虹2本 / 左右ゆらゆら / hue回転
// ✅ OFF時は残骸ゼロ（ライトも画像も消す）
// ✅ 軽量（rAF 1本 + 30秒ごとに再同期）
// ※ shop_state_v1 は見ない（=OFFできないバグ根絶）

(() => {
  "use strict";

  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_IP_EN = "milkpop_itemplace_enabled_v1";
  const LS_IP_ST = "milkpop_itemplace_v10"; // itemPlace.js側のstateKeyに合わせる（違うならここだけ直す）

  const BG_ID = "bgLayer";
  const FIELD_ID = "field";

  /* =========================
   * Mirrorball (render in bgLayer synced to itemPlace position)
   * ========================= */
  const MIRROR = {
    id: "bgMirrorballImgV11",
    styleId: "bgMirrorballStyleV11",
    src: "./assets/bg/mirrorball.png",
    z: 40,
  };

  /* =========================
   * Spotlights
   * ========================= */
  const FX = {
    wrapId: "bgMirrorFXWrapV11",
    leftId: "bgMirrorFXLeftV11",
    rightId: "bgMirrorFXRightV11",
    styleId: "bgMirrorFXStyleV11",
    z: 25,

    // 見た目
    width: 420, // px（幅広）
    height: 760,
    blur: 4.0,
    opacityDay: 0.52,
    opacityNight: 0.72,

    baseAngleL: -18,
    baseAngleR: 18,
    swayDeg: 12,
    swaySpeed: 0.0016,

    hueSpeed: 0.035,

    // ミラーボール画像内の「光源」位置（球の下あたり）
    anchorX: 0.50,
    anchorY: 0.62,
  };

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

  const $ = (q, p = document) => p.querySelector(q);
  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
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
   * Truth source (owned/enabled/placed)
   * ========================= */
  function isOwnedMirrorball() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    const j = safeParse(localStorage.getItem(LS_OWNED));
    return !!j?.mirrorball;
  }

  function itemPlaceEnabledMirrorball() {
    const en = safeParse(localStorage.getItem(LS_IP_EN)) || {};
    // 未設定ならtrue扱い（itemPlace仕様）
    if (typeof en.mirrorball !== "boolean") return true;
    return !!en.mirrorball;
  }

  function itemPlaceState() {
    return safeParse(localStorage.getItem(LS_IP_ST)) || {};
  }

  function itemPlacePlacedMirrorball() {
    const st = itemPlaceState();
    const s = st?.mirrorball;
    return !!(s && typeof s === "object" && s.placed === true);
  }

  function shouldShowMirrorballAndSpot() {
    if (!isOwnedMirrorball()) return false;
    if (!itemPlaceEnabledMirrorball()) return false;
    if (!itemPlacePlacedMirrorball()) return false;
    return true;
  }

  /* =========================
   * Mirrorball display size (match itemPlace scale if possible)
   * ========================= */
  const mirrorNatural = { w: 140, h: 140, ok: false, loading: false };

  function preloadMirrorNaturalOnce() {
    if (mirrorNatural.ok || mirrorNatural.loading) return;
    mirrorNatural.loading = true;
    const im = new Image();
    im.onload = () => {
      mirrorNatural.w = im.naturalWidth || mirrorNatural.w;
      mirrorNatural.h = im.naturalHeight || mirrorNatural.h;
      mirrorNatural.ok = true;
      mirrorNatural.loading = false;
      applyBg(true);
    };
    im.onerror = () => {
      mirrorNatural.ok = true; // fallback ok
      mirrorNatural.loading = false;
    };
    im.src = MIRROR.src;
  }

  function getMirrorDisplayScale() {
    // itemPlace.js が公開してる items から mirrorball.displayScale を拾えるなら拾う
    try {
      const it =
        window.ITEMPLACE?._getItems?.()?.mirrorball ||
        window.WB?.itemplace?._getItems?.()?.mirrorball;
      const ds = Number(it?.displayScale);
      if (Number.isFinite(ds) && ds > 0) return ds;
    } catch {}

    // それが無い場合は 1.0（=原寸）
    return 1.0;
  }

  function getMirrorDisplayWH() {
    const ds = getMirrorDisplayScale();
    return {
      w: (mirrorNatural.w || 140) * ds,
      h: (mirrorNatural.h || 140) * ds,
    };
  }

  /* =========================
   * Cleanup
   * ========================= */
  function cleanupFX() {
    try { document.getElementById(FX.wrapId)?.remove(); } catch {}
  }

  function cleanupMirrorImg() {
    try { document.getElementById(MIRROR.id)?.remove(); } catch {}
  }

  /* =========================
   * Mirrorball image
   * ========================= */
  function ensureMirrorStyle() {
    if (document.getElementById(MIRROR.styleId)) return;
    const st = document.createElement("style");
    st.id = MIRROR.styleId;
    st.textContent = `
#${MIRROR.id}{
  position:absolute;
  left:0; top:0;
  z-index:${MIRROR.z};
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.25));
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorImg(bgLayer, on) {
    if (!bgLayer) return null;
    ensureLayerReady(bgLayer);
    ensureMirrorStyle();

    if (!on) {
      cleanupMirrorImg();
      return null;
    }

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
    return img;
  }

  /* =========================
   * FX (2 beams)
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
}
`;
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
      wrap.innerHTML =
        `<div class="beam" id="${FX.leftId}"></div>` +
        `<div class="beam" id="${FX.rightId}"></div>`;
      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    } else {
      if (wrap.parentElement !== bgLayer) bgLayer.insertBefore(wrap, bgLayer.firstChild);
      else if (bgLayer.firstChild !== wrap) bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  /* =========================
   * Coordinate sync:
   * itemPlace state is #field local coords (px).
   * We convert to bgLayer local coords by rect difference.
   * ========================= */
  function getMirrorTopLeftInBg(bgLayer, field) {
    const st = itemPlaceState();
    const s = st?.mirrorball;
    if (!s || !s.placed) return null;

    const fr = field.getBoundingClientRect();
    const br = bgLayer.getBoundingClientRect();

    const xViewport = fr.left + Number(s.x || 0);
    const yViewport = fr.top  + Number(s.y || 0);

    return {
      x: xViewport - br.left,
      y: yViewport - br.top,
    };
  }

  function getMirrorAnchorInBg(bgLayer, field) {
    const tl = getMirrorTopLeftInBg(bgLayer, field);
    if (!tl) return null;

    const wh = getMirrorDisplayWH();
    return {
      x: tl.x + wh.w * FX.anchorX,
      y: tl.y + wh.h * FX.anchorY,
      tlx: tl.x,
      tly: tl.y,
      w: wh.w,
      h: wh.h,
    };
  }

  function syncFXLayout(phase) {
    const bgLayer = document.getElementById(BG_ID);
    const field = document.getElementById(FIELD_ID);
    if (!bgLayer || !field) return;

    const on = shouldShowMirrorballAndSpot();

    // ミラーボール画像
    const img = ensureMirrorImg(bgLayer, on);

    // FX wrap
    const fxWrap = ensureFX(bgLayer);
    if (!fxWrap) return;

    if (!on) {
      fxWrap.style.display = "none";
      cleanupFX();
      cleanupMirrorImg();
      return;
    }

    const a = getMirrorAnchorInBg(bgLayer, field);
    if (!a) {
      fxWrap.style.display = "none";
      if (img) img.style.display = "none";
      return;
    }

    // mirrorball img を置いた座標へ同期
    if (img) {
      const wh = getMirrorDisplayWH();
      img.style.display = "block";
      img.style.left = `${Math.round(a.tlx)}px`;
      img.style.top  = `${Math.round(a.tly)}px`;
      img.style.width = `${Math.round(wh.w)}px`;
      img.style.height = "auto";
    }

    fxWrap.style.display = "block";

    const L = document.getElementById(FX.leftId);
    const R = document.getElementById(FX.rightId);
    if (!L || !R) return;

    const op = (phase === "night") ? FX.opacityNight : FX.opacityDay;

    const common = (el) => {
      el.style.left = `${Math.round(a.x)}px`;
      el.style.top = `${Math.round(a.y)}px`;
      el.style.width = `${FX.width}px`;
      el.style.height = `${FX.height}px`;
      el.style.opacity = String(op);
      // filterはrAFで上書きされる（ここは初期）
      el.style.filter = `blur(${FX.blur}px) saturate(1.35) hue-rotate(0deg)`;
    };

    common(L);
    common(R);

    // 初期角度
    L.style.transform = `translateX(-50%) rotate(${FX.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${FX.baseAngleR}deg)`;
  }

  /* =========================
   * Background apply
   * ========================= */
  let lastPhase = "";
  function applyBg(force = false) {
    const bgLayer = document.getElementById(BG_ID);
    const field = document.getElementById(FIELD_ID);
    if (!bgLayer) return;

    ensureLayerReady(bgLayer);
    if (field) ensureLayerReady(field);

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      const bg = THEMES[phase] || THEMES.day;
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;
    }

    preloadMirrorNaturalOnce();
    syncFXLayout(phase);
  }

  /* =========================
   * Animation loop
   * ========================= */
  let __raf = 0;
  function startLoop() {
    cancelAnimationFrame(__raf);
    const tick = (t) => {
      __raf = requestAnimationFrame(tick);

      if (!shouldShowMirrorballAndSpot()) return;

      const L = document.getElementById(FX.leftId);
      const R = document.getElementById(FX.rightId);
      const wrap = document.getElementById(FX.wrapId);
      if (!wrap || wrap.style.display === "none") return;
      if (!L || !R) return;

      // 揺れ
      const s1 = Math.sin(t * FX.swaySpeed);
      const s2 = Math.sin(t * (FX.swaySpeed * 1.07) + 1.4);
      const angL = FX.baseAngleL + s1 * FX.swayDeg;
      const angR = FX.baseAngleR - s2 * FX.swayDeg;

      L.style.transform = `translateX(-50%) rotate(${angL.toFixed(2)}deg)`;
      R.style.transform = `translateX(-50%) rotate(${angR.toFixed(2)}deg)`;

      // 虹（hue回転）
      const hue = (t * FX.hueSpeed) % 360;
      const f = `blur(${FX.blur}px) saturate(1.35) hue-rotate(${hue.toFixed(1)}deg)`;
      L.style.filter = f;
      R.style.filter = f;
    };
    __raf = requestAnimationFrame(tick);
  }

  /* =========================
   * Watchers
   * ========================= */
  function hookStorageChange() {
    // 同タブ setItem フック
    try {
      const _setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => {
        _setItem(k, v);
        if (k === LS_OWNED || k === LS_IP_EN || k === LS_IP_ST) applyBg(true);
      };
    } catch {}

    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === LS_OWNED || e.key === LS_IP_EN || e.key === LS_IP_ST) applyBg(true);
    });
  }

  function hookWB() {
    if (!window.WB?.on) return;
    [
      "shop:changed",
      "itemplace:enabled_changed",
      "itemplace:owned_changed",
      "core:ready",
      "core:reset_partial",
    ].forEach(ev => {
      try { window.WB.on(ev, () => applyBg(true)); } catch {}
    });
  }

  /* =========================
   * Boot
   * ========================= */
  (function boot() {
    applyBg(true);
    startLoop();
    hookStorageChange();
    hookWB();

    // 30秒ごとに時刻/状態再同期
    setInterval(() => applyBg(false), 30_000);

    window.addEventListener("resize", () => applyBg(true), { passive: true });
    window.addEventListener("scroll", () => applyBg(true), { passive: true });
  })();
})();
