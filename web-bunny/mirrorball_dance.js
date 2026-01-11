// mirrorball_dance.js (V4.2 - QUADS based / most reliable)
// ✅ beam の left/top が % のままでもOK：getBoxQuads() で “変形後の実座標” を取得
// ✅ 回転/translateX(-50%)/origin を全部反映して三角形化 → 見た目通りに当たる
// ✅ bgMirrorFXWrap / Left / Right のID違いも広めに自動検出
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V42__) return;
  window.__MIRRORBALL_DANCE_V42__ = true;

  const CFG = {
    tickMs: 110,
    padPx: 16,
    debug: false, // true: うさぎ中心点と三角頂点を表示
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
    if (document.getElementById("wbMirrorballDanceStyleV42")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV42";
    s.textContent = `
.wbDancing{ filter:saturate(1.06) brightness(1.07); }
.wbDanceInner{ width:100%; height:100%; }
.wbDancing .wbDanceInner{ animation: wbDanceHopV42 .42s ease-in-out infinite; }
.wbDancing .wbDanceInner img{
  transform-origin:50% 85%;
  animation: wbDanceWiggleV42 .42s ease-in-out infinite;
}
@keyframes wbDanceWiggleV42{
  0%{transform:rotate(-4deg) translateY(0) scale(1);}
  50%{transform:rotate(4deg) translateY(-1px) scale(1.02);}
  100%{transform:rotate(-4deg) translateY(0) scale(1);}
}
@keyframes wbDanceHopV42{
  0%{transform:translateY(0);}
  50%{transform:translateY(-2px);}
  100%{transform:translateY(0);}
}
.wbDanceSparkle{
  position:absolute; left:50%; top:-18px;
  transform:translateX(-50%);
  font-size:14px; font-weight:1000;
  pointer-events:none;
}
.wbDanceDbgDot{
  position:fixed;
  width:7px; height:7px;
  border-radius:999px;
  background:#ff2aa6;
  z-index:2147483647;
  transform:translate(-50%,-50%);
  pointer-events:none;
}
.wbDanceDbgDot.a{ background:#00c2ff; } /* tri p0 */
.wbDanceDbgDot.b{ background:#00ff88; } /* tri p1 */
.wbDanceDbgDot.c{ background:#ffd000; } /* tri p2 */
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Bunny wrap detection
   * ========================= */
  function findBunnyWraps() {
    const a = Array.from(document.querySelectorAll(".bunnyWrap,.bunny-wrap"));
    if (a.length) return a;

    const layer = $("#bunnyLayer") || $("#bunnylayer");
    if (!layer) return [];
    return [...new Set([...layer.querySelectorAll("img")].map(i => i.parentElement).filter(Boolean))];
  }

  function ensureMotionInner(wrap) {
    let inner = null;
    try { inner = wrap.querySelector(":scope>.wbDanceInner"); } catch {}
    if (inner) return inner;

    const img = wrap.querySelector("img");
    if (!img) return null;

    inner = document.createElement("div");
    inner.className = "wbDanceInner";
    wrap.insertBefore(inner, img);
    inner.appendChild(img);
    return inner;
  }

  function setDancing(wrap, on) {
    if (!wrap) return;
    if (on) {
      wrap.classList.add("wbDancing");
      ensureMotionInner(wrap);
      if (!wrap.querySelector(".wbDanceSparkle")) {
        const z = document.createElement("div");
        z.className = "wbDanceSparkle";
        z.textContent = "✨";
        wrap.appendChild(z);
      }
    } else {
      wrap.classList.remove("wbDancing");
      wrap.querySelector(".wbDanceSparkle")?.remove();
    }
  }

  function centerOfWrap(wrap) {
    if (!wrap?.isConnected) return null;
    const img = wrap.querySelector("img");
    const el = (img && img.getBoundingClientRect().width) ? img : wrap;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* =========================
   * FX wrap / beams detection
   * ========================= */
  function pickFXWrap() {
    // まず prefix
    let w = document.querySelector('[id^="bgMirrorFXWrap"]');
    if (w) return w;

    // 広めに拾う
    w = [...document.querySelectorAll("div")].find(el => {
      const id = (el.id || "");
      if (/bgMirrorFXWrap/i.test(id)) return true;
      // beamっぽい子を持ってるか
      return !!el.querySelector?.('[id^="bgMirrorFXLeft"],[id^="bgMirrorFXRight"],[id*="bgMirrorFXLeft"],[id*="bgMirrorFXRight"],.beam');
    });
    return w || null;
  }

  function getBeamsFromWrap(w) {
    if (!w) return [];
    const list = [];
    w.querySelectorAll(
      '[id^="bgMirrorFXLeft"],[id^="bgMirrorFXRight"],[id*="bgMirrorFXLeft"],[id*="bgMirrorFXRight"],.beam'
    ).forEach(el => list.push(el));
    return list.filter(el => el && el.isConnected);
  }

  /* =========================
   * Triangle build (QUADS first)
   * ========================= */
  function isVisible(el) {
    try {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (Number(cs.opacity || "1") <= 0.01) return false;
      return true;
    } catch {
      return true;
    }
  }

  function buildBeamTriangle(el) {
    if (!el?.isConnected) return null;
    if (!isVisible(el)) return null;

    // ✅ 最強：変形後の実座標Quadを使う
    try {
      if (typeof el.getBoxQuads === "function") {
        const q = el.getBoxQuads({ box: "border" })?.[0];
        if (q) {
          const pts = [
            { x: q.p1.x, y: q.p1.y },
            { x: q.p2.x, y: q.p2.y },
            { x: q.p3.x, y: q.p3.y },
            { x: q.p4.x, y: q.p4.y },
          ];

          // 上2点（yが小さい）と下2点（yが大きい）に分ける
          pts.sort((a, b) => a.y - b.y);
          const top2 = pts.slice(0, 2).sort((a, b) => a.x - b.x);
          const bot2 = pts.slice(2, 4).sort((a, b) => a.x - b.x);

          const p0 = { x: (top2[0].x + top2[1].x) / 2, y: (top2[0].y + top2[1].y) / 2 }; // 上辺中点
          const p1 = bot2[0]; // 下左
          const p2 = bot2[1]; // 下右
          return { p0, p1, p2 };
        }
      }
    } catch {}

    // フォールバック：rect近似（最終保険）
    try {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const p0 = { x: r.left + r.width / 2, y: r.top };
      const p1 = { x: r.left, y: r.bottom };
      const p2 = { x: r.right, y: r.bottom };
      return { p0, p1, p2 };
    } catch {
      return null;
    }
  }

  function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }

  function pointInTri(pt, a, b, c, pad) {
    const d1 = sign(pt, a, b);
    const d2 = sign(pt, b, c);
    const d3 = sign(pt, c, a);
    const inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    if (inside) return true;

    // pad救済：辺距離
    const dist = (p, v, w) => {
      const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
      if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = v.x + t * (w.x - v.x);
      const py = v.y + t * (w.y - v.y);
      return Math.hypot(p.x - px, p.y - py);
    };
    return (
      dist(pt, a, b) <= pad ||
      dist(pt, b, c) <= pad ||
      dist(pt, c, a) <= pad
    );
  }

  /* =========================
   * Debug dots
   * ========================= */
  let dbgCenter, dbgA, dbgB, dbgC;
  function ensureDbg() {
    if (dbgCenter) return;
    const mk = (cls) => {
      const d = document.createElement("div");
      d.className = "wbDanceDbgDot " + cls;
      document.body.appendChild(d);
      return d;
    };
    dbgCenter = mk("");
    dbgA = mk("a");
    dbgB = mk("b");
    dbgC = mk("c");
  }
  function moveDot(el, p) {
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then(() => {
    ensureStyle();

    function tick() {
      const wraps = findBunnyWraps();
      const fxWrap = pickFXWrap();
      const beamEls = getBeamsFromWrap(fxWrap);

      if (!fxWrap || !beamEls.length) {
        wraps.forEach(w => setDancing(w, false));
        return;
      }

      const tris = beamEls.map(buildBeamTriangle).filter(Boolean);
      if (!tris.length) {
        wraps.forEach(w => setDancing(w, false));
        return;
      }

      const pad = Number(CFG.padPx) || 0;

      for (const w of wraps) {
        const c = centerOfWrap(w);
        if (!c) { setDancing(w, false); continue; }

        const hit = tris.some(t => pointInTri(c, t.p0, t.p1, t.p2, pad));
        setDancing(w, hit);

        // debug: 1つ目の三角形と中心点を見る
        if (CFG.debug && tris[0]) {
          ensureDbg();
          moveDot(dbgCenter, c);
          moveDot(dbgA, tris[0].p0);
          moveDot(dbgB, tris[0].p1);
          moveDot(dbgC, tris[0].p2);
        }
      }
    }

    tick();
    setInterval(tick, CFG.tickMs);

    console.log("[mirrorball_dance] ready V4.2 (QUADS)", {
      tickMs: CFG.tickMs,
      padPx: CFG.padPx,
      quads: !!Element.prototype.getBoxQuads,
    });
  });
})();
