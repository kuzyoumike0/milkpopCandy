(() => {
  const SLOT_COST = 50;

  // ★筐体画像
  const MACHINE_SRC = "./web-bunny/assets/slot_machine.png";

  // ★あなたの画像だけを絵柄に使用
  const SYMBOLS = [
    { name: "coin2", src: "./web-bunny/assets/coin2.png", w: 28, pay: 120 },
    { name: "coin3", src: "./web-bunny/assets/coin3.png", w: 18, pay: 200 },
    { name: "coin4", src: "./web-bunny/assets/coin4.png", w: 8,  pay: 500 },

    { name: "babybunny", src: "./web-bunny/assets/babybunny.png", w: 20, pay: 0, special: "BUNNY" },
    { name: "bunny1",    src: "./web-bunny/assets/bunny1.png",    w: 14, pay: 0, special: "BUNNY" },
    { name: "bunny3",    src: "./web-bunny/assets/bunny3.png",    w: 12, pay: 0, special: "BUNNY" },
    { name: "bunny4",    src: "./web-bunny/assets/bunny4.png",    w: 10, pay: 0, special: "BUNNY" },
    { name: "bunny5",    src: "./web-bunny/assets/bunny5.png",    w: 8,  pay: 0, special: "BUNNY" },

    { name: "reabunny",  src: "./web-bunny/assets/reabunny.png",  w: 4,  pay: 300, special: "BUNNY_PLUS" },

    { name: "ougon",     src: "./web-bunny/assets/ougonunchi.png", w: 1,  pay: 1500 },
  ];

  // ===== coin（表示値ベース）=====
  const coinValueEl = () => document.getElementById("coinValue");
  const getCoins = () => {
    const el = coinValueEl();
    if (!el) return 0;
    const n = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const setCoins = (v) => {
    const el = coinValueEl();
    if (!el) return;
    el.textContent = String(Math.max(0, Math.floor(v)));
  };
  const addCoins = (d) => setCoins(getCoins() + d);

  // うさぎ当たり：既存 shopBtn 流用（app.jsは触らない）
  const tryAddBunnyByShopClick = () => {
    const shopBtn = document.getElementById("shopBtn");
    if (!shopBtn) return false;
    shopBtn.click();
    return true;
  };

  // ===== UI =====
  const PANEL_ID = "slotStarMachinePanel";
  const CELL_H = 78; // 窓の高さに合わせたセル高さ（後で微調整OK）

  // ★ リール窓の位置（筐体画像に合わせる：%指定でレスポンシブ）
  // もしズレたらこの3つをちょい調整するだけでピッタリ合います。
  const WINDOW = {
    top: 42.5,        // 窓の上位置（%）
    w: 12.0,          // 窓幅（%）
    h: 12.5,          // 窓高さ（%）
    gap: 3.2,         // 窓同士の隙間（%）
    centerX: 50.0,    // 3窓全体の中心（%）
  };

  function injectStyles() {
    const css = `
      #${PANEL_ID}{
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);

        /* ★常に最前面 */
        z-index: 2147483647;
        isolation: isolate;

        width: min(720px, calc(100% - 16px));
        user-select: none;
      }

      /* 筐体 */
      #${PANEL_ID} .machine{
        position: relative;
        width: 100%;
      }
      #${PANEL_ID} .machineImg{
        width: 100%;
        height: auto;
        display:block;
        filter: drop-shadow(0 26px 70px rgba(0,0,0,0.45));
        -webkit-user-drag: none;
      }

      /* リール窓レイヤー（筐体の上） */
      #${PANEL_ID} .windows{
        position:absolute;
        inset:0;
        pointer-events:none; /* 窓はクリックしない（下のボタンだけ触れる） */
      }

      #${PANEL_ID} .reelWindow{
        position:absolute;
        top: ${WINDOW.top}%;
        width: ${WINDOW.w}%;
        height: ${WINDOW.h}%;
        border-radius: 10px;
        overflow:hidden;

        /* ほんのりガラス感 */
        background: rgba(255,255,255,0.14);
        box-shadow: inset 0 0 0 2px rgba(255,255,255,0.25);
      }

      #${PANEL_ID} .reelStrip{
        position:absolute; left:0; top:0; right:0;
        transform: translateY(0px);
        will-change: transform;
      }

      #${PANEL_ID} .cell{
        height: ${CELL_H}px;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      #${PANEL_ID} img.sym{
        width: 64px;
        height: 64px;
        object-fit: contain;
        filter: drop-shadow(0 10px 12px rgba(0,0,0,0.22));
        -webkit-user-drag:none;
      }

      /* コントロール（筐体の下に固定） */
      #${PANEL_ID} .controlBar{
        margin-top: 10px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap: 10px;
      }
      #${PANEL_ID} .chip{
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(0,0,0,0.10);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
        font-weight: 900;
        box-shadow: 0 18px 40px rgba(0,0,0,0.18);
      }
      #${PANEL_ID} .result{
        min-width: min(520px, 92vw);
        text-align:center;
        font-weight: 900;
      }
      #${PANEL_ID} .btn{
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(255,255,255,0.95);
        font-weight: 1000;
        cursor:pointer;
        box-shadow: 0 18px 40px rgba(0,0,0,0.18);
      }
      #${PANEL_ID} .btn.primary{
        background: rgba(255, 214, 231, 0.88);
      }
      #${PANEL_ID} .btn:disabled{
        opacity: 0.55;
        cursor: not-allowed;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function preload() {
    const imgs = [MACHINE_SRC, ...SYMBOLS.map(s => s.src)];
    for (const src of imgs) {
      const i = new Image();
      i.src = src;
    }
  }

  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const it of SYMBOLS) {
      r -= it.w;
      if (r <= 0) return it;
    }
    return SYMBOLS[0];
  }

  function setStripContent(strip, sequence) {
    strip.innerHTML = "";
    for (const sym of sequence) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const img = document.createElement("img");
      img.className = "sym";
      img.src = sym.src;
      img.alt = sym.name;
      cell.appendChild(img);
      strip.appendChild(cell);
    }
  }

  function forceReflow(el) { void el.offsetHeight; }

  function spinReel(strip, finalSym, reelIndex) {
    const spins = 16 + reelIndex * 6;
    const seq = [];
    for (let i = 0; i < spins; i++) seq.push(pickSymbol());
    seq.push(finalSym);

    setStripContent(strip, seq);

    strip.style.transition = "none";
    strip.style.transform = `translateY(0px)`;
    forceReflow(strip);

    const duration = 1100 + reelIndex * 260;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.86, 0.12, 1)`;
    const toY = -CELL_H * (seq.length - 1);
    strip.style.transform = `translateY(${toY}px)`;

    return new Promise((resolve) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

        // 最終だけ残して軽くする
        strip.style.transition = "none";
        setStripContent(strip, [finalSym]);
        strip.style.transform = `translateY(0px)`;
        resolve(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  function isTriple(a, b, c) {
    return a.name === b.name && b.name === c.name;
  }

  function payoutFrom(sym) {
    if (sym.pay && sym.pay > 0) addCoins(sym.pay);

    if (sym.special === "BUNNY" || sym.special === "BUNNY_PLUS") {
      const ok = tryAddBunnyByShopClick();
      if (sym.special === "BUNNY_PLUS") {
        return `レア当たり！ 🪙 +${sym.pay} ＋ うさぎ増（${ok ? "OK" : "shopBtn無し"}）`;
      }
      return `うさぎ当たり！ うさぎ増（${ok ? "OK" : "shopBtn無し"}）`;
    }

    if (sym.name === "ougon") return `黄金！ 🪙 +${sym.pay}`;
    return `当たり！ 🪙 +${sym.pay}`;
  }

  function syncHave(panel) {
    const haveEl = panel.querySelector(".have");
    if (haveEl) haveEl.textContent = String(getCoins());
  }

  function buildPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <div class="machine">
        <img class="machineImg" src="${MACHINE_SRC}" alt="slot machine" />
        <div class="windows">
          <div class="reelWindow" data-i="0"><div class="reelStrip"></div></div>
          <div class="reelWindow" data-i="1"><div class="reelStrip"></div></div>
          <div class="reelWindow" data-i="2"><div class="reelStrip"></div></div>
        </div>
      </div>

      <div class="controlBar">
        <div class="chip">所持：<b class="have">0</b> 🪙</div>
        <button class="btn primary spin">回す（-${SLOT_COST}🪙）</button>
        <button class="btn spin10">10連</button>
      </div>
      <div class="controlBar">
        <div class="chip result">回してみよう！</div>
      </div>
    `;

    document.body.appendChild(panel);

    // 窓の位置を計算（3つを中央寄せ配置）
    const windows = [...panel.querySelectorAll(".reelWindow")];
    const totalW = WINDOW.w * 3 + WINDOW.gap * 2;
    const left0 = WINDOW.centerX - totalW / 2;

    windows.forEach((w, idx) => {
      const left = left0 + idx * (WINDOW.w + WINDOW.gap);
      w.style.left = `${left}%`;
    });

    // 初期絵柄
    windows.forEach((w) => {
      const strip = w.querySelector(".reelStrip");
      setStripContent(strip, [pickSymbol()]);
    });

    return panel;
  }

  async function spinOnce(panel) {
    const resultEl = panel.querySelector(".result");
    const spinBtn = panel.querySelector(".spin");
    const spin10Btn = panel.querySelector(".spin10");
    const windows = [...panel.querySelectorAll(".reelWindow")];
    const strips = windows.map(w => w.querySelector(".reelStrip"));

    const have = getCoins();
    if (have < SLOT_COST) {
      resultEl.textContent = "コインが足りない…！";
      return;
    }

    setCoins(have - SLOT_COST);
    syncHave(panel);

    spinBtn.disabled = true;
    spin10Btn.disabled = true;
    resultEl.textContent = "回転中…";

    const f0 = pickSymbol();
    const f1 = pickSymbol();
    const f2 = pickSymbol();

    const [a, b, c] = await Promise.all([
      spinReel(strips[0], f0, 0),
      spinReel(strips[1], f1, 1),
      spinReel(strips[2], f2, 2),
    ]);

    if (isTriple(a, b, c)) {
      resultEl.textContent = `🎉 ${a.name} ×3！ ${payoutFrom(a)}`;
    } else {
      resultEl.textContent = "はずれ！";
    }

    syncHave(panel);
    spinBtn.disabled = false;
    spin10Btn.disabled = false;
  }

  async function spinTen(panel) {
    const resultEl = panel.querySelector(".result");
    const spinBtn = panel.querySelector(".spin");
    const spin10Btn = panel.querySelector(".spin10");
    const totalCost = SLOT_COST * 10;

    const have = getCoins();
    if (have < totalCost) {
      resultEl.textContent = `10連するにはコインが足りない…（必要：${totalCost}🪙）`;
      return;
    }

    setCoins(have - totalCost);
    syncHave(panel);

    spinBtn.disabled = true;
    spin10Btn.disabled = true;

    let winCoins = 0;
    let winBunny = 0;
    let winCount = 0;

    for (let i = 0; i < 10; i++) {
      resultEl.textContent = `10連中… ${i + 1}/10`;

      const windows = [...panel.querySelectorAll(".reelWindow")];
      const strips = windows.map(w => w.querySelector(".reelStrip"));

      const f0 = pickSymbol();
      const f1 = pickSymbol();
      const f2 = pickSymbol();

      await Promise.all([
        spinReel(strips[0], f0, 0),
        spinReel(strips[1], f1, 1),
        spinReel(strips[2], f2, 2),
      ]);

      if (isTriple(f0, f1, f2)) {
        winCount++;
        if (f0.pay && f0.pay > 0) { addCoins(f0.pay); winCoins += f0.pay; }
        if (f0.special === "BUNNY" || f0.special === "BUNNY_PLUS") {
          if (tryAddBunnyByShopClick()) winBunny++;
        }
      }
      syncHave(panel);
    }

    resultEl.textContent = `10連結果：当たり ${winCount}回 / 🪙 +${winCoins} / 🐰 +${winBunny}`;
    spinBtn.disabled = false;
    spin10Btn.disabled = false;
  }

  function boot() {
    injectStyles();
    preload();
    const panel = buildPanel();
    syncHave(panel);

    panel.querySelector(".spin")?.addEventListener("click", () => spinOnce(panel));
    panel.querySelector(".spin10")?.addEventListener("click", () => spinTen(panel));

    // coinValue変化に追従
    const el = coinValueEl();
    if (el) {
      const mo = new MutationObserver(() => syncHave(panel));
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }

    // 最前面保険
    setInterval(() => { panel.style.zIndex = "2147483647"; }, 1000);
  }

  window.addEventListener("load", boot);
})();
