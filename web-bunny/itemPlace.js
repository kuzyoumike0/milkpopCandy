// itemPlace.js（V1）
// ✅ shop.js で購入済みの「配置できるアイテム」だけを赤枠で配置できる
// ✅ ミラーボール(mirrorball)は “配置しない” （演出は bgcolor.js 側）
// ✅ 配置対象：bed（今後増やすなら PLACE_ITEMS に追加）
// ✅ ハンバーガーメニュー等から window.ITEMPLACE.open() で起動想定
// ✅ 配置モード：透明赤枠を出す → クリックで設置 → ドラッグで移動 → 完了で確定
// ✅ 未購入/設置OFFなら完全撤去

(() => {
  "use strict";

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const SHOP_STATE_KEY = "milkpop_shop_state_v1";
  const LS_KEY = "milkpop_itemplace_v1";

  const HOST_LAYER_ID = "bgLayer"; // うさぎより後ろ/上は z-index で調整
  const WRAP_ID = "itemPlaceWrapV1";
  const STYLE_ID = "itemPlaceStyleV1";
  const PANEL_ID = "itemPlacePanelV1";

  // ✅ “配置できる実体アイテム” だけ（mirrorball は入れない）
  const PLACE_ITEMS = {
    bed: {
      key: "bed",
      label: "ベッド",
      src: "./assets/bg/bed.png",
      z: 6,              // うさぎより後ろ想定（あなたの環境に合わせて調整）
      default: { x: 80, y: 220, scale: 1.0, rot: 0 },
    },
    // 追加例：
    // sofa: { key:"sofa", label:"ソファ", src:"./assets/bg/sofa.png", z:6, default:{x:120,y:230,scale:1,rot:0} },
  };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function loadOwned() {
    // shop.js の owned は { mirrorball:true, bed:true ... }
    return safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {};
  }
  function loadShopState() {
    // shop.js の state は { mirrorballEnabled:true, bedEnabled:true ... }
    return safeParse(localStorage.getItem(SHOP_STATE_KEY)) || {};
  }

  function isOwned(key) {
    try { if (window.WB?.shop?.isOwned) return !!window.WB.shop.isOwned(key); } catch {}
    const o = loadOwned();
    return !!o?.[key];
  }

  function isEnabled(key) {
    const st = loadShopState();
    const k = key + "Enabled"; // bedEnabled / mirrorballEnabled など
    if (k in st) return !!st[k];
    return true;
  }

  function loadState() {
    const j = safeParse(localStorage.getItem(LS_KEY)) || {};
    const out = {};
    for (const k of Object.keys(PLACE_ITEMS)) {
      const def = PLACE_ITEMS[k].default;
      const cur = j?.[k] || {};
      out[k] = {
        x: Number(cur.x ?? def.x),
        y: Number(cur.y ?? def.y),
        scale: Number(cur.scale ?? def.scale),
        rot: Number(cur.rot ?? def.rot),
        placed: (typeof cur.placed === "boolean") ? cur.placed : false,
      };
    }
    return out;
  }
  function saveState(st) { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {} }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
#${WRAP_ID}{
  position:absolute; left:0; top:0;
  width:1px; height:1px;
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

.itemPlaceGhost{
  position:fixed;
  left:0; top:0;
  width:120px; height:90px;
  transform: translate3d(-9999px,-9999px,0);
  z-index:2147483646;
  border: 3px solid rgba(255,0,0,.55);
  border-radius: 14px;
  background: rgba(255,0,0,.08);
  pointer-events:none;
  box-shadow: 0 14px 34px rgba(0,0,0,.18);
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
  min-width: 240px;
}
#${PANEL_ID} .row{ display:flex; gap:6px; margin: 6px 0; flex-wrap:wrap; }
#${PANEL_ID} button{
  border: 1px solid rgba(0,0,0,.15);
  background: white;
  border-radius: 10px;
  padding: 7px 10px;
  cursor: pointer;
  font-weight: 900;
}
#${PANEL_ID} .ttl{ font-weight:1000; margin-bottom:4px; }
#${PANEL_ID} .hint{ opacity:.75; font-size:12px; line-height:1.35; margin-top:6px; }
#${PANEL_ID} select{
  width:100%;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid rgba(0,0,0,.15);
  font-weight:900;
}
`;
    document.head.appendChild(st);
  }

  function getHost() {
    return document.getElementById(HOST_LAYER_ID) || document.getElementById("field") || document.body;
  }

  function ensureWrap() {
    ensureStyle();
    const host = getHost();
    if (!host) return null;
    const cs = getComputedStyle(host);
    if (cs.position === "static") host.style.position = "relative";

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

  // ===== UI / Mode =====
  let editing = false;
  let selectedKey = "bed"; // 初期
  let st = loadState();
  let drag = null;

  function ensureGhost() {
    let g = document.getElementById("itemPlaceGhostV1");
    if (!g) {
      g = document.createElement("div");
      g.id = "itemPlaceGhostV1";
      g.className = "itemPlaceGhost";
      document.body.appendChild(g);
    }
    return g;
  }

  function showGhostAt(x, y) {
    const g = ensureGhost();
    g.style.transform = `translate3d(${x - 60}px,${y - 45}px,0)`;
  }
  function hideGhost() {
    const g = ensureGhost();
    g.style.transform = "translate3d(-9999px,-9999px,0)";
  }

  function ensurePanel() {
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (p) return p;

    p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
      <div class="ttl">📦 アイテム配置</div>
      <div class="row" style="gap:8px;">
        <div style="flex:1; min-width:0;">
          <select id="itemPlaceSelect"></select>
        </div>
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
        透明赤枠の位置をクリックすると設置します。<br>
        設置後は赤枠のアイテムをドラッグで移動できます。
      </div>
    `;
    document.body.appendChild(p);

    const byId = (id) => document.getElementById(id);

    byId("ipScaleDown").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.scale = Math.max(0.2, +(s.scale - 0.05).toFixed(3));
      syncOne(selectedKey, true);
    });
    byId("ipScaleUp").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.scale = Math.min(4.0, +(s.scale + 0.05).toFixed(3));
      syncOne(selectedKey, true);
    });
    byId("ipRotL").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.rot -= 5; syncOne(selectedKey, true);
    });
    byId("ipRotR").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.rot += 5; syncOne(selectedKey, true);
    });
    byId("ipReset").addEventListener("click", () => {
      const def = PLACE_ITEMS[selectedKey]?.default; if (!def) return;
      st[selectedKey] = { ...st[selectedKey], ...def };
      syncOne(selectedKey, true);
    });
    byId("ipRemove").addEventListener("click", () => {
      const s = st[selectedKey]; if (!s) return;
      s.placed = false;
      saveState(st);
      syncAll();
    });
    byId("ipDone").addEventListener("click", () => setEditing(false));

    return p;
  }

  function refreshSelectOptions() {
    const sel = document.getElementById("itemPlaceSelect");
    if (!sel) return;

    // ✅ owned & enabled な “配置可能” だけ並べる
    const opts = [];
    for (const k of Object.keys(PLACE_ITEMS)) {
      if (!isOwned(k)) continue;
      if (!isEnabled(k)) continue;
      opts.push(k);
    }

    sel.innerHTML = opts.map(k => {
      const it = PLACE_ITEMS[k];
      const name = it?.label || k;
      return `<option value="${k}">${name}</option>`;
    }).join("");

    // 何も無い
    if (!opts.length) {
      sel.innerHTML = `<option value="">（配置できる購入済みアイテムがありません）</option>`;
      selectedKey = "bed";
      return;
    }

    // 選択を維持
    if (!opts.includes(selectedKey)) selectedKey = opts[0];
    sel.value = selectedKey;

    sel.onchange = () => {
      const v = sel.value;
      if (!v) return;
      selectedKey = v;
    };
  }

  function attachDrag(img, key) {
    if (img.__itemPlaceDragAttached) return;
    img.__itemPlaceDragAttached = true;

    img.addEventListener("pointerdown", (e) => {
      if (!editing) return;
      if (key !== selectedKey) return; // 選択中だけドラッグ
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
      syncOne(key, false);
    }, { passive: true });

    window.addEventListener("pointerup", () => {
      if (!drag) return;
      const k = drag.key;
      drag = null;
      saveState(st);
      syncOne(k, false);
    }, { passive: true });
  }

  function syncOne(key, saveNow) {
    const s = st[key];
    const it = PLACE_ITEMS[key];
    if (!s || !it) return;

    // 未購入 or OFF → 撤去
    if (!isOwned(key) || !isEnabled(key) || !s.placed) {
      removeObj(key);
      if (saveNow) saveState(st);
      return;
    }

    const img = ensureObj(key);
    if (!img) return;

    applyTransform(img, s);
    img.classList.toggle("editing", editing && key === selectedKey);

    attachDrag(img, key);

    if (saveNow) saveState(st);
  }

  function syncAll() {
    for (const k of Object.keys(PLACE_ITEMS)) syncOne(k, false);
  }

  function setEditing(on) {
    editing = !!on;

    const p = ensurePanel();
    p.style.display = editing ? "block" : "none";

    refreshSelectOptions();

    // 編集中は “置く用の赤枠” を出す（クリック位置ガイド）
    if (editing) {
      hideGhost();
      document.addEventListener("pointermove", onMoveGhost, { passive: true });
      document.addEventListener("pointerdown", onPlaceDown, true);
      window.addEventListener("keydown", onKeyEsc, { passive: true });
    } else {
      hideGhost();
      document.removeEventListener("pointermove", onMoveGhost);
      document.removeEventListener("pointerdown", onPlaceDown, true);
      window.removeEventListener("keydown", onKeyEsc);
      saveState(st);
    }

    syncAll();
  }

  function onKeyEsc(e) {
    if (e.key === "Escape") setEditing(false);
  }

  function onMoveGhost(e) {
    if (!editing) return;
    // メニューやモーダル上では出さない（邪魔防止）
    const overUI =
      e.target?.closest?.("#gameMenuPanelV1, #isyouModal, #bgShopModalV1, #bgShopBackdropV1, #isyouConfirmBar") ||
      false;
    if (overUI) { hideGhost(); return; }

    showGhostAt(e.clientX, e.clientY);
  }

  function onPlaceDown(e) {
    if (!editing) return;

    // UI上クリックは無視
    const overUI =
      e.target?.closest?.("#gameMenuPanelV1, #gameHamburgerV1, #itemPlacePanelV1, #isyouModal, #bgShopModalV1, #isyouConfirmBar") ||
      false;
    if (overUI) return;

    // 対象が無い/未購入/無効は無視
    if (!selectedKey) return;
    if (!isOwned(selectedKey) || !isEnabled(selectedKey)) return;

    // クリック位置を host 座標へ
    const host = getHost();
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    const s = st[selectedKey] || (st[selectedKey] = { ...PLACE_ITEMS[selectedKey].default, placed: false });
    s.x = x;
    s.y = y;
    s.placed = true;

    saveState(st);
    syncOne(selectedKey, false);

    // 置いた直後はそのアイテムを編集対象にしてドラッグしやすく
    syncAll();

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  // ===== Public API =====
  function open() {
    // 配置可能が無いなら何もしない（ミラーボールしか買ってない等）
    const anyPlaceable = Object.keys(PLACE_ITEMS).some(k => isOwned(k) && isEnabled(k));
    if (!anyPlaceable) {
      console.warn("[itemPlace] no placeable items owned/enabled");
      return;
    }
    setEditing(true);
  }

  function close() { setEditing(false); }

  function boot() {
    ensureStyle();
    st = loadState();

    // 初期は設置済みだけ描画
    syncAll();

    // shop変更で即反映
    const hookWB = () => {
      if (!window.WB?.on) return false;
      try {
        window.WB.on("shop:changed", () => { st = loadState(); syncAll(); });
        window.WB.on("haikei:toggle", () => { st = loadState(); syncAll(); });
        window.WB.on("core:ready", () => { st = loadState(); syncAll(); });
      } catch {}
      return true;
    };
    hookWB();
    setTimeout(hookWB, 300);

    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === SHOP_OWNED_KEY || e.key === SHOP_STATE_KEY) {
        st = loadState();
        syncAll();
      }
    });
  }

  boot();

  window.ITEMPLACE = {
    open,
    close,
    _placeItems: PLACE_ITEMS,
  };
})();
