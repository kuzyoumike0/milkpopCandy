// mirrorball_dance.js (V1.3)
// ✅ ミラーボール範囲内のうさぎが踊る（モーション：transform競合回避版）
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ ミラーボール検出：data属性 / img src / computed background-image に "mirrorball" を含む
// ✅ うさぎ検出：.bunnyWrap
// ✅ 重要：app.js が bunnyWrap.style.transform を毎フレ上書きするため
//    → bunnyWrapの中に「wbDanceInner」を作って、その内側だけをアニメする
//
// 読み込み順：app.js / itemPlace.js / bgcolor.js / BGM.js の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V13__) return;
  window.__MIRRORBALL_DANCE_V13__ = true;

  const CFG = {
    radiusPx: 200,
    tickMs: 200,

    seSrc: "./assets/mirrorball.mp3", // 無ければ差し替えOK
    seLoopId: "mirrorball_dance_loop_v13",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    // bgLayer など全走査は重いので、ミラーボール候補が見つからない時だけ軽く走査する
    backgroundScanFallback: true,
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
    if (document.getElementById("wbMirrorballDanceStyleV13")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV13";
    s.textContent = `
/* 踊ってる状態（wrapに付く） */
.wbDancing{
  filter: saturate(1.04) brightness(1.05);
}

/* 重要：wrapはapp.jsがtransformで動かすので触らない */
/* 代わりに inner を作ってそこを揺らす */
.wbDanceInner{
  position:absolute;
  inset:0;
  pointer-events:none; /* クリックは下のimgへ通す */
}

/* うさぎ画像は inner の中でもクリックできるよう戻す */
.wbDanceInner > img{
  pointer-events:auto;
}

/* 揺れ（回転＋上下） */
.wbDancing .wbDanceInner{
  transform-origin: 50% 85%;
  animation: wbDanceInnerWiggle .42s ease-in-out infinite;
}

@keyframes wbDanceInnerWiggle{
  0%   { transform: rotate(-3deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(3deg)  translateY(-2px) scale(1.01); }
  100% { transform: rotate(-3deg) translateY(0px) scale(1.00); }
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
  animation: wbSparkleFloat .7s ease-in-out infinite;
}
@keyframes wbSparkleFloat{
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
    // display:none や幅0は除外
    if (!(r.width > 1 && r.height > 1)) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* =========================
   * ミラーボール検出（強化版）
   * ========================= */
  function findMirrorballsFast() {
    const arr = [];

    // data属性
    document
      .querySelectorAll('[data-item="mirrorball"],[data-item-id="mirrorball"],[data-kind="mirrorball"],[data-id="mirrorball"]')
      .forEach(e => arr.push(e));

    // img src
    document.querySelectorAll("img[src]").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("mirrorball")) arr.push(img);
    });

    return Array.from(new Set(arr)).filter(Boolean);
  }

  // background-image の mirrorball も拾う（bgLayer や itemLayer で起きがち）
  function findMirrorballsByBackground() {
    const arr = [];
    const layers = [
      document.getElementById("bgLayer"),
      document.getElementById("itemLayer"),
      document.getElementById("itemsLayer"),
      document.getElementById("decorLayer"),
      document.body,
    ].filter(Boolean);

    for (const layer of layers) {
      const els = Array.from(layer.querySelectorAll("*"));
      for (const el of els) {
        try {
          const bg = String(getComputedStyle(el).backgroundImage || "").toLowerCase();
          if (bg.includes("mirrorball")) arr.push(el);
        } catch {}
      }
    }
    return Array.from(new Set(arr)).filter(Boolean);
  }

  function findMirrorballs() {
    const fast = findMirrorballsFast();
    if (fast.length) return fast;
    if (!CFG.backgroundScanFallback) return fast;
    return findMirrorballsByBackground();
  }

  /* =========================
   * うさぎwrap検出
   * ========================= */
  function findBunnyWraps() {
    return Array.from(document.querySelectorAll(".bunnyWrap"));
  }

  /* =========================
   * inner化：transform競合回避の肝
   * ========================= */
  function ensureDanceInner(wrap) {
    if (!wrap) return null;
    let inner = wrap.querySelector(":scope > .wbDanceInner");
    if (inner) return inner;

    // wrap内の最初の img を対象（app.jsはこれ1枚）
    const img = wrap.querySelector(":scope > img");
    if (!img) return null;

    inner = document.createElement("div");
    inner.className = "wbDanceInner";

    // imgをinnerに移動
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
      // inner は残してOK（競合回避のため固定構造にする）
    }
  }

  /* =========================
   * SE 再生（WB.se優先）
   * ========================= */
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

  /* =========================
   * Main
   * ========================= */
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

      // 内側構造だけ先に作っておく（踊りが絶対に見えるように）
      for (const w of wraps) ensureDanceInner(w);

      if (!balls.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      const centers = balls.map(centerOfEl).filter(Boolean);
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

    // 変化で即追従
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

    console.log("[mirrorball_dance] ready v1.3", { radius: CFG.radiusPx, se: CFG.seSrc });
  });
})();
