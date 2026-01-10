// BGM.js（非module / 完全版）
// ✅ 添付BGMを購入して選択・即再生
// ✅ 時間帯BGM（朝/昼/夜）
// ✅ 手動選択が最優先
// ✅ 自動に戻すあり
// ✅ 自動再生制限解除（WB.unlockAudioOnce 連動）
// ✅ UIは必ず出る（旧UI削除）
// ✅ tenki.js / unchi.js / app.js と安全共存

(() => {
  "use strict";
  console.log("[BGM.js] LOADED full", Date.now());

  /* =========================
   * Storage Keys
   * ========================= */
  const LS_SETTINGS = "milkpop_bgm_settings_v2";
  const LS_OWNED    = "milkpop_bgm_owned_v2";
  const LS_SELECTED = "milkpop_bgm_selected_v2";

  /* =========================
   * 添付BGM（←ここ重要）
   * ========================= */
  const TRACKS = {
    morning: "./assets/bgm_morning.mp3",
    day:     "./assets/bgm_day.mp3",
    night:   "./assets/bgm_night.mp3",

    cocktail: "./assets/Cocktail_Glass.mp3",
    stream:   "./assets/Stream.mp3",
    dokkan:   "./assets/おもしろすぎてどっかん.mp3",
  };

  const LABELS = {
    morning:  "朝BGM",
    day:      "昼BGM",
    night:    "夜BGM",
    cocktail: "🍸 カクテルグラス",
    stream:   "🌊 ストリーム",
    dokkan:   "💥 どっかんBGM",
  };

  const PRICES = {
    morning:  3000,
    day:      3000,
    night:    3000,

    cocktail: 5000,
    stream:   5000,
    dokkan:   8000,
  };

  /* =========================
   * Utils
   * ========================= */
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const $ = (q,p=document)=>p.querySelector(q);

  /* =========================
   * Load / Save
   * ========================= */
  function loadSettings(){
    try{
      const j=JSON.parse(localStorage.getItem(LS_SETTINGS));
      return {
        volume: clamp(Number(j?.volume ?? 0.5),0,1),
        muted: !!j?.muted,
        enabled: j?.enabled !== false,
      };
    }catch{
      return { volume:0.5, muted:false, enabled:true };
    }
  }
  function saveSettings(){ localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

  function loadOwned(){
    try{ return JSON.parse(localStorage.getItem(LS_OWNED)) || {}; }
    catch{ return {}; }
  }
  function saveOwned(){ localStorage.setItem(LS_OWNED, JSON.stringify(owned)); }

  function loadSelected(){
    try{ return JSON.parse(localStorage.getItem(LS_SELECTED)) || { key:null }; }
    catch{ return { key:null }; }
  }
  function saveSelected(){ localStorage.setItem(LS_SELECTED, JSON.stringify(selected)); }

  let settings = loadSettings();
  let owned    = loadOwned();
  let selected = loadSelected();

  /* =========================
   * Audio Core
   * ========================= */
  let audio = null;
  let unlocked = false;
  let currentKey = null;

  function ensureAudio(){
    if(audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    applyVolume();
    return audio;
  }

  function applyVolume(){
    ensureAudio();
    audio.volume = settings.muted ? 0 : settings.volume;
  }

  function unlockOnce(){
    if(unlocked) return;
    unlocked = true;
    start(true);
  }

  function pickByTime(){
    const h = new Date().getHours();
    if(h>=5 && h<=10) return "morning";
    if(h>=11 && h<=17) return "day";
    return "night";
  }

  function isOwned(k){ return !!owned[k]; }

  async function play(key){
    if(!TRACKS[key] || !isOwned(key)) return false;
    ensureAudio();
    applyVolume();
    if(!settings.enabled || !unlocked) return false;

    if(audio.src !== new URL(TRACKS[key], location.href).href){
      audio.src = TRACKS[key];
      audio.currentTime = 0;
    }
    try{
      await audio.play();
      currentKey = key;
      return true;
    }catch{
      return false;
    }
  }

  function stop(){
    try{ audio?.pause(); }catch{}
  }

  function decideKey(){
    if(selected.key && isOwned(selected.key)) return selected.key;
    const t = pickByTime();
    if(isOwned(t)) return t;
    return Object.keys(TRACKS).find(isOwned) || null;
  }

  function start(force=false){
    const k = decideKey();
    if(!k){ stop(); return; }
    if(!force && k===currentKey) return;
    play(k);
  }

  /* =========================
   * Coin bridge
   * ========================= */
  function getCoins(){
    const WB = window.WB;
    if(WB?.getCoin) return WB.getCoin();
    if(typeof WB?.coins === "number") return WB.coins;
    return Number($("#coinValue")?.textContent||0);
  }

  function spendCoins(n){
    const WB = window.WB;
    if(WB?.spendCoin) return WB.spendCoin(n);
    const c = getCoins();
    if(c<n) return false;
    if(typeof WB?.coins === "number") WB.coins = c-n;
    return true;
  }

  /* =========================
   * Buy / Select
   * ========================= */
  function buy(key){
    if(isOwned(key)) return true;
    if(getCoins()<PRICES[key]) return false;
    if(!spendCoins(PRICES[key])) return false;
    owned[key]=true;
    saveOwned();
    return true;
  }

  function select(key){
    if(key===null){
      selected.key=null;
      saveSelected();
      start(true);
      return;
    }
    if(!isOwned(key)) return;
    selected.key=key;
    saveSelected();
    start(true);
  }

  /* =========================
   * UI
   * ========================= */
  function mountUI(){
    if($("#bgmPanelV3")) return;

    const style=document.createElement("style");
    style.textContent=`
#bgmBtnV3{position:fixed;top:10px;right:10px;z-index:2147483000;
 width:44px;height:44px;border-radius:14px;border:none;
 background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.2);font-weight:900;}
#bgmPanelV3{position:fixed;top:64px;right:10px;z-index:2147483001;
 width:340px;max-width:92vw;background:#fff;border-radius:16px;
 box-shadow:0 20px 50px rgba(0,0,0,.25);padding:12px;display:none;}
#bgmPanelV3 .item{display:flex;justify-content:space-between;align-items:center;
 margin:6px 0;padding:6px;border-radius:12px;background:#f6f6f6;}
#bgmPanelV3 button{border:none;border-radius:10px;padding:6px 10px;font-weight:900;}
`;
    document.head.appendChild(style);

    const btn=document.createElement("button");
    btn.id="bgmBtnV3";
    btn.textContent="🎵";

    const panel=document.createElement("div");
    panel.id="bgmPanelV3";
    panel.innerHTML=`
<div><b>BGM</b></div>
<div style="margin:6px 0">
 音量 <input id="bgmVolV3" type="range" min="0" max="100">
</div>
<div id="bgmListV3"></div>
<button id="bgmAutoV3">🔁 自動に戻す</button>
`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.onclick=()=>panel.style.display =
      panel.style.display==="block"?"none":"block";

    $("#bgmVolV3").value = Math.round(settings.volume*100);
    $("#bgmVolV3").oninput=e=>{
      settings.volume = clamp(e.target.value/100,0,1);
      saveSettings(); applyVolume();
    };

    $("#bgmAutoV3").onclick=()=>select(null);

    const list=$("#bgmListV3");
    Object.keys(TRACKS).forEach(k=>{
      const row=document.createElement("div");
      row.className="item";
      row.innerHTML=`
<span>${LABELS[k]}</span>
<span>
 <button class="buy">${isOwned(k)?"✔":"🪙"+PRICES[k]}</button>
 <button class="sel">▶</button>
</span>`;
      row.querySelector(".buy").onclick=()=>{
        if(buy(k)) select(k);
      };
      row.querySelector(".sel").onclick=()=>select(k);
      list.appendChild(row);
    });

    document.addEventListener("pointerdown",()=>{
      unlockOnce();
    },{once:true});
  }

  /* =========================
   * WB Export
   * ========================= */
  function exportWB(){
    const WB = window.WB || {};
    WB.bgm = {
      start:()=>start(true),
      stop,
      buy,
      select,
      isOwned,
      unlock:unlockOnce,
    };
    window.WB = WB;
  }

  /* =========================
   * Boot
   * ========================= */
  ensureAudio();
  exportWB();
  mountUI();
  setInterval(()=>start(false),30000);

})();
