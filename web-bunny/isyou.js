// isyou.js — お洒落（ショップ＋着せ替え＋赤枠選択＋決定式で外す＋flip完全対応＋SE）完全版（V31.3）
// ✅ FIX：反転(scaleX(-1))時の「位置ズレ」を補正（x + width してから反転）
// ✅ hat は bunny と同じ位置＆サイズ（getBoundingClientRect一致）
// ✅ びくびく防止：left/top更新しない、transform translate3d で追従

(() => {
  "use strict";
  console.log("[isyou.js] LOADED V31.3", Date.now());

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
    owned: "wb_isyou_owned_v9",
    equipped: "wb_isyou_equipped_v9",
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

  const state = {
    owned: {},
    equipped: {},
    mode: "browse",
    selectedItem: null,
    pendingAction: "equip",
    removeSlot: null,
    selectedImg: null,
    selectedKey: null,
  };

  let WB = null;

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
   * Key
   * ========================= */
  const imgToBornAt = new WeakMap();

  function rebuildImgBornAtMap() {
    const list = getBunnies();
    for (const b of list) {
      const img = b?.img || b?.bunnyImg || b?.node;
      const bornAt = b?.bornAt;
      if (img && img.tagName === "IMG" && bornAt != null) {
        imgToBornAt.set(img, String(bornAt));
      }
    }
  }

  function ensureFallbackKeyOnImg(img) {
    if (!img) return null;
    const dk = img.getAttribute("data-isyou-key");
    if (dk) return dk;

    const layer = document.getElementById("bunnyLayer") || document.body;
    const imgs = Array.from(layer.querySelectorAll("img"));
    const idx = Math.max(0, imgs.indexOf(img));
    const src = String(img.currentSrc || img.src || img.getAttribute("src") || "");
    const key = `fallback:${src}|${idx}`;
    try { img.setAttribute("data-isyou-key", key); } catch {}
    return key;
  }

  function getKeyFromImg(img) {
    if (!img) return null;
    const b = imgToBornAt.get(img);
    if (b) return b;

    const ds = img.dataset || {};
    const d = ds.bornAt || ds.bornat || ds.born_at;
    if (d) return String(d);

    return ensureFallbackKeyOnImg(img);
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV313")) return;

    const s = document.createElement("style");
    s.id = "isyouStyleV313";
    s.textContent = `
#isyouBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.36);z-index:2147483000;display:none;}
#isyouModal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(860px,94vw);max-height:min(84vh,820px);overflow:hidden;border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 24px 70px rgba(0,0,0,.28);display:flex;flex-direction:column;}
#isyouModal .head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.08);}
#isyouModal .ttl{font-weight:1000;letter-spacing:.02em;}
#isyouModal .close{border:none;background:rgba(0,0,0,.06);border-radius:12px;padding:8px 12px;font-weight:900;cursor:pointer;}
#isyouModal .body{padding:12px 14px;overflow:auto;}
#isyouModal .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;}
#isyouModal .pill{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.92);border-radius:999px;padding:8px 10px;box-shadow:0 10px 22px rgba(0,0,0,.08);font-weight:900;}
#isyouModal .mini{font-size:12px;opacity:.78;font-weight:900;}
#isyouModal .grid{margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;}
#isyouModal .card{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:14px;background:rgba(0,0,0,.03);border:1px solid rgba(0,0,0,.06);}
#isyouModal .thumb{width:64px;height:64px;object-fit:contain;background:rgba(255,255,255,.85);border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:6px;flex:0 0 64px;}
#isyouModal .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
#isyouModal .name{font-weight:1000;line-height:1.2;}
#isyouModal .price{font-weight:1000;}
#isyouModal .price.bad{color:#b00020;}
#isyouModal .btn{border:none;border-radius:12px;padding:9px 12px;font-weight:1000;cursor:pointer;background:#fff;box-shadow:0 10px 22px rgba(0,0,0,.10);}
#isyouModal .btn.primary{background:#ffd6e7;}
#isyouModal .btn.danger{background:rgba(255,80,80,.12);}
#isyouModal .btn[disabled]{opacity:.55;cursor:not-allowed;box-shadow:none;}
#isyouModal .badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;background:rgba(0,0,0,.06);font-weight:1000;font-size:12px;}
#isyouModal .badge.lock{background:rgba(255,120,120,.18);}

#isyouConfirmBar{position:fixed;left:50%;top:12%;transform:translate(-50%,-50%);z-index:2147483600;display:none;background:rgba(255,255,255,.96);border-radius:16px;padding:10px 12px;box-shadow:0 18px 55px rgba(0,0,0,.22);font-weight:1000;}
#isyouConfirmBar .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;}
#isyouConfirmBar .t{opacity:.82;font-weight:1000;}
#isyouConfirmBar button{border:none;border-radius:12px;padding:8px 12px;font-weight:1000;cursor:pointer;background:#fff;box-shadow:0 10px 22px rgba(0,0,0,.10);}
#isyouConfirmBar button.primary{background:#ffd6e7;}
#isyouConfirmBar button.danger{background:rgba(255,80,80,.12);}

#isyouOverlay{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147482000;overflow:visible;}
.isyouHat{position:absolute;left:0;top:0;width:10px;height:10px;pointer-events:none;transform-origin:0 0;will-change:transform,width,height;}
.isyouHat img{width:100%;height:100%;object-fit:contain;display:block;}
`;
    document.head.appendChild(s);
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
      try { host.appendChild(overlay); } catch {}
    }
    return overlay;
  }

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

  /* =========================
   * 赤枠（fixed）
   * ========================= */
  let selectBoxFixed = null;
  const SELECT_EPS = 0.25;
  let __selLast = { x: -9999, y: -9999, w: 0, h: 0 };

  function ensureSelectBoxFixed() {
    if (selectBoxFixed && selectBoxFixed.isConnected) return selectBoxFixed;
    selectBoxFixed = document.getElementById("isyouSelectBoxFixed");
    if (!selectBoxFixed) {
      selectBoxFixed = document.createElement("div");
      selectBoxFixed.id = "isyouSelectBoxFixed";
      selectBoxFixed.style.cssText = `
        position: fixed;
        left: 0; top: 0;
        transform: translate3d(-9999px,-9999px,0);
        width: 0px; height: 0px;
        pointer-events: none;
        z-index: 2147483650;
        border-radius: 18px;
        box-sizing: border-box;
        border: 4px solid rgba(255, 64, 64, .95);
        box-shadow: 0 0 0 3px rgba(255,255,255,.95), 0 14px 34px rgba(0,0,0,.22);
        will-change: transform, width, height;
      `;
      document.body.appendChild(selectBoxFixed);
    }
    return selectBoxFixed;
  }

  function hideSelectBox() {
    const box = ensureSelectBoxFixed();
    box.style.transform = "translate3d(-9999px,-9999px,0)";
    box.style.width = "0px";
    box.style.height = "0px";
    __selLast = { x: -9999, y: -9999, w: 0, h: 0 };
  }

  function syncSelectBoxToImg(img) {
    const box = ensureSelectBoxFixed();
    if (!img || !img.isConnected) { hideSelectBox(); return; }
    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    const x = r.left;
    const y = r.top;
    const w = r.width;
    const h = r.height;

    if (Math.abs(__selLast.x - x) > SELECT_EPS || Math.abs(__selLast.y - y) > SELECT_EPS) {
      box.style.transform = `translate3d(${x}px,${y}px,0)`;
      __selLast.x = x; __selLast.y = y;
    }
    if (Math.abs(__selLast.w - w) > SELECT_EPS) { box.style.width = `${w}px`; __selLast.w = w; }
    if (Math.abs(__selLast.h - h) > SELECT_EPS) { box.style.height = `${h}px`; __selLast.h = h; }
  }

  /* =========================
   * Hat（滑らか追従）
   * ========================= */
  const liveHats = new Map();
  const SIZE_EPS = 0.25;
  const POS_EPS = 0.15;

  function removeHatByKey(key, slot = "hat") {
    if (!key) return;
    const k = String(key);

    const ent = liveHats.get(k);
    if (ent?.hatDiv?.isConnected) {
      try { ent.hatDiv.remove(); } catch {}
    }
    liveHats.delete(k);

    try {
      ensureOverlay();
      overlay.querySelectorAll(`.isyouHat[data-key="${CSS.escape(k)}"][data-slot="${CSS.escape(slot)}"]`)
        .forEach(n => { try { n.remove(); } catch {} });
    } catch {}
  }

  function upsertHat(img, itemKey) {
    if (!img) return;
    const key = getKeyFromImg(img);
    if (!key) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    ensureOverlay();
    const k = String(key);

    let ent = liveHats.get(k);
    if (!ent || !ent.hatDiv || !ent.hatDiv.isConnected) {
      const hat = document.createElement("div");
      hat.className = "isyouHat";
      hat.dataset.key = k;
      hat.dataset.slot = "hat";
      hat.style.transform = "translate3d(-9999px,-9999px,0)";

      const hatImg = document.createElement("img");
      hatImg.alt = "hat";
      hat.appendChild(hatImg);
      overlay.appendChild(hat);

      ent = {
        hatDiv: hat,
        hatImg,
        itemKey: null,
        targetImg: null,
        last: { tx: -9999, y: -9999, w: 0, h: 0, mir: 0 }
      };
      liveHats.set(k, ent);
    } else {
      try { overlay.appendChild(ent.hatDiv); } catch {}
    }

    ent.targetImg = img;

    if (ent.itemKey !== itemKey) {
      ent.itemKey = itemKey;
      setSrcWithFallback(ent.hatImg, it.imgs, () => scheduleSyncLoop());
    }

    scheduleSyncLoop();
  }

  // ✅ FIX：反転時は tx = x + w にしてから scaleX(-1)
  function syncHatEnt(ent, ovRect) {
    const img = ent.targetImg;
    const hat = ent.hatDiv;
    if (!hat || !hat.isConnected) return false;
    if (!img || !img.isConnected) return false;

    const ir = img.getBoundingClientRect();
    if (ir.width <= 0 || ir.height <= 0) return true;

    const x = ir.left - ovRect.left;
    const y = ir.top  - ovRect.top;
    const w = ir.width;
    const h = ir.height;
    const mir = isMirrored(img) ? 1 : 0;

    const L = ent.last;

    if (Math.abs(L.w - w) > SIZE_EPS) { hat.style.width = `${w}px`; L.w = w; }
    if (Math.abs(L.h - h) > SIZE_EPS) { hat.style.height = `${h}px`; L.h = h; }

    const tx = mir ? (x + w) : x; // ★ここがズレ修正の本体

    if (Math.abs(L.tx - tx) > POS_EPS || Math.abs(L.y - y) > POS_EPS || L.mir !== mir) {
      hat.style.transform = mir
        ? `translate3d(${tx}px,${y}px,0) scaleX(-1)`
        : `translate3d(${tx}px,${y}px,0)`;
      L.tx = tx; L.y = y; L.mir = mir;
    }

    return true;
  }

  function getAllBunnyImgs() {
    const out = [];
    const list = getBunnies();
    for (const b of list) {
      const img = b?.img || b?.bunnyImg || b?.node;
      if (img && img.tagName === "IMG") out.push(img);
    }
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
    const seen = new Set();

    for (const img of imgs) {
      const key = getKeyFromImg(img);
      if (!key) continue;
      const k = String(key);
      seen.add(k);

      const eq = state.equipped[k] || {};
      const hatKey = eq.hat;

      if (hatKey && ITEMS[hatKey]) upsertHat(img, hatKey);
      else removeHatByKey(k, "hat");
    }

    for (const k of Array.from(liveHats.keys())) {
      if (!seen.has(k)) removeHatByKey(k, "hat");
    }

    scheduleSyncLoop();
  }

  /* =========================
   * Sync loop
   * ========================= */
  let __syncRaf = 0;

  function needSync() {
    if (liveHats.size > 0) return true;
    if (state.mode === "equip" && state.selectedImg) return true;
    return false;
  }

  function scheduleSyncLoop() {
    if (__syncRaf) return;
    if (!needSync()) return;
    __syncRaf = requestAnimationFrame(syncTick);
  }

  function syncTick() {
    __syncRaf = 0;
    if (!needSync()) return;

    const ov = ensureOverlay();
    const ovRect = ov.getBoundingClientRect();

    if (state.mode === "equip" && state.selectedImg) syncSelectBoxToImg(state.selectedImg);
    else hideSelectBox();

    for (const [k, ent] of liveHats) {
      const ok = syncHatEnt(ent, ovRect);
      if (!ok) removeHatByKey(k, "hat");
    }

    scheduleSyncLoop();
  }

  /* =========================
   * Modal / Confirm / Select
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

  let backdrop = null;
  let modal = null;

  function ensureModal() {
    injectStyles();
    ensureSelectBoxFixed();

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
    closeModal();
    showConfirmBar();
    toast("🐰 うさぎをクリックして選択 → 「決定」");
    scheduleSyncLoop();
  }

  function setRemoveMode(slot) {
    state.selectedItem = null;
    state.pendingAction = "remove";
    state.removeSlot = slot;
    state.mode = "equip";
    closeModal();
    showConfirmBar();
    toast("🐰 外したいうさぎをクリックして選択 → 「外す決定」");
    scheduleSyncLoop();
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
          ※「装着モード」を押したらモーダルが閉じます。うさぎをクリックして赤枠選択→上のバーで「決定」。<br>
          ※「外す」も同じく、赤枠選択→「外す決定」。
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
    const sel = state.selectedKey ? `選択：${state.selectedKey}` : "未選択";

    const modeText =
      state.pendingAction === "equip"
        ? `装着：${it ? it.label : "（未選択）"} / ${sel}`
        : `外す：${state.removeSlot || "?"} / ${sel}`;

    if (t) t.textContent = modeText;

    const hasTarget = !!state.selectedKey;
    if (doBtn) doBtn.disabled = !(hasTarget && state.pendingAction === "equip" && !!it);
    if (rmBtn) rmBtn.disabled = !(hasTarget && state.pendingAction === "remove");
  }

  function clearSelection() {
    state.selectedImg = null;
    state.selectedKey = null;
    hideSelectBox();
    updateConfirmBar();
    scheduleSyncLoop();
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

  function confirmEquip() {
    const img = state.selectedImg;
    const key = state.selectedKey;
    const itemKey = state.selectedItem;
    if (!img || !key || !itemKey) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    if (ownedCount(itemKey) <= 0) {
      toast("未所持だよ…！");
      return;
    }

    const id = String(key);
    state.equipped[id] = state.equipped[id] || {};
    state.equipped[id][it.slot] = itemKey;

    saveAll();
    upsertHat(img, itemKey);

    playEquipSe();
    toast(`✨ 装着：${it.label}`);
    cancelEquipMode(false);
  }

  function confirmRemove() {
    const key = state.selectedKey;
    if (!key) return;

    const slot = state.removeSlot || "hat";
    const id = String(key);

    state.equipped[id] = state.equipped[id] || {};
    delete state.equipped[id][slot];
    if (!Object.keys(state.equipped[id]).length) delete state.equipped[id];

    saveAll();
    removeHatByKey(key, slot);

    toast("🧺 外したよ！");
    cancelEquipMode(false);
  }

  function selectImg(img) {
    if (!img) return;
    rebuildImgBornAtMap();
    state.selectedImg = img;
    state.selectedKey = getKeyFromImg(img);
    scheduleSyncLoop();
    updateConfirmBar();
  }

  function isInsideBunnyLayer(target) {
    const layer = document.getElementById("bunnyLayer");
    if (!layer) return true;
    return layer.contains(target);
  }

  function blockGameClickIfEquipMode(e) {
    if (state.mode !== "equip") return;
    if (!e?.target) return;
    if (!isInsideBunnyLayer(e.target)) return;

    if (backdrop && backdrop.style.display !== "none") {
      const inModal = e.target?.closest?.("#isyouModal");
      if (inModal) return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onPointerDownCapture(e) {
    if (state.mode !== "equip") return;
    blockGameClickIfEquipMode(e);

    const img =
      e.target?.closest?.("#bunnyLayer img") ||
      (e.target?.tagName === "IMG" ? e.target : null) ||
      e.target?.querySelector?.("img") ||
      null;

    if (img && img.tagName === "IMG") selectImg(img);
  }

  function onPointerUpCapture(e) { blockGameClickIfEquipMode(e); }
  function onClickCapture(e) { blockGameClickIfEquipMode(e); }

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

  let __moTimer = 0;
  function requestRefresh() {
    clearTimeout(__moTimer);
    __moTimer = setTimeout(() => applyEquipsAll(), 80);
  }

  function attach(wb) {
    WB = wb || null;
    loadAll();
    injectStyles();
    ensureOverlay();
    ensureSelectBoxFixed();

    injectHudButton();
    ensureModal();
    ensureConfirmBar();

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("pointerup", onPointerUpCapture, true);
    document.addEventListener("click", onClickCapture, true);

    preloadEquipSe();

    setTimeout(applyEquipsAll, 120);
    setTimeout(applyEquipsAll, 420);
    setTimeout(applyEquipsAll, 900);
    setTimeout(applyEquipsAll, 1600);

    window.addEventListener("resize", () => scheduleSyncLoop(), { passive: true });
    window.addEventListener("scroll",  () => scheduleSyncLoop(), { passive: true });

    try {
      const layer = document.getElementById("bunnyLayer");
      if (layer) {
        const mo = new MutationObserver(() => requestRefresh());
        mo.observe(layer, { childList: true, subtree: true, attributes: true });
      }
    } catch {}
  }

  window.addEventListener("load", () => {
    injectStyles();
    loadAll();
    injectHudButton();
    ensureOverlay();
    ensureSelectBoxFixed();

    if (window.WB) attach(window.WB);
    else waitFor(() => window.WB).then((wb) => attach(wb)).catch(() => attach(null));
  });

  window.ISYOU = {
    openModal,
    closeModal,
    applyEquipsAll,
    _state: state,
    _items: ITEMS,
    _liveHats: () => liveHats,
  };
})();
