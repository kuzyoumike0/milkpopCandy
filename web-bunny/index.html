// mirrorball_dance.js (V3 - beam triangle hit test / robust)
// ✅ スポットライト（bgcolor.jsのbeam）に“当たってる時だけ”踊る（本物の三角判定）
// ✅ V12/V13/V13.1 など IDが違っても自動検出（bgMirrorFXWrapV* / bgMirrorFXLeftV* / RightV*）
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V3__) return;
  window.__MIRRORBALL_DANCE_V3__ = true;

  const CFG = {
    tickMs: 120,

    // ✅ うさぎ中心の当たり判定を少し甘く（チラつき防止）
    padPx: 14,

    // ✅ 近すぎると誤判定するので最低距離（光源ほぼ直上でのノイズ防止）
    minT: 8,

    // ✅ SE（任意）
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v3",
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
    if (document.getElementById("wbMirrorballDanceStyleV3")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV3";
    s.textContent = `
/* 踊ってる状態（wrapに付く） */
.wbDancing{
  filter: saturate(1.05) brightness(1.07);
}

/* transform競合回避：innerだけ踊らせる */
.wbDanceInner{ width:100%; height:100%; }

.wbDancing .wbDanceInner{
  animation: wbDanceHopV3 .42s ease-in-out infinite;
}
.wbDancing .wbDanceInner img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV3 .42s ease-in-out infinite;
}

@keyframes wbDanceWiggleV3{
  0%   { transform: rotate(-4deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(4deg)  translateY(-1px) scale(1.02); }
  100% { transform: rotate(-4deg) translateY(0px) scale(1.00); }
}
@keyframes wbDanceHopV3{
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
  animation: wbSparkleFloatV3 .7s ease-in-out infinite;
}
@keyframes wbSparkleFloatV3{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}
`;
    document.head.appendChild(s);
  }

  function centerOfEl(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
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

  // ✅ 既存 inner を再利用：bed_rest_bonus の wbRestInner があるならそれを使う（二重ラップ防止）
  function ensureMotionInner(wrap) {
    if (!wrap) return null;

    // 既にあるならそれ
    let inner = null;
    try { inner = wrap.querySelector(":scope > .wbRestInner"); } catch {}
    if (!inner) { try { inner = wrap.querySelector(":scope > .wbDanceInner"); } catch {} }

    if (!inner) inner = wrap.querySelector(".wbRestInner") || wrap.querySelector(".wbDanceInner");
    if (inner) {
      // dance用classも付けて統一
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
    // 最優先：id が bgMirrorFXWrapV*
    const wraps = Array.from(document.querySelectorAll('[id^="bgMirrorFXWrapV"]'));
    // それが無いなら：beamっぽい子を持つもの
    if (!wraps.length) {
      const maybe = Array.from(document.querySelectorAll("div")).filter(el => {
        const id = (el.id || "");
        if (/bgMirrorFXWrap/i.test(id)) return true;
        const hasBeamId = el.querySelector?.('[id^="bgMirrorFXLeftV"],[id^="bgMirrorFXRightV"]');
        return !!hasBeamId;
      });
      wraps.push(...maybe);
    }

    // visible のものを優先
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

    // V12/V13の典型 id
    const list = [];
    wrap.querySelectorAll('[id^="bgMirrorFXLeftV"],[id^="bgMirrorFXRightV"]').forEach(el => list.push(el));

    // それが無いなら class beam を拾う（bgcolor.jsの .beam）
    if (!list.length) {
      wrap.querySelectorAll(".beam").forEach(el => list.push(el));
    }

    return list.filter(el => el && el.isConnected);
  }

  function parsePx(v) {
    const n = Number(String(v || "").replace("px", ""));
    return Number.isFinite(n) ? n : 0;
  }

  function parseRotateDeg(transformStr) {
    // "translateX(-50%) rotate(12.34deg)" から deg を抜く（bgcolor.jsはこれを inline で入れてる）
    const s = String(transformStr || "");
    const m = s.match(/rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/i);
    if (m) return Number(m[1]) || 0;
    return 0;
  }

  // ✅ 三角ビーム判定（本命）
  // beam は「先端が光源、下に広がる三角形」
  // - anchor(先端) は beam.style.left/top（bgcolorが設定）
  // - rotate(deg) は beam.style.transform から読む（bgcolorが設定）
  // - width/height も style から読む
  function buildBeamInfo(beamEl) {
    if (!beamEl || !beamEl.isConnected) return null;

    const field = document.getElementById("field");
    if (!field) return null;
    const fr = field.getBoundingClientRect();
    if (!fr.width || !fr.height) return null;

    // 非表示なら無効
    let cs;
    try { cs = getComputedStyle(beamEl); } catch { cs = null; }
    if (!cs) return null;
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    if (Number(cs.opacity || "1") <= 0.001) return null;

    const left = parsePx(beamEl.style.left || cs.left);
    const top  = parsePx(beamEl.style.top  || cs.top);
    const w    = parsePx(beamEl.style.width  || cs.width);
    const h    = parsePx(beamEl.style.height || cs.height);

    if (!(w > 10 && h > 10)) return null;

    const deg = parseRotateDeg(beamEl.style.transform || cs.transform);

    // anchor（先端）をviewport座標へ：field左上 + beam.left/top
    const ax = fr.left + left;
    const ay = fr.top  + top;

    // beamは rotate(0) のとき下向き（+y方向）
    const rad = (deg * Math.PI) / 180;
    const dir = { x: Math.sin(rad), y: Math.cos(rad) }; // ✅ screen座標(y下)

    const halfWidth = w / 2;
    const halfAngle = Math.atan2(halfWidth, h); // 先端から見た左右境界角（rad）

    return { ax, ay, w, h, dir, halfAngle };
  }

  function hitBeamTriangle(pt, beam, padPx) {
    // pt: viewport座標
    const vx = pt.x - beam.ax;
    const vy = pt.y - beam.ay;

    // 先端方向への射影（t）
    const t = vx * beam.dir.x + vy * beam.dir.y;
    if (t < (CFG.minT || 0)) return false;
    if (t > beam.h + padPx) return false;

    // 垂直距離（perp）
    const px = vx - beam.dir.x * t;
    const py = vy - beam.dir.y * t;
    const perp = Math.sqrt(px * px + py * py);

    // 三角形は t に比例して太くなる：maxPerp = (t/h) * (w/2)
    const maxPerp = (t / beam.h) * (beam.w / 2);

    return perp <= (maxPerp + padPx);
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

      const beams = beamEls.map(buildBeamInfo).filter(Boolean);
      if (!beams.length) {
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
        for (const b of beams) {
          if (hitBeamTriangle(c, b, pad)) { hit = true; break; }
        }

        setDancing(w, hit);
        if (hit) dancingCount++;
      }

      wantSe = dancingCount > 0;
      applySeState();
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    // 変化フック（あれば拾う）
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

    console.log("[mirrorball_dance] ready V3 (triangle hit test)", {
      se: CFG.seSrc,
      pad: CFG.padPx,
    });
  });
})();
