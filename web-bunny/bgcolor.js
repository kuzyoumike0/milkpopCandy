// bgcolor.js（V13.1：mirrorballの“後ろ”にスポットライトを固定）
// ✅ 朝昼夜 背景をJSTで自動
// ✅ mirrorball：購入済み + enabled=true + placed=true のときだけ有効
// ✅ スポットライト：幅広い虹2本 / 左右ゆらゆら / hue回転
// ✅ 光源位置：itemPlaceが置いた #itemPlace_mirrorball のDOM位置から算出
// ✅ スポットは #field に重ねるが、mirrorball の “背面” に入れる（DOM順で確実）
// ✅ 軽量：rAF1本 / 30秒ごと再同期 / OFF時は非表示

(() => {
  "use strict";

  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_IP_EN = "milkpop_itemplace_enabled_v1";
  const LS_IP_ST = "milkpop_itemplace_v10"; // ✅ itemPlace.js V10 と一致

  const BG_ID    = "bgLayer";
  const FIELD_ID = "field";

  const MIRROR_DOM_ID = "itemPlace_mirrorball"; // ✅ itemPlace が作る実物

  const FX = {
    wrapId:  "bgMirrorFXWrapV13",
    leftId:  "bgMirrorFXLeftV13",
    rightId: "bgMirrorFXRightV13",
    styleId: "bgMirrorFXStyleV13",

    // ✅ “後ろに置く”ので低め（DOM順でも効くが保険）
    z: 20,

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

  const MORNING = { start: 5, end: 10 };
  const DAY     = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

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

  // ✅ 重要：wrap を #field に入れるが、mirrorball の “直前” に差し込む
  function ensureFXBehindMirrorball() {
    const field = document.getElementById(FIELD_ID);
    if (!field) return null;

    ensureLayerReady(field);
    ensureFXStyle();

    let wrap = document.getElementById(FX.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = FX.wrapId;
      wrap.innerHTML = `<div class="beam" id="${FX.leftId}"></div><div class="beam" id="${FX.rightId}"></div>`;
    }

    // 置き場所：mirrorball の “直前” が最優先（同じ親なら背面になる）
    const mirror = document.getElementById(MIRROR_DOM_ID);
    if (mirror && mirror.isConnected && mirror.parentElement === field) {
      if (wrap.parentElement !== field || wrap.nextSibling !== mirror) {
        try { field.insertBefore(wrap, mirror); } catch { field.appendChild(wrap); }
      }
    } else {
      // mirrorball が見つからない/親が違う時は field の先頭へ（できるだけ後ろ）
      if (wrap.parentElement !== field) field.insertBefore(wrap, field.firstChild);
      else if (field.firstChild !== wrap) field.insertBefore(wrap, field.firstChild);
    }

    return wrap;
  }

  // ✅ 光源位置：#field 座標系で取る
  function getAnchorInField() {
    const field = document.getElementById(FIELD_ID);
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    if (!fr.width || !fr.height) return null;

    const real = document.getElementById(MIRROR_DOM_ID);
    if (real && real.isConnected) {
      const r = real.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        const x = (r.left + r.width * FX.anchorX) - fr.left;
        const y = (r.top  + r.height * FX.anchorY) - fr.top;
        return { x, y };
      }
    }

    // フォールバック：itemPlace state + field基準
    const st = safeParse(localStorage.getItem(LS_IP_ST)) || {};
    const s = st?.mirrorball;
    if (!s || !s.placed) return null;

    const x = Number(s.x || 0) + 140 * FX.anchorX;
    const y = Number(s.y || 0) + 140 * FX.anchorY;
    return { x, y };
  }

  function syncFXLayout(phase) {
    const field = document.getElementById(FIELD_ID);
    if (!field) return;

    ensureLayerReady(field);

    const on = shouldOn();
    const fxWrap = ensureFXBehindMirrorball();
    if (!fxWrap) return;

    if (!on) {
      fxWrap.style.display = "none";
      return;
    }

    const a = getAnchorInField();
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
    L.style.transform = `translateX(-50%) rotate(${FX.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${FX.baseAngleR}deg)`;
  }

  let lastPhase = "";
  function applyBg(force = false) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
    if (!bgLayer || !field) return;

    ensureLayerReady(bgLayer);
    ensureLayerReady(field);

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    if (force || phase !== lastPhase) {
      lastPhase = phase;
      const bg = THEMES[phase] || THEMES.day;
      bgLayer.style.background = bg;
      field.style.background = bg;
    }

    syncFXLayout(phase);
  }

  // ===== Animation loop =====
  let __raf = 0;
  function startLoop() {
    cancelAnimationFrame(__raf);
    const tick = (t) => {
      __raf = requestAnimationFrame(tick);

      if (!shouldOn()) return;

      const L = document.getElementById(FX.leftId);
      const R = document.getElementById(FX.rightId);
      const W = document.getElementById(FX.wrapId);
      if (!L || !R || !W || W.style.display === "none") return;

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
      "itemplace:state_changed",
      "core:ready",
      "core:reset_partial",
      "itemPlaced",
      "itemRemoved",
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
