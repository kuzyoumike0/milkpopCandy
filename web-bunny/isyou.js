// isyou.js — お洒落（ショップ＋複数装着＋flip補正＋称号連動＋赤枠）完全版（WB待機つき）
// ★装着は「赤枠で囲った（=選択した）うさぎ」にだけ行う
// ★装着モード中はモーダル背景をクリック透過

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
          reject(new Error("WB not found in time"));
        }
      }, TICK_MS);
    });
  }

  /* =========================
   * Main init
   * ========================= */
  waitForWB().then((WB) => {
    if (window.__ISYOU_INITED__) return;
    window.__ISYOU_INITED__ = true;

    /* =========================
     * Config
     * ========================= */
    const LS = {
      owned: "wb_isyou_owned_v2",
      equipped: "wb_isyou_equipped_v2",
      title: (WB.LS && WB.LS.title) ? WB.LS.title : "wb_title_v1",
    };

    const ITEMS = {
      partyhat: {
        label: "パーティーハット",
        img: "./assets/isyou/partyhat.png",
        price: 500,
        offsetX: 0,
        offsetY: -18,
        scale: 1.15,
        z: 20,
      },
      crown: {
        label: "王冠",
        img: "./assets/isyou/crown.png",
        price: 3500,
        offsetX: 0,
        offsetY: -28,
        scale: 1.2,
        z: 30,
      },
      ribbon: {
        label: "リボン",
        img: "./assets/isyou/ribbon.png",
        price: 1200,
        offsetX: 0,
        offsetY: 32,
        scale: 1.05,
        z: 10,
      },
    };

    /* =========================
     * CSS inject
     * ========================= */
    if (!document.getElementById("isyouStyleV5")) {
      const s = document.createElement("style");
      s.id = "isyouStyleV5";
      s.textContent = `
#isyouBtn{ z-index:2147483647; }

/* --- 装着モード中は背景クリック透過 --- */
body.isyouEquipMode .isyouBackdrop{
  pointer-events:none;
}
body.isyouEquipMode .isyouModal{
  pointer-events:auto;
}

/* 赤枠 */
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
.isyouItem{ position:absolute; left:50%; top:0; transform-origin:50% 50%; }

.isyouBackdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.45);
  display:grid; place-items:center;
  z-index:2147483600;
}
.isyouModal{
  width:min(92vw,560px);
  max-height:86vh;
  background:#fff;
  border-radius:18px;
  padding:14px;
  overflow:auto;
}
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
     * Equip SE
     * ========================= */
    const equipSe = new Audio("./assets/Onoma-Pop03-1(High).mp3");
    equipSe.preload = "auto";
    equipSe.volume = 0.9;

    function playEquipSe() {
      try {
        WB.unlockAudioOnce?.();
        equipSe.currentTime = 0;
        equipSe.play().catch(() => {});
      } catch {}
    }

    /* =========================
     * HUD Button
     * ========================= */
    const hud = document.getElementById("hud");
    if (!hud) return;

    let btn = document.getElementById("isyouBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "isyouBtn";
      btn.textContent = "お洒落";
      hud.appendChild(btn);
    }

    /* =========================
     * Bunny helpers
     * ========================= */
    const getBunnies = () =>
      Array.isArray(WB.bunnies)
        ? WB.bunnies
        : (typeof WB.getBunnies === "function" ? WB.getBunnies() : []);

    function getBunnyFromWrap(wrap) {
      return getBunnies().find(b =>
        b?.wrap &&
        (b.wrap === wrap ||
         wrap.contains(b.wrap) ||
         b.wrap.contains(wrap))
      ) || null;
    }

    /* =========================
     * Accessory draw
     * ========================= */
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
      const ox = it.offsetX * (flip ? -1 : 1);
      img.style.transform =
        `translate(calc(-50% + ${ox}px), ${it.offsetY}px) scale(${it.scale}) scaleX(${fx})`;
      img.style.zIndex = it.z;
    }

    function drawAllForBunny(bunny) {
      if (bunny.isBaby) return;
      const layer = ensureLayer(bunny);
      layer.innerHTML = "";
      const eq = equipped[bunny.bornAt] || {};
      Object.keys(eq).forEach(k => {
        if (!eq[k]) return;
        const it = ITEMS[k];
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
      if ((owned[key] || 0) <= 0) return;
      equipped[bunny.bornAt] = equipped[bunny.bornAt] || {};
      equipped[bunny.bornAt][key] = !equipped[bunny.bornAt][key];
      saveAll();
      drawAllForBunny(bunny);
      playEquipSe();
      bunny.wrap.classList.add("isyouJustEquipped");
      setTimeout(() => bunny.wrap.classList.remove("isyouJustEquipped"), 520);
    }

    /* =========================
     * Equip mode click
     * ========================= */
    let equipMode = false;
    let selectedBornAt = null;
    const selectedItems = new Set();

    function setSelectedTarget(bunny) {
      getBunnies().forEach(b => b.wrap.classList.remove("isyouSelectedTarget"));
      if (!bunny) {
        selectedBornAt = null;
        return;
      }
      selectedBornAt = bunny.bornAt;
      bunny.wrap.classList.add("isyouSelectedTarget");
    }

    document.addEventListener("pointerdown", (e) => {
      if (!equipMode) return;
      const wrap = e.target.closest(".bunnyWrap");
      if (!wrap) return;

      const bunny = getBunnyFromWrap(wrap);
      if (!bunny || bunny.isBaby) return;

      if (selectedBornAt == null) {
        setSelectedTarget(bunny);
        return;
      }
      if (bunny.bornAt === selectedBornAt) {
        selectedItems.forEach(k => toggleEquip(bunny, k));
        return;
      }
      setSelectedTarget(bunny);
    }, { capture:true });

    /* =========================
     * Button toggle
     * ========================= */
    btn.onclick = () => {
      equipMode = !equipMode;
      document.body.classList.toggle("isyouEquipMode", equipMode);
      if (!equipMode) setSelectedTarget(null);
    };

    redrawAll();
  }).catch(console.warn);
})();
