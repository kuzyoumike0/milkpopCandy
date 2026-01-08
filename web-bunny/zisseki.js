// zisseki.js（実績システム：増設版・互換強化 / ✅WB待機版）
// - localStorage 永続化
// - WB events が無くても、定期チェックで解除できる
// - SYOUGOU の各種カウント（うんち/旅立ち/花火/スロット当たり/お迎え）を実績に反映
// - ✅ 新旧WB互換：getCoin/getBunnies/stats など優先して参照
// ✅ FIX: 読み込み順で window.WB が無いと即returnしてしまい、永遠に実績が動かない問題を修正（WB待機）
// ✅ FIX: app.js(v16.4)は coinsChanged をemitしていないので、hudUpdated も拾う（+定期チェックで確実に解除）

(() => {
  "use strict";

  /* =========================
   * Wait for WB (and DOM)
   * ========================= */
  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found"));
        }
      }, TICK_MS);
    });
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then((WB) => {
    // 実績キー（app.js とは別で管理）
    const LS_ACH = "wb_ach_v4";

    // 既存仕様：同時うさぎ数でショップ解放
    const UNLOCK_BUNNY4_NEED = 10;

    /* =========================
     * Storage
     * ========================= */
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

    function unlock(id, meta = {}) {
      if (ach[id]) return false;
      ach[id] = true;
      saveAch();

      toast(`🏆 実績解除：${meta?.name || id}`);

      // イベント通知（他UIと連動したい場合）
      try { WB.emit?.("achievementUnlocked", { id, ...meta }); } catch {}
      return true;
    }

    /* =========================
     * Toast UI
     * ========================= */
    function ensureToastStyle() {
      if (document.getElementById("wbAchToastStyleV1")) return;
      const s = document.createElement("style");
      s.id = "wbAchToastStyleV1";
      s.textContent = `
.wbAchToast{
  position: fixed;
  left: 50%;
  top: 16%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(255,255,255,.96);
  border-radius: 16px;
  padding: 12px 16px;
  font-weight: 1000;
  box-shadow: 0 16px 40px rgba(0,0,0,.18);
  opacity: 0;
  animation: wbAchIn .22s ease-out forwards, wbAchOut .36s ease-in forwards;
  animation-delay: 0ms, 2.7s;
  white-space: nowrap;
}
@keyframes wbAchIn{
  from { opacity: 0; transform: translate(-50%, -70%); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes wbAchOut{
  from { opacity: 1; transform: translate(-50%, -50%); }
  to   { opacity: 0; transform: translate(-50%, -35%); }
}
`;
      document.head.appendChild(s);
    }

    function toast(text) {
      ensureToastStyle();
      const t = String(text ?? "").trim();
      if (!t) return;
      const el = document.createElement("div");
      el.className = "wbAchToast";
      el.textContent = t;
      document.body.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, 3600);
    }

    /* =========================
     * Helpers (getters) — 新旧互換
     * ========================= */

    // 所持コイン（新：WB.getCoin / 旧：WB.coins / 最後：HUD表示）
    function getCoins() {
      try {
        if (typeof WB.getCoin === "function") {
          const v = Number(WB.getCoin());
          return Number.isFinite(v) ? v : 0;
        }
      } catch {}
      try {
        if (typeof WB.coins === "number") return WB.coins;
      } catch {}
      const el = document.getElementById("coinValue");
      return el ? (Number(el.textContent) || 0) : 0;
    }

    // 同時うさぎ数（新：WB.getBunnies / 旧：WB.bunnies）
    function getBunnyCount() {
      try {
        if (typeof WB.getBunnies === "function") {
          const arr = WB.getBunnies();
          return Array.isArray(arr) ? arr.length : 0;
        }
      } catch {}
      try {
        if (Array.isArray(WB.bunnies)) return WB.bunnies.length;
      } catch {}
      return 0;
    }

    // SYOUGOU カウント（あれば）
    function getSyougouCount(key) {
      try {
        return window.SYOUGOU?.getCount?.(key) ?? 0;
      } catch {
        return 0;
      }
    }

    // WB側で「累計購入数」等がある場合だけ拾う（無ければ 0）
    function getStatMaybe(keys) {
      for (const k of keys) {
        try {
          const v = WB?.[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
        } catch {}
        try {
          const v2 = WB?.stats?.[k];
          if (typeof v2 === "number" && Number.isFinite(v2)) return v2;
        } catch {}
      }
      return 0;
    }

    /* =========================
     * Achievements Master
     * ========================= */

    const ACH_MASTER = [
      // --- ショップ解放（既存） ---
      {
        id: "unlock_bunny4",
        name: "大家族のはじまり",
        desc: `同時うさぎ数が${UNLOCK_BUNNY4_NEED}匹に到達（bunny4/bunny5解放）`,
        check: () => (getBunnyCount() >= UNLOCK_BUNNY4_NEED),
        onUnlock: () => {
          toast("🐰✨ bunny4 / bunny5 がショップに出現しました！");
          try { WB.emit?.("unlockShop", { id: "unlock_bunny4" }); } catch {}
        },
      },

      // --- 所持コイン ---
      { id: "coins_10k",   name: "小金持ち",     desc: "所持コイン 10,000 到達",    check: () => getCoins() >= 10_000 },
      { id: "coins_100k",  name: "資産家",       desc: "所持コイン 100,000 到達",   check: () => getCoins() >= 100_000 },
      { id: "coins_1m",    name: "伝説の富豪",   desc: "所持コイン 1,000,000 到達", check: () => getCoins() >= 1_000_000 },

      // --- SYOUGOU連動：ウンチ ---
      { id: "unchi_10",   name: "ウンチ道・初段",   desc: "ウンチ回数 10",   check: () => getSyougouCount("unchi") >= 10 },
      { id: "unchi_50",   name: "ウンチ道・五段",   desc: "ウンチ回数 50",   check: () => getSyougouCount("unchi") >= 50 },
      { id: "unchi_100",  name: "ウンチ道・皆伝",   desc: "ウンチ回数 100",  check: () => getSyougouCount("unchi") >= 100 },

      // --- SYOUGOU連動：旅立ち ---
      { id: "tabidachi_10",  name: "見送り見習い",   desc: "旅立ち回数 10",   check: () => getSyougouCount("tabidachi") >= 10 },
      { id: "tabidachi_50",  name: "見送り職人",     desc: "旅立ち回数 50",   check: () => getSyougouCount("tabidachi") >= 50 },
      { id: "tabidachi_100", name: "見送り神",       desc: "旅立ち回数 100",  check: () => getSyougouCount("tabidachi") >= 100 },

      // --- SYOUGOU連動：花火 ---
      { id: "hanabi_10",  name: "一発屋",         desc: "花火回数 10",   check: () => getSyougouCount("hanabi") >= 10 },
      { id: "hanabi_50",  name: "夜空の演出家",   desc: "花火回数 50",   check: () => getSyougouCount("hanabi") >= 50 },
      { id: "hanabi_100", name: "天上の花火師",   desc: "花火回数 100",  check: () => getSyougouCount("hanabi") >= 100 },

      // --- SYOUGOU連動：スロット当たり ---
      { id: "slotwin_10",  name: "当たり癖",         desc: "スロット当たり回数 10",   check: () => getSyougouCount("slot_win") >= 10 },
      { id: "slotwin_50",  name: "勝ち筋が見える",   desc: "スロット当たり回数 50",   check: () => getSyougouCount("slot_win") >= 50 },
      { id: "slotwin_100", name: "スロットの申し子", desc: "スロット当たり回数 100",  check: () => getSyougouCount("slot_win") >= 100 },

      // --- SYOUGOU連動：お迎え ---
      { id: "omukae_10",  name: "お迎え係",     desc: "お迎え回数 10",   check: () => getSyougouCount("omukae") >= 10 },
      { id: "omukae_50",  name: "案内人",       desc: "お迎え回数 50",   check: () => getSyougouCount("omukae") >= 50 },
      { id: "omukae_100", name: "冥府の執事",   desc: "お迎え回数 100",  check: () => getSyougouCount("omukae") >= 100 },

      // --- 累計うさぎ購入（WBに数値がある場合だけ機能） ---
      { id: "buy_10",  name: "多頭飼いデビュー", desc: "累計うさぎ購入 10",  check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 10 },
      { id: "buy_50",  name: "牧場主",           desc: "累計うさぎ購入 50",  check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 50 },
      { id: "buy_100", name: "超・牧場主",       desc: "累計うさぎ購入 100", check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 100 },
    ];

    /* =========================
     * Check & unlock
     * ========================= */
    function checkUnlocks() {
      for (const a of ACH_MASTER) {
        if (isUnlocked(a.id)) continue;

        let ok = false;
        try { ok = !!a.check?.(); } catch { ok = false; }
        if (!ok) continue;

        const newly = unlock(a.id, { name: a.name, desc: a.desc });
        if (newly) {
          try { a.onUnlock?.(); } catch {}
        }
      }
    }

    /* =========================
     * Hooks
     * ========================= */

    // うさぎ数が変わるたびにチェック
    try { WB.on?.("bunnyCountChanged", checkUnlocks); } catch {}

    // ✅ app.js(v16.4)は updateHud()で hudUpdated をemitしてるのでここを拾う
    try { WB.on?.("hudUpdated", checkUnlocks); } catch {}

    // コイン変化（もし将来emitされても拾う）
    try { WB.on?.("coinsChanged", checkUnlocks); } catch {}
    try { WB.on?.("coinChanged", checkUnlocks); } catch {}

    // SYOUGOU連動が増えるイベント（あれば拾う）
    try { WB.on?.("goldenUnchiCollected", checkUnlocks); } catch {}
    try { WB.on?.("tabidachi", checkUnlocks); } catch {}
    try { WB.on?.("hanabiFired", checkUnlocks); } catch {}
    try { WB.on?.("slotWin", checkUnlocks); } catch {}
    try { WB.on?.("omukae", checkUnlocks); } catch {}

    // リセット時は実績も消したい場合
    try {
      WB.on?.("resetRequested", () => {
        try { localStorage.removeItem(LS_ACH); } catch {}
      });
    } catch {}

    // eventsが無くても解除できるように「定期チェック」
    const TIMER_MS = 900;
    const timer = setInterval(checkUnlocks, TIMER_MS);

    // 外部公開
    WB.zisseki = {
      ach,
      isUnlocked,
      unlock,
      checkUnlocks,
      LS_ACH,
      UNLOCK_BUNNY4_NEED,
      ACH_MASTER,
      stop: () => { try { clearInterval(timer); } catch {} },
    };

    // 初回チェック
    checkUnlocks();

    console.log("[zisseki] ready", { unlocked: Object.keys(ach).length });
  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
