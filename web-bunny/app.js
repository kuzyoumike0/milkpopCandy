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

  const shopBtn = document.getElementById("shopBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const shopModal = document.getElementById("shopModal");
  const closeShopBtn = document.getElementById("closeShopBtn");
  const bunnyPriceEl = document.getElementById("bunnyPrice");
  const buyBunnyBtn = document.getElementById("buyBunnyBtn");

  // -----------------------
  // State
  // -----------------------
  let coins = safeInt(localStorage.getItem(LS_KEYS.coins), 0);
  let bunnyCount = clamp(safeInt(localStorage.getItem(LS_KEYS.bunnyCount), 2), 2, 9999);

  /** @type {Array<Bunny>} */
  const bunnies = [];
  /** @type {Array<Coin>} */
  const coinsOnField = [];

  let lastFrame = performance.now();
  let rafId = 0;

  // -----------------------
  // Audio
  // -----------------------
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
      const p = sePoyo.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          sePoyo.pause();
          sePoyo.currentTime = 0;
          sePoyo.muted = false;
        }).catch(() => { sePoyo.muted = false; });
      } else {
        sePoyo.pause();
        sePoyo.currentTime = 0;
        sePoyo.muted = false;
      }
    } catch (_) {}
  }

  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(aud) {
    try {
      aud.currentTime = 0;
      const p = aud.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  // -----------------------
  // Helpers
  // -----------------------
  function safeInt(v, def) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : def;
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function save() {
    localStorage.setItem(LS_KEYS.coins, String(coins));
    localStorage.setItem(LS_KEYS.bunnyCount, String(bunnyCount));
  }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    bunnyValueEl.textContent = String(bunnies.length);
  }

  function getBunnyPrice(nextIndex /* 0-based */) {
    const extra = Math.max(0, nextIndex - 1);
    const base = 25;
    const growth = 1.28;
    return Math.floor(base * Math.pow(growth, extra));
  }

  // 放置判定（最後のクリックから）で coin1〜4 の“ベース”
  function coinTierFromIdleSeconds(idleSec) {
    if (idleSec >= 90) return 4;
    if (idleSec >= 45) return 3;
    if (idleSec >= 18) return 2;
    return 1;
  }

  // ★満タン時のレア確率UP（coin3/coin4に寄せる）
  function applyRareBoost(baseTier) {
    // baseTierから“上げる”抽選（最大4）
    // 体感：満タン時は coin3〜4 がかなり出る
    const r = Math.random();

    let up = 0;
    if (r < 0.10) up = 3;       // 10%：+3（ほぼcoin4）
    else if (r < 0.35) up = 2;  // 25%：+2
    else if (r < 0.75) up = 1;  // 40%：+1
    else up = 0;               // 25%：据え置き

    return clamp(baseTier + up, 1, 4);
  }

  function coinValueFromTier(tier) {
    if (tier === 4) return 12;
    if (tier === 3) return 6;
    if (tier === 2) return 3;
    return 1;
  }

  function fieldRect() {
    return field.getBoundingClientRect();
  }

  function groundY() {
    const fr = fieldRect();
    const groundLine = document.getElementById("groundLine").getBoundingClientRect();
    return groundLine.top - fr.top;
  }

  // ゲージ満タンまで：2.2〜5.0秒（個体ごとに変える）
  function randomGaugeSeconds() {
    return 2.2 + Math.random() * 2.8;
  }

  function getEdgeVisibleRatio() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--edgeVisibleRatio").trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? clamp(n, 0.2, 0.95) : 0.55;
  }

  // -----------------------
  // Bunny / Coin classes
  // -----------------------
  let bunnyIdSeq = 1;

  class Bunny {
    constructor() {
      this.id = bunnyIdSeq++;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      // gauge
      this.gaugeWrap = document.createElement("div");
      this.gaugeWrap.className = "bunnyGauge";
      this.gaugeFill = document.createElement("div");
      this.gaugeFill.className = "bunnyGaugeFill";
      this.gaugeWrap.appendChild(this.gaugeFill);

      // heart
      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;
      this.heart.alt = "heart";
      this.heart.draggable = false;

      // bunny
      this.el = document.createElement("img");
      this.el.className = "bunny walk";
      this.el.src = ASSETS.bunny;
      this.el.alt = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.gaugeWrap);
      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = 0;
      this.y = 0;
      this.homeX = 0;

      // walk individuality
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 65;
      this.roamRange = 90 + Math.random() * 260;
      this.turnChancePerSec = 0.08 + Math.random() * 0.35;
      this.pauseChancePerSec = 0.02 + Math.random() * 0.12;
      this.pauseLeft = 0;

      // gauge (fills while idle, NO auto drop)
      this.gauge = Math.random() * 0.25;
      this.gaugePeriod = randomGaugeSeconds();
      this.charged = false;

      // idle time for tier base
      this.lastClickAt = Date.now();

      // click cooldown (1s/匹)
      this.lastClickSpawnAt = 0;

      this.lastHopAt = 0;

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        unlockAudioOnce();
        this.tryClickDrop();
      }, { capture: true });

      this.renderGauge();
      this.updateChargeUI();
    }

    bunnyW() {
      return this.wrap.getBoundingClientRect().width || 140;
    }

    setHome(x, y) {
      const fr = fieldRect();
      const w = this.bunnyW();
      const visible = getEdgeVisibleRatio();

      const minX = -(w * (1 - visible));
      const maxX = fr.width - (w * visible);

      this.homeX = clamp(x, minX, maxX);
      this.y = y;

      if (this.x === 0 && this.y === 0) this.x = this.homeX;
    }

    hop() {
      const t = performance.now();
      if (t - this.lastHopAt < 260) return;
      this.lastHopAt = t;

      this.el.classList.remove("hop");
      void this.el.offsetWidth;
      this.el.classList.add("hop");
    }

    showHeartPop() {
      // readyを外してからポップ
      this.heart.classList.remove("ready");
      this.heart.classList.remove("show");
      void this.heart.offsetWidth;
      this.heart.classList.add("show");
    }

    updateChargeUI() {
      if (this.charged) this.heart.classList.add("ready");
      else this.heart.classList.remove("ready");
    }

    renderGauge() {
      const p = clamp(this.gauge, 0, 1);
      this.gaugeFill.style.width = `${Math.round(p * 100)}%`;
    }

    idleSeconds() {
      return Math.max(0, (Date.now() - this.lastClickAt) / 1000);
    }

    // ★放置でゲージだけ貯まる（満タンで止まる）
    updateGauge(dt) {
      if (this.charged) return;

      this.gauge += dt / this.gaugePeriod;

      if (this.gauge >= 1) {
        this.gauge = 1;
        this.charged = true;
        this.updateChargeUI();
      }
      this.renderGauge();
    }

    // ★クリックでコイン（満タンならレアUPして消費）
    tryClickDrop() {
      const t = performance.now();
      if (t - this.lastClickSpawnAt < 1000) return;

      this.lastClickSpawnAt = t;

      // クリックしたら「放置タイマー」は更新（従来仕様）
      this.lastClickAt = Date.now();

      playSE(sePoyo);

      const wasCharged = this.charged;

      // 満タンなら：消費してゲージリセット
      if (wasCharged) {
        this.charged = false;
        this.gauge = 0;
        this.gaugePeriod = randomGaugeSeconds();
        this.renderGauge();
        this.showHeartPop();
        this.updateChargeUI();
      }

      spawnCoinAtBunny(this, { rareBoost: wasCharged });
    }

    update(dt) {
      // 放置で貯まる（自動ドロップしない）
      this.updateGauge(dt);

      // crowd adjust
      const crowd = bunnies.length;
      const speedMul = crowd <= 6 ? 1 : Math.max(0.32, 1 / Math.sqrt(crowd / 6));
      const rangeMul = crowd <= 6 ? 1 : Math.max(0.28, 1 / (crowd / 6));

      const spd = this.baseSpeed * speedMul;

      const fr = fieldRect();
      const w = this.bunnyW();
      const visible = getEdgeVisibleRatio();

      const edgeMinX = -(w * (1 - visible));
      const edgeMaxX = fr.width - (w * visible);

      const maxRoam = Math.max(20, (fr.width - w) / 2);
      const roam = Math.min(this.roamRange * rangeMul, maxRoam);

      if (this.pauseLeft > 0) {
        this.pauseLeft -= dt;
      } else {
        if (Math.random() < this.pauseChancePerSec * dt) this.pauseLeft = 0.15 + Math.random() * 0.9;
        if (Math.random() < this.turnChancePerSec * dt) this.dir *= -1;
        this.x += this.dir * spd * dt;
      }

      const minX = clamp(this.homeX - roam, edgeMinX, edgeMaxX);
      const maxX = clamp(this.homeX + roam, edgeMinX, edgeMaxX);

      let hitEdge = false;

      if (this.x < minX) { this.x = minX; this.dir = 1; hitEdge = true; }
      if (this.x > maxX) { this.x = maxX; this.dir = -1; hitEdge = true; }

      if (this.x <= edgeMinX) { this.x = edgeMinX; this.dir = 1; hitEdge = true; }
      if (this.x >= edgeMaxX) { this.x = edgeMaxX; this.dir = -1; hitEdge = true; }

      if (hitEdge) this.hop();

      if (this.dir < 0) this.wrap.classList.add("flip");
      else this.wrap.classList.remove("flip");

      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }
  }

  class Coin {
    constructor(x, yStart, yFloor, tier, value) {
      this.tier = tier;
      this.value = value;
      this.collected = false;

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.alt = `coin${tier}`;
      this.el.draggable = false;

      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      this.vx = (Math.random() * 2 - 1) * 10;
      this.vy = 0;
      this.gravity = 2100;
      this.bounce = 0.38;
      this.friction = 0.86;
      this.resting = false;

      this.el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collect();
      });
      this.el.addEventListener("pointerenter", () => this.collect());

      coinLayer.appendChild(this.el);
      this.render();
    }

    collect() {
      if (this.collected) return;
      this.collected = true;

      coins += this.value;
      save();
      updateHud();
      playSE(seCoin);

      this.el.remove();
      const idx = coinsOnField.indexOf(this);
      if (idx >= 0) coinsOnField.splice(idx, 1);
    }

    update(dt) {
      if (this.collected) return;

      if (!this.resting) {
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.y >= this.yFloor) {
          this.y = this.yFloor;

          if (Math.abs(this.vy) > 260) {
            this.vy = -this.vy * this.bounce;
            this.vx *= this.friction;
            this.vx += (Math.random() * 2 - 1) * 18;
          } else {
            this.vy = 0;
            this.vx = 0;
            this.resting = true;
          }
        }
      }

      const fr = fieldRect();
      this.x = clamp(this.x, 22, fr.width - 22);

      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;

      if (!this.resting && this.y > this.yFloor - 16) this.el.style.transform = `scale(1.05,0.95)`;
      else this.el.style.transform = `scale(1,1)`;
    }
  }

  function spawnCoinAtBunny(bunny, opts) {
    const rareBoost = !!opts?.rareBoost;

    // ベースtierは「最後のクリックからの放置時間」
    const baseTier = coinTierFromIdleSeconds(bunny.idleSeconds());
    const tier = rareBoost ? applyRareBoost(baseTier) : baseTier;
    const value = coinValueFromTier(tier);

    const fr = fieldRect();
    const gY = groundY();

    const bRect = bunny.wrap.getBoundingClientRect();
    const bXCenter = (bRect.left - fr.left) + bRect.width * 0.5;

    const floorY = gY - 2;
    const startY = floorY - 140 - Math.random() * 70;
    const x = bXCenter + (Math.random() * 2 - 1) * 10;

    const c = new Coin(x, startY, floorY, tier, value);
    coinsOnField.push(c);
  }

  function rebuildBunnies(count) {
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    bunnyIdSeq = 1;

    for (let i = 0; i < count; i++) bunnies.push(new Bunny());

    layoutBunnies();
    updateHud();
  }

  function layoutBunnies() {
    const fr = fieldRect();
    const gY = groundY();

    const probe = bunnies[0]?.wrap?.getBoundingClientRect();
    const bunnyW = probe?.width || 140;
    const bunnyH = probe?.height || 140;

    const paddingX = 16;
    const floorY = gY - bunnyH * 0.95;

    const n = bunnies.length;

    const maxPerRow = Math.max(3, Math.floor((fr.width - paddingX * 2) / (bunnyW * 0.95)));
    const rows = Math.ceil(n / maxPerRow);
    const rowStep = Math.min(44, Math.max(22, 120 / Math.max(1, rows)));

    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / maxPerRow);
      const col = i % maxPerRow;

      const colsInThisRow = (row === rows - 1) ? (n - row * maxPerRow) : maxPerRow;
      const spanW = fr.width - paddingX * 2;
      const gap = colsInThisRow <= 1 ? 0 : spanW / (colsInThisRow - 1);

      const homeX = paddingX + (colsInThisRow <= 1 ? spanW / 2 : col * gap);
      const y = floorY - row * rowStep;

      bunnies[i].setHome(homeX, y);
    }
  }

  function debounce(fn, wait = 150) {
    let t = 0;
    return () => { clearTimeout(t); t = setTimeout(fn, wait); };
  }
  const onResize = debounce(() => layoutBunnies(), 120);

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    for (const b of bunnies) b.update(dt);
    for (const c of coinsOnField) c.update(dt);

    rafId = requestAnimationFrame(tick);
  }

  function updateShopUI() {
    bunnyPriceEl.textContent = String(getBunnyPrice(bunnies.length));
  }

  function openShop(open) {
    if (open) {
      updateShopUI();
      modalBackdrop.classList.remove("hidden");
      shopModal.classList.remove("hidden");
    } else {
      modalBackdrop.classList.add("hidden");
      shopModal.classList.add("hidden");
    }
  }

  function init() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    rebuildBunnies(bunnyCount);
    updateHud();
    updateShopUI();

    window.addEventListener("resize", onResize);

    shopBtn.addEventListener("click", () => openShop(true));
    closeShopBtn.addEventListener("click", () => openShop(false));
    modalBackdrop.addEventListener("click", () => openShop(false));

    buyBunnyBtn.addEventListener("click", () => {
      const price = getBunnyPrice(bunnies.length);
      if (coins < price) {
        buyBunnyBtn.textContent = "コイン不足…";
        setTimeout(() => (buyBunnyBtn.textContent = "購入"), 650);
        return;
      }

      coins -= price;
      bunnyCount = bunnies.length + 1;
      save();

      rebuildBunnies(bunnyCount);
      updateShopUI();
    });

    resetBtn.addEventListener("click", () => {
      if (!confirm("所持コイン・うさぎ数をリセットしますか？")) return;

      coins = 0;
      bunnyCount = 2;

      for (const c of coinsOnField) c.el.remove();
      coinsOnField.length = 0;
      coinLayer.innerHTML = "";

      save();
      rebuildBunnies(bunnyCount);
      updateShopUI();
      updateHud();
    });

    lastFrame = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  init();
})();
