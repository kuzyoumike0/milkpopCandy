  /* =========================
   * WB Public API（上書き禁止：マージ）
   * ========================= */
  (function exportWB() {
    const prev = (window.WB && typeof window.WB === "object") ? window.WB : {};

    // 既存の WB が持っている bgm 等を壊さないため、上書きではなくマージする
    const api = {
      on, off, emit,
      ASSETS, BUNNY_DEFS, LS, DEPART_COST,
      field, shopBtn, departBtn, rankBtn, resetBtn, slotBtn,

      get coins() { return coins; },
      set coins(v) {
        coins = Math.max(0, Math.floor(Number(v) || 0));
        saveCoins();
        updateHud();
      },

      getCoin: () => coins,
      spendCoin: (n) => {
        n = Math.floor(Number(n) || 0);
        if (n <= 0) return true;
        if (coins < n) return false;
        coins -= n;
        saveCoins();
        updateHud();
        return true;
      },

      bunnies,
      getBunnies: () => bunnies,
      spawnBunny,
      removeBunnyInstance,

      saveCoins,
      saveBunnyMeta,

      unlockAudioOnce,
      playSE,
      getSEVolume,

      seTabidati,
      seUnchi,

      updateHud,

      getBunnyCharge: (bornAt) => {
        const t = Number(bornAt);
        const b = bunnies.find(x => x && x.bornAt === t);
        return b ? { charge: b.charge, ready: b.chargeReady, unchi: b.unchiCharge } : null;
      },

      spawnUnchiNearBunny: (bornAt) => {
        const t = Number(bornAt);
        const b = bunnies.find(x => x && x.bornAt === t);
        if (b) spawnUnchiNearBunny(b);
      },
    };

    // ★ prev を先に入れて、api を後で上書き（bgm 等は prev に残る）
    window.WB = Object.assign({}, prev, api);

    // prev 側にあったネスト（例: WB.bgm）も確実に残す
    // （Object.assignで参照は残るが、念のため）
    if (prev.bgm && !window.WB.bgm) window.WB.bgm = prev.bgm;
    if (prev.shop && !window.WB.shop) window.WB.shop = prev.shop;
    if (prev.zukan && !window.WB.zukan) window.WB.zukan = prev.zukan;
  })();
