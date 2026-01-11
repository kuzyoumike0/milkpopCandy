// prestige.js（転生：コイン＆うさぎリセット →「牧場の星」獲得 → 恒久解放）
// ✅ Milkpop対応版（WB.coins 正式対応）
// ✅ zisseki/zukan 非依存・単体完結
// ✅ 星の保存：localStorage wb_prestige_v1
// ✅ 誤爆防止：長押し 1.2秒

(() => {
  "use strict";
  if (window.__WB_PRESTIGE_V1__) return;
  window.__WB_PRESTIGE_V1__ = true;

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  const CFG = {
    STAR_BASE_COINS: 50000,
    MIN_COINS_TO_PRESTIGE: 50000,
    HOLD_MS: 1200,

    DEEP_LOCALSTORAGE_WIPE: false,
    WIPE_KEYS: [
      "wb_coins_v6",
      "wb_bunnies_v6",
      "wb_state_v1",
    ],

    LABEL: {
      title: "🌟 転生（牧場の星）",
      prestigeBtn: "🌟 転生する",
      close: "閉じる",
      unlock: "解放",
      unlocked: "解放済",
    },
  };

  const LS_PRESTIGE = "wb_prestige_v1";

  /* =========================
   * WB wait
   * ========================= */
  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB) {
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

  /* =========================
   * Utils
   * ========================= */
  function loadJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? def;
    } catch {
      return def;
    }
  }

  function saveJson(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }

  function clamp(n, a, b) {
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

  /* =========================
   * ✅ Milkpop 正式コイン取得
   * ========================= */
  function getCoins(WB) {
    try {
      if (WB && typeof WB.coins === "number") {
        return Math.floor(WB.coins);
      }
    } catch {}

    const el = document.getElementById("coinValue");
    if (el) {
      const n = Number(el.textContent.replace(/[^\d]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function setCoinsZero(WB) {
    try {
      if (WB && typeof WB.coins === "number") {
        WB.coins = 0;
        WB.updateHud?.();
        WB.emit?.("coinsChanged", { coins: 0 });
        return true;
      }
    } catch {}

    const el = document.getElementById("coinValue");
    if (el) el.textContent = "0";
    return true;
  }

  function removeAllBunnies(WB) {
    try { WB?.removeAllBunnies?.(); } catch {}

    try {
      document.querySelectorAll(".bunnyWrap,.bunny-wrap").forEach(el => el.remove());
    } catch {}

    try {
      const bl = document.getElementById("bunnyLayer");
      if (bl) bl.replaceChildren();
    } catch {}
  }

  function deepWipeLocalStorage() {
    if (!CFG.DEEP_LOCALSTORAGE_WIPE) return;
    CFG.WIPE_KEYS.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  }

  /* =========================
   * 星計算
   * ========================= */
  function calcStarsFromCoins(coins) {
    if (coins < CFG.MIN_COINS_TO_PRESTIGE) return 0;
    return Math.floor(Math.sqrt(coins / CFG.STAR_BASE_COINS));
  }

  /* =========================
   * Prestige State
   * ========================= */
  function defaultPrestigeState() {
    return { ver:1, stars:0, spent:0, perks:{}, history:[] };
  }

  function loadPrestige() {
    return loadJson(LS_PRESTIGE, defaultPrestigeState());
  }

  function savePrestige(st) {
    saveJson(LS_PRESTIGE, st);
  }

  /* =========================
   * UI
   * ========================= */
  const PANEL_ID = "wbPrestigePanelV1";

  function ensureStyle() {
    if (document.getElementById("wbPrestigeStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbPrestigeStyleV1";
    s.textContent = `
#${PANEL_ID}{position:fixed; inset:0; z-index:2147483647; display:none;}
#${PANEL_ID} .bg{position:absolute; inset:0; background:rgba(0,0,0,.4);}
#${PANEL_ID} .card{
  position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(860px,94vw);
  max-height:84vh;
  background:#fff;
  border-radius:18px;
  display:flex; flex-direction:column;
}
#${PANEL_ID} .head{
  display:flex; justify-content:space-between;
  padding:12px; border-bottom:1px solid #ddd;
}
#${PANEL_ID} .body{ padding:14px; overflow:auto; }
#${PANEL_ID} .btn{
  border:none; border-radius:12px;
  padding:10px 14px; font-weight:1000;
  cursor:pointer;
}
#${PANEL_ID} .danger{ background:#ffd6e7; }
.hold{ position:relative; overflow:hidden; }
.hold .fill{ position:absolute; inset:0; width:0%; background:rgba(0,0,0,.1); }
`;
    document.head.appendChild(s);
  }

  function buildPanel() {
    ensureStyle();
    let p = document.getElementById(PANEL_ID);
    if (p) return p;

    p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
      <div class="bg"></div>
      <div class="card">
        <div class="head">
          <b>${CFG.LABEL.title}</b>
          <button class="btn close">${CFG.LABEL.close}</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(p);

    p.querySelector(".bg").onclick =
    p.querySelector(".close").onclick = () => p.style.display = "none";

    return p;
  }

  function open() {
    const p = buildPanel();
    p.style.display = "block";
    render();
  }

  function render() {
    const WB = window.WB;
    const p = buildPanel();
    const body = p.querySelector(".body");

    const st = loadPrestige();
    const coins = getCoins(WB);
    const gain = calcStarsFromCoins(coins);

    body.innerHTML = `
      <p>現在コイン：🪙 <b>${coins.toLocaleString()}</b></p>
      <p>現在の星：🌟 <b>${st.stars}</b></p>
      <p>今回の転生で獲得：🌟 <b>+${gain}</b></p>

      <button class="btn danger hold" ${gain<=0?"disabled":""}>
        ${CFG.LABEL.prestigeBtn}（長押し）
        <i class="fill"></i>
      </button>
    `;

    const btn = body.querySelector(".hold");
    if (!btn) return;

    let downAt = 0, raf = 0, holding = false;
    const fill = btn.querySelector(".fill");

    const step = () => {
      if (!holding) return;
      const p = clamp((Date.now()-downAt)/CFG.HOLD_MS,0,1);
      fill.style.width = `${p*100}%`;
      if (p>=1) {
        holding=false;
        doPrestige();
        return;
      }
      raf=requestAnimationFrame(step);
    };

    btn.onpointerdown = e => {
      if (btn.disabled) return;
      holding=true; downAt=Date.now(); step();
    };
    ["pointerup","pointerleave","pointercancel"].forEach(ev=>{
      btn.addEventListener(ev,()=>{
        holding=false; fill.style.width="0%";
        if(raf) cancelAnimationFrame(raf);
      });
    });

    function doPrestige() {
      const coins = getCoins(WB);
      const stars = calcStarsFromCoins(coins);
      if (stars<=0) return;

      st.stars += stars;
      st.history.push({ t:Date.now(), coins, stars });
      savePrestige(st);

      setCoinsZero(WB);
      removeAllBunnies(WB);
      deepWipeLocalStorage();

      render();
    }
  }

  /* =========================
   * Public API
   * ========================= */
  waitForWB().then(WB=>{
    const api = {
      open,
      load: loadPrestige,
      hasPerk: id => !!loadPrestige().perks?.[id],
      getStars: () => loadPrestige().stars,
    };

    if (WB) WB.prestige = api;
    else window.WB_PRESTIGE = api;

    console.log("[prestige] ready (Milkpop compatible)");
  });

})();
