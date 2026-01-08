// zisseki.js（実績システム：✅WB待機 + ✅実績UI + ✅sy:add対応 + ✅花火/旅立ち/スロット等カウント確実版）
// - localStorage 永続化（解除フラグ + 進捗カウント）
// - ✅ WB.emit("sy:add",{key,n}) を拾って「花火/旅立ち/スロット当たり/お迎え/うんち」を確実に加算
// - ✅ SYOUGOU.getCount が無い実装でも動く（sy:add を主軸にする）
// - ✅ WB events が無くても、定期チェックで解除できる
// - ✅ HUDに「実績」ボタン、一覧モーダル、解除/未解除、進捗表示
//
// 重要：あなたの hanabi.js は「成功時に WB.emit('sy:add') を必ず投げる」ようにすると最強です。
//       （app.js は WB.syAdd を持ってるので、他モジュールも同じ経路で統一できます）

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

  /* =========================
   * Helpers
   * ========================= */
  const $ = (q, p = document) => p.querySelector(q);

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function nowMs() {
    return Date.now();
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then((WB) => {
    /* =========================
     * Storage keys
     * ========================= */
    const LS_ACH = "wb_ach_v5";           // { id:true }
    const LS_SYCNT = "wb_sy_count_v1";    // { key:number }  ← sy:add で積む「確実カウント」

    // 既存仕様：同時うさぎ数でショップ解放
    const UNLOCK_BUNNY4_NEED = 10;

    /* =========================
     * Storage
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

    const ach = loadJson(LS_ACH, {});
    const syCount = loadJson(LS_SYCNT, {});

    function saveAch() { saveJson(LS_ACH, ach); }
    function saveSy()  { saveJson(LS_SYCNT, syCount); }

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
      refreshUI();
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
     * Getters（新旧互換）
     * ========================= */
    function getCoins() {
      try {
        if (typeof WB.getCoin === "function") {
          return safeNum(WB.getCoin());
        }
      } catch {}
      try {
        if (typeof WB.coins === "number") return WB.coins;
      } catch {}
      const el = $("#coinValue");
      return el ? safeNum(el.textContent) : 0;
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

    // ✅ SYOUGOU の count を「取れたら」読む（取れなくてもOK）
    function readSyougouFromObj(key) {
      const S = window.SYOUGOU;
      if (!S) return null;

      // 1) getCount
      try {
        if (typeof S.getCount === "function") {
          const v = S.getCount(key);
          return Number.isFinite(Number(v)) ? Number(v) : null;
        }
      } catch {}

      // 2) count / counts / data / map っぽい場所から読む
      const candidates = [
        S.counts,
        S.count,
        S.data,
        S.map,
        S.store,
        S.state,
      ];

      for (const obj of candidates) {
        try {
          if (obj && typeof obj === "object" && key in obj) {
            const v = obj[key];
            if (Number.isFinite(Number(v))) return Number(v);
          }
        } catch {}
      }

      // 3) items配列っぽい構造（{key, count}）
      try {
        const arr = S.items || S.list || S.achievements;
        if (Array.isArray(arr)) {
          const hit = arr.find(x => x && (x.key === key || x.id === key || x.name === key));
          if (hit && Number.isFinite(Number(hit.count))) return Number(hit.count);
        }
      } catch {}

      return null;
    }

    // ✅ 実績用「称号系カウント」：sy:addの確実カウント + SYOUGOU実値（取れたら最大を採用）
    function getSyougouCount(key) {
      const k = String(key);
      const fromSy = Number(syCount?.[k] || 0) || 0;

      const fromS = readSyougouFromObj(k);
      if (fromS == null) return fromSy;

      return Math.max(fromSy, Number(fromS) || 0);
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
     * ✅ sy:add を確実にカウントする
     * ========================= */
    function incSy(key, n = 1) {
      const k = String(key);
      const add = Math.max(0, Math.floor(Number(n) || 0));
      if (!add) return;
      syCount[k] = (Number(syCount[k]) || 0) + add;
      saveSy();
      // UI更新 & 実績チェック
      checkUnlocks();
      refreshUI();
    }

    // WB の sy:add
    try {
      WB.on?.("sy:add", (p) => {
        const key = p?.key;
        const n = p?.n ?? 1;
        if (!key) return;
        incSy(key, n);
      });
    } catch {}

    // hanabi.js が投げるカスタムイベントも拾う（保険）
    try {
      window.addEventListener("wb:hanabi", () => incSy("hanabi", 1));
    } catch {}

    // 他モジュールが投げがちなイベント名も拾って足す（保険）
    // ※「正の加算」しかしないので二重に増える可能性はあるが、
    //   その場合でも getSyougouCount は max を取るので破綻しにくい。
    try { WB.on?.("hanabiFired", () => incSy("hanabi", 1)); } catch {}
    try { WB.on?.("tabidachi",  () => incSy("tabidachi", 1)); } catch {}
    try { WB.on?.("slotWin",    () => incSy("slot_win", 1)); } catch {}
    try { WB.on?.("omukae",     () => incSy("omukae", 1)); } catch {}
    try { WB.on?.("goldenUnchiCollected", () => incSy("unchi", 1)); } catch {} // 実装により key が違う場合あり

    /* =========================
     * Achievements master
     * ========================= */
    const ACH_MASTER = [
      {
        id: "unlock_bunny4",
        name: "大家族のはじまり",
        desc: `同時うさぎ数が${UNLOCK_BUNNY4_NEED}匹に到達（bunny4/bunny5解放）`,
        check: () => (getBunnyCount() >= UNLOCK_BUNNY4_NEED),
        progress: () => ({ now: getBunnyCount(), target: UNLOCK_BUNNY4_NEED, unit: "匹" }),
        onUnlock: () => {
          toast("🐰✨ bunny4 / bunny5 がショップに出現しました！");
          try { WB.emit?.("unlockShop", { id: "unlock_bunny4" }); } catch {}
        },
      },

      { id: "coins_10k",  name: "小金持ち",   desc: "所持コイン 10,000 到達",    check: () => getCoins() >= 10_000,  progress: () => ({ now: getCoins(), target: 10_000, unit: "🪙" }) },
      { id: "coins_100k", name: "資産家",     desc: "所持コイン 100,000 到達",   check: () => getCoins() >= 100_000, progress: () => ({ now: getCoins(), target: 100_000, unit: "🪙" }) },
      { id: "coins_1m",   name: "伝説の富豪", desc: "所持コイン 1,000,000 到達", check: () => getCoins() >= 1_000_000, progress: () => ({ now: getCoins(), target: 1_000_000, unit: "🪙" }) },

      { id: "unchi_10",   name: "ウンチ道・初段",   desc: "ウンチ回数 10",   check: () => getSyougouCount("unchi") >= 10,   progress: () => ({ now: getSyougouCount("unchi"), target: 10, unit: "回" }) },
      { id: "unchi_50",   name: "ウンチ道・五段",   desc: "ウンチ回数 50",   check: () => getSyougouCount("unchi") >= 50,   progress: () => ({ now: getSyougouCount("unchi"), target: 50, unit: "回" }) },
      { id: "unchi_100",  name: "ウンチ道・皆伝",   desc: "ウンチ回数 100",  check: () => getSyougouCount("unchi") >= 100,  progress: () => ({ now: getSyougouCount("unchi"), target: 100, unit: "回" }) },

      { id: "tabidachi_10",  name: "見送り見習い", desc: "旅立ち回数 10",  check: () => getSyougouCount("tabidachi") >= 10,  progress: () => ({ now: getSyougouCount("tabidachi"), target: 10, unit: "回" }) },
      { id: "tabidachi_50",  name: "見送り職人",   desc: "旅立ち回数 50",  check: () => getSyougouCount("tabidachi") >= 50,  progress: () => ({ now: getSyougouCount("tabidachi"), target: 50, unit: "回" }) },
      { id: "tabidachi_100", name: "見送り神",     desc: "旅立ち回数 100", check: () => getSyougouCount("tabidachi") >= 100, progress: () => ({ now: getSyougouCount("tabidachi"), target: 100, unit: "回" }) },

      { id: "hanabi_10",   name: "一発屋",         desc: "花火回数 10",   check: () => getSyougouCount("hanabi") >= 10,   progress: () => ({ now: getSyougouCount("hanabi"), target: 10, unit: "回" }) },
      { id: "hanabi_50",   name: "夜空の演出家",   desc: "花火回数 50",   check: () => getSyougouCount("hanabi") >= 50,   progress: () => ({ now: getSyougouCount("hanabi"), target: 50, unit: "回" }) },
      { id: "hanabi_100",  name: "天上の花火師",   desc: "花火回数 100",  check: () => getSyougouCount("hanabi") >= 100,  progress: () => ({ now: getSyougouCount("hanabi"), target: 100, unit: "回" }) },

      { id: "slotwin_10",  name: "当たり癖",         desc: "スロット当たり回数 10",  check: () => getSyougouCount("slot_win") >= 10,  progress: () => ({ now: getSyougouCount("slot_win"), target: 10, unit: "回" }) },
      { id: "slotwin_50",  name: "勝ち筋が見える",   desc: "スロット当たり回数 50",  check: () => getSyougouCount("slot_win") >= 50,  progress: () => ({ now: getSyougouCount("slot_win"), target: 50, unit: "回" }) },
      { id: "slotwin_100", name: "スロットの申し子", desc: "スロット当たり回数 100", check: () => getSyougouCount("slot_win") >= 100, progress: () => ({ now: getSyougouCount("slot_win"), target: 100, unit: "回" }) },

      { id: "omukae_10",   name: "お迎え係",   desc: "お迎え回数 10",   check: () => getSyougouCount("omukae") >= 10,   progress: () => ({ now: getSyougouCount("omukae"), target: 10, unit: "回" }) },
      { id: "omukae_50",   name: "案内人",     desc: "お迎え回数 50",   check: () => getSyougouCount("omukae") >= 50,   progress: () => ({ now: getSyougouCount("omukae"), target: 50, unit: "回" }) },
      { id: "omukae_100",  name: "冥府の執事", desc: "お迎え回数 100",  check: () => getSyougouCount("omukae") >= 100,  progress: () => ({ now: getSyougouCount("omukae"), target: 100, unit: "回" }) },

      { id: "buy_10",  name: "多頭飼いデビュー", desc: "累計うさぎ購入 10",  check: () => getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]) >= 10,  progress: () => ({ now: getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]), target: 10, unit: "匹" }) },
      { id: "buy_50",  name: "牧場主",           desc: "累計うさぎ購入 50",  check: () => getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]) >= 50,  progress: () => ({ now: getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]), target: 50, unit: "匹" }) },
      { id: "buy_100", name: "超・牧場主",       desc: "累計うさぎ購入 100", check: () => getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]) >= 100, progress: () => ({ now: getStatMaybe(["totalBunnyBought","bunnyBought","boughtBunnies"]), target: 100, unit: "匹" }) },
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
     * ✅ Achievements UI
     * ========================= */
    const PANEL_ID = "wbAchPanelV1";
    const BTN_ID   = "wbAchBtnV1";

    let uiEl = null;

    function ensureUiStyle() {
      if (document.getElementById("wbAchUiStyleV1")) return;
      const s = document.createElement("style");
      s.id = "wbAchUiStyleV1";
      s.textContent = `
#${PANEL_ID}{
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: none;
  user-select: none;
}
#${PANEL_ID} .bg{
  position:absolute; inset:0;
  background: rgba(0,0,0,.38);
}
#${PANEL_ID} .card{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%, -50%);
  width: min(760px, 94vw);
  max-height: min(82vh, 820px);
  overflow: hidden;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,.24);
  display:flex;
  flex-direction: column;
}
#${PANEL_ID} .head{
  display:flex; align-items:center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(0,0,0,.08);
}
#${PANEL_ID} .title{
  font-weight: 1000;
  letter-spacing: .02em;
}
#${PANEL_ID} .close{
  border:none; background: rgba(0,0,0,.06);
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 900;
  cursor:pointer;
}
#${PANEL_ID} .body{
  padding: 12px 14px;
  overflow:auto;
}
#${PANEL_ID} .toolbar{
  display:flex; gap:8px; flex-wrap:wrap;
  align-items:center; justify-content: space-between;
  margin-bottom: 10px;
}
#${PANEL_ID} .pill{
  display:inline-flex; align-items:center; gap:8px;
  background: rgba(0,0,0,.04);
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 900;
}
#${PANEL_ID} .btn{
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
}
#${PANEL_ID} .btn.primary{ background:#ffd6e7; }
#${PANEL_ID} .btn.ghost{ background: rgba(0,0,0,.04); box-shadow:none; }
#${PANEL_ID} .grid{
  display:grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
#${PANEL_ID} .item{
  background: rgba(255,255,255,.92);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap: 10px;
}
#${PANEL_ID} .item.locked{ opacity:.72; }
#${PANEL_ID} .name{ font-weight: 1000; }
#${PANEL_ID} .desc{ font-size: 12px; opacity:.78; font-weight: 800; margin-top:4px; }
#${PANEL_ID} .meta{ font-size: 12px; opacity:.75; font-weight: 900; margin-top:6px; }
#${PANEL_ID} .badge{
  display:inline-flex; align-items:center; gap:6px;
  border-radius: 999px;
  padding: 6px 10px;
  font-weight: 900;
  font-size: 12px;
  background: rgba(255, 120, 120, .18);
}
#${PANEL_ID} .badge.on{ background: rgba(120, 210, 255, .22); }
#${PANEL_ID} .bar{
  height: 10px;
  border-radius: 999px;
  background: rgba(0,0,0,.08);
  overflow:hidden;
  margin-top: 8px;
}
#${PANEL_ID} .bar > i{
  display:block;
  height:100%;
  width:0%;
  background: rgba(120,210,255,.55);
}
#${PANEL_ID} .small{
  font-size: 12px;
  opacity: .8;
  font-weight: 900;
}
#${BTN_ID}{
  margin-left: 8px;
}
`;
      document.head.appendChild(s);
    }

    function buildUI() {
      ensureUiStyle();
      if (uiEl && document.body.contains(uiEl)) return uiEl;

      uiEl = document.createElement("div");
      uiEl.id = PANEL_ID;
      uiEl.innerHTML = `
        <div class="bg"></div>
        <div class="card" role="dialog" aria-modal="true">
          <div class="head">
            <div class="title">🏆 実績</div>
            <button class="close" type="button">閉じる</button>
          </div>
          <div class="body"></div>
        </div>
      `;
      document.body.appendChild(uiEl);

      uiEl.querySelector(".bg")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
      uiEl.querySelector(".close")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
      uiEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

      return uiEl;
    }

    function esc(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    let uiFilter = "all"; // all | unlocked | locked

    function renderUI() {
      const p = buildUI();
      const body = p.querySelector(".body");
      if (!body) return;

      const total = ACH_MASTER.length;
      const unlockedCount = ACH_MASTER.filter(a => isUnlocked(a.id)).length;

      const coins = getCoins();
      const bunny = getBunnyCount();

      const pills = `
        <div class="pill">解除：<b>${unlockedCount}</b> / ${total}</div>
        <div class="pill">🪙 <b>${coins.toLocaleString()}</b></div>
        <div class="pill">🐰 <b>${bunny}</b></div>
        <div class="pill">💩 <b>${getSyougouCount("unchi")}</b></div>
        <div class="pill">🕊️ <b>${getSyougouCount("tabidachi")}</b></div>
        <div class="pill">🎆 <b>${getSyougouCount("hanabi")}</b></div>
        <div class="pill">🎰 <b>${getSyougouCount("slot_win")}</b></div>
        <div class="pill">🚪 <b>${getSyougouCount("omukae")}</b></div>
      `;

      const buttons = `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn ghost" type="button" data-filter="all">全部</button>
          <button class="btn ghost" type="button" data-filter="unlocked">解除済み</button>
          <button class="btn ghost" type="button" data-filter="locked">未解除</button>
          <button class="btn primary" type="button" data-refresh="1">更新</button>
        </div>
      `;

      const list = ACH_MASTER
        .filter(a => {
          if (uiFilter === "unlocked") return isUnlocked(a.id);
          if (uiFilter === "locked") return !isUnlocked(a.id);
          return true;
        })
        .map(a => {
          const on = isUnlocked(a.id);
          let prog = null;
          try { prog = a.progress?.(); } catch { prog = null; }

          let now = 0, target = 0, unit = "";
          if (prog && Number.isFinite(Number(prog.now)) && Number.isFinite(Number(prog.target)) && Number(prog.target) > 0) {
            now = Number(prog.now);
            target = Number(prog.target);
            unit = String(prog.unit || "");
          }
          const pct = (target > 0) ? clamp((now / target) * 100, 0, 100) : (on ? 100 : 0);

          const right = on
            ? `<span class="badge on">解除済</span>`
            : `<span class="badge">未解除</span>`;

          const barHtml = (target > 0)
            ? `
              <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
              <div class="meta">${esc(now.toLocaleString())}${esc(unit)} / ${esc(target.toLocaleString())}${esc(unit)}（${pct.toFixed(1)}%）</div>
            `
            : `<div class="meta">進捗：—</div>`;

          return `
            <div class="item ${on ? "" : "locked"}">
              <div style="flex:1; min-width: 0;">
                <div class="name">${on ? "✅" : "⬜"} ${esc(a.name)} <span class="small">(${esc(a.id)})</span></div>
                <div class="desc">${esc(a.desc || "")}</div>
                ${barHtml}
              </div>
              <div>${right}</div>
            </div>
          `;
        })
        .join("");

      body.innerHTML = `
        <div class="toolbar">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">${pills}</div>
          ${buttons}
        </div>
        <div class="grid">${list || "<div class='pill'>表示する実績がありません</div>"}</div>
      `;

      body.querySelectorAll("[data-filter]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          uiFilter = btn.getAttribute("data-filter") || "all";
          renderUI();
        });
      });
      body.querySelectorAll("[data-refresh]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          checkUnlocks();
          renderUI();
        });
      });
    }

    function openPanel() {
      const p = buildUI();
      checkUnlocks();
      renderUI();
      p.style.display = "block";
    }
    function closePanel() {
      const p = uiEl || document.getElementById(PANEL_ID);
      if (!p) return;
      p.style.display = "none";
    }
    function refreshUI() {
      if (uiEl && uiEl.style.display !== "none") renderUI();
    }

    function injectHudButton() {
      const hud = document.getElementById("hud");
      if (!hud) return;
      if (document.getElementById(BTN_ID)) return;

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "実績";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });

      // HUDの右寄せ等を壊さないよう、あれば hudButtons に寄せる
      const mount = document.getElementById("hudButtons") || hud;
      mount.appendChild(btn);
    }

    /* =========================
     * Hooks（WB側イベント）
     * ========================= */
    try { WB.on?.("bunnyCountChanged", checkUnlocks); } catch {}
    try { WB.on?.("hudUpdated", checkUnlocks); } catch {}
    try { WB.on?.("coinsChanged", checkUnlocks); } catch {}
    try { WB.on?.("coinChanged", checkUnlocks); } catch {}

    try {
      WB.on?.("resetRequested", () => {
        try { localStorage.removeItem(LS_ACH); } catch {}
        try { localStorage.removeItem(LS_SYCNT); } catch {}
      });
    } catch {}

    // eventsが無くても解除できるように「定期チェック」
    const TIMER_MS = 900;
    const timer = setInterval(() => {
      checkUnlocks();
      refreshUI();
    }, TIMER_MS);

    // HUDにボタン
    window.addEventListener("load", () => {
      injectHudButton();
      setTimeout(injectHudButton, 400);
      setTimeout(injectHudButton, 1200);
    });

    /* =========================
     * External API
     * ========================= */
    WB.zisseki = {
      ach,
      syCount,
      isUnlocked,
      unlock,
      checkUnlocks,
      LS_ACH,
      LS_SYCNT,
      UNLOCK_BUNNY4_NEED,
      ACH_MASTER,
      openPanel,
      closePanel,
      stop: () => { try { clearInterval(timer); } catch {} },
      // 手動加算したい時用
      incSy: (key, n = 1) => incSy(key, n),
      getSyougouCount: (key) => getSyougouCount(key),
    };

    // 初回
    checkUnlocks();
    injectHudButton();

    console.log("[zisseki] ready", {
      unlocked: Object.keys(ach).length,
      syCount: { ...syCount }
    });
  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
