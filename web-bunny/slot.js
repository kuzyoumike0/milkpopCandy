(() => {
  // =========================================================
  // Slot Add-on (Vertical Scrolling Reels) - NO app.js changes
  // =========================================================

  const SLOT_COST = 50;

  // 画像（添付のものを使用）
  // ここだけパス変更すれば、配置先が違っても対応できます。
  const SYMBOLS = [
    // name, src, weight, payoutCoins, special
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

  // 3つ揃い判定は name で行う
  // ※「うさぎ系(BUNNY)は全部まとめて揃い扱い」にしたいなら、下の判定を変えるだけです

  // ---- coin read/write (DOMベース) ----
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

  // ---- bunny add (app.jsの内部関数に触れない) ----
  // 既存のショップ処理が「購入でうさぎ増」の導線を持っている前提で疑似クリック
  const tryAddBunnyByShopClick = () => {
    const shopBtn = document.getElementById("shopBtn");
    if (!shopBtn) return false;
    shopBtn.click();
    return true;
  };

  // ---- UI injection ----
  const OVERLAY_ID = "slotOverlayAddonPro";
  const BTN_ID = "slotBtnAddonPro";

  function injectStyles() {
    const css = `
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

      /* ---- Reels (Vertical) ---- */
      #${OVERLAY_ID} .reels{
        display:grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin: 8px 0 10px;
      }

      #${OVERLAY_ID} .reelWindow{
        height: 96px;
        border-radius: 16px;
        background: rgba(255, 214, 231, 0.28);
        border: 1px solid rgba(0,0,0,0.08);
        overflow:hidden;
        position:relative;
      }

      #${OVERLAY_ID} .reelStrip{
        position:absolute;
        left:0; top:0; right:0;
        transform: translateY(0px);
        will-change: transform;
      }

      #${OVERLAY_ID} .cell{
        height: 96px;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      #${OVERLAY_ID} img.sym{
        width: 84px;
        height: 84px;
        object-fit: contain;
        image-rendering: auto;
        filter: drop-shadow(0 10px 12px rgba(0,0,0,0.18));
        user-select:none;
        -webkit-user-drag:none;
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

      #${OVERLAY_ID} .payout{
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(0,0,0,0.06);
        color: rgba(0,0,0,0.75);
      }
      #${OVERLAY_ID} .payoutTitle{ font-weight: 900; margin-bottom: 6px; }
      #${OVERLAY_ID} ul{ margin:0; padding-left: 18px; font-size: 13px; }

      /* small highlight line in the middle */
      #${OVERLAY_ID} .reelWindow::after{
        content:"";
        position:absolute;
        left:10px; right:10px;
        top:50%;
        height:0;
        border-top: 2px solid rgba(0,0,0,0.08);
        transform: translateY(-1px);
        pointer-events:none;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureButton() {
    // 既存の #slotBtn があるならそれを使う
    let btn = document.getElementById("slotBtn");
    if (btn) return btn;

    // なければ追加
    btn = document.getElementById(BTN_ID);
    if (btn) return btn;

    const hud = document.getElementById("hud");
    if (!hud) return null;
    const container = hud.querySelector(".hudBtns") || hud;

    const b = document.createElement("button");
    b.id = BTN_ID;
    b.textContent = "🎰 スロット";
    container.appendChild(b);
    return b;
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
          <button class="close" aria-label="close">✕</button>
        </div>

        <div class="info">
          <div>コスト：<b class="cost">${SLOT_COST}</b> 🪙　所持：<b class="have">0</b> 🪙</div>
          <div class="hint">リールが縦に流れて止まります。3つ揃うと当たり！</div>
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

        <div class="payout">
          <div class="payoutTitle">当たり例</div>
          <ul>
            <li>同じ絵柄が3つ：その絵柄の報酬</li>
            <li>うさぎ系が3つ：ショップ処理を疑似クリックして“うさぎ増”を試行</li>
            <li>ougonunchi（黄金）：🪙 +1500</li>
          </ul>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
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

  // ---- Preload images (so reels don't flicker) ----
  function preload() {
    for (const s of SYMBOLS) {
      const img = new Image();
      img.src = s.src;
    }
  }

  // ---- RNG (weighted) ----
  function pickSymbol() {
    const total = SYMBOLS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const it of SYMBOLS) {
      r -= it.w;
      if (r <= 0) return it;
    }
    return SYMBOLS[0];
  }

  // ---- Reel build & spin ----
  const CELL_H = 96;

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

  function forceReflow(el) {
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;
  }

  function spinReel(strip, finalSym, reelIndex) {
    // たっぷり回す用のランダム列を作り、最後を final にする
    const spins = 18 + reelIndex * 6; // リールごとに少し長さを変える
    const seq = [];
    for (let i = 0; i < spins; i++) seq.push(pickSymbol());
    seq.push(finalSym);

    setStripContent(strip, seq);

    // 初期位置
    strip.style.transition = "none";
    strip.style.transform = `translateY(0px)`;
    forceReflow(strip);

    // 回転（縦に流れる）
    const duration = 1100 + reelIndex * 250; // 右ほど遅く止まる
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.86, 0.12, 1)`;
    const toY = -CELL_H * (seq.length - 1);
    strip.style.transform = `translateY(${toY}px)`;

    return new Promise((resolve) => {
      const onEnd = (e) => {
        if (e.propertyName !== "transform") return;
        strip.removeEventListener("transitionend", onEnd);

        // 止まった後、stripをfinal 1枚に置き換えて軽量化（見た目は変わらない）
        strip.style.transition = "none";
        setStripContent(strip, [finalSym]);
        strip.style.transform = `translateY(0px)`;
        resolve(finalSym);
      };
      strip.addEventListener("transitionend", onEnd);
    });
  }

  function payoutFrom(symbol) {
    // コイン系・黄金は pay がある
    if (symbol.pay && symbol.pay > 0) {
      addCoins(symbol.pay);
      return `当たり！ 🪙 +${symbol.pay}`;
    }
    // うさぎ系（pay==0 & special=BUNNY）
    if (symbol.special === "BUNNY") {
      const ok = tryAddBunnyByShopClick();
      return ok
        ? `🐰 当たり！ ショップ処理を呼んで“うさぎ増”を試行したよ`
        : `🐰 当たり！ でも shopBtn が見つからなかった…`;
    }
    return "当たり！";
  }

  function isTriple(a, b, c) {
    return a.name === b.name && b.name === c.name;
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

    // spend
    setCoins(have - SLOT_COST);
    syncHave(overlay);

    // lock
    spinBtn.disabled = true;
    spin10Btn.disabled = true;
    resultEl.textContent = "回転中…";

    // それぞれの最終絵柄
    const f0 = pickSymbol();
    const f1 = pickSymbol();
    const f2 = pickSymbol();

    // 縦リール回転（左→中→右の停止タイミング差）
    const r0 = spinReel(strips[0], f0, 0);
    const r1 = spinReel(strips[1], f1, 1);
    const r2 = spinReel(strips[2], f2, 2);

    const [a, b, c] = await Promise.all([r0, r1, r2]);

    if (isTriple(a, b, c)) {
      const msg = payoutFrom(a);
      resultEl.textContent = `🎉 ${a.name} ×3！ ${msg}`;
    } else {
      resultEl.textContent = `はずれ！`;
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

    // 10連はテンポ重視：毎回「縦回転」はするけど短めで
    for (let i = 0; i < 10; i++) {
      resultEl.textContent = `10連中… ${i + 1}/10`;

      const strips = [...overlay.querySelectorAll(".reelStrip")];
      const f0 = pickSymbol();
      const f1 = pickSymbol();
      const f2 = pickSymbol();

      // 10連は短縮回転：reelIndex差だけ残す
      await Promise.all([
        spinReel(strips[0], f0, 0),
        spinReel(strips[1], f1, 1),
        spinReel(strips[2], f2, 2),
      ]);

      if (isTriple(f0, f1, f2)) {
        winCount++;
        if (f0.pay && f0.pay > 0) {
          addCoins(f0.pay);
          winCoins += f0.pay;
        } else if (f0.special === "BUNNY") {
          // うさぎ当たりはショップクリック
          if (tryAddBunnyByShopClick()) winBunny++;
        }
      }
    }

    syncHave(overlay);
    resultEl.textContent = `10連結果：当たり ${winCount}回 / 🪙 +${winCoins} / 🐰 +${winBunny}`;
    spinBtn.disabled = false;
    spin10Btn.disabled = false;
  }

  // ---- Boot ----
  function boot() {
    injectStyles();
    preload();

    const btn = ensureButton();
    const overlay = buildOverlay();

    // 初期表示：リールにランダム1枚置いておく
    const strips = [...overlay.querySelectorAll(".reelStrip")];
    for (const s of strips) setStripContent(s, [pickSymbol()]);

    btn?.addEventListener("click", () => setOpen(overlay, true));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) setOpen(overlay, false);
    });
    overlay.querySelector(".close")?.addEventListener("click", () => setOpen(overlay, false));

    overlay.querySelector(".spin")?.addEventListener("click", () => spinOnce(overlay));
    overlay.querySelector(".spin10")?.addEventListener("click", () => spinTen(overlay));

    // コイン表示変化を監視して、モーダル開いてる間は所持金更新
    const el = coinValueEl();
    if (el) {
      const mo = new MutationObserver(() => {
        if (!overlay.classList.contains("hidden")) syncHave(overlay);
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 0);
  } else {
    window.addEventListener("DOMContentLoaded", boot);
  }
})();
