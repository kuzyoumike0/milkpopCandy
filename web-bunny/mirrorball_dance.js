// mirrorball_dance.js (V2.2 - spotlight TRIANGLE hit only / DOM-safe)
// ✅ bgcolor.js V12 の beam（clip-path三角 + rotate）に “当たってる時だけ” 踊る
// ✅ 判定は beam の style(left/top/width/height/transform rotate) から三角形を復元して計算
// ✅ bed_rest_bonus が img をラップしていても壊れない（DOMを組み替えない）
// ✅ 1匹でも踊ってる間だけ SE ループ（WB.se.loop 優先）
//
// 読み込み順：bgcolor.js / app.js / bed_rest_bonus.js 等の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V22__) return;
  window.__MIRRORBALL_DANCE_V22__ = true;

  const CFG = {
    tickMs: 140,

    // bgcolor.js(V12) の beam DOM id
    fxWrapId: "bgMirrorFXWrapV12",
    leftBeamId: "bgMirrorFXLeftV12",
    rightBeamId: "bgMirrorFXRightV12",

    // 当たり判定を少し甘く（辺の外側にこれだけ許容）
    edgePadPx: 10,

    // SE
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v22",
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
    if (document.getElementById("wbMirrorballDanceStyleV22")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV22";
    s.textContent = `
.wbDancing{ filter:saturate(1.04) brightness(1.06); }
.wbDancing img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV22 .42s ease-in-out infinite;
  will-change: transform;
}
.wbDanceSparkle{
  position:absolute; left:50%; top:-18px; transform:translateX(-50%);
  font-weight:1000; font-size:14px; opacity:.92; pointer-events:none;
  text-shadow:0 10px 22px rgba(0,0,0,.18);
  animation: wbSparkleFloatV22 .7s ease-in-out infinite;
}
@keyframes wbDanceWiggleV22{
  0%{ transform:rotate(-4deg) translateY(0) scale(1.00); }
  50%{ transform:rotate(4deg)  translateY(-2px) scale(1.02); }
  100%{ transform:rotate(-4deg) translateY(0) scale(1.00); }
}
@keyframes wbSparkleFloatV22{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}
`;
    document.head.appendChild(s);
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
      ensureSparkle(wrap);
    } else {
      wrap.classList.remove("wbDancing");
      const z = wrap.querySelector(".wbDanceSparkle");
      if (z) { try { z.remove(); } catch {} }
    }
  }

  function centerOfEl(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ====== beam style から “三角形” を復元 ======
  function parsePx(v) {
    const n = parseFloat(String(v || "").replace("px", ""));
    return Number.isFinite(n) ? n : null;
  }

  function parseRotateDeg(transformStr) {
    const s = String(transformStr || "");
    // 例: "translateX(-50%) rotate(-12.34deg)"
    const m = s.match(/rotate\(\s*([-\d.]+)deg\s*\)/i);
    if (!m) return 0;
    const d = parseFloat(m[1]);
    return Number.isFinite(d) ? d : 0;
  }

  function rotateAround(pt, origin, deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const x = pt.x - origin.x;
    const y = pt.y - origin.y;
    return {
      x: origin.x + (x * cos - y * sin),
      y: origin.y + (x * sin + y * cos),
    };
  }

  // 点が三角形内か（辺pad込み）
  function pointInTri(p, a, b, c, pad) {
    // signed area
    const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = s(p, a, b);
    const d2 = s(p, b, c);
    const d3 = s(p, c, a);

    // pad を “面積判定のゆるみ” として使う（単位合わせ簡易）
    const eps = Math.max(0, Number(pad) || 0) * 80;

    const hasNeg = (d1 < -eps) || (d2 < -eps) || (d3 < -eps);
    const hasPos = (d1 > eps) || (d2 > eps) || (d3 > eps);
    return !(hasNeg && hasPos);
  }

  function beamTriangles() {
    const wrap = document.getElementById(CFG.fxWrapId);
    if (!wrap || !wrap.isConnected) return null;

    const cs = getComputedStyle(wrap);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") <= 0.01) return null;

    const els = [
      document.getElementById(CFG.leftBeamId),
      document.getElementById(CFG.rightBeamId),
    ].filter(Boolean).filter(el => el.isConnected);

    if (!els.length) return null;

    const tris = [];
    for (const el of els) {
      // bgcolor.js が style.left/top/width/height を毎フレ設定してる前提
      const left = parsePx(el.style.left);
      const top  = parsePx(el.style.top);
      const w    = parsePx(el.style.width);
      const h    = parsePx(el.style.height);
      if (left === null || top === null || !w || !h) continue;

      const deg = parseRotateDeg(el.style.transform);

      // translateX(-50%) rotate() の結果、三角の頂点（apex）は (left, top) に来る
      const A = { x: left, y: top };
      const B0 = { x: left - w * 0.5, y: top + h };
      const C0 = { x: left + w * 0.5, y: top + h };

      const B = rotateAround(B0, A, deg);
      const C = rotateAround(C0, A, deg);

      tris.push({ A, B, C });
    }

    return tris.length ? tris : null;
  }

  // ===== SE =====
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

  // ===== main =====
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
        audioFallback.syncVolume(WB);
      }
    }

    function tick() {
      const wraps = findBunnyWraps();
      const tris = beamTriangles();

      if (!tris) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      const pad = Number(CFG.edgePadPx) || 0;
      let dancingCount = 0;

      for (const w of wraps) {
        const img = w.querySelector?.("img") || null;
        const c = centerOfEl(img) || centerOfEl(w);
        if (!c) { setDancing(w, false); continue; }

        let hit = false;
        for (const t of tris) {
          if (pointInTri(c, t.A, t.B, t.C, pad)) { hit = true; break; }
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

    console.log("[mirrorball_dance] ready V2.2 (triangle hit)", {
      fxWrapId: CFG.fxWrapId,
      leftBeamId: CFG.leftBeamId,
      rightBeamId: CFG.rightBeamId
    });
  });
})();
