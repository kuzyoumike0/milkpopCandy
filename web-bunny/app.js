(() => {
  /* =========================
   * ASSETS / CONST
   * ========================= */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",
    candy: "./assets/candy.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.68;

  const BABY_FOLLOW_GAP = 48;
  const BABY_FOLLOW_FORCE = 6.5;
  const BABY_FOLLOW_MAX = 170;

  const EVOLVE_SPARK_COUNT = 14;

  /* =========================
   * DOM
   * ========================= */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");

  const coinValueEl = document.getElementById("coinValue");
  const shopBtn = document.getElementById("shopBtn");

  /* =========================
   * STATE
   * ========================= */
  let coins = 0;
  const bunnies = [];
  const coinsOnField = [];

  let lastFrame = performance.now();

  /* =========================
   * AUDIO
   * ========================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  function playSE(a) {
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  }

  /* =========================
   * UTILS
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function fieldRect() {
    return field.getBoundingClientRect();
  }
  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine").getBoundingClientRect();
    return gl.top - fr.top;
  }
  function updateHud() {
    coinValueEl.textContent = coins;
  }

  /* =========================
   * SPARK（虹対応）
   * ========================= */
  function spawnSparks(x, y, count = 8, spread = 70, rainbow = false) {
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.className = "spark show";
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${(Math.random() * 2 - 1) * spread}px`);
      s.style.setProperty("--dy", `${(Math.random() * 2 - 1) * spread - 30}px`);

      if (rainbow) {
        const h = Math.floor(Math.random() * 360);
        s.style.background = `hsla(${h},90%,78%,0.9)`;
        s.style.boxShadow = `0 0 14px hsla(${h},90%,78%,0.6)`;
      } else {
        s.style.background = "rgba(255,255,255,0.9)";
      }

      coinLayer.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  /* =========================
   * COIN
   * ========================= */
  class Coin {
    constructor(x, yStart, yFloor, tier, value) {
      this.value = value;
      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      this.vx = (Math.random() * 2 - 1) * (20 + tier * 6);
      this.vy = 80 + Math.random() * 260;
      this.gravity = 2200;
      this.bounce = 0.28 + Math.random() * 0.1;

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.draggable = false;

      this.el.addEventListener("pointerenter", () => this.collect());
      this.el.addEventListener("click", () => this.collect());

      coinLayer.appendChild(this.el);
      this.render();
    }

    collect() {
      coins += this.value;
      updateHud();
      playSE(seCoin);
      this.el.remove();

      const i = coinsOnField.indexOf(this);
      if (i >= 0) coinsOnField.splice(i, 1);
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y >= this.yFloor) {
        this.y = this.yFloor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
        } else {
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;
    }
  }

  function coinValueFromTier(t) {
    if (t === 4) return 100;
    if (t === 3) return 10;
    if (t === 2) return 5;
    return 1;
  }

  function gaugeToTier(g) {
    return clamp(Math.ceil(g * 4), 1, 4);
  }

  /* =========================
   * ★大量レイン版
   * ========================= */
 function gaugeToTier(g) {
  return clamp(Math.ceil(clamp(g, 0, 1) * 4), 1, 4);
}

// ★大量・混合・うさぎから落ちる（バラ撒き）
function spawnCoinsByGauge(bunny, gauge01) {
  const maxTier = gaugeToTier(gauge01);

  // 大量（好みに応じてさらに増やしてOK）
  const countByTier = [0, 10, 18, 28, 44]; // tier4は44枚
  const count = countByTier[maxTier];

  // tier混合の重み（上のtierほど出やすい）
  const weightsByMax = {
    1: [0, 1],
    2: [0, 1, 2],
    3: [0, 1, 2, 3],
    4: [0, 1, 2, 3, 6],
  };

  function pickTierMixed(maxT) {
    const w = weightsByMax[maxT];
    let sum = 0;
    for (let t = 1; t <= maxT; t++) sum += w[t];
    let roll = Math.random() * sum;
    for (let t = 1; t <= maxT; t++) {
      roll -= w[t];
      if (roll <= 0) return t;
    }
    return maxT;
  }

  const fr = fieldRect();
  const gY = groundY();

  // うさぎ位置（足元寄り）
  const r = bunny.wrap.getBoundingClientRect();
  const baseX = (r.left - fr.left) + r.width * 0.5;
  const baseY = (r.top - fr.top) + r.height * 0.78;

  // 散りの強さ
  const spreadX = 60 + maxTier * 30;
  const upKick = 420 + maxTier * 90; // 上に跳ねる強さ

  for (let i = 0; i < count; i++) {
    const delay = i * (10 + Math.random() * 14); // 連射っぽく

    setTimeout(() => {
      const tier = pickTierMixed(maxTier);
      const value = coinValueFromTier(tier);

      // うさぎの足元付近から少し散らす
      const x = baseX + (Math.random() * 2 - 1) * spreadX;
      const startY = Math.min(gY - 10, baseY + (Math.random() * 2 - 1) * 14);

      const c = new Coin(x, startY, gY - 2, tier, value, false);

      // ★「落とすときはねる」：最初に上方向へピョン
      c.vy = -(upKick * (0.65 + Math.random() * 0.55));
      c.vx = (Math.random() * 2 - 1) * (40 + tier * 10);

      // ★地面で軽く弾む（雨粒っぽさ）
      c.bounce = 0.28 + Math.random() * 0.14;

      coinsOnField.push(c);

      // ちょいキラ
      if (tier >= 3 && Math.random() < 0.25) {
        spawnSparks(x, gY - 40, 3, 30, false);
      }
    }, delay);
  }
}

  /* =========================
   * BUNNY
   * ========================= */
  class Bunny {
    constructor(bornAt) {
      this.bornAt = bornAt;
      this.isBaby = Date.now() - bornAt < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.src = this.isBaby ? ASSETS.babyBunny : ASSETS.bunny;

      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = rand(40, fieldRect().width - 180);
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;

      this.gauge = 0;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.charged = false;

      this.wrap.addEventListener("pointerdown", () => this.tryClickDrop());
    }

    updateGauge(dt) {
      if (this.isBaby) {
        this.gauge = 0;
        this.charged = false;
        this.heart.classList.remove("show");
        return;
      }

      if (!this.charged) {
        this.gauge += dt / this.gaugePeriod;
        if (this.gauge >= 1) {
          this.gauge = 1;
          this.charged = true;
        }
      }

      if (this.charged) this.heart.classList.add("show");
      else this.heart.classList.remove("show");
    }

    tryClickDrop() {
      playSE(this.isBaby ? seBaby : sePoyo);

      if (this.isBaby) {
        const r = this.wrap.getBoundingClientRect();
        const fr = fieldRect();
        const x = r.left - fr.left + r.width / 2;
        const gY = groundY();
        const c = new Coin(x, gY - 160, gY - 2, 1, 1);
        coinsOnField.push(c);
        return;
      }

      const g = this.gauge;
      spawnCoinsByGauge(this, g);

      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.heart.classList.remove("show");
    }

    update(dt) {
      this.updateGauge(dt);

      this.x += this.dir * this.baseSpeed * (this.isBaby ? BABY_SPEED_MUL : 1) * dt;

      const fr = fieldRect();
      const bunnySize = 140;
      if (this.x <= 0) this.dir = 1;
      if (this.x >= fr.width - bunnySize) this.dir = -1;

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }
  }

  /* =========================
   * LOOP / INIT
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    bunnies.forEach((b) => b.update(dt));
    coinsOnField.forEach((c) => c.update(dt));

    requestAnimationFrame(tick);
  }

  function init() {
    bunnies.push(
      new Bunny(Date.now() - BABY_DURATION_MS - 1000),
      new Bunny(Date.now() - BABY_DURATION_MS - 2000)
    );
    updateHud();
    requestAnimationFrame(tick);
  }

  init();
})();
