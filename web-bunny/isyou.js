// isyou.js — お洒落（ショップ＋着せ替え＋赤枠選択＋決定式で外す＋flipズレ対策＋fitToBunny強化）完全版
// ✅ #hud待機して「お洒落ボタン」が必ず出る
// ✅ 購入→所持保存
// ✅ 装着は「装着モード」→ うさぎクリックで赤枠選択 → 決定で反映（外すも同じ）
// ✅ モーダル内クリックは装着判定しない（選択ボタンが押せる）
// ✅ 装着モード中は backdrop がクリックを通す（うさぎをクリックできる）
// ✅ 赤枠は選択中だけz-indexを上げる
// ✅ FIX：fitToBunnyを offset 系で計算（transform/flipでもズレにくい）
// ✅ NEW：ResizeObserver / MutationObserver で「うさぎ画像と完全一致」へ追従
// ✅ NEW：flip時にアクセだけ反転相殺（アクセ見た目がズレない）
// ✅ 重要：hat は「置き換え」（同時に1つだけ）
// ✅ 称号カウント：購入時に SYOUGOU.add("omukae",1) を安全に叩く（無ければリトライ）

(() => {
  "use strict";

  /* =========================
   * Wait for HUD / WB
   * ========================= */
  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitFor(getter, timeoutMs = WAIT_MS) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        let v = null;
        try { v = getter(); } catch {}
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error("waitFor timeout")); }
      }, TICK_MS);
    });
  }

  /* =========================
   * Safe SYOUGOU.add (retry)
   * ========================= */
  const __syQueue = [];
  let __syRetryTimer = null;

  function syAdd(key, n = 1) {
    try {
      if (window.SYOUGOU?.add) return window.SYOUGOU.add(key, n);
    } catch {}
    __syQueue.push([key, n]);

    if (!__syRetryTimer) {
      let tries = 0;
      __syRetryTimer = setInterval(() => {
        tries++;
        if (window.SYOUGOU?.add) {
          try {
            while (__syQueue.length) {
              const [k, a] = __syQueue.shift();
              try { window.SYOUGOU.add(k, a); } catch {}
            }
          } finally {
            clearInterval(__syRetryTimer);
            __syRetryTimer = null;
          }
          return;
        }
        if (tries >= 40) {
          clearInterval(__syRetryTimer);
          __syRetryTimer = null;
        }
      }, 200);
    }
  }

  /* =========================
   * Config
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v3",        // { itemKey:number }
    equipped: "wb_isyou_equipped_v3",  // { bornAt: { slotKey: itemKey } }
  };

  // slot: "hat" は置き換え
  const ITEMS = {
    partyhat: { slot: "hat", label: "パーティーハット", img: "./assets/isyou/partyhat.png", price: 500 },
    crown:    { slot: "hat", label: "クラウン",         img: "./assets/isyou/crown.png",    price: 900 },
    ribbon:   { slot: "hat", label: "リボン",           img: "./assets/isyou/ribbon.png",   price: 700 },
    aimasuku: { slot: "hat", label: "アイマスク",       img: "./assets/isyou/aimasuku.png", price: 400 },
    ahiru:    { slot: "hat", label: "あひる",           img: "./assets/isyou/ahiru.png",    price: 450 },
  };

  // ★完全一致：うさぎ画像とアクセ矩形を一致させる
  // matchBunny:true の slot は「うさぎimgの left/top/width/height = アクセ」になる
  const ANCHOR = {
    hat: { matchBunny: true },
  };

  /* =========================
   * State
   * ========================= */
  const state = {
    owned: {},
    equipped: {},

    mode: "browse",         // "browse" | "equip"
    selectedItem: null,     // itemKey
    pendingAction: "equip", // "equip" | "remove"

    selectedWrap: null,     // .bunnyWrap
    selectedBornAt: null,
    removeSlot: null,
  };

  let WB = null;

  /* =========================
   * Storage
   * ========================= */
  function loadJson(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? def; }
    catch { return def; }
  }
  function saveJson(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  function loadAll() {
    state.owned = loadJson(LS.owned, {});
    if (!state.owned || typeof state.owned !== "object") state.owned = {};
    state.equipped = loadJson(LS.equipped, {});
    if (!state.equipped || typeof state.equipped !== "object") state.equipped = {};
  }
  function saveAll() {
    saveJson(LS.owned, state.owned);
    saveJson(LS.equipped, state.equipped);
  }

  /* =========================
   * WB helpers
   * ========================= */
  function getCoins() {
    try {
      if (WB?.getCoin) return WB.getCoin();
      if (typeof WB?.coins === "number") return WB.coins;
    } catch {}
    const el = document.getElementById("coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }

  function setCoins(v) {
    const nv = Math.max(0, Math.floor(v));
    try {
      if (WB) {
        if (typeof WB.coins === "number") WB.coins = nv;
        WB.saveCoins?.();
        WB.updateHud?.();
      }
    } catch {}
    const el = document.getElementById("coinValue");
    if (el) el.textContent = String(nv);
  }

  function spendCoins(amount) {
    const have = getCoins();
    if (have < amount) return false;
    setCoins(have - amount);
    return true;
  }

  function getBunnies() {
    try {
      if (WB?.getBunnies) return WB.getBunnies();
      if (Array.isArray(WB?.bunnies)) return WB.bunnies;
    } catch {}
    return [];
  }

  function getBornAtFromWrap(wrap) {
    const list = getBunnies();
    const b = list.find((x) => x?.wrap === wrap);
    return b?.bornAt ?? null;
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV10")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleV10";
    s.textContent = `
/* === modal === */
#isyouBackdrop{
  position: fixed; inset:0;
  background: rgba(0,0,0,.36);
  z-index: 2147483000;
  display:none;
}
#isyouModal{
  position:absolute; left:50%; top:50%;
  transform: translate(-50%, -50%);
  width: min(860px, 94vw);
  max-height: min(84vh, 820px);
  overflow:hidden;
  border-radius: 18px;
  background: rgba(255,255,255,.97);
  box-shadow: 0 24px 70px rgba(0,0,0,.28);
  display:flex; flex-direction: column;
}
#isyouModal .head{
  display:flex; align-items:center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0,0,0,.08);
}
#isyouModal .ttl{ font-weight: 1000; letter-spacing: .02em; }
#isyouModal .close{
  border:none; background: rgba(0,0,0,.06);
  border-radius: 12px; padding: 8px 12px;
  font-weight: 900; cursor:pointer;
}
#isyouModal .body{ padding: 12px 14px; overflow:auto; }
#isyouModal .row{ display:flex; gap:10px; flex-wrap: wrap; align-items:center; justify-content: space-between; }
#isyouModal .pill{
  display:inline-flex; align-items:center; gap:8px;
  background: rgba(255,255,255,.92);
  border-radius: 999px; padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  font-weight: 900;
}
#isyouModal .mini{ font-size: 12px; opacity: .78; font-weight: 900; }
#isyouModal .grid{
  margin-top: 12px;
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}
#isyouModal .card{
  display:flex; gap:10px; align-items:flex-start;
  padding: 10px;
  border-radius: 14px;
  background: rgba(0,0,0,.03);
  border: 1px solid rgba(0,0,0,.06);
}
#isyouModal .thumb{
  width:64px; height:64px; object-fit:contain;
  background: rgba(255,255,255,.85);
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 12px;
  padding: 6px;
  flex: 0 0 64px;
}
#isyouModal .info{ flex:1; min-width:0; display:flex; flex-direction: column; gap:4px; }
#isyouModal .name{ font-weight:1000; line-height:1.2; }
#isyouModal .price{ font-weight:1000; }
#isyouModal .price.bad{ color: #b00020; }
#isyouModal .btn{
  border:none; border-radius: 12px;
  padding: 9px 12px; font-weight: 1000; cursor:pointer;
  background:#fff; box-shadow: 0 10px 22px rgba(0,0,0,.10);
}
#isyouModal .btn.primary{ background:#ffd6e7; }
#isyouModal .btn.danger{ background: rgba(255,80,80,.12); }
#isyouModal .btn[disabled]{ opacity:.55; cursor:not-allowed; box-shadow:none; }
#isyouModal .badge{
  display:inline-flex; align-items:center; gap:6px;
  border-radius:999px; padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 1000; font-size:12px;
}
#isyouModal .badge.lock{ background: rgba(255,120,120,.18); }

/* === equip confirm bar === */
#isyouConfirmBar{
  position: fixed;
  left: 50%;
  top: 12%;
  transform: translate(-50%, -50%);
  z-index: 2147483600;
  display:none;
  background: rgba(255,255,255,.96);
  border-radius: 16px;
  padding: 10px 12px;
  box-shadow: 0 18px 55px rgba(0,0,0,.22);
  font-weight: 1000;
}
#isyouConfirmBar .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
#isyouConfirmBar .t{ opacity:.82; font-weight: 1000; }
#isyouConfirmBar button{
  border:none; border-radius: 12px;
  padding: 8px 12px;
  font-weight: 1000;
  cursor:pointer;
  background:#fff;
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
}
#isyouConfirmBar button.primary{ background:#ffd6e7; }
#isyouConfirmBar button.danger{ background: rgba(255,80,80,.12); }
#isyouConfirmBar button:disabled{ opacity:.55; cursor:not-allowed; box-shadow:none; }

/* === selection red outline (only in equip mode) === */
body.isyouEquipMode .bunnyWrap{ outline: none; }
body.isyouEquipMode .bunnyWrap.isyouSelected{
  outline: 4px solid rgba(255, 64, 64, .88);
  outline-offset: 3px;
  border-radius: 18px;
  z-index: 2147482000;
}

/* === accessory layer === */
.bunnyWrap{ position: relative; }
.bunnyWrap .isyouAcc{
  position:absolute;
  left:0; top:0; right:0; bottom:0;
  pointer-events:none;
  z-index: 5;
  contain: layout paint;
}
.bunnyWrap .isyouAcc [data-slot]{
  position:absolute;
  left:0; top:0;
  pointer-events:none;
  transform-origin: 50% 50%;
  will-change: transform;
}
.bunnyWrap .isyouAcc img{
  display:block;
  width:100%;
  height:100%;
  object-fit: contain;
  pointer-events:none;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Toast
   * ========================= */
  function toast(text) {
    const t = String(text ?? "").trim();
    if (!t) return;
    const el = document.createElement("div");
    el.style.cssText = `
      position:fixed; left:50%; top:14%;
      transform:translate(-50%,-50%);
      z-index:2147483647;
      background: rgba(255,255,255,.96);
      border-radius: 16px;
      padding: 12px 16px;
      font-weight: 1000;
      box-shadow: 0 16px 40px rgba(0,0,0,.18);
      opacity: 0;
      animation: isyouIn .22s ease-out forwards, isyouOut .36s ease-in forwards;
      animation-delay: 0ms, 2.3s;
      white-space: nowrap;
    `;
    const stId = "isyouToastKeyframes";
    if (!document.getElementById(stId)) {
      const s = document.createElement("style");
      s.id = stId;
      s.textContent = `
@keyframes isyouIn{ from{opacity:0; transform:translate(-50%,-70%);} to{opacity:1; transform:translate(-50%,-50%);} }
@keyframes isyouOut{ from{opacity:1; transform:translate(-50%,-50%);} to{opacity:0; transform:translate(-50%,-35%);} }
`;
      document.head.appendChild(s);
    }
    el.textContent = t;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 3200);
  }

  /* =========================
   * Modal
   * ========================= */
  let backdrop = null;
  let modal = null;

  function ensureModal() {
    injectStyles();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "isyouBackdrop";
      document.body.appendChild(backdrop);
    }
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "isyouModal";
      backdrop.appendChild(modal);
    }

    backdrop.onclick = (e) => {
      if (state.mode === "equip") { e.stopPropagation(); return; }
      if (e.target === backdrop) closeModal();
    };
  }

  function openModal() {
    ensureModal();
    renderModal();
    backdrop.style.display = "block";
  }

  function closeModal() {
    if (!backdrop) return;
    backdrop.style.display = "none";
  }

  function ownedCount(itemKey) {
    return Number(state.owned?.[itemKey] || 0);
  }

  function buy(itemKey) {
    const it = ITEMS[itemKey];
    if (!it) return false;
    if (!spendCoins(it.price)) { toast("コインが足りない…！"); return false; }

    state.owned[itemKey] = ownedCount(itemKey) + 1;
    saveAll();
    syAdd("omukae", 1);
    toast(`🛍️ 購入：${it.label}`);
    renderModal();
    return true;
  }

  function setEquipItem(itemKey) {
    state.selectedItem = itemKey;
    state.pendingAction = "equip";
    state.mode = "equip";
    document.body.classList.add("isyouEquipMode");
    closeModal();
    showConfirmBar();
    toast("🐰 うさぎをクリックして選択 → 「決定」");
  }

  function setRemoveMode(slot = "hat") {
    state.selectedItem = null;
    state.pendingAction = "remove";
    state.removeSlot = slot;
    state.mode = "equip";
    document.body.classList.add("isyouEquipMode");
    closeModal();
    showConfirmBar();
    toast("🐰 外したいうさぎをクリックして選択 → 「外す決定」");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderModal() {
    ensureModal();
    const have = getCoins();

    const cards = Object.keys(ITEMS).map((k) => {
      const it = ITEMS[k];
      const owned = ownedCount(k);
      const can = have >= it.price;

      const badge = owned > 0
        ? `<span class="badge">所持：${owned}</span>`
        : `<span class="badge lock">未所持</span>`;

      const buyBtn = `<button class="btn ${can ? "primary" : ""}" data-buy="${escapeHtml(k)}" ${can ? "" : "disabled"}>購入</button>`;
      const equipBtn = owned > 0
        ? `<button class="btn" data-equip="${escapeHtml(k)}">装着モード</button>`
        : `<button class="btn" disabled>装着</button>`;

      return `
        <div class="card">
          <img class="thumb" src="${escapeHtml(it.img)}" alt="${escapeHtml(it.label)}">
          <div class="info">
            <div class="name">${escapeHtml(it.label)}</div>
            <div class="mini">スロット：${escapeHtml(it.slot)}</div>
            <div class="row" style="justify-content:flex-start; gap:8px;">
              ${badge}
              <span class="price ${can ? "" : "bad"}">${it.price}🪙</span>
            </div>
            <div class="row" style="justify-content:flex-start; gap:8px;">
              ${buyBtn}
              ${equipBtn}
            </div>
          </div>
        </div>
      `;
    }).join("");

    modal.innerHTML = `
      <div class="head">
        <div class="ttl">🎀 お洒落</div>
        <button class="close" type="button" id="isyouCloseBtn">閉じる</button>
      </div>
      <div class="body">
        <div class="row">
          <div class="pill">所持コイン：<b>${have}</b> 🪙</div>
          <div class="row" style="gap:8px;">
            <button class="btn danger" type="button" id="isyouRemoveHat">帽子を外す</button>
            <button class="btn" type="button" id="isyouRefresh">更新</button>
          </div>
        </div>

        <div class="grid">${cards}</div>

        <div style="height:8px"></div>
        <div class="mini">
          ※「装着モード」を押したらモーダルが閉じます。うさぎをクリックして赤枠選択→上のバーで「決定」してください。<br>
          ※「外す」も同じく、赤枠選択→「外す決定」。
        </div>
      </div>
    `;

    modal.querySelector("#isyouCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeModal();
    });
    modal.querySelector("#isyouRefresh")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      renderModal();
    });
    modal.querySelector("#isyouRemoveHat")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      setRemoveMode("hat");
    });

    modal.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        buy(btn.getAttribute("data-buy"));
      });
    });

    modal.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        setEquipItem(btn.getAttribute("data-equip"));
      });
    });
  }

  /* =========================
   * Confirm bar
   * ========================= */
  let confirmBar = null;

  function ensureConfirmBar() {
    if (confirmBar && confirmBar.isConnected) return confirmBar;
    confirmBar = document.createElement("div");
    confirmBar.id = "isyouConfirmBar";
    confirmBar.innerHTML = `
      <div class="row">
        <span class="t" id="isyouSelText">未選択</span>
        <button class="primary" id="isyouDoBtn" type="button">決定</button>
        <button class="danger" id="isyouRemoveBtn" type="button">外す決定</button>
        <button id="isyouCancelBtn" type="button">キャンセル</button>
        <button id="isyouOpenShopBtn" type="button">お洒落を開く</button>
      </div>
    `;
    document.body.appendChild(confirmBar);

    confirmBar.querySelector("#isyouCancelBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      cancelEquipMode();
    });
    confirmBar.querySelector("#isyouOpenShopBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      cancelEquipMode(false);
      openModal();
    });
    confirmBar.querySelector("#isyouDoBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      confirmEquip();
    });
    confirmBar.querySelector("#isyouRemoveBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      confirmRemove();
    });

    return confirmBar;
  }

  function showConfirmBar() {
    ensureConfirmBar();
    updateConfirmBar();
    confirmBar.style.display = "block";
  }

  function hideConfirmBar() {
    if (!confirmBar) return;
    confirmBar.style.display = "none";
  }

  function updateConfirmBar() {
    ensureConfirmBar();
    const t = confirmBar.querySelector("#isyouSelText");
    const doBtn = confirmBar.querySelector("#isyouDoBtn");
    const rmBtn = confirmBar.querySelector("#isyouRemoveBtn");

    const it = state.selectedItem ? ITEMS[state.selectedItem] : null;
    const sel = state.selectedBornAt ? `選択：${state.selectedBornAt}` : "未選択";

    const modeText =
      state.pendingAction === "equip"
        ? `装着：${it ? it.label : "（未選択）"} / ${sel}`
        : `外す：${state.removeSlot || "hat"} / ${sel}`;

    if (t) t.textContent = modeText;

    const hasTarget = !!state.selectedBornAt;
    if (doBtn) doBtn.disabled = !(hasTarget && state.pendingAction === "equip" && !!it);
    if (rmBtn) rmBtn.disabled = !(hasTarget && state.pendingAction === "remove");
  }

  function clearSelection() {
    try { document.querySelectorAll(".bunnyWrap.isyouSelected").forEach((w) => w.classList.remove("isyouSelected")); } catch {}
    state.selectedWrap = null;
    state.selectedBornAt = null;
    updateConfirmBar();
  }

  function cancelEquipMode(showToast = true) {
    state.mode = "browse";
    state.selectedItem = null;
    state.pendingAction = "equip";
    state.removeSlot = null;
    document.body.classList.remove("isyouEquipMode");
    hideConfirmBar();
    clearSelection();
    if (showToast) toast("🛑 装着モードを終了");
  }

  /* =========================
   * fitToBunny (perfect match + flip cancel)
   * ========================= */
  function getBunnyImg(wrap) {
    if (!wrap) return null;
    return (
      wrap.querySelector("img.bunny") ||
      wrap.querySelector("img.bunnyImg") ||
      wrap.querySelector(".bunny img") ||
      wrap.querySelector("img") ||
      null
    );
  }

  function ensureAccContainer(wrap) {
    if (!wrap) return null;
    let box = wrap.querySelector(":scope > .isyouAcc");
    if (box) return box;
    box = document.createElement("div");
    box.className = "isyouAcc";
    wrap.appendChild(box);
    return box;
  }

  function removeAccSlot(wrap, slot) {
    if (!wrap) return;
    const box = ensureAccContainer(wrap);
    if (!box) return;
    box.querySelectorAll(`[data-slot="${slot}"]`).forEach((n) => { try { n.remove(); } catch {} });
  }

  function relOffsetTo(el, ancestor) {
    let x = 0, y = 0;
    let cur = el;
    while (cur && cur !== ancestor) {
      x += cur.offsetLeft || 0;
      y += cur.offsetTop || 0;
      cur = cur.offsetParent;
    }
    if (cur !== ancestor) return null;
    return { x, y };
  }

  // ★wrapが反転しているか判定（class flip / transform matrix）
  function isFlippedX(wrap) {
    if (!wrap) return false;
    if (wrap.classList?.contains("flip")) return true;

    try {
      const tr = getComputedStyle(wrap).transform;
      if (!tr || tr === "none") return false;

      // matrix(a,b,c,d,tx,ty) の a が負ならscaleXが負
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(",").map((s) => Number(s.trim()));
        const a = parts[0];
        return Number.isFinite(a) && a < 0;
      }

      // matrix3d(...) の [0] が負ならscaleXが負
      const m3 = tr.match(/matrix3d\(([^)]+)\)/);
      if (m3) {
        const parts = m3[1].split(",").map((s) => Number(s.trim()));
        const a = parts[0];
        return Number.isFinite(a) && a < 0;
      }
    } catch {}

    return false;
  }

  function applyFlipCancel(node, wrap) {
    // 親が反転しているなら、アクセだけ反転相殺して「見た目を固定」
    const flip = isFlippedX(wrap);
    if (flip) {
      node.style.transformOrigin = "50% 50%";
      node.style.transform = "scaleX(-1)";
    } else {
      node.style.transform = "";
    }
  }

  function fitNodeToBunny(wrap, bunnyImg, node, slot) {
    if (!wrap || !bunnyImg || !node) return;

    const off = relOffsetTo(bunnyImg, wrap);
    let left, top, w, h;

    if (off) {
      left = off.x;
      top  = off.y;
      w = bunnyImg.offsetWidth || bunnyImg.clientWidth || 0;
      h = bunnyImg.offsetHeight || bunnyImg.clientHeight || 0;
    } else {
      const br = bunnyImg.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      left = br.left - wr.left;
      top  = br.top  - wr.top;
      w = br.width;
      h = br.height;
    }
    if (!(w > 0 && h > 0)) return;

    const a = ANCHOR[slot] || {};

    if (a.matchBunny) {
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      applyFlipCancel(node, wrap); // ★ここが今回の修正ポイント
      return;
    }

    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    applyFlipCancel(node, wrap);
  }

  const wrapWatch = new WeakMap(); // wrap -> { ro, mo }

  function ensureFollow(wrap, bunnyImg) {
    if (!wrap || !bunnyImg) return;
    if (wrapWatch.has(wrap)) return;

    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        try {
          const box = wrap.querySelector(":scope > .isyouAcc");
          if (!box) return;
          const b = getBunnyImg(wrap);
          if (!b) return;
          box.querySelectorAll("[data-slot]").forEach((node) => {
            const slot = node.getAttribute("data-slot") || "hat";
            fitNodeToBunny(wrap, b, node, slot);
          });
        } catch {}
      });
    };

    let ro = null;
    try {
      ro = new ResizeObserver(() => schedule());
      ro.observe(bunnyImg);
      ro.observe(wrap);
    } catch {}

    let mo = null;
    try {
      mo = new MutationObserver(() => schedule());
      mo.observe(wrap, { attributes: true, childList: true, subtree: true });
    } catch {}

    wrapWatch.set(wrap, { ro, mo, schedule });
  }

  function placeAcc(wrap, slot, imgSrc) {
    if (!wrap) return;

    const bunnyImg = getBunnyImg(wrap);
    const box = ensureAccContainer(wrap);
    if (!box || !bunnyImg) return;

    removeAccSlot(wrap, slot);

    const node = document.createElement("div");
    node.dataset.slot = slot;

    const img = document.createElement("img");
    img.src = imgSrc;
    img.alt = slot;
    node.appendChild(img);

    box.appendChild(node);

    const fit = () => {
      const b = getBunnyImg(wrap);
      if (!b) return;
      fitNodeToBunny(wrap, b, node, slot);
    };

    requestAnimationFrame(() => requestAnimationFrame(fit));
    img.onload = () => requestAnimationFrame(() => requestAnimationFrame(fit));

    ensureFollow(wrap, bunnyImg);
  }

  function applyEquipsForWrap(wrap) {
    const bornAt = getBornAtFromWrap(wrap);
    if (!bornAt) return;

    const eq = state.equipped[String(bornAt)] || {};
    if (eq.hat && ITEMS[eq.hat]) placeAcc(wrap, "hat", ITEMS[eq.hat].img);
    else removeAccSlot(wrap, "hat");
  }

  function applyEquipsAll() {
    document.querySelectorAll(".bunnyWrap").forEach((wrap) => applyEquipsForWrap(wrap));
  }

  /* =========================
   * Confirm actions
   * ========================= */
  function confirmEquip() {
    const wrap = state.selectedWrap;
    const bornAt = state.selectedBornAt;
    const itemKey = state.selectedItem;
    if (!wrap || !bornAt || !itemKey) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    if (ownedCount(itemKey) <= 0) { toast("未所持だよ…！"); return; }

    const id = String(bornAt);
    state.equipped[id] = state.equipped[id] || {};
    state.equipped[id][it.slot] = itemKey;

    saveAll();
    applyEquipsForWrap(wrap);
    toast(`✨ 装着：${it.label}`);
    cancelEquipMode(false);
  }

  function confirmRemove() {
    const wrap = state.selectedWrap;
    const bornAt = state.selectedBornAt;
    if (!wrap || !bornAt) return;

    const slot = state.removeSlot || "hat";
    const id = String(bornAt);

    state.equipped[id] = state.equipped[id] || {};
    delete state.equipped[id][slot];
    if (!Object.keys(state.equipped[id]).length) delete state.equipped[id];

    saveAll();
    removeAccSlot(wrap, slot);
    toast("🧺 外したよ！");
    cancelEquipMode(false);
  }

  /* =========================
   * Selection
   * ========================= */
  function selectWrap(wrap) {
    if (!wrap) return;
    document.querySelectorAll(".bunnyWrap.isyouSelected").forEach((w) => w.classList.remove("isyouSelected"));
    wrap.classList.add("isyouSelected");
    state.selectedWrap = wrap;
    state.selectedBornAt = getBornAtFromWrap(wrap);
    updateConfirmBar();
  }

  function onPointerDownCapture(e) {
    if (state.mode !== "equip") return;
    if (e.button != null && e.button !== 0) return;

    if (backdrop && backdrop.style.display !== "none") {
      const inModal = e.target?.closest?.("#isyouModal");
      if (inModal) return;
    }

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    selectWrap(wrap);
  }

  /* =========================
   * HUD button
   * ========================= */
  function injectHudButton() {
    const hud = document.getElementById("hud");
    if (!hud) return;

    const mount = document.getElementById("hudButtons") || hud;
    if (document.getElementById("isyouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.type = "button";
    btn.textContent = "お洒落";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.mode === "equip") cancelEquipMode(false);
      openModal();
    });

    mount.appendChild(btn);
  }

  /* =========================
   * Boot
   * ========================= */
  function attach(wb) {
    WB = wb || null;
    loadAll();

    injectHudButton();
    ensureModal();
    ensureConfirmBar();

    document.addEventListener("pointerdown", onPointerDownCapture, true);

    setTimeout(applyEquipsAll, 200);
    setTimeout(applyEquipsAll, 900);
    setTimeout(applyEquipsAll, 1800);

    try {
      WB?.on?.("bunnyCountChanged", () => setTimeout(applyEquipsAll, 50));
      WB?.on?.("bunnySpawned", () => setTimeout(applyEquipsAll, 50));
    } catch {}

    try {
      const layer = document.getElementById("bunnyLayer") || document.body;
      const mo = new MutationObserver(() => setTimeout(applyEquipsAll, 30));
      mo.observe(layer, { childList: true, subtree: true });
    } catch {}
  }

  window.addEventListener("load", () => {
    injectStyles();
    loadAll();
    injectHudButton();

    if (window.WB) attach(window.WB);
    else waitFor(() => window.WB).then((wb) => attach(wb)).catch(() => attach(null));
  });

  /* =========================
   * Confirm bar element
   * ========================= */
  let confirmBar = null;
  function ensureConfirmBar() {
    if (confirmBar && confirmBar.isConnected) return confirmBar;
    confirmBar = document.createElement("div");
    confirmBar.id = "isyouConfirmBar";
    confirmBar.innerHTML = `
      <div class="row">
        <span class="t" id="isyouSelText">未選択</span>
        <button class="primary" id="isyouDoBtn" type="button">決定</button>
        <button class="danger" id="isyouRemoveBtn" type="button">外す決定</button>
        <button id="isyouCancelBtn" type="button">キャンセル</button>
        <button id="isyouOpenShopBtn" type="button">お洒落を開く</button>
      </div>
    `;
    document.body.appendChild(confirmBar);

    confirmBar.querySelector("#isyouCancelBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      cancelEquipMode();
    });
    confirmBar.querySelector("#isyouOpenShopBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      cancelEquipMode(false);
      openModal();
    });
    confirmBar.querySelector("#isyouDoBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      confirmEquip();
    });
    confirmBar.querySelector("#isyouRemoveBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      confirmRemove();
    });

    return confirmBar;
  }

  function showConfirmBar() {
    ensureConfirmBar();
    updateConfirmBar();
    confirmBar.style.display = "block";
  }
  function hideConfirmBar() {
    if (!confirmBar) return;
    confirmBar.style.display = "none";
  }

  function updateConfirmBar() {
    ensureConfirmBar();
    const t = confirmBar.querySelector("#isyouSelText");
    const doBtn = confirmBar.querySelector("#isyouDoBtn");
    const rmBtn = confirmBar.querySelector("#isyouRemoveBtn");

    const it = state.selectedItem ? ITEMS[state.selectedItem] : null;
    const sel = state.selectedBornAt ? `選択：${state.selectedBornAt}` : "未選択";

    const modeText =
      state.pendingAction === "equip"
        ? `装着：${it ? it.label : "（未選択）"} / ${sel}`
        : `外す：${state.removeSlot || "hat"} / ${sel}`;

    if (t) t.textContent = modeText;

    const hasTarget = !!state.selectedBornAt;
    if (doBtn) doBtn.disabled = !(hasTarget && state.pendingAction === "equip" && !!it);
    if (rmBtn) rmBtn.disabled = !(hasTarget && state.pendingAction === "remove");
  }

  /* =========================
   * Debug / public
   * ========================= */
  window.ISYOU = {
    openModal,
    closeModal,
    enterEquip: setEquipItem,
    enterRemoveHat: () => setRemoveMode("hat"),
    applyEquipsAll,
    _state: state,
  };
})();
