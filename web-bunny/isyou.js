// isyou.js — お洒落（ショップ＋着せ替え＋赤枠選択＋決定式で外す＋flip完全対応＋SE）完全版（V29.4）
// ✅ V29.3で hat が出ない根本原因（bunnyごとのwrapが無い）を解決：
// - うさぎDOM構造に依存しない「オーバーレイ描画」方式に変更
// - 帽子は #isyouOverlay に absolute 配置（imgのrect追従）
// - bornAt は WBの bunnies から img→bornAt をマップ化して確実に取得
// - サブパス配信対応：baseURIで絶対URL化
// - flip対応：imgのtransform行列から左右反転判定 → 帽子にも適用

(() => {
  "use strict";
  console.log("[isyou.js] LOADED V29.4", Date.now());

  /* =========================
   * Wait
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
        if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          reject(new Error("waitFor timeout"));
        }
      }, TICK_MS);
    });
  }

  /* =========================
   * URL helper（サブパス対応）
   * ========================= */
  function absUrl(p) {
    try { return new URL(p, document.baseURI).toString(); } catch { return p; }
  }

  /* =========================
   * Safe SYOUGOU.add (retry)
   * ========================= */
  const __syQueue = [];
  let __syRetryTimer = null;

  function __syCallAdd(key, n) {
    try {
      const S = window.SYOUGOU;
      const fn =
        (typeof S?.add === "function" && S.add) ||
        (typeof S?.inc === "function" && S.inc) ||
        (typeof S?.plus === "function" && S.plus);

      if (!fn) return false;

      fn.call(S, key, n);
      try { S.save?.(); } catch {}
      try { S.render?.(); } catch {}
      try { S.update?.(); } catch {}
      try { S.updateHud?.(); } catch {}
      return true;
    } catch {
      return false;
    }
  }

  function syAdd(key, n = 1) {
    if (__syCallAdd(key, n)) return true;

    __syQueue.push([key, n]);

    if (!__syRetryTimer) {
      let tries = 0;
      __syRetryTimer = setInterval(() => {
        tries++;
        for (let i = 0; i < __syQueue.length; i++) {
          const [k, a] = __syQueue[i];
          if (__syCallAdd(k, a)) { __syQueue.splice(i, 1); i--; }
        }
        if (__syQueue.length === 0) {
          clearInterval(__syRetryTimer);
          __syRetryTimer = null;
          return;
        }
        if (tries >= 300) {
          console.warn("[isyou][syougou] retry timeout. remaining:", __syQueue);
          clearInterval(__syRetryTimer);
          __syRetryTimer = null;
        }
      }, 200);
    }
    return false;
  }

  /* =========================
   * 画像候補を順に試す（abs化）
   * ========================= */
  function setSrcWithFallback(imgEl, candidates, onOk) {
    const list = (candidates || []).filter(Boolean).map(absUrl);
    let i = 0;
    let last = "";

    const tryOne = () => {
      if (i >= list.length) {
        console.warn("[isyou] all candidates failed:", list);
        return;
      }
      const next = String(list[i++]);
      if (next === last) return tryOne();
      last = next;
      imgEl.src = next;
    };

    imgEl.onload = () => { try { onOk?.(); } catch {} };
    imgEl.onerror = () => tryOne();
    tryOne();
  }

  /* =========================
   * SE（装着時）
   * ========================= */
  const EQUIP_SE_CANDIDATES = [
    absUrl(encodeURI("./assets/isyou/Onoma-Pop03-1(High).mp3")),
    absUrl("./assets/poyo.mp3"),
    absUrl("./assets/coin.mp3"),
  ];

  let __equipSeAudio = null;

  function preloadEquipSe() {
    if (__equipSeAudio) return;
    __equipSeAudio = new Audio();
    __equipSeAudio.preload = "auto";

    let idx = 0;
    const tryNext = () => {
      if (!__equipSeAudio) return;
      if (idx >= EQUIP_SE_CANDIDATES.length) return;
      __equipSeAudio.src = EQUIP_SE_CANDIDATES[idx++];
      __equipSeAudio.load();
    };

    __equipSeAudio.onerror = () => tryNext();
    tryNext();
  }

  function playEquipSe() {
    try {
      preloadEquipSe();
      if (!__equipSeAudio) return;
      __equipSeAudio.currentTime = 0;
      __equipSeAudio.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * Config / Items
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v7",
    equipped: "wb_isyou_equipped_v7",
  };

  function imgCandidates(name) {
    return [
      `./assets/isyou/${name}`,
      `assets/isyou/${name}`,
      `./assets/${name}`,
      `assets/${name}`,
    ].map(absUrl);
  }

  const ITEMS = {
    partyhat: { slot: "hat", label: "パーティーハット", imgs: imgCandidates("partyhat.png"), price: 500 },
    crown:    { slot: "hat", label: "クラウン",         imgs: imgCandidates("crown.png"),    price: 900 },
    ribbon:   { slot: "hat", label: "リボン",           imgs: imgCandidates("ribbon.png"),   price: 700 },
    ahiru:    { slot: "hat", label: "アヒル",           imgs: imgCandidates("ahiru.png"),    price: 450 },
    aimasuku: { slot: "hat", label: "アイマスク",       imgs: imgCandidates("aimasuku.png"), price: 650 },
  };

  /* =========================
   * State
   * ========================= */
  const state = {
    owned: {},
    equipped: {},

    mode: "browse",
    selectedItem: null,
    pendingAction: "equip",
    removeSlot: null,

    selectedImg: null,
    selectedBornAt: null,
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
        if ("coins" in WB) WB.coins = nv;
        else if (typeof WB.coins === "number") WB.coins = nv;
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

  /* =========================
   * img → bornAt map（V29.4の要）
   * ========================= */
  const imgToBornAt = new WeakMap();

  function rebuildImgBornAtMap() {
    try {
      imgToBornAt.clear?.(); // WeakMapにはclear無いのでtryだけ
    } catch {}
    const list = getBunnies();
    for (const b of list) {
      const img = b?.img || b?.bunnyImg || b?.node;
      const bornAt = b?.bornAt;
      if (img && img.tagName === "IMG" && bornAt != null) {
        imgToBornAt.set(img, String(bornAt));
      }
    }
  }

  function getBornAtFromImg(img) {
    if (!img) return null;
    const v = imgToBornAt.get(img);
    if (v) return v;

    // 保険：datasetなど
    const ds = img.dataset || {};
    return ds.bornAt || ds.bornat || ds.born_at || null;
  }

  /* =========================
   * Styles（overlay + 選択枠）
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV294")) return;

    const s = document.createElement("style");
    s.id = "isyouStyleV294";
    s.textContent = `
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

/* ✅ overlay（ここに帽子を描画） */
#isyouOverlay{
  position:absolute;
  left:0; top:0;
  width:100%; height:100%;
  pointer-events:none;
  z-index: 2147482000;
  overflow: visible;
}
.isyouHat{
  position:absolute;
  left:0; top:0;
  width:10px; height:10px;
  pointer-events:none;
  transform-origin: 50% 50%;
}
.isyouHat img{
  width:100%;
  height:100%;
  object-fit: contain;
  display:block;
}

/* ✅ 選択枠（imgにクラス付与） */
img.isyouSelectedImg{
  outline: 4px solid rgba(255, 64, 64, .88);
  outline-offset: 3px;
  border-radius: 18px;
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
   * Overlay
   * ========================= */
  let overlay = null;

  function ensureOverlay() {
    const host =
      document.getElementById("bunnyLayer") ||
      document.getElementById("field") ||
      document.body;

    // hostがposition:staticならrelativeに
    try {
      const pos = getComputedStyle(host).position;
      if (pos === "static") host.style.position = "relative";
    } catch {}

    overlay = document.getElementById("isyouOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "isyouOverlay";
      host.appendChild(overlay);
    } else {
      // 常に最前に
      try { host.appendChild(overlay); } catch {}
    }
    return overlay;
  }

  // ✅ 反転判定（transformのa<0）
  function isMirrored(el) {
    if (!el) return false;
    try {
      const t = getComputedStyle(el).transform;
      if (!t || t === "none") return false;
      const m = new DOMMatrixReadOnly(t);
      return (m.a || 0) < 0;
    } catch {
      return false;
    }
  }

  // ✅ overlay基準座標に変換して帽子配置
  function placeHatOnOverlay(img, itemKey) {
    const bornAt = getBornAtFromImg(img);
    if (!bornAt) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    const ov = ensureOverlay();

    // 既存削除（このbornAtのhat）
    ov.querySelectorAll(`.isyouHat[data-bornat="${CSS.escape(String(bornAt))}"][data-slot="hat"]`)
      .forEach(n => { try { n.remove(); } catch {} });

    const hat = document.createElement("div");
    hat.className = "isyouHat";
    hat.dataset.bornat = String(bornAt);
    hat.dataset.slot = "hat";

    const hatImg = document.createElement("img");
    hatImg.alt = "hat";
    hat.appendChild(hatImg);
    ov.appendChild(hat);

    const sync = () => {
      if (!hat.isConnected) return;
      if (!img.isConnected) { try { hat.remove(); } catch {} ; return; }

      const ovRect = ov.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      if (ir.width <= 0 || ir.height <= 0) return;

      // 画像の枠にぴったり（あなたのpartyhatが“頭位置に合ってるセル”なのでまずは完全一致）
      hat.style.left = `${ir.left - ovRect.left}px`;
      hat.style.top  = `${ir.top  - ovRect.top }px`;
      hat.style.width  = `${ir.width }px`;
      hat.style.height = `${ir.height}px`;

      // 反転追従：imgだけ反転してるなら帽子も反転
      const needMirror = isMirrored(img);
      hat.style.transform = needMirror ? "scaleX(-1)" : "none";
    };

    // 初回＋追従
    sync();
    requestAnimationFrame(sync);
    setTimeout(sync, 60);
    setTimeout(sync, 180);

    setSrcWithFallback(hatImg, it.imgs, () => {
      // 読み込み後も再同期
      requestAnimationFrame(sync);
      setTimeout(sync, 80);
    });
  }

  function removeHatOnOverlay(img) {
    const bornAt = getBornAtFromImg(img);
    if (!bornAt) return;
    const ov = ensureOverlay();
    ov.querySelectorAll(`.isyouHat[data-bornat="${CSS.escape(String(bornAt))}"][data-slot="hat"]`)
      .forEach(n => { try { n.remove(); } catch {} });
  }

  /* =========================
   * うさぎ画像検出
   * ========================= */
  function getAllBunnyImgs() {
    const out = [];

    // WB優先
    const list = getBunnies();
    for (const b of list) {
      const img = b?.img || b?.bunnyImg || b?.node;
      if (img && img.tagName === "IMG") out.push(img);
    }

    // fallback：#bunnyLayer内のimg（うさぎ画像だけに近い）
    const layer = document.getElementById("bunnyLayer") || document.body;
    layer.querySelectorAll("img").forEach((img) => {
      if (img && img.tagName === "IMG") out.push(img);
    });

    return Array.from(new Set(out));
  }

  function applyEquipsAll() {
    ensureOverlay();
    rebuildImgBornAtMap();

    const imgs = getAllBunnyImgs();
    for (const img of imgs) {
      const bornAt = getBornAtFromImg(img);
      if (!bornAt) continue;

      const eq = state.equipped[String(bornAt)] || {};
      const key = eq.hat;

      if (key && ITEMS[key]) placeHatOnOverlay(img, key);
      else removeHatOnOverlay(img);
    }
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

    if (!spendCoins(it.price)) {
      toast("コインが足りない…！");
      return false;
    }

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
    closeModal();
    showConfirmBar();
    toast("🐰 うさぎをクリックして選択 → 「決定」");
  }

  function setRemoveMode(slot) {
    state.selectedItem = null;
    state.pendingAction = "remove";
    state.removeSlot = slot;
    state.mode = "equip";
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
          <img class="thumb" data-itemthumb="${escapeHtml(k)}" alt="${escapeHtml(it.label)}">
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
          ※「装着モード」を押したらモーダルが閉じます。うさぎをクリックして選択→上のバーで「決定」。<br>
          ※「外す」も同じく、選択→「外す決定」。
        </div>
      </div>
    `;

    modal.querySelectorAll("img[data-itemthumb]").forEach((img) => {
      const key = img.getAttribute("data-itemthumb");
      const it = ITEMS[key];
      if (!it) return;
      setSrcWithFallback(img, it.imgs, null);
    });

    modal.querySelector("#isyouCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeModal();
    });
    modal.querySelector("#isyouRefresh")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      renderModal();
      setTimeout(applyEquipsAll, 0);
    });
    modal.querySelector("#isyouRemoveHat")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      setRemoveMode("hat");
    });

    modal.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const k = btn.getAttribute("data-buy");
        buy(k);
      });
    });

    modal.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const k = btn.getAttribute("data-equip");
        setEquipItem(k);
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
        : `外す：${state.removeSlot || "?"} / ${sel}`;

    if (t) t.textContent = modeText;

    const hasTarget = !!state.selectedBornAt;
    if (doBtn) doBtn.disabled = !(hasTarget && state.pendingAction === "equip" && !!it);
    if (rmBtn) rmBtn.disabled = !(hasTarget && state.pendingAction === "remove");
  }

  function clearSelection() {
    try { document.querySelectorAll("img.isyouSelectedImg").forEach(img => img.classList.remove("isyouSelectedImg")); } catch {}
    state.selectedImg = null;
    state.selectedBornAt = null;
    updateConfirmBar();
  }

  function cancelEquipMode(showToast = true) {
    state.mode = "browse";
    state.selectedItem = null;
    state.pendingAction = "equip";
    state.removeSlot = null;
    hideConfirmBar();
    clearSelection();
    if (showToast) toast("🛑 装着モードを終了");
  }

  /* =========================
   * Confirm actions
   * ========================= */
  function confirmEquip() {
    const img = state.selectedImg;
    const bornAt = state.selectedBornAt;
    const itemKey = state.selectedItem;
    if (!img || !bornAt || !itemKey) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    if (ownedCount(itemKey) <= 0) {
      toast("未所持だよ…！");
      return;
    }

    const id = String(bornAt);
    state.equipped[id] = state.equipped[id] || {};
    state.equipped[id][it.slot] = itemKey;

    saveAll();
    applyEquipsAll();

    playEquipSe();
    toast(`✨ 装着：${it.label}`);
    cancelEquipMode(false);
  }

  function confirmRemove() {
    const img = state.selectedImg;
    const bornAt = state.selectedBornAt;
    if (!img || !bornAt) return;

    const slot = state.removeSlot || "hat";
    const id = String(bornAt);

    state.equipped[id] = state.equipped[id] || {};
    delete state.equipped[id][slot];
    if (!Object.keys(state.equipped[id]).length) delete state.equipped[id];

    saveAll();
    removeHatOnOverlay(img);

    toast("🧺 外したよ！");
    cancelEquipMode(false);
  }

  /* =========================
   * Selection（うさぎimgを直接選ぶ）
   * ========================= */
  function selectImg(img) {
    if (!img) return;
    document.querySelectorAll("img.isyouSelectedImg").forEach(x => x.classList.remove("isyouSelectedImg"));
    img.classList.add("isyouSelectedImg");
    state.selectedImg = img;

    rebuildImgBornAtMap();
    state.selectedBornAt = getBornAtFromImg(img);

    updateConfirmBar();
  }

  function onPointerDownCapture(e) {
    if (state.mode !== "equip") return;
    if (e.button != null && e.button !== 0) return;

    if (backdrop && backdrop.style.display !== "none") {
      const inModal = e.target?.closest?.("#isyouModal");
      if (inModal) return;
    }

    const img = e.target?.closest?.("#bunnyLayer img") || e.target?.closest?.("img");
    if (!img) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectImg(img);
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
    injectStyles();
    ensureOverlay();

    injectHudButton();
    ensureModal();
    ensureConfirmBar();

    document.addEventListener("pointerdown", onPointerDownCapture, true);

    preloadEquipSe();

    // 初回＆遅延（画像確定待ち）
    setTimeout(applyEquipsAll, 120);
    setTimeout(applyEquipsAll, 420);
    setTimeout(applyEquipsAll, 900);
    setTimeout(applyEquipsAll, 1600);

    // レイアウト変化で追従（スクロール/リサイズ/うさぎ増減）
    window.addEventListener("resize", () => setTimeout(applyEquipsAll, 0), { passive: true });
    window.addEventListener("scroll", () => setTimeout(applyEquipsAll, 0), { passive: true });

    try {
      WB?.on?.("bunnyCountChanged", () => setTimeout(applyEquipsAll, 50));
      WB?.on?.("bunnySpawned", () => setTimeout(applyEquipsAll, 50));
      WB?.on?.("resize", () => setTimeout(applyEquipsAll, 50));
    } catch {}

    // DOM増減でも拾う
    try {
      const layer = document.getElementById("bunnyLayer");
      if (layer) {
        const mo = new MutationObserver(() => setTimeout(applyEquipsAll, 0));
        mo.observe(layer, { childList: true, subtree: true, attributes: true });
      }
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
   * Debug / public
   * ========================= */
  window.ISYOU = {
    openModal,
    closeModal,
    applyEquipsAll,
    _state: state,
    _items: ITEMS,
  };
})();
