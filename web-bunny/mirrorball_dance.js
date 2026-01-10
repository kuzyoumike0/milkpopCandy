// mirrorball_dance.js
// ✅ ミラーボール範囲内のうさぎが踊る（モーション）
// ✅ 範囲内に1匹でも居る間だけ SE をループ（WB.se.loop があればそれ優先）
// ✅ ミラーボール検出：data属性 or 画像srcに "mirrorball" を含む
// ✅ うさぎ検出：.bunnyWrap or #bunnyLayer 下の親要素をwrap扱い
//
// 読み込み順：app.js / itemPlace.js / BGM.js(あれば) の後（最後の方）推奨

(() => {
  "use strict";
  if (window.__MIRRORBALL_DANCE_V1__) return;
  window.__MIRRORBALL_DANCE_V1__ = true;

  const CFG = {
    radiusPx: 180,           // ミラーボール中心からこの距離以内で踊る
    tickMs: 180,             // 判定間隔
    seSrc: "./assets/mirrorball.mp3", // ← ミラーボールSE（なければ好きなパスへ）
    seLoopId: "mirrorball_dance_loop_v1",
    seStartDelayMs: 120,     // 出入りでブツブツしないように少し遅延
    stopFadeMs: 180,         // フォールバックAudioの停止フェード
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
    if (document.getElementById("wbMirrorballDanceStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbMirrorballDanceStyleV1";
    s.textContent = `
/* 踊ってる状態（wrapに付く） */
.wbDancing{
  filter: saturate(1.02) brightness(1.04);
}

/* うさぎの“踊り”モーション（画像を揺らす） */
.wbDancing img{
  transform-origin: 50% 85%;
  animation: wbDanceWiggle .42s ease-in-out infinite;
}

/* ふわっと上下 */
.wbDancing{
  animation: wbDanceHop .42s ease-in-out infinite;
}

@keyframes wbDanceWiggle{
  0%   { transform: rotate(-3deg) translateY(0px) scale(1.00); }
  50%  { transform: rotate(3deg)  translateY(-1px) scale(1.01); }
  100% { transform: rotate(-3deg) translateY(0px) scale(1.00); }
}
@keyframes wbDanceHop{
  0%   { transform: translateY(0px); }
  50%  { transform: translateY(-2px); }
  100% { transform: translateY(0px); }
}

/* キラキラ（任意演出） */
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
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ミラーボール要素検出（data属性 or srcに mirrorball）
  function findMirrorballs() {
    const arr = [];

    document.querySelectorAll('[data-item="mirrorball"],[data-item-id="mirrorball"],[data-kind="mirrorball"]').forEach(e => arr.push(e));

    document.querySelectorAll("img").forEach(img => {
      const src = String(img.getAttribute("src") || "").toLowerCase();
      if (src.includes("mirrorball")) arr.push(img);
    });

    const itemLayer = $("#itemLayer") || $("#itemlayer") || $("#itemsLayer") || $("#decorLayer");
    if (itemLayer) {
      itemLayer.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").toLowerCase();
        if (src.includes("mirrorball")) arr.push(img);
      });
    }

    return Array.from(new Set(arr)).filter(Boolean);
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
      if (p && typeof p.catch === "function") {
        p.catch(() => { /* 自動再生ブロックは黙って許容 */ });
      }
    },
    stop() {
      if (!this.el || !this.playing) return;
      const a = this.el;
      this.playing = false;

      // 簡易フェードアウト
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
    // WB.se.loop が使えるならそれを使う（BGM.jsのSEスライダーに追従できる）
    try {
      if (WB && WB.se && typeof WB.se.loop === "function") {
        // id 付きループ（想定） / そうでなくても引数順を吸収するため try を複数
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
        // stop(src) 型の可能性
        try { WB.se.stop(CFG.seSrc); return true; } catch {}
      }
    } catch {}
    audioFallback.stop();
    return true;
  }

  function syncSeVolume(WB) {
    // WB.se 側は内部追従してる想定。フォールバックだけ追従
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
        // 少し遅延して開始（出入りのチラつき防止）
        seTimer = setTimeout(() => {
          seTimer = 0;
          seOn = true;
          startLoopSe(WB);
        }, CFG.seStartDelayMs);
      } else if (!wantSe && seOn) {
        seOn = false;
        stopLoopSe(WB);
      } else {
        // volumeだけ同期（SEスライダー）
        syncSeVolume(WB);
      }
    }

    function tick() {
      const balls = findMirrorballs();
      const wraps = findBunnyWraps();

      if (!balls.length) {
        // ミラーボールが無いなら全部解除＆SE停止
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

    // itemPlaceなどがイベントを出してたら即反映（無くてもOK）
    try { WB?.on?.("itemPlaced", tick); } catch {}
    try { WB?.on?.("itemRemoved", tick); } catch {}
    try { WB?.on?.("bunnyCountChanged", tick); } catch {}
    try { WB?.on?.("coinsChanged", () => syncSeVolume(WB)); } catch {}
    try { WB?.on?.("seVolumeChanged", () => syncSeVolume(WB)); } catch {}

    // 外部停止API
    if (WB) {
      WB.mirrorballDance = {
        stop: () => {
          try { clearInterval(timer); } catch {}
          wantSe = false;
          applySeState();
          // 全解除
          try { findBunnyWraps().forEach(w => setDancing(w, false)); } catch {}
        },
        tick,
        config: CFG,
      };
    }

    console.log("[mirrorball_dance] ready", { radius: CFG.radiusPx, se: CFG.seSrc });
  });
})();
