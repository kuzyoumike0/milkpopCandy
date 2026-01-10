// bed_rest_bonus.js (V2)
// ✅ ベッド付近で「休む」(Zzz + 見た目ゆっくり) + ✅ コイン微増（睡眠ボーナス）
// ✅ ベッド検出：assets/bg/bed.png を含むsrcを最優先（あなたの環境に合わせた）
// ✅ itemPlace が pointer-events:none / div背景 / transform でも、getBoundingClientRectで中心を取って距離判定
// ✅ うさぎ検出：.bunnyWrap を基本。無ければ #bunnyLayer の img 親をwrap扱い
// ✅ コイン加算：WB.addCoin / WB.setCoin / WB.coins / #coinValue の順に安全フォールバック
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V2__) return;
  window.__BED_REST_BONUS_V2__ = true;

  const CFG = {
    // ✅ ここ重要：ベッド画像の実パス（部分一致）
    bedSrcNeedle: "assets/bg/bed.png",

    // ベッド中心からこの距離(px)以内なら「休む」
    radiusPx: 160,

    // 判定間隔
    tickMs: 200,

    // 睡眠ボーナス：休憩中のうさぎ1匹につき、何msごとに何コイン増える
    bonusEveryMs: 1200,
    bonusPerBunny: 2,

    // 休憩演出
    showZzz: true,

    // 判定を少し甘く（余白）
    fatPx: 10,
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
    if (document.getElementById("wbBedRestStyleV2")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV2";
    s.textContent = `
/* 休憩（見た目だけ） */
.wbResting{
  filter: saturate(0.96) brightness(1.03);
  opacity: 0.98;
}

/* app.jsがwrapにtransformを入れるので、演出はinner側へ（競合回避） */
.wbRestInner{
  width:100%;
  height:100%;
}
.wbResting .wbRestInner{
  animation: wbRestBobV2 1.25s ease-in-out infinite;
}
@keyframes wbRestBobV2{
  0%{ transform: translateY(0px); }
  50%{ transform: translateY(-1.5px); }
  100%{ transform: translateY(0px); }
}

/* Zzz */
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
  animation: wbZzzFloatV2 1.2s ease-in-out infinite;
}
@keyframes wbZzzFloatV2{
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

  // ✅ ベッド要素を探す（あなたの環境：assets/bg/bed.png）
  function findBedElements() {
    const out = [];

    // 1) img src に assets/bg/bed.png を含む（最優先）
    const needle = String(CFG.bedSrcNeedle || "").toLowerCase();
    if (needle) {
      document.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes(needle)) out.push(img);
      });
    }

    // 2) data属性（保険）
    document.querySelectorAll('[data-item="bed"],[data-item-id="bed"],[data-kind="bed"]').forEach(e => out.push(e));

    // 3) 文字列 "bed" を含むsrc（雑に拾う保険）
    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("/bed") || src.includes("bed.png") || src.includes("bed_")) out.push(img);
    });

    // 4) item layerっぽい場所（もし存在するならその中も優先）
    const itemLayer = $("#itemLayer") || $("#itemlayer") || $("#itemsLayer") || $("#decorLayer") || $("#bgLayer");
    if (itemLayer) {
      itemLayer.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (needle && src.includes(needle)) out.push(img);
      });
    }

    // 重複除去
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

  // ✅ transform競合回避のinnerを作る（imgを包む）
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

  // コイン加算（安全フォールバック）
  function addCoinsSafe(WB, delta) {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;

    // 1) WB.addCoin
    try {
      if (WB && typeof WB.addCoin === "function") { WB.addCoin(d); return; }
    } catch {}

    // 2) WB.getCoin + WB.setCoin
    try {
      if (WB && typeof WB.getCoin === "function" && typeof WB.setCoin === "function") {
        const cur = Number(WB.getCoin()) || 0;
        WB.setCoin(cur + d);
        try { WB.emit?.("coinsChanged", { coins: cur + d }); } catch {}
        return;
      }
    } catch {}

    // 3) WB.coins（getter/setterの可能性があるので typeof で弾かない）
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

    // 4) #coinValue
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

      // ベッドが無いなら解除
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

      const r = Math.max(0, Number(CFG.radiusPx) || 0);
      const fat = Math.max(0, Number(CFG.fatPx) || 0);
      const thresh = r + fat;

      let restingCount = 0;

      for (const b of bunnyCenters) {
        let near = false;
        for (const bc of bedCenters) {
          if (dist(b.c, bc) <= thresh) { near = true; break; }
        }
        setResting(b.wrap, near);
        if (near) restingCount++;
      }

      // コイン微増（一定間隔でまとめて）
      const now = Date.now();
      if (restingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = restingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);

        // 実績カウントに拾わせたいなら “回数” を出すのが筋（bonusはコイン量なので別キー）
        try { WB?.emit?.("sy:add", { key: "bed_rest", delta: 1 }); } catch {}
      }
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    // 変化時に即反映（無くてもOK）
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("resize", tick); } catch {}

    // 外部停止用
    if (window.WB) {
      window.WB.bedRestBonus = {
        stop: () => { try { clearInterval(timer); } catch {} },
        tick,
        config: CFG,
      };
    }

    console.log("[bed_rest_bonus] ready V2", {
      radius: CFG.radiusPx,
      bedNeedle: CFG.bedSrcNeedle,
      bonusPerBunny: CFG.bonusPerBunny,
    });
  });
})();
