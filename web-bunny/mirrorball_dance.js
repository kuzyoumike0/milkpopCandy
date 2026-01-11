// mirrorball_dance.js (V4.1 - FIXED left:50% / computed px priority)
// ✅ bgcolor.js の beam（三角クリップ＋translateX(-50%)+rotate+origin 50%0%）を
//    “実座標の三角形” に変換して hit 判定する → left:50% 問題を完全修正
// ✅ V12/V13/V13.1 など wrap/beam の ID違いも自動検出
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があれば優先）
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V41__) return;
  window.__MIRRORBALL_DANCE_V41__ = true;

  const CFG = {
    tickMs: 110,
    padPx: 16,

    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v41",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    debug: false, // ← trueで当たり判定点を表示
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * WB wait
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
    if (document.getElementById("wbMirrorballDanceStyleV41")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV41";
    s.textContent = `
.wbDancing{
  filter: saturate(1.06) brightness(1.07);
}
.wbDanceInner{ width:100%; height:100%; }
.wbDancing .wbDanceInner{
  animation: wbDanceHopV41 .42s ease-in-out infinite;
}
.wbDancing .wbDanceInner img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV41 .42s ease-in-out infinite;
}
@keyframes wbDanceWiggleV41{
  0%{ transform: rotate(-4deg) translateY(0) scale(1); }
  50%{ transform: rotate(4deg) translateY(-1px) scale(1.02); }
  100%{ transform: rotate(-4deg) translateY(0) scale(1); }
}
@keyframes wbDanceHopV41{
  0%{ transform: translateY(0); }
  50%{ transform: translateY(-2px); }
  100%{ transform: translateY(0); }
}
.wbDanceSparkle{
  position:absolute;
  left:50%;
  top:-18px;
  transform:translateX(-50%);
  font-size:14px;
  font-weight:1000;
  pointer-events:none;
}
.wbDanceDbgDot{
  position:fixed;
  width:6px;
  height:6px;
  background:#ff2aa6;
  border-radius:999px;
  z-index:2147483647;
  transform:translate(-50%,-50%);
  pointer-events:none;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Utils
   * ========================= */
  function parsePx(v) {
    const s = String(v || "").trim();
    if (!s) return NaN;
    if (s.endsWith("px")) return Number(s.slice(0, -2));
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // ★ left:50% 問題の決定打
  function pxFromStyleOrComputed(styleVal, computedVal) {
    const a = parsePx(styleVal);
    if (Number.isFinite(a)) return a;
    const b = parsePx(computedVal);
    return Number.isFinite(b) ? b : NaN;
  }

  function getDOMMatrix(cs) {
    const t = String(cs.transform || "none");
    if (!t || t === "none") return new DOMMatrix();
    try { return new DOMMatrix(t); } catch { return new DOMMatrix(); }
  }

  function parseTransformOrigin(cs, w, h) {
    const parts = String(cs.transformOrigin || "50% 50%").split(/\s+/);
    const toVal = (v, size) => {
      if (v.endsWith("%")) return parseFloat(v) / 100 * size;
      if (v.endsWith("px")) return parseFloat(v);
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      ox: toVal(parts[0] || "50%", w),
      oy: toVal(parts[1] || "50%", h),
    };
  }

  function getOffsetParentRect(el) {
    const op = el.offsetParent || el.parentElement;
    return op?.getBoundingClientRect?.() || null;
  }

  /* =========================
   * Bunny center (img優先)
   * ========================= */
  function centerOfEl(wrap) {
    if (!wrap?.isConnected) return null;
    const img = wrap.querySelector("img");
    const el = img && img.getBoundingClientRect().width ? img : wrap;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function findBunnyWraps() {
    const a = Array.from(document.querySelectorAll(".bunnyWrap,.bunny-wrap"));
    if (a.length) return a;
    const layer = $("#bunnyLayer");
    if (!layer) return [];
    return [...new Set([...layer.querySelectorAll("img")].map(i => i.parentElement))];
  }

  function ensureMotionInner(wrap) {
    let inner = wrap.querySelector(":scope>.wbDanceInner");
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
    if (on) {
      wrap.classList.add("wbDancing");
      ensureMotionInner(wrap);
      if (!wrap.querySelector(".wbDanceSparkle")) {
        const s = document.createElement("div");
        s.className = "wbDanceSparkle";
        s.textContent = "✨";
        wrap.appendChild(s);
      }
    } else {
      wrap.classList.remove("wbDancing");
      wrap.querySelector(".wbDanceSparkle")?.remove();
    }
  }

  /* =========================
   * Beam detection
   * ========================= */
  function pickFXWrap() {
    return document.querySelector('[id^="bgMirrorFXWrap"]');
  }
  function getBeamsFromWrap(w) {
    if (!w) return [];
    return [...w.querySelectorAll('[id^="bgMirrorFXLeft"],[id^="bgMirrorFXRight"],.beam')];
  }

  /* =========================
   * Beam → real triangle
   * ========================= */
  function buildBeamTriangle(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity <= 0.01) return null;

    const w = parsePx(cs.width);
    const h = parsePx(cs.height);
    if (!(w > 10 && h > 10)) return null;

    const baseRect = getOffsetParentRect(el);
    if (!baseRect) return null;

    const left = pxFromStyleOrComputed(el.style.left, cs.left);
    const top  = pxFromStyleOrComputed(el.style.top,  cs.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

    const baseX = baseRect.left + left;
    const baseY = baseRect.top + top;

    const M = getDOMMatrix(cs);
    const { ox, oy } = parseTransformOrigin(cs, w, h);

    const apply = (p) => {
      const tp = M.transformPoint({ x: p.x - ox, y: p.y - oy });
      return { x: baseX + ox + tp.x, y: baseY + oy + tp.y };
    };

    return {
      p0: apply({ x: w * 0.5, y: 0 }),
      p1: apply({ x: 0, y: h }),
      p2: apply({ x: w, y: h }),
    };
  }

  function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }

  function pointInTri(pt, a, b, c, pad) {
    const d1 = sign(pt, a, b);
    const d2 = sign(pt, b, c);
    const d3 = sign(pt, c, a);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;

    const dist = (p, v, w) => {
      const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    };
    return dist(pt, a, b) <= pad || dist(pt, b, c) <= pad || dist(pt, c, a) <= pad;
  }

  /* =========================
   * Debug
   * ========================= */
  let dbg;
  function dbgMove(pt) {
    if (!CFG.debug) return;
    if (!dbg) {
      dbg = document.createElement("div");
      dbg.className = "wbDanceDbgDot";
      document.body.appendChild(dbg);
    }
    dbg.style.left = pt.x + "px";
    dbg.style.top = pt.y + "px";
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then(() => {
    ensureStyle();

    function tick() {
      const wraps = findBunnyWraps();
      const fx = pickFXWrap();
      const beams = getBeamsFromWrap(fx).map(buildBeamTriangle).filter(Boolean);

      if (!beams.length) {
        wraps.forEach(w => setDancing(w, false));
        return;
      }

      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) continue;
        dbgMove(c);
        const hit = beams.some(t => pointInTri(c, t.p0, t.p1, t.p2, CFG.padPx));
        setDancing(w, hit);
      }
    }

    tick();
    setInterval(tick, CFG.tickMs);
    console.log("[mirrorball_dance] ready V4.1 (FIXED)");
  });
})();
