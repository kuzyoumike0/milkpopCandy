// itemPlace.js（V3）
// ✅ shop.js購入済み(owned)の「配置できるアイテム」だけ扱う
// ✅ ミラーボール(mirrorball)は配置しない（候補にも出さない）
// ✅ 設置ON/OFFは itemPlace.js が管理（LS: milkpop_itemplace_enabled_v1）
// ✅ 実寸サイズ：画像の naturalWidth/Height を読んでゴースト枠も実寸
// ✅ 配置できない問題を根絶：座標基準を #field に固定（bgLayerが0サイズでもOK）
// ✅ 配置モード：赤枠（透明）→ クリックで設置 → ドラッグ移動 → 完了
// ✅ OFFにした瞬間に撤去（残骸ゼロ）

(() => {
  "use strict";
  console.log("[itemPlace] LOADED V3", Date.now());

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const LS_STATE_KEY   = "milkpop_itemplace_v3";          // 位置/回転/拡縮/placed
  const LS_ENABLED_KEY = "milkpop_itemplace_enabled_v1";  // ✅ ON/OFF はここ

  // ✅ クリック座標の基準は field（ここが重要）
  const HOST_ID = "field";

  const WRAP_ID  = "itemPlaceWrapV3";
  const STYLE_ID = "itemPlaceStyleV3";
  const PANEL_ID = "itemPlacePanelV3";
  const GHOST_ID = "itemPlaceGhostV3";
  const TOAST_ID = "itemPlaceToastV1";

  // ✅ 配置できる実体アイテムだけ（mirrorballは絶対入れない）
  // 追加したい場合はここに増やす（keyは shop.js の owned と一致させる）
  const PLACE_ITEMS = {
    bed: {
      key: "bed",
      label: "ベッド",
      src: "./assets/bg/bed.png",
      z: 6, // うさぎより後ろ想定（必要なら調整）
      default: { x: 180, y: 280, scale: 1.0, rot: 0, placed: false },
    },
  };

  const $ = (q, p = document) => p.querySelector(q);

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

  function loadOwned() { return safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {}; }

  function isOwned(key) {
    try { if (window.WB?.shop?.isOwned) return !!window.WB.shop.isOwned(key); } catch {}
    const o = loadOwned();
    return !!o?.[key];
  }

  // ✅ enabled は itemPlace.js が管理
  function loadEnabled() {
    const j = safeParse(localStorage.getItem(LS_ENABLED_KEY)) || {};
    const out = {};
    for (const k of Object.keys(PLACE_ITEMS)) {
      // デフォは true（ON）
      out[k] = (typeof j[k] === "boolean") ? j[k] : true;
    }
    return out;
  }
  function saveEnabled(en) { try { localStorage.setItem(LS_ENABLED_KEY, JSON.stringify(en)); } catch {} }

  function isEnabled(key) {
    const en = loadEnabled();
    if (key in en) return !!en[key];
    return true;
  }
  function setEnabled(key, v) {
    const en = loadEnabled();
    en[key] = !!v;
    saveEnabled(en);
    // OFFにしたら即撤去（placedも落とす）
    if (!en[key]) {
      st[key] = st[key] || { ...PLACE_ITEMS[key].default };
      st[key].placed = false;
      saveState(st);
      removeObj(key);
    }
    // 通知（他モジュールが聞きたいなら）
    try { window.WB?.emit?.("itemplace:enabled_changed", { key, enabled: !!en[key] }); } catch {}
  }

  // ===== 位置などの保存 =====
  function loadState() {
    const j = safeParse(localStorage.getItem(LS_STATE_KEY)) || {};
    const out = {};
    for (const k of Object.keys(PLACE_ITEMS)) {
      const def = PLACE_ITEMS[k].default;
      const cur = j?.[k] || {};
      out[k] = {
        x: Number(cur.x ?? def.x),
        y: Number(cur.y ?? def.y),
        scale: Number(cur.scale ?? def.scale),
        rot: Number(cur.rot ?? def.rot),
        placed: (typeof cur.placed === "boolean") ? cur.placed : !!def.placed,
      };
    }
    return out;
  }
  function saveState(st0) { try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(st0)); } catch {} }

  // ===== 画像実寸管理（naturalWidth/Height）=====
  const imgSize = {}; // { key: { w, h } }

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
    const ks = Object.keys(PLACE_ITEMS);
    for (const k of ks) await preloadSize(k);
  }

  // ===== CSS / wrap =====
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const stEl = document.createElement("style");
    stEl.id = STYLE_ID;
    stEl.textContent = `
#${WRAP_ID}{
  position:absolute;
  inset:0;
  pointer-events:none;
  overflow:visible;
}

.itemPlaceObj{
  position:absolute;
  left:0; top:0;
  transform-origin:0 0;
  user-select:none;
  -webkit-user-drag:none;
  pointer-events:none;
}

.itemPlaceObj.editing{
  pointer-events:auto;
  outline: 3px solid rgba(255,0,0,.85);
  outline-offset: 2px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.08);
  cursor: grab;
}
.itemPlaceObj.editing:active{ cursor: grabbing; }

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
  min-width: 280px;
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

    // hostがrelativeじゃないと inset:0 が効かない
    try {
      const cs = getComputedStyle(host);
      if (cs.position === "static") host.style.position = "relative";
    } catch {}

    let wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = WRAP_ID;
      host.appendChild(wrap);
    } else {
      try { host.appendChild(wrap); } catch {}
    }
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

  function setGhostSizeFor(key, scale = 1) {
    const g = ensureGhost();
    const s = imgSize[key] || { w: 120, h: 90 };
    g.style.width  = `${Math.max(8, s.w * scale)}px`;
    g.style.height = `${Math.max(8, s.h * scale)}px`;
  }

  function showGhostAt(clientX, clientY, key, scale) {
    const g = ensureGhost();
    setGhostSizeFor(key, scale);
    const w = parseFloat(g.style.width) || 120;
    const h = parseFloat(g.style.height) || 90;
    g.style.transform = `translate3d(${clientX - w / 2}px,${clientY - h / 2}px,0)`;
  }

  function hideGhost() {
    const g = ensureGhost();
    g.style.transform = "translate3d(-9999px,-9999px,0)";
  }

  // ===== 実体 =====
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
      img.style.zIndex = String(it.z ?? 6);
      img.addEventListener("error", () => console.warn("[itemPlace] load failed:", it.src));
      wrap.appendChild(img);
    } else if (img.getAttribute("src") !== it.src) {
      img.src = it.src;
    }
    return img;
  }

  function removeObj(key) {
    try { document.getElementById(`itemPlace_${key}`)?.remove(); } catch {}
  }

  function applyTransform(img, s) {
    img.style.left = `${Math.round(s.x)}px`;
    img.style.top  = `${Math.round(s.y)}px`;
    img.style.transform = `scale(${s.scale}) rotate(${s.rot}deg)`;
  }

  // ===== 編集モード =====
  let editing = false;
  let selectedKey = "bed";
  let st = loadState();
  let drag = null;

  function placeableKeys() {
    // ✅ 所持してて、enabledがONの物だけ
    return Object.keys(PLACE_ITEMS).filter(k => isOwned(k) && isEnabled(k));
  }

  function ownedKeys() {
    // ✅ 所持してる物（enabledは問わない）
    return Object.keys(PLACE_ITEMS).filter(k => isOwned(k));
  }

  function ensurePanel() {
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (p) return p;

    p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
  <div class="ttl">🧸 アイテム配置</div>

  <div class="row" style="gap:8px;">
    <div style="flex:1 1 auto;">
      <select id="ipSel"></select>
    </div>
    <button class="chip" id="ipToggle" type="button">設置ON</button>
  </div>

  <div class="row">
    <button id="ipScaleDown">− 縮小</button>
    <button id="ipScaleUp">＋ 拡大</button>
    <button id="ipRotL">⟲ 回転</button>
    <button id="ipRotR">⟳ 回転</button>
  </div>

  <div class="row">
    <button id="ipReset">リセット</button>
    <button id="ipRemove">撤去</button>
    <button id="ipDone">完了</button>
  </div>

  <div class="hint">
    設置ONのアイテムのみ配置できます。<br>
    透明赤枠の位置をクリックで設置。設置後はドラッグで移動。
  </div>
`;
    document.body.appendChild(p);

    const byId = (id) => document.getElementById(id);

    byId("ipScaleDown").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.scale = Math.max(0.2, +(s.scale - 0.05).toFixed(3));
      saveState(st); syncOne(selectedKey);
    });
    byId("ipScaleUp").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.scale = Math.min(4.0, +(s.scale + 0.05).toFixed(3));
      saveState(st); syncOne(selectedKey);
    });
    byId("ipRotL").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.rot -= 5;
      saveState(st); syncOne(selectedKey);
    });
    byId("ipRotR").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.rot += 5;
      saveState(st); syncOne(selectedKey);
    });
    byId("ipReset").addEventListener("click", () => {
      const def = PLACE_ITEMS[selectedKey]?.default; if (!def) return;
      st[selectedKey] = { ...st[selectedKey], ...def, placed: st[selectedKey]?.placed ?? false };
      saveState(st); syncOne(selectedKey);
    });
    byId("ipRemove").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.placed = false;
      saveState(st);
      syncOne(selectedKey);
    });
    byId("ipDone").addEventListener("click", () => setEditing(false));

    byId("ipToggle").addEventListener("click", () => {
      if (!selectedKey) return;
      const now = isEnabled(selectedKey);
      setEnabled(selectedKey, !now);
      refreshToggle();
      syncAll();
      toast(!now ? "✅ 設置ON" : "⛔ 設置OFF（撤去）");
      // OFFにしたら選べるキーが変わるのでセレクト更新
      refreshSelect();
    });

    return p;
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
      return;
    }

    sel.innerHTML = owned.map(k => {
      const it = PLACE_ITEMS[k];
      const en = isEnabled(k);
      const mark = en ? "" : "（OFF）";
      return `<option value="${k}">${it?.label || k}${mark}</option>`;
    }).join("");

    if (!owned.includes(selectedKey)) selectedKey = owned[0];
    sel.value = selectedKey;

    sel.onchange = () => {
      if (!sel.value) return;
      selectedKey = sel.value;
      refreshToggle();
      syncAll();
    };

    refreshToggle();
  }

  function attachDrag(img, key) {
    if (img.__ipDrag) return;
    img.__ipDrag = true;

    img.addEventListener("pointerdown", (e) => {
      if (!editing) return;
      if (key !== selectedKey) return;
      e.preventDefault();
      e.stopPropagation();
      img.setPointerCapture?.(e.pointerId);
      drag = {
        key,
        startX: e.clientX,
        startY: e.clientY,
        baseX: st[key].x,
        baseY: st[key].y,
      };
    });

    window.addEventListener("pointermove", (e) => {
      if (!editing || !drag) return;
      if (drag.key !== key) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      st[key].x = drag.baseX + dx;
      st[key].y = drag.baseY + dy;
      syncOne(key);
    }, { passive: true });

    window.addEventListener("pointerup", () => {
      if (!drag) return;
      saveState(st);
      drag = null;
    }, { passive: true });
  }

  function syncOne(key) {
    const it = PLACE_ITEMS[key];
    const s = st[key];
    if (!it || !s) return;

    // ✅ 未購入 / enabled OFF / 未配置なら撤去
    if (!isOwned(key) || !isEnabled(key) || !s.placed) {
      removeObj(key);
      return;
    }

    const img = ensureObj(key);
    if (!img) return;

    applyTransform(img, s);
    img.classList.toggle("editing", editing && key === selectedKey);
    attachDrag(img, key);
  }

  function syncAll() {
    for (const k of Object.keys(PLACE_ITEMS)) syncOne(k);
  }

  function isOverUI(target) {
    return !!(
      target?.closest?.(
        `#${PANEL_ID}, #gameMenuPanelV1, #gameHamburgerV1, #isyouModal, #isyouConfirmBar, #bgShopModalV1, #bgShopBackdropV1`
      )
    );
  }

  function onMoveGhost(e) {
    if (!editing) return;
    if (!selectedKey) { hideGhost(); return; }

    // enabled OFF の時はゴーストも出さない（混乱防止）
    if (!isEnabled(selectedKey)) { hideGhost(); return; }

    if (isOverUI(e.target)) { hideGhost(); return; }

    const s = st[selectedKey] || PLACE_ITEMS[selectedKey]?.default;
    const sc = Number(s?.scale ?? 1);
    showGhostAt(e.clientX, e.clientY, selectedKey, sc);
  }

  function onPlaceDown(e) {
    if (!editing) return;
    if (isOverUI(e.target)) return;

    if (!selectedKey) return;
    if (!isOwned(selectedKey)) return;
    if (!isEnabled(selectedKey)) { toast("⛔ 設置OFFです"); return; }

    const host = getHost();
    const r = host.getBoundingClientRect();

    // hostが0サイズの時は置けないのでガード
    if (r.width <= 2 || r.height <= 2) {
      console.warn("[itemPlace] host rect is too small:", r);
      return;
    }

    // ✅ クリック位置を hostローカル座標へ
    const localX = e.clientX - r.left;
    const localY = e.clientY - r.top;

    const s = st[selectedKey] || (st[selectedKey] = { ...PLACE_ITEMS[selectedKey].default });
    s.placed = true;

    // ✅ 実寸で “中心に置く”（自然サイズ × scale）
    const size = imgSize[selectedKey] || { w: 120, h: 90 };
    const w = size.w * (Number(s.scale) || 1);
    const h = size.h * (Number(s.scale) || 1);

    s.x = localX - w / 2;
    s.y = localY - h / 2;

    saveState(st);
    syncOne(selectedKey);

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
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
      document.addEventListener("pointermove", onMoveGhost, { passive: true });
      document.addEventListener("pointerdown", onPlaceDown, true);
      window.addEventListener("keydown", onKey, { passive: true });
    } else {
      hideGhost();
      document.removeEventListener("pointermove", onMoveGhost);
      document.removeEventListener("pointerdown", onPlaceDown, true);
      window.removeEventListener("keydown", onKey);
      saveState(st);
    }

    syncAll();
  }

  // ===== Public =====
  async function openModal() {
    await preloadAll();

    // 所持アイテムがなければ何もしない
    const owned = ownedKeys();
    if (!owned.length) {
      toast("（購入済みアイテムがありません）");
      console.warn("[itemPlace] no owned items");
      return;
    }

    // selectedKey補正
    if (!owned.includes(selectedKey)) selectedKey = owned[0];

    st = loadState();
    setEditing(true);
  }

  function close() { setEditing(false); }

  // ===== boot =====
  (async function boot() {
    ensureStyle();
    await preloadAll();
    st = loadState();
    syncAll();

    // shop変更で即反映（購入されたら候補に出る）
    const hookWB = () => {
      if (!window.WB?.on) return false;
      try {
        window.WB.on("shop:changed", () => { st = loadState(); syncAll(); });
        window.WB.on("core:ready", () => { st = loadState(); syncAll(); });
      } catch {}
      return true;
    };
    hookWB();
    setTimeout(hookWB, 300);

    // LS同期
    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === SHOP_OWNED_KEY || e.key === LS_STATE_KEY || e.key === LS_ENABLED_KEY) {
        st = loadState();
        syncAll();
      }
    });

    // グローバル公開（gameMenu.js から呼ぶ）
    window.ITEMPLACE = {
      openModal,
      open: openModal, // 互換
      close,
      _items: PLACE_ITEMS,
      _enabledKey: LS_ENABLED_KEY,
    };

    // WB側にも生やしたいなら（互換）
    try {
      window.WB = window.WB || {};
      window.WB.itemplace = window.WB.itemplace || {};
      window.WB.itemplace.openModal = openModal;
      window.WB.itemplace.close = close;
    } catch {}
  })();
})();
