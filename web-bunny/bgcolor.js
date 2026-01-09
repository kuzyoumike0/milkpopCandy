// bgcolor.js（V11：itemPlaceのmirrorball設置ON/OFF & placed に完全同期して虹スポットを出す）
// ✅ 朝昼夜 背景をJSTで自動
// ✅ ミラーボール：購入済み + itemPlaceで enabled=true + placed=true のときだけ表示
// ✅ スポットライト：幅広い虹2本 / 左右ゆらゆら / hue回転
// ✅ OFF時は残骸ゼロ（ライトも画像も消す）
// ✅ 軽量（rAF 1本 + 30秒ごとに再同期）
// ※ shop_state_v1 は見ない（=OFFできないバグ根絶）

(() => {
  "use strict";

  const LS_OWNED   = "milkpop_shop_owned_v1";
  const LS_IP_EN   = "milkpop_itemplace_enabled_v1";
  const LS_IP_ST   = "milkpop_itemplace_v10"; // itemPlace.js側のstateKeyに合わせる（違うならここだけ直す）

  const BG_ID    = "bgLayer";
  const FIELD_ID = "field";

  // ===== Mirrorball (optional image in bgLayer) =====
  const MIRROR = {
    id: "bgMirrorballImgV11",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 40,
  };

  // ===== Spotlights =====
  const FX = {
    wrapId: "bgMirrorFXWrapV11",
    leftId: "bgMirrorFXLeftV11",
    rightId:"bgMirrorFXRightV11",
    styleId:"bgMirrorFXStyleV11",
    z: 25,

    // 見た目調整
    width: 420,     // px（幅広）
    height: 760,    // px（長め）
    blur: 4.0,
    opacityDay: 0.52,
    opacityNight: 0.72,

    baseAngleL: -18,
    baseAngleR:  18,
    swayDeg: 12,
    swaySpeed: 0.0016,

    hueSpeed: 0.035,

    // ミラーボール画像内の「光源」位置（だいたい球の下）
    anchorX: 0.50,
    anchorY: 0.62,
  };

  // ===== Time themes (JST) =====
  const MORNING = { start: 5, end: 10 };
  const DAY     = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

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

  // ===== Truth source =====
  function isOwnedMirrorball() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    const j = safeParse(localStorage.getItem(LS_OWNED));
    return !!j?.mirrorball;
  }

  function itemPlaceEnabledMirrorball() {
    const en = safeParse(localStorage.getItem(LS_IP_EN)) || {};
    // 未設定ならtrue扱い（itemPlace仕様に合わせる）
    if (typeof en.mirrorball !== "boolean") return true;
    return !!en.mirrorball;
  }

  function itemPlacePlacedMirrorball() {
    const st = safeParse(localStorage.getItem(LS_IP_ST)) || {};
    const s = st?.mirrorball;
    return !!(s && typeof s === "object" && s.placed === true);
  }

  function shouldShowMirrorballAndSpot() {
    if (!isOwnedMirrorball()) return false;
    if (!itemPlaceEnabledMirrorball()) return false;
    if (!itemPlacePlacedMirrorball()) return false;
    return true;
  }

  // ===== Cleanup =====
  function cleanupFX(root = document) {
    try { root.getElementById?.(FX.wrapId)?.remove(); } catch {}
    try { document.getElementById(FX.wrapId)?.remove(); } catch {}
  }

  function cleanupMirrorImg(root = document) {
    try { root.getElementById?.(MIRROR.id)?.remove(); } catch {}
    try { document.getElementById(MIRROR.id)?.remove(); } catch {}
  }

  // ===== Mirrorball image =====
  function ensureMirrorStyle() {
    const id = "bgMirrorballStyleV11";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
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

  function ensureMirrorImg(bgLayer, on) {
    if (!bgLayer) return;
    ensureLayerReady(bgLayer);
    ensureMirrorStyle();

    if (!on) {
      cleanupMirrorImg(document);
      return;
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
  }

  // ===== FX (2 beams) =====
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
      wrap.innerHTML = `<div class="beam" id="${FX.leftId}"></div><div class="beam" id="${FX.rightId}"></div>`;
      // 背景の先頭に
      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    } else {
      if (wrap.parentElement !== bgLayer) bgLayer.insertBefore(wrap, bgLayer.firstChild);
      else if (bgLayer.firstChild !== wrap) bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  // itemPlaceのmirrorball座標を背景座標へ変換（host=#field基準）
  function getMirrorAnchorInBg(bgLayer, field) {
    const st = safeParse(localStorage.getItem(LS_IP_ST)) || {};
    const s = st?.mirrorball;
    if (!s || !s.placed) return null;

    // itemPlaceは#fieldローカル座標（px）
    const fr = field.getBoundingClientRect();
    const br = bgLayer.getBoundingClientRect();

    const xInViewport = fr.left + Number(s.x || 0) + (MIRROR.size * FX.anchorX);
    const yInViewport = fr.top  + Number(s.y || 0) + (MIRROR.size * FX.anchorY);

    const x = xInViewport - br.left;
    const y = yInViewport - br.top;

    return { x, y };
  }

  function syncFXLayout(phase) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
    if (!bgLayer || !field) return;

    const on = shouldShowMirrorballAndSpot();
    ensureMirrorImg(bgLayer, on);

    const fxWrap = ensureFX(bgLayer);
    if (!fxWrap) return;

    if (!on) {
      fxWrap.style.display = "none";
      cleanupFX(document);
      return;
    }

    const a = getMirrorAnchorInBg(bgLayer, field);
    if (!a) {
      fxWrap.style.display = "none";
      return;
    }

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

    // 初期角度
    L.style.transform = `translateX(-50%) rotate(${FX.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${FX.baseAngleR}deg)`;
  }

  // ===== Background apply =====
  let lastPhase = "";
  function applyBg(force = false) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
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

    syncFXLayout(phase);
  }

  // ===== Animation loop =====
  let __raf = 0;
  function startLoop() {
    cancelAnimationFrame(__raf);
    const tick = (t) => {
      __raf = requestAnimationFrame(tick);

      // 条件外なら軽く終了
      if (!shouldShowMirrorballAndSpot()) return;

      const L = document.getElementById(FX.leftId);
      const R = document.getElementById(FX.rightId);
      if (!L || !R) return;

      // 揺れ
      const s1 = Math.sin(t * FX.swaySpeed);
      const s2 = Math.sin(t * (FX.swaySpeed * 1.07) + 1.4);
      const angL = FX.baseAngleL + s1 * FX.swayDeg;
      const angR = FX.baseAngleR - s2 * FX.swayDeg;

      L.style.transform = `translateX(-50%) rotate(${angL.toFixed(2)}deg)`;
      R.style.transform = `translateX(-50%) rotate(${angR.toFixed(2)}deg)`;

      // 虹
      const hue = (t * FX.hueSpeed) % 360;
      const f = `blur(${FX.blur}px) saturate(1.35) hue-rotate(${hue.toFixed(1)}deg)`;
      L.style.filter = f;
      R.style.filter = f;
    };
    __raf = requestAnimationFrame(tick);
  }

  // ===== Watchers =====
  function hookStorageChange() {
    // 同タブでsetItemしても反映させる
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
    const evs = [
      "shop:changed",
      "itemplace:enabled_changed",
      "itemplace:owned_changed",
      "core:ready",
      "core:reset_partial",
    ];
    evs.forEach(ev => {
      try { window.WB.on(ev, () => applyBg(true)); } catch {}
    });
  }

  // ===== Boot =====
  (function boot() {
    applyBg(true);
    startLoop();
    hookStorageChange();
    hookWB();

    // 30秒ごとに時刻/状態再同期
    setInterval(() => applyBg(false), 30_000);

    window.addEventListener("resize", () => applyBg(true), { passive: true });
    window.addEventListener("scroll",  () => applyBg(true), { passive: true });
  })();
})();
