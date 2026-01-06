// BGM.js
// - クリック/タップでオーディオを解禁（autoplay制限対策）
// - 横線三本（ハンバーガー）から音量/ミュート調整
// - 朝/昼/夜の自動切り替え（存在しないファイルは無視）
// - 特別BGM（旅立ち等）を再生/解除：bgmPlaySpecial / bgmClearSpecial

const LS_KEY = "milkpop_bgm_settings_v1";

const TRACKS = {
  morning: "./assets/bgm_morning.mp3",
  day:     "./assets/bgm_day.mp3",
  night:   "./assets/bgm_night.mp3",
  // special例（任意）："./assets/bgm_depart.mp3" を使いたいなら playSpecial("depart")
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

let unlocked = false;            // ユーザー操作で解禁済みか
let currentKey = null;           // 現在再生している通常BGMキー
let specialKey = null;           // 特別BGMキー（再生中なら通常BGMを止める）

let audio = null;                // 現在の Audio 要素（1つに統一）

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
  // 朝 5-10 / 昼 11-17 / 夜 18-4
  if (h >= 5 && h <= 10) return "morning";
  if (h >= 11 && h <= 17) return "day";
  return "night";
}

async function tryPlay(src) {
  ensureAudio();
  if (!src) return false;

  // src更新が必要なら差し替え
  if (audio.src !== new URL(src, location.href).href) {
    audio.pause();
    audio.src = src;
    audio.currentTime = 0;
  }

  applyVolume();

  if (!settings.enabled) return false;
  if (!unlocked) return false;

  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function stop() {
  if (!audio) return;
  try { audio.pause(); } catch {}
}

function startNormalBgm(force = false) {
  // 特別BGM中は通常を鳴らさない
  if (specialKey) return;

  const key = pickByTime();
  if (!force && key === currentKey) return;

  const src = TRACKS[key];
  currentKey = key;

  // ファイルが存在しないときでもエラーにせず、再生だけ失敗する
  tryPlay(src);
}

function setupAutoplayUnlock() {
  const unlockOnce = async () => {
    if (unlocked) return;
    unlocked = true;

    // 解禁した瞬間に、いま鳴らすべきBGMを再生
    if (specialKey) {
      await tryPlay(TRACKS[specialKey]);
    } else {
      startNormalBgm(true);
    }

    window.removeEventListener("pointerdown", unlockOnce);
    window.removeEventListener("keydown", unlockOnce);
    window.removeEventListener("touchstart", unlockOnce);
  };

  // iOS/Safari対策で touchstart も付ける
  window.addEventListener("pointerdown", unlockOnce, { once: false });
  window.addEventListener("keydown", unlockOnce, { once: false });
  window.addEventListener("touchstart", unlockOnce, { once: false });
}

function startTimeWatcher() {
  // 30秒ごとに「朝/昼/夜」の切替チェック（軽い）
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

  close.addEventListener("click", () => {
    panel.style.display = "none";
  });

  toggle.addEventListener("click", () => {
    settings.enabled = !settings.enabled;
    saveSettings(settings);
    if (!settings.enabled) stop();
    else {
      // 解禁済みなら即再生
      if (unlocked) {
        if (specialKey) tryPlay(TRACKS[specialKey]);
        else startNormalBgm(true);
      }
    }
    refreshUI();
  });

  mute.addEventListener("click", () => {
    settings.muted = !settings.muted;
    saveSettings(settings);
    applyVolume();
    refreshUI();
  });

  vol.addEventListener("input", () => {
    settings.volume = clamp(Number(vol.value) / 100, 0, 1);
    saveSettings(settings);
    applyVolume();
    // 解禁済み＆ONなら、音量触った瞬間に再生開始できるブラウザもある
    if (unlocked && settings.enabled) {
      if (specialKey) tryPlay(TRACKS[specialKey]);
      else startNormalBgm(false);
    }
    refreshUI();
  });

  // 外側クリックで閉じる
  document.addEventListener("pointerdown", (e) => {
    if (panel.style.display !== "block") return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.style.display = "none";
  });

  // 状態テキストをたまに更新
  setInterval(refreshUI, 500);

  refreshUI();
}

/* =========================
 * Public API
 * ========================= */
export function bgmMountSettingsUI(opts) {
  mountUI(opts);
}

export function bgmPlaySpecial(keyOrSrc) {
  // key名でも、直接srcでもOKにする
  const src = TRACKS[keyOrSrc] || keyOrSrc;
  specialKey = TRACKS[keyOrSrc] ? keyOrSrc : "__custom__";
  ensureAudio();

  // customの場合はsrcを直接流す
  if (specialKey === "__custom__") {
    tryPlay(src);
    return;
  }
  tryPlay(TRACKS[specialKey]);
}

export function bgmClearSpecial() {
  specialKey = null;
  // 通常BGMへ戻す
  startNormalBgm(true);
}

export function bgmStart() {
  // 解禁済みなら即スタート（未解禁でも呼んでOK）
  startNormalBgm(true);
}

export function bgmStop() {
  stop();
}

/* =========================
 * Boot
 * ========================= */
(function boot() {
  ensureAudio();
  setupAutoplayUnlock();
  startNormalBgm(false);
  startTimeWatcher();
})();
