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
    // ✅ WBがあるならそっちを優先（localStorageも一緒に動く）
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
   * 豪華演出（あなたのまま）
   * ========================= */
  let fxTimer = null;
  let auraTimer = null;
  let spotTimer = null;

  function clearWinHighlights(panel) {
    panel.querySelectorAll(".cell").forEach((c) => c.classList.remove("winCell", "winCellBig", "winCellMega"));
    const lines = $(".paylines", panel);
    if (lines) lines.innerHTML = "";
    const aura = $(".aura", panel);
    if (aura) aura.innerHTML = "";
    const spot = $(".spotlights", panel);
    if (spot) spot.innerHTML = "";
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
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

  function drawPaylines(panel, winLines, intensity = 1, mega = false) {
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
      svg.setAttribute("class", "lineSvg" + (mega ? " mega" : ""));
      svg.setAttribute("viewBox", `0 0 ${layer.clientWidth} ${layer.clientHeight}`);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("class", "paylinePath" + (mega ? " mega" : ""));
      path.style.strokeWidth = `${Math.max(5, 6 + intensity * (mega ? 3.0 : 1.8))}px`;
      path.style.animationDelay = `${idx * 90}ms`;

      svg.appendChild(path);
      layer.appendChild(svg);
    });
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

  function triggerWinFx(panel, winLines, totalPay, totalLines) {
    if (fxTimer) { clearTimeout(fxTimer); fxTimer = null; }
    if (auraTimer) { clearTimeout(auraTimer); auraTimer = null; }
    if (spotTimer) { clearTimeout(spotTimer); spotTimer = null; }

    const big = totalPay >= 1000 || totalLines >= 3;
    const mega = totalPay >= 1500 || totalLines >= 5;
    const intensity = Math.min(3.5, 1 + (big ? 1.6 : 0) + totalLines * 0.35);

    const machine = panel.querySelector(".machine") || panel;
    machine.classList.add("winFx");
    if (big) machine.classList.add("winBig"); else machine.classList.remove("winBig");
    if (mega) machine.classList.add("winMega"); else machine.classList.remove("winMega");

    panel.classList.add("flashOn");
    setTimeout(() => panel.classList.remove("flashOn"), 420);
    if (mega) {
      setTimeout(() => { panel.classList.add("flashOn"); setTimeout(() => panel.classList.remove("flashOn"), 420); }, 520);
    }

    vibrate(mega ? [90, 70, 130, 70, 170] : (big ? [80, 60, 120] : [50, 40, 60]));
    if (mega) coinBurst(30, 48, 0.9);
    else coinBurst(big ? 22 : 14, big ? 55 : 65, 0.85);

    spawnConfetti(panel, mega ? 70 : (big ? 48 : 30), mega);
    spawnAura(panel, mega);
    spawnSpotlights(panel, mega);

    const cells = Array.from(panel.querySelectorAll(".cell"));
    winLines.flat().forEach((i) => {
      const c = cells[i];
      if (!c) return;
      c.classList.add("winCell");
      if (big) c.classList.add("winCellBig");
      if (mega) c.classList.add("winCellMega");
    });

    drawPaylines(panel, winLines, intensity, mega);

    const dur = mega ? 3200 : (big ? 2400 : 1700);
    fxTimer = setTimeout(() => {
      machine.classList.remove("winFx", "winBig", "winMega");
      clearWinHighlights(panel);
    }, dur);
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
   * CSS
   * ========================= */
  function injectStyles() {
    if (document.getElementById("slotStyleFullFxV4")) return;
    const s = document.createElement("style");
    s.id = "slotStyleFullFxV4";
    s.textContent = `/* ここはあなたのCSSそのまま */\n` + ("" );
    // ✅ あなたのCSSは長いので、元の injectStyles の s.textContent を丸ごと入れてOK
    // 今回は “buildPanel修正” が本題なので省略せずに使うなら、あなたのCSS本文をここに貼ってください。
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

  // ✅ ここが修正点：既存divがあっても中身を生成＆bodyへ移動
  function buildPanel() {
    let p = document.getElementById(PANEL_ID);

    if (!p) {
      p = document.createElement("div");
      p.id = PANEL_ID;
      document.body.appendChild(p);
    } else {
      // 既にindex.html内に置かれていたら、確実にbody直下へ移動
      if (p.parentElement !== document.body) document.body.appendChild(p);
    }

    panelRef = p;

    // 既に構築済みなら終了
    if (p.querySelector(".machine")) return p;

    // まだ空なら中身を作る
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

      if (w.length > 0 && count > 1) {
        triggerWinFx(panel, w, payThis, w.length);
      }
    }

    panel.classList.remove("spinning");
    stopReelLoop();

    if (totalPay > 0) {
      setCoin(getCoin() + totalPay);
      if (lastWinLines.length > 0) triggerWinFx(panel, lastWinLines, totalPay, totalLines);
      else triggerWinFx(panel, [], totalPay, totalLines);
    }

    if (totalLines > 0) {
      showResult(panel, `🎉 当たり ${totalLines}ライン / +${totalPay}🪙`,
        totalPay >= 1500 ? 5200 : (totalPay >= 1000 ? 4600 : 3600)
      );
    } else {
      showResult(panel, "はずれ！", 2400);
    }

    syncHave(panel);
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
    // ✅ あなたのinjectStyles全文をここで使う（省略してるなら、元コードのCSSをコピペしてください）
   window.addEventListener("load", () => {
  injectStyles();   // ← これを必ず有効化
  buildPanel();
  ...
});

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
