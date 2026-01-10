// BGM.js — Milkpop牧場（ハンバーガーメニュー対応 / 自動再生制限対策 / WB待機 / 404&blocked可視化）V6.1
(() => {
  "use strict";
  console.log("[BGM.js] LOADED v6.1", Date.now());

  const LS_ENABLED = "milkpop_bgm_enabled_v1";
  const LS_VOL     = "milkpop_bgm_volume_v1";

  // ✅ BGM素材（実ファイル名に合わせてOK）
  const TRACKS = {
    morning: "./assets/bgm/morning.mp3",
    day:     "./assets/bgm/day.mp3",
    night:   "./assets/bgm/night.mp3",
  };

  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ✅ WB待機（app.jsより先でもOK）
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

  // ✅ Audio
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = volume;

  // 失敗理由の可視化
  let lastError = "";

  function setEnabled(v) {
    enabled = !!v;
    localStorage.setItem(LS_ENABLED, enabled ? "1" : "0");
    updateUi();
  }
  function setVolume(v) {
    volume = clamp(Number(v), 0, 1);
    audio.volume = volume;
    localStorage.setItem(LS_VOL, String(volume));
    updateUi();
  }

  // ✅ JSTで朝昼夜
  function getJstHours() {
    const now = new Date();
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

  // ✅ srcを確実にセットしてから unlock する（src無しunlockは詰む環境がある）
  function ensureSrc() {
    const src = pickTrack();
    if (audio.src !== new URL(src, location.href).href) {
      audio.src = src;
    }
    audio.volume = volume;
    return src;
  }

  let unlocked = false;

  async function unlockAudio() {
    if (unlocked) return true;

    // src無しunlockが詰む環境があるので必ずセット
    ensureSrc();

    try {
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();            // ユーザー操作中なら通る
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      unlocked = true;
      return true;
    } catch (e) {
      audio.muted = false;
      lastError = (e && e.name) ? `${e.name}: ${e.message || ""}` : String(e);
      console.warn("[BGM] unlock blocked", e);
      updateUi(true);
      return false;
    }
  }

  // クリック/タップでunlock（保険）
  window.addEventListener("pointerdown", () => { unlockAudio(); }, { passive: true });

  async function play() {
    lastError = "";
    ensureSrc();

    // ✅ ユーザー操作中に呼ばれる想定
    await unlockAudio();

    try {
      await audio.play();
      setEnabled(true);
      console.log("[BGM] playing", currentSlot, audio.src);
      return true;
    } catch (e) {
      lastError = (e && e.name) ? `${e.name}: ${e.message || ""}` : String(e);
      console.warn("[BGM] play blocked", e);
      setEnabled(true); // ON状態は維持（UI上はONだが鳴ってないのが分かるようにする）
      updateUi(true);
      return false;
    }
  }

  function stop() {
    try { audio.pause(); } catch {}
    setEnabled(false);
  }

  async function toggle() {
    if (enabled && !audio.paused) {
      stop();
      return false;
    }
    await play();
    return true;
  }

  // ✅ 60秒ごとに時間帯が変わったら差し替え（再生中のみ）
  setInterval(() => {
    const slot = timeSlot();
    if (!enabled) return;
    if (slot === currentSlot) return;

    const wasPlaying = !audio.paused;
    ensureSrc();
    if (wasPlaying) audio.play().catch(() => {});
    updateUi();
  }, 60 * 1000);

  // ✅ 404なども拾ってUIに出す
  audio.addEventListener("error", () => {
    const err = audio.error;
    lastError = err ? `MediaError code=${err.code}` : "MediaError";
    console.warn("[BGM] audio error", err, audio.src);
    updateUi(true);
  });

  /* =========================
   * Modal UI
   * ========================= */
  const MODAL_ID = "milkpopBgmModalV61";

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
        <button id="bgmCloseBtnV61" style="border:none;background:#f3f3f3;border-radius:12px;padding:8px 10px;font-weight:800;cursor:pointer;">閉じる</button>
      </div>

      <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button id="bgmPlayBtnV61" style="border:none;background:#ffe3ef;border-radius:14px;padding:10px 12px;font-weight:900;cursor:pointer;">▶ 再生</button>
        <button id="bgmStopBtnV61" style="border:none;background:#f3f3f3;border-radius:14px;padding:10px 12px;font-weight:900;cursor:pointer;">⏸ 停止</button>
        <button id="bgmToggleBtnV61" style="border:none;background:#e8f3ff;border-radius:14px;padding:10px 12px;font-weight:900;cursor:pointer;">🔁 トグル</button>
      </div>

      <div style="margin-top:8px; font-weight:900;">
        <span id="bgmStatusV61">-</span>
      </div>

      <div style="margin-top:10px;">
        <div style="font-weight:800; margin-bottom:6px;">音量</div>
        <input id="bgmVolV61" type="range" min="0" max="1" step="0.01" style="width:100%;" />
      </div>

      <div id="bgmErrBoxV61" style="margin-top:10px; font-size:12px; background:#fff6f6; border:1px solid #ffd2d2; padding:8px 10px; border-radius:12px; display:none;">
        <div style="font-weight:900;">⚠ 再生できません</div>
        <div id="bgmErrTextV61" style="margin-top:4px; opacity:.85;"></div>
        <div style="margin-top:6px; opacity:.7;">・ファイルパス(404)か、ブラウザの自動再生制限の可能性があります</div>
      </div>
    `;

    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    const close = () => (wrap.style.display = "none");
    wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });

    $("#bgmCloseBtnV61", wrap).addEventListener("click", close);

    $("#bgmPlayBtnV61", wrap).addEventListener("click", async () => {
      await play();
    });
    $("#bgmStopBtnV61", wrap).addEventListener("click", () => stop());
    $("#bgmToggleBtnV61", wrap).addEventListener("click", async () => { await toggle(); });

    const volEl = $("#bgmVolV61", wrap);
    volEl.value = String(volume);
    volEl.addEventListener("input", () => setVolume(volEl.value));

    updateUi();
    return wrap;
  }

  function updateUi(showBlockedHint = false) {
    const wrap = document.getElementById(MODAL_ID);
    if (!wrap) return;

    const status = $("#bgmStatusV61", wrap);
    const volEl = $("#bgmVolV61", wrap);
    const errBox = $("#bgmErrBoxV61", wrap);
    const errText = $("#bgmErrTextV61", wrap);

    if (volEl) volEl.value = String(volume);

    const playing = enabled && !audio.paused;
    const slot = currentSlot || timeSlot();

    status.textContent = playing
      ? `再生中：${slot}`
      : enabled
        ? `ON（未再生）：${slot}`
        : "停止中";

    if (showBlockedHint && lastError) {
      errBox.style.display = "block";
      errText.textContent = `${lastError} / src=${audio.src || "(none)"}`;
    } else {
      errBox.style.display = "none";
      errText.textContent = "";
    }
  }

  async function openModal() {
    const wrap = ensureModal();
    wrap.style.display = "flex";

    // ✅ モーダルを開いた時点でsrcだけ確定（ここで404も見える）
    ensureSrc();

    // ✅ ここでunlockを試す（ユーザー操作）
    await unlockAudio();

    // ✅ 保存がONなら「再生も試す」（ブロックされてもUIに出す）
    if ((localStorage.getItem(LS_ENABLED) ?? "0") === "1") {
      await play();
    } else {
      updateUi();
    }
  }

  /* =========================
   * SE register hook（app.js のキュー吸収）
   * ========================= */
  const seRegistry = new Set();
  function registerSE(audioEl) {
    if (!audioEl) return;
    try { seRegistry.add(audioEl); } catch {}
  }

  /* =========================
   * WBへ公開
   * ========================= */
  (async () => {
    const WB = await waitForWB();

    try {
      const q = window.__milkpopSeRegisterQueue;
      if (Array.isArray(q)) q.splice(0).forEach(a => registerSE(a));
    } catch {}

    WB.bgm = Object.assign({}, WB.bgm || {}, {
      openModal,
      play,
      stop,
      toggle,
      setVolume,
      getVolume: () => volume,
      isPlaying: () => enabled && !audio.paused,
      registerSE,
    });

    // app.js互換
    if (typeof WB.unlockAudioOnce !== "function") {
      WB.unlockAudioOnce = () => { unlockAudio(); };
    }

    // enabled保存がONなら「srcだけ先に決めておく」（自動再生はしない）
    if (enabled) {
      ensureSrc();
      audio.volume = volume;
    }

    console.log("[BGM] WB.bgm ready", { enabled, volume, src: audio.src });
  })();
})();
