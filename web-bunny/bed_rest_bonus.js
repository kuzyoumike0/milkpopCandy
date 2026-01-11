// bed_rest_bonus.js (V4.3 - DOM bed not found fallback: read itemPlace(WB/LS) bed position)
// ✅ ベッド付近で「ランダムに寝る/起きる」 + ✅ 速度も実際に落とす + ✅ コイン微増
// ✅ ベッド検出：
//    (A) DOM: img/src + computed background-image（レイヤー配下優先）
//    (B) ✅ fallback: WB.itemPlace / localStorage の配置データから "bed" 座標を取得（DOM無しでも動く）
// ✅ うさぎ検出：.bunnyWrap（app.js準拠）
// ✅ 速度減衰：WB.getBunnies() の各bunny.baseSpeed を退避して slowMul 倍（解除で復帰）
// ✅ コイン加算：WB.addCoin / WB.setCoin / WB.coins / #coinValue
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V43__) return;
  window.__BED_REST_BONUS_V43__ = true;

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

    // ✅ 寝ない時は true（consoleで原因が一発で分かる）
    debug: true,

    // ✅ LSフォールバック探索の最大キー数（localStorage走査の上限）
    lsScanMaxKeys: 80,
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
    if (document.getElementById("wbBedRestStyleV43")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV43";
    s.textContent = `
.wbResting{ filter:saturate(0.92) brightness(1.02); opacity:0.98; }
.bunnyWrap.wbResting{ overflow: visible !important; }
.wbRestInner{ width:100%; height:100%; }
.wbResting .wbRestInner{ ${CFG.breathing ? "animation: wbBreathV43 1.45s ease-in-out infinite;" : ""} }
@keyframes wbBreathV43{
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
  animation: wbZzzFloatV43 1.15s ease-in-out infinite;
}
.wbSleepIcon{
  font-weight:1000; font-size:${CFG.zzzBig ? "16px" : "14px"};
  opacity:.92; animation: wbZzzFloatV43 1.15s ease-in-out infinite;
}
@keyframes wbZzzFloatV43{
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

  // ========= (B) ✅ WB/itemPlace/LSから配置ベッド座標を拾う =========
  function fieldRect() {
    const f = document.getElementById("field");
    if (!f) return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const r = f.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width || window.innerWidth, height: r.height || window.innerHeight };
  }

  // いろんな形の itemPlace を雑に吸収して bed 配列を返す
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
    ];

    for (const f of candidates) {
      try {
        const v = f();
        if (Array.isArray(v)) return v;
      } catch {}
    }
    return null;
  }

  function extractBedsFromItems(items) {
    if (!Array.isArray(items)) return [];
    // itemPlaceはだいたい {id/kind/item, x, y} の配列
    const beds = [];
    for (const it of items) {
      const kind = String(it?.kind ?? it?.id ?? it?.item ?? it?.type ?? "").toLowerCase();
      if (!kind) continue;
      if (kind === "bed" || kind.includes("bed")) beds.push(it);
    }
    return beds;
  }

  function bedsToCentersClient(beds) {
    const fr = fieldRect();

    // x,y が 0..1 の正規化の可能性もあるので雑対応
    const centers = [];
    for (const b of beds) {
      let x = Number(b?.x ?? b?.left ?? b?.posX ?? b?.px ?? NaN);
      let y = Number(b?.y ?? b?.top  ?? b?.posY ?? b?.py ?? NaN);

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      // 正規化っぽいなら拡大
      if (x > 0 && x <= 1.01 && fr.width) x = x * fr.width;
      if (y > 0 && y <= 1.01 && fr.height) y = y * fr.height;

      // field基準 -> client基準
      const cx = fr.left + x;
      const cy = fr.top + y;

      centers.push({ x: cx, y: cy });
    }
    return centers;
  }

  function readBedsFromLocalStorageFallback() {
    // localStorageの中から "bed" を含むJSONっぽいものを探す（上限あり）
    try {
      const keys = [];
      const max = Math.min(localStorage.length, Math.max(0, CFG.lsScanMaxKeys | 0));
      for (let i = 0; i < max; i++) keys.push(String(localStorage.key(i) || ""));
      // itemplaceっぽいキー優先
      keys.sort((a, b) => {
        const aa = a.toLowerCase().includes("itemplace") ? -1 : 0;
        const bb = b.toLowerCase().includes("itemplace") ? -1 : 0;
        return aa - bb;
      });

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
          Array.isArray(v?.list) ? v.list :
          null;

        if (!arr) continue;

        const beds = extractBedsFromItems(arr);
        if (beds.length) {
          if (CFG.debug) console.log("[bed_rest_bonus V4.3] beds from LS:", { key: k, beds: beds.length });
          return beds;
        }
      }
    } catch {}
    return [];
  }

  function getBedCentersSmart(WB) {
    // 1) DOMで取れるならそれが最強
    const domBeds = findBedElementsDOM();
    const domCenters = domBeds.map(centerOfEl).filter(Boolean);
    if (domCenters.length) return { centers: domCenters, source: "DOM" };

    // 2) WB/itemPlace
    const wbItems = getPlacedItemsFromWB(WB);
    const wbBeds = extractBedsFromItems(wbItems);
    const wbCenters = bedsToCentersClient(wbBeds);
    if (wbCenters.length) return { centers: wbCenters, source: "WB.itemPlace" };

    // 3) localStorage fallback
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

  // ========= 速度制御 =========
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

  function applySpeedSlow(WB, sleepingFlags) {
    const list = getWBunnies(WB);
    if (!list.length) return;

    const n = Math.min(list.length, sleepingFlags.length);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!b) continue;
      const sleep = !!sleepingFlags[i];
      if (!("baseSpeed" in b)) continue;

      if (sleep) {
        if (!speedBackup.has(b)) speedBackup.set(b, Number(b.baseSpeed) || 0);
        const orig = speedBackup.get(b);
        const slowed = Math.max(6, (Number(orig) || 40) * CFG.slowMul);
        try { b.baseSpeed = slowed; } catch {}
      } else {
        if (speedBackup.has(b)) {
          const orig = speedBackup.get(b);
          try { b.baseSpeed = orig; } catch {}
          speedBackup.delete(b);
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

    function tick() {
      const wraps = findBunnyWraps();
      const bed = getBedCentersSmart(WB);
      const bedCenters = bed.centers;

      if (!wraps.length || !bedCenters.length) {
        wraps.forEach(w => setRestingVisual(w, false));
        applySpeedSlow(WB, wraps.map(() => false));

        if (CFG.debug) {
          console.log("[bed_rest_bonus V4.3] no target", {
            wraps: wraps.length,
            bedCenters: bedCenters.length,
            source: bed.source,
            hint: "背景に描かれてるベッドはDOMに無いので、itemPlace配置ベッドで判定します（WB/LS fallback）。",
          });
        }
        return;
      }

      const now = Date.now();
      const thresh = (Number(CFG.radiusPx) || 0) + (Number(CFG.fatPx) || 0);

      let sleepingCount = 0;
      let nearCount = 0;
      const sleepingFlags = new Array(wraps.length).fill(false);

      for (let i = 0; i < wraps.length; i++) {
        const w = wraps[i];
        const c = centerOfEl(w);
        if (!c) {
          const st = getState(w);
          st.sleeping = false;
          st.since = 0;
          setRestingVisual(w, false);
          continue;
        }

        let near = false;
        for (const bc of bedCenters) {
          if (dist(c, bc) <= thresh) { near = true; break; }
        }
        if (near) nearCount++;

        const st = getState(w);

        if (near) st.lastNear = now;

        if (!near && st.sleeping) {
          if (now - st.lastNear > CFG.awayGraceMs) {
            st.sleeping = false;
            st.since = 0;
          }
        }

        if (near && !st.sleeping) {
          if (Math.random() < CFG.sleepChancePerTick) {
            st.sleeping = true;
            st.since = now;
          }
        }

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
        sleepingFlags[i] = st.sleeping;
        if (st.sleeping) sleepingCount++;
      }

      applySpeedSlow(WB, sleepingFlags);

      if (sleepingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = sleepingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);
        try { WB?.emit?.("sy:add", { key: "bed_sleep_bonus", delta: bonus }); } catch {}
      }

      if (CFG.debug) {
        console.log("[bed_rest_bonus V4.3] tick", {
          source: bed.source,
          wraps: wraps.length,
          bedCenters: bedCenters.length,
          nearCount,
          sleepingCount,
          thresh,
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

    console.log("[bed_rest_bonus] ready V4.3", {
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
