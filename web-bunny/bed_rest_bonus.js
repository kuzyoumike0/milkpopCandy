// bed_rest_bonus.js (V3)
// ✅ ベッド付近で「休む」(Zzz + 見た目ゆっくり) + ✅ コイン微増（睡眠ボーナス）
// ✅ ベッド検出：assets/bg/bed.png を含む src / background-image を最優先で検出
// ✅ transform / pointer-events / div背景 でも getBoundingClientRect で中心を取り距離判定
// ✅ うさぎ検出：.bunnyWrap を基本。無ければ #bunnyLayer の img 親をwrap扱い
// ✅ コイン加算：WB.addCoin / WB.setCoin / WB.coins / #coinValue の順に安全フォールバック
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V3__) return;
  window.__BED_REST_BONUS_V3__ = true;

  const CFG = {
    // ✅ 確定パス（部分一致でOK）
    bedSrcNeedle: "assets/bg/bed.png",

    radiusPx: 160,
    tickMs: 200,

    bonusEveryMs: 1200,
    bonusPerBunny: 2,

    showZzz: true,

    // 判定を少し甘く
    fatPx: 10,

    // background-image 探索を軽量にしたいなら下げる
    bgScanMax: 800,
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
    if (document.getElementById("wbBedRestStyleV3")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV3";
    s.textContent = `
.wbResting{
  filter: saturate(0.96) brightness(1.03);
  opacity: 0.98;
}

/* transform競合回避：innerだけ揺らす */
.wbRestInner{ width:100%; height:100%; }
.wbResting .wbRestInner{
  animation: wbRestBobV3 1.25s ease-in-out infinite;
}
@keyframes wbRestBobV3{
  0%{ transform: translateY(0px); }
  50%{ transform: translateY(-1.5px); }
  100%{ transform: translateY(0px); }
}

.wbZzz{
  position:absolute;
  left: 50%;
  top: -18px;
  transform: translateX(-50%);
  font-weight: 1000;
  font-size: 14px;
  opacity: .92;
  pointer-events:none;
  text-shadow: 0 6px 16px rgba(0,0,0,.18);
  animation: wbZzzFloatV3 1.2s ease-in-out infinite;
}
@keyframes wbZzzFloatV3{
  0%{ transform: translateX(-50%) translateY(0); opacity:.85; }
  50%{ transform: translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform: translateX(-50%) translateY(0); opacity:.85; }
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

  // ✅ ベッド要素を探す：img src + background-image 両対応
  function findBedElements() {
    const out = [];
    const needle = getNeedle();

    // 1) img src に needle
    if (needle) {
      document.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes(needle)) out.push(img);
      });
    }

    // 2) data属性（保険）
    document.querySelectorAll('[data-item="bed"],[data-item-id="bed"],[data-kind="bed"]').forEach(e => out.push(e));

    // 3) ざっくり bed.png / /bed を含むsrc（保険）
    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("/bed") || src.includes("bed.png") || src.includes("bed_")) out.push(img);
    });

    // 4) ✅ background-image に needle を含む要素（重要）
    //    ※ 全要素を舐めると重いので上限付き
    if (needle) {
      const all = document.querySelectorAll("*");
      const max = Math.min(all.length, Math.max(0, CFG.bgScanMax | 0));
      for (let i = 0; i < max; i++) {
        const el = all[i];
        // 早期フィルタ：サイズがないものはスキップ
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        let bg = "";
        try { bg = String(getComputedStyle(el).backgroundImage || "").toLowerCase(); } catch {}
        if (bg && bg !== "none" && bg.includes(needle)) {
          out.push(el);
        }
      }
    }

    // 5) レイヤー候補の中も（あれば）
    const itemLayer = $("#itemLayer") || $("#itemlayer") || $("#itemsLayer") || $("#decorLayer") || $("#bgLayer");
    if (itemLayer && needle) {
      // img
      itemLayer.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes(needle)) out.push(img);
      });
      // background
      const nodes = itemLayer.querySelectorAll("*");
      const max2 = Math.min(nodes.length, Math.max(0, CFG.bgScanMax | 0));
      for (let i = 0; i < max2; i++) {
        const el = nodes[i];
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        let bg = "";
        try { bg = String(getComputedStyle(el).backgroundImage || "").toLowerCase(); } catch {}
        if (bg && bg !== "none" && bg.includes(needle)) out.push(el);
      }
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

  // ✅ transform競合回避：imgをinnerで包む
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
    if (!CFG.showZzz) return;
    if (!wrap || wrap.querySelector(".wbZzz")) return;
    const z = document.createElement("div");
    z.className = "wbZzz";
    z.textContent = "Zzz…";
    wrap.appendChild(z);
  }

  function setResting(wrap, on) {
    if (!wrap) return;
    if (on) {
      wrap.classList.add("wbResting");
      ensureRestInner(wrap);
      ensureZzz(wrap);
    } else {
      wrap.classList.remove("wbResting");
      const z = wrap.querySelector(".wbZzz");
      if (z) { try { z.remove(); } catch {} }
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
        return;
      }

      const bedCenters = beds.map(centerOfEl).filter(Boolean);
      if (!bedCenters.length) {
        wraps.forEach(w => setResting(w, false));
        return;
      }

      const bunnyCenters = [];
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (c) bunnyCenters.push({ wrap: w, c });
      }

      const thresh = (Number(CFG.radiusPx) || 0) + (Number(CFG.fatPx) || 0);

      let restingCount = 0;
      for (const b of bunnyCenters) {
        let near = false;
        for (const bc of bedCenters) {
          if (dist(b.c, bc) <= thresh) { near = true; break; }
        }
        setResting(b.wrap, near);
        if (near) restingCount++;
      }

      const now = Date.now();
      if (restingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;

        const bonus = restingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);

        // 実績に拾わせたい：休憩回数（1回）として投げる
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

    console.log("[bed_rest_bonus] ready V3", {
      radius: CFG.radiusPx,
      bedNeedle: CFG.bedSrcNeedle,
      bonusPerBunny: CFG.bonusPerBunny,
    });
  });
})();
