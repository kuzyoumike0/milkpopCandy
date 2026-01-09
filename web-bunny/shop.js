// shop.js（非module）
// ✅ HUDの「お迎え」(#shopBtn) を押すとモーダル表示
// ✅ モーダルでミラーボール（assets/bg/mirrorball.png）を購入できる
// ✅ WB coin API 互換 + #coinValue fallback
// ✅ 購入後に WB.emit("bg:mirrorball_changed") で bgcolor.js 即反映

(() => {
  "use strict";

  const LS_KEY_OWNED = "milkpop_shop_owned_v1";

  const ITEM = {
    key: "mirrorball",
    label: "ミラーボール",
    desc: "背景が虹色にキラキラ（設置時のみ）",
    price: 9000, // 好きに調整OK
    img: "./assets/bg/mirrorball.png",
  };

  const UI = {
    style: "milkpopShopStyleV1",
    backdrop: "milkpopShopBackdropV1",
    modal: "milkpopShopModalV1",
    toast: "milkpopShopToastV1",
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
    } catch {
      return {};
    }
  }
  function saveOwned(o) { try { localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); } catch {} }

  let owned = loadOwned();
  function isOwned(key) { return !!owned?.[key]; }

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

#${UI.modal} .grid{
  display:grid;
  grid-template-columns: 1fr;
  gap:10px;
}
@media (min-width: 520px){
  #${UI.modal} .grid{ grid-template-columns: 1fr; }
}

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
      modal.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">ショップ</div>
    <div class="sub">アイテムを購入できます</div>
  </div>
  <button class="btn ghost" id="shopCloseModalV1" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag" id="shopCoinTagV1">🪙 0</div>
  <div class="tag" id="shopHintTagV1">お迎えボタンで開く</div>
</div>

<div class="sep"></div>

<div class="grid">
  <div class="item">
    <div class="thumb"><img src="${ITEM.img}" alt="mirrorball"></div>
    <div style="min-width:0;">
      <div class="name">${ITEM.label}</div>
      <div class="meta">${ITEM.desc}</div>
      <div class="meta">価格：<b>${ITEM.price}🪙</b></div>
    </div>
    <div class="right">
      <div class="tag" id="shopOwnedTagV1">未購入</div>
      <button class="btn" id="shopBuyBtnV1" type="button">購入</button>
    </div>
  </div>
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

  function buyMirrorball() {
    if (isOwned(ITEM.key)) return { ok: true, reason: "already" };
    const cur = getCoinsWB();
    if (cur < ITEM.price) return { ok: false, reason: "coins", have: cur, need: ITEM.price };

    const ok = spendCoinsWB(ITEM.price);
    if (!ok) return { ok: false, reason: "coins_api" };

    owned[ITEM.key] = true;
    saveOwned(owned);

    // ✅ 背景側へ即通知
    try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true }); } catch {}

    return { ok: true, reason: "bought" };
  }

  function refresh() {
    const modal = document.getElementById(UI.modal);
    if (!modal) return;

    const coinTag = $("#shopCoinTagV1", modal);
    const ownedTag = $("#shopOwnedTagV1", modal);
    const buyBtn = $("#shopBuyBtnV1", modal);

    const c = getCoinsWB();
    if (coinTag) coinTag.textContent = `🪙 ${c}`;

    const own = isOwned(ITEM.key);
    if (ownedTag) ownedTag.textContent = own ? "購入済み" : "未購入";
    if (buyBtn) {
      buyBtn.disabled = own || (c < ITEM.price);
      buyBtn.textContent = own ? "OK" : "購入";
    }
  }

  function bindModalEvents() {
    const modal = document.getElementById(UI.modal);
    const backdrop = document.getElementById(UI.backdrop);
    if (!modal || !backdrop) return;

    const closeBtn = $("#shopCloseModalV1", modal);
    const buyBtn = $("#shopBuyBtnV1", modal);

    closeBtn?.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);

    buyBtn?.addEventListener("click", () => {
      const r = buyMirrorball();
      if (!r.ok) {
        if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
        else toast("購入できませんでした");
      } else {
        toast(`✅ ${ITEM.label} 購入！ -${ITEM.price}🪙`);
      }
      refresh();
    });

    // ESCで閉じる
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (modal.style.display === "block") closeModal();
    });

    // 0.5秒ごとに更新（コインの変化に追従）
    setInterval(refresh, 500);
  }

  function patchWB() {
    const WB = window.WB;
    if (!WB || typeof WB !== "object") return;
    WB.shop = WB.shop || {};
    WB.shop.isOwned = (key) => isOwned(key);
    WB.shop.open = openModal;
    WB.shop.buyMirrorball = buyMirrorball;
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
    // UIを先に作れる状況なら作る
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

    // ✅ HUDの「お迎え」ボタンに紐付ける
    let shopBtn = null;
    try {
      shopBtn = await waitForElm(() => document.getElementById("shopBtn"), 12000);
    } catch {
      console.warn("[shop.js] #shopBtn not found");
      return;
    }

    shopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });

    // 初期反映（購入済みならbgcolorへ通知しておく）
    if (isOwned(ITEM.key)) {
      try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true }); } catch {}
    }
  })();
})();
