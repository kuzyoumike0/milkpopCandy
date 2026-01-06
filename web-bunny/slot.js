(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  /* =========================
   * Assets
   * ========================= */
  const MACHINE_SRC = "./assets/slot_machine.png";

  const START_SE = "./assets/slotse.mp3";
  const REEL_SE  = "./assets/reelse.mp3";
  const STOP_SE  = "./assets/stop.mp3";
  const COIN_SE  = "./assets/coin.mp3";

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

  /* =========================
   * Audio
   * ========================= */
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
      if (!reelLoop) return;
      reelLoop.pause();
      reelLoop.currentTime = 0;
    } catch {}
    reelLoop = null;
  }

  /* =========================
   * Coin HUD
   * ========================= */
  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
  }

  /* =========================
   * Random
   * ========================= */
  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      if ((r -= s.w) <= 0) return s;
    }
    return SYMBOLS[0];
  }

  /* =========================
   * CSS
   * ========================= */
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
#${PANEL_ID}{
  --winTop: 38%;
  --winH: 34%;
  --winX: 52%;

  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483647;
  display: none;
  overflow: hidden;
  user-select: none;
}

#${PANEL_ID} .backdrop{
  position:absolute;
  inset:0;
  background:rgba(0,0,0,.35);
}

#${PANEL_ID} .machine{
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
}

#${PANEL_ID} .machineImg{
  display:block;
  max-width:92vw;
  max-height:92vh;
}

#${PANEL_ID} .grid{
  position:absolute;
  left:var(--winX);
  top:var(--winTop);
  transform:translate(-50%,-50%);
  width:67%;
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

#${PANEL_ID} .strip{
  position:absolute;
  inset:0;
}

#${PANEL_ID} img.sym{
  width:78%;
  height:78%;
  object-fit:contain;
}

#${PANEL_ID} .controls{
  position:absolute;
  left:50%;
  bottom:6%;
  transform:translateX(-50%);
  display:flex;
  gap:10px;
}

#${PANEL_ID} button{
  padding:10px 14px;
  border-radius:14px;
  border:none;
  font-weight:900;
}

#${PANEL_ID} .closeBtn{
  position:absolute;
  top:10px;
  right:10px;
  border-radius:50%;
  width:36px;
  height:36px;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * DOM build
   * ========================= */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const p = document.createElement("div");
    p.id = PANEL_ID;
    p.innerHTML = `
<div class="backdrop"></div>
<div class="machine">
  <img class="machineImg" src="${MACHINE_SRC}">
  <div class="grid">
    ${Array.from({ length: 9 }).map(() =>
      `<div class="cell"><div class="strip"></div></div>`
    ).join("")}
  </div>
  <div class="controls">
    <button class="spin">回す (-50)</button>
    <button class="spin10">10連</button>
  </div>
</div>
<button class="closeBtn">×</button>
`;
    document.body.appendChild(p);

    p.querySelector(".closeBtn").onclick = closePanel;
    p.querySelector(".spin").onclick = () => spin(p, 1);
    p.querySelector(".spin10").onclick = () => spin(p, 10);

    p.querySelectorAll(".cell").forEach(c => {
      setStrip(c.querySelector(".strip"), [pickSymbol()], c);
    });
  }

  /* =========================
   * Strip helpers
   * ========================= */
  function cellH(c) {
    return Math.max(40, c.getBoundingClientRect().height | 0);
  }

  function setStrip(strip, seq, cell) {
    const h = cellH(cell);
    strip.innerHTML = "";
    for (const sym of seq) {
      const d = document.createElement("div");
      d.style.height = h + "px";
      d.style.display = "flex";
      d.style.alignItems = "center";
      d.style.justifyContent = "center";
      const i = document.createElement("img");
      i.src = sym.src;
      i.className = "sym";
      i.alt = sym.name;
      d.appendChild(i);
      strip.appendChild(d);
    }
  }

  function spinCell(cell, finalSym, delay) {
    const strip = cell.querySelector(".strip");
    const h = cellH(cell);
    const seq = Array.from({ length: SPIN.loops }, () => pickSymbol());
    seq.push(finalSym);

    setStrip(strip, seq, cell);
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    void strip.offsetHeight;

    strip.style.transition =
      `transform ${SPIN.baseDuration + delay}ms cubic-bezier(.12,.86,.12,1)`;
    strip.style.transform = `translateY(${-h * (seq.length - 1)}px)`;

    return new Promise(r => {
      strip.addEventListener("transitionend", () => {
        strip.style.transition = "none";
        setStrip(strip, [finalSym], cell);
        strip.style.transform = "translateY(0)";
        r(finalSym);
      }, { once:true });
    });
  }

  /* =========================
   * Spin
   * ========================= */
  let spinning = false;

  async function spin(panel, count) {
    if (spinning) return;
    const cost = SLOT_COST * count;
    if (getCoin() < cost) return;

    setCoin(getCoin() - cost);
    oneShot(START_SE);
    startReelLoop();

    spinning = true;

    for (let t = 0; t < count; t++) {
      const finals = Array.from({ length: 9 }, () => pickSymbol());
      const cells = Array.from(panel.querySelectorAll(".cell"));
      await Promise.all(
        finals.map((s, i) => spinCell(cells[i], s, (i % 3) * SPIN.colDelay))
      );
    }

    stopReelLoop();
    spinning = false;
  }

  /* =========================
   * Open / Close + scroll lock
   * ========================= */
  let prevOverflow = "";

  function openPanel() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    p.style.display = "block";
  }

  function closePanel() {
    const p = document.getElementById(PANEL_ID);
    if (!p || spinning) return;
    p.style.display = "none";
    document.body.style.overflow = prevOverflow || "";
  }

  /* =========================
   * Init
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();

    const slotBtn =
      document.getElementById("slotBtn") ||
      [...document.querySelectorAll("button")].find(b => b.textContent === "スロット");

    slotBtn?.addEventListener("click", openPanel);
  });

})();
