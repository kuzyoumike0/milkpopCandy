// zisseki.js（✅実績：zisseki.js単体でカウント完結 + ✅図鑑タブ互換(ach提供) + ✅WB待機 + ✅トースト）
// - localStorage 永続化（実績専用LSのみ）
// - 回数系（うんち/お迎え/旅立ち/花火/スロット当たり/✅黄金つつき）も zisseki.js 自前statsで保持
// - WB events が無くても、WB.emit を安全にフックして拾う（最終保険）
// - sy:add が来たら payload を解析して自動で stats に加算
// - 図鑑(zukan.js)の renderAchievements が参照するために WB.zisseki.ach を提供（互換）
//
// ✅ 追加: omukae.js / slot.js 由来のイベント名も幅広く拾う（slotResult/slot:win/omukaeDone 等）
// ✅ 追加: 黄金うんち「つつき」回数 stats.ougon_poke + 実績 + 称号
//
// 使い方（他モジュールから加算したい場合）
//   WB.emit("sy:add", { key:"unchi", delta:1 })
//   WB.emit("sy:add", { key:"ougon_poke", delta:1 })
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
     * Storage（unlocked + stats + ✅titles）
     * ========================= */
    const LS_ZISSEKI = "wb_zisseki_v6"; // { ver:6, unlocked:{}, stats:{}, ✅titles:{ current, unlocked:{} } }
    const UNLOCK_BUNNY4_NEED = 10;

    // ✅ 黄金うんち：removed を “つつき扱い” に加算するか（不要なら 0）
    const OUGON_REMOVED_AS_POKE = 1;

    // ✅ 称号（黄金つつき）
    const OUGON_TITLES = [
      { id: "og_none",  name: "（なし）",         need: 0,   desc: "称号なし" },
      { id: "og_poke1", name: "つつき見習い",     need: 3,   desc: "黄金うんちをつつき始めた。" },
      { id: "og_poke2", name: "黄金つつき職人",   need: 10,  desc: "手つきが“慣れている”。" },
      { id: "og_poke3", name: "金運の手",         need: 25,  desc: "つつくたびに運が上がる（気がする）。" },
      { id: "og_poke4", name: "黄金うんちの親友", need: 50,  desc: "もはや会話できる。" },
      { id: "og_poke5", name: "伝説のつつき王",   need: 100, desc: "つつきの頂点。" },
    ];

    function loadState() {
      // 新形式
      try {
        const raw = JSON.parse(localStorage.getItem(LS_ZISSEKI) || "null");
        if (raw && typeof raw === "object") {
          // 旧形式（平坦object：{achId:true,...}）
          if (raw.unlocked && typeof raw.unlocked === "object") {
            const titlesRaw = raw.titles && typeof raw.titles === "object" ? raw.titles : null;
            return {
              ver: Number(raw.ver || 6) || 6,
              unlocked: raw.unlocked && typeof raw.unlocked === "object" ? raw.unlocked : {},
              stats: raw.stats && typeof raw.stats === "object" ? raw.stats : {},
              titles: titlesRaw ? {
                current: typeof titlesRaw.current === "string" ? titlesRaw.current : "og_none",
                unlocked: titlesRaw.unlocked && typeof titlesRaw.unlocked === "object" ? titlesRaw.unlocked : {},
              } : { current: "og_none", unlocked: {} },
            };
          }
          // raw が unlocked map だけの旧保存
          if (raw && typeof raw === "object") {
            return { ver: 6, unlocked: raw, stats: {}, titles: { current: "og_none", unlocked: {} } };
          }
        }
      } catch {}

      // さらに古いキー救済（あなたが以前使ってた）
      try {
        const legacy = JSON.parse(localStorage.getItem("wb_ach_v5") || "null");
        if (legacy && typeof legacy === "object") {
          return { ver: 6, unlocked: legacy, stats: {}, titles: { current: "og_none", unlocked: {} } };
        }
      } catch {}

      return { ver: 6, unlocked: {}, stats: {}, titles: { current: "og_none", unlocked: {} } };
    }

    const state = loadState();
    const unlocked = state.unlocked || {};
    const stats = state.stats || {};
    const titlesState = state.titles || { current: "og_none", unlocked: {} };
    const titlesUnlocked = titlesState.unlocked || {};
    let currentTitle = typeof titlesState.current === "string" ? titlesState.current : "og_none";

    function saveState() {
      localStorage.setItem(LS_ZISSEKI, JSON.stringify({
        ver: 6,
        unlocked,
        stats,
        titles: {
          current: currentTitle,
          unlocked: titlesUnlocked,
        },
      }));
    }

    function isUnlocked(id) {
      return !!unlocked[id];
    }

    /* =========================
     * Stats（zisseki.js完結カウンタ）
     * ========================= */
    const STAT_KEYS = ["unchi", "omukae", "tabidachi", "hanabi", "slot_win", "ougon_poke"];

    function normKey(k) {
      const s = String(k ?? "").trim().toLowerCase();
      if (!s) return "";
      if (s === "tabidati") return "tabidachi";
      if (s === "slotwin") return "slot_win";
      if (s === "slot") return "slot_win";
      if (s === "slot:win") return "slot_win";
      if (s === "fireworks") return "hanabi";
      if (s === "fw") return "hanabi";
      if (s === "ougonpoke") return "ougon_poke";
      if (s === "ougon_poke") return "ougon_poke";
      if (s === "goldpoke") return "ougon_poke";
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
    // ✅ titles 側も初期化
    if (!("og_none" in titlesUnlocked)) titlesUnlocked["og_none"] = true;
    if (!currentTitle) currentTitle = "og_none";
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
    function isSlotWinPayload(p) {
      try {
        if (!p || typeof p !== "object") return true;
        if (p.win === false || p.isWin === false || p.hit === false) return false;
        if (typeof p.result === "string") {
          const r = p.result.toLowerCase();
          if (r.includes("lose") || r.includes("miss") || r.includes("fail")) return false;
          if (r.includes("win") || r.includes("hit") || r.includes("jackpot")) return true;
        }
        if (p.win === true || p.isWin === true || p.hit === true || p.jackpot === true) return true;
      } catch {}
      return true;
    }

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
          normKey(payload.event) ||
          normKey(payload.kind);

        if (k === "slot_win") {
          if (!isSlotWinPayload(payload)) return { key: "slot_win", delta: 0 };
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
      // ✅ 称号もチェック
      try { checkTitleUnlocks(); } catch {}
    }

    function onSyAdd(payload) {
      const p = parseSyPayload(payload);
      if (p.key && p.delta > 0) {
        addCount(p.key, p.delta);
        return;
      }
      onSyAddLight();
    }

    try { WB.on?.("sy:add", onSyAdd); } catch {}

    // イベント拾い（payload無でもOK）
    function bindCountEvent(evtName, key, opt = {}) {
      try {
        WB.on?.(evtName, (payload) => {
          const p = parseSyPayload(payload);

          const forced = opt?.forceKey ? normKey(opt.forceKey) : "";
          if (forced) {
            if (forced === "slot_win") {
              if (!isSlotWinPayload(payload)) { onSyAddLight(); return; }
            }
            addCount(forced, opt?.delta ?? 1);
            return;
          }

          if (p.key) {
            if (p.delta > 0) addCount(p.key, p.delta);
            else onSyAddLight();
          } else {
            addCount(key, 1);
          }
        });
      } catch {}
    }

    // 基本
    bindCountEvent("unchi", "unchi");
    bindCountEvent("omukae", "omukae");
    bindCountEvent("tabidachi", "tabidachi");
    bindCountEvent("tabidati", "tabidachi");
    bindCountEvent("hanabiFired", "hanabi");
    bindCountEvent("hanabi", "hanabi");
    bindCountEvent("fireworks", "hanabi");

    // ✅ omukae.js 追加拾い（想定別名）
    bindCountEvent("omukaeDone", "omukae");
    bindCountEvent("omukae:done", "omukae");
    bindCountEvent("omukaeComplete", "omukae");
    bindCountEvent("adopt", "omukae");
    bindCountEvent("adopted", "omukae");
    bindCountEvent("bunnyBought", "omukae");
    bindCountEvent("buyBunny", "omukae");

    // ✅ slot.js 追加拾い（勝ちだけ加算）
    bindCountEvent("slotWin", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slotwin", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slot:win", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slotResult", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slot:result", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slotFinished", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slot:finished", "slot_win", { forceKey: "slot_win" });
    bindCountEvent("slotPayout", "slot_win", { forceKey: "slot_win" });

    // ✅ 黄金うんち：つつき/削除
    bindCountEvent("ougonunchi:poke", "ougon_poke");
    bindCountEvent("ougonunchi:removed", "ougon_poke", { forceKey: "ougon_poke", delta: OUGON_REMOVED_AS_POKE });

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

            // unchi/tabi/hanabi
            if (ev === "unchi") addCount("unchi", 1);
            if (ev === "tabidachi" || ev === "tabidati") addCount("tabidachi", 1);
            if (ev === "hanabiFired" || ev === "hanabi" || ev === "fireworks" || ev === "fw") addCount("hanabi", 1);

            // omukae別名
            if (ev === "omukae" || ev === "omukaeDone" || ev === "omukae:done" || ev === "omukaeComplete"
             || ev === "adopt" || ev === "adopted" || ev === "bunnyBought" || ev === "buyBunny") {
              addCount("omukae", 1);
            }

            // slot別名（勝ちだけ）
            if (ev === "slotWin" || ev === "slotwin" || ev === "slot:win"
             || ev === "slotResult" || ev === "slot:result"
             || ev === "slotFinished" || ev === "slot:finished"
             || ev === "slotPayout") {
              if (isSlotWinPayload(payload)) addCount("slot_win", 1);
            }

            // ✅ 黄金うんち
            if (ev === "ougonunchi:poke") addCount("ougon_poke", 1);
            if (ev === "ougonunchi:removed") {
              if (OUGON_REMOVED_AS_POKE > 0) addCount("ougon_poke", OUGON_REMOVED_AS_POKE);
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
     * ✅ Titles（黄金つつき称号）
     * ========================= */
    function getTitleById(id) {
      return OUGON_TITLES.find(t => t.id === id) || OUGON_TITLES[0];
    }

    function bestTitleIdByCount(count) {
      let best = OUGON_TITLES[0];
      for (const t of OUGON_TITLES) {
        if (count >= t.need && t.need >= best.need) best = t;
      }
      return best.id;
    }

    function isTitleUnlocked(id) {
      return !!titlesUnlocked[String(id || "")];
    }

    function unlockTitle(id) {
      id = String(id || "");
      if (!id) return false;
      if (titlesUnlocked[id]) return false;
      titlesUnlocked[id] = true;
      saveState();

      const t = getTitleById(id);
      if (t.id !== "og_none") toast(`🏷️ 称号「${t.name}」解放！`, t.desc);

      try { WB.emit?.("titleUnlocked", { id: t.id, name: t.name, desc: t.desc, type: "ougon_poke" }); } catch {}
      return true;
    }

    function checkTitleUnlocks() {
      const c = getCount("ougon_poke");
      for (const t of OUGON_TITLES) {
        if (c >= t.need) unlockTitle(t.id);
      }

      // “おすすめ”だけ通知（自動で付け替えはしない）
      const bestId = bestTitleIdByCount(c);
      const best = getTitleById(bestId);
      const cur = getTitleById(currentTitle);
      if (best && cur && best.need > cur.need) {
        // spam防止：実績チェックタイミングで一度だけ出るように unlocked を鍵にする
        const hintKey = `hint_best_${bestId}`;
        if (!titlesUnlocked[hintKey]) {
          titlesUnlocked[hintKey] = true;
          saveState();
          toast(`⭐ 新しい称号が使えます：「${best.name}」`);
        }
      }
    }

    function setTitle(id) {
      id = String(id || "og_none");
      if (id !== "og_none" && !isTitleUnlocked(id)) {
        toast("その称号はまだ解放されてない…！");
        return false;
      }
      currentTitle = id;
      saveState();

      const t = getTitleById(id);
      toast(`🏷️ 称号を「${t.name}」にした`);

      // 他UI連携用
      try { WB.emit?.("titleChanged", { id: t.id, name: t.name }); } catch {}

      // app.js 側のタイトルLSがある場合だけ軽く同期（壊さない）
      try {
        const key = WB?.LS?.title;
        if (key) localStorage.setItem(key, t.name);
      } catch {}

      return true;
    }

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

      // ✅ 黄金つつき：実績（ここが追加）
      { id: "ougon_poke_1",  name: "金色はじめて",     desc: "黄金うんちをつつく 1回",
        flavor: "指先が、ちょっとだけ金運になった気がする。",
        check: () => getCount("ougon_poke") >= 1,
        progress: () => ({ now: getCount("ougon_poke"), target: 1, unit: "回" })
      },
      { id: "ougon_poke_5",  name: "つつきの才能",     desc: "黄金うんちをつつく 5回",
        flavor: "“音”が変わった。たぶん気のせいじゃない。",
        check: () => getCount("ougon_poke") >= 5,
        progress: () => ({ now: getCount("ougon_poke"), target: 5, unit: "回" })
      },
      { id: "ougon_poke_15", name: "黄金の音がする",   desc: "黄金うんちをつつく 15回",
        flavor: "カツン…って、世界がご褒美をくれる音。",
        check: () => getCount("ougon_poke") >= 15,
        progress: () => ({ now: getCount("ougon_poke"), target: 15, unit: "回" })
      },
      { id: "ougon_poke_30", name: "金運よ来い",       desc: "黄金うんちをつつく 30回",
        flavor: "祈りじゃなくて、習慣になった。",
        check: () => getCount("ougon_poke") >= 30,
        progress: () => ({ now: getCount("ougon_poke"), target: 30, unit: "回" })
      },
      { id: "ougon_poke_60", name: "黄金うんち研究家", desc: "黄金うんちをつつく 60回",
        flavor: "これは…神秘…いや…うんち…？",
        check: () => getCount("ougon_poke") >= 60,
        progress: () => ({ now: getCount("ougon_poke"), target: 60, unit: "回" })
      },
      { id: "ougon_poke_120", name: "神域のつつき",    desc: "黄金うんちをつつく 120回",
        flavor: "王冠は、指先に宿る。",
        check: () => getCount("ougon_poke") >= 120,
        progress: () => ({ now: getCount("ougon_poke"), target: 120, unit: "回" })
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
      // ✅ 実績チェックのついでに称号も
      checkTitleUnlocks();
    }

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
      LS_ZISSEKI,
      unlocked,
      stats,
      get ach() { return buildAchCompatMap(); },

      ACH_MASTER,
      UNLOCK_BUNNY4_NEED,
      isUnlocked,
      unlock,
      checkUnlocks,

      getCount,
      setCount,
      addCount,

      // ✅ 黄金称号API（ここが追加）
      titles: {
        list: OUGON_TITLES,
        get current() { return currentTitle; },
        get currentName() { return getTitleById(currentTitle).name; },
        unlocked: titlesUnlocked,
        isUnlocked: (id) => isTitleUnlocked(id),
        set: (id) => setTitle(id),
        check: () => checkTitleUnlocks(),
      },

      _parseSyPayload: parseSyPayload,
    };

    // 初回判定
    checkUnlocks();

    const TIMER_MS = 900;
    const timer = setInterval(() => {
      checkUnlocks();
    }, TIMER_MS);

    WB.zisseki.stop = () => { try { clearInterval(timer); } catch {} };

    console.log("[zisseki] ready (omukae/slot/ougon_poke + titles)", {
      unlocked: Object.keys(unlocked).length,
      stats: { ...stats },
      title: getTitleById(currentTitle).name,
    });
  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
