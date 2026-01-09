// omukae.js（お迎え専用：#omukaeBtn専用）
// ✅ #omukaeBtn を押したときだけ開く
// ✅ #shopBtn には一切触らない（shop.js専用）

(() => {
  if (!window.WB) return;

  const WB = window.WB;

  const PRICE_INFLATION_PER_BUNNY = 0.08;
  const PRICE_ROUND_UNIT = 10;

  let shopBackdrop = null;
  let shopModal = null;

  /* =========================
   * サムネCSS
   * ========================= */
  function injectShopThumbCssOnce() {
    if (document.getElementById("wbShopThumbCss")) return;
    const st = document.createElement("style");
    st.id = "wbShopThumbCss";
    st.textContent = `
.shopGrid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap:10px;
}
.shopCard{
  display:flex;
  gap:10px;
  align-items:flex-start;
  padding:10px;
  border-radius:12px;
  background: rgba(255,255,255,.65);
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 6px 18px rgba(0,0,0,.06);
}
.shopCard.disabled{ opacity:.55; filter:saturate(.7); }
.shopThumb{
  width:64px;
  height:64px;
  object-fit:contain;
  flex:0 0 64px;
  border-radius:12px;
  background: rgba(255,255,255,.7);
  border:1px solid rgba(0,0,0,.08);
  padding:6px;
}
.shopInfo{
  flex:1;
  min-width:0;
  display:flex;
  flex-direction:column;
  gap:4px;
}
.shopName{
  font-weight:700;
  font-size:14px;
  line-height:1.2;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.shopDesc{
  font-size:12px;
  opacity:.85;
  line-height:1.35;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.shopPrice{ font-weight:700; margin-top:4px; }
.shopPrice.bad{ color:#b00020; }
.shopCard button{
  margin-top:6px;
  align-self:flex-start;
  padding:6px 10px;
  border-radius:10px;
  border:0;
  cursor:pointer;
}
.shopCard button:disabled{
  cursor:not-allowed;
  opacity:.6;
}
`;
    document.head.appendChild(st);
  }

  /* =========================
   * helpers
   * ========================= */
  function getBunnyCount() {
    if (typeof WB.getBunnies === "function") return WB.getBunnies().length;
    if (Array.isArray(WB.bunnies)) return WB.bunnies.length;
    return 0;
  }

  function getCoins() {
    if (typeof WB.getCoin === "function") return WB.getCoin();
    if (typeof WB.coins === "number") return WB.coins;
    return 0;
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

    setTimeout(() => { try { overlay.remove(); } catch {} }, 850);
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
      if (typeof WB.createBunny === "function") {
        WB.createBunny({ isBaby: true, targetAdultSrc: def.adultSrc || def.img });
      } else if (typeof WB.spawnBunny === "function") {
        try { WB.spawnBunny(kind, Date.now(), { targetAdultSrc: def.adultSrc || def.img }); }
        catch { WB.spawnBunny(kind, Date.now()); }
      }
      refreshShopUI();
    }, waitMs);

    return true;
  }

  function buildShopModal() {
    injectShopThumbCssOnce();

    if (!shopBackdrop) {
      shopBackdrop = document.createElement("div");
      shopBackdrop.id = "omukaeBackdrop";
      shopBackdrop.className = "modalBackdrop";
      document.body.appendChild(shopBackdrop);
    }
    if (!shopModal) {
      shopModal = document.createElement("div");
      shopModal.id = "omukaeModal";
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
          <div class="shopInfo">
            <div class="shopName">${def.label}</div>
            <div class="shopDesc">${def.desc || ""}</div>
            <div class="shopPrice ${canBuy ? "" : "bad"}">${priceNow} 🪙</div>
            <button data-buy="${kind}" ${canBuy ? "" : "disabled"}>お迎え</button>
          </div>
        </div>
      `;
    }).join("");

    const nowCount = getBunnyCount();
    const unlocked = WB.zisseki?.isUnlocked?.("unlock_bunny4");
    const need = WB.zisseki?.UNLOCK_BUNNY4_NEED ?? 10;

    const progText = unlocked ? `✅ 解放済み` : `🔒 解放条件：同時うさぎ数 ${nowCount}/${need}`;

    shopModal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">🐰 お迎え</div>
        <button class="modalClose" id="closeOmukaeBtn" aria-label="close">×</button>
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

    shopModal.querySelector("#closeOmukaeBtn").onclick = closeShopModal;
    shopBackdrop.onclick = (e) => { if (e.target === shopBackdrop) closeShopModal(); };

    shopModal.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.getAttribute("data-buy");
        buyBunny(kind);
        refreshShopUI();
      };
    });
  }

  function openShopModal() { buildShopModal(); }
  function refreshShopUI() { if (shopBackdrop && shopModal) buildShopModal(); }

  /* =========================
   * 起動：omukae:open で開く
   * ========================= */
  if (typeof WB.on === "function") {
    WB.on("omukae:open", () => {
      WB.unlockAudioOnce?.();
      openShopModal();
    });
  }

  // ✅ #omukaeBtn にだけ紐付ける
  function bindOmukaeBtn() {
    const btn = document.getElementById("omukaeBtn");
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
    if (bindOmukaeBtn() || tries > 120) clearInterval(t);
  }, 100);

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
