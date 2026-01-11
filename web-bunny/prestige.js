// prestige.js（転生：コイン＆うさぎリセット →「牧場の星」獲得 → 恒久解放） v1.5.3
// ✅ FIX: 転生うさぎ（tennshi）が “赤ちゃん生成” で app.js の syncSprite に上書きされる問題を根治
//    - 生成時に bornAt を十分過去にして「大人」で生成（画像維持）
// ✅ FIX: 転生直後の座標バグ（空中/画面外）対策：hardClamp/applyPos + rescue emit
// ✅ FIX: spawnBunny 戻り値（Bunny）を最優先で確実化
// ✅ FIX: skin対象 img の拾い方を強化（b.el / b.img / wrap内img）
// ✅ coinChanged が number / {coins} どちらでも拾う
// ✅ app.js が emit("coinChanged") すればスロット/回収/放置すべてゲージ反映（無い場合はwatchFallback）

(() => {
  "use strict";
  if (window.__WB_PRESTIGE_V153__) return;
  window.__WB_PRESTIGE_V153__ = true;

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  const CFG = {
    STAR_BASE_COINS: 50000,
    MIN_COINS_TO_PRESTIGE: 50000,
    HOLD_MS: 1200,

    COIN_WATCH_MS: 250,

    LS_EARNED: "wb_prestige_earned_v1",

    DEEP_LOCALSTORAGE_WIPE: false,
    WIPE_KEYS: [
      "wb_coins_v6",
      "wb_bunnies_v6",
      "wb_bunnies_v5",
      "wb_state_v1",
      "wb_state_v2",
      "milkpop_bunnies_v1",
      "milkpop_coins_v1",
    ],

    LABEL: {
      title: "🌟 転生（牧場の星）",
      prestigeBtn: "🌟 転生する",
      close: "閉じる",
      unlock: "解放",
      unlocked: "解放済",
      earned: "転生ゲージ（累計獲得）",
    },

    // ※名前は TENNCHI のまま互換維持（内部はtennshi運用）
    TENNCHI: {
      LS_ACTIVE: "wb_tennchi_active_v1",

      // wrapに付く印（※tennshi表記に統一）
      WRAP_MARK: "data-tennshi",

      // ✅ 画像
      IMG: "./assets/tennshi.png",

      // コイン落とし
      dropEveryMs: 2300,
      dropCount: 3,
      tierMin: 2,
      tierMax: 3,

      className: "wbTennchiBunny",
    },
  };

  const LS_PRESTIGE = "wb_prestige_v1";

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          resolve(null);
        }
      }, TICK_MS);
    });
  }

  function loadJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return (v ?? def);
    } catch {
      return def;
    }
  }
  function saveJson(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyle() {
    if (document.getElementById("wbPrestigeStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbPrestigeStyleV1";
    s.textContent = `
#wbPrestigePanelV1{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#wbPrestigePanelV1 .bg{position:absolute; inset:0; background:rgba(0,0,0,.38);}
#wbPrestigePanelV1 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(860px, 94vw); max-height:min(84vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#wbPrestigePanelV1 .head{display:flex; align-items:center; justify-content:space-between; padding:14px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);}
#wbPrestigePanelV1 .title{font-weight:1000; letter-spacing:.02em; display:flex; gap:10px; align-items:center;}
#wbPrestigePanelV1 .close{border:none; background:rgba(0,0,0,.06); border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;}
#wbPrestigePanelV1 .body{padding:12px 14px 16px; overflow:auto;}
#wbPrestigePanelV1 .row{display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:10px;}
#wbPrestigePanelV1 .pill{display:inline-flex; align-items:center; gap:8px; background:rgba(0,0,0,.05); border-radius:999px; padding:8px 10px; font-weight:1000;}
#wbPrestigePanelV1 .btn{border:none; border-radius:12px; padding:10px 12px; font-weight:1000; cursor:pointer; background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);}
#wbPrestigePanelV1 .btn.primary{background:#ffd6e7;}
#wbPrestigePanelV1 .btn.danger{background:#ffe0e0;}
#wbPrestigePanelV1 .btn[disabled]{opacity:.55; cursor:not-allowed; box-shadow:none;}
#wbPrestigePanelV1 .grid{display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px;}
@media (max-width:760px){ #wbPrestigePanelV1 .grid{grid-template-columns:1fr;} }
#wbPrestigePanelV1 .perk{
  background:rgba(255,255,255,.94);
  border-radius:14px;
  padding:12px;
  box-shadow:0 10px 22px rgba(0,0,0,.08);
}
#wbPrestigePanelV1 .perk .name{font-weight:1000;}
#wbPrestigePanelV1 .perk .desc{margin-top:4px; font-size:12px; opacity:.8; font-weight:900; line-height:1.35; white-space:pre-line;}
#wbPrestigePanelV1 .perk .foot{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:10px; flex-wrap:wrap;}
#wbPrestigePanelV1 .badge{display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:6px 10px; font-weight:1000; font-size:12px; background:rgba(120,210,255,.22);}
#wbPrestigePanelV1 .badge.lock{background:rgba(255,120,120,.18);}
#wbPrestigePanelV1 .bar{height:10px; border-radius:999px; background:rgba(0,0,0,.08); overflow:hidden; margin-top:8px;}
#wbPrestigePanelV1 .bar > i{display:block; height:100%; width:0%; background:rgba(120,210,255,.55);}
#wbPrestigePanelV1 .hint{font-size:12px; opacity:.78; font-weight:900; line-height:1.35;}
#wbPrestigePanelV1 .hold{position:relative; overflow:hidden;}
#wbPrestigePanelV1 .hold > .fill{position:absolute; inset:0; width:0%; background:rgba(0,0,0,.06);}
`;
    document.head.appendChild(s);
  }

  function calcStarsFromCoins(coins) {
    const c = Math.max(0, Math.floor(Number(coins) || 0));
    if (c < CFG.MIN_COINS_TO_PRESTIGE) return 0;
    const stars = Math.floor(Math.sqrt(c / Math.max(1, CFG.STAR_BASE_COINS)));
    return Math.max(0, stars);
  }

  function nextCoinsForStar(targetStars) {
    const s = Math.max(0, Math.floor(targetStars));
    return Math.max(0, Math.floor(CFG.STAR_BASE_COINS * (s * s)));
  }

  /* =========================
   * 転生ゲージ（累計獲得コイン）
   * ========================= */
  function loadEarned() {
    try {
      const v = Number(localStorage.getItem(CFG.LS_EARNED) || "0");
      return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    } catch { return 0; }
  }
  function saveEarned(v) {
    try { localStorage.setItem(CFG.LS_EARNED, String(Math.max(0, Math.floor(v)))); } catch {}
  }

  let earnedCoins = loadEarned();

  function addEarned(delta, source = "") {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;
    earnedCoins = Math.max(0, earnedCoins + d);
    saveEarned(earnedCoins);

    try {
      const p = panelEl || document.getElementById(PANEL_ID);
      if (p && p.style.display === "block") render();
    } catch {}

    try { window.WB?.emit?.("prestige:earned", { delta: d, total: earnedCoins, source: String(source || "") }); } catch {}
  }

  function resetEarned() {
    earnedCoins = 0;
    saveEarned(0);
  }

  /* =========================
   * ✅ FIX：現在コインの同期
   * ========================= */
  let __latestCoins = null;        // null=未確定
  let __lastCoinForEarn = null;    // 初回確定

  function readCoinsDirect(WB) {
    try { if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try {
      if (WB && ("coins" in WB)) {
        const v = Number(WB.coins);
        if (Number.isFinite(v)) return v;
      }
    } catch {}
    const el = document.getElementById("coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }

  function getCoins(WB) {
    if (__latestCoins !== null && Number.isFinite(__latestCoins)) return __latestCoins;
    return readCoinsDirect(WB);
  }

  function setCoinsZero(WB) {
    __latestCoins = 0;
    __lastCoinForEarn = 0;

    try { if (WB && typeof WB.setCoin === "function") { WB.setCoin(0); return true; } } catch {}
    try { if (WB && ("coins" in WB)) { WB.coins = 0; return true; } } catch {}
    try { localStorage.setItem("wb_coins_v6", "0"); } catch {}
    const el = document.getElementById("coinValue");
    if (el) el.textContent = "0";
    return true;
  }

  function removeAllBunnies(WB) {
    try { if (WB && typeof WB.removeAllBunnies === "function") { WB.removeAllBunnies(); return true; } } catch {}
    try {
      if (WB && typeof WB.removeBunnyInstance === "function" && Array.isArray(WB.bunnies)) {
        const copy = WB.bunnies.slice();
        copy.forEach(b => { try { WB.removeBunnyInstance(b); } catch {} });
      }
    } catch {}
    try { if (WB && Array.isArray(WB.bunnies)) WB.bunnies.length = 0; } catch {}

    // DOM掃除
    try { document.querySelectorAll(".bunnyWrap, .bunny-wrap").forEach(el => { try { el.remove(); } catch {} }); } catch {}
    try { document.querySelectorAll(".wbChargeHart").forEach(el => { try { el.remove(); } catch {} }); } catch {}

    try { WB?.emit?.("bunnyCountChanged", { count: 0 }); } catch {}
    return true;
  }

  function deepWipeLocalStorage() {
    if (!CFG.DEEP_LOCALSTORAGE_WIPE) return;
    for (const k of CFG.WIPE_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }
  }

  const PERK_MASTER = [
    { id: "coin_sparkle", cost: 1, name: "コイン回収キラッ", desc: "コイン回収時に小さな✨演出を追加（演出のみ）" },
    { id: "mirrorball_plus", cost: 2, name: "ミラーボール増し", desc: "ミラーボール範囲内の✨演出を少し増やす（演出のみ）" },
    { id: "hanabi_glow", cost: 2, name: "花火発光ブースト", desc: "花火GIFの発光感を少し強化（演出のみ）" },
    { id: "bunny_aura", cost: 3, name: "うさぎの輪郭光", desc: "うさぎにうっすら輪郭の光（演出のみ）" },
    { id: "bg_soft", cost: 3, name: "背景ふわっと", desc: "背景に柔らかいビネットを追加（演出のみ）" },
    { id: "coin_bonus_1", cost: 6, name: "収入+1%", desc: "放置のコイン量を+1%（控えめ）", gameplay: true },
    { id: "coin_bonus_3", cost: 12, name: "収入+3%", desc: "放置のコイン量を+3%（控えめ）", gameplay: true },
  ];

  function defaultPrestigeState() {
    return { ver: 1, stars: 0, spent: 0, perks: {}, history: [] };
  }
  function loadPrestige() {
    const st = loadJson(LS_PRESTIGE, defaultPrestigeState());
    if (!st || typeof st !== "object") return defaultPrestigeState();
    st.ver = 1;
    st.stars = Number(st.stars || 0) || 0;
    st.spent = Number(st.spent || 0) || 0;
    st.perks = (st.perks && typeof st.perks === "object") ? st.perks : {};
    st.history = Array.isArray(st.history) ? st.history : [];
    return st;
  }
  function savePrestige(st) { saveJson(LS_PRESTIGE, st); }
  function format(n) { return (Number(n) || 0).toLocaleString(); }

  /* =========================
   * coinChanged 無い環境の保険
   * ========================= */
  let __coinWatchTimer = 0;
  function startCoinWatchFallback(WB) {
    stopCoinWatchFallback();
    let last = readCoinsDirect(WB);
    __coinWatchTimer = window.setInterval(() => {
      const wb = window.WB || WB || null;
      const cur = readCoinsDirect(wb);
      const diff = cur - last;
      if (diff > 0) addEarned(diff, "watchFallback");
      last = cur;
      __latestCoins = cur;
      if (__lastCoinForEarn === null) __lastCoinForEarn = cur;
    }, CFG.COIN_WATCH_MS);
  }
  function stopCoinWatchFallback() {
    if (__coinWatchTimer) clearInterval(__coinWatchTimer);
    __coinWatchTimer = 0;
  }

  /* =========================
   * tennshi（地上うさぎ）：確実生成
   * ========================= */
  function isTennshiActive() {
    return localStorage.getItem(CFG.TENNCHI.LS_ACTIVE) === "true";
  }
  function setTennshiActive(on) {
    try { localStorage.setItem(CFG.TENNCHI.LS_ACTIVE, on ? "true" : "false"); } catch {}
  }

  function getBunnyList(WB) {
    try {
      const a = WB?.getBunnies?.();
      if (Array.isArray(a)) return a;
    } catch {}
    try {
      if (Array.isArray(WB?.bunnies)) return WB.bunnies;
    } catch {}
    return [];
  }

  function findTennchiBunny(WB) {
    const list = getBunnyList(WB);
    for (const b of list) {
      const w = b?.wrap;
      if (w?.getAttribute?.(CFG.TENNCHI.WRAP_MARK) === "1") return b;
      if (b?.isTennchi === true || b?.isTennshi === true) return b;
    }
    return null;
  }

  function markTennchi(b) {
    try { b.isTennchi = true; b.isTennshi = true; } catch {}
    try {
      const w = b?.wrap;
      if (w?.setAttribute) {
        w.setAttribute(CFG.TENNCHI.WRAP_MARK, "1");
        w.classList?.add?.(CFG.TENNCHI.className);
      }
    } catch {}
  }

  function pickImgElFromBunny(b) {
    // app.js: b.el がIMG
    const cand = b?.el || b?.img || null;
    if (cand && cand.tagName === "IMG") return cand;
    try {
      const w = b?.wrap;
      const im = w?.querySelector?.("img");
      if (im && im.tagName === "IMG") return im;
    } catch {}
    return null;
  }

  function rescueToGround(WB, b) {
    // 空中・画面外抑止
    try { if (typeof b?.hardClamp === "function") b.hardClamp(true); } catch {}
    try { if (typeof b?.applyPos === "function") b.applyPos(); } catch {}

    // app.js の救出処理があれば呼ぶ
    try { WB?.emit?.("resize", {}); } catch {}
    try { WB?.emit?.("bunnyCountChanged", { count: getBunnyList(WB).length }); } catch {}
  }

  function skinToTennchi(WB, b) {
    if (!b) return false;

    const img = pickImgElFromBunny(b);

    if (img) {
      try { img.src = CFG.TENNCHI.IMG; } catch {}
      try { img.alt = "tennshi"; } catch {}
    } else {
      try {
        const w = b.wrap;
        if (w) {
          const im = document.createElement("img");
          im.src = CFG.TENNCHI.IMG;
          im.alt = "tennshi";
          im.draggable = false;
          w.appendChild(im);
        }
      } catch {}
    }

    markTennchi(b);
    rescueToGround(WB, b);
    return true;
  }

  // ✅ “大人” bornAt（赤ちゃん扱い→後でsyncSpriteで戻るのを防ぐ）
  function adultBornAt() {
    return Date.now() - (10 * 60 * 1000); // 10分前なら確実に大人
  }

  // ✅ spawnBunnyがあるなら最優先で使い、戻り値Bunnyを掴む
  function spawnOneNormalBunnyPreferBunny4(WB) {
    const bornAt = adultBornAt();

    const calls = [
      // app.js の spawnBunny(kind, bornAt) を最優先で試す
      () => (WB?.spawnBunny?.length >= 2 ? WB.spawnBunny("bunny4", bornAt) : WB?.spawnBunny?.("bunny4")),
      () => WB?.createBunny?.("bunny4"),
      () => WB?.addBunny?.("bunny4"),
      () => WB?.omukae?.spawn?.("bunny4"),
      () => WB?.omukae?.add?.("bunny4"),

      // fallback
      () => (WB?.spawnBunny?.length >= 2 ? WB.spawnBunny("bunny1", bornAt) : WB?.spawnBunny?.("bunny1")),
      () => WB?.createBunny?.(),
      () => WB?.addBunny?.(),
      () => WB?.omukae?.spawn?.(),
      () => WB?.omukae?.add?.(),
      () => WB?.adopt?.(),
    ];

    const beforeLen = getBunnyList(WB).length;

    for (const f of calls) {
      try {
        const r = f();

        // asyncっぽい
        if (r && typeof r.then === "function") return { ok: true, bunny: null };

        // Bunnyインスタンスっぽい（wrapがある）
        if (r && typeof r === "object" && (r.wrap || r.el || r.img)) {
          return { ok: true, bunny: r };
        }

        // 配列長で増加確認
        const afterLen = getBunnyList(WB).length;
        if (afterLen > beforeLen) return { ok: true, bunny: null };
      } catch {}
    }

    return { ok: false, bunny: null };
  }

  function pickNewestBunny(WB, prevIds) {
    const list = getBunnyList(WB);
    let cand = null;
    for (const b of list) {
      if (!b) continue;
      const id = b.bornAt ?? b.id ?? b.uuid ?? null;
      if (id != null && prevIds && prevIds.has(String(id))) continue;
      if (b?.wrap?.getAttribute?.(CFG.TENNCHI.WRAP_MARK) === "1") continue;
      cand = b;
    }
    return cand || list[list.length - 1] || null;
  }

  let __tennchiDropTimer = 0;

  function startTennchiCoinDropLoop(WB, b) {
    stopTennchiCoinDropLoop();
    if (!WB?.spawnCoinDropAt) return;

    const pickTier = () => {
      const a = CFG.TENNCHI.tierMin, c = CFG.TENNCHI.tierMax;
      return clamp(Math.floor(a + Math.random() * (c - a + 1)), 0, 3);
    };

    __tennchiDropTimer = window.setInterval(() => {
      if (!isTennshiActive()) return;

      const bb = findTennchiBunny(WB) || b;
      const w = bb?.wrap;
      if (!w || !w.isConnected) return;

      const r = w.getBoundingClientRect();
      const field = WB?.field || document.getElementById("field") || document.body;
      const fr = field.getBoundingClientRect();

      const baseX = (r.left - fr.left) + r.width * 0.55;
      const baseY = (r.top - fr.top) + r.height * 0.92;

      for (let i = 0; i < Math.max(1, CFG.TENNCHI.dropCount | 0); i++) {
        const tier = pickTier();
        WB.spawnCoinDropAt(
          baseX + (Math.random() * 26 - 13),
          baseY + (Math.random() * 10 - 5),
          tier
        );
      }
    }, CFG.TENNCHI.dropEveryMs);
  }

  function stopTennchiCoinDropLoop() {
    if (__tennchiDropTimer) clearInterval(__tennchiDropTimer);
    __tennchiDropTimer = 0;
  }

  async function ensureTennchiExists(WB) {
    if (!WB) return null;
    if (!isTennshiActive()) return null;

    // 既に居るなら再スキン＆ドロップ継続
    const exists = findTennchiBunny(WB);
    if (exists) {
      skinToTennchi(WB, exists);
      startTennchiCoinDropLoop(WB, exists);
      return exists;
    }

    const before = getBunnyList(WB);
    const prevIds = new Set(before.map(b => String(b?.bornAt ?? b?.id ?? b?.uuid ?? "")));

    // ✅ 生成（戻り値が Bunny ならそれを使う）
    const sp = spawnOneNormalBunnyPreferBunny4(WB);

    // DOM反映を待つ（2フレーム）
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    let b = sp.bunny || pickNewestBunny(WB, prevIds);

    if (!b) {
      await new Promise(r => setTimeout(r, 120));
      b = pickNewestBunny(WB, prevIds);
    }
    if (!b) return null;

    // ✅ スキン適用 + rescue
    skinToTennchi(WB, b);

    // 念押し：少し後にもう一回 rescue（転生直後のレイアウト変化対策）
    setTimeout(() => {
      try { rescueToGround(WB, b); } catch {}
      try { skinToTennchi(WB, b); } catch {}
    }, 120);

    startTennchiCoinDropLoop(WB, b);
    return b;
  }

  async function spawnTennchiOnPrestige(WB) {
    setTennshiActive(true);
    const b = await ensureTennchiExists(WB);
    return b;
  }

  function removeTennchi(WB) {
    setTennshiActive(false);
    stopTennchiCoinDropLoop();

    const b = findTennchiBunny(WB);
    if (!b) return;

    try {
      if (WB?.removeBunnyInstance) { WB.removeBunnyInstance(b); return; }
    } catch {}

    try { b?.wrap?.remove?.(); } catch {}
    try {
      if (Array.isArray(WB?.bunnies)) {
        const i = WB.bunnies.indexOf(b);
        if (i >= 0) WB.bunnies.splice(i, 1);
      }
    } catch {}
  }

  /* =========================
   * UI
   * ========================= */
  const PANEL_ID = "wbPrestigePanelV1";
  let panelEl = null;

  function buildPanel() {
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (!p) {
      p = document.createElement("div");
      p.id = PANEL_ID;
      document.body.appendChild(p);
    }
    panelEl = p;
    if (p.querySelector(".card")) return p;

    p.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">${escapeHtml(CFG.LABEL.title)}</div>
          <button class="close" type="button">${escapeHtml(CFG.LABEL.close)}</button>
        </div>
        <div class="body"></div>
      </div>
    `;

    p.querySelector(".bg")?.addEventListener("click", (e) => { e.preventDefault(); close(); });
    p.querySelector(".close")?.addEventListener("click", (e) => { e.preventDefault(); close(); });
    p.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return p;
  }

  let __liveTimer = 0;
  function startLiveCoins() {
    stopLiveCoins();
    __liveTimer = window.setInterval(() => {
      const p = panelEl || document.getElementById(PANEL_ID);
      if (!p || p.style.display !== "block") return;
      render();
    }, 250);
  }
  function stopLiveCoins() {
    if (__liveTimer) clearInterval(__liveTimer);
    __liveTimer = 0;
  }

  function open() {
    const p = buildPanel();
    p.style.display = "block";
    render();
    startLiveCoins();
  }

  function close() {
    const p = panelEl || document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = "none";
    stopLiveCoins();
  }

  function declared(x) { return !!x; }

  function render() {
    const WB = window.WB || null;
    const p = buildPanel();
    const body = p.querySelector(".body");
    if (!body) return;

    const st = loadPrestige();
    const coinsNow = getCoins(WB);

    const earnedNow = Math.max(earnedCoins, 0);
    const gainStars = calcStarsFromCoins(earnedNow);

    const available = Math.max(0, (st.stars - st.spent));

    const nextStar = Math.max(1, gainStars + 1);
    const needCoins = nextCoinsForStar(nextStar);
    const pct = (needCoins > 0) ? clamp((earnedNow / needCoins) * 100, 0, 100) : 0;

    const top = `
      <div class="row">
        <span class="pill">現在コイン：<b>🪙 ${format(coinsNow)}</b></span>
        <span class="pill">${escapeHtml(CFG.LABEL.earned)}：<b>🪙 ${format(earnedNow)}</b></span>
        <span class="pill">牧場の星：<b>🌟 ${format(st.stars)}</b></span>
        <span class="pill">使用可能：<b>✨ ${format(available)}</b></span>
      </div>
      <div class="row">
        <div style="flex:1; min-width:240px;">
          <div class="pill">この状態で転生すると：<b>🌟 +${format(gainStars)}</b></div>
          <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="hint">次の星（${nextStar}）目安：🪙 ${format(needCoins)}（いま ${pct.toFixed(1)}%）</div>
          <div class="hint">※ 転生ゲージは「稼いだ総量」です（使って減っても戻りません）。</div>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn danger hold" type="button" data-prestige="1" ${gainStars <= 0 ? "disabled" : ""}>
            <span>${escapeHtml(CFG.LABEL.prestigeBtn)}（長押し）</span>
            <i class="fill"></i>
          </button>
        </div>
      </div>
      <div style="height:10px"></div>
    `;

    const perkCards = PERK_MASTER.map(pk => {
      const owned = !!st.perks[pk.id];
      const canBuy = !owned && available >= pk.cost;
      const badge = owned ? `<span class="badge">${escapeHtml(CFG.LABEL.unlocked)}</span>` : `<span class="badge lock">未解放</span>`;
      const btn = owned
        ? `<button class="btn" type="button" disabled>${escapeHtml(CFG.LABEL.unlocked)}</button>`
        : `<button class="btn primary" type="button" data-buy="${escapeHtml(pk.id)}" ${canBuy ? "" : "disabled"}>${escapeHtml(CFG.LABEL.unlock)}（-${pk.cost}）</button>`;

      return `
        <div class="perk">
          <div class="name">🌟 ${escapeHtml(pk.name)} <span style="opacity:.75; font-weight:900;">(cost ${pk.cost})</span></div>
          <div class="desc">${escapeHtml(pk.desc)}${pk.gameplay ? "\n※バランス影響あり" : ""}</div>
          <div class="foot">
            <div>${badge}</div>
            <div style="display:flex; gap:10px; align-items:center;">
              ${btn}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const history = (st.history || []).slice(-8).reverse().map(h => {
      const t = new Date(h.t || Date.now());
      const dt = `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,"0")}/${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
      return `<div class="pill">🗓 ${escapeHtml(dt)}：🪙${format(h.earned ?? h.coins ?? 0)} → 🌟+${format(h.stars)}</div>`;
    }).join(" ");

    body.innerHTML = `
      ${top}
      <div class="row">
        <div class="pill">恒久解放（星で購入）</div>
        <div class="hint">他モジュールからは <b>WB.prestige.hasPerk("perkId")</b> で参照できます。</div>
      </div>
      <div class="grid">${perkCards}</div>

      <div style="height:14px"></div>
      <div class="row">
        <div class="pill">転生履歴</div>
        <div class="hint">${history || "（まだ転生していません）"}</div>
      </div>
    `;

    body.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-buy") || "";
        const pk = PERK_MASTER.find(x => x.id === id);
        if (!declared(pk)) return;

        const st2 = loadPrestige();
        const avail2 = Math.max(0, st2.stars - st2.spent);
        if (st2.perks[id]) { render(); return; }
        if (avail2 < pk.cost) { render(); return; }

        st2.perks[id] = true;
        st2.spent += pk.cost;
        savePrestige(st2);

        try { (window.WB || null)?.emit?.("prestige:perk", { id, on: true }); } catch {}
        render();
      });
    });

    const btnPrestige = body.querySelector("[data-prestige]");
    if (btnPrestige) {
      const fill = btnPrestige.querySelector(".fill");
      let downAt = 0;
      let raf = 0;
      let holding = false;

      const stopHold = () => {
        holding = false;
        downAt = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (fill) fill.style.width = "0%";
      };

      const step = () => {
        if (!holding) return;
        const now = Date.now();
        const p = clamp((now - downAt) / CFG.HOLD_MS, 0, 1);
        if (fill) fill.style.width = `${(p * 100).toFixed(1)}%`;

        if (p >= 1) {
          stopHold();
          doPrestige();
          return;
        }
        raf = requestAnimationFrame(step);
      };

      const startHold = (e) => {
        if (btnPrestige.disabled) return;
        e.preventDefault();
        holding = true;
        downAt = Date.now();
        step();
      };

      btnPrestige.addEventListener("pointerdown", startHold);
      btnPrestige.addEventListener("pointerup", stopHold);
      btnPrestige.addEventListener("pointercancel", stopHold);
      btnPrestige.addEventListener("pointerleave", stopHold);
    }

    async function doPrestige() {
      const WB = window.WB || null;

      const st = loadPrestige();

      const earned = Math.max(0, loadEarned());
      const gain = calcStarsFromCoins(earned);
      if (gain <= 0) return;

      st.stars += gain;
      st.history = Array.isArray(st.history) ? st.history : [];
      st.history.push({ t: Date.now(), earned, coins: getCoins(WB), stars: gain });
      if (st.history.length > 80) st.history = st.history.slice(-80);
      savePrestige(st);

      // リセット
      setCoinsZero(WB);
      removeAllBunnies(WB);
      deepWipeLocalStorage();

      resetEarned();

      // ✅ 地上tennshi確実生成（大人bornAtで生成→画像が戻らない）
      await spawnTennchiOnPrestige(WB);

      // ✅ 念押し rescue（転生直後の座標バグ対策）
      try {
        const b = findTennchiBunny(WB);
        if (b) {
          rescueToGround(WB, b);
          setTimeout(() => { try { rescueToGround(WB, b); } catch {} }, 180);
        }
      } catch {}

      // 通知
      try { WB?.emit?.("prestige", { stars: gain, total: st.stars }); } catch {}
      try { WB?.emit?.("sy:add", { key: "prestige", delta: 1 }); } catch {}

      render();
    }
  }

  /* =========================
   * ✅ coinChanged を購読して最新コイン＆ゲージに反映
   * ========================= */
  function hookCoinChanged(WB) {
    let hooked = false;

    try {
      if (WB?.on && !WB.__prestigeCoinHookedV153) {
        WB.on("coinChanged", (payload) => {
          const cur = (() => {
            if (typeof payload === "number") return payload;
            if (payload && typeof payload === "object" && payload.coins != null) return Number(payload.coins);
            return Number(payload);
          })();

          if (!Number.isFinite(cur)) return;

          __latestCoins = cur;

          if (__lastCoinForEarn === null) __lastCoinForEarn = cur;

          const diff = cur - __lastCoinForEarn;
          if (diff > 0) addEarned(diff, "coinChanged");

          __lastCoinForEarn = cur;

          try {
            const p = panelEl || document.getElementById(PANEL_ID);
            if (p && p.style.display === "block") render();
          } catch {}
        });

        WB.__prestigeCoinHookedV153 = true;
        hooked = true;
      }
    } catch {}

    return hooked;
  }

  // Public API
  waitForWB().then(async (WB) => {
    // 初期同期
    try {
      const nowRaw = readCoinsDirect(WB);
      __latestCoins = nowRaw;
      __lastCoinForEarn = nowRaw;

      if (!loadEarned() && nowRaw > 0) {
        earnedCoins = Math.max(earnedCoins, nowRaw);
        saveEarned(earnedCoins);
      }
    } catch {}

    const okHook = hookCoinChanged(WB);
    if (!okHook) startCoinWatchFallback(WB);

    const api = {
      open,
      close,
      load: loadPrestige,
      save: savePrestige,
      hasPerk: (id) => {
        const st = loadPrestige();
        return !!st.perks?.[String(id || "")];
      },
      getStars: () => {
        const st = loadPrestige();
        return Number(st.stars || 0) || 0;
      },
      getAvailable: () => {
        const st = loadPrestige();
        return Math.max(0, (Number(st.stars || 0) || 0) - (Number(st.spent || 0) || 0));
      },
      calcStarsFromCoins,
      config: CFG,
      PERK_MASTER,

      onCoinsGained: (delta, source = "external") => addEarned(delta, source),
      getEarned: () => Math.max(0, loadEarned()),
      resetEarned: () => resetEarned(),

      getCoins: () => getCoins(window.WB || WB || null),

      tennchi: {
        isActive: () => isTennshiActive(),
        ensure: () => ensureTennchiExists(window.WB || null),
        spawn: () => spawnTennchiOnPrestige(window.WB || null),
        remove: () => removeTennchi(window.WB || null),
      },
    };

    if (WB) WB.prestige = api;
    else window.WB_PRESTIGE = api;

    // リロード後も常駐
    try {
      if (WB && isTennshiActive()) {
        await ensureTennchiExists(WB);
      }
    } catch {}

    console.log("[prestige] ready v1.5.3", {
      LS_PRESTIGE,
      earned: CFG.LS_EARNED,
      hookCoinChanged: !!(WB?.__prestigeCoinHookedV153),
      fallbackWatchMs: CFG.COIN_WATCH_MS,
      tennshi: CFG.TENNCHI.IMG
    });
  });
})();
