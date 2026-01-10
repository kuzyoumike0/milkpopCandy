// BGM.js — Milkpop牧場（モーダルUI + BGM音量 + ✅SE音量スライダー + SEループAPI）V7
// ✅ WB.bgm.openModal() で必ずモーダル表示（body待機つき）
// ✅ BGM: 再生/停止/音量/ミュート/自動（朝昼夜）
// ✅ SE: 音量スライダー + ミュート（WB.getSEVolume / WB.setSEVolume）
// ✅ UFO等のループSE：WB.se.loop(id, src, base) / WB.se.stop(id)
// ✅ app.js の SE登録キュー __milkpopSeRegisterQueue を吸収（registerSE）

(() => {
  "use strict";
  console.log("[BGM.js] LOADED v7", Date.now());

  /* =========================
   * Paths
   * ========================= */
  const TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",
  };

  /* =========================
   * Storage
   * ========================= */
  const LS_BGM = "milkpop_bgm_settings_v2"; // { enabled, muted, volume, selectedKey? }
  const LS_SE  = "milkpop_se_settings_v1";  // { muted, volume }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (q, p = document) => p.querySelector(q);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function loadBgmSettings() {
    const d = { enabled: true, muted: false, volume: 0.35, selectedKey: null };
    const raw = localStorage.getItem(LS_BGM);
    if (!raw) return d;
    const j = safeJsonParse(raw, d);
    return {
      enabled: j.enabled !== false,
      muted: !!j.muted,
      volume: clamp(Number(j.volume ?? d.volume), 0, 1),
      selectedKey: (j.selectedKey && TRACKS[j.selectedKey]) ? j.selectedKey : null,
    };
  }
  function saveBgmSettings(s) {
    try { localStorage.setItem(LS_BGM, JSON.stringify(s)); } catch {}
  }

  function loadSeSettings() {
    const d = { muted: false, volume: 0.85 };
    const raw = localStorage.getItem(LS_SE);
    if (!raw) return d;
    const j = safeJsonParse(raw, d);
    return {
      muted: !!j.muted,
      volume: clamp(Number(j.volume ?? d.volume), 0, 1),
    };
  }
  function saveSeSettings(s) {
    try { localStorage.setItem(LS_SE, JSON.stringify(s)); } catch {}
  }

  let bgm = loadBgmSettings();
  let se  = loadSeSettings();

  /* =========================
   * Time slot (JST)
   * ========================= */
  function getJstHours() {
    const now = new Date();
    const jstMs = now.getTime() + (9 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000);
    const jst = new Date(jstMs);
    return jst.getUTCHours();
  }
  function timeSlot() {
    const h = getJstHours();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 18) return "day";
    return "night";
  }

  function pickBgmKey() {
    if (bgm.selectedKey && TRACKS[bgm.selectedKey]) return bgm.selectedKey;
    return timeSlot();
  }

  /* =========================
   * Audio (BGM)
   * ========================= */
  const bgmAudio = new Audio();
  bgmAudio.loop = true;
  bgmAudio.preload = "auto";

  let unlocked = false;

  async function unlockAudio() {
    if (unlocked) return true;
    unlocked = true;
    try {
      // 無音で一瞬再生→停止（自動再生制限対策）
      bgmAudio.muted = true;
      bgmAudio.currentTime = 0;
      await bgmAudio.play();
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio.muted = false;
      return true;
    } catch {
      bgmAudio.muted = false;
      return false;
    }
  }

  function applyBgmVolume() {
    const vol = (bgm.muted || !bgm.enabled) ? 0 : bgm.volume;
    bgmAudio.volume = clamp(vol, 0, 1);
  }

  function setBgmSrcByKey(key) {
    const src = TRACKS[key] || TRACKS.day;
    const nextHref = new URL(src, location.href).href;
    if (bgmAudio.src !== nextHref) {
      try { bgmAudio.pause(); } catch {}
      bgmAudio.src = src;
      bgmAudio.currentTime = 0;
    }
  }

  async function playBgm(force = false) {
    const key = pickBgmKey();
    setBgmSrcByKey(key);
    applyBgmVolume();

    if (!bgm.enabled) return false;

    await unlockAudio();
    try {
      await bgmAudio.play();
      updateUi();
      return true;
    } catch (e) {
      console.warn("[BGM] play blocked or src unsupported", e);
      updateUi(true);
      return false;
    }
  }

  function stopBgm() {
    try { bgmAudio.pause(); } catch {}
    updateUi();
  }

  /* =========================
   * SE API（UFOなどをSEスライダーに完全追従）
   * ========================= */
  const seRegistry = new Set();    // app.js等の Audio を登録
  const seLoops = new Map();       // id -> Audio（ループSE）

  function getSEVolume() {
    const vol = se.muted ? 0 : se.volume;
    return clamp(vol, 0, 1);
  }

  function applySeVolumes() {
    const master = getSEVolume();

    // 登録された単発SE（次に鳴るときの基準にする）
    try {
      for (const a of seRegistry) {
        if (!a) continue;
        // 既に個別調整してる可能性があるので「上書きしすぎない」：最大音量だけ更新
        a.__milkpopSeMaster = master;
      }
    } catch {}

    // ループSE
    for (const [id, a] of seLoops) {
      const base = Number(a.__base ?? 1.0) || 1.0;
      a.volume = clamp(master * base, 0, 1);
    }
  }

  async function seLoop(id, src, base = 1.0) {
    if (!id || !src) return false;

    let a = seLoops.get(id);
    if (!a) {
      a = new Audio();
      a.preload = "auto";
      a.loop = true;
      seLoops.set(id, a);
    }

    a.__base = base;

    const nextHref = new URL(src, location.href).href;
    if (a.src !== nextHref) {
      try { a.pause(); } catch {}
      a.src = encodeURI(src);
      a.currentTime = 0;
    }

    a.volume = clamp(getSEVolume() * (Number(base) || 1.0), 0, 1);

    // SEもユーザー操作unlockに寄せる
    try { await window.WB?.unlockAudioOnce?.(); } catch {}
    await unlockAudio();

    try {
      await a.play();
      return true;
    } catch (e) {
      console.warn("[SE.loop] blocked or unsupported", e);
      return false;
    }
  }

  function seStop(id) {
    const a = seLoops.get(id);
    if (!a) return;
    try { a.pause(); } catch {}
    try { a.currentTime = 0; } catch {}
    seLoops.delete(id);
  }

  function registerSE(audioEl) {
    if (!audioEl) return;
    try { seRegistry.add(audioEl); } catch {}
    // いまのマスター音量を記録（app.js側が再生直前に getSEVolume() を読む想定）
    try { audioEl.__milkpopSeMaster = getSEVolume(); } catch {}
  }

  /* =========================
   * UI (Modal)
   * ========================= */
  const MODAL_ID = "milkpopBgmModalV7";
  const STYLE_ID = "milkpopBgmModalStyleV7";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
#${MODAL_ID}{
  position:fixed; inset:0; z-index:2147483647;
  display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,.35);
}
#${MODAL_ID} .panel{
  width:min(440px, calc(100vw - 24px));
  background:#fff; border-radius:18px;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
  padding:14px 14px 12px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
#${MODAL_ID} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
#${MODAL_ID} .ttl{ font-weight:900; font-size:16px; }
#${MODAL_ID} .btn{
  border:none; border-radius:14px;
  padding:10px 12px; font-weight:900; cursor:pointer;
  background:#ffe3ef;
}
#${MODAL_ID} .btn.ghost{ background:#f3f3f3; }
#${MODAL_ID} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }
#${MODAL_ID} .label{ font-weight:900; margin:8px 0 6px; }
#${MODAL_ID} input[type="range"]{ width:100%; }
#${MODAL_ID} .small{ font-size:12px; opacity:.7; line-height:1.35; }
#${MODAL_ID} .select{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900; cursor:pointer;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.10);
}
#${MODAL_ID} .select.active{ background:#333; color:#fff; box-shadow:none; }
`;
    document.head.appendChild(st);
  }

  async function waitForBody(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (document.body) return true;
      await wait(30);
    }
    return false;
  }

  function ensureModal() {
    ensureStyle();

    let wrap = document.getElementById(MODAL_ID);
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = MODAL_ID;

    const panel = document.createElement("div");
    panel.className = "panel";

    panel.innerHTML = `
      <div class="row">
        <div class="ttl">🎵 BGM / 🔊 SE</div>
        <button class="btn ghost" id="bgmCloseBtnV7" type="button">閉じる</button>
      </div>

      <div class="sep"></div>

      <div class="row">
        <button class="btn" id="bgmPlayBtnV7" type="button">▶ 再生</button>
        <button class="btn ghost" id="bgmStopBtnV7" type="button">⏸ 停止</button>
        <button class="btn ghost" id="bgmToggleBtnV7" type="button">ON/OFF</button>
        <button class="btn ghost" id="bgmMuteBtnV7" type="button">BGMミュート</button>
      </div>

      <div style="margin-top:10px;">
        <div class="label">BGM音量</div>
        <input id="bgmVolV7" type="range" min="0" max="1" step="0.01" />
        <div class="row" style="margin-top:10px;">
          <div class="label" style="margin:0;">曲</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="select" data-bgmkey="morning" type="button">朝</button>
            <button class="select" data-bgmkey="day" type="button">昼</button>
            <button class="select" data-bgmkey="night" type="button">夜</button>
            <button class="select" data-bgmkey="auto" type="button">自動</button>
          </div>
        </div>
      </div>

      <div class="sep"></div>

      <div>
        <div class="row">
          <div class="ttl">🔊 SE設定</div>
          <button class="btn ghost" id="seMuteBtnV7" type="button">SEミュート</button>
        </div>
        <div class="label">SE音量</div>
        <input id="seVolV7" type="range" min="0" max="1" step="0.01" />
        <div class="small">※ UFO.mp3 など“ループSE”も、このSE音量に100%追従します。</div>
      </div>

      <div class="sep"></div>
      <div id="bgmStatusV7" class="small">-</div>
      <div class="small">※ 再生がブロックされる場合は、もう一度「▶ 再生」を押してください。</div>
    `;

    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    // backdrop close
    const close = () => (wrap.style.display = "none");
    wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });

    // buttons
    $("#bgmCloseBtnV7", wrap).addEventListener("click", close);

    $("#bgmPlayBtnV7", wrap).addEventListener("click", async () => {
      await playBgm(true);
    });
    $("#bgmStopBtnV7", wrap).addEventListener("click", () => stopBgm());

    $("#bgmToggleBtnV7", wrap).addEventListener("click", async () => {
      bgm.enabled = !bgm.enabled;
      saveBgmSettings(bgm);
      if (!bgm.enabled) stopBgm();
      else await playBgm(true);
      updateUi();
    });

    $("#bgmMuteBtnV7", wrap).addEventListener("click", () => {
      bgm.muted = !bgm.muted;
      saveBgmSettings(bgm);
      applyBgmVolume();
      updateUi();
    });

    $("#seMuteBtnV7", wrap).addEventListener("click", () => {
      se.muted = !se.muted;
      saveSeSettings(se);
      applySeVolumes();
      updateUi();
    });

    // sliders
    const bgmVol = $("#bgmVolV7", wrap);
    bgmVol.value = String(bgm.volume);
    bgmVol.addEventListener("input", async () => {
      bgm.volume = clamp(Number(bgmVol.value), 0, 1);
      saveBgmSettings(bgm);
      applyBgmVolume();
      if (bgm.enabled) await playBgm(false);
      updateUi();
    });

    const seVol = $("#seVolV7", wrap);
    seVol.value = String(se.volume);
    seVol.addEventListener("input", () => {
      se.volume = clamp(Number(seVol.value), 0, 1);
      saveSeSettings(se);
      applySeVolumes();
      updateUi();
    });

    // key buttons
    wrap.querySelectorAll("[data-bgmkey]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const k = btn.getAttribute("data-bgmkey");
        if (k === "auto") bgm.selectedKey = null;
        else bgm.selectedKey = k;
        saveBgmSettings(bgm);
        await playBgm(true);
        updateUi();
      });
    });

    updateUi();
    return wrap;
  }

  function updateUi(showBlockedHint = false) {
    const wrap = document.getElementById(MODAL_ID);
    if (!wrap) return;

    const status = $("#bgmStatusV7", wrap);
    const bgmVol = $("#bgmVolV7", wrap);
    const seVol  = $("#seVolV7", wrap);

    if (bgmVol) bgmVol.value = String(bgm.volume);
    if (seVol)  seVol.value  = String(se.volume);

    // active buttons
    wrap.querySelectorAll("[data-bgmkey]").forEach(btn => {
      const k = btn.getAttribute("data-bgmkey");
      const active =
        (k === "auto" && !bgm.selectedKey) ||
        (k !== "auto" && bgm.selectedKey === k);
      btn.classList.toggle("active", !!active);
    });

    if (showBlockedHint) {
      status.textContent = "⚠ 再生がブロック/非対応の可能性（src 404 や NotSupportedError）。mp3のパスを確認して、もう一度▶再生。";
      return;
    }

    const key = pickBgmKey();
    const playing = bgm.enabled && !bgmAudio.paused && bgmAudio.volume > 0;

    status.textContent =
      `BGM: ${playing ? "再生中" : "停止中"} / 曲=${bgm.selectedKey ? bgm.selectedKey : ("自動(" + timeSlot() + ")")} / src=${TRACKS[key]}` +
      `\nSE: volume=${getSEVolume().toFixed(2)} ${se.muted ? "(muted)" : ""}`;
  }

  async function openModal() {
    await waitForBody();
    const wrap = ensureModal();
    wrap.style.display = "flex";
    await unlockAudio(); // モーダルを開いた操作でunlockを試す
    applyBgmVolume();
    applySeVolumes();
    updateUi();
  }

  /* =========================
   * WB expose / merge safe
   * ========================= */
  async function waitForWB(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.WB && typeof window.WB === "object") return window.WB;
      await wait(50);
    }
    return window.WB || {};
  }

  (async () => {
    const WB = await waitForWB();

    // app.js が積んだ登録キュー吸収
    try {
      const q = window.__milkpopSeRegisterQueue;
      if (Array.isArray(q)) q.splice(0).forEach(a => registerSE(a));
    } catch {}

    // unlock連結（相互互換）
    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = () => {
      try { prevUnlock?.(); } catch {}
      unlockAudio(); // BGM側のunlockも
    };

    // 公開
    WB.bgm = Object.assign({}, WB.bgm || {}, {
      openModal,
      play: () => playBgm(true),
      stop: stopBgm,
      setVolume: (v) => { bgm.volume = clamp(Number(v), 0, 1); saveBgmSettings(bgm); applyBgmVolume(); updateUi(); },
      getVolume: () => bgm.volume,
      isPlaying: () => bgm.enabled && !bgmAudio.paused,

      // BGM選択
      setSelected: (keyOrNull) => {
        bgm.selectedKey = (keyOrNull && TRACKS[keyOrNull]) ? keyOrNull : null;
        saveBgmSettings(bgm);
        playBgm(true);
        updateUi();
      },
      getSelected: () => bgm.selectedKey,

      // SE
      registerSE,
    });

    WB.getSEVolume = () => getSEVolume();
    WB.setSEVolume = (v) => {
      se.volume = clamp(Number(v), 0, 1);
      saveSeSettings(se);
      applySeVolumes();
      updateUi();
      return se.volume;
    };
    WB.getSEMuted = () => !!se.muted;
    WB.setSEMuted = (m) => {
      se.muted = !!m;
      saveSeSettings(se);
      applySeVolumes();
      updateUi();
      return se.muted;
    };

    WB.se = Object.assign({}, WB.se || {}, {
      loop: seLoop,
      stop: seStop,
      stopAll: () => { for (const id of Array.from(seLoops.keys())) seStop(id); },
      play: async (id, src, base = 1.0) => {
        // 単発SE（idは任意。ここでは管理しない）
        try {
          await unlockAudio();
          try { await WB.unlockAudioOnce?.(); } catch {}
          const a = new Audio();
          a.preload = "auto";
          a.loop = false;
          a.src = encodeURI(src);
          a.volume = clamp(getSEVolume() * (Number(base) || 1.0), 0, 1);
          await a.play();
          return true;
        } catch (e) {
          console.warn("[SE.play] failed", e);
          return false;
        }
      },
    });

    // 自動切替（再生中のみ）
    setInterval(() => {
      if (!bgm.enabled) return;
      if (bgm.selectedKey) return; // 手動選択中は時間帯より優先
      const key = timeSlot();
      setBgmSrcByKey(key);
      if (!bgmAudio.paused) bgmAudio.play().catch(() => {});
      updateUi();
    }, 60 * 1000);

    // クリック/タップでunlock（保険）
    window.addEventListener("pointerdown", () => { unlockAudio(); }, { passive: true });

    // 保存がONなら「ソースだけセット」しておく（自動再生はしない）
    if (bgm.enabled) {
      setBgmSrcByKey(pickBgmKey());
      applyBgmVolume();
    }
    applySeVolumes();

    console.log("[BGM] WB.bgm + SE ready", { bgm, se });
  })();
})();
