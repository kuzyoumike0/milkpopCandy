// BGM.js（非module / ✅ハンバーガーメニューから開く専用：openModalで必ず出る）V7
// ✅ 自前ハンバーガーボタンは作らない（gameMenu.jsに統合するため）
// ✅ WB.bgm.openModal() を必ず提供
// ✅ body待ち → パネル生成 → openModalで表示
// ✅ 購入＆選択（流す）/ 自動に戻す / 音量 / ミュート / ONOFF
// ✅ NotSupported(HTML/404) 対策：候補URL探索

(() => {
  "use strict";
  console.log("[BGM.js] LOADED v7 (menu-integrated modal)", Date.now());

  const LS_KEY_SETTINGS = "milkpop_bgm_settings_v1";
  const LS_KEY_OWNED    = "milkpop_bgm_owned_v1";
  const LS_KEY_SELECT   = "milkpop_bgm_selected_v1";

  const TRACK_KEYS = ["morning","day","night","depart"];

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

  const $ = (q, p=document) => p.querySelector(q);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const wait = (ms)=>new Promise(r=>setTimeout(r,ms));

  /* =========================
   * Storage
   * ========================= */
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
    } catch { return { volume: 0.5, muted: false, enabled: true }; }
  }
  function saveSettings(s){ try{ localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s)); }catch{} }

  function loadOwned() {
    try {
      const raw = localStorage.getItem(LS_KEY_OWNED);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return (j && typeof j === "object") ? j : {};
    } catch { return {}; }
  }
  function saveOwned(o){ try{ localStorage.setItem(LS_KEY_OWNED, JSON.stringify(o)); }catch{} }

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
  function saveSelected(sel){ try{ localStorage.setItem(LS_KEY_SELECT, JSON.stringify(sel)); }catch{} }

  let settings = loadSettings();
  let owned = loadOwned();
  let selected = loadSelected();

  const isOwned = (k)=>!!owned?.[k];

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

      const cur = getCoinsWB();
      if (cur < a) return false;
      setCoinsWB(cur - a);
      return true;
    } catch { return false; }
  }

  /* =========================
   * Toast
   * ========================= */
  function toast(msg){
    try{
      let el = document.getElementById("bgmToastV7");
      if(!el){
        el = document.createElement("div");
        el.id = "bgmToastV7";
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
      el.style.opacity="1";
      clearTimeout(el.__t);
      el.__t=setTimeout(()=>{ el.style.opacity="0"; },1200);
    }catch{}
  }

  /* =========================
   * Audio / unlock
   * ========================= */
  let audio = null;
  let unlocked = false;
  let currentKey = null;
  let specialKey = null;

  // UI用
  let lastErr = "";
  let lastTriedUrl = "";

  function ensureAudio(){
    if(audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyVolume();
    // エラー監視
    audio.addEventListener("error", () => {
      lastErr = "MediaError（ファイルが見つからない/音声として配信されてない可能性）";
      updateUI?.();
    });
    return audio;
  }
  function applyVolume(){
    ensureAudio();
    audio.volume = settings.muted ? 0 : settings.volume;
  }

  function pickByTime(){
    const h = new Date().getHours();
    if (h >= 5 && h <= 10) return "morning";
    if (h >= 11 && h <= 17) return "day";
    return "night";
  }

  /* ===== URL探索（HTML返却/404を弾く） ===== */
  const resolvedUrlCache = Object.create(null);

  const absUrl = (u)=>{ try{return new URL(u, location.href).href;}catch{return u;} };

  function makeCandidates(key){
    const list = [];
    list.push(`/assets/bgm/${key}.mp3`, `/assets/bgm/${key}.m4a`);
    list.push(`/assets/bgm_${key}.mp3`, `/assets/bgm_${key}.m4a`);
    list.push(`./assets/bgm/${key}.mp3`, `./assets/bgm/${key}.m4a`);
    list.push(`./assets/bgm_${key}.mp3`, `./assets/bgm_${key}.m4a`);
    if (key === "depart"){
      list.unshift(`/assets/bgm/depart.mp3`, `/assets/bgm/bgm_depart.mp3`, `/assets/bgm_depart.mp3`);
      list.push(`./assets/bgm/depart.mp3`, `./assets/bgm/bgm_depart.mp3`, `./assets/bgm_depart.mp3`);
    }
    const uniq=[]; const seen=new Set();
    for(const u of list){ const a=absUrl(u); if(seen.has(a)) continue; seen.add(a); uniq.push(a); }
    return uniq;
  }
  const looksHtml = (ct)=>String(ct||"").toLowerCase().includes("text/html");
  const looksAudio = (ct)=>{
    ct=String(ct||"").toLowerCase();
    return ct.startsWith("audio/") || ct.includes("mpeg") || ct.includes("mp3") || ct.includes("mp4") || ct.includes("aac") || ct.includes("octet-stream");
  };

  async function probeUrl(url){
    try{
      const res = await fetch(url, { method:"HEAD", cache:"no-store" });
      const ct = res.headers.get("content-type") || "";
      if(!res.ok) return { ok:false, why:`HTTP ${res.status}`, ct };
      if(looksHtml(ct)) return { ok:false, why:"HTML返却（SPAフォールバック）", ct };
      if(looksAudio(ct)) return { ok:true, why:"HEAD ok", ct };
    }catch{}
    try{
      const res = await fetch(url, { method:"GET", headers:{ Range:"bytes=0-0" }, cache:"no-store" });
      const ct = res.headers.get("content-type") || "";
      if(!res.ok) return { ok:false, why:`HTTP ${res.status}`, ct };
      if(looksHtml(ct)) return { ok:false, why:"HTML返却（SPAフォールバック）", ct };
      if(looksAudio(ct)) return { ok:true, why:"GET range ok", ct };
      return { ok:true, why:`CT不明(${ct||"none"})`, ct };
    }catch(e){
      return { ok:false, why:`fetch失敗 ${String(e)}`, ct:"" };
    }
  }

  async function resolvePlayableUrl(key){
    if(resolvedUrlCache[key]) return resolvedUrlCache[key];
    const candidates = makeCandidates(key);
    for(const u of candidates){
      const p = await probeUrl(u);
      if(p.ok){
        resolvedUrlCache[key]=u;
        return u;
      }
    }
    return null;
  }

  async function tryPlayByKey(key){
    ensureAudio();
    lastErr=""; lastTriedUrl="";
    if(!key) return false;
    if(!isOwned(key)) { stop(); return false; }
    if(!settings.enabled) return false;
    if(!unlocked) return false;

    const url = await resolvePlayableUrl(key);
    if(!url){
      lastErr = `BGMが配信されていません（${LABELS[key]}）`;
      toast(`⚠ ${LABELS[key]} が見つからない`);
      stop();
      updateUI?.();
      return false;
    }
    lastTriedUrl = url;

    if(audio.src !== url){
      try{ audio.pause(); }catch{}
      audio.src = url;
      audio.currentTime = 0;
    }

    applyVolume();

    try{
      await audio.play();
      updateUI?.();
      return true;
    }catch(e){
      lastErr = `${e?.name||"Error"}: ${e?.message||""}`;
      toast("⚠ BGM再生がブロック/失敗");
      updateUI?.();
      return false;
    }
  }

  function stop(){ if(audio) try{ audio.pause(); }catch{} }

  function decideKeyToPlay(){
    if(specialKey) return specialKey;
    const sk = selected?.selectedKey ?? null;
    if(sk && PRICES[sk] && isOwned(sk)) return sk;
    const t = pickByTime();
    if(isOwned(t)) return t;
    return ["morning","day","night"].find(isOwned) || null;
  }

  async function startBgm(force=false){
    const key = decideKeyToPlay();
    if(!key){ currentKey=null; stop(); updateUI?.(); return; }
    if(!force && key===currentKey) return;
    currentKey = key;
    await tryPlayByKey(key);
  }

  async function unlockBgmOnce(){
    if(unlocked) return;
    unlocked = true;
    await startBgm(true);
  }

  /* =========================
   * Purchase / Select
   * ========================= */
  function buyBgm(key){
    if(!PRICES[key]) return { ok:false, reason:"unknown" };
    if(isOwned(key)) return { ok:true, reason:"already" };
    const price = PRICES[key];
    const cur = getCoinsWB();
    if(cur < price) return { ok:false, reason:"coins", need:price, have:cur };
    const ok = spendCoinsWB(price);
    if(!ok) return { ok:false, reason:"coins_api" };
    owned[key]=true;
    saveOwned(owned);
    toast(`✅ ${LABELS[key]} 購入！ -${price}🪙`);
    return { ok:true, reason:"bought" };
  }

  async function selectBgm(keyOrNull){
    const k = keyOrNull || null;
    if(k===null){
      selected.selectedKey=null;
      saveSelected(selected);
      toast("🔁 自動BGMに戻した");
      await startBgm(true);
      return { ok:true };
    }
    if(!PRICES[k]) return { ok:false, reason:"unknown" };
    if(!isOwned(k)) return { ok:false, reason:"not_owned" };
    selected.selectedKey = k;
    saveSelected(selected);
    toast(`🎵 ${LABELS[k]} を流す`);
    await startBgm(true);
    return { ok:true };
  }

  async function playSpecial(key){
    if(!PRICES[key]) return;
    if(!isOwned(key)) { toast("未購入です"); return; }
    specialKey = key;
    await tryPlayByKey(key);
  }
  async function clearSpecial(){
    specialKey = null;
    await startBgm(true);
  }

  /* =========================
   * UI (Modal)
   * ========================= */
  const MODAL_ID = "milkpopBgmModalV7";
  const STYLE_ID = "milkpopBgmStyleV7";
  let updateUI = null;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
#${MODAL_ID}{
  position:fixed; inset:0; z-index:2147483647;
  display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,.35);
}
#${MODAL_ID} .panel{
  width:min(380px, calc(100vw - 24px));
  background:#fff; border-radius:18px;
  box-shadow:0 10px 30px rgba(0,0,0,.25);
  padding:14px 14px 12px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
#${MODAL_ID} .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
#${MODAL_ID} .ttl{ font-weight:900; font-size:16px; }
#${MODAL_ID} .sub{ font-size:12px; opacity:.75; margin-top:2px; }
#${MODAL_ID} .btn{
  border:none; border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  background:#ffd6e7;
}
#${MODAL_ID} .btn.ghost{
  background:#f3f3f3;
}
#${MODAL_ID} .slider{ width:100%; margin:10px 0 6px; }
#${MODAL_ID} .sep{ height:1px; background:rgba(0,0,0,.08); margin:10px 0; }
#${MODAL_ID} .tag{
  font-size:12px; font-weight:900;
  padding:4px 8px; border-radius:999px;
  background:#fff; box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${MODAL_ID} .item{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px; padding:8px 8px;
  border-radius:14px;
  background:rgba(0,0,0,.03);
  margin:8px 0;
}
#${MODAL_ID} .name{ font-weight:900; }
#${MODAL_ID} .meta{ font-size:12px; opacity:.75; margin-top:2px; }
#${MODAL_ID} .right{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
#${MODAL_ID} .buy{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#ffd6e7;
}
#${MODAL_ID} .buy[disabled]{ opacity:.55; cursor:not-allowed; }
#${MODAL_ID} .select{
  border:none; border-radius:12px;
  padding:8px 10px; font-weight:900;
  cursor:pointer; background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${MODAL_ID} .select[disabled]{ opacity:.55; cursor:not-allowed; }
#${MODAL_ID} .select.active{ background:#333; color:#fff; box-shadow:none; }
#${MODAL_ID} .err{
  margin-top:10px; font-size:12px;
  background:#fff6f6; border:1px solid #ffd2d2;
  padding:8px 10px; border-radius:12px;
  display:none;
}
#${MODAL_ID} .err .t{ font-weight:900; }
#${MODAL_ID} .err .d{ margin-top:4px; opacity:.85; word-break:break-all; }
`;
    document.head.appendChild(st);
  }

  function renderItem(key,label,desc){
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

  function ensureModal(){
    ensureStyle();
    let wrap = document.getElementById(MODAL_ID);
    if(wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = MODAL_ID;

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
<div class="row">
  <div>
    <div class="ttl">🎵 BGM</div>
    <div class="sub" id="bgmStateTextV7">未再生（画面をクリックで開始）</div>
  </div>
  <button class="btn ghost" id="bgmCloseV7" type="button">閉じる</button>
</div>

<div class="err" id="bgmErrV7">
  <div class="t">⚠ 再生できません</div>
  <div class="d" id="bgmErrTextV7"></div>
</div>

<div class="sep"></div>

<div class="row">
  <button class="btn" id="bgmToggleV7" type="button">ON</button>
  <button class="btn ghost" id="bgmMuteV7" type="button">ミュート</button>
</div>

<input class="slider" id="bgmVolV7" type="range" min="0" max="100" step="1" />
<div class="sub" id="bgmInfoV7"></div>

<div class="sep"></div>

<div class="row">
  <div class="ttl">BGMショップ（購入＆選択）</div>
  <div class="tag" id="bgmCoinTagV7">🪙 0</div>
</div>

<div class="row" style="margin-top:6px;">
  <button class="btn ghost" id="bgmAutoV7" type="button">🔁 自動に戻す</button>
  <div class="sub" id="bgmSelTextV7"></div>
</div>

<div id="bgmShopV7">
  ${renderItem("morning","朝BGM","朝の時間帯（5-10時）")}
  ${renderItem("day","昼BGM","昼の時間帯（11-17時）")}
  ${renderItem("night","夜BGM","夜の時間帯（それ以外）")}
  ${renderItem("depart","旅立ちBGM","特別BGM（旅立ち演出など）")}
</div>
`;
    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    // 背景タップで閉じる
    wrap.addEventListener("pointerdown", (e)=>{ if(e.target === wrap) closeModal(); });

    // wiring
    const stateText = $("#bgmStateTextV7", panel);
    const info = $("#bgmInfoV7", panel);
    const selText = $("#bgmSelTextV7", panel);
    const toggle = $("#bgmToggleV7", panel);
    const mute = $("#bgmMuteV7", panel);
    const vol = $("#bgmVolV7", panel);
    const closeBtn = $("#bgmCloseV7", panel);
    const coinTag = $("#bgmCoinTagV7", panel);
    const autoBtn = $("#bgmAutoV7", panel);

    const errBox = $("#bgmErrV7", panel);
    const errText = $("#bgmErrTextV7", panel);

    const buyBtns = {};
    const selectBtns = {};
    const priceTags = {};
    for(const k of TRACK_KEYS){
      buyBtns[k] = $(`#bgmBuy_${k}`, panel);
      selectBtns[k] = $(`#bgmSelect_${k}`, panel);
      priceTags[k] = $(`#bgmPrice_${k}`, panel);
    }

    updateUI = () => {
      try{
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

        if(lastErr){
          errBox.style.display = "block";
          errText.textContent = `${lastErr}${lastTriedUrl ? ` / url=${lastTriedUrl}` : ""}`;
        }else{
          errBox.style.display = "none";
          errText.textContent = "";
        }

        for(const k of TRACK_KEYS){
          const own = isOwned(k);
          const price = PRICES[k];
          priceTags[k].textContent = own ? "購入済み" : `${price}🪙`;
          buyBtns[k].disabled = own || (c < price);
          buyBtns[k].textContent = own ? "OK" : "購入";

          selectBtns[k].disabled = !own;
          selectBtns[k].classList.toggle("active", sel === k);
          selectBtns[k].textContent = (sel === k) ? "選択中" : "流す";
        }
      }catch{}
    };

    closeBtn.addEventListener("click", closeModal);

    toggle.addEventListener("click", async ()=>{
      settings.enabled = !settings.enabled;
      saveSettings(settings);
      lastErr = "";
      if(!settings.enabled) stop();
      else {
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        await startBgm(true);
      }
      updateUI();
    });

    mute.addEventListener("click", ()=>{
      settings.muted = !settings.muted;
      saveSettings(settings);
      applyVolume();
      updateUI();
    });

    vol.addEventListener("input", async ()=>{
      settings.volume = clamp(Number(vol.value)/100, 0, 1);
      saveSettings(settings);
      applyVolume();
      if(settings.enabled){
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        await startBgm(false);
      }
      updateUI();
    });

    autoBtn.addEventListener("click", async ()=>{
      try { await window.WB?.unlockAudioOnce?.(); } catch {}
      await selectBgm(null);
      updateUI();
    });

    for(const k of TRACK_KEYS){
      buyBtns[k].addEventListener("click", async ()=>{
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        const r = buyBgm(k);
        if(!r.ok){
          if(r.reason==="coins") toast(`🪙 足りない！ ${r.have} / ${r.need}`);
          else toast("購入できませんでした");
        }else{
          await selectBgm(k);
        }
        updateUI();
      });

      selectBtns[k].addEventListener("click", async ()=>{
        try { await window.WB?.unlockAudioOnce?.(); } catch {}
        const r = await selectBgm(k);
        if(!r.ok) toast("未購入です");
        updateUI();
      });
    }

    // 定期更新（所持コイン表示など）
    setInterval(()=>updateUI?.(), 500);

    updateUI();
    return wrap;
  }

  function openModal(){
    ensureAudio();
    const wrap = ensureModal();
    wrap.style.display = "flex";
    updateUI?.();
  }
  function closeModal(){
    const wrap = document.getElementById(MODAL_ID);
    if(wrap) wrap.style.display = "none";
  }

  /* =========================
   * WB patch / unlock hook
   * ========================= */
  function patchWB(){
    const WB = window.WB;
    if(!WB || typeof WB !== "object") return;

    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockBgmOnce();
    };

    WB.bgm = Object.assign({}, WB.bgm || {}, {
      openModal,
      closeModal,
      start: ()=>startBgm(true),
      stop,
      buy: buyBgm,
      select: selectBgm,
      playSpecial,
      clearSpecial,
      PRICES,
      LABELS,
      isOwned,
      __resolvedCache: resolvedUrlCache, // デバッグ
    });
  }

  /* =========================
   * Autoplay unlock assist
   * ========================= */
  function setupAutoplayUnlock(){
    const handler = async ()=>{
      patchWB();
      try{ await window.WB?.unlockAudioOnce?.(); }catch{}
    };
    window.addEventListener("pointerdown", handler, { passive:true });
    window.addEventListener("keydown", handler, { passive:true });
    window.addEventListener("touchstart", handler, { passive:true });
  }

  function startTimeWatcher(){
    setInterval(()=>startBgm(false), 30_000);
  }

  async function waitForBody(timeoutMs=8000){
    const start = Date.now();
    while(Date.now()-start < timeoutMs){
      if(document.body) return true;
      await wait(30);
    }
    return false;
  }

  /* =========================
   * Boot
   * ========================= */
  (async function boot(){
    ensureAudio();
    patchWB();
    setupAutoplayUnlock();
    startTimeWatcher();

    await waitForBody();
    // UIは openModal の時に必ず生成されるが、念のため先にstyleだけもOK
    // ensureModal();

    // 起動時に鳴らすのはブロックされるのでやらない（unlock後に startBgm が走る）
    startBgm(false);

    console.log("[BGM] ready. use WB.bgm.openModal()");
  })();
})();
