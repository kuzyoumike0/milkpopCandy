// zisseki.js（実績システム：互換強化 / ✅WB待機版 + ✅実績UI）V4.3
// ✅ FIX：SYOUGOUが無くても解除できる（WB.emit("sy:add") を拾って自前永続化）
// ✅ NEW：WB.emit("hanabiFired" 等) をフックしてカウントに変換（各モジュール無改造で通ることが多い）

(() => {
  "use strict";

  /* =========================
   * Wait for WB (usable)
   * ========================= */
  const WAIT_MS = 20000;
  const TICK_MS = 50;

  function waitForWBUsable() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        try {
          const WB = window.WB;
          if (WB && typeof WB === "object") {
            const coinOk =
              typeof WB.getCoin === "function" ||
              typeof WB.coins === "number" ||
              !!document.getElementById("coinValue");

            const bunnyOk =
              typeof WB.getBunnies === "function" ||
              Array.isArray(WB.bunnies) ||
              !!document.getElementById("bunnyLayer");

            if (coinOk && bunnyOk) {
              clearInterval(t);
              resolve(WB);
              return;
            }
          }
        } catch {}

        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not usable in time"));
        }
      }, TICK_MS);
    });
  }

  waitForWBUsable().then((WB) => {
    /* =========================
     * Keys
     * ========================= */
    const LS_ACH = "wb_ach_v4";               // 実績
    const LS_SYCOUNTS = "wb_sy_counts_v1";    // ✅ SYOUGOU互換カウント（自前）
    const UNLOCK_BUNNY4_NEED = 10;

    /* =========================
     * debug toggle
     * ========================= */
    const dbg = (...args) => {
      try { if (WB?.zisseki?.debug) console.log("[zisseki]", ...args); } catch {}
    };

    /* =========================
     * Storage helpers
     * ========================= */
    function loadJson(key, def) {
      try {
        const v = JSON.parse(localStorage.getItem(key) || "null");
        return (v && typeof v === "object") ? v : def;
      } catch {
        return def;
      }
    }
    function saveJson(key, v) {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    }

    /* =========================
     * Ach storage
     * ========================= */
    const ach = loadJson(LS_ACH, {});
    function saveAch() { saveJson(LS_ACH, ach); }
    function isUnlocked(id) { return !!ach[id]; }

    function unlock(id, meta = {}) {
      if (ach[id]) return false;
      ach[id] = { at: Date.now(), ...meta };
      saveAch();
      toast(`🏆 実績解除：${meta?.name || id}`);
      try { WB.emit?.("achievementUnlocked", { id, ...meta }); } catch {}
      refreshUI();
      return true;
    }

    /* =========================
     * ✅ SYOUGOU互換カウント（確実）
     * ========================= */
    const syCounts = loadJson(LS_SYCOUNTS, {}); // { key:number }
    function saveSyCounts() { saveJson(LS_SYCOUNTS, syCounts); }

    function syInc(key, n = 1) {
      const k = String(key || "");
      const add = Math.max(0, Math.floor(Number(n) || 0));
      if (!k || add <= 0) return;
      syCounts[k] = (Number(syCounts[k]) || 0) + add;
      saveSyCounts();
    }

    // ① WBイベント「sy:add」を拾う（あなたの app.js は emit してる）
    try {
      WB.on?.("sy:add", (p) => {
        const key = p?.key;
        const n = p?.n ?? 1;
        syInc(key, n);
      });
    } catch {}

    // ② 念のため WB.syAdd をラップ（他JSが emitしない実装でも拾える）
    try {
      if (typeof WB.syAdd === "function" && !WB.syAdd.__zissekiWrapped) {
        const orig = WB.syAdd.bind(WB);
        const wrapped = (key, n = 1) => {
          syInc(key, n);
          try { return orig(key, n); } catch { return; }
        };
        wrapped.__zissekiWrapped = true;
        WB.syAdd = wrapped;
      }
    } catch {}

    // ✅ NEW：WB.emit のイベント名をカウントに変換（各モジュールがemitしていれば無改造で通る）
    const EVENT_TO_SY = {
      // 花火
      hanabiFired: "hanabi",
      "hanabi:fired": "hanabi",

      // 旅立ち（表記ゆれ吸収）
      tabidachi: "tabidachi",
      tabidati: "tabidachi",
      "tabidachi:done": "tabidachi",
      "tabidati:done": "tabidachi",

      // スロット
      slotWin: "slot_win",
      "slot:win": "slot_win",

      // お迎え
      omukae: "omukae",
      "omukae:done": "omukae",
      "bunnyBought": "omukae",

      // うんち
      unchi: "unchi",
      "unchi:spawn": "unchi",
      goldenUnchiCollected: "unchi_ougon", // もし黄金別カウントしたければ
    };

    function wrapEmitOnce() {
      try {
        if (typeof WB.emit !== "function") return;
        if (WB.emit.__zissekiEmitWrapped) return;

        const origEmit = WB.emit.bind(WB);
        const wrappedEmit = (ev, payload) => {
          try {
            const k = EVENT_TO_SY[String(ev)];
            if (k) syInc(k, 1);
          } catch {}
          return origEmit(ev, payload);
        };
        wrappedEmit.__zissekiEmitWrapped = true;
        WB.emit = wrappedEmit;
      } catch {}
    }
    wrapEmitOnce();

    function getSyougouCount(key) {
      const k = String(key);

      // A) 公式SYOUGOUがあるなら最優先
      try {
        const S = window.SYOUGOU;
        if (S && typeof S.getCount === "function") {
          const v = Number(S.getCount(k));
          if (Number.isFinite(v)) return v;
        }
      } catch {}

      // C) 自前カウント（確実）
      const n2 = Number(syCounts[k]);
      return Number.isFinite(n2) ? n2 : 0;
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
     * WB getters
     * ========================= */
    function getCoins() {
      try {
        if (typeof WB.getCoin === "function") {
          const v = Number(WB.getCoin());
          return Number.isFinite(v) ? v : 0;
        }
      } catch {}
      try {
        if (typeof WB.coins === "number" && Number.isFinite(WB.coins)) return WB.coins;
      } catch {}
      const el = document.getElementById("coinValue");
      return el ? (Number(el.textContent) || 0) : 0;
    }

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
      {
        id: "unlock_bunny4",
        name: "大家族のはじまり",
        desc: `同時うさぎ数が${UNLOCK_BUNNY4_NEED}匹に到達（bunny4/bunny5解放）`,
        check: () => (getBunnyCount() >= UNLOCK_BUNNY4_NEED),
        progress: () => ({ now: getBunnyCount(), target: UNLOCK_BUNNY4_NEED, unit: "匹" }),
      },

      { id: "coins_10k",  name: "小金持ち",   desc: "所持コイン 10,000 到達",    check: () => getCoins() >= 10_000,  progress: () => ({ now: getCoins(), target: 10_000, unit: "🪙" }) },

      { id: "hanabi_10",  name: "一発屋",       desc: "花火回数 10",  check: () => getSyougouCount("hanabi") >= 10,  progress: () => ({ now: getSyougouCount("hanabi"), target: 10, unit: "回" }) },
      { id: "slotwin_10", name: "当たり癖",     desc: "スロット当たり回数 10",  check: () => getSyougouCount("slot_win") >= 10, progress: () => ({ now: getSyougouCount("slot_win"), target: 10, unit: "回" }) },
      { id: "tabidachi_10", name: "見送り見習い", desc: "旅立ち回数 10", check: () => getSyougouCount("tabidachi") >= 10, progress: () => ({ now: getSyougouCount("tabidachi"), target: 10, unit: "回" }) },
      { id: "unchi_10", name: "ウンチ道・初段", desc: "ウンチ回数 10", check: () => getSyougouCount("unchi") >= 10, progress: () => ({ now: getSyougouCount("unchi"), target: 10, unit: "回" }) },
      { id: "omukae_10", name: "お迎え係", desc: "お迎え回数 10", check: () => getSyougouCount("omukae") >= 10, progress: () => ({ now: getSyougouCount("omukae"), target: 10, unit: "回" }) },
    ];

    /* =========================
     * Check & unlock
     * ========================= */
    function checkUnlocks() {
      dbg("tick", {
        coins: getCoins(),
        bunny: getBunnyCount(),
        unchi: getSyougouCount("unchi"),
        tabidachi: getSyougouCount("tabidachi"),
        hanabi: getSyougouCount("hanabi"),
        slot_win: getSyougouCount("slot_win"),
        omukae: getSyougouCount("omukae"),
      });

      for (const a of ACH_MASTER) {
        if (isUnlocked(a.id)) continue;
        let ok = false;
        try { ok = !!a.check?.(); } catch { ok = false; }
        if (!ok) continue;
        unlock(a.id, { name: a.name, desc: a.desc });
      }
    }

    /* =========================
     * UI（最小版：ボタンだけ付ける）
     * ========================= */
    const BTN_ID = "wbAchBtnV1";
    function injectHudButton() {
      const hud = document.getElementById("hud");
      if (!hud) return;
      if (document.getElementById(BTN_ID)) return;

      const mount = document.getElementById("hudButtons") || hud;

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "実績";
      btn.addEventListener("click", () => {
        alert(
          `【カウント】\n` +
          `🐰 ${getBunnyCount()}\n` +
          `🎆 ${getSyougouCount("hanabi")}\n` +
          `🎰 ${getSyougouCount("slot_win")}\n` +
          `🕊️ ${getSyougouCount("tabidachi")}\n` +
          `💩 ${getSyougouCount("unchi")}\n` +
          `🚪 ${getSyougouCount("omukae")}\n`
        );
      });
      mount.appendChild(btn);
    }

    function refreshUI() { /* 今回はalert簡易 */ }

    /* =========================
     * Hooks
     * ========================= */
    try { WB.on?.("bunnyCountChanged", checkUnlocks); } catch {}
    try { WB.on?.("hudUpdated", checkUnlocks); } catch {}
    try { WB.on?.("sy:add", checkUnlocks); } catch {}

    const timer = setInterval(() => checkUnlocks(), 900);

    window.addEventListener("load", () => {
      injectHudButton();
      setTimeout(injectHudButton, 400);
      setTimeout(injectHudButton, 1200);
    });

    /* =========================
     * External
     * ========================= */
    WB.zisseki = {
      ach,
      isUnlocked,
      unlock,
      checkUnlocks,
      debug: false,
      stop: () => { try { clearInterval(timer); } catch {} },
      getSyCount: (k) => getSyougouCount(k),
      _syCounts: syCounts,
    };

    checkUnlocks();
    injectHudButton();
    console.log("[zisseki] ready", { unlocked: Object.keys(ach).length });

  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
