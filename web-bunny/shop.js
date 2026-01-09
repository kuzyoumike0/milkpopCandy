// shop.js（背景ショップ専用・非module）
// - HUDに「背景」ボタン（#bgShopBtn）を追加
// - ミラーボール / ベッド を購入
// - 設置 ON / OFF 切替
// - 状態保存：milkpop_shop_owned_v1 / milkpop_shop_state_v1
// - bgcolor.js / haikei.js へ即通知
// - omukae (#shopBtn) とは完全分離

(() => {
  "use strict";

  const LS_OWNED = "milkpop_shop_owned_v1"; // { mirrorball:true, bed:true }
  const LS_STATE = "milkpop_shop_state_v1"; // { mirrorballEnabled:true, bedEnabled:true }

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
      img: "/assets/bg/bed.png",
    },
  };

  const UI = {
    style: "bgShopStyle",
    backdrop: "bgShopBackdrop",
    modal: "bgShopModal",
    btn: "bgShopBtn",
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Storage
   * ========================= */
  function loadOwned() {
    try { return JSON.parse(localStorage.getItem(LS_OWNED)) || {}; }
    catch { return {}; }
  }
  function saveOwned(o) {
    try { localStorage.setItem(LS_OWNED, JSON.stringify(o)); } catch {}
  }
  function loadState() {
    try {
      const j = JSON.parse(localStorage.getItem(LS_STATE)) || {};
      return {
        mirrorballEnabled: j.mirrorballEnabled !== false,
        bedEnabled: j.bedEnabled !== false,
      };
    } catch {
      return { mirrorballEnabled:true, bedEnabled:true };
    }
  }
  function saveState(s) {
    try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch {}
  }

  let owned = loadOwned();
  let state = loadState();

  /* =========================
   * WB coin helpers
   * ========================= */
  function getCoins() {
    const WB = window.WB;
    if (WB?.getCoin) return WB.getCoin();
    if (typeof WB?.coins === "number") return WB.coins;
    const el = document.getElementById("coinValue");
    return el ? Number(el.textContent || 0) : 0;
  }

  function spendCoins(n) {
    const WB = window.WB;
    if (WB?.spendCoin) return WB.spendCoin(n);
    if (typeof WB?.coins === "number" && WB.coins >= n) {
      WB.coins -= n;
      WB.updateHud?.();
      return true;
    }
    return false;
  }

  /* =========================
   * UI
   * ========================= */
  function injectStyle() {
    if (document.getElementById(UI.style)) return;
    const st = document.createElement("style");
    st.id = UI.style;
    st.textContent = `
#${UI.backdrop}{
  position:fixed; inset:0; background:rgba(0,0,0,.35);
  z-index:999999; display:none;
}
#${UI.modal}{
  position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(520px,92vw);
  background:#fff;
  border-radius:18px;
  padding:14px;
}
.bgItem{
  display:flex; gap:12px;
  padding:10px;
  border-radius:14px;
  background:rgba(0,0,0,.05);
  margin-bottom:10px;
}
.bgItem img{
  width:72px; height:72px;
  object-fit:contain;
}
.bgItem .right{
  margin-left:auto;
  display:flex; flex-direction:column; gap:6px;
}
.bgItem button{
  border:0; border-radius:10px;
  padding:6px 10px;
  cursor:pointer;
}
`;
    document.head.appendChild(st);
  }

  function ensureButton() {
    const hud = document.getElementById("hudButtons");
    if (!hud) return null;
    let btn = document.getElementById(UI.btn);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = UI.btn;
      btn.textContent = "背景";
      hud.appendChild(btn);
    }
    return btn;
  }

  function openModal() {
    injectStyle();

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
      backdrop.appendChild(modal);
    }

    modal.innerHTML = `
<h3>背景ショップ</h3>
${Object.values(ITEMS).map(it => {
  const own = !!owned[it.key];
  const en  = state[it.key + "Enabled"] !== false;
  return `
  <div class="bgItem">
    <img src="${it.img}">
    <div>
      <b>${it.label}</b><br>
      <small>${it.desc}</small><br>
      <b>${it.price}🪙</b>
    </div>
    <div class="right">
      <button data-buy="${it.key}" ${own?"disabled":""}>
        ${own?"購入済み":"購入"}
      </button>
      <button data-toggle="${it.key}" ${own?"":"disabled"}>
        ${en?"設置ON":"設置OFF"}
      </button>
    </div>
  </div>`;
}).join("")}
<button id="bgShopClose">閉じる</button>
`;

    backdrop.style.display = "block";

    modal.querySelector("#bgShopClose").onclick = closeModal;

    modal.querySelectorAll("[data-buy]").forEach(b=>{
      b.onclick = () => buy(b.dataset.buy);
    });
    modal.querySelectorAll("[data-toggle]").forEach(b=>{
      b.onclick = () => toggle(b.dataset.toggle);
    });
  }

  function closeModal() {
    const bd = document.getElementById(UI.backdrop);
    if (bd) bd.style.display = "none";
  }

  function buy(key) {
    const it = ITEMS[key];
    if (!it || owned[key]) return;
    if (getCoins() < it.price) return alert("🪙 足りません");
    if (!spendCoins(it.price)) return;

    owned[key] = true;
    saveOwned(owned);

    state[key + "Enabled"] = true;
    saveState(state);

    notify(key);
    openModal();
  }

  function toggle(key) {
    state[key + "Enabled"] = !state[key + "Enabled"];
    saveState(state);
    notify(key);
    openModal();
  }

  function notify(key) {
    try {
      window.WB?.emit?.("shop:changed", { key, owned: owned[key], enabled: state[key+"Enabled"] });
      if (key === "mirrorball") {
        window.WB?.emit?.("bg:mirrorball_toggle", { enabled: state.mirrorballEnabled });
      }
      if (key === "bed") {
        window.WB?.emit?.("bg:bed_toggle", { enabled: state.bedEnabled });
      }
    } catch {}
  }

  /* =========================
   * Boot
   * ========================= */
  const boot = setInterval(() => {
    const btn = ensureButton();
    if (!btn) return;
    clearInterval(boot);

    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      openModal();
    }, true);
  }, 100);
})();
