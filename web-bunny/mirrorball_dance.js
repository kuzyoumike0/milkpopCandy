// mirrorball_dance.js (V4 - FIX: beam parent coords / exact triangle world transform)
// ✅ bgcolor.js の beam（三角形）に“当たってる時だけ”踊る（本物の三角判定）
// ✅ V12/V13/V13.1 など IDが違っても自動検出（bgMirrorFXWrapV* / LeftV* / RightV* / .beam）
// ✅ beam の座標系（bgLayer/field）差を offsetParent 基準で正しく復元（←ここが確実ポイント）
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V4__) return;
  window.__MIRRORBALL_DANCE_V4__ = true;

  const CFG = {
    tickMs: 120,

    // ✅ ちょい甘く（チラつき防止）
    padPx: 14,

    // ✅ SE（任意）
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v4",
    seStartDelayMs: 120,
    stopFadeMs: 180,
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
    if (document.getElementById("wbMirrorballDanceStyleV4")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV4";
    s.textContent = `
.wbDancing{ filter: saturate(1.05) brightness(1.07); }
.wbDanceInner{ width:100%; height:100%; }
.wbDancing .wbDanceInner{ animation: wbDanceHopV4 .42s ease-in-out infinite; }
.wbDancing .wbDanceInner img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV4 .42s ease-in-out infinite;
}
@keyframes wbDanceWiggleV4{
  0%   { transform: rotate(-4deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(4deg)  translateY(-1px) scale(1.02); }
  100% { transform: rotate(-4deg) translateY(0px) scale(1.00); }
}
@keyframes wbDanceHopV4{
  0%   { transform: translateY(0px); }
  50%  { transform: translateY(-2px); }
  100% { transform: translateY(0px); }
}
.wbDanceSparkle{
  position:absolute; left:50%; top:-18px; transform:translateX(-50%);
  font-weight:1000; font-size:14px; opacity:.92; pointer-events:none;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
  animation: wbSparkleFloatV4 .7s ease-in-out infinite;
}
@keyframes wbSparkleFloatV4{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}`;
    document.head.appendChild(s);
  }

  function centerOfEl(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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

  // ✅ bed_rest_bonus の wbRestInner を優先利用（競合回避）
  function ensureMotionInner(wrap) {
    if (!wrap) return null;
    let inner = null;
    try { inner = wrap.querySelector(":scope > .wbRestInner"); } catch {}
    if (!inner) { try { inner = wrap.querySelector(":scope > .wbDanceInner"); } catch {} }
    if (!inner) inner = wrap.querySelector(".wbRestInner") || wrap.querySelector(".wbDanceInner");
    if (inner) {
      if (!inner.classList.contains("wbDanceInner")) inner.classList.add("wbDanceInner");
      return inner;
    }

    const img = wrap.querySelector("img");
    if (!img) return null;
    inner = document.createElement("div");
    inner.className = "wbDanceInner";
    wrap.insertBefore(inner, img);
    inner.appendChild(img);
    return inner;
  }

  function ensureSparkle(wrap) {
    if (!wrap || wrap.querySelector(".wbDanceSparkle")) return;
    const z = document.createElement("div");
    z.className = "wbDanceSparkle";
    z.textContent = "✨";
    wrap.appendChild(z);
  }

  function setDancing(wrap, on) {
    if (!wrap) return;
    if (on) {
      wrap.classList.add("wbDancing");
      ensureMotionInner(wrap);
      ensureSparkle(wrap);
    } else {
      wrap.classList.remove("wbDancing");
      const z = wrap.querySelector(".wbDanceSparkle");
      if (z) { try { z.remove(); } catch {} }
    }
  }

  // ===== beam 検出（V12/V13/V13.1 全対応）=====
  function pickFXWrap() {
    const wraps = Array.from(document.querySelectorAll('[id^="bgMirrorFXWrapV"]'));
    if (!wraps.length) {
      const maybe = Array.from(document.querySelectorAll("div")).filter(el => {
        const id = (el.id || "");
        if (/bgMirrorFXWrap/i.test(id)) return true;
        const hasBeamId = el.querySelector?.('[id^="bgMirrorFXLeftV"],[id^="bgMirrorFXRightV"]');
        const hasBeamClass = el.querySelector?.(".beam");
        return !!(hasBeamId || hasBeamClass);
      });
      wraps.push(...maybe);
    }

    for (const w of wraps) {
      if (!w || !w.isConnected) continue;
      let cs;
      try { cs = getComputedStyle(w); } catch { cs = null; }
      if (!cs) continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (Number(cs.opacity || "1") <= 0.01) continue;
      return w;
    }
    return wraps.find(w => w && w.isConnected) || null;
  }

  function getBeamsFromWrap(wrap) {
    if (!wrap || !wrap.isConnected) return [];
    const list = [];
    wrap.querySelectorAll('[id^="bgMirrorFXLeftV"],[id^="bgMirrorFXRightV"]').forEach(el => list.push(el));
    if (!list.length) wrap.querySelectorAll(".beam").forEach(el => list.push(el));
    return list.filter(el => el && el.isConnected);
  }

  function parsePx(v) {
    const n = Number(String(v || "").replace("px", ""));
    return Number.isFinite(n) ? n : 0;
  }

  function parseRotateDeg(transformStr) {
    const s = String(transformStr || "");
    const m = s.match(/rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/i);
    if (m) return Number(m[1]) || 0;
    return 0;
  }

  // ===== 2D行列（最小限）=====
  function mul(A, B) {
    // A,B: [a,b,c,d,e,f]  (x' = ax + cy + e, y' = bx + dy + f)
    return [
      A[0]*B[0] + A[2]*B[1],
      A[1]*B[0] + A[3]*B[1],
      A[0]*B[2] + A[2]*B[3],
      A[1]*B[2] + A[3]*B[3],
      A[0]*B[4] + A[2]*B[5] + A[4],
      A[1]*B[4] + A[3]*B[5] + A[5],
    ];
  }
  function T(tx, ty) { return [1,0,0,1,tx,ty]; }
  function R(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c,s,-s,c,0,0];
  }
  function applyM(M, p) {
    return { x: M[0]*p.x + M[2]*p.y + M[4], y: M[1]*p.x + M[3]*p.y + M[5] };
  }

  // ✅ beam の “実際の親(=座標系)” を基準に triangle の3頂点を viewport 座標で作る
  function buildTriangleWorld(beamEl) {
    if (!beamEl || !beamEl.isConnected) return null;

    let cs;
    try { cs = getComputedStyle(beamEl); } catch { cs = null; }
    if (!cs) return null;
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    if (Number(cs.opacity || "1") <= 0.001) return null;

    const w = parsePx(beamEl.style.width || cs.width);
    const h = parsePx(beamEl.style.height || cs.height);
    if (!(w > 10 && h > 10)) return null;

    // left/top は親（offsetParent）座標
    const left = parsePx(beamEl.style.left || cs.left);
    const top  = parsePx(beamEl.style.top  || cs.top);

    const parent = beamEl.offsetParent || beamEl.parentElement;
    if (!parent || !parent.getBoundingClientRect) return null;
    const pr = parent.getBoundingClientRect();

    // transform: translateX(-50%) rotate(deg)
    const deg = parseRotateDeg(beamEl.style.transform || cs.transform);
    const rad = (deg * Math.PI) / 180;

    // origin: 50% 0%（bgcolor.js の style）
    const ox = w * 0.5;
    const oy = 0;

    // CSS transform の適用順を再現：
    // pos = parentRect + left/top
    // M = T(pos) * [ T(origin) R T(-origin) ] * T(-w/2, 0)
    const pos = T(pr.left + left, pr.top + top);
    const rot = mul(mul(T(ox, oy), R(rad)), T(-ox, -oy));
    const pre = T(-w * 0.5, 0);
    const M = mul(mul(pos, rot), pre);

    // clip-path triangle: (w/2,0), (0,h), (w,h)
    const p0 = applyM(M, { x: w * 0.5, y: 0 });
    const p1 = applyM(M, { x: 0,       y: h });
    const p2 = applyM(M, { x: w,       y: h });

    return [p0, p1, p2];
  }

  function pointInTri(P, A, B, C) {
    // barycentric (sign)
    const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = s(P, A, B);
    const d2 = s(P, B, C);
    const d3 = s(P, C, A);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }

  function distPointToSeg(P, A, B) {
    const vx = B.x - A.x, vy = B.y - A.y;
    const wx = P.x - A.x, wy = P.y - A.y;
    const c1 = vx*wx + vy*wy;
    if (c1 <= 0) return Math.hypot(P.x - A.x, P.y - A.y);
    const c2 = vx*vx + vy*vy;
    if (c2 <= c1) return Math.hypot(P.x - B.x, P.y - B.y);
    const t = c1 / c2;
    const px = A.x + t * vx, py = A.y + t * vy;
    return Math.hypot(P.x - px, P.y - py);
  }

  function hitTrianglePadded(P, tri, pad) {
    const [A,B,C] = tri;
    if (pointInTri(P, A,B,C)) return true;
    // pad: 辺への距離で拡張
    if (pad <= 0) return false;
    const d = Math.min(
      distPointToSeg(P, A, B),
      distPointToSeg(P, B, C),
      distPointToSeg(P, C, A)
    );
    return d <= pad;
  }

  // ===== SE（WB.se優先、fallback Audio）=====
  function getSeVolume(WB) {
    try {
      if (WB && typeof WB.getSEVolume === "function") {
        const v = Number(WB.getSEVolume());
        return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
      }
    } catch {}
    return 1;
  }

  const audioFallback = {
    el: null,
    playing: false,
    start(WB) {
      if (this.playing) return;
      if (!this.el) {
        const a = new Audio(CFG.seSrc);
        a.loop = true;
        a.preload = "auto";
        this.el = a;
      }
      this.el.volume = getSeVolume(WB);
      this.el.currentTime = 0;
      const p = this.el.play();
      this.playing = true;
      if (p && typeof p.catch === "function") p.catch(() => {});
    },
    stop() {
      if (!this.el || !this.playing) return;
      const a = this.el;
      this.playing = false;

      const startVol = a.volume || 1;
      const t0 = Date.now();
      const fade = () => {
        const t = Date.now() - t0;
        const k = Math.max(0, 1 - (t / Math.max(1, CFG.stopFadeMs)));
        a.volume = startVol * k;
        if (k <= 0.02) {
          try { a.pause(); } catch {}
          try { a.currentTime = 0; } catch {}
          a.volume = startVol;
          return;
        }
        requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    },
    syncVolume(WB) {
      if (!this.el) return;
      this.el.volume = getSeVolume(WB);
    },
  };

  function startLoopSe(WB) {
    try {
      if (WB && WB.se && typeof WB.se.loop === "function") {
        try { WB.se.loop(CFG.seLoopId, CFG.seSrc); return true; } catch {}
        try { WB.se.loop(CFG.seSrc); return true; } catch {}
      }
    } catch {}
    audioFallback.start(WB);
    return true;
  }

  function stopLoopSe(WB) {
    try {
      if (WB && WB.se && typeof WB.se.stop === "function") {
        try { WB.se.stop(CFG.seLoopId); return true; } catch {}
        try { WB.se.stop(CFG.seSrc); return true; } catch {}
      }
    } catch {}
    audioFallback.stop();
    return true;
  }

  function syncSeVolume(WB) {
    audioFallback.syncVolume(WB);
  }

  // ===== メイン =====
  waitForWB().then((WB) => {
    ensureStyle();

    let wantSe = false;
    let seOn = false;
    let seTimer = 0;

    function applySeState() {
      if (seTimer) { clearTimeout(seTimer); seTimer = 0; }

      if (wantSe && !seOn) {
        seTimer = setTimeout(() => {
          seTimer = 0;
          seOn = true;
          startLoopSe(WB);
        }, CFG.seStartDelayMs);
      } else if (!wantSe && seOn) {
        seOn = false;
        stopLoopSe(WB);
      } else {
        syncSeVolume(WB);
      }
    }

    function tick() {
      const wraps = findBunnyWraps();
      const fxWrap = pickFXWrap();
      const beamEls = getBeamsFromWrap(fxWrap);

      if (!fxWrap || !beamEls.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      // wrap自体が非表示なら無効
      try {
        const cs = getComputedStyle(fxWrap);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") <= 0.01) {
          wraps.forEach(w => setDancing(w, false));
          wantSe = false;
          applySeState();
          return;
        }
      } catch {}

      const tris = [];
      for (const el of beamEls) {
        const tri = buildTriangleWorld(el);
        if (tri) tris.push(tri);
      }

      if (!tris.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      const pad = Number(CFG.padPx) || 0;

      let dancingCount = 0;
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) { setDancing(w, false); continue; }

        let hit = false;
        for (const tri of tris) {
          if (hitTrianglePadded(c, tri, pad)) { hit = true; break; }
        }

        setDancing(w, hit);
        if (hit) dancingCount++;
      }

      wantSe = dancingCount > 0;
      applySeState();
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    try { WB?.on?.("itemplace:state_changed", tick); } catch {}
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("resize", tick); } catch {}

    if (WB) {
      WB.mirrorballDance = {
        stop: () => {
          try { clearInterval(timer); } catch {}
          wantSe = false;
          applySeState();
          try { findBunnyWraps().forEach(w => setDancing(w, false)); } catch {}
        },
        tick,
        config: CFG,
      };
    }

    console.log("[mirrorball_dance] ready V4 (beam parent coords FIX)", {
      tickMs: CFG.tickMs,
      padPx: CFG.padPx,
      se: CFG.seSrc,
    });
  });
})();
