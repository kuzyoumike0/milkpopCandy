(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  const MACHINE_SRC = "./assets/slot_machine.png";

  /* ===== SE ===== */
  const START_SE = "./assets/slotse.mp3";
  const REEL_SE  = "./assets/reelse.mp3";
  const STOP_SE  = "./assets/stop.mp3";
  const COIN_SE  = "./assets/coin.mp3";

  /* ===== 絵柄 ===== */
  const SYMBOLS = [
    { name: "coin2", src: "./assets/coin2.png", w: 30, pay: 100 },
    { name: "coin3", src: "./assets/coin3.png", w: 20, pay: 200 },
    { name: "coin4", src: "./assets/coin4.png", w: 10, pay: 500 },
    { name: "babybunny", src: "./assets/babybunny.png", w: 15 },
    { name: "reabunny",  src: "./assets/reabunny.png",  w: 5 },
    { name: "ougon", src: "./assets/ougonunchi.png", w: 1, pay: 1500 },
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
    try {
      reelLoop?.pause();
      reelLoop.currentTime = 0;
    } catch {}
    reelLoop = null;
  }

  /* ===== Coin ===== */
  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
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
  --winTop: 38%;
  --winH: 34%;
  --winX: 50%;

  --panelTop: 68%;
  --panelH: 18%;
  --resY: .35;
  --uiY: .78;

  position:fixed;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  display:none;
}

/* スマホ補正 */
@media (max-width:520px){
  #${PANEL_ID}{
    --winX: 52%;
    --winH: 33%;
  }
  #${PANEL_ID} .grid,
  #${PANEL_ID} .paylines{
    width:69%;
  }
}

#${PANEL_ID} .backdrop{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.35);
}
#${PANEL_ID} .modal{ position:relative; }
#${PANEL_ID} .closeBtn{
  position:absolute;
  right:10px;
  top:10px;
  width:42px;
  height:42px;
  border-radius:14px;
  font-weight:900;
  border:none;
  background:#fff;
  cursor:pointer;
}

#${PANEL_ID} .machine{ position:relative; }
#${PANEL_ID} .machineImg{ width:600px; max-width:92vw; display:block; }

#${PANEL_ID} .grid{
  position:absolute;
  left:var(--winX);
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
  overflow:hidden;
  border-radius:12px;
  display:flex;
  align-items:center;
  justify-content:center;
}
#${PANEL_ID} .strip{ position:absolute; inset:0; }
#${PANEL_ID} img.sym{
  width:78%;
  height:78%;
  object-fit:contain;
}

#${PANEL_ID} .controlBar{
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  width:86%;
  display:flex;
  gap:10px;
  justify-content:center;
}
#${PANEL_ID} .results{
  top:calc(var(--panelTop) + var(--panelH) * var(--resY));
}
#${PANEL_ID} .controls{
  top:calc(var(--panelTop) + var(--panelH) * var(--uiY));
}
#${PANEL_ID} .chip{
  background:#fff;
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
}
#${PANEL_ID} .btn{
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
  border:none;
  cursor:pointer;
}
#${PANEL_ID} .btn.primary{ background:#ffd6e7; }
`;
    document.head.appendChild(s);
  }

  /* ===== DOM ===== */
  function buildPanel() {
    const p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
<div class="backdrop"></div>
<div class="modal">
  <button class="closeBtn">×</button>
  <div class="machine">
    <img class="machineImg" src="${MACHINE_SRC}">
    <div class="grid">
      ${Array.from({length:9}).map(()=>`
        <div class="cell"><div class="strip"></div></div>
      `).join("")}
    </div>
    <div class="controlBar results">
      <div class="chip result">回してみよう！</div>
    </div>
    <div class="controlBar controls">
      <div class="chip">所持 <b class="have">0</b>🪙</div>
      <button class="btn primary spin">回す（-${SLOT_COST}）</button>
      <button class="btn spin10">10連</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(p);

    $(".backdrop", p).onclick = close;
    $(".closeBtn", p).onclick = close;
    $(".spin", p).onclick = () => spin(p, 1);
    $(".spin10", p).onclick = () => spin(p, 10);

    p.querySelectorAll(".cell").forEach(c => {
      setStrip(c.querySelector(".strip"), [pickSymbol()], c);
    });
    return p;
  }

  function syncHave(p){ $(".have",p).textContent = getCoin(); }

  function setStrip(strip, seq, cell){
    strip.innerHTML="";
    seq.forEach(sym=>{
      const d=document.createElement("div");
      const i=document.createElement("img");
      i.src=sym.src; i.className="sym";
      d.appendChild(i);
      strip.appendChild(d);
    });
  }

  let spinning=false;
  async function spin(panel,count){
    if(spinning) return;
    const cost=SLOT_COST*count;
    if(getCoin()<cost) return;

    setCoin(getCoin()-cost);
    syncHave(panel);
    oneShot(START_SE);
    startReelLoop();
    spinning=true;

    const cells=[...panel.querySelectorAll(".cell")];
    for(let t=0;t<count;t++){
      const finals=cells.map(()=>pickSymbol());
      await Promise.all(finals.map((s,i)=>spinCell(cells[i],s,i*SPIN.colDelay)));
    }

    stopReelLoop();
    spinning=false;
    syncHave(panel);
  }

  function spinCell(cell,finalSym,delay){
    return new Promise(r=>{
      const strip=cell.querySelector(".strip");
      setStrip(strip,[finalSym],cell);
      setTimeout(r,SPIN.baseDuration+delay);
    });
  }

  let panelRef=null;
  function open(){ panelRef.style.display="block"; syncHave(panelRef); }
  function close(){ if(!spinning) panelRef.style.display="none"; }

  window.addEventListener("load",()=>{
    injectStyles();
    panelRef=buildPanel();
    document.getElementById("slotBtn")?.addEventListener("click",open);
    window.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
  });
})();
