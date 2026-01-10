// prestige.js（転生：コイン＆うさぎリセット →「牧場の星」獲得 → 恒久解放）
// ✅ zisseki/zukan に依存しない単体完結（WBがあれば連携）
// ✅ 星の保存：localStorage wb_prestige_v1
// ✅ 恒久解放(perks)を保存＆WB.prestige.hasPerk()で参照可能
// ✅ リセットは “安全寄り”：WB API があればそれ優先。無い場合は DOM/LS を保守的に掃除。
// ✅ 誤爆防止：転生ボタンは「長押し 1.2秒」
//
// 使い方：
// - menu などから WB.prestige.open() を呼ぶ
// - 恒久解放を他モジュールで使う： WB.prestige.hasPerk("coin_sparkle")

(() => {
  "use strict";
  if (window.__WB_PRESTIGE_V1__) return;
  window.__WB_PRESTIGE_V1__ = true;

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  const CFG = {
    // 星計算：減衰（おすすめ）
    // coins → stars = floor( sqrt(coins / BASE) )
    // 例: BASE=50000 だと 50kで1星、200kで2星、450kで3星...
    STAR_BASE_COINS: 50000,

    // 転生最低条件（0で無条件）
    MIN_COINS_TO_PRESTIGE: 50000,

    // 長押し時間
    HOLD_MS: 1200,

    // “深めのLSリセット” をしたいなら true（基本は false 推奨）
    // false: WB経由でコイン0 + うさぎ撤去（LSは触らない/最小限）
    // true : よくあるキーを追加で消す（環境差でズレるので慎重に）
    DEEP_LOCALSTORAGE_WIPE: false,

    // 深めリセットで消す候補キー（あなたの環境に合わせて追記OK）
    WIPE_KEYS: [
      "wb_coins_v6",
      "wb_bunnies_v6",
      "wb_bunnies_v5",
      "wb_state_v1",
      "wb_state_v2",
      "milkpop_bunnies_v1",
      "milkpop_coins_v1",
    ],

    // UI文言
    LABEL: {
      title: "🌟 転生（牧場の星）",
      prestigeBtn: "🌟 転生する",
      close: "閉じる",
      unlock: "解放",
      unlocked: "解放済",
    },
  };

  const LS_PRESTIGE = "wb_prestige_v1"; // { ver:1, stars:0, spent:0, perks:{id:true}, history:[...] }

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          resolve(null);
        }
      }, TICK_MS);
    });
  }

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

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyle() {
    if (document.getElementById("wbPrestigeStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbPrestigeStyleV1";
    s.textContent = `
#wbPrestigePanelV1{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#wbPrestigePanelV1 .bg{position:absolute; inset:0; background:rgba(0,0,0,.38);}
#wbPrestigePanelV1 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(860px, 94vw); max-height:min(84vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#wbPrestigePanelV1 .head{display:flex; align-items:center; justify-content:space-between; padding:14px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);}
#wbPrestigePanelV1 .title{font-weight:1000; letter-spacing:.02em; display:flex; gap:10px; align-items:center;}
#wbPrestigePanelV1 .close{border:none; background:rgba(0,0,0,.06); border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;}
#wbPrestigePanelV1 .body{padding:12px 14px 16px; overflow:auto;}
#wbPrestigePanelV1 .row{display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:10px;}
#wbPrestigePanelV1 .pill{display:inline-flex; align-items:center; gap:8px; background:rgba(0,0,0,.05); border-radius:999px; padding:8px 10px; font-weight:1000;}
#wbPrestigePanelV1 .btn{border:none; border-radius:12px; padding:10px 12px; font-weight:1000; cursor:pointer; background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);}
#wbPrestigePanelV1 .btn.primary{background:#ffd6e7;}
#wbPrestigePanelV1 .btn.danger{background:#ffe0e0;}
#wbPrestigePanelV1 .btn[disabled]{opacity:.55; cursor:not-allowed; box-shadow:none;}
#wbPrestigePanelV1 .grid{display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px;}
@media (max-width:760px){ #wbPrestigePanelV1 .grid{grid-template-columns:1fr;} }
#wbPrestigePanelV1 .perk{
  background:rgba(255,255,255,.94);
  border-radius:14px;
  padding:12px;
  box-shadow:0 10px 22px rgba(0,0,0,.08);
}
#wbPrestigePanelV1 .perk .name{font-weight:1000;}
#wbPrestigePanelV1 .perk .desc{margin-top:4px; font-size:12px; opacity:.8; font-weight:900; line-height:1.35; white-space:pre-line;}
#wbPrestigePanelV1 .perk .foot{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:10px; flex-wrap:wrap;}
#wbPrestigePanelV1 .badge{display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:6px 10px; font-weight:1000; font-size:12px; background:rgba(120,210,255,.22);}
#wbPrestigePanelV1 .badge.lock{background:rgba(255,120,120,.18);}
#wbPrestigePanelV1 .bar{height:10px; border-radius:999px; background:rgba(0,0,0,.08); overflow:hidden; margin-top:8px;}
#wbPrestigePanelV1 .bar > i{display:block; height:100%; width:0%; background:rgba(120,210,255,.55);}
#wbPrestigePanelV1 .hint{font-size:12px; opacity:.78; font-weight:900; line-height:1.35;}
#wbPrestigePanelV1 .hold{
  position:relative; overflow:hidden;
}
#wbPrestigePanelV1 .hold > .fill{
  position:absolute; inset:0; width:0%; background:rgba(0,0,0,.06);
}
`;
    document.head.appendChild(s);
  }

  // 星計算（減衰）
  function calcStarsFromCoins(coins) {
    const c = Math.max(0, Math.floor(Number(coins) || 0));
    if (c < CFG.MIN_COINS_TO_PRESTIGE) return 0;
    const stars = Math.floor(Math.sqrt(c / Math.max(1, CFG.STAR_BASE_COINS)));
    return Math.max(0, stars);
  }

  function nextCoinsForStar(targetStars) {
    // stars = floor(sqrt(coins/base)) → coins >= base * (stars^2)
    const s = Math.max(0, Math.floor(targetStars));
    return Math.max(0, Math.floor(CFG.STAR_BASE_COINS * (s * s)));
  }

  function getCoins(WB) {
    try { if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try { if (WB && typeof WB.coins === "number") return Number(WB.coins) || 0; } catch {}
    const el = document.getElementById("coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }

  function setCoinsZero(WB) {
    // 1) WB.setCoin
    try {
      if (WB && typeof WB.setCoin === "function") { WB.setCoin(0); return true; }
    } catch {}

    // 2) WB.coins
    try {
      if (WB && typeof WB.coins === "number") {
        WB.coins = 0;
        const el = document.getElementById("coinValue");
        if (el) el.textContent = "0";
        try { WB.emit?.("coinsChanged", { coins: 0 }); } catch {}
        return true;
      }
    } catch {}

    // 3) #coinValue
    const el = document.getElementById("coinValue");
    if (el) el.textContent = "0";
    return true;
  }

  function removeAllBunnies(WB) {
    // 1) WB.removeAllBunnies があれば最強
    try {
      if (WB && typeof WB.removeAllBunnies === "function") { WB.removeAllBunnies(); return true; }
    } catch {}

    // 2) WB.bunnies 配列があるなら空にする
    try {
      if (WB && Array.isArray(WB.bunnies)) WB.bunnies.length = 0;
    } catch {}

    // 3) DOMから消す（.bunnyWrap を全部消す）
    try {
      document.querySelectorAll(".bunnyWrap, .bunny-wrap").forEach(el => { try { el.remove(); } catch {} });
    } catch {}

    // 4) bunnyLayer下も掃除
    try {
      const bl = document.getElementById("bunnyLayer") || document.getElementById("bunnylayer");
      if (bl) {
        // bunnyLayerの中身を全部消すのは危険な場合もあるので “うさぎっぽい要素”だけ
        Array.from(bl.children).forEach(ch => {
          // 画像を含む要素を優先して撤去
          if (ch.querySelector && ch.querySelector("img")) { try { ch.remove(); } catch {} }
        });
      }
    } catch {}

    try { WB?.emit?.("bunnyCountChanged", { count: 0 }); } catch {}
    return true;
  }

  function deepWipeLocalStorage() {
    if (!CFG.DEEP_LOCALSTORAGE_WIPE) return;
    for (const k of CFG.WIPE_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }
  }

  // 恒久解放（例：演出中心）
  const PERK_MASTER = [
    { id: "coin_sparkle", cost: 1, name: "コイン回収キラッ", desc: "コイン回収時に小さな✨演出を追加（演出のみ）" },
    { id: "mirrorball_plus", cost: 2, name: "ミラーボール増し", desc: "ミラーボール範囲内の✨演出を少し増やす（演出のみ）" },
    { id: "hanabi_glow", cost: 2, name: "花火発光ブースト", desc: "花火GIFの発光感を少し強化（演出のみ）" },
    { id: "bunny_aura", cost: 3, name: "うさぎの輪郭光", desc: "うさぎにうっすら輪郭の光（演出のみ）" },
    { id: "bg_soft", cost: 3, name: "背景ふわっと", desc: "背景に柔らかいビネットを追加（演出のみ）" },

    // バランス影響は最後に（必要ならON）
    { id: "coin_bonus_1", cost: 6, name: "収入+1%", desc: "放置のコイン量を+1%（控えめ）", gameplay: true },
    { id: "coin_bonus_3", cost: 12, name: "収入+3%", desc: "放置のコイン量を+3%（控えめ）", gameplay: true },
  ];

  function defaultPrestigeState() {
    return { ver: 1, stars: 0, spent: 0, perks: {}, history: [] };
  }

  function loadPrestige() {
    const st = loadJson(LS_PRESTIGE, defaultPrestigeState());
    if (!st || typeof st !== "object") return defaultPrestigeState();
    st.ver = 1;
    st.stars = Number(st.stars || 0) || 0;
    st.spent = Number(st.spent || 0) || 0;
    st.perks = (st.perks && typeof st.perks === "object") ? st.perks : {};
    st.history = Array.isArray(st.history) ? st.history : [];
    return st;
  }

  function savePrestige(st) {
    saveJson(LS_PRESTIGE, st);
  }

  function format(n) {
    return (Number(n) || 0).toLocaleString();
  }

  // UI
  const PANEL_ID = "wbPrestigePanelV1";
  let panelEl = null;

  function buildPanel() {
    ensureStyle();
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
          <div class="title">${escapeHtml(CFG.LABEL.title)}</div>
          <button class="close" type="button">${escapeHtml(CFG.LABEL.close)}</button>
        </div>
        <div class="body"></div>
      </div>
    `;

    p.querySelector(".bg")?.addEventListener("click", (e) => { e.preventDefault(); close(); });
    p.querySelector(".close")?.addEventListener("click", (e) => { e.preventDefault(); close(); });
    p.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return p;
  }

  function open() {
    const p = buildPanel();
    p.style.display = "block";
    render();
  }

  function close() {
    const p = panelEl || document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = "none";
  }

  function render() {
    const WB = window.WB || null;
    const p = buildPanel();
    const body = p.querySelector(".body");
    if (!body) return;

    const st = loadPrestige();
    const coins = getCoins(WB);
    const gainStars = calcStarsFromCoins(coins);

    const available = Math.max(0, (st.stars - st.spent));

    const nextStar = Math.max(1, gainStars + 1);
    const needCoins = nextCoinsForStar(nextStar);
    const pct = (needCoins > 0) ? clamp((coins / needCoins) * 100, 0, 100) : 0;

    const top = `
      <div class="row">
        <span class="pill">現在コイン：<b>🪙 ${format(coins)}</b></span>
        <span class="pill">牧場の星：<b>🌟 ${format(st.stars)}</b></span>
        <span class="pill">使用可能：<b>✨ ${format(available)}</b></span>
      </div>
      <div class="row">
        <div style="flex:1; min-width:240px;">
          <div class="pill">この状態で転生すると：<b>🌟 +${format(gainStars)}</b></div>
          <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="hint">次の星（${nextStar}）目安：🪙 ${format(needCoins)}（いま ${pct.toFixed(1)}%）</div>
          <div class="hint">※ 星は減衰で増えるため、コインが多いほど“伸びが緩やか”になります。</div>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn danger hold" type="button" data-prestige="1" ${gainStars <= 0 ? "disabled" : ""}>
            <span>${escapeHtml(CFG.LABEL.prestigeBtn)}（長押し）</span>
            <i class="fill"></i>
          </button>
        </div>
      </div>
      <div style="height:10px"></div>
    `;

    const perkCards = PERK_MASTER.map(pk => {
      const owned = !!st.perks[pk.id];
      const canBuy = !owned && available >= pk.cost;
      const badge = owned ? `<span class="badge">${escapeHtml(CFG.LABEL.unlocked)}</span>` : `<span class="badge lock">未解放</span>`;
      const btn = owned
        ? `<button class="btn" type="button" disabled>${escapeHtml(CFG.LABEL.unlocked)}</button>`
        : `<button class="btn primary" type="button" data-buy="${escapeHtml(pk.id)}" ${canBuy ? "" : "disabled"}>${escapeHtml(CFG.LABEL.unlock)}（-${pk.cost}）</button>`;

      return `
        <div class="perk">
          <div class="name">🌟 ${escapeHtml(pk.name)} <span style="opacity:.75; font-weight:900;">(cost ${pk.cost})</span></div>
          <div class="desc">${escapeHtml(pk.desc)}${pk.gameplay ? "\n※バランス影響あり" : ""}</div>
          <div class="foot">
            <div>${badge}</div>
            <div style="display:flex; gap:10px; align-items:center;">
              ${btn}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const history = (st.history || []).slice(-8).reverse().map(h => {
      const t = new Date(h.t || Date.now());
      const dt = `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,"0")}/${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
      return `<div class="pill">🗓 ${escapeHtml(dt)}：🪙${format(h.coins)} → 🌟+${format(h.stars)}</div>`;
    }).join(" ");

    body.innerHTML = `
      ${top}
      <div class="row">
        <div class="pill">恒久解放（星で購入）</div>
        <div class="hint">他モジュールからは <b>WB.prestige.hasPerk("perkId")</b> で参照できます。</div>
      </div>
      <div class="grid">${perkCards}</div>

      <div style="height:14px"></div>
      <div class="row">
        <div class="pill">転生履歴</div>
        <div class="hint">${history || "（まだ転生していません）"}</div>
      </div>
    `;

    // 購入
    body.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-buy") || "";
        const pk = PERK_MASTER.find(x => x.id === id);
        if (! declared(pk)) return;

        const st2 = loadPrestige();
        const avail2 = Math.max(0, st2.stars - st2.spent);
        if (st2.perks[id]) { render(); return; }
        if (avail2 < pk.cost) { render(); return; }

        st2.perks[id] = true;
        st2.spent += pk.cost;
        savePrestige(st2);

        try { (window.WB || null)?.emit?.("prestige:perk", { id, on: true }); } catch {}
        render();
      });
    });

    // 転生（長押し）
    const btnPrestige = body.querySelector("[data-prestige]");
    if (btnPrestige) {
      const fill = btnPrestige.querySelector(".fill");
      let downAt = 0;
      let raf = 0;
      let holding = false;

      const stopHold = () => {
        holding = false;
        downAt = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (fill) fill.style.width = "0%";
      };

      const step = () => {
        if (!holding) return;
        const now = Date.now();
        const p = clamp((now - downAt) / CFG.HOLD_MS, 0, 1);
        if (fill) fill.style.width = `${(p * 100).toFixed(1)}%`;

        if (p >= 1) {
          stopHold();
          doPrestige();
          return;
        }
        raf = requestAnimationFrame(step);
      };

      const startHold = (e) => {
        if (btnPrestige.disabled) return;
        e.preventDefault();
        holding = true;
        downAt = Date.now();
        step();
      };

      btnPrestige.addEventListener("pointerdown", startHold);
      btnPrestige.addEventListener("pointerup", stopHold);
      btnPrestige.addEventListener("pointercancel", stopHold);
      btnPrestige.addEventListener("pointerleave", stopHold);
    }

    function doPrestige() {
      const WB = window.WB || null;
      const st = loadPrestige();
      const coins = getCoins(WB);
      const gain = calcStarsFromCoins(coins);
      if (gain <= 0) return;

      // 1) 星加算
      st.stars += gain;
      st.history = Array.isArray(st.history) ? st.history : [];
      st.history.push({ t: Date.now(), coins, stars: gain });
      if (st.history.length > 80) st.history = st.history.slice(-80);
      savePrestige(st);

      // 2) リセット
      setCoinsZero(WB);
      removeAllBunnies(WB);
      deepWipeLocalStorage();

      // 3) 通知
      try { WB?.emit?.("prestige", { stars: gain, total: st.stars }); } catch {}
      try { WB?.emit?.("sy:add", { key: "prestige", delta: 1 }); } catch {} // 実績連携したい場合用

      // 4) UI更新
      render();
    }

    function declared(x) { return !!x; }
  }

  // Public API
  waitForWB().then((WB) => {
    const api = {
      open,
      close,
      load: loadPrestige,
      save: savePrestige,
      hasPerk: (id) => {
        const st = loadPrestige();
        return !!st.perks?.[String(id || "")];
      },
      getStars: () => {
        const st = loadPrestige();
        return Number(st.stars || 0) || 0;
      },
      getAvailable: () => {
        const st = loadPrestige();
        return Math.max(0, (Number(st.stars || 0) || 0) - (Number(st.spent || 0) || 0));
      },
      calcStarsFromCoins,
      config: CFG,
      PERK_MASTER,
    };

    if (WB) {
      WB.prestige = api;
    } else {
      window.WB_PRESTIGE = api;
    }

    // 自動でUIを開くボタンは作らない（あなたの gameMenu から呼ぶ想定）
    console.log("[prestige] ready", { LS_PRESTIGE });
  });
})();
