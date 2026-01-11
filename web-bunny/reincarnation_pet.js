// reincarnation_pet.js（転生時専用ペット：1体常駐） v3.2 FIX
// ✅ prestige.js の WB.emit("prestige") をトリガーに出現
// ✅ 1体のみ（重複生成なし）
// ✅ assets/tennchi.png の兎
// ✅ リロード後も常駐（LSでフラグ保存）
// ✅ FIX: prestige連打/再読み込み/複数回startFloatingで RAF が多重起動しない
// ✅ FIX: 置き場所を安定（#bunnyLayer / WB.bunnyLayer / #field / body の順）
// ✅ FIX: 画像読み込み失敗でも落ちない・DOM再生成に強い

(() => {
  "use strict";
  if (window.__REINC_PET_V3__) return;
  window.__REINC_PET_V3__ = true;

  const CFG = {
    LS_FLAG: "milkpop_reinc_pet_unlocked_v1",
    ID: "reincarnationPetV3",
    STYLE_ID: "reincPetStyleV3",

    IMG: "./assets/tennchi.png",

    size: 72,
    speed: 34,
    bobSpeed: 0.0012,
    boundsPad: 14,

    zIndex: 140, // ちょい上げ（見えない問題を避ける）
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * 状態
   * ========================= */
  function isUnlocked() {
    return localStorage.getItem(CFG.LS_FLAG) === "true";
  }
  function unlock() {
    localStorage.setItem(CFG.LS_FLAG, "true");
  }

  function waitForWB(timeout = 12000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB) {
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

  /* =========================
   * Style
   * ========================= */
  function ensureStyle() {
    if (document.getElementById(CFG.STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = CFG.STYLE_ID;
    s.textContent = `
#${CFG.ID}{
  position:absolute;
  width:${CFG.size}px;
  height:${CFG.size}px;
  pointer-events:none;
  z-index:${CFG.zIndex};
  will-change:transform;
  transform:translate3d(60px,80px,0);
}
#${CFG.ID} .aura{
  position:absolute;
  inset:0;
  border-radius:22px;
  background:radial-gradient(circle at 30% 30%,
    rgba(255,255,255,.95) 0%,
    rgba(255,200,240,.55) 28%,
    rgba(120,220,255,.35) 52%,
    rgba(0,0,0,0) 70%
  );
  filter:drop-shadow(0 18px 28px rgba(255,255,255,.25));
}
#${CFG.ID} img{
  position:absolute;
  left:50%; top:50%;
  width:${CFG.size}px;
  height:${CFG.size}px;
  transform:translate(-50%,-50%);
  user-select:none;
  -webkit-user-drag:none;
}
#${CFG.ID} .ring{
  position:absolute;
  left:50%; top:50%;
  width:${CFG.size + 16}px;
  height:${CFG.size + 16}px;
  transform:translate(-50%,-50%);
  border-radius:999px;
  border:2px dashed rgba(255,160,220,.6);
  animation:reincRing 2.4s linear infinite;
  opacity:.65;
}
#${CFG.ID} .spark{
  position:absolute;
  left:50%;
  top:-10px;
  transform:translateX(-50%);
  font-size:14px;
  font-weight:1000;
  opacity:.9;
  animation:reincSpark 1.2s ease-in-out infinite;
}
@keyframes reincRing{
  from{ transform:translate(-50%,-50%) rotate(0deg); }
  to  { transform:translate(-50%,-50%) rotate(360deg); }
}
@keyframes reincSpark{
  0%{ transform:translateX(-50%) translateY(0); opacity:.6; }
  50%{ transform:translateX(-50%) translateY(-8px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.6; }
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * DOM
   * ========================= */
  function getHost(WB) {
    // 置き場所の優先順位：bunnyLayer > field > body
    return (
      WB?.bunnyLayer ||
      $("#bunnyLayer") ||
      WB?.field ||
      $("#field") ||
      document.body
    );
  }

  function ensurePet(WB) {
    ensureStyle();
    const host = getHost(WB);

    let el = document.getElementById(CFG.ID);
    if (el && el.isConnected) {
      // host が変わった/消えた時に備えて付け直し
      if (el.parentElement !== host) {
        try { host.appendChild(el); } catch {}
      }
      return el;
    }

    el = document.createElement("div");
    el.id = CFG.ID;
    el.innerHTML = `
      <div class="aura"></div>
      <div class="ring"></div>
      <div class="spark">✨</div>
      <img src="${CFG.IMG}" alt="転生兎">
    `;

    // 画像が 404 等でも落ちないように
    const img = el.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        // 透明にして存在だけ維持（落下や例外防止）
        img.style.opacity = "0";
        img.style.filter = "grayscale(1)";
      });
    }

    host.appendChild(el);
    return el;
  }

  function getBoundsRect(WB) {
    const host = getHost(WB);
    if (!host) return { width: window.innerWidth, height: window.innerHeight };
    const r = host.getBoundingClientRect();
    return { width: r.width || window.innerWidth, height: r.height || window.innerHeight };
  }

  /* =========================
   * Motion（多重起動防止）
   * ========================= */
  const STATE = {
    running: false,
    raf: 0,
    WB: null,
    x: 60,
    y: 80,
    vx: 1,
    vy: 0.7,
    last: 0,
  };

  function stopFloating() {
    STATE.running = false;
    try { if (STATE.raf) cancelAnimationFrame(STATE.raf); } catch {}
    STATE.raf = 0;
  }

  function startFloating(WB) {
    STATE.WB = WB || STATE.WB;

    // 既に動いてるなら二重起動しない（ここが最大のFIX）
    if (STATE.running) return;

    // 未解放なら動かさない
    if (!isUnlocked()) return;

    STATE.running = true;
    STATE.last = performance.now();

    const tick = (now) => {
      if (!STATE.running) return;

      // LSが消された等で解放が解除されたら止める
      if (!isUnlocked()) {
        stopFloating();
        return;
      }

      const wb = STATE.WB;
      const pet = ensurePet(wb);

      const dt = Math.min(0.033, (now - (STATE.last || now)) / 1000);
      STATE.last = now;

      STATE.x += STATE.vx * CFG.speed * dt;
      STATE.y += STATE.vy * CFG.speed * dt;

      const bob = Math.sin(now * CFG.bobSpeed) * 10;

      const b = getBoundsRect(wb);
      const minX = CFG.boundsPad;
      const maxX = Math.max(minX, b.width - CFG.size - CFG.boundsPad);
      const minY = CFG.boundsPad;
      const maxY = Math.max(minY, b.height - CFG.size - CFG.boundsPad);

      if (STATE.x <= minX) { STATE.x = minX; STATE.vx = Math.abs(STATE.vx) || 1; }
      if (STATE.x >= maxX) { STATE.x = maxX; STATE.vx = -Math.abs(STATE.vx) || -1; }
      if (STATE.y <= minY) { STATE.y = minY; STATE.vy = Math.abs(STATE.vy) || 1; }
      if (STATE.y >= maxY) { STATE.y = maxY; STATE.vy = -Math.abs(STATE.vy) || -1; }

      pet.style.transform =
        `translate3d(${Math.round(STATE.x)}px, ${Math.round(STATE.y + bob)}px, 0)`;

      STATE.raf = requestAnimationFrame(tick);
    };

    STATE.raf = requestAnimationFrame(tick);
  }

  /* =========================
   * Boot
   * ========================= */
  waitForWB().then((WB) => {
    // 既に転生済みなら常駐
    if (isUnlocked()) startFloating(WB);

    // prestigeトリガー（多重購読も避ける）
    try {
      if (WB?.on && !WB.__reincPetPrestigeHooked__) {
        WB.__reincPetPrestigeHooked__ = true;
        WB.on("prestige", () => {
          unlock();
          startFloating(WB); // runningガードがあるので安全
        });
      }
    } catch {}

    // API
    if (WB) {
      WB.reincPet = {
        isActive: () => isUnlocked(),
        ensure: () => { unlock(); startFloating(WB); },
        remove: () => {
          stopFloating();
          try { document.getElementById(CFG.ID)?.remove(); } catch {}
          localStorage.removeItem(CFG.LS_FLAG);
        },
      };
    } else {
      // WBが無くても、LS解放済みなら body で動かす（保険）
      if (isUnlocked()) startFloating(null);
    }

    console.log("[reincarnation_pet] ready (prestige-triggered tennchi bunny) v3.2");
  });
})();
