// haikei.js
// ✅ /bg/bed.png を「うさぎの後ろ」に表示（自由配置）
// ✅ 配置モード中は赤枠で位置を表示
// ✅ ドラッグで移動 / ボタンで拡大縮小・回転 / 位置保存（localStorage）
// ✅ 配置モードOFF時はクリック邪魔しない（pointer-events:none）
// ✅ reset等でDOMが作り直されても復帰

(() => {
  "use strict";

  const LS_KEY = "milkpop_haikei_v1";

  // 置く画像（要望通り）
  const BED_SRC = "/bg/bed.png";

  // DOM ids
  const BED_ID = "haikeiBedImage";
  const WRAP_ID = "haikeiBedWrap";
  const STYLE_ID = "haikeiBedStyle";
  const BTN_ID = "haikeiBtn";

  // うさぎより後ろにしたい（bunnyLayer より低く）
  // ※あなたの環境で z-index が違う場合はここだけ調整すればOK
  const Z_BEHIND_BUNNY = 6;

  // 初期値
  const DEFAULT = { x: 80, y: 220, scale: 1.0, rot: 0 };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
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
  pointer-events:none; /* 通常は邪魔しない */
}
#${BED_ID}{
  position:absolute;
  left:0; top:0;
  transform-origin: 0 0;
  user-select:none;
  -webkit-user-drag:none;
  pointer-events:none; /* 通常は邪魔しない */
  /* 配置中の赤枠は class で付ける */
}
#${BED_ID}.haikeiEditing{
  pointer-events:auto; /* 配置中だけ触れる */
  outline: 3px solid rgba(255,0,0,.85);
  outline-offset: 2px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.08); /* うっすら暗幕で「置いてる感」 */
  cursor: grab;
}
#${BED_ID}.haikeiEditing:active{
  cursor: grabbing;
}

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
#haikeiCtrlPanel .row{
  display:flex;
  gap:6px;
  margin: 6px 0;
  flex-wrap: wrap;
}
#haikeiCtrlPanel button{
  border: 1px solid rgba(0,0,0,.15);
  background: white;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
#haikeiCtrlPanel .hint{
  opacity:.75;
  font-size:12px;
  margin-top:4px;
}
`;
    document.head.appendChild(st);
  }

  function getHostLayer() {
    // 置き場は bgLayer 優先。なければ field に置く。
    return document.getElementById("bgLayer") || document.getElementById("field") || document.body;
  }

  function ensureWrap() {
    ensureStyle();
    const host = getHostLayer();
    if (!host) return null;

    // host が relative じゃないと absolute がズレるので補正
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
    // left/top を数値で。transform で scale/rotate
    img.style.left = `${Math.round(st.bed.x)}px`;
    img.style.top  = `${Math.round(st.bed.y)}px`;
    const s = st.bed.scale;
    const r = st.bed.rot;
    img.style.transform = `translate(0,0) scale(${s}) rotate(${r}deg)`;
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
      // HUDの左側ボタン群と揃える（appendでOK）
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
    byId("hkDone").addEventListener("click", () => {
      setEditing(false);
    });

    return panel;
  }

  function setEditing(on) {
    editing = !!on;

    const img = ensureBed();
    if (!img) return;

    const panel = ensureCtrlPanel();
    panel.style.display = editing ? "block" : "none";

    if (editing) {
      img.classList.add("haikeiEditing");
      img.style.pointerEvents = "auto";
    } else {
      img.classList.remove("haikeiEditing");
      img.style.pointerEvents = "none";
      // 完了時に保存
      saveState(state);
    }

    // ボタン文言
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.textContent = editing ? "配置中…" : "背景配置";
  }

  function toggleEdit() {
    setEditing(!editing);
  }

  function sync(saveNow = false) {
    const img = ensureBed();
    if (!img) return;
    applyTransform(img, state);
    if (saveNow) saveState(state);
  }

  // --- Drag ---
  let drag = null;

  function attachDrag(img) {
    // 二重登録防止
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
      // 置いたら軽く保存（頻繁にsetItemしない）
      saveState(state);
    }, { passive: true });
  }

  // --- Boot / Resilience ---
  function boot() {
    ensureButton();

    const img = ensureBed();
    if (!img) return;

    // 初期反映
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
    if ((document.getElementById("hudButtons") && ensureBed()) || tries > 200) {
      clearInterval(t);
    }
  }, 50);

  // WBのreset等があるなら再適用
  const hookWB = () => {
    if (!window.WB?.on) return false;
    try {
      window.WB.on("core:ready", () => boot());
      window.WB.on("core:reset_partial", () => boot());
    } catch {}
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
