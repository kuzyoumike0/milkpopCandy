// BGM.js
// - JST 朝/昼/夜で自動BGM
// - ☰メニューで ON/OFF・音量調整（保存）
// - 旅立ちなどの「特殊BGM」を一時的に再生→解除で元に戻す
// - フェード切替つき
//
// 置くBGM例（assets/bgm/）
//   morning.mp3
//   day.mp3
//   night.mp3
//   depart.mp3   ←旅立ち用（任意）

const LS = {
  enabled: "mp_bgm_enabled_v1",
  volume:  "mp_bgm_volume_v1",
};

const DEFAULT_TRACKS = {
  morning: "./assets/bgm/morning.mp3",
  day:     "./assets/bgm/day.mp3",
  night:   "./assets/bgm/night.mp3",
  depart:  "./assets/bgm/depart.mp3",
};

const DEFAULTS = {
  enabled: true,
  volume: 0.5,
  fadeMs: 900,
  // JST: 朝 5-11 / 昼 11-17 / 夜 17-5
  getPartJST: (d) => {
    const h = d.getHours();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 17) return "day";
    return "night";
  }
};

let tracks = { ...DEFAULT_TRACKS };
let enabled = loadBool(LS.enabled, DEFAULTS.enabled);
let volume  = loadNum(LS.volume, DEFAULTS.volume);
volume = clamp(volume, 0, 1);

let unlocked = false;
let started = false;

let normalPart = null;
let specialActive = false;
let specialSrc = null;

// 2chクロスフェード用
let aA = makeAudio();
let aB = makeAudio();
let current = aA;
let standby = aB;

let ui = null;

function makeAudio() {
  const a = new Audio();
  a.loop = true;
  a.preload = "auto";
  a.volume = 0;
  return a;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function loadBool(key, def) {
  const v = localStorage.getItem(key);
  if (v === null) return def;
  return v === "1";
}
function loadNum(key, def) {
  const v = parseFloat(localStorage.getItem(key));
  return Number.isFinite(v) ? v : def;
}
function save() {
  localStorage.setItem(LS.enabled, enabled ? "1" : "0");
  localStorage.setItem(LS.volume,  String(volume));
}

/* =========================
 * Unlock (autoplay 対策)
 * ========================= */
function unlockOnce() {
  if (unlocked) return;
  unlocked = true;

  // 無音で一瞬だけ再生→停止（ユーザー操作の直後に呼ばれる前提）
  try {
    const a = current;
    a.muted = true;
    a.src = tracks.night || ""; // 何でもOK（存在するもの推奨）
    a.currentTime = 0;
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      // アンロック後に起動してたら再開
      if (started) refreshNow(true);
    }).catch(() => {
      a.muted = false;
    });
  } catch {}
}

function bindUnlock() {
  // どこでも良いので最初の操作でアンロック
  window.addEventListener("pointerdown", unlockOnce, { once: true, passive: true });
  window.addEventListener("keydown", unlockOnce, { once: true });
}

/* =========================
 * Daypart (JST)
 * ========================= */
function getJSTDate() {
  // 現地タイムがJST以外でも「JSTとしての時刻」に変換
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 9 * 60 * 60000);
  return jst;
}

function computeNormalPart() {
  return DEFAULTS.getPartJST(getJSTDate());
}

function getNormalSrc() {
  const part = computeNormalPart();
  normalPart = part;
  return tracks[part] || tracks.night;
}

/* =========================
 * Crossfade
 * ========================= */
let fadeTimer = null;

function stopFadeTimer() {
  if (fadeTimer) {
    cancelAnimationFrame(fadeTimer);
    fadeTimer = null;
  }
}

function setAllVolumes(v) {
  // v = 0..1（ユーザー音量込みの最終値にする）
  current.volume = v;
  standby.volume = 0;
}

function crossfadeTo(src, fadeMs = DEFAULTS.fadeMs) {
  if (!enabled) return;
  if (!src) return;

  // もう同じ曲なら何もしない
  if (current.src && sameSrc(current.src, src)) {
    // 念のためボリューム復帰
    current.volume = volume;
    return;
  }

  stopFadeTimer();

  // standby に読み込み
  standby.src = src;
  standby.currentTime = 0;
  standby.loop = true;
  standby.volume = 0;

  const startTime = performance.now();
  const dur = Math.max(200, fadeMs);

  const p1 = safePlay(standby);
  // current 側も playing である必要はないけど、自然に落とす
  // （未再生/ブロック時はここで失敗してもOK）
  safePlay(current);

  const step = (t) => {
    const k = clamp((t - startTime) / dur, 0, 1);
    const vIn  = volume * k;
    const vOut = volume * (1 - k);

    standby.volume = vIn;
    current.volume = vOut;

    if (k < 1) {
      fadeTimer = requestAnimationFrame(step);
    } else {
      // swap
      try { current.pause(); } catch {}
      current.volume = 0;

      const tmp = current;
      current = standby;
      standby = tmp;

      standby.src = "";
      standby.currentTime = 0;
      standby.volume = 0;

      fadeTimer = null;
    }
  };

  // 再生失敗（autoplay等）でも、アンロック後に refreshNow(true) で復帰する
  p1.finally(() => {
    fadeTimer = requestAnimationFrame(step);
  });
}

function sameSrc(a, b) {
  // 絶対URL化されるので末尾比較
  return String(a).split("?")[0].endsWith(String(b).replace("./", ""));
}

function safePlay(a) {
  try {
    const p = a.play();
    if (p && typeof p.then === "function") return p.catch(() => {});
  } catch {}
  return Promise.resolve();
}

function stopAll() {
  stopFadeTimer();
  try { current.pause(); } catch {}
  try { standby.pause(); } catch {}
  try { current.currentTime = 0; } catch {}
  try { standby.currentTime = 0; } catch {}
  current.volume = 0;
  standby.volume = 0;
}

/* =========================
 * Public controls
 * ========================= */
function refreshNow(force = false) {
  if (!enabled) {
    stopAll();
    updateUI();
    return;
  }

  // 未アンロックの間は play が通らないので、ここでは src だけ合わせておいて、
  // unlock後に refreshNow(true) が呼ばれれば鳴る
  const target = specialActive ? specialSrc : getNormalSrc();
  if (!target) return;

  // force の時は無条件に合わせる
  if (force) {
    crossfadeTo(target, DEFAULTS.fadeMs);
  } else {
    // normalPart 変化 or special状態変化に追従
    crossfadeTo(target, DEFAULTS.fadeMs);
  }

  updateUI();
}

function ensureRunning() {
  if (started) return;
  started = true;
  bindUnlock();
  // すぐにセット（鳴らない場合はアンロック後に鳴る）
  refreshNow(true);

  // 1分ごとに朝昼夜チェック（軽い）
  setInterval(() => {
    if (!started) return;
    if (specialActive) return;
    const part = computeNormalPart();
    if (part !== normalPart) refreshNow(true);
  }, 60_000);

  // タブ復帰時にも復活
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && enabled) {
      // autoplay復帰が必要な場合があるので強制
      refreshNow(true);
    }
  });
}

export function bgmSetTracks(map = {}) {
  tracks = { ...tracks, ...map };
  // 変更直後に反映
  if (started) refreshNow(true);
}

export function bgmSetEnabled(on) {
  enabled = !!on;
  save();
  if (!enabled) stopAll();
  else ensureRunning();
  updateUI();
}

export function bgmSetVolume(v01) {
  volume = clamp(Number(v01) || 0, 0, 1);
  save();
  // いま鳴ってる側に反映（フェード中も自然に追従）
  if (enabled) {
    // current/standby はフェードで動くので「最大音量の基準」だけ更新される想定
    // 次のフレームで step が入る場合もあるけど、ここで瞬間反映もする
    current.volume = clamp(current.volume, 0, volume);
    standby.volume = clamp(standby.volume, 0, volume);
  }
  updateUI();
}

export function bgmPlaySpecial(srcOrKey = "depart") {
  ensureRunning();
  specialActive = true;
  specialSrc = tracks[srcOrKey] || srcOrKey; // キーでもURLでもOK
  refreshNow(true);
}

export function bgmClearSpecial() {
  specialActive = false;
  specialSrc = null;
  refreshNow(true);
}

export function bgmStart() {
  ensureRunning();
  // もしすでにアンロック済みなら即鳴る
  refreshNow(true);
}

/* =========================
 * UI: ☰メニュー（音量/ONOFF）
 * ========================= */
function injectUIStyles() {
  if (document.getElementById("bgmUiStyle")) return;
  const s = document.createElement("style");
  s.id = "bgmUiStyle";
  s.textContent = `
  #bgmWidget{
    position: fixed;
    z-index: 2147483000;
    display:flex;
    flex-direction: column;
    gap: 8px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  #bgmHamburger{
    width: 44px;
    height: 44px;
    border-radius: 14px;
    border:none;
    cursor:pointer;
    background: rgba(255,255,255,.96);
    box-shadow: 0 12px 32px rgba(0,0,0,.18);
    font-weight: 900;
    line-height: 1;
  }
  #bgmPanel{
    width: 240px;
    border-radius: 18px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 14px 40px rgba(0,0,0,.18);
    padding: 12px 12px 10px;
    display:none;
  }
  #bgmPanel.open{ display:block; }
  #bgmPanel .row{
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 10px;
    margin: 8px 0;
  }
  #bgmPanel .title{
    font-weight: 900;
    font-size: 13px;
  }
  #bgmPanel .sub{
    font-size: 11px;
    opacity: .75;
  }
  #bgmToggle{
    border:none;
    border-radius: 999px;
    padding: 8px 12px;
    font-weight: 900;
    cursor:pointer;
    background: #ffd6e7;
  }
  #bgmToggle.off{
    background: #eee;
  }
  #bgmVol{
    width: 100%;
  }
  `;
  document.head.appendChild(s);
}

function mountUI(position = "top-right", title = "BGM") {
  injectUIStyles();
  if (ui) return ui;

  const wrap = document.createElement("div");
  wrap.id = "bgmWidget";

  // position
  const pos = {
    "top-right":  { top: "10px", right: "10px" },
    "top-left":   { top: "10px", left: "10px" },
    "bottom-right": { bottom: "10px", right: "10px" },
    "bottom-left":  { bottom: "10px", left: "10px" },
  }[position] || { top: "10px", right: "10px" };

  Object.assign(wrap.style, pos);

  wrap.innerHTML = `
    <button id="bgmHamburger" type="button" aria-label="BGM menu">☰</button>
    <div id="bgmPanel">
      <div class="row">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub" id="bgmNow">--</div>
        </div>
        <button id="bgmToggle" type="button">ON</button>
      </div>
      <div class="row" style="align-items:flex-start;flex-direction:column;">
        <div class="sub">音量</div>
        <input id="bgmVol" type="range" min="0" max="1" step="0.01" />
      </div>
    </div>
  `;

  document.body.appendChild(wrap);

  const btn = wrap.querySelector("#bgmHamburger");
  const panel = wrap.querySelector("#bgmPanel");
  const toggle = wrap.querySelector("#bgmToggle");
  const vol = wrap.querySelector("#bgmVol");

  btn.addEventListener("click", () => {
    unlockOnce();
    panel.classList.toggle("open");
  });

  toggle.addEventListener("click", () => {
    unlockOnce();
    bgmSetEnabled(!enabled);
    // ONにした瞬間は起動
    if (enabled) bgmStart();
  });

  vol.addEventListener("input", () => {
    unlockOnce();
    bgmSetVolume(vol.value);
    if (enabled) bgmStart();
  });

  // パネル外クリックで閉じる（任意）
  document.addEventListener("pointerdown", (e) => {
    if (!panel.classList.contains("open")) return;
    if (wrap.contains(e.target)) return;
    panel.classList.remove("open");
  });

  ui = { wrap, panel, toggle, vol, now: wrap.querySelector("#bgmNow") };
  updateUI();

  // UIを出した時点でBGM管理開始（鳴るのはアンロック後）
  ensureRunning();

  return ui;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function nowLabel() {
  if (!enabled) return "OFF";
  if (specialActive) return "special";
  return normalPart || computeNormalPart();
}

function updateUI() {
  if (!ui) return;
  ui.toggle.textContent = enabled ? "ON" : "OFF";
  ui.toggle.classList.toggle("off", !enabled);
  ui.vol.value = String(volume);
  ui.now.textContent = unlocked
    ? `now: ${nowLabel()}`
    : `now: ${nowLabel()}（タップで開始）`;
}

export function bgmMountSettingsUI({ position = "top-right", title = "BGM" } = {}) {
  return mountUI(position, title);
}
