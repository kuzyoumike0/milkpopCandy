// ==============================
// セーブ
// ==============================
const KEY = "bunny_farm_save_v7_keepcoins";

function loadSave(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return { coins:0, bunnyCount:3, idleLv:0, luckLv:0 };
    const p = JSON.parse(raw);
    return {
      coins: Number(p.coins)||0,
      bunnyCount: Math.max(1, Math.floor(Number(p.bunnyCount)||3)),
      idleLv: Math.max(0, Math.floor(Number(p.idleLv)||0)),
      luckLv: Math.max(0, Math.floor(Number(p.luckLv)||0))
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
const buyIdleBtn  = document.getElementById("buyIdleBtn");
const buyLuckBtn  = document.getElementById("buyLuckBtn");

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

// クリックドロップ制限
let lastClickDropAt = 0;

// コインを床に置いておける上限（重くなるの防止）
const MAX_DROPPED_COINS = 80;

// ==============================
// SE（iOS対策：最初のユーザー操作後に解禁）
// ==============================
// 要求仕様：
// - うさぎクリック：poyo.mp3
// - コイン回収：coin.mp3
const SE = {
  poyo:   "./assets/poyo.mp3",
  collect:"./assets/coin.mp3",
};

let seUnlocked = false;
function unlockSEOnce(){
  if(seUnlocked) return;
  seUnlocked = true;
  try{
    const a = new Audio(SE.collect);
    a.volume = 0;
    a.play().then(()=>{ a.pause(); }).catch(()=>{});
  }catch{}
}
document.addEventListener("pointerdown", unlockSEOnce, { once:true });

function playSE(key, volume = 0.8){
  if(!seUnlocked) return;
  const src = SE[key];
  if(!src) return;
  try{
    const a = new Audio(src);
    a.volume = volume;
    a.currentTime = 0;
    a.play().catch(()=>{});
  }catch{}
}

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
// 床（コイン位置）
// ==============================
const COIN_SIZE = 64;
// ★ここを増やすと床が上がる（コインが上に来る）
const FLOOR_MARGIN = 28;

function getFloorY(){
  const frect = field.getBoundingClientRect();
  return Math.max(0, frect.height - COIN_SIZE - FLOOR_MARGIN);
}

function droppedCoinCount(){
  return coinLayer.querySelectorAll(".coin").length;
}

// ==============================
// 足元に「溜まる」演出パラメータ
// ==============================
// 同じ足元付近(半径)にあるコイン数を数えて、着地点を少し上げる（積み上げに見せる）
const PILE_RADIUS = 46;      // この範囲内を「同じ足元の山」とみなす
const PILE_STEP_Y = 12;      // 1枚積むごとの上がり幅
const PILE_MAX = 10;         // 山の最大段数（増え過ぎると画面外に出るので）
const PILE_JITTER_X = 10;    // 少し横ブレして自然に

function getPileCountNearX(baseX){
  const coins = coinLayer.querySelectorAll(".coin");
  let count = 0;
  coins.forEach(c=>{
    const lx = parseFloat(c.style.left || "0");
    // coinのleftは「コイン左上」なので中心へ
    const cx = lx + COIN_SIZE/2;
    if(Math.abs(cx - baseX) <= PILE_RADIUS){
      const h = Number(c.dataset.pileLevel || "0");
      // pileLevelを付けてるものだけ数える（フィールドクリック等も積みたいならここを外す）
      if(!Number.isNaN(h)) count++;
    }
  });
  return Math.min(PILE_MAX, count);
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
  const b = {
    el,
    x: 20 + i * 120,
    vx: 30 + Math.random()*30,
    dir: Math.random()<0.5?1:-1,
    t: Math.random()*10,
    lastInteract: now,
    lastDrop: now
  };

  // ✅ bunny.png（画像）クリックで：足元にコイン＋SE poyo
  img.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    e.stopPropagation(); // フィールドクリック処理に流れない
    b.lastInteract = Date.now();

    dropCoinFromBunny(b, true);
    playSE("poyo", 0.9);
  });

  return b;
}

function initBunnies(){
  bunnyLayer.innerHTML = "";
  bunnies.length = 0;
  for(let i=0;i<bunnyCount;i++){
    bunnies.push(createBunny(i));
  }
}

// ==============================
// コイン生成（床に落として置いておく）
// ==============================
// landY を指定できるようにして、「積み上げ」の着地位置を変える
function createCoin(startX, startY, landY, tier, userGesture){
  // 上限チェック（置きすぎ防止）
  if(droppedCoinCount() >= MAX_DROPPED_COINS) return;

  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();

  // フィールド内に収める
  const x = Math.max(0, Math.min(frect.width - COIN_SIZE, startX));
  const y = Math.max(0, Math.min(frect.height - COIN_SIZE, startY));

  // 着地Y（積み上げ用）
  const floorY = Math.max(0, Math.min(getFloorY(), landY));

  const drop = Math.max(0, floorY - y);

  const c = document.createElement("div");
  c.className = `coin ${tier.className}`;
  c.textContent = tier.emoji;
  c.dataset.value = String(tier.value);
  c.dataset.landY = String(floorY); // 回収アニメの中心計算に使う

  c.style.left = `${x}px`;
  c.style.top  = `${y}px`;
  c.style.setProperty("--drop", `${drop}px`);
  c.style.setProperty("--fall", `${500 + Math.random()*300}ms`);

  // クリック時SEは「poyo.mp3」に統一する要求なので、
  // コイン生成側の落下SEは鳴らさない（ここでは何もしない）
  void userGesture;

  const collect = ()=>{
    if(c.classList.contains("collecting")) return;
    c.classList.add("collecting");

    const land = Number(c.dataset.landY || String(getFloorY()));
    const cx = x + COIN_SIZE/2;
    const cy = land + COIN_SIZE/2;

    const tx = hrect.left + 30 - frect.left;
    const ty = hrect.top + hrect.height/2 - frect.top;

    c.style.transform = `translate(${tx-cx}px, ${ty-cy}px) scale(.35)`;
    c.style.opacity = "0.2";

    // 回収SE（coin.mp3）
    playSE("collect", 0.8);

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
}

// ==============================
// うさぎ足元：コインを「溜める」
// ==============================
function dropCoinFromBunny(b, userGesture=false){
  const frect = field.getBoundingClientRect();
  const brect = b.el.getBoundingClientRect();

  // うさぎ要素の中心X（足元の中心）
  const baseX = (brect.left - frect.left) + (brect.width / 2);

  // 足元開始Y（落下開始位置）
  const footY = (brect.bottom - frect.top) - COIN_SIZE;

  // 同じ足元付近のコイン数を数えて積み上げYを決める
  const pileCount = getPileCountNearX(baseX);
  const landY = getFloorY() - (pileCount * PILE_STEP_Y);

  // 横に少しブレさせて“山”感を出す（中心合わせ）
  const jitter = (Math.random()*2 - 1) * PILE_JITTER_X;
  const startX = (baseX - COIN_SIZE/2) + jitter;
  const startY = footY;

  const idleSec = (Date.now() - b.lastInteract)/1000;
  const tier = getTier(idleSec);

  // pileLevel を付与して、次回のカウントに使う
  // ※ createCoin後に要素へ付けたいので、一旦生成してから最後の1枚を拾う
  const before = droppedCoinCount();
  createCoin(startX, startY, landY, tier, userGesture);
  const after = droppedCoinCount();

  if(after > before){
    const coins = coinLayer.querySelectorAll(".coin");
    const lastCoin = coins[coins.length - 1];
    if(lastCoin){
      lastCoin.dataset.pileLevel = String(pileCount + 1);
      // “うさぎ足元の山”として判定するため、pile用タグを付けておく
      lastCoin.dataset.pile = "1";
    }
  }
}

function dropCoinAt(x,y, userGesture=false){
  const tier = getTier(0);
  const floorY = getFloorY();
  createCoin(x - COIN_SIZE/2, y - COIN_SIZE/2, floorY, tier, userGesture);
}

// ==============================
// 放置
// ==============================
setInterval(()=>{
  const now = Date.now();
  const interval = getIdleIntervalSec();

  bunnies.forEach(b=>{
    if((now - b.lastDrop)/1000 >= interval){
      // 放置は自動：音は鳴らさない
      dropCoinFromBunny(b, false);
      b.lastDrop = now;
    }
  });
}, 1000);

// ==============================
// フィールドクリック（1秒に1回）
// ==============================
field.addEventListener("pointerdown",(e)=>{
  if(e.target.closest("#hud")) return;
  if(e.target.closest(".coin")) return;
  if(e.target.closest("#shopModal")) return;
  if(e.target.closest(".bunny")) return;

  const now = Date.now();
  if(now - lastClickDropAt < 1000) return;
  lastClickDropAt = now;

  const frect = field.getBoundingClientRect();
  dropCoinAt(e.clientX - frect.left, e.clientY - frect.top, true);
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
  const dt = (now - last)/1000;
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ==============================
// ボタン
// ==============================
petBtn.onclick = ()=>{
  bunnies.forEach(b=>{
    b.lastInteract = Date.now();
    dropCoinFromBunny(b, true);
  });
  playSE("poyo", 0.75);
};

resetBtn.onclick = ()=>{
  game.coins = 0;
  updateHUD();
};

// ==============================
// ショップ価格
// ==============================
function bunnyPrice(){ return 100 + Math.max(0,bunnyCount-3)*80; }
function idlePrice(){ return 150 + idleLv*120; }
function luckPrice(){ return 200 + luckLv*160; }

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
  buyIdleBtn.disabled  = game.coins < idlePrice() || getIdleIntervalSec() <= 5;
  buyLuckBtn.disabled  = game.coins < luckPrice() || getLuckMultiplier() >= 2.0;
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

shopModal.addEventListener("pointerdown",(e)=>{
  if(e.target === shopModal) shopModal.classList.add("hidden");
});

// ==============================
// ショップ購入
// ==============================
buyBunnyBtn.onclick = ()=>{
  const p = bunnyPrice();
  if(game.coins < p) return;
  game.coins -= p;
  bunnyCount++;
  initBunnies();
  updateHUD();
  updateShop();
};

buyIdleBtn.onclick = ()=>{
  const p = idlePrice();
  if(game.coins < p) return;
  if(getIdleIntervalSec() <= 5) return;
  game.coins -= p;
  idleLv++;
  bunnies.forEach(b=>b.el.classList.add("aura"));
  updateHUD();
  updateShop();
};

buyLuckBtn.onclick = ()=>{
  const p = luckPrice();
  if(game.coins < p) return;
  if(getLuckMultiplier() >= 2.0) return;
  game.coins -= p;
  luckLv++;
  bunnies.forEach(b=>b.el.classList.add("aura"));
  updateHUD();
  updateShop();
};

// ==============================
// 開始
// ==============================
updateHUD();
initBunnies();
requestAnimationFrame(loop);
