// ==============================
// セーブ
// ==============================
const KEY = "bunny_farm_save_v6_bunnyclick_se";

function loadSave(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return { coins:0, bunnyCount:3, idleLv:0, luckLv:0 };
    const p = JSON.parse(raw);
    return {
      coins: Number(p.coins)||0,
      bunnyCount: Math.max(1, Number(p.bunnyCount)||3),
      idleLv: Math.max(0, Number(p.idleLv)||0),
      luckLv: Math.max(0, Number(p.luckLv)||0)
    };
  }catch{
    return { coins:0, bunnyCount:3, idleLv:0, luckLv:0 };
  }
}

function saveData(){
  localStorage.setItem(KEY, JSON.stringify({
    coins: game.coins,
    bunnyCount,
    idleLv,
    luckLv
  }));
}

// ==============================
// UI
// ==============================
const coinValue = document.getElementById("coinValue");
const petBtn = document.getElementById("petBtn");
const resetBtn = document.getElementById("resetBtn");

const shopBtn = document.getElementById("shopBtn");
const shopModal = document.getElementById("shopModal");
const shopCloseBtn = document.getElementById("shopCloseBtn");

const buyBunnyBtn = document.getElementById("buyBunnyBtn");
const buyIdleBtn = document.getElementById("buyIdleBtn");
const buyLuckBtn = document.getElementById("buyLuckBtn");

const shopCoins = document.getElementById("shopCoins");
const shopCount = document.getElementById("shopCount");
const shopBunnyPrice = document.getElementById("shopBunnyPrice");
const shopIdleNow = document.getElementById("shopIdleNow");
const shopIdleLv = document.getElementById("shopIdleLv");
const shopIdlePrice = document.getElementById("shopIdlePrice");
const shopLuckNow = document.getElementById("shopLuckNow");
const shopLuckLv = document.getElementById("shopLuckLv");
const shopLuckPrice = document.getElementById("shopLuckPrice");

const field = document.getElementById("field");
const bunnyLayer = document.getElementById("bunnyLayer");
const coinLayer = document.getElementById("coinLayer");
const hud = document.getElementById("hud");

// ==============================
// 状態
// ==============================
const save = loadSave();
const game = { coins: save.coins };
let bunnyCount = save.bunnyCount;
let idleLv = save.idleLv;
let luckLv = save.luckLv;

// クリックドロップ制限（フィールドクリックのみ）
let lastClickDropAt = 0;

// ==============================
// 強化効果
// ==============================
function getIdleIntervalSec(){
  return Math.max(5, 20 - idleLv * 2);
}
function getLuckMultiplier(){
  return Math.min(2.0, 1 + luckLv * 0.12);
}
function hasAura(){
  return idleLv > 0 || luckLv > 0;
}

// ==============================
// SE（ぽよっ）
// ==============================
let audioCtx = null;

function ensureAudio(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  // iOS対策：ユーザー操作中にresume
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(()=>{});
  }
  return audioCtx;
}

// “ぽよっ”っぽい短い音（ピッチが下がる）
function playPoyo(){
  const ctx = ensureAudio();
  if(!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sine";
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, now);

  // ピッチ：高め→低めに落とす
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

  // 音量エンベロープ（短く）
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.18);
}

// ==============================
// 床Y（コインは床に落とす）
// ==============================
function getFloorY(){
  const frect = field.getBoundingClientRect();
  return frect.height - 64 - 8; // 64=コインサイズ, 8=余白
}

// ==============================
// レア定義
// ==============================
const TIERS = [
  { emoji:"🪙", value:1,  min:0,   className:"" },
  { emoji:"🥈", value:3,  min:60,  className:"silver" },
  { emoji:"🥇", value:8,  min:180, className:"gold" },
  { emoji:"🌈", value:20, min:420, className:"rainbow" }
];

function getTier(idleSec){
  const boosted = idleSec * getLuckMultiplier();
  for(let i=TIERS.length-1;i>=0;i--){
    if(boosted >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

// ==============================
// HUD
// ==============================
function updateHUD(){
  coinValue.textContent = String(game.coins);
  saveData();
}

// ==============================
// うさぎ
// ==============================
const bunnies = [];
const BUNNY_W = 160;

function createBunny(i){
  const el = document.createElement("div");
  el.className = "bunny";
  if(hasAura()) el.classList.add("aura");

  const img = document.createElement("img");
  img.src = "./assets/bunny.png";
  img.draggable = false;

  el.appendChild(img);
  bunnyLayer.appendChild(el);

  const now = Date.now();

  // ★返すオブジェクトを先に作ってからイベントで参照する
  const bunnyObj = {
    el,
    x: 20 + i * 120,
    vx: 30 + Math.random()*30,
    dir: Math.random()<0.5 ? 1 : -1,
    t: Math.random()*10,
    lastInteract: now,
    lastDrop: now
  };

  // ✅ うさぎクリックでコインを落とす（＋ぽよっSE）
  el.addEventListener("pointerdown", (e)=>{
    e.stopPropagation(); // フィールドクリックと二重発火防止
    playPoyo();
    dropCoinFromBunny(bunnyObj);
  });

  return bunnyObj;
}

function initBunnies(){
  bunnyLayer.innerHTML = "";
  bunnies.length = 0;
  for(let i=0;i<bunnyCount;i++){
    bunnies.push(createBunny(i));
  }
}

// ==============================
// コイン生成（床に落とす）
// ==============================
function createCoin(x, startY, tier){
  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();
  const floorY = getFloorY();
  const drop = Math.max(0, floorY - startY);

  const c = document.createElement("div");
  c.className = `coin ${tier.className}`;
  c.textContent = tier.emoji;
  c.dataset.value = String(tier.value);

  c.style.left = `${x}px`;
  c.style.top = `${startY}px`;
  c.style.setProperty("--drop", `${drop}px`);
  c.style.setProperty("--fall", `${500 + Math.random()*300}ms`);

  const collect = ()=>{
    if(c.classList.contains("collecting")) return;
    c.classList.add("collecting");

    const cx = x + 32;
    const cy = floorY + 32;

    const tx = hrect.left + 30 - frect.left;
    const ty = hrect.top + hrect.height/2 - frect.top;

    c.style.transform = `translate(${tx-cx}px, ${ty-cy}px) scale(.35)`;
    c.style.opacity = "0.2";

    setTimeout(()=>{
      game.coins += Number(c.dataset.value);
      updateHUD();
      c.remove();
    }, 280);
  };

  // PC：ホバー回収
  c.addEventListener("pointerenter", ()=>{
    if(matchMedia("(hover:hover)").matches) collect();
  });

  // iPad：タップ回収
  c.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(c);
  setTimeout(()=>c.remove(), 30000);
}

function dropCoinFromBunny(b){
  const frect = field.getBoundingClientRect();
  const brect = b.el.getBoundingClientRect();

  const x = (brect.left - frect.left) + 60;
  const y = (brect.top - frect.top) + 40;

  const idleSec = (Date.now() - b.lastInteract) / 1000;
  createCoin(x, y, getTier(idleSec));

  b.lastInteract = Date.now();
}

function dropCoinAt(x, y){
  createCoin(x - 32, y - 32, getTier(0));
}

// ==============================
// 放置（強化：放置短縮反映）
// ==============================
setInterval(()=>{
  const now = Date.now();
  const interval = getIdleIntervalSec();

  bunnies.forEach(b=>{
    if((now - b.lastDrop)/1000 >= interval){
      // 放置で落とす（SEは鳴らさない）
      dropCoinFromBunny(b);
      b.lastDrop = now;
    }
  });
}, 1000);

// ==============================
// フィールドクリック（1秒制限）
// ==============================
field.addEventListener("pointerdown", (e)=>{
  if(e.target.closest("#hud")) return;
  if(e.target.closest(".coin")) return;
  if(e.target.closest("#shopModal")) return;

  const now = Date.now();
  if(now - lastClickDropAt < 1000) return;
  lastClickDropAt = now;

  const frect = field.getBoundingClientRect();
  const x = e.clientX - frect.left;
  const y = e.clientY - frect.top;

  playPoyo();      // ✅ クリックでもぽよっ
  dropCoinAt(x, y);
});

// ==============================
// 歩行
// ==============================
function tick(dt){
  const w = field.clientWidth;
  bunnies.forEach(b=>{
    b.x += b.dir * b.vx * dt;
    if(b.x < 0 || b.x > w - BUNNY_W) b.dir *= -1;

    b.t += dt * 6;
    const bob = Math.abs(Math.sin(b.t)) * 4;
    b.el.style.transform = `translate(${b.x}px, ${-bob}px) scaleX(${b.dir})`;
  });
}

let last = performance.now();
function loop(now){
  const dt = (now - last) / 1000;
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ==============================
// ボタン
// ==============================
petBtn.onclick = ()=>{
  // “なでる”は全員落とす＆SE
  playPoyo();
  bunnies.forEach(b => dropCoinFromBunny(b));
};

resetBtn.onclick = ()=>{
  game.coins = 0;
  updateHUD();
};

// ==============================
// ショップ価格
// ==============================
function bunnyPrice(){ return 100 + Math.max(0, bunnyCount - 3) * 80; }
function idlePrice(){ return 150 + idleLv * 120; }
function luckPrice(){ return 200 + luckLv * 160; }

// ==============================
// ショップUI
// ==============================
function updateShop(){
  shopCoins.textContent = String(game.coins);
  shopCount.textContent = String(bunnyCount);
  shopBunnyPrice.textContent = String(bunnyPrice());

  shopIdleNow.textContent = String(getIdleIntervalSec());
  shopIdleLv.textContent = String(idleLv);
  shopIdlePrice.textContent = String(idlePrice());

  shopLuckNow.textContent = getLuckMultiplier().toFixed(2);
  shopLuckLv.textContent = String(luckLv);
  shopLuckPrice.textContent = String(luckPrice());

  buyBunnyBtn.disabled = game.coins < bunnyPrice();
  buyIdleBtn.disabled = game.coins < idlePrice() || getIdleIntervalSec() <= 5;
  buyLuckBtn.disabled = game.coins < luckPrice() || getLuckMultiplier() >= 2.0;
}

// ==============================
// ショップ操作
// ==============================
shopBtn.onclick = ()=>{
  updateShop();
  shopModal.classList.remove("hidden");
};

shopCloseBtn.onclick = ()=>{
  shopModal.classList.add("hidden");
};

shopModal.addEventListener("pointerdown", (e)=>{
  if(e.target === shopModal) shopModal.classList.add("hidden");
});

buyBunnyBtn.onclick = ()=>{
  const p = bunnyPrice();
  if(game.coins < p) return;
  game.coins -= p;
  bunnyCount++;

  initBunnies();
  updateHUD();
  updateShop();
  playPoyo();
};

buyIdleBtn.onclick = ()=>{
  const p = idlePrice();
  if(game.coins < p || getIdleIntervalSec() <= 5) return;

  game.coins -= p;
  idleLv++;

  // 強化したら虹オーラ
  bunnies.forEach(b => b.el.classList.add("aura"));

  updateHUD();
  updateShop();
  playPoyo();
};

buyLuckBtn.onclick = ()=>{
  const p = luckPrice();
  if(game.coins < p || getLuckMultiplier() >= 2.0) return;

  game.coins -= p;
  luckLv++;

  // 強化したら虹オーラ
  bunnies.forEach(b => b.el.classList.add("aura"));

  updateHUD();
  updateShop();
  playPoyo();
};

// ==============================
// 開始
// ==============================
updateHUD();
initBunnies();
requestAnimationFrame(loop);
