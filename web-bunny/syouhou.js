// syouhou.js
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

  let WB = null; // app.js が window.WB を公開したら attach される

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
    state.owned = Array.isArray(loadJson(LS.titleList, [])) ? loadJson(LS.titleList, []) : [];
    state.current = String(localStorage.getItem(LS.title) || "");
  }

  function showTitleMilestone(title) {
    // app.js から同じ見た目が欲しければ、ここでDOM出す
    // ただし app.js 側のCSSに依存するので、ここで軽量実装
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
    // 新称号は自動装備
    equipTitle(name);
    showTitleMilestone(name);
  }

  function maybeUnlockByCount() {
    // 到達“瞬間”だけ解放したいので、countが一致した時だけ
    for (const t of GOLDEN_UNCHI_TITLES) {
      if (state.count === t.at) {
        unlockTitle(t.title);
        break;
      }
    }
  }

  // app.js の黄金うんち取得時に呼ぶ
  function onGoldenUnchiCollected() {
    state.count += 1;
    saveAll();
    maybeUnlockByCount();
    WB?.updateHud?.();
  }

  // app.js から参照する getter
  function getCount() { return Number(state.count || 0); }
  function getOwnedTitles() { return Array.isArray(state.owned) ? state.owned.slice() : []; }
  function getCurrentTitle() { return String(state.current || ""); }
  function getTitlesMaster() { return GOLDEN_UNCHI_TITLES.slice(); }

  // app.js が window.WB を作った後に接続
  function attach(wb) {
    WB = wb || null;
    WB?.updateHud?.();
  }

  // 初期化
  initFromStorage();

  window.SYOUHOU = {
    attach,
    onGoldenUnchiCollected,
    equipTitle,

    getCount,
    getOwnedTitles,
    getCurrentTitle,
    getTitlesMaster,
  };
})();
