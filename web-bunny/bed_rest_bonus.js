// bed_rest_bonus.js
// ✅ ベッド付近で「休む」(動き弱め + Zzz)
// ✅ 休憩中のうさぎ数に応じてコイン微増
// ✅ assets/bg/bed.png に完全対応（img / style / computedStyle）
// ✅ itemPlace.js の実装方式に依存しない
//
// 推奨読み込み順：app.js / itemPlace.js の後（最後の方）

(() => {
  "use strict";
  if (window.__BED_REST_BONUS_V12__) return;
  window.__BED_REST_BONUS_V12__ = true;

  const CFG = {
    radiusPx: 180,          // ベッド中心からこの距離以内で休む
    tickMs: 240,

    bonusEveryMs: 1200,     // 何msごとに
    bonusPerBunny: 2,       // 1匹あたりの微増コイン

    showZzz: true,
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Wait WB
   * ========================= */
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

  /* =========================
   * Style
   * ========================= */
  function ensureStyle() {
    if (document.getElementById("wbBedRestStyleV12")) return;
    const s = document.createElement("style");
    s.id = "wbBedRestStyleV12";
    s.textContent = `
.wbResting{
  filter: saturate(0.95) brightness(1.03);
}
.wbZzz{
  position:absolute;
  left:50%;
  top:-18px;
  transform:translateX(-50%);
  font-weight:1000;
  font-size:14px;
  opacity:.9;
  pointer-events:none;
  text-shadow:0 6px 16px rgba(0,0,0,.18);
  animation:wbZzzFloat 1.2s ease-in-out infinite;
}
@keyframes wbZzzFloat{
  0%{transform:translateX(-50%) translateY(0);opacity:.8;}
  50%{transform:translateX(-50%) translateY(-6px);opacity:1;}
  100%{transform:translateX(-50%) translateY(0);opacity:.8;}
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Utils
   * ========================= */
  function centerOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* =========================
   * ベッド検出（完全版）
   * ========================= */
  function findBedElements() {
    const found = [];

    // ① data属性
    document.querySelectorAll("[data-item],[data-item-id],[data-kind],[data-id]").forEach(el => {
      const a =
        String(el.getAttribute("data-item") || "").toLowerCase() +
        String(el.getAttribute("data-item-id") || "").toLowerCase() +
        String(el.getAttribute("data-kind") || "").toLowerCase() +
        String(el.getAttribute("data-id") || "").toLowerCase();
      if (a.includes("bed")) found.push(el);
    });

    // ② img src
    document.querySelectorAll("img[src]").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (
        src.includes("assets/bg/bed.png") ||
        src.endsWith("/bed.png") ||
        src.endsWith("bed.png")
      ) {
        found.push(img);
      }
    });

    // ③ style属性に直接書いてある場合
    document.querySelectorAll("[style]").forEach(el => {
      const st = String(el.getAttribute("style") || "").toLowerCase();
      if (st.includes("bed.png") && st.includes("background")) {
        found.push(el);
      }
    });

    // ④ computedStyle（最終保険）
    const layers = [
      document.getElementById("itemLayer"),
      document.getElementById("itemsLayer"),
      document.getElementById("decorLayer"),
      document.getElementById("bgLayer"),
      document.body,
    ].filter(Boolean);

    for (const layer of layers) {
      const els = Array.from(layer.querySelectorAll("*"));
      for (const el of els) {
        try {
          const bg = String(getComputedStyle(el).backgroundImage || "").toLowerCase();
          if (bg.includes("bed.png")) found.push(el);
        } catch {}
      }
    }

    return Array.from(new Set(found)).filter(Boolean);
  }

  /* =========================
   * うさぎ検出
   * ========================= */
  function findBunnyWraps() {
    const wraps = Array.from(document.querySelectorAll(".bunnyWrap"));
    if (wraps.length) return wraps;

    const layer = $("#bunnyLayer");
    if (!layer) return [];
    return Array.from(layer.children);
  }

  function ensureZzz(wrap) {
    if (!CFG.showZzz) return;
    if (wrap.querySelector(".wbZzz")) return;
    const z = document.createElement("div");
    z.className = "wbZzz";
    z.textContent = "Zzz…";
    wrap.appendChild(z);
  }

  function setResting(wrap, on) {
    if (!wrap) return;
    if (on) {
      wrap.classList.add("wbResting");
      ensureZzz(wrap);
    } else {
      wrap.classList.remove("wbResting");
      const z = wrap.querySelector(".wbZzz");
      if (z) z.remove();
    }
  }

  function addCoinsSafe(WB, delta) {
    const d = Math.max(0, Math.floor(delta || 0));
    if (!d) return;

    try { if (WB?.addCoin) { WB.addCoin(d); return; } } catch {}
    try {
      if (typeof WB?.coins === "number") {
        WB.coins += d;
        WB.emit?.("coinsChanged", { coins: WB.coins });
        return;
      }
    } catch {}

    const el = $("#coinValue");
    if (el) el.textContent = String((Number(el.textContent) || 0) + d);
  }

  /* =========================
   * Main loop
   * ========================= */
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

      let resting = 0;
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) continue;

        let near = false;
        for (const bc of bedCenters) {
          if (dist(c, bc) <= CFG.radiusPx) { near = true; break; }
        }
        setResting(w, near);
        if (near) resting++;
      }

      const now = Date.now();
      if (resting > 0 && now - lastBonusAt >= CFG.bonusEveryMs) {
        lastBonusAt = now;
        const bonus = resting * CFG.bonusPerBunny;
        addCoinsSafe(WB, bonus);
        try { WB?.emit?.("sy:add", { key: "bed_rest", delta: bonus }); } catch {}
      }
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    WB && (WB.bedRestBonus = {
      stop: () => clearInterval(timer),
      tick,
      config: CFG,
    });

    console.log("[bed_rest_bonus] ready", { radius: CFG.radiusPx });
  });
})();
