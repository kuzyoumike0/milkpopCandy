(() => {
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  const MACHINE_SRC = "/web-bunny/assets/slot_machine.png";

  // 音
  const START_SE = "/web-bunny/assets/slotse.mp3";   // 回し始め（1回）
  const REEL_SE  = "/web-bunny/assets/reelse.mp3";   // 回転中（ループ）※任意
  const STOP_SE  = "/web-bunny/assets/stop.mp3";     // 停止「カチッ」※必須推奨

  const SYMBOLS = [
    { name: "coin2", src: "/web-bunny/assets/coin2.png", w: 30, pay: 100 },
    { name: "coin3", src: "/web-bunny/assets/coin3.png", w: 20, pay: 200 },
    { name: "coin4", src: "/web-bunny/assets/coin4.png", w: 10, pay: 500 },

    { name: "babybunny", src: "/web-bunny/assets/babybunny.png", w: 15 },
    { name: "reabunny",  src: "/web-bunny/assets/reabunny.png",  w: 5  },

    { name: "ougon", src: "/web-bunny/assets/ougonunchi.png", w: 1, pay: 1500 },
  ];

  // 演出パラメータ
  const SPIN = {
    loops: 22,
    colDelay: 220,     // 列ごと停止遅延
    baseDuration: 980, // 回転時間ベース
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* ========= Audio ========= */
  function oneShot(src, vol = 0.9) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (_) {}
  }

  // ループ再生（無ければ黙る）
  let reelLoop = null;
  function startReelLoop() {
    try {
      reelLoop = new Audio(REEL_SE);
      reelLoop.loop = true;
      reelLoop.volume = 0.55;
      reelLoop.currentTime = 0;
      reelLoop.play().catch(() => {});
    } catch (_) {
      reelLoop = null;
    }
  }
  function stopReelLoop() {
    try {
      if (!reelLoop) return;
      reelLoop.pause();
      reelLoop.currentTime = 0;
    } catch (_) {}
    reelLoop = null;
  }

  /* ========= Coin ========= */
  function getCoin() {
    const el = $("#coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
  }

  /* ========= Random ========= */
  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      r -= s.w;
      if (r <= 0) return s;
    }
    return SYMBOLS[0];
  }

  /* ========= CSS ========= */
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
#${PANEL_ID}{
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
  z-index: 2147483647;
  user-select:none;
  isolation:isolate;
}

#${PANEL_ID} .machine{
  position: relative;
}

#${PANEL_ID} .machineImg{
  width: 600px;
  max-width: 92vw;
  display:block;
}

/* 操作UI（筐体の上） */
#${PANEL_ID} .controlBar{
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  gap:10px;
  z-index:2147483647;
  flex-wrap:wrap;
  pointer-events:auto;
}
#${PANEL_ID} .controls{ top: 3%; }
#${PANEL_ID} .results{ top: 15%; }

#${PANEL_ID} .chip{
  background: rgba(255,255,255,0.95);
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
  box-shadow: 0 18px 40px rgba(0,0,0,0.18);
}
#${PANEL_ID} .btn{
  padding:10px 14px;
  border-radius:14px;
  font-weight:900;
  border:none;
  cursor:pointer;
  background:#fff;
  box-shadow: 0 18px 40px rgba(0,0,0,0.18);
}
#${PANEL_ID} .btn.primary{ background:#ffd6e7; }
#${PANEL_ID} .btn:disabled{ opacity:0.6; cursor:not-allowed; }

/* 3×3表示窓（位置合わせ済み） */
#${PANEL_ID} .grid{
  position:absolute;
  left:50%;
  top:52.5%;
  transform:translate(-50%,-50%);
  width:72%;
  height:46%;

  display:grid;
  grid-template-columns:repeat(3, 1fr);
  grid-template-rows:repeat(3, 1fr);
  gap:4.5%;
}

/* 1マス */
#${PANEL_ID} .cell{
  position:relative;
  overflow:hidden;
  border-radius:12px;
  background: rgba(255,255,255,0.10);
  display:flex;
  align-items:center;
  justify-content:center;
}

/* ストリップ */
#${PANEL_ID} .strip{
  position:absolute;
  left:0; right:0; top:0;
  transform: translateY(0px);
  will-change: transform, filter, opacity;
}

/* モーションブラー風（回転中） */
#${PANEL_ID}.spinning .strip{
  filter: blur(2.2px);
  opacity: 0.65;
}

/* ストリップ内コマ */
#${PANEL_ID} .stripCell{
  display:flex;
  align-items:center;
  justify-content:center;
}

/* 絵柄 */
#${PANEL_ID} img.sym{
  width:78%;
  height:78%;
  object-fit:contain;
  filter: drop-shadow(0 8px 10px rgba(0,0,0,0.18));
  -webkit-user-drag:none;
}

/* 当たりライン */
#${PANEL_ID} .win{
  box-shadow: 0 0 18px rgba(255, 196, 0, 0.65), inset 0 0 0 2px rgba(255,255,255,0.2);
}

/* フラッシュ（当たり時） */
#${PANEL_ID} .flash{
  position:absolute;
  inset:0;
  background: rgba(255,255,255,0.65);
  opacity:0;
  pointer-events:none;
  z-index: 2147483646;
}
#${PANEL_ID}.flashOn .flash{
  animation: flashAnim 380ms ease-out 1;
}
@keyframes flashAnim{
  0%{ opacity:0; }
  25%{ opacity:1; }
  100%{ opacity:0; }
}

/* 振動（当たり時） */
#${PANEL_ID}.shake{
  animation: shakeAnim 360ms ease-in-out 1;
}
@keyframes shakeAnim{
  0%{ transform:translate(-50%,-50%); }
  12%{ transform:translate(calc(-50% - 6px), calc(-50% - 2px)); }
  24%{ transform:translate(calc(-50% + 6px), calc(-50% + 2px)); }
  36%{ transform:translate(calc(-50% - 5px), calc(-50% + 3px)); }
  48%{ transform:translate(calc(-50% + 5px), calc(-50% - 3px)); }
  60%{ transform:translate(calc(-50% - 3px), calc(-50% - 2px)); }
  72%{ transform:translate(calc(-50% + 3px), calc(-50% + 2px)); }
  100%{ transform:translate(-50%,-50%); }
}

/* 星ランプ点滅（当たり時に筐体全体を暖色でチカチカ） */
#${PANEL_ID}.lamp .machineImg{
  animation: lampAnim 520ms linear 3;
}
@keyframes lampAnim{
  0%{ filter:none; }
  25%{ filter: brightness(1.18) saturate(1.25); }
  50%{ filter:none; }
  75%{ filter: brightness(1.18) saturate(1.25); }
  100%{ filter:none; }
}
    `;
    document.head.appendChild(style);
  }

  /* ========= DOM ========= */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="machine">
        <img class="machineImg" src="${MACHINE_SRC}" alt="slot" />
        <div class="flash"></div>

        <div class="grid">
          ${Array.from({ length: 9 }).map((_, i) => `
            <div class="cell" data-i="${i}">
              <div class="strip"></div>
            </div>
          `).join("")}
        </div>

        <div class="controlBar controls">
          <div class="chip">所持：<b class="have">0</b> 🪙</div>
          <button class="btn primary spin">回す（-${SLOT_COST}🪙）</button>
          <button class="btn spin10">10連</button>
        </div>

        <div class="controlBar results">
          <div class="chip result">縦・横・斜めで揃えば当たり！</div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    $(".spin", panel).addEventListener("click", () => spin(panel, 1));
    $(".spin10", panel).addEventListener("click", () => spin(panel, 10));

    // 初期表示
    const cells = [...panel.querySelectorAll(".cell")];
    for (const cell of cells) {
      const strip = cell.querySelector(".strip");
      setStrip(strip, [pickSymbol()], cell);
    }

    return panel;
  }

  function syncHave(panel) {
    $(".have", panel).textContent = String(getCoin());
  }

  /* ========= Strip ========= */
  function cellH(cell) {
    return Math.max(40, Math.floor(cell.getBoundingClientRect().height));
  }

  function setStrip(strip, seq, cell) {
    const h = cellH(cell);
    strip.innerHTML = "";
    for (const sym of seq) {
      const d = document.createElement("div");
      d.className = "stripCell";
      d.style.height = `${h}px`;

      const img = document.createElement("img");
      img.className = "sym";
      img.src = sym.src;
      img.alt = sym.name;

      d.appendChild(img);
      strip.appendChild(d);
    }
  }

  function forceReflow(el) { void el.offsetHeight; }

  // 1セル回転
  function spinCell(cell, finalSym, delayMs) {
    const strip = cell.querySelector(".strip");
    const h = cellH(cell);

    const seq = [];
    for (let i = 0; i < SPIN.loops; i++) seq.push(pickSymbol());
    seq.push(finalSym);

    setStrip(strip, seq, cell);

    strip.style.transition = "none";
    strip.style.transform = "translateY(0px)";
    forceReflow(strip);

    const duration = SPIN.baseDuration + delayMs;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.86, 0.12, 1)`;

    const toY = -h * (seq.length - 1);
    strip.style.transform = `translateY(${toY}px)`;

    return new Promise((resolve) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

        // 最終だけ残す
        strip.style.transition = "none";
        setStrip(strip, [finalSym], cell);
        strip.style.transform = "translateY(0px)";

        resolve(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  /* ========= 判定 ========= */
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  function winningLines(names) {
    const wins = [];
    for (const line of LINES) {
      const a = names[line[0]];
      if (a && line.every(i => names[i] === a)) wins.push(line);
    }
    return wins;
  }

  function clearWin(panel) {
    [...panel.querySelectorAll(".cell")].forEach(c => c.classList.remove("win"));
  }
  function highlight(panel, lines) {
    for (const line of lines) {
      for (const idx of line) {
        panel.querySelector(`.cell[data-i="${idx}"]`)?.classList.add("win");
      }
    }
  }

  /* ========= 当たり演出 ========= */
  function winEffects(panel) {
    // フラッシュ
    panel.classList.remove("flashOn");
    void panel.offsetHeight;
    panel.classList.add("flashOn");

    // シェイク
    panel.classList.remove("shake");
    void panel.offsetHeight;
    panel.classList.add("shake");

    // 星ランプ点滅
    panel.classList.remove("lamp");
    void panel.offsetHeight;
    panel.classList.add("lamp");

    // 終了後にクラス掃除
    setTimeout(() => panel.classList.remove("flashOn"), 450);
    setTimeout(() => panel.classList.remove("shake"), 450);
    setTimeout(() => panel.classList.remove("lamp"), 1700);
  }

  /* ========= スピン ========= */
  let isSpinning = false;

  async function spin(panel, count) {
    if (isSpinning) return;

    const spinBtn = $(".spin", panel);
    const spin10Btn = $(".spin10", panel);
    const resultEl = $(".result", panel);

    const have = getCoin();
    const cost = SLOT_COST * count;
    if (have < cost) {
      resultEl.textContent = "コインが足りない…！";
      return;
    }

    // 支払い
    setCoin(have - cost);
    syncHave(panel);

    // 開始音＆回転ループ音
    oneShot(START_SE, 0.9);
    startReelLoop();

    isSpinning = true;
    spinBtn.disabled = true;
    spin10Btn.disabled = true;

    panel.classList.add("spinning"); // モーションブラー開始

    let totalLines = 0;
    let totalPay = 0;

    for (let t = 0; t < count; t++) {
      clearWin(panel);
      resultEl.textContent = count > 1 ? `10連中… ${t + 1}/10` : "回転中…";

      const cells = [...panel.querySelectorAll(".cell")];
      const finals = Array.from({ length: 9 }, () => pickSymbol());

      // 列停止の「カチッ×3」：列ごとに鳴らす
      // 左→中→右 の停止タイミング
      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 0 * SPIN.colDelay);
      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 1 * SPIN.colDelay);
      setTimeout(() => oneShot(STOP_SE, 0.9), SPIN.baseDuration + 2 * SPIN.colDelay);

      const promises = finals.map((sym, i) => {
        const col = i % 3;
        const delay = col * SPIN.colDelay;
        return spinCell(cells[i], sym, delay);
      });

      const results = await Promise.all(promises);

      const names = results.map(s => s.name);
      const wins = winningLines(names);

      totalLines += wins.length;

      if (wins.length > 0) {
        highlight(panel, wins);
        for (const line of wins) {
          const sym = results[line[0]];
          if (sym.pay) totalPay += sym.pay;
        }
      }

      // 1回ごとの軽い間
      if (count > 1) await new Promise(r => setTimeout(r, 120));
    }

    // 回転終了
    panel.classList.remove("spinning");
    stopReelLoop();

    if (totalPay > 0) setCoin(getCoin() + totalPay);
    syncHave(panel);

    if (totalLines > 0) {
      resultEl.textContent = `🎉 当たり ${totalLines}ライン / +${totalPay} 🪙`;
      winEffects(panel);
    } else {
      resultEl.textContent = "はずれ！";
    }

    spinBtn.disabled = false;
    spin10Btn.disabled = false;
    isSpinning = false;
  }

  /* ========= 起動 ========= */
  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();

    const panel = document.getElementById(PANEL_ID);
    syncHave(panel);

    // coinValue変化に追従
    const cv = $("#coinValue");
    if (cv) {
      const mo = new MutationObserver(() => syncHave(panel));
      mo.observe(cv, { childList: true, subtree: true, characterData: true });
    }

    // 最前面保険
    setInterval(() => {
      const p = document.getElementById(PANEL_ID);
      if (p) p.style.zIndex = "2147483647";
    }, 1000);
  });
})();
