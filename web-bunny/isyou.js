(() => {
  /* =========================
   * Bunny牧場 app.js（本体）
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

  const OUGON_UNCHI_RATE_PER_DROP = 0.0015;
  const OUGON_UNCHI_VALUE = 10000;

  const BABY_FOLLOW_GAP = 46;
  const BABY_FOLLOW_FORCE = 6.0;
  const BABY_FOLLOW_MAX_SPEED = 180;

  const BASE_RAIN_COUNT_BY_TIER = [0, 14, 26, 42, 68];
  const GAUGE_PERIOD_RANGE = [7, 14];

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

  function fieldRect() {
    return field.getBoundingClientRect();
  }
  function groundY() {
    return fieldRect().height - 60;
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
    coinValueEl.textContent = coins;
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

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.src = ASSETS.babyBunny;
      this.el.draggable = false;

      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      const fr = fieldRect();
      this.x = rand(20, fr.width - 120);
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;
      this.vx = 0;

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        playSE(this.isBaby ? seBaby : sePoyo);
      });
    }

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;
      if (Math.random() < REA_EVOLVE_RATE) this.kind = "reabunny";
      this.el.src = BUNNY_DEFS[this.kind].img;
    }

    update(dt) {
      this.evolveIfNeeded();

      // ===== 移動 =====
      this.x += this.dir * this.baseSpeed * dt;

      // ===== ★実測幅で端判定（帽子対応）=====
      const fr = fieldRect();
      const w = Math.max(1, this.wrap.offsetWidth || 120);
      const PAD = 6;

      const minX = PAD;
      const maxX = Math.max(minX, fr.width - w - PAD);

      this.x = clamp(this.x, minX, maxX);

      if (this.x <= minX + 0.01) {
        this.dir = 1;
      }
      if (this.x >= maxX - 0.01) {
        this.dir = -1;
      }

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
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

    // ★ resize 時も必ず中へ戻す
    window.addEventListener("resize", () => {
      const fr = fieldRect();
      const gy = groundY();

      for (const b of bunnies) {
        const w = Math.max(1, b.wrap.offsetWidth || 120);
        const PAD = 6;
        const minX = PAD;
        const maxX = Math.max(minX, fr.width - w - PAD);
        b.x = clamp(b.x, minX, maxX);
        b.y = gy - 120;
      }
    });
  }

  /* ===== Export ===== */
  window.WB = {
    bunnies,
    spawnBunny,
    playSE,
    updateHud,
    DEPART_COST,
    seTabidati,
  };

  init();
})();
