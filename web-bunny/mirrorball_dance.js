// mirrorball_dance.js v1.1
// ✅ ミラーボール範囲内のうさぎが踊る（transform競合しない版）
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ ミラーボール検出：data属性 / img src / background-image まで拾う
// ✅ うさぎ検出：.bunnyWrap（app.js互換）
// 読み込み順：app.js / itemPlace.js / bgcolor.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V11__) return;
  window.__MIRRORBALL_DANCE_V11__ = true;

  const CFG = {
    radiusPx: 180,
    tickMs: 180,
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_dance_loop_v1",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    // デバッグ（踊らない時は true にして console 見て）
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
    if (document.getElementById("wbMirrorballDanceStyleV11")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV11";
    s.textContent = `
/* ✅ transform競合回避：wrapのtransformは app.js が支配するので触らない */
.bunnyWrap.wbDancing{
  filter: saturate(1.05) brightness(1.06);
}

/* ✅ “踊り”は子のimgだけに（ここなら app.js の translate3d と競合しない） */
.bunnyWrap.wbDancing > img.bunny{
  transform-origin: 50% 85%;
  animation: wbDanceWiggle11 .42s ease-in-out infinite;
  will-change: transform;
}

/* img.bunny が無い構成も吸収 */
.bunnyWrap.wbDancing img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggle11 .42s ease-in-out infinite;
  will-change: transform;
}

/* ほんのり上下も img側で（wrapのtransformは触らない） */
@keyframes wbDanceWiggle11{
  0%   { transform: rotate(-3deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(3deg)  translateY(-2px) scale(1.02); }
  100% { transform: rotate(-3deg) translateY(0px) scale(1.00); }
}

/* キラキラ */
.bunnyWrap .wbDanceSparkle{
  position:absolute;
  left:50%;
  top:-18px;
  transform:translateX(-50%);
  font-weight:1000;
  font-size:14px;
  opacity:.9;
  pointer-events:none;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
  animation: wbSparkleFloat11 .7s ease-in-out infinite;
}
@keyframes wbSparkleFloat11{
  0%{ transform:translateX(-50%) translateY(0); opacity:.75; }
  50%{ transform:translateX(-50%) translateY(-6px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.75; }
}
`;
    document.head.appendChild(s);
  }

  function centerOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // display:none だと 0 になるので弾く
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function bgHasMirrorball(el) {
    try {
      const cs = getComputedStyle(el);
      const bg = String(cs.backgroundImage || "").toLowerCase();
      return bg.includes("mirrorball");
    } catch {
      return false;
    }
  }

  // ✅ ミラーボール要素検出を強化
  function findMirrorballs() {
    const found = [];

    // data系
    document.querySelectorAll(
      '[data-item="mirrorball"],[data-item-id="mirrorball"],[data-kind="mirrorball"],[data-id="mirrorball"]'
    ).forEach(e => found.push(e));

    // img src
    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("mirrorball")) found.push(img);
    });

    // background-image
    // bgLayer / itemLayer っぽい所を優先的に走査
    const layers = [
      $("#bgLayer"), $("#itemLayer"), $("#itemlayer"), $("#itemsLayer"), $("#decorLayer"),
      document.body
    ].filter(Boolean);

    for (const layer of layers) {
      // そこそこ軽い範囲で
      const els = Array.from(layer.querySelectorAll("*"));
      for (const el of els) {
        if (bgHasMirrorball(el)) found.push(el);
      }
    }

    return Array.from(new Set(found)).filter(Boolean);
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

  /* ========= SE 再生（WB.se があれば優先、無ければAudioでフォールバック） ========= */
  function getSeVolume(WB) {
    try {
      if (WB && typeof WB.getSEVolume === "function") return Math.max(0, Math.min(1, Number(WB.getSEVolume()) || 0));
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

  /* ========= メイン ========= */
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

    let lastLogAt = 0;
    function debugLog(obj) {
      if (!CFG.debug) return;
      const now = Date.now();
      if (now - lastLogAt < 1200) return;
      lastLogAt = now;
      console.log("[mirrorball_dance] tick", obj);
    }

    function tick() {
      const balls = findMirrorballs();
      const wraps = findBunnyWraps();

      if (!wraps.length) {
        wantSe = false;
        applySeState();
        debugLog({ balls: balls.length, wraps: 0, note: "no bunnyWrap" });
        return;
      }

      if (!balls.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        debugLog({ balls: 0, wraps: wraps.length, note: "no mirrorball found" });
        return;
      }

      const centers = balls.map(centerOfEl).filter(Boolean);
      if (!centers.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        debugLog({ balls: balls.length, centers: 0, wraps: wraps.length, note: "mirrorball has 0 size? display none?" });
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

      debugLog({ balls: balls.length, centers: centers.length, wraps: wraps.length, dancing: dancingCount, radius: CFG.radiusPx });
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("seVolumeChanged", () => syncSeVolume(WB)); } catch {}

    // 外部API
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

    console.log("[mirrorball_dance] ready v1.1", { radius: CFG.radiusPx, se: CFG.seSrc, debug: CFG.debug });
  });
})();
