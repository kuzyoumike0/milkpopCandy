(() => {
  const SLOT_COST = 50;

  // ★ あなたの画像だけを使用
  const SYMBOLS = [
    // --- coin系 ---
    { name: "coin2", src: "./web-bunny/assets/coin2.png", w: 28, pay: 120 },
    { name: "coin3", src: "./web-bunny/assets/coin3.png", w: 18, pay: 200 },
    { name: "coin4", src: "./web-bunny/assets/coin4.png", w: 8,  pay: 500 },

    // --- bunny系（揃ったら“うさぎ当たり”扱い）---
    { name: "babybunny", src: "./web-bunny/assets/babybunny.png", w: 20, pay: 0, special: "BUNNY" },
    { name: "bunny1",    src: "./web-bunny/assets/bunny1.png",    w: 14, pay: 0, special: "BUNNY" },
    { name: "bunny3",    src: "./web-bunny/assets/bunny3.png",    w: 12, pay: 0, special: "BUNNY" },
    { name: "bunny4",    src: "./web-bunny/assets/bunny4.png",    w: 10, pay: 0, special: "BUNNY" },
    { name: "bunny5",    src: "./web-bunny/assets/bunny5.png",    w: 8,  pay: 0, special: "BUNNY" },

    // --- レアうさぎ（揃ったら“うさぎ当たり”+ボーナス）---
    { name: "reabunny",  src: "./web-bunny/assets/reabunny.png",  w: 4,  pay: 300, special: "BUNNY_PLUS" },

    // --- 超レア（黄金）---
    { name: "ougon",     src: "./web-bunny/assets/ougonunchi.png", w: 1,  pay: 1500 },
  ];

  // ===== coin read/write（表示値ベース・app.jsは触らない）=====
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

  // うさぎ当たり時：既存のショップ処理を流用（app.js内部に触れない）
  const tryAddBunnyByShopClick = () => {
    const shopBtn = document.getElementById("shopBtn");
    if (!shopBtn) return false;
    shopBtn.click();
    return true;
  };

  // ===== UI =====
  const PANEL_ID = "slotAlwaysPanel";
  const CELL_H = 96;

  function injectStyles() {
    const css = `
      #${PANEL_ID}{
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);

        width: min(640px, calc(100% - 24px));
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.30);
        background: rgba(255,255,255,0.94);
        box-shadow: 0 22px 70px rgba(0,0,0,0.28);
        padding: 14px 14px 16px;

        /* ★ 常に最前面 */
        z-index: 2147483647;
        isolation: isolate;

        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      }

      #${PANEL_ID} .header{
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding-bottom: 8px;
      }
      #${PANEL_ID} .title{ font-size: 18px; font-weight: 900; }
      #${PANEL_ID} .mini{
        font-size: 12px;
        opacity: 0.82;
        font-weight: 700;
      }

      #${PANEL_ID} .info{
        display:flex; flex-direction:column; gap:6px;
        padding: 6px 0 12px;
        color: rgba(0,0,0,0.78);
      }
      #${PANEL_ID} .hint{ font-size:12px; opacity:0.85; }

      #${PANEL_ID} .reels{
        display:grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin: 8px 0 10px;
      }
      #${PANEL_ID} .reelWindow{
        height: ${CELL_H}px;
        border-radius: 16px;
        background: rgba(255, 214, 231, 0.28);
        border: 1px solid rgba(0,0,0,0.08);
        overflow:hidden;
        position:relative;
      }
      #${PANEL_ID} .reelStrip{
        position:absolute; left:0; top:0; right:0;
        transform: translateY(0px);
        will-change: transform;
      }
      #${PANEL_ID} .cell{
        height: ${CELL_H}px;
        display:flex; align-items:center; justify-content:center;
      }
      #${PANEL_ID} img.sym{
        width: 84px;
        height: 84px;
        object-fit: contain;
        filter: drop-shadow(0 10px 12px rgba(0,0,0,0.18));
        user-select:none; -webkit-user-drag:none;
      }
      #${PANEL_ID} .reelWindow::after{
        content:"";
        position:absolute; left:10px; right:10px;
        top:50%;
        border-top: 2px solid rgba(0,0,0,0.08);
        transform: translateY(-1px);
        pointer-events:none;
      }

      #${PANEL_ID} .result{
        min-height: 34px;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.06);
        font-weight: 800;
      }

      #${PANEL_ID} .actions{
        display:flex; gap: 10px; margin-top: 10px;
      }
      #${PANEL_ID} .actions button{
        border: 1px solid rgba(0,0,0,0.10);
        background:#fff;
        border-radius: 12px;
        padding: 10px 12px;
        cursor:pointer;
      }
      #${PANEL_ID} .actions .primary{
        flex:1;
        background: rgba(255, 214, 231, 0.68);
        font-weight: 900;
      }
      #${PANEL_ID} .actions button:disabled{
        opacity: 0.55;
        cursor: not-allowed;
      }

      @media (max-height: 640px){
        #${PANEL_ID}{ top: 56%; }
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function preload() {
    for (const s of SYMBOLS) {
      const img = new Image();
      img.src = s.src;
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
    const spins = 18 + reelIndex * 6;
    const seq = [];
    for (let i = 0; i < spins; i++) seq.push(pickSymbol());
    seq.push(finalSym);

    setStripContent(strip, seq);

    strip.style.transition = "none";
    strip.style.transform = `translateY(0px)`;
    forceReflow(strip);

    const duration = 1100 + reelIndex * 250;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.86, 0.12, 1)`;
    const toY = -CELL_H * (seq.length - 1);
    strip.style.transform = `translateY(${toY}px)`;

    return new Promise((resolve) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

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
    // coin / ougon / reabunny は pay でコイン加算
    if (sym.pay && sym.pay > 0) addCoins(sym.pay);

    if (sym.special === "BUNNY" || sym.special === "BUNNY_PLUS") {
      // うさぎ増（既存導線流用）
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
    panel.style.zIndex = "2147483647";

    panel.innerHTML = `
      <div class="header">
        <div>
          <div class="title">🎰 うさぎスロット</div>
          <div class="mini">（常時表示・最前面）</div>
        </div>
        <div class="mini">コスト：<b>${SLOT_COST}</b> 🪙</div>
      </div>

      <div class="info">
        <div>所持：<b class="have">0</b> 🪙</div>
        <div class="hint">縦に流れるリール。本格停止。3つ揃うと当たり！</div>
      </div>

      <div class="reels">
        <div class="reelWindow"><div class="reelStrip" data-reel="0"></div></div>
        <div class="reelWindow"><div class="reelStrip" data-reel="1"></div></div>
        <div class="reelWindow"><div class="reelStrip" data-reel="2"></div></div>
      </div>

      <div class="result">回してみよう！</div>

      <div class="actions">
        <button class="primary spin">回す</button>
        <button class="spin10">10連</button>
      </div>
    `;

    document.body.appendChild(panel);

    const strips = [...panel.querySelectorAll(".reelStrip")];
    for (const s of strips) setStripContent(s, [pickSymbol()]);
    return panel;
  }

  async function spinOnce(panel) {
    const resultEl = panel.querySelector(".result");
    const spinBtn = panel.querySelector(".spin");
    const spin10Btn = panel.querySelector(".spin10");
    const strips = [...panel.querySelectorAll(".reelStrip")];

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

      const strips = [...panel.querySelectorAll(".reelStrip")];
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

    // coinValueが変わったら反映
    const el = coinValueEl();
    if (el) {
      const mo = new MutationObserver(() => syncHave(panel));
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }

    // 最前面の保険
    setInterval(() => {
      panel.style.zIndex = "2147483647";
    }, 1000);
  }

  window.addEventListener("load", boot);
})();
