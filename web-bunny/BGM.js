// BGM.js（非module / ✅朝昼夜は自動・別枠で「購入した曲を好きな時に流す」）
// ✅ 通常BGM：朝/昼/夜 は時間帯で自動（買ってれば自動で鳴る）
// ✅ いつでもBGM：添付曲（Stream / おもしろすぎてどっかん / Cocktail_Glass）を購入して任意に選択して流せる
// ✅ 「いつでもBGM」を選択中は、時間帯切替より優先
// ✅ 自動に戻すあり
// ✅ 既存UIがあっても削除して作り直す（購入メニュー出ない問題根絶）
// ✅ body待ってからUI生成
// ✅ WB差し替え耐性 / unlockAudioOnce 連結

(() => {
  "use strict";

  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v2";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v2";
  const LS_KEY_SELECT   = "milkpop_bgm_selected_v2";

  /* =========================
   * Tracks
   * ========================= */

  // ✅ 通常BGM（時間帯で自動）
  const BASE_TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",
  };

  // ✅ 特別（演出用に呼び出す用：任意）
  const SPECIAL_TRACKS = {
    depart:  "./assets/bgm_depart.mp3",
  };

  // ✅ いつでもBGM（添付曲：購入して自由に流す）
  // 置き場所：./assets/ に入れてください
  const ANYTIME_TRACKS = {
    stream:   "./assets/bgm_stream.mp3",          // Stream.mp3
    dokkan:   "./assets/bgm_dokkan.mp3",          // おもしろすぎてどっかん.mp3
    cocktail: "./assets/bgm_cocktail_glass.mp3",  // Cocktail_Glass.mp3
  };

  // 全トラック（内部判定用）
  const TRACKS = { ...BASE_TRACKS, ...SPECIAL_TRACKS, ...ANYTIME_TRACKS };

  const PRICES = {
    // 通常
    morning: 3000,
    day:     3000,
    night:   3000,

    // 特別
    depart:  8000,

    // いつでも（価格は好きに変更OK）
    stream:   12000,
    dokkan:   15000,
    cocktail: 10000,
  };

  const LABELS = {
    // 通常
    morning: "朝BGM",
    day:     "昼BGM",
    night:   "夜BGM",

    // 特別
    depart:  "旅立ちBGM",

    // いつでも
    stream:   "Stream（いつでも）",
    dokkan:   "おもしろすぎてどっかん（いつでも）",
    cocktail: "Cocktail_Glass（いつでも）",
  };

  const UI = {
    hamburger: "bgmHamburgerV3",
    panel: "bgmPanelV3",
    toast: "bgmToastV3",
    style: "bgmStyleV3",
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

  let settings = loadSettings();
  let owned = loadOwned();
  let selected = loadSelected();

  let unlocked = false;
  let currentKey = null;

  // specialKey は「演出で一時的に鳴らす」用途（選択中よりさらに優先）
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

  function isOwned(key) { return !!owned?.[key]; }

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

    const nextHref = new URL(src, location.href).href;
    if (audio.src !== nextHref) {
      try { audio.pause(); } catch {}
      audio.src = src;
      audio.currentTime = 0;
    }

    applyVolume();
    if (!settings.enabled) return false;
    if (!unlocked) return false;

    try { await audio.play(); return true; } catch { return false; }
  }

  function stop() { if (audio) try { audio.pause(); } catch {} }

  // ✅ 優先順位：
  // 1) specialKey（演出一時BGM）
  // 2) selectedKey（いつでもBGM or 通常BGMを手動選択）
  // 3) 時間帯（朝昼夜）
  // 4) 持ってる中でどれか
  function decideKeyToPlay() {
    if (specialKey && TRACKS[specialKey] && isOwned(specialKey)) return specialKey;

    const sk = selected?.selectedKey ?? null;
    if (sk && TRACKS[sk] && isOwned(sk)) return sk;

    const t = pickByTime();
    if (isOwned(t)) return t;

    return Object.keys(BASE_TRACKS).find(isOwned) ||
           Object.keys(ANYTIME_TRACKS).find(isOwned) ||
           Object.keys(SPECIAL_TRACKS).find(isOwned) ||
           null;
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
  }

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

  // 演出などで一時的に鳴らす（手動選択より優先）
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
    if (lastWBRef === WB && WB.__bgmPatchedV6) return;
    lastWBRef = WB;

    if (!WB.__bgmPatchedV6) WB.__bgmPatchedV6 = { done: false };

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.bgm = WB.bgm || {};
    WB.bgm.mountUI = mountUI;

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

    WB.__bgmPatchedV6.done = true;

    if (unlocked && settings.enabled) startBgm(true);
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

  function removeOldUI() {
    // 過去UIを根こそぎ削除（購入メニュー出ない問題を根絶）
    const ids = [
      "bgmHamburgerV1","bgmPanelV1",
      "bgmHamburgerV2","bgmPanelV2",
      UI.hamburger, UI.panel,
    ];
    for (const id of ids) {
      const el = document.getElementById(id);
      try { el?.remove(); } catch {}
    }
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

  function mountUI({ position = "top-right", title = "BGM" } = {}) {
    if (document.getElementById(UI.hamburger) && document.getElementById(UI.panel)) return;

    removeOldUI();

    if (!document.getElementById(UI.style)) {
      const style = document.createElement("style");
      style.id = UI.style;
      style.textContent = `
#${UI.hamburger}{
  position:fixed; z-index:2147483000;
  ${position.includes("top") ? "top:10px;" : "bottom:10px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:44px;height:44px;
  border:none;border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}
#${UI.hamburger} .bars{ width:18px; height:14px; position:relative; }
#${UI.hamburger} .bars i{
  position:absolute; left:0; right:0; height:2px; border-radius:2px; background:#333;
}
#${UI.hamburger} .bars i:nth-child(1){ top:0; }
#${UI.hamburger} .bars i:nth-child(2){ top:6px; }
#${UI.hamburger} .bars i:nth-child(3){ top:12px; }

#${UI.panel}{
  position:fixed; z-index:2147483001;
  ${position.includes("top") ? "top:62px;" : "bottom:62px;"}
  ${position.includes("right") ? "right:10px;" : "left:10px;"}
  width:min(380px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:12px 12px 10px;
  display:none;
}
#${UI.panel} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#${UI.panel} .ttl{ font-weight:900; }
#${UI.panel} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${UI.panel} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:800;
  background:#ffd6e7;
  cursor:pointer;
}
#${UI.panel} .btn.ghost{ background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08); }
#${UI.panel} .btn.small{ padding:6px 8px; border-radius:10px; font-weight:900; }
#${UI.panel} .slider{ width:100%; margin:10px 0 6px; }
#${UI.panel} .fine{ font-size:12px; opacity:.75; }
#${UI.panel} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }

#bgmShopV3 .item{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin:8px 0;
}
#bgmShopV3 .name{ font-weight:900; }
#bgmShopV3 .meta{ font-size:12px; opacity:.75; margin-top:2px; }
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

#bgmShopV3 .sectionTitle{
  margin-top:10px;
  font-size:12px;
  font-weight:900;
  opacity:.75;
  letter-spacing:.03em;
}
`;
      document.head.appendChild(style);
    }

    const btn = document.createElement("button");
    btn.id = UI.hamburger;
    btn.type = "button";
    btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
    btn.title = "BGM設定";

    const panel = document.createElement("div");
    panel.id = UI.panel;

    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">${title}</div>
    <div class="sub" id="bgmStateTextV3">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV3" type="button">×</button>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV3" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV3" type="button">ミュート</button>
</div>

<input class="slider" id="bgmVolV3" type="range" min="0" max="100" step="1" />
<div class="fine" id="bgmInfoV3"></div>

<div class="sep"></div>

<div class="row">
  <div class="ttl">BGMショップ（購入＆選択）</div>
  <div class="tag" id="bgmCoinTagV3">🪙 0</div>
</div>

<div class="row" style="margin-top:6px;">
  <button class="btn ghost small" id="bgmAutoV3" type="button">🔁 自動に戻す</button>
  <div class="fine" id="bgmSelTextV3"></div>
</div>

<div id="bgmShopV3">
  <div class="sectionTitle">▼ 通常BGM（朝昼夜：自動）</div>
  ${renderItem("morning", LABELS.morning, "朝の時間帯（5-10時）")}
  ${renderItem("day",     LABELS.day,     "昼の時間帯（11-17時）")}
  ${renderItem("night",   LABELS.night,   "夜の時間帯（それ以外）")}

  <div class="sectionTitle">▼ いつでもBGM（購入して好きな時に流す）</div>
  ${renderItem("stream",   LABELS.stream,   "購入するといつでも選択して再生できる")}
  ${renderItem("dokkan",   LABELS.dokkan,   "購入するといつでも選択して再生できる")}
  ${renderItem("cocktail", LABELS.cocktail, "購入するといつでも選択して再生できる")}

  <div class="sectionTitle">▼ 特別BGM（演出用）</div>
  ${renderItem("depart", LABELS.depart, "旅立ち演出などで使う（手動でも可）")}
</div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const stateText = $("#bgmStateTextV3", panel);
    const info = $("#bgmInfoV3", panel);
    const selText = $("#bgmSelTextV3", panel);
    const toggle = $("#bgmToggleV3", panel);
    const mute = $("#bgmMuteV3", panel);
    const vol = $("#bgmVolV3", panel);
    const close = $("#bgmCloseV3", panel);
    const coinTag = $("#bgmCoinTagV3", panel);
    const autoBtn = $("#bgmAutoV3", panel);

    const buyBtns = {};
    const selectBtns = {};
    const priceTags = {};
    for (const k of Object.keys(PRICES)) {
      buyBtns[k] = $(`#bgmBuy_${k}`, panel);
      selectBtns[k] = $(`#bgmSelect_${k}`, panel);
      priceTags[k] = $(`#bgmPrice_${k}`, panel);
    }

    function refresh() {
      vol.value = String(Math.round(settings.volume * 100));
      toggle.textContent = settings.enabled ? "ON" : "OFF";
      toggle.style.opacity = settings.enabled ? "1" : "0.6";
      mute.textContent = settings.muted ? "ミュート中" : "ミュート";
      mute.style.opacity = settings.muted ? "0.75" : "1";

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
        priceTags[k].textContent = own ? "購入済み" : `${price}🪙`;
        buyBtns[k].disabled = own || (c < price);
        buyBtns[k].textContent = own ? "OK" : "購入";

        selectBtns[k].disabled = !own;
        selectBtns[k].classList.toggle("active", sel === k);
        selectBtns[k].textContent = (sel === k) ? "選択中" : "流す";
      }
    }

    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      refresh();
    });
    close.addEventListener("click", () => { panel.style.display = "none"; });

    toggle.addEventListener("click", async () => {
      settings.enabled = !settings.enabled;
      saveSettings(settings);
      if (!settings.enabled) stop();
      else {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        startBgm(true);
      }
      refresh();
    });

    mute.addEventListener("click", () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
      refresh();
    });

    vol.addEventListener("input", async () => {
      settings.volume = clamp(Number(vol.value) / 100, 0, 1);
      saveSettings(settings);
      applyVolume();
      if (settings.enabled) {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        startBgm(false);
      }
      refresh();
    });

    autoBtn.addEventListener("click", async () => {
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
      selectBgm(null);
      refresh();
    });

    for (const k of Object.keys(PRICES)) {
      buyBtns[k].addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}

        const r = buyBgm(k);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        } else {
          // ✅ 購入したらそのまま選択して流す
          selectBgm(k);
        }
        refresh();
      });

      selectBtns[k].addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        const r = selectBgm(k);
        if (!r.ok) toast("未購入です");
        refresh();
      });
    }

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.style.display = "none";
    });

    setInterval(refresh, 500);
    refresh();
  }

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
    // ✅ 時間帯チェック（選択中が無ければ勝手に朝昼夜へ切替）
    setInterval(() => startBgm(false), 30_000);
  }

  (async function boot() {
    ensureAudio();
    startWBWatcher();
    setupAutoplayUnlock();
    startBgm(false);
    startTimeWatcher();

    // ✅ body待ち＋旧UI削除して、購入メニュー付きUIを必ず出す
    try { await waitForBody(); } catch {}
    mountUI({ position: "top-right", title: "BGM" });
  })();
})();
