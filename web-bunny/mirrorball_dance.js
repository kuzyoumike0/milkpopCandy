// mirrorball_dance.js (V1.4)
// ✅ transform競合回避（wbDanceInner方式）
// ✅ ミラーボール検出を強化：src / data属性 / background-image / さらにキーワード複数
// ✅ デバッグ：ミラーボール中心に円を表示（見つかってるか一発で分かる）
//
// 読み込み順：app.js / itemPlace.js / bgcolor.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V14__) return;
  window.__MIRRORBALL_DANCE_V14__ = true;

  const CFG = {
    radiusPx: 200,
    tickMs: 200,

    // ✅ ここ重要：ファイル名/描画名に合わせて増やせる
    // 例）mirrorball.png / disco_ball.png / ミラーボール.png 等
    keywords: ["mirrorball", "mirror", "disco", "ball"],

    // SE
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v14",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    // ✅ 見つかってるか可視化
    debug: true,
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
    if (document.getElementById("wbMirrorballDanceStyleV14")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV14";
    s.textContent = `
.wbDancing{ filter:saturate(1.04) brightness(1.05); }
.wbDanceInner{ position:absolute; inset:0; pointer-events:none; }
.wbDanceInner > img{ pointer-events:auto; }

.wbDancing .wbDanceInner{
  transform-origin: 50% 85%;
  animation: wbDanceInnerWiggle .42s ease-in-out infinite;
}
@keyframes wbDanceInnerWiggle{
  0%   { transform: rotate(-3deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(3deg)  translateY(-2px) scale(1.01); }
  100% { transform: rotate(-3deg) translateY(0px) scale(1.00); }
}

.wbDanceSparkle{
  position:absolute; left:50%; top:-18px;
  transform:translateX(-50%);
  font-weight:1000; font-size:14px; opacity:.92;
  pointer-events:none;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
  animation: wbSparkleFloat .7s ease-in-out infinite;
}
@keyframes wbSparkleFloat{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}

/* debug circle */
#wbMirrorDebug{
  position:fixed; inset:0; pointer-events:none; z-index:2147483646;
}
.wbMirrorDot{
  position:absolute; width:10px; height:10px; border-radius:999px;
  transform:translate(-50%,-50%);
  background:rgba(255,0,120,.85);
  box-shadow:0 10px 24px rgba(0,0,0,.18);
}
.wbMirrorCircle{
  position:absolute;
  transform:translate(-50%,-50%);
  border-radius:999px;
  border:2px dashed rgba(255,0,120,.65);
  box-shadow:0 10px 24px rgba(0,0,0,.12);
}
`;
    document.head.appendChild(s);
  }

  function centerOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 1 && r.height > 1)) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hasKeyword(str) {
    const s = String(str || "").toLowerCase();
    if (!s) return false;
    return CFG.keywords.some(k => s.includes(String(k).toLowerCase()));
  }

  // ✅ 画像 / data属性で探す
  function findMirrorballsFast() {
    const arr = [];
    document.querySelectorAll("[data-item],[data-item-id],[data-kind],[data-id]").forEach(el => {
      const v =
        el.getAttribute("data-item") ||
        el.getAttribute("data-item-id") ||
        el.getAttribute("data-kind") ||
        el.getAttribute("data-id") ||
        "";
      if (hasKeyword(v)) arr.push(el);
    });

    document.querySelectorAll("img[src]").forEach(img => {
      const src = img.getAttribute("src");
      if (hasKeyword(src)) arr.push(img);
    });

    return Array.from(new Set(arr)).filter(Boolean);
  }

  // ✅ background-image で探す（bgLayer や itemLayer で出してる場合の本命）
  function findMirrorballsByBackground() {
    const roots = [
      document.getElementById("bgLayer"),
      document.getElementById("itemLayer"),
      document.getElementById("itemsLayer"),
      document.getElementById("decorLayer"),
      document.getElementById("field"),
      document.body,
    ].filter(Boolean);

    const arr = [];
    for (const root of roots) {
      const els = [root, ...Array.from(root.querySelectorAll("*"))];
      for (const el of els) {
        try {
          const bg = String(getComputedStyle(el).backgroundImage || "");
          if (hasKeyword(bg)) arr.push(el);
        } catch {}
      }
    }
    return Array.from(new Set(arr)).filter(Boolean);
  }

  function findMirrorballs() {
    const fast = findMirrorballsFast();
    if (fast.length) return fast;
    return findMirrorballsByBackground();
  }

  function findBunnyWraps() {
    return Array.from(document.querySelectorAll(".bunnyWrap"));
  }

  // ✅ transform競合回避：inner化
  function ensureDanceInner(wrap) {
    if (!wrap) return null;
    let inner = wrap.querySelector(":scope > .wbDanceInner");
    if (inner) return inner;

    // 直下imgが無い場合もあるので、最初のimgを拾う（isyō等の影響対策）
    const img = wrap.querySelector("img");
    if (!img) return null;

    inner = document.createElement("div");
    inner.className = "wbDanceInner";

    // imgの親がwrap直下じゃない場合は、その親ごと入れ替えると壊れるので
    // “imgだけ” inner に移動（アクセサリはwrap直下のままでもOK）
    try {
      wrap.insertBefore(inner, img);
      inner.appendChild(img);
    } catch {
      // 最後の保険：append
      try { inner.appendChild(img); wrap.appendChild(inner); } catch {}
    }

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

  /* ===== SE ===== */
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
      if (WB?.se?.loop && typeof WB.se.loop === "function") {
        try { WB.se.loop(CFG.seLoopId, CFG.seSrc); return true; } catch {}
        try { WB.se.loop(CFG.seSrc); return true; } catch {}
      }
    } catch {}
    audioFallback.start(WB);
    return true;
  }

  function stopLoopSe(WB) {
    try {
      if (WB?.se?.stop && typeof WB.se.stop === "function") {
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

  /* ===== debug overlay ===== */
  function ensureDebugLayer() {
    if (!CFG.debug) return null;
    let d = document.getElementById("wbMirrorDebug");
    if (!d) {
      d = document.createElement("div");
      d.id = "wbMirrorDebug";
      document.body.appendChild(d);
    }
    return d;
  }

  function drawDebug(centers) {
    const d = ensureDebugLayer();
    if (!d) return;
    d.innerHTML = "";

    for (const c of centers) {
      const dot = document.createElement("div");
      dot.className = "wbMirrorDot";
      dot.style.left = `${c.x}px`;
      dot.style.top  = `${c.y}px`;

      const circle = document.createElement("div");
      circle.className = "wbMirrorCircle";
      circle.style.left = `${c.x}px`;
      circle.style.top  = `${c.y}px`;
      circle.style.width  = `${CFG.radiusPx * 2}px`;
      circle.style.height = `${CFG.radiusPx * 2}px`;

      d.appendChild(circle);
      d.appendChild(dot);
    }
  }

  /* ===== main ===== */
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
      const balls = findMirrorballs();
      const wraps = findBunnyWraps();

      // うさぎ側は毎回inner化しておく（isyō等でも壊れにくい）
      for (const w of wraps) ensureDanceInner(w);

      if (!balls.length) {
        if (CFG.debug) drawDebug([]);
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      const centers = balls.map(centerOfEl).filter(Boolean);
      if (CFG.debug) drawDebug(centers);

      if (!centers.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      let dancingCount = 0;
      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) { setDancing(w, false); continue; }

        let inRange = false;
        for (const mc of centers) {
          if (dist(c, mc) <= CFG.radiusPx) { inRange = true; break; }
        }
        setDancing(w, inRange);
        if (inRange) dancingCount++;
      }

      wantSe = dancingCount > 0;
      applySeState();
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("seVolumeChanged", () => syncSeVolume(WB)); } catch {}

    WB && (WB.mirrorballDance = {
      stop: () => {
        try { clearInterval(timer); } catch {}
        wantSe = false;
        applySeState();
        try { findBunnyWraps().forEach(w => setDancing(w, false)); } catch {}
        try { document.getElementById("wbMirrorDebug")?.remove?.(); } catch {}
      },
      tick,
      config: CFG,
    });

    console.log("[mirrorball_dance] ready v1.4", { keywords: CFG.keywords, radius: CFG.radiusPx });
  });
})();
