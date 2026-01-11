// mirrorball_dance.js (V4 - TRUE triangle vertices via transform-origin / reliable)
// ✅ bgcolor.js の beam（三角クリップ＋translateX(-50%)+rotate+origin 50%0%）を
//    “実座標の三角形” に変換して hit 判定する → スクショ状態でも確実に踊る
// ✅ V12/V13/V13.1 など wrap/beam の ID違いも自動検出
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があれば優先）
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V4__) return;
  window.__MIRRORBALL_DANCE_V4__ = true;

  const CFG = {
    tickMs: 110,

    // ✅ チラつき防止（少し甘めにする）
    padPx: 16,

    // ✅ SE
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v4",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    // ✅ debug（trueにすると当たり判定用の点を表示）
    debug: false,
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
.wbDancing{
  filter: saturate(1.06) brightness(1.07);
}

.wbDanceInner{ width:100%; height:100%; }

.wbDancing .wbDanceInner{
  animation: wbDanceHopV4 .42s ease-in-out infinite;
}
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
  position:absolute;
  left:50%;
  top:-18px;
  transform:translateX(-50%);
  font-weight:1000;
  font-size:14px;
  opacity:.92;
  pointer-events:none;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
  animation: wbSparkleFloatV4 .7s ease-in-out infinite;
}
@keyframes wbSparkleFloatV4{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}

/* debug dot */
.wbDanceDbgDot{
  position:fixed;
  width:6px; height:6px;
  border-radius:999px;
  background:#ff2aa6;
  z-index:2147483647;
  pointer-events:none;
  transform:translate(-50%,-50%);
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

  function findBunnyWraps() {
    const wraps = Array.from(document.querySelectorAll(".bunnyWrap, .bunny-wrap"));
    if (wraps.length) return wraps;

    const bunnyLayer = $("#bunnyLayer") || $("#bunnylayer");
    if (!bunnyLayer) return [];
    const imgs = Array.from(bunnyLayer.querySelectorAll("img"));
    const parents = imgs.map(img => img.parentElement).filter(Boolean);
    return Array.from(new Set(parents));
  }

  // ✅ restInner を再利用（二重ラップ防止）
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

  // ===== beam検出（V12/V13/V13.1など自動対応）=====
  function pickFXWrap() {
    const wraps = Array.from(document.querySelectorAll('[id^="bgMirrorFXWrapV"]'));
    if (!wraps.length) {
      const maybe = Array.from(document.querySelectorAll("div")).filter(el => {
        const id = (el.id || "");
        if (/bgMirrorFXWrap/i.test(id)) return true;
        const hasBeamId = el.querySelector?.('[id^="bgMirrorFXLeftV"],[id^="bgMirrorFXRightV"]');
        return !!hasBeamId;
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
    const s = String(v || "").trim();
    if (!s) return NaN;
    if (s.endsWith("px")) {
      const n = Number(s.slice(0, -2));
      return Number.isFinite(n) ? n : NaN;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function parseTransformOrigin(cs, w, h) {
    // "50% 0%" / "70px 0px" など
    const s = String(cs.transformOrigin || "50% 50%").trim();
    const parts = s.split(/\s+/).slice(0, 2);
    const oxRaw = parts[0] || "50%";
    const oyRaw = parts[1] || "50%";

    const toVal = (raw, size) => {
      const t = String(raw).trim();
      if (t.endsWith("%")) {
        const p = Number(t.slice(0, -1));
        return (Number.isFinite(p) ? p : 50) / 100 * size;
      }
      if (t.endsWith("px")) {
        const n = Number(t.slice(0, -2));
        return Number.isFinite(n) ? n : 0;
      }
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    };

    return { ox: toVal(oxRaw, w), oy: toVal(oyRaw, h) };
  }

  function getOffsetParentRect(el) {
    const op = el?.offsetParent;
    if (op && op.getBoundingClientRect) return op.getBoundingClientRect();
    const p = el?.parentElement;
    if (p && p.getBoundingClientRect) return p.getBoundingClientRect();
    return null;
  }

  function getDOMMatrix(cs) {
    const t = String(cs.transform || "none");
    if (!t || t === "none") return new DOMMatrix();
    try { return new DOMMatrix(t); } catch { return new DOMMatrix(); }
  }

  // ✅ beam を「実座標の三角形(3点)」にする
  function buildBeamTriangle(beamEl) {
    if (!beamEl || !beamEl.isConnected) return null;

    let cs;
    try { cs = getComputedStyle(beamEl); } catch { cs = null; }
    if (!cs) return null;
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    if (Number(cs.opacity || "1") <= 0.001) return null;

    const w = parsePx(beamEl.style.width || cs.width);
    const h = parsePx(beamEl.style.height || cs.height);
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 10 && h > 10)) return null;

    // left/top は offsetParent 基準（bgcolor.js は px を入れてる）
    const baseRect = getOffsetParentRect(beamEl);
    if (!baseRect) return null;

    const left = parsePx(beamEl.style.left || cs.left);
    const top  = parsePx(beamEl.style.top  || cs.top);

    // left/top が取れないケース保険：rectから推定（上端中央を先端に近似）
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      const rr = beamEl.getBoundingClientRect();
      const p0 = { x: rr.left + rr.width / 2, y: rr.top };
      // 下辺左右（近似）
      const p1 = { x: rr.left, y: rr.bottom };
      const p2 = { x: rr.right, y: rr.bottom };
      return { p0, p1, p2 };
    }

    const baseX = baseRect.left + left;
    const baseY = baseRect.top  + top;

    const M = getDOMMatrix(cs);

    // transform-origin を考慮して「p' = O + M*(p - O)」
    const { ox, oy } = parseTransformOrigin(cs, w, h);

    const apply = (p) => {
      const x = p.x - ox;
      const y = p.y - oy;
      const tp = M.transformPoint({ x, y });
      return { x: baseX + ox + tp.x, y: baseY + oy + tp.y };
    };

    // clip-path: (50% 0), (0 100), (100 100)
    const p0 = apply({ x: w * 0.5, y: 0 });
    const p1 = apply({ x: 0,       y: h });
    const p2 = apply({ x: w,       y: h });

    return { p0, p1, p2 };
  }

  function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }

  function pointInTri(pt, a, b, c, pad) {
    // pad は「少し外でも当たり」にするため、簡易的に辺の近さを許容
    // まず通常の三角内判定
    const d1 = sign(pt, a, b);
    const d2 = sign(pt, b, c);
    const d3 = sign(pt, c, a);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    if (!(hasNeg && hasPos)) return true;

    // 外なら pad 分だけ辺距離で救済（簡易）
    const distToSeg = (p, v, w) => {
      const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
      if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
      return Math.hypot(p.x - proj.x, p.y - proj.y);
    };
    return (
      distToSeg(pt, a, b) <= pad ||
      distToSeg(pt, b, c) <= pad ||
      distToSeg(pt, c, a) <= pad
    );
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

  // debug dot
  let dbgDot = null;
  function dbgMove(pt) {
    if (!CFG.debug) return;
    if (!dbgDot) {
      dbgDot = document.createElement("div");
      dbgDot.className = "wbDanceDbgDot";
      document.body.appendChild(dbgDot);
    }
    dbgDot.style.left = pt.x + "px";
    dbgDot.style.top = pt.y + "px";
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

      // wrap 非表示なら無効
      try {
        const cs = getComputedStyle(fxWrap);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") <= 0.01) {
          wraps.forEach(w => setDancing(w, false));
          wantSe = false;
          applySeState();
          return;
        }
      } catch {}

      const tris = beamEls.map(buildBeamTriangle).filter(Boolean);
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
        dbgMove(c);

        let hit = false;
        for (const tri of tris) {
          if (pointInTri(c, tri.p0, tri.p1, tri.p2, pad)) { hit = true; break; }
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

    console.log("[mirrorball_dance] ready V4 (real triangle via transform-origin)", {
      se: CFG.seSrc,
      pad: CFG.padPx,
      tickMs: CFG.tickMs,
    });
  });
})();
