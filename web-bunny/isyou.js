// isyou.js — お洒落（ショップ＋着せ替え＋赤枠選択＋決定式で外す＋flip完全対応＋SE）完全版（V30.3）
// ✅ V30.3 修正点：partyhat/crown/ribbon/ahiru/aimasuku を「実寸（naturalWidth/Height）」で表示
// - fit を ratio(割合) / natural(実寸) の両対応に
// - node(スロットDIV) の transform は位置調整(translate)に使うので、反転は img 側に適用（衝突防止）
// - 画像ロード完了時に natural が確定するので、onload で fit を再適用
// - 12fps同期・アクセがある時だけ維持

(() => {
  "use strict";
  console.log("[isyou.js] LOADED V30.3", Date.now());

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
    owned: "wb_isyou_owned_v10",
    equipped: "wb_isyou_equipped_v10",
  };

  function imgCandidates(name) {
    return [
      `./assets/isyou/${name}`,
      `assets/isyou/${name}`,
      `./assets/${name}`,
      `assets/${name}`,
    ].map(absUrl);
  }

  // ✅ FIT（V30.3）
  // - mode:"natural" -> 画像ファイルの実寸（naturalWidth/Height）で表示（scaleで微調整）
  // - anchor: "top-center" / "center" / "top-left" / "top-right"
  // - x/y は px オフセット（微調整）
  const FIT = {
    headHat:   { mode: "natural", anchor: "top-center", x: 0, y: -8, scale: 1 },
    headHat2:  { mode: "natural", anchor: "top-center", x: 0, y: -6, scale: 1 },
    headSmall: { mode: "natural", anchor: "top-center", x: 0, y: -2, scale: 1 },
    eyeMask:   { mode: "natural", anchor: "center",     x: 0, y:  8, scale: 1 },

    // ※ ratio を使いたい場合の例（保険）
    // headRatio: { mode:"ratio", w:0.55, h:0.45, x:0.225, y:-0.10 },
  };

  const ITEMS = {
    partyhat: { slot: "hat", label: "パーティーハット", imgs: imgCandidates("partyhat.png"), price: 500, fit: FIT.headHat2 },
    crown:    { slot: "hat", label: "クラウン",         imgs: imgCandidates("crown.png"),    price: 900, fit: FIT.headHat },
    ribbon:   { slot: "hat", label: "リボン",           imgs: imgCandidates("ribbon.png"),   price: 700, fit: FIT.headHat2 },
    ahiru:    { slot: "hat", label: "アヒル",           imgs: imgCandidates("ahiru.png"),    price: 450, fit: FIT.headSmall },
    aimasuku: { slot: "hat", label: "アイマスク",       imgs: imgCandidates("aimasuku.png"), price: 650, fit: FIT.eyeMask },
  };

  function getItemFit(itemKey) {
    const it = ITEMS[itemKey];
    return it?.fit || { mode: "ratio", w: 1, h: 1, x: 0, y: 0 };
  }

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
    selectedKey: null,
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
   * Key（bornAt優先 / fallbackはdata-isyou-key）
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
   * Styles（アクセは各wrap内 / 赤枠はglobal box）
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV303")) return;

    const s = document.createElement("style");
    s.id = "isyouStyleV303";
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

/* ✅ 選択枠 */
#isyouSelectBox{
  position:fixed;
  left:-9999px; top:-9999px;
  width:0; height:0;
  pointer-events:none;
  z-index:2147483650;
  border-radius: 18px;
  box-sizing: border-box;
  border: 4px solid rgba(255, 64, 64, .95);
  box-shadow:
    0 0 0 3px rgba(255,255,255,.95),
    0 14px 34px rgba(0,0,0,.22);
}

/* ✅ 各うさぎwrap内アクセ */
.isyouAcc{
  position:absolute !important;
  left:0; top:0;
  width:0; height:0;
  pointer-events:none !important;
  overflow: visible !important;
  z-index: 5 !important;
}
.isyouAcc .slot{
  position:absolute;
  left:0; top:0;
  width:10px; height:10px;
  transform-origin: 50% 50%;
}
.isyouAcc img{
  width:100%;
  height:100%;
  display:block;
  object-fit: contain;
  pointer-events:none;
  transform-origin: 50% 50%;
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
   * Red selection box
   * ========================= */
  let selectBox = null;

  function ensureSelectBox() {
    if (selectBox && selectBox.isConnected) return selectBox;
    selectBox = document.createElement("div");
    selectBox.id = "isyouSelectBox";
    document.body.appendChild(selectBox);
    return selectBox;
  }

  function hideSelectBox() {
    ensureSelectBox();
    selectBox.style.left = "-9999px";
    selectBox.style.top = "-9999px";
    selectBox.style.width = "0px";
    selectBox.style.height = "0px";
  }

  function syncSelectBoxToImg(img) {
    if (!img || !img.isConnected) { hideSelectBox(); return; }
    ensureSelectBox();
    const ir = img.getBoundingClientRect();
    if (ir.width <= 0 || ir.height <= 0) return;
    selectBox.style.left = `${ir.left}px`;
    selectBox.style.top  = `${ir.top }px`;
    selectBox.style.width  = `${ir.width }px`;
    selectBox.style.height = `${ir.height}px`;
  }

  /* =========================
   * Accessory per wrap
   * ========================= */
  function ensureSafePositioning(el) {
    try {
      const pos = getComputedStyle(el).position;
      if (pos === "static") el.style.position = "relative";
    } catch {}
  }

  function getWrapFromBunnyImg(img) {
    if (!img) return null;
    return img.closest?.(".bunnyWrap") || img.parentElement || null;
  }

  function ensureAccContainer(wrap) {
    if (!wrap) return null;
    ensureSafePositioning(wrap);
    try { wrap.style.overflow = "visible"; } catch {}

    let box = wrap.querySelector(":scope > .isyouAcc");
    if (!box) {
      box = document.createElement("div");
      box.className = "isyouAcc";
      wrap.appendChild(box);
    } else {
      try { wrap.appendChild(box); } catch {}
    }
    return box;
  }

  function removeAccSlot(wrap, slot) {
    if (!wrap) return;
    const box = wrap.querySelector(":scope > .isyouAcc");
    if (!box) return;
    box.querySelectorAll(`[data-slot="${slot}"]`).forEach(n => { try { n.remove(); } catch {} });
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

  function syncAccToImgRect(wrap, img, box) {
    if (!wrap || !img || !box) return false;
    try {
      const wr = wrap.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      const w = ir.width || 0;
      const h = ir.height || 0;
      if (w <= 0 || h <= 0) return false;

      box.style.left = `${(ir.left - wr.left)}px`;
      box.style.top  = `${(ir.top  - wr.top )}px`;
      box.style.width  = `${w}px`;
      box.style.height = `${h}px`;
      return true;
    } catch {
      return false;
    }
  }

  // ✅ V30.3: fit（ratio / natural）
  function applyFitToNode(node, fit, accImg) {
    const mode = String(fit?.mode || "ratio");

    // ===== 実寸（画像ファイルの naturalWidth / naturalHeight） =====
    if (mode === "natural") {
      const scale = Number(fit?.scale ?? 1) || 1;
      const nw = (accImg?.naturalWidth  || 0);
      const nh = (accImg?.naturalHeight || 0);

      // natural がまだ取れない場合の保険（onloadで再適用される）
      const wpx = Math.max(1, Math.round((nw || 64) * scale));
      const hpx = Math.max(1, Math.round((nh || 64) * scale));

      node.style.width  = `${wpx}px`;
      node.style.height = `${hpx}px`;

      const anchor = String(fit?.anchor || "top-center");
      const x = Number(fit?.x ?? 0) || 0;
      const y = Number(fit?.y ?? 0) || 0;

      if (anchor === "center") {
        node.style.left = "50%";
        node.style.top  = "50%";
        node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      } else if (anchor === "top-left") {
        node.style.left = "0%";
        node.style.top  = "0%";
        node.style.transform = `translate(${x}px, ${y}px)`;
      } else if (anchor === "top-right") {
        node.style.left = "100%";
        node.style.top  = "0%";
        node.style.transform = `translate(-100%, 0%) translate(${x}px, ${y}px)`;
      } else {
        // top-center
        node.style.left = "50%";
        node.style.top  = "0%";
        node.style.transform = `translate(-50%, 0%) translate(${x}px, ${y}px)`;
      }
      return;
    }

    // ===== 従来の割合表示 =====
    const w = Math.max(0.01, Number(fit?.w ?? 1));
    const h = Math.max(0.01, Number(fit?.h ?? 1));
    const x = Number(fit?.x ?? 0);
    const y = Number(fit?.y ?? 0);

    node.style.width  = `${w * 100}%`;
    node.style.height = `${h * 100}%`;
    node.style.left   = `${x * 100}%`;
    node.style.top    = `${y * 100}%`;
    node.style.transform = "";
  }

  // アクセ要素の再利用（軽量）
  const liveAcc = new Map(); // key -> { img, wrap, box, slotNodes: Map(slot->node), itemBySlot: Map(slot->itemKey) }

  function upsertAcc(img, slot, itemKey) {
    const key = getKeyFromImg(img);
    if (!key) return;

    const wrap = getWrapFromBunnyImg(img);
    if (!wrap) return;

    const box = ensureAccContainer(wrap);
    if (!box) return;

    let ent = liveAcc.get(String(key));
    if (!ent) {
      ent = { img, wrap, box, slotNodes: new Map(), itemBySlot: new Map() };
      liveAcc.set(String(key), ent);
    } else {
      ent.img = img;
      ent.wrap = wrap;
      ent.box = box;
    }

    let node = ent.slotNodes.get(slot);
    if (!node || !node.isConnected) {
      node = document.createElement("div");
      node.className = "slot";
      node.dataset.slot = slot;
      ent.box.appendChild(node);
      ent.slotNodes.set(slot, node);
    } else {
      try { ent.box.appendChild(node); } catch {}
    }

    ent.itemBySlot.set(slot, itemKey);

    let accImg = node.querySelector("img");
    if (!accImg) {
      accImg = document.createElement("img");
      accImg.alt = slot;
      node.appendChild(accImg);
    }

    const it = ITEMS[itemKey];
    if (!it) return;

    // ✅ サイズ/位置（実寸モード対応）
    applyFitToNode(node, getItemFit(itemKey), accImg);

    // ✅ 反転追従は img 側に（node transform と衝突させない）
    const wrapMir = isMirrored(wrap);
    const imgMir  = isMirrored(img);
    accImg.style.transform = (!wrapMir && imgMir) ? "scaleX(-1)" : "none";

    setSrcWithFallback(accImg, it.imgs, () => {
      // naturalWidth/Height 確定後に fit を当て直す
      applyFitToNode(node, getItemFit(itemKey), accImg);
      scheduleSyncLoop();
    });

    scheduleSyncLoop();
  }

  function removeAccByKey(key, slot = "hat") {
    const ent = liveAcc.get(String(key));
    if (ent?.slotNodes) {
      const node = ent.slotNodes.get(slot);
      if (node && node.isConnected) { try { node.remove(); } catch {} }
      ent.slotNodes.delete(slot);
      ent.itemBySlot.delete(slot);
      if (ent.slotNodes.size === 0) liveAcc.delete(String(key));
    }

    const imgs = getAllBunnyImgs();
    for (const img of imgs) {
      const k = getKeyFromImg(img);
      if (String(k) !== String(key)) continue;
      const wrap = getWrapFromBunnyImg(img);
      removeAccSlot(wrap, slot);
    }
  }

  /* =========================
   * Bunny img detect
   * ========================= */
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
    rebuildImgBornAtMap();

    const imgs = getAllBunnyImgs();
    for (const img of imgs) {
      const key = getKeyFromImg(img);
      if (!key) continue;

      const eq = state.equipped[String(key)] || {};
      const hatKey = eq.hat;

      if (hatKey && ITEMS[hatKey]) upsertAcc(img, "hat", hatKey);
      else {
        const wrap = getWrapFromBunnyImg(img);
        removeAccSlot(wrap, "hat");
        liveAcc.delete(String(key));
      }
    }

    if (state.mode === "equip" && state.selectedImg) syncSelectBoxToImg(state.selectedImg);
    scheduleSyncLoop();
  }

  /* =========================
   * Lightweight sync loop (12fps)
   * ========================= */
  let __syncRaf = 0;
  let __syncLast = 0;

  function scheduleSyncLoop() {
    if (__syncRaf) return;
    if (liveAcc.size === 0 && !(state.mode === "equip" && state.selectedImg)) return;
    __syncRaf = requestAnimationFrame(syncTick);
  }

  function syncTick(ts) {
    __syncRaf = 0;

    if (ts - __syncLast < 80) { // ~12fps
      scheduleSyncLoop();
      return;
    }
    __syncLast = ts;

    if (state.mode === "equip" && state.selectedImg) syncSelectBoxToImg(state.selectedImg);

    if (liveAcc.size > 0) {
      for (const [key, ent] of liveAcc) {
        const img = ent.img;
        if (!img || !img.isConnected) { liveAcc.delete(key); continue; }

        const wrap = getWrapFromBunnyImg(img);
        if (!wrap) { liveAcc.delete(key); continue; }

        const box = ensureAccContainer(wrap);
        if (!box) { liveAcc.delete(key); continue; }

        ent.wrap = wrap;
        ent.box = box;

        syncAccToImgRect(wrap, img, box);

        const wrapMir = isMirrored(wrap);
        const imgMir  = isMirrored(img);

        for (const [slot, node] of ent.slotNodes.entries()) {
          if (!node || !node.isConnected) continue;

          const itemKey = ent.itemBySlot.get(slot);
          const accImg = node.querySelector("img");

          if (itemKey) applyFitToNode(node, getItemFit(itemKey), accImg);

          // ✅ 反転は img 側
          if (accImg) {
            accImg.style.transform = (!wrapMir && imgMir) ? "scaleX(-1)" : "none";
          }
        }
      }
    }

    if (liveAcc.size > 0 || (state.mode === "equip" && state.selectedImg)) scheduleSyncLoop();
  }

  /* =========================
   * Modal
   * ========================= */
  let backdrop = null;
  let modal = null;

  function ensureModal() {
    injectStyles();
    ensureSelectBox();

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

    upsertAcc(img, it.slot, itemKey);
    scheduleSyncLoop();

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
    removeAccByKey(key, slot);

    toast("🧺 外したよ！");
    cancelEquipMode(false);
  }

  /* =========================
   * Selection
   * ========================= */
  function selectImg(img) {
    if (!img) return;

    rebuildImgBornAtMap();
    const key = getKeyFromImg(img);

    state.selectedImg = img;
    state.selectedKey = key;

    syncSelectBoxToImg(img);
    scheduleSyncLoop();
    updateConfirmBar();
  }

  /* =========================
   * Block coin clicks while equip mode
   * ========================= */
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
    ensureSelectBox();

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
        let t = 0;
        const mo = new MutationObserver(() => {
          clearTimeout(t);
          t = setTimeout(() => applyEquipsAll(), 50);
        });
        mo.observe(layer, { childList: true, subtree: true, attributes: true });
      }
    } catch {}
  }

  window.addEventListener("load", () => {
    injectStyles();
    loadAll();
    injectHudButton();
    ensureSelectBox();

    if (window.WB) attach(window.WB);
    else waitFor(() => window.WB).then((wb) => attach(wb)).catch(() => attach(null));
  });

  /* =========================
   * Debug
   * ========================= */
  window.ISYOU = {
    openModal,
    closeModal,
    applyEquipsAll,
    _state: state,
    _items: ITEMS,
    _liveAcc: () => liveAcc,
  };
})();
