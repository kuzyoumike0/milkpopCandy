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
    el.classList.remove("fadeOut", "popNum");
    el.textContent = text;

    const coins = parseCoins(text);
    if (coins !== null && coins > 0) {
      requestAnimationFrame(() => el.classList.add("popNum"));
    }

    const fadeMs = 650;
    const fadeStart = Math.max(0, holdMs - fadeMs);
    resultTimer = setTimeout(() => {
      el.classList.add("fadeOut");
      setTimeout(() => (resultLock = false), fadeMs + 50);
    }, fadeStart);
  }

  /* ===== CSS ===== */
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
#${PANEL_ID}{
  --winTop: 38%;
  --winH: 34%;

  /* ▼▼▼ 下パネル比で自動計算するための変数 ▼▼▼
     下パネルは「筐体画像の高さに対して何%か」という比率で扱う。
     - panelTop: 下パネル上端の位置（筐体画像の上からの割合）
     - panelH  : 下パネルの高さ（筐体画像の高さに対する割合）
     この2つを決めれば、UI位置は比率で自動配置できる。
  */
  --panelTop: 68%;     /* ★下パネル開始位置（要調整ポイント） */
  --panelH:   48%;     /* ★下パネル高さ（要調整ポイント） */

  /* UIは「下パネル内でのY比率」で置く（0=上端, 1=下端） */
  --resY: 0.55;        /* 結果：下パネルの上から35%の位置 */
  --uiY:  0.78;        /* ボタン：下パネルの上から78%の位置 */

  position:fixed;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  user-select:none;
  isolation:isolate;
}

#${PANEL_ID} .machine{ position:relative; }
#${PANEL_ID} .machineImg{ width:600px; max-width:92vw; display:block; }

/* ===== UIバー（位置は "top" で計算して安定させる） ===== */
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

/* ▼ 計算式：
   top = panelTop + panelH * (resY or uiY)
*/
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
  will-change: transform, opacity;
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
@keyframes popNum{
  0%{ transform: translateY(0) scale(1); }
  35%{ transform: translateY(-6px) scale(1.12); }
  100%{ transform: translateY(0) scale(1); }
}

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
  filter: drop-shadow(0 8px 10px rgba(0,0,0,0.18));
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
  z-index: 2147483646;
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
  <img class="machineImg" src="${MACHINE_SRC}" alt="slot">
  <div class="flash"></div>

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
    <button class="btn primary spin">回す（-${SLOT_COST}）</button>
    <button class="btn spin10">10連</button>
  </div>
</div>`;
    document.body.appendChild(p);

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
      totalLines += w.length;

      for (const line of w) {
        const sym = res[line[0]];
        if (sym.pay) totalPay += sym.pay;
      }
    }

    panel.classList.remove("spinning");
    stopReelLoop();

    if (totalPay > 0) {
      setCoin(getCoin() + totalPay);
      panel.classList.add("flashOn");
      coinBurst(12, 70);
      setTimeout(() => panel.classList.remove("flashOn"), 400);
    }

    if (totalLines > 0) {
      showResult(panel, `🎉 当たり ${totalLines}ライン / +${totalPay}🪙`, 3600);
    } else {
      showResult(panel, "はずれ！", 2400);
    }

    syncHave(panel);
    spinning = false;
  }

  /* ===== 起動 ===== */
  window.addEventListener("load", () => {
    injectStyles();
    const panel = buildPanel();
    if (panel) {
      syncHave(panel);

      const cv = $("#coinValue");
      if (cv) {
        const mo = new MutationObserver(() => syncHave(panel));
        mo.observe(cv, { childList: true, subtree: true, characterData: true });
      }
    }
  });
})();
