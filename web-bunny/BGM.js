// BGM.js（非module / ✅BGM購入＆選択 + ✅BGM音量 + ✅SE音量スライダー + ✅openModal確実
//        + ✅購入前プレビュー試聴 + ✅モーダルスクロール対応）
// ✅ gameMenu.js の WB.bgm.openModal() で「必ず開く」
// ✅ 旧UI(V1/V2)が残ってても削除して作り直す（出ない問題根絶）
// ✅ SEスライダー：WB.getSEVolume / WB.setSEVolume / WB.se.play/loop/stop / registerSE まで全部提供
// ✅ tenki.js / unchi.js / app.js からのSE登録（__milkpopSeRegisterQueue）も拾って追従
// ✅ BGMは「選択中」が時間帯より優先 / 「自動に戻す」あり
// ✅ プレビュー：未購入でも「試聴」できる（BGM音量に従う）
//    - 試聴中は通常BGMを一時停止してプレビューを鳴らす
//    - 「停止」か、購入/流す/自動に戻す/閉じる等で復帰
// ✅ モーダル：max-height + overflow-y:auto でスクロールバー表示
// ✅ ブラウザ自動再生対策：ユーザー操作（pointerdown/keydown）で unlock → 再生開始

(() => {
  "use strict";
  console.log("[BGM.js] LOADED v3.3 (preview+scrollbar)", Date.now());

  /* =========================
   * Storage
   * ========================= */
  const LS_KEY_BGM_SETTINGS = "milkpop_bgm_settings_v2"; // {volume, muted, enabled}
  const LS_KEY_SE_VOL       = "milkpop_se_volume_v1";   // number 0..1
  const LS_KEY_OWNED        = "milkpop_bgm_owned_v2";   // {key:true}
  const LS_KEY_SELECT       = "milkpop_bgm_selected_v2";// {selectedKey:null|string}

  /* =========================
   * Tracks（ここを書き換えるだけで増やせる）
   * ========================= */
  const TRACKS = {
    // 時間帯
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",

    // 特別
    depart:  "./assets/bgm_depart.mp3",

    // 追加BGM（例：添付mp3を assets に入れた想定）
    cocktail: "./assets/bgm/Cocktail_Glass.mp3",
    stream:   "./assets/bgm/Stream.mp3",
    dokkan:   "./assets/bgm/おもしろすぎてどっかん.mp3",
  };

  const PRICES = {
    morning:  3000,
    day:      3000,
    night:    3000,
    depart:   8000,
    cocktail: 4000,
    stream:   4000,
    dokkan:   5000,
  };

  const LABELS = {
    morning:  "朝BGM",
    day:      "昼BGM",
    night:    "夜BGM",
    depart:   "旅立ちBGM",
    cocktail: "Cocktail Glass",
    stream:   "Stream",
    dokkan:   "おもしろすぎてどっかん",
  };

  const DESCS = {
    morning:  "朝の時間帯（5-10時）",
    day:      "昼の時間帯（11-17時）",
    night:    "夜の時間帯（それ以外）",
    depart:   "特別BGM（旅立ち演出など）",
    cocktail: "追加BGM（購入して選択すると流せる）",
    stream:   "追加BGM（購入して選択すると流せる）",
    dokkan:   "追加BGM（購入して選択すると流せる）",
  };

  /* =========================
   * UI ids
   * ========================= */
  const UI = {
    btn:   "bgmHamburgerV3",
    panel: "bgmPanelV3",
    toast: "bgmToastV3",
    style: "bgmStyleV3",
  };

  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =========================
   * State load/save
   * ========================= */
  function loadBgmSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY_BGM_SETTINGS);
      if (!raw) return { volume: 0.50, muted: false, enabled: true };
      const j = JSON.parse(raw);
      return {
        volume: clamp(Number(j.volume ?? 0.5), 0, 1),
        muted: !!j.muted,
        enabled: j.enabled !== false,
      };
    } catch {
      return { volume: 0.50, muted: false, enabled: true };
    }
  }
  function saveBgmSettings(s) {
    try { localStorage.setItem(LS_KEY_BGM_SETTINGS, JSON.stringify(s)); } catch {}
  }

  function loadSeVol() {
    try {
      const raw = localStorage.getItem(LS_KEY_SE_VOL);
      const v = Number(raw);
      return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
    } catch {
      return 0.85;
    }
  }
  function saveSeVol(v) {
    try { localStorage.setItem(LS_KEY_SE_VOL, String(clamp(Number(v) || 0, 0, 1))); } catch {}
  }

  function loadOwned() {
    try {
      const raw = localStorage.getItem(LS_KEY_OWNED);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : {};
    } catch { return {}; }
  }
  function saveOwned(o) {
    try { localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); } catch {}
  }

  function loadSelected() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECT);
      if (!raw) return { selectedKey: null };
      const j = JSON.parse(raw);
      const k = j?.selectedKey ?? null;
      if (k && !TRACKS[k]) return { selectedKey: null };
      return { selectedKey: k || null };
    } catch { return { selectedKey: null }; }
  }
  function saveSelected(sel) {
    try { localStorage.setItem(LS_KEY_SELECT, JSON.stringify(sel)); } catch {}
  }

  let bgmSettings = loadBgmSettings();
  let seVolume = loadSeVol();
  let owned = loadOwned();
  let selected = loadSelected();

  function isOwned(key) { return !!owned?.[key]; }

  /* =========================
   * Coins compat（WB）
   * ========================= */
  function getCoinsWB() {
    const WB = window.WB;
    try {
      if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
      if (WB && typeof WB.getCoins === "function") return Number(WB.getCoins()) || 0;
      if (WB && typeof WB.coins !== "undefined") return Number(WB.coins) || 0;
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
      if (WB && typeof WB.coins !== "undefined") WB.coins = v;
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
      const cur = getCoinsWB();
      if (cur < a) return false;
      setCoinsWB(cur - a);
      return true;
    } catch {
      return false;
    }
  }

  /* =========================
   * Toast
   * ========================= */
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
      el.__t = setTimeout(() => { el.style.opacity = "0"; }, 1300);
    } catch {}
  }

  /* =========================
   * BGM Audio
   * ========================= */
  let unlocked = false;

  let audio = null;          // 通常BGM
  let currentKey = null;
  let specialKey = null;

  // ✅ プレビュー専用
  let previewAudio = null;
  let previewKey = null;     // 試聴中のkey
  let bgmWasPlayingBeforePreview = false;

  function ensureBgmAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyBgmVolume();
    return audio;
  }

  function ensurePreviewAudio() {
    if (previewAudio) return previewAudio;
    previewAudio = new Audio();
    previewAudio.loop = true; // 試聴なのでループでOK（停止ボタンで止める）
    previewAudio.preload = "auto";
    applyPreviewVolume();
    return previewAudio;
  }

  function applyBgmVolume() {
    ensureBgmAudio();
    audio.volume = bgmSettings.muted ? 0 : bgmSettings.volume;
  }
  function applyPreviewVolume() {
    ensurePreviewAudio();
    previewAudio.volume = bgmSettings.muted ? 0 : bgmSettings.volume;
  }

  function pickByTime() {
    const h = new Date().getHours();
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    return "night";
  }

  function resolveKeyBySrc(src) {
    for (const k of Object.keys(TRACKS)) if (TRACKS[k] === src) return k;
    return null;
  }

  async function tryPlayBgm(src, keyHint = null) {
    ensureBgmAudio();
    if (!src) return false;

    const key = keyHint || resolveKeyBySrc(src);
    if (key && !isOwned(key)) { stopBgm(); return false; }

    const href = new URL(src, location.href).href;
    if (audio.src !== href) {
      try { audio.pause(); } catch {}
      audio.src = src;
      audio.currentTime = 0;
    }

    applyBgmVolume();

    if (!bgmSettings.enabled) return false;
    if (!unlocked) return false;

    try { await audio.play(); return true; } catch { return false; }
  }

  function stopBgm() {
    if (!audio) return;
    try { audio.pause(); } catch {}
  }

  function isBgmPlaying() {
    return !!(audio && !audio.paused && unlocked && bgmSettings.enabled && !bgmSettings.muted && audio.volume > 0);
  }

  function decideKeyToPlay() {
    // プレビュー中は通常BGMは鳴らさない（優先）
    if (previewKey) return null;

    if (specialKey && TRACKS[specialKey] && isOwned(specialKey)) return specialKey;

    const sk = selected?.selectedKey ?? null;
    if (sk && TRACKS[sk] && isOwned(sk)) return sk;

    const t = pickByTime();
    if (isOwned(t)) return t;

    // fallback
    return Object.keys(TRACKS).find(isOwned) || null;
  }

  function startBgm(force = false) {
    if (previewKey) { stopBgm(); return; } // プレビュー優先
    const key = decideKeyToPlay();
    if (!key) { currentKey = null; stopBgm(); return; }
    if (!force && key === currentKey) return;
    currentKey = key;
    tryPlayBgm(TRACKS[key], key);
  }

  async function unlockBgmOnce() {
    if (unlocked) return;
    unlocked = true;
    startBgm(true);
  }

  /* =========================
   * ✅ Preview（購入前試聴）
   * ========================= */
  async function startPreview(key) {
    if (!TRACKS[key]) return false;

    await unlockBgmOnce();

    // 通常BGMの状態を退避して停止
    bgmWasPlayingBeforePreview = isBgmPlaying();
    stopBgm();

    ensurePreviewAudio();
    const href = new URL(TRACKS[key], location.href).href;
    if (previewAudio.src !== href) {
      try { previewAudio.pause(); } catch {}
      previewAudio.src = TRACKS[key];
      previewAudio.currentTime = 0;
    }
    previewKey = key;

    applyPreviewVolume();

    if (!bgmSettings.enabled) return false;
    if (!unlocked) return false;

    try {
      await previewAudio.play();
      toast(`👂 試聴中：${LABELS[key] || key}`);
      return true;
    } catch {
      return false;
    }
  }

  function stopPreview({ resumeBgm = true } = {}) {
    if (!previewKey) return;
    previewKey = null;
    try { previewAudio?.pause(); } catch {}
    try { previewAudio && (previewAudio.currentTime = 0); } catch {}

    // 通常BGMへ復帰
    if (resumeBgm && bgmSettings.enabled && unlocked) {
      startBgm(true);
    }
  }

  /* =========================
   * SE system（register / play / loop / stop）
   * ========================= */
  const seRegistry = new Set();          // Audio elements
  const loopMap = new Map();             // key -> Audio

  function getSEVolume() {
    return clamp(Number(window.__milkpopSeVolume ?? seVolume), 0, 1);
  }
  function setSEVolume(v) {
    seVolume = clamp(Number(v) || 0, 0, 1);
    window.__milkpopSeVolume = seVolume;
    saveSeVol(seVolume);

    try {
      for (const a of seRegistry) {
        if (a && typeof a.volume === "number") a.volume = seVolume;
      }
    } catch {}
    try {
      for (const a of loopMap.values()) {
        if (a && typeof a.__base === "number") a.volume = clamp(a.__base * seVolume, 0, 1);
      }
    } catch {}
  }

  function isMutedAll() { return !!bgmSettings.muted; } // 仕様：BGMミュート＝SEもミュート扱い

  function registerSE(audioEl) {
    try {
      if (!audioEl) return;
      seRegistry.add(audioEl);
      audioEl.volume = isMutedAll() ? 0 : getSEVolume();
      audioEl.muted = !!isMutedAll();
    } catch {}
  }

  function sePlay(src, base = 1.0) {
    try {
      if (!unlocked) return;
      const a = new Audio(encodeURI(src));
      a.preload = "auto";
      a.loop = false;
      a.volume = isMutedAll() ? 0 : clamp(base * getSEVolume(), 0, 1);
      a.muted = !!isMutedAll();
      a.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function seLoop(key, src, base = 1.0) {
    try {
      if (!unlocked) return false;

      const prev = loopMap.get(key);
      const href = new URL(src, location.href).href;

      if (prev) {
        if (prev.src === href) {
          prev.__base = base;
          prev.volume = isMutedAll() ? 0 : clamp(base * getSEVolume(), 0, 1);
          prev.muted = !!isMutedAll();
          if (prev.paused) prev.play().catch(() => {});
          return true;
        }
        try { prev.pause(); } catch {}
        loopMap.delete(key);
      }

      const a = new Audio();
      a.preload = "auto";
      a.loop = true;
      a.src = encodeURI(src);
      a.__base = base;
      a.volume = isMutedAll() ? 0 : clamp(base * getSEVolume(), 0, 1);
      a.muted = !!isMutedAll();
      a.play().catch(() => {});
      loopMap.set(key, a);
      return true;
    } catch {
      return false;
    }
  }

  function seStop(key) {
    try {
      const a = loopMap.get(key);
      if (!a) return;
      try { a.pause(); } catch {}
      loopMap.delete(key);
    } catch {}
  }

  function applyMuteToSE() {
    const m = !!isMutedAll();
    try {
      for (const a of seRegistry) {
        if (!a) continue;
        a.muted = m;
        a.volume = m ? 0 : getSEVolume();
      }
    } catch {}
    try {
      for (const a of loopMap.values()) {
        if (!a) continue;
        a.muted = m;
        a.volume = m ? 0 : clamp((a.__base || 1) * getSEVolume(), 0, 1);
      }
    } catch {}
  }

  /* =========================
   * Shop / Select
   * ========================= */
  function buyBgm(key) {
    if (!TRACKS[key] || !PRICES[key]) return { ok: false, reason: "unknown" };
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
    // 選択/自動に戻す操作が来たらプレビューは止める
    stopPreview({ resumeBgm: false });

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

  function playSpecial(keyOrSrc) {
    stopPreview({ resumeBgm: false });

    if (TRACKS[keyOrSrc]) {
      if (!isOwned(keyOrSrc)) { toast("未購入です"); return; }
      specialKey = keyOrSrc;
      tryPlayBgm(TRACKS[keyOrSrc], keyOrSrc);
      return;
    }
    const src = keyOrSrc;
    if (!src) return;
    specialKey = "__custom__";
    tryPlayBgm(src, null);
  }

  function clearSpecial() {
    specialKey = null;
    startBgm(true);
  }

  /* =========================
   * UI
   * ========================= */
  function removeOldUI() {
    const ids = [
      "bgmHamburgerV1","bgmPanelV1","bgmHamburgerV2","bgmPanelV2",
      "bgmStyleV1","bgmStyleV2",
    ];
    for (const id of ids) {
      try { document.getElementById(id)?.remove(); } catch {}
    }
  }

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;

    const style = document.createElement("style");
    style.id = UI.style;
    style.textContent = `
#${UI.btn}{
  position:fixed; z-index:2147483000;
  top:10px; right:10px;
  width:44px;height:44px;
  border:none;border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
#${UI.btn} .bars{ width:18px; height:14px; position:relative; }
#${UI.btn} .bars i{
  position:absolute; left:0; right:0; height:2px; border-radius:2px; background:#333;
}
#${UI.btn} .bars i:nth-child(1){ top:0; }
#${UI.btn} .bars i:nth-child(2){ top:6px; }
#${UI.btn} .bars i:nth-child(3){ top:12px; }

#${UI.panel}{
  position:fixed; z-index:2147483001;
  top:62px; right:10px;
  width:min(380px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px 12px 10px;
  display:none;

  /* ✅ スクロール対応（スクロールバー表示） */
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
#${UI.panel} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#${UI.panel} .ttl{ font-weight:900; }
#${UI.panel} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.panel} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  background:#ffd6e7;
  cursor:pointer;
}
#${UI.panel} .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
#${UI.panel} .btn.small{ padding:6px 8px; border-radius:10px; font-weight:900; }
#${UI.panel} .slider{ width:100%; margin:10px 0 6px; }
#${UI.panel} .fine{ font-size:12px; opacity:.75; }
#${UI.panel} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }

/* ✅ スクロールバーを少し見やすく（任意） */
#${UI.panel}::-webkit-scrollbar{ width: 8px; }
#${UI.panel}::-webkit-scrollbar-thumb{
  background: rgba(0,0,0,.18);
  border-radius: 999px;
}
#${UI.panel}::-webkit-scrollbar-track{
  background: transparent;
}

#bgmShopV3 .item{
  display:flex; align-items:flex-start; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin:8px 0;
}
#bgmShopV3 .name{ font-weight:900; }
#bgmShopV3 .meta{ font-size:12px; opacity:.75; margin-top:2px; line-height:1.35; }
#bgmShopV3 .right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
#bgmShopV3 .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV3 .buy{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#ffd6e7;
}
#bgmShopV3 .buy[disabled]{ opacity:.55; cursor:not-allowed; }
#bgmShopV3 .select{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV3 .select[disabled]{ opacity:.55; cursor:not-allowed; }
#bgmShopV3 .select.active{ background:#333; color:#fff; box-shadow:none; }

/* ✅ プレビュー（試聴）ボタン */
#bgmShopV3 .preview{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV3 .preview.active{
  background:#2b6cff; color:#fff; box-shadow:none;
}
`;
    document.head.appendChild(style);
  }

  function renderItem(key) {
    const price = PRICES[key] ?? 0;
    const label = LABELS[key] ?? key;
    const desc  = DESCS[key] ?? "";
    return `
<div class="item">
  <div style="min-width:170px;">
    <div class="name">${label}</div>
    <div class="meta">${desc}</div>
  </div>
  <div class="right">
    <div class="tag" id="bgmPrice_${key}">${price}🪙</div>
    <button class="preview" id="bgmPrev_${key}" type="button">試聴</button>
    <button class="buy" id="bgmBuy_${key}" type="button">購入</button>
    <button class="select" id="bgmSelect_${key}" type="button">流す</button>
  </div>
</div>`;
  }

  function mountUI() {
    if (document.getElementById(UI.btn) && document.getElementById(UI.panel)) return;

    removeOldUI();
    ensureStyle();

    const btn = document.createElement("button");
    btn.id = UI.btn;
    btn.type = "button";
    btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
    btn.title = "BGM設定";

    const panel = document.createElement("div");
    panel.id = UI.panel;

    const keys = Object.keys(TRACKS);

    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">BGM</div>
    <div class="sub" id="bgmStateTextV3">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV3" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV3" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV3" type="button">ミュート</button>
</div>

<div class="fine" style="margin-top:6px;">BGM音量</div>
<input class="slider" id="bgmVolV3" type="range" min="0" max="100" step="1" />

<div class="sep"></div>

<div class="row">
  <div class="ttl">SE音量</div>
  <div class="tag" id="seVolTagV3">🔊 0</div>
</div>
<input class="slider" id="seVolV3" type="range" min="0" max="100" step="1" />
<div class="fine">※ UFO/うんち/コイン/クリック音などに効きます</div>

<div class="sep"></div>

<div class="row">
  <div class="ttl">BGMショップ（購入＆選択）</div>
  <div class="tag" id="bgmCoinTagV3">🪙 0</div>
</div>

<div class="row" style="margin-top:6px;">
  <button class="btn ghost small" id="bgmAutoV3" type="button">🔁 自動に戻す</button>
  <button class="btn ghost small" id="bgmPrevStopV3" type="button">⏹ 試聴停止</button>
</div>

<div class="fine" id="bgmSelTextV3" style="margin-top:6px;"></div>
<div class="fine" id="bgmInfoV3" style="margin:6px 0 0;"></div>

<div id="bgmShopV3" style="margin-top:6px;">
  ${keys.map(k => renderItem(k)).join("")}
</div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const stateText = $("#bgmStateTextV3", panel);
    const info = $("#bgmInfoV3", panel);
    const selText = $("#bgmSelTextV3", panel);
    const toggle = $("#bgmToggleV3", panel);
    const mute = $("#bgmMuteV3", panel);
    const bgmVol = $("#bgmVolV3", panel);
    const seVol = $("#seVolV3", panel);
    const seTag = $("#seVolTagV3", panel);
    const close = $("#bgmCloseV3", panel);
    const coinTag = $("#bgmCoinTagV3", panel);
    const autoBtn = $("#bgmAutoV3", panel);
    const prevStopBtn = $("#bgmPrevStopV3", panel);

    const buyBtns = {};
    const selectBtns = {};
    const prevBtns = {};
    const priceTags = {};
    for (const k of keys) {
      buyBtns[k] = $(`#bgmBuy_${k}`, panel);
      selectBtns[k] = $(`#bgmSelect_${k}`, panel);
      prevBtns[k] = $(`#bgmPrev_${k}`, panel);
      priceTags[k] = $(`#bgmPrice_${k}`, panel);
    }

    function refresh() {
      // sliders
      bgmVol.value = String(Math.round(bgmSettings.volume * 100));
      seVol.value  = String(Math.round(getSEVolume() * 100));
      seTag.textContent = `🔊 ${Math.round(getSEVolume() * 100)}`;

      // toggles
      toggle.textContent = bgmSettings.enabled ? "ON" : "OFF";
      toggle.style.opacity = bgmSettings.enabled ? "1" : "0.6";
      mute.textContent = bgmSettings.muted ? "ミュート中" : "ミュート";
      mute.style.opacity = bgmSettings.muted ? "0.75" : "1";

      // coin
      const c = getCoinsWB();
      coinTag.textContent = `🪙 ${c}`;

      // selection
      const sel = selected?.selectedKey ?? null;
      const selStr = sel ? `選択中：${LABELS[sel]}` : "選択中：自動";

      // info
      const nowKey = pickByTime();
      const baseStr =
        previewKey ? `👂 試聴中：${LABELS[previewKey] || previewKey}` :
        (specialKey && specialKey !== "__custom__") ? `特別：${LABELS[specialKey] || specialKey}` :
        sel ? `選択：${LABELS[sel]}` :
        `通常：${LABELS[nowKey] || nowKey}`;

      selText.textContent = `${selStr}`;
      info.textContent = baseStr;

      // state
      const playingBgm = isBgmPlaying();
      const playingPreview = !!(previewAudio && !previewAudio.paused && previewKey);
      stateText.textContent = playingPreview ? "試聴再生中" : (playingBgm ? "再生中" : "停止中（クリックで開始）");

      // buttons
      for (const k of keys) {
        const own = isOwned(k);
        const price = PRICES[k] || 0;

        if (priceTags[k]) priceTags[k].textContent = own ? "購入済み" : `${price}🪙`;

        if (buyBtns[k]) {
          buyBtns[k].disabled = own || (c < price);
          buyBtns[k].textContent = own ? "OK" : "購入";
        }

        if (selectBtns[k]) {
          selectBtns[k].disabled = !own;
          selectBtns[k].classList.toggle("active", sel === k);
          selectBtns[k].textContent = (sel === k) ? "選択中" : "流す";
        }

        if (prevBtns[k]) {
          const isNowPrev = (previewKey === k) && (previewAudio && !previewAudio.paused);
          prevBtns[k].classList.toggle("active", isNowPrev);
          prevBtns[k].textContent = isNowPrev ? "試聴中" : "試聴";
        }
      }
    }

    function closePanel() {
      panel.style.display = "none";
      // 閉じたら試聴は止めて通常BGMに戻す（邪魔になりがちなので）
      stopPreview({ resumeBgm: true });
    }

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      if (panel.style.display === "none") stopPreview({ resumeBgm: true });
      refresh();
    });
    close.addEventListener("click", closePanel);

    toggle.addEventListener("click", async () => {
      bgmSettings.enabled = !bgmSettings.enabled;
      saveBgmSettings(bgmSettings);
      if (!bgmSettings.enabled) {
        stopPreview({ resumeBgm: false });
        stopBgm();
      } else {
        await unlockBgmOnce();
        // プレビュー中ならプレビュー継続、そうでなければ通常BGMへ
        if (!previewKey) startBgm(true);
      }
      refresh();
    });

    mute.addEventListener("click", () => {
      bgmSettings.muted = !bgmSettings.muted;
      saveBgmSettings(bgmSettings);
      applyBgmVolume();
      applyPreviewVolume();
      applyMuteToSE();
      refresh();
    });

    bgmVol.addEventListener("input", async () => {
      bgmSettings.volume = clamp(Number(bgmVol.value) / 100, 0, 1);
      saveBgmSettings(bgmSettings);
      applyBgmVolume();
      applyPreviewVolume();
      if (bgmSettings.enabled) {
        await unlockBgmOnce();
        if (!previewKey) startBgm(false);
      }
      refresh();
    });

    seVol.addEventListener("input", () => {
      setSEVolume(Number(seVol.value) / 100);
      applyMuteToSE();
      refresh();
    });

    autoBtn.addEventListener("click", async () => {
      await unlockBgmOnce();
      selectBgm(null);
      refresh();
    });

    prevStopBtn.addEventListener("click", () => {
      stopPreview({ resumeBgm: true });
      refresh();
    });

    for (const k of keys) {
      prevBtns[k]?.addEventListener("click", async () => {
        // 試聴トグル
        await unlockBgmOnce();
        if (previewKey === k) {
          stopPreview({ resumeBgm: true });
        } else {
          stopPreview({ resumeBgm: false });
          await startPreview(k);
        }
        refresh();
      });

      buyBtns[k]?.addEventListener("click", async () => {
        await unlockBgmOnce();
        const r = buyBgm(k);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        } else {
          // 購入したら試聴は止めて、そのまま選択して流す
          stopPreview({ resumeBgm: false });
          selectBgm(k);
        }
        refresh();
      });

      selectBtns[k]?.addEventListener("click", async () => {
        await unlockBgmOnce();
        stopPreview({ resumeBgm: false });
        const r = selectBgm(k);
        if (!r.ok) toast("未購入です");
        refresh();
      });
    }

    // 外側クリックで閉じる
    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel();
    }, { passive: true });

    // refresh loop
    setInterval(refresh, 600);
    refresh();
  }

  function openModal() {
    try { mountUI(); } catch {}
    const panel = document.getElementById(UI.panel);
    if (panel) panel.style.display = "block";
  }

  /* =========================
   * WB patch（swap-safe）
   * ========================= */
  let lastWBRef = null;

  function patchWB(WB) {
    if (!WB || typeof WB !== "object") return;
    if (lastWBRef === WB && WB.__bgmPatchedV33) return;
    lastWBRef = WB;

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.getSEVolume = () => getSEVolume();
    WB.setSEVolume = (v) => setSEVolume(v);

    WB.se = WB.se || {};
    WB.se.play = (src, base = 1.0) => sePlay(src, base);
    WB.se.loop = (key, src, base = 1.0) => seLoop(key, src, base);
    WB.se.stop = (key) => seStop(key);

    WB.bgm = WB.bgm || {};
    WB.bgm.mountUI = mountUI;
    WB.bgm.openModal = openModal;

    WB.bgm.start = () => startBgm(true);
    WB.bgm.stop = () => stopBgm();

    WB.bgm.playSpecial = (kOrSrc) => playSpecial(kOrSrc);
    WB.bgm.clearSpecial = () => clearSpecial();

    // ✅ プレビューAPIも公開（必要なら外部UIから呼べる）
    WB.bgm.previewStart = (key) => startPreview(key);
    WB.bgm.previewStop  = () => stopPreview({ resumeBgm: true });
    WB.bgm.getPreview   = () => previewKey;

    WB.bgm.TRACKS = TRACKS;
    WB.bgm.PRICES = PRICES;
    WB.bgm.LABELS = LABELS;
    WB.bgm.isOwned = isOwned;
    WB.bgm.buy = buyBgm;
    WB.bgm.select = selectBgm;
    WB.bgm.getSelected = () => selected?.selectedKey ?? null;
    WB.bgm.getCoins = () => getCoinsWB();

    WB.bgm.registerSE = registerSE;

    WB.__bgmPatchedV33 = true;

    if (unlocked && bgmSettings.enabled && !previewKey) startBgm(false);
  }

  function startWBWatcher() {
    patchWB(window.WB);
    const start = Date.now();
    const t = setInterval(() => {
      patchWB(window.WB);
      if (Date.now() - start > 20000) clearInterval(t);
    }, 200);
  }

  /* =========================
   * SE登録キュー回収
   * ========================= */
  function drainRegisterQueue() {
    try {
      const q = window.__milkpopSeRegisterQueue;
      if (!Array.isArray(q) || q.length === 0) return;
      while (q.length) {
        const a = q.shift();
        registerSE(a);
      }
    } catch {}
  }

  /* =========================
   * Autoplay unlock
   * ========================= */
  function setupAutoplayUnlock() {
    const handler = async () => {
      patchWB(window.WB);
      await unlockBgmOnce();
      drainRegisterQueue();
    };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });
  }

  function startTimeWatcher() {
    setInterval(() => startBgm(false), 30_000);
  }

  function waitForBody(timeoutMs = 8000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (document.body) { clearInterval(t); resolve(); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error("body wait timeout")); }
      }, 30);
    });
  }

  /* =========================
   * Boot
   * ========================= */
  (async function boot() {
    ensureBgmAudio();
    window.__milkpopSeVolume = getSEVolume();

    startWBWatcher();
    setupAutoplayUnlock();
    startTimeWatcher();

    try { await waitForBody(); } catch {}
    mountUI();

    patchWB(window.WB);

    setInterval(drainRegisterQueue, 700);

    console.log("[BGM.js] ready (use WB.bgm.openModal())");
  })();
})();
