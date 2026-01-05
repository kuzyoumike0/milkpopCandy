(() => {
  const ASSETS = {
    bunny: "./assets/bunny.png",
    hart: "./assets/hart.png",
    candy: "./assets/candy.png",
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

  const candyBtn = document.getElementById("candyBtn");
  const hintEl = document.getElementById("hint");

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
  const candies = [];

  let lastFrame = performance.now();
  let rafId = 0;

  // キャンディ投下モード
  let candyArmed = false;

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
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

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

  // 「最後にクリックした時刻」からの放置時間でベースTier
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

  // ★コイン価値（指定）
  function coinValueFromTier(tier) {
    if (tier === 4) return 100;
    if (tier === 3) return 10;
    if (tier === 2) return 5;
    return 1;
  }

  function fieldRect() { return field.getBoundingClientRect(); }

  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine").getBoundingClientRect();
    return gl.top - fr.top;
  }

  // ★ゲージ充電：遅くする（満タンまで 8〜16秒）
  function randomGaugeSeconds() {
    return 8.0 + Math.random() * 8.0;
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
     Candy
  ======================= */
  class Candy {
    constructor(x, ttlMs = 10000) {
      this.x = x;
      this.y = -60;
      this.vy = 0;
      this.gravity = 2600;
      this.resting = false;
      this.spawnAt = performance.now();
      this.ttlMs = ttlMs;

      this.el = document.createElement("img");
      this.el.className = "candy";
      this.el.src = ASSETS.candy;
      this.el.alt = "candy";
      this.el.draggable = false;

      coinLayer.appendChild(this.el);
      this.render();
    }

    floorY() {
      return groundY() - 2;
    }

    isExpired(now) {
      return (now - this.spawnAt) >= this.ttlMs;
    }

    remove() {
      this.el.remove();
    }

    update(dt) {
      if (!this.resting) {
        this.vy += this.gravity * dt;
        this.y += this.vy * dt;

        const fy = this.floorY();
        if (this.y >= fy) {
          this.y = fy;
          this.vy = 0;
          this.resting = true;
        }
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 26}px`;
      this.el.style.top = `${this.y - 26}px`;
      // ちょい揺れ
      const t = performance.now() / 200;
      const rot = Math.sin(t) * 6;
      this.el.style.transform = `rotate(${rot}deg)`;
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
      this.heart.alt = "heart";
      this.heart.draggable = false;

      this.el = document.createElement("img");
      this.el.className = "bunny walk";
      this.el.src = ASSETS.bunny;
      this.el.alt = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      // 位置
      this.x = 0;
      this.y = 0;

      // 通常のホーム（整列結果）
      this.baseHomeX = 0;
      this.baseHomeY = 0;

      // 集合時ターゲット
      this.targetHomeX = 0;

      // 歩き個体差
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 65;
      this.roamRange = 90 + Math.random() * 260;

      // ゲージ（内部・貯まるだけ）
      this.gauge = Math.random() * 0.25;
      this.gaugePeriod = randomGaugeSeconds();
      this.charged = false;

      // tier基準用
      this.lastClickAt = Date.now();
      this.lastClickSpawnAt = 0;

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.tryClickDrop();
      });
    }

    setBaseHome(x, y) {
      this.baseHomeX = x;
      this.baseHomeY = y;
      if (this.x === 0 && this.y === 0) {
        this.x = x;
        this.y = y;
      }
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

    update(dt, crowdIndex, crowdCount, candyTargetXOrNull) {
      this.updateGauge(dt);

      // 集合ターゲットがあるなら、そこに寄る（個体ごとに横ズレを付ける）
      if (candyTargetXOrNull != null) {
        const spread = 52; // うさぎ同士の間隔
        const centerIndex = (crowdCount - 1) / 2;
        const offset = (crowdIndex - centerIndex) * spread;
        this.targetHomeX = candyTargetXOrNull + offset;
      } else {
        // 通常は整列ホーム
        this.targetHomeX = this.baseHomeX;
      }

      // ホームをスムーズに追従（急にワープしない）
      const homeX = lerp(this.x, this.targetHomeX, 0.03);

      // 歩行：ホーム周辺をちょこちょこ
      const roam = (candyTargetXOrNull != null) ? 35 : this.roamRange;
      const targetMin = homeX - roam;
      const targetMax = homeX + roam;

      // スピードも集合時は少し上げる
      const spd = this.baseSpeed * (candyTargetXOrNull != null ? 1.25 : 1.0);

      this.x += this.dir * spd * dt;

      // 範囲を越えたら折り返し
      if (this.x < targetMin) this.dir = 1;
      if (this.x > targetMax) this.dir = -1;

      // 向き
      this.wrap.classList.toggle("flip", this.dir < 0);

      // 描画
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.baseHomeY}px`;
    }
  }

  /* =======================
     Coin
  ======================= */
  class Coin {
    constructor(x, yStart, yFloor, tier, value, flashy) {
      this.value = value;
      this.flashy = flashy;
      this.collected = false;

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.alt = `coin${tier}`;
      this.el.draggable = false;

      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      this.vx = (Math.random() * 2 - 1) * (flashy ? 22 : 10);
      this.vy = 0;
      this.gravity = flashy ? 2400 : 2100;
      this.bounce = flashy ? 0.62 : 0.38;
      this.resting = false;

      this.spin = flashy ? (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10) : 0;
      this.angle = 0;

      this.el.addEventListener("pointerenter", () => this.collect());
      this.el.addEventListener("click", (e) => { e.preventDefault(); this.collect(); });

      coinLayer.appendChild(this.el);
      this.render();
    }

    collect() {
      if (this.collected) return;
      this.collected = true;

      spawnGainPop(this.x, this.y, this.value);

      coins += this.value;
      save();
      updateHud();
      bumpCoinHud();
      playSE(seCoin);

      this.el.remove();
      const idx = coinsOnField.indexOf(this);
      if (idx >= 0) coinsOnField.splice(idx, 1);
    }

    update(dt) {
      if (this.collected || this.resting) return;

      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.flashy) this.angle += this.spin * dt;

      if (this.y >= this.yFloor) {
        this.y = this.yFloor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
        } else {
          this.resting = true;
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;

      const squash = (!this.resting && this.y > this.yFloor - 16);

      if (this.flashy) {
        const rot = this.angle * 180 / Math.PI;
        const scale = squash ? "scale(1.18,0.88)" : "scale(1.08,1.08)";
        this.el.style.transform = `${scale} rotate(${rot}deg)`;
      } else {
        this.el.style.transform = squash ? `scale(1.05,0.95)` : `scale(1,1)`;
      }
    }
  }

  function spawnCoinAtBunny(bunny, flashy) {
    const baseTier = coinTierFromIdleSeconds(bunny.idleSeconds());
    const tier = flashy ? applyRareBoost(baseTier) : baseTier;
    const value = coinValueFromTier(tier);

    const fr = fieldRect();
    const gY = groundY();
    const r = bunny.wrap.getBoundingClientRect();
    const x = (r.left - fr.left) + (r.width / 2);
    const startY = gY - (flashy ? 220 : 150);

    if (flashy) {
      spawnSparks(x, startY);
      shineCoinHud();
    }

    const c = new Coin(x, startY, gY - 2, tier, value, flashy);
    coinsOnField.push(c);
  }

  /* =======================
     Candy Drop UI
  ======================= */
  function setCandyMode(on) {
    candyArmed = on;
    candyBtn.classList.toggle("armed", on);
    hintEl.classList.toggle("hidden", !on);
  }

  candyBtn.addEventListener("click", () => {
    setCandyMode(!candyArmed);
  });

  field.addEventListener("pointerdown", (e) => {
    if (!candyArmed) return;

    // キャンディ投下：クリック位置Xで落とす
    const fr = fieldRect();
    const x = clamp(e.clientX - fr.left, 30, fr.width - 30);

    const c = new Candy(x, 10000); // ★10秒で消える
    candies.push(c);

    // モード解除
    setCandyMode(false);
  });

  /* =======================
     Init & Loop
  ======================= */
  function rebuildBunnies(n) {
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    bunnyIdSeq = 1;

    for (let i = 0; i < n; i++) bunnies.push(new Bunny());

    layoutBunnies();
    updateHud();
  }

  function layoutBunnies() {
    const fr = fieldRect();
    const gY = groundY();
    const step = Math.max(70, fr.width / Math.max(1, bunnies.length));

    bunnies.forEach((b, i) => {
      const x = 20 + step * i;
      const y = gY - 120;
      b.setBaseHome(x, y);
    });
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    // キャンディ更新＆期限切れ削除
    const now = performance.now();
    for (let i = candies.length - 1; i >= 0; i--) {
      const c = candies[i];
      c.update(dt);
      if (c.isExpired(now)) {
        c.remove();
        candies.splice(i, 1);
      }
    }

    // うさぎが集まるターゲット（最新のキャンディを優先）
    const targetCandy = candies.length ? candies[candies.length - 1] : null;
    const targetX = targetCandy ? targetCandy.x : null;

    // うさぎ更新（集合）
    for (let i = 0; i < bunnies.length; i++) {
      bunnies[i].update(dt, i, bunnies.length, targetX);
    }

    // コイン更新
    for (const c of coinsOnField) c.update(dt);

    rafId = requestAnimationFrame(tick);
  }

  function openShop(open) {
    modalBackdrop.classList.toggle("hidden", !open);
    shopModal.classList.toggle("hidden", !open);
    bunnyPriceEl.textContent = String(getBunnyPrice(bunnies.length));
  }

  function init() {
    rebuildBunnies(bunnyCount);
    updateHud();

    window.addEventListener("resize", () => layoutBunnies());

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

      // 画面上のコイン/キャンディも消す
      for (const c of coinsOnField) c.el.remove();
      coinsOnField.length = 0;

      for (const c of candies) c.remove();
      candies.length = 0;

      rebuildBunnies(bunnyCount);
    };

    setCandyMode(false);

    cancelAnimationFrame(rafId);
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  init();
})();
