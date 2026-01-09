// itemPlace.js（V9：bed/oak は “うさぎと同じくらい” スケール + 🛏 bed 地面吸着 + 🪩 mirrorball 設置ON/OFF + 虹スポット）
// ✅ アイテム配置は itemPlace のみで行う（shop.js は購入のみ）
// ✅ shop.js購入済み(owned)の「配置できるアイテム」だけ扱う（★mirrorball も扱う）
// ✅ oak.png などアイテムが増えても自動対応：SHOP.items() / WB.shop.items() / fallback の順で吸収
// ✅ 設置ON/OFFは itemPlace.js が管理（LS: milkpop_itemplace_enabled_v1）
// ✅ 拡大縮小UIは無し
// ✅ 表示倍率は固定：デフォは少し大きめ、ただし bed/oak は “うさぎと同じくらい” に上書き
// ✅ ゴースト枠も同倍率
// ✅ 座標基準は #field
// ✅ 配置モード：赤枠（透明）→ クリックで設置 → ドラッグ移動 → 完了
// ✅ OFFにした瞬間に撤去（残骸ゼロ）
// ✅ アイテム選択も itemPlace で完結（セレクト + 配置物クリックで選択）
// ✅ うさぎの裏：wrap を #bunnyLayer の直前へ（DOM順）＋低z-index
// ✅ クリックできない問題根絶：編集中だけ pointer-events:auto
// ✅ 🛏 bed を地面吸着（bottom基準）：置いた/ドラッグした後に “床” に吸着（y固定）
// ✅ 🪩 mirrorball：設置時、ミラーボール位置から「幅広の虹スポットライト」2本を左右にゆらす（常時）

(() => {
  "use strict";
  console.log("[itemPlace] LOADED V9", Date.now());

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const LS_STATE_KEY   = "milkpop_itemplace_v9";          // { key:{x,y,rot,placed} }
  const LS_ENABLED_KEY = "milkpop_itemplace_enabled_v1";  // { key:boolean }

  const HOST_ID  = "field";

  const WRAP_ID  = "itemPlaceWrapV9";
  const STYLE_ID = "itemPlaceStyleV9";
  const PANEL_ID = "itemPlacePanelV9";
  const GHOST_ID = "itemPlaceGhostV9";
  const TOAST_ID = "itemPlaceToastV1";

  const FX_ID    = "itemPlaceFXV1";
  const FX_L_ID  = "ipFxBeamL";
  const FX_R_ID  = "ipFxBeamR";

  // ✅ 基本は少し大きめ（他アイテム用）
  const DISPLAY_SCALE_DEFAULT = 1.18;

  // ✅ bed / oak は “うさぎと同じくらい”
  const ITEM_SCALE_OVERRIDE = {
    bed: 1.00,
    oak: 1.00,
    // mirrorball は雰囲気優先で少し大きめにしたければ 1.1 とかにしてOK
    mirrorball: 1.00,
  };

  // ✅ 🛏 bed 地面吸着：床からの余白（px）
  const BED_GROUND_MARGIN_PX = 0;

  // ✅ 🪩 虹スポットライト設定
  const MIRRORBALL_KEY = "mirrorball";
  const SPOT = {
    // beams (px) ※広め
    width: 320,
    height: 520,
    // 出力点（ミラーボール画像内の割合）
    anchorX: 0.50,
    anchorY: 0.28,
    // 初期角度（左右）
    baseAngleL: -18,
    baseAngleR:  18,
    // ゆらぎの振れ幅
    swayDeg: 10,
    // ゆらぎ速度（大きいほど早い）
    swaySpeed: 0.0016,
    // 透明度
    opacityDay: 0.52,
    opacityNight: 0.72,
    // blur
    blurPx: 2.8,
  };

  const $ = (q, p = document) => p.querySelector(q);
  const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, "\\$&");

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function toast(msg) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      el.style.cssText = `
position:fixed; left:50%; top:16px; transform:translateX(-50%);
z-index:2147483647;
background:rgba(0,0,0,.78); color:#fff;
padding:10px 12px; border-radius:14px;
font-weight:900; font-size:13px;
box-shadow:0 14px 40px rgba(0,0,0,.25);
pointer-events:none; opacity:0; transition:opacity .18s ease;`;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1200);
  }

  /* =========================
   * Items source (増えても追従)
   * ========================= */

  const FALLBACK_ITEMS = [
    { key: "bed", label: "ベッド", img: "./assets/bg/bed.png", placeable: true },
    { key: "oak", label: "オーク", img: "./assets/bg/oak.png", placeable: true },
    { key: "mirrorball", label: "ミラーボール", img: "./assets/bg/mirrorball.png", placeable: true },
  ];

  function normalizeShopItem(it) {
    const key = String(it?.key || "").trim();
    if (!key) return null;

    const label = String(it?.label ?? key);
    const src = String(it?.img ?? it?.src ?? "");

    const ds = Number(it?.displayScale);
    const displayScaleFromShop = (Number.isFinite(ds) && ds > 0) ? ds : null;

    return { key, label, src, placeable: !!it?.placeable, displayScaleFromShop };
  }

  function readShopItemsMap() {
    try {
      const fn = window.SHOP?.items || window.WB?.shop?.items;
      if (typeof fn === "function") {
        const obj = fn();
        if (obj && typeof obj === "object") return obj;
      }
    } catch {}
    return null;
  }

  function getDefaultForKey(key) {
    // 初期位置は適当に中央寄り
    return { x: 180, y: 280, rot: 0, placed: false };
  }

  function buildPlaceItems() {
    const map = readShopItemsMap();
    const items = [];

    if (map) {
      for (const k of Object.keys(map)) {
        const n = normalizeShopItem(map[k]);
        if (n) items.push(n);
      }
    } else {
      for (const x of FALLBACK_ITEMS) {
        const n = normalizeShopItem({ key: x.key, label: x.label, img: x.img, placeable: x.placeable });
        if (n) items.push(n);
      }
    }

    const out = {};
    for (const it of items) {
      if (!it.placeable) continue;
      if (!it.src) continue;

      out[it.key] = {
        key: it.key,
        label: it.label,
        src: it.src,
        z: 1,
        default: getDefaultForKey(it.key),
        displayScale:
          it.displayScaleFromShop ??
          (Number.isFinite(+ITEM_SCALE_OVERRIDE[it.key]) ? +ITEM_SCALE_OVERRIDE[it.key] : DISPLAY_SCALE_DEFAULT),
        groundSnap: (it.key === "bed"),
      };
    }

    const order = Object.keys(out).sort();
    return { out, order };
  }

  let PLACE_ITEMS = {};
  let PLACE_ORDER = [];

  function refreshItems() {
    const built = buildPlaceItems();
    PLACE_ITEMS = built.out;
    PLACE_ORDER = built.order;

    st = loadState();
    saveState(st);

    const en = loadEnabled();
    saveEnabled(en);
  }

  /* =========================
   * Owned
   * ========================= */

  function loadOwned() { return safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {}; }

  function isOwned(key) {
    try { if (window.WB?.shop?.isOwned) return !!window.WB.shop.isOwned(key); } catch {}
    return !!loadOwned()?.[key];
  }

  /* =========================
   * Enabled (ON/OFF)
   * ========================= */

  function loadEnabled() {
    const j = safeParse(localStorage.getItem(LS_ENABLED_KEY)) || {};
    const out = { ...j };

    for (const k of Object.keys(PLACE_ITEMS)) {
      if (typeof out[k] !== "boolean") out[k] = true;
    }
    for (const k of Object.keys(out)) {
      if (!(k in PLACE_ITEMS)) delete out[k];
    }
    return out;
  }

  function saveEnabled(en) { try { localStorage.setItem(LS_ENABLED_KEY, JSON.stringify(en)); } catch {} }
  function isEnabled(key) { return !!loadEnabled()?.[key]; }

  function setEnabled(key, v) {
    const en = loadEnabled();
    en[key] = !!v;
    saveEnabled(en);

    if (!en[key]) {
      st[key] = st[key] || { ...PLACE_ITEMS[key]?.default };
      if (st[key]) st[key].placed = false;
      saveState(st);
      removeObj(key);
    }

    // 🪩 mirrorball のFXも即反映
    syncFX();

    try { window.WB?.emit?.("itemplace:enabled_changed", { key, enabled: !!en[key] }); } catch {}
  }

  /* =========================
   * State
   * ========================= */

  function loadState() {
    const j = safeParse(localStorage.getItem(LS_STATE_KEY)) || {};
    const out = {};

    for (const k of Object.keys(PLACE_ITEMS)) {
      const def = PLACE_ITEMS[k].default;
      const cur = j?.[k] || {};
      out[k] = {
        x: Number(cur.x ?? def.x),
        y: Number(cur.y ?? def.y),
        rot: Number(cur.rot ?? def.rot),
        placed: (typeof cur.placed === "boolean") ? cur.placed : !!def.placed,
      };
    }
    return out;
  }

  function saveState(st0) { try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(st0)); } catch {} }

  /* =========================
   * Image natural size
   * ========================= */

  const imgSize = {}; // { key:{w,h} }

  function preloadSize(key) {
    const it = PLACE_ITEMS[key];
    if (!it) return Promise.resolve(null);
    if (imgSize[key]?.w && imgSize[key]?.h) return Promise.resolve(imgSize[key]);

    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        imgSize[key] = { w: im.naturalWidth || 120, h: im.naturalHeight || 90 };
        resolve(imgSize[key]);
      };
      im.onerror = () => {
        console.warn("[itemPlace] preload failed:", it.src);
        imgSize[key] = { w: 120, h: 90 };
        resolve(imgSize[key]);
      };
      im.src = it.src;
    });
  }

  async function preloadAll() {
    for (const k of Object.keys(PLACE_ITEMS)) await preloadSize(k);
  }

  function getDisplayScale(key) {
    const it = PLACE_ITEMS[key];
    const ds = Number(it?.displayScale);
    if (Number.isFinite(ds) && ds > 0) return ds;
    return DISPLAY_SCALE_DEFAULT;
  }

  function getDisplayWH(key) {
    const base = imgSize[key] || { w: 120, h: 90 };
    const ds = getDisplayScale(key);
    return { w: base.w * ds, h: base.h * ds };
  }

  /* =========================
   * 🛏 bed 地面吸着
   * ========================= */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function snapGroundIfNeeded(key) {
    const it = PLACE_ITEMS[key];
    if (!it?.groundSnap) return;

    const host = getHost();
    const r = host.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return;

    const s = st[key];
    if (!s || !s.placed) return;

    const wh = getDisplayWH(key);
    s.y = (r.height - wh.h - BED_GROUND_MARGIN_PX);
    s.x = clamp(s.x, -wh.w * 0.2, r.width - wh.w * 0.8);
  }

  /* =========================
   * 🪩 Mirrorball FX (虹スポットライト)
   * ========================= */

  function isNightNow() {
    const h = new Date().getHours();
    return (h < 6 || h >= 18);
  }

  function ensureFX() {
    ensureStyle();
    let fx = document.getElementById(FX_ID);
    if (!fx) {
      fx = document.createElement("div");
      fx.id = FX_ID;
      fx.innerHTML = `<div id="${FX_L_ID}"></div><div id="${FX_R_ID}"></div>`;
      ensureWrap()?.appendChild(fx);
    }
    return fx;
  }

  function getMirrorballAnchor() {
    // st座標は hostローカル。FXも wrap 内 absolute なので同座標でOK
    const s = st[MIRRORBALL_KEY];
    if (!s || !s.placed) return null;

    const wh = getDisplayWH(MIRRORBALL_KEY);
    const ax = s.x + wh.w * SPOT.anchorX;
    const ay = s.y + wh.h * SPOT.anchorY;
    return { x: ax, y: ay, w: wh.w, h: wh.h };
  }

  function shouldShowFX() {
    if (!(MIRRORBALL_KEY in PLACE_ITEMS)) return false;
    if (!isOwned(MIRRORBALL_KEY)) return false;
    if (!isEnabled(MIRRORBALL_KEY)) return false;
    const s = st[MIRRORBALL_KEY];
    if (!s || !s.placed) return false;
    return true;
  }

  function syncFX() {
    const wrap = ensureWrap();
    if (!wrap) return;

    const show = shouldShowFX();
    const fx = ensureFX();
    fx.style.display = show ? "block" : "none";
    if (!show) return;

    const a = getMirrorballAnchor();
    if (!a) return;

    const L = document.getElementById(FX_L_ID);
    const R = document.getElementById(FX_R_ID);
    if (!L || !R) return;

    const op = isNightNow() ? SPOT.opacityNight : SPOT.opacityDay;

    // 位置をアンカーへ
    fx.style.left = "0px";
    fx.style.top = "0px";

    // beams 共通スタイル（毎回合わせ直してズレ根絶）
    const common = (el) => {
      el.style.position = "absolute";
      el.style.left = `${Math.round(a.x)}px`;
      el.style.top = `${Math.round(a.y)}px`;
      el.style.width = `${SPOT.width}px`;
      el.style.height = `${SPOT.height}px`;
      el.style.transformOrigin = "50% 0%";
      el.style.pointerEvents = "none";
      el.style.opacity = String(op);
      el.style.filter = `blur(${SPOT.blurPx}px) saturate(1.35)`;
      el.style.mixBlendMode = "screen";
      el.style.borderRadius = "18px";
      el.style.clipPath = "polygon(50% 0%, 0% 100%, 100% 100%)";
      // 虹（横グラデ）＋うっすら中心強調
      el.style.background =
        "linear-gradient(90deg," +
        "rgba(255,0,80,.92) 0%," +
        "rgba(255,140,0,.92) 14%," +
        "rgba(255,230,0,.92) 28%," +
        "rgba(0,255,120,.92) 42%," +
        "rgba(0,210,255,.92) 56%," +
        "rgba(0,120,255,.92) 70%," +
        "rgba(170,70,255,.92) 84%," +
        "rgba(255,0,180,.92) 100%)";
      el.style.boxShadow = "0 0 40px rgba(255,255,255,.15) inset";
    };

    common(L);
    common(R);

    // 左右の “基準角度” はアニメで毎フレ更新する（ここでは初期だけ）
    L.style.transform = `translateX(-50%) rotate(${SPOT.baseAngleL}deg)`;
    R.style.transform = `translateX(-50%) rotate(${SPOT.baseAngleR}deg)`;
  }

  let __fxRAF = 0;
  function startFXLoop() {
    cancelAnimationFrame(__fxRAF);

    const tick = (t) => {
      __fxRAF = requestAnimationFrame(tick);

      if (!shouldShowFX()) return;

      const L = document.getElementById(FX_L_ID);
      const R = document.getElementById(FX_R_ID);
      if (!L || !R) return;

      // ゆらぎ（左右で位相を変える）
      const s1 = Math.sin(t * SPOT.swaySpeed);
      const s2 = Math.sin(t * (SPOT.swaySpeed * 1.12) + 1.7);

      const angL = SPOT.baseAngleL + s1 * SPOT.swayDeg;
      const angR = SPOT.baseAngleR - s2 * SPOT.swayDeg;

      L.style.transform = `translateX(-50%) rotate(${angL.toFixed(2)}deg)`;
      R.style.transform = `translateX(-50%) rotate(${angR.toFixed(2)}deg)`;

      // 虹色の変化（hue-rotate）
      const hue = (t * 0.02) % 360;
      const f = `blur(${SPOT.blurPx}px) saturate(1.35) hue-rotate(${hue.toFixed(1)}deg)`;
      L.style.filter = f;
      R.style.filter = f;
    };

    __fxRAF = requestAnimationFrame(tick);
  }

  /* =========================
   * DOM / Layer
   * ========================= */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const stEl = document.createElement("style");
    stEl.id = STYLE_ID;
    stEl.textContent = `
#${WRAP_ID}{
  position:absolute;
  inset:0;
  overflow:visible;
  pointer-events:none;
  z-index:1;
}
#${WRAP_ID}.ipEditing{ pointer-events:auto; }
#${WRAP_ID}.ipEditing .itemPlaceObj{ pointer-events:auto; }

.itemPlaceObj{
  position:absolute;
  left:0; top:0;
  transform-origin:0 0;
  user-select:none;
  -webkit-user-drag:none;
  pointer-events:none;
}
.itemPlaceObj.selected{
  outline: 3px solid rgba(255,0,0,.95);
  outline-offset: 2px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.08);
  cursor: grab;
}
.itemPlaceObj.selected:active{ cursor: grabbing; }

#${FX_ID}{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:0; /* アイテムより後ろ（=さらに奥） */
}
#${FX_ID} > div{
  pointer-events:none;
}

#${GHOST_ID}{
  position:fixed;
  left:0; top:0;
  transform: translate3d(-9999px,-9999px,0);
  z-index:2147483646;
  border: 3px solid rgba(255,0,0,.55);
  border-radius: 14px;
  background: rgba(255,0,0,.08);
  pointer-events:none;
  box-shadow: 0 14px 34px rgba(0,0,0,.18);
  width:120px; height:90px;
}

#${PANEL_ID}{
  position:fixed;
  left:10px; top:58px;
  z-index:2147483647;
  background: rgba(255,255,255,.92);
  border: 2px solid rgba(255,0,0,.75);
  border-radius: 12px;
  padding: 10px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  display:none;
  min-width: 300px;
  max-width: min(360px, 92vw);
}
#${PANEL_ID} .ttl{ font-weight:1000; margin-bottom:6px; }
#${PANEL_ID} .row{ display:flex; gap:6px; margin: 6px 0; flex-wrap:wrap; align-items:center; }
#${PANEL_ID} button{
  border: 1px solid rgba(0,0,0,.15);
  background: white;
  border-radius: 10px;
  padding: 7px 10px;
  cursor: pointer;
  font-weight: 1000;
}
#${PANEL_ID} select{
  width:100%;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(0,0,0,.15);
  font-weight:1000;
}
#${PANEL_ID} .hint{ opacity:.75; font-size:12px; line-height:1.35; margin-top:6px; }
#${PANEL_ID} .chip{
  margin-left:auto;
  font-weight:1000;
  font-size:12px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(0,0,0,.12);
  background:#fff;
}
#${PANEL_ID} .chip.on{ border-color: rgba(0,160,60,.35); }
#${PANEL_ID} .chip.off{ border-color: rgba(220,0,0,.35); opacity:.8; }
#${PANEL_ID} .mini{
  width:40px; height:40px;
  border-radius:10px;
  border:1px solid rgba(0,0,0,.12);
  background:#fff;
  overflow:hidden;
  display:flex; align-items:center; justify-content:center;
}
#${PANEL_ID} .mini img{ width:100%; height:100%; object-fit:contain; }
`;
    document.head.appendChild(stEl);
  }

  function getHost() {
    return document.getElementById(HOST_ID) || document.body;
  }

  function ensureWrap() {
    ensureStyle();

    const host = getHost();
    if (!host) return null;

    try {
      const cs = getComputedStyle(host);
      if (cs.position === "static") host.style.position = "relative";
    } catch {}

    let wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = WRAP_ID;
    }

    const bunny = document.getElementById("bunnyLayer");
    if (bunny && bunny.parentElement) {
      const parent = bunny.parentElement;
      try {
        const pcs = getComputedStyle(parent);
        if (pcs.position === "static") parent.style.position = "relative";
      } catch {}
      if (wrap.parentElement !== parent || wrap.nextSibling !== bunny) {
        parent.insertBefore(wrap, bunny);
      }
    } else {
      if (wrap.parentElement !== host) {
        host.insertBefore(wrap, host.firstChild);
      }
    }

    wrap.style.zIndex = "1";

    // FXはwrapの先頭に（さらに奥）
    ensureFX();
    return wrap;
  }

  function ensureGhost() {
    ensureStyle();
    let g = document.getElementById(GHOST_ID);
    if (!g) {
      g = document.createElement("div");
      g.id = GHOST_ID;
      document.body.appendChild(g);
    }
    return g;
  }

  function setGhostSizeFor(key) {
    const g = ensureGhost();
    const wh = getDisplayWH(key);
    g.style.width  = `${Math.max(8, wh.w)}px`;
    g.style.height = `${Math.max(8, wh.h)}px`;
  }

  function showGhostAt(clientX, clientY, key) {
    const g = ensureGhost();
    setGhostSizeFor(key);
    const w = parseFloat(g.style.width) || 120;
    const h = parseFloat(g.style.height) || 90;
    g.style.transform = `translate3d(${clientX - w / 2}px,${clientY - h / 2}px,0)`;
  }

  function hideGhost() {
    const g = ensureGhost();
    g.style.transform = "translate3d(-9999px,-9999px,0)";
  }

  /* =========================
   * Objects
   * ========================= */

  function ensureObj(key) {
    const it = PLACE_ITEMS[key];
    if (!it) return null;

    const wrap = ensureWrap();
    if (!wrap) return null;

    let img = document.getElementById(`itemPlace_${key}`);
    if (!img) {
      img = document.createElement("img");
      img.id = `itemPlace_${key}`;
      img.className = "itemPlaceObj";
      img.alt = key;
      img.src = it.src;
      img.draggable = false;
      img.style.zIndex = String(it.z ?? 1);
      img.dataset.ipKey = key;
      img.addEventListener("error", () => console.warn("[itemPlace] load failed:", it.src));
      wrap.appendChild(img);
    } else {
      img.dataset.ipKey = key;
      if (img.getAttribute("src") !== it.src) img.src = it.src;
    }
    return img;
  }

  function removeObj(key) {
    try { document.getElementById(`itemPlace_${key}`)?.remove(); } catch {}
    if (key === MIRRORBALL_KEY) syncFX();
  }

  function applyTransform(img, s, key) {
    const ds = getDisplayScale(key);
    img.style.left = `${Math.round(s.x)}px`;
    img.style.top  = `${Math.round(s.y)}px`;
    img.style.transform = `scale(${ds}) rotate(${s.rot}deg)`;
  }

  /* =========================
   * Editing
   * ========================= */

  let editing = false;
  let selectedKey = "";
  let st = {};

  const drag = { active:false, key:"", startX:0, startY:0, baseX:0, baseY:0 };

  function ownedKeys() {
    const o = [];
    for (const k of PLACE_ORDER) if (isOwned(k)) o.push(k);
    return o;
  }

  function ensurePanel() {
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (p) return p;

    p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
  <div class="ttl">🧸 アイテム配置</div>

  <div class="row" style="gap:8px; align-items:flex-start;">
    <div style="flex:1 1 auto; min-width: 180px;">
      <select id="ipSel"></select>
      <div class="hint" style="margin-top:6px;">
        透明赤枠の位置をクリックで設置。<br>
        設置後はドラッグで移動。<br>
        <b>配置物をクリック</b>で選択できます。<br>
        （bed / oak は <b>うさぎと同じくらい</b>）<br>
        🛏 bed は <b>床に吸着</b>します。<br>
        🪩 mirrorball は <b>虹スポット</b>が出ます。
      </div>
    </div>

    <div style="display:flex; flex-direction:column; gap:6px; align-items:stretch;">
      <div class="mini" id="ipMini"><img alt="" /></div>
      <button class="chip" id="ipToggle" type="button">設置ON</button>
    </div>
  </div>

  <div class="row">
    <button id="ipRotL">⟲ 回転</button>
    <button id="ipRotR">⟳ 回転</button>
    <button id="ipReset">リセット</button>
  </div>

  <div class="row">
    <button id="ipRemove">撤去</button>
    <button id="ipDone">完了</button>
  </div>
`;
    document.body.appendChild(p);

    const byId = (id) => document.getElementById(id);

    byId("ipRotL").addEventListener("click", () => {
      if (!selectedKey) return;
      const s = st[selectedKey]; if (!s) return;
      s.rot -= 5;
      snapGroundIfNeeded(selectedKey);
      saveState(st); syncOne(selectedKey);
    });

    byId("ipRotR").addEventListener("click", () => {
      if (!selectedKey) return;
      const s = st[selectedKey]; if (!s) return;
      s.rot += 5;
      snapGroundIfNeeded(selectedKey);
      saveState(st); syncOne(selectedKey);
    });

    byId("ipReset").addEventListener("click", () => {
      if (!selectedKey) return;
      const def = PLACE_ITEMS[selectedKey]?.default; if (!def) return;
      const keepPlaced = st[selectedKey]?.placed ?? false;
      st[selectedKey] = { ...def, placed: keepPlaced };
      snapGroundIfNeeded(selectedKey);
      saveState(st); syncOne(selectedKey);
    });

    byId("ipRemove").addEventListener("click", () => {
      if (!selectedKey) return;
      const s = st[selectedKey]; if (!s) return;
      s.placed = false;
      saveState(st);
      syncOne(selectedKey);
      syncFX();
    });

    byId("ipDone").addEventListener("click", () => setEditing(false));

    byId("ipToggle").addEventListener("click", () => {
      if (!selectedKey) return;
      const now = isEnabled(selectedKey);
      setEnabled(selectedKey, !now);
      refreshToggle();
      syncAll();
      toast(!now ? "✅ 設置ON" : "⛔ 設置OFF（撤去）");
      refreshSelect();
    });

    return p;
  }

  function refreshMini() {
    const p = ensurePanel();
    const box = $("#ipMini", p);
    const img = $("#ipMini img", p);
    if (!box || !img) return;

    const it = PLACE_ITEMS[selectedKey];
    if (!selectedKey || !it) {
      img.src = "";
      img.alt = "";
      box.style.opacity = "0.4";
      return;
    }
    img.src = it.src;
    img.alt = selectedKey;
    box.style.opacity = "1";
  }

  function refreshToggle() {
    const p = ensurePanel();
    const btn = $("#ipToggle", p);
    if (!btn) return;

    if (!selectedKey || !isOwned(selectedKey)) {
      btn.textContent = "設置ON";
      btn.classList.remove("on", "off");
      btn.disabled = true;
      return;
    }

    btn.disabled = false;
    const on = isEnabled(selectedKey);
    btn.textContent = on ? "設置ON" : "設置OFF";
    btn.classList.toggle("on", on);
    btn.classList.toggle("off", !on);
  }

  function refreshSelect() {
    const p = ensurePanel();
    const sel = $("#ipSel", p);
    if (!sel) return;

    const owned = ownedKeys();
    if (!owned.length) {
      sel.innerHTML = `<option value="">（購入済みアイテムがありません）</option>`;
      sel.value = "";
      selectedKey = "";
      refreshToggle();
      refreshMini();
      return;
    }

    sel.innerHTML = owned.map(k => {
      const it = PLACE_ITEMS[k];
      const en = isEnabled(k);
      const mark = en ? "" : "（OFF）";
      return `<option value="${esc(k)}">${it?.label || k}${mark}</option>`;
    }).join("");

    if (!owned.includes(selectedKey)) selectedKey = owned[0];
    sel.value = selectedKey;

    sel.onchange = () => {
      if (!sel.value) return;
      selectedKey = sel.value;
      refreshToggle();
      refreshMini();
      syncAll();
    };

    refreshToggle();
    refreshMini();
  }

  function selectKey(key) {
    if (!key || !PLACE_ITEMS[key]) return;
    if (!isOwned(key)) return;
    selectedKey = key;
    refreshSelect();
    syncAll();
  }

  function syncOne(key) {
    const it = PLACE_ITEMS[key];
    const s = st[key];
    if (!it || !s) return;

    if (!isOwned(key) || !isEnabled(key) || !s.placed) {
      removeObj(key);
      return;
    }

    snapGroundIfNeeded(key);

    const img = ensureObj(key);
    if (!img) return;

    applyTransform(img, s, key);

    const isSel = editing && key === selectedKey;
    img.classList.toggle("selected", isSel);

    // 🪩 mirrorball: 描画が変わったらFXも再同期
    if (key === MIRRORBALL_KEY) syncFX();
  }

  function syncAll() {
    const wrap = ensureWrap();
    if (wrap) wrap.classList.toggle("ipEditing", !!editing);

    document.querySelectorAll(`[id^="itemPlace_"]`).forEach(el => {
      const key = el.id.replace(/^itemPlace_/, "");
      if (!(key in PLACE_ITEMS)) {
        try { el.remove(); } catch {}
      }
    });

    for (const k of Object.keys(PLACE_ITEMS)) syncOne(k);

    // FXも常に整える
    syncFX();
  }

  function isOverUI(target) {
    return !!(
      target?.closest?.(
        `#${PANEL_ID}, #gameMenuPanelV1, #gameHamburgerV1, #isyouModal, #isyouConfirmBar, #bgShopModalV1, #bgShopBackdropV1, #bgShopModalV2, #bgShopBackdropV2, #bgShopModalV3, #bgShopBackdropV3`
      )
    );
  }

  function onMoveGhost(e) {
    if (!editing) return;
    if (!selectedKey) { hideGhost(); return; }
    if (!isEnabled(selectedKey)) { hideGhost(); return; }
    if (isOverUI(e.target)) { hideGhost(); return; }
    showGhostAt(e.clientX, e.clientY, selectedKey);
  }

  function onPlaceDownCapture(e) {
    if (!editing) return;
    if (isOverUI(e.target)) return;

    const hit = e.target?.closest?.(".itemPlaceObj");
    if (hit && hit.dataset?.ipKey) return;

    if (!selectedKey) return;
    if (!isOwned(selectedKey)) return;
    if (!isEnabled(selectedKey)) { toast("⛔ 設置OFFです"); return; }

    const host = getHost();
    const r = host.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) {
      console.warn("[itemPlace] host rect is too small:", r);
      return;
    }

    const localX = e.clientX - r.left;
    const localY = e.clientY - r.top;

    const s = st[selectedKey] || (st[selectedKey] = { ...PLACE_ITEMS[selectedKey].default });
    s.placed = true;

    const wh = getDisplayWH(selectedKey);
    s.x = localX - wh.w / 2;
    s.y = localY - wh.h / 2;

    snapGroundIfNeeded(selectedKey);

    saveState(st);
    syncOne(selectedKey);

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  function onObjDown(e) {
    if (!editing) return;

    const hit = e.target?.closest?.(".itemPlaceObj");
    if (!hit) return;

    const key = hit.dataset?.ipKey;
    if (!key) return;
    if (!isOwned(key)) return;
    if (!isEnabled(key)) return;

    if (key !== selectedKey) selectKey(key);

    const s = st[key];
    if (!s || !s.placed) return;

    drag.active = true;
    drag.key = key;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.baseX = s.x;
    drag.baseY = s.y;

    try { hit.setPointerCapture?.(e.pointerId); } catch {}

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  function onObjMove(e) {
    if (!editing) return;
    if (!drag.active) return;

    const s = st[drag.key];
    if (!s) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    s.x = drag.baseX + dx;
    s.y = drag.baseY + dy;

    snapGroundIfNeeded(drag.key);

    syncOne(drag.key);
  }

  function onObjUp() {
    if (!drag.active) return;
    drag.active = false;

    snapGroundIfNeeded(drag.key);

    saveState(st);

    // 🪩 drag後もFX更新
    if (drag.key === MIRRORBALL_KEY) syncFX();
  }

  function onKey(e) {
    if (!editing) return;
    if (e.key === "Escape") setEditing(false);
  }

  function setEditing(on) {
    editing = !!on;

    const p = ensurePanel();
    p.style.display = editing ? "block" : "none";

    refreshSelect();

    if (editing) {
      hideGhost();
      ensureWrap()?.classList.add("ipEditing");

      document.addEventListener("pointermove", onMoveGhost, { passive: true });
      document.addEventListener("pointerdown", onPlaceDownCapture, true);

      document.addEventListener("pointerdown", onObjDown, true);
      document.addEventListener("pointermove", onObjMove, { passive: true });
      document.addEventListener("pointerup", onObjUp, { passive: true });

      window.addEventListener("keydown", onKey, { passive: true });
    } else {
      hideGhost();
      ensureWrap()?.classList.remove("ipEditing");

      document.removeEventListener("pointermove", onMoveGhost);
      document.removeEventListener("pointerdown", onPlaceDownCapture, true);

      document.removeEventListener("pointerdown", onObjDown, true);
      document.removeEventListener("pointermove", onObjMove);
      document.removeEventListener("pointerup", onObjUp);

      window.removeEventListener("keydown", onKey);

      try { snapGroundIfNeeded("bed"); } catch {}
      saveState(st);
    }

    syncAll();
  }

  /* =========================
   * Public
   * ========================= */

  async function openModal() {
    refreshItems();
    await preloadAll();

    const owned = ownedKeys();
    if (!owned.length) {
      toast("（購入済みアイテムがありません）");
      console.warn("[itemPlace] no owned items");
      return;
    }

    if (!owned.includes(selectedKey)) selectedKey = owned[0];

    st = loadState();

    try { snapGroundIfNeeded("bed"); } catch {}

    setEditing(true);
  }

  function close() { setEditing(false); }

  /* =========================
   * Boot
   * ========================= */

  (async function boot() {
    ensureStyle();

    refreshItems();
    await preloadAll();

    st = loadState();
    saveState(st);
    saveEnabled(loadEnabled());

    try { snapGroundIfNeeded("bed"); } catch {}

    syncAll();
    startFXLoop();

    const reSync = async () => {
      refreshItems();
      await preloadAll();
      st = loadState();
      try { snapGroundIfNeeded("bed"); } catch {}
      syncAll();
      if (editing) refreshSelect();
    };

    const hookWB = () => {
      if (!window.WB?.on) return false;
      try {
        window.WB.on("shop:changed", reSync);
        window.WB.on("itemplace:owned_changed", reSync);
        window.WB.on("core:ready", reSync);
      } catch {}
      return true;
    };
    hookWB();
    setTimeout(hookWB, 300);

    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === SHOP_OWNED_KEY || e.key === LS_STATE_KEY || e.key === LS_ENABLED_KEY) {
        st = loadState();
        try { snapGroundIfNeeded("bed"); } catch {}
        syncAll();
        if (editing) refreshSelect();
      }
    });

    // レイアウト変化でもFX位置を合わせる
    window.addEventListener("resize", () => syncFX(), { passive: true });
    window.addEventListener("scroll", () => syncFX(), { passive: true });

    window.ITEMPLACE = {
      openModal,
      open: openModal,
      close,
      select: (key) => selectKey(key),
      refresh: reSync,
      _getItems: () => ({ ...PLACE_ITEMS }),
      _order: () => PLACE_ORDER.slice(),
      _enabledKey: LS_ENABLED_KEY,
      _stateKey: LS_STATE_KEY,
      _scaleDefault: DISPLAY_SCALE_DEFAULT,
      _scaleOverride: { ...ITEM_SCALE_OVERRIDE },
      _bedGroundMargin: BED_GROUND_MARGIN_PX,
      _fx: { SPOT: { ...SPOT } },
    };

    try {
      window.WB = window.WB || {};
      window.WB.itemplace = window.WB.itemplace || {};
      window.WB.itemplace.openModal = openModal;
      window.WB.itemplace.close = close;
      window.WB.itemplace.select = (key) => selectKey(key);
      window.WB.itemplace.refresh = reSync;
    } catch {}
  })();
})();
