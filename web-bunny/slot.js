(() => {
  /* =========================
     設定
  ========================= */
  const PANEL_ID = "slotStarMachinePanel3x3";
  const SLOT_COST = 50;

  const MACHINE_SRC = "/web-bunny/assets/slot_machine.png";
  const SLOT_SE_SRC = "/web-bunny/assets/slotse.mp3";

  const SYMBOLS = [
    { name: "coin2", src: "/web-bunny/assets/coin2.png", w: 30, pay: 100 },
    { name: "coin3", src: "/web-bunny/assets/coin3.png", w: 20, pay: 200 },
    { name: "coin4", src: "/web-bunny/assets/coin4.png", w: 10, pay: 500 },

    { name: "babybunny", src: "/web-bunny/assets/babybunny.png", w: 15, special: "BUNNY" },
    { name: "reabunny",  src: "/web-bunny/assets/reabunny.png",  w: 5,  special: "BUNNY" },

    { name: "ougon", src: "/web-bunny/assets/ougonunchi.png", w: 1, pay: 1500 },
  ];

  /* =========================
     ユーティリティ
  ========================= */
  const $ = (q, p = document) => p.querySelector(q);

  function playSlotSE() {
    const a = new Audio(SLOT_SE_SRC);
    a.volume = 0.8;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(v);
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

  /* =========================
     CSS
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
}

#${PANEL_ID} .machine{
  position: relative;
}

#${PANEL_ID} .machineImg{
  width: 600px;
  max-width: 90vw;
  display:block;
}

/* 操作UI（スロット画像の上） */
#${PANEL_ID} .controlBar{
  position:absolute;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  gap:10px;
  z-index:2147483647;
}

#${PANEL_ID} .controls{ top:6%; }
#${PANEL_ID} .results{ top:20%; }

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

#${PANEL_ID} .btn.primary{
  background:#ffd6e7;
}

/* 3×3 スロット窓 */
#${PANEL_ID} .grid{
  position:absolute;
  top:48%;
  left:50%;
  transform:translate(-50%,-50%);
  display:grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap:10px;
  width:300px;
  height:300px;
}

#${PANEL_ID} .cell{
  background:rgba(255,255,255,0.2);
  border-radius:10px;
  display:flex;
  align-items:center;
  justify-content:center;
}

#${PANEL_ID} .cell img{
  width:64px;
  height:64px;
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
        <img class="machineImg" src="${MACHINE_SRC}" />

        <div class="grid">
          ${Array.from({ length: 9 })
            .map(() => `<div class="cell"><img /></div>`)
            .join("")}
        </div>

        <div class="controlBar controls">
          <div class="chip">所持：<b class="have">0</b> 🪙</div>
          <button class="btn primary spin">回す（-${SLOT_COST}🪙）</button>
          <button class="btn spin10">10連</button>
        </div>

        <div class="controlBar results">
          <div class="chip result">回してみよう！</div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    $(".spin", panel).onclick = () => spin(panel, 1);
    $(".spin10", panel).onclick = () => spin(panel, 10);
  }

  /* =========================
     スロット処理
  ========================= */
  function spin(panel, count) {
    const have = getCoin();
    const cost = SLOT_COST * count;
    if (have < cost) return;

    setCoin(have - cost);
    $(".have", panel).textContent = getCoin();

    playSlotSE();

    let totalPay = 0;
    let winCount = 0;

    for (let t = 0; t < count; t++) {
      const cells = [...panel.querySelectorAll(".cell img")];
      const grid = [];

      for (let i = 0; i < 9; i++) {
        const s = pickSymbol();
        cells[i].src = s.src;
        grid.push(s);
      }

      const lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6],
      ];

      for (const line of lines) {
        const a = grid[line[0]];
        if (line.every(i => grid[i].name === a.name)) {
          winCount++;
          if (a.pay) totalPay += a.pay;
        }
      }
    }

    if (totalPay > 0) setCoin(getCoin() + totalPay);
    $(".have", panel).textContent = getCoin();
    $(".result", panel).textContent =
      winCount > 0
        ? `🎉 当たり ${winCount}ライン / +${totalPay}🪙`
        : "はずれ！";
  }

  /* =========================
     起動
  ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    buildPanel();
  });
})();
