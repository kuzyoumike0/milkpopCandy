// shop.js（非module）
// ✅ ミラーボール（assets/bg/mirrorball.png）をショップで購入できるようにする
// ✅ 購入後だけ bgcolor.js が表示する（bgcolor.js側も対応が必要）
// ✅ WBのコインAPI互換 / coinValue fallback / UIは必ず出る

(() => {
  "use strict";

  const LS_KEY_OWNED = "milkpop_shop_owned_v1";

  const ITEM = {
    key: "mirrorball",
    label: "ミラーボール",
    desc: "背景の上中央にミラーボールが出る（購入後のみ）",
    price: 9000, // 好きに調整OK
    img: "./assets/bg/mirrorball.png",
  };

  const UI = {
    btn: "shopHamburgerV1",
    panel: "shopPanelV1",
    toast: "shopToastV1",
    style: "shopStyleV1",
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
   * shop logic
   * ========================= */
  function buyMirrorball() {
    if (isOwned(ITEM.key)) return { ok: true, reason: "already" };

    const cur = getCoinsWB();
    if (cur < ITEM.price) return { ok: false, reason: "coins", have: cur, need: ITEM.price };

    const ok = spendCoinsWB(ITEM.price);
    if (!ok) return { ok: false, reason: "coins_api" };

    owned[ITEM.key] = true;
    saveOwned(owned);

    // ✅ bgcolor.js に即反映させる（WBがある場合）
    try { window.WB?.emit?.("bg:mirrorball_changed", { owned: true }); } catch {}

    return { ok: true, reason: "bought" };
  }

  /* =========================
   * UI
   * ========================= */
  function waitForBody(timeoutMs = 8000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (document.body) { clearInterval(t); resolve(); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error("body wait timeout")); }
      }, 30);
    });
  }

  function mountUI() {
    // 既にあればOK
    if (document.getElementById(UI.btn) && document.getElementById(UI.panel)) return;

    // style
    if (!document.getElementById(UI.style)) {
      const st = document.createElement("style");
      st.id = UI.style;
      st.textContent = `
#${UI.btn}{
  position:fixed;
  top:10px; left:10px;
  width:44px; height:44px;
  border:none; border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  z-index:2147483000;
  display:flex; align-items:center; justify-content:center;
  font-size:20px; font-weight:900;
}
#${UI.panel}{
  position:fixed;
  top:62px; left:10px;
  width:min(360px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px 12px 10px;
  z-index:2147483001;
  display:none;
}
#${UI.panel} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#${UI.panel} .ttl{ font-weight:900; }
#${UI.panel} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.panel} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }
#${UI.panel} .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.panel} .item{
  display:flex; align-items:center; gap:10px;
  padding:10px; border-radius:14px;
  background:rgba(0,0,0,.03);
}
#${UI.panel} .thumb{
  width:64px; height:64px; flex:0 0 auto;
  border-radius:12px;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
  display:flex; align-items:center; justify-content:center;
  overflow:hidden;
}
#${UI.panel} .thumb img{ width:100%; height:100%; object-fit:contain; }
#${UI.panel} .name{ font-weight:900; }
#${UI.panel} .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.panel} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  background:#ffd6e7;
}
#${UI.panel} .btn[disabled]{ opacity:.55; cursor:not-allowed; }
#${UI.panel} .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
`;
      document.head.appendChild(st);
    }

    const btn = document.createElement("button");
    btn.id = UI.btn;
    btn.type = "button";
    btn.textContent = "🛍";
    btn.title = "ショップ";

    const panel = document.createElement("div");
    panel.id = UI.panel;
    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">ショップ</div>
    <div class="sub">背景アイテムを購入</div>
  </div>
  <button class="btn ghost" id="shopCloseV1" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <div class="tag" id="shopCoinTagV1">🪙 0</div>
  <div class="tag" id="shopOwnedTagV1">未購入</div>
</div>

<div class="sep"></div>

<div class="item">
  <div class="thumb"><img src="${ITEM.img}" alt="mirrorball"></div>
  <div style="flex:1 1 auto;">
    <div class="name">${ITEM.label}</div>
    <div class="meta">${ITEM.desc}</div>
    <div class="meta">価格：${ITEM.price}🪙</div>
  </div>
  <div style="display:flex; flex-direction:column; gap:8px;">
    <button class="btn" id="shopBuyMirrorballV1" type="button">購入</button>
  </div>
</div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const close = $("#shopCloseV1", panel);
    const coinTag = $("#shopCoinTagV1", panel);
    const ownedTag = $("#shopOwnedTagV1", panel);
    const buyBtn = $("#shopBuyMirrorballV1", panel);

    function refresh() {
      const c = getCoinsWB();
      coinTag.textContent = `🪙 ${c}`;

      const own = isOwned(ITEM.key);
      ownedTag.textContent = own ? "購入済み" : "未購入";
      buyBtn.disabled = own || (c < ITEM.price);
      buyBtn.textContent = own ? "OK" : "購入";
    }

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      refresh();
    });
    close.addEventListener("click", () => { panel.style.display = "none"; });

    buyBtn.addEventListener("click", () => {
      const r = buyMirrorball();
      if (!r.ok) {
        if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
        else toast("購入できませんでした");
      } else {
        toast(`✅ ${ITEM.label} 購入！ -${ITEM.price}🪙`);
      }
      refresh();
    });

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.style.display = "none";
    });

    setInterval(refresh, 500);
    refresh();
  }

  /* =========================
   * WB公開（bgcolor.js側が確認できるように）
   * ========================= */
  function patchWB() {
    const WB = window.WB;
    if (!WB || typeof WB !== "object") return;
    WB.shop = WB.shop || {};
    WB.shop.isOwned = (key) => isOwned(key);
    WB.shop.buyMirrorball = () => buyMirrorball();
    WB.shop.getCoins = () => getCoinsWB();
  }

  (async function boot() {
    patchWB();
    // 読み込み順対策（WBが後から来ても拾う）
    const start = Date.now();
    const t = setInterval(() => {
      patchWB();
      if (Date.now() - start > 15000) clearInterval(t);
    }, 200);

    try { await waitForBody(); } catch {}
    mountUI();
  })();
})();
