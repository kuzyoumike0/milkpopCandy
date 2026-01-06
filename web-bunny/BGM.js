/* =========================
   BGM.js
   - 日本時間(JST)で朝/昼/夜を判定してBGMを切替
   - フェードアウト→切替→フェードイン
   - 設定: BGM ON/OFF, 音量(0.0-1.0) を localStorage 保存
   - 自動再生制限に対応（初回ユーザー操作で開始）
========================= */

/* ====== ここだけ差し替えればOK ====== */
const BGM_SOURCES = {
  morning: "./assets/bgm_morning.mp3",
  day: "./assets/bgm_day.mp3",
  night: "./assets/bgm_night.mp3"
};

// 朝/昼/夜の定義（JST）
const TIME_RANGES = {
  morning: { start: 5, end: 10 }, // 05:00-10:59
  day:     { start: 11, end: 17 },// 11:00-17:59
  night:   { start: 18, end: 4 }  // 18:00-04:59 (またぎ)
};
/* =================================== */

const STORAGE_KEY = "bgmSettings_v1";

const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.5
};

// フェード時間(ms)
const FADE_OUT_MS = 700;
const FADE_IN_MS  = 900;

// 時間帯チェック間隔(ms)（1分）
const CHECK_INTERVAL_MS = 60 * 1000;

// 内部状態
let settings = loadSettings();
let currentKey = null;
let audio = new Audio();
audio.loop = true;
audio.preload = "auto";
audio.volume = clamp01(settings.volume);

// 自動再生制限対策
let unlockedByUserGesture = false;
let pendingPlayRequest = false;

// フェード用（多重実行防止）
let fadeTimer = null;
let switching = false;

/* =========================
   Public API（必要なら使える）
========================= */
export function bgmSetEnabled(on) {
  settings.enabled = !!on;
  saveSettings(settings);

  if (!settings.enabled) {
    // 即停止（気持ちフェードアウト）
    fadeTo(0, 250).then(() => {
      try { audio.pause(); } catch {}
      audio.currentTime = 0;
    });
  } else {
    // 有効化したら現時間帯のBGMへ
    updateBgmByTime(true);
  }
}

export function bgmSetVolume(vol01) {
  settings.volume = clamp01(vol01);
  saveSettings(settings);
  // 再生中は現在の音量を、目標音量へ寄せる（即反映）
  const target = settings.enabled ? settings.volume : 0;
  audio.volume = clamp01(target);
}

export function bgmGetSettings() {
  return { ...settings };
}

/**
 * UI生成（任意）
 * 呼び出すと右上に小さな設定パネルを作る
 * 例: import { bgmMountSettingsUI } from "./BGM.js"; bgmMountSettingsUI();
 */
export function bgmMountSettingsUI(options = {}) {
  const {
    container = document.body,
    position = "top-right", // "top-right" | "top-left" | "bottom-right" | "bottom-left"
    title = "BGM",
  } = options;

  if (document.getElementById("bgmSettingsPanel")) return;

  const panel = document.createElement("div");
  panel.id = "bgmSettingsPanel";
  panel.style.position = "fixed";
  panel.style.zIndex = "9999";
  panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
  panel.style.fontSize = "12px";
  panel.style.padding = "10px 10px 8px";
  panel.style.borderRadius = "12px";
  panel.style.background = "rgba(255,255,255,0.85)";
  panel.style.backdropFilter = "blur(8px)";
  panel.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)";
  panel.style.userSelect = "none";
  panel.style.minWidth = "160px";

  const pos = {
    "top-right":   { top: "12px", right: "12px" },
    "top-left":    { top: "12px", left: "12px" },
    "bottom-right":{ bottom: "12px", right: "12px" },
    "bottom-left": { bottom: "12px", left: "12px" },
  }[position] || { top: "12px", right: "12px" };
  Object.assign(panel.style, pos);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.marginBottom = "6px";

  const h = document.createElement("div");
  h.textContent = title;
  h.style.fontWeight = "700";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = settings.enabled;
  toggle.title = "BGM ON/OFF";

  header.appendChild(h);
  header.appendChild(toggle);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";

  const volLabel = document.createElement("div");
  volLabel.textContent = "音量";
  volLabel.style.width = "32px";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(settings.volume * 100));
  slider.style.flex = "1";

  const volValue = document.createElement("div");
  volValue.textContent = slider.value;
  volValue.style.width = "26px";
  volValue.style.textAlign = "right";
  volValue.style.opacity = "0.8";

  row.appendChild(volLabel);
  row.appendChild(slider);
  row.appendChild(volValue);

  const hint = document.createElement("div");
  hint.style.marginTop = "6px";
  hint.style.opacity = "0.7";
  hint.textContent = "クリックでBGM開始";

  panel.appendChild(header);
  panel.appendChild(row);
  panel.appendChild(hint);

  container.appendChild(panel);

  toggle.addEventListener("change", () => {
    bgmSetEnabled(toggle.checked);
  });

  slider.addEventListener("input", () => {
    volValue.textContent = slider.value;
    bgmSetVolume(Number(slider.value) / 100);
  });
}

/* =========================
   Boot
========================= */
initUserGestureUnlock();
updateBgmByTime(true);
setInterval(() => updateBgmByTime(false), CHECK_INTERVAL_MS);

/* =========================
   Core
========================= */

function getJSTHour() {
  // JST = UTC+9
  const now = new Date();
  const utcHour = now.getUTCHours();
  return (utcHour + 9) % 24;
}

function getTimeKeyByJST() {
  const h = getJSTHour();

  // morning: 5-10
  if (inRange(h, TIME_RANGES.morning.start, TIME_RANGES.morning.end)) return "morning";
  // day: 11-17
  if (inRange(h, TIME_RANGES.day.start, TIME_RANGES.day.end)) return "day";
  // night: 18-4 (wrap)
  return "night";
}

function updateBgmByTime(force) {
  if (!settings.enabled) return;

  const nextKey = getTimeKeyByJST();
  if (!force && nextKey === currentKey) return;

  // 初回も含め切替
  switchBgm(nextKey).catch(() => {});
}

async function switchBgm(nextKey) {
  if (switching) return;
  switching = true;

  const src = BGM_SOURCES[nextKey];
  if (!src) {
    switching = false;
    return;
  }

  // 同じ曲なら何もしない
  if (nextKey === currentKey && audio.src) {
    switching = false;
    return;
  }

  const targetVol = clamp01(settings.volume);

  // いま鳴ってるならフェードアウト
  if (!audio.paused && audio.volume > 0.001) {
    await fadeTo(0, FADE_OUT_MS);
    try { audio.pause(); } catch {}
  } else {
    // 停止中でも音量0にしておく
    audio.volume = 0;
  }

  // 曲差し替え
  currentKey = nextKey;
  audio.src = src;
  audio.currentTime = 0;

  // 再生要求（自動再生制限の場合はユーザー操作待ち）
  await safePlay();

  // 再生できた場合だけフェードイン
  if (!audio.paused) {
    await fadeTo(targetVol, FADE_IN_MS);
  }

  switching = false;
}

/* =========================
   Autoplay unlock
========================= */
function initUserGestureUnlock() {
  const unlock = async () => {
    unlockedByUserGesture = true;
    if (pendingPlayRequest && settings.enabled) {
      pendingPlayRequest = false;
      try {
        await audio.play();
        // play成功時、現在時間帯BGMをフェードイン
        const targetVol = clamp01(settings.volume);
        if (audio.volume < 0.001) {
          await fadeTo(targetVol, 500);
        } else {
          audio.volume = targetVol;
        }
      } catch {}
    }
  };

  // 1回でOK。タップ/クリック/キー入力で解除
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

async function safePlay() {
  if (!settings.enabled) return;

  // すでにユーザー操作済みなら普通に再生
  if (unlockedByUserGesture) {
    try {
      await audio.play();
      return;
    } catch {
      // まれに失敗する環境対策
    }
  }

  // 自動再生制限の可能性 → ユーザー操作待ち
  pendingPlayRequest = true;
  try {
    await audio.play();
    // もし通ったなら unlocked 扱いで良い
    unlockedByUserGesture = true;
    pendingPlayRequest = false;
  } catch {
    // ここは正常（制限中）
  }
}

/* =========================
   Fade helpers
========================= */
function fadeTo(target, durationMs) {
  target = clamp01(target);

  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }

  return new Promise((resolve) => {
    const start = audio.volume;
    const diff = target - start;
    if (Math.abs(diff) < 0.001 || durationMs <= 0) {
      audio.volume = target;
      resolve();
      return;
    }

    const steps = Math.max(10, Math.floor(durationMs / 16)); // ~60fps
    let i = 0;

    fadeTimer = setInterval(() => {
      i++;
      const t = i / steps;
      // easeInOut
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      audio.volume = clamp01(start + diff * eased);

      if (i >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        audio.volume = target;
        resolve();
      }
    }, durationMs / steps);
  });
}

/* =========================
   Storage helpers
========================= */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);

    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      volume:  typeof parsed.volume === "number"  ? clamp01(parsed.volume) : DEFAULT_SETTINGS.volume
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      enabled: !!s.enabled,
      volume: clamp01(s.volume)
    }));
  } catch {}
}

/* =========================
   Utils
========================= */
function clamp01(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function inRange(hour, start, end) {
  // start <= end: 普通の範囲
  if (start <= end) return hour >= start && hour <= end;
  // start > end: 18-4 みたいな「またぎ」
  return hour >= start || hour <= end;
}
