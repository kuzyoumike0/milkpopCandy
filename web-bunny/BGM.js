// BGM.js（非module / ✅WB差し替え耐性版）
// ✅ FIX: app.js が window.WB を丸ごと再代入しても、一定時間監視して再パッチする
// ✅ FIX: 既存の WB.unlockAudioOnce があっても連結してBGMも解禁
// ✅ FIX: 初回クリックで「必ず一度」再生を試す（autoplay対策）
// - ハンバーガーUIを自動で出す
// - 朝/昼/夜の自動切り替え
// - 特別BGM：WB.bgm.playSpecial / clearSpecial

(() => {
  "use strict";

  const LS_KEY = "milkpop_bgm_settings_v1";

  const TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",
    depart:  "./assets/bgm_depart.mp3",
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { volume: 0.5, muted: false, enabled: true };
      const j = JSON.parse(raw);
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
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  }

  let settings = loadSettings();

  // BGM.js側の解禁フラグ
  let unlocked = false;
  let currentKey = null;
  let specialKey = null;

  let audio = null;

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyVolume();
    return audio;
  }

  function applyVolume() {
    ensureAudio();
    audio.volume = settings.muted ? 0 : settings.volume;
  }

  function pickByTime() {
    const h = new Date().getHours();
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    return "night";
  }

  async function tryPlay(src) {
    ensureAudio();
    if (!src) return false;

    const nextHref = new URL(src, location.href).href;
    if (audio.src !== nextHref) {
      try { audio.pause(); } catch {}
      audio.src = src;
      audio.currentTime = 0;
    }

    applyVolume();

    if (!settings.enabled) return false;
    if (!unlocked) return false;

    try {
      await audio.play();
      return true;
    } catch (e) {
      // autoplay等で失敗することがある（ここは静かに失敗でOK）
      return false;
    }
  }

  function stop() {
    if (!audio) return;
    try { audio.pause(); } catch {}
  }

  function startNormalBgm(force = false) {
    if (specialKey) return;

    const key = pickByTime();
    if (!force && key === currentKey) return;

    const src = TRACKS[key];
    currentKey = key;

    tryPlay(src);
  }

  async function unlockBgmOnce() {
    if (unlocked) return;
    unlocked = true;

    // ✅ unlock時に必ず一度再生を試す（クリック直後に走る想定）
    if (specialKey) {
      const src = TRACKS[specialKey];
      if (src) await tryPlay(src);
    } else {
      startNormalBgm(true);
    }
  }

  /* =========================
   * ✅ WBパッチ（差し替え耐性）
   * ========================= */
  let lastWBRef = null;

  function patchWB(WB) {
    if (!WB || typeof WB !== "object") return;

    // 既に同じWBにパッチ済みなら何もしない
    if (lastWBRef === WB && WB.__bgmPatchedV2) return;

    // 新しいWBに切り替わった
    lastWBRef = WB;

    // 二重パッチ防止
    if (!WB.__bgmPatchedV2) WB.__bgmPatchedV2 = { done: false };

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;

    // ✅ 連結（上書きではなく「前→BGM解禁」）
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    // 公開API
    WB.bgm = WB.bgm || {};
    WB.bgm.mountUI = mountUI;
    WB.bgm.playSpecial = playSpecial;
    WB.bgm.clearSpecial = clearSpecial;
    WB.bgm.start = () => startNormalBgm(true);
    WB.bgm.stop = () => stop();
    WB.bgm.TRACKS = TRACKS;

    WB.__bgmPatchedV2.done = true;

    // もし既にユーザーがクリック済みでunlockedになってるなら再開しておく
    if (unlocked && settings.enabled) {
      if (specialKey) {
        const src = TRACKS[specialKey];
        if (src) tryPlay(src);
      } else {
        startNormalBgm(true);
      }
    }
  }

  // ✅ window.WB が後から差し替わっても追従する監視
  function startWBWatcher() {
    // まず即時1回
    patchWB(window.WB);

    // その後しばらく監視（app.jsの読み込み順ゆらぎ対策）
    const start = Date.now();
    const watchMs = 15000; // 15秒監視（十分）
    const t = setInterval(() => {
      patchWB(window.WB);
      if (Date.now() - start > watchMs) clearInterval(t);
    }, 200);
  }

  /* =========================
   * Autoplay unlock
   * ========================= */
  function setupAutoplayUnlock() {
    const handler = async () => {
      // ✅ 「最新のWB」を必ずパッチしてから解禁を呼ぶ
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
    };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });
  }

  function startTimeWatcher() {
    setInterval(() => startNormalBgm(false), 30_000);
  }

  /* =========================
   * Settings UI（ハンバーガー）
   * ========================= */
  function mountUI({ position = "top-right", title = "BGM" } = {}) {
    if (document.getElementById("bgmHamburgerV1")) return;

    const style = document.createElement("style");
    style.textContent = `
#bgmHamburgerV1{
  position:fixed;
  z-index:2147483000;
  ${position.includes("top") ? "top:10px;" : "bottom:10px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:44px;height:44px;
  border:none;border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
#bgmHamburgerV1 .bars{ width:18px; height:14px; position:relative; }
#bgmHamburgerV1 .bars i{
  position:absolute; left:0; right:0;
  height:2px; border-radius:2px;
  background:#333;
}
#bgmHamburgerV1 .bars i:nth-child(1){ top:0; }
#bgmHamburgerV1 .bars i:nth-child(2){ top:6px; }
#bgmHamburgerV1 .bars i:nth-child(3){ top:12px; }

#bgmPanelV1{
  position:fixed;
  z-index:2147483001;
  ${position.includes("top") ? "top:62px;" : "bottom:62px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:min(320px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px 12px 10px;
  display:none;
}
#bgmPanelV1 .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#bgmPanelV1 .ttl{ font-weight:900; }
#bgmPanelV1 .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#bgmPanelV1 .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:800;
  background:#ffd6e7;
  cursor:pointer;
}
#bgmPanelV1 .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
#bgmPanelV1 .slider{ width:100%; margin:10px 0 6px; }
#bgmPanelV1 .fine{ font-size:12px; opacity:.75; }
#bgmPanelV1 .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }
`;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.id = "bgmHamburgerV1";
    btn.type = "button";
    btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
    btn.title = "BGM設定";

    const panel = document.createElement("div");
    panel.id = "bgmPanelV1";
    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">${title}</div>
    <div class="sub" id="bgmStateTextV1">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV1" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV1" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV1" type="button">ミュート</button>
</div>

<input class="slider" id="bgmVolV1" type="range" min="0" max="100" step="1" />

<div class="fine" id="bgmInfoV1"></div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const stateText = panel.querySelector("#bgmStateTextV1");
    const info = panel.querySelector("#bgmInfoV1");
    const toggle = panel.querySelector("#bgmToggleV1");
    const mute = panel.querySelector("#bgmMuteV1");
    const vol = panel.querySelector("#bgmVolV1");
    const close = panel.querySelector("#bgmCloseV1");

    function refreshUI() {
      vol.value = String(Math.round(settings.volume * 100));
      toggle.textContent = settings.enabled ? "ON" : "OFF";
      toggle.style.opacity = settings.enabled ? "1" : "0.6";
      mute.textContent = settings.muted ? "ミュート中" : "ミュート";
      mute.style.opacity = settings.muted ? "0.75" : "1";

      const nowKey = specialKey || currentKey || pickByTime();
      const mode = specialKey ? `特別BGM：${specialKey}` : `通常：${nowKey}`;
      const u = unlocked ? "解禁済み" : "未解禁（クリックで開始）";
      info.textContent = `${mode} / ${u}`;

      if (stateText) {
        const playing = audio && !audio.paused && unlocked && settings.enabled && !settings.muted && audio.volume > 0;
        stateText.textContent = playing ? "再生中" : "停止中（クリックで開始）";
      }
    }

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      refreshUI();
    });

    close.addEventListener("click", () => { panel.style.display = "none"; });

    toggle.addEventListener("click", async () => {
      settings.enabled = !settings.enabled;
      saveSettings(settings);

      if (!settings.enabled) stop();
      else {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        if (specialKey) tryPlay(TRACKS[specialKey]);
        else startNormalBgm(true);
      }
      refreshUI();
    });

    mute.addEventListener("click", () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
      refreshUI();
    });

    vol.addEventListener("input", async () => {
      settings.volume = clamp(Number(vol.value) / 100, 0, 1);
      saveSettings(settings);
      applyVolume();

      if (settings.enabled) {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        if (specialKey) tryPlay(TRACKS[specialKey]);
        else startNormalBgm(false);
      }
      refreshUI();
    });

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.style.display = "none";
    });

    setInterval(refreshUI, 500);
    refreshUI();
  }

  /* =========================
   * Public API
   * ========================= */
  function playSpecial(keyOrSrc) {
    const src = TRACKS[keyOrSrc] || keyOrSrc;
    if (!src) return;

    specialKey = TRACKS[keyOrSrc] ? keyOrSrc : "__custom__";
    ensureAudio();
    tryPlay(src);
  }

  function clearSpecial() {
    specialKey = null;
    startNormalBgm(true);
  }

  /* =========================
   * Boot
   * ========================= */
  (function boot() {
    ensureAudio();
    startWBWatcher();        // ✅ ここが重要：WB差し替え監視
    setupAutoplayUnlock();   // ✅ クリックで確実にunlock
    startNormalBgm(false);
    startTimeWatcher();

    // UI
    mountUI({ position: "top-right", title: "BGM" });
  })();
})();
