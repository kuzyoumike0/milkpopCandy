// bed_rest_bonus.js (V4 - 演出強化版)
// ✅ ベッド付近で「休む」(呼吸/うとうと/Zzz強化) + ✅ 速度も実際に落とす + ✅ コイン微増
// ✅ ベッド検出：assets/bg/bed.png を含む src / background-image を最優先
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 親
// ✅ 速度減衰：WB.getBunnies() の各bunny.baseSpeed を退避して 0.15倍（解除で復帰）
// ✅ コイン加算：WB.addCoin / WB.setCoin / WB.coins / #coinValue
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V4__) return;
  window.__BED_REST_BONUS_V4__ = true;

  const CFG = {
    bedSrcNeedle: "assets/bg/bed.png",

    radiusPx: 170,
    tickMs: 180,

    bonusEveryMs: 1200,
    bonusPerBunny: 2,

    // ✅ 演出強化
    showZzz: true,
    zzzCountMax: 3,
    zzzBig: true,
    addSleepIcon: true,      // 💤も出す
    dimBunny: true,          // 少し暗く
    breathing: true,         // 呼吸（すやすや）
    snorePuff: true,         // ふきだしっぽい丸

    // ✅ 本当に遅くする（0.15倍）
    slowMul: 0.15,

    fatPx: 12,
    bgScanMax: 900,
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
    if (document.getElementById("wbBedRestStyleV4")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV4";
    s.textContent = `
.wbResting{
  filter: saturate(0.92) brightness(1.02);
  opacity: 0.98;
}

/* transform競合回避：innerだけ動かす */
.wbRestInner{ width:100%; height:100%; }

.wbResting .wbRestInner{
  ${CFG.breathing ? "animation: wbBreathV4 1.45s ease-in-out infinite;" : ""}
}

@keyframes wbBreathV4{
  0%{ transform: translateY(0px) scale(1.00); }
  50%{ transform: translateY(-1.2px) scale(0.985); }
  100%{ transform: translateY(0px) scale(1.00); }
}

/* うさぎを少し暗く */
.wbResting img{
  ${CFG.dimBunny ? "filter: brightness(0.96) contrast(0.98);" : ""}
}

/* Zzz 本体 */
.wbZzzWrap{
  position:absolute;
  left:50%;
  top:-26px;
  transform: translateX(-50%);
  pointer-events:none;
  display:flex;
  gap:6px;
  align-items:center;
  justify-content:center;
}

.wbZzz{
  font-weight: 1000;
  font-size: ${CFG.zzzBig ? "16px" : "14px"};
  opacity: .95;
  text-shadow: 0 8px 18px rgba(0,0,0,.20);
  animation: wbZzzFloatV4 1.15s ease-in-out infinite;
}

.wbSleepIcon{
  font-weight:1000;
  font-size:${CFG.zzzBig ? "16px" : "14px"};
  opacity:.92;
  animation: wbZzzFloatV4 1.15s ease-in-out infinite;
}

@keyframes wbZzzFloatV4{
  0%{ transform: translateY(0); opacity:.85; }
  50%{ transform: translateY(-7px); opacity:1; }
  100%{ transform: translateY(0); opacity:.85; }
}

/* ふきだし丸（すやすや感） */
.wbSnorePuff{
  position:absolute;
  left:50%;
  top:-34px;
  transform: translateX(-50%);
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255,255,255,.85);
  box-shadow: 0 14px 26px rgba(0,0,0,.10);
  filter: blur(.0px);
  pointer-events:none;
  opacity:.85;
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

  function getNeedle() {
    return String(CFG.bedSrcNeedle || "").trim().toLowerCase();
  }

  function findBedElements() {
    const out = [];
    const needle = getNeedle();

    // img src
    if (needle) {
      document.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes(needle)) out.push(img);
      });
    }

    // data属性
    document.querySelectorAll('[data-item="bed"],[data-item-id="bed"],[data-kind="bed"]').forEach(e => out.push(e));

    // fallback: bed.png
    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("/bed") || src.includes("bed.png") || src.includes("bed_")) out.push(img);
    });

    // background-image（上限付き）
    if (needle) {
      const all = document.querySelectorAll("*");
      const max = Math.min(all.length, Math.max(0, CFG.bgScanMax | 0));
      for (let i = 0; i < max; i++) {
        const el = all[i];
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        let bg = "";
        try { bg = String(getComputedStyle(el).backgroundImage || "").toLowerCase(); } catch {}
        if (bg && bg !== "none" && bg.includes(needle)) out.push(el);
      }
    }

    // layer候補
    const itemLayer = $("#itemLayer") || $("#itemlayer") || $("#itemsLayer") || $("#decorLayer") || $("#bgLayer");
    if (itemLayer && needle) {
      itemLayer.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes(needle)) out.push(img);
      });
    }

    return Array.from(new Set(out)).filter(Boolean);
  }

  function findBunnyWraps() {
    const wraps = Array.from(document.querySelectorAll(".bunnyWrap, .bunny-wrap"));
    if (wraps.length) return wraps;

    const bunnyLayer = $("#bunnyLayer") || $("#bunnylayer");
    if (!bunnyLayer) return [];
    const imgs = Array.from(bunnyLayer.querySelectorAll("img"));
    const parents = imgs.map(img => img.parentElement).filter(Boolean);
    return Array.from(new Set(parents));
  }

  // transform競合回避：imgをinnerで包む
  function ensureRestInner(wrap) {
    if (!wrap) return null;
    let inner = wrap.querySelector(":scope > .wbRestInner");
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

    // ふきだし丸
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

  function setResting(wrap, on) {
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

  // ✅ 速度制御：wrap -> WB.bunny を紐付ける（bornAtがDOMに無いので、index順で対応）
  //    (十分実用。ズレても「休む見た目」は出る)
  const speedBackup = new WeakMap(); // bunnyObj -> originalBaseSpeed

  function getWBunnies(WB) {
    try {
      if (WB && typeof WB.getBunnies === "function") {
        const arr = WB.getBunnies();
        return Array.isArray(arr) ? arr : [];
      }
    } catch {}
    try {
      if (WB && Array.isArray(WB.bunnies)) return WB.bunnies;
    } catch {}
    return [];
  }

  function applySpeedSlow(WB, restingFlags) {
    // restingFlags: wraps.length と同数の true/false
    const list = getWBunnies(WB);
    if (!list.length) return;

    // wrap数とbunny数が違う可能性はあるので短い方で合わせる
    const n = Math.min(list.length, restingFlags.length);

    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!b) continue;

      const isRest = !!restingFlags[i];

      // baseSpeed が無い構造もあるのでガード
      if (!("baseSpeed" in b)) continue;

      if (isRest) {
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

  waitForWB().then((WB) => {
    ensureStyle();

    let lastBonusAt = 0;

    function tick() {
      const beds = findBedElements();
      const wraps = findBunnyWraps();

      if (!beds.length) {
        wraps.forEach(w => setResting(w, false));
        applySpeedSlow(WB, wraps.map(() => false));
        return;
      }

      const bedCenters = beds.map(centerOfEl).filter(Boolean);
      if (!bedCenters.length) {
        wraps.forEach(w => setResting(w, false));
        applySpeedSlow(WB, wraps.map(() => false));
        return;
      }

      const bunnyCenters = [];
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (c) bunnyCenters.push({ wrap: w, c });
        else bunnyCenters.push({ wrap: w, c: null });
      }

      const thresh = (Number(CFG.radiusPx) || 0) + (Number(CFG.fatPx) || 0);

      let restingCount = 0;
      const restingFlags = new Array(wraps.length).fill(false);

      for (let i = 0; i < bunnyCenters.length; i++) {
        const b = bunnyCenters[i];
        if (!b.c) { setResting(b.wrap, false); continue; }

        let near = false;
        for (const bc of bedCenters) {
          if (dist(b.c, bc) <= thresh) { near = true; break; }
        }

        restingFlags[i] = near;
        setResting(b.wrap, near);
        if (near) restingCount++;
      }

      // ✅ 本当に遅くする
      applySpeedSlow(WB, restingFlags);

      // コイン微増
      const now = Date.now();
      if (restingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = restingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);

        // 実績用イベント（任意）
        try { WB?.emit?.("sy:add", { key: "bed_rest", delta: 1 }); } catch {}
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

    console.log("[bed_rest_bonus] ready V4 (visual strong)", {
      radius: CFG.radiusPx,
      needle: CFG.bedSrcNeedle,
      slowMul: CFG.slowMul,
      bonusPerBunny: CFG.bonusPerBunny,
    });
  });
})();
