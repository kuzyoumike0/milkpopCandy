// bed_rest_bonus.js (V4.4 - bed coord auto-normalize + percent/client detect + better bunny-speed mapping)
// ✅ ベッド付近で「ランダムに寝る/起きる」 + ✅ 速度も実際に落とす + ✅ コイン微増
// ✅ ベッド検出：
//    (A) DOM: img/src + computed background-image（レイヤー配下優先）
//    (B) fallback: WB.itemPlace / window.ITEMPLACE の配置データから "bed" 座標を取得（DOM無しでも動く）
//    (C) fallback: localStorage の itemPlace 系キーから配置を拾う（キー探索強化）
// ✅ 座標系：px / 0..1 / 0..100(%) / client座標 を自動判定して client座標に変換
// ✅ うさぎ検出：.bunnyWrap（app.js準拠）
// ✅ 速度減衰：WB.getBunnies() の bunny.el/wrapEl 等と .bunnyWrap を対応付けして slowMul 倍（解除で復帰）
// ✅ コイン加算：WB.addCoin / WB.setCoin / WB.coins / #coinValue
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V44__) return;
  window.__BED_REST_BONUS_V44__ = true;

  const CFG = {
    bedSrcNeedle: "assets/bg/bed.png",

    radiusPx: 170,
    fatPx: 12,

    tickMs: 180,

    sleepChancePerTick: 0.018,
    wakeChancePerTick: 0.012,
    minSleepMs: 2600,
    awayGraceMs: 900,

    bonusEveryMs: 1200,
    bonusPerBunny: 2,

    showZzz: true,
    zzzCountMax: 3,
    zzzBig: true,
    addSleepIcon: true,
    dimBunny: true,
    breathing: true,
    snorePuff: true,

    slowMul: 0.15,

    // ✅ 重要：原因追跡（true推奨、ログ量を抑える工夫済み）
    debug: true,

    // ✅ LSフォールバック探索の最大キー数（localStorage走査の上限）
    lsScanMaxKeys: 140,

    // ✅ “寝ない”切り分け用：一定間隔でだけログ
    debugEveryMs: 2200,
  };

  const $ = (q, p = document) => p.querySelector(q);

  function waitForWB(timeout = 12000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > timeout) {
          clearInterval(t);
          resolve(null);
        }
      }, 50);
    });
  }

  function ensureStyle() {
    if (document.getElementById("wbBedRestStyleV44")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV44";
    s.textContent = `
.wbResting{ filter:saturate(0.92) brightness(1.02); opacity:0.98; }
.bunnyWrap.wbResting{ overflow: visible !important; }
.wbRestInner{ width:100%; height:100%; }
.wbResting .wbRestInner{ ${CFG.breathing ? "animation: wbBreathV44 1.45s ease-in-out infinite;" : ""} }
@keyframes wbBreathV44{
  0%{ transform: translateY(0px) scale(1.00); }
  50%{ transform: translateY(-1.2px) scale(0.985); }
  100%{ transform: translateY(0px) scale(1.00); }
}
.wbResting img{ ${CFG.dimBunny ? "filter: brightness(0.96) contrast(0.98);" : ""} }
.wbZzzWrap{
  position:absolute; left:50%; top:-28px; transform:translateX(-50%);
  pointer-events:none; display:flex; gap:6px; align-items:center; justify-content:center;
  z-index:999999;
}
.wbZzz{
  font-weight:1000; font-size:${CFG.zzzBig ? "16px" : "14px"};
  opacity:.95; text-shadow:0 8px 18px rgba(0,0,0,.20);
  animation: wbZzzFloatV44 1.15s ease-in-out infinite;
}
.wbSleepIcon{
  font-weight:1000; font-size:${CFG.zzzBig ? "16px" : "14px"};
  opacity:.92; animation: wbZzzFloatV44 1.15s ease-in-out infinite;
}
@keyframes wbZzzFloatV44{
  0%{ transform: translateY(0); opacity:.85; }
  50%{ transform: translateY(-7px); opacity:1; }
  100%{ transform: translateY(0); opacity:.85; }
}
.wbSnorePuff{
  position:absolute; left:50%; top:-38px; transform: translateX(-50%);
  width:48px; height:28px; border-radius:999px;
  background: rgba(255,255,255,.86);
  box-shadow:0 14px 26px rgba(0,0,0,.10);
  pointer-events:none; opacity:.88; z-index:999998;
}
`;
    document.head.appendChild(s);
  }

  function centerOfEl(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function normNeedle(s) {
    return String(s || "").trim().toLowerCase().replace(/^\.?\//, "");
  }
  function matchNeedle(hay, needle) {
    const h = String(hay || "").toLowerCase();
    const n = normNeedle(needle);
    if (!n) return false;
    if (h.includes(n)) return true;
    if (h.includes("/" + n)) return true;
    return false;
  }

  function layerCandidates() {
    const list = [];
    const ids = ["itemLayer","itemlayer","itemsLayer","decorLayer","bgLayer","bg","field"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) list.push(el);
    }
    const field = document.getElementById("field");
    if (field && !list.includes(field)) list.push(field);
    return Array.from(new Set(list)).filter(Boolean);
  }

  // ========= (A) DOMからベッド要素探す =========
  function findBedElementsDOM() {
    const needle = CFG.bedSrcNeedle;
    const out = [];

    document.querySelectorAll('img[src*="bed"], img[src*="bed.png"], img[src*="assets/bg/bed"]').forEach(img => out.push(img));
    document.querySelectorAll('[data-item="bed"],[data-item-id="bed"],[data-kind="bed"]').forEach(e => out.push(e));

    const layers = layerCandidates();
    for (const root of layers) {
      root.querySelectorAll("img").forEach(img => {
        const src = img.getAttribute("src") || "";
        if (matchNeedle(src, needle) || /(^|\/)bed(\.png|_|\/|$)/i.test(src)) out.push(img);
      });

      const nodes = root.querySelectorAll("*");
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        let bg = "";
        try { bg = String(getComputedStyle(el).backgroundImage || ""); } catch {}
        if (!bg || bg === "none") continue;

        if (matchNeedle(bg, needle) || /bed(\.png|_)/i.test(bg)) out.push(el);
      }
    }

    return Array.from(new Set(out)).filter(Boolean);
  }

  // ========= (B/C) WB/itemPlace/LSから配置ベッド座標を拾う =========
  function fieldRect() {
    const f = document.getElementById("field");
    if (!f) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const r = f.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width || window.innerWidth, height: r.height || window.innerHeight };
  }

  // itemPlace を雑に吸収（配列を返してくれる関数を総当たり）
  function getPlacedItemsFromWB(WB) {
    if (!WB) return null;

    const candidates = [
      () => WB.itemPlace?.getPlacedItems?.(),
      () => WB.itemPlace?.getItems?.(),
      () => WB.itemPlace?.items?.(),
      () => WB.ITEMPLACE?.getPlacedItems?.(),
      () => WB.ITEMPLACE?.getItems?.(),
      () => WB.ITEMPLACE?.items?.(),
      () => window.ITEMPLACE?.getPlacedItems?.(),
      () => window.ITEMPLACE?.getItems?.(),
      () => window.ITEMPLACE?.items?.(),
      () => window.ITEMPLACE?.placedItems?.,
      () => window.ITEMPLACE?.placed?.,
      () => WB.itemPlace?.placedItems?.,
      () => WB.itemPlace?.placed?.,
    ];

    for (const f of candidates) {
      try {
        const v = (typeof f === "function") ? f() : f;
        if (Array.isArray(v)) return v;
      } catch {}
    }
    return null;
  }

  function extractBedsFromItems(items) {
    if (!Array.isArray(items)) return [];
    const beds = [];
    for (const it of items) {
      const kind = String(it?.kind ?? it?.id ?? it?.item ?? it?.type ?? it?.name ?? "").toLowerCase();
      if (!kind) continue;
      if (kind === "bed" || kind.includes("bed")) beds.push(it);
    }
    return beds;
  }

  // ★座標系を推測して client 座標に変換（px / 0..1 / 0..100(%) / client）
  function toClientPointFromAny(b, fr) {
    let x = Number(b?.x ?? b?.left ?? b?.posX ?? b?.px ?? b?.cx ?? NaN);
    let y = Number(b?.y ?? b?.top  ?? b?.posY ?? b?.py ?? b?.cy ?? NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    // サイズが取れれば中心寄せ補正
    const w = Number(b?.w ?? b?.width  ?? b?.size ?? b?.s ?? NaN);
    const h = Number(b?.h ?? b?.height ?? b?.size ?? b?.s ?? NaN);

    // 1) すでに client 座標っぽい（画面サイズ級の値）
    //    例：x=600,y=420 で fr.left/top を足すとズレるタイプ
    const looksClient =
      (x > fr.left - 10 && x < fr.left + fr.width + 10) &&
      (y > fr.top  - 10 && y < fr.top  + fr.height + 10) &&
      // かつ fr.left/top がそこそこ離れてる時に誤判定しないため
      (x > fr.left + 2 || y > fr.top + 2);

    if (looksClient) {
      let cx = x;
      let cy = y;
      // top-leftっぽいなら中心補正
      if (Number.isFinite(w)) cx += w / 2;
      if (Number.isFinite(h)) cy += h / 2;
      return { x: cx, y: cy, mode: "client" };
    }

    // 2) 0..1 正規化
    if (x >= 0 && x <= 1.01 && fr.width) x = x * fr.width;
    if (y >= 0 && y <= 1.01 && fr.height) y = y * fr.height;

    // 3) 0..100 (%) の可能性（座標が小さく、かつ 100以内）
    if (x >= 0 && x <= 100.1 && fr.width > 150) x = (x / 100) * fr.width;
    if (y >= 0 && y <= 100.1 && fr.height > 150) y = (y / 100) * fr.height;

    // 4) field基準(px) → client基準
    let cx = fr.left + x;
    let cy = fr.top + y;

    // 5) top-leftっぽいなら中心補正（サイズがあれば）
    if (Number.isFinite(w)) cx += w / 2;
    if (Number.isFinite(h)) cy += h / 2;

    return { x: cx, y: cy, mode: "field" };
  }

  function bedsToCentersClient(beds) {
    const fr = fieldRect();
    const centers = [];
    for (const b of beds) {
      const p = toClientPointFromAny(b, fr);
      if (!p) continue;
      centers.push({ x: p.x, y: p.y, __mode: p.mode });
    }
    return centers;
  }

  function readBedsFromLocalStorageFallback() {
    // localStorage から itemPlace っぽい JSON を広く拾う
    try {
      const keys = [];
      const max = Math.min(localStorage.length, Math.max(0, CFG.lsScanMaxKeys | 0));
      for (let i = 0; i < max; i++) keys.push(String(localStorage.key(i) || ""));

      // それっぽいキー優先
      const scoreKey = (k) => {
        const s = k.toLowerCase();
        let sc = 0;
        if (s.includes("itemplace")) sc += 50;
        if (s.includes("placed")) sc += 25;
        if (s.includes("state")) sc += 12;
        if (s.includes("shop")) sc += 6;
        if (s.includes("milkpop")) sc += 4;
        return -sc; // sort asc
      };
      keys.sort((a, b) => scoreKey(a) - scoreKey(b));

      for (const k of keys) {
        let raw = "";
        try { raw = String(localStorage.getItem(k) || ""); } catch {}
        if (!raw || raw.length < 8) continue;
        if (!raw.includes("bed") && !raw.includes("Bed") && !raw.includes("BED")) continue;
        if (raw[0] !== "{" && raw[0] !== "[") continue;

        let v = null;
        try { v = JSON.parse(raw); } catch { continue; }

        const arr =
          Array.isArray(v) ? v :
          Array.isArray(v?.items) ? v.items :
          Array.isArray(v?.placed) ? v.placed :
          Array.isArray(v?.placedItems) ? v.placedItems :
          Array.isArray(v?.list) ? v.list :
          Array.isArray(v?.data) ? v.data :
          null;

        if (!arr) continue;

        const beds = extractBedsFromItems(arr);
        if (beds.length) {
          if (CFG.debug) console.log("[bed_rest_bonus V4.4] beds from LS:", { key: k, beds: beds.length });
          return beds;
        }
      }
    } catch {}
    return [];
  }

  function getBedCentersSmart(WB) {
    // 1) DOM
    const domBeds = findBedElementsDOM();
    const domCenters = domBeds.map(centerOfEl).filter(Boolean);
    if (domCenters.length) return { centers: domCenters, source: "DOM" };

    // 2) WB/itemPlace
    const wbItems = getPlacedItemsFromWB(WB);
    const wbBeds = extractBedsFromItems(wbItems);
    const wbCenters = bedsToCentersClient(wbBeds);
    if (wbCenters.length) return { centers: wbCenters, source: "WB.itemPlace" };

    // 3) LS
    const lsBeds = readBedsFromLocalStorageFallback();
    const lsCenters = bedsToCentersClient(lsBeds);
    if (lsCenters.length) return { centers: lsCenters, source: "localStorage" };

    return { centers: [], source: "none" };
  }

  function findBunnyWraps() {
    return Array.from(document.querySelectorAll(".bunnyWrap")).filter(w => w && w.isConnected);
  }

  function ensureRestInner(wrap) {
    if (!wrap) return null;
    let inner = null;
    try { inner = wrap.querySelector(":scope > .wbRestInner"); } catch {}
    if (!inner) inner = wrap.querySelector(".wbRestInner");
    if (inner) return inner;

    const img = wrap.querySelector("img");
    if (!img) return null;

    inner = document.createElement("div");
    inner.className = "wbRestInner";
    wrap.insertBefore(inner, img);
    inner.appendChild(img);
    return inner;
  }

  function ensureZzz(wrap) {
    if (!CFG.showZzz || !wrap) return;
    if (wrap.querySelector(".wbZzzWrap")) return;

    if (CFG.snorePuff && !wrap.querySelector(".wbSnorePuff")) {
      const puff = document.createElement("div");
      puff.className = "wbSnorePuff";
      wrap.appendChild(puff);
    }

    const zw = document.createElement("div");
    zw.className = "wbZzzWrap";

    const n = Math.max(1, Math.min(CFG.zzzCountMax | 0, 3));
    const count = 1 + Math.floor(Math.random() * n);

    for (let i = 0; i < count; i++) {
      const z = document.createElement("div");
      z.className = "wbZzz";
      z.textContent = (i === 0) ? "Zzz…" : "Zz";
      z.style.animationDelay = `${Math.random() * 200}ms`;
      zw.appendChild(z);
    }

    if (CFG.addSleepIcon) {
      const s = document.createElement("div");
      s.className = "wbSleepIcon";
      s.textContent = "💤";
      s.style.animationDelay = `${Math.random() * 200}ms`;
      zw.appendChild(s);
    }

    wrap.appendChild(zw);
  }

  function clearZzz(wrap) {
    if (!wrap) return;
    const zw = wrap.querySelector(".wbZzzWrap");
    if (zw) { try { zw.remove(); } catch {} }
    const puff = wrap.querySelector(".wbSnorePuff");
    if (puff) { try { puff.remove(); } catch {} }
  }

  function setRestingVisual(wrap, on) {
    if (!wrap) return;
    if (on) {
      wrap.classList.add("wbResting");
      ensureRestInner(wrap);
      ensureZzz(wrap);
    } else {
      wrap.classList.remove("wbResting");
      clearZzz(wrap);
    }
  }

  // { sleeping:boolean, since:number, lastNear:number }
  const sleepState = new WeakMap();
  function getState(wrap) {
    let s = sleepState.get(wrap);
    if (!s) {
      s = { sleeping: false, since: 0, lastNear: 0 };
      sleepState.set(wrap, s);
    }
    return s;
  }

  // ========= 速度制御（DOM⇔WBうさぎを対応付け） =========
  const speedBackup = new WeakMap(); // bunnyObj -> originalBaseSpeed

  function getWBunnies(WB) {
    try {
      if (WB && typeof WB.getBunnies === "function") {
        const arr = WB.getBunnies();
        return Array.isArray(arr) ? arr : [];
      }
    } catch {}
    try { if (WB && Array.isArray(WB.bunnies)) return WB.bunnies; } catch {}
    return [];
  }

  function bunnyDomFromObj(b) {
    // いろんな実装に対応
    const cands = [
      b?.wrapEl,
      b?.wrap,
      b?.el,
      b?.node,
      b?.dom,
      b?.element,
      b?.root,
    ];
    for (const el of cands) {
      if (el && el.nodeType === 1) return el;
    }
    return null;
  }

  function buildWrapToBunnyMap(WB) {
    const map = new Map(); // wrapEl -> bunnyObj
    const list = getWBunnies(WB);
    for (const b of list) {
      const el = bunnyDomFromObj(b);
      if (!el) continue;
      // el が img の場合があるので親を辿る
      let w = el;
      if (w && !w.classList?.contains("bunnyWrap")) {
        w = w.closest?.(".bunnyWrap") || w.parentElement?.closest?.(".bunnyWrap") || null;
      }
      if (w && w.classList?.contains("bunnyWrap")) map.set(w, b);
    }
    return map;
  }

  function applySpeedSlowByWrap(WB, wrapSleepingMap) {
    const map = buildWrapToBunnyMap(WB);
    if (!map.size) return;

    for (const [wrap, bunny] of map.entries()) {
      const sleep = !!wrapSleepingMap.get(wrap);
      if (!bunny || !("baseSpeed" in bunny)) continue;

      if (sleep) {
        if (!speedBackup.has(bunny)) speedBackup.set(bunny, Number(bunny.baseSpeed) || 0);
        const orig = speedBackup.get(bunny);
        const slowed = Math.max(6, (Number(orig) || 40) * CFG.slowMul);
        try { bunny.baseSpeed = slowed; } catch {}
      } else {
        if (speedBackup.has(bunny)) {
          const orig = speedBackup.get(bunny);
          try { bunny.baseSpeed = orig; } catch {}
          speedBackup.delete(bunny);
        }
      }
    }
  }

  // ========= コイン加算 =========
  function addCoinsSafe(WB, delta) {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;

    try { if (WB && typeof WB.addCoin === "function") { WB.addCoin(d); return; } } catch {}

    try {
      if (WB && typeof WB.getCoin === "function" && typeof WB.setCoin === "function") {
        const cur = Number(WB.getCoin()) || 0;
        WB.setCoin(cur + d);
        try { WB.emit?.("coinsChanged", { coins: cur + d }); } catch {}
        return;
      }
    } catch {}

    try {
      if (WB && ("coins" in WB)) {
        const cur = Number(WB.coins) || 0;
        WB.coins = cur + d;
        try { WB.emit?.("coinsChanged", { coins: Number(WB.coins) || (cur + d) }); } catch {}
        const el = $("#coinValue");
        if (el) el.textContent = String(Number(WB.coins) || (cur + d));
        return;
      }
    } catch {}

    const el = $("#coinValue");
    if (el) {
      const cur = Number(el.textContent) || 0;
      el.textContent = String(cur + d);
    }
  }

  // ========= メイン =========
  waitForWB().then((WB) => {
    ensureStyle();

    let lastBonusAt = 0;
    let lastDbgAt = 0;

    function tick() {
      const wraps = findBunnyWraps();
      const bed = getBedCentersSmart(WB);
      const bedCenters = bed.centers;

      const now = Date.now();
      const doDbg = CFG.debug && (now - lastDbgAt >= CFG.debugEveryMs);
      if (doDbg) lastDbgAt = now;

      if (!wraps.length || !bedCenters.length) {
        wraps.forEach(w => setRestingVisual(w, false));

        // 速度復帰（sleepMap空）
        applySpeedSlowByWrap(WB, new Map());

        if (doDbg) {
          console.log("[bed_rest_bonus V4.4] no target", {
            wraps: wraps.length,
            bedCenters: bedCenters.length,
            source: bed.source,
            hint: "ベッドは itemPlace で“bed”を配置してる？（DOM背景ベッドは拾えない場合あり）",
          });
        }
        return;
      }

      const thresh = (Number(CFG.radiusPx) || 0) + (Number(CFG.fatPx) || 0);

      let sleepingCount = 0;
      let nearCount = 0;

      // wrap -> sleeping の対応を持つ（速度にも使う）
      const wrapSleepingMap = new Map();

      for (let i = 0; i < wraps.length; i++) {
        const w = wraps[i];
        const c = centerOfEl(w);
        if (!c) {
          const st = getState(w);
          st.sleeping = false;
          st.since = 0;
          setRestingVisual(w, false);
          wrapSleepingMap.set(w, false);
          continue;
        }

        let near = false;
        for (const bc of bedCenters) {
          if (dist(c, bc) <= thresh) { near = true; break; }
        }
        if (near) nearCount++;

        const st = getState(w);
        if (near) st.lastNear = now;

        // 離れたら猶予後に起床
        if (!near && st.sleeping) {
          if (now - st.lastNear > CFG.awayGraceMs) {
            st.sleeping = false;
            st.since = 0;
          }
        }

        // 近い＆起きてる → 寝る抽選
        if (near && !st.sleeping) {
          if (Math.random() < CFG.sleepChancePerTick) {
            st.sleeping = true;
            st.since = now;
          }
        }

        // 寝てる → 最低睡眠時間後に起床抽選（近い時だけ）
        if (st.sleeping) {
          const slept = now - (st.since || now);
          if (near && slept >= CFG.minSleepMs) {
            if (Math.random() < CFG.wakeChancePerTick) {
              st.sleeping = false;
              st.since = 0;
            }
          }
        }

        setRestingVisual(w, st.sleeping);
        wrapSleepingMap.set(w, st.sleeping);
        if (st.sleeping) sleepingCount++;
      }

      // 速度制御（DOMとWBうさぎの対応で適用）
      applySpeedSlowByWrap(WB, wrapSleepingMap);

      // コイン微増
      if (sleepingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = sleepingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);
        try { WB?.emit?.("sy:add", { key: "bed_sleep_bonus", delta: bonus }); } catch {}
      }

      if (doDbg) {
        console.log("[bed_rest_bonus V4.4] tick", {
          source: bed.source,
          wraps: wraps.length,
          bedCenters: bedCenters.length,
          nearCount,
          sleepingCount,
          thresh,
          // ベッド座標がどのモードで解釈されたか（WB/LS時のみ意味あり）
          bedModes: bedCenters.slice(0, 4).map(b => b.__mode).filter(Boolean),
        });
      }
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("resize", tick); } catch {}

    if (window.WB) {
      window.WB.bedRestBonus = {
        stop: () => { try { clearInterval(timer); } catch {} },
        tick,
        config: CFG,
      };
    }

    console.log("[bed_rest_bonus] ready V4.4", {
      needle: CFG.bedSrcNeedle,
      radius: CFG.radiusPx,
      sleepChancePerTick: CFG.sleepChancePerTick,
      wakeChancePerTick: CFG.wakeChancePerTick,
      minSleepMs: CFG.minSleepMs,
      slowMul: CFG.slowMul,
      bonusPerBunny: CFG.bonusPerBunny,
      debug: CFG.debug,
    });
  });
})();
