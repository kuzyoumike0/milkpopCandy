// isyou.js
// お洒落（衣装）システム：購入・装備・永続化・表示
// - HUDに「お洒落」ボタン追加
// - お洒落パネルで購入/装備
// - うさぎ（.bunnyWrap）に帽子画像（assets/isyou/partyhat.png）を重ねる
// - うさぎ増減に追従（MutationObserver）
// - クリック/旅立ちモードを邪魔しない（pointer-events:none）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * Config
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v1",   // string[]
    equip: "wb_isyou_equip_v1",   // string (equipped item id)
  };

  // お洒落アイテム定義（増やすならここに追加）
  const ITEMS = [
    {
      id: "partyhat",
      name: "パーティ帽",
      desc: "お祝い気分の定番帽子",
      price: 5000,
      type: "hat",
      src: "./assets/isyou/partyhat.png",
    },
  ];

  const WRAP_SEL = ".bunnyWrap";
  const HAT_CLASS = "wbHat";

  /* =========================
   * State (storage)
   * ========================= */
  const state = {
    owned: [],
    equip: "", // item id
  };

  function loadJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v ?? def;
    } catch {
      return def;
    }
  }
  function saveJson(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }
  function loadStr(key, def = "") {
    const v = localStorage.getItem(key);
    return v == null ? def : String(v);
  }
  function saveStr(key, v) {
    localStorage.setItem(key, String(v ?? ""));
  }

  function loadState() {
    const owned = loadJson(LS.owned, []);
    state.owned = Array.isArray(owned) ? owned : [];
    state.equip = loadStr(LS.equip, "");
  }
  function saveState() {
    saveJson(LS.owned, state.owned);
    saveStr(LS.equip, state.equip);
  }

  function isOwned(id) {
    return state.owned.includes(id);
  }
  function getEquipped() {
    return String(state.equip || "");
  }
  function setEquipped(id) {
    state.equip = String(id || "");
    saveState();
    refreshAllBunnies();
    WB.updateHud?.();
    refreshUI();
  }

  /* =========================
   * Coin helpers
   * ========================= */
  function getCoin() {
    try {
      if (WB && typeof WB.coins === "number") return WB.coins;
    } catch {}
    const el = document.getElementById("coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const nv = Math.max(0, Math.floor(v));
    try {
      WB.coins = nv;
      WB.saveCoins?.();
      WB.updateHud?.();
    } catch {}
    const el = document.getElementById("coinValue");
    if (el) el.textContent = String(nv);
  }

  /* =========================
   * Toast
   * ========================= */
  function ensureToastStyles() {
    if (document.getElementById("isyouToastStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouToastStyleV1";
    s.textContent = `
.isyouToast{
  position: fixed;
  left: 50%;
  top: 12%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(0,0,0,.78);
  color:#fff;
  border-radius: 16px;
  padding: 10px 14px;
  font-weight: 900;
  box-shadow: 0 18px 50px rgba(0,0,0,.26);
  max-width: min(92vw, 520px);
  text-align:center;
  opacity: 0;
  animation: isyouToastIn .18s ease-out forwards, isyouToastOut .28s ease-in forwards;
  animation-delay: 0ms, 1.3s;
}
@keyframes isyouToastIn{
  from { opacity:0; transform:translate(-50%,-80%); }
  to   { opacity:1; transform:translate(-50%,-50%); }
}
@keyframes isyouToastOut{
  from { opacity:1; transform:translate(-50%,-50%); }
  to   { opacity:0; transform:translate(-50%,-30%); }
}
`;
    document.head.appendChild(s);
  }
  function toast(msg) {
    ensureToastStyles();
    const t = String(msg ?? "").trim();
    if (!t) return;
    const el = document.createElement("div");
    el.className = "isyouToast";
    el.textContent = t;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 1800);
  }

  /* =========================
   * Hat display
   * ========================= */
  function injectHatStyles() {
    if (document.getElementById("isyouHatStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouHatStyleV1";
    s.textContent = `
${WRAP_SEL} .${HAT_CLASS}{
  position:absolute;
  left:50%;
  top:-10px;
  width:48px;
  height:48px;
  transform: translateX(-50%) rotate(-10deg);
  transform-origin: 50% 90%;
  pointer-events:none;
  user-select:none;
  z-index: 10;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.20));
}
`;
    document.head.appendChild(s);
  }

  function ensureHat(wrap) {
    if (!wrap || !wrap.matches?.(WRAP_SEL)) return;

    // 装備中が partyhat で、かつ所持しているときだけ表示
    const eq = getEquipped();
    const ok = (eq === "partyhat") && isOwned("partyhat");

    const existing = wrap.querySelector(`.${HAT_CLASS}`);
    if (!ok) {
      if (existing) {
        try { existing.remove(); } catch {}
      }
      return;
    }

    if (existing) return;

    const img = document.createElement("img");
    img.className = HAT_CLASS;
    img.src = "./assets/isyou/partyhat.png";
    img.alt = "hat";
    img.decoding = "async";
    img.loading = "eager";
    wrap.appendChild(img);
  }

  function refreshAllBunnies() {
    document.querySelectorAll(WRAP_SEL).forEach(ensureHat);
  }

  function observeBunnies() {
    const layer = document.getElementById("bunnyLayer") || document.getElementById("field") || document.body;
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes?.forEach?.((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.matches?.(WRAP_SEL)) ensureHat(n);
          n.querySelectorAll?.(WRAP_SEL).forEach(ensureHat);
        });
      }
    });
    mo.observe(layer, { childList: true, subtree: true });
  }

  /* =========================
   * UI (お洒落パネル)
   * ========================= */
  let uiEl = null;

  function injectUIStyles() {
    if (document.getElementById("isyouUiStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouUiStyleV1";
    s.textContent = `
#isyouPanel{
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: none;
  user-select: none;
}
#isyouPanel .bg{
  position:absolute; inset:0;
  background: rgba(0,0,0,.38);
}
#isyouPanel .card{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%, -50%);
  width: min(680px, 92vw);
  max-height: min(78vh, 760px);
  overflow: hidden;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,.24);
  display:flex;
  flex-direction: column;
}
#isyouPanel .head{
  display:flex; align-items:center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(0,0,0,.08);
}
#isyouPanel .title{
  font-weight: 1000;
  letter-spacing: .02em;
}
#isyouPanel .close{
  border:none; background: rgba(0,0,0,.06);
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 900;
  cursor:pointer;
}
#isyouPanel .body{
  padding: 12px 14px;
  overflow:auto;
}
#isyouPanel .pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  background: rgba(0,0,0,.04);
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 900;
}
#isyouPanel .grid{
  margin-top: 12px;
  display:grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 12px;
}
@media (max-width: 520px){
  #isyouPanel .grid{ grid-template-columns: 1fr; }
}
#isyouPanel .item{
  background: rgba(255,255,255,.92);
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  display:flex;
  gap: 12px;
  align-items: center;
}
#isyouPanel .thumb{
  width: 64px;
  height: 64px;
  border-radius: 14px;
  background: rgba(0,0,0,.04);
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  flex: 0 0 auto;
}
#isyouPanel .thumb img{
  width: 78%;
  height: 78%;
  object-fit: contain;
  display:block;
}
#isyouPanel .info{
  display:flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}
#isyouPanel .name{ font-weight: 1000; }
#isyouPanel .desc{ opacity:.78; font-weight: 800; font-size: 12px; }
#isyouPanel .meta{ opacity:.78; font-weight: 900; font-size: 12px; }
#isyouPanel .actions{
  display:flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}
#isyouPanel .btn{
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
  min-width: 110px;
}
#isyouPanel .btn.primary{ background:#ffd6e7; }
#isyouPanel .btn.danger{ background: rgba(255,80,80,.12); }
#isyouPanel .badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 900;
  font-size: 12px;
}
#isyouPanel .badge.on{ background: rgba(120, 210, 255, .22); }
`;
    document.head.appendChild(s);
  }

  function buildUI() {
    injectUIStyles();
    if (uiEl && document.body.contains(uiEl)) return uiEl;

    uiEl = document.createElement("div");
    uiEl.id = "isyouPanel";
    uiEl.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">✨ お洒落</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(uiEl);

    uiEl.querySelector(".bg")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closePanel();
    });
    uiEl.querySelector(".close")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closePanel();
    });
    uiEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return uiEl;
  }

  function renderUI() {
    const p = buildUI();
    const body = p.querySelector(".body");
    if (!body) return;

    const coin = getCoin();
    const eq = getEquipped();

    const html = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div class="pill">所持：<b>${coin}</b> 🪙</div>
        <div class="pill">装備中：<b>${eq ? eq : "（なし）"}</b></div>
        <button class="btn danger" type="button" data-unequip="1">装備解除</button>
      </div>

      <div class="grid">
        ${ITEMS.map((it) => {
          const owned = isOwned(it.id);
          const isOn = eq === it.id && owned;
          const price = it.price | 0;

          return `
            <div class="item" data-item="${it.id}">
              <div class="thumb"><img src="${it.src}" alt=""></div>
              <div class="info">
                <div class="name">${escapeHtml(it.name)}</div>
                <div class="desc">${escapeHtml(it.desc)}</div>
                <div class="meta">価格：${price} 🪙</div>
                <div>
                  <span class="badge ${owned ? "on" : ""}">${owned ? "所持" : "未所持"}</span>
                  <span class="badge ${isOn ? "on" : ""}">${isOn ? "装備中" : "未装備"}</span>
                </div>
              </div>
              <div class="actions">
                ${
                  owned
                    ? `<button class="btn primary" type="button" data-equip="${it.id}">${isOn ? "装備中" : "装備"}</button>`
                    : `<button class="btn primary" type="button" data-buy="${it.id}">購入</button>`
                }
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    body.innerHTML = html;

    body.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = btn.getAttribute("data-buy");
        buyItem(id);
      });
    });

    body.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = btn.getAttribute("data-equip");
        equipItem(id);
      });
    });

    body.querySelectorAll("[data-unequip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        setEquipped("");
        toast("装備を解除しました");
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openPanel() {
    buildUI();
    renderUI();
    uiEl.style.display = "block";
  }
  function closePanel() {
    if (!uiEl) return;
    uiEl.style.display = "none";
  }
  function refreshUI() {
    if (uiEl && uiEl.style.display !== "none") renderUI();
  }

  /* =========================
   * Purchase / Equip
   * ========================= */
  function getItem(id) {
    return ITEMS.find((x) => x.id === id) || null;
  }

  function buyItem(id) {
    const it = getItem(id);
    if (!it) return;

    if (isOwned(it.id)) {
      toast("すでに所持しています");
      return;
    }

    const coin = getCoin();
    if (coin < it.price) {
      toast(`コイン不足（必要：${it.price}🪙）`);
      return;
    }

    // 支払い
    setCoin(coin - it.price);

    // 所持化
    state.owned.push(it.id);
    saveState();

    toast(`購入しました：${it.name}`);
    // 購入したら自動装備
    setEquipped(it.id);
  }

  function equipItem(id) {
    const it = getItem(id);
    if (!it) return;
    if (!isOwned(it.id)) {
      toast("未所持です（購入してください）");
      return;
    }
    setEquipped(it.id);
    toast(`装備しました：${it.name}`);
  }

  /* =========================
   * HUD button
   * ========================= */
  function injectHudButton() {
    const hudButtons = document.getElementById("hudButtons") || document.getElementById("hud");
    if (!hudButtons) return;

    if (document.getElementById("isyouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.type = "button";
    btn.textContent = "お洒落";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      WB.unlockAudioOnce?.();
      openPanel();
    });

    // できれば「図鑑/称号」の近くに差し込み
    const rankBtn = document.getElementById("rankBtn");
    if (rankBtn && rankBtn.parentElement === hudButtons) {
      hudButtons.insertBefore(btn, rankBtn.nextSibling);
    } else {
      hudButtons.appendChild(btn);
    }
  }

  /* =========================
   * Boot
   * ========================= */
  loadState();
  injectHatStyles();

  window.addEventListener("load", () => {
    injectHudButton();
    refreshAllBunnies();
    observeBunnies();
  });

  /* =========================
   * Public
   * ========================= */
  window.ISYOU = {
    openPanel,
    closePanel,
    buyItem,
    equipItem,
    getEquipped,
    isOwned,
  };
})();
