(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

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
    if (!src) return;
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  let reelLoop = null;
  function startReelLoop() {
    if (!REEL_SE) return;
    try {
      reelLoop = new Audio(REEL_SE);
      reelLoop.loop = true;
      reelLoop.volume = 0.55;
      reelLoop.currentTime = 0;
      reelLoop.play().catch(() => {});
    } catch {
      reelLoop = null;
    }
  }
  function stopReelLoop() {
    try {
      if (!reelLoop) return;
      reelLoop.pause();
      reelLoop.currentTime = 0;
    } catch {}
    reelLoop = null;
  }

  function coinBurst(n = 14, i = 65, vol = 0.85) {
    let c = 0;
    const id = setInterval(() => {
      oneShot(COIN_SE, vol);
      if (++c >= n) clearInterval(id);
    }, i);
  }

  /* =========================
   * Coin HUD
   * ========================= */
  function getCoin() {
    try {
      if (window.WB && typeof window.WB.coins === "number") return window.WB.coins;
    } catch {}
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const nv = Math.max(0, Math.floor(v));
    try {
      if (window.WB) {
        window.WB.coins = nv;
        window.WB.saveCoins?.();
        window.WB.updateHud?.();
      }
    } catch {}
    const el = $("#coinValue");
    if (el) el.textContent = String(nv);
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
   * Result
   * ========================= */
  let resultLock = false;
  let resultTimer = null;

  function parseCoins(text) {
    const m = text.match(/\+(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function showResult(panel, text, holdMs = 2600) {
    const el = $(".result", panel);
    if (!el) return;

    if (resultTimer) {
      clearTimeout(resultTimer);
      resultTimer = null;
    }

    resultLock = true;
    el.classList.remove("fadeOut", "popNum", "popBig", "popMega");
    el.textContent = text;

    const coins = parseCoins(text);
    if (coins !== null && coins > 0) {
      requestAnimationFrame(() => {
        if (coins >= 1500) el.classList.add("popMega");
        else el.classList.add(coins >= 500 ? "popBig" : "popNum");
      });
    }

    const fadeMs = 650;
    const fadeStart = Math.max(0, holdMs - fadeMs);
    resultTimer = setTimeout(() => {
      el.classList.add("fadeOut");
      setTimeout(() => (resultLock = false), fadeMs + 50);
    }, fadeStart);
  }

  /* =========================
   * 判定
   * ========================= */
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  function wins(names) {
    const out = [];
    for (const line of LINES) {
      const a = names[line[0]];
      if (a && line.every((i) => names[i] === a)) out.push(line);
    }
    return out;
  }

  /* =========================
   * CSS（最低限：中央固定＆サイズ調整）
   * ========================= */
  function injectStyles() {
    if (document.getElementById("slotStyleFixMin")) return;
    const s = document.createElement("style");
    s.id = "slotStyleFixMin";
    s.textContent = `
#${PANEL_ID}{
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483647;
  display:none;
  overflow:hidden;
  user-select:none;
  isolation:isolate;
}
#${PANEL_ID} .backdrop{
  position:absolute; inset:0; background:rgba(0,0,0,.35);
}
#${PANEL_ID} .machine{
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
}
#${PANEL_ID} .machineImg{
  display:block;
  width:min(520px, 92vw);
  height:auto;
  max-height:92vh;
}
#${PANEL_ID} .closeBtn{
  position:absolute;
  top:10px; right:10px;
  width:44px; height:44px;
  border:none; border-radius:14px;
  background:rgba(255,255,255,.95);
  cursor:pointer;
  z-index:2147483647;
}
#${PANEL_ID} .grid{
  position:absolute;
  left:52%;
  top:38%;
  transform:translate(-50%,-50%);
  width:72%;
  height:34%;
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-template-rows:repeat(3,1fr);
  gap:4%;
}
#${PANEL_ID} .cell{ position:relative; overflow:hidden; border-radius:12px; display:flex; align-items:center; justify-content:center; }
#${PANEL_ID} .strip{ position:absolute; inset:0; transform:translateY(0); will-change:transform; }
#${PANEL_ID} img.sym{ width:78%; height:78%; object-fit:contain; display:block; }
#${PANEL_ID} .controlBar{
  position:absolute;
  left:50%;
  transform:translate(-50%,-50%);
  width:86%;
  max-width:560px;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  z-index:2147483647;
}
#${PANEL_ID} .controlBar.results{ top: calc(68% + 18% * 0.35); }
#${PANEL_ID} .controlBar.controls{ top: calc(68% + 18% * 0.78); }
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
  box-shadow:0 12px 32px rgba(0,0,0,.14);
}
#${PANEL_ID} .btn.primary{ background:#ffd6e7; }
`;
    document.head.appendChild(s);
  }

  /* =========================
   * DOM
   * ========================= */
  let panelRef = null;
  let prevOverflowHtml = "";
  let prevOverflowBody = "";

  function lockScroll() {
    const html = document.documentElement;
    const body = document.body;
    prevOverflowHtml = html.style.overflow;
    prevOverflowBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }
  function unlockScroll() {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = prevOverflowHtml || "";
    body.style.overflow = prevOverflowBody || "";
  }

  function buildPanel() {
    let p = document.getElementById(PANEL_ID);

    if (!p) {
      p = document.createElement("div");
      p.id = PANEL_ID;
      document.body.appendChild(p);
    } else {
      // index.html内に置かれてても確実にbody直下へ
      if (p.parentElement !== document.body) document.body.appendChild(p);
    }
    panelRef = p;

    // 既に構築済みならOK
    if (p.querySelector(".machine")) return p;

    p.innerHTML = `
<div class="backdrop"></div>
<div class="machine">
  <img class="machineImg" src="${MACHINE_SRC}" alt="slot">
  <div class="grid">
    ${Array.from({ length: 9 }).map((_, i) => `
      <div class="cell" data-i="${i}" data-sym=""><div class="strip"></div></div>
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
</div>
<button class="closeBtn" aria-label="close">×</button>
`;

    // 初期絵柄
    p.querySelectorAll(".cell").forEach((c) => {
      const s = pickSymbol();
      c.dataset.sym = s.name;
      setStrip(c.querySelector(".strip"), [s], c);
    });

    $(".spin", p).onclick = () => spin(p, 1);
    $(".spin10", p).onclick = () => spin(p, 10);
    $(".closeBtn", p).onclick = closePanel;
    $(".backdrop", p).onclick = closePanel;

    const img = $(".machineImg", p);
    if (img) {
      const onReady = () => requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(p)));
      img.addEventListener("load", onReady, { once: true });
      if (img.complete) onReady();
    }

    return p;
  }

  function syncHave(p) {
    const haveEl = $(".have", p);
    if (haveEl) haveEl.textContent = String(getCoin());
  }

  /* =========================
   * Strip
   * ========================= */
  function cellH(cell) {
    const r = cell.getBoundingClientRect();
    if (r.height && r.height > 10) return (r.height | 0);
    const grid = cell.closest(".grid");
    if (grid) {
      const gr = grid.getBoundingClientRect();
      return Math.max(40, (gr.height / 3) | 0);
    }
    return 80;
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

  function refreshAllCells(panel) {
    panel.querySelectorAll(".cell").forEach((cell) => {
      const name = cell.dataset.sym || "";
      const sym = SYMBOLS.find((s) => s.name === name) || SYMBOLS[0];
      const strip = cell.querySelector(".strip");
      if (!strip) return;
      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      setStrip(strip, [sym], cell);
    });
  }

  function force(el) { void el.offsetHeight; }

  function spinCell(cell, finalSym, delay) {
    const strip = cell.querySelector(".strip");
    const h = cellH(cell);

    const seq = Array.from({ length: SPIN.loops }, () => pickSymbol());
    seq.push(finalSym);

    setStrip(strip, seq, cell);

    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    force(strip);

    strip.style.transition = `transform ${SPIN.baseDuration + delay}ms cubic-bezier(.12,.86,.12,1)`;
    strip.style.transform = `translateY(${-h * (seq.length - 1)}px)`;

    return new Promise((resolve) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

        strip.style.transition = "none";
        setStrip(strip, [finalSym], cell);
        strip.style.transform = "translateY(0)";
        cell.dataset.sym = finalSym.name;

        resolve(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  /* =========================
   * Spin
   * ========================= */
  let spinning = false;

  async function spin(panel, count) {
    if (spinning) return;

    const have = getCoin();
    const cost = SLOT_COST * count;
    if (have < cost) {
      showResult(panel, "コインが足りない…！", 2200);
      return;
    }

    setCoin(have - cost);
    syncHave(panel);

    oneShot(START_SE, 0.9);
    startReelLoop();

    spinning = true;
    panel.classList.add("spinning");
    if (!resultLock) showResult(panel, "回転中…", 1200);

    let totalLines = 0;
    let totalPay = 0;

    for (let t = 0; t < count; t++) {
      const finals = Array.from({ length: 9 }, () => pickSymbol());
      const cells = Array.from(panel.querySelectorAll(".cell"));

      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 0 * SPIN.colDelay);
      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 1 * SPIN.colDelay);
      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 2 * SPIN.colDelay);

      const res = await Promise.all(
        finals.map((s, i) => spinCell(cells[i], s, (i % 3) * SPIN.colDelay))
      );

      const names = res.map((r) => r.name);
      const w = wins(names);

      let payThis = 0;
      for (const line of w) {
        const sym = res[line[0]];
        if (sym.pay) payThis += sym.pay;
      }

      totalLines += w.length;
      totalPay += payThis;
    }

    stopReelLoop();

    if (totalPay > 0) setCoin(getCoin() + totalPay);

    if (totalLines > 0) showResult(panel, `🎉 当たり ${totalLines}ライン / +${totalPay}🪙`, 3600);
    else showResult(panel, "はずれ！", 2400);

    syncHave(panel);
    panel.classList.remove("spinning");
    spinning = false;
  }

  /* =========================
   * Open / Close
   * ========================= */
  function openPanel() {
    const p = buildPanel();
    if (!p) return;

    lockScroll();
    p.style.display = "block";
    syncHave(p);

    requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(p)));
  }

  function closePanel() {
    const p = panelRef || document.getElementById(PANEL_ID);
    if (!p) return;
    if (spinning) return;

    p.style.display = "none";
    unlockScroll();
  }

  /* =========================
   * 起動
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();

    const slotBtn =
      document.getElementById("slotBtn") ||
      [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("スロット"));

    if (slotBtn) slotBtn.addEventListener("click", openPanel);

    const cv = $("#coinValue");
    if (cv) {
      const mo = new MutationObserver(() => {
        if (panelRef && panelRef.style.display !== "none") syncHave(panelRef);
      });
      mo.observe(cv, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener("resize", () => {
      if (panelRef && panelRef.style.display !== "none") {
        requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(panelRef)));
      }
    });
  });
})();
