// bed_rest_bonus.js
// ✅ ベッド付近で「休む」(動き弱め + Zzz) + ✅ コイン微増（睡眠ボーナス）
// - itemPlace.js の実装がどうであれ、DOMから bed を推測（img srcに bed を含む等）
// - WB.getBunnies() があればそれも使う（無ければ #bunnyLayer を直接スキャン）
// - コイン加算は WB.addCoin / WB.setCoin / WB.coins / #coinValue の順に安全フォールバック
//
// 読み込み順：app.js / itemPlace.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V1__) return;
  window.__BED_REST_BONUS_V1__ = true;

  const CFG = {
    // ベッド中心からこの距離(px)以内なら「休む」
    radiusPx: 140,

    // 休憩状態のチェック間隔
    tickMs: 250,

    // 睡眠ボーナス：休憩中のうさぎ1匹につき 何秒ごとに何コイン増えるか
    bonusEveryMs: 1200,
    bonusPerBunny: 2, // “少し増える” の量（好みで 1〜5 くらい）

    // 休憩演出
    slowMoveClass: true,
    showZzz: true,
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
    if (document.getElementById("wbBedRestStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV1";
    s.textContent = `
/* 休憩（ゆっくり） */
.wbResting{
  filter: saturate(0.95) brightness(1.02);
  opacity: 0.98;
}
/* “動きがゆっくり” をDOM側で表現（移動がJSで制御されてても、見た目だけは休んでる感出る） */
.wbResting img{
  transform: scale(0.995);
  transition: transform .45s ease;
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
  animation: wbZzzFloat 1.2s ease-in-out infinite;
}
@keyframes wbZzzFloat{
  0%{ transform: translateX(-50%) translateY(0); opacity:.85; }
  50%{ transform: translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform: translateX(-50%) translateY(0); opacity:.85; }
}
.wbResting .wbZzz{ display:block; }
`;
    document.head.appendChild(s);
  }

  function getFieldRect() {
    const field = $("#field") || document.body;
    return { el: field, rect: field.getBoundingClientRect() };
  }

  function centerOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  // ベッド要素を探す：itemPlace.js が data を付けてくれてなくても拾う
  function findBedElements() {
    const candidates = [];

    // よくありそうな：data-item="bed" / data-item-id="bed"
    document.querySelectorAll('[data-item="bed"],[data-item-id="bed"],[data-kind="bed"]').forEach(e => candidates.push(e));

    // 画像srcに bed を含む
    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("bed")) candidates.push(img);
    });

    // たぶん itemLayer 的な場所（あれば優先）
    const itemLayer = $("#itemLayer") || $("#itemlayer") || $("#itemsLayer") || $("#decorLayer");
    if (itemLayer) {
      itemLayer.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes("bed")) candidates.push(img);
      });
    }

    // 重複除去
    return Array.from(new Set(candidates)).filter(Boolean);
  }

  // うさぎDOMを拾う（WB無しでも動く）
  function findBunnyWraps() {
    // “bunnyWrap” がある前提の保険
    const wraps = Array.from(document.querySelectorAll(".bunnyWrap, .bunny-wrap"));
    if (wraps.length) return wraps;

    // 無ければ bunnyLayer 直下の img を wrap扱い（親をwrapにする）
    const bunnyLayer = $("#bunnyLayer") || $("#bunnylayer");
    if (!bunnyLayer) return [];
    const imgs = Array.from(bunnyLayer.querySelectorAll("img"));
    const parents = imgs.map(img => img.parentElement).filter(Boolean);
    return Array.from(new Set(parents));
  }

  function ensureZzz(wrap) {
    if (!CFG.showZzz) return;
    if (!wrap || wrap.querySelector(".wbZzz")) return;
    // wrapが position:relative じゃないとズレるので付ける
    const cs = getComputedStyle(wrap);
    if (cs.position === "static") wrap.style.position = "absolute";
    const z = document.createElement("div");
    z.className = "wbZzz";
    z.textContent = "Zzz…";
    wrap.appendChild(z);
  }

  function setResting(wrap, on) {
    if (!wrap) return;
    if (on) {
      if (CFG.slowMoveClass) wrap.classList.add("wbResting");
      ensureZzz(wrap);
    } else {
      wrap.classList.remove("wbResting");
      const z = wrap.querySelector(".wbZzz");
      if (z) { try { z.remove(); } catch {} }
    }
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
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

    // 3) WB.coins
    try {
      if (WB && typeof WB.coins === "number") {
        WB.coins = (Number(WB.coins) || 0) + d;
        try { WB.emit?.("coinsChanged", { coins: WB.coins }); } catch {}
        const el = $("#coinValue");
        if (el) el.textContent = String(WB.coins);
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

  // 休憩判定ループ
  waitForWB().then((WB) => {
    ensureStyle();

    let lastBonusAt = 0;

    function tick() {
      const beds = findBedElements();
      const bCenters = [];
      const wraps = findBunnyWraps();

      // ベッドが無いなら全解除して終了
      if (!beds.length) {
        wraps.forEach(w => setResting(w, false));
        return;
      }

      // ベッド中心を列挙
      const bedCenters = beds
        .map(centerOfEl)
        .filter(Boolean);

      if (!bedCenters.length) {
        wraps.forEach(w => setResting(w, false));
        return;
      }

      // うさぎ中心を列挙
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (c) bCenters.push({ wrap: w, c });
      }

      // 休憩判定
      let restingCount = 0;
      for (const b of bCenters) {
        let near = false;
        for (const bc of bedCenters) {
          if (dist(b.c, bc) <= CFG.radiusPx) { near = true; break; }
        }
        setResting(b.wrap, near);
        if (near) restingCount++;
      }

      // コイン微増（一定間隔でまとめて加算）
      const now = Date.now();
      if (restingCount > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = restingCount * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);

        // 他モジュールへ通知（任意）
        try { WB?.emit?.("sy:add", { key: "bed_rest_bonus", delta: bonus }); } catch {}
      }
    }

    // 定期
    tick();
    const timer = setInterval(tick, CFG.tickMs);

    // 何か変わったら即反映したい場合（itemPlaceが emit していれば拾える）
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}

    // 外部停止用
    window.WB && (window.WB.bedRestBonus = {
      stop: () => { try { clearInterval(timer); } catch {} },
      tick,
      config: CFG,
    });

    console.log("[bed_rest_bonus] ready", { radius: CFG.radiusPx, bonusPerBunny: CFG.bonusPerBunny });
  });
})();
