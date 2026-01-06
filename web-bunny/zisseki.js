(() => {
  if (!window.WB) return;

  const WB = window.WB;

  // 実績キー（app.js とは別で管理）
  const LS_ACH = "wb_ach_v3";

  const UNLOCK_BUNNY4_NEED = 10;

  function loadAch() {
    try {
      const a = JSON.parse(localStorage.getItem(LS_ACH) || "{}");
      return a && typeof a === "object" ? a : {};
    } catch {
      return {};
    }
  }
  function saveAch() {
    localStorage.setItem(LS_ACH, JSON.stringify(ach));
  }

  const ach = loadAch();

  function isUnlocked(id) {
    return !!ach[id];
  }

  function unlock(id) {
    if (ach[id]) return false;
    ach[id] = true;
    saveAch();
    return true;
  }

  function checkUnlocks() {
    // 同時うさぎ数で bunny4/bunny5 解放
    if (!ach.unlock_bunny4 && WB.bunnies.length >= UNLOCK_BUNNY4_NEED) {
      const newly = unlock("unlock_bunny4");
      if (newly) {
        try {
          alert("実績解除！ bunny4 / bunny5 がショップに出現しました 🐰✨");
        } catch {}
        WB.emit("achievementUnlocked", { id: "unlock_bunny4" });
      }
    }
  }

  // うさぎ数が変わるたびにチェック
  WB.on("bunnyCountChanged", checkUnlocks);

  // リセット時は実績も消したい場合
  WB.on("resetRequested", () => {
    try { localStorage.removeItem(LS_ACH); } catch {}
  });

  // 外部公開
  WB.zisseki = {
    ach,
    isUnlocked,
    unlock,
    checkUnlocks,
    LS_ACH,
    UNLOCK_BUNNY4_NEED,
  };

  // 初回チェック
  checkUnlocks();
})();
