// ===== 保存 =====
const KEY = "web_bunny_save_multi_final";

function loadSave(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return { coins:0 };
    const p = JSON.parse(raw);
    return { coins: Number.isFinite(p.coins) ? p.coins : 0 };
  }catch{
    return { coins:0 };
  }
}

function writeSave(data){
  localStorage.setItem(KEY, JSON.stringify(data));
}

// ===== UI =====
const coinValue = document.getElementById("coinValue");
const petBtn = document.getElementById("petBtn");
const resetBtn = document.getElementById("resetBtn");
const field = document.getElementById("field");
const bunnyLayer = document.getElementById("bunnyLayer");
const coinLayer = document.getElementById("coinLayer");
const hud = document.getElementById("hud");

// ===== ゲーム状態 =====
const save = loadSave();

const game = {
  bankCoins: save.coins,
  maxDropped: 20,
  idleSecondsToDrop: 20
};

// ===== コインレア =====
const COIN_TIERS = [
  { emoji:"🪙", value:1, minIdle:0,   className:"" },
  { emoji:"🥈", value:3, minIdle:60,  className:"silver" },
  { emoji:"🥇", value:8, minIdle:180, className:"gold" },
  { emoji:"🌈", value:20,minIdle:420, className:"rainbow" }
];

function getTier(idleSec){
  for(let i=COIN_TIERS.length-1;i>=0;i--){
    if(idleSec>=COIN_TIERS[i].minIdle) return COIN_TIERS[i];
  }
  return COIN_TIERS[0];
}

function renderCoins(){
  coinValue.textContent = game.bankCoins;
  writeSave({ coins: game.bankCoins });
}

function spark(text,x,y){
  const d=document.createElement("div");
  d.className="coinSpark";
  d.textContent=text;
  d.style.left=`${x}px`;
  d.style.top=`${y}px`;
  coinLayer.appendChild(d);
  setTimeout(()=>d.remove(),700);
}

function droppedCount(){
  return coinLayer.querySelectorAll(".coin").length;
}

// ===== うさぎ =====
const BUNNY_COUNT = 3;
const BUNNY_W = 160;
const MARGIN = 10;
const bunnies = [];

function createBunny(i){
  const el=document.createElement("div");
  el.className="bunny";

  const img=document.createElement("img");
  img.src="./assets/bunny.png";
  img.draggable=false;

  el.appendChild(img);
  bunnyLayer.appendChild(el);

  const now=Date.now();
  const b={
    el,
    x:20+i*120,
    vx:30+Math.random()*30,
    facing:Math.random()<0.5?1:-1,
    t:Math.random()*10,
    lastInteract:now,
    lastDrop:now
  };

  el.addEventListener("pointerdown",()=>{
    b.lastInteract=Date.now();
    dropCoin(b,getTier(0));
  });

  return b;
}

function initBunnies(){
  bunnyLayer.innerHTML="";
  bunnies.length=0;
  for(let i=0;i<BUNNY_COUNT;i++){
    bunnies.push(createBunny(i));
  }
}

// ===== コイン落下 =====
function dropCoin(b,tier){
  if(droppedCount()>=game.maxDropped) return;

  const frect=field.getBoundingClientRect();
  const brect=b.el.getBoundingClientRect();
  const hrect=hud.getBoundingClientRect();

  const startX=(brect.left-frect.left)+60+(Math.random()*30-15);
  const startY=(brect.top-frect.top)+40;
  const dropDist=Math.min(170,Math.max(90,frect.height-(startY+70)));

  const coin=document.createElement("div");
  coin.className=`coin ${tier.className}`;
  coin.textContent=tier.emoji;
  coin.dataset.value=tier.value;

  coin.style.left=`${startX}px`;
  coin.style.top=`${startY}px`;
  coin.style.setProperty("--drop",`${dropDist}px`);
  coin.style.setProperty("--fall",`${500+Math.random()*300}ms`);

  const collect=()=>{
    if(coin.classList.contains("collecting")) return;
    coin.classList.add("collecting");

    const cx=parseFloat(coin.style.left)+32;
    const cy=parseFloat(coin.style.top)+32+dropDist;

    const tx=hrect.left+30-frect.left;
    const ty=hrect.top+hrect.height/2-frect.top;

    coin.style.transform=`translate(${tx-cx}px,${ty-cy}px) scale(.35)`;
    coin.style.opacity="0.2";

    setTimeout(()=>{
      game.bankCoins+=Number(coin.dataset.value);
      renderCoins();
      spark(`+${coin.dataset.value}`,tx,ty);
      coin.remove();
      b.lastInteract=Date.now();
    },280);
  };

  // ★カーソルを当てるだけで回収（PC）
  coin.addEventListener("pointerenter",()=>{
    if(window.matchMedia("(hover:hover)").matches){
      collect();
    }
  });

  // ★タッチ用（iPad）
  coin.addEventListener("pointerdown",(e)=>{
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(coin);
  setTimeout(()=>coin.remove(),30000);
}

// ===== 放置処理 =====
setInterval(()=>{
  const now=Date.now();
  for(const b of bunnies){
    const idle=(now-b.lastInteract)/1000;
    const since=(now-b.lastDrop)/1000;
    if(since>=game.idleSecondsToDrop){
      dropCoin(b,getTier(idle));
      b.lastDrop=now;
    }
  }
},1000);

// ===== 歩行 =====
function tick(dt){
  const w=field.clientWidth;
  const maxX=w-BUNNY_W-MARGIN;
  for(const b of bunnies){
    b.x+=b.facing*b.vx*dt;
    if(b.x<=MARGIN){ b.x=MARGIN; b.facing=1; }
    if(b.x>=maxX){ b.x=maxX; b.facing=-1; }

    b.t+=dt*6;
    const bob=Math.abs(Math.sin(b.t))*4;
    b.el.style.transform=`translate(${b.x}px,${-bob}px) scaleX(${b.facing})`;
  }
}

let last=performance.now();
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);
  last=now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ===== ボタン =====
petBtn.onclick=()=>{
  for(const b of bunnies){
    dropCoin(b,getTier(0));
    b.lastInteract=Date.now();
  }
};

resetBtn.onclick=()=>{
  game.bankCoins=0;
  renderCoins();
};

// ===== 開始 =====
renderCoins();
initBunnies();
requestAnimationFrame(loop);
