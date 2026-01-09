// BGM.js（非module / ✅朝昼夜は自動 + ✅購入曲を好きな時に流す / ✅モーダル化）
// ✅ 修正：404根絶（assets/BGM/ に合わせる / 大文字小文字一致）
// ✅ 修正：日本語ファイル名を encodeURI して確実に読み込む
// ✅ 通常BGM：朝/昼/夜 は時間帯で自動（★朝昼夜は無料で鳴る：購入不要）
// ✅ いつでもBGM：Stream / おもしろすぎてどっかん / Cocktail_Glass を購入して任意に選択して流せる
// ✅ 「いつでもBGM」を選択中は、時間帯切替より優先
// ✅ 自動に戻すあり
// ✅ UIは“モーダル”のみ（ハンバーガーボタンは作らない）
// ✅ WB差し替え耐性 / unlockAudioOnce 連結
// ✅ 外部：WB.bgm.openModal() / closeModal() を提供（gameMenu.jsから呼ぶ）
//
// ★追加：SE音量スライダー（UFO SE含む全SEに適用）
// - LS: milkpop_se_volume_v1 (0..1)
// - window.__milkpopSeVolume 公開
// - WB.getSEVolume / WB.setSEVolume / WB.playSE を提供
// - ループSE管理：WB.se.loop(key, src) / WB.se.stop(key)
//   → tenki.jsで UFO が出たら WB.se.loop("ufo","./assets/UFO.mp3") を呼ぶと、SE音量で下げられる

(() => {
  "use strict";

  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v2";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v2";
  const LS_KEY_SELECT   = "milkpop_bgm_selected_v2";

  // ★SE音量
  const LS_KEY_SE_VOL   = "milkpop_se_volume_v1"; // 0..1

  /* =========================
   * Tracks（✅ assets/BGM/ に統一）
   * ========================= */
  const BASE_TRACKS = {
    morning: "./assets/BGM/bgm_morning.mp3",
    day:     "./assets/BGM/bgm_day.mp3",
    night:   "./assets/BGM/bgm_night.mp3",
  };

  const SPECIAL_TRACKS = {
    depart:  "./assets/BGM/bgm_depart.mp3",
  };

  const ANYTIME_TRACKS = {
    stream:   "./assets/BGM/Stream.mp3",
    dokkan:   "./assets/BGM/おもしろすぎてどっかん.mp3",
    cocktail: "./assets/BGM/Cocktail_Glass.mp3",
  };

  const TRACKS = { ...BASE_TRACKS, ...SPECIAL_TRACKS, ...ANYTIME_TRACKS };

  const PRICES = {
    morning: 3000,
    day:     3000,
    night:   3000,

    depart:  8000,
    stream:   12000,
    dokkan:   15000,
    cocktail: 10000,
  };

  const LABELS = {
    morning: "朝BGM",
    day:     "昼BGM",
    night:   "夜BGM",
    depart:  "旅立ちBGM",
    stream:   "Stream（いつでも）",
    dokkan:   "おもしろすぎてどっかん（いつでも）",
    cocktail: "Cocktail_Glass（いつでも）",
  };

  const FREE_TRACKS = new Set(["morning", "day", "night"]);

  const UI = {
    style: "bgmStyleModalV2",
    backdrop: "bgmBackdropModalV1",
    modal: "bgmModalModalV1",
    toast: "bgmToastModalV1",
  };

  const $ = (q, p = document) => p.querySelector(q);
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY_SETTINGS);
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
  function saveSettings(s) { try { localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s)); } catch {} }

  function loadOwned() {
    try {
      const raw = localStorage.getItem(LS_KEY_OWNED);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : {};
    } catch { return {}; }
  }
  function saveOwned(o) { try { localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); } catch {} }

  function loadSelected() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECT);
      if (!raw) return { selectedKey: null };
      const j = JSON.parse(raw);
      const k = j?.selectedKey ?? null;
      if (k && !TRACKS[k]) return { selectedKey: null };
      return { selectedKey: k };
    } catch { return { selectedKey: null }; }
  }
  function saveSelected(sel) { try { localStorage.setItem(LS_KEY_SELECT, JSON.stringify(sel)); } catch {} }

  // ★SE音量（0..1）
  function loadSEVolume() {
    try {
      const raw = localStorage.getItem(LS_KEY_SE_VOL);
      if (raw == null) return 0.85;
      const v = Number(raw);
      return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
    } catch {
      return 0.85;
    }
  }
  function saveSEVolume(v) {
    try { localStorage.setItem(LS_KEY_SE_VOL, String(clamp(Number(v) || 0, 0, 1))); } catch {}
  }

  let settings = loadSettings();
  let owned = loadOwned();
  let selected = loadSelected();
  let seVolume = loadSEVolume();

  // 公開（app.jsなどが参照）
  window.__milkpopSeVolume = seVolume;

  let unlocked = false;
  let currentKey = null;
  let specialKey = null;

  let audio = null;

  /* =========================
   * SE管理（UFO含む）
   * ========================= */
  const loopSEMap = new Map(); // key -> Audio

  function normalizeSrc(src) {
    if (!src) return src;
    if (src.includes("%")) return src;
    return encodeURI(src);
  }

  function getSEVolume() { return clamp(seVolume, 0, 1); }

  function setSEVolume(v) {
    seVolume = clamp(Number(v) || 0, 0, 1);
    window.__milkpopSeVolume = seVolume;
    saveSEVolume(seVolume);
    // ループSEに即反映
    applyLoopSEVolumes();
    // 任意の通知（app.jsが聞ける）
    try { window.dispatchEvent(new Event("milkpop:seVolume")); } catch {}
  }

  function effectiveSEVolume(base = 1.0) {
    if (settings.muted) return 0;
    return clamp(getSEVolume() * clamp(Number(base) || 1, 0, 2), 0, 1);
  }

  function applyLoopSEVolumes() {
    const v = effectiveSEVolume(1);
    loopSEMap.forEach((a) => {
      try {
        a.muted = !!settings.muted;
        a.volume = v;
      } catch {}
    });
  }

  // 1回SE（AudioでもsrcでもOK）
  function playSE(audioOrSrc, base = 1.0) {
    if (!unlocked) return;

    try {
      let a = null;

      if (typeof audioOrSrc === "string") {
        a = new Audio(normalizeSrc(audioOrSrc));
        a.preload = "auto";
        a.loop = false;
      } else {
        a = audioOrSrc;
      }

      if (!a) return;

      a.muted = !!settings.muted;
      a.volume = effectiveSEVolume(base);

      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  // ループSE（UFOなど）
  function loopSE(key, src, base = 1.0) {
    if (!unlocked) return null;
    if (!key) key = "loop";

    const normalized = normalizeSrc(src);
    let a = loopSEMap.get(key);

    try {
      if (!a) {
        a = new Audio();
        a.preload = "auto";
        a.loop = true;
        loopSEMap.set(key, a);
      }

      const nextHref = new URL(normalized, location.href).href;
      if (a.src !== nextHref) {
        try { a.pause(); } catch {}
        a.src = normalized;
        a.currentTime = 0;
      }

      a.muted = !!settings.muted;
      a.volume = effectiveSEVolume(base);

      if (!settings.enabled) return a; // BGM OFFでもSEは鳴らす方針（必要ならここを連動に変えられる）
      a.play().catch(() => {});
      return a;
    } catch {
      return a || null;
    }
  }

  function stopLoopSE(key) {
    const a = loopSEMap.get(key);
    if (!a) return;
    try { a.pause(); } catch {}
  }

  function stopAllLoopSE() {
    loopSEMap.forEach((a) => { try { a.pause(); } catch {} });
  }

  /* =========================
   * BGM audio
   * ========================= */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyVolume();

    audio.addEventListener("error", () => {
      try {
        const err = audio.error ? `${audio.error.code}` : "unknown";
        console.warn("[BGM] audio error:", err, "src=", audio.src);
      } catch {}
    });

    return audio;
  }

  function applyVolume() {
    ensureAudio();
    audio.volume = settings.muted ? 0 : settings.volume;
    // ★SE側もミュートに追従
    applyLoopSEVolumes();
  }

  function pickByTime() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) return "morning";
    if (h >= 10 && h < 17) return "day";
    return "night";
  }

  function isOwned(key) {
    if (FREE_TRACKS.has(key)) return true;
    return !!owned?.[key];
  }

  function resolveKeyBySrc(src) {
    for (const k of Object.keys(TRACKS)) if (TRACKS[k] === src) return k;
    return null;
  }

  /* =========================
   * WB coin compat
   * ========================= */
  function getCoinsWB() {
    const WB = window.WB;
    try {
      if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
      if (WB && typeof WB.getCoins === "function") return Number(WB.getCoins()) || 0;
      if (WB && typeof WB.coins === "number") return Number(WB.coins) || 0;
      const el = document.getElementById("coinValue");
      if (el) return Number(el.textContent || "0") || 0;
    } catch {}
    return 0;
  }

  function setCoinsWB(next) {
    const WB = window.WB;
    const v = Math.max(0, Math.floor(Number(next) || 0));
    try {
      if (WB && typeof WB.setCoin === "function") { WB.setCoin(v); return true; }
      if (WB && typeof WB.setCoins === "function") { WB.setCoins(v); return true; }
      if (WB && typeof WB.coins === "number") WB.coins = v;
      const el = document.getElementById("coinValue");
      if (el) el.textContent = String(v);
      return true;
    } catch {}
    return false;
  }

  function spendCoinsWB(amount) {
    const WB = window.WB;
    const a = Math.max(0, Math.floor(Number(amount) || 0));
    if (!a) return true;

    try {
      if (WB && typeof WB.spendCoins === "function") return !!WB.spendCoins(a);
      if (WB && typeof WB.spendCoin === "function") return !!WB.spendCoin(a);

      if (WB && typeof WB.addCoin === "function") {
        const cur = getCoinsWB();
        if (cur < a) return false;
        WB.addCoin(-a);
        const after = getCoinsWB();
        if (after === cur) setCoinsWB(cur - a);
        return true;
      }

      const cur = getCoinsWB();
      if (cur < a) return false;
      setCoinsWB(cur - a);
      return true;
    } catch { return false; }
  }

  function toast(msg) {
    try {
      let el = document.getElementById(UI.toast);
      if (!el) {
        el = document.createElement("div");
        el.id = UI.toast;
        el.style.cssText = `
position:fixed; left:50%; top:16px; transform:translateX(-50%);
z-index:2147483646;
background:rgba(0,0,0,.78); color:#fff;
padding:10px 12px; border-radius:14px;
font-weight:900; font-size:13px;
box-shadow:0 14px 40px rgba(0,0,0,.25);
pointer-events:none; opacity:0; transition:opacity .18s ease;
`;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1200);
    } catch {}
  }

  async function tryPlay(src, keyHint = null) {
    ensureAudio();
    if (!src) return false;

    const key = keyHint || resolveKeyBySrc(src);
    if (key && !isOwned(key)) { stop(); return false; }

    const normalized = normalizeSrc(src);
    const nextHref = new URL(normalized, location.href).href;

    if (audio.src !== nextHref) {
      try { audio.pause(); } catch {}
      audio.src = normalized;
      audio.currentTime = 0;
    }

    applyVolume();
    if (!settings.enabled) return false;
    if (!unlocked) return false;

    try { await audio.play(); return true; } catch { return false; }
  }

  function stop() { if (audio) try { audio.pause(); } catch {} }

  function decideKeyToPlay() {
    if (specialKey && TRACKS[specialKey] && isOwned(specialKey)) return specialKey;

    const sk = selected?.selectedKey ?? null;
    if (sk && TRACKS[sk] && isOwned(sk)) return sk;

    const t = pickByTime();
    return t;
  }

  function startBgm(force = false) {
    const key = decideKeyToPlay();
    if (!key) { currentKey = null; stop(); return; }
    if (!force && key === currentKey) return;
    currentKey = key;
    tryPlay(TRACKS[key], key);
  }

  async function unlockBgmOnce() {
    if (unlocked) return;
    unlocked = true;
    startBgm(true);
    // ループSEも再生できる状態にする（必要ならここで何もしない）
    applyLoopSEVolumes();
  }

  function buyBgm(key) {
    if (!TRACKS[key] || !PRICES[key]) return { ok: false, reason: "unknown" };

    if (FREE_TRACKS.has(key)) return { ok: true, reason: "free" };
    if (isOwned(key)) return { ok: true, reason: "already" };

    const price = PRICES[key];
    const cur = getCoinsWB();
    if (cur < price) return { ok: false, reason: "coins", need: price, have: cur };

    const ok = spendCoinsWB(price);
    if (!ok) return { ok: false, reason: "coins_api" };

    owned[key] = true;
    saveOwned(owned);
    toast(`✅ ${LABELS[key]} 購入！ -${price}🪙`);
    return { ok: true, reason: "bought" };
  }

  function selectBgm(keyOrNull) {
    const k = keyOrNull || null;

    if (k === null) {
      selected.selectedKey = null;
      saveSelected(selected);
      toast("🔁 自動BGMに戻した");
      startBgm(true);
      return { ok: true };
    }
    if (!TRACKS[k]) return { ok: false, reason: "unknown" };
    if (!isOwned(k)) return { ok: false, reason: "not_owned" };

    selected.selectedKey = k;
    saveSelected(selected);
    toast(`🎵 ${LABELS[k]} を流す`);
    startBgm(true);
    return { ok: true };
  }

  function playSpecial(key) {
    if (!TRACKS[key]) return;
    if (!isOwned(key)) { toast("未購入です"); return; }
    specialKey = key;
    tryPlay(TRACKS[key], key);
  }
  function clearSpecial() {
    specialKey = null;
    startBgm(true);
  }

  /* =========================
   * WB patch (swap-safe)
   * ========================= */
  let lastWBRef = null;

  function patchWB(WB) {
    if (!WB || typeof WB !== "object") return;
    if (lastWBRef === WB && WB.__bgmPatchedModalV2) return;
    lastWBRef = WB;

    if (!WB.__bgmPatchedModalV2) WB.__bgmPatchedModalV2 = { done: false };

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.bgm = WB.bgm || {};

    WB.bgm.start = () => startBgm(true);
    WB.bgm.stop = () => stop();

    WB.bgm.playSpecial = playSpecial;
    WB.bgm.clearSpecial = clearSpecial;

    WB.bgm.TRACKS = TRACKS;
    WB.bgm.PRICES = PRICES;
    WB.bgm.LABELS = LABELS;

    WB.bgm.isOwned = isOwned;
    WB.bgm.buy = buyBgm;
    WB.bgm.select = selectBgm;
    WB.bgm.getSelected = () => selected?.selectedKey ?? null;
    WB.bgm.getCoins = () => getCoinsWB();

    // ✅ モーダル操作API
    WB.bgm.openModal = openModal;
    WB.bgm.closeModal = closeModal;

    // ★SE音量API（app.js/tenki.jsが使える）
    WB.getSEVolume = () => getSEVolume();
    WB.setSEVolume = (v) => { setSEVolume(v); refreshUI(); };
    WB.playSE = (audioOrSrc, base = 1.0) => playSE(audioOrSrc, base);

    // ★ループSE API（UFO用）
    WB.se = WB.se || {};
    WB.se.loop = (key, src, base = 1.0) => loopSE(key, src, base);
    WB.se.stop = (key) => stopLoopSE(key);
    WB.se.stopAll = () => stopAllLoopSE();
    WB.se.getVolume = () => getSEVolume();
    WB.se.setVolume = (v) => { setSEVolume(v); refreshUI(); };

    WB.__bgmPatchedModalV2.done = true;

    if (unlocked && settings.enabled) startBgm(true);
  }

  /* =========================
   * Modal UI
   * ========================= */
  function ensureStyles() {
    if (document.getElementById(UI.style)) return;
    const style = document.createElement("style");
    style.id = UI.style;
    style.textContent = `
#${UI.backdrop}{
  position:fixed; inset:0;
  z-index:2147483001;
  background:rgba(0,0,0,.35);
  display:none;
}
#${UI.modal}{
  position:absolute;
  left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(420px, 94vw);
  max-height:min(84vh, 860px);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.25);
  overflow:hidden;
  display:flex;
  flex-direction:column;
}
#${UI.modal} .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px;
  border-bottom:1px solid rgba(0,0,0,.08);
}
#${UI.modal} .ttl{ font-weight:1000; letter-spacing:.02em; }
#${UI.modal} .close{
  width:34px; height:34px;
  border:none; border-radius:999px;
  background:rgba(0,0,0,.06);
  font-weight:1000;
  cursor:pointer;
}
#${UI.modal} .body{
  padding:12px 14px 16px;
  overflow:auto;
}
#${UI.modal} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
#${UI.modal} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  background:#ffd6e7;
  cursor:pointer;
}
#${UI.modal} .btn.ghost{
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.modal} .slider{ width:100%; margin:10px 0 6px; }
#${UI.modal} .fine{ font-size:12px; opacity:.75; }
#${UI.modal} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }

#${UI.modal} .item{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin:8px 0;
}
#${UI.modal} .name{ font-weight:900; }
#${UI.modal} .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.modal} .right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
#${UI.modal} .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.modal} .buy{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#ffd6e7;
}
#${UI.modal} .buy[disabled]{ opacity:.55; cursor:not-allowed; }
#${UI.modal} .select{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.modal} .select[disabled]{ opacity:.55; cursor:not-allowed; }
#${UI.modal} .select.active{ background:#333; color:#fff; box-shadow:none; }

#${UI.modal} .sectionTitle{
  margin-top:10px;
  font-size:12px;
  font-weight:900;
  opacity:.75;
  letter-spacing:.03em;
}
`;
    document.head.appendChild(style);
  }

  function renderItem(key, label, desc) {
    const price = PRICES[key] ?? 0;
    return `
<div class="item">
  <div>
    <div class="name">${label}</div>
    <div class="meta">${desc}</div>
  </div>
  <div class="right">
    <div class="tag" id="bgmPrice_${key}">${price}🪙</div>
    <button class="buy" id="bgmBuy_${key}" type="button">購入</button>
    <button class="select" id="bgmSelect_${key}" type="button">流す</button>
  </div>
</div>`;
  }

  let backdrop = null;
  let modal = null;
  let __uiTimer = 0;

  function ensureModalUI() {
    ensureStyles();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = UI.backdrop;
      document.body.appendChild(backdrop);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal();
      });
    }
    if (!modal) {
      modal = document.createElement("div");
      modal.id = UI.modal;
      backdrop.appendChild(modal);
    }

    return { backdrop, modal };
  }

  function refreshUI() {
    if (!modal) return;

    const stateText = $("#bgmStateTextModal", modal);
    const info = $("#bgmInfoModal", modal);
    const selText = $("#bgmSelTextModal", modal);
    const toggle = $("#bgmToggleModal", modal);
    const mute = $("#bgmMuteModal", modal);
    const vol = $("#bgmVolModal", modal);
    const seVol = $("#seVolModal", modal);
    const seVolText = $("#seVolTextModal", modal);
    const coinTag = $("#bgmCoinTagModal", modal);

    if (!stateText || !info || !selText || !toggle || !mute || !vol || !coinTag || !seVol || !seVolText) return;

    vol.value = String(Math.round(settings.volume * 100));
    toggle.textContent = settings.enabled ? "ON" : "OFF";
    toggle.style.opacity = settings.enabled ? "1" : "0.6";
    mute.textContent = settings.muted ? "ミュート中" : "ミュート";
    mute.style.opacity = settings.muted ? "0.75" : "1";

    seVol.value = String(Math.round(getSEVolume() * 100));
    seVolText.textContent = `SE音量：${Math.round(getSEVolume() * 100)}%`;

    const c = getCoinsWB();
    coinTag.textContent = `🪙 ${c}`;

    const sel = selected?.selectedKey ?? null;
    selText.textContent = sel ? `選択中：${LABELS[sel]}` : "選択中：自動";

    const nowKey = decideKeyToPlay() || pickByTime();
    info.textContent =
      (specialKey && TRACKS[specialKey]) ? `特別：${LABELS[specialKey] || specialKey}` :
      sel ? `選択：${LABELS[sel]}` :
      `自動：${LABELS[nowKey] || nowKey}`;

    const playing = audio && !audio.paused && unlocked && settings.enabled && !settings.muted && audio.volume > 0;
    stateText.textContent = playing ? "再生中" : "停止中（クリックで開始）";

    for (const k of Object.keys(PRICES)) {
      const own = isOwned(k);
      const price = PRICES[k];
      const free = FREE_TRACKS.has(k);

      const priceTag = $(`#bgmPrice_${k}`, modal);
      const buyBtn = $(`#bgmBuy_${k}`, modal);
      const selBtn = $(`#bgmSelect_${k}`, modal);

      if (!priceTag || !buyBtn || !selBtn) continue;

      priceTag.textContent = free ? "FREE" : (own ? "購入済み" : `${price}🪙`);

      buyBtn.disabled = free || own || (c < price);
      buyBtn.textContent = free ? "FREE" : (own ? "OK" : "購入");

      selBtn.disabled = !own;
      selBtn.classList.toggle("active", sel === k);
      selBtn.textContent = (sel === k) ? "選択中" : "流す";
    }
  }

  function buildUI() {
    const { modal } = ensureModalUI();

    modal.innerHTML = `
<div class="head">
  <div>
    <div class="ttl">🎵 BGM</div>
    <div class="fine" id="bgmStateTextModal">未再生（画面をクリックで開始）</div>
  </div>
  <button class="close" id="bgmCloseModal" type="button">×</button>
</div>

<div class="body">
  <div class="row">
    <button class="btn" id="bgmToggleModal" type="button">ON</button>
    <button class="btn ghost" id="bgmMuteModal" type="button">ミュート</button>
    <div class="tag" id="bgmCoinTagModal">🪙 0</div>
  </div>

  <div class="fine">BGM音量</div>
  <input class="slider" id="bgmVolModal" type="range" min="0" max="100" step="1" />

  <div class="row" style="margin-top:6px;">
    <div class="fine" id="seVolTextModal">SE音量：${Math.round(getSEVolume() * 100)}%</div>
  </div>
  <input class="slider" id="seVolModal" type="range" min="0" max="100" step="1" />

  <div class="fine" id="bgmInfoModal"></div>

  <div class="sep"></div>

  <div class="row">
    <button class="btn ghost" id="bgmAutoModal" type="button">🔁 自動に戻す</button>
    <div class="fine" id="bgmSelTextModal"></div>
  </div>

  <div id="bgmShopModal">
    <div class="sectionTitle">▼ 通常BGM（朝昼夜：自動 / FREE）</div>
    ${renderItem("morning", LABELS.morning, "朝の時間帯（5-10時）")}
    ${renderItem("day",     LABELS.day,     "昼の時間帯（10-17時）")}
    ${renderItem("night",   LABELS.night,   "夜の時間帯（それ以外）")}

    <div class="sectionTitle">▼ いつでもBGM（購入して好きな時に流す）</div>
    ${renderItem("stream",   LABELS.stream,   "購入するといつでも選択して再生できる")}
    ${renderItem("dokkan",   LABELS.dokkan,   "購入するといつでも選択して再生できる")}
    ${renderItem("cocktail", LABELS.cocktail, "購入するといつでも選択して再生できる")}

    <div class="sectionTitle">▼ 特別BGM（演出用）</div>
    ${renderItem("depart", LABELS.depart, "旅立ち演出などで使う（手動でも可）")}
  </div>
</div>
`;

    $("#bgmCloseModal", modal)?.addEventListener("click", (e) => {
      e.preventDefault(); closeModal();
    });

    $("#bgmToggleModal", modal)?.addEventListener("click", async () => {
      settings.enabled = !settings.enabled;
      saveSettings(settings);
      if (!settings.enabled) stop();
      else {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        startBgm(true);
      }
      refreshUI();
    });

    $("#bgmMuteModal", modal)?.addEventListener("click", () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
      refreshUI();
    });

    $("#bgmVolModal", modal)?.addEventListener("input", async () => {
      settings.volume = clamp(Number($("#bgmVolModal", modal).value) / 100, 0, 1);
      saveSettings(settings);
      applyVolume();
      if (settings.enabled) {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        startBgm(false);
      }
      refreshUI();
    });

    // ★SE音量スライダー
    $("#seVolModal", modal)?.addEventListener("input", () => {
      const v = clamp(Number($("#seVolModal", modal).value) / 100, 0, 1);
      setSEVolume(v);
      refreshUI();
    });

    $("#bgmAutoModal", modal)?.addEventListener("click", async () => {
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
      selectBgm(null);
      refreshUI();
    });

    for (const k of Object.keys(PRICES)) {
      $(`#bgmBuy_${k}`, modal)?.addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}

        if (FREE_TRACKS.has(k)) {
          toast("✅ FREEです");
          selectBgm(k);
          refreshUI();
          return;
        }

        const r = buyBgm(k);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        } else {
          selectBgm(k);
        }
        refreshUI();
      });

      $(`#bgmSelect_${k}`, modal)?.addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        const r = selectBgm(k);
        if (!r.ok) toast("未購入です");
        refreshUI();
      });
    }

    clearInterval(__uiTimer);
    __uiTimer = setInterval(refreshUI, 500);
    refreshUI();
  }

  function openModal() {
    ensureAudio();
    patchWB(window.WB);

    const { backdrop } = ensureModalUI();
    buildUI();
    backdrop.style.display = "block";

    try { window.WB?.unlockAudioOnce?.(); } catch {}
    refreshUI();
  }

  function closeModal() {
    if (!backdrop) return;
    backdrop.style.display = "none";
  }

  /* =========================
   * Autoplay unlock
   * ========================= */
  function startWBWatcher() {
    patchWB(window.WB);
    const start = Date.now();
    const t = setInterval(() => {
      patchWB(window.WB);
      if (Date.now() - start > 15000) clearInterval(t);
    }, 200);
  }

  function setupAutoplayUnlock() {
    const handler = async () => {
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
    };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });
  }

  function startTimeWatcher() {
    setInterval(() => startBgm(false), 30_000);
  }

  (async function boot() {
    ensureAudio();
    startWBWatcher();
    setupAutoplayUnlock();
    startBgm(false);
    startTimeWatcher();
  })();
})();
