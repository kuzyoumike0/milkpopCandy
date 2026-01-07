// isyou.js — お洒落（ショップ＋装着＋flip補正＋赤枠）完全版（WB待機つき）
// ★partyhat を頭に自然にかぶせる（anchorY対応 / 小サイズ）

(() => {
  "use strict";

  /* =========================
   * Wait for WB
   * ========================= */
  const WAIT_MS = 8000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB.on === "function") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found"));
        }
      }, TICK_MS);
    });
  }

  waitForWB().then((WB) => {
    if (window.__ISYOU_INITED__) return;
    window.__ISYOU_INITED__ = true;

    /* =========================
     * Config
     * ========================= */
    const LS = {
      owned: "wb_isyou_owned_v2",
      equipped: "wb_isyou_equipped_v2",
    };

    const ITEMS = {
      partyhat: {
        label: "パーティーハット",
        img: "./assets/isyou/partyhat.png",
        price: 500,

        anchorY: 1.00,   // 頭頂部
        offsetX: 14,
        offsetY: -6,
        scale: 0.6,      // ★最終確定：小さめ
        z: 25,
      },

      crown: {
        label: "王冠",
        img: "./assets/isyou/crown.png",
        price: 3500,
        anchorY: 0.1,
        offsetX: 0,
        offsetY: -26,
        scale: 1.25,
        z: 30,
      },

      ribbon: {
        label: "リボン",
        img: "./assets/isyou/ribbon.png",
        price: 1200,
        anchorY: 0.55,
        offsetX: 0,
        offsetY: 10,
        scale: 1.05,
        z: 10,
      },
    };

    /* =========================
     * HUD（お洒落ボタン）
     * ========================= */
    const hud = document.getElementById("hud");
    if (!hud) return;

    let isyouBtn = document.getElementById("isyouBtn");
    if (!isyouBtn) {
      isyouBtn = document.createElement("button");
      isyouBtn.id = "isyouBtn";
      isyouBtn.textContent = "お洒落";
      hud.appendChild(isyouBtn);
    }

    /* =========================
     * CSS
     * ========================= */
    if (!document.getElementById("isyouStyleFinal")) {
      const s = document.createElement("style");
      s.id = "isyouStyleFinal";
      s.textContent = `
#isyouBtn{ z-index:2147483647; }

body.isyouEquipMode .bunnyWrap:hover{
  outline:4px solid rgba(255,64,64,.6);
  outline-offset:3px;
  border-radius:18px;
}
.bunnyWrap.isyouSelectedTarget{
  outline:4px solid rgba(255,64,64,.92);
  outline-offset:3px;
  border-radius:18px;
}
.bunnyWrap.isyouJustEquipped{
  animation:isyouBlink .52s;
}
@keyframes isyouBlink{
  0%{filter:brightness(1)}
  50%{filter:brightness(1.15)}
  100%{filter:brightness(1)}
}

.isyouLayer{ position:absolute; inset:0; pointer-events:none; }
.isyouItem{
  position:absolute;
  left:50%;
  transform-origin:50% 50%;
  pointer-events:none;
}

.isyouBackdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.45);
  display:grid; place-items:center;
  z-index:2147483600;
}
.isyouModal{
  width:min(92vw,560px);
  background:#fff;
  border-radius:18px;
  padding:14px;
}

body.isyouEquipMode .isyouBackdrop{ pointer-events:none; background:rgba(0,0,0,.25); }
body.isyouEquipMode .isyouModal{ pointer-events:auto; }
`;
      document.head.appendChild(s);
    }

    /* =========================
     * Storage
     * ========================= */
    const owned = JSON.parse(localStorage.getItem(LS.owned) || "{}");
    const equipped = JSON.parse(localStorage.getItem(LS.equipped) || "{}");

    const saveAll = () => {
      localStorage.setItem(LS.owned, JSON.stringify(owned));
      localStorage.setItem(LS.equipped, JSON.stringify(equipped));
    };

    /* =========================
     * Helpers
     * ========================= */
    const getBunnies = () =>
      Array.isArray(WB.bunnies) ? WB.bunnies :
      (typeof WB.getBunnies === "function" ? WB.getBunnies() : []);

    function ensureLayer(bunny) {
      let layer = bunny.wrap.querySelector(".isyouLayer");
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "isyouLayer";
        bunny.wrap.appendChild(layer);
      }
      return layer;
    }

    function applyTransform(img, bunny, it) {
      const flip = bunny.wrap.classList.contains("flip");
      const fx = flip ? -1 : 1;
      const ox = (it.offsetX || 0) * (flip ? -1 : 1);

      img.style.top = `${(it.anchorY ?? 0) * 100}%`;
      img.style.transform =
        `translate(calc(-50% + ${ox}px), ${it.offsetY}px) scale(${it.scale}) scaleX(${fx})`;
      img.style.zIndex = it.z || 10;
    }

    function drawAllForBunny(bunny) {
      if (!bunny || bunny.isBaby) return;

      const layer = ensureLayer(bunny);
      const eq = equipped[bunny.bornAt] || {};
      layer.innerHTML = "";

      Object.keys(eq).forEach((key) => {
        if (!eq[key]) return;
        const it = ITEMS[key];
        if (!it) return;

        const img = document.createElement("img");
        img.className = "isyouItem";
        img.src = it.img;
        applyTransform(img, bunny, it);
        layer.appendChild(img);
      });
    }

    function redrawAll() {
      getBunnies().forEach(drawAllForBunny);
    }

    function toggleEquip(bunny, key) {
      if (!bunny || bunny.isBaby) return;
      equipped[bunny.bornAt] ??= {};
      equipped[bunny.bornAt][key] = !equipped[bunny.bornAt][key];
      saveAll();
      drawAllForBunny(bunny);

      bunny.wrap.classList.add("isyouJustEquipped");
      setTimeout(() => bunny.wrap.classList.remove("isyouJustEquipped"), 520);
    }

    /* =========================
     * Equip interaction
     * ========================= */
    let equipMode = false;
    let selectedBornAt = null;
    const selectedItems = new Set(["partyhat"]);

    function setSelected(bunny) {
      getBunnies().forEach(b => b.wrap.classList.remove("isyouSelectedTarget"));
      if (!bunny) { selectedBornAt = null; return; }
      selectedBornAt = bunny.bornAt;
      bunny.wrap.classList.add("isyouSelectedTarget");
    }

    document.addEventListener("pointerdown", (e) => {
      if (!equipMode) return;
      if (e.target.closest(".isyouModal")) return;

      const wrap = e.target.closest(".bunnyWrap");
      if (!wrap) return;

      const bunny = getBunnies().find(b => b.wrap === wrap);
      if (!bunny) return;

      if (selectedBornAt == null) {
        setSelected(bunny);
      } else if (bunny.bornAt === selectedBornAt) {
        selectedItems.forEach(k => toggleEquip(bunny, k));
      } else {
        setSelected(bunny);
      }
    }, { capture:true });

    /* =========================
     * Modal
     * ========================= */
    let backdrop = null;

    function openModal() {
      if (backdrop) return;

      backdrop = document.createElement("div");
      backdrop.className = "isyouBackdrop";

      const modal = document.createElement("div");
      modal.className = "isyouModal";
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b>🎀 お洒落</b>
          <button id="isyouClose">×</button>
        </div>
        <button id="equipToggle" style="margin-top:10px;">装着モード切替</button>
      `;

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      modal.querySelector("#isyouClose").onclick = closeModal;
      modal.querySelector("#equipToggle").onclick = () => {
        equipMode = !equipMode;
        document.body.classList.toggle("isyouEquipMode", equipMode);
        if (!equipMode) setSelected(null);
      };
    }

    function closeModal() {
      equipMode = false;
      document.body.classList.remove("isyouEquipMode");
      setSelected(null);
      backdrop?.remove();
      backdrop = null;
    }

    isyouBtn.onclick = openModal;

    /* =========================
     * Hooks
     * ========================= */
    WB.on?.("bunnyCountChanged", redrawAll);
    WB.on?.("resize", redrawAll);

    redrawAll();
    console.log("[isyou] ready");
  }).catch(console.warn);
})();
