(() => {
  /* =========================
   * ASSETS / CONST
   * ========================= */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    bunny2: "./assets/bunny2.png",
    bunny3: "./assets/bunny3.png",
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

  // baby → 3分で成長
  const BABY_DURATION_MS = 3 * 60 * 1000;

  // babyの速度は遅い
  const BABY_SPEED_MUL = 0.68;

  // baby行列（追従）
  const BABY_FOLLOW_GAP = 48;
  const BABY_FOLLOW_FORCE = 6.5;
  const BABY_FOLLOW_MAX = 170;

  // 進化演出（虹）
  const EVOLVE_SPARK_COUNT = 14;

  // 低確率レア進化（通常購入の子だけ対象）
  const RARE_EVOLVE_TO_BUNNY2_RATE = 0.05;

  // お迎え価格（固定）
  const SHOP_PRICE = {
    normal: 25,
    bunny2: 80,
    bunny3: 200,
  };

  // キャンディ（任意で残す：ボタンが無い場合は無効）
  const CANDY_COST = 10;

  // 旅立ち（ボタンが無い場合は無効）
  const DEPART_COST = 10;

  const LS = {
    coins: "wb_coins_v3",
    bunnies: "wb_bunnies_v3", // [{bornAt, kind}]
  };

  /* =========================
   * DOM (optional safe)
   * ========================= */
  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");
  const coinValueEl = document.getElementById("coinValue");

  const shopBtn = document.getElementById("shopBtn");
  const candyBtn = document.getElementById("candyBtn");
  const departBtn = document.getElementById("departBtn");
  const resetBtn = document.getElementById("resetBtn");

  /* =========================
   * AUDIO
   * ========================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      sePoyo.muted = true;
      sePoyo.currentTime = 0;
      sePoyo.play()
        .then(() => {
          sePoyo.pause();
          sePoyo.currentTime = 0;
          sePoyo.muted = false;
        })
        .catch(() => (sePoyo.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true });

  function playSE(a) {
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * STATE / STORAGE
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function loadCoins() {
    const n = parseInt(localStorage.getItem(LS.coins) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }
  function saveCoins() {
    localStorage.setItem(LS.coins, String(coins));
  }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return null;
      return arr
        .map((x) => ({
          bornAt: Number(x?.bornAt) || Date.now() - BABY_DURATION_MS - 9999,
          kind: x?.kind === "bunny2" || x?.kind === "bunny3" ? x.kind : "normal",
        }))
        .filter(Boolean);
    } catch {
      return null;
    }
  }
  function saveBunnyMeta() {
    const arr = bunnies.map((b) => ({ bornAt: b.bornAt, kind: b.kind }));
    localStorage.setItem(LS.bunnies, JSON.stringify(arr));
  }

  let coins = loadCoins();

  // うさぎ一覧（保存復元）
  const bunnies = [];
  const coinsOnField = [];
  const candies = [];

  // UI state
  let lastFrame = performance.now();
  let candyArmed = false;

  function updateHud() {
    if (coinValueEl) coinValueEl.textContent = String(coins);
    updateShopTipPrice(); // hoverの価格色を最新化
  }

  function fieldRect() {
    return field.getBoundingClientRect();
  }
  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine");
    if (!gl) return fr.height - 60;
    const gr = gl.getBoundingClientRect();
    return gr.top - fr.top;
  }

  /* =========================
   * FX (spark)
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
  function coinValueFromTier(t) {
    if (t === 4) return 100;
    if (t === 3) return 10;
    if (t === 2) return 5;
    return 1;
  }
  function gaugeToTier(g) {
    return clamp(Math.ceil(clamp(g, 0, 1) * 4), 1, 4);
  }

  class Coin {
    constructor(x, yStart, yFloor, tier, value) {
      this.value = value;
      this.x = x;
      this.y = yStart;
      this.yFloor = yFloor;

      // “落とすときコインが跳ねる” 初速
      this.vx = (Math.random() * 2 - 1) * (40 + tier * 10);
      this.vy = -(420 + Math.random() * 200);
      this.gravity = 2200;
      this.bounce = 0.28 + Math.random() * 0.14;

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
      saveCoins();
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

  // ★混合大量を「うさぎから」落とす（雨みたいに）
  function spawnCoinsByGauge(bunny, gauge01) {
    const maxTier = gaugeToTier(gauge01);

    // 大量（必要ならさらに増やしてOK）
    const countByTier = [0, 10, 18, 28, 44];
    const count = countByTier[maxTier];

    // 上tierほど出やすい混合
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
    const r = bunny.wrap.getBoundingClientRect();

    const baseX = (r.left - fr.left) + r.width * 0.5;
    const baseY = (r.top - fr.top) + r.height * 0.78;

    const spreadX = 60 + maxTier * 30;

    for (let i = 0; i < count; i++) {
      const delay = i * (10 + Math.random() * 14); // “雨”っぽい連射
      setTimeout(() => {
        const tier = pickTierMixed(maxTier);
        const value = coinValueFromTier(tier);

        const x = baseX + (Math.random() * 2 - 1) * spreadX;
        const startY = Math.min(gY - 10, baseY + (Math.random() * 2 - 1) * 14);

        const c = new Coin(x, startY, gY - 2, tier, value);
        coinsOnField.push(c);

        // ちょいキラ（高tier）
        if (tier >= 3 && Math.random() < 0.25) {
          spawnSparks(x, gY - 40, 3, 30, false);
        }
      }, delay);
    }
  }

  function spawnBabyCoinAtBunny(bunny) {
    const fr = fieldRect();
    const gY = groundY();
    const r = bunny.wrap.getBoundingClientRect();
    const baseX = (r.left - fr.left) + r.width * 0.5;
    const baseY = (r.top - fr.top) + r.height * 0.78;

    const x = baseX + (Math.random() * 2 - 1) * 10;
    const startY = Math.min(gY - 10, baseY);

    const c = new Coin(x, startY, gY - 2, 1, 1);
    coinsOnField.push(c);
  }

  /* =========================
   * BUNNY
   * ========================= */
  class Bunny {
    constructor(bornAt, kind = "normal") {
      this.bornAt = bornAt;
      this.kind = kind; // "normal" | "bunny2" | "bunny3"
      this.isBaby = (Date.now() - bornAt) < BABY_DURATION_MS;

      // レア進化フラグ（通常購入の子のみ）
      this.didRareEvolve = false;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;

      this.el = document.createElement("img");
      this.el.className = "bunny";
      this.el.draggable = false;

      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = rand(40, Math.max(60, fieldRect().width - 180));
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60;

      // adult gauge (0-1)
      this.gauge = 0;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.charged = false;

      // baby follow
      this.vx = 0;

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.tryClickDrop();
      });
    }

    getAdultSprite() {
      if (this.kind === "bunny2") return ASSETS.bunny2;
      if (this.kind === "bunny3") return ASSETS.bunny3;
      return ASSETS.bunny;
    }

    syncSprite() {
      this.wrap.classList.toggle("baby", this.isBaby);
      this.el.src = this.isBaby ? ASSETS.babyBunny : this.getAdultSprite();
    }

    // baby行列：大人 or 先に生まれたbaby を追う（最寄り）
    findLeaderForBaby() {
      let best = null;
      let bestD = Infinity;

      for (const b of bunnies) {
        if (b === this) continue;

        const canLead = (!b.isBaby) || (b.isBaby && (b.bornAt < this.bornAt));
        if (!canLead) continue;

        const d = Math.abs(b.x - this.x);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    }

    updateEvolve() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      // 成長
      this.isBaby = false;

      // ★低確率で「通常の子だけ」bunny2へレア進化
      if (this.kind === "normal" && Math.random() < RARE_EVOLVE_TO_BUNNY2_RATE) {
        this.kind = "bunny2";
        this.didRareEvolve = true;
      }

      this.syncSprite();

      // 進化演出（虹）
      const fr = fieldRect();
      const r = this.wrap.getBoundingClientRect();
      const cx = (r.left - fr.left) + r.width / 2;
      const cy = (r.top - fr.top) + r.height / 2;
      spawnSparks(cx, cy, EVOLVE_SPARK_COUNT, 90, true);

      // レア進化なら追加キラ
      if (this.didRareEvolve) spawnSparks(cx, cy - 18, 18, 120, true);

      // ゲージ初期化（大人になってからチャージ）
      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.heart.classList.remove("show");

      // 保存更新
      saveBunnyMeta();
    }

    updateGauge(dt) {
      // babyはチャージなし＆ハートなし
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

      // MAXならハート出しっぱなし（ゲージ表示はしない）
      if (this.charged) this.heart.classList.add("show");
      else this.heart.classList.remove("show");
    }

    tryClickDrop() {
      // SE
      playSE(this.isBaby ? seBaby : sePoyo);

      if (this.isBaby) {
        // babyは常に coin1 を1枚
        spawnBabyCoinAtBunny(this);
        return;
      }

      // 大人：ゲージ量に応じて混合大量
      spawnCoinsByGauge(this, this.gauge);

      // ゲージ消費
      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.heart.classList.remove("show");
    }

    update(dt) {
      this.updateEvolve();
      this.updateGauge(dt);

      // 移動
      const fr = fieldRect();
      const bunnySize =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bunnySize")) || 140;
      const minX = 0;
      const maxX = Math.max(0, fr.width - bunnySize);

      if (this.isBaby) {
        // babyは行列追従
        const leader = this.findLeaderForBaby();
        if (leader) {
          const desiredX = leader.x - leader.dir * BABY_FOLLOW_GAP;
          const dx = desiredX - this.x;

          const targetV = clamp(dx * BABY_FOLLOW_FORCE, -BABY_FOLLOW_MAX, BABY_FOLLOW_MAX);
          const cap = Math.max(60, (this.baseSpeed * BABY_SPEED_MUL) * 2.0);

          this.vx = clamp(targetV, -cap, cap);
          this.x += this.vx * dt;

          if (Math.abs(this.vx) > 5) this.dir = this.vx >= 0 ? 1 : -1;
          else this.dir = leader.dir;
        } else {
          this.x += this.dir * this.baseSpeed * BABY_SPEED_MUL * dt;
        }
      } else {
        this.x += this.dir * this.baseSpeed * dt;
      }

      // 端で折り返し（画面外に行かない）
      if (this.x <= minX) {
        this.x = minX;
        this.dir = 1;
        this.vx = Math.abs(this.vx || 0);
      }
      if (this.x >= maxX) {
        this.x = maxX;
        this.dir = -1;
        this.vx = -Math.abs(this.vx || 0);
      }

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top = `${this.y}px`;
    }
  }

  /* =========================
   * CANDY (optional)
   * ========================= */
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
      this.el.draggable = false;
      coinLayer.appendChild(this.el);
      this.render();
    }
    floorY() { return groundY() - 2; }
    isExpired(now) { return (now - this.spawnAt) >= this.ttlMs; }
    remove() { this.el.remove(); }

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
    }
  }

  /* =========================
   * SHOP MODAL (auto build)
   * ========================= */
  let shopUi = null;

  function ensureShopModal() {
    if (shopUi) return shopUi;

    // backdrop
    let backdrop = document.getElementById("modalBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "modalBackdrop";
      backdrop.className = "hidden";
      document.body.appendChild(backdrop);
    }

    // modal root
    let modal = document.getElementById("shopModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "shopModal";
      modal.className = "modal";
      backdrop.appendChild(modal);
    }

    // build content
    modal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">🐰 お迎え</div>
        <button id="closeShopBtn" class="modalClose" aria-label="close">×</button>
      </div>

      <div class="modalSection" style="background: rgba(255,220,235,0.28);">
        <div style="font-weight:900;margin-bottom:6px;">種類を選んでお迎え</div>
        <div style="font-size:12px;line-height:1.45;opacity:.9;">
          お迎えした子は <b>baby</b> で来て、<b>3分</b>で成長します。<br/>
          babyの間はコイン<b>1枚</b>だけ。成長後はハートが出たら大量コイン！
        </div>
      </div>

      <div id="shopGrid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
        ${shopCardHtml("normal", "ふつう", "assets/bunny.png", "基本のうさぎ。低確率でレア成長するかも。")}
        ${shopCardHtml("bunny2", "bunny2", "assets/bunny2.png", "黄金タイプ")}
        ${shopCardHtml("bunny3", "bunny3", "assets/bunny3.png", "毒タイプ")}
      </div>

      <div style="margin-top:10px;font-size:12px;opacity:.85;">
        現在の所持：<b><span id="shopHaveCoins">0</span>🪙</b>
      </div>
    `;

    // close handlers
    const closeBtn = modal.querySelector("#closeShopBtn");
    closeBtn.addEventListener("click", closeShop);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeShop();
    });

    // buy handlers
    modal.querySelectorAll("[data-buy-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-buy-kind");
        buyBunny(kind);
      });
    });

    shopUi = {
      backdrop,
      modal,
      haveEl: modal.querySelector("#shopHaveCoins"),
      priceEls: {
        normal: modal.querySelector("#price_normal"),
        bunny2: modal.querySelector("#price_bunny2"),
        bunny3: modal.querySelector("#price_bunny3"),
      },
      buyBtns: {
        normal: modal.querySelector('[data-buy-kind="normal"]'),
        bunny2: modal.querySelector('[data-buy-kind="bunny2"]'),
        bunny3: modal.querySelector('[data-buy-kind="bunny3"]'),
      },
    };

    return shopUi;
  }

  function shopCardHtml(kind, title, imgPath, desc) {
    const price = SHOP_PRICE[kind];
    return `
      <div class="modalSection" style="margin:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="./${imgPath}" alt="${title}" style="width:46px;height:46px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,0.7);padding:6px;">
          <div>
            <div style="font-weight:900;">${title}</div>
            <div style="font-size:12px;opacity:.9;line-height:1.35;">${desc}</div>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:900;">価格：<span id="price_${kind}">${price}</span>🪙</div>
          <button data-buy-kind="${kind}">お迎え</button>
        </div>
      </div>
    `;
  }

  function openShop() {
    const ui = ensureShopModal();
    ui.backdrop.classList.remove("hidden");
    refreshShopUI();
  }

  function closeShop() {
    const ui = ensureShopModal();
    ui.backdrop.classList.add("hidden");
  }

  function refreshShopUI() {
    const ui = ensureShopModal();
    ui.haveEl.textContent = String(coins);

    for (const kind of ["normal", "bunny2", "bunny3"]) {
      const price = SHOP_PRICE[kind];
      ui.priceEls[kind].textContent = String(price);

      const bad = coins < price;
      // price text red
      ui.priceEls[kind].style.color = bad ? "#ff5a5a" : "";
      // disable button
      ui.buyBtns[kind].disabled = bad;
      ui.buyBtns[kind].style.opacity = bad ? "0.55" : "";
    }

    updateShopTipPrice();
  }

  // お迎えボタンのホバーtipがある場合、ここで価格と不足色を更新
  function updateShopTipPrice() {
    const el = document.getElementById("shopTipPrice");
    if (!el) return;
    const price = SHOP_PRICE.normal; // tipは「ふつう」価格表示にしておく（必要ならHTML側で3種に拡張）
    el.textContent = String(price);
    el.classList.toggle("priceBad", coins < price);
  }

  function buyBunny(kind) {
    const price = SHOP_PRICE[kind];
    if (coins < price) return;

    coins -= price;
    saveCoins();

    // 購入は baby で来る（3分後に kind の見た目になる）
    const b = new Bunny(Date.now(), kind);
    bunnies.push(b);
    saveBunnyMeta();
    updateHud();
    refreshShopUI();
  }

  /* =========================
   * OPTIONAL BUTTONS
   * ========================= */
  if (shopBtn) {
    // 表示名はHTML側で「お迎え」にしてOK。JS側はクリックでモーダル。
    shopBtn.addEventListener("click", () => {
      unlockAudioOnce();
      openShop();
    });
    shopBtn.addEventListener("mouseenter", updateShopTipPrice);
  }

  if (candyBtn && field) {
    candyBtn.addEventListener("click", () => {
      candyArmed = !candyArmed;
      candyBtn.classList.toggle("armed", candyArmed);
    });

    field.addEventListener("pointerdown", (e) => {
      if (!candyArmed) return;
      if (coins < CANDY_COST) return;

      coins -= CANDY_COST;
      saveCoins();
      updateHud();

      const fr = fieldRect();
      const x = clamp(e.clientX - fr.left, 30, fr.width - 30);
      candies.push(new Candy(x, 10000));
    });
  }

  if (departBtn) {
    departBtn.addEventListener("click", () => {
      if (bunnies.length <= 1) return;
      if (coins < DEPART_COST) return;

      coins -= DEPART_COST;
      saveCoins();
      updateHud();

      playSE(seTabidati);

      // 末尾を旅立ち（削除）
      const victim = bunnies.pop();
      if (victim?.wrap) {
        victim.wrap.remove();
      }
      saveBunnyMeta();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("リセットしますか？")) return;

      coins = 0;
      saveCoins();

      // コイン掃除
      coinsOnField.forEach((c) => c.el?.remove());
      coinsOnField.length = 0;

      // キャンディ掃除
      candies.forEach((c) => c.remove());
      candies.length = 0;

      // うさぎ掃除＆初期2匹
      bunnies.forEach((b) => b.wrap?.remove());
      bunnies.length = 0;

      const now = Date.now();
      bunnies.push(
        new Bunny(now - BABY_DURATION_MS - 1000, "normal"),
        new Bunny(now - BABY_DURATION_MS - 2000, "normal")
      );

      saveBunnyMeta();
      updateHud();
    });
  }

  /* =========================
   * INIT
   * ========================= */
  function initBunnies() {
    // 保存があれば復元
    const meta = loadBunnyMeta();
    if (meta && meta.length >= 1) {
      meta.forEach((m) => bunnies.push(new Bunny(m.bornAt, m.kind)));
      return;
    }

    // 初期2匹（大人）
    const now = Date.now();
    bunnies.push(
      new Bunny(now - BABY_DURATION_MS - 1000, "normal"),
      new Bunny(now - BABY_DURATION_MS - 2000, "normal")
    );
    saveBunnyMeta();
  }

  /* =========================
   * LOOP
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    // candy update
    const now = performance.now();
    for (let i = candies.length - 1; i >= 0; i--) {
      const c = candies[i];
      c.update(dt);
      if (c.isExpired(now)) {
        c.remove();
        candies.splice(i, 1);
      }
    }

    // bunny update
    bunnies.forEach((b) => b.update(dt));

    // coin update
    coinsOnField.forEach((c) => c.update(dt));

    requestAnimationFrame(tick);
  }

  function init() {
    initBunnies();
    updateHud();
    requestAnimationFrame(tick);

    // resize: groundY変化に追従（yを更新）
    window.addEventListener("resize", () => {
      const gy = groundY();
      bunnies.forEach((b) => (b.y = gy - 120));
    });
  }

  // safety checks
  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("必要なDOMが見つかりません: field / bunnyLayer / coinLayer / coinValue");
    return;
  }

  init();
})();
