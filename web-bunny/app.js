(() => {
  const ASSETS = {
    bunny: "./assets/bunny.png",
    hart: "./assets/hart.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  const LS_KEYS = {
    coins: "webBunny_coins_v1",
    bunnyCount: "webBunny_bunnyCount_v1",
  };

  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");

  const coinValueEl = document.getElementById("coinValue");
  const bunnyValueEl = document.getElementById("bunnyValue");
  const coinHudEl = document.getElementById("coinHud");

  const shopBtn = document.getElementById("shopBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const shopModal = document.getElementById("shopModal");
  const closeShopBtn = document.getElementById("closeShopBtn");
  const bunnyPriceEl = document.getElementById("bunnyPrice");
  const buyBunnyBtn = document.getElementById("buyBunnyBtn");

  /* =======================
     State
  ======================= */
  let coins = safeInt(localStorage.getItem(LS_KEYS.coins), 0);
  let bunnyCount = clamp(safeInt(localStorage.getItem(LS_KEYS.bunnyCount), 2), 2, 9999);

  const bunnies = [];
  const coinsOnField = [];

  let lastFrame = performance.now();
  let rafId = 0;

  /* =======================
     Audio
  ======================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seCoin = new Audio(ASSETS.coinSE);
  sePoyo.preload = "auto";
  seCoin.preload = "auto";

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      sePoyo.muted = true;
      sePoyo.currentTime = 0;
      sePoyo.play().then(() => {
        sePoyo.pause();
        sePoyo.currentTime = 0;
        sePoyo.muted = false;
      }).catch(() => {
        sePoyo.muted = false;
      });
    } catch (_) {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true });

  function playSE(aud) {
    try {
      aud.currentTime = 0;
      aud.play().catch(() => {});
    } catch (_) {}
  }

  /* =======================
     Helpers
  ======================= */
  function safeInt(v, def) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : def;
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function save() {
    localStorage.setItem(LS_KEYS.coins, String(coins));
    localStorage.setItem(LS_KEYS.bunnyCount, String(bunnyCount));
  }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    bunnyValueEl.textContent = String(bunnies.length);
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

  function getBunnyPrice(nextIndex) {
    const base = 25;
    const growth = 1.28;
    return Math.floor(base * Math.pow(growth, Math.max(0, nextIndex - 1)));
  }

  function coinTierFromIdleSeconds(sec) {
    if (sec >= 90) return 4;
    if (sec >= 45) return 3;
    if (sec >= 18) return 2;
    return 1;
  }

  function applyRareBoost(baseTier) {
    const r = Math.random();
    let up = 0;
    if (r < 0.10) up = 3;
    else if (r < 0.35) up = 2;
    else if (r < 0.75) up = 1;
    return clamp(baseTier + up, 1, 4);
  }

  function coinValueFromTier(tier) {
    if (tier === 4) return 100;
    if (tier === 3) return 10;
    if (tier === 2) return 5;
    return 1;
  }

  function fieldRect() {
    return field.getBoundingClientRect();
  }

  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine").getBoundingClientRect();
    return gl.top - fr.top;
  }

  function randomGaugeSeconds() {
    return 2.2 + Math.random() * 2.8;
  }

  /* =======================
     Visual Effects
  ======================= */
  function spawnGainPop(x, y, value) {
    const fr = fieldRect();
    const d = document.createElement("div");
    d.className = "gainPop show";
    d.textContent = `+${value}`;
    if (value >= 100) d.classList.add("rainbow");

    d.style.left = `${clamp(x, 0, fr.width)}px`;
    d.style.top = `${clamp(y, 0, fr.height)}px`;
    coinLayer.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  function spawnSparks(x, y) {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("div");
      s.className = "spark show";
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 70}px`);
      s.style.setProperty("--dy", `${(Math.random() * 2 - 1) * 70 - 30}px`);
      s.style.background = `rgba(255,255,255,${0.7 + Math.random() * 0.3})`;
      coinLayer.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  /* =======================
     Bunny
  ======================= */
  let bunnyIdSeq = 1;

  class Bunny {
    constructor() {
      this.id = bunnyIdSeq++;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;

      this.el = document.createElement("img");
      this.el.className = "bunny walk";
      this.el.src = ASSETS.bunny;

      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = 0;
      this.y = 0;
      this.homeX = 0;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 65;
      this.roamRange = 90 + Math.random() * 260;

      this.gauge = Math.random() * 0.25;
      this.gaugePeriod = randomGaugeSeconds();
      this.charged = false;

      this.lastClickAt = Date.now();
      this.lastClickSpawnAt = 0;

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.tryClickDrop();
      });
    }

    setHome(x, y) {
      this.homeX = x;
      this.y = y;
      if (this.x === 0) this.x = x;
    }

    idleSeconds() {
      return (Date.now() - this.lastClickAt) / 1000;
    }

    updateGauge(dt) {
      if (this.charged) return;
      this.gauge += dt / this.gaugePeriod;
      if (this.gauge >= 1) {
        this.gauge = 1;
        this.charged = true;
        this.heart.classList.add("ready");
      }
    }

    tryClickDrop() {
      const t = performance.now();
      if (t - this.lastClickSpawnAt < 1000) return;
      this.lastClickSpawnAt = t;
      this.lastClickAt = Date.now();

      playSE(sePoyo);

      const wasCharged = this.charged;
      if (wasCharged) {
        this.charged = false;
        this.gauge = 0;
        this.gaugePeriod = randomGaugeSeconds();
        this.heart.classList.remove("ready");
        this.heart.classList.add("show");
        setTimeout(() => this.heart.classList.remove("show"), 700);
      }

      spawnCoinAtBunny(this, wasCharged);
    }

    update(dt) {
      this.updateGauge(dt);

      this.x += this.dir * this.baseSpeed * dt;
      if (Math.abs(this.x - this.homeX) > this.roamRange) this.dir *= -1;

      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
      this.wrap.classList.toggle("flip", this.dir < 0);
    }
  }

  /* =======================
     Coin
  ======================= */
  class Coin {
    constructor(x, yStart, yFloor, tier, value, flashy) {
      this.value = value;
      this.flashy = flashy;

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];

      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      this.vx = (Math.random() * 2 - 1) * (flashy ? 22 : 10);
      this.vy = 0;
      this.gravity = flashy ? 2400 : 2100;
      this.bounce = flashy ? 0.62 : 0.38;
      this.resting = false;

      this.el.addEventListener("pointerenter", () => this.collect());
      this.el.addEventListener("click", () => this.collect());

      coinLayer.appendChild(this.el);
    }

    collect() {
      coins += this.value;
      save();
      updateHud();
      bumpCoinHud();
      spawnGainPop(this.x, this.y, this.value);
      playSE(seCoin);

      this.el.remove();
      coinsOnField.splice(coinsOnField.indexOf(this), 1);
    }

    update(dt) {
      if (this.resting) return;
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y >= this.yFloor) {
        this.y = this.yFloor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
        } else {
          this.resting = true;
        }
      }

      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;
    }
  }

  function spawnCoinAtBunny(bunny, flashy) {
    const baseTier = coinTierFromIdleSeconds(bunny.idleSeconds());
    const tier = flashy ? applyRareBoost(baseTier) : baseTier;
    const value = coinValueFromTier(tier);

    const fr = fieldRect();
    const gY = groundY();
    const r = bunny.wrap.getBoundingClientRect();
    const x = r.left - fr.left + r.width / 2;
    const startY = gY - (flashy ? 220 : 150);

    if (flashy) {
      spawnSparks(x, startY);
      shineCoinHud();
    }

    const c = new Coin(x, startY, gY - 2, tier, value, flashy);
    coinsOnField.push(c);
  }

  /* =======================
     Init & Loop
  ======================= */
  function rebuildBunnies(n) {
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    for (let i = 0; i < n; i++) bunnies.push(new Bunny());
    layoutBunnies();
    updateHud();
  }

  function layoutBunnies() {
    const fr = fieldRect();
    const gY = groundY();
    const step = Math.max(60, fr.width / Math.max(1, bunnies.length));
    bunnies.forEach((b, i) => {
      b.setHome(20 + step * i, gY - 120);
    });
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;
    bunnies.forEach(b => b.update(dt));
    coinsOnField.forEach(c => c.update(dt));
    rafId = requestAnimationFrame(tick);
  }

  function init() {
    rebuildBunnies(bunnyCount);
    updateHud();

    shopBtn.onclick = () => openShop(true);
    closeShopBtn.onclick = () => openShop(false);
    modalBackdrop.onclick = () => openShop(false);

    buyBunnyBtn.onclick = () => {
      const price = getBunnyPrice(bunnies.length);
      if (coins < price) return;
      coins -= price;
      bunnyCount++;
      save();
      rebuildBunnies(bunnyCount);
    };

    resetBtn.onclick = () => {
      if (!confirm("リセットしますか？")) return;
      coins = 0;
      bunnyCount = 2;
      save();
      rebuildBunnies(bunnyCount);
    };

    cancelAnimationFrame(rafId);
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function openShop(open) {
    modalBackdrop.classList.toggle("hidden", !open);
    shopModal.classList.toggle("hidden", !open);
    bunnyPriceEl.textContent = getBunnyPrice(bunnies.length);
  }

  init();
})();
