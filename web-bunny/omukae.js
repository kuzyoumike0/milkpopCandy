(() => {
  if (!window.WB) return;

  const WB = window.WB;

  // 価格インフレ
  const PRICE_INFLATION_PER_BUNNY = 0.08; // 1匹ごとに +8%
  const PRICE_ROUND_UNIT = 10;            // 10単位丸め

  let shopBackdrop = null;
  let shopModal = null;

  /* =========================
   * WB互換ヘルパ
   * ========================= */
  function getBunnyCount() {
    // 新API
    if (typeof WB.getBunnies === "function") return WB.getBunnies().length;
    // 旧API
    if (Array.isArray(WB.bunnies)) return WB.bunnies.length;
    return 0;
  }

  function getCoins() {
    if (typeof WB.getCoin === "function") return WB.getCoin();
    if (typeof WB.coins === "number") return WB.coins;
    return 0;
  }

  function spendCoins(amount) {
    // 新APIがあるならそれを使う（内部でHUD更新・保存される想定）
    if (typeof WB.spendCoin === "function") return WB.spendCoin(amount);

    // 旧API互換
    if (typeof WB.coins === "number" && WB.coins >= amount) {
      WB.coins -= amount;
      if (typeof WB.saveCoins === "function") WB.saveCoins();
      if (typeof WB.updateHud === "function") WB.updateHud();
      return true;
    }
    return false;
  }

  // omukae商品定義（WB側にあればそれを優先）
  function getDefs() {
    // 優先：app.js が提供するカタログ（src/cost）
    // 期待フォーマット: [{key,name,src,cost}, ...]
    if (Array.isArray(WB.omukaeCatalog) && WB.omukaeCatalog.length) {
      const map = {};
      for (const it of WB.omukaeCatalog) {
        if (!it?.key) continue;
        map[it.key] = {
          label: it.name || it.key,
          desc: it.desc || "お迎えした子は baby で来て、3分で成長します。",
          img: it.src,              // 表示サムネ
          adultSrc: it.src,         // 成長先（指定進化）
          price: Number(it.cost || it.price || 0),
        };
      }
      return map;
    }

    // 従来：WB.BUNNY_DEFS があるならそれを使う
    if (WB.BUNNY_DEFS) return WB.BUNNY_DEFS;

    // どちらも無い場合の最小フォールバック
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
    const defs = getDefs();
    kind = defs[kind] ? kind : "bunny1";
    const def = defs[kind];
    if (!def) return false;

    const priceNow = calcDynamicPrice(kind);
    if (getCoins() < priceNow) return false;

    if (!spendCoins(priceNow)) return false;

    const waitMs = showAdoptEffect(kind);

    setTimeout(() => {
      // ✅ 重要：購入は babyで生成して、成長先を固定する
      // 新app.js: WB.createBunny({isBaby:true,targetAdultSrc:"./assets/bunny3.png"})
      if (typeof WB.createBunny === "function") {
        WB.createBunny({
          isBaby: true,
          targetAdultSrc: def.adultSrc || def.img, // 成長先＝購入した種類
        });
      } else if (typeof WB.spawnBunny === "function") {
        // 旧ロジック互換：spawnBunny(kind, bornAt) が「baby→kindへ成長」前提ならこれ
        // ただし「確実に指定進化」させたいので、spawnBunnyが target を受けるなら優先
        try {
          WB.spawnBunny(kind, Date.now(), { targetAdultSrc: def.adultSrc || def.img });
        } catch {
          WB.spawnBunny(kind, Date.now());
        }
      }

      // 実績チェックは zisseki.js 側が監視している想定
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

    const defs = getDefs();
    const kinds = getShopKinds();

    const cards = kinds.map((kind) => {
      const def = defs[kind];
      if (!def) return "";
      const priceNow = calcDynamicPrice(kind);
      const canBuy = getCoins() >= priceNow;
      return `
        <div class="shopCard ${canBuy ? "" : "disabled"}">
          <img src="${def.img}" class="shopThumb" alt="${def.label}">
          <div class="shopName">${def.label}</div>
          <div class="shopDesc">${def.desc || ""}</div>
          <div class="shopPrice ${canBuy ? "" : "bad"}">${priceNow} 🪙</div>
          <button data-buy="${kind}" ${canBuy ? "" : "disabled"}>お迎え</button>
        </div>
      `;
    }).join("");

    const nowCount = getBunnyCount();
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
        所持：<b>${getCoins()}🪙</b> / 現在：<b>${nowCount}匹</b>
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

  /* =========================
   * 起動：omukae:open を優先して受ける
   * ========================= */
  // app.jsがWB.emit("omukae:open") する方式に対応
  if (typeof WB.on === "function") {
    WB.on("omukae:open", () => {
      WB.unlockAudioOnce?.();
      openShopModal();
    });
  }

  // 従来互換：WB.shopBtn を直接監視
  if (WB.shopBtn) {
    WB.shopBtn.addEventListener("click", () => {
      WB.unlockAudioOnce?.();
      openShopModal();
    });
  }

  // 実績が解放されたらショップUIを更新
  if (typeof WB.on === "function") {
    WB.on("achievementUnlocked", () => refreshShopUI());
    WB.on("bunnyCountChanged", () => refreshShopUI());
  }

  WB.omukae = {
    openShopModal,
    closeShopModal,
    refreshShopUI,
    calcDynamicPrice,
    buyBunny,
  };
})();
