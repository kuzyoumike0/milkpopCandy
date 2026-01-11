// memoryGarden.js（V1.1.4 - ✅記憶表示SE + ✅単体表示 + ✅育ち切り時に本文を自動表示(キュー) + messages分離 + 実績Toastと被らない専用Toast）
//
// ✅ localStorage永続化
// ✅ WBイベントから「感情の種」を自動生成
// ✅ 放置で成長 → 完了時に3行小説「記憶」ログ生成（messages分離）
// ✅ ゲームメニューに「🌱 記憶の庭」＋「📖 最新の記憶」を追加
// ✅ 図鑑(zukan)に「記憶」タブを後付け（パッチ）
// ✅ 実績(zisseki)トーストと被らない（専用トースト＆キュー）
// ✅ 記憶メッセージを表示するときに assets/messege/messegese.mp3 を鳴らす
// ✅ 育ち切った瞬間（メッセージ解除）に、3行本文を単体ポップアップ表示（連続はキューで順送り）
//
// ★調整（あなた指定）
// - 放置種：5分
// - 成長時間：8分（全感情共通）
// - よろこび発生：コイン増加2000ごと
// - 連続発生制限：35秒
// - 完了時：1tickで最大4つまで記憶化
//
// 読み込み順：zukan.js / gameMenu.js の後（できれば最後）
// さらに：memoryGarden_messages.js をこの前に読み込む

(() => {
  "use strict";
  if (window.__MEMORY_GARDEN_V114__) return;
  window.__MEMORY_GARDEN_V114__ = true;

  const VERSION = "1.1.4";
  const LS_KEY = "milkpop_memory_garden_v1";

  const CFG = {
    tickMs: 1500,

    // ✅ 放置種：5分
    idleSeedAfterMs: 5 * 60 * 1000,

    maxSeeds: 9,

    // ✅ 成長時間：8分（hours換算：8/60）
    growHours: {
      yorokobi: 8 / 60,
      yasashisa: 8 / 60,
      omoide: 8 / 60,
      akirame: 8 / 60,
      kuyashisa: 8 / 60,
      sabishisa: 8 / 60,
    },

    // ✅ よろこび発生：2000コインごと
    coinJoyUnit: 2000,

    // ✅ 連続発生制限：35秒
    minSeedIntervalMs: 35 * 1000,

    // ✅ Toast配置（実績と被らない）
    toast: {
      right: 12,
      top: 64,
      maxWidth: 320,
      showMs: 1700,
      gapMs: 900,
      delayIfOtherToastMs: 550,
      prefix: "🌿 記憶の庭：",
    },

    // ✅ 記憶表示SE
    messageSE: {
      src: "./assets/messege/messegese.mp3",
      volume: 0.95,
      minIntervalMs: 120, // 連続表示でも音が詰まらない保険
    },

    // ✅ 育ち切り（記憶生成）時：本文を自動単体表示
    single: {
      autoShowOnComplete: true, // ✅ 育ち切ったら表示
      autoCloseMs: 5200,        // ✅ 自動で閉じる（0で無効）
      queueGapMs: 900,          // ✅ 連続生成時の間隔
    },
  };

  const EMO = {
    yorokobi:  { icon:"✨", name:"よろこび" },
    yasashisa: { icon:"🫧", name:"やさしさ" },
    omoide:    { icon:"🪶", name:"おもいで" },
    akirame:   { icon:"🌙", name:"あきらめ" },
    kuyashisa: { icon:"🗝️", name:"くやしさ" },
    sabishisa: { icon:"🌫️", name:"さびしさ" },
  };

  // 外部メッセージ（無ければ最小フォールバック）
  const MSG = window.MG_MESSAGES || {
    yorokobi: ["光が鳴った。\n少し軽い。\n明日も続く。"],
    yasashisa:["指先が伝えた。\n大丈夫。\nここは守れる。"],
    omoide:  ["見送った。\n空気が温かい。\n遅れて泣いた。"],
    akirame: ["手放した。\n両手が空く。\n風が入る。"],
    kuyashisa:["痛いほど。\nまだ望む。\nやめない。"],
    sabishisa:["静かだ。\nでも、いる。\n芽は消えない。"],
  };

  /* =========================
   * Store
   * ========================= */
  function loadStore() {
    try {
      const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (v && typeof v === "object") return v;
    } catch {}
    return {
      ver: VERSION,
      seeds: [],
      memories: [],
      stats: {
        lastTick: Date.now(),
        lastActionAt: Date.now(),
        lastSeedAt: 0,
        coinAcc: 0,
        lastCoin: null,
      }
    };
  }

  function saveStore() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {}
  }

  const store = loadStore();

  function nowDateStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function clamp01(x) {
    x = Number(x) || 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function markAction() {
    store.stats.lastActionAt = Date.now();
    saveStore();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* =========================
   * Message SE（記憶表示時）
   * - autoplay制限があるので失敗しても無視
   * - WB側のSE音量があれば追従
   * ========================= */
  let __mgSeAudio = null;
  let __mgSeLastAt = 0;

  function getWBSEVolume() {
    try {
      if (window.WB?.getSEVolume) {
        const v = Number(window.WB.getSEVolume());
        if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
      }
    } catch {}
    return 1;
  }

  function playMessageSE() {
    const t = Date.now();
    if (t - __mgSeLastAt < CFG.messageSE.minIntervalMs) return;
    __mgSeLastAt = t;

    try {
      if (!__mgSeAudio) {
        __mgSeAudio = new Audio(CFG.messageSE.src);
        __mgSeAudio.preload = "auto";
      }
      const vol = CFG.messageSE.volume * getWBSEVolume();
      __mgSeAudio.volume = Math.max(0, Math.min(1, vol));
      try { __mgSeAudio.currentTime = 0; } catch {}
      const p = __mgSeAudio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  /* =========================
   * Toast (MemoryGarden専用：実績と被らない)
   * - WB.toast / ZISSEKI.toast は絶対使わない
   * - 右上固定 + キュー + 他トースト検知で少し遅延
   * ========================= */
  const __mgToastQueue = [];
  let __mgToastBusy = false;

  function toast(msg) {
    msg = String(msg || "");
    __mgToastQueue.push(msg);
    if (__mgToastBusy) return;
    __mgToastBusy = true;
    pumpMgToast();
  }

  function pumpMgToast() {
    const msg = __mgToastQueue.shift();
    if (!msg) { __mgToastBusy = false; return; }

    const maybeOtherToast =
      document.querySelector("#zissekiToast, .zissekiToast, .toast, .wbToast, .tabidatiToast") ||
      null;

    const delay = maybeOtherToast ? CFG.toast.delayIfOtherToastMs : 0;

    setTimeout(() => {
      showMgToast(msg);
      setTimeout(() => pumpMgToast(), CFG.toast.gapMs);
    }, delay);
  }

  function showMgToast(msg) {
    try {
      const id = "mgToastV1";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText = `
          position:fixed;
          right:${CFG.toast.right}px;
          top:${CFG.toast.top}px;
          z-index:2147483647;
          max-width:min(${CFG.toast.maxWidth}px, 92vw);
          background:rgba(255,255,255,.96);
          border-radius:14px;
          padding:10px 12px;
          font-weight:950;
          box-shadow:0 14px 40px rgba(0,0,0,.22);
          opacity:0;
          pointer-events:none;
          transform:translateY(-6px);
          transition:opacity .18s ease, transform .18s ease;
          white-space:pre-line;
        `;
        document.body.appendChild(el);
      }

      el.textContent = `${CFG.toast.prefix}${msg}`;
      el.style.opacity = "1";
      el.style.transform = "translateY(0px)";

      clearTimeout(el.__t);
      el.__t = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-6px)";
      }, CFG.toast.showMs);
    } catch {}
  }

  /* =========================
   * Seeds / Memories
   * ========================= */
  function addSeed(emotion, meta = {}) {
    const e = String(emotion || "");
    if (!EMO[e]) return;

    const t = Date.now();
    if (t - (store.stats.lastSeedAt || 0) < CFG.minSeedIntervalMs) return;

    while (store.seeds.length >= CFG.maxSeeds) store.seeds.shift();

    store.seeds.push({
      id: uid("seed"),
      emotion: e,
      growth: 0,
      bornAt: t,
      related: {
        bunnyIds: meta.bunnyIds || [],
        actions: meta.actions || [],
        note: meta.note || "",
      }
    });

    store.stats.lastSeedAt = t;
    saveStore();
    toast(`🌱 ${EMO[e].name} の種が芽吹いた`);
  }

  function pick3LineNovel(emotion) {
    const arr = MSG[emotion] || ["……\n……\n……"];
    const s = arr[Math.floor(Math.random() * arr.length)] || arr[0];

    // 念のため3行化（壊れてても3行に矯正）
    const lines = String(s).split("\n").slice(0, 3);
    while (lines.length < 3) lines.push("……");
    return lines.join("\n");
  }

  /* =========================
   * ✅ Single Memory Popup（単体表示）
   * ========================= */
  const SINGLE = { panel: "mgSinglePanelV1", style: "mgSingleStyleV1" };

  function ensureSingleStyle() {
    if (document.getElementById(SINGLE.style)) return;
    const s = document.createElement("style");
    s.id = SINGLE.style;
    s.textContent = `
#${SINGLE.panel}{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#${SINGLE.panel} .bg{position:absolute; inset:0; background:rgba(0,0,0,.42);}
#${SINGLE.panel} .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(560px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  overflow:hidden;
}
#${SINGLE.panel} .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px; border-bottom:1px solid rgba(0,0,0,.06);
}
#${SINGLE.panel} .title{
  font-weight:1000; letter-spacing:.02em; display:flex; gap:10px; align-items:center;
}
#${SINGLE.panel} .close{
  width:34px; height:34px; border:none; border-radius:999px;
  background:rgba(0,0,0,.06); font-weight:1000; cursor:pointer;
}
#${SINGLE.panel} .body{ padding:14px 14px 16px; }
#${SINGLE.panel} .meta{
  display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
  font-weight:900; opacity:.7; font-size:12px; margin-bottom:10px;
}
#${SINGLE.panel} .txt{
  font-weight:950; white-space:pre-line; line-height:1.55;
  background:rgba(255,214,231,.20);
  border-radius:14px;
  padding:12px;
}
#${SINGLE.panel} .hint{
  margin-top:10px;
  font-weight:900; font-size:12px; opacity:.65;
}
`;
    document.head.appendChild(s);
  }

  function ensureSinglePanel() {
    ensureSingleStyle();
    let p = document.getElementById(SINGLE.panel);
    if (p) return p;

    p = document.createElement("div");
    p.id = SINGLE.panel;
    p.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">📖 記憶</div>
          <button class="close" type="button">×</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(p);

    p.querySelector(".bg").addEventListener("click", (e) => { e.preventDefault(); closeSingle(); });
    p.querySelector(".close").addEventListener("click", (e) => { e.preventDefault(); closeSingle(); });
    p.querySelector(".card").addEventListener("click", (e) => e.stopPropagation());

    return p;
  }

  function closeSingle() {
    const p = document.getElementById(SINGLE.panel);
    if (p) p.style.display = "none";
  }

  function openSingleMemory(mem) {
    if (!mem) {
      toast("まだ記憶がありません");
      return;
    }

    // ✅ 記憶表示SE
    playMessageSE();

    const p = ensureSinglePanel();
    const body = p.querySelector(".body");
    const emo = EMO[mem.emotion] || { icon:"?", name:"?" };

    const born = mem.bornAt ? new Date(mem.bornAt).toLocaleString() : "";
    const done = mem.doneAt ? new Date(mem.doneAt).toLocaleString() : "";
    const date = mem.date || "";

    body.innerHTML = `
      <div class="meta">
        <div>${escapeHtml(`${emo.icon} ${emo.name}`)}</div>
        <div>${escapeHtml(date)}</div>
      </div>
      <div class="txt">${escapeHtml(mem.text || "")}</div>
      <div class="hint">芽吹き：${escapeHtml(born)}　/　記憶化：${escapeHtml(done)}</div>
    `;

    p.style.display = "block";

    // ✅ 連続表示でも自動クローズが暴れないように
    try {
      clearTimeout(openSingleMemory.__autoCloseT);
      const ac = Number(CFG.single?.autoCloseMs || 0);
      if (ac > 0) {
        openSingleMemory.__autoCloseT = setTimeout(() => { try { closeSingle(); } catch {} }, ac);
      }
    } catch {}
  }

  function showLatestMemory() {
    const m = store.memories && store.memories.length ? store.memories[0] : null;
    openSingleMemory(m);
  }

  function showMemoryById(id) {
    const m = (store.memories || []).find(x => x && x.id === id);
    openSingleMemory(m);
  }

  /* =========================
   * ✅ 育ち切り（メッセージ解除）時：本文を自動で単体表示（キュー）
   * ========================= */
  const __mgAutoPopQueue = [];
  let __mgAutoPopBusy = false;

  function enqueueAutoPopup(mem) {
    if (!mem) return;
    if (!CFG.single?.autoShowOnComplete) return;

    __mgAutoPopQueue.push(mem);
    if (__mgAutoPopBusy) return;
    __mgAutoPopBusy = true;
    pumpAutoPopup();
  }

  function pumpAutoPopup() {
    const mem = __mgAutoPopQueue.shift();
    if (!mem) { __mgAutoPopBusy = false; return; }

    try { openSingleMemory(mem); } catch {}

    setTimeout(() => pumpAutoPopup(), Number(CFG.single?.queueGapMs || 900));
  }

  function completeSeed(seed) {
    const e = seed.emotion;
    const text = pick3LineNovel(e);

    const memObj = {
      id: uid("mem"),
      emotion: e,
      text,
      date: nowDateStr(),
      bornAt: seed.bornAt,
      doneAt: Date.now(),
    };

    store.memories.unshift(memObj);
    store.seeds = store.seeds.filter(s => s.id !== seed.id);
    saveStore();

    toast(`📖 記憶が残った：${EMO[e].name}`);

    // ✅ ★育ち切った瞬間（メッセージ解除）に本文を表示
    enqueueAutoPopup(memObj);

    try { window.WB?.emit?.("memoryGarden:updated", {}); } catch {}
  }

  /* =========================
   * Growth tick
   * ========================= */
  function growTick() {
    const t = Date.now();
    const last = Number(store.stats.lastTick || t);
    const dt = Math.max(0, t - last);
    store.stats.lastTick = t;

    for (const s of store.seeds) {
      const hours = Number(CFG.growHours[s.emotion] || 8);
      const needMs = Math.max(1, hours * 60 * 60 * 1000);
      s.growth = clamp01((Number(s.growth) || 0) + (dt / needMs));
    }

    const done = store.seeds.filter(s => (Number(s.growth) || 0) >= 1);

    // ✅ 完了時：1tickで最大4つまで
    for (const s of done.slice(0, 4)) completeSeed(s);

    const idle = t - (Number(store.stats.lastActionAt || t));
    if (idle >= CFG.idleSeedAfterMs) {
      addSeed("sabishisa", { note: "idle" });
      store.stats.lastActionAt = t;
    }

    saveStore();
  }

  /* =========================
   * UI Panel（種/記憶一覧）
   * ========================= */
  const UI = { panel: "mgPanelV1", style: "mgStyleV1" };
  const $ = (q, p = document) => p.querySelector(q);
  let currentTab = "seed";

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const s = document.createElement("style");
    s.id = UI.style;
    s.textContent = `
#${UI.panel}{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#${UI.panel} .bg{position:absolute; inset:0; background:rgba(0,0,0,.35);}
#${UI.panel} .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(820px, 94vw);
  max-height:min(82vh, 860px);
  background:rgba(255,255,255,.97);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.25);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#${UI.panel} .head{display:flex; align-items:center; justify-content:space-between; padding:12px 14px;}
#${UI.panel} .head .title{font-weight:1000; letter-spacing:.02em; display:flex; align-items:center; gap:10px;}
#${UI.panel} .close{width:34px; height:34px; border:none; border-radius:999px; background:rgba(0,0,0,.06); font-weight:1000; cursor:pointer;}
#${UI.panel} .tabs{display:flex; gap:10px; padding:0 14px 10px;}
#${UI.panel} .tab{flex:1; border:none; border-radius:12px; padding:10px 12px; font-weight:1000; background:rgba(0,0,0,.06); cursor:pointer;}
#${UI.panel} .tab.on{background:rgba(255,255,255,.92); box-shadow:0 10px 24px rgba(0,0,0,.10);}
#${UI.panel} .body{padding:12px 14px 16px; overflow:auto;}
#${UI.panel} .grid{display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px;}
@media (max-width:760px){ #${UI.panel} .grid{grid-template-columns:repeat(2, minmax(0,1fr));} }
#${UI.panel} .item{
  background:rgba(255,255,255,.94);
  border-radius:14px;
  padding:12px;
  box-shadow:0 10px 24px rgba(0,0,0,.10);
  display:flex; flex-direction:column; gap:8px;
  min-height:170px;
}
#${UI.panel} .name{font-weight:1000; text-align:center;}
#${UI.panel} .desc{font-weight:900; font-size:12px; opacity:.82; text-align:center; white-space:pre-line;}
#${UI.panel} .bar{height:10px; background:rgba(0,0,0,.08); border-radius:999px; overflow:hidden;}
#${UI.panel} .bar i{display:block; height:100%; width:0%; background:#ffd6e7;}
#${UI.panel} .meta{margin-top:auto; text-align:center; font-weight:1000; font-size:12px; opacity:.85;}
#${UI.panel} .mem{
  background:rgba(255,255,255,.94);
  border-radius:14px;
  padding:12px 12px;
  box-shadow:0 10px 24px rgba(0,0,0,.10);
  display:flex; flex-direction:column; gap:6px;
}
#${UI.panel} .mem .top{display:flex; justify-content:space-between; gap:10px; font-weight:1000; opacity:.9;}
#${UI.panel} .mem .txt{font-weight:950; white-space:pre-line; line-height:1.45;}
#${UI.panel} .hint{font-weight:900; font-size:12px; opacity:.65; padding:6px 2px 0;}
#${UI.panel} .mem .btnRow{display:flex; gap:10px; margin-top:8px;}
#${UI.panel} .mem .btn{
  border:none; border-radius:12px; padding:8px 10px;
  font-weight:1000; background:rgba(0,0,0,.06); cursor:pointer;
}
`;
    document.head.appendChild(s);
  }

  function buildPanel() {
    ensureStyle();
    let p = document.getElementById(UI.panel);
    if (!p) {
      p = document.createElement("div");
      p.id = UI.panel;
      document.body.appendChild(p);
    }

    if (!p.querySelector(".card")) {
      p.innerHTML = `
        <div class="bg"></div>
        <div class="card" role="dialog" aria-modal="true">
          <div class="head">
            <div class="title">🌱 記憶の庭</div>
            <button class="close" type="button">×</button>
          </div>
          <div class="tabs">
            <button class="tab on" data-tab="seed" type="button">種</button>
            <button class="tab" data-tab="mem" type="button">記憶</button>
          </div>
          <div class="body"></div>
        </div>
      `;
      $(".bg", p).addEventListener("click", (e) => { e.preventDefault(); close(); });
      $(".close", p).addEventListener("click", (e) => { e.preventDefault(); close(); });
      $(".card", p).addEventListener("click", (e) => e.stopPropagation());

      p.querySelectorAll(".tab").forEach((b) => {
        b.addEventListener("click", () => {
          p.querySelectorAll(".tab").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          currentTab = b.dataset.tab || "seed";
          if (currentTab === "mem") playMessageSE();
          render();
        });
      });
    }
    return p;
  }

  function renderSeeds(body) {
    const list = store.seeds.slice().sort((a,b)=> (b.bornAt||0)-(a.bornAt||0));
    if (!list.length) {
      body.innerHTML = `<div class="hint">まだ種はありません。<br>しばらく遊ぶか、少し放置すると芽吹きます。</div>`;
      return;
    }
    body.innerHTML = `
      <div class="grid">
        ${list.map(s=>{
          const emo = EMO[s.emotion] || {icon:"?", name:"?"};
          const p = Math.floor(clamp01(s.growth) * 100);
          const born = new Date(Number(s.bornAt||0)).toLocaleString();
          return `
            <div class="item">
              <div class="name">${emo.icon} ${emo.name}</div>
              <div class="desc">小さな気配が、ここにいる。</div>
              <div class="bar"><i style="width:${p}%;"></i></div>
              <div class="meta">${p}%</div>
              <div class="hint">芽吹き：${escapeHtml(born)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMems(body) {
    const list = store.memories.slice(0, 80);
    if (!list.length) {
      body.innerHTML = `<div class="hint">まだ記憶はありません。<br>種が育つと、3行の小説として残ります。</div>`;
      return;
    }

    // ✅ 記憶一覧の表示＝記憶メッセージ表示
    playMessageSE();

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${list.map(m=>{
          const emo = EMO[m.emotion] || {icon:"?", name:"?"};
          return `
            <div class="mem" data-memid="${escapeHtml(m.id||"")}">
              <div class="top">
                <div>${emo.icon} ${emo.name}</div>
                <div>${escapeHtml(m.date||"")}</div>
              </div>
              <div class="txt">${escapeHtml(m.text||"")}</div>
              <div class="btnRow">
                <button class="btn" type="button" data-act="single">単体で読む</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // 「単体で読む」クリック
    try {
      body.querySelectorAll('.mem .btn[data-act="single"]').forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const card = btn.closest(".mem");
          const id = card?.getAttribute("data-memid");
          if (id) showMemoryById(id);
        });
      });
    } catch {}
  }

  function render() {
    const p = document.getElementById(UI.panel);
    if (!p) return;
    const body = $(".body", p);
    if (!body) return;
    if (currentTab === "mem") renderMems(body);
    else renderSeeds(body);
  }

  function open(tab = "seed") {
    markAction();
    currentTab = tab === "mem" ? "mem" : "seed";
    const p = buildPanel();
    p.style.display = "block";

    p.querySelectorAll(".tab").forEach(x => x.classList.remove("on"));
    const t = p.querySelector(`.tab[data-tab="${currentTab}"]`);
    if (t) t.classList.add("on");

    if (currentTab === "mem") playMessageSE();
    render();
  }

  function close() {
    const p = document.getElementById(UI.panel);
    if (p) p.style.display = "none";
  }

  /* =========================
   * Menu injection
   * ========================= */
  function patchGameMenu() {
    const panel = document.getElementById("gameMenuPanelV1");
    if (!panel) return false;
    const list = panel.querySelector(".list");
    if (!list) return false;

    // ① 記憶の庭
    if (!list.querySelector('[data-act="memoryGarden"]')) {
      const z = list.querySelector('[data-act="zukan"]');
      const btn = document.createElement("button");
      btn.className = "item";
      btn.setAttribute("data-act", "memoryGarden");
      btn.textContent = "🌱 記憶の庭";
      btn.addEventListener("click", () => {
        panel.style.display = "none";
        open("seed");
      });

      if (z && z.parentNode) z.parentNode.insertBefore(btn, z.nextSibling);
      else list.appendChild(btn);
    }

    // ② 最新の記憶（単体表示）
    if (!list.querySelector('[data-act="memoryGardenLatest"]')) {
      const mg = list.querySelector('[data-act="memoryGarden"]');
      const btn2 = document.createElement("button");
      btn2.className = "item";
      btn2.setAttribute("data-act", "memoryGardenLatest");
      btn2.textContent = "📖 最新の記憶";
      btn2.addEventListener("click", () => {
        panel.style.display = "none";
        showLatestMemory();
      });

      if (mg && mg.parentNode) mg.parentNode.insertBefore(btn2, mg.nextSibling);
      else list.appendChild(btn2);
    }

    return true;
  }

  /* =========================
   * Patch zukan: add memory tab
   * ========================= */
  function patchZukan() {
    const WB = window.WB;
    if (!WB?.zukan?.open) return false;
    if (WB.zukan.__mg_patched) return true;

    const origOpen = WB.zukan.open.bind(WB.zukan);

    function ensureTab() {
      const p = document.getElementById("wbZukanPanelV1");
      if (!p) return false;
      const tabs = p.querySelector(".tabs");
      const body = p.querySelector(".body");
      if (!tabs || !body) return false;

      if (!tabs.querySelector('.tab[data-tab="memory"]')) {
        const b = document.createElement("button");
        b.className = "tab";
        b.type = "button";
        b.dataset.tab = "memory";
        b.textContent = "記憶";
        tabs.appendChild(b);

        b.addEventListener("click", () => {
          p.querySelectorAll(".tab").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          playMessageSE();
          renderZukanMemory(body);
        });
      }
      return true;
    }

    function renderZukanMemory(body) {
      const list = store.memories.slice(0, 80);
      if (!list.length) {
        body.innerHTML = `
          <div style="font-weight:900; opacity:.7;">
            まだ記憶はありません。<br>
            種が育つと、3行の小説として残ります。
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <div style="font-weight:1000;">🌱 記憶</div>
          <div style="font-weight:900; opacity:.7; font-size:12px;">
            ※ 記憶は消えません（見送って残るログ）
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
          ${list.map(m=>{
            const emo = EMO[m.emotion] || {icon:"?", name:"?"};
            return `
              <div data-memid="${escapeHtml(m.id||"")}" style="
                background:rgba(255,255,255,.94);
                border-radius:14px;
                padding:12px;
                box-shadow:0 10px 24px rgba(0,0,0,.10);
                display:flex; flex-direction:column; gap:6px;
              ">
                <div style="display:flex; justify-content:space-between; gap:10px; font-weight:1000; opacity:.9;">
                  <div>${emo.icon} ${emo.name}</div>
                  <div>${escapeHtml(m.date||"")}</div>
                </div>
                <div style="font-weight:950; white-space:pre-line; line-height:1.45;">
                  ${escapeHtml(m.text||"")}
                </div>
                <div style="display:flex; gap:10px; margin-top:8px;">
                  <button type="button" data-act="single" style="
                    border:none; border-radius:12px; padding:8px 10px;
                    font-weight:1000; background:rgba(0,0,0,.06); cursor:pointer;
                  ">単体で読む</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;

      // 図鑑側の「単体で読む」
      try {
        body.querySelectorAll('button[data-act="single"]').forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const card = btn.closest("[data-memid]");
            const id = card?.getAttribute("data-memid");
            if (id) showMemoryById(id);
          });
        });
      } catch {}
    }

    WB.zukan.open = function(tab = "bunny") {
      origOpen(tab);
      ensureTab();

      if (tab === "memory") {
        const p = document.getElementById("wbZukanPanelV1");
        const body = p?.querySelector(".body");
        const memTab = p?.querySelector('.tab[data-tab="memory"]');
        if (p && body && memTab) {
          p.querySelectorAll(".tab").forEach(x => x.classList.remove("on"));
          memTab.classList.add("on");
          try { memTab.click(); } catch {}
        }
      }
    };

    WB.zukan.__mg_patched = true;

    try {
      WB.on?.("memoryGarden:updated", () => {
        const p = document.getElementById("wbZukanPanelV1");
        if (!p || p.style.display !== "block") return;
        const memTab = p.querySelector('.tab[data-tab="memory"]');
        if (!memTab || !memTab.classList.contains("on")) return;
        try { memTab.click(); } catch {}
      });
    } catch {}

    return true;
  }

  /* =========================
   * WB hooks
   * ========================= */
  function hookWB() {
    const WB = window.WB;
    if (!WB?.on) return false;

    // coinChanged → よろこび（累積）
    try {
      WB.on("coinChanged", (coins) => {
        markAction();
        const c = Number(coins) || 0;
        if (store.stats.lastCoin === null) store.stats.lastCoin = c;
        const prev = Number(store.stats.lastCoin) || 0;
        const delta = c - prev;
        store.stats.lastCoin = c;

        if (delta > 0) {
          store.stats.coinAcc = (Number(store.stats.coinAcc) || 0) + delta;
          if (store.stats.coinAcc >= CFG.coinJoyUnit) {
            store.stats.coinAcc -= CFG.coinJoyUnit;
            addSeed("yorokobi", { actions:["coin"] });
          }
          saveStore();
        }
      });
    } catch {}

    // 旅立ち → おもいで
    try { WB.on("tabidachi", () => { markAction(); addSeed("omoide", { actions:["tabidachi"] }); }); } catch {}
    try { WB.on("bunnyDeparted", () => { markAction(); addSeed("omoide", { actions:["depart"] }); }); } catch {}

    // 転生 → あきらめ
    try { WB.on("prestige", () => { markAction(); addSeed("akirame", { actions:["prestige"] }); }); } catch {}

    // sy:addから広く拾う
    try {
      WB.on("sy:add", (p) => {
        markAction();
        const key = String(p?.key || p?.type || "").toLowerCase();
        if (key.includes("hanabi") || key.includes("slot") || key.includes("hoshi")) {
          addSeed("yorokobi", { actions:["sy:add"], note:key });
        } else if (key.includes("unchi") || key.includes("ougon")) {
          addSeed("kuyashisa", { actions:["sy:add"], note:key });
        }
      });
    } catch {}

    return true;
  }

  /* =========================
   * WB API
   * ========================= */
  function exposeAPI() {
    const WB = window.WB || (window.WB = {});
    WB.memoryGarden = {
      open, close, addSeed, store, version: VERSION,

      // ✅ 単体表示API
      showLatest: showLatestMemory,
      showById: showMemoryById,
      closeSingle,

      // ✅ SE（外から鳴らしたい時用）
      playMessageSE,
    };
  }

  /* =========================
   * Boot loop
   * ========================= */
  function boot() {
    exposeAPI();

    const t = setInterval(() => {
      try { hookWB(); } catch {}
      try { patchGameMenu(); } catch {}
      try { patchZukan(); } catch {}
      try { growTick(); } catch {}
    }, CFG.tickMs);

    try { hookWB(); } catch {}
    try { patchGameMenu(); } catch {}
    try { patchZukan(); } catch {}
    try { growTick(); } catch {}

    console.log(`[memoryGarden] booted v${VERSION} (messages separated=${!!window.MG_MESSAGES})`);
    return () => clearInterval(t);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") boot();
  else window.addEventListener("load", boot);

})();
