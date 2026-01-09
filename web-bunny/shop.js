// shop.js（非module）
// ✅ HUDの「ショップ」(#shopBtn) でモーダル（omukaeとは別）
// ✅ ミラーボール購入
// ✅ 「設置/外す」切替（外せる）
// ✅ 状態は milkpop_shop_state_v1 { mirrorballEnabled:boolean } に保存
// ✅ 切替/購入で WB.emit("bg:mirrorball_changed") → bgcolor.js 即反映
// ✅ FIX: captureでクリック伝播を止める（委譲クリック根絶）
// ✅ FIX: トグルが効かない(状態が保存されない/読めない)を根絶

(() => {
  "use strict";

  const LS_KEY_OWNED = "milkpop_shop_owned_v1";
  const LS_KEY_STATE = "milkpop_shop_state_v1";

  const ITEM = {
    key: "mirrorball",
    label: "ミラーボール",
    desc: "設置するとディスコ背景（スポットライト/ビーム/キラ粒）",
    price: 9000,
    img: "./assets/bg/mirrorball.png",
  };

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
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  let owned = loadJson(LS_KEY_OWNED, {});
  let state = loadJson(LS_KEY_STATE, { mirrorballEnabled: true });

  function isOwned(key) { return !!owned?.[key]; }

  function isMirrorballEnabled() {
    return (typeof state.mirrorballEnabled === "boolean") ? state.mirrorballEnabled : true;
  }

  function setMirrorballEnabled(v) {
    state.mirrorballEnabled = !!v;
    saveJson(LS_KEY_STATE, state);
    try { window.WB?.emit?.("bg:mirrorball_changed", { owned: isOwned(ITEM.key), enabled: state.mirrorballEnabled }); } catch {}
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

  function spendCoinsWB(amount) {
    const WB = window.WB;
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    if (!a) return true;

    try {
      if (WB && typeof WB.spendCoins === "function") return !!WB.spendCoins(a);
      if (WB && typeof WB.spendCoin === "function") return !!WB.spendCoin(a);

      const cur = getCoinsWB();
      if (cur < a) return false;

      // fallback
      if (WB && typeof WB.addCoin === "function") {
        WB.addCoin(-a);
        return true;
      }

      // DOM fallback
      const el = document.getElementById("coinValue");
      if (el) el.textContent = String(cur - a);
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
    <div class="sub">アイテムを購入・設置できます</div>
  </div>
  <button class="btn ghost" id="shopCloseModalV3" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag" id="shopCoinTagV3">🪙 0</div>
  <div class="tag" id="shopStateTagV3">未購入</div>
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
      <button class="btn" id="shopBuyBtnV3" type="button">購入</button>
      <button class="btn ghost" id="shopToggleBtnV3" type="button">設置</button>
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
    saveJson(LS_KEY_OWNED, owned);

    // 購入時はON
    setMirrorballEnabled(true);

    try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true, enabled: true }); } catch {}
    return { ok: true, reason: "bought" };
  }

  function toggleMirrorball() {
    if (!isOwned(ITEM.key)) return { ok: false, reason: "not_owned" };
    const next = !isMirrorballEnabled();
    setMirrorballEnabled(next);
    return { ok: true, enabled: next };
  }

  function refresh() {
    const modal = document.getElementById(UI.modal);
    if (!modal) return;

    // 最新を読み直してズレ根絶
    owned = loadJson(LS_KEY_OWNED, owned);
    state = loadJson(LS_KEY_STATE, state);

    const coinTag = $("#shopCoinTagV3", modal);
    const stateTag = $("#shopStateTagV3", modal);
    const buyBtn = $("#shopBuyBtnV3", modal);
    const toggleBtn = $("#shopToggleBtnV3", modal);

    const c = getCoinsWB();
    if (coinTag) coinTag.textContent = `🪙 ${c}`;

    const own = isOwned(ITEM.key);
    const enabled = isMirrorballEnabled();

    if (stateTag) stateTag.textContent = own ? (enabled ? "購入済み（設置中）" : "購入済み（外し中）") : "未購入";

    if (buyBtn) {
      buyBtn.disabled = own || (c < ITEM.price);
      buyBtn.textContent = own ? "OK" : "購入";
    }

    if (toggleBtn) {
      toggleBtn.disabled = !own;
      toggleBtn.textContent = enabled ? "外す" : "設置";
    }
  }

  function bindModalEvents() {
    const modal = document.getElementById(UI.modal);
    const backdrop = document.getElementById(UI.backdrop);
    if (!modal || !backdrop) return;

    const closeBtn = $("#shopCloseModalV3", modal);
    const buyBtn = $("#shopBuyBtnV3", modal);
    const toggleBtn = $("#shopToggleBtnV3", modal);

    closeBtn?.addEventListener("click", (e) => { e.stopPropagation(); closeModal(); });
    backdrop.addEventListener("click", closeModal);

    buyBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = buyMirrorball();
      if (!r.ok) {
        if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
        else toast("購入できませんでした");
      } else {
        toast(`✅ ${ITEM.label} 購入！ -${ITEM.price}🪙`);
      }
      refresh();
    });

    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = toggleMirrorball();
      if (!r.ok) toast("未購入です");
      else toast(r.enabled ? "🪩 設置した！" : "🧹 外した！");
      refresh();
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
    WB.shop.open = openModal;
    WB.shop.buyMirrorball = buyMirrorball;
    WB.shop.toggleMirrorball = toggleMirrorball;
    WB.shop.isMirrorballEnabled = () => isMirrorballEnabled();
    WB.shop.setMirrorballEnabled = (v) => setMirrorballEnabled(v);
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

    patchWB();
    const start = Date.now();
    const t = setInterval(() => {
      patchWB();
      if (Date.now() - start > 15000) clearInterval(t);
    }, 200);

    let shopBtn = null;
    try {
      shopBtn = await waitForElm(() => document.getElementById("shopBtn"), 12000);
    } catch {
      console.warn("[shop.js] #shopBtn not found");
      return;
    }

    // captureで委譲クリックより先に止める
    shopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      openModal();
    }, true);

    // 起動時に反映通知（bgcolorに確実に届く）
    try {
      window.WB?.emit?.("bg:mirrorball_changed", { owned: isOwned(ITEM.key), enabled: isMirrorballEnabled() });
    } catch {}
  })();
})();
