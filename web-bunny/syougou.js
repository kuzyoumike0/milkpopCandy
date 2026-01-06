// syougou.js
// 称号システム（黄金うんち回数・称号解放・装備・永続化）をここに集約

(() => {
  const GOLDEN_UNCHI_TITLES = [
    { at: 10, title: "黄金を踏みし者" },
    { at: 20, title: "黄金に選ばれし者" },
    { at: 50, title: "黄金の王" },
  ];

  const LS = {
    unchi: "wb_unchi_v1",
    title: "wb_title_v1",
    titleList: "wb_title_list_v1",
  };

  const state = {
    count: 0,
    owned: [],
    current: "",
  };

  let WB = null;

  function loadInt(key, def = 0) {
    const n = parseInt(localStorage.getItem(key) || String(def), 10);
    return Number.isFinite(n) ? n : def;
  }
  function saveInt(key, v) {
    localStorage.setItem(key, String(v));
  }
  function loadJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v ?? def;
    } catch {
      return def;
    }
  }
  function saveJson(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }

  function saveAll() {
    saveInt(LS.unchi, state.count);
    localStorage.setItem(LS.title, String(state.current || ""));
    saveJson(LS.titleList, state.owned);
  }

  function initFromStorage() {
    state.count = loadInt(LS.unchi, 0);
    const owned = loadJson(LS.titleList, []);
    state.owned = Array.isArray(owned) ? owned : [];
    state.current = String(localStorage.getItem(LS.title) || "");
  }

  function showTitleMilestone(title) {
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = `🏅 称号解放：${title}`;
    document.body.appendChild(el);
    setTimeout(() => {
      try { el.remove(); } catch {}
    }, 3200);
  }

  function equipTitle(name) {
    state.current = String(name || "");
    saveAll();
    WB?.updateHud?.();
  }

  function unlockTitle(name) {
    if (!state.owned.includes(name)) {
      state.owned.push(name);
    }
    equipTitle(name);
    showTitleMilestone(name);
  }

  function maybeUnlockByCount() {
    for (const t of GOLDEN_UNCHI_TITLES) {
      if (state.count === t.at) {
        unlockTitle(t.title);
        break;
      }
    }
  }

  function onGoldenUnchiCollected() {
    state.count += 1;
    saveAll();
    maybeUnlockByCount();
    WB?.updateHud?.();
  }

  function getCount() { return Number(state.count || 0); }
  function getOwnedTitles() { return Array.isArray(state.owned) ? state.owned.slice() : []; }
  function getCurrentTitle() { return String(state.current || ""); }
  function getTitlesMaster() { return GOLDEN_UNCHI_TITLES.slice(); }

  function attach(wb) {
    WB = wb || null;
    WB?.updateHud?.();
  }

  initFromStorage();

  window.SYOUGOU = {
    attach,
    onGoldenUnchiCollected,
    equipTitle,

    getCount,
    getOwnedTitles,
    getCurrentTitle,
    getTitlesMaster,
  };
})();
