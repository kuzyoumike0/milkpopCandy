(() => {
  /* =======================
     Assets & Cost
  ======================= */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    hart: "./assets/hart.png",
    candy: "./assets/candy.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    tabidatiSE: "./assets/tabidati.mp3",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  const COST = {
    CANDY: 10,
    DEPART: 10,
  };

  /* =======================
     LocalStorage
  ======================= */
  const LS_KEYS = {
    coins: "webBunny_coins_v1",
    bunnyCount: "webBunny_bunnyCount_v1",
  };

  /* =======================
     DOM
  ======================= */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");

  const coinValueEl = document.getElementById("coinValue");
  const bunnyValueEl = document.getElementById("bunnyValue");
  const coinHudEl = document.getElementById("coinHud");

  const candyBtn = document.getElementById("candyBtn");
  const hintEl = document.getElementById("hint");

  const shopBtn = document.getElementById("shopBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const shopModal = document.getElementById("shopModal");
  const closeShopBtn = document.getElementById("closeShopBtn");
  const bunnyPriceEl = document.getElementById("bunnyPrice");
  const buyBunnyBtn = document.getElementById("buyBunnyBtn");
  const departBunnyBtn = document.getElementById("departBunnyBtn");

  /* =======================
     State
  ======================= */
  let coins = parseInt(localStorage.getItem(LS_KEYS.coins) || "0", 10);
  let bunnyCount = Math.max(
    2,
    parseInt(localStorage.getItem(LS_KEYS.bunnyCount) || "2", 10)
  );

  const bunnies = [];
  const coinsOnField = [];
  const candies = [];

  let candyArmed = false;
  let lastFrame = performance.now();
  let rafId = 0;

  /* =======================
     Audio
  ======================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);
  [sePoyo, seCoin, seTabidati].forEach(a => (a.preload = "auto"));

  function playSE(a) {
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  }

  /* =======================
     Helpers
  ======================= */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  function save() {
    localStorage.setItem(LS_KEYS.coins, coins);
    localStorage.setItem(LS_KEYS.bunnyCount, bunnyCount);
  }

  function updateHud() {
    coinValueEl.textContent = coins;
    bunnyValueEl.textContent = bunnies.length;
  }

  function bumpCoinHud() {
    coinHudEl.classList.remove("bump");
    void coinHudEl.offsetWidth;
    coinHudEl.classList.add("bump");
  }

  function shineCoinHud() {
    coinHudEl.classList.remove("shine");
    void coinHudEl.offsetWidth;
    coinHudEl.classList.add("shine");
  }

  function fieldRect() {
    return field.getBoundingClientRect();
  }

  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine").getBoundingClientRect();
    return gl.top - fr.top;
  }

  /* =======================
     Departure Messages
  ======================= */
  const DEPART_MESSAGES = [
    "ありがとう…",
    "またね…",
    "いってきます…",
    "だいすき…",
    "たのしかった…",
    "ばいばい…",
    "げんきでね…",
  ];

  const DEPART_RARE_MESSAGES = [
    "伝説になるね…✨",
    "星になって見守るよ…🌟",
    "また会おうね、約束…💛",
    "この牧場、最高だった…👑",
    "…君のコインは輝いてる…✨",
  ];

  const DEPART_RARE_CHANCE = 0.03;

  function pickDepartMessageObj() {
    const rare = Math.random() < DEPART_RARE_CHANCE;
    const arr = rare ? DEPART_RARE_MESSAGES : DEPART_MESSAGES;
    return {
      text: arr[Math.floor(Math.random() * arr.length)],
      rare,
    };
  }

  /* =======================
     FX
  ======================= */
  function spawnDepartFx(x, y) {
    for (let i = 0; i < 12; i++) {
      const p = document.createElement("div");
      p.className = "puff show";
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.background =
        Math.random() < 0.35
          ? "rgba(255,195,220,.8)"
          : "rgba(255,255,255,.8)";
      p.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 60}px`);
      p.style.setProperty("--dy", `${-20 - Math.random() * 70}px`);
      coinLayer.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  }

  function spawnDepartMsg(x, y, msg) {
    const fr = fieldRect();
    const d = document.createElement("div");
    d.className = "departMsg show";
    if (msg.rare) d.classList.add("rare");
    d.textContent = msg.text;
    d.style.left = `${clamp(x, 0, fr.width)}px`;
    d.style.top = `${clamp(y, 0, fr.height)}px`;
    coinLayer.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  /* =======================
     Candy
  ======================= */
  class Candy {
    constructor(x) {
      this.x = x;
      this.y = -60;
      this.vy = 0;
      this.spawnAt = performance.now();
      this.ttl = 10000;

      this.el = document.createElement("img");
      this.el.src = ASSETS.candy;
      this.el.className = "candy";
      coinLayer.appendChild(this.el);
    }
    update(dt) {
      this.vy += 2400 * dt;
      this.y += this.vy * dt;
      const fy = groundY();
      if (this.y > fy) {
        this.y = fy;
        this.vy = 0;
      }
      this.el.style.left = `${this.x - 26}px`;
      this.el.style.top = `${this.y - 26}px`;
    }
    expired(now) {
      return now - this.spawnAt > this.ttl;
    }
    remove() {
      this.el.remove();
    }
  }

  /* =======================
     Bunny
  ======================= */
  class Bunny {
    constructor() {
      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.img = document.createElement("img");
      this.img.src = ASSETS.bunny;
      this.img.className = "bunny walk";

      this.wrap.appendChild(this.img);
      bunnyLayer.appendChild(this.wrap);

      this.x = 0;
      this.baseX = 0;
      this.y = 0;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.speed = 60 + Math.random() * 60;
    }

    setHome(x, y) {
      this.baseX = x;
      this.y = y;
      if (!this.x) this.x = x;
    }

    update(dt, targetX) {
      const tx = targetX ?? this.baseX;
      this.x += this.dir * this.speed * dt;
      if (this.x < tx - 60) this.dir = 1;
      if (this.x > tx + 60) this.dir = -1;
      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }
  }

  /* =======================
     Shop
  ======================= */
  function openShop(open) {
    modalBackdrop.classList.toggle("hidden", !open);
    shopModal.classList.toggle("hidden", !open);
  }

  departBunnyBtn.addEventListener("click", () => {
    if (bunnies.length <= 1 || coins < COST.DEPART) return;

    const victim = bunnies[bunnies.length - 1];
    const fr = fieldRect();
    const r = victim.wrap.getBoundingClientRect();
    const x = r.left - fr.left + r.width / 2;
    const y = r.top - fr.top + r.height * 0.7;

    coins -= COST.DEPART;
    save();
    updateHud();
    bumpCoinHud();

    victim.wrap.classList.add("departing");
    playSE(seTabidati);
    spawnDepartFx(x, y);
    spawnDepartMsg(x, y - 40, pickDepartMessageObj());

    setTimeout(() => {
      bunnyCount--;
      save();
      rebuildBunnies();
    }, 420);
  });

  /* =======================
     Init / Loop
  ======================= */
  function rebuildBunnies() {
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    for (let i = 0; i < bunnyCount; i++) {
      bunnies.push(new Bunny());
    }
    layoutBunnies();
    updateHud();
  }

  function layoutBunnies() {
    const gY = groundY();
    const fr = fieldRect();
    const step = fr.width / Math.max(1, bunnies.length);
    bunnies.forEach((b, i) =>
      b.setHome(step * i + step / 2, gY - 120)
    );
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    const now = performance.now();
    for (let i = candies.length - 1; i >= 0; i--) {
      candies[i].update(dt);
      if (candies[i].expired(now)) {
        candies[i].remove();
        candies.splice(i, 1);
      }
    }

    const targetX = candies.length ? candies[candies.length - 1].x : null;
    bunnies.forEach(b => b.update(dt, targetX));

    rafId = requestAnimationFrame(tick);
  }

  function init() {
    rebuildBunnies();
    updateHud();
    shopBtn.onclick = () => openShop(true);
    closeShopBtn.onclick = () => openShop(false);
    modalBackdrop.onclick = () => openShop(false);

    cancelAnimationFrame(rafId);
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  init();
})();
