// mirrorball_spotlight_dance.js (V3)
// ✅ スポットライトが“当たってる間だけ”うさぎが踊る（確実版）
// ✅ bgcolor.js(V12) の beam（三角形）を「角度・光源・サイズ」から幾何判定する
// ✅ pointer-events:none でもOK（elementsFromPointを使わない）
// ✅ SE：当たりが1匹でもいる間だけループ（WB.se.loop優先、無ければAudio）
//
// 読み込み順：bgcolor.js / app.js / itemPlace.js / BGM.js の後（最後推奨）

(() => {
  "use strict";
  if (window.__MIRRORBALL_SPOT_DANCE_V3__) return;
  window.__MIRRORBALL_SPOT_DANCE_V3__ = true;

  const CFG = {
    tickMs: 140,

    // bgcolor.js(V12) のIDに合わせる
    wrapId:  "bgMirrorFXWrapV12",
    leftId:  "bgMirrorFXLeftV12",
    rightId: "bgMirrorFXRightV12",

    // SE
    seSrc: "./assets/mirrorball.mp3",
    seLoopId: "mirrorball_spotlight_dance_loop_v3",
    seStartDelayMs: 120,
    stopFadeMs: 180,

    // 判定ゆるめ補正（当たり判定を少し太らせたい場合 0〜30）
    fatPx: 10,
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
    if (document.getElementById("wbMirrorSpotDanceStyleV3")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorSpotDanceStyleV3";
    s.textContent = `
/* 踊り状態は wrap に付ける（位置transformはapp.jsが上書きするので、踊りはinner側へ） */
.wbDancing{
  filter: saturate(1.03) brightness(1.05);
}

/* inner を噛ませて transform 競合を回避 */
.wbDanceInner{
  width:100%;
  height:100%;
}

.wbDancing .wbDanceInner{
  animation: wbDanceHopV3 .42s ease-in-out infinite;
}
.wbDancing .wbDanceInner img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggleV3 .42s ease-in-out infinite;
}

@keyframes wbDanceWiggleV3{
  0%   { transform: rotate(-3deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(3deg)  translateY(-1px) scale(1.01); }
  100% { transform: rotate(-3deg) translateY(0px) scale(1.00); }
}
@keyframes wbDanceHopV3{
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
  opacity:.9;
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

  function findBunnyWraps() {
    const wraps = Array.from(document.querySelectorAll(".bunnyWrap, .bunny-wrap"));
    if (wraps.length) return wraps;

    const bunnyLayer = $("#bunnyLayer") || $("#bunnylayer");
    if (!bunnyLayer) return [];
    const imgs = Array.from(bunnyLayer.querySelectorAll("img"));
    const parents = imgs.map(img => img.parentElement).filter(Boolean);
    return Array.from(new Set(parents));
  }

  function centerOfEl(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // inner を作って transform 競合を避ける
  function ensureDanceInner(wrap) {
    if (!wrap) return null;
    let inner = wrap.querySelector(":scope > .wbDanceInner");
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

  // computed transform から回転角（deg）を取り出す
  function getRotationDeg(el) {
    try {
      const tr = getComputedStyle(el).transform;
      if (!tr || tr === "none") return 0;
      // matrix(a,b,c,d,tx,ty)
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(",").map(x => Number(x.trim()));
      const a = parts[0], b = parts[1];
      const rad = Math.atan2(b, a);
      return rad * 180 / Math.PI;
    } catch {
      return 0;
    }
  }

  function parsePx(v) {
    const n = Number(String(v || "").replace("px", ""));
    return Number.isFinite(n) ? n : 0;
  }

  // ビームの「光源（回転原点）」は、bgcolor.js設計上こう：
  // left/top が光源、translateX(-50%) により box 左端は left - width/2
  // transform-origin: 50% 0% なので原点は (width/2, 0)
  // ⇒ ワールド原点 = (bgRect.left + leftPx, bgRect.top + topPx)
  function getBeamOriginWorld(beamEl) {
    const bgLayer = $("#bgLayer") || beamEl.parentElement;
    if (!bgLayer) return null;
    const bgRect = bgLayer.getBoundingClientRect();

    const cs = getComputedStyle(beamEl);
    const left = parsePx(cs.left);
    const top  = parsePx(cs.top);

    return { x: bgRect.left + left, y: bgRect.top + top };
  }

  function getBeamSize(beamEl) {
    const cs = getComputedStyle(beamEl);
    const w = parsePx(cs.width);
    const h = parsePx(cs.height);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  // 点Pが「回転した三角ビーム」に入ってるか
  // 三角形（未回転）は apex(0,0) から下に伸びる等腰三角形：
  // apex=(0,0), base y=h, x範囲 = [-w/2, +w/2]
  // yの位置で許容される半幅 = (w/2) * (y/h)
  function isPointInsideBeam(point, beamEl) {
    if (!point || !beamEl || !beamEl.isConnected) return false;

    const origin = getBeamOriginWorld(beamEl);
    if (!origin) return false;

    const { w, h } = getBeamSize(beamEl);
    const angDeg = getRotationDeg(beamEl);
    const ang = angDeg * Math.PI / 180;

    // ワールド→原点相対
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    // 逆回転してビームローカルへ（ビームの軸を真下に戻す）
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;

    // 三角形内判定（fatPxで少し太らせる）
    const fat = Math.max(0, CFG.fatPx);
    if (ly < -fat) return false;
    if (ly > h + fat) return false;

    const half = (w / 2) * (ly / h);
    return Math.abs(lx) <= (half + fat);
  }

  function getBeams() {
    const wrap = document.getElementById(CFG.wrapId);
    if (!wrap || !wrap.isConnected) return [];

    const L = document.getElementById(CFG.leftId);
    const R = document.getElementById(CFG.rightId);

    const beams = [];
    if (L && L.isConnected) beams.push(L);
    if (R && R.isConnected) beams.push(R);

    // 念のため：beam class でも拾う
    wrap.querySelectorAll(".beam").forEach(b => {
      if (b && b.isConnected && !beams.includes(b)) beams.push(b);
    });

    return beams;
  }

  /* ========= SE ========= */
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

  /* ========= main ========= */
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
      const beams = getBeams();
      const wraps = findBunnyWraps();

      // ビームが無い(=mirrorball OFF)なら全部解除
      if (!beams.length) {
        wraps.forEach(w => setDancing(w, false));
        wantSe = false;
        applySeState();
        return;
      }

      let dancingCount = 0;

      for (const w of wraps) {
        const c = centerOfEl(w);
        if (!c) { setDancing(w, false); continue; }

        let hit = false;
        for (const beam of beams) {
          if (isPointInsideBeam(c, beam)) { hit = true; break; }
        }

        setDancing(w, hit);
        if (hit) dancingCount++;
      }

      wantSe = dancingCount > 0;
      applySeState();
    }

    tick();
    const timer = setInterval(tick, CFG.tickMs);

    // 変化時即反映（無くてもOK）
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("seVolumeChanged", () => syncSeVolume(WB)); } catch {}

    // 外部API
    if (WB) {
      WB.mirrorballSpotDance = {
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

    console.log("[mirrorball_spotlight_dance] ready V3", {
      beams: beamsInfo(),
      fatPx: CFG.fatPx,
    });

    function beamsInfo() {
      try {
        return getBeams().map(b => ({ id: b.id, angle: getRotationDeg(b).toFixed(1) }));
      } catch {
        return [];
      }
    }
  });
})();
