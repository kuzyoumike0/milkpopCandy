// shop.js（背景ショップ：#shopBtn専用 → ✅ハンバーガーメニュー対応版）
// ✅ #shopBtn クリックは「メニューから呼ぶ」想定（index.htmlでは非表示でもOK）
// ✅ ハンバーガーメニュー側が呼べるように window.SHOP.open() / WB.shop.open() を提供
// ✅ もし #shopBtn が存在するなら従来通りクリックで開く（互換）
// ✅ owned/state 保存 & 即通知
// ✅ 二重起動・二重リスナー根絶

(() => {
  "use strict";

  // 二重読み込み防止
  if (window.__BGSHOP_V1_INITED__) {
    console.warn("[shop.js] already inited; skip re-init");
    try { window.SHOP?.open?.(); } catch {}
    return;
  }
  window.__BGSHOP_V1_INITED__ = true;

  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_STATE = "milkpop_shop_state_v1";

  const ITEMS = {
    mirrorball: {
      key: "mirrorball",
      label: "ミラーボール",
      desc: "設置ONでスポットライトが出る",
      price: 9000,
      img: "./assets/bg/mirrorball.png",
    },
    bed: {
      key: "bed",
      label: "ベッド",
      desc: "うさぎの後ろに配置できる背景アイテム",
      price: 3500,
      img: "./assets/bg/bed.png", // ← パス統一（先頭/無しで404りやすいので ./assets に）
    },
  };

  const UI = {
    style: "bgShopStyleV1",
    backdrop: "bgShopBackdropV1",
    modal: "bgShopModalV1",
    toast: "bgShopToastV1",
  };

  const $ = (q, p = document) => p.querySelector(q);

  function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function loadOwned() { return safeParse(localStorage.getItem(LS_OWNED)) || {}; }
  function saveOwned(o) { try { localStorage.setItem(LS_OWNED, JSON.stringify(o)); } catch {} }
  function loadState() {
    const j = safeParse(localStorage.getItem(LS_STATE)) || {};
    return {
      mirrorballEnabled: j.mirrorballEnabled !== false,
      bedEnabled: j.bedEnabled !== false,
    };
  }
  function saveState(s) { try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch {} }

  let owned = loadOwned();
  let state = loadState();

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
      if (WB?.spendCoin) return !!WB.spendCoin(a);
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
    const m = document.getElementById(UI.modal);
    if (bd) bd.style.display = "none";
    if (m) m.style.display = "none";
  }

  function openModal() {
    const { backdrop, modal } = ensureUI();

    owned = loadOwned();
    state = loadState();

    const c = getCoinsWB();

    modal.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">ショップ</div>
    <div class="sub">背景アイテムを購入 / 設置できます</div>
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
    const en  = !!state[it.key + "Enabled"];
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
        <button class="btn" data-buy="${it.key}" ${own ? "disabled" : ""}>購入</button>
        <button class="btn ghost" data-toggle="${it.key}" ${own ? "" : "disabled"}>
          ${en ? "設置ON" : "設置OFF"}
        </button>
      </div>
    </div>`;
  }).join("")}
</div>
`;

    backdrop.style.display = "block";
    modal.style.display = "block";

    $("#bgShopCloseX", modal)?.addEventListener("click", closeModal);
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

    modal.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-buy");
        const it = ITEMS[key];
        if (!it) return;

        if (owned[key]) return;
        const have = getCoinsWB();
        if (have < it.price) { toast(`🪙 足りない！ ${have} / ${it.price}`); openModal(); return; }
        if (!spendCoinsWB(it.price)) { toast("購入できませんでした"); openModal(); return; }

        owned[key] = true;
        saveOwned(owned);

        state[key + "Enabled"] = true;
        saveState(state);

        emitChanged(key);
        toast(`✅ ${it.label} 購入！ -${it.price}🪙`);
        openModal();
      });
    });

    modal.querySelectorAll("[data-toggle]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-toggle");
        if (!owned[key]) return;

        state[key + "Enabled"] = !state[key + "Enabled"];
        saveState(state);

        emitChanged(key);
        toast(state[key + "Enabled"] ? `✅ ${ITEMS[key].label} 設置ON` : `⛔ ${ITEMS[key].label} 設置OFF`);
        openModal();
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = document.getElementById(UI.modal);
      if (m && m.style.display === "block") closeModal();
    }, { once: true });
  }

  function emitChanged(key) {
    try {
      window.WB?.emit?.("shop:changed", { key, owned: !!owned[key], enabled: !!state[key + "Enabled"] });
      if (key === "mirrorball") {
        window.WB?.emit?.("bg:mirrorball_toggle", { enabled: !!state.mirrorballEnabled });
        window.WB?.emit?.("bg:mirrorball_changed", { owned: !!owned.mirrorball, enabled: !!state.mirrorballEnabled });
      }
      if (key === "bed") {
        window.WB?.emit?.("bg:bed_toggle", { enabled: !!state.bedEnabled });
        window.WB?.emit?.("haikei:toggle", { enabled: !!state.bedEnabled, owned: !!owned.bed });
      }
    } catch {}
  }

  function patchWB() {
    const WB = window.WB;
    if (!WB || typeof WB !== "object") return;

    WB.shop = WB.shop || {};
    WB.shop.isOwned = (key) => !!(loadOwned()?.[key]);

    WB.shop.isMirrorballEnabled = () => !!loadState().mirrorballEnabled;
    WB.shop.setMirrorballEnabled = (v) => {
      const st = loadState();
      st.mirrorballEnabled = !!v;
      saveState(st);
      owned = loadOwned();
      state = st;
      emitChanged("mirrorball");
      return true;
    };

    WB.shop.isBedEnabled = () => !!loadState().bedEnabled;
    WB.shop.setBedEnabled = (v) => {
      const st = loadState();
      st.bedEnabled = !!v;
      saveState(st);
      owned = loadOwned();
      state = st;
      emitChanged("bed");
      return true;
    };

    WB.shop.open = () => openModal();
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

    // WB後追い（遅延ロードでも追いつく）
    const start = Date.now();
    const wbTimer = setInterval(() => {
      patchWB();
      if (Date.now() - start > 15000) clearInterval(wbTimer);
    }, 200);

    // ✅ グローバルAPI（ハンバーガーメニューから呼べる）
    window.SHOP = {
      open: () => openModal(),
      close: () => closeModal(),
      isOwned: (k) => !!loadOwned()?.[k],
      state: () => loadState(),
    };

    // ✅ #shopBtn が存在する時だけ、従来通り click で開く（互換）
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
      // いまは #shopBtn を消してる/隠してる構成でもOK（メニューから window.SHOP.open() で開く）
      console.warn("[shop.js] #shopBtn not found (menu-open only)");
    }

    // 初期通知
    owned = loadOwned();
    state = loadState();
    if (owned.mirrorball) emitChanged("mirrorball");
    if (owned.bed) emitChanged("bed");
  }

  boot().catch(() => {});
})();
