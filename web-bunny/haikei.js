// haikei.js（V4.1）
// ✅ bed.png を「うさぎの後ろ」に配置（bgLayer）
// ✅ shopで bed 購入 + bedEnabled=ON の時だけ有効
// ✅ 変更：HUDボタンは作らない（ハンバーガーメニュー等から HAKEI.openBedPlacer() を呼ぶ）
// ✅ 「配置モード」では bed.png の“透明プレビュー＋赤枠”を出す
// ✅ フィールドをクリックした位置にプレビューを移動し、そのクリックで即確定→背景に配置
// ✅ 配置モード開始時：ショップモーダルを強制的に閉じて邪魔を根絶
// ✅ 設置OFF/未購入なら完全撤去（残骸ゼロ）
// ✅ 位置は localStorage に保存（次回も復元）
// ✅ 追加：画像を小さくする（BED_SCALE）

(() => {
  "use strict";

  const SHOP_OWNED_KEY = "milkpop_shop_owned_v1";
  const SHOP_STATE_KEY = "milkpop_shop_state_v1";
  const LS_KEY = "milkpop_haikei_v2";

  // ★ユーザー要望のパス
  const BED_SRC = "./assets/bg/bed.png";

  const WRAP_ID = "haikeiBedWrap";
  const BED_ID = "haikeiBedImage";
  const PREVIEW_ID = "haikeiBedPreview";

  const STYLE_ID = "haikeiBedStyleV4_1";

  // うさぎより後ろ（bgLayer内）
  const Z_BEHIND_BUNNY = 6;

  // ✅ 画像を小さくする倍率（ここだけ調整すればOK）
  const BED_SCALE = 0.62;

  // 初期位置（未配置時）
  const DEFAULT = { x: 80, y: 220 };

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function isBedOwned() {
    try { if (window.WB?.shop?.isOwned?.("bed")) return true; } catch {}
    const j = safeParse(localStorage.getItem(SHOP_OWNED_KEY)) || {};
    return !!j?.bed;
  }

  function isBedEnabled() {
    try { if (typeof window.WB?.shop?.isBedEnabled === "function") return !!window.WB.shop.isBedEnabled(); } catch {}
    const j = safeParse(localStorage.getItem(SHOP_STATE_KEY)) || {};
    if (j && typeof j === "object" && "bedEnabled" in j) return !!j.bedEnabled;
    // 旧データ互換：無ければON扱い
    return true;
  }

  function loadState() {
    const j = safeParse(localStorage.getItem(LS_KEY)) || {};
    return {
      bed: {
        x: Number(j?.bed?.x ?? DEFAULT.x),
        y: Number(j?.bed?.y ?? DEFAULT.y),
      }
    };
  }

  function saveState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {}
  }

  // ★ショップのモーダルが最前面で塞ぐ問題を根絶：配置開始時に強制クローズ
  function forceCloseShopModal() {
    const ids = [
      "bgShopBackdropV1", "bgShopModalV1",           // shop.js（あなたの現行）
      "milkpopShopBackdropV4", "milkpopShopModalV4",
      "milkpopShopBackdropV3", "milkpopShopModalV3",
      "milkpopShopBackdropV2", "milkpopShopModalV2",
      "milkpopShopBackdropV1", "milkpopShopModalV1",
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = "none";
        el.style.pointerEvents = "none";
      }
    });

    document.querySelectorAll('[id^="bgShopBackdropV"],[id^="milkpopShopBackdropV"]').forEach(el => {
      el.style.display = "none";
      el.style.pointerEvents = "none";
    });
    document.querySelectorAll('[id^="bgShopModalV"],[id^="milkpopShopModalV"]').forEach(el => {
      el.style.display = "none";
      el.style.pointerEvents = "none";
    });
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
#${BED_ID}, #${PREVIEW_ID}{
  position:absolute;
  left:0; top:0;
  transform-origin: 0 0;
  transform: scale(${BED_SCALE});
  user-select:none;
  -webkit-user-drag:none;
}
#${BED_ID}{
  pointer-events:none;
}
#${PREVIEW_ID}{
  /* ✅ 透明プレビュー + 赤枠 */
  opacity: .26;
  outline: 3px solid rgba(255,0,0,.85);
  outline-offset: 2px;

  /* クリックは“field側”で拾うので、プレビュー自体は邪魔しない */
  pointer-events:none;
}
.haikeiPlacingHintV4{
  position:fixed;
  left:50%;
  top:14%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  background:rgba(255,255,255,.96);
  border-radius:16px;
  padding:10px 12px;
  font-weight:1000;
  box-shadow:0 18px 55px rgba(0,0,0,.22);
  display:none;
  white-space:nowrap;
}
.haikeiPlacingHintV4 b{ color:#d10000; }
`;
    document.head.appendChild(st);
  }

  function getHostLayer() {
    // bedは bgLayer（背景専用）へ
    return document.getElementById("bgLayer") || document.getElementById("field") || document.body;
  }

  function ensureWrap() {
    ensureStyle();
    const host = getHostLayer();
    if (!host) return null;

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

  function ensureBedImg() {
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
    } else if (img.getAttribute("src") !== BED_SRC) {
      img.src = BED_SRC;
    }
    return img;
  }

  function ensurePreviewImg() {
    const wrap = ensureWrap();
    if (!wrap) return null;

    let img = document.getElementById(PREVIEW_ID);
    if (!img) {
      img = document.createElement("img");
      img.id = PREVIEW_ID;
      img.alt = "bed-preview";
      img.src = BED_SRC;
      img.draggable = false;
      img.addEventListener("error", () => console.warn("[haikei] preview load failed:", BED_SRC));
      wrap.appendChild(img);
    } else if (img.getAttribute("src") !== BED_SRC) {
      img.src = BED_SRC;
    }
    return img;
  }

  function ensureHint() {
    let el = document.querySelector(".haikeiPlacingHintV4");
    if (el) return el;
    el = document.createElement("div");
    el.className = "haikeiPlacingHintV4";
    el.innerHTML = `🛏️ 置きたい場所をクリックして<b>確定</b>（Escでキャンセル）`;
    document.body.appendChild(el);
    return el;
  }

  function applyPos(img, st) {
    img.style.left = `${Math.round(st.bed.x)}px`;
    img.style.top  = `${Math.round(st.bed.y)}px`;
  }

  function hidePreview() {
    const pv = document.getElementById(PREVIEW_ID);
    if (pv) pv.style.display = "none";
    const hint = ensureHint();
    hint.style.display = "none";
  }

  function showPreview(st) {
    const pv = ensurePreviewImg();
    if (!pv) return;
    pv.style.display = "block";
    applyPos(pv, st);

    const hint = ensureHint();
    hint.style.display = "block";
  }

  function removeAll() {
    placing = false;
    detachPlaceHandlers();

    try { document.getElementById(PREVIEW_ID)?.remove(); } catch {}
    try { document.getElementById(BED_ID)?.remove(); } catch {}
    try { document.getElementById(WRAP_ID)?.remove(); } catch {}
    try { document.querySelector(".haikeiPlacingHintV4")?.remove(); } catch {}
  }

  // ===== 配置モード =====
  let placing = false;
  let st = loadState();

  let __onPointerDown = null;
  let __onKeyDown = null;

  function detachPlaceHandlers() {
    const field = document.getElementById("field") || document.body;
    if (__onPointerDown) {
      try { field.removeEventListener("pointerdown", __onPointerDown, true); } catch {}
      __onPointerDown = null;
    }
    if (__onKeyDown) {
      try { window.removeEventListener("keydown", __onKeyDown, true); } catch {}
      __onKeyDown = null;
    }
  }

  function stopPlacing(showHintOff = true) {
    placing = false;
    detachPlaceHandlers();
    if (showHintOff) hidePreview();
  }

  function startPlacing() {
    // 購入/設置チェック
    if (!(isBedOwned() && isBedEnabled())) return false;

    // ★ショップ邪魔根絶
    forceCloseShopModal();

    st = loadState();
    showPreview(st);
    placing = true;

    const field = document.getElementById("field") || document.body;
    const wrap = ensureWrap();
    if (!field || !wrap) return false;

    // fieldクリックで「その場で確定」
    __onPointerDown = (e) => {
      if (!placing) return;
      const host = getHostLayer();
      if (!host) return;

      // クリック座標を hostローカルに変換
      const hr = host.getBoundingClientRect();
      const x = e.clientX - hr.left;
      const y = e.clientY - hr.top;

      // ✅ スケールを考慮して中心合わせ
      const pv = document.getElementById(PREVIEW_ID);
      let nx = x;
      let ny = y;
      try {
        const w = (pv?.naturalWidth || pv?.width || 0) * BED_SCALE;
        const h = (pv?.naturalHeight || pv?.height || 0) * BED_SCALE;
        if (w > 0 && h > 0) {
          nx = x - (w / 2);
          ny = y - (h / 2);
        }
      } catch {}

      // 保存 & 実配置
      st.bed.x = nx;
      st.bed.y = ny;
      saveState(st);

      const bed = ensureBedImg();
      if (bed) {
        bed.style.display = "block";
        applyPos(bed, st);
      }

      // プレビューは即消して終了
      hidePreview();
      stopPlacing(false);

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    };

    // Escでキャンセル
    __onKeyDown = (e) => {
      if (!placing) return;
      if (e.key !== "Escape") return;
      stopPlacing(true);
    };

    field.addEventListener("pointerdown", __onPointerDown, true);
    window.addEventListener("keydown", __onKeyDown, true);

    return true;
  }

  // ===== 通常表示（復元/撤去） =====
  function refresh() {
    const ok = isBedOwned() && isBedEnabled();
    if (!ok) { removeAll(); return; }

    ensureWrap();

    // 配置モードでなければプレビュー消す
    if (!placing) hidePreview();

    const bed = ensureBedImg();
    if (!bed) return;

    st = loadState();
    bed.style.display = "block";
    applyPos(bed, st);
  }

  // ===== boot =====
  function boot() {
    ensureStyle();
    refresh();
  }

  // reset耐性 + 初期化
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    boot();
    if (document.getElementById("field") || tries > 220) clearInterval(t);
  }, 60);

  // WBイベントで即反映
  const hookWB = () => {
    if (!window.WB?.on) return false;
    try {
      window.WB.on("haikei:toggle",  () => boot());
      window.WB.on("haikei:changed", () => boot());
      window.WB.on("shop:changed",   () => boot());
      window.WB.on("core:ready",     () => boot());
      window.WB.on("core:reset_partial", () => boot());
    } catch {}
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);

  // 他タブ変更にも追従
  window.addEventListener("storage", (e) => {
    if (!e) return;
    if (e.key === SHOP_OWNED_KEY || e.key === SHOP_STATE_KEY || e.key === LS_KEY) boot();
  });

  // ===== 公開API（ハンバーガーメニューから呼ぶ） =====
  window.HAIKEI = window.HAIKEI || {};
  window.HAIKEI.openBedPlacer = () => startPlacing();
  window.HAIKEI.refresh = () => boot();

  // 互換：WBにもぶら下げる（あれば）
  try {
    window.WB = window.WB || {};
    window.WB.haikei = window.WB.haikei || {};
    window.WB.haikei.openBedPlacer = () => startPlacing();
    window.WB.haikei.refresh = () => boot();
  } catch {}
})();
