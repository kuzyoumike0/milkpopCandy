(() => {
  /* =========================
   * CONFIG / ASSETS
   * ========================= */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    babyBunny: "./assets/babybunny.png",
    babySE: "./assets/babybunny.mp3",
    poyoSE: "./assets/poyo.mp3",
    coinSE: "./assets/coin.mp3",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;

  const BABY_FOLLOW_GAP = 46;
  const BABY_FOLLOW_FORCE = 6.0;
  const BABY_FOLLOW_MAX = 160;

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

  const playSE = (a) => {
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  };

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

  function updateHUD() {
    coinValueEl.textContent = coins;
  }

  /* =========================
   * SPARK（虹）
   * ========================= */
  function spawnSparks(x, y, count = 10, spread = 80, rainbow = false) {
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
      // ★生成時にピョン（上向き初速）
      this.vy = -(flashy ? 520 : 420);

      this.gravity = 2400;

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
      updateHUD();
      playSE(seCoin);
      this.el.remove();

      const i = coinsOnField.indexOf(this);
      if (i >= 0) coinsOnField.splice(i, 1);
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;
      if (this.y >= this.yFloor) {
        this.y = this.yFloor;
        this.vy = 0;
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top = `${this.y - 22}px`;
    }
  }

  function spawnCoinAtBunny(bunny) {
    let tier = 1;
    let value = 1;

    if (!bunny.isBaby && Math.random() < 0.2) {
      tier = 2;
      value = 5;
    }

    const fr = fieldRect();
    const yFloor = groundY();
    const r = bunny.wrap.getBoundingClientRect();
    const x = r.left - fr.left + r.width / 2;

    const c = new Coin(x, yFloor - 140, yFloor - 2, tier, value);
    coinsOnField.push(c);
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

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = rand(40, fieldRect().width - 180);
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;
      this.vx = 0;

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", () => {
        playSE(this.isBaby ? seBaby : sePoyo);
        spawnCoinAtBunny(this);
      });
    }

    syncSprite() {
      this.el.src = this.isBaby ? ASSETS.babyBunny : ASSETS.bunny;
      this.wrap.classList.toggle("baby", this.isBaby);
    }

    updateEvolve() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt >= BABY_DURATION_MS) {
        this.isBaby = false;
        this.syncSprite();

        const fr = fieldRect();
        const r = this.wrap.getBoundingClientRect();
        spawnSparks(
          r.left - fr.left + r.width / 2,
          r.top - fr.top + r.height / 2,
          EVOLVE_SPARK_COUNT,
          90,
          true
        );

        this.vx = 0;
      }
    }

    // ★baby行列：大人 or 先に生まれたbaby をリーダーにする（最寄り）
findLeaderForBaby() {
  let best = null;
  let bestD = Infinity;

  for (const b of bunnies) {
    if (b === this) continue;

    // babyは「大人」か「自分より先に生まれたbaby」を追う
    const canLead =
      (!b.isBaby) || (b.isBaby && (b.bornAt < this.bornAt));

    if (!canLead) continue;

    const d = Math.abs(b.x - this.x);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}


    update(dt) {
      this.updateEvolve();

      const fr = fieldRect();
      const bunnySize =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bunnySize")
        ) || 140;

      const minX = 0;
      const maxX = Math.max(0, fr.width - bunnySize);

      if (this.isBaby) {
        const leader = this.findLeaderForBaby();

        if (leader) {
          const desiredX = leader.x - leader.dir * BABY_FOLLOW_GAP;
          const dx = desiredX - this.x;

          const targetV = clamp(
            dx * BABY_FOLLOW_FORCE,
            -BABY_FOLLOW_MAX,
            BABY_FOLLOW_MAX
          );

          this.vx = clamp(
            targetV,
            -this.baseSpeed * 2,
            this.baseSpeed * 2
          );

          this.x += this.vx * dt;

          if (Math.abs(this.vx) > 5) this.dir = this.vx >= 0 ? 1 : -1;
          else this.dir = leader.dir;
        } else {
          this.x += this.dir * this.baseSpeed * BABY_SPEED_MUL * dt;
        }
      } else {
        this.x += this.dir * this.baseSpeed * dt;
      }

      // 端で折り返す
      if (this.x <= minX) {
        this.x = minX;
        this.dir = 1;
      }
      if (this.x >= maxX) {
        this.x = maxX;
        this.dir = -1;
      }

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }
  }

  /* =========================
   * LOOP
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    bunnies.forEach((b) => b.update(dt));
    coinsOnField.forEach((c) => c.update(dt));

    requestAnimationFrame(tick);
  }

  /* =========================
   * UI
   * ========================= */
  shopBtn.onclick = () => {
    if (coins < 10) return;
    coins -= 10;
    updateHUD();
    bunnies.push(new Bunny(Date.now()));
  };

  /* =========================
   * START
   * ========================= */
  function init() {
    bunnies.push(
      new Bunny(Date.now() - BABY_DURATION_MS - 1000),
      new Bunny(Date.now() - BABY_DURATION_MS - 2000)
    );
    updateHUD();
    requestAnimationFrame(tick);
  }

  init();
})();
