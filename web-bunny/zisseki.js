// zisseki.js（実績システム：互換強化 / ✅WB待機版 + ✅実績UI）V4.2
// ✅ FIX：SYOUGOUが無い/取れない環境でも解除できるように、WB.emit("sy:add") を拾って自前でカウント永続化
// ✅ FIX：WBが object になった瞬間では早すぎる問題 → “実用状態”まで待つ
// ✅ debug: WB.zisseki.debug=true で tick の値を出す

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
     * ✅ SYOUGOU互換カウント（ここが本体）
     * - SYOUGOUが無くても WB.emit("sy:add") で必ず増える
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

    // ① WBイベント「sy:add」を拾う（あなたの app.js が emit してる）
    try {
      WB.on?.("sy:add", (p) => {
        const key = p?.key;
        const n = p?.n ?? 1;
        syInc(key, n);
      });
    } catch {}

    // ② 念のため WB.syAdd をラップ（他JSが emit しない実装でも拾える）
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

      // B) よくある保持場所
      try {
        const S = window.SYOUGOU;
        const candidates = [
          S?.counts?.[k],
          S?.data?.counts?.[k],
          S?.data?.[k],
          S?.state?.counts?.[k],
          S?.state?.[k],
        ];
        for (const v of candidates) {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
      } catch {}

      // C) ✅ 自前カウント（確実）
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
      try {
        const layer = document.getElementById("bunnyLayer");
        if (layer) return layer.querySelectorAll("img").length || 0;
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
      { id: "coins_100k", name: "資産家",     desc: "所持コイン 100,000 到達",   check: () => getCoins() >= 100_000, progress: () => ({ now: getCoins(), target: 100_000, unit: "🪙" }) },
      { id: "coins_1m",   name: "伝説の富豪", desc: "所持コイン 1,000,000 到達", check: () => getCoins() >= 1_000_000, progress: () => ({ now: getCoins(), target: 1_000_000, unit: "🪙" }) },

      { id: "unchi_10",  name: "ウンチ道・初段", desc: "ウンチ回数 10",  check: () => getSyougouCount("unchi") >= 10,  progress: () => ({ now: getSyougouCount("unchi"), target: 10, unit: "回" }) },
      { id: "unchi_50",  name: "ウンチ道・五段", desc: "ウンチ回数 50",  check: () => getSyougouCount("unchi") >= 50,  progress: () => ({ now: getSyougouCount("unchi"), target: 50, unit: "回" }) },
      { id: "unchi_100", name: "ウンチ道・皆伝", desc: "ウンチ回数 100", check: () => getSyougouCount("unchi") >= 100, progress: () => ({ now: getSyougouCount("unchi"), target: 100, unit: "回" }) },

      { id: "tabidachi_10",  name: "見送り見習い", desc: "旅立ち回数 10",  check: () => getSyougouCount("tabidachi") >= 10,  progress: () => ({ now: getSyougouCount("tabidachi"), target: 10, unit: "回" }) },
      { id: "tabidachi_50",  name: "見送り職人",   desc: "旅立ち回数 50",  check: () => getSyougouCount("tabidachi") >= 50,  progress: () => ({ now: getSyougouCount("tabidachi"), target: 50, unit: "回" }) },
      { id: "tabidachi_100", name: "見送り神",     desc: "旅立ち回数 100", check: () => getSyougouCount("tabidachi") >= 100, progress: () => ({ now: getSyougouCount("tabidachi"), target: 100, unit: "回" }) },

      { id: "hanabi_10",  name: "一発屋",       desc: "花火回数 10",  check: () => getSyougouCount("hanabi") >= 10,  progress: () => ({ now: getSyougouCount("hanabi"), target: 10, unit: "回" }) },
      { id: "hanabi_50",  name: "夜空の演出家", desc: "花火回数 50",  check: () => getSyougouCount("hanabi") >= 50,  progress: () => ({ now: getSyougouCount("hanabi"), target: 50, unit: "回" }) },
      { id: "hanabi_100", name: "天上の花火師", desc: "花火回数 100", check: () => getSyougouCount("hanabi") >= 100, progress: () => ({ now: getSyougouCount("hanabi"), target: 100, unit: "回" }) },

      { id: "slotwin_10",  name: "当たり癖",         desc: "スロット当たり回数 10",  check: () => getSyougouCount("slot_win") >= 10,  progress: () => ({ now: getSyougouCount("slot_win"), target: 10, unit: "回" }) },
      { id: "slotwin_50",  name: "勝ち筋が見える",   desc: "スロット当たり回数 50",  check: () => getSyougouCount("slot_win") >= 50,  progress: () => ({ now: getSyougouCount("slot_win"), target: 50, unit: "回" }) },
      { id: "slotwin_100", name: "スロットの申し子", desc: "スロット当たり回数 100", check: () => getSyougouCount("slot_win") >= 100, progress: () => ({ now: getSyougouCount("slot_win"), target: 100, unit: "回" }) },

      { id: "omukae_10",  name: "お迎え係",   desc: "お迎え回数 10",  check: () => getSyougouCount("omukae") >= 10,  progress: () => ({ now: getSyougouCount("omukae"), target: 10, unit: "回" }) },
      { id: "omukae_50",  name: "案内人",     desc: "お迎え回数 50",  check: () => getSyougouCount("omukae") >= 50,  progress: () => ({ now: getSyougouCount("omukae"), target: 50, unit: "回" }) },
      { id: "omukae_100", name: "冥府の執事", desc: "お迎え回数 100", check: () => getSyougouCount("omukae") >= 100, progress: () => ({ now: getSyougouCount("omukae"), target: 100, unit: "回" }) },

      { id: "buy_10",  name: "多頭飼いデビュー", desc: "累計うさぎ購入 10",  check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 10,  progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 10, unit: "匹" }) },
      { id: "buy_50",  name: "牧場主",           desc: "累計うさぎ購入 50",  check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 50,  progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 50, unit: "匹" }) },
      { id: "buy_100", name: "超・牧場主",       desc: "累計うさぎ購入 100", check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 100, progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 100, unit: "匹" }) },
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
     * ✅ UI
     * ========================= */
    const PANEL_ID = "wbAchPanelV1";
    const BTN_ID   = "wbAchBtnV1";
    let uiEl = null;
    let uiFilter = "all"; // all | unlocked | locked

    function ensureUiStyle() {
      if (document.getElementById("wbAchUiStyleV1")) return;
      const s = document.createElement("style");
      s.id = "wbAchUiStyleV1";
      s.textContent = `
#${PANEL_ID}{position:fixed;inset:0;z-index:2147483647;display:none;user-select:none;}
#${PANEL_ID} .bg{position:absolute;inset:0;background:rgba(0,0,0,.38);}
#${PANEL_ID} .card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,94vw);max-height:min(82vh,820px);overflow:hidden;background:rgba(255,255,255,.97);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.24);display:flex;flex-direction:column;}
#${PANEL_ID} .head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;border-bottom:1px solid rgba(0,0,0,.08);}
#${PANEL_ID} .title{font-weight:1000;letter-spacing:.02em;}
#${PANEL_ID} .close{border:none;background:rgba(0,0,0,.06);border-radius:12px;padding:8px 12px;font-weight:900;cursor:pointer;}
#${PANEL_ID} .body{padding:12px 14px;overflow:auto;}
#${PANEL_ID} .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:10px;}
#${PANEL_ID} .pill{display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:999px;padding:8px 10px;font-weight:900;}
#${PANEL_ID} .btn{border:none;border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer;background:#fff;box-shadow:0 10px 22px rgba(0,0,0,.10);}
#${PANEL_ID} .btn.primary{background:#ffd6e7;}
#${PANEL_ID} .btn.ghost{background:rgba(0,0,0,.04);box-shadow:none;}
#${PANEL_ID} .grid{display:grid;grid-template-columns:1fr;gap:10px;}
#${PANEL_ID} .item{background:rgba(255,255,255,.92);border-radius:14px;padding:12px;box-shadow:0 10px 22px rgba(0,0,0,.08);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
#${PANEL_ID} .item.locked{opacity:.72;}
#${PANEL_ID} .name{font-weight:1000;}
#${PANEL_ID} .desc{font-size:12px;opacity:.78;font-weight:800;margin-top:4px;}
#${PANEL_ID} .meta{font-size:12px;opacity:.75;font-weight:900;margin-top:6px;}
#${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-weight:900;font-size:12px;background:rgba(255,120,120,.18);}
#${PANEL_ID} .badge.on{background:rgba(120,210,255,.22);}
#${PANEL_ID} .bar{height:10px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden;margin-top:8px;}
#${PANEL_ID} .bar>i{display:block;height:100%;width:0%;background:rgba(120,210,255,.55);}
#${PANEL_ID} .small{font-size:12px;opacity:.8;font-weight:900;}
#${BTN_ID}{margin-left:8px;}
`;
      document.head.appendChild(s);
    }

    function esc(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

    function renderUI() {
      const p = buildUI();
      const body = p.querySelector(".body");
      if (!body) return;

      const total = ACH_MASTER.length;
      const unlockedCount = ACH_MASTER.filter(a => isUnlocked(a.id)).length;

      const pills = `
        <div class="pill">解除：<b>${unlockedCount}</b> / ${total}</div>
        <div class="pill">🪙 <b>${getCoins().toLocaleString()}</b></div>
        <div class="pill">🐰 <b>${getBunnyCount()}</b></div>
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
          const pct = (target > 0) ? Math.max(0, Math.min(100, (now / target) * 100)) : (on ? 100 : 0);

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
      const mount = document.getElementById("hudButtons") || hud;

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "実績";
      btn.addEventListener("click", (e) => { e.preventDefault(); openPanel(); });
      mount.appendChild(btn);
    }

    /* =========================
     * Hooks
     * ========================= */
    try { WB.on?.("bunnyCountChanged", checkUnlocks); } catch {}
    try { WB.on?.("hudUpdated", checkUnlocks); } catch {}
    try { WB.on?.("sy:add", checkUnlocks); } catch {}

    // eventsが無くても解除できるように定期チェック
    const TIMER_MS = 900;
    const timer = setInterval(() => {
      checkUnlocks();
      refreshUI();
    }, TIMER_MS);

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
      LS_ACH,
      UNLOCK_BUNNY4_NEED,
      ACH_MASTER,
      openPanel,
      closePanel,
      stop: () => { try { clearInterval(timer); } catch {} },
      debug: false,
      // おまけ：今のカウント確認
      getSyCount: (k) => getSyougouCount(k),
      _syCounts: syCounts,
    };

    // 初回
    checkUnlocks();
    injectHudButton();
    console.log("[zisseki] ready", { unlocked: Object.keys(ach).length });

  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
