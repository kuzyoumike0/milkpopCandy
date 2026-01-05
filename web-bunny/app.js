/* Bunny牧場 - app.js
   仕様:
   - 初期うさぎ2
   - 左右歩行
   - 放置(2.2〜5.0秒/匹)でコイン落下
   - クリック(1秒に1回/匹)でもコイン落下、SE poyo
   - コイン種類 coin1〜4 は「そのうさぎを最後にクリックしてからの放置時間」で決定
   - コイン回収: クリック or ホバー、SE coin
   - コインは重なる（静止時は同一地点でもOK）
   - 落下→床で小バウンド（上から落ちる見せ方）
   - ショップでうさぎ購入（価格上昇）
   - 所持コイン/うさぎ数 localStorage 保存
   - 混雑時: 自動整列 + 速度/揺れ幅調整
*/

(() => {
  const ASSETS = {
    bunny: "./assets/bunny.png",
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

  // audio (SE)
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seCoin = new Audio(ASSETS.coinSE);
  sePoyo.preload = "auto";
  seCoin.preload = "auto";

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
  function nowMs() { return performance.now(); }

  function save() {
    localStorage.setItem(LS_KEYS.coins, String(coins));
    localStorage.setItem(LS_KEYS.bunnyCount, String(bunnyCount));
  }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    bunnyValueEl.textContent = String(bunnies.length);
  }

  // うさぎ価格: base 25, 2匹目までは初期。3匹目以降から上昇
  function getBunnyPrice(nextIndex /* 0-based */) {
    // 初期2匹がいる前提。購入は3匹目から。
    const extra = Math.max(0, nextIndex - 1); // 2匹目=idx1までを初期扱い
    const base = 25;
    const growth = 1.28;
    return Math.floor(base * Math.pow(growth, extra));
  }

  // 放置時間(最後のクリックからの秒数)でコイン種を決定
  // 早い: coin1 / 溜めた: coin4
  function coinTierFromIdleSeconds(idleSec) {
    // 調整しやすい閾値
    if (idleSec >= 90) return 4;  // 1分半放置 -> coin4
    if (idleSec >= 45) return 3;  // 45秒 -> coin3
    if (idleSec >= 18) return 2;  // 18秒 -> coin2
    return 1;                     // それ未満 -> coin1
  }

  function coinValueFromTier(tier) {
    // 報酬（好みに合わせて調整OK）
    if (tier === 4) return 12;
    if (tier === 3) return 6;
    if (tier === 2) return 3;
    return 1;
  }

  function fieldRect() {
    return field.getBoundingClientRect();
  }

  function groundY() {
    // groundLine の位置を床Yにする（field内座標）
    const fr = fieldRect();
    const ground = document.getElementById("groundLine").getBoundingClientRect();
    return ground.top - fr.top;
  }

  // -----------------------
  // Bunny / Coin classes
  // -----------------------
  let bunnyIdSeq = 1;
  class Bunny {
    constructor() {
      this.id = bunnyIdSeq++;
      this.el = document.createElement("img");
      this.el.className = "bunny walk";
      this.el.src = ASSETS.bunny;
      this.el.alt = "bunny";
      this.el.draggable = false;

      // layout + motion
      this.x = 0;
      this.y = 0;
      this.homeX = 0;
      this.dir = Math.random() < 0.5 ? -1 : 1;

      this.baseSpeed = 42 + Math.random() * 18; // px/s
      this.roamRange = 70 + Math.random() * 40; // px
      this.lastClickAt = Date.now(); // 放置判定は wall-clock のほうが自然
      this.lastClickSpawnAt = 0; // performance.now()

      // auto drop schedule (performance.now)
      this.nextAutoAt = nowMs() + randomAutoIntervalMs();

      this.el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.tryClickDrop();
      });

      bunnyLayer.appendChild(this.el);
    }

    setHome(x, y) {
      this.homeX = x;
      this.y = y;
      // 初期配置はhomeへ寄せる
      if (this.x === 0 && this.y === 0) {
        this.x = x;
      }
    }

    tryClickDrop() {
      const t = nowMs();
      if (t - this.lastClickSpawnAt < 1000) return; // 1秒制限/匹

      this.lastClickSpawnAt = t;
      this.lastClickAt = Date.now(); // クリックしたので放置リセット
      playSE(sePoyo);

      spawnCoinAtBunny(this, /*reason*/"click");
    }

    update(dt) {
      // auto coin
      const t = nowMs();
      if (t >= this.nextAutoAt) {
        this.nextAutoAt = t + randomAutoIntervalMs();
        spawnCoinAtBunny(this, /*reason*/"auto");
      }

      // crowd-based adjustment
      const crowd = bunnies.length;
      const speedMul = crowd <= 6 ? 1 : Math.max(0.32, 1 / Math.sqrt(crowd / 6));
      const rangeMul = crowd <= 6 ? 1 : Math.max(0.28, 1 / (crowd / 6));

      const spd = this.baseSpeed * speedMul;
      const roam = this.roamRange * rangeMul;

      // walk left-right within [homeX-roam, homeX+roam]
      this.x += this.dir * spd * dt;

      const minX = this.homeX - roam;
      const maxX = this.homeX + roam;

      if (this.x < minX) { this.x = minX; this.dir = 1; }
      if (this.x > maxX) { this.x = maxX; this.dir = -1; }

      // flip
      if (this.dir < 0) this.el.classList.add("flip");
      else this.el.classList.remove("flip");

      // render
      this.el.style.left = `${this.x}px`;
      this.el.style.top = `${this.y}px`;
    }

    footPos() {
      // 足元座標（field内）
      const r = this.el.getBoundingClientRect();
      const fr = fieldRect();
      const x = (r.left - fr.left) + r.width * 0.5;
      const y = (r.top - fr.top) + r.height * 0.92;
      return { x, y };
    }

    idleSeconds() {
      return Math.max(0, (Date.now() - this.lastClickAt) / 1000);
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

      // physics (field coords)
      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      this.vx = (Math.random() * 2 - 1) * 10;     // slight drift
      this.vy = 0;
      this.gravity = 2100;                        // px/s^2
      this.bounce = 0.38;                         // coefficient
      this.friction = 0.86;

      this.resting = false;

      this.el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collect();
      });

      // hover collect
      this.el.addEventListener("pointerenter", () => {
        this.collect();
      });

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

      // remove
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

        // floor collision
        if (this.y >= this.yFloor) {
          this.y = this.yFloor;

          // bounce or rest
          if (Math.abs(this.vy) > 260) {
            this.vy = -this.vy * this.bounce;
            this.vx *= this.friction;
            // 작은 랜덤で 겹침演出を自然に
            this.vx += (Math.random() * 2 - 1) * 18;
          } else {
            this.vy = 0;
            this.vx = 0;
            this.resting = true;
          }
        }
      }

      this.render();
    }

    render() {
      // coin element is centered
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;
      // slight squash when near floor for feel
      if (!this.resting && this.y > this.yFloor - 16) {
        this.el.style.transform = `scale(1.05,0.95)`;
      } else {
        this.el.style.transform = `scale(1,1)`;
      }
    }
  }

  function randomAutoIntervalMs() {
    // 2.2〜5.0秒
    return 2200 + Math.random() * 2800;
  }

  // -----------------------
  // Spawning / Layout
  // -----------------------
  function spawnCoinAtBunny(bunny, reason) {
    // tier depends on "idle time since last click on that bunny"
    const tier = coinTierFromIdleSeconds(bunny.idleSeconds());
    const value = coinValueFromTier(tier);

    const fr = fieldRect();
    const gY = groundY();

    // ensure bunny rect is known
    const bRect = bunny.el.getBoundingClientRect();
    const bXCenter = (bRect.left - fr.left) + bRect.width * 0.5;

    // foot y as floor target (a bit above ground line)
    const floorY = gY - 2;

    // start from above (落下見せ方)
    const startY = floorY - 140 - Math.random() * 70;

    // little x jitter so coins can overlap but not perfectly
    const x = bXCenter + (Math.random() * 2 - 1) * 10;

    const c = new Coin(x, startY, floorY, tier, value);
    coinsOnField.push(c);
  }

  function rebuildBunnies(count) {
    // clear existing DOM
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    bunnyIdSeq = 1;

    for (let i = 0; i < count; i++) {
      bunnies.push(new Bunny());
    }
    layoutBunnies();
    updateHud();
  }

  function layoutBunnies() {
    const fr = fieldRect();
    const gY = groundY();

    // bunny size approx (use first if available)
    const bunnyW = 96; // css
    const bunnyH = 96;

    // usable area
    const paddingX = 16;
    const topY = 30;
    const floorY = gY - bunnyH * 0.95;

    // auto grid depending on count
    const n = bunnies.length;

    // rows: increase as n grows to prevent overlap
    // (床は同じでも見た目として上下に少しずらして整列)
    const maxPerRow = Math.max(3, Math.floor((fr.width - paddingX * 2) / (bunnyW * 0.95)));
    const rows = Math.ceil(n / maxPerRow);

    // vertical step small so it still looks like ground group
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

  // -----------------------
  // Loop
  // -----------------------
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    for (const b of bunnies) b.update(dt);
ifeildSafe();
    for (const c of coinsOnField) c.update(dt);

    rafId = requestAnimationFrame(tick);
  }

  // guard: keep coins inside field width a bit
  function RClampCoins() {
    const fr = fieldRect();
    for (const c of coinsOnField) {
      c.x = clamp(c.x, 18, fr.width - 18);
    }
  }
  function RClampBunnies() {
    const fr = fieldRect();
    for (const b of bunnies) {
      b.homeX = clamp(b.homeX, 40, fr.width - 40);
      b.x = clamp(b.x, 0, fr.width - 96);
    }
  }
  function RUpdateLayouts() {
    layoutBunnies();
    RClampBunnies();
    RClampCoins();
  }
  function RDebounce(fn, wait = 150) {
    let t = 0;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }
  const onResize = RDebounce(RUpdateLayouts, 120);

  function ieldSafe() {
    // placeholder for older typo-proof (no-op)
  }

  function init() {
    // register SW
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
        // simple feedback
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
      save();

      // remove field coins
      for (const c of [...coinsOnField]) c.collect(); // collect does add coins, so we must instead hard remove
      // undo: above would add coins, so do manual clear
      coins = 0;
      save();
      coinLayer.innerHTML = "";
      coinsOnField.length = 0;

      rebuildBunnies(bunnyCount);
      updateShopUI();
      updateHud();
    });

    // Start loop
    lastFrame = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function updateShopUI() {
    const price = getBunnyPrice(bunnies.length);
    bunnyPriceEl.textContent = String(price);
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

  init();
})();
