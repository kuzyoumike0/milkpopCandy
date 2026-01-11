// slot.js — 3x3 スロット（掛け金 / 豪華演出 / ライン常時 / ougon時だけ虹ライン）完全版
// ✅ 掛け金：50/100/500/1000/5000/10000
// ✅ 払戻：pay は「50掛け基準」→ 掛け倍率で増える
// ✅ ライン演出：常に表示（ハズレは薄線で短時間）
// ✅ 当たり演出：ougon(3) > reabunny(2) > coin4(1) > others(0)
// ✅ 当たり時：称号加算(slot_win) / 花火特大（HANABI.jackpot） / WB.emit("slotWin") / window event
// ✅ syougou.js未ロードでもキューして後で反映
// ✅ 追加：うさぎティアで払戻UP（babybunny < bunny1 < bunny3 < bunny4 < bunny5 < reabunny）
// ✅ FIX：スロットの増減も coinChanged を必ず emit → prestige.js のゲージに反映
// ✅ FIX：当たり（totalPay）確定時に WB.prestige.onCoinsGained(totalPay,"slot") を明示的に呼ぶ（保険）

(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";

  // ★掛け金候補
  const BETS = [50, 100, 500, 1000, 5000, 10000];
  const BASE_BET = BETS[0]; // 払い戻し倍率の基準（=50）

  const MACHINE_SRC = "./assets/slot_machine.png";

  /* ===== SE ===== */
  const START_SE = "./assets/slotse.mp3";
  const REEL_SE  = "./assets/reelse.mp3";
  const STOP_SE  = "./assets/stop.mp3";
  const COIN_SE  = "./assets/coin.mp3";

  /* ===== 絵柄 ===== */
  const SYMBOLS = [
    { name: "coin2",     src: "./assets/coin2.png",      w: 30, pay: 100  }, // payは「50掛け基準」
    { name: "coin3",     src: "./assets/coin3.png",      w: 20, pay: 200  },
    { name: "coin4",     src: "./assets/coin4.png",      w: 10, pay: 500  }, // ← 次点（coin4）
    { name: "babybunny", src: "./assets/babybunny.png",  w: 15            },
    { name: "reabunny",  src: "./assets/reabunny.png",   w:  5            }, // ← 2番手
    { name: "ougon",     src: "./assets/ougonunchi.png", w:  1, pay: 1500 }, // ← 最上位
  ];

  const SPIN = { loops: 22, colDelay: 220, baseDuration: 980 };
  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * ✅ うさぎティア（払戻UP）
   * tier順：babybunny,bunny1,bunny3,bunny4,bunny5,reabunny
   * - WB.getBunnies() を見て「最高ティア」を採用
   * - baby判定は b.isBaby を優先（app.js側）
   * - 係数：1 + tier*0.25（baby=1.00 / bunny1=1.25 / bunny3=1.50 / bunny4=1.75 / bunny5=2.00 / reabunny=2.25）
   * ========================= */
  const BUNNY_TIER = {
    babybunny: 0,
    bunny1: 1,
    bunny3: 2,
    bunny4: 3,
    bunny5: 4,
    reabunny: 5,
  };

  function getBestBunnyTier() {
    try {
      const WB = window.WB;
      const list = (WB?.getBunnies?.() || WB?.bunnies || []);
      if (!Array.isArray(list) || list.length === 0) return 0;

      let best = 0;
      for (const b of list) {
        if (!b) continue;
        // app.js の Bunny は isBaby を持つ
        if (b.isBaby) { best = Math.max(best, 0); continue; }

        const kind = String(b.kind || "bunny1");
        const t = Number.isFinite(BUNNY_TIER[kind]) ? BUNNY_TIER[kind] : 1;
        best = Math.max(best, t);
      }
      return best;
    } catch {
      return 0;
    }
  }

  function bunnyTierMult() {
    const tier = getBestBunnyTier();
    const m = 1 + tier * 0.25;
    // 念のため下限
    return Math.max(1, m);
  }

  function bunnyTierLabel() {
    const tier = getBestBunnyTier();
    const inv = ["babybunny", "bunny1", "bunny3", "bunny4", "bunny5", "reabunny"];
    return inv[tier] || "babybunny";
  }

  /* =========================
   * 称号加算（syougou.jsが後から来てもOK）
   * ========================= */
  function syAdd(key, n = 1) {
    try {
      if (window.SYOUGOU?.add) return window.SYOUGOU.add(key, n);
    } catch {}
    window.__syougouQueue = window.__syougouQueue || [];
    window.__syougouQueue.push([key, n]);
  }

  // 後からsyougou.jsが来たらキュー消化
  function flushSyougouQueue() {
    const q = window.__syougouQueue;
    if (!Array.isArray(q) || q.length === 0) return;
    if (!window.SYOUGOU?.add) return;
    while (q.length) {
      const [k, n] = q.shift();
      try { window.SYOUGOU.add(k, n); } catch {}
    }
  }

  /* =========================
   * Bet state
   * ========================= */
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

    // ✅ うさぎティア表示
    const bt = $(".bunnyTier", panel);
    if (bt) bt.textContent = `${bunnyTierLabel()}（×${bunnyTierMult().toFixed(2)}）`;
  }

  function setBet(v, panel) {
    const nv = BETS.includes(v) ? v : BASE_BET;
    currentBet = nv;
    updateBetUI(panel);
  }

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
  // 1) 最優先：WB.getCoin
  try {
    if (window.WB && typeof window.WB.getCoin === "function") {
      const v = Number(window.WB.getCoin());
      return Number.isFinite(v) ? v : 0;
    }
  } catch {}

  // 2) 次点：WB.coins（getter）
  try {
    if (window.WB && typeof window.WB.coins === "number") {
      const v = Number(window.WB.coins);
      return Number.isFinite(v) ? v : 0;
    }
  } catch {}

  // 3) ✅ 最後の砦：localStorage（app.js と同じキーを使う）
  try {
    const key = window.WB?.LS?.coins || "wb_coins_v6";
    const v = parseInt(localStorage.getItem(key) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  } catch {}

  return 0;
}


  // ✅ FIX：setCoin したら必ず coinChanged を emit（prestige.js がこれを購読）
  function setCoin(v, source = "slot") {
    const nv = Math.max(0, Math.floor(Number(v) || 0));
    let setOK = false;

    // 1) できれば app.js の setCoin を使う（あれば）
    try {
      if (window.WB && typeof window.WB.setCoin === "function") {
        window.WB.setCoin(nv, source);
        setOK = true;
      }
    } catch {}

    // 2) fallback：WB.coins に入れて保存＆HUD
    if (!setOK) {
      try {
        if (window.WB) {
          // app.js の coins setter が saveCoins/updateHud をやる
          window.WB.coins = nv;
          window.WB.saveCoins?.();
          window.WB.updateHud?.();
          setOK = true;
        }
      } catch {}
    }

    // 3) DOM fallback
    const el = $("#coinValue");
    if (el) el.textContent = String(nv);

    // ✅ 重要：必ず coinChanged を流す（減算でもOK。prestige側は増加分だけ加算する）
    try { window.WB?.emit?.("coinChanged", nv); } catch {}
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
   * 判定ライン
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
   * Result
   * ========================= */
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

  /* =========================
   * 演出（豪華）
   * 優先度: ougon(3) > reabunny(2) > coin4(1) > others(0)
   * ========================= */
  let fxTimer = null;

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  }

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

  // ★ライン演出は常に入れる：
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
      setTimeout(() => {
        try { layer.innerHTML = ""; } catch {}
      }, 900);
    }
  }

  function getBestTierFromWins(winLines, names) {
    if (!winLines || winLines.length === 0) return 0;

    for (const line of winLines) {
      const sym = names[line[0]];
      if (sym === "ougon") return 3;
    }
    for (const line of winLines) {
      const sym = names[line[0]];
      if (sym === "reabunny") return 2;
    }
    for (const line of winLines) {
      const sym = names[line[0]];
      if (sym === "coin4") return 1;
    }
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

  /* =========================
   * CSS（中央固定＆豪華演出＋虹ライン）
   * ========================= */
  function injectStyles() {
    if (document.getElementById("slotStyleLuxV2Bet")) return;
    const s = document.createElement("style");
    s.id = "slotStyleLuxV2Bet";
    s.textContent = `
#${PANEL_ID}{
  --winTop: 38%;
  --winH: 34%;
  --winX: 52%;
  --panelTop: 68%;
  --panelH:   18%;
  --resY: 0.35;
  --uiY:  0.78;

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
  position:absolute;
  inset:0;
  background:rgba(0,0,0,.35);
}

/* 中央固定 */
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

/* 閉じる */
#${PANEL_ID} .closeBtn{
  position:absolute;
  top:10px;
  right:10px;
  border-radius:14px;
  width:44px;
  height:44px;
  border:none;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  z-index:2147483647;
}

/* ===== 追加レイヤ：オーラ/スポット ===== */
#${PANEL_ID} .aura, #${PANEL_ID} .spotlights{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:2147483644;
  overflow:hidden;
}
#${PANEL_ID} .auraRing, #${PANEL_ID} .auraRing2{
  position:absolute;
  left:50%;
  top:50%;
  width:84%;
  height:84%;
  transform:translate(-50%,-50%);
  border-radius:999px;
  background: radial-gradient(circle, rgba(255,230,120,.0) 45%, rgba(255,220,120,.22) 55%, rgba(255,190,40,.0) 70%);
  filter: drop-shadow(0 0 22px rgba(255,210,90,.35));
  animation: auraPulse 980ms ease-in-out infinite;
}
#${PANEL_ID} .auraRing2{
  width:92%;
  height:92%;
  opacity:.75;
  animation-duration: 1240ms;
}
#${PANEL_ID} .auraRing.mega, #${PANEL_ID} .auraRing2.mega{
  filter: drop-shadow(0 0 34px rgba(255,240,150,.55));
  animation-duration: 720ms;
}
@keyframes auraPulse{
  0%{ transform:translate(-50%,-50%) scale(0.98); opacity:0.75; }
  50%{ transform:translate(-50%,-50%) scale(1.02); opacity:1; }
  100%{ transform:translate(-50%,-50%) scale(0.98); opacity:0.75; }
}
#${PANEL_ID} .auraSpark{
  position:absolute;
  left:50%;
  top:50%;
  width:90%;
  height:90%;
  transform:translate(-50%,-50%);
  background:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,.9), rgba(255,255,255,0) 35%),
    radial-gradient(circle at 80% 40%, rgba(255,255,255,.75), rgba(255,255,255,0) 32%),
    radial-gradient(circle at 60% 80%, rgba(255,255,255,.6), rgba(255,255,255,0) 28%);
  mix-blend-mode: screen;
  opacity:0.0;
  animation: spark 980ms ease-in-out infinite;
}
#${PANEL_ID} .auraSpark.mega{ animation-duration: 680ms; }
@keyframes spark{
  0%{ opacity:0.0; }
  30%{ opacity:0.55; }
  60%{ opacity:0.18; }
  100%{ opacity:0.0; }
}
#${PANEL_ID} .spot{
  position:absolute;
  top:-10%;
  width:22%;
  height:140%;
  background: linear-gradient(to bottom, rgba(255,245,180,.0), rgba(255,245,180,.22), rgba(255,245,180,.0));
  transform: skewX(-10deg) rotate(8deg);
  opacity:0;
  animation: spotSweep 980ms ease-in-out infinite;
}
#${PANEL_ID} .spot.mega{
  width:18%;
  background: linear-gradient(to bottom, rgba(255,255,220,.0), rgba(255,255,220,.28), rgba(255,255,220,.0));
  animation-duration: 760ms;
}
@keyframes spotSweep{
  0%{ opacity:0; transform: skewX(-10deg) rotate(8deg) translateY(-10px); }
  25%{ opacity:0.55; }
  55%{ opacity:0.18; }
  100%{ opacity:0; transform: skewX(-10deg) rotate(8deg) translateY(10px); }
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
  display:block;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,0.18));
}

/* ===== 当たりセル発光（段階） ===== */
#${PANEL_ID} .cell.winCell{
  box-shadow:
    0 0 0 2px rgba(255,220,120,.55) inset,
    0 0 18px rgba(255,200,0,.55);
  animation: winPulse 680ms ease-in-out infinite;
}
#${PANEL_ID} .cell.winCell.winCellBig{
  box-shadow:
    0 0 0 2px rgba(255,235,150,.7) inset,
    0 0 26px rgba(255,220,120,.75);
  animation-duration: 560ms;
}
#${PANEL_ID} .cell.winCell.winCellMega{
  box-shadow:
    0 0 0 3px rgba(255,255,220,.85) inset,
    0 0 34px rgba(255,245,170,.95);
  animation-duration: 420ms;
}
@keyframes winPulse{
  0%{ transform: translateZ(0) scale(1); }
  50%{ transform: translateZ(0) scale(1.03); }
  100%{ transform: translateZ(0) scale(1); }
}

/* ===== ライン描画 ===== */
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
  filter: drop-shadow(0 6px 12px rgba(255,200,0,.35));
  stroke-dasharray: 999;
  stroke-dashoffset: 999;
  animation: lineDraw 520ms ease forwards;
  stroke-width: 7px;
}
#${PANEL_ID} .paylinePath.mid{ stroke-width: 8px; }
#${PANEL_ID} .paylinePath.big{
  stroke: rgba(255,250,200,.95);
  filter: drop-shadow(0 8px 18px rgba(255,240,150,.55));
  stroke-width: 10px;
}
#${PANEL_ID} .paylinePath.faint{
  stroke: rgba(255,255,255,.35);
  filter: none;
  stroke-width: 6px;
  animation-duration: 420ms;
}
@keyframes lineDraw{ to { stroke-dashoffset: 0; } }

/* ===== 虹ライン（ougon専用） ===== */
#${PANEL_ID} .paylinePath.rainbow{
  stroke: url(#rainbowGradient);
  stroke-width: 10px;
  filter:
    drop-shadow(0 0 6px rgba(255,255,255,.9))
    drop-shadow(0 0 14px rgba(255,200,255,.9));
}

/* ===== 筐体揺れ（段階） ===== */
#${PANEL_ID} .machine.winFx{ animation: machineShake 520ms ease-in-out 1; }
#${PANEL_ID} .machine.winBig{ animation: machineShakeBig 720ms ease-in-out 1; }
#${PANEL_ID} .machine.winMega{ animation: machineShakeMega 900ms ease-in-out 1; }

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
@keyframes machineShakeMega{
  0%{ transform: translate(-50%,-50%) scale(1); }
  12%{ transform: translate(calc(-50% - 6px), calc(-50% + 3px)) scale(1.01); }
  24%{ transform: translate(calc(-50% + 6px), calc(-50% - 3px)) scale(1.01); }
  36%{ transform: translate(calc(-50% - 5px), calc(-50% - 6px)) scale(1.02); }
  48%{ transform: translate(calc(-50% + 5px), calc(-50% + 6px)) scale(1.02); }
  60%{ transform: translate(calc(-50% - 4px), calc(-50% + 3px)) scale(1.01); }
  72%{ transform: translate(calc(-50% + 4px), calc(-50% - 3px)) scale(1.01); }
  100%{ transform: translate(-50%,-50%) scale(1); }
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

/* 紙吹雪 */
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
#${PANEL_ID} .confettiPiece.mega{
  width:12px;
  height:20px;
  box-shadow: 0 14px 22px rgba(0,0,0,.14);
}
@keyframes confettiFall{
  0%{ transform: translateY(0) rotate(0deg); opacity:1; }
  100%{ transform: translateY(760px) rotate(620deg); opacity:0; }
}

/* UIバー */
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
  pointer-events:auto;
}

/* 結果表示：台の上に固定 */
#${PANEL_ID} .results{
  left: 50%;
  top: calc(50% - min(520px, 92vw) * 0.52);
  transform: translate(-50%, -50%);
  width: min(520px, 92vw);
  max-width: 560px;
  justify-content: center;
  pointer-events: none;
}
#${PANEL_ID} .results .chip{
  background: rgba(255,255,255,.94);
  box-shadow: 0 18px 60px rgba(0,0,0,.22);
  border-radius: 18px;
  padding: 12px 16px;
}

#${PANEL_ID} .controls{ top: calc(var(--panelTop) + var(--panelH) * var(--uiY)); }

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
#${PANEL_ID} .btn.active{
  outline: 3px solid rgba(255, 180, 210, .9);
  box-shadow:0 12px 32px rgba(0,0,0,.16), 0 0 0 3px rgba(255, 180, 210, .35);
}

/* ベット行 */
#${PANEL_ID} .betRow{
  width: 100%;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
}

/* 結果文字 */
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
#${PANEL_ID} .result.popNum{ animation: popNum 420ms cubic-bezier(.2,1.3,.2,1) 1; }
#${PANEL_ID} .result.popBig{
  animation: popBig 520ms cubic-bezier(.15,1.6,.15,1) 1;
  filter: drop-shadow(0 10px 14px rgba(255,200,0,.45));
}
#${PANEL_ID} .result.popMega{
  animation: popMega 720ms cubic-bezier(.12,1.9,.12,1) 1;
  filter: drop-shadow(0 14px 18px rgba(255,240,150,.65));
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
@keyframes popMega{
  0%{ transform: translateY(0) scale(1); }
  22%{ transform: translateY(-14px) scale(1.28); }
  45%{ transform: translateY(3px) scale(1.10); }
  70%{ transform: translateY(-4px) scale(1.18); }
  100%{ transform: translateY(0) scale(1); }
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * DOM (panel)
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

  function syncHave(p) {
    const haveEl = $(".have", p);
    if (haveEl) haveEl.textContent = String(getCoin());
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

    <!-- ✅ うさぎティア表示 -->
    <div class="chip">うさぎ：<b class="bunnyTier">babybunny（×1.00）</b></div>

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

    // 初期ベットUI
    setBet(currentBet, p);
    return p;
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

  function onSlotWinSignal() {
    try { window.WB?.emit?.("slotWin"); } catch {}
    try { window.dispatchEvent(new CustomEvent("wb:slotWin")); } catch {}
    try { window.dispatchEvent(new CustomEvent("milkpop:slotWin")); } catch {}

    syAdd("slot_win", 1);
    try { window.HANABI?.jackpot?.(); } catch {}
  }

  // ✅ prestigeゲージへ「確実に」加算（slot専用）
  function addPrestigeEarned(delta) {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;
    try { window.WB?.prestige?.onCoinsGained?.(d, "slot"); } catch {}
  }

  async function spin(panel, count) {
    if (spinning) return;

    flushSyougouQueue();

    // ✅ スピン開始時のティア倍率を固定（途中で変わってもブレない）
    const bunnyM = bunnyTierMult();
    const bunnyTierName = bunnyTierLabel();

    updateBetUI(panel);

    const have = getCoin();
    const cost = currentBet * count;

    if (have < cost) {
      showResult(panel, "コインが足りない…！", 2200);
      drawPaylinesAlways(panel, [], 0);
      return;
    }

    clearWinHighlights(panel);

    // 掛け金支払い（ここでも coinChanged が出る）
    setCoin(have - cost, "slot:bet");
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
          if (sym.pay) {
            // ✅ 掛け倍率 × うさぎティア倍率
            payThis += sym.pay * mult * bunnyM;
          }
        }

        // 端数は切り捨て（コインは整数運用）
        payThis = Math.floor(payThis);

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

    // ✅ 払戻（ここが「稼いだ分」：ゲージに反映させたいのはココ）
    if (totalPay > 0) {
      const cur = getCoin();
      setCoin(cur + totalPay, "slot:pay");

      // ✅ 保険：prestige.js にも直接「稼いだ分」を通知（coinChanged未対応環境でもゲージが増える）
      addPrestigeEarned(totalPay);
    }

    const bestTier = getBestTierFromWins(lastWinLines, lastNames);
    drawPaylinesAlways(panel, lastWinLines, bestTier);

    if (totalLines > 0) {
      triggerWinFx(panel, lastWinLines, bestTier, totalPay, totalLines);
      onSlotWinSignal();

      const hold =
        bestTier >= 3 ? 5600 :
        bestTier >= 2 ? 4800 :
        bestTier >= 1 ? 4200 : 3600;

      showResult(
        panel,
        `🎉 当たり ${totalLines}ライン / +${totalPay}🪙（掛け${currentBet}×${mult}・うさぎ${bunnyTierName}×${bunnyM.toFixed(2)}）`,
        hold
      );
    } else {
      showResult(panel, `はずれ！（掛け${currentBet}）`, 2400);
    }

    syncHave(panel);
    updateBetUI(panel);
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

  /* =========================
   * 起動
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();

    const qFlushTimer = setInterval(() => {
      if (window.SYOUGOU?.add) {
        flushSyougouQueue();
        clearInterval(qFlushTimer);
      }
    }, 250);

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

    // ✅ うさぎ数/進化などでティアが変わるので、開いてる間はたまに更新
    setInterval(() => {
      if (panelRef && panelRef.style.display !== "none" && !spinning) {
        updateBetUI(panelRef);
      }
    }, 900);

    window.addEventListener("resize", () => {
      if (panelRef && panelRef.style.display !== "none") {
        requestAnimationFrame(() => requestAnimationFrame(() => refreshAllCells(panelRef)));
      }
    });
  });

  // 他から開閉できるように
  window.SLOT = window.SLOT || {};
  window.SLOT.open = openPanel;
  window.SLOT.close = closePanel;
})();
