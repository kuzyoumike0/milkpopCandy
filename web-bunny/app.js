// ===== セーブ =====
const KEY = "bunny_farm_save_v1";

function loadSave(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return { coins:0, bunnyCount:3 };
    const p = JSON.parse(raw);
    return {
      coins: Number(p.coins)||0,
      bunnyCount: Math.max(1, Number(p.bunnyCount)||3)
    };
  }catch{
    return { coins:0, bunnyCount:3 };
  }
}

function saveData(){
  localStorage.setItem(KEY, JSON.stringify({
    coins: game.coins,
    bunnyCount
  }));
}

// ===== UI =====
const coinValue=document.getElementById("coinValue");
const petBtn=document.getElementById("petBtn");
const resetBtn=document.getElementById("resetBtn");
const shopBtn=document.getElementById("shopBtn");
const shopModal=document.getElementById("shopModal");
const shopCloseBtn=document.getElementById("shopCloseBtn");
const buyBunnyBtn=document.getElementById("buyBunnyBtn");
const shopCoins=document.getElementById("shopCoins");
const shopCount=document.getElementById("shopCount");
const shopPrice=document.getElementById("shopPrice");

const field=document.getElementById("field");
const bunnyLayer=document.getElementById("bunnyLayer");
const coinLayer=document.getElementById("coinLayer");
const hud=document.getElementById("hud");

// ===== ゲーム状態 =====
const save=loadSave();
const game={ coins:save.coins };
let bunnyCount=save.bunnyCount;

// ===== レア定義 =====
const TIERS=[
  {emoji:"🪙",value:1,min:0,className:""},
  {emoji:"🥈",value:3,min:60,className:"silver"},
  {emoji:"🥇",value:8,min:180,className:"gold"},
  {emoji:"🌈",value:20,min:420,className:"rainbow"}
];

function getTier(idle){
  for(let i=TIERS.length-1;i>=0;i--){
    if(idle>=TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

// ===== うさぎ =====
const bunnies=[];
const BUNNY_W=160;

function createBunny(i){
  const el=document.createElement("div");
  el.className="bunny";
  const img=document.createElement("img");
  img.src="./assets/bunny.png";
  el.appendChild(img);
  bunnyLayer.appendChild(el);

  const now=Date.now();
  return {
    el,
    x:20+i*120,
    vx:30+Math.random()*30,
    dir:Math.random()<0.5?1:-1,
    t:Math.random()*10,
    lastInteract:now,
    lastDrop:now
  };
}

function initBunnies(){
  bunnyLayer.innerHTML="";
  bunnies.length=0;
  for(let i=0;i<bunnyCount;i++){
    bunnies.push(createBunny(i));
  }
}

// ===== コイン =====
function dropCoin(b,tier){
  const frect=field.getBoundingClientRect();
  const hrect=hud.getBoundingClientRect();
  const brect=b.el.getBoundingClientRect();

  const x=(brect.left-frect.left)+60;
  const y=(brect.top-frect.top)+40;
  const drop=140;

  const c=document.createElement("div");
  c.className=`coin ${tier.className}`;
  c.textContent=tier.emoji;
  c.dataset.value=tier.value;
  c.style.left=`${x}px`;
  c.style.top=`${y}px`;
  c.style.setProperty("--drop",`${drop}px`);

  const collect=()=>{
    if(c.classList.contains("collecting")) return;
    c.classList.add("collecting");
    const cx=x+32, cy=y+32+drop;
    const tx=hrect.left+30-frect.left;
    const ty=hrect.top+hrect.height/2-frect.top;
    c.style.transform=`translate(${tx-cx}px,${ty-cy}px) scale(.35)`;
    c.style.opacity="0.2";
    setTimeout(()=>{
      game.coins+=Number(c.dataset.value);
      updateHUD();
      c.remove();
      b.lastInteract=Date.now();
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

// ===== 更新 =====
function updateHUD(){
  coinValue.textContent=game.coins;
  saveData();
}

function bunnyPrice(){
  return 100 + Math.max(0,bunnyCount-3)*80;
}

function updateShop(){
  shopCoins.textContent=game.coins;
  shopCount.textContent=bunnyCount;
  shopPrice.textContent=bunnyPrice();
  buyBunnyBtn.disabled=game.coins<bunnyPrice();
}

// ===== イベント =====
petBtn.onclick=()=>{
  bunnies.forEach(b=>{
    dropCoin(b,getTier(0));
    b.lastInteract=Date.now();
  });
};

resetBtn.onclick=()=>{
  game.coins=0;
  updateHUD();
};

shopBtn.onclick=()=>{
  updateShop();
  shopModal.classList.remove("hidden");
};

shopCloseBtn.onclick=()=>{
  shopModal.classList.add("hidden");
};

buyBunnyBtn.onclick=()=>{
  const price=bunnyPrice();
  if(game.coins<price) return;
  game.coins-=price;
  bunnyCount++;
  initBunnies();
  updateHUD();
  updateShop();
};

// ===== 放置 =====
setInterval(()=>{
  const now=Date.now();
  bunnies.forEach(b=>{
    if((now-b.lastDrop)/1000>=20){
      const idle=(now-b.lastInteract)/1000;
      dropCoin(b,getTier(idle));
      b.lastDrop=now;
    }
  });
},1000);

// ===== 歩行 =====
function tick(dt){
  const w=field.clientWidth;
  bunnies.forEach(b=>{
    b.x+=b.dir*b.vx*dt;
    if(b.x<0||b.x>w-BUNNY_W) b.dir*=-1;
    b.t+=dt*6;
    const bob=Math.abs(Math.sin(b.t))*4;
    b.el.style.transform=`translate(${b.x}px,${-bob}px) scaleX(${b.dir})`;
  });
}

let last=performance.now();
function loop(now){
  const dt=(now-last)/1000;
  last=now;
  tick(dt);
  requestAnimationFrame(loop);
}

// ===== 開始 =====
updateHUD();
initBunnies();
requestAnimationFrame(loop);
