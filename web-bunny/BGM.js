// BGM.js（非module / ✅購入＆選択UIが「必ず出る」版）
// ✅ FIX: 既存の V1 UI があっても削除して作り直す（購入メニューが出ない問題根絶）
// ✅ FIX: body が無いタイミングでも待ってからUI生成
// ✅ 購入したBGMを「流す」で選択して即再生、選択中は時間帯切替より優先
// ✅ 自動に戻すあり
// ✅ WB差し替え耐性 / unlockAudioOnce 連結
// ✅ NEW: NotSupportedError対策（404/HTML返却を検知して、複数パス候補から自動探索）

(() => {
  "use strict";

  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v1";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v1";
  const LS_KEY_SELECT   = "milkpop_bgm_selected_v1";

  /* =========================
   * ✅ トラック定義（キーだけ持つ）
   * - 実際のURLは candidates から自動探索して確定する
   * ========================= */
  const TRACK_KEYS = ["morning", "day", "night", "depart"];

  const PRICES = {
    morning: 3000,
    day:     3000,
    night:   3000,
    depart:  8000,
  };

  const LABELS = {
    morning: "朝BGM",
    day:     "昼BGM",
    night:   "夜BGM",
    depart:  "旅立ちBGM",
  };

  const UI = {
    hamburger: "bgmHamburgerV2",
    panel: "bgmPanelV2",
    toast: "bgmToastV2",
    style: "bgmStyleV2",
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
      if (k && !PRICES[k]) return { selectedKey: null };
      return { selectedKey: k };
    } catch { return { selectedKey: null }; }
  }
  function saveSelected(sel) { try { localStorage.setItem(LS_KEY_SELECT, JSON.stringify(sel)); } catch {} }

  let settings = loadSettings();
  let owned = loadOwned();
  let selected = loadSelected();

  let unlocked = false;
  let currentKey = null;
  let specialKey = null;

  let audio = null;

  // ✅ 直近エラー（UI表示用）
  let lastErr = "";
  let lastTriedUrl = "";

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

  /* =========================
   * ✅ BGM URL 自動探索
   * - “存在しないパス → index.htmlが返る” を確実に弾く
   * - HEADが通らない環境は Range GET で判定
   * ========================= */
  const resolvedUrlCache = Object.create(null); // key -> absoluteUrl

  function absUrl(u) {
    try { return new URL(u, location.href).href; } catch { return u; }
  }

  function makeCandidates(key) {
    // あなたのプロジェクトで起きがちなパターンを全部候補に入れる
    // ※この順番で試す（上ほど優先）
    const list = [];

    // 1) ルート /assets/bgm/xxx.mp3
    list.push(`/assets/bgm/${key}.mp3`);
    list.push(`/assets/bgm/${key}.m4a`);

    // 2) ルート /assets/bgm_xxx.mp3（あなたが今書いてる形）
    list.push(`/assets/bgm_${key}.mp3`);
    list.push(`/assets/bgm_${key}.m4a`);

    // 3) 相対 ./assets/...
    list.push(`./assets/bgm/${key}.mp3`);
    list.push(`./assets/bgm/${key}.m4a`);
    list.push(`./assets/bgm_${key}.mp3`);
    list.push(`./assets/bgm_${key}.m4a`);

    // 4) public直下（たまにある）
    list.push(`./bgm/${key}.mp3`);
    list.push(`./bgm_${key}.mp3`);

    // depart だけ別名運用してる可能性
    if (key === "depart") {
      list.unshift(`/assets/bgm/depart.mp3`, `/assets/bgm/bgm_depart.mp3`, `/assets/bgm_depart.mp3`);
      list.push(`./assets/bgm/depart.mp3`, `./assets/bgm/bgm_depart.mp3`, `./assets/bgm_depart.mp3`);
    }

    // 重複除去
    const uniq = [];
    const seen = new Set();
    for (const u of list) {
      const a = absUrl(u);
      if (seen.has(a)) continue;
      seen.add(a);
      uniq.push(a);
    }
    return uniq;
  }

  function looksHtml(ct) {
    ct = String(ct || "").toLowerCase();
    return ct.includes("text/html") || ct.includes("application/xhtml+xml");
  }
  function looksAudio(ct) {
    ct = String(ct || "").toLowerCase();
    return ct.startsWith("audio/") || ct.includes("mpeg") || ct.includes("mp3") || ct.includes("mp4") || ct.includes("aac");
  }

  async function probeUrl(url) {
    // HEAD → だめなら Range GET
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, ct };
      if (looksHtml(ct)) return { ok: false, why: "HTML returned (SPA fallback)", ct };
      if (looksAudio(ct)) return { ok: true, why: "HEAD audio", ct };
      // content-typeが曖昧でも一旦次で検証
    } catch {
      // HEADが禁止のサーバーもあるので続行
    }

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, ct };
      if (looksHtml(ct)) return { ok: false, why: "HTML returned (SPA fallback)", ct };
      if (looksAudio(ct)) return { ok: true, why: "GET range audio", ct };
      // 最後に “一応通す” 判断（octet-stream 等）
      return { ok: true, why: `unknown content-type (${ct || "none"})`, ct };
    } catch (e) {
      return { ok: false, why: `fetch failed: ${String(e)}`, ct: "" };
    }
  }

  async function resolvePlayableUrl(key) {
    if (resolvedUrlCache[key]) return resolvedUrlCache[key];

    const candidates = makeCandidates(key);
    for (const u of candidates) {
      const p = await probeUrl(u);
      if (p.ok) {
        resolvedUrlCache[key] = u;
        return u;
      }
    }
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

  async function tryPlayByKey(key) {
    ensureAudio();
    lastErr = "";
    lastTriedUrl = "";

    if (!key) return false;
    if (!isOwned(key)) { stop(); return false; }
    if (!settings.enabled) return false;
    if (!unlocked) return false;

    const url = await resolvePlayableUrl(key);
    if (!url) {
      lastErr = `BGMが配信されていません（${LABELS[key]}）`;
      toast(`⚠ ${LABELS[key]} が見つからない`);
      stop();
      return false;
    }

    lastTriedUrl = url;

    const nextHref = absUrl(url);
    if (audio.src !== nextHref) {
      try { audio.pause(); } catch {}
      audio.src = nextHref;
      audio.currentTime = 0;
    }

    applyVolume();

    try {
      await audio.play();
      return true;
    } catch (e) {
      lastErr = `${e?.name || "Error"}: ${e?.message || ""}`;
      toast("⚠ BGM再生がブロック/失敗");
      return false;
    }
  }

  function stop() { if (audio) try { audio.pause(); } catch {} }

  function decideKeyToPlay() {
    if (specialKey) return specialKey;

    const sk = selected?.selectedKey ?? null;
    if (sk && PRICES[sk] && isOwned(sk)) return sk;

    const t = pickByTime();
    if (isOwned(t)) return t;

    return ["morning", "day", "night"].find(isOwned) || null;
  }

  // ✅ 非同期で「確実に流す」
  async function startBgm(force = false) {
    const key = decideKeyToPlay();
    if (!key) { currentKey = null; stop(); return; }
    if (!force && key === currentKey) return;
    currentKey = key;

    const ok = await tryPlayByKey(key);
    // 失敗したらUI更新で理由が出る
    if (!ok) {
      // 音が鳴らないままでも currentKey は維持（UI上で分かるようにする）
    }
  }

  async function unlockBgmOnce() {
    if (unlocked) return;
    unlocked = true;
    await startBgm(true);
  }

  function buyBgm(key) {
    if (!PRICES[key]) return { ok: false, reason: "unknown" };
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

  async function selectBgm(keyOrNull) {
    const k = keyOrNull || null;

    if (k === null) {
      selected.selectedKey = null;
      saveSelected(selected);
      toast("🔁 自動BGMに戻した");
      await startBgm(true);
      return { ok: true };
    }
    if (!PRICES[k]) return { ok: false, reason: "unknown" };
    if (!isOwned(k)) return { ok: false, reason: "not_owned" };

    selected.selectedKey = k;
    saveSelected(selected);
    toast(`🎵 ${LABELS[k]} を流す`);
    await startBgm(true);
    return { ok: true };
  }

  async function playSpecial(key) {
    if (!PRICES[key]) return;
    if (!isOwned(key)) { toast("未購入です"); return; }
    specialKey = key;
    await tryPlayByKey(key);
  }

  async function clearSpecial() {
    specialKey = null;
    await startBgm(true);
  }

  /* =========================
   * WB patch (swap-safe)
   * ========================= */
  let lastWBRef = null;

  function patchWB(WB) {
    if (!WB || typeof WB !== "object") return;
    if (lastWBRef === WB && WB.__bgmPatchedV5) return;
    lastWBRef = WB;

    if (!WB.__bgmPatchedV5) WB.__bgmPatchedV5 = { done: false };

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.bgm = WB.bgm || {};
    WB.bgm.mountUI = mountUI;
    WB.bgm.playSpecial = playSpecial;
    WB.bgm.clearSpecial = clearSpecial;
    WB.bgm.start = () => startBgm(true);
    WB.bgm.stop = () => stop();
    WB.bgm.PRICES = PRICES;
    WB.bgm.LABELS = LABELS;
    WB.bgm.isOwned = isOwned;
    WB.bgm.buy = buyBgm;
    WB.bgm.select = selectBgm;
    WB.bgm.getSelected = () => selected?.selectedKey ?? null;
    WB.bgm.getCoins = () => getCoinsWB();
    WB.bgm.__resolvePlayableUrl = resolvePlayableUrl; // デバッグ用
    WB.bgm.__resolvedCache = resolvedUrlCache;        // デバッグ用

    WB.__bgmPatchedV5.done = true;

    // unlocked & enabledなら再始動
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
    const v1Btn = document.getElementById("bgmHamburgerV1");
    const v1Panel = document.getElementById("bgmPanelV1");
    try { v1Btn?.remove(); } catch {}
    try { v1Panel?.remove(); } catch {}
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
  width:min(360px, 92vw);
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

#bgmShopV2 .item{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin:8px 0;
}
#bgmShopV2 .name{ font-weight:900; }
#bgmShopV2 .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#bgmShopV2 .right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
#bgmShopV2 .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV2 .buy{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#ffd6e7;
}
#bgmShopV2 .buy[disabled]{ opacity:.55; cursor:not-allowed; }
#bgmShopV2 .select{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#bgmShopV2 .select[disabled]{ opacity:.55; cursor:not-allowed; }
#bgmShopV2 .select.active{ background:#333; color:#fff; box-shadow:none; }

#bgmErrV2{
  margin-top:8px;
  font-size:12px;
  background:#fff6f6;
  border:1px solid #ffd2d2;
  padding:8px 10px;
  border-radius:12px;
  display:none;
}
#bgmErrV2 .t{ font-weight:900; }
#bgmErrV2 .d{ margin-top:4px; opacity:.85; word-break:break-all; }
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
    <div class="sub" id="bgmStateTextV2">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV2" type="button">×</button>
</div>

<div id="bgmErrV2">
  <div class="t">⚠ 再生できません</div>
  <div class="d" id="bgmErrTextV2"></div>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV2" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV2" type="button">ミュート</button>
</div>

<input class="slider" id="bgmVolV2" type="range" min="0" max="100" step="1" />
<div class="fine" id="bgmInfoV2"></div>

<div class="sep"></div>

<div class="row">
  <div class="ttl">BGMショップ（購入＆選択）</div>
  <div class="tag" id="bgmCoinTagV2">🪙 0</div>
</div>

<div class="row" style="margin-top:6px;">
  <button class="btn ghost small" id="bgmAutoV2" type="button">🔁 自動に戻す</button>
  <div class="fine" id="bgmSelTextV2"></div>
</div>

<div id="bgmShopV2">
  ${renderItem("morning", "朝BGM", "朝の時間帯（5-10時）")}
  ${renderItem("day", "昼BGM", "昼の時間帯（11-17時）")}
  ${renderItem("night", "夜BGM", "夜の時間帯（それ以外）")}
  ${renderItem("depart", "旅立ちBGM", "特別BGM（旅立ち演出など）")}
</div>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const stateText = $("#bgmStateTextV2", panel);
    const info = $("#bgmInfoV2", panel);
    const selText = $("#bgmSelTextV2", panel);
    const toggle = $("#bgmToggleV2", panel);
    const mute = $("#bgmMuteV2", panel);
    const vol = $("#bgmVolV2", panel);
    const close = $("#bgmCloseV2", panel);
    const coinTag = $("#bgmCoinTagV2", panel);
    const autoBtn = $("#bgmAutoV2", panel);

    const errBox = $("#bgmErrV2", panel);
    const errText = $("#bgmErrTextV2", panel);

    const buyBtns = {};
    const selectBtns = {};
    const priceTags = {};
    for (const k of TRACK_KEYS) {
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
        specialKey ? `特別：${LABELS[specialKey] || specialKey}` :
        sel ? `選択：${LABELS[sel]}` :
        `通常：${LABELS[nowKey] || nowKey}`;

      const playing = audio && !audio.paused && unlocked && settings.enabled && !settings.muted && audio.volume > 0;
      stateText.textContent = playing ? "再生中" : (settings.enabled ? "停止中（クリックで開始）" : "OFF");

      if (lastErr) {
        errBox.style.display = "block";
        errText.textContent = `${lastErr}${lastTriedUrl ? ` / url=${lastTriedUrl}` : ""}`;
      } else {
        errBox.style.display = "none";
        errText.textContent = "";
      }

      for (const k of TRACK_KEYS) {
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
      lastErr = "";
      if (!settings.enabled) stop();
      else {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        await startBgm(true);
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
        await startBgm(false);
      }
      refresh();
    });

    autoBtn.addEventListener("click", async () => {
      patchWB(window.WB);
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
      await selectBgm(null);
      refresh();
    });

    for (const k of TRACK_KEYS) {
      buyBtns[k].addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}

        const r = buyBgm(k);
        if (!r.ok) {
          if (r.reason === "coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        } else {
          await selectBgm(k);
        }
        refresh();
      });

      selectBtns[k].addEventListener("click", async () => {
        patchWB(window.WB);
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        const r = await selectBgm(k);
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

    // ✅ body待ち＋旧UI削除して、購入メニュー付きUIを必ず出す
    try { await waitForBody(); } catch {}
    mountUI({ position: "top-right", title: "BGM" });
  })();
})();
