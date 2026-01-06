(() => {
  if (!window.WB) return;

  const WB = window.WB;

  // 価格インフレ
  const PRICE_INFLATION_PER_BUNNY = 0.08; // 1匹ごとに +8%
  const PRICE_ROUND_UNIT = 10;            // 10単位丸め

  let shopBackdrop = null;
  let shopModal = null;

  function calcDynamicPrice(kind) {
    const base = WB.BUNNY_DEFS[kind]?.price ?? 0;
    if (base <= 0) return 0;

    const n = WB.bunnies.length;
    const mul = 1 + n * PRICE_INFLATION_PER_BUNNY;
    const raw = Math.floor(base * mul);
    return Math.max(base, Math.ceil(raw / PRICE_ROUND_UNIT) * PRICE_ROUND_UNIT);
  }

  function getShopKinds() {
    const unlocked = WB.zisseki?.isUnlocked?.("unlock_bunny4");
    if (!unlocked) return ["bunny1", "bunny3"];
    return ["bunny1", "bunny3", "bunny4", "bunny5"];
  }

  function closeShopModal() {
    try { shopBackdrop?.remove(); } catch {}
    shopBackdrop = null;
    shopModal = null;
  }

  function showAdoptEffect(kind) {
    const def = WB.BUNNY_DEFS[kind] || WB.BUNNY_DEFS.bunny1;

    const overlay = document.createElement("div");
    overlay.className = "adoptFxOverlay";

    const fx = document.createElement("div");
    fx.className = "adoptFx";

    const box = document.createElement("div");
    box.className = "adoptBox";

    const lid = document.createElement("div");
    lid.className = "adoptLid";

    const thumb = document.createElement("img");
    thumb.className = "adoptThumb";
    thumb.src = def.img;

    fx.appendChild(box);
    fx.appendChild(lid);
    fx.appendChild(thumb);

    const sparkCount = 18;
    for (let i = 0; i < sparkCount; i++) {
      const s = document.createElement("div");
      s.className = "adoptSpark";
      const dx = (Math.random() * 2 - 1) * 130;
      const dy = (Math.random() * 2 - 1) * 130 - 70;
      s.style.setProperty("--dx", `${dx}px`);
      s.style.setProperty("--dy", `${dy}px`);
      const h = Math.floor(Math.random() * 360);
      s.style.background = `hsla(${h}, 92%, 72%, .95)`;
      s.style.boxShadow = `0 0 14px hsla(${h}, 92%, 72%, .65)`;
      s.style.left = "50%";
      s.style.top = "55%";
      s.style.transform = "translate(-50%,-50%)";
      s.style.animationDelay = `${120 + Math.random() * 220}ms`;
      fx.appendChild(s);
    }

    overlay.appendChild(fx);
    document.body.appendChild(overlay);

    setTimeout(() => {
      try { overlay.remove(); } catch {}
    }, 900);

    return 520;
  }

  function buyBunny(kind) {
    kind = WB.BUNNY_DEFS[kind] ? kind : "bunny1";
    const def = WB.BUNNY_DEFS[kind];
    if (!def || def.price <= 0) return false;

    const priceNow = calcDynamicPrice(kind);
    if (WB.coins < priceNow) return false;

    WB.coins -= priceNow;
    WB.saveCoins();
    WB.updateHud();

    const waitMs = showAdoptEffect(kind);
    setTimeout(() => {
      WB.spawnBunny(kind, Date.now());
      // 実績のチェックは zisseki.js が bunnyCountChanged を監視しているので自動
      refreshShopUI();
    }, waitMs);

    return true;
  }

  function buildShopModal() {
    if (!shopBackdrop) {
      shopBackdrop = document.createElement("div");
      shopBackdrop.id = "shopBackdrop";
      shopBackdrop.className = "modalBackdrop";
      document.body.appendChild(shopBackdrop);
    }
    if (!shopModal) {
      shopModal = document.createElement("div");
      shopModal.id = "shopModal";
      shopModal.className = "modal";
      shopBackdrop.appendChild(shopModal);
    }

    const kinds = getShopKinds();
    const cards = kinds.map((kind) => {
      const def = WB.BUNNY_DEFS[kind];
      const priceNow = calcDynamicPrice(kind);
      const canBuy = WB.coins >= priceNow;
      return `
        <div class="shopCard ${canBuy ? "" : "disabled"}">
          <img src="${def.img}" class="shopThumb" alt="${def.label}">
          <div class="shopName">${def.label}</div>
          <div class="shopDesc">${def.desc}</div>
          <div class="shopPrice ${canBuy ? "" : "bad"}">${priceNow} 🪙</div>
          <button data-buy="${kind}" ${canBuy ? "" : "disabled"}>お迎え</button>
        </div>
      `;
    }).join("");

    const nowCount = WB.bunnies.length;
    const unlocked = WB.zisseki?.isUnlocked?.("unlock_bunny4");
    const need = WB.zisseki?.UNLOCK_BUNNY4_NEED ?? 10;

    const progText = unlocked
      ? `✅ 解放済み`
      : `🔒 解放条件：同時うさぎ数 ${nowCount}/${need}`;

    shopModal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">🐰 お迎え</div>
        <button class="modalClose" id="closeShopBtn" aria-label="close">×</button>
      </div>

      <div style="font-size:12px;opacity:.85;margin-bottom:10px;line-height:1.5;">
        ${progText}<br>
        お迎えした子は <b>baby</b> で来て、<b>3分</b>で成長します。<br>
        <span style="opacity:.85;">※現在の匹数に応じて価格が上がります</span>
      </div>

      <div class="shopGrid">${cards}</div>

      <div style="margin-top:10px;font-size:12px;opacity:.9;">
        所持：<b>${WB.coins}🪙</b> / 現在：<b>${WB.bunnies.length}匹</b>
      </div>
    `;

    shopModal.querySelector("#closeShopBtn").onclick = closeShopModal;
    shopBackdrop.onclick = (e) => { if (e.target === shopBackdrop) closeShopModal(); };

    // ★連続購入：閉じない
    shopModal.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.getAttribute("data-buy");
        buyBunny(kind);
        refreshShopUI(); // 価格/所持/disabled即反映
      };
    });
  }

  function openShopModal() {
    buildShopModal();
  }

  function refreshShopUI() {
    if (!shopBackdrop || !shopModal) return;
    buildShopModal();
  }

  if (WB.shopBtn) {
    WB.shopBtn.addEventListener("click", () => {
      WB.unlockAudioOnce();
      openShopModal();
    });
  }

  // 実績が解放されたらショップUIを更新
  WB.on("achievementUnlocked", () => refreshShopUI());
  WB.on("bunnyCountChanged", () => refreshShopUI());

  WB.omukae = {
    openShopModal,
    closeShopModal,
    refreshShopUI,
    calcDynamicPrice,
    buyBunny,
  };
})();
