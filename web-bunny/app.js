(() => {
  /* =========================
   * Bunny牧場 app.js（本体）
   * ========================= */

  /* ===== Assets ===== */
  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",

    ougonUnchi: "./assets/ougonunchi.png",

    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  /* ===== Bunny defs ===== */
  const BUNNY_DEFS = {
    bunny1: { img: "./assets/bunny1.png", coinMul: 0.55 },
    bunny3: { img: "./assets/bunny3.png", coinMul: 1.0 },
    bunny4: { img: "./assets/bunny4.png", coinMul: 1.8 },
    bunny5: { img: "./assets/bunny5.png", coinMul: 2.8 },
    reabunny:{ img: "./assets/reabunny.png", coinMul: 4.0 },
  };

  /* ===== Balance ===== */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;

  const REA_EVOLVE_RATE = 0.01;

  const BABY_WIDTH = 86;   // ★ babyサイズ
  const ADULT_WIDTH = 120; // ★ 通常サイズ

  /* ===== DOM ===== */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer  = document.getElementById("coinLayer");
  const coinValueEl= document.getElementById("coinValue");

  const shopBtn  = document.getElementById("shopBtn");
  const departBtn= document.getElementById("departBtn");
  const rankBtn  = document.getElementById("rankBtn");

  /* ===== Audio ===== */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  let audioUnlocked = false;
  function unlockAudioOnce(){
    if(audioUnlocked) return;
    audioUnlocked = true;
    try{
      sePoyo.muted = true;
      sePoyo.play().then(()=>{
        sePoyo.pause();
        sePoyo.muted = false;
      });
    }catch{}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once:true });

  function playSE(a){
    try{
      a.currentTime = 0;
      a.play().catch(()=>{});
    }catch{}
  }

  /* ===== Utils ===== */
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rand  = (a,b)=>a+Math.random()*(b-a);

  function fieldRect(){ return field.getBoundingClientRect(); }
  function groundY(){ return fieldRect().height - 60; }

  /* ===== State ===== */
  let coins = 0;
  const bunnies = [];
  let lastFrame = performance.now();

  /* =========================
   * Bunny class
   * ========================= */
  class Bunny{
    constructor(kind="bunny1", bornAt=Date.now()){
      this.kind = kind;
      this.bornAt = bornAt;
      this.isBaby = (Date.now() - bornAt) < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      const fr = fieldRect();
      this.x = rand(30, fr.width - ADULT_WIDTH - 30);
      this.y = groundY() - 120;

      this.dir = Math.random()<0.5 ? -1 : 1;
      this.speed = 40 + Math.random()*40;

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", e=>{
        e.preventDefault();
        unlockAudioOnce();
        this.onClick();
      });
    }

    syncSprite(){
      this.wrap.classList.toggle("baby", this.isBaby);
      this.el.src = this.isBaby
        ? ASSETS.babyBunny
        : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
    }

    evolveIfNeeded(){
      if(!this.isBaby) return;
      if(Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if(Math.random() < REA_EVOLVE_RATE){
        this.kind = "reabunny";
      }
      this.syncSprite();
    }

    onClick(){
      playSE(this.isBaby ? seBaby : sePoyo);
      coins += this.isBaby ? 1 : 3;
      coinValueEl.textContent = coins;
    }

    update(dt){
      this.evolveIfNeeded();

      const width = this.isBaby ? BABY_WIDTH : ADULT_WIDTH;
      const fr = fieldRect();
      const minX = 0;
      const maxX = Math.max(0, fr.width - width);

      this.x += this.dir * this.speed * dt * (this.isBaby ? BABY_SPEED_MUL : 1);

      if(this.x <= minX){
        this.x = minX;
        this.dir = 1;
      }
      if(this.x >= maxX){
        this.x = maxX;
        this.dir = -1;
      }

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top  = `${this.y}px`;
    }
  }

  /* =========================
   * Init
   * ========================= */
  function spawnInitial(){
    const now = Date.now();
    bunnies.push(new Bunny("bunny1", now- BABY_DURATION_MS - 1000));
    bunnies.push(new Bunny("bunny1", now- BABY_DURATION_MS - 2000));
  }

  function tick(ts){
    const dt = Math.min(0.033, (ts-lastFrame)/1000);
    lastFrame = ts;

    for(const b of bunnies) b.update(dt);
    requestAnimationFrame(tick);
  }

  function init(){
    spawnInitial();
    coinValueEl.textContent = coins;
    requestAnimationFrame(tick);
  }

  /* =========================
   * External API (WB)
   * ========================= */
  window.WB = {
    bunnies,
    field,
    shopBtn,
    departBtn,
    rankBtn,
    playSE,
    unlockAudioOnce,
    seTabidati,
    get coins(){ return coins; },
    set coins(v){ coins = v; },
    updateHud(){
      coinValueEl.textContent = coins;
    }
  };

  init();
})();
