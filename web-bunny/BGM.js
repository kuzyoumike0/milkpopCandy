// BGM.js（非module / ✅購入＆選択UIが「必ず出る」完全版）
// - body待ちしてからUI生成（モーダルが出ない問題を根絶）
// - 購入 → 即選択 → 即再生
// - 自動BGM（時間帯）に戻す対応
// - WB差し替え耐性 / unlockAudioOnce 連結
// - ハンバーガーメニュー式UI

(() => {
  "use strict";
  console.log("[BGM.js] LOADED final");

  /* =========================
   * Storage keys
   * ========================= */
  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v2";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v2";
  const LS_KEY_SELECT   = "milkpop_bgm_selected_v2";

  /* =========================
   * Tracks / Prices
   * ========================= */
  const TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",
    depart:  "./assets/bgm_depart.mp3",
  };

  const PRICES = {
    morning: 3000,
    day:     3000,
    night:   3000,
    depart:  8000,
  };

  const LABELS = {
    morning: "朝BGM",
    day:     "昼BGM",
    night:   "夜BGM",
    depart:  "旅立ちBGM",
  };

  const UI = {
    btn:   "bgmHamburgerV3",
    panel: "bgmPanelV3",
    style: "bgmStyleV3",
  };

  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =========================
   * Load / Save
   * ========================= */
  function loadSettings() {
    try {
      const j = JSON.parse(localStorage.getItem(LS_KEY_SETTINGS) || "{}");
      return {
        volume: clamp(Number(j.volume ?? 0.5), 0, 1),
        muted: !!j.muted,
        enabled: j.enabled !== false,
      };
    } catch {
      return { volume: 0.5, muted: false, enabled: true };
    }
  }
  function saveSettings(s) {
    localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s));
  }

  function loadOwned() {
    try {
      const j = JSON.parse(localStorage.getItem(LS_KEY_OWNED) || "{}");
      return j && typeof j === "object" ? j : {};
    } catch { return {}; }
  }
  function saveOwned(o) {
    localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o));
  }

  function loadSelected() {
    try {
      const j = JSON.parse(localStorage.getItem(LS_KEY_SELECT) || "{}");
      return { selectedKey: j.selectedKey ?? null };
    } catch { return { selectedKey: null }; }
  }
  function saveSelected(s) {
    localStorage.setItem(LS_KEY_SELECT, JSON.stringify(s));
  }

  let settings = loadSettings();
  let owned    = loadOwned();
  let selected = loadSelected();

  /* =========================
   * Audio core
   * ========================= */
  let audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";

  let unlocked = false;
  let currentKey = null;

  function applyVolume() {
    audio.volume = settings.muted ? 0 : settings.volume;
  }

  function unlockOnce() {
    if (unlocked) return;
    unlocked = true;
    try {
      audio.muted = true;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        start(true);
      }).catch(() => {});
    } catch {}
  }

  window.addEventListener("pointerdown", unlockOnce, { once: true, passive: true });
  window.addEventListener("keydown", unlockOnce, { once: true, passive: true });

  function pickByTime() {
    const h = new Date().getHours();
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    return "night";
  }

  function isOwned(k) { return !!owned[k]; }

  async function play(key) {
    if (!TRACKS[key] || !isOwned(key)) return;
    if (!settings.enabled) return;
    if (!unlocked) return;

    if (currentKey !== key) {
      audio.src = TRACKS[key];
      audio.currentTime = 0;
      currentKey = key;
    }
    applyVolume();
    try { await audio.play(); } catch {}
  }

  function stop() {
    try { audio.pause(); } catch {}
  }

  function start(force = false) {
    let key = selected.selectedKey;
    if (!key || !isOwned(key)) {
      key = pickByTime();
      if (!isOwned(key)) key = Object.keys(TRACKS).find(isOwned) || null;
    }
    if (!key) return stop();
    if (!force && key === currentKey) return;
    play(key);
  }

  /* =========================
   * Coin helpers (WB互換)
   * ========================= */
  function getCoins() {
    try {
      if (window.WB?.getCoin) return WB.getCoin();
      if (typeof window.WB?.coins === "number") return window.WB.coins;
      return Number($("#coinValue")?.textContent || 0);
    } catch { return 0; }
  }

  function spendCoins(n) {
    n = Math.floor(n);
    if (getCoins() < n) return false;
    try {
      if (window.WB?.spendCoin) return WB.spendCoin(n);
      window.WB.coins -= n;
      return true;
    } catch { return false; }
  }

  /* =========================
   * UI
   * ========================= */
  function mountUI() {
    if ($("#" + UI.btn)) return;

    if (!document.getElementById(UI.style)) {
      const st = document.createElement("style");
      st.id = UI.style;
      st.textContent = `
#${UI.btn}{
  position:fixed; top:10px; right:10px;
  width:44px;height:44px; border:none;
  border-radius:14px; cursor:pointer;
  background:#fff; box-shadow:0 12px 32px rgba(0,0,0,.2);
  z-index:2147483000;
}
#${UI.panel}{
  position:fixed; top:62px; right:10px;
  width:340px; max-width:92vw;
  background:#fff; border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.25);
  padding:12px; display:none;
  z-index:2147483001;
}
.item{ display:flex; justify-content:space-between; gap:8px; margin:8px 0; }
.item button{ border:none; border-radius:12px; padding:6px 10px; cursor:pointer; }
.active{ background:#333;color:#fff; }
`;
      document.head.appendChild(st);
    }

    const btn = document.createElement("button");
    btn.id = UI.btn;
    btn.textContent = "🎵";

    const panel = document.createElement("div");
    panel.id = UI.panel;

    panel.innerHTML = `
<b>BGM設定</b>
<div style="margin:6px 0">
  <button id="bgmOn">ON/OFF</button>
  <button id="bgmMute">ミュート</button>
</div>
<input id="bgmVol" type="range" min="0" max="100">
<hr>
<div id="bgmShop"></div>
<button id="bgmAuto">🔁 自動に戻す</button>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.onclick = () => {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
      render();
    };

    $("#bgmOn", panel).onclick = () => {
      settings.enabled = !settings.enabled;
      saveSettings(settings);
      settings.enabled ? start(true) : stop();
    };

    $("#bgmMute", panel).onclick = () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
    };

    const vol = $("#bgmVol", panel);
    vol.value = Math.round(settings.volume * 100);
    vol.oninput = () => {
      settings.volume = vol.value / 100;
      saveSettings(settings);
      applyVolume();
    };

    $("#bgmAuto", panel).onclick = () => {
      selected.selectedKey = null;
      saveSelected(selected);
      start(true);
    };

    function render() {
      const shop = $("#bgmShop", panel);
      shop.innerHTML = "";
      Object.keys(TRACKS).forEach(k => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
<span>${LABELS[k]} (${PRICES[k]}🪙)</span>
<div>
  <button data-buy>購入</button>
  <button data-sel>流す</button>
</div>`;
        const [buy, sel] = row.querySelectorAll("button");

        buy.disabled = isOwned(k) || getCoins() < PRICES[k];
        buy.onclick = () => {
          if (spendCoins(PRICES[k])) {
            owned[k] = true;
            saveOwned(owned);
            selected.selectedKey = k;
            saveSelected(selected);
            start(true);
            render();
          }
        };

        sel.disabled = !isOwned(k);
        sel.classList.toggle("active", selected.selectedKey === k);
        sel.onclick = () => {
          selected.selectedKey = k;
          saveSelected(selected);
          start(true);
          render();
        };

        shop.appendChild(row);
      });
    }

    render();
  }

  /* =========================
   * Boot（★重要：body待ち）
   * ========================= */
  (function waitBody(){
    if (!document.body) return setTimeout(waitBody, 50);
    mountUI();
    start(false);
    setInterval(() => start(false), 30000);
  })();

})();
