// shop.js（非module）
// ✅ HUDの「ショップ」(#shopBtn) で開く（omukaeとは別）
// ✅ ミラーボール購入 + 設置ON/OFF切替
// ✅ ベッド（haikei.js の /bg/bed.png）購入
// ✅ 購入状態: milkpop_shop_owned_v1 に保存（{ mirrorball:true, bed:true }）
// ✅ ミラーボールON/OFF: milkpop_shop_state_v1 に保存（{ mirrorballEnabled:true/false }）
// ✅ WB.shop.isMirrorballEnabled / setMirrorballEnabled / isOwned を公開
// ✅ 変更時 WB.emit(...) で bgcolor.js / haikei.js へ即通知
// ✅ クリック伝播をcaptureで止めて omukae 委譲を根絶

(() => {
  "use strict";

  const LS_KEY_OWNED = "milkpop_shop_owned_v1";   // { mirrorball:true, bed:true }
  const LS_KEY_STATE = "milkpop_shop_state_v1";   // { mirrorballEnabled:true/false }

  const ITEMS = [
    {
      key: "mirrorball",
      label: "ミラーボール",
      desc: "設置ONでスポットライトが出る",
      price: 9000,
      img: "./assets/bg/mirrorball.png",
      type: "toggle", // 設置ON/OFFあり
    },
    {
      key: "bed",
      label: "ベッド（背景）",
      desc: "購入すると背景に置ける（haikei.js）",
      price: 6000,
      img: "/bg/bed.png",
      type: "buyonly", // 買うだけ
    },
  ];

  const UI = {
    style: "milkpopShopStyleV3",
    backdrop: "milkpopShopBackdropV3",
    modal: "milkpopShopModalV3",
    toast: "milkpopShopToastV3",
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * storage
   * ========================= */
  function loadOwned() {
    try {
      const raw = localStorage.getItem(LS_KEY_OWNED);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : {};
    } catch { return {}; }
  }
  function saveOwned(o) { try { localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); } catch {} }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY_STATE);
      if (!raw) return { mirrorballEnabled: true };
      const j = JSON.parse(raw);
      return {
        mirrorballEnabled: (j && typeof j === "object" && "mirrorballEnabled" in j)
          ? !!j.mirrorballEnabled
          : true,
      };
    } catch {
      return { mirrorballEnabled: true };
    }
  }
  function saveState(s) { try { localStorage.setItem(LS_KEY_STATE, JSON.stringify(s)); } catch {} }

  let owned = loadOwned();
  let state = loadState();

  function isOwned(key) { return !!owned?.[key]; }
  function isMirrorballEnabled() { return !!state?.mirrorballEnabled; }

  function setMirrorballEnabled(next) {
    state.mirrorballEnabled = !!next;
    saveState(state);
    try { window.WB?.emit?.("bg:mirrorball_toggle", { enabled: !!next }); } catch {}
    try { window.WB?.emit?.("bg:mirrorball_changed", { owned: isOwned("mirrorball"), enabled: !!next }); } catch {}
    refresh();
    return true;
  }

  /* =========================
   * WB coin compat
   * ========================= */
  function getCoinsWB() {
    const WB = window.WB;
    try {
      if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
      if (WB && typeof WB.getCoins === "function") return Number(WB.getCoins()) || 0;
      if (WB && typeof WB.coins === "number") return Number(WB.coins) || 0;
      const el = document.getElementById("coinValue");
      if (el) return Number(el.textContent || "0") || 0;
    } catch {}
    return 0;
  }

  function setCoinsWB(next) {
    const WB = window.WB;
    const v = Math.max(0, Math.floor(Number(next) || 0));
    try {
      if (WB && typeof WB.setCoin === "function") { WB.setCoin(v); return true; }
      if (WB && typeof WB.setCoins === "function") { WB.setCoins(v); return true; }
      if (WB && typeof WB.coins === "number") WB.coins = v;
      const el = document.getElementById("coinValue");
      if (el) el.textContent = String(v);
      return true;
    } catch {}
    return false;
  }

  function spendCoinsWB(amount) {
    const WB = window.WB;
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    if (!a) return true;

    try {
      if (WB && typeof WB.spendCoins === "function") return !!WB.spendCoins(a);
      if (WB && typeof WB.spendCoin === "function") return !!WB.spendCoin(a);

      if (WB && typeof WB.addCoin === "function") {
        const cur = getCoinsWB();
        if (cur < a) return false;
        WB.addCoin(-a);
        const after = getCoinsWB();
        if (after === cur) setCoinsWB(cur - a);
        return true;
      }

      const cur = getCoinsWB();
      if (cur < a) return false;
      setCoinsWB(cur - a);
      return true;
    } catch {
      return false;
    }
  }

  /* =========================
   * toast
   * ========================= */
  function toast(msg) {
    try {
      let el = document.getElementById(UI.toast);
      if (!el) {
        el = document.createElement("div");
        el.id = UI.toast;
        el.style.cssText = `
position:fixed; left:50%; top:16px; transform:translateX(-50%);
z-index:2147483646;
background:rgba(0,0,0,.78); color:#fff;
padding:10px 12px; border-radius:14px;
font-weight:900; font-size:13px;
box-shadow:0 14px 40px rgba(0,0,0,.25);
pointer-events:none; opacity:0; transition:opacity .18s ease;
`;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1200);
    } catch {}
  }

  /* =========================
   * UI style
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
`;
    document.head.appendChild(st);
  }

  function buildItemHTML(item) {
    const kid = item.key;
    const buyId = `shopBuy_${kid}`;
    const togId = `shopTog_${kid}`;
    const ownedId = `shopOwned_${kid}`;
    return `
  <div class="item" data-item="${kid}">
    <div class="thumb"><img src="${item.img}" alt="${kid}"></div>
    <div style="min-width:0;">
      <div class="name">${item.label}</div>
      <div class="meta">${item.desc}</div>
      <div class="meta">価格：<b>${item.price}🪙</b></div>
    </div>
    <div class="right">
      <div class="tag" id="${ownedId}">未購入</div>
      <button class="btn" id="${buyId}" type="button">購入</button>
      ${
        item.type === "toggle"
          ? `<button class="btn ghost" id="${togId}" type="button">設置ON</button>`
          : ``
      }
    </div>
  </div>`;
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

      const itemsHtml = ITEMS.map(buildItemHTML).join("\n");

      modal.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">ショップ</div>
    <div class="sub">アイテムを購入 / 設置できます</div>
  </div>
  <button class="btn ghost" id="shopCloseModalV3" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag" id="shopCoinTagV3">🪙 0</div>
  <div class="tag" id="shopHintTagV3">ショップボタンで開く</div>
</div>

<div class="sep"></div>

<div class="grid">
${itemsHtml}
</div>
`;
      document.body.appendChild(modal);
    }

    return { backdrop, modal };
  }

  function openModal() {
    const { backdrop, modal } = ensureUI();
    backdrop.style.display = "block";
    modal.style.display = "block";
    refresh();
  }

  function closeModal() {
    const backdrop = document.getElementById(UI.backdrop);
    const modal = document.getElementById(UI.modal);
    if (backdrop) backdrop.style.display = "none";
    if (modal) modal.style.display = "none";
  }

  function buyItem(itemKey) {
    const item = ITEMS.find(x => x.key === itemKey);
    if (!item) return { ok: false, reason: "no_item" };
    if (isOwned(itemKey)) return { ok: true, reason: "already" };

    const cur = getCoinsWB();
    if (cur < item.price) return { ok: false, reason: "coins", have: cur, need: item.price };

    const ok = spendCoinsWB(item.price);
    if (!ok) return { ok: false, reason: "coins_api" };

    owned[itemKey] = true;
    saveOwned(owned);

    // ミラーボールは購入直後に設置ONにする（好み）
    if (itemKey === "mirrorball") {
      state.mirrorballEnabled = true;
      saveState(state);
      try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true, enabled: true }); } catch {}
      try { window.WB?.emit?.("bg:mirrorball_toggle",  { enabled: true }); } catch {}
    }

    // ベッド購入通知（haikei.jsへ）
    if (itemKey === "bed") {
      try { window.WB?.emit?.("haikei:changed", { key: "bed", owned: true }); } catch {}
      try { window.WB?.emit?.("shop:changed", { key: "bed", owned: true }); } catch {}
    }

    return { ok: true, reason: "bought", price: item.price, label: item.label };
  }

  function refresh() {
    const modal = document.getElementById(UI.modal);
    if (!modal) return;

    const coinTag  = $("#shopCoinTagV3", modal);
    const c = getCoinsWB();
    if (coinTag) coinTag.textContent = `🪙 ${c}`;

    for (const item of ITEMS) {
      const ownedTag = $(`#shopOwned_${item.key}`, modal);
      const buyBtn   = $(`#shopBuy_${item.key}`, modal);
      const togBtn   = $(`#shopTog_${item.key}`, modal);

      const own = isOwned(item.key);
      if (ownedTag) ownedTag.textContent = own ? "購入済み" : "未購入";

      if (buyBtn) {
        buyBtn.disabled = own || (c < item.price);
        buyBtn.textContent = own ? "OK" : "購入";
      }

      if (item.type === "toggle" && togBtn) {
        togBtn.disabled = !own;
        const en = isMirrorballEnabled();
        togBtn.textContent = en ? "設置ON" : "設置OFF";
        togBtn.style.opacity = own ? "1" : "0.55";
      }
    }
  }

  function bindModalEvents() {
    const modal = document.getElementById(UI.modal);
    const backdrop = document.getElementById(UI.backdrop);
    if (!modal || !backdrop) return;

    const closeBtn = $("#shopCloseModalV3", modal);
    closeBtn?.addEventListener("click", (e) => { e.stopPropagation(); closeModal(); });
    backdrop.addEventListener("click", closeModal);

    // 購入ボタン
    ITEMS.forEach(item => {
      const buyBtn = $(`#shopBuy_${item.key}`, modal);
      buyBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const r = buyItem(item.key);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        } else if (r.reason === "already") {
          toast("✅ すでに購入済み");
        } else {
          toast(`✅ ${r.label} 購入！ -${r.price}🪙`);
        }
        refresh();
      });

      // トグル（ミラーボールのみ）
      if (item.type === "toggle") {
        const togBtn = $(`#shopTog_${item.key}`, modal);
        togBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!isOwned(item.key)) return;
          const next = !isMirrorballEnabled();
          setMirrorballEnabled(next);
          toast(next ? "🪩 ミラーボール設置ON" : "🪩 ミラーボール設置OFF");
          refresh();
        });
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = document.getElementById(UI.modal);
      if (m && m.style.display === "block") closeModal();
    });

    setInterval(refresh, 500);
  }

  function patchWB() {
    const WB = window.WB;
    if (!WB || typeof WB !== "object") return;
    WB.shop = WB.shop || {};

    WB.shop.isOwned = (key) => isOwned(key);

    // mirrorball
    WB.shop.isMirrorballEnabled = () => isMirrorballEnabled();
    WB.shop.setMirrorballEnabled = (v) => setMirrorballEnabled(v);

    // UI / actions
    WB.shop.open = openModal;
    WB.shop.buy = (key) => buyItem(String(key || ""));
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

  (async function boot() {
    try { await waitForElm(() => document.body, 8000); } catch {}
    ensureUI();
    bindModalEvents();

    // WB公開（後から来ても拾う）
    patchWB();
    const start = Date.now();
    const t = setInterval(() => {
      patchWB();
      if (Date.now() - start > 15000) clearInterval(t);
    }, 200);

    // ✅ HUDの「ショップ」ボタンにのみ紐付ける
    let shopBtn = null;
    try {
      shopBtn = await waitForElm(() => document.getElementById("shopBtn"), 12000);
    } catch {
      console.warn("[shop.js] #shopBtn not found");
      return;
    }

    // ✅ omukae のイベント委譲に負けない：captureで先に止める
    shopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      openModal();
    }, true);

    // 初期反映通知
    if (isOwned("mirrorball")) {
      try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true, enabled: isMirrorballEnabled() }); } catch {}
      try { window.WB?.emit?.("bg:mirrorball_toggle",  { enabled: isMirrorballEnabled() }); } catch {}
    }
    if (isOwned("bed")) {
      try { window.WB?.emit?.("haikei:changed", { key: "bed", owned: true }); } catch {}
    }
  })();
})();
