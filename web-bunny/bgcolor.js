// bgcolor.js（V12.1 - itemPlace key auto-detect / spotlight always reliable）
// ✅ 朝昼夜 背景をJSTで自動
// ✅ mirrorball：購入済み + enabled=true + placed=true のときだけ有効
// ✅ itemPlace の保存キー milkpop_itemplace_v* を自動検出（v8/v9/v10/v11…全部対応）
// ✅ #itemPlace_mirrorball が存在する場合はそれを優先して光源位置に使う
// ✅ 軽量：rAF1本 / 30秒ごと再同期 / OFF時は残骸ゼロ
// ✅ 転生仕様（あなたのV12のまま維持）

(() => {
  "use strict";

  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_IP_EN = "milkpop_itemplace_enabled_v1";

  // ✅ 転生フラグ
  const LS_REINC = "milkpop_reincarnation_v1";

  const BG_ID    = "bgLayer";
  const FIELD_ID = "field";

  const MIRROR_DOM_ID = "itemPlace_mirrorball"; // itemPlace が作る実物（理想）
  const MIRROR_IMG_FALLBACK = {
    id: "bgMirrorballImgV12",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 40,
  };

  const FX = {
    wrapId: "bgMirrorFXWrapV12",
    leftId: "bgMirrorFXLeftV12",
    rightId:"bgMirrorFXRightV12",
    styleId:"bgMirrorFXStyleV12",
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

    anchorX: 0.50,
    anchorY: 0.62,
  };

  // ✅ 転生専用生物（DOM）
  const REBORN = {
    id: "wbReincarnatedCreatureV1",
    styleId: "wbReincarnatedCreatureStyleV1",
    z: 80,
  };

  const MORNING = { start: 5, end: 10 };
  const DAY     = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
    reincarnated: "radial-gradient(circle at 50% 35%, rgba(255,255,255,.95) 0%, rgba(250,210,255,.55) 22%, rgba(120,220,255,.35) 45%, rgba(20,18,38,1) 100%)",
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

  // ===== 転生判定 =====
  function isReincarnated() {
    const v = String(localStorage.getItem(LS_REINC) || "").trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "on";
  }

  // ===== mirrorball 判定 =====
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

  // ✅ itemPlace保存キーを自動検出
  function detectItemPlaceStateKey() {
    // WBが教えてくれるなら最優先（将来用）
    try {
      const k = window.WB?.itemplace?.LS_STATE_KEY;
      if (typeof k === "string" && k) return k;
    } catch {}

    // localStorage の milkpop_itemplace_v* を全部見て「mirrorball.placed===true」があるキーを採用
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^milkpop_itemplace_v\d+$/i.test(k)) keys.push(k);
      }
    } catch {}

    // まず “最新っぽい番号が大きい順” に見る
    keys.sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return nb - na;
    });

    // placed=true が見つかったキー
    for (const k of keys) {
      const st = safeParse(localStorage.getItem(k)) || {};
      const s = st?.mirrorball;
      if (s && typeof s === "object" && s.placed === true) return k;
    }

    // placedが見つからなくても、とりあえず “最新キー” を返す（デバッグ用）
    return keys[0] || "milkpop_itemplace_v10";
  }

  function readMirrorballState() {
    const key = detectItemPlaceStateKey();
    const st = safeParse(localStorage.getItem(key)) || {};
    return { key, st };
  }

  function itemPlacePlacedMirrorball() {
    const { st } = readMirrorballState();
    const s = st?.mirrorball;
    return !!(s && typeof s === "object" && s.placed === true);
  }

  function shouldOn() {
    if (!isOwnedMirrorball()) return false;
    if (!itemPlaceEnabledMirrorball()) return false;

    // ✅ DOMに実物が居るなら、それだけで「置かれている」とみなす（強い）
    const real = document.getElementById(MIRROR_DOM_ID);
    if (real && real.isConnected) return true;

    if (!itemPlacePlacedMirrorball()) return false;
    return true;
  }

  function cleanupFX() {
    try { document.getElementById(FX.wrapId)?.remove(); } catch {}
  }
  function cleanupMirrorFallbackImg() {
    try { document.getElementById(MIRROR_IMG_FALLBACK.id)?.remove(); } catch {}
  }

  // ===== 転生：うさぎ & ハート掃除 =====
  function removeNodes(list) { list.forEach(el => { try { el.remove(); } catch {} }); }

  function clearBunniesAndHearts() {
    try { removeNodes(Array.from(document.querySelectorAll(".bunnyWrap, .bunny-wrap"))); } catch {}
    try { $("#bunnyLayer")?.replaceChildren(); } catch {}
    try { $("#bunnylayer")?.replaceChildren(); } catch {}

    try { removeNodes(Array.from(document.querySelectorAll('img[src*="hart"],img[src*="heart"],img[src*="Hart"],img[src*="Heart"]'))); } catch {}
    try { removeNodes(Array.from(document.querySelectorAll(".hart,.heart,.wbHeart,.wbHart"))); } catch {}

    try {
      if (window.WB) {
        if (Array.isArray(window.WB.bunnies)) window.WB.bunnies.length = 0;
        try { window.WB.emit?.("bunnyCountChanged", { count: 0 }); } catch {}
      }
    } catch {}
  }

  // ===== 転生：専用生物1体 =====
  function ensureRebornStyle() {
    if (document.getElementById(REBORN.styleId)) return;
    const st = document.createElement("style");
    st.id = REBORN.styleId;
    st.textContent = `
#${REBORN.id}{
  position:absolute;
  left:50%;
  top:52%;
  transform:translate(-50%,-50%);
  width:96px; height:96px;
  border-radius:999px;
  z-index:${REBORN.z};
  pointer-events:none;
  user-select:none;
  background: radial-gradient(circle at 35% 35%, rgba(255,255,255,.98) 0%, rgba(255,220,250,.85) 28%, rgba(160,230,255,.55) 52%, rgba(255,255,255,0) 70%);
  filter: drop-shadow(0 18px 28px rgba(255,255,255,.22));
  animation: wbRebornFloat 2.8s ease-in-out infinite;
}
#${REBORN.id}::after{
  content:"✦";
  position:absolute;
  left:50%; top:50%;
  transform:translate(-50%,-50%);
  font-size:28px; font-weight:1000;
  opacity:.92;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
  animation: wbRebornTwinkle 1.25s ease-in-out infinite;
}
@keyframes wbRebornFloat{
  0%{ transform:translate(-50%,-50%) translateY(0) scale(1.00); }
  50%{ transform:translate(-50%,-50%) translateY(-10px) scale(1.03); }
  100%{ transform:translate(-50%,-50%) translateY(0) scale(1.00); }
}
@keyframes wbRebornTwinkle{
  0%{ opacity:.70; transform:translate(-50%,-50%) rotate(0deg) scale(0.95); }
  50%{ opacity:1.00; transform:translate(-50%,-50%) rotate(12deg) scale(1.05); }
  100%{ opacity:.70; transform:translate(-50%,-50%) rotate(0deg) scale(0.95); }
}`;
    document.head.appendChild(st);
  }

  function ensureRebornCreature(on) {
    const field = document.getElementById(FIELD_ID);
    if (!field) return;
    ensureLayerReady(field);
    ensureRebornStyle();

    let el = document.getElementById(REBORN.id);
    if (!on) {
      if (el) { try { el.remove(); } catch {} }
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = REBORN.id;
      field.appendChild(el);
    } else if (el.parentElement !== field) {
      field.appendChild(el);
    }
  }

  // ===== mirrorball fallback =====
  function ensureMirrorFallbackStyle() {
    const id = "bgMirrorballStyleV12";
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

    const { key, st } = readMirrorballState();
    const s = st?.mirrorball;
    if (!s || !s.placed) return null;

    const fr = field.getBoundingClientRect();
    const x = (fr.left + Number(s.x || 0) + MIRROR_IMG_FALLBACK.size * FX.anchorX) - br.left;
    const y = (fr.top  + Number(s.y || 0) + MIRROR_IMG_FALLBACK.size * FX.anchorY) - br.top;

    // どのキーを採用してるかログに残す（デバッグ用）
    return { x, y, __key: key };
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

    common(L); common(R);
    L.style.transform = `translateX(-50%) rotate(${FX.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${FX.baseAngleR}deg)`;

    // ✅ どの itemplace キーを見てるかを一回だけ出す（うるさくならないように）
    if (!syncFXLayout.__loggedKey && a.__key) {
      syncFXLayout.__loggedKey = true;
      console.log("[bgcolor] itemPlace key detected:", a.__key);
    }
  }

  // ===== 転生反映 =====
  let __prevReinc = false;
  function applyReincarnation(force = false) {
    const on = isReincarnated();
    if (force || on !== __prevReinc) {
      __prevReinc = on;
      if (on) clearBunniesAndHearts();
    }
    ensureRebornCreature(on);
    return on;
  }

  let lastPhase = "";
  function applyBg(force = false) {
    const bgLayer = document.getElementById(BG_ID);
    const field   = document.getElementById(FIELD_ID);
    if (!bgLayer) return;

    ensureLayerReady(bgLayer);
    if (field) ensureLayerReady(field);

    const reinc = applyReincarnation(force);

    if (reinc) {
      const bg = THEMES.reincarnated || THEMES.night;
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;
      syncFXLayout("night");
      return;
    }

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
        if (k === LS_OWNED || k === LS_IP_EN || /^milkpop_itemplace_v\d+$/i.test(k) || k === LS_REINC) applyBg(true);
      };
    } catch {}

    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === LS_OWNED || e.key === LS_IP_EN || /^milkpop_itemplace_v\d+$/i.test(e.key || "") || e.key === LS_REINC) applyBg(true);
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
    ];
    evs.forEach(ev => {
      try { window.WB.on(ev, () => applyBg(true)); } catch {}
    });
  }

  function exposeReincarnationAPI() {
    if (!window.WB) window.WB = {};
    if (window.WB.reincarnation) return;

    window.WB.reincarnation = {
      key: LS_REINC,
      get: () => isReincarnated(),
      set: (on) => {
        try { localStorage.setItem(LS_REINC, on ? "true" : "false"); } catch {}
        applyBg(true);
      },
      clear: () => {
        try { localStorage.removeItem(LS_REINC); } catch {}
        applyBg(true);
      },
      purgeBunniesAndHearts: () => clearBunniesAndHearts(),
    };
  }

  (function boot() {
    exposeReincarnationAPI();
    applyBg(true);
    startLoop();
    hookStorageChange();
    hookWB();

    setInterval(() => applyBg(false), 30_000);
    window.addEventListener("resize", () => applyBg(true), { passive: true });
    window.addEventListener("scroll",  () => applyBg(true), { passive: true });

    // ✅ 状態ログ（最初の1回だけ）
    try {
      const { key } = readMirrorballState();
      console.log("[bgcolor] V12.1 ready", {
        owned: isOwnedMirrorball(),
        enabled: itemPlaceEnabledMirrorball(),
        placed: itemPlacePlacedMirrorball(),
        stateKey: key,
        mirrorDom: !!document.getElementById(MIRROR_DOM_ID),
      });
    } catch {}
  })();
})();
