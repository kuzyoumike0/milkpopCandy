// syougou.js
// 称号システム（各種カウント・称号解放・装備・永続化・付け替えUI）
// - 未解放は「？？？」表示（解放条件は表示）
// - HUDの「名前の横」に現在称号を常時表示（見つからなければHUD左側に表示）
// ✅ FIX: 解除が効かない（v1/v2キー不一致）を完全修正：装備/解除は v1/v2 両方同期、起動時も互換読み込み

(() => {
  "use strict";

  /* =========================
   * Config
   * ========================= */
  const THRESHOLDS = [10, 50, 100];

  const CATEGORIES = [
    {
      key: "unchi",
      label: "ウンチ",
      emoji: "💩",
      titles: { 10: "黄金を踏みし者", 50: "黄金に選ばれし者", 100: "黄金の王" },
    },
    {
      key: "tabidachi",
      label: "旅立ち",
      emoji: "🕊️",
      titles: { 10: "旅立ちの見届け人", 50: "旅路の語り部", 100: "永遠の見送り人" },
    },
    {
      key: "hanabi",
      label: "花火",
      emoji: "🎆",
      titles: { 10: "小さな花火師", 50: "夜空の演出家", 100: "天上の花火師" },
    },
    {
      key: "slot_win",
      label: "スロット当たり",
      emoji: "🎰",
      titles: { 10: "ビギナーズラック", 50: "勝利の常連", 100: "運命の寵児" },
    },
    {
      key: "omukae",
      label: "お迎え",
      emoji: "🚪",
      titles: { 10: "お迎え係", 50: "案内人", 100: "冥府の執事" },
    },
  ];

  // ✅ v2 をメインに保存しつつ、互換で v1 も同期する
  const LS = {
    counts: "wb_counts_v2",          // { unchi: 0, tabidachi: 0, ... }
    currentTitle: "wb_title_v2",     // string（HUDに出す文字列）
    ownedTitles: "wb_title_list_v2", // ["unchi:10", ...]
    uiOpenOnce: "wb_title_ui_hint_v1",
  };

  /* =========================
   * State
   * ========================= */
  const state = {
    counts: {},
    owned: [],
    current: "",
  };

  let WB = null;

  /* =========================
   * Storage
   * ========================= */
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
  function loadStr(key, def = "") {
    const v = localStorage.getItem(key);
    return (v == null) ? def : String(v);
  }
  function saveStr(key, v) {
    localStorage.setItem(key, String(v ?? ""));
  }

  // ✅ v1キー（app.js / WB互換）を確実に取得
  function getV1TitleKey() {
    return (window.WB?.LS?.title) ? window.WB.LS.title : "wb_title_v1";
  }

  function saveAll() {
    saveJson(LS.counts, state.counts);
    saveJson(LS.ownedTitles, state.owned);

    // v2
    saveStr(LS.currentTitle, state.current || "");

    // ✅ v1にも同期（他JS互換：ここが「解除が効かない」の主原因）
    saveStr(getV1TitleKey(), state.current || "");
  }

  function initFromStorage() {
    const counts = loadJson(LS.counts, {});
    state.counts = (counts && typeof counts === "object") ? counts : {};

    state.owned = loadJson(LS.ownedTitles, []);
    if (!Array.isArray(state.owned)) state.owned = [];

    // まず v2
    state.current = loadStr(LS.currentTitle, "");

    // ✅ v2が空なら v1から復元（互換）
    if (!state.current) {
      state.current = loadStr(getV1TitleKey(), "");
    }

    for (const c of CATEGORIES) {
      if (!Number.isFinite(state.counts[c.key])) state.counts[c.key] = 0;
    }
  }

  /* =========================
   * Master
   * ========================= */
  function getCategory(key) {
    return CATEGORIES.find((c) => c.key === key) || null;
  }

  function buildTitleId(key, at) {
    return `${key}:${at}`;
  }

  function displayTitleText(key, at) {
    const c = getCategory(key);
    const name = c?.titles?.[at];
    if (!c || !name) return null;
    return `${c.emoji} ${c.label}${at}回：${name}`;
  }

  function getTitlesMaster() {
    const out = [];
    for (const c of CATEGORIES) {
      for (const at of THRESHOLDS) {
        const name = c.titles?.[at];
        if (!name) continue;
        out.push({
          key: c.key,
          label: c.label,
          emoji: c.emoji,
          at,
          id: buildTitleId(c.key, at),
          title: displayTitleText(c.key, at),
          rawTitle: String(name),
        });
      }
    }
    return out;
  }

  function isOwned(id) {
    return state.owned.includes(id);
  }

  /* =========================
   * Toast
   * ========================= */
  function ensureToastStyles() {
    if (document.getElementById("syougouToastStyleV2")) return;
    const s = document.createElement("style");
    s.id = "syougouToastStyleV2";
    s.textContent = `
.farewellMilestone{
  position: fixed;
  left: 50%;
  top: 14%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(255,255,255,.96);
  border-radius: 16px;
  padding: 12px 16px;
  font-weight: 900;
  box-shadow: 0 16px 40px rgba(0,0,0,.18);
  opacity: 0;
  animation: syougouToastIn .22s ease-out forwards, syougouToastOut .36s ease-in forwards;
  animation-delay: 0ms, 2.7s;
  white-space: nowrap;
}
@keyframes syougouToastIn{
  from { opacity: 0; transform: translate(-50%, -70%); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes syougouToastOut{
  from { opacity: 1; transform: translate(-50%, -50%); }
  to   { opacity: 0; transform: translate(-50%, -35%); }
}
`;
    document.head.appendChild(s);
  }

  function showToast(text) {
    ensureToastStyles();
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 3600);
  }

  /* =========================
   * HUD Title Badge (常時表示)
   * ========================= */
  const HUD_BADGE_ID = "wbHudTitleBadgeV1";

  function ensureHudBadgeStyles() {
    if (document.getElementById("syougouHudBadgeStyleV1")) return;
    const s = document.createElement("style");
    s.id = "syougouHudBadgeStyleV1";
    s.textContent = `
#${HUD_BADGE_ID}{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.92);
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
  font-weight: 900;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
#${HUD_BADGE_ID} .label{
  opacity: .72;
}
#${HUD_BADGE_ID}.empty{
  opacity: .55;
}
`;
    document.head.appendChild(s);
  }

  function findNameAnchorInHud(hud) {
    if (!hud) return null;
    const selectors = [
      "#playerName", ".playerName",
      "#userName", ".userName",
      "#name", ".name",
    ];
    for (const sel of selectors) {
      const el = hud.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function ensureHudBadge() {
    const hud = document.getElementById("hud");
    if (!hud) return null;

    ensureHudBadgeStyles();

    let badge = document.getElementById(HUD_BADGE_ID);
    if (badge && badge.parentElement) return badge;

    badge = document.createElement("span");
    badge.id = HUD_BADGE_ID;
    badge.innerHTML = `<span class="label">称号</span><span class="value">（なし）</span>`;

    const anchor = findNameAnchorInHud(hud);
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", badge);
    } else {
      const coin = hud.querySelector("#coin") || hud.firstElementChild;
      if (coin && coin.parentElement) coin.insertAdjacentElement("afterend", badge);
      else hud.appendChild(badge);
    }

    return badge;
  }

  function updateHudTitleBadge() {
    const badge = ensureHudBadge();
    if (!badge) return;

    const v = badge.querySelector(".value");
    if (!v) return;

    const cur = getCurrentTitle();
    v.textContent = cur ? cur : "（なし）";
    badge.classList.toggle("empty", !cur);
  }

  /* =========================
   * Unlock / Equip
   * ========================= */
  function equipTitle(titleText) {
    state.current = String(titleText || "");
    saveAll();

    // ✅ 即反映（解除もここで確実に消える）
    updateHudTitleBadge();
    refreshUI();

    // HUD更新は最後（他JSの更新トリガ）
    WB?.updateHud?.();
  }

  function unequipTitle() {
    equipTitle("");
  }

  function unlockTitleById(id) {
    if (!state.owned.includes(id)) state.owned.push(id);
    saveAll();
  }

  function unlockAndEquip(key, at) {
    const id = buildTitleId(key, at);
    const text = displayTitleText(key, at);
    if (!text) return;

    const firstTime = !state.owned.includes(id);

    unlockTitleById(id);
    equipTitle(text);

    if (firstTime) {
      showToast(`🏅 称号解放：${text}`);
      if (!loadStr(LS.uiOpenOnce, "")) {
        saveStr(LS.uiOpenOnce, "1");
        setTimeout(() => showToast(`🪪 「称号」から付け替えできます`), 900);
      }
    }
  }

  function getCount(key) {
    return Number(state.counts?.[key] || 0);
  }

  function getAllCounts() {
    const out = {};
    for (const c of CATEGORIES) out[c.key] = getCount(c.key);
    return out;
  }

  function getNextMilestone(key) {
    const n = getCount(key);
    for (const at of THRESHOLDS) {
      if (n < at) return { at, remain: at - n };
    }
    return null;
  }

  function maybeUnlockByCount(key) {
    const n = getCount(key);
    for (const at of THRESHOLDS) {
      if (n === at) {
        unlockAndEquip(key, at);
        break;
      }
    }
  }

  function incCount(key, amount = 1) {
    const c = getCategory(key);
    if (!c) return;

    const a = Math.max(1, Math.floor(amount));
    state.counts[key] = Number(state.counts[key] || 0) + a;

    saveAll();
    maybeUnlockByCount(key);
    updateHudTitleBadge();
    refreshUI();
    WB?.updateHud?.();
  }

  function getOwnedTitleIds() {
    return Array.isArray(state.owned) ? state.owned.slice() : [];
  }

  function getOwnedTitlesDisplay() {
    const master = getTitlesMaster();
    const ownedSet = new Set(getOwnedTitleIds());
    return master.filter((m) => ownedSet.has(m.id)).map((m) => m.title);
  }

  function getCurrentTitle() {
    return String(state.current || "");
  }

  /* =========================
   * UI
   * ========================= */
  let uiEl = null;

  function ensureUIStyles() {
    if (document.getElementById("syougouUiStyleV4")) return;
    const s = document.createElement("style");
    s.id = "syougouUiStyleV4";
    s.textContent = `
#syougouPanel{
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: none;
  user-select: none;
}
#syougouPanel .bg{
  position:absolute; inset:0;
  background: rgba(0,0,0,.38);
}
#syougouPanel .card{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%, -50%);
  width: min(700px, 94vw);
  max-height: min(80vh, 760px);
  overflow: hidden;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,.24);
  display:flex;
  flex-direction: column;
}
#syougouPanel .head{
  display:flex; align-items:center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(0,0,0,.08);
}
#syougouPanel .title{
  font-weight: 1000;
  letter-spacing: .02em;
}
#syougouPanel .close{
  border:none; background: rgba(0,0,0,.06);
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 900;
  cursor:pointer;
}
#syougouPanel .body{
  padding: 12px 14px;
  overflow:auto;
}
#syougouPanel .section{
  background: rgba(0,0,0,.03);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
}
#syougouPanel .row{
  display:flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items:center;
  justify-content: space-between;
}
#syougouPanel .mini{
  opacity:.82;
  font-weight: 800;
}
#syougouPanel .pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  background: rgba(255,255,255,.92);
  border-radius: 999px;
  padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  font-weight: 900;
}
#syougouPanel .btn{
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
}
#syougouPanel .btn.primary{ background: #ffd6e7; }
#syougouPanel .btn.danger{ background: rgba(255,80,80,.12); }
#syougouPanel .btn[disabled]{
  opacity:.55;
  cursor:not-allowed;
  box-shadow:none;
}
#syougouPanel .grid{
  display:grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
#syougouPanel .item{
  background: rgba(255,255,255,.92);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
#syougouPanel .item.locked{
  opacity:.70;
}
#syougouPanel .item .left{
  display:flex;
  flex-direction: column;
  gap: 4px;
}
#syougouPanel .item .name{
  font-weight: 1000;
}
#syougouPanel .item .meta{
  font-size: 12px;
  opacity: .75;
  font-weight: 900;
}
#syougouPanel .badge{
  display:inline-flex;
  align-items:center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 900;
  font-size: 12px;
}
#syougouPanel .badge.on{
  background: rgba(120, 210, 255, .22);
}
#syougouPanel .badge.lock{
  background: rgba(255, 120, 120, .18);
}
`;
    document.head.appendChild(s);
  }

  function buildUI() {
    ensureUIStyles();
    if (uiEl && document.body.contains(uiEl)) return uiEl;

    uiEl = document.createElement("div");
    uiEl.id = "syougouPanel";
    uiEl.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🪪 称号</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(uiEl);

    uiEl.querySelector(".bg")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeTitlePanel();
    });
    uiEl.querySelector(".close")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeTitlePanel();
    });
    uiEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return uiEl;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function renderUI() {
    const p = buildUI();
    const body = p.querySelector(".body");
    if (!body) return;

    const current = getCurrentTitle();
    const counts = getAllCounts();
    const master = getTitlesMaster();
    const ownedSet = new Set(getOwnedTitleIds());

    const byCat = {};
    for (const c of CATEGORIES) byCat[c.key] = [];
    for (const t of master) byCat[t.key].push(t);

    const progressHtml = CATEGORIES.map((c) => {
      const n = counts[c.key] || 0;
      const next = getNextMilestone(c.key);
      const nextText = next ? `次：${next.at}まであと${next.remain}` : "全達成！";
      return `<div class="pill">${c.emoji} ${c.label}：<b>${n}</b> <span class="mini">(${nextText})</span></div>`;
    }).join("");

    const sectionsHtml = CATEGORIES.map((c) => {
      const list = byCat[c.key] || [];

      const items = list.map((m) => {
        const owned = ownedSet.has(m.id);
        const isOn = current && current === m.title;

        const displayName = owned ? escapeHtml(m.title) : "？？？";

        const badge = owned
          ? `<span class="badge ${isOn ? "on" : ""}">${isOn ? "装備中" : "解放済"}</span>`
          : `<span class="badge lock">未解放</span>`;

        const btn = owned
          ? `<button class="btn primary" type="button" data-equip="${escapeAttr(m.title)}">${isOn ? "装備中" : "装備"}</button>`
          : `<button class="btn" type="button" disabled>未解放</button>`;

        return `
          <div class="item ${owned ? "" : "locked"}">
            <div class="left">
              <div class="name">${displayName}</div>
              <div class="meta">${escapeHtml(c.emoji)} ${escapeHtml(c.label)} / ${m.at}回で解放</div>
            </div>
            <div class="right" style="display:flex; gap:8px; align-items:center;">
              ${badge}
              ${btn}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="section">
          <div class="row">
            <div class="title">${c.emoji} ${c.label}</div>
            <div class="mini">（全 ${list.length}）</div>
          </div>
          <div style="height:10px"></div>
          <div class="grid">${items}</div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="section">
        <div class="row">
          <div class="pill">現在：<b>${current ? escapeHtml(current) : "（なし）"}</b></div>
          <div class="row" style="gap:8px">
            <button class="btn danger" type="button" data-unequip="1">解除</button>
            <button class="btn" type="button" data-refresh="1">更新</button>
          </div>
        </div>
        <div style="height:10px"></div>
        <div class="row">${progressHtml}</div>
      </div>

      ${sectionsHtml}
    `;

    body.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const t = btn.getAttribute("data-equip") || "";
        equipTitle(t);
        showToast(`🪪 称号装備：${t}`);
      });
    });
    body.querySelectorAll("[data-unequip]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        unequipTitle();
        showToast(`🪪 称号を解除しました`);
      });
    });
    body.querySelectorAll("[data-refresh]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        renderUI();
      });
    });
  }

  function openTitlePanel() {
    const p = buildUI();
    renderUI();
    p.style.display = "block";
  }
  function closeTitlePanel() {
    const p = uiEl || document.getElementById("syougouPanel");
    if (!p) return;
    p.style.display = "none";
  }
  function refreshUI() {
    if (uiEl && uiEl.style.display !== "none") renderUI();
  }

  function injectHudButton() {
    const hud = document.getElementById("hud");
    if (!hud) return;
    if (document.getElementById("syougouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "syougouBtn";
    btn.textContent = "称号";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openTitlePanel();
    });
    hud.appendChild(btn);
  }

  /* =========================
   * External attach
   * ========================= */
  function attach(wb) {
    WB = wb || null;

    // ✅ WBが来たタイミングで v1キーを確定できるので、互換同期しておく
    if (state.current) {
      saveStr(getV1TitleKey(), state.current);
    }

    injectHudButton();
    ensureHudBadge();
    updateHudTitleBadge();
    WB?.updateHud?.();
  }

  /* =========================
   * Event API (increment)
   * ========================= */
  function onGoldenUnchiCollected() { incCount("unchi", 1); }
  function onTabidachi()           { incCount("tabidachi", 1); }
  function onHanabi()              { incCount("hanabi", 1); }
  function onSlotWin()             { incCount("slot_win", 1); }
  function onOmukae()              { incCount("omukae", 1); }
  function add(key, amount = 1)    { incCount(key, amount); }

  /* =========================
   * Boot
   * ========================= */
  initFromStorage();

  window.addEventListener("load", () => {
    injectHudButton();
    ensureHudBadge();
    updateHudTitleBadge();

    const btn =
      document.getElementById("syougouBtn") ||
      [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("称号"));

    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openTitlePanel();
      });
    }

    // HUD構造が後から変わる場合にも追従（保険）
    setTimeout(() => {
      ensureHudBadge();
      updateHudTitleBadge();
    }, 400);

    // ✅ WBが既にあるなら attach（保険）
    if (window.WB) attach(window.WB);
  });

  /* =========================
   * Public
   * ========================= */
  window.SYOUGOU = {
    attach,

    // increment
    onGoldenUnchiCollected,
    onTabidachi,
    onHanabi,
    onSlotWin,
    onOmukae,
    add,

    // equip
    equipTitle,
    unequipTitle,

    // UI
    openTitlePanel,
    closeTitlePanel,

    // HUD
    updateHudTitleBadge,

    // getters
    getCount,
    getAllCounts,
    getOwnedTitleIds,
    getOwnedTitlesDisplay,
    getCurrentTitle,
    getTitlesMaster,
    getNextMilestone,
  };
})();
