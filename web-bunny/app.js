(() => {
  /* =========================
   * CONST / DEFINITIONS
   * ========================= */

  const ASSETS = {
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

  // ★うさぎ定義（増やすならここだけ）
  const BUNNY_DEFS = {
    bunny1: {
      label: "bunny1",
      img: "./assets/bunny1.png",
      price: 25,
      coinMul: 0.5,
      desc: "基本のうさぎ。コインは控えめ。",
    },
    bunny3: {
      label: "bunny3",
      img: "./assets/bunny3.png",
      price: 120,
      coinMul: 1.0,
      desc: "安定してコインを稼ぐ中級うさぎ。",
    },
    bunny4: {
      label: "bunny4",
      img: "./assets/bunny4.png",
      price: 300,
      coinMul: 1.8,
      desc: "大量のコインを生み出す上級うさぎ。",
    },
    bunny5: {
      label: "bunny5",
      img: "./assets/bunny5.png",
      price: 600,
      coinMul: 2.8,
      desc: "牧場最上級クラス。圧倒的生産力。",
    },
    reabunny: {
      label: "reabunny",
      img: "./assets/reabunny.png",
      price: 0,
      coinMul: 4.0,
      desc: "突然変異でのみ現れる幻のうさぎ。",
    },
  };

  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;

  const REA_EVOLVE_RATE = 0.01; // ★突然変異率
  const UNLOCK_BUNNY4_NEED = 10;

  const LS = {
    coins: "wb_coins",
    bunnies: "wb_bunnies",
    ach: "wb_ach",
  };

  /* =========================
   * DOM
   * ========================= */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  const shopBtn = document.getElementById("shopBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn = document.getElementById("resetBtn");

  /* =========================
   * STATE
   * ========================= */
  let coins = loadCoins();
  let ach = loadAch();
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
   * STORAGE
   * ========================= */
  function loadCoins() {
    return parseInt(localStorage.getItem(LS.coins) || "0", 10) || 0;
  }
  function saveCoins() {
    localStorage.setItem(LS.coins, coins);
  }

  function loadAch() {
    try {
      return JSON.parse(localStorage.getItem(LS.ach)) || {};
    } catch {
      return {};
    }
  }
  function saveAch() {
    localStorage.setItem(LS.ach, JSON.stringify(ach));
  }

  function loadBunnyMeta() {
    try {
      return JSON.parse(localStorage.getItem(LS.bunnies)) || null;
    } catch {
      return null;
    }
  }
  function saveBunnyMeta() {
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map(b => ({ bornAt: b.bornAt, kind: b.kind })))
    );
  }

  /* =========================
   * UTIL
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function fieldRect() {
    return field.getBoundingClientRect();
  }
  function groundY() {
    return fieldRect().height - 60;
  }
  function updateHud() {
    coinValueEl.textContent = coins;
  }

  /* =========================
   * ACHIEVEMENT
   * ========================= */
  function unlock(id) {
    if (ach[id]) return;
    ach[id] = true;
    saveAch();
    alert("実績解除！");
  }

  function checkUnlocks() {
    if (!ach.unlock_bunny4 && bunnies.length >= UNLOCK_BUNNY4_NEED) {
      unlock("unlock_bunny4");
    }
  }

  /* =========================
   * COIN
   * ========================= */
  function coinValueFromTier(t) {
    return [1, 5, 10, 100][t - 1];
  }

  class Coin {
    constructor(x, y, tier) {
      this.value = coinValueFromTier(tier);
      this.x = x;
      this.y = y;
      this.vy = -400 - Math.random() * 200;
      this.gravity = 2200;
      this.floor = groundY();

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.addEventListener("pointerenter", () => this.collect());
      coinLayer.appendChild(this.el);
    }

    collect() {
      coins += this.value;
      saveCoins();
      updateHud();
      playSE(seCoin);
      this.el.remove();
      coinsOnField.splice(coinsOnField.indexOf(this), 1);
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;
      if (this.y > this.floor) this.y = this.floor;
      this.el.style.left = `${this.x}px`;
      this.el.style.top = `${this.y}px`;
    }
  }

  function spawnCoins(bunny, gauge) {
    const def = BUNNY_DEFS[bunny.kind];
    const base = [0, 8, 14, 22, 36][Math.ceil(gauge * 4)];
    const count = Math.max(1, Math.floor(base * def.coinMul));

    const r = bunny.wrap.getBoundingClientRect();
    const fr = fieldRect();
    const x0 = r.left - fr.left + r.width / 2;
    const y0 = r.top - fr.top + r.height * 0.8;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const tier = 1 + Math.floor(Math.random() * Math.min(4, Math.ceil(gauge * 4)));
        const c = new Coin(x0 + rand(-40, 40), y0, tier);
        coinsOnField.push(c);
      }, i * 12);
    }
  }

  /* =========================
   * BUNNY
   * ========================= */
  class Bunny {
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = bornAt;
      this.kind = kind;
      this.isBaby = Date.now() - bornAt < BABY_DURATION_MS;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;

      this.el = document.createElement("img");
      this.el.className = "bunny";

      this.wrap.append(this.heart, this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = rand(40, fieldRect().width - 160);
      this.y = groundY() - 120;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.speed = rand(40, 70);

      this.gauge = 0;
      this.gaugePeriod = rand(6, 12);

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", () => this.onClick());
    }

    syncSprite() {
      this.wrap.classList.toggle("baby", this.isBaby);
      this.el.src = this.isBaby ? ASSETS.babyBunny : BUNNY_DEFS[this.kind].img;
    }

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;

      if (Math.random() < REA_EVOLVE_RATE) {
        this.kind = "reabunny";
      }

      this.syncSprite();
      this.gauge = 0;
      this.heart.classList.remove("show");
      saveBunnyMeta();
    }

    onClick() {
      playSE(this.isBaby ? seBaby : sePoyo);
      if (this.isBaby) {
        const c = new Coin(this.x + 60, this.y, 1);
        coinsOnField.push(c);
        return;
      }
      spawnCoins(this, this.gauge);
      this.gauge = 0;
      this.heart.classList.remove("show");
    }

    update(dt) {
      this.evolveIfNeeded();

      if (!this.isBaby) {
        this.gauge += dt / this.gaugePeriod;
        if (this.gauge >= 1) {
          this.gauge = 1;
          this.heart.classList.add("show");
        }
      }

      this.x += this.dir * this.speed * (this.isBaby ? BABY_SPEED_MUL : 1) * dt;
      const maxX = fieldRect().width - 140;
      if (this.x < 0 || this.x > maxX) this.dir *= -1;

      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
      this.wrap.classList.toggle("flip", this.dir < 0);
    }
  }

  /* =========================
   * SHOP
   * ========================= */
  function getShopKinds() {
    const list = ["bunny1", "bunny3", "bunny4", "bunny5"];
    if (!ach.unlock_bunny4) return ["bunny1", "bunny3"];
    return list;
  }

  function buyBunny(kind) {
    const def = BUNNY_DEFS[kind];
    if (!def) return;
    if (coins < def.price) return;

    coins -= def.price;
    saveCoins();
    updateHud();

    bunnies.push(new Bunny(Date.now(), kind));
    saveBunnyMeta();
    checkUnlocks();
  }

  shopBtn.addEventListener("click", () => {
    const kinds = getShopKinds();
    const msg = kinds
      .map((k, i) => `${i + 1}: ${k} (${BUNNY_DEFS[k].price}🪙)`)
      .join("\n");
    const sel = prompt("お迎えするうさぎを選んでください\n" + msg);
    const idx = parseInt(sel, 10) - 1;
    if (kinds[idx]) buyBunny(kinds[idx]);
  });

  departBtn.addEventListener("click", () => {
    if (bunnies.length <= 1) return;
    playSE(seTabidati);
    const b = bunnies.pop();
    b.wrap.remove();
    saveBunnyMeta();
    checkUnlocks();
  });

  resetBtn.addEventListener("click", () => {
    if (!confirm("リセットしますか？")) return;
    localStorage.clear();
    location.reload();
  });

  /* =========================
   * INIT / LOOP
   * ========================= */
  function init() {
    const meta = loadBunnyMeta();
    if (meta) {
      meta.forEach(m => bunnies.push(new Bunny(m.bornAt, m.kind)));
    } else {
      const now = Date.now();
      bunnies.push(
        new Bunny(now - BABY_DURATION_MS - 1000, "bunny1"),
        new Bunny(now - BABY_DURATION_MS - 2000, "bunny1")
      );
      saveBunnyMeta();
    }
    updateHud();
    checkUnlocks();
    requestAnimationFrame(loop);
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    bunnies.forEach(b => b.update(dt));
    coinsOnField.forEach(c => c.update(dt));

    requestAnimationFrame(loop);
  }

  init();
  function openDex() {
  let backdrop = document.getElementById("dexBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "dexBackdrop";
    backdrop.className = "hidden";
    document.body.appendChild(backdrop);
  }

  let modal = document.getElementById("dexModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "dexModal";
    modal.className = "modal";
    backdrop.appendChild(modal);
  }

  const cards = Object.keys(BUNNY_DEFS).map((kind) => {
    const known = !!dex[kind];
    const def = BUNNY_DEFS[kind];
    return `
      <div class="dexCard ${known ? "" : "unknown"}">
        <img src="${known ? def.img : "./assets/unknown.png"}">
        <div class="dexName">${known ? def.label : "？？？"}</div>
        <div class="dexDesc">
          ${known ? def.desc : "まだ出会っていません"}
        </div>
      </div>
    `;
  }).join("");

  modal.innerHTML = `
    <div class="modalHeader">
      <div class="modalTitle">📖 Bunny図鑑</div>
      <button class="modalClose" id="closeDexBtn">×</button>
    </div>
    <div class="dexGrid">
      ${cards}
    </div>
  `;

  modal.querySelector("#closeDexBtn").onclick = () => {
    backdrop.classList.add("hidden");
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) backdrop.classList.add("hidden");
  };

  backdrop.classList.remove("hidden");
}

  
})();
