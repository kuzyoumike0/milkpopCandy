(() => {
  /* =========================
   * Bunny牧場 app.js（本体）— FIX: 画面外に出ない版
   * ========================= */

  /* ===== Assets ===== */
  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",

    ougonUnchi: "./assets/ougonunchi.png",

    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  /* ===== Bunny defs ===== */
  const BUNNY_DEFS = {
    bunny1: { img: "./assets/bunny1.png", coinMul: 0.55 },
    bunny3: { img: "./assets/bunny3.png", coinMul: 1.0 },
    bunny4: { img: "./assets/bunny4.png", coinMul: 1.8 },
    bunny5: { img: "./assets/bunny5.png", coinMul: 2.8 },
    reabunny: { img: "./assets/reabunny.png", coinMul: 4.0 },
  };

  /* ===== Balance ===== */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;
  const REA_EVOLVE_RATE = 0.01;

  const DEPART_COST = 10;

  /* ===== Storage ===== */
  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6",
    dex: "wb_dex_v1",
    unchi: "wb_unchi_v1",
    title: "wb_title_v1",
    titleList: "wb_title_list_v1",
  };

  /* ===== DOM ===== */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) return;

  /* ===== Utils ===== */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ===== ★ field rect cache（毎フレームgetBoundingClientRectしない） ===== */
  let FIELD_W = 0;
  let FIELD_H = 0;

  function refreshFieldSize() {
    // clientWidth/Height の方がスクロールの影響を受けにくい
    FIELD_W = Math.max(1, field.clientWidth || field.getBoundingClientRect().width || 1);
    FIELD_H = Math.max(1, field.clientHeight || field.getBoundingClientRect().height || 1);
  }
  refreshFieldSize();
  window.addEventListener("resize", () => requestAnimationFrame(refreshFieldSize), { passive: true });

  function groundY() {
    // あなたの元ロジック：地面は下から60px上
    return FIELD_H - 60;
  }

  /* ===== Audio ===== */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  function playSE(a) {
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* ===== State ===== */
  let coins = Number(localStorage.getItem(LS.coins) || 0);
  const bunnies = [];
  let lastFrame = performance.now();

  function updateHud() {
    coinValueEl.textContent = String(coins);
  }

  /* =========================
   * Bunny class
   * ========================= */
  class Bunny {
    constructor(kind = "bunny1") {
      this.kind = kind;
      this.bornAt = Date.now();
      this.isBaby = true;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";
      // ★位置指定がズレないように明示（style.cssにあるなら不要だが安全）
      this.wrap.style.position = "absolute";
      this.wrap.style.left = "0px";
      this.wrap.style.top = "0px";

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.src = ASSETS.babyBunny;
      this.el.draggable = false;

      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      // ★初期位置
      refreshFieldSize();
      this.x = rand(20, Math.max(21, FIELD_W - 140));
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;
      this.vx = 0;

      // ★画像ロード完了時に「実測幅」で再clamp（これが一番効く）
      this.el.addEventListener("load", () => {
        this.clampInside();
        this.applyPos();
      });

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        playSE(this.isBaby ? seBaby : sePoyo);
      });

      // 最初に一回置く
      this.clampInside();
      this.applyPos();
    }

    getWrapWidth() {
      // ★offsetWidthが0になりがちなので、rect幅も併用
      const w1 = this.wrap.offsetWidth || 0;
      if (w1 > 0) return w1;
      const w2 = this.wrap.getBoundingClientRect().width || 0;
      return Math.max(1, w2 || 120);
    }

    clampInside() {
      refreshFieldSize();
      const w = this.getWrapWidth();
      const PAD = 6;

      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      this.x = clamp(this.x, minX, maxX);

      // ついでにYも確実に地面へ
      this.y = groundY() - 120;
    }

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";

      const next = BUNNY_DEFS[this.kind]?.img;
      if (next) this.el.src = next;

      // ★進化した瞬間に幅が変わるので即clamp
      this.clampInside();
      this.applyPos();
    }

    applyPos() {
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }

    update(dt) {
      this.evolveIfNeeded();

      // ===== 移動 =====
      const speedMul = this.isBaby ? BABY_SPEED_MUL : 1.0;
      this.x += this.dir * this.baseSpeed * speedMul * dt;

      // ===== ★実測幅で端判定（帽子対応） + キャッシュ幅 =====
      const w = this.getWrapWidth();
      const PAD = 6;

      const minX = PAD;
      const maxX = Math.max(minX, FIELD_W - w - PAD);

      if (this.x <= minX) {
        this.x = minX;
        this.dir = 1;
      } else if (this.x >= maxX) {
        this.x = maxX;
        this.dir = -1;
      }

      this.applyPos();
    }
  }

  /* =========================
   * Init / Loop
   * ========================= */
  function spawnBunny(kind = "bunny1") {
    const b = new Bunny(kind);
    bunnies.push(b);
    return b;
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    for (const b of bunnies) b.update(dt);

    requestAnimationFrame(tick);
  }

  function init() {
    spawnBunny();
    spawnBunny();
    updateHud();
    requestAnimationFrame(tick);

    // ★ resize 時も必ず中へ戻す（あなたの処理を“より確実”に）
    window.addEventListener("resize", () => {
      refreshFieldSize();
      for (const b of bunnies) {
        b.clampInside();
        b.applyPos();
      }
    });
  }

  /* ===== Export（互換を少し足す） ===== */
  // omukae.js 側が参照しやすいように最低限だけ整える
  window.WB = window.WB || {};
  window.WB.bunnies = bunnies;
  window.WB.spawnBunny = spawnBunny;
  window.WB.playSE = playSE;
  window.WB.updateHud = updateHud;
  window.WB.DEPART_COST = DEPART_COST;
  window.WB.seTabidati = seTabidati;

  // コイン互換（omukae.jsが getCoin/spendCoin を使う場合に備える）
  window.WB.getCoin = () => coins;
  window.WB.spendCoin = (n) => {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return true;
    if (coins < n) return false;
    coins -= n;
    localStorage.setItem(LS.coins, String(coins));
    updateHud();
    return true;
  };

  init();
})();
