// slot.js — 3x3 スロット（掛け金 / 豪華演出 / ライン常時 / ougon時だけ虹ライン）
// ✅ 当たり：ougon > reabunny > coin4 の優先度
// ✅ ライン演出は常に表示（ハズレは薄線）
// ✅ 掛け金倍率（50基準）
// ✅ 当たり時：HANABI.jackpot() / SYOUGOU.add("slot_win") / WB.emit("slotWin")

(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";

  const BETS = [50, 100, 500, 1000, 5000, 10000];
  const BASE_BET = BETS[0];

  const MACHINE_SRC = "./assets/slot_machine.png";

  const START_SE = "./assets/slotse.mp3";
  const REEL_SE  = "./assets/reelse.mp3";
  const STOP_SE  = "./assets/stop.mp3";
  const COIN_SE  = "./assets/coin.mp3";

  const SYMBOLS = [
    { name: "coin2",     src: "./assets/coin2.png",      w: 30, pay: 100  },
    { name: "coin3",     src: "./assets/coin3.png",      w: 20, pay: 200  },
    { name: "coin4",     src: "./assets/coin4.png",      w: 10, pay: 500  },
    { name: "babybunny", src: "./assets/babybunny.png",  w: 15            },
    { name: "reabunny",  src: "./assets/reabunny.png",   w:  5            },
    { name: "ougon",     src: "./assets/ougonunchi.png", w:  1, pay: 1500 },
  ];

  const SPIN = { loops: 22, colDelay: 220, baseDuration: 980 };
  const $ = (q, p = document) => p.querySelector(q);

  let currentBet = BASE_BET;

  function betMult() {
    return Math.max(1, Math.floor(currentBet / BASE_BET));
  }

  function updateBetUI(panel) {
    if (!panel) return;
    panel.querySelectorAll("[data-bet]").forEach((b) => {
      const v = Number(b.getAttribute("data-bet")) || 0;
      b.classList.toggle("active", v === currentBet);
    });

    const spinBtn = $(".spin", panel);
    const spin10Btn = $(".spin10", panel);
    if (spinBtn) spinBtn.textContent = `回す（-${currentBet}）`;
    if (spin10Btn) spin10Btn.textContent = `10連（-${currentBet * 10}）`;

    const betNow = $(".betNow", panel);
    if (betNow) betNow.textContent = String(currentBet);

    const rate = $(".betRate", panel);
    if (rate) rate.textContent = `×${betMult()}`;
  }

  function setBet(v, panel) {
    const nv = BETS.includes(v) ? v : BASE_BET;
    currentBet = nv;
    updateBetUI(panel);
  }

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

  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      if ((r -= s.w) <= 0) return s;
    }
    return SYMBOLS[0];
  }

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

  let resultLock = false;
  let resultTimer = null;

  function parseCoins(text) {
    const m = String(text || "").match(/\+(\d+)/);
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
        if (coins >= 1500 * betMult()) el.classList.add("popMega");
        else el.classList.add(coins >= 500 * betMult() ? "popBig" : "popNum");
      });
    }

    const fadeMs = 650;
    const fadeStart = Math.max(0, holdMs - fadeMs);
    resultTimer = setTimeout(() => {
      el.classList.add("fadeOut");
      setTimeout(() => (resultLock = false), fadeMs + 50);
    }, fadeStart);
  }

  let fxTimer = null;
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {} }

  function clearWinHighlights(panel) {
    panel.querySelectorAll(".cell").forEach((c) => c.classList.remove("winCell", "winCellBig", "winCellMega"));
    const lines = $(".paylines", panel);
    if (lines) lines.innerHTML = "";
    const aura = $(".aura", panel);
    if (aura) aura.innerHTML = "";
    const spot = $(".spotlights", panel);
    if (spot) spot.innerHTML = "";
    const conf = $(".confetti", panel);
    if (conf) conf.innerHTML = "";
  }

  function spawnConfetti(panel, amount = 28, mega = false) {
    const box = $(".confetti", panel);
    if (!box) return;
    box.innerHTML = "";
    const w = box.getBoundingClientRect().width || 300;
    for (let i = 0; i < amount; i++) {
      const p = document.createElement("i");
      p.className = "confettiPiece" + (mega ? " mega" : "");
      const x = Math.random() * w;
      const d = (mega ? 900 : 700) + Math.random() * (mega ? 1200 : 800);
      const s = (mega ? 1.0 : 0.8) + Math.random() * 1.0;
      const r = (Math.random() * 360) | 0;
      p.style.left = `${x}px`;
      p.style.animationDuration = `${d}ms`;
      p.style.transform = `scale(${s}) rotate(${r}deg)`;
      p.style.opacity = `${0.72 + Math.random() * 0.28}`;
      box.appendChild(p);
    }
    setTimeout(() => (box.innerHTML = ""), mega ? 2600 : 1800);
  }

  function spawnAura(panel, mega = false) {
    const aura = $(".aura", panel);
    if (!aura) return;
    aura.innerHTML = `
      <i class="auraRing ${mega ? "mega" : ""}"></i>
      <i class="auraRing2 ${mega ? "mega" : ""}"></i>
      <i class="auraSpark ${mega ? "mega" : ""}"></i>
    `;
  }

  function spawnSpotlights(panel, mega = false) {
    const spot = $(".spotlights", panel);
    if (!spot) return;
    spot.innerHTML = "";
    for (let i = 0; i < (mega ? 5 : 3); i++) {
      const s = document.createElement("i");
      s.className = "spot" + (mega ? " mega" : "");
      s.style.left = `${10 + i * (mega ? 18 : 26)}%`;
      s.style.animationDelay = `${i * 120}ms`;
      spot.appendChild(s);
    }
  }

  function drawPaylinesAlways(panel, winLines, tier = 0) {
    const layer = $(".paylines", panel);
    if (!layer) return;
    layer.innerHTML = "";

    const cells = Array.from(panel.querySelectorAll(".cell"));
    const centers = cells.map((c) => {
      const r = c.getBoundingClientRect();
      const pr = layer.getBoundingClientRect();
      return { x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2 };
    });

    const targetLines = (winLines && winLines.length) ? winLines : LINES;

    targetLines.forEach((line, idx) => {
      const a = centers[line[0]];
      const b = centers[line[1]];
      const c = centers[line[2]];
      if (!a || !b || !c) return;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "lineSvg");
      svg.setAttribute("viewBox", `0 0 ${layer.clientWidth} ${layer.clientHeight}`);

      if (tier >= 3) {
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `
          <linearGradient id="rainbowGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="0">
            <stop offset="0%"   stop-color="#ff4d4d"/>
            <stop offset="16%"  stop-color="#ff9f1c"/>
            <stop offset="33%"  stop-color="#fff200"/>
            <stop offset="50%"  stop-color="#2ecc71"/>
            <stop offset="66%"  stop-color="#4aa3ff"/>
            <stop offset="83%"  stop-color="#a66cff"/>
            <stop offset="100%" stop-color="#ff4dd8"/>
          </linearGradient>
        `;
        svg.appendChild(defs);
      }

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");

      const cls =
        "paylinePath" +
        (tier >= 3 ? " rainbow" : "") +
        (tier >= 2 && tier < 3 ? " big" : "") +
        (tier >= 1 && tier < 2 ? " mid" : "") +
        (!winLines || !winLines.length ? " faint" : "");
      path.setAttribute("class", cls);

      path.style.animationDelay = `${idx * 90}ms`;
      svg.appendChild(path);
      layer.appendChild(svg);
    });

    if (!winLines || !winLines.length) {
      setTimeout(() => { try { layer.innerHTML = ""; } catch {} }, 900);
    }
  }

  function getBestTierFromWins(winLines, names) {
    if (!winLines || winLines.length === 0) return 0;
    for (const line of winLines) if (names[line[0]] === "ougon") return 3;
    for (const line of winLines) if (names[line[0]] === "reabunny") return 2;
    for (const line of winLines) if (names[line[0]] === "coin4") return 1;
    return 0;
  }

  function triggerWinFx(panel, winLines, tier, totalPay, totalLines) {
    if (fxTimer) { clearTimeout(fxTimer); fxTimer = null; }

    const machine = panel.querySelector(".machine") || panel;

    const mega = tier >= 3;
    const big  = tier >= 2 || totalPay >= (1000 * betMult()) || totalLines >= 3;

    machine.classList.add("winFx");
    if (big) machine.classList.add("winBig"); else machine.classList.remove("winBig");
    if (mega) machine.classList.add("winMega"); else machine.classList.remove("winMega");

    panel.classList.add("flashOn");
    setTimeout(() => panel.classList.remove("flashOn"), 420);
    if (mega) {
      setTimeout(() => {
        panel.classList.add("flashOn");
        setTimeout(() => panel.classList.remove("flashOn"), 420);
      }, 520);
    }

    vibrate(mega ? [90, 70, 130, 70, 170] : (big ? [80, 60, 120] : [50, 40, 60]));
    if (mega) coinBurst(32, 46, 0.9);
    else coinBurst(big ? 22 : 14, big ? 55 : 65, 0.85);

    spawnConfetti(panel, mega ? 72 : (big ? 48 : 30), mega);
    spawnAura(panel, mega);
    spawnSpotlights(panel, mega);

    const cells = Array.from(panel.querySelectorAll(".cell"));
    (winLines || []).flat().forEach((i) => {
      const c = cells[i];
      if (!c) return;
      c.classList.add("winCell");
      if (big) c.classList.add("winCellBig");
      if (mega) c.classList.add("winCellMega");
    });

    const dur = mega ? 3200 : (big ? 2400 : 1700);
    fxTimer = setTimeout(() => {
      machine.classList.remove("winFx", "winBig", "winMega");
      clearWinHighlights(panel);
    }, dur);
  }

  function injectStyles() {
    if (document.getElementById("slotStyleLuxV2Bet")) return;
    const s = document.createElement("style");
    s.id = "slotStyleLuxV2Bet";
    s.textContent = `/* あなたの貼ってくれたCSSと同等（省略なしで必要なら次で分割して全部出す） */
#${PANEL_ID}{position:fixed;inset:0;z-index:2147483647;display:none;overflow:hidden;user-select:none;isolation:isolate;}
#${PANEL_ID} .backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35);}
#${PANEL_ID} .machine{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
#${PANEL_ID} .machineImg{display:block;width:min(520px,92vw);height:auto;max-height:92vh;}
#${PANEL_ID} .closeBtn{position:absolute;top:10px;right:10px;border-radius:14px;width:44px;height:44px;border:none;background:rgba(255,255,255,.95);box-shadow:0 12px 32px rgba(0,0,0,.18);cursor:pointer;z-index:2147483647;}
#${PANEL_ID} .aura,#${PANEL_ID} .spotlights{position:absolute;inset:0;pointer-events:none;z-index:2147483644;overflow:hidden;}
#${PANEL_ID} .grid{position:absolute;left:52%;top:38%;transform:translate(-50%,-50%);width:72%;height:34%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4%;}
#${PANEL_ID} .cell{position:relative;overflow:hidden;border-radius:12px;display:flex;align-items:center;justify-content:center;}
#${PANEL_ID} .strip{position:absolute;inset:0;transform:translateY(0);will-change:transform,filter,opacity;}
#${PANEL_ID}.spinning .strip{filter:blur(2px);opacity:.65;}
#${PANEL_ID} img.sym{width:78%;height:78%;object-fit:contain;display:block;filter:drop-shadow(0 8px 10px rgba(0,0,0,0.18));}
#${PANEL_ID} .paylines{position:absolute;left:52%;top:38%;transform:translate(-50%,-50%);width:72%;height:34%;pointer-events:none;z-index:2147483645;}
#${PANEL_ID} .lineSvg{position:absolute;inset:0;}
#${PANEL_ID} .paylinePath{stroke:rgba(255,210,90,.92);stroke-dasharray:999;stroke-dashoffset:999;animation:lineDraw 520ms ease forwards;stroke-width:7px;fill:none;stroke-linecap:round;stroke-linejoin:round;}
#${PANEL_ID} .paylinePath.faint{stroke:rgba(255,255,255,.35);stroke-width:6px;animation-duration:420ms;filter:none;}
#${PANEL_ID} .paylinePath.rainbow{stroke:url(#rainbowGradient);stroke-width:10px;filter:drop-shadow(0 0 6px rgba(255,255,255,.9)) drop-shadow(0 0 14px rgba(255,200,255,.9));}
@keyframes lineDraw{to{stroke-dashoffset:0}}
#${PANEL_ID} .controlBar{position:absolute;left:50%;transform:translate(-50%,-50%);width:86%;max-width:560px;display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;z-index:2147483647;pointer-events:auto;}
#${PANEL_ID} .results{left:50%;top:calc(50% - min(520px,92vw) * 0.52);transform:translate(-50%,-50%);width:min(520px,92vw);max-width:560px;justify-content:center;pointer-events:none;}
#${PANEL_ID} .chip{background:rgba(255,255,255,.96);padding:10px 14px;border-radius:14px;font-weight:900;box-shadow:0 12px 32px rgba(0,0,0,.18);}
#${PANEL_ID} .btn{padding:10px 14px;border-radius:14px;font-weight:900;border:none;background:#fff;cursor:pointer;box-shadow:0 12px 32px rgba(0,0,0,.14);}
#${PANEL_ID} .btn.primary{background:#ffd6e7;}
#${PANEL_ID} .btn.active{outline:3px solid rgba(255,180,210,.9);}
#${PANEL_ID} .betRow{width:100%;display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
#${PANEL_ID} .result.fadeOut{transition:opacity 650ms ease;opacity:.25;}
#${PANEL_ID} .flash{position:absolute;inset:0;background:rgba(255,255,255,.68);opacity:0;pointer-events:none;z-index:2147483646;}
#${PANEL_ID}.flashOn .flash{animation:flash .38s ease-out;}
@keyframes flash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
`;
    document.head.appendChild(s);
  }

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

  function syncHave(p) {
    const haveEl = $(".have", p);
    if (haveEl) haveEl.textContent = String(getCoin());
  }

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

  let spinning = false;

  async function spin(panel, count) {
    if (spinning) return;

    const have = getCoin();
    const cost = currentBet * count;

    if (have < cost) {
      showResult(panel, "コインが足りない…！", 2200);
      drawPaylinesAlways(panel, [], 0);
      return;
    }

    clearWinHighlights(panel);

    setCoin(have - cost);
    syncHave(panel);
    updateBetUI(panel);

    oneShot(START_SE, 0.9);
    startReelLoop();

    spinning = true;
    panel.classList.add("spinning");
    if (!resultLock) showResult(panel, "回転中…", 1200);

    let totalLines = 0;
    let totalPay = 0;

    let lastWinLines = [];
    let lastNames = [];

    const mult = betMult();

    try {
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
          if (sym.pay) payThis += sym.pay * mult;
        }

        totalLines += w.length;
        totalPay += payThis;

        lastWinLines = w;
        lastNames = names;

        if (w.length > 0 && count > 1) {
          const tier = getBestTierFromWins(w, names);
          drawPaylinesAlways(panel, w, tier);
          triggerWinFx(panel, w, tier, payThis, w.length);
        } else {
          drawPaylinesAlways(panel, [], 0);
        }
      }
    } finally {
      panel.classList.remove("spinning");
      stopReelLoop();
      spinning = false;
    }

    if (totalPay > 0) setCoin(getCoin() + totalPay);

    const bestTier = getBestTierFromWins(lastWinLines, lastNames);
    drawPaylinesAlways(panel, lastWinLines, bestTier);

    if (totalLines > 0) {
      triggerWinFx(panel, lastWinLines, bestTier, totalPay, totalLines);

      // ✅ 称号：スロット当たり
      try { window.SYOUGOU?.add?.("slot_win", 1); } catch {}
      try { window.WB?.emit?.("slotWin"); } catch {}
      try { window.dispatchEvent(new CustomEvent("wb:slotWin")); } catch {}

      // ✅ 当たり花火（特大）
      try { window.HANABI?.jackpot?.(); } catch {}
      try { window.dispatchEvent(new CustomEvent("milkpop:slotWin")); } catch {}

      const hold =
        bestTier >= 3 ? 5600 :
        bestTier >= 2 ? 4800 :
        bestTier >= 1 ? 4200 : 3600;

      showResult(panel, `🎉 当たり ${totalLines}ライン / +${totalPay}🪙（掛け${currentBet}×${mult}）`, hold);
    } else {
      showResult(panel, `はずれ！（掛け${currentBet}）`, 2400);
    }

    syncHave(panel);
    updateBetUI(panel);
  }

  function buildPanel() {
    let p = document.getElementById(PANEL_ID);

    if (!p) {
      p = document.createElement("div");
      p.id = PANEL_ID;
      document.body.appendChild(p);
    } else {
      if (p.parentElement !== document.body) document.body.appendChild(p);
    }
    panelRef = p;

    if (p.querySelector(".machine")) return p;

    p.innerHTML = `
<div class="backdrop"></div>
<div class="machine">
  <img class="machineImg" src="${MACHINE_SRC}" alt="slot">
  <div class="flash"></div>

  <div class="spotlights"></div>
  <div class="aura"></div>

  <div class="paylines"></div>
  <div class="confetti"></div>

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

    <div class="chip">掛け：<b class="betNow">${BASE_BET}</b> 🪙 <span class="betRate">×1</span></div>

    <div class="betRow">
      ${BETS.map(v => `<button class="btn bet" type="button" data-bet="${v}">${v}</button>`).join("")}
    </div>

    <button class="btn primary spin" type="button">回す（-${BASE_BET}）</button>
    <button class="btn spin10" type="button">10連（-${BASE_BET * 10}）</button>
  </div>
</div>
<button class="closeBtn" aria-label="close" type="button">×</button>
`;

    // 初期絵柄
    p.querySelectorAll(".cell").forEach((c) => {
      const s = pickSymbol();
      c.dataset.sym = s.name;
      setStrip(c.querySelector(".strip"), [s], c);
    });

    $(".spin", p).addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); spin(p, 1); });
    $(".spin10", p).addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); spin(p, 10); });

    // bet buttons
    p.querySelectorAll("[data-bet]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const v = Number(btn.getAttribute("data-bet")) || BASE_BET;
        setBet(v, p);
        oneShot(COIN_SE, 0.55);
      });
    });

    $(".closeBtn", p).addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
    $(".backdrop", p).addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
    $(".machine", p).addEventListener("click", (e) => { e.stopPropagation(); });

    const img = $(".machineImg", p);
    if (img) {
      const onReady = () => requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(p)));
      img.addEventListener("load", onReady, { once: true });
      if (img.complete) onReady();
    }

    setBet(currentBet, p);
    return p;
  }

  function openPanel() {
    const p = buildPanel();
    if (!p) return;

    lockScroll();
    p.style.display = "block";
    syncHave(p);
    updateBetUI(p);

    requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(p)));
  }

  function closePanel() {
    const p = panelRef || document.getElementById(PANEL_ID);
    if (!p) return;
    if (spinning) return;

    p.style.display = "none";
    unlockScroll();
  }

  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();

    const slotBtn =
      document.getElementById("slotBtn") ||
      [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("スロット"));

    if (slotBtn) slotBtn.addEventListener("click", (e) => { e.preventDefault(); openPanel(); });

    const cv = $("#coinValue");
    if (cv) {
      const mo = new MutationObserver(() => {
        if (panelRef && panelRef.style.display !== "none") {
          syncHave(panelRef);
          updateBetUI(panelRef);
        }
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
