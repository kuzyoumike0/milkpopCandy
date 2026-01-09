// haikei.js
// ✅ /bg/bed.png を「うさぎの後ろ」に表示（自由配置）
// ✅ 配置モード中は赤枠で位置を表示
// ✅ shopで bed を購入した人だけ使える（未購入なら出さない）
// ✅ 購入後：WB.emit("haikei:changed") / storage で即反映
// ✅ 位置保存（localStorage）

(() => {
  "use strict";

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const LS_KEY = "milkpop_haikei_v1";

  const BED_SRC = "/bg/bed.png";

  const BED_ID = "haikeiBedImage";
  const WRAP_ID = "haikeiBedWrap";
  const STYLE_ID = "haikeiBedStyle";
  const BTN_ID = "haikeiBtn";

  const Z_BEHIND_BUNNY = 6;

  const DEFAULT = { x: 80, y: 220, scale: 1.0, rot: 0 };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function isBedOwned() {
    try { if (window.WB?.shop?.isOwned?.("bed")) return true; } catch {}
    const j = safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {};
    return !!j?.bed;
  }

  function loadState() {
    const j = safeParse(localStorage.getItem(LS_KEY)) || {};
    return {
      bed: {
        x: Number(j?.bed?.x ?? DEFAULT.x),
        y: Number(j?.bed?.y ?? DEFAULT.y),
        scale: Number(j?.bed?.scale ?? DEFAULT.scale),
        rot: Number(j?.bed?.rot ?? DEFAULT.rot),
      }
    };
  }

  function saveState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
#${WRAP_ID}{
  position:absolute;
  left:0; top:0;
  width:1px; height:1px;
  z-index:${Z_BEHIND_BUNNY};
  pointer-events:none;
}
#${BED_ID}{
  position:absolute;
  left:0; top:0;
  transform-origin: 0 0;
  user-select:none;
  -webkit-user-drag:none;
  pointer-events:none;
}
#${BED_ID}.haikeiEditing{
  pointer-events:auto;
  outline: 3px solid rgba(255,0,0,.85);
  outline-offset: 2px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.08);
  cursor: grab;
}
#${BED_ID}.haikeiEditing:active{ cursor: grabbing; }

#haikeiCtrlPanel{
  position: fixed;
  left: 10px;
  top: 58px;
  z-index: 99999;
  background: rgba(255,255,255,.92);
  border: 2px solid rgba(255,0,0,.75);
  border-radius: 10px;
  padding: 8px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  display: none;
}
#haikeiCtrlPanel .row{ display:flex; gap:6px; margin: 6px 0; flex-wrap: wrap; }
#haikeiCtrlPanel button{
  border: 1px solid rgba(0,0,0,.15);
  background: white;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
#haikeiCtrlPanel .hint{ opacity:.75; font-size:12px; margin-top:4px; }
`;
    document.head.appendChild(st);
  }

  function getHostLayer() {
    return document.getElementById("bgLayer") || document.getElementById("field") || document.body;
  }

  function ensureWrap() {
    ensureStyle();
    const host = getHostLayer();
    if (!host) return null;

    const cs = getComputedStyle(host);
    if (cs.position === "static") host.style.position = "relative";

    let wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = WRAP_ID;
      host.appendChild(wrap);
    }
    return wrap;
  }

  function ensureBed() {
    const wrap = ensureWrap();
    if (!wrap) return null;

    let img = document.getElementById(BED_ID);
    if (!img) {
      img = document.createElement("img");
      img.id = BED_ID;
      img.alt = "bed";
      img.src = BED_SRC;
      img.draggable = false;
      img.addEventListener("error", () => console.warn("[haikei] bed load failed:", BED_SRC));
      wrap.appendChild(img);
    } else {
      if (img.getAttribute("src") !== BED_SRC) img.src = BED_SRC;
    }
    return img;
  }

  function applyTransform(img, st) {
    img.style.left = `${Math.round(st.bed.x)}px`;
    img.style.top  = `${Math.round(st.bed.y)}px`;
    img.style.transform = `scale(${st.bed.scale}) rotate(${st.bed.rot}deg)`;
  }

  // --- UI ---
  let editing = false;
  let state = loadState();

  function ensureButton() {
    const hudButtons = document.getElementById("hudButtons");
    if (!hudButtons) return null;

    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.textContent = "背景配置";
      hudButtons.appendChild(btn);
      btn.addEventListener("click", () => toggleEdit());
    }
    return btn;
  }

  function ensureCtrlPanel() {
    let panel = document.getElementById("haikeiCtrlPanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "haikeiCtrlPanel";
    panel.innerHTML = `
      <div><b>背景配置：ベッド</b></div>
      <div class="row">
        <button id="hkScaleDown">− 縮小</button>
        <button id="hkScaleUp">＋ 拡大</button>
        <button id="hkRotL">⟲ 回転</button>
        <button id="hkRotR">⟳ 回転</button>
      </div>
      <div class="row">
        <button id="hkReset">リセット</button>
        <button id="hkDone">完了</button>
      </div>
      <div class="hint">ドラッグで移動できます（赤枠が配置枠）</div>
    `;
    document.body.appendChild(panel);

    const byId = (id) => document.getElementById(id);

    byId("hkScaleDown").addEventListener("click", () => {
      state.bed.scale = Math.max(0.2, +(state.bed.scale - 0.05).toFixed(3));
      sync();
    });
    byId("hkScaleUp").addEventListener("click", () => {
      state.bed.scale = Math.min(4.0, +(state.bed.scale + 0.05).toFixed(3));
      sync();
    });
    byId("hkRotL").addEventListener("click", () => {
      state.bed.rot = (state.bed.rot - 5);
      sync();
    });
    byId("hkRotR").addEventListener("click", () => {
      state.bed.rot = (state.bed.rot + 5);
      sync();
    });
    byId("hkReset").addEventListener("click", () => {
      state.bed = { ...DEFAULT };
      sync(true);
    });
    byId("hkDone").addEventListener("click", () => setEditing(false));

    return panel;
  }

  function setEditing(on) {
    editing = !!on;
    const img = document.getElementById(BED_ID);
    if (!img) return;

    const panel = ensureCtrlPanel();
    panel.style.display = editing ? "block" : "none";

    if (editing) {
      img.classList.add("haikeiEditing");
      img.style.pointerEvents = "auto";
    } else {
      img.classList.remove("haikeiEditing");
      img.style.pointerEvents = "none";
      saveState(state);
    }

    const btn = document.getElementById(BTN_ID);
    if (btn) btn.textContent = editing ? "配置中…" : "背景配置";
  }

  function toggleEdit() {
    if (!isBedOwned()) return; // 念のため
    setEditing(!editing);
  }

  function sync(saveNow = false) {
    const img = document.getElementById(BED_ID);
    if (!img) return;
    applyTransform(img, state);
    if (saveNow) saveState(state);
  }

  // --- Drag ---
  let drag = null;

  function attachDrag(img) {
    if (img.__haikeiDragAttached) return;
    img.__haikeiDragAttached = true;

    img.addEventListener("pointerdown", (e) => {
      if (!editing) return;
      e.preventDefault();
      img.setPointerCapture?.(e.pointerId);

      drag = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: state.bed.x,
        baseY: state.bed.y,
      };
    });

    window.addEventListener("pointermove", (e) => {
      if (!editing || !drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      state.bed.x = drag.baseX + dx;
      state.bed.y = drag.baseY + dy;
      sync(false);
    }, { passive: true });

    window.addEventListener("pointerup", () => {
      if (!drag) return;
      drag = null;
      saveState(state);
    }, { passive: true });
  }

  function removeAll() {
    setEditing(false);
    try { document.getElementById("haikeiCtrlPanel")?.remove(); } catch {}
    try { document.getElementById(BED_ID)?.remove(); } catch {}
    try { document.getElementById(WRAP_ID)?.remove(); } catch {}
    try { document.getElementById(BTN_ID)?.remove(); } catch {}
  }

  function boot() {
    // 未購入なら何も出さない（完全非表示）
    if (!isBedOwned()) {
      removeAll();
      return;
    }

    ensureButton();

    const img = ensureBed();
    if (!img) return;

    state = loadState();
    sync(false);

    attachDrag(img);
    setEditing(false);
  }

  // DOM待機（resetで作り直されても復帰）
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    boot();
    if ((document.getElementById("hudButtons") && (isBedOwned() ? ensureBed() : true)) || tries > 220) {
      clearInterval(t);
    }
  }, 60);

  // shop購入通知で即反映
  const hookWB = () => {
    if (!window.WB?.on) return false;
    try {
      window.WB.on("haikei:changed", () => boot());
      window.WB.on("shop:changed", () => boot());
      window.WB.on("core:ready", () => boot());
      window.WB.on("core:reset_partial", () => boot());
    } catch {}
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);

  // storage更新でも即反映
  window.addEventListener("storage", (e) => {
    if (e && e.key === SHOP_OWNED_KEY) boot();
  });
})();
