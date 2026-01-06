(() => {
  const SLOT_COST = 50;

  const SYMBOLS = [
    { name: "coin2", src: "./web-bunny/assets/slot/coin2.png", w: 22, pay: 120 },
    { name: "coin3", src: "./web-bunny/assets/slot/coin3.png", w: 14, pay: 200 },
    { name: "coin4", src: "./web-bunny/assets/slot/coin4.png", w: 6,  pay: 500 },

    { name: "babybunny", src: "./web-bunny/assets/slot/babybunny.png", w: 18, pay: 0,  special: "BUNNY" },
    { name: "bunny1",    src: "./web-bunny/assets/slot/bunny1.png",    w: 12, pay: 0,  special: "BUNNY" },
    { name: "bunny3",    src: "./web-bunny/assets/slot/bunny3.png",    w: 10, pay: 0,  special: "BUNNY" },
    { name: "bunny4",    src: "./web-bunny/assets/slot/bunny4.png",    w: 8,  pay: 0,  special: "BUNNY" },
    { name: "bunny5",    src: "./web-bunny/assets/slot/bunny5.png",    w: 6,  pay: 0,  special: "BUNNY" },
    { name: "reabunny",    src: "./web-bunny/assets/slot/reabunny.png",    w: 6,  pay: 0,  special: "BUNNY" },

    { name: "ougon",     src: "./web-bunny/assets/slot/ougonunchi.png", w: 2,  pay: 1500 },
  ];

  // --- DOM coin (表示値ベース) ---
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

  const tryAddBunnyByShopClick = () => {
    const shopBtn = document.getElementById("shopBtn");
    if (!shopBtn) return false;
    shopBtn.click();
    return true;
  };

  const OVERLAY_ID = "slotOverlayAddonPro";
  const FLOAT_BTN_ID = "slotFloatingBtn";

  const CELL_H = 96;

  function injectStyles() {
    const css = `
      #${FLOAT_BTN_ID}{
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 10000;
        width: 56px;
        height: 56px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(6px);
        box-shadow: 0 16px 40px rgba(0,0,0,0.20);
        cursor: pointer;
        font-size: 22px;
        display:flex;
        align-items:center;
        justify-content:center;
        user-select:none;
      }
      #${FLOAT_BTN_ID}:active{ transform: translateY(1px); }

      #${OVERLAY_ID}{
        position:fixed; inset:0;
        display:flex; align-items:center; justify-content:center;
        background: rgba(0,0,0,0.34);
        backdrop-filter: blur(5px);
        z-index: 9999;
      }
      #${OVERLAY_ID}.hidden{ display:none; }

      #${OVERLAY_ID} .modal{
        width: min(620px, calc(100% - 24px));
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.30);
        background: rgba(255,255,255,0.94);
        box-shadow: 0 22px 70px rgba(0,0,0,0.28);
        padding: 14px 14px 16px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      }

      #${OVERLAY_ID} .header{
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding-bottom: 8px;
      }
      #${OVERLAY_ID} .title{ font-size: 18px; font-weight: 900; }
      #${OVERLAY_ID} .close{
        border: 1px solid rgba(0,0,0,0.10);
        background: #fff;
        border-radius: 12px;
        padding: 6px 10px;
        cursor:pointer;
      }

      #${OVERLAY_ID} .info{
        display:flex; flex-direction:column; gap:6px;
        padding: 6px 0 12px;
        color: rgba(0,0,0,0.78);
      }
      #${OVERLAY_ID} .hint{ font-size:12px; opacity:0.85; }

      #${OVERLAY_ID} .reels{
        display:grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin: 8px 0 10px;
      }
      #${OVERLAY_ID} .reelWindow{
        height: ${CELL_H}px;
        border-radius: 16px;
        background: rgba(255, 214, 231, 0.28);
        border: 1px solid rgba(0,0,0,0.08);
        overflow:hidden;
        position:relative;
      }
      #${OVERLAY_ID} .reelStrip{
        position:absolute; left:0; top:0; right:0;
        transform: translateY(0px);
        will-change: transform;
      }
      #${OVERLAY_ID} .cell{
        height: ${CELL_H}px;
        display:flex; align-items:center; justify-content:center;
      }
      #${OVERLAY_ID} img.sym{
        width: 84px;
        height: 84px;
        object-fit: contain;
        filter: drop-shadow(0 10px 12px rgba(0,0,0,0.18));
        user-select:none; -webkit-user-drag:none;
      }
      #${OVERLAY_ID} .reelWindow::after{
        content:"";
        position:absolute; left:10px; right:10px;
        top:50%;
        border-top: 2px solid rgba(0,0,0,0.08);
        transform: translateY(-1px);
        pointer-events:none;
      }

      #${OVERLAY_ID} .result{
        min-height: 34px;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.06);
        font-weight: 800;
      }

      #${OVERLAY_ID} .actions{
        display:flex; gap: 10px; margin-top: 10px;
      }
      #${OVERLAY_ID} .actions button{
        border: 1px solid rgba(0,0,0,0.10);
        background:#fff;
        border-radius: 12px;
        padding: 10px 12px;
        cursor:pointer;
      }
      #${OVERLAY_ID} .actions .primary{
        flex:1;
        background: rgba(255, 214, 231, 0.68);
        font-weight: 900;
      }
      #${OVERLAY_ID} .actions button:disabled{
        opacity: 0.55;
        cursor: not-allowed;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function preloadImages() {
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

  function payoutFrom(symbol) {
    if (symbol.pay && symbol.pay > 0) {
      addCoins(symbol.pay);
      return `当たり！ 🪙 +${symbol.pay}`;
    }
    if (symbol.special === "BUNNY") {
      const ok = tryAddBunnyByShopClick();
      return ok ? `🐰 当たり！（ショップ処理を呼び出したよ）` : `🐰 当たり！でも shopBtn が無い…`;
    }
    return "当たり！";
  }

  function buildOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "hidden";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="header">
          <div class="title">🎰 うさぎスロット（縦リール）</div>
          <button class="close">✕</button>
        </div>
        <div class="info">
          <div>コスト：<b>${SLOT_COST}</b> 🪙　所持：<b class="have">0</b> 🪙</div>
          <div class="hint">Sキーでも開けます。3つ揃うと当たり！</div>
        </div>

        <div class="reels">
          <div class="reelWindow"><div class="reelStrip" data-reel="0"></div></div>
          <div class="reelWindow"><div class="reelStrip" data-reel="1"></div></div>
          <div class="reelWindow"><div class="reelStrip" data-reel="2"></div></div>
        </div>

        <div class="result">コインをためて回そう！</div>

        <div class="actions">
          <button class="primary spin">回す</button>
          <button class="spin10">10連</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 初期絵柄
    const strips = [...overlay.querySelectorAll(".reelStrip")];
    for (const s of strips) setStripContent(s, [pickSymbol()]);

    return overlay;
  }

  function syncHave(overlay) {
    const haveEl = overlay.querySelector(".have");
    if (haveEl) haveEl.textContent = String(getCoins());
  }

  function setOpen(overlay, open) {
    overlay.classList.toggle("hidden", !open);
    if (open) syncHave(overlay);
  }

  async function spinOnce(overlay) {
    const resultEl = overlay.querySelector(".result");
    const spinBtn = overlay.querySelector(".spin");
    const spin10Btn = overlay.querySelector(".spin10");
    const strips = [...overlay.querySelectorAll(".reelStrip")];

    const have = getCoins();
    if (have < SLOT_COST) {
      resultEl.textContent = "コインが足りない…！";
      return;
    }

    setCoins(have - SLOT_COST);
    syncHave(overlay);

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

    syncHave(overlay);
    spinBtn.disabled = false;
    spin10Btn.disabled = false;
  }

  async function spinTen(overlay) {
    const resultEl = overlay.querySelector(".result");
    const spinBtn = overlay.querySelector(".spin");
    const spin10Btn = overlay.querySelector(".spin10");

    const totalCost = SLOT_COST * 10;
    const have = getCoins();
    if (have < totalCost) {
      resultEl.textContent = `10連するにはコインが足りない…（必要：${totalCost}🪙）`;
      return;
    }

    setCoins(have - totalCost);
    syncHave(overlay);

    spinBtn.disabled = true;
    spin10Btn.disabled = true;

    let winCoins = 0;
    let winBunny = 0;
    let winCount = 0;

    for (let i = 0; i < 10; i++) {
      resultEl.textContent = `10連中… ${i + 1}/10`;

      const strips = [...overlay.querySelectorAll(".reelStrip")];
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
        else if (f0.special === "BUNNY") { if (tryAddBunnyByShopClick()) winBunny++; }
      }
      syncHave(overlay);
    }

    resultEl.textContent = `10連結果：当たり ${winCount}回 / 🪙 +${winCoins} / 🐰 +${winBunny}`;
    spinBtn.disabled = false;
    spin10Btn.disabled = false;
  }

  function ensureFloatingButton(openFn) {
    let btn = document.getElementById(FLOAT_BTN_ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = FLOAT_BTN_ID;
    btn.type = "button";
    btn.textContent = "🎰";
    btn.title = "スロット";
    btn.addEventListener("click", openFn);
    document.body.appendChild(btn);
    return btn;
  }

  function boot() {
    injectStyles();
    preloadImages();

    const overlay = buildOverlay();
    const open = () => setOpen(overlay, true);

    // 必ず見える右下ボタンを作る（HUDに入らなくてもOK）
    ensureFloatingButton(open);

    // close actions
    overlay.addEventListener("click", (e) => { if (e.target === overlay) setOpen(overlay, false); });
    overlay.querySelector(".close")?.addEventListener("click", () => setOpen(overlay, false));

    overlay.querySelector(".spin")?.addEventListener("click", () => spinOnce(overlay));
    overlay.querySelector(".spin10")?.addEventListener("click", () => spinTen(overlay));

    // Sキーで開く（デバッグ用の保険）
    window.addEventListener("keydown", (e) => {
      if (e.key === "s" || e.key === "S") open();
    });

    // coinValue監視（あれば）
    const el = coinValueEl();
    if (el) {
      const mo = new MutationObserver(() => {
        if (!overlay.classList.contains("hidden")) syncHave(overlay);
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
  }

  // app.js後に確実に動かす（loadで起動）
  window.addEventListener("load", boot);
})();
