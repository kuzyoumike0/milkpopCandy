// BGM.js — Milkpop牧場（購入・選択・SE/BGM分離・ハンバーガー対応）FINAL
(() => {
  "use strict";
  console.log("[BGM.js] LOADED FINAL", Date.now());

  /* =========================
   * Storage
   * ========================= */
  const LS_OWNED = "milkpop_bgm_owned_v3";
  const LS_SELECTED = "milkpop_bgm_selected_v3";
  const LS_SETTINGS = "milkpop_bgm_settings_v3";
  const LS_SE_VOL = "milkpop_se_volume_v1";

  /* =========================
   * BGM 定義（添付ファイル対応）
   * ========================= */
  const TRACKS = {
    morning:  { label: "朝BGM", src: "./assets/bgm_morning.mp3", price: 3000 },
    day:      { label: "昼BGM", src: "./assets/bgm_day.mp3",     price: 3000 },
    night:    { label: "夜BGM", src: "./assets/bgm_night.mp3",   price: 3000 },

    cocktail: { label: "🍸 カクテルグラス", src: "./assets/Cocktail_Glass.mp3", price: 6000 },
    stream:   { label: "🌊 小川のせせらぎ", src: "./assets/Stream.mp3",         price: 6000 },
    dokkan:   { label: "😂 おもしろすぎてどっかん", src: "./assets/おもしろすぎてどっかん.mp3", price: 8000 },
  };

  /* =========================
   * State
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let owned = JSON.parse(localStorage.getItem(LS_OWNED) || "{}");
  let selected = JSON.parse(localStorage.getItem(LS_SELECTED) || "null");
  let settings = JSON.parse(localStorage.getItem(LS_SETTINGS) || "null") || {
    enabled: true,
    volume: 0.5,
  };

  let unlocked = false;
  let audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";

  /* =========================
   * Audio Unlock
   * ========================= */
  async function unlockOnce() {
    if (unlocked) return;
    unlocked = true;
    try {
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    } catch {}
  }

  window.addEventListener("pointerdown", unlockOnce, { once: true, passive: true });

  /* =========================
   * Coin API
   * ========================= */
  function getCoins() {
    try { return Number(window.WB?.coins ?? 0); } catch { return 0; }
  }
  function spendCoins(n) {
    if (window.WB?.spendCoin) return window.WB.spendCoin(n);
    return false;
  }

  /* =========================
   * 再生制御
   * ========================= */
  async function playKey(key) {
    const t = TRACKS[key];
    if (!t || !owned[key]) return false;

    await unlockOnce();
    audio.src = t.src;
    audio.volume = clamp(settings.volume, 0, 1);

    try {
      await audio.play();
      selected = key;
      localStorage.setItem(LS_SELECTED, JSON.stringify(selected));
      return true;
    } catch (e) {
      console.warn("[BGM] play blocked", e);
      return false;
    }
  }

  function stop() {
    try { audio.pause(); } catch {}
    selected = null;
    localStorage.setItem(LS_SELECTED, "null");
  }

  /* =========================
   * UI
   * ========================= */
  function mountUI() {
    if (document.getElementById("bgmPanelFinal")) return;

    const panel = document.createElement("div");
    panel.id = "bgmPanelFinal";
    panel.style.cssText = `
      position:fixed; top:70px; right:12px;
      width:min(360px, 92vw);
      background:#fff; border-radius:16px;
      box-shadow:0 16px 40px rgba(0,0,0,.25);
      z-index:2147483600;
      padding:12px;
      display:none;
      font-family:system-ui;
    `;

    panel.innerHTML = `
      <div style="font-weight:900;font-size:16px;">🎵 BGM</div>
      <div id="bgmList"></div>

      <div style="margin-top:10px;font-weight:800;">音量</div>
      <input id="bgmVol" type="range" min="0" max="100" />

      <div style="margin-top:10px;">
        <button id="bgmStop" style="width:100%;padding:8px;border-radius:12px;">停止</button>
      </div>
    `;

    document.body.appendChild(panel);

    const list = panel.querySelector("#bgmList");
    const vol = panel.querySelector("#bgmVol");
    const stopBtn = panel.querySelector("#bgmStop");

    vol.value = Math.round(settings.volume * 100);
    vol.addEventListener("input", () => {
      settings.volume = clamp(vol.value / 100, 0, 1);
      audio.volume = settings.volume;
      localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    });

    stopBtn.onclick = stop;

    function refresh() {
      list.innerHTML = "";
      Object.entries(TRACKS).forEach(([key, t]) => {
        const own = !!owned[key];
        const div = document.createElement("div");
        div.style.marginTop = "8px";
        div.innerHTML = `
          <div style="font-weight:800;">${t.label}</div>
          <button>${own ? "流す" : `購入 ${t.price}🪙`}</button>
        `;
        const btn = div.querySelector("button");
        btn.onclick = async () => {
          await unlockOnce();
          if (!own) {
            if (!spendCoins(t.price)) return alert("コインが足りません");
            owned[key] = true;
            localStorage.setItem(LS_OWNED, JSON.stringify(owned));
          }
          playKey(key);
          refresh();
        };
        list.appendChild(div);
      });
    }

    refresh();

    // 外部から開けるように
    window.WB = Object.assign({}, window.WB, {
      bgm: {
        openModal() {
          panel.style.display = "block";
          unlockOnce();
        },
        playKey,
        stop,
      },
    });
  }

  /* =========================
   * Boot
   * ========================= */
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", mountUI);
  } else {
    mountUI();
  }
})();
