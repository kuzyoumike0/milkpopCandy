// itemPlace.js（V1）
// ✅ shop.jsで購入したアイテムを「アイテム配置」モーダルから配置
// ✅ 配置時：透明赤枠ゴースト表示 → 置きたい場所クリックで確定
// ✅ 確定後：bgLayer（うさぎより後ろ）に配置
// ✅ 拡大/回転/削除/編集も可能
// ✅ shopの owned/state を参照し、未購入 or OFF のアイテムは完全撤去（残骸ゼロ）
// ✅ ISYOU等と干渉しない（pointer-eventsを必要時だけON）

(() => {
  "use strict";
  console.log("[itemPlace.js] LOADED V1", Date.now());

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const SHOP_STATE_KEY = "milkpop_shop_state_v1";
  const LS_KEY = "milkpop_itemplace_v1";

  // ---- ここは shop.js の ITEMS と同じ key を並べる（増やしたらここにも追加するのが最強に確実）
  // 画像パスは「候補」を複数持たせて 404 に強くする
  const ITEM_MASTER = {
    mirrorball: {
      key: "mirrorball",
      label: "ミラーボール",
      enabledKey: "mirrorballEnabled",
      z: 7,
      candidates: [
        "./assets/bg/mirrorball.png",
        "assets/bg/mirrorball.png",
        "./assets/mirrorball.png",
        "assets/mirrorball.png",
      ],
      default: { x: 180, y: 60, scale: 1.0, rot: 0 },
    },
    bed: {
      key: "bed",
      label: "ベッド",
      enabledKey: "bedEnabled",
      z: 6,
      candidates: [
        "./assets/bg/bed.png",
        "assets/bg/bed.png",
        "/assets/bg/bed.png",
        "./assets/bed.png",
        "assets/bed.png",
      ],
      default: { x: 80, y: 220, scale: 1.0, rot: 0 },
    },
  };

  const UI = {
    style: "itemPlaceStyleV1",
    backdrop: "itemPlaceBackdropV1",
    modal: "itemPlaceModalV1",
    toast: "itemPlaceToastV1",
    stage: "itemPlaceStageV1",
    ghost: "itemPlaceGhostV1",
    ctrl: "itemPlaceCtrlV1",
  };

  const Z_MODAL = 2147483400;
  const Z_GHOST = 2147483450;

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function loadOwned() {
    const j = safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {};
    return (j && typeof j === "object") ? j : {};
  }
  function loadShopState() {
    const j = safeParse(localStorage.getItem(SHOP_STATE_KEY)) || {};
    return (j && typeof j === "object") ? j : {};
  }

  function loadPlaceState() {
    const j = safeParse(localStorage.getItem(LS_KEY)) || {};
    const items = (j.items && typeof j.items === "object") ? j.items : {};
    return { items };
  }
  function savePlaceState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {}
  }

  function isOwned(key) {
    try {
      if (window.WB?.shop?.isOwned) return !!window.WB.shop.isOwned(key);
    } catch {}
    const o = loadOwned();
    return !!o?.[key];
  }

  function isEnabled(key) {
    const def = true;
    const m = ITEM_MASTER[key];
    const enabledKey = m?.enabledKey || (key + "Enabled");

    try {
      // shop.js 側にAPIがあるなら優先
      if (key === "mirrorball" && typeof window.WB?.shop?.isMirrorballEnabled === "function") {
        return !!window.WB.shop.isMirrorballEnabled();
      }
      if (key === "bed" && typeof window.WB?.shop?.isBedEnabled === "function") {
        return !!window.WB.shop.isBedEnabled();
      }
    } catch {}

    const st = loadShopState();
    if (st && enabledKey in st) return !!st[enabledKey];
    return def;
  }

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const st = document.createElement("style");
    st.id = UI.style;
    st.textContent = `
#${UI.backdrop}{
  position:fixed; inset:0;
  background:rgba(0,0,0,.28);
  z-index:${Z_MODAL};
  display:none;
}
#${UI.modal}{
  position:fixed;
  left:50%; top:54%;
  transform:translate(-50%,-50%);
  width:min(640px, 92vw);
  max-height:min(80vh, 760px);
  overflow:auto;
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  z-index:${Z_MODAL + 1};
  padding:14px 14px 12px;
  display:none;
}
#${UI.modal} .row{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
#${UI.modal} .ttl{ font-weight:1000; font-size:16px; }
#${UI.modal} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.modal} .sep{ height:1px; background:rgba(0,0,0,.08); margin:12px 0; }
#${UI.modal} .tag{
  font-size:12px; font-weight:1000;
  padding:5px 10px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
  white-space:nowrap;
}
#${UI.modal} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:1000;
  cursor:pointer;
  background:#ffd6e7;
}
#${UI.modal} .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
#${UI.modal} .btn.danger{ background:rgba(255,80,80,.12); }
#${UI.modal} .btn[disabled]{ opacity:.55; cursor:not-allowed; }
#${UI.modal} .grid{ display:grid; grid-template-columns: 1fr; gap:10px; }
#${UI.modal} .item{
  display:flex; gap:12px; align-items:center;
  padding:12px;
  border-radius:16px;
  background:rgba(0,0,0,.03);
}
#${UI.modal} .thumb{
  width:78px; height:78px; flex:0 0 auto;
  border-radius:14px;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
  overflow:hidden;
  display:flex; align-items:center; justify-content:center;
}
#${UI.modal} .thumb img{ width:100%; height:100%; object-fit:contain; }
#${UI.modal} .name{ font-weight:1000; }
#${UI.modal} .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.modal} .right{
  margin-left:auto;
  display:flex; gap:8px; flex-wrap:wrap;
  align-items:center; justify-content:flex-end;
}

#${UI.stage}{
  position:absolute;
  left:0; top:0;
  width:1px; height:1px;
  pointer-events:none;
}
.itemPlaced{
  position:absolute;
  left:0; top:0;
  transform-origin: 0 0;
  user-select:none;
  -webkit-user-drag:none;
  pointer-events:none;
  will-change: transform, left, top;
}

#${UI.ghost}{
  position:fixed;
  left:0; top:0;
  transform:translate3d(-9999px,-9999px,0);
  z-index:${Z_GHOST};
  pointer-events:none;
  display:none;
}
#${UI.ghost} .box{
  position:absolute; left:0; top:0;
  width:10px; height:10px;
  outline: 3px solid rgba(255,0,0,.72);
  outline-offset: 2px;
  background: rgba(255,0,0,.06);
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.06);
}
#${UI.ghost} img{
  position:absolute; left:0; top:0;
  width:10px; height:10px;
  object-fit:contain;
  opacity:.98;
}

#${UI.ctrl}{
  position: fixed;
  left: 10px;
  top: 58px;
  z-index:${Z_GHOST + 10};
  background: rgba(255,255,255,.92);
  border: 2px solid rgba(255,0,0,.75);
  border-radius: 10px;
  padding: 8px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  display: none;
}
#${UI.ctrl} .row{ display:flex; gap:6px; margin: 6px 0; flex-wrap: wrap; }
#${UI.ctrl} button{
  border: 1px solid rgba(0,0,0,.15);
  background: white;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
#${UI.ctrl} .hint{ opacity:.75; font-size:12px; margin-top:4px; }
`;
    document.head.appendChild(st);
  }

  function toast(msg) {
    let el = document.getElementById(UI.toast);
    if (!el) {
      el = document.createElement("div");
      el.id = UI.toast;
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
    el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1300);
  }

  function getHostLayer() {
    // うさぎより後ろに置きたいので bgLayer 優先
    return document.getElementById("bgLayer") || document.getElementById("field") || document.body;
  }

  function ensureStage() {
    ensureStyle();
    const host = getHostLayer();
    if (!host) return null;

    try {
      const cs = getComputedStyle(host);
      if (cs.position === "static") host.style.position = "relative";
    } catch {}

    let stage = document.getElementById(UI.stage);
    if (!stage) {
      stage = document.createElement("div");
      stage.id = UI.stage;
      host.appendChild(stage);
    } else {
      try { host.appendChild(stage); } catch {}
    }
    return stage;
  }

  // 画像src候補を順に試す（404耐性）
  function setSrcWithFallback(imgEl, candidates) {
    const list = (candidates || []).filter(Boolean);
    let i = 0;
    let last = "";
    const tryOne = () => {
      if (i >= list.length) return;
      const next = String(list[i++]);
      if (next === last) return tryOne();
      last = next;
      imgEl.src = next;
    };
    imgEl.onerror = () => tryOne();
    tryOne();
  }

  // ---- 配置データ
  function getDefaultPose(key) {
    const m = ITEM_MASTER[key];
    return (m && m.default) ? { ...m.default } : { x: 120, y: 180, scale: 1.0, rot: 0 };
  }

  function normalizeState(st) {
    const out = st && st.items && typeof st.items === "object" ? st : { items: {} };
    out.items = out.items || {};
    return out;
  }

  // ---- 実体反映（未購入/無効は撤去）
  function applyAllPlaced() {
    const stage = ensureStage();
    if (!stage) return;

    const owned = loadOwned();
    const shopState = loadShopState();
    const st = normalizeState(loadPlaceState());

    // 現在描画されているDOM一覧
    const existing = new Map();
    stage.querySelectorAll(".itemPlaced[data-key]").forEach(el => {
      existing.set(el.getAttribute("data-key"), el);
    });

    // 置ける対象：マスターにあるキーのみ（確実運用）
    for (const key of Object.keys(ITEM_MASTER)) {
      const own = !!owned[key];
      const enKey = ITEM_MASTER[key].enabledKey || (key + "Enabled");
      const enabled = (enKey in shopState) ? !!shopState[enKey] : true;

      // 未購入 or OFF → 完全撤去
      if (!own || !enabled) {
        const ex = existing.get(key);
        if (ex) { try { ex.remove(); } catch {} }
        delete st.items[key];
        continue;
      }

      // 購入済み＆ON → 置く（位置が無ければデフォルト生成）
      const pose = st.items[key] || getDefaultPose(key);
      st.items[key] = pose;

      let el = existing.get(key);
      if (!el) {
        el = document.createElement("img");
        el.className = "itemPlaced";
        el.setAttribute("data-key", key);
        el.alt = key;
        el.draggable = false;
        el.style.zIndex = String(ITEM_MASTER[key].z ?? 6);
        setSrcWithFallback(el, ITEM_MASTER[key].candidates);
        stage.appendChild(el);
      } else {
        // srcの候補を更新（マスターに合わせる）
        try { setSrcWithFallback(el, ITEM_MASTER[key].candidates); } catch {}
      }

      // transform反映
      el.style.left = `${Math.round(pose.x)}px`;
      el.style.top  = `${Math.round(pose.y)}px`;
      el.style.transform = `scale(${pose.scale}) rotate(${pose.rot}deg)`;
      existing.delete(key);
    }

    // マスター外の残骸は撤去
    for (const el of existing.values()) {
      try { el.remove(); } catch {}
    }

    savePlaceState(st);
  }

  // -------------------------------
  // モーダル（アイテム一覧）
  // -------------------------------
  function ensureModalUI() {
    ensureStyle();

    let bd = document.getElementById(UI.backdrop);
    if (!bd) {
      bd = document.createElement("div");
      bd.id = UI.backdrop;
      document.body.appendChild(bd);
    }

    let modal = document.getElementById(UI.modal);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = UI.modal;
      document.body.appendChild(modal);
    }

    bd.onclick = (e) => { if (e.target === bd) closeModal(); };
    return { bd, modal };
  }

  function closeModal() {
    const bd = document.getElementById(UI.backdrop);
    const m  = document.getElementById(UI.modal);
    if (bd) bd.style.display = "none";
    if (m)  m.style.display  = "none";
  }

  function openModal() {
    const { bd, modal } = ensureModalUI();
    applyAllPlaced();

    const owned = loadOwned();
    const shopState = loadShopState();
    const st = normalizeState(loadPlaceState());

    const ownedKeys = Object.keys(ITEM_MASTER).filter(k => !!owned[k]);
    const c = (() => {
      try {
        if (window.WB?.getCoin) return Number(window.WB.getCoin()) || 0;
        if (typeof window.WB?.coins === "number") return Number(window.WB.coins) || 0;
      } catch {}
      const el = document.getElementById("coinValue");
      return el ? (Number(el.textContent) || 0) : 0;
    })();

    modal.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">🧸 アイテム配置</div>
    <div class="sub">購入済みアイテムを背景に配置できます</div>
  </div>
  <button class="btn ghost" id="ipCloseX" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag">🪙 ${c}</div>
  <div class="tag">購入済み：${ownedKeys.length}</div>
</div>

<div class="sep"></div>

<div class="grid">
${
  ownedKeys.length
    ? ownedKeys.map(key => {
        const m = ITEM_MASTER[key];
        const enKey = m.enabledKey || (key + "Enabled");
        const enabled = (enKey in shopState) ? !!shopState[enKey] : true;
        const placed = !!st.items[key];

        return `
  <div class="item">
    <div class="thumb"><img data-thumb="${key}" alt="${key}"></div>
    <div style="min-width:0;">
      <div class="name">${m.label || key}</div>
      <div class="meta">状態：<b>${enabled ? "設置ON" : "設置OFF"}</b> / 配置：<b>${placed ? "あり" : "未配置"}</b></div>
      <div class="meta">操作：配置（赤枠）→ クリックで確定</div>
    </div>
    <div class="right">
      <button class="btn ${enabled ? "" : "ghost"}" data-place="${key}" ${enabled ? "" : "disabled"}>配置する</button>
      <button class="btn ghost" data-edit="${key}" ${placed ? "" : "disabled"}>編集</button>
      <button class="btn danger" data-remove="${key}" ${placed ? "" : "disabled"}>削除</button>
    </div>
  </div>`;
      }).join("")
    : `<div class="item"><div style="font-weight:1000;">購入済みアイテムがありません</div></div>`
}
</div>

<div class="sep"></div>
<div class="sub">
  ※ ショップで「設置OFF」のアイテムは配置できません（OFFにすると自動撤去されます）<br>
  ※ 置いた後の編集：編集ボタン → ドラッグ / 拡大 / 回転 / 完了
</div>
`;

    // thumbs
    modal.querySelectorAll("img[data-thumb]").forEach(img => {
      const key = img.getAttribute("data-thumb");
      const m = ITEM_MASTER[key];
      if (!m) return;
      setSrcWithFallback(img, m.candidates);
    });

    $("#ipCloseX", modal)?.addEventListener("click", closeModal);

    modal.querySelectorAll("[data-place]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute("data-place");
        closeModal();
        startPlaceMode(key);
      });
    });

    modal.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute("data-edit");
        closeModal();
        startEditMode(key);
      });
    });

    modal.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute("data-remove");
        removePlaced(key);
        applyAllPlaced();
        openModal();
      });
    });

    bd.style.display = "block";
    modal.style.display = "block";

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    }, { once: true });
  }

  // -------------------------------
  // 配置モード（ゴースト赤枠→クリック確定）
  // -------------------------------
  let placeMode = null;

  function ensureGhost() {
    ensureStyle();
    let g = document.getElementById(UI.ghost);
    if (!g) {
      g = document.createElement("div");
      g.id = UI.ghost;
      g.innerHTML = `<div class="box"></div><img alt="ghost">`;
      document.body.appendChild(g);
    }
    return g;
  }

  function showGhost(key) {
    const g = ensureGhost();
    const img = g.querySelector("img");
    const m = ITEM_MASTER[key];
    if (img && m) setSrcWithFallback(img, m.candidates);
    g.style.display = "block";
    return g;
  }

  function hideGhost() {
    const g = document.getElementById(UI.ghost);
    if (!g) return;
    g.style.display = "none";
    g.style.transform = "translate3d(-9999px,-9999px,0)";
  }

  function startPlaceMode(key) {
    if (!ITEM_MASTER[key]) { toast("不明なアイテム"); return; }
    if (!isOwned(key)) { toast("未購入です"); return; }
    if (!isEnabled(key)) { toast("ショップで設置OFFです"); return; }

    applyAllPlaced();

    const g = showGhost(key);
    const st = normalizeState(loadPlaceState());
    const pose = st.items[key] || getDefaultPose(key);

    // 初期サイズ用（ゴーストは「画像読み込み後」に枠サイズを合わせる）
    const ghostImg = g.querySelector("img");
    const ghostBox = g.querySelector(".box");

    placeMode = { key, pose, g, ghostImg, ghostBox, lastW: 0, lastH: 0 };

    toast("赤枠のアイテムを置きたい場所でクリックして確定（Escで中止）");

    const onMove = (e) => {
      if (!placeMode) return;
      const W = placeMode.ghostImg?.naturalWidth || 200;
      const H = placeMode.ghostImg?.naturalHeight || 200;

      // 見た目サイズ（scale反映）
      const vw = Math.max(30, Math.round(W * placeMode.pose.scale));
      const vh = Math.max(30, Math.round(H * placeMode.pose.scale));

      if (placeMode.lastW !== vw) {
        placeMode.ghostImg.style.width = vw + "px";
        placeMode.ghostBox.style.width = vw + "px";
        placeMode.lastW = vw;
      }
      if (placeMode.lastH !== vh) {
        placeMode.ghostImg.style.height = vh + "px";
        placeMode.ghostBox.style.height = vh + "px";
        placeMode.lastH = vh;
      }

      // クリック位置を「左上」にする（分かりやすい）
      const x = e.clientX;
      const y = e.clientY;
      placeMode.g.style.transform = `translate3d(${x}px,${y}px,0) rotate(${placeMode.pose.rot}deg)`;
    };

    const onDown = (e) => {
      if (!placeMode) return;
      // 確定：画面座標→bgLayer座標に変換して保存
      const host = getHostLayer();
      const r = host.getBoundingClientRect();

      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      const st2 = normalizeState(loadPlaceState());
      st2.items[placeMode.key] = {
        x, y,
        scale: placeMode.pose.scale,
        rot: placeMode.pose.rot
      };
      savePlaceState(st2);

      endPlaceMode();
      applyAllPlaced();
      toast("✅ 配置しました！");
    };

    const onKey = (e) => {
      if (!placeMode) return;
      if (e.key === "Escape") {
        endPlaceMode();
        toast("キャンセルしました");
      }
      // ついでに簡易操作（配置中に微調整したい時）
      if (e.key === "+" || e.key === "=") {
        placeMode.pose.scale = Math.min(4.0, +(placeMode.pose.scale + 0.05).toFixed(3));
      }
      if (e.key === "-" || e.key === "_") {
        placeMode.pose.scale = Math.max(0.2, +(placeMode.pose.scale - 0.05).toFixed(3));
      }
      if (e.key === "r" || e.key === "R") {
        placeMode.pose.rot = (placeMode.pose.rot + 5);
      }
    };

    // pointer events
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);

    placeMode._off = () => {
      window.removeEventListener("pointermove", onMove, { passive: true });
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };

    // 初回反映
    setTimeout(() => {
      try { onMove({ clientX: 140, clientY: 140 }); } catch {}
    }, 0);
  }

  function endPlaceMode() {
    if (!placeMode) return;
    try { placeMode._off?.(); } catch {}
    placeMode = null;
    hideGhost();
  }

  // -------------------------------
  // 編集モード（ドラッグ＋ボタン操作）
  // -------------------------------
  let editMode = null;
  let drag = null;

  function ensureCtrlPanel() {
    ensureStyle();
    let p = document.getElementById(UI.ctrl);
    if (p) return p;

    p = document.createElement("div");
    p.id = UI.ctrl;
    p.innerHTML = `
      <div><b id="ipCtrlTitle">アイテム編集</b></div>
      <div class="row">
        <button id="ipScaleDown">− 縮小</button>
        <button id="ipScaleUp">＋ 拡大</button>
        <button id="ipRotL">⟲ 回転</button>
        <button id="ipRotR">⟳ 回転</button>
      </div>
      <div class="row">
        <button id="ipReset">リセット</button>
        <button id="ipDone">完了</button>
        <button id="ipDelete">削除</button>
      </div>
      <div class="hint">ドラッグで移動できます（Escで終了）</div>
    `;
    document.body.appendChild(p);
    return p;
  }

  function startEditMode(key) {
    if (!ITEM_MASTER[key]) { toast("不明なアイテム"); return; }
    if (!isOwned(key)) { toast("未購入です"); return; }
    if (!isEnabled(key)) { toast("ショップで設置OFFです"); return; }

    applyAllPlaced();
    const stage = ensureStage();
    const el = stage?.querySelector(`.itemPlaced[data-key="${CSS.escape(key)}"]`);
    if (!el) { toast("まだ配置されていません"); return; }

    const st = normalizeState(loadPlaceState());
    const pose = st.items[key] || getDefaultPose(key);
    st.items[key] = pose;
    savePlaceState(st);

    const panel = ensureCtrlPanel();
    panel.style.display = "block";
    const title = document.getElementById("ipCtrlTitle");
    if (title) title.textContent = `編集：${ITEM_MASTER[key].label || key}`;

    // 編集中だけ pointer-events をON（ドラッグできるように）
    el.style.pointerEvents = "auto";
    el.style.outline = "3px solid rgba(255,0,0,.75)";
    el.style.outlineOffset = "2px";
    el.style.cursor = "grab";

    editMode = { key, el };

    const sync = (saveNow = false) => {
      const st2 = normalizeState(loadPlaceState());
      const p = st2.items[key] || pose;
      st2.items[key] = p;
      savePlaceState(st2);

      el.style.left = `${Math.round(p.x)}px`;
      el.style.top  = `${Math.round(p.y)}px`;
      el.style.transform = `scale(${p.scale}) rotate(${p.rot}deg)`;

      if (saveNow) savePlaceState(st2);
    };

    const getPose = () => {
      const st2 = normalizeState(loadPlaceState());
      st2.items[key] = st2.items[key] || getDefaultPose(key);
      return st2;
    };

    // buttons
    document.getElementById("ipScaleDown").onclick = () => {
      const st2 = getPose();
      st2.items[key].scale = Math.max(0.2, +(st2.items[key].scale - 0.05).toFixed(3));
      savePlaceState(st2); sync(false);
    };
    document.getElementById("ipScaleUp").onclick = () => {
      const st2 = getPose();
      st2.items[key].scale = Math.min(4.0, +(st2.items[key].scale + 0.05).toFixed(3));
      savePlaceState(st2); sync(false);
    };
    document.getElementById("ipRotL").onclick = () => {
      const st2 = getPose();
      st2.items[key].rot = (st2.items[key].rot - 5);
      savePlaceState(st2); sync(false);
    };
    document.getElementById("ipRotR").onclick = () => {
      const st2 = getPose();
      st2.items[key].rot = (st2.items[key].rot + 5);
      savePlaceState(st2); sync(false);
    };
    document.getElementById("ipReset").onclick = () => {
      const st2 = getPose();
      st2.items[key] = getDefaultPose(key);
      savePlaceState(st2); sync(true);
    };
    document.getElementById("ipDone").onclick = () => endEditMode();
    document.getElementById("ipDelete").onclick = () => {
      removePlaced(key);
      endEditMode(true);
      toast("削除しました");
    };

    // drag
    const onDown = (e) => {
      if (!editMode || editMode.key !== key) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);

      const st2 = normalizeState(loadPlaceState());
      st2.items[key] = st2.items[key] || getDefaultPose(key);
      const p = st2.items[key];

      drag = { sx: e.clientX, sy: e.clientY, bx: p.x, by: p.y };
    };

    const onMove = (e) => {
      if (!drag || !editMode || editMode.key !== key) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;

      const st2 = normalizeState(loadPlaceState());
      st2.items[key] = st2.items[key] || getDefaultPose(key);
      st2.items[key].x = drag.bx + dx;
      st2.items[key].y = drag.by + dy;
      savePlaceState(st2);
      sync(false);
    };

    const onUp = () => { if (drag) drag = null; };
    const onKey = (e) => { if (e.key === "Escape") endEditMode(); };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("keydown", onKey);

    editMode._off = () => {
      try { el.removeEventListener("pointerdown", onDown); } catch {}
      window.removeEventListener("pointermove", onMove, { passive: true });
      window.removeEventListener("pointerup", onUp, { passive: true });
      window.removeEventListener("keydown", onKey);
    };

    sync(false);
    toast("編集モード：ドラッグで移動できます");
  }

  function endEditMode(silent = false) {
    if (!editMode) return;
    const { el } = editMode;

    try { editMode._off?.(); } catch {}
    drag = null;

    if (el && el.isConnected) {
      el.style.pointerEvents = "none";
      el.style.outline = "none";
      el.style.outlineOffset = "0";
      el.style.cursor = "default";
    }

    const p = document.getElementById(UI.ctrl);
    if (p) p.style.display = "none";

    editMode = null;

    applyAllPlaced();
    if (!silent) toast("完了しました");
  }

  function removePlaced(key) {
    const st = normalizeState(loadPlaceState());
    delete st.items[key];
    savePlaceState(st);

    const stage = ensureStage();
    const el = stage?.querySelector(`.itemPlaced[data-key="${CSS.escape(key)}"]`);
    if (el) { try { el.remove(); } catch {} }
  }

  // -------------------------------
  // shop変更で即追従
  // -------------------------------
  function hookWB() {
    if (!window.WB?.on) return false;
    try {
      window.WB.on("shop:changed", () => applyAllPlaced());
      window.WB.on("haikei:toggle", () => applyAllPlaced()); // 互換
      window.WB.on("core:ready", () => applyAllPlaced());
      window.WB.on("core:reset_partial", () => applyAllPlaced());
    } catch {}
    return true;
  }

  function boot() {
    ensureStyle();
    ensureStage();
    applyAllPlaced();
    hookWB();
    setTimeout(hookWB, 300);

    // localStorage変化でも追従
    window.addEventListener("storage", (e) => {
      if (!e) return;
      if (e.key === SHOP_OWNED_KEY || e.key === SHOP_STATE_KEY || e.key === LS_KEY) {
        applyAllPlaced();
      }
    });
  }

  // 公開API
  window.ITEMPLACE = {
    openModal,
    closeModal,
    applyAllPlaced,
    startPlaceMode,
    startEditMode,
  };

  // WBにも生やす（任意）
  try {
    window.WB = window.WB || {};
    window.WB.itemplace = window.WB.itemplace || {};
    window.WB.itemplace.openModal = openModal;
    window.WB.itemplace.applyAllPlaced = applyAllPlaced;
  } catch {}

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
