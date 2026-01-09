// zukan.js（互換強化版）
// 図鑑 + 実績 + 称号 UI（スクショ風のカードUI）
// - ✅ HUDボタンは作らない（ハンバーガーメニューから呼ぶ）
// - タブ：うさぎ / 実績 / 称号
// - SYOUGOU, zisseki があれば自動連動
// - 旅立ち回数（うさぎ別）は localStorage で保持
// - ✅ WB新旧互換：getBunnies / getCoin など
// - ✅ CATEGORIES 未定義バグ修正（内部定義）
// - ✅ 旅立ちイベント(bunnyDeparted/tabidachi)で farewell 加算

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * Storage
   * ========================= */
  const LS = {
    zukan: "wb_zukan_v1", // { discovered: { bunny1:true ... }, farewellByType: { bunny1: 0 ... } }
  };

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

  const store = loadJson(LS.zukan, {
    discovered: {},
    farewellByType: {},
  });

  function saveStore() {
    saveJson(LS.zukan, store);
  }

  /* =========================
   * WB 互換ヘルパ
   * ========================= */
  function getBunnies() {
    try {
      if (typeof WB.getBunnies === "function") {
        const arr = WB.getBunnies();
        return Array.isArray(arr) ? arr : [];
      }
    } catch {}
    try {
      if (Array.isArray(WB.bunnies)) return WB.bunnies;
    } catch {}
    return [];
  }

  /* =========================
   * Bunny Master（ここ増やす）
   * ========================= */
  const BUNNY_MASTER = [
    {
      key: "bunny1",
      name: "bunny1",
      img: "./assets/bunny.png",
      desc: "基本のうさぎ。コインは控えめ。",
      flavor: "数えきれない旅立ちの先で、\nここはもう帰る場所になった。",
    },
    { key: "bunny3", name: "bunny3", img: "./assets/bunny3.png", desc: "安定してコインを稼ぐ中級うさぎ。" },
    { key: "bunny4", name: "bunny4", img: "./assets/bunny4.png", desc: "大量のコインを生み出す上級うさぎ。" },
    { key: "bunny5", name: "bunny5", img: "./assets/bunny5.png", desc: "牧場最上級クラス。圧倒的生産力。" },
    { key: "reabunny", name: "reabunny", img: "./assets/reabunny.png", desc: "突然変異でのみ現れる幻のうさぎ。" },
  ];

  // 画像src→key推定（WB.bunnies の構造が不明でも拾えるように）
  function guessKeyFromBunnyObj(b) {
    if (!b) return null;

    const candidates = [];

    if (typeof b === "string") candidates.push(b);

    if (typeof b?.kind === "string") candidates.push(b.kind);
    if (typeof b?.adultSrc === "string") candidates.push(b.adultSrc);
    if (typeof b?.src === "string") candidates.push(b.src);
    if (typeof b?.image === "string") candidates.push(b.image);
    if (typeof b?.img === "string") candidates.push(b.img);
    if (typeof b?.asset === "string") candidates.push(b.asset);

    try {
      if (b?.el?.src) candidates.push(String(b.el.src));
      if (b?.img?.src) candidates.push(String(b.img.src));
    } catch {}

    const joined = candidates.filter(Boolean).join(" ").toLowerCase();

    if (joined.includes("reabunny")) return "reabunny";
    if (joined.includes("bunny5")) return "bunny5";
    if (joined.includes("bunny4")) return "bunny4";
    if (joined.includes("bunny3")) return "bunny3";
    if (joined.includes("babybunny")) return "babybunny";
    if (joined.includes("bunny")) return "bunny1";
    return null;
  }

  function discover(key) {
    if (!key) return;
    if (!store.discovered[key]) {
      store.discovered[key] = true;
      saveStore();
    }
  }

  function scanCurrentBunnies() {
    try {
      const list = getBunnies();
      if (!Array.isArray(list)) return;
      for (const b of list) {
        const k = guessKeyFromBunnyObj(b);
        if (k && k !== "babybunny") discover(k);
      }
    } catch {}
  }

  function addFarewellByType(key, n = 1) {
    const k = String(key || "");
    if (!k) return;
    store.farewellByType[k] = Number(store.farewellByType[k] || 0) + Math.max(1, n | 0);
    saveStore();
  }

  /* =========================
   * UI
   * ========================= */
  const PANEL_ID = "wbZukanPanelV1";
  let panelEl = null;

  function $(q, p = document) {
    return p.querySelector(q);
  }

  function ensureStyles() {
    if (document.getElementById("wbZukanStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbZukanStyleV1";
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
  background: rgba(0,0,0,.35);
}
#${PANEL_ID} .card{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%, -50%);
  width: min(820px, 94vw);
  max-height: min(82vh, 840px);
  background: rgba(255,255,255,.97);
  border-radius: 16px;
  box-shadow: 0 18px 60px rgba(0,0,0,.25);
  overflow: hidden;
  display:flex;
  flex-direction: column;
}
#${PANEL_ID} .head{
  display:flex;
  align-items:center;
  justify-content: space-between;
  padding: 12px 14px;
}
#${PANEL_ID} .head .title{
  font-weight: 1000;
  letter-spacing:.02em;
  display:flex;
  align-items:center;
  gap: 10px;
}
#${PANEL_ID} .close{
  width: 34px;
  height: 34px;
  border:none;
  border-radius: 999px;
  background: rgba(0,0,0,.06);
  font-weight: 1000;
  cursor:pointer;
}
#${PANEL_ID} .tabs{
  display:flex;
  gap: 10px;
  padding: 0 14px 10px;
}
#${PANEL_ID} .tab{
  flex:1;
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 1000;
  background: rgba(0,0,0,.06);
  cursor:pointer;
}
#${PANEL_ID} .tab.on{
  background: rgba(255,255,255,.92);
  box-shadow: 0 10px 24px rgba(0,0,0,.10);
}
#${PANEL_ID} .body{
  padding: 12px 14px 16px;
  overflow:auto;
}
#${PANEL_ID} .grid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 760px){
  #${PANEL_ID} .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
#${PANEL_ID} .item{
  background: rgba(255,255,255,.94);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(0,0,0,.10);
  display:flex;
  flex-direction: column;
  gap: 8px;
  min-height: 190px;
}
#${PANEL_ID} .item.locked{
  opacity: .62;
}
#${PANEL_ID} .imgBox{
  height: 86px;
  display:flex;
  align-items:center;
  justify-content:center;
}
#${PANEL_ID} .imgBox img{
  max-height: 86px;
  max-width: 100%;
  object-fit: contain;
  display:block;
}
#${PANEL_ID} .name{
  font-weight: 1000;
  text-align:center;
}
#${PANEL_ID} .desc{
  font-weight: 900;
  font-size: 12px;
  opacity: .82;
  text-align:center;
  white-space: pre-line;
}
#${PANEL_ID} .meta{
  margin-top:auto;
  text-align:center;
  font-weight: 1000;
  font-size: 12px;
  opacity: .85;
}
#${PANEL_ID} .pill{
  display:inline-flex;
  align-items:center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 1000;
  font-size: 12px;
}
#${PANEL_ID} .row{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
#${PANEL_ID} .btn{
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 1000;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 24px rgba(0,0,0,.10);
}
#${PANEL_ID} .btn.primary{ background: #ffd6e7; }
#${PANEL_ID} .btn[disabled]{ opacity:.55; cursor:not-allowed; box-shadow:none; }
`;
    document.head.appendChild(s);
  }

  function buildPanel() {
    ensureStyles();
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
          <div class="title">📖 図鑑</div>
          <button class="close" type="button">×</button>
        </div>
        <div class="tabs">
          <button class="tab on" data-tab="bunny" type="button">うさぎ</button>
          <button class="tab" data-tab="ach" type="button">実績</button>
          <button class="tab" data-tab="title" type="button">称号</button>
        </div>
        <div class="body"></div>
      </div>
    `;

    $(".bg", p).addEventListener("click", (e) => { e.preventDefault(); close(); });
    $(".close", p).addEventListener("click", (e) => { e.preventDefault(); close(); });
    $(".card", p).addEventListener("click", (e) => e.stopPropagation());

    p.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        p.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        render();
      });
    });

    return p;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentTab() {
    const p = panelEl || document.getElementById(PANEL_ID);
    const on = p?.querySelector(".tab.on");
    return on?.getAttribute("data-tab") || "bunny";
  }

  function renderBunny(body) {
    scanCurrentBunnies();

    const items = BUNNY_MASTER.map((b) => {
      const unlocked = !!store.discovered[b.key];
      const farewell = Number(store.farewellByType[b.key] || 0);

      const title = unlocked ? b.name : "？？？";
      const desc = unlocked ? (b.desc || "") : "";
      const flavor = unlocked ? (b.flavor || "") : "";
      const descAll = [desc, flavor].filter(Boolean).join("\n");

      return `
        <div class="item ${unlocked ? "" : "locked"}">
          <div class="imgBox">
            ${unlocked ? `<img src="${escapeHtml(b.img)}" alt="${escapeHtml(b.name)}">` : `<div class="pill">未解放</div>`}
          </div>
          <div class="name">${escapeHtml(title)}</div>
          <div class="desc">${escapeHtml(descAll)}</div>
          <div class="meta">旅立ち：${farewell}回</div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="row">
        <span class="pill">発見：${Object.keys(store.discovered).length} / ${BUNNY_MASTER.length}</span>
        <button class="btn" type="button" data-rescan="1">再スキャン</button>
      </div>
      <div class="grid">${items}</div>
    `;

    body.querySelector("[data-rescan]")?.addEventListener("click", () => {
      scanCurrentBunnies();
      render();
    });
  }

  function renderAchievements(body) {
    const z = WB.zisseki;
    const master = Array.isArray(z?.ACH_MASTER) ? z.ACH_MASTER : [];
    const ach = z?.ach || loadJson("wb_ach_v4", loadJson("wb_ach_v3", {}));

    const list = master.length
      ? master.map((a) => ({
          id: a.id,
          name: a.name || a.id,
          desc: a.desc || "",
          unlocked: !!ach?.[a.id],
        }))
      : Object.keys(ach || {}).map((k) => ({
          id: k,
          name: k,
          desc: "",
          unlocked: !!ach[k],
        }));

    const unlockedCount = list.filter((x) => x.unlocked).length;

    const items = list.map((a) => {
      const title = a.unlocked ? a.name : "？？？";
      const desc = a.desc || (a.unlocked ? "" : "条件達成で解放");
      return `
        <div class="item ${a.unlocked ? "" : "locked"}">
          <div class="name">${escapeHtml(title)}</div>
          <div class="desc">${escapeHtml(desc)}</div>
          <div class="meta">${a.unlocked ? "✅ 解除済み" : "🔒 未解除"}</div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="row">
        <span class="pill">解除：${unlockedCount} / ${list.length}</span>
        <button class="btn" type="button" data-check="1">今チェック</button>
      </div>
      <div class="grid">${items || `<div class="pill">実績データがまだありません</div>`}</div>
    `;

    body.querySelector("[data-check]")?.addEventListener("click", () => {
      try { WB.zisseki?.checkUnlocks?.(); } catch {}
      render();
    });
  }

  /* =========================
   * Titles（SYOUGOU連動）
   * ========================= */

  const CATEGORIES = [
    { key: "unchi",     label: "ウンチ",     emoji: "💩" },
    { key: "tabidachi", label: "旅立ち",     emoji: "✈️" },
    { key: "hanabi",    label: "花火",       emoji: "🎆" },
    { key: "slot_win",  label: "スロット",   emoji: "🎰" },
    { key: "omukae",    label: "お迎え",     emoji: "🐰" },
  ];

  function renderTitles(body) {
    const s = window.SYOUGOU;
    const master = Array.isArray(s?.getTitlesMaster?.()) ? s.getTitlesMaster() : [];
    const ownedIds = new Set(Array.isArray(s?.getOwnedTitleIds?.()) ? s.getOwnedTitleIds() : []);
    const current = String(s?.getCurrentTitle?.() || "");

    const counts = s?.getAllCounts?.() || {};

    const catProgress = CATEGORIES.map((c) => {
      const n = Number(counts[c.key] || 0);
      const next = s?.getNextMilestone?.(c.key);
      const nextText = next ? `次：${next.at}まであと${next.remain}` : "全達成！";
      return `<span class="pill">${c.emoji} ${c.label}：${n}（${nextText}）</span>`;
    }).join(" ");

    const items = master.map((m) => {
      const unlocked = ownedIds.has(m.id);
      const isOn = current && current === m.title;

      return `
        <div class="item ${unlocked ? "" : "locked"}">
          <div class="name">${unlocked ? escapeHtml(m.title) : "？？？"}</div>
          <div class="desc">${escapeHtml(`${m.emoji} ${m.label} / ${m.at}回で解放`)}</div>
          <div class="meta" style="display:flex; gap:8px; justify-content:center; align-items:center;">
            <span class="pill">${unlocked ? (isOn ? "装備中" : "解放済") : "未解放"}</span>
            ${
              unlocked
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
      <div class="row">${catProgress}</div>
      <div style="height:10px"></div>
      <div class="grid">${items || `<div class="pill">称号データがありません</div>`}</div>
    `;

    body.querySelectorAll("[data-equip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-equip") || "";
        try { s?.equipTitle?.(t); } catch {}
        render();
      });
    });

    body.querySelector("[data-unequip]")?.addEventListener("click", () => {
      try { s?.unequipTitle?.(); } catch {}
      render();
    });

    body.querySelector("[data-refresh]")?.addEventListener("click", () => render());
  }

  function render() {
    const p = buildPanel();
    const body = $(".body", p);
    if (!body) return;

    const tab = currentTab();
    if (tab === "ach") renderAchievements(body);
    else if (tab === "title") renderTitles(body);
    else renderBunny(body);
  }

  function open(tab = "bunny") {
    const p = buildPanel();
    p.style.display = "block";

    scanCurrentBunnies();

    p.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
    const t = p.querySelector(`.tab[data-tab="${tab}"]`);
    if (t) t.classList.add("on");
    render();
  }

  function close() {
    const p = panelEl || document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = "none";
  }

  /* =========================
   * Public API（他スクリプトから呼ぶ用）
   * ========================= */
  WB.zukan = {
    open,
    close,

    discover,
    scanCurrentBunnies,

    addFarewellByType,
    getFarewellByType: (k) => Number(store.farewellByType[k] || 0),

    store,
    BUNNY_MASTER,
  };

  /* =========================
   * Hooks
   * ========================= */

  try { WB.on?.("bunnyCountChanged", scanCurrentBunnies); } catch {}

  try {
    WB.on?.("bunnyDeparted", (p) => {
      const key = String(p?.kind || "") || null;
      if (key) addFarewellByType(key, 1);
    });
  } catch {}

  try {
    WB.on?.("tabidachi", (p) => {
      const key = String(p?.kind || "") || null;
      if (key) addFarewellByType(key, 1);
    });
  } catch {}

  window.addEventListener("load", () => {
    scanCurrentBunnies();
  });
})();
