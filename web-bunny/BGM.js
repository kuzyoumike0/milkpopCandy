// BGM.js — Milkpop牧場（ハンバーガーメニュー対応 / 自動再生制限対策 / WB待機）V6
(() => {
  "use strict";
  console.log("[BGM.js] LOADED v6", Date.now());

  const LS_ENABLED = "milkpop_bgm_enabled_v1";
  const LS_VOL     = "milkpop_bgm_volume_v1";

  // ✅ BGM素材（あなたの実ファイル名に合わせて変えてOK）
  const TRACKS = {
    morning: "./assets/bgm/morning.mp3",
    day:     "./assets/bgm/day.mp3",
    night:   "./assets/bgm/night.mp3",
  };

  const $ = (q, p = document) => p.querySelector(q);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ✅ WB待機（app.jsより先に読み込まれても動く）
  async function waitForWB(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.WB && typeof window.WB === "object") return window.WB;
      await wait(50);
    }
    return window.WB || {};
  }

  // ===== state =====
  let enabled = (localStorage.getItem(LS_ENABLED) ?? "0") === "1";
  let volume  = clamp(Number(localStorage.getItem(LS_VOL) ?? "0.35"), 0, 1);

  let audio = new Audio();            // HTMLAudioで安定運用
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = volume;

  let unlocked = false;
  async function unlockAudio() {
    if (unlocked) return true;
    unlocked = true;
    try {
      // 無音で一瞬再生 → 即停止（iOS/Chrome対策）
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      return true;
    } catch (e) {
      // unlock失敗でも、次のユーザー操作で再挑戦する
      audio.muted = false;
      return false;
    }
  }

  // クリック/タップでunlock（保険）
  window.addEventListener("pointerdown", () => { unlockAudio(); }, { passive: true });

  // ✅ JSTで朝昼夜（必要なら調整）
  function getJstHours() {
    const now = new Date();
    // UTC -> JST (+9)
    const jst = new Date(now.getTime() + (9 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
    return jst.getUTCHours();
  }
  function timeSlot() {
    const h = getJstHours();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 18) return "day";
    return "night";
  }

  let currentSlot = null;
  function pickTrack() {
    const slot = timeSlot();
    currentSlot = slot;
    return TRACKS[slot] || TRACKS.day;
  }

  async function play() {
    audio.src = pickTrack();
    audio.volume = volume;

    // ✅ ここが重要：ユーザー操作中に呼ばれる想定（openModal→再生ボタン）
    await unlockAudio();
    try {
      await audio.play();
      enabled = true;
      localStorage.setItem(LS_ENABLED, "1");
      updateUi();
      console.log("[BGM] playing", currentSlot, audio.src);
      return true;
    } catch (e) {
      console.warn("[BGM] play blocked", e);
      updateUi(true);
      return false;
    }
  }

  function stop() {
    try { audio.pause(); } catch {}
    enabled = false;
    localStorage.setItem(LS_ENABLED, "0");
    updateUi();
  }

  function setVolume(v) {
    volume = clamp(Number(v), 0, 1);
    audio.volume = volume;
    localStorage.setItem(LS_VOL, String(volume));
    updateUi();
  }

  // ✅ 60秒ごとに時間帯が変わったら曲を差し替え（再生中のみ）
  setInterval(() => {
    const slot = timeSlot();
    if (!enabled) return;
    if (slot === currentSlot) return;
    const wasPlaying = !audio.paused;
    audio.src = pickTrack();
    audio.volume = volume;
    if (wasPlaying) {
      audio.play().catch(() => {});
    }
    updateUi();
  }, 60 * 1000);

  // ===== Modal UI =====
  const MODAL_ID = "milkpopBgmModalV6";
  function ensureModal() {
    let wrap = document.getElementById(MODAL_ID);
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.style.cssText = `
      position:fixed; inset:0; z-index:2147483647;
      display:none; align-items:center; justify-content:center;
      background:rgba(0,0,0,.35);
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      width:min(420px, calc(100vw - 24px));
      background:#fff; border-radius:18px;
      box-shadow:0 10px 30px rgba(0,0,0,.25);
      padding:14px 14px 12px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    `;

    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="font-weight:900; font-size:16px;">🎵 BGM</div>
        <button id="bgmCloseBtnV6" style="border:none;background:#f3f3f3;border-radius:12px;padding:8px 10px;font-weight:800;cursor:pointer;">閉じる</button>
      </div>

      <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button id="bgmPlayBtnV6" style="border:none;background:#ffe3ef;border-radius:14px;padding:10px 12px;font-weight:900;cursor:pointer;">▶ 再生</button>
        <button id="bgmStopBtnV6" style="border:none;background:#f3f3f3;border-radius:14px;padding:10px 12px;font-weight:900;cursor:pointer;">⏸ 停止</button>
        <span id="bgmStatusV6" style="font-weight:800; opacity:.75;">-</span>
      </div>

      <div style="margin-top:10px;">
        <div style="font-weight:800; margin-bottom:6px;">音量</div>
        <input id="bgmVolV6" type="range" min="0" max="1" step="0.01" style="width:100%;" />
      </div>

      <div style="margin-top:10px; font-size:12px; opacity:.6;">
        ※再生がブロックされる場合は「▶ 再生」をもう一度押してください（ブラウザ制限対策）
      </div>
    `;

    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    // close
    const close = () => (wrap.style.display = "none");
    wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });

    $("#bgmCloseBtnV6", wrap).addEventListener("click", close);

    $("#bgmPlayBtnV6", wrap).addEventListener("click", async () => {
      // ✅ “ユーザー操作” の中で確実に鳴らす
      await play();
    });
    $("#bgmStopBtnV6", wrap).addEventListener("click", () => stop());

    const volEl = $("#bgmVolV6", wrap);
    volEl.value = String(volume);
    volEl.addEventListener("input", () => setVolume(volEl.value));

    updateUi();
    return wrap;
  }

  function updateUi(showBlockedHint = false) {
    const wrap = document.getElementById(MODAL_ID);
    if (!wrap) return;
    const status = $("#bgmStatusV6", wrap);
    const volEl = $("#bgmVolV6", wrap);
    if (volEl) volEl.value = String(volume);

    if (showBlockedHint) {
      status.textContent = "⚠ 再生がブロックされました（もう一度▶再生）";
      return;
    }
    status.textContent = enabled && !audio.paused
      ? `再生中：${currentSlot || timeSlot()}`
      : "停止中";
  }

  function openModal() {
    const wrap = ensureModal();
    wrap.style.display = "flex";
    // ✅ モーダルを開く行為もユーザー操作なのでunlockしておく
    unlockAudio();
    updateUi();
  }

  // ===== SE register hook（app.js が積むキューを吸収） =====
  const seRegistry = new Set();
  function registerSE(audioEl) {
    if (!audioEl) return;
    try {
      // SEもBGM同様、最初のユーザー操作でunlockされると鳴りやすい
      seRegistry.add(audioEl);
    } catch {}
  }

  // WBへ公開
  (async () => {
    const WB = await waitForWB();

    // app.jsが貯めたSE登録キューを吸収
    try {
      const q = window.__milkpopSeRegisterQueue;
      if (Array.isArray(q)) {
        q.splice(0).forEach(a => registerSE(a));
      }
    } catch {}

    // 外部から呼べるAPI
    WB.bgm = Object.assign({}, WB.bgm || {}, {
      openModal,
      play,
      stop,
      setVolume,
      getVolume: () => volume,
      isPlaying: () => enabled && !audio.paused,
      registerSE,
    });

    // app.js側がWB.unlockAudioOnceを持ってる場合に合わせる（相互互換）
    if (typeof WB.unlockAudioOnce !== "function") {
      WB.unlockAudioOnce = () => { unlockAudio(); };
    }

    // enabled保存がONなら起動後に再生を試みる（ただしブロックされるので、最初のユーザー操作後に鳴る想定）
    if (enabled) {
      // “自動再生”はブロックされがちなので、unlock後に再挑戦される
      audio.src = pickTrack();
      audio.volume = volume;
    }

    console.log("[BGM] WB.bgm ready", { enabled, volume });
  })();
})();
