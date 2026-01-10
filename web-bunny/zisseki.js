// zisseki.js（✅実績：zisseki.js単体でカウント完結 + ✅図鑑タブ互換(ach提供) + ✅WB待機 + ✅トースト）
// - localStorage 永続化（実績専用LSのみ）
// - 回数系（うんち/お迎え/旅立ち/花火/スロット当たり）も zisseki.js 自前statsで保持
// - WB events が無くても、WB.emit を安全にフックして拾う（最終保険）
// - sy:add が来たら payload を解析して自動で stats に加算
// - 図鑑(zukan.js)の renderAchievements が参照するために WB.zisseki.ach を提供（互換）
//
// 使い方（他モジュールから加算したい場合）
//   WB.emit("sy:add", { key:"unchi", delta:1 })
//   WB.emit("sy:add", { type:"tabidachi" })
//   WB.zisseki.addCount("omukae", 1)
//
// ✅ zukan.js 側はタブ切り替えで実績を表示するだけ（カウントは zisseki.js が担当）

(() => {
  "use strict";

  /* =========================
   * Wait for WB
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

  waitForWB().then((WB) => {
    /* =========================
     * Storage（unlocked + stats）
     * ========================= */
    const LS_ZISSEKI = "wb_zisseki_v6"; // { ver:6, unlocked:{}, stats:{} }

    const UNLOCK_BUNNY4_NEED = 10;

    function loadState() {
      // 新形式
      try {
        const raw = JSON.parse(localStorage.getItem(LS_ZISSEKI) || "null");
        if (raw && typeof raw === "object") {
          if (raw.unlocked && typeof raw.unlocked === "object") {
            return {
              ver: Number(raw.ver || 6) || 6,
              unlocked: raw.unlocked && typeof raw.unlocked === "object" ? raw.unlocked : {},
              stats: raw.stats && typeof raw.stats === "object" ? raw.stats : {},
            };
          }
          // 旧形式（平坦object：{achId:true,...}）
          return { ver: 6, unlocked: raw, stats: {} };
        }
      } catch {}

      // さらに古いキー救済（あなたが以前使ってた）
      try {
        const legacy = JSON.parse(localStorage.getItem("wb_ach_v5") || "null");
        if (legacy && typeof legacy === "object") {
          return { ver: 6, unlocked: legacy, stats: {} };
        }
      } catch {}

      return { ver: 6, unlocked: {}, stats: {} };
    }

    const state = loadState();
    const unlocked = state.unlocked || {};
    const stats = state.stats || {};

    function saveState() {
      localStorage.setItem(LS_ZISSEKI, JSON.stringify({ ver: 6, unlocked, stats }));
    }

    function isUnlocked(id) {
      return !!unlocked[id];
    }

    /* =========================
     * Stats（zisseki.js完結カウンタ）
     * ========================= */
    const STAT_KEYS = ["unchi", "omukae", "tabidachi", "hanabi", "slot_win"];

    function normKey(k) {
      const s = String(k ?? "").trim().toLowerCase();
      if (!s) return "";
      if (s === "tabidati") return "tabidachi";
      if (s === "slotwin") return "slot_win";
      if (s === "slot") return "slot_win";
      if (s === "fireworks") return "hanabi";
      return s;
    }

    function getCount(key) {
      const k = normKey(key);
      const v = Number(stats[k] ?? 0);
      return Number.isFinite(v) ? v : 0;
    }

    function setCount(key, value) {
      const k = normKey(key);
      if (!k) return;
      const v = Number(value);
      stats[k] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
      saveState();
    }

    function addCount(key, delta = 1) {
      const k = normKey(key);
      if (!k) return 0;

      const d = Number(delta);
      const inc = Number.isFinite(d) ? d : 1;

      const next = Math.max(0, Math.floor(getCount(k) + inc));
      stats[k] = next;
      saveState();

      onSyAddLight();
      return next;
    }

    // 初期化：キーが無ければ0
    for (const k of STAT_KEYS) {
      if (!(k in stats)) stats[k] = 0;
    }
    saveState();

    /* =========================
     * Toast
     * ========================= */
    function ensureToastStyle() {
      if (document.getElementById("wbAchToastStyleV2")) return;
      const s = document.createElement("style");
      s.id = "wbAchToastStyleV2";
      s.textContent = `
.wbAchToast{
  position: fixed;
  left: 50%;
  top: 16%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  padding: 12px 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.20);
  opacity: 0;
  animation: wbAchIn .22s ease-out forwards, wbAchOut .36s ease-in forwards;
  animation-delay: 0ms, 2.9s;
  max-width: min(640px, 92vw);
}
.wbAchToast .t1{
  font-weight: 1000;
  line-height: 1.25;
}
.wbAchToast .t2{
  margin-top: 6px;
  font-weight: 900;
  font-size: 12px;
  opacity: .82;
  line-height: 1.35;
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

    function escapeHtml(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function toast(title, flavor = "") {
      ensureToastStyle();
      const t1 = String(title ?? "").trim();
      const t2 = String(flavor ?? "").trim();
      if (!t1) return;

      const el = document.createElement("div");
      el.className = "wbAchToast";
      el.innerHTML = `
        <div class="t1">${escapeHtml(t1)}</div>
        ${t2 ? `<div class="t2">${escapeHtml(t2)}</div>` : ""}
      `;
      document.body.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, 3800);
    }

    /* =========================
     * Helpers (WB互換)
     * ========================= */
    function getCoins() {
      try { if (typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
      try { if (typeof WB.coins === "number") return WB.coins; } catch {}
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
      try { if (Array.isArray(WB.bunnies)) return WB.bunnies.length; } catch {}
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
     * sy:add / event 解析 → stats加算
     * ========================= */
    function parseSyPayload(payload) {
      if (payload == null) return { key: "", delta: 0 };

      if (typeof payload === "string") {
        const k = normKey(payload);
        return { key: k, delta: k ? 1 : 0 };
      }

      if (typeof payload === "object") {
        const k =
          normKey(payload.key) ||
          normKey(payload.type) ||
          normKey(payload.id) ||
          normKey(payload.name) ||
          normKey(payload.event);

        if (k === "slot_win") {
          if (payload.win === false) return { key: "slot_win", delta: 0 };
        }

        let d = 1;
        if ("delta" in payload) {
          const dd = Number(payload.delta);
          d = Number.isFinite(dd) ? dd : 1;
        } else if ("count" in payload) {
          const cc = Number(payload.count);
          d = Number.isFinite(cc) ? cc : 1;
        }
        d = Math.max(0, Math.floor(d));
        return { key: k, delta: k ? d : 0 };
      }

      return { key: "", delta: 0 };
    }

    let __lastSyPing = 0;
    function onSyAddLight() {
      const now = Date.now();
      if (now - __lastSyPing < 120) return;
      __lastSyPing = now;
      checkUnlocks();
      try { WB.emit?.("achievementDirty", { t: now }); } catch {}
    }

    function onSyAdd(payload) {
      const p = parseSyPayload(payload);
      if (p.key && p.delta > 0) {
        addCount(p.key, p.delta);
        return;
      }
      onSyAddLight();
    }

    // WB.on("sy:add") が来たら解析
    try { WB.on?.("sy:add", onSyAdd); } catch {}

    // よくあるイベント名を直接拾う（payload無でもOK）
    function bindCountEvent(evtName, key) {
      try {
        WB.on?.(evtName, (payload) => {
          const p = parseSyPayload(payload);
          if (p.key) {
            if (p.delta > 0) addCount(p.key, p.delta);
            else onSyAddLight();
          } else {
            addCount(key, 1);
          }
        });
      } catch {}
    }

    bindCountEvent("unchi", "unchi");
    bindCountEvent("omukae", "omukae");
    bindCountEvent("tabidachi", "tabidachi");
    bindCountEvent("tabidati", "tabidachi");
    bindCountEvent("hanabiFired", "hanabi");
    bindCountEvent("hanabi", "hanabi");
    bindCountEvent("fireworks", "hanabi");
    bindCountEvent("slotWin", "slot_win");
    bindCountEvent("slotwin", "slot_win");

    /* =========================
     * 最終保険：WB.emit フック
     * ========================= */
    function hookEmitOnce() {
      try {
        if (WB.__zissekiEmitHooked) return;
        if (typeof WB.emit !== "function") return;

        const orig = WB.emit.bind(WB);
        WB.emit = function (name, payload) {
          try {
            const ev = String(name ?? "");
            if (ev === "sy:add") onSyAdd(payload);

            if (ev === "unchi") addCount("unchi", 1);
            if (ev === "omukae") addCount("omukae", 1);
            if (ev === "tabidachi" || ev === "tabidati") addCount("tabidachi", 1);
            if (ev === "hanabiFired" || ev === "hanabi" || ev === "fireworks") addCount("hanabi", 1);

            if (ev === "slotWin" || ev === "slotwin") {
              if (!(payload && typeof payload === "object" && payload.win === false)) addCount("slot_win", 1);
            }
          } catch {}
          return orig(name, payload);
        };

        WB.__zissekiEmitHooked = true;
      } catch {}
    }
    hookEmitOnce();
    setTimeout(hookEmitOnce, 500);

    /* =========================
     * Achievements Master（flavor）
     * ========================= */
    const ACH_MASTER = [
      {
        id: "unlock_bunny4",
        name: "大家族のはじまり",
        desc: `同時うさぎ数が${UNLOCK_BUNNY4_NEED}匹に到達（bunny4/bunny5解放）`,
        flavor: "牧場が“にぎやか”という言葉では足りなくなってきた。",
        check: () => (getBunnyCount() >= UNLOCK_BUNNY4_NEED),
        progress: () => ({ now: getBunnyCount(), target: UNLOCK_BUNNY4_NEED, unit: "匹" }),
        onUnlock: () => {
          toast("🐰✨ bunny4 / bunny5 がショップに出現しました！", "新しい風が、牧場の空気を変える。");
          try { WB.emit?.("unlockShop", { id: "unlock_bunny4" }); } catch {}
        },
      },

      { id: "coins_10k",  name: "小金持ち",   desc: "所持コイン 10,000 到達",
        flavor: "チャリン…が、少し誇らしく聞こえる。",
        check: () => getCoins() >= 10_000,
        progress: () => ({ now: getCoins(), target: 10_000, unit: "🪙" })
      },
      { id: "coins_100k", name: "資産家",     desc: "所持コイン 100,000 到達",
        flavor: "牧場の運命が、“数字”で見えるようになった。",
        check: () => getCoins() >= 100_000,
        progress: () => ({ now: getCoins(), target: 100_000, unit: "🪙" })
      },
      { id: "coins_1m",   name: "伝説の富豪", desc: "所持コイン 1,000,000 到達",
        flavor: "もう、夢を現実って呼んでいい。",
        check: () => getCoins() >= 1_000_000,
        progress: () => ({ now: getCoins(), target: 1_000_000, unit: "🪙" })
      },

      { id: "unchi_10",  name: "ウンチ道・初段", desc: "ウンチ回数 10",
        flavor: "誇り高く、堂々と、今日も置いていく。",
        check: () => getCount("unchi") >= 10,
        progress: () => ({ now: getCount("unchi"), target: 10, unit: "回" })
      },
      { id: "unchi_50",  name: "ウンチ道・五段", desc: "ウンチ回数 50",
        flavor: "積み重ねは、時に香りも積み重なる。",
        check: () => getCount("unchi") >= 50,
        progress: () => ({ now: getCount("unchi"), target: 50, unit: "回" })
      },
      { id: "unchi_100", name: "ウンチ道・皆伝", desc: "ウンチ回数 100",
        flavor: "もはや芸術。もはや様式美。",
        check: () => getCount("unchi") >= 100,
        progress: () => ({ now: getCount("unchi"), target: 100, unit: "回" })
      },

      { id: "tabidachi_10",  name: "見送り見習い", desc: "旅立ち回数 10",
        flavor: "手を振る回数だけ、優しくなれる気がした。",
        check: () => getCount("tabidachi") >= 10,
        progress: () => ({ now: getCount("tabidachi"), target: 10, unit: "回" })
      },
      { id: "tabidachi_50",  name: "見送り職人",   desc: "旅立ち回数 50",
        flavor: "別れに慣れるんじゃない。上手に抱えるだけ。",
        check: () => getCount("tabidachi") >= 50,
        progress: () => ({ now: getCount("tabidachi"), target: 50, unit: "回" })
      },
      { id: "tabidachi_100", name: "見送り神",     desc: "旅立ち回数 100",
        flavor: "行ってらっしゃい、の言葉に“祈り”が混ざる。",
        check: () => getCount("tabidachi") >= 100,
        progress: () => ({ now: getCount("tabidachi"), target: 100, unit: "回" })
      },

      { id: "hanabi_10",  name: "一発屋",       desc: "花火回数 10",
        flavor: "夜空に、理由のない拍手が起こった。",
        check: () => getCount("hanabi") >= 10,
        progress: () => ({ now: getCount("hanabi"), target: 10, unit: "回" })
      },
      { id: "hanabi_50",  name: "夜空の演出家", desc: "花火回数 50",
        flavor: "静けさの上に、光を置く仕事。",
        check: () => getCount("hanabi") >= 50,
        progress: () => ({ now: getCount("hanabi"), target: 50, unit: "回" })
      },
      { id: "hanabi_100", name: "天上の花火師", desc: "花火回数 100",
        flavor: "星が嫉妬するほど、上手に鳴らせるようになった。",
        check: () => getCount("hanabi") >= 100,
        progress: () => ({ now: getCount("hanabi"), target: 100, unit: "回" })
      },

      { id: "slotwin_10",  name: "当たり癖",         desc: "スロット当たり回数 10",
        flavor: "たまたま、が続くと運命に見える。",
        check: () => getCount("slot_win") >= 10,
        progress: () => ({ now: getCount("slot_win"), target: 10, unit: "回" })
      },
      { id: "slotwin_50",  name: "勝ち筋が見える",   desc: "スロット当たり回数 50",
        flavor: "当たる瞬間の気配が、指先で分かる。",
        check: () => getCount("slot_win") >= 50,
        progress: () => ({ now: getCount("slot_win"), target: 50, unit: "回" })
      },
      { id: "slotwin_100", name: "スロットの申し子", desc: "スロット当たり回数 100",
        flavor: "確率が、あなたの味方をしている。",
        check: () => getCount("slot_win") >= 100,
        progress: () => ({ now: getCount("slot_win"), target: 100, unit: "回" })
      },

      { id: "omukae_10",  name: "お迎え係",   desc: "お迎え回数 10",
        flavor: "扉の向こうは、いつだって新しい物語。",
        check: () => getCount("omukae") >= 10,
        progress: () => ({ now: getCount("omukae"), target: 10, unit: "回" })
      },
      { id: "omukae_50",  name: "案内人",     desc: "お迎え回数 50",
        flavor: "迷子にならないように、灯りを持って待っていた。",
        check: () => getCount("omukae") >= 50,
        progress: () => ({ now: getCount("omukae"), target: 50, unit: "回" })
      },
      { id: "omukae_100", name: "冥府の執事", desc: "お迎え回数 100",
        flavor: "“ようこそ”は、何度言っても温かい。",
        check: () => getCount("omukae") >= 100,
        progress: () => ({ now: getCount("omukae"), target: 100, unit: "回" })
      },

      { id: "buy_10",  name: "多頭飼いデビュー", desc: "累計うさぎ購入 10",
        flavor: "気づいたら、名前を呼ぶ回数が増えていた。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 10,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 10, unit: "匹" })
      },
      { id: "buy_50",  name: "牧場主",           desc: "累計うさぎ購入 50",
        flavor: "ここはもう、“居場所”だ。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 50,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 50, unit: "匹" })
      },
      { id: "buy_100", name: "超・牧場主",       desc: "累計うさぎ購入 100",
        flavor: "牧場が、あなたの呼吸と同じ速度で生きている。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 100,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 100, unit: "匹" })
      },
    ];

    function getAchById(id) {
      return ACH_MASTER.find(a => a.id === id) || null;
    }

    function unlock(id, meta = {}) {
      if (unlocked[id]) return false;
      unlocked[id] = true;
      saveState();

      const a = getAchById(id);
      const title = `🏆 実績解除：${a?.name || meta?.name || id}`;
      const flavor = (a?.flavor || meta?.flavor || "").trim();
      toast(title, flavor);

      try { WB.emit?.("achievementUnlocked", { id, ...meta, flavor }); } catch {}
      return true;
    }

    function checkUnlocks() {
      for (const a of ACH_MASTER) {
        if (isUnlocked(a.id)) continue;
        let ok = false;
        try { ok = !!a.check?.(); } catch { ok = false; }
        if (!ok) continue;

        const newly = unlock(a.id, { name: a.name, desc: a.desc, flavor: a.flavor });
        if (newly) {
          try { a.onUnlock?.(); } catch {}
        }
      }
    }

    /* =========================
     * zukan.js 互換：zisseki.ach を提供
     * - zukan.js は z?.ach を見に行くのでここで返す
     * ========================= */
    function buildAchCompatMap() {
      const o = {};
      for (const a of ACH_MASTER) {
        o[a.id] = !!unlocked[a.id];
      }
      return o;
    }

    /* =========================
     * Public API
     * ========================= */
    WB.zisseki = {
      // storage
      LS_ZISSEKI,
      unlocked,
      stats,

      // zukan互換（ここが重要）
      // zukan.js: const ach = z?.ach ... を満たす
      get ach() { return buildAchCompatMap(); },

      // core
      ACH_MASTER,
      UNLOCK_BUNNY4_NEED,
      isUnlocked,
      unlock,
      checkUnlocks,

      // counts
      getCount,
      setCount,
      addCount,

      // internal
      _parseSyPayload: parseSyPayload,
    };

    // 初回判定
    checkUnlocks();

    // 定期判定（コイン/同時うさぎ数など）
    const TIMER_MS = 900;
    const timer = setInterval(() => {
      checkUnlocks();
    }, TIMER_MS);

    WB.zisseki.stop = () => { try { clearInterval(timer); } catch {} };

    console.log("[zisseki] ready (for zukan tab)", {
      unlocked: Object.keys(unlocked).length,
      stats: { ...stats },
    });
  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
