// shop.js（購入＋設置 完結版：#shopBtn専用 → ✅ハンバーガーメニュー対応 / 設置ON/OFFも内包）
// ✅ #shopBtn クリックは「メニューから呼ぶ」想定（index.htmlでは非表示でもOK）
// ✅ ハンバーガーメニュー側が呼べるように window.SHOP.open() / WB.shop.open() を提供
// ✅ もし #shopBtn が存在するなら従来通りクリックで開く（互換）
// ✅ owned（購入済み）保存 & 即通知
// ✅ 設置（placed）もこのファイルだけで完結（itemPlace.js 不要）
// ✅ 二重起動・二重リスナー根絶

(() => {
  "use strict";

  // 二重読み込み防止
  if (window.__BGSHOP_BUYPLACE_V2_INITED__) {
    console.warn("[shop.js] already inited; skip re-init");
    return;
  }
  window.__BGSHOP_BUYPLACE_V2_INITED__ = true;

  const LS_OWNED  = "milkpop_shop_owned_v1";     // { key:true }
  const LS_PLACED = "milkpop_shop_placed_v1";    // { key:true }

  // ✅ ショップで買える物（設置可能な物は placeable:true）
  const ITEMS = {
    mirrorball: {
      key: "mirrorball",
      label: "ミラーボール",
      desc: "夜の演出は bgcolor.js が見る（設置不要）",
      price: 9000,
      img: "./assets/bg/mirrorball.png",
      placeable: false,
    },
    bed: {
      key: "bed",
      label: "ベッド",
      desc: "購入後、ここから設置/撤去できる",
      price: 3500,
      img: "./assets/bg/bed.png",
      placeable: true,
      // デフォルト設置位置（% と px で雑に良い感じに）
      place: { left: "50%", bottom: "10px", w: "260px", anchor: "bottomCenter" },
    },
    // ここに増やすときは placeable と place を追加すればOK
    // oak: { key:"oak", label:"オーク", desc:"木だよ", price:1200, img:"./assets/bg/oak.png", placeable:true, place:{left:"14%", bottom:"8px", w:"160px"} },
  };

  const UI = {
    style: "bgShopStyleV2",
    backdrop: "bgShopBackdropV2",
    modal: "bgShopModalV2",
    toast: "bgShopToastV2",
    decorLayer: "bgDecorLayerV1",
  };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  function loadOwned()  { return safeParse(localStorage.getItem(LS_OWNED)) || {}; }
  function saveOwned(o) { try { localStorage.setItem(LS_OWNED, JSON.stringify(o)); } catch {} }

  function loadPlaced()  { return safeParse(localStorage.getItem(LS_PLACED)) || {}; }
  function savePlaced(p) { try { localStorage.setItem(LS_PLACED, JSON.stringify(p)); } catch {} }

  let owned  = loadOwned();
  let placed = loadPlaced();

  function getCoinsWB() {
    const WB = window.WB;
    try {
      if (WB?.getCoin) return Number(WB.getCoin()) || 0;
      if (typeof WB?.coins === "number") return Number(WB.coins) || 0;
      const el = document.getElementById("coinValue");
      return el ? Number(el.textContent || "0") : 0;
    } catch {}
    return 0;
  }

  function spendCoinsWB(amount) {
    const WB = window.WB;
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    if (!a) return true;

    try {
      if (WB?.spendCoin)  return !!WB.spendCoin(a);
      if (WB?.spendCoins) return !!WB.spendCoins(a);

      if (typeof WB?.coins === "number") {
        if (WB.coins < a) return false;
        WB.coins -= a;
        WB.updateHud?.();
        return true;
      }

      const el = document.getElementById("coinValue");
      if (el) {
        const cur = Number(el.textContent || "0") || 0;
        if (cur < a) return false;
        el.textContent = String(cur - a);
        return true;
      }
    } catch {}
    return false;
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
    el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1200);
  }

  /* =========================
   * Decor placement (完結)
   * ========================= */

  function getFieldRoot() {
    // #field があればそこに、無ければ body 直下
    return document.getElementById("field") || document.body;
  }

  function ensureDecorLayer() {
    const root = getFieldRoot();

    let layer = document.getElementById(UI.decorLayer);
    if (layer && layer.parentElement !== root) {
      try { layer.remove(); } catch {}
      layer = null;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.id = UI.decorLayer;

      // field 配下なら absolute で貼れるようにしておく（position:relativeが無い場合に備える）
      // 既存CSSを壊さないため、rootがfieldの時だけ軽く補助
      if (root.id === "field") {
        const cs = getComputedStyle(root);
        if (cs.position === "static") root.style.position = "relative";
      }

      layer.style.cssText = `
position:absolute; inset:0;
pointer-events:none;
z-index:30; /* 背景寄り（うさぎ/コインより下にしたいなら app側に合わせて調整OK） */
`;
      root.appendChild(layer);
    }
    return layer;
  }

  function makeDecorEl(it) {
    const el = document.createElement("div");
    el.dataset.decor = it.key;

    const img = document.createElement("img");
    img.src = it.img;
    img.alt = it.key;
    img.draggable = false;

    el.appendChild(img);

    // 画像の見え方
    el.style.cssText = `
position:absolute;
pointer-events:none;
filter: drop-shadow(0 12px 18px rgba(0,0,0,.20));
`;
    img.style.cssText = `
width:100%;
height:auto;
display:block;
object-fit:contain;
`;

    // 位置
    const p = it.place || {};
    const w = p.w || "220px";

    el.style.width = w;

    // anchor: bottomCenter の場合 left:50% を transform で中央寄せ
    if ((p.anchor || "") === "bottomCenter") {
      el.style.left = p.left || "50%";
      el.style.bottom = p.bottom || "8px";
      el.style.transform = "translateX(-50%)";
    } else {
      if (p.left != null) el.style.left = p.left;
      if (p.right != null) el.style.right = p.right;
      if (p.top != null) el.style.top = p.top;
      if (p.bottom != null) el.style.bottom = p.bottom;
    }
    return el;
  }

  function applyPlacedState() {
    placed = loadPlaced();
    const layer = ensureDecorLayer();

    // 既存を整理（placedじゃないものは消す）
    layer.querySelectorAll("[data-decor]").forEach(el => {
      const key = el.getAttribute("data-decor");
      if (!placed[key]) el.remove();
    });

    // placedのものを生成
    Object.keys(placed).forEach(key => {
      if (!placed[key]) return;
      const it = ITEMS[key];
      if (!it || !it.placeable) return;
      if (!owned[key]) return; // 念のため（未購入は置かない）

      const exists = layer.querySelector(`[data-decor="${CSS.escape(key)}"]`);
      if (exists) return;

      layer.appendChild(makeDecorEl(it));
    });
  }

  function setPlaced(key, on) {
    const it = ITEMS[key];
    if (!it || !it.placeable) return false;
    owned = loadOwned();
    if (!owned[key]) return false;

    placed = loadPlaced();
    placed[key] = !!on;
    // false は掃除
    if (!placed[key]) delete placed[key];
    savePlaced(placed);

    applyPlacedState();
    emitChanged(key);
    return true;
  }

  /* =========================
   * UI
   * ========================= */

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const st = document.createElement("style");
    st.id = UI.style;
    st.textContent = `
#${UI.backdrop}{
  position:fixed; inset:0;
  background:rgba(0,0,0,.28);
  z-index:2147483002;
  display:none;
}
#${UI.modal}{
  position:fixed;
  left:50%; top:54%;
  transform:translate(-50%,-50%);
  width:min(560px, 92vw);
  max-height:min(78vh, 680px);
  overflow:auto;
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  z-index:2147483003;
  padding:14px 14px 12px;
  display:none;
}
#${UI.modal} .row{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
#${UI.modal} .ttl{ font-weight:900; font-size:16px; }
#${UI.modal} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.modal} .sep{ height:1px; background:rgba(0,0,0,.08); margin:12px 0; }
#${UI.modal} .tag{
  font-size:12px; font-weight:900;
  padding:5px 10px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
  white-space:nowrap;
}
#${UI.modal} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  background:#ffd6e7;
}
#${UI.modal} .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
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
#${UI.modal} .name{ font-weight:900; }
#${UI.modal} .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.modal} .right{
  margin-left:auto;
  display:flex; gap:8px; flex-wrap:wrap;
  align-items:center; justify-content:flex-end;
}
#${UI.modal} .btn.place{ background:#d7f6ff; }
#${UI.modal} .btn.remove{ background:#ffe0e0; }
`;
    document.head.appendChild(st);
  }

  function ensureUI() {
    ensureStyle();

    let backdrop = document.getElementById(UI.backdrop);
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = UI.backdrop;
      document.body.appendChild(backdrop);
    }

    let modal = document.getElementById(UI.modal);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = UI.modal;
      document.body.appendChild(modal);
    }

    return { backdrop, modal };
  }

  function closeModal() {
    const bd = document.getElementById(UI.backdrop);
    const m  = document.getElementById(UI.modal);
    if (bd) bd.style.display = "none";
    if (m)  m.style.display = "none";
  }

  function openModal() {
    const { backdrop, modal } = ensureUI();

    owned  = loadOwned();
    placed = loadPlaced();
    const c = getCoinsWB();

    modal.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">ショップ</div>
    <div class="sub">購入と設置がここだけで完結</div>
  </div>
  <button class="btn ghost" id="bgShopCloseX" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag">🪙 ${c}</div>
  <div class="tag">メニューから開ける</div>
</div>

<div class="sep"></div>

<div class="grid">
  ${Object.values(ITEMS).map(it => {
    const own = !!owned[it.key];
    const plc = !!placed[it.key];
    const canPlace = !!it.placeable && own;

    return `
    <div class="item">
      <div class="thumb"><img src="${it.img}" alt="${it.key}"></div>
      <div style="min-width:0;">
        <div class="name">${it.label}</div>
        <div class="meta">${it.desc}</div>
        <div class="meta">価格：<b>${it.price}🪙</b></div>
      </div>

      <div class="right">
        <div class="tag">${own ? "購入済み" : "未購入"}</div>
        ${it.placeable ? `<div class="tag">${plc ? "設置中" : "未設置"}</div>` : ``}

        ${own
          ? (it.placeable
              ? (plc
                  ? `<button class="btn remove" data-remove="${it.key}">撤去</button>`
                  : `<button class="btn place"  data-place="${it.key}">設置</button>`)
              : `<button class="btn" disabled>購入済み</button>`)
          : `<button class="btn" data-buy="${it.key}">購入</button>`
        }
      </div>
    </div>`;
  }).join("")}
</div>
`;

    backdrop.style.display = "block";
    modal.style.display = "block";

    $("#bgShopCloseX", modal)?.addEventListener("click", closeModal);
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

    // 購入
    modal.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-buy");
        const it = ITEMS[key];
        if (!it) return;

        owned = loadOwned();
        if (owned[key]) return;

        const have = getCoinsWB();
        if (have < it.price) { toast(`🪙 足りない！ ${have} / ${it.price}`); openModal(); return; }
        if (!spendCoinsWB(it.price)) { toast("購入できませんでした"); openModal(); return; }

        owned[key] = true;
        saveOwned(owned);

        // 購入しただけ通知（mirrorball等）
        emitChanged(key);

        toast(`✅ ${it.label} 購入！ -${it.price}🪙`);
        openModal();
      });
    });

    // 設置
    modal.querySelectorAll("[data-place]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-place");
        if (!setPlaced(key, true)) { toast("設置できませんでした"); return; }
        toast("✅ 設置した！");
        openModal();
      });
    });

    // 撤去
    modal.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-remove");
        if (!setPlaced(key, false)) { toast("撤去できませんでした"); return; }
        toast("✅ 撤去した！");
        openModal();
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = document.getElementById(UI.modal);
      if (m && m.style.display === "block") closeModal();
    }, { once: true });
  }

  /* =========================
   * Notify
   * ========================= */

  function emitChanged(key) {
    owned  = loadOwned();
    placed = loadPlaced();

    try {
      // 汎用
      window.WB?.emit?.("shop:changed", {
        key,
        owned:  !!owned[key],
        placed: !!placed[key],
      });

      // mirrorball は bgcolor.js が owned を見る
      if (key === "mirrorball") {
        window.WB?.emit?.("bg:mirrorball_changed", { owned: !!owned.mirrorball });
      }

      // placeable系（必要なら専用イベントも）
      const it = ITEMS[key];
      if (it?.placeable) {
        window.WB?.emit?.("item:placed_changed", {
          key,
          owned:  !!owned[key],
          placed: !!placed[key],
        });
      }
    } catch {}
  }

  function patchWB() {
    const WB = window.WB;
    if (!WB || typeof WB !== "object") return;

    WB.shop = WB.shop || {};

    WB.shop.isOwned  = (key) => !!(loadOwned()?.[key]);
    WB.shop.isPlaced = (key) => !!(loadPlaced()?.[key]);

    WB.shop.open  = () => openModal();
    WB.shop.close = () => closeModal();

    WB.shop.place   = (key) => setPlaced(key, true);
    WB.shop.remove  = (key) => setPlaced(key, false);
    WB.shop.toggle  = (key) => setPlaced(key, !loadPlaced()?.[key]);
  }

  function waitForElm(getter, timeoutMs = 12000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const v = getter();
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error("timeout")); }
      }, 50);
    });
  }

  async function boot() {
    ensureStyle();
    patchWB();

    // WB後追い
    const start = Date.now();
    const wbTimer = setInterval(() => {
      patchWB();
      if (Date.now() - start > 15000) clearInterval(wbTimer);
    }, 200);

    // ✅ グローバルAPI
    window.SHOP = {
      open:  () => openModal(),
      close: () => closeModal(),

      isOwned:  (k) => !!loadOwned()?.[k],
      isPlaced: (k) => !!loadPlaced()?.[k],

      owned:  () => loadOwned(),
      placed: () => loadPlaced(),

      place:  (k) => setPlaced(k, true),
      remove: (k) => setPlaced(k, false),
      toggle: (k) => setPlaced(k, !loadPlaced()?.[k]),

      // 強制再適用
      apply: () => applyPlacedState(),
    };

    // ✅ #shopBtn 互換
    try {
      const shopBtn = await waitForElm(() => document.getElementById("shopBtn"), 12000);
      if (shopBtn && !shopBtn.__bgshopBound) {
        shopBtn.__bgshopBound = true;
        shopBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          openModal();
        }, true);
      }
    } catch {
      console.warn("[shop.js] #shopBtn not found (menu-open only)");
    }

    // 初期：購入/設置の反映
    owned  = loadOwned();
    placed = loadPlaced();

    // 設置反映（bedなど）
    applyPlacedState();

    // 初期通知
    Object.keys(owned).forEach(k => { if (owned[k]) emitChanged(k); });
    Object.keys(placed).forEach(k => { if (placed[k]) emitChanged(k); });
  }

  boot().catch(() => {});
})();
