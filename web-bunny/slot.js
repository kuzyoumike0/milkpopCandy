(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  // 404回避のため相対パス（index.html から見た assets）
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

  function coinBurst(n = 14, i = 65) {
    let c = 0;
    const id = setInterval(() => {
      oneShot(COIN_SE, 0.85);
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

  /* ===== Result (表示ロック + フェードアウト + 数字ポン) ===== */
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
    el.classList.remove("fadeOut", "popNum", "popBig");
    el.textContent = text;

    const coins = parseCoins(text);
    if (coins !== null && coins > 0) {
      requestAnimationFrame(() => el.classList.add(coins >= 500 ? "popBig" : "popNum"));
    }

    const fadeMs = 650;
    const fadeStart = Math.max(0, holdMs - fadeMs);
    resultTimer = setTimeout(() => {
      el.classList.add("fadeOut");
      setTimeout(() => (resultLock = false), fadeMs + 50);
    }, fadeStart);
  }

  /* ===== 豪華演出 ===== */
  let fxTimer = null;

  function clearWinHighlights(panel) {
    panel.querySelectorAll(".cell").forEach((c) => c.classList.remove("winCell"));
    const lines = $(".paylines", panel);
    if (lines) lines.innerHTML = "";
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }

  function spawnConfetti(panel, amount = 28) {
    const box = $(".confetti", panel);
    if (!box) return;
    box.innerHTML = "";
    const w = box.getBoundingClientRect().width || 300;
    for (let i = 0; i < amount; i++) {
      const p = document.createElement("i");
      p.className = "confettiPiece";
      const x = Math.random() * w;
      const d = 700 + Math.random() * 800;
      const s = 0.8 + Math.random() * 0.9;
      const r = (Math.random() * 360) | 0;
      p.style.left = `${x}px`;
      p.style.animationDuration = `${d}ms`;
      p.style.transform = `scale(${s}) rotate(${r}deg)`;
      p.style.opacity = `${0.7 + Math.random() * 0.3}`;
      box.appendChild(p);
    }
    setTimeout(() => (box.innerHTML = ""), 1800);
  }

  function drawPaylines(panel, winLines, intensity = 1) {
    const layer = $(".paylines", panel);
    if (!layer) return;
    layer.innerHTML = "";

    const cells = Array.from(panel.querySelectorAll(".cell"));
    const centers = cells.map((c) => {
      const r = c.getBoundingClientRect();
      const pr = layer.getBoundingClientRect();
      return { x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2 };
    });

    winLines.forEach((line, idx) => {
      const a = centers[line[0]];
      const b = centers[line[1]];
      const c = centers[line[2]];
      if (!a || !b || !c) return;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "lineSvg");
      svg.setAttribute("viewBox", `0 0 ${layer.clientWidth} ${layer.clientHeight}`);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("class", "paylinePath");
      path.style.strokeWidth = `${Math.max(4, 5 + intensity * 1.5)}px`;
      path.style.animationDelay = `${idx * 90}ms`;

      svg.appendChild(path);
      layer.appendChild(svg);
    });
  }

  function triggerWinFx(panel, winLines, totalPay, totalLines) {
    if (fxTimer) {
      clearTimeout(fxTimer);
      fxTimer = null;
    }

    const big = totalPay >= 1000 || totalLines >= 3;
    const intensity = Math.min(3, 1 + (big ? 1.5 : 0) + totalLines * 0.25);

    panel.classList.add("winFx");
    if (big) panel.classList.add("winBig");
    else panel.classList.remove("winBig");

    panel.classList.add("flashOn");
    setTimeout(() => panel.classList.remove("flashOn"), 420);

    vibrate(big ? [80, 60, 120] : [50, 40, 60]);
    coinBurst(big ? 22 : 14, big ? 55 : 65);
    spawnConfetti(panel, big ? 48 : 30);

    const cells = Array.from(panel.querySelectorAll(".cell"));
    winLines.flat().forEach((i) => cells[i]?.classList.add("winCell"));

    drawPaylines(panel, winLines, intensity);

    fxTimer = setTimeout(() => {
      panel.classList.remove("winFx", "winBig");
      clearWinHighlights(panel);
    }, big ? 2400 : 1700);
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
  --panelH:   18%;
  --resY: 0.35;
  --uiY:  0.78;

  position:fixed;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  user-select:none;
  isolation:isolate;

  /* ★クリックで開くので初期は非表示 */
  display:none;
}

/* ★スマホ縦画面で窓位置補正（ズレ対策） */
@media (max-width: 520px){
  #${PANEL_ID}{
    --winX: 54%;8.5%;
    --winH: 33%;
  }
  #${PANEL_ID} .grid,
  #${PANEL_ID} .paylines{
    width:69%;
     width:67%;リックで閉じる） */
#${PANEL_ID} .backdrop{
  position:fixed;
  inset:0;
  background: rgba(0,0,0,.35);
  z-index:2147483646;
}

/* ★中身クリックで閉じない */
#${PANEL_ID} .modal{
  position:relative;
  z-index:2147483647;
}

/* ★閉じるボタン */
#${PANEL_ID} .closeBtn{
  position:absolute;
  right: 10px;
  top: 10px;
  z-index:2147483647;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border:none;
  font-weight: 900;
  cursor:pointer;
  background: rgba(255,255,255,.96);
  box-shadow:0 12px 32px rgba(0,0,0,.20);
}

#${PANEL_ID} .machine{ position:relative; }
#${PANEL_ID} .machineImg{ width:600px; max-width:92vw; display:block; }

/* ===== UIバー ===== */
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
  pointer-events:auto;
}

#${PANEL_ID} .results{
  top: calc(var(--panelTop) + var(--panelH) * var(--resY));
}
#${PANEL_ID} .controls{
  top: calc(var(--panelTop) + var(--panelH) * var(--uiY));
}

#${PANEL_ID} .results{ width:88%; max-width:520px; }

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

/* ===== 結果演出 ===== */
#${PANEL_ID} .result{
  display:inline-block;
  will-change: transform, opacity, filter;
  opacity: 1;
  transform: translateY(0) scale(1);
}
#${PANEL_ID} .result.fadeOut{
  transition: opacity 650ms ease;
  opacity: 0.25;
}
#${PANEL_ID} .result.popNum{
  animation: popNum 420ms cubic-bezier(.2,1.3,.2,1) 1;
}
#${PANEL_ID} .result.popBig{
  animation: popBig 520ms cubic-bezier(.15,1.6,.15,1) 1;
  filter: drop-shadow(0 10px 14px rgba(255,200,0,.45));
}
@keyframes popNum{
  0%{ transform: translateY(0) scale(1); }
  35%{ transform: translateY(-6px) scale(1.12); }
  100%{ transform: translateY(0) scale(1); }
}
@keyframes popBig{
  0%{ transform: translateY(0) scale(1); }
  30%{ transform: translateY(-10px) scale(1.20); }
  60%{ transform: translateY(2px) scale(1.08); }
  100%{ transform: translateY(0) scale(1); }
}

/* ===== スロット窓 ===== */
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

/* spinning blur */
#${PANEL_ID}.spinning .strip{ filter:blur(2px); opacity:.65; }
#${PANEL_ID}.spinning img.sym{ animation:jitter .12s infinite; }
@keyframes jitter{ 0%{transform:translateY(0)} 50%{transform:translateY(1px)} 100%{transform:translateY(0)} }

#${PANEL_ID} img.sym{
  width:78%;
  height:78%;
  object-fit:contain;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,0.18));
}

/* ===== 当たり豪華：セル発光 ===== */
#${PANEL_ID} .cell.winCell{
  box-shadow:
    0 0 0 2px rgba(255,220,120,.55) inset,
    0 0 18px rgba(255,200,0,.55);
  animation: winPulse 680ms ease-in-out infinite;
}
@keyframes winPulse{
  0%{ transform: translateZ(0) scale(1); }
  50%{ transform: translateZ(0) scale(1.02); }
  100%{ transform: translateZ(0) scale(1); }
}

/* ===== 当たりライン描画レイヤ ===== */
#${PANEL_ID} .paylines{
  position:absolute;
  left:var(--winX);
  top:var(--winTop);
  transform:translate(-50%,-50%);
  width:72%;
  height:var(--winH);
  pointer-events:none;
  z-index:2147483645;
}
#${PANEL_ID} .lineSvg{ position:absolute; inset:0; }
#${PANEL_ID} .paylinePath{
  stroke: rgba(255,210,90,.92);
  filter: drop-shadow(0 4px 8px rgba(255,200,0,.35));
  stroke-dasharray: 999;
  stroke-dashoffset: 999;
  animation: lineDraw 520ms ease forwards;
}
@keyframes lineDraw{ to { stroke-dashoffset: 0; } }

/* ===== さらに豪華：筐体を軽く揺らす ===== */
#${PANEL_ID}.winFx{ animation: machineShake 520ms ease-in-out 1; }
#${PANEL_ID}.winBig{ animation: machineShakeBig 720ms ease-in-out 1; }
@keyframes machineShake{
  0%{ transform: translate(-50%,-50%); }
  20%{ transform: translate(calc(-50% - 2px), calc(-50% + 1px)); }
  40%{ transform: translate(calc(-50% + 2px), calc(-50% - 1px)); }
  60%{ transform: translate(calc(-50% - 1px), calc(-50% - 2px)); }
  80%{ transform: translate(calc(-50% + 1px), calc(-50% + 2px)); }
  100%{ transform: translate(-50%,-50%); }
}
@keyframes machineShakeBig{
  0%{ transform: translate(-50%,-50%); }
  15%{ transform: translate(calc(-50% - 4px), calc(-50% + 2px)); }
  30%{ transform: translate(calc(-50% + 4px), calc(-50% - 2px)); }
  45%{ transform: translate(calc(-50% - 3px), calc(-50% - 4px)); }
  60%{ transform: translate(calc(-50% + 3px), calc(-50% + 4px)); }
  75%{ transform: translate(calc(-50% - 2px), calc(-50% + 2px)); }
  100%{ transform: translate(-50%,-50%); }
}

/* フラッシュ */
#${PANEL_ID} .flash{
  position:absolute;
  inset:0;
  background:rgba(255,255,255,.68);
  opacity:0;
  pointer-events:none;
  z-index: 2147483646;
}
#${PANEL_ID}.flashOn .flash{ animation:flash .38s ease-out; }
@keyframes flash{ 0%{opacity:0} 25%{opacity:1} 100%{opacity:0} }

/* ===== 紙吹雪 ===== */
#${PANEL_ID} .confetti{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:2147483646;
  overflow:hidden;
}
#${PANEL_ID} .confettiPiece{
  position:absolute;
  top:-18px;
  width:10px;
  height:16px;
  border-radius:2px;
  background: rgba(255, 210, 90, .92);
  box-shadow: 0 10px 18px rgba(0,0,0,.12);
  animation: confettiFall 1200ms ease-in forwards;
}
#${PANEL_ID} .confettiPiece:nth-child(3n){ background: rgba(255, 140, 200, .92); }
#${PANEL_ID} .confettiPiece:nth-child(3n+1){ background: rgba(120, 210, 255, .92); }
@keyframes confettiFall{
  0%{ transform: translateY(0) rotate(0deg); opacity:1; }
  100%{ transform: translateY(700px) rotate(520deg); opacity:0; }
}
`;
    document.head.appendChild(s);
  }

  /* ===== DOM ===== */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);

    const p = document.createElement("div");
    p.id = PANEL_ID;

    p.innerHTML = `
<div class="backdrop"></div>
<div class="modal">
  <button class="closeBtn" type="button" aria-label="close">×</button>

  <div class="machine">
    <img class="machineImg" src="${MACHINE_SRC}" alt="slot">
    <div class="flash"></div>

    <!-- 当たりライン表示 -->
    <div class="paylines"></div>

    <!-- 紙吹雪 -->
    <div class="confetti"></div>

    <div class="grid">
      ${Array.from({ length: 9 }).map((_, i) => `
        <div class="cell" data-i="${i}"><div class="strip"></div></div>
      `).join("")}
    </div>

    <div class="controlBar results">
      <div class="chip result">回してみよう！</div>
    </div>

    <div class="controlBar controls">
      <div class="chip">所持：<b class="have">0</b> 🪙</div>
      <button class="btn primary spin" type="button">回す（-${SLOT_COST}）</button>
      <button class="btn spin10" type="button">10連</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(p);

    // close handlers
    $(".backdrop", p).onclick = () => closePanel();
    $(".closeBtn", p).onclick = () => closePanel();

    $(".spin", p).onclick = () => spin(p, 1);
    $(".spin10", p).onclick = () => spin(p, 10);

    p.querySelectorAll(".cell").forEach((c) => {
      setStrip(c.querySelector(".strip"), [pickSymbol()], c);
    });

    return p;
  }

  function syncHave(p) {
    const haveEl = $(".have", p);
    if (haveEl) haveEl.textContent = String(getCoin());
  }

  /* ===== Strip ===== */
  function cellH(c) {
    // ★ここが無いと巨大化する：セル実測を1マス高さに固定
    return Math.max(40, (c.getBoundingClientRect().height | 0));
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

    return new Promise((r) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

        strip.style.transition = "none";
        setStrip(strip, [finalSym], cell);
        strip.style.transform = "translateY(0)";

        r(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  /* ===== 判定 ===== */
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

  let spinning = false;

  async function spin(panel, count) {
    if (spinning) return;

    const have = getCoin();
    const cost = SLOT_COST * count;
    if (have < cost) {
      showResult(panel, "コインが足りない…！", 2200);
      return;
    }

    clearWinHighlights(panel);

    setCoin(have - cost);
    syncHave(panel);

    oneShot(START_SE, 0.9);
    startReelLoop();

    spinning = true;
    panel.classList.add("spinning");

    if (!resultLock) showResult(panel, "回転中…", 1200);

    let totalLines = 0;
    let totalPay = 0;

    let lastWinLines = [];
    let lastPay = 0;

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

      lastWinLines = w;
      lastPay = payThis;

      if (w.length > 0 && count > 1) {
        triggerWinFx(panel, w, payThis, w.length);
      }
    }

    panel.classList.remove("spinning");
    stopReelLoop();

    if (totalPay > 0) {
      setCoin(getCoin() + totalPay);
      if (lastWinLines.length > 0) {
        triggerWinFx(panel, lastWinLines, totalPay, totalLines);
      } else {
        triggerWinFx(panel, [], totalPay, totalLines);
      }
    }

    if (totalLines > 0) {
      showResult(panel, `🎉 当たり ${totalLines}ライン / +${totalPay}🪙`, totalPay >= 1000 ? 4600 : 3600);
    } else {
      showResult(panel, "はずれ！", 2400);
    }

    syncHave(panel);
    spinning = false;
  }

  /* ===== open/close ===== */
  let panelRef = null;

  function openPanel() {
    if (!panelRef) panelRef = document.getElementById(PANEL_ID);
    if (!panelRef) return;
    panelRef.style.display = "block";
    syncHave(panelRef);

    // 開いた直後にセルの実測が取れるようになるので、表示を1回整える
    // （初回だけ起きる「サイズ確定前」のズレ防止）
    try {
      const cells = Array.from(panelRef.querySelectorAll(".cell"));
      cells.forEach((c) => {
        const strip = c.querySelector(".strip");
        const cur = strip?.querySelector("img.sym");
        if (cur) {
          // 現在表示中のシンボルで高さ再計算して詰め直す
          const name = cur.alt;
          const sym = SYMBOLS.find(s => s.name === name) || pickSymbol();
          setStrip(strip, [sym], c);
        }
      });
    } catch {}
  }

  function closePanel() {
    if (!panelRef) panelRef = document.getElementById(PANEL_ID);
    if (!panelRef) return;
    if (spinning) return; // 回転中は閉じない
    panelRef.style.display = "none";
  }

  /* ===== 起動 ===== */
  window.addEventListener("load", () => {
    injectStyles();
    panelRef = buildPanel();
    if (panelRef) {
      syncHave(panelRef);
      panelRef.style.display = "none"; // 初期は非表示

      const cv = $("#coinValue");
      if (cv) {
        const mo = new MutationObserver(() => syncHave(panelRef));
        mo.observe(cv, { childList: true, subtree: true, characterData: true });
      }
    }

    // slotBtnで開く
    document.getElementById("slotBtn")?.addEventListener("click", () => openPanel());

    // ESCで閉じる
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    // 他から呼べる
    window.SLOT = window.SLOT || {};
    window.SLOT.open = openPanel;
    window.SLOT.close = closePanel;
  });
})();
