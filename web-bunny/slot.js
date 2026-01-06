(() => {
  /* =========================
     設定
  ========================= */
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  const MACHINE_SRC = "/web-bunny/assets/slot_machine.png";
  const SLOT_SE_SRC = "/web-bunny/assets/slotse.mp3";

  // 画像（必要に応じて追加OK）
  const SYMBOLS = [
    { name: "coin2", src: "/web-bunny/assets/coin2.png", w: 30, pay: 100 },
    { name: "coin3", src: "/web-bunny/assets/coin3.png", w: 20, pay: 200 },
    { name: "coin4", src: "/web-bunny/assets/coin4.png", w: 10, pay: 500 },

    { name: "babybunny", src: "/web-bunny/assets/babybunny.png", w: 15, special: "BUNNY" },
    { name: "reabunny",  src: "/web-bunny/assets/reabunny.png",  w: 5,  special: "BUNNY" },

    { name: "ougon", src: "/web-bunny/assets/ougonunchi.png", w: 1, pay: 1500 },
  ];

  // 回転の見た目（長くすると本格感UP）
  const SPIN = {
    // 1列あたりの「疑似回転コマ数」
    loops: 18,
    // 列ごとの停止遅延（ms）
    colDelay: 180,
    // 回転の基本時間（ms）
    baseDuration: 900,
  };

  /* =========================
     ユーティリティ
  ========================= */
  const $ = (q, p = document) => p.querySelector(q);

  function preload() {
    const list = [MACHINE_SRC, SLOT_SE_SRC, ...SYMBOLS.map(s => s.src)];
    for (const src of list) {
      if (src.endsWith(".mp3")) continue;
      const img = new Image();
      img.src = src;
    }
  }

  function playSlotSE() {
    try {
      const a = new Audio(SLOT_SE_SRC);
      a.volume = 0.8;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (_) {}
  }

  function getCoin() {
    const el = $("#coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
  }

  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const s of SYMBOLS) {
      r -= s.w;
      if (r <= 0) return s;
    }
    return SYMBOLS[0];
  }

  function byName(name) {
    return SYMBOLS.find(s => s.name === name) || SYMBOLS[0];
  }

  /* =========================
     CSS（本格回転：各セルに縦ストリップを入れる）
  ========================= */
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

/* ===== 3×3の表示窓（スクショに合わせた％配置） ===== */
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

/* 1マス＝「窓」 */
#${PANEL_ID} .cell{
  position:relative;
  overflow:hidden;
  border-radius:12px;
  background: rgba(255,255,255,0.10);
  display:flex;
  align-items:center;
  justify-content:center;
}

/* 本格回転：縦ストリップ */
#${PANEL_ID} .strip{
  position:absolute;
  left:0; right:0; top:0;
  transform: translateY(0px);
  will-change: transform;
}

/* ストリップ内のコマ（高さはJSで合わせる） */
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

/* 当たり強調 */
#${PANEL_ID} .win{
  box-shadow: 0 0 18px rgba(255, 196, 0, 0.65), inset 0 0 0 2px rgba(255,255,255,0.2);
}
    `;
    document.head.appendChild(style);
  }

  /* =========================
     DOM生成
  ========================= */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="machine">
        <img class="machineImg" src="${MACHINE_SRC}" alt="slot" />

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

    // 初期表示（各マスに1枚）
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

  /* =========================
     本格回転：ストリップ生成＆アニメ
  ========================= */
  function cellHeight(cell) {
    return cell.getBoundingClientRect().height;
  }

  function setStrip(strip, seq, cell) {
    const h = Math.max(40, Math.floor(cellHeight(cell))); // 安全
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

  function spinCell(cell, finalSym, delayMs) {
    const strip = cell.querySelector(".strip");
    const h = Math.max(40, Math.floor(cellHeight(cell)));

    // シーケンス（適当にたくさん積んで最後にfinal）
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

        // 最終だけ残して軽量化
        strip.style.transition = "none";
        setStrip(strip, [finalSym], cell);
        strip.style.transform = "translateY(0px)";

        resolve(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  /* =========================
     判定：縦横斜め（8ライン）
  ========================= */
  function getWinningLines(names) {
    // names: length 9, row-major
    const lines = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6],
    ];
    const wins = [];
    for (const line of lines) {
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

  /* =========================
     スピン（単発/10連）
  ========================= */
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

    playSlotSE();

    isSpinning = true;
    spinBtn.disabled = true;
    spin10Btn.disabled = true;

    let totalLines = 0;
    let totalPay = 0;

    for (let t = 0; t < count; t++) {
      clearWin(panel);
      resultEl.textContent = count > 1 ? `10連中… ${t+1}/10` : "回転中…";

      const cells = [...panel.querySelectorAll(".cell")];

      // 9マスの最終絵柄
      const finals = Array.from({ length: 9 }, () => pickSymbol());

      // “列ごとに止まる” 感を出す：列ごとに遅延を変える
      const promises = finals.map((sym, i) => {
        const col = i % 3; // 0,1,2
        const delay = col * SPIN.colDelay;
        return spinCell(cells[i], sym, delay);
      });

      const results = await Promise.all(promises);

      // 判定
      const names = results.map(s => s.name);
      const winLines = getWinningLines(names);

      totalLines += winLines.length;

      if (winLines.length > 0) {
        highlight(panel, winLines);

        // ラインごとに支払い（同じ絵柄ラインはその分加算）
        for (const line of winLines) {
          const sym = results[line[0]];
          if (sym.pay) totalPay += sym.pay;
        }
      }
    }

    if (totalPay > 0) setCoin(getCoin() + totalPay);
    syncHave(panel);

    resultEl.textContent =
      totalLines > 0
        ? `🎉 当たり ${totalLines}ライン / +${totalPay} 🪙`
        : "はずれ！";

    spinBtn.disabled = false;
    spin10Btn.disabled = false;
    isSpinning = false;
  }

  /* =========================
     起動
  ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    preload();
    const panel = buildPanel();
    syncHave(panel);

    // coinValueが変化しても追従
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
