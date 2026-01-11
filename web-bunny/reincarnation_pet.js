// reincarnation_pet.js（転生専用生物：1体だけ常駐 + 天使兎）
// ✅ 星(牧場の星) >= 1 で出現
// ✅ 1体だけ（重複生成しない）
// ✅ ふわふわ漂う + キラ演出
// ✅ 転生時に assets/tennchi.png の兎を1体出現

(() => {
  "use strict";
  if (window.__REINC_PET_V2__) return;
  window.__REINC_PET_V2__ = true;

  const CFG = {
    LS_PRESTIGE: "wb_prestige_v1",   // ⭐ prestige.js と統一
    ID: "reincarnationPetV2",
    IMG: "./assets/tennchi.png",

    size: 72,
    tickMs: 60,
    speed: 34,
    bobSpeed: 0.0012,
    boundsPad: 14,
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * 星取得（prestige.js準拠）
   * ========================= */
  function getStars() {
    try {
      const st = JSON.parse(localStorage.getItem(CFG.LS_PRESTIGE) || "null");
      const n = Number(st?.stars || 0);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    } catch {
      return 0;
    }
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
    if (document.getElementById("reincPetStyleV2")) return;
    const s = document.createElement("style");
    s.id = "reincPetStyleV2";
    s.textContent = `
#${CFG.ID}{
  position:absolute;
  width:${CFG.size}px;
  height:${CFG.size}px;
  pointer-events:none;
  z-index:80;
  will-change:transform;
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
  height:auto;
  transform:translate(-50%,-50%);
  pointer-events:none;
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
   * Field
   * ========================= */
  function getField(WB) {
    return WB?.field || $("#field") || document.body;
  }

  function ensurePet(WB) {
    ensureStyle();
    const field = getField(WB);

    let el = document.getElementById(CFG.ID);
    if (el && el.isConnected) return el;

    el = document.createElement("div");
    el.id = CFG.ID;
    el.innerHTML = `
      <div class="aura"></div>
      <div class="ring"></div>
      <div class="spark">✨</div>
      <img src="${CFG.IMG}" alt="転生兎">
    `;
    field.appendChild(el);
    return el;
  }

  function removePet() {
    try { document.getElementById(CFG.ID)?.remove(); } catch {}
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then((WB) => {
    let x = 60, y = 80;
    let vx = 1, vy = 0.7;
    let last = performance.now();

    function tick(now) {
      if (getStars() < 1) {
        removePet();
        return;
      }

      const pet = ensurePet(WB);
      const field = getField(WB);
      const r = field.getBoundingClientRect();

      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      x += vx * CFG.speed * dt;
      y += vy * CFG.speed * dt;

      const bob = Math.sin(now * CFG.bobSpeed) * 10;

      const minX = CFG.boundsPad;
      const maxX = Math.max(minX, r.width - CFG.size - CFG.boundsPad);
      const minY = CFG.boundsPad;
      const maxY = Math.max(minY, r.height - CFG.size - CFG.boundsPad);

      if (x <= minX) { x = minX; vx = Math.abs(vx); }
      if (x >= maxX) { x = maxX; vx = -Math.abs(vx); }
      if (y <= minY) { y = minY; vy = Math.abs(vy); }
      if (y >= maxY) { y = maxY; vy = -Math.abs(vy); }

      pet.style.transform =
        `translate3d(${Math.round(x)}px, ${Math.round(y + bob)}px, 0)`;
    }

    function loop() {
      if (getStars() < 1) {
        removePet();
        setTimeout(loop, 500);
        return;
      }
      const raf = () => {
        tick(performance.now());
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }

    // 転生直後に即反映
    try { WB?.on?.("prestige", loop); } catch {}
    try { WB?.on?.("starsChanged", loop); } catch {}

    loop();

    // API
    if (WB) {
      WB.reincPet = {
        remove: removePet,
        isActive: () => getStars() >= 1,
      };
    }

    console.log("[reincarnation_pet] ready (tennchi bunny spawn)");
  });
})();
