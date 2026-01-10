// reincarnation_pet.js（転生専用生物：1体だけ常駐）
// ✅ 星(牧場の星) >= 1 で出現
// ✅ 1体だけ（重複生成しない）
// ✅ ふわふわ漂う + 近くでキラッとする（視覚的ご褒美）
// ✅ アセット無しでもCSSだけで成立（後から画像に差し替え可能）

(() => {
  "use strict";
  if (window.__REINC_PET_V1__) return;
  window.__REINC_PET_V1__ = true;

  const CFG = {
    LS_STARS: "wb_stars_v1",
    ID: "reincarnationPetV1",
    tickMs: 60,
    speed: 34,          // 漂う速度
    bobSpeed: 0.0012,   // 上下
    boundsPad: 12,
  };

  const $ = (q, p = document) => p.querySelector(q);

  function getStars() {
    const n = Number(localStorage.getItem(CFG.LS_STARS) || "0");
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

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
    if (document.getElementById("reincPetStyleV1")) return;
    const s = document.createElement("style");
    s.id = "reincPetStyleV1";
    s.textContent = `
#${CFG.ID}{
  position:absolute;
  width: 64px;
  height: 64px;
  pointer-events:none;
  z-index: 60; /* bunnyより上にしたいなら上げてOK */
  transform: translate3d(0,0,0);
  will-change: transform;
}
#${CFG.ID} .core{
  width:100%;
  height:100%;
  border-radius: 22px;
  background: radial-gradient(circle at 30% 30%,
    rgba(255,255,255,.95) 0%,
    rgba(255,255,255,.80) 18%,
    rgba(255,120,200,.25) 44%,
    rgba(120,255,230,.22) 62%,
    rgba(120,160,255,.18) 78%,
    rgba(0,0,0,0) 100%
  );
  filter: drop-shadow(0 18px 28px rgba(0,0,0,.18));
  position:relative;
  overflow:visible;
}
#${CFG.ID} .face{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%,-50%);
  font-size: 26px;
  opacity:.95;
  text-shadow: 0 10px 22px rgba(0,0,0,.18);
}
#${CFG.ID} .ring{
  position:absolute;
  left:50%; top:50%;
  width: 74px; height: 74px;
  transform: translate(-50%,-50%);
  border-radius: 999px;
  border: 2px dashed rgba(255,120,200,.55);
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.10));
  animation: reincRing 2.2s linear infinite;
  opacity:.6;
}
@keyframes reincRing{
  from { transform: translate(-50%,-50%) rotate(0deg); }
  to   { transform: translate(-50%,-50%) rotate(360deg); }
}
#${CFG.ID} .spark{
  position:absolute;
  left:50%; top:-8px;
  transform: translateX(-50%);
  font-weight:1000;
  font-size: 14px;
  opacity:.9;
  animation: reincSpark 1.2s ease-in-out infinite;
  text-shadow: 0 10px 20px rgba(0,0,0,.18);
}
@keyframes reincSpark{
  0%{ transform:translateX(-50%) translateY(0); opacity:.65; }
  50%{ transform:translateX(-50%) translateY(-8px); opacity:1; }
  100%{ transform:translateX(-50%) translateY(0); opacity:.65; }
}
`;
    document.head.appendChild(s);
  }

  function getFieldBounds(WB) {
    const field = WB?.field || $("#field") || document.body;
    const r = field.getBoundingClientRect();
    return { el: field, w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function ensurePet(WB) {
    ensureStyle();
    const { el: field } = getFieldBounds(WB);

    let root = document.getElementById(CFG.ID);
    if (root && root.isConnected) return root;

    root = document.createElement("div");
    root.id = CFG.ID;
    root.innerHTML = `
      <div class="core">
        <div class="ring"></div>
        <div class="spark">❤</div>
        <div class="face">🐾</div>
      </div>
    `;
    field.appendChild(root);
    return root;
  }

  function removePet() {
    try { document.getElementById(CFG.ID)?.remove(); } catch {}
  }

  waitForWB().then((WB) => {
    let x = 40, y = 80;
    let vx = 1, vy = 0.6;
    let last = performance.now();
    let timer = 0;

    function tick(now) {
      if (getStars() < 1) {
        removePet();
        return;
      }

      const pet = ensurePet(WB);
      const b = getFieldBounds(WB);

      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // 漂う
      x += vx * CFG.speed * dt;
      y += vy * CFG.speed * dt;

      // ゆるい上下（転生感）
      const bob = Math.sin(now * CFG.bobSpeed) * 10;

      // 反射
      const minX = CFG.boundsPad;
      const maxX = Math.max(minX, b.w - 64 - CFG.boundsPad);
      const minY = 8 + CFG.boundsPad;
      const maxY = Math.max(minY, b.h - 64 - CFG.boundsPad);

      if (x <= minX) { x = minX; vx = Math.abs(vx); }
      if (x >= maxX) { x = maxX; vx = -Math.abs(vx); }
      if (y <= minY) { y = minY; vy = Math.abs(vy); }
      if (y >= maxY) { y = maxY; vy = -Math.abs(vy); }

      pet.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y + bob)}px, 0)`;
    }

    function loop() {
      const stars = getStars();
      if (stars < 1) {
        removePet();
        timer = setTimeout(loop, 600);
        return;
      }

      const raf = () => {
        if (getStars() < 1) { removePet(); return; }
        tick(performance.now());
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }

    // starsChanged / reincarnated で即反映
    try { WB?.on?.("starsChanged", () => { /* 次のtickで出る */ }); } catch {}
    try { WB?.on?.("reincarnated",  () => { /* 次のtickで出る */ }); } catch {}

    loop();

    // 公開API
    if (WB) {
      WB.reincPet = {
        remove: removePet,
        isActive: () => getStars() >= 1,
      };
    }

    console.log("[reincarnation_pet] ready (stars>=1 => spawn 1 pet)");
  });
})();
