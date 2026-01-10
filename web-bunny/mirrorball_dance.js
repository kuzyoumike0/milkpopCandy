// mirrorball_dance.js (V2 - spotlight hit only)
// ✅ スポットライト（bgcolor.js V12 の beam DOM）に当たってる時だけうさぎが踊る
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ ビーム検出：#bgMirrorFXLeftV12 / #bgMirrorFXRightV12（bgcolor.js V12）
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：bgcolor.js / app.js / BGM.js(あれば) の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V2__) return;
  window.__MIRRORBALL_DANCE_V2__ = true;

  const CFG = {
    tickMs: 140,

    // ✅ bgcolor.js(V12) のスポットライトID
    fxWrapId: "bgMirrorFXWrapV12",
    leftBeamId: "bgMirrorFXLeftV12",
    rightBeamId: "bgMirrorFXRightV12",

    // ✅ うさぎ中心判定を少し甘くする（ビーム境界のチラつき防止）
    rectPadPx: 10,

    // ✅ SE（任意：無ければ好きなパスへ）
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v2",
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
    if (document.getElementById("wbMirrorballDanceStyleV2")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV2";
    s.textContent = `
/* 踊ってる状態（wrapに付く） */
.wbDancing{
  filter: saturate(1.04) brightness(1.06);
}

/* 画像を揺らす（transform競合回避のため inner で揺らす） */
.wbDanceInner{ width:100%; height:100%; }

.wbDancing .wbDanceInner{
  animation: wbDanceHopV2 .42s ease-in-out infinite;
}
.wbDancing .wbDanceInner img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV2 .42s ease-in-out infinite;
}

@keyframes wbDanceWiggleV2{
  0%   { transform: rotate(-4deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(4deg)  translateY(-1px) scale(1.02); }
  100% { transform: rotate(-4deg) translateY(0px) scale(1.00); }
}
@keyframes wbDanceHopV2{
  0%   { transform: translateY(0px); }
  50%  { transform: translateY(-2px); }
  100% { transform: translateY(0px); }
}

/* キラキラ */
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
  animation: wbSparkleFloatV2 .7s ease-in-out infinite;
}
@keyframes wbSparkleFloatV2{
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

  // transform競合回避：imgをinnerで包む（bed_rest_bonusと同じ発想）
  function ensureDanceInner(wrap) {
    if (!wrap) return null;
    let inner = null;
    try { inner = wrap.querySelector(":scope > .wbDanceInner"); } catch {}
    if (!inner) inner = wrap.querySelector(".wbDanceInner");
    if (inner) return inner;

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
      ensureDanceInner(wrap);
      ensureSparkle(wrap);
    } else {
      wrap.classList.remove("wbDancing");
      const z = wrap.querySelector(".wbDanceSparkle");
      if (z) { try { z.remove(); } catch {} }
    }
  }

  // ===== スポットライト（beam）を取る =====
  function getBeams() {
    const wrap = document.getElementById(CFG.fxWrapId);
    if (!wrap || !wrap.isConnected) return null;

    // display:none の時は無効
    const cs = getComputedStyle(wrap);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") <= 0.01) return null;

    const L = document.getElementById(CFG.leftBeamId);
    const R = document.getElementById(CFG.rightBeamId);
    const list = [L, R].filter(Boolean).filter(el => el.isConnected);

    // どっちも無いなら無効
    if (!list.length) return null;

    // beam 自体がほぼ透明でも当たり判定としては使う（opacity 0 は無効）
    const rects = [];
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (r.width > 5 && r.height > 5) rects.push(r);
    }
    if (!rects.length) return null;

    return rects;
  }

  function inRectPadded(pt, r, pad) {
    return (
      pt.x >= (r.left - pad) &&
      pt.x <= (r.right + pad) &&
      pt.y >= (r.top - pad) &&
      pt.y <= (r.bottom + pad)
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
      const beams = getBeams();

      // スポットライトが無い/非表示なら解除
      if (!beams) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      const pad = Number(CFG.rectPadPx) || 0;

      let dancingCount = 0;
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) { setDancing(w, false); continue; }

        // ✅ beam rect に入ってるか（簡易当たり判定）
        let hit = false;
        for (const r of beams) {
          if (inRectPadded(c, r, pad)) { hit = true; break; }
        }

        setDancing(w, hit);
        if (hit) dancingCount++;
      }

      wantSe = dancingCount > 0;
      applySeState();
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    // bgcolor / itemPlace が通知してくれるなら拾う（無くてもOK）
    try { WB?.on?.("itemplace:state_changed", tick); } catch {}
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("resize", tick); } catch {}

    // 外部停止API
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

    console.log("[mirrorball_dance] ready V2 (spotlight hit only)", {
      fxWrapId: CFG.fxWrapId,
      leftBeamId: CFG.leftBeamId,
      rightBeamId: CFG.rightBeamId,
      se: CFG.seSrc
    });
  });
})();
