// omukae.js（うさぎお迎え専用・非module）
// ✅ #shopBtn（お迎え）専用
// ✅ 背景ショップ（bgShopBtn）とは完全分離
// ✅ shop.js の capture / stopImmediatePropagation に影響されない
// ✅ WB.on("omukae:open") にも対応（他JSから開ける）

(() => {
  if (!window.WB) return;

  const WB = window.WB;

  /* =========================
   * 設定
   * ========================= */
  const PRICE_INFLATION_PER_BUNNY = 0.08; // 1匹ごとに +8%
  const PRICE_ROUND_UNIT = 10;            // 10単位丸め

  let shopBackdrop = null;
  let shopModal = null;

  /* =========================
   * WB互換ヘルパ
   * ========================= */
  function getBunnyCount() {
    if (typeof WB.getBunnies === "function") return WB.getBunnies().length;
    if (Array.isArray(WB.bunnies)) return WB.bunnies.length;
    return 0;
  }

  function getCoins() {
    if (typeof WB.getCoin === "function") return WB.getCoin();
    if (typeof WB.coins === "number") return WB.coins;
    const el = document.getElementById("coinValue");
    return el ? Number(el.textContent || "0") : 0;
  }

  function spendCoins(amount) {
    if (typeof WB.spendCoin === "function") return WB.spendCoin(amount);

    if (typeof WB.coins === "number" && WB.coins >= amount) {
      WB.coins -= amount;
      WB.saveCoins?.();
      WB.updateHud?.();
      return true;
    }
    return false;
  }

  /* =========================
   * Bunny定義
   * ========================= */
  function getDefs() {
    if (Array.isArray(WB.omukaeCatalog) && WB.omukaeCatalog.length) {
      const map = {};
      for (const it of WB.omukaeCatalog) {
        if (!it?.key) continue;
        map[it.key] = {
          label: it.name || it.key,
          desc: it.desc || "お迎えした子は baby で来て、3分で成長します。",
          img: it.src,
          adultSrc: it.src,
          price: Number(it.cost || it.price || 0),
        };
      }
      return map;
    }

    if (WB.BUNNY_DEFS) return WB.BUNNY_DEFS;

    const a = WB.assets || {};
    return {
      bunny1: { label: "bunny1", desc: "", img: a.bunny1 || "", adultSrc: a.bunny1 || "", price: 200 },
      bunny3: { label: "bunny3", desc: "", img: a.bunny3 || "", adultSrc: a.bunny3 || "", price: 200 },
      bunny4: { label: "bunny4", desc: "", img: a.bunny4 || "", adultSrc: a.bunny4 || "", price: 200 },
      bunny5: { label: "bunny5", desc: "", img: a.bunny5 || "", adultSrc: a.bunny5 || "", price: 200 },
    };
  }

  function calcDynamicPrice(kind) {
    const defs = getDefs();
    const base = defs[kind]?.price ?? 0;
    if (base <= 0) return 0;

    const n = getBunnyCount();
    const mul = 1 + n * PRICE_INFLATION_PER_BUNNY;
    const raw = Math.floor(base * mul);
    return Math.max(base, Math.ceil(raw / PRICE_ROUND_UNIT) * PRICE_ROUND_UNIT);
  }

  function getShopKinds() {
    const unlocked = WB.zisseki?.isUnlocked?.("unlock_bunny4");
    if (!unlocked) return ["bunny1", "bunny3"];
    return ["bunny1", "bunny3", "bunny4", "bunny5"];
  }

  /* =========================
   * UI
   * ========================= */
  function closeShopModal() {
    try { shopBackdrop?.remove(); } catch {}
    shopBackdrop = null;
    shopModal = null;
  }

  function showAdoptEffect(kind) {
    const defs = getDefs();
    const def = defs[kind] || defs.bunny1;

    const overlay = document.createElement("div");
    overlay.className = "adoptFxOverlay";

    const fx = document.createElement("div");
    fx.className = "adoptFx";

    const thumb = document.createElement("img");
    thumb.className = "adoptThumb";
    thumb.src = def.img;
    fx.appendChild(thumb);

    overlay.appendChild(fx);
    document.body.appendChild(overlay);

    setTimeout(() => {
      try { overlay.remove(); } catch {}
    }, 800);

    return 500;
  }

  function buyBunny(kind) {
    const defs = getDefs();
    kind = defs[kind] ? kind : "bunny1";
    const def = defs[kind];
    if (!def) return false;

    const priceNow = calcDynamicPrice(kind);
    if (getCoins() < priceNow) return false;
    if (!spendCoins(priceNow)) return false;

    const waitMs = showAdoptEffect(kind);

    setTimeout(() => {
      if (typeof WB.createBunny === "function") {
        WB.createBunny({
          isBaby: true,
          targetAdultSrc: def.adultSrc || def.img,
        });
      } else if (typeof WB.spawnBunny === "function") {
        WB.spawnBunny(kind, Date.now(), { targetAdultSrc: def.adultSrc || def.img });
      }
      refreshShopUI();
    }, waitMs);

    return true;
  }

  function buildShopModal() {
    if (!shopBackdrop) {
      shopBackdrop = document.createElement("div");
      shopBackdrop.className = "modalBackdrop";
      document.body.appendChild(shopBackdrop);
    }
    if (!shopModal) {
      shopModal = document.createElement("div");
      shopModal.className = "modal";
      shopBackdrop.appendChild(shopModal);
    }

    const defs = getDefs();
    const kinds = getShopKinds();

    const cards = kinds.map((kind) => {
      const def = defs[kind];
      if (!def) return "";
      const priceNow = calcDynamicPrice(kind);
      const canBuy = getCoins() >= priceNow;
      return `
        <div class="shopCard ${canBuy ? "" : "disabled"}">
          <img src="${def.img}" class="shopThumb">
          <div class="shopInfo">
            <div class="shopName">${def.label}</div>
            <div class="shopDesc">${def.desc || ""}</div>
            <div class="shopPrice ${canBuy ? "" : "bad"}">${priceNow} 🪙</div>
            <button data-buy="${kind}" ${canBuy ? "" : "disabled"}>お迎え</button>
          </div>
        </div>
      `;
    }).join("");

    shopModal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">🐰 お迎え</div>
        <button class="modalClose" id="closeShopBtn">×</button>
      </div>
      <div class="shopGrid">${cards}</div>
      <div style="margin-top:10px;font-size:12px;opacity:.9;">
        所持：<b>${getCoins()}🪙</b> / 現在：<b>${getBunnyCount()}匹</b>
      </div>
    `;

    shopModal.querySelector("#closeShopBtn").onclick = closeShopModal;
    shopBackdrop.onclick = (e) => { if (e.target === shopBackdrop) closeShopModal(); };

    shopModal.querySelectorAll("[data-buy]").forEach(btn => {
      btn.onclick = () => {
        buyBunny(btn.dataset.buy);
        refreshShopUI();
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

  /* =========================
   * 起動 / バインド
   * ========================= */

  // 外部から開く（推奨）
  WB.on?.("omukae:open", () => {
    WB.unlockAudioOnce?.();
    openShopModal();
  });

  // #shopBtn に直接バインド（captureは使わない）
  function bindShopBtn() {
    const btn = WB.shopBtn || document.getElementById("shopBtn");
    if (!btn) return false;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      WB.unlockAudioOnce?.();
      openShopModal();
    });
    return true;
  }

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (bindShopBtn() || tries > 80) clearInterval(t);
  }, 100);

  /* =========================
   * 公開API
   * ========================= */
  WB.omukae = {
    openShopModal,
    closeShopModal,
    refreshShopUI,
    calcDynamicPrice,
    buyBunny,
  };
})();
