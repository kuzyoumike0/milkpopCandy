// ==============================
// セーブ
// ==============================
const KEY = "bunny_farm_save_v5_floor";

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
// 床Y
// ==============================
function getFloorY(){
  const frect = field.getBoundingClientRect();
  return frect.height - 64 - 8;
}

// ==============================
// レア定義
// ==============================
const TIERS = [
  { emoji:"🪙", value:1, min:0, className:"" },
  { emoji:"🥈", value:3, min:60, className:"silver" },
  { emoji:"🥇", value:8, min:180, className:"gold" },
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
  coinValue.textContent = game.coins;
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
  return {
    el,
    x: 20 + i * 120,
    vx: 30 + Math.random()*30,
    dir: Math.random()<0.5?1:-1,
    t: Math.random()*10,
    lastInteract: now,
    lastDrop: now
  };
}

function initBunnies(){
  bunnyLayer.innerHTML = "";
  bunnies.length = 0;
  for(let i=0;i<bunnyCount;i++){
    bunnies.push(createBunny(i));
  }
}

// ==============================
// コイン生成
// ==============================
function createCoin(x, startY, tier){
  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();

  const floorY = getFloorY();
  const drop = Math.max(0, floorY - startY);

  const c = document.createElement("div");
  c.className = `coin ${tier.className}`;
  c.textContent = tier.emoji;
  c.dataset.value = tier.value;

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
    },280);
  };

  c.addEventListener("pointerenter",()=>{
    if(matchMedia("(hover:hover)").matches) collect();
  });
  c.addEventListener("pointerdown",(e)=>{
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(c);
  setTimeout(()=>c.remove(),30000);
}

function dropCoinFromBunny(b){
  const frect = field.getBoundingClientRect();
  const brect = b.el.getBoundingClientRect();
  const x = (brect.left - frect.left) + 60;
  const y = (brect.top - frect.top) + 40;
  createCoin(x, y, getTier((Date.now()-b.lastInteract)/1000));
  b.lastInteract = Date.now();
}

function dropCoinAt(x,y){
  createCoin(x-32, y-32, getTier(0));
}

// ==============================
// 放置
// ==============================
setInterval(()=>{
  const now = Date.now();
  bunnies.forEach(b=>{
    if((now-b.lastDrop)/1000 >= getIdleIntervalSec()){
      dropCoinFromBunny(b);
      b.lastDrop = now;
    }
  });
},1000);

// ==============================
// フィールドクリック（1秒制限）
// ==============================
field.addEventListener("pointerdown",(e)=>{
  if(e.target.closest("#hud")) return;
  if(e.target.closest(".coin")) return;
  if(e.target.closest("#shopModal")) return;

  const now = Date.now();
  if(now - lastClickDropAt < 1000) return;
  lastClickDropAt = now;

  const frect = field.getBoundingClientRect();
  dropCoinAt(e.clientX - frect.left, e.clientY - frect.top);
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
  const dt = (now-last)/1000;
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ==============================
// ボタン
// ==============================
petBtn.onclick = ()=>{
  bunnies.forEach(b=>dropCoinFromBunny(b));
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
  shopCoins.textContent = game.coins;
  shopCount.textContent = bunnyCount;
  shopBunnyPrice.textContent = bunnyPrice();

  shopIdleNow.textContent = getIdleIntervalSec();
  shopIdleLv.textContent = idleLv;
  shopIdlePrice.textContent = idlePrice();

  shopLuckNow.textContent = getLuckMultiplier().toFixed(2);
  shopLuckLv.textContent = luckLv;
  shopLuckPrice.textContent = luckPrice();

  buyBunnyBtn.disabled = game.coins < bunnyPrice();
  buyIdleBtn.disabled = game.coins < idlePrice() || getIdleIntervalSec()<=5;
  buyLuckBtn.disabled = game.coins < luckPrice() || getLuckMultiplier()>=2;
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
  if(e.target===shopModal) shopModal.classList.add("hidden");
});

buyBunnyBtn.onclick = ()=>{
  const p=bunnyPrice();
  if(game.coins<p) return;
  game.coins-=p;
  bunnyCount++;
  initBunnies();
  updateHUD();
  updateShop();
};

buyIdleBtn.onclick = ()=>{
  const p=idlePrice();
  if(game.coins<p || getIdleIntervalSec()<=5) return;
  game.coins-=p;
  idleLv++;
  bunnies.forEach(b=>b.el.classList.add("aura"));
  updateHUD();
  updateShop();
};

buyLuckBtn.onclick = ()=>{
  const p=luckPrice();
  if(game.coins<p || getLuckMultiplier()>=2) return;
  game.coins-=p;
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
// ==============================
// セーブ
// ==============================
const KEY = "bunny_farm_save_v4_aura";

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { coins: 0, bunnyCount: 3, idleLv: 0, luckLv: 0 };
    const p = JSON.parse(raw);
    return {
      coins: Number(p.coins) || 0,
      bunnyCount: Math.max(1, Number(p.bunnyCount) || 3),
      idleLv: Math.max(0, Number(p.idleLv) || 0),
      luckLv: Math.max(0, Number(p.luckLv) || 0),
    };
  } catch {
    return { coins: 0, bunnyCount: 3, idleLv: 0, luckLv: 0 };
  }
}

function saveData() {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      coins: game.coins,
      bunnyCount,
      idleLv,
      luckLv,
    })
  );
}

// ==============================
// UI取得
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
// ゲーム状態
// ==============================
const save = loadSave();
const game = { coins: save.coins };

let bunnyCount = save.bunnyCount;
let idleLv = save.idleLv;
let luckLv = save.luckLv;

// クリックドロップ制限
let lastClickDropAt = 0;

// ==============================
// 強化効果
// ==============================
function getIdleIntervalSec() {
  const base = 20;
  const reduced = idleLv * 2;
  return Math.max(5, base - reduced);
}

function getLuckMultiplier() {
  return Math.min(2.0, 1 + luckLv * 0.12);
}

function hasAura() {
  return idleLv > 0 || luckLv > 0;
}

// ==============================
// コインレア定義
// ==============================
const TIERS = [
  { emoji: "🪙", value: 1, min: 0, className: "" },
  { emoji: "🥈", value: 3, min: 60, className: "silver" },
  { emoji: "🥇", value: 8, min: 180, className: "gold" },
  { emoji: "🌈", value: 20, min: 420, className: "rainbow" },
];

function getTier(idleSec) {
  const boosted = idleSec * getLuckMultiplier();
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (boosted >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

// ==============================
// HUD更新
// ==============================
function updateHUD() {
  coinValue.textContent = String(game.coins);
  saveData();
}

// ==============================
// うさぎ管理
// ==============================
const bunnies = [];
const BUNNY_W = 160;

function createBunny(i) {
  const el = document.createElement("div");
  el.className = "bunny";
  if (hasAura()) el.classList.add("aura");

  const img = document.createElement("img");
  img.src = "./assets/bunny.png";
  img.draggable = false;

  el.appendChild(img);
  bunnyLayer.appendChild(el);

  const now = Date.now();
  return {
    el,
    x: 20 + i * 120,
    vx: 30 + Math.random() * 30,
    dir: Math.random() < 0.5 ? 1 : -1,
    t: Math.random() * 10,
    lastInteract: now,
    lastDrop: now,
  };
}

function initBunnies() {
  bunnyLayer.innerHTML = "";
  bunnies.length = 0;
  for (let i = 0; i < bunnyCount; i++) {
    bunnies.push(createBunny(i));
  }
}

// ==============================
// コイン生成
// ==============================
function createCoin(x, y, drop, tier, onCollect, frect, hrect) {
  const c = document.createElement("div");
  c.className = `coin ${tier.className}`;
  c.textContent = tier.emoji;
  c.dataset.value = String(tier.value);

  c.style.left = `${x}px`;
  c.style.top = `${y}px`;
  c.style.setProperty("--drop", `${drop}px`);
  c.style.setProperty("--fall", `${500 + Math.random() * 300}ms`);

  const collect = () => {
    if (c.classList.contains("collecting")) return;
    c.classList.add("collecting");

    const cx = x + 32;
    const cy = y + 32 + drop;
    const tx = hrect.left + 30 - frect.left;
    const ty = hrect.top + hrect.height / 2 - frect.top;

    c.style.transform = `translate(${tx - cx}px, ${ty - cy}px) scale(.35)`;
    c.style.opacity = "0.2";

    setTimeout(() => {
      game.coins += Number(c.dataset.value);
      updateHUD();
      spark(`+${c.dataset.value}`, tx, ty);
      c.remove();
      if (onCollect) onCollect();
    }, 280);
  };

  c.addEventListener("pointerenter", () => {
    if (matchMedia("(hover:hover)").matches) collect();
  });

  c.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(c);
  setTimeout(() => c.remove(), 30000);
}

function dropCoin(bunny, tier) {
  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();
  const brect = bunny.el.getBoundingClientRect();

  const x = (brect.left - frect.left) + 60;
  const y = (brect.top - frect.top) + 40;
  const drop = 140;

  createCoin(x, y, drop, tier, () => {
    bunny.lastInteract = Date.now();
  }, frect, hrect);
}

function dropCoinAt(x, y, tier) {
  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();

  const startX = x - 32;
  const startY = y - 32;
  const drop = Math.min(170, Math.max(90, frect.height - (startY + 90)));

  createCoin(startX, startY, drop, tier, null, frect, hrect);
}

function spark(text, x, y) {
  const d = document.createElement("div");
  d.className = "coinSpark";
  d.textContent = text;
  d.style.left = `${Math.max(6, x - 10)}px`;
  d.style.top = `${Math.max(6, y - 20)}px`;
  coinLayer.appendChild(d);
  setTimeout(() => d.remove(), 650);
}

// ==============================
// 放置ドロップ
// ==============================
setInterval(() => {
  const now = Date.now();
  const interval = getIdleIntervalSec();

  bunnies.forEach((b) => {
    if ((now - b.lastDrop) / 1000 >= interval) {
      const idle = (now - b.lastInteract) / 1000;
      dropCoin(b, getTier(idle));
      b.lastDrop = now;
    }
  });
}, 1000);

// ==============================
// フィールドクリック（1秒制限）
// ==============================
field.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#hud")) return;
  if (e.target.closest(".coin")) return;
  if (e.target.closest("#shopModal")) return;

  const now = Date.now();
  if (now - lastClickDropAt < 1000) return;
  lastClickDropAt = now;

  const frect = field.getBoundingClientRect();
  const x = e.clientX - frect.left;
  const y = e.clientY - frect.top;

  dropCoinAt(x, y, getTier(0));
});

// ==============================
// 歩行
// ==============================
function tick(dt) {
  const w = field.clientWidth;
  bunnies.forEach((b) => {
    b.x += b.dir * b.vx * dt;
    if (b.x < 0 || b.x > w - BUNNY_W) b.dir *= -1;
    b.t += dt * 6;
    const bob = Math.abs(Math.sin(b.t)) * 4;
    b.el.style.transform = `translate(${b.x}px, ${-bob}px) scaleX(${b.dir})`;
  });
}

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ==============================
// ボタン
// ==============================
petBtn.onclick = () => {
  bunnies.forEach((b) => {
    dropCoin(b, getTier(0));
    b.lastInteract = Date.now();
  });
};

resetBtn.onclick = () => {
  game.coins = 0;
  updateHUD();
};

// ==============================
// ショップ価格
// ==============================
function bunnyPrice() {
  return 100 + Math.max(0, bunnyCount - 3) * 80;
}
function idlePrice() {
  return 150 + idleLv * 120;
}
function luckPrice() {
  return 200 + luckLv * 160;
}

// ==============================
// ショップUI更新
// ==============================
function updateShop() {
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
shopBtn.onclick = () => {
  updateShop();
  shopModal.classList.remove("hidden");
};

shopCloseBtn.onclick = () => {
  shopModal.classList.add("hidden");
};

shopModal.addEventListener("pointerdown", (e) => {
  if (e.target === shopModal) shopModal.classList.add("hidden");
});

buyBunnyBtn.onclick = () => {
  const price = bunnyPrice();
  if (game.coins < price) return;

  game.coins -= price;
  bunnyCount++;
  initBunnies();
  updateHUD();
  updateShop();
  spark("+うさぎ", 40, 40);
};

buyIdleBtn.onclick = () => {
  const price = idlePrice();
  if (game.coins < price) return;
  if (getIdleIntervalSec() <= 5) return;

  game.coins -= price;
  idleLv++;

  bunnies.forEach((b) => b.el.classList.add("aura"));

  updateHUD();
  updateShop();
  spark("放置短縮+", 40, 70);
};

buyLuckBtn.onclick = () => {
  const price = luckPrice();
  if (game.coins < price) return;
  if (getLuckMultiplier() >= 2.0) return;

  game.coins -= price;
  luckLv++;

  bunnies.forEach((b) => b.el.classList.add("aura"));

  updateHUD();
  updateShop();
  spark("レア率+", 40, 100);
};

// ==============================
// 開始
// ==============================
updateHUD();
initBunnies();
requestAnimationFrame(loop);
