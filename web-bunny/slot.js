(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  const MACHINE_SRC = "/web-bunny/assets/slot_machine.png";

  /* ===== SE ===== */
  const START_SE = "/web-bunny/assets/slotse.mp3";
  const REEL_SE  = "/web-bunny/assets/reelse.mp3";
  const STOP_SE  = "/web-bunny/assets/stop.mp3";
  const COIN_SE  = "/web-bunny/assets/coin.mp3";

  /* ===== 絵柄 ===== */
  const SYMBOLS = [
    { name: "coin2", src: "/web-bunny/assets/coin2.png", w: 30, pay: 100 },
    { name: "coin3", src: "/web-bunny/assets/coin3.png", w: 20, pay: 200 },
    { name: "coin4", src: "/web-bunny/assets/coin4.png", w: 10, pay: 500 },
    { name: "babybunny", src: "/web-bunny/assets/babybunny.png", w: 15 },
    { name: "reabunny", src: "/web-bunny/assets/reabunny.png", w: 5 },
    { name: "ougon", src: "/web-bunny/assets/ougonunchi.png", w: 1, pay: 1500 },
  ];

  const SPIN = { loops: 22, colDelay: 220, baseDuration: 980 };
  const $ = (q, p = document) => p.querySelector(q);

  /* ===== Audio ===== */
  function oneShot(src, vol = 0.9) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  let reelLoop = null;
  function startReelLoop() {
    try {
      reelLoop = new Audio(REEL_SE);
      reelLoop.loop = true;
      reelLoop.volume = 0.55;
      reelLoop.play().catch(() => {});
    } catch {}
  }
  function stopReelLoop() {
    try { reelLoop?.pause(); } catch {}
    reelLoop = null;
  }

  function coinBurst(n = 12, i = 70) {
    let c = 0;
    const id = setInterval(() => {
      oneShot(COIN_SE, 0.8);
      if (++c >= n) clearInterval(id);
    }, i);
  }

  /* ===== Coin ===== */
  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = Math.max(0, Math.floor(v));
  }

  /* ===== Random ===== */
  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      if ((r -= s.w) <= 0) return s;
    }
    return SYMBOLS[0];
  }

  /* ===== CSS ===== */
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
#${PANEL_ID}{
  --winTop: 44%;
  --winH: 34%;
  --uiBottom: 8.5%;
  --resBottom: 18.5%;

  position:fixed;
  inset:50% auto auto 50%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  user-select:none;
}

#${PANEL_ID} .machine{ position:relative; }
#${PANEL_ID} .machineImg{ width:600px; max-width:92vw; display:block; }

/* ===== UI（下パネル中央固定） ===== */
#${PANEL_ID} .controlBar{
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  width:86%;
  max-width:560px;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  z-index:2147483647;
}

#${PANEL_ID} .controls{
  top:auto;
  bottom:var(--uiBottom);
}

#${PANEL_ID} .results{
  top:auto;
  bottom:var(--resBottom);
}

#${PANEL_ID} .chip{
  background:rgba(255,255,255,.96);
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
  box-shadow:0 12px 32px rgba(0,0,0,.18);
}

#${PANEL_ID} .btn{
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
  border:none;
  background:#fff;
  cursor:pointer;
}
#${PANEL_ID} .btn.primary{ background:#ffd6e7; }

/* ===== スロット窓 ===== */
#${PANEL_ID} .grid{
  position:absolute;
  left:50%;
  top:var(--winTop);
  transform:translate(-50%,-50%);
  width:72%;
  height:var(--winH);
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-template-rows:repeat(3,1fr);
  gap:4%;
}

#${PANEL_ID} .cell{
  position:relative;
  overflow:hidden;
  border-radius:12px;
  display:flex;
  align-items:center;
  justify-content:center;
}

#${PANEL_ID} .strip{
  position:absolute;
  inset:0;
  transform:translateY(0);
  will-change:transform,filter,opacity;
}

#${PANEL_ID}.spinning .strip{
  filter:blur(2px);
  opacity:.65;
}

#${PANEL_ID}.spinning img.sym{
  animation:jitter .12s infinite;
}

@keyframes jitter{
  0%{transform:translateY(0)}
  50%{transform:translateY(1px)}
  100%{transform:translateY(0)}
}

#${PANEL_ID} img.sym{
  width:78%;
  height:78%;
  object-fit:contain;
}

#${PANEL_ID} .win{
  box-shadow:0 0 18px rgba(255,200,0,.75);
}

/* フラッシュ */
#${PANEL_ID} .flash{
  position:absolute;
  inset:0;
  background:rgba(255,255,255,.65);
  opacity:0;
  pointer-events:none;
}
#${PANEL_ID}.flashOn .flash{
  animation:flash .35s ease-out;
}
@keyframes flash{
  0%{opacity:0}
  25%{opacity:1}
  100%{opacity:0}
}
`;
    document.head.appendChild(s);
  }

  /* ===== DOM ===== */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
<div class="machine">
  <img class="machineImg" src="${MACHINE_SRC}">
  <div class="flash"></div>

  <div class="grid">
    ${Array.from({length:9}).map((_,i)=>`
      <div class="cell" data-i="${i}"><div class="strip"></div></div>
    `).join("")}
  </div>

  <div class="controlBar results">
    <div class="chip result">回してみよう！</div>
  </div>

  <div class="controlBar controls">
    <div class="chip">所持：<b class="have">0</b> 🪙</div>
    <button class="btn primary spin">回す（-${SLOT_COST}）</button>
    <button class="btn spin10">10連</button>
  </div>
</div>`;
    document.body.appendChild(p);

    $(".spin", p).onclick = () => spin(p, 1);
    $(".spin10", p).onclick = () => spin(p, 10);

    p.querySelectorAll(".cell").forEach(c=>{
      setStrip(c.querySelector(".strip"), [pickSymbol()], c);
    });
  }

  function syncHave(p){ $(".have",p).textContent = getCoin(); }

  /* ===== Strip ===== */
  function cellH(c){ return Math.max(40, c.getBoundingClientRect().height|0); }
  function setStrip(strip, seq, cell){
    const h = cellH(cell);
    strip.innerHTML="";
    seq.forEach(s=>{
      const d=document.createElement("div");
      d.style.height=h+"px";
      const i=document.createElement("img");
      i.src=s.src; i.className="sym";
      d.appendChild(i); strip.appendChild(d);
    });
  }
  function force(el){ void el.offsetHeight; }

  function spinCell(cell, finalSym, delay){
    const strip = cell.querySelector(".strip");
    const h = cellH(cell);
    const seq=[...Array(SPIN.loops)].map(pickSymbol);
    seq.push(finalSym);
    setStrip(strip, seq, cell);
    strip.style.transition="none";
    strip.style.transform="translateY(0)";
    force(strip);
    strip.style.transition=`transform ${SPIN.baseDuration+delay}ms cubic-bezier(.12,.86,.12,1)`;
    strip.style.transform=`translateY(${-h*(seq.length-1)}px)`;
    return new Promise(r=>{
      strip.addEventListener("transitionend",()=>{
        setStrip(strip,[finalSym],cell);
        r(finalSym);
      },{once:true});
    });
  }

  /* ===== 判定 ===== */
  const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function wins(names){
    return LINES.filter(l=>l.every(i=>names[i]===names[l[0]]));
  }

  let spinning=false;

  async function spin(panel,count){
    if(spinning) return;
    const have=getCoin();
    const cost=SLOT_COST*count;
    if(have<cost) return;

    setCoin(have-cost);
    syncHave(panel);

    oneShot(START_SE);
    startReelLoop();

    spinning=true;
    panel.classList.add("spinning");

    let totalLines=0,totalPay=0;

    for(let t=0;t<count;t++){
      const finals=[...Array(9)].map(pickSymbol);
      const cells=[...panel.querySelectorAll(".cell")];
      const res=await Promise.all(
        finals.map((s,i)=>spinCell(cells[i],s,(i%3)*SPIN.colDelay))
      );
      const names=res.map(r=>r.name);
      const w=wins(names);
      totalLines+=w.length;
      w.forEach(l=>{
        const p=res[l[0]].pay;
        if(p) totalPay+=p;
      });
    }

    panel.classList.remove("spinning");
    stopReelLoop();

    if(totalPay){
      setCoin(getCoin()+totalPay);
      panel.classList.add("flashOn");
      coinBurst();
      setTimeout(()=>panel.classList.remove("flashOn"),400);
    }

    $(".result",panel).textContent =
      totalLines ? `🎉 当たり ${totalLines}ライン / +${totalPay}🪙` : "はずれ！";

    syncHave(panel);
    spinning=false;
  }

  /* ===== 起動 ===== */
  window.addEventListener("load",()=>{
    injectStyles();
    buildPanel();
    syncHave(document.getElementById(PANEL_ID));
  });
})();
