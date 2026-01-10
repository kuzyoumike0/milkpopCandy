// unchi.js（非module）— 個体別ゲージ / 同時排出防止 / 分散排出
// ✅ 「babybunny.png の個体」から unchi / ougonunchi を出さない（画像パス判定で確実）
(() => {
  "use strict";
  console.log("[unchi.js] LOADED v1.4.3 (skip babybunny.png)", Date.now());

  /* =========================
   * Config
   * ========================= */
  const ASSETS = {
    unchiImg:   "./assets/unchi.png",
    ougonUnchi: "./assets/ougonunchi.png",
    unchiSE:    "./assets/unchi.mp3",
  };

  // ⏱ 排出ペース
  const UNCHI_INTERVAL_SEC = 60; // 約1分
  const UNCHI_CHARGE_MAX = 100;
  const UNCHI_CHARGE_PER_SEC = UNCHI_CHARGE_MAX / UNCHI_INTERVAL_SEC;

  // 🎯 レア
  const OUGON_CHANCE = 0.03; // 3%

  // 💰 価値
  const UNCHI_VALUE = 10;
  const OUGON_VALUE = 10000;

  // 🧱 上限
  const MAX_UNCHI_ON_FIELD = 20;

  const UNCHI_SE_BASE = 1.0;

  const Z = {
    UNCHI_LAYER: 120,
    UNCHI_DROP:  121,
    OUGON_DROP:  122,
  };

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rand  = (a,b)=>a+Math.random()*(b-a);

  /* =========================
   * Wait WB
   * ========================= */
  function waitForWB(){
    return new Promise(res=>{
      const t=setInterval(()=>{
        if(window.WB){ clearInterval(t); res(window.WB); }
      },50);
    });
  }

  /* =========================
   * Audio
   * ========================= */
  const seUnchi = new Audio(encodeURI(ASSETS.unchiSE));
  seUnchi.preload="auto";

  function playSE(){
    try{
      const v = window.WB?.getSEVolume?.() ?? 0.85;
      seUnchi.volume = clamp(v*UNCHI_SE_BASE,0,1);
      seUnchi.currentTime = 0;
      seUnchi.play().catch(()=>{});
    }catch{}
  }

  /* =========================
   * DOM
   * ========================= */
  function injectCssOnce(){
    if(document.getElementById("unchiCssV4"))return;
    const s=document.createElement("style");
    s.id="unchiCssV4";
    s.textContent=`
      .unchiDrop,.ougonunchiDrop{
        width:24px;height:24px;
        position:absolute;
        cursor:pointer;
        user-select:none;
        pointer-events:auto;
      }
      .ougonunchiDrop{width:26px;height:26px;}
    `;
    document.head.appendChild(s);
  }

  function ensureLayer(field){
    let l=document.getElementById("unchiLayer");
    if(l)return l;
    l=document.createElement("div");
    l.id="unchiLayer";
    l.style.position="absolute";
    l.style.inset="0";
    l.style.pointerEvents="none";
    l.style.zIndex=Z.UNCHI_LAYER;
    field.appendChild(l);
    return l;
  }

  /* =========================
   * Drop管理
   * ========================= */
  const drops=[];

  function enforceCap(){
    while(drops.length>MAX_UNCHI_ON_FIELD){
      const d=drops.shift();
      d?.destroy(false);
    }
  }

  class BaseDrop{
    constructor({field,layer,cls,src,x,y}){
      this.field=field;
      this.layer=layer;
      this.x=x; this.y=y;
      this.vx=(Math.random()*2-1)*120;
      this.vy=-(420+Math.random()*200);
      this.gravity=2200;
      this.bounce=0.2;
      this.floor=(field.clientHeight||600)-60;

      const el=document.createElement("img");
      el.src=src;
      el.className=cls;
      el.draggable=false;
      this.el=el;

      el.addEventListener("pointerdown",e=>{
        e.preventDefault();
        this.collect();
      });

      layer.appendChild(el);
      this.render();

      drops.push(this);
      enforceCap();
    }

    render(){
      this.el.style.left=`${this.x}px`;
      this.el.style.top =`${this.y}px`;
    }

    update(dt){
      this.floor=(this.field.clientHeight||600)-60;
      this.vy+=this.gravity*dt;
      this.x+=this.vx*dt;
      this.y+=this.vy*dt;

      if(this.y>=this.floor){
        this.y=this.floor;
        if(Math.abs(this.vy)>260){
          this.vy=-this.vy*this.bounce;
          this.vx*=0.7;
        }else{
          this.vy=0; this.vx=0;
        }
      }
      this.render();
    }

    destroy(){
      try{this.el.remove();}catch{}
      const i=drops.indexOf(this);
      if(i>=0)drops.splice(i,1);
    }
  }

  class UnchiDrop extends BaseDrop{
    constructor(o){ super({...o,cls:"unchiDrop",src:ASSETS.unchiImg}); }
    collect(){
      window.WB.coins+=UNCHI_VALUE;
      window.WB.updateHud?.();
      playSE();
      this.destroy();
      window.WB.emit?.("sy:add",{key:"unchi",n:1});
    }
  }

  class OugonUnchiDrop extends BaseDrop{
    constructor(o){ super({...o,cls:"ougonunchiDrop",src:ASSETS.ougonUnchi}); }
    collect(){
      window.WB.coins+=OUGON_VALUE;
      window.WB.updateHud?.();
      playSE();
      this.destroy();
      window.WB.emit?.("sy:add",{key:"ougon_unchi",n:1});
    }
  }

  function spawnNearBunny(field,layer,b,type){
    const r=b.wrap.getBoundingClientRect();
    const fr=field.getBoundingClientRect();
    const x=(r.left-fr.left)+r.width*0.4+rand(-10,10);
    const y=(r.top-fr.top)+r.height*0.9;
    return type==="ougon"
      ? new OugonUnchiDrop({field,layer,x,y})
      : new UnchiDrop({field,layer,x,y});
  }

  /* =========================
   * ✅ babybunny.png 判定（ここが要件）
   * ========================= */
  function isBabyBunnyByPng(b){
    // うさぎの画像がどこに入ってても拾えるように多方面チェック
    const candidates = [
      b?.img?.src,
      b?.imgSrc,
      b?.src,
      b?.asset,
      b?.image,
      b?.texture,
      b?.wrap?.querySelector?.("img")?.src,
      b?.wrap?.style?.backgroundImage,
    ];

    for(const v of candidates){
      const s = String(v ?? "").toLowerCase();
      if(!s) continue;

      // background-image: url("...babybunny.png") 対策
      if (s.includes("babybunny.png")) return true;
      if (s.includes("/babybunny.png")) return true;
      if (s.includes("assets/babybunny.png")) return true;
    }
    return false;
  }

  /* =========================
   * 個体別ゲージ（分散の核心）
   * ========================= */
  const gauge=new Map(); // bornAt -> 0..100

  function tick(WB,field,layer,dt){
    const list=WB.getBunnies?.();
    if(!Array.isArray(list))return;

    let spawnedThisFrame=false;

    for(const b of list){
      if(spawnedThisFrame)break;

      // ✅ babybunny.png の個体は排出しない（ゲージも進めない）
      if(isBabyBunnyByPng(b)) continue;

      const id=b?.bornAt;
      if(!id)continue;

      if(!gauge.has(id)){
        // ⭐ 初期値ランダム → 完全に時間がズレる
        gauge.set(id,Math.random()*UNCHI_CHARGE_MAX);
      }

      let v=gauge.get(id)+UNCHI_CHARGE_PER_SEC*dt;

      if(v>=UNCHI_CHARGE_MAX){
        v-=UNCHI_CHARGE_MAX;
        const type=Math.random()<OUGON_CHANCE?"ougon":"normal";
        spawnNearBunny(field,layer,b,type);
        spawnedThisFrame=true; // ✅ 同時排出防止
      }

      gauge.set(id,v);
    }
  }

  /* =========================
   * Boot
   * ========================= */
  waitForWB().then(WB=>{
    injectCssOnce();
    const field=WB.field||document.getElementById("field");
    if(!field)return;
    const layer=ensureLayer(field);

    let last=performance.now();
    function loop(t){
      const dt=Math.min(0.033,(t-last)/1000);
      last=t;

      drops.forEach(d=>d.update(dt));
      tick(WB,field,layer,dt);

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    console.log("[unchi.js] ready (babybunny.png excluded)");
  });
})();
