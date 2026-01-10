// BGM.js（非module）— ✅WBマージ対応 / ✅BGMモーダル必ず表示 / ✅SE音量もここで管理
// v1.2:
// ✅ registerSE()/unregisterSE() で任意SE(UFO.mp3等)をスライダー追従
// ✅ mute時も登録SEへ反映
// ✅ 末尾の閉じ忘れ/未定義関数を根絶（これが「全部止まる」原因になりやすい）
(() => {
  "use strict";
  console.log("[BGM.js] LOADED v1.2 (WB merge + guaranteed modal + registerSE)", Date.now());

  /* =========================
   * Config / Storage
   * ========================= */
  const LS_KEY_BGM_SETTINGS = "milkpop_bgm_settings_v2"; // { muted: bool, bgmVol:0..1, seVol:0..1 }
  const LS_KEY_SE_VOL       = "milkpop_se_volume_v1";   // 0..1 (互換)
  const LS_KEY_BGM_VOL      = "milkpop_bgm_volume_v1";  // 0..1 (互換)

  // BGMの音源（存在しなくてもモーダルは出る）
  // 1) window.MILKPOP_BGM = { morning:"...", day:"...", night:"..." } があればそれを使う
  // 2) 無ければデフォルトパス
  const DEFAULT_BGM = {
    morning: "./assets/bgm/morning.mp3",
    day:     "./assets/bgm/day.mp3",
    night:   "./assets/bgm/night.mp3",
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Load/Save Settings
   * ========================= */
  function loadSettings() {
    // 新形式
    try {
      const raw = localStorage.getItem(LS_KEY_BGM_SETTINGS);
      if (raw) {
        const j = JSON.parse(raw);
        return {
          muted: !!j.muted,
          bgmVol: clamp(Number(j.bgmVol ?? j.bgm ?? localStorage.getItem(LS_KEY_BGM_VOL) ?? 0.35) || 0.35, 0, 1),
          seVol:  clamp(Number(j.seVol  ?? localStorage.getItem(LS_KEY_SE_VOL)  ?? 0.85) || 0.85, 0, 1),
        };
      }
    } catch {}

    // 旧互換
    const bgmVol = clamp(Number(localStorage.getItem(LS_KEY_BGM_VOL) ?? 0.35) || 0.35, 0, 1);
    const seVol  = clamp(Number(localStorage.getItem(LS_KEY_SE_VOL)  ?? 0.85) || 0.85, 0, 1);
    return { muted: false, bgmVol, seVol };
  }

  function saveSettings(s) {
    const j = {
      muted: !!s.muted,
      bgmVol: clamp(Number(s.bgmVol) || 0, 0, 1),
      seVol:  clamp(Number(s.seVol)  || 0, 0, 1),
    };
    try { localStorage.setItem(LS_KEY_BGM_SETTINGS, JSON.stringify(j)); } catch {}
    try { localStorage.setItem(LS_KEY_BGM_VOL, String(j.bgmVol)); } catch {}
    try { localStorage.setItem(LS_KEY_SE_VOL,  String(j.seVol)); } catch {}
  }

  let settings = loadSettings();

  // app.js が参照する “SE音量の共有”
  window.__milkpopSeVolume = settings.seVol;

  /* =========================
   * ✅ Registered SE list
   * ========================= */
  const registeredSE = new Set(); // Set<HTMLAudioElement>

  function isAudioLike(x) {
    return x && (typeof x === "object")
      && (typeof x.play === "function")
      && (typeof x.pause === "function")
      && ("volume" in x);
  }

  function currentSeAppliedVolume() {
    // muted なら 0 / それ以外はスライダー
    return settings.muted ? 0 : clamp(settings.seVol, 0, 1);
  }

  function applySeSettingsToRegistered() {
    const vol = currentSeAppliedVolume();
    registeredSE.forEach(a => {
      try {
        a.muted = !!settings.muted;
        a.volume = vol;
      } catch {}
    });
  }

  function registerSE(audioEl) {
    if (!isAudioLike(audioEl)) return false;
    registeredSE.add(audioEl);
    // 登録直後に現在設定を反映（UFOが即追従）
    applySeSettingsToRegistered();
    return true;
  }

  function unregisterSE(audioEl) {
    try { registeredSE.delete(audioEl); } catch {}
  }

  function setSeVolume(v) {
    settings.seVol = clamp(Number(v) || 0, 0, 1);
    window.__milkpopSeVolume = settings.seVol;
    saveSettings(settings);

    // ✅ 登録SEにも反映（UFOなど）
    applySeSettingsToRegistered();

    // app.js 側の playSE がこれを見てる想定
    window.dispatchEvent(new Event("milkpop:seVolume"));
  }

  function setBgmVolume(v) {
    settings.bgmVol = clamp(Number(v) || 0, 0, 1);
    saveSettings(settings);
    applyBgmVolume();
  }

  function setMuted(m) {
    settings.muted = !!m;
    saveSettings(settings);
    applyMute();
    // ✅ 登録SEにも反映（mute/unmute）
    applySeSettingsToRegistered();
  }

  /* =========================
   * BGM Player
   * ========================= */
  const bgm = new Audio();
  bgm.loop = true;
  bgm.preload = "auto";

  let audioUnlocked = false;

  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    // app.js側にもunlockがあるなら呼ぶ（あっても無くてもOK）
    try { window.WB?.unlockAudioOnce?.(); } catch {}

    // iOS等の自動再生ロック解除のため無音再生→停止
    try {
      bgm.muted = true;
      bgm.currentTime = 0;
      bgm.play()
        .then(() => {
          bgm.pause();
          bgm.currentTime = 0;
          bgm.muted = false;
          applyMute();
        })
        .catch(() => {
          bgm.muted = false;
          applyMute();
        });
    } catch {
      try { bgm.muted = false; } catch {}
      applyMute();
    }
  }

  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function pickBgmSrc() {
    const map = (window.MILKPOP_BGM && typeof window.MILKPOP_BGM === "object")
      ? window.MILKPOP_BGM
      : DEFAULT_BGM;

    // JST想定（ユーザーのローカル時刻）
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return map.morning || map.day || map.night;
    if (h >= 11 && h < 18) return map.day || map.morning || map.night;
    return map.night || map.day || map.morning;
  }

  function applyBgmVolume() {
    try {
      bgm.volume = settings.muted ? 0 : clamp(settings.bgmVol, 0, 1);
    } catch {}
  }

  function applyMute() {
    try { bgm.muted = !!settings.muted; } catch {}
    applyBgmVolume();
  }

  async function play() {
    unlockAudioOnce();
    const src = pickBgmSrc();
    if (!src) return;

    // srcが変わった時だけ差し替え
    try {
      const href = new URL(src, location.href).href;
      if (bgm.src !== href) bgm.src = src;
    } catch {
      if (bgm.src !== src) bgm.src = src;
    }

    applyMute();

    try {
      if (audioUnlocked) await bgm.play();
    } catch (e) {
      console.warn("[BGM] play blocked:", e?.message || e);
    }
  }

  function pause() {
    try { bgm.pause(); } catch {}
  }

  // 時間帯変化で曲切替（再生中のみ）
  let lastSlot = null;
  function slotOfHour(h) {
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 18) return "day";
    return "night";
  }

  setInterval(() => {
    try {
      const slot = slotOfHour(new Date().getHours());
      if (lastSlot == null) lastSlot = slot;
      if (slot !== lastSlot) {
        lastSlot = slot;
        if (!bgm.paused) play();
      }
    } catch {}
  }, 30_000);

  /* =========================
   * Modal UI (guaranteed visible)
   * ========================= */
  const UI = {
    style: "milkpopBgmStyleV1",
    backdrop: "bgmBackdrop",
    panel: "bgmPanel",
    btnInHud: "bgmBtn",
  };

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const st = document.createElement("style");
    st.id = UI.style;
    st.textContent = `
      #${UI.backdrop}{
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0,0,0,.35) !important;
        z-index: 200000 !important;
        display: none;
      }
      #${UI.panel}{
        position: fixed !important;
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: min(92vw, 420px) !important;
        background: #fff !important;
        border-radius: 16px !important;
        box-shadow: 0 14px 50px rgba(0,0,0,.25) !important;
        z-index: 200001 !important;
        display: none;
        padding: 14px 14px 12px !important;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif !important;
      }
      #${UI.panel} h3{
        margin: 0 0 10px 0 !important;
        font-size: 16px !important;
      }
      #${UI.panel} .row{
        display:flex; align-items:center; gap:10px;
        margin: 10px 0;
      }
      #${UI.panel} .row label{
        width: 92px; font-size: 13px; opacity:.85;
      }
      #${UI.panel} input[type="range"]{ flex: 1; }
      #${UI.panel} .actions{
        display:flex; gap:10px; justify-content:flex-end;
        margin-top: 12px;
      }
      #${UI.panel} button{
        border: 0; border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
      }
      #${UI.panel} .primary{ background:#ffd6e7; }
      #${UI.panel} .ghost{ background:#f2f2f2; }
    `;
    document.head.appendChild(st);
  }

  function ensureModal() {
    ensureStyle();

    let backdrop = document.getElementById(UI.backdrop);
    let panel = document.getElementById(UI.panel);

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = UI.backdrop;
      document.body.appendChild(backdrop);
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = UI.panel;
      panel.innerHTML = `
        <h3>🎵 BGM / SE 設定</h3>

        <div class="row">
          <label>ミュート</label>
          <input id="bgmMuteToggle" type="checkbox" />
          <span style="font-size:12px;opacity:.75">（BGM/SE）</span>
        </div>

        <div class="row">
          <label>BGM音量</label>
          <input id="bgmVolRange" type="range" min="0" max="1" step="0.01" />
          <span id="bgmVolVal" style="width:46px;text-align:right;font-size:12px;opacity:.75"></span>
        </div>

        <div class="row">
          <label>SE音量</label>
          <input id="seVolRange" type="range" min="0" max="1" step="0.01" />
          <span id="seVolVal" style="width:46px;text-align:right;font-size:12px;opacity:.75"></span>
        </div>

        <div class="row" style="margin-top:6px;">
          <button id="bgmPlayBtn" class="primary" type="button">▶ 再生</button>
          <button id="bgmPauseBtn" class="ghost" type="button">⏸ 停止</button>
          <button id="bgmReloadBtn" class="ghost" type="button">⟳ 曲を更新</button>
        </div>

        <div class="actions">
          <button id="bgmCloseBtn" class="ghost" type="button">閉じる</button>
        </div>
      `;
      document.body.appendChild(panel);
    }

    backdrop.onclick = () => closeModal();
    panel.onclick = (e) => e.stopPropagation();

    const mute = $("#bgmMuteToggle", panel);
    const bgmR = $("#bgmVolRange", panel);
    const seR  = $("#seVolRange", panel);
    const bgmV = $("#bgmVolVal", panel);
    const seV  = $("#seVolVal", panel);

    const syncUI = () => {
      mute.checked = !!settings.muted;
      bgmR.value = String(settings.bgmVol);
      seR.value  = String(settings.seVol);
      bgmV.textContent = Math.round(settings.bgmVol * 100) + "%";
      seV.textContent  = Math.round(settings.seVol * 100) + "%";
    };

    mute.onchange = () => { setMuted(mute.checked); syncUI(); };
    bgmR.oninput  = () => { setBgmVolume(bgmR.value); syncUI(); };
    seR.oninput   = () => { setSeVolume(seR.value); syncUI(); };

    $("#bgmPlayBtn", panel).onclick   = () => play();
    $("#bgmPauseBtn", panel).onclick  = () => pause();
    $("#bgmReloadBtn", panel).onclick = () => { try { bgm.src = ""; } catch {} play(); };
    $("#bgmCloseBtn", panel).onclick  = () => closeModal();

    syncUI();
    return { backdrop, panel, syncUI };
  }

  let modal = null;

  function openModal() {
    unlockAudioOnce();
    modal = modal || ensureModal();
    modal.syncUI?.();
    modal.backdrop.style.display = "block";
    modal.panel.style.display = "block";
  }

  function closeModal() {
    if (!modal) return;
    modal.backdrop.style.display = "none";
    modal.panel.style.display = "none";
  }

  /* =========================
   * WB Export (merge)
   * ========================= */
  function exportWB() {
    const prev = (window.WB && typeof window.WB === "object") ? window.WB : {};
    const bgmApi = {
      openModal,
      closeModal,
      play,
      pause,
      setMuted,
      setBgmVolume,
      setSeVolume,

      registerSE,
      unregisterSE,

      getState: () => ({ ...settings, playing: !bgm.paused }),
    };

    const next = Object.assign({}, prev);
    next.bgm = Object.assign({}, (prev.bgm || {}), bgmApi);

    if (typeof next.getSEVolume !== "function") {
      next.getSEVolume = () => clamp(Number(window.__milkpopSeVolume) || settings.seVol || 0.85, 0, 1);
    }
    if (typeof next.unlockAudioOnce !== "function") {
      next.unlockAudioOnce = unlockAudioOnce;
    }

    window.WB = next;
  }

  exportWB();

  /* =========================
   * app.js からの emit("ui:bgm") を受けて開く
   * ========================= */
  (function hookUiEvent() {
    try {
      if (window.WB?.on) window.WB.on("ui:bgm", () => openModal());
    } catch {}
    window.addEventListener("milkpop:openBgm", () => openModal());
  })();

  /* =========================
   * HUDにBGMボタンを生やす（無ければ）
   * ========================= */
  (function ensureHudButtonLater() {
    function ensureHudButton() {
      if (document.getElementById(UI.btnInHud)) return;
      const hudButtons = document.getElementById("hudButtons");
      if (!hudButtons) return;

      const btn = document.createElement("button");
      btn.id = UI.btnInHud;
      btn.type = "button";
      btn.textContent = "🎵BGM";
      btn.style.marginLeft = "6px";
      btn.addEventListener("click", () => openModal());
      hudButtons.appendChild(btn);
    }
    setTimeout(ensureHudButton, 200);
  })();

  // 初期反映
  applyMute();
  applyBgmVolume();
  applySeSettingsToRegistered();
})();
