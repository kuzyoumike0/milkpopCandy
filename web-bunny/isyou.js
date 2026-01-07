// isyou.js — お洒落（帽子）システム 完全版

(() => {
  if (!window.WB) {
    console.warn("[isyou] WB not found");
    return;
  }

  const WB = window.WB;

  /* =========================
   * Assets / Storage
   * ========================= */
  const ITEM = {
    partyhat: {
      label: "パーティーハット",
      img: "./assets/partyhat.png",
      price: 500,
      scale: 1.15,
      offsetX: 0,
      offsetY: -18,
    },
  };

  const LS = {
    owned: "wb_isyou_owned_v1",     // { partyhat: number }
    equipped: "wb_isyou_equipped_v1", // { bornAt: { partyhat:true } }
  };

  const owned = JSON.parse(localStorage.getItem(LS.owned) || "{}");
  const equipped = JSON.parse(localStorage.getItem(LS.equipped) || "{}");

  function save() {
    localStorage.setItem(LS.owned, JSON.stringify(owned));
    localStorage.setItem(LS.equipped, JSON.stringify(equipped));
  }

  /* =========================
   * HUD Button
   * ========================= */
  const hud = document.getElementById("hud");
  if (!hud) return;

  const btn = document.createElement("button");
  btn.textContent = "お洒落";
  hud.appendChild(btn);

  let equipMode = false;
  let currentItem = null;

  btn.addEventListener("click", () => {
    equipMode = !equipMode;
    currentItem = equipMode ? "partyhat" : null;
    btn.style.background = equipMode ? "#ffe6f2" : "#fff";
  });

  /* =========================
   * Bunny hook
   * ========================= */
  function applyItem(bunny) {
    if (bunny.isBaby) return;

    const key = bunny.bornAt;
    equipped[key] = equipped[key] || {};
    equipped[key][currentItem] = true;
    save();

    drawItem(bunny);
  }

  function drawItem(bunny) {
    const key = bunny.bornAt;
    const items = equipped[key];
    if (!items) return;

    for (const name in items) {
      if (!ITEM[name]) continue;

      const cfg = ITEM[name];

      let img = bunny.wrap.querySelector(`.isyou-${name}`);
      if (!img) {
        img = document.createElement("img");
        img.className = `isyou-${name}`;
        img.src = cfg.img;
        img.style.position = "absolute";
        img.style.left = "50%";
        img.style.top = "0";
        img.style.transform = `translate(-50%, ${cfg.offsetY}px) scale(${cfg.scale})`;
        img.style.pointerEvents = "none";
        bunny.wrap.appendChild(img);
      }
    }
  }

  /* =========================
   * Bunny Click Listen
   * ========================= */
  WB.on("bunnyCountChanged", () => {
    WB.bunnies.forEach(drawItem);
  });

  // ★ 装着モード中にうさぎをクリック
  document.addEventListener("pointerdown", (e) => {
    if (!equipMode || !currentItem) return;

    const wrap = e.target.closest?.(".bunnyWrap");
    if (!wrap) return;

    const bunny = WB.bunnies.find(b => b.wrap === wrap);
    if (!bunny) return;

    applyItem(bunny);
  });

})();
