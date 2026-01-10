// syougou.js（称号システム：✅付け替え + ✅HUD横表示 + ✅zukan.js互換API + ✅zisseki同期）
// - window.SYOUGOU を提供
// - カウント（unchi/tabidachi/hanabi/slot_win/omukae 等）で称号解放
// - HUDに「称号」表示（クリックで付け替えパネル）
// - zukan.js の renderTitles() が使うAPIを全提供
//
// 推奨ロード順： app.js(WB) → zisseki.js → syougou.js → zukan.js
// ※ zukan.js が先でも動くように wait + 後追い反映あり

(() => {
  "use strict";

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
   * Storage
   * ========================= */
  const LS_STATE = "wb_syougou_state_v2"; // {ver, counts:{}, owned:{id:true}, current:"title"}
  const VER = 2;

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

  function normKey(k) {
    const s = String(k ?? "").trim().toLowerCase();
    if (!s) return "";
    if (s === "tabidati") return "tabidachi";
    if (s === "slotwin") return "slot_win";
    if (s === "slot") return "slot_win";
    if (s === "fireworks") return "hanabi";
    return s;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* =========================
   * Titles Master（ここに称号を追加していく）
   * - id: 内部ID（固定）
   * - title: 表示名（装備する文字列）
   * - key: 解除条件のカテゴリキー
   * - at: 必要回数
   * - emoji/label: zukan表示用
   * - desc: フレーバー（任意）
   * ========================= */
  const TITLE_MASTER = [
    // 💩 ウンチ道
    { id: "unchi_10",  key: "unchi",     at: 10,  emoji: "💩", label: "ウンチ",   title: "💩 ウンチ道・初段",   desc: "誇り高き第一歩。" },
    { id: "unchi_20",  key: "unchi",     at: 20,  emoji: "💩", label: "ウンチ",   title: "💩 ウンチ道・二段",   desc: "積み重ねが形になる。" },
    { id: "unchi_50",  key: "unchi",     at: 50,  emoji: "💩", label: "ウンチ",   title: "💩 ウンチ道・五段",   desc: "香りすら“歴史”になる。" },
    { id: "unchi_100", key: "unchi",     at: 100, emoji: "💩", label: "ウンチ",   title: "💩 ウンチ道・皆伝",   desc: "もはや様式美。" },

    // ✈️ 旅立ち
    { id: "tabi_10",   key: "tabidachi", at: 10,  emoji: "✈️", label: "旅立ち",   title: "✈️ 見送り見習い",     desc: "手を振る回数だけ、優しくなる。" },
    { id: "tabi_20",   key: "tabidachi", at: 20,  emoji: "✈️", label: "旅立ち",   title: "✈️ 見送り係",         desc: "言葉が、少し上手になる。" },
    { id: "tabi_50",   key: "tabidachi", at: 50,  emoji: "✈️", label: "旅立ち",   title: "✈️ 見送り職人",       desc: "別れを抱えられる人になる。" },
    { id: "tabi_100",  key: "tabidachi", at: 100, emoji: "✈️", label: "旅立ち",   title: "✈️ 見送り神",         desc: "行ってらっしゃいに、祈りが混ざる。" },

    // 🎆 花火
    { id: "hanabi_10",  key: "hanabi",   at: 10,  emoji: "🎆", label: "花火",     title: "🎆 一発屋",           desc: "まずは一発、夜に爪痕。" },
    { id: "hanabi_50",  key: "hanabi",   at: 50,  emoji: "🎆", label: "花火",     title: "🎆 夜空の演出家",     desc: "静けさの上に光を置く。" },
    { id: "hanabi_100", key: "hanabi",   at: 100, emoji: "🎆", label: "花火",     title: "🎆 天上の花火師",     desc: "星が嫉妬する腕前。" },

    // 🎰 スロット当たり
    { id: "slot_10",  key: "slot_win",   at: 10,  emoji: "🎰", label: "スロット", title: "🎰 当たり癖",         desc: "たまたまが続くと運命に見える。" },
    { id: "slot_50",  key: "slot_win",   at: 50,  emoji: "🎰", label: "スロット", title: "🎰 勝ち筋が見える",   desc: "気配が分かるようになる。" },
    { id: "slot_100", key: "slot_win",   at: 100, emoji: "🎰", label: "スロット", title: "🎰 スロットの申し子", desc: "確率が味方をする。" },

    // 🐰 お迎え
    { id: "omukae_10",  key: "omukae",   at: 10,  emoji: "🐰", label: "お迎え",   title: "🐰 お迎え係",         desc: "扉の向こうは、いつだって新しい物語。" },
    { id: "omukae_50",  key: "omukae",   at: 50,  emoji: "🐰", label: "お迎え",   title: "🐰 案内人",           desc: "迷子にならないように灯りを持つ。" },
    { id: "omukae_100", key: "omukae",   at: 100, emoji: "🐰", label: "お迎え",   title: "🐰 冥府の執事",       desc: "“ようこそ”は何度言っても温かい。" },
  ];

  /* =========================
   * UI
   * ========================= */
  const HUD_BADGE_ID = "wbTitleBadgeV1";
  const PANEL_ID = "wbTitlePanelV1";

  function ensureStyle() {
    if (document.getElementById("wbSyougouStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbSyougouStyleV1";
    s.textContent = `
#${HUD_BADGE_ID}{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px;
  border-radius:12px;
  background:#fff;
  box-shadow:0 4px 12px rgba(0,0,0,.15);
  font-weight:1000;
  cursor:pointer;
  user-select:none;
  max-width: 42vw;
}
#${HUD_BADGE_ID} .t{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width: 34vw;
}
#${PANEL_ID}{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#${PANEL_ID} .bg{position:absolute; inset:0; background:rgba(0,0,0,.35);}
#${PANEL_ID} .card{
  position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(780px, 94vw);
  max-height:min(82vh, 840px);
  background:rgba(255,255,255,.97);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.25);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#${PANEL_ID} .head{display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(0,0,0,.08);}
#${PANEL_ID} .head .title{font-weight:1000; letter-spacing:.02em; display:flex; align-items:center; gap:10px;}
#${PANEL_ID} .close{width:34px; height:34px; border:none; border-radius:999px; background:rgba(0,0,0,.06); font-weight:1000; cursor:pointer;}
#${PANEL_ID} .body{padding:12px 14px 16px; overflow:auto;}
#${PANEL_ID} .row{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px;}
#${PANEL_ID} .pill{display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:6px 10px; background:rgba(0,0,0,.06); font-weight:1000; font-size:12px;}
#${PANEL_ID} .grid{display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px;}
@media (max-width:760px){ #${PANEL_ID} .grid{grid-template-columns:1fr;} }
#${PANEL_ID} .item{
  background:rgba(255,255,255,.94);
  border-radius:14px;
  padding:12px;
  box-shadow:0 10px 24px rgba(0,0,0,.10);
  display:flex; flex-direction:column; gap:8px;
}
#${PANEL_ID} .item.locked{opacity:.62;}
#${PANEL_ID} .name{font-weight:1000;}
#${PANEL_ID} .desc{font-weight:900; font-size:12px; opacity:.82; white-space:pre-line;}
#${PANEL_ID} .meta{display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-top:auto;}
#${PANEL_ID} .btn{border:none; border-radius:12px; padding:10px 12px; font-weight:1000; cursor:pointer; background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.10);}
#${PANEL_ID} .btn.primary{background:#ffd6e7;}
#${PANEL_ID} .btn[disabled]{opacity:.55; cursor:not-allowed; box-shadow:none;}
`;
    document.head.appendChild(s);
  }

  function $(q, p = document) { return p.querySelector(q); }

  function buildPanel() {
    ensureStyle();

    let p = document.getElementById(PANEL_ID);
    if (!p) {
      p = document.createElement("div");
      p.id = PANEL_ID;
      document.body.appendChild(p);
    }
    if (p.querySelector(".card")) return p;

    p.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🏷️ 称号</div>
          <button class="close" type="button">×</button>
        </div>
        <div class="body"></div>
      </div>
    `;

    $(".bg", p).addEventListener("click", (e) => { e.preventDefault(); closePanel(); });
    $(".close", p).addEventListener("click", (e) => { e.preventDefault(); closePanel(); });
    $(".card", p).addEventListener("click", (e) => e.stopPropagation());
    return p;
  }

  function injectHudBadge(getCurrentTitle) {
    ensureStyle();
    const hud = document.getElementById("hud");
    if (!hud) return;

    // 右寄せ気味にしたい場合は hudButtons の外に置く方が安定
    const mount = document.getElementById("hud") || hud;

    let badge = document.getElementById(HUD_BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = HUD_BADGE_ID;
      badge.innerHTML = `<span>🏷️</span><span class="t">（称号なし）</span>`;
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });

      // hud内の末尾に追加（コイン等の横に並ぶ）
      mount.appendChild(badge);
    }

    const t = getCurrentTitle();
    badge.querySelector(".t").textContent = t ? t : "（称号なし）";
  }

  /* =========================
   * Core state
   * ========================= */
  const st = loadJson(LS_STATE, { ver: VER, counts: {}, owned: {}, current: "" });
  if (!st || typeof st !== "object") {
    // 破損時の救済
    st.ver = VER; st.counts = {}; st.owned = {}; st.current = "";
  }
  st.ver = VER;
  st.counts = (st.counts && typeof st.counts === "object") ? st.counts : {};
  st.owned = (st.owned && typeof st.owned === "object") ? st.owned : {};
  st.current = String(st.current || "");

  function saveState() {
    saveJson(LS_STATE, st);
  }

  function getCount(key) {
    const k = normKey(key);
    const v = Number(st.counts[k] ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  function setCount(key, v) {
    const k = normKey(key);
    if (!k) return;
    const n = Number(v);
    st.counts[k] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    saveState();
  }

  function addCount(key, delta = 1) {
    const k = normKey(key);
    if (!k) return 0;
    const d = Number(delta);
    const inc = Number.isFinite(d) ? d : 1;
    const next = Math.max(0, Math.floor(getCount(k) + inc));
    st.counts[k] = next;
    saveState();
    tryUnlockFromCounts();
    return next;
  }

  function getTitlesMaster() {
    // zukan.js が master を使うので “この形” で返す
    // {id,title,emoji,label,at}
    return TITLE_MASTER.map(m => ({
      id: m.id,
      title: m.title,
      emoji: m.emoji,
      label: m.label,
      at: m.at,
      key: m.key,
      desc: m.desc || "",
    }));
  }

  function getOwnedTitleIds() {
    return Object.keys(st.owned || {}).filter(id => !!st.owned[id]);
  }

  function getCurrentTitle() {
    return String(st.current || "");
  }

  function equipTitle(titleStr) {
    const t = String(titleStr || "").trim();
    if (!t) return false;

    // 所有チェック（title文字列→id検索→owned）
    const found = TITLE_MASTER.find(x => x.title === t);
    if (found && !st.owned[found.id]) return false;

    st.current = t;
    saveState();
    refreshHud();
    return true;
  }

  function unequipTitle() {
    st.current = "";
    saveState();
    refreshHud();
    return true;
  }

  function getAllCounts() {
    // zukan.js の進捗表示用
    const out = {};
    for (const m of TITLE_MASTER) {
      const k = normKey(m.key);
      out[k] = getCount(k);
    }
    return out;
  }

  function getNextMilestone(key) {
    const k = normKey(key);
    const now = getCount(k);
    const rows = TITLE_MASTER
      .filter(m => normKey(m.key) === k)
      .map(m => m.at)
      .sort((a, b) => a - b);

    for (const at of rows) {
      if (now < at) {
        return { at, remain: (at - now) };
      }
    }
    return null; // 全達成
  }

  function tryUnlockFromCounts() {
    let unlockedAny = false;

    for (const m of TITLE_MASTER) {
      const k = normKey(m.key);
      const now = getCount(k);
      if (now >= m.at && !st.owned[m.id]) {
        st.owned[m.id] = true;
        unlockedAny = true;

        // 解除トースト
        try { window.WB?.emit?.("sy:titleUnlocked", { id: m.id, title: m.title }); } catch {}
        // 軽い通知（zissekiのトーストとは別）
        try {
          // 同居してても邪魔しないシンプルtoast
          const msg = document.createElement("div");
          msg.style.position = "fixed";
          msg.style.left = "50%";
          msg.style.top = "20%";
          msg.style.transform = "translate(-50%,-50%)";
          msg.style.zIndex = "2147483647";
          msg.style.background = "rgba(255,255,255,.97)";
          msg.style.borderRadius = "16px";
          msg.style.padding = "10px 14px";
          msg.style.boxShadow = "0 18px 55px rgba(0,0,0,.22)";
          msg.style.fontWeight = "1000";
          msg.textContent = `🏷️ 称号解放：${m.title}`;
          document.body.appendChild(msg);
          setTimeout(() => { try { msg.remove(); } catch {} }, 2200);
        } catch {}
      }
    }

    if (unlockedAny) {
      saveState();
      refreshPanelIfOpen();
      refreshHud();
    }
  }

  /* =========================
   * sy:add / events / emit hook
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

      // slot_win win:false は加算しない
      if (k === "slot_win" && payload.win === false) return { key: "slot_win", delta: 0 };

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

  function bindCountEvent(WB, evtName, key) {
    try {
      WB.on?.(evtName, (payload) => {
        const p = parseSyPayload(payload);
        if (p.key) {
          if (p.delta > 0) addCount(p.key, p.delta);
        } else {
          addCount(key, 1);
        }
      });
    } catch {}
  }

  function hookEmitOnce(WB) {
    try {
      if (WB.__syougouEmitHooked) return;
      if (typeof WB.emit !== "function") return;

      const orig = WB.emit.bind(WB);
      WB.emit = function (name, payload) {
        try {
          const ev = String(name ?? "");

          if (ev === "sy:add") {
            const p = parseSyPayload(payload);
            if (p.key && p.delta > 0) addCount(p.key, p.delta);
          }

          // 直接イベントも拾う
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

      WB.__syougouEmitHooked = true;
    } catch {}
  }

  /* =========================
   * zisseki同期（あれば取り込む：ズレ防止）
   * ========================= */
  function syncFromZisseki(WB) {
    try {
      const z = WB.zisseki;
      if (!z || typeof z.getCount !== "function") return;

      let changed = false;
      for (const k of ["unchi", "tabidachi", "hanabi", "slot_win", "omukae"]) {
        const zv = Number(z.getCount(k) || 0) || 0;
        const cur = getCount(k);
        if (zv > cur) {
          st.counts[normKey(k)] = zv;
          changed = true;
        }
      }
      if (changed) {
        saveState();
        tryUnlockFromCounts();
      }
    } catch {}
  }

  /* =========================
   * Panel render
   * ========================= */
  function isOwned(id) { return !!st.owned?.[id]; }

  function renderPanel() {
    const p = buildPanel();
    const body = $(".body", p);
    if (!body) return;

    const current = getCurrentTitle();
    const ownedIds = new Set(getOwnedTitleIds());

    const counts = getAllCounts();
    const progressPills = [
      `💩 ウンチ：${counts.unchi || 0}`,
      `✈️ 旅立ち：${counts.tabidachi || 0}`,
      `🎆 花火：${counts.hanabi || 0}`,
      `🎰 スロット：${counts.slot_win || 0}`,
      `🐰 お迎え：${counts.omukae || 0}`,
    ].map(t => `<span class="pill">${escapeHtml(t)}</span>`).join(" ");

    const items = TITLE_MASTER.map((m) => {
      const owned = ownedIds.has(m.id) || isOwned(m.id);
      const isOn = current && current === m.title;
      const now = getCount(m.key);
      const need = m.at;
      const remain = Math.max(0, need - now);

      const title = owned ? m.title : "？？？";
      const desc = owned
        ? `${m.emoji} ${m.label}：${need}回で解放\n${m.desc || ""}`.trim()
        : `${m.emoji} ${m.label}：${need}回で解放（あと ${remain}）`;

      return `
        <div class="item ${owned ? "" : "locked"}">
          <div class="name">${escapeHtml(title)}</div>
          <div class="desc">${escapeHtml(desc)}</div>
          <div class="meta">
            <span class="pill">${owned ? (isOn ? "装備中" : "解放済") : "未解放"}</span>
            ${
              owned
                ? `<button class="btn primary" type="button" data-equip="${escapeHtml(m.title)}">${isOn ? "装備中" : "装備"}</button>`
                : `<button class="btn" type="button" disabled>未解放</button>`
            }
          </div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="row">
        <span class="pill">現在：${current ? escapeHtml(current) : "（なし）"}</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn" type="button" data-unequip="1">解除</button>
          <button class="btn" type="button" data-refresh="1">更新</button>
        </div>
      </div>
      <div class="row">${progressPills}</div>
      <div style="height:10px"></div>
      <div class="grid">${items}</div>
    `;

    body.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-equip") || "";
        equipTitle(t);
        renderPanel();
      });
    });

    body.querySelector("[data-unequip]")?.addEventListener("click", () => {
      unequipTitle();
      renderPanel();
    });

    body.querySelector("[data-refresh]")?.addEventListener("click", () => {
      // 同期→解除判定→再描画
      try { syncFromZisseki(window.WB); } catch {}
      tryUnlockFromCounts();
      renderPanel();
    });
  }

  function openPanel() {
    const p = buildPanel();
    p.style.display = "block";
    renderPanel();
  }

  function closePanel() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = "none";
  }

  function refreshPanelIfOpen() {
    const p = document.getElementById(PANEL_ID);
    if (p && p.style.display !== "none") renderPanel();
  }

  function refreshHud() {
    injectHudBadge(getCurrentTitle);
  }

  /* =========================
   * Boot
   * ========================= */
  waitForWB().then((WB) => {
    // 初期同期（zissekiがあれば取り込む）
    syncFromZisseki(WB);

    // イベント拾い
    try {
      WB.on?.("sy:add", (payload) => {
        const p = parseSyPayload(payload);
        if (p.key && p.delta > 0) addCount(p.key, p.delta);
      });
    } catch {}

    bindCountEvent(WB, "unchi", "unchi");
    bindCountEvent(WB, "tabidachi", "tabidachi");
    bindCountEvent(WB, "tabidati", "tabidachi");
    bindCountEvent(WB, "hanabiFired", "hanabi");
    bindCountEvent(WB, "hanabi", "hanabi");
    bindCountEvent(WB, "fireworks", "hanabi");
    bindCountEvent(WB, "slotWin", "slot_win");
    bindCountEvent(WB, "slotwin", "slot_win");
    bindCountEvent(WB, "omukae", "omukae");

    // 最終保険
    hookEmitOnce(WB);

    // 定期で zisseki 取り込み（ズレ防止）
    const syncTimer = setInterval(() => {
      syncFromZisseki(WB);
    }, 1200);

    // 初回解除判定
    tryUnlockFromCounts();

    // HUDバッジ（UI横表示）
    window.addEventListener("load", () => {
      refreshHud();
      setTimeout(refreshHud, 300);
      setTimeout(refreshHud, 900);
    });

    // 外部公開（zukan.js互換）
    window.SYOUGOU = {
      // master / owned / current
      getTitlesMaster,
      getOwnedTitleIds,
      getCurrentTitle,
      equipTitle,
      unequipTitle,

      // counts
      getCount,
      setCount,
      addCount,
      getAllCounts,
      getNextMilestone,

      // ui
      open: openPanel,
      close: closePanel,

      // debug
      _state: st,
      stop: () => { try { clearInterval(syncTimer); } catch {} },
    };

    console.log("[syougou] ready", {
      current: getCurrentTitle(),
      owned: getOwnedTitleIds().length,
      counts: { ...st.counts },
    });
  }).catch((e) => {
    console.warn("[syougou] WB wait failed:", e?.message || e);
  });
})();
