(() => {
  /* =========================
   * ASSETS / CONST
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

  // ★うさぎ定義（増やすならここに追加するだけ）
  const BUNNY_DEFS = {
    bunny1: {
      label: "ふつう",
      img: "./assets/bunny.png",
      price: 25,
      desc: "基本のうさぎ。低確率でレア成長するかも。",
    },
    bunny2: {
      label: "bunny2",
      img: "./assets/bunny2.png",
      price: 50000,
      desc: "黄金タイプ",
    },
    bunny3: {
      label: "bunny3",
      img: "./assets/bunny3.png",
      price: 200,
      desc: "毒タイプ",
    },
    bunny4: {
      label: "bunny4",
      img: "./assets/bunny4.png",
      price: 400,
      desc: "実績解除でショップに出現する幻のうさぎ。",
    },
     bunny5: {
      label: "bunny5",
      img: "./assets/bunny5.png",
      price: 800,
      desc: "正月タイプ",
    },
  };

  const BABY_DURATION_MS = 3 * 60 * 1000; // 3分
  const BABY_SPEED_MUL = 0.68;

  // baby行列（追従）
  const BABY_FOLLOW_GAP = 48;
  const BABY_FOLLOW_FORCE = 6.5;
  const BABY_FOLLOW_MAX = 170;

  // 進化演出（虹）
  const EVOLVE_SPARK_COUNT = 14;

  // 低確率レア進化：bunny1 の baby のみ -> bunny2
  const RARE_EVOLVE_TO_BUNNY2_RATE = 0.05;

  // 実績：同時うさぎ数
  const UNLOCK_BUNNY4_NEED = 10;

  // optional
  const CANDY_COST = 10;
  const DEPART_COST = 10;

  const LS = {
    coins: "wb_coins_v4",
    bunnies: "wb_bunnies_v4", // [{bornAt, kind}]
    ach: "wb_ach_v1",
  };

  /* =========================
   * DOM
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
   * UTILS / STORAGE
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function safeKind(k) {
    return BUNNY_DEFS[k] ? k : "bunny1";
  }

  function loadCoins() {
    const n = parseInt(localStorage.getItem(LS.coins) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }
  function saveCoins() {
    localStorage.setItem(LS.coins, String(coins));
  }

  function loadAch() {
    try {
      const a = JSON.parse(localStorage.getItem(LS.ach) || "{}");
      return a && typeof a === "object" ? a : {};
    } catch {
      return {};
    }
  }
  function saveAch() {
    localStorage.setItem(LS.ach, JSON.stringify(ach));
  }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return null;
      return arr
        .map((x) => ({
          bornAt: Number(x?.bornAt) || Date.now() - BABY_DURATION_MS - 9999,
          kind: safeKind(x?.kind),
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

  let coins = loadCoins();
  let ach = loadAch();

  const bunnies = [];
  const coinsOnField = [];
  const candies = [];

  let lastFrame = performance.now();
  let candyArmed = false;

  function updateHud() {
    if (coinValueEl) coinValueEl.textContent = String(coins);
    updateShopTip(); // hover表示を最新化
  }

  /* =========================
   * ACHIEVEMENTS
   * ========================= */
  function unlock(id) {
    if (ach[id]) return false;
    ach[id] = true;
    saveAch();
    return true;
  }

  function checkUnlocks() {
    // ★条件：同時うさぎ数 >= 10 で bunny4 解放
    if (!ach.unlock_bunny4 && bunnies.length >= UNLOCK_BUNNY4_NEED) {
      const newly = unlock("unlock_bunny4");
      if (newly) {
        try {
          alert("実績解除！ bunny4 がショップに出現しました 🐰✨");
        } catch {}
        refreshShopUI?.();
      }
    }
    updateShopTip();
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

      // ★「落とすときコインが跳ねる」初速
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

  // ★混合大量を「うさぎから」落とす（雨みたいに連射）
  function spawnCoinsByGauge(bunny, gauge01) {
    const maxTier = gaugeToTier(gauge01);

    // 大量（好みで増やしてOK）
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
      const delay = i * (10 + Math.random() * 14);
      setTimeout(() => {
        const tier = pickTierMixed(maxTier);
        const value = coinValueFromTier(tier);

        const x = baseX + (Math.random() * 2 - 1) * spreadX;
        const startY = Math.min(gY - 10, baseY + (Math.random() * 2 - 1) * 14);

        const c = new Coin(x, startY, gY - 2, tier, value);
        coinsOnField.push(c);

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
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = bornAt;
      this.kind = safeKind(kind);
      this.isBaby = (Date.now() - bornAt) < BABY_DURATION_MS;

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

      this.gauge = 0;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.charged = false;

      this.vx = 0;

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.tryClickDrop();
      });
    }

    getAdultSprite() {
      return BUNNY_DEFS[this.kind].img;
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

      this.isBaby = false;

      // ★低確率：bunny1 のみ bunny2 にレア成長
      if (this.kind === "bunny1" && Math.random() < RARE_EVOLVE_TO_BUNNY2_RATE) {
        this.kind = "bunny2";
      }

      this.syncSprite();

      // 進化演出（虹）
      const fr = fieldRect();
      const r = this.wrap.getBoundingClientRect();
      const cx = (r.left - fr.left) + r.width / 2;
      const cy = (r.top - fr.top) + r.height / 2;
      spawnSparks(cx, cy, EVOLVE_SPARK_COUNT, 90, true);

      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = 8 + Math.random() * 8;
      this.heart.classList.remove("show");

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
      playSE(this.isBaby ? seBaby : sePoyo);

      if (this.isBaby) {
        spawnBabyCoinAtBunny(this);
        return;
      }

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

      const fr = fieldRect();
      const bunnySize =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bunnySize")) || 140;
      const minX = 0;
      const maxX = Math.max(0, fr.width - bunnySize);

      if (this.isBaby) {
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

  function getShopKinds() {
    const list = ["bunny1", "bunny2", "bunny3"];
    if (ach.unlock_bunny4) list.push("bunny4");
    return list;
  }

  function shopCardHtml(kind, def) {
    return `
      <div class="modalSection" style="margin:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${def.img}" alt="${def.label}"
            style="width:46px;height:46px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,0.7);padding:6px;">
          <div>
            <div style="font-weight:900;">${def.label}</div>
            <div style="font-size:12px;opacity:.9;line-height:1.35;">${def.desc}</div>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:900;">価格：<span id="price_${kind}">${def.price}</span>🪙</div>
          <button data-buy-kind="${kind}">お迎え</button>
        </div>
      </div>
    `;
  }

  function ensureShopModal() {
    if (shopUi) return shopUi;

    let backdrop = document.getElementById("modalBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "modalBackdrop";
      backdrop.className = "hidden";
      document.body.appendChild(backdrop);
    }

    let modal = document.getElementById("shopModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "shopModal";
      modal.className = "modal";
      backdrop.appendChild(modal);
    }

    const kinds = getShopKinds();
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

      <div class="modalSection" style="background: rgba(255,240,200,0.28);">
        <div style="font-weight:900;margin-bottom:6px;">bunny4 解放条件</div>
        <div style="font-size:12px;line-height:1.45;opacity:.92;">
          同時うさぎ数： <b><span id="unlockNowCount">0</span> / ${UNLOCK_BUNNY4_NEED}</b><br/>
          ${ach.unlock_bunny4 ? "✅ 解放済み（ショップに出現中）" : "🔒 まだ解放されていません"}
        </div>
      </div>

      <div id="shopGrid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
        ${kinds.map((k) => shopCardHtml(k, BUNNY_DEFS[k])).join("")}
      </div>

      <div style="margin-top:10px;font-size:12px;opacity:.85;">
        現在の所持：<b><span id="shopHaveCoins">0</span>🪙</b>
      </div>
    `;

    const closeBtn = modal.querySelector("#closeShopBtn");
    closeBtn.addEventListener("click", closeShop);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeShop();
    });

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
      unlockCountEl: modal.querySelector("#unlockNowCount"),
      priceEls: {},
      buyBtns: {},
    };

    // capture price/button refs for current kinds
    for (const k of getShopKinds()) {
      shopUi.priceEls[k] = modal.querySelector(`#price_${k}`);
      shopUi.buyBtns[k] = modal.querySelector(`[data-buy-kind="${k}"]`);
    }

    return shopUi;
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
    // shopKinds can change after unlock -> rebuild if needed
    const currentKinds = getShopKinds();
    if (shopUi) {
      const grid = shopUi.modal.querySelector("#shopGrid");
      const existingKinds = Array.from(shopUi.modal.querySelectorAll("[data-buy-kind]")).map((b) =>
        b.getAttribute("data-buy-kind")
      );
      const same =
        existingKinds.length === currentKinds.length &&
        existingKinds.every((k, i) => k === currentKinds[i]);

      if (!same) {
        shopUi = null;
        ensureShopModal();
      }
    }

    const ui = ensureShopModal();
    ui.haveEl.textContent = String(coins);
    if (ui.unlockCountEl) ui.unlockCountEl.textContent = String(bunnies.length);

    for (const kind of getShopKinds()) {
      const price = BUNNY_DEFS[kind].price;
      const bad = coins < price;

      if (ui.priceEls[kind]) {
        ui.priceEls[kind].textContent = String(price);
        ui.priceEls[kind].style.color = bad ? "#ff5a5a" : "";
      }
      if (ui.buyBtns[kind]) {
        ui.buyBtns[kind].disabled = bad;
        ui.buyBtns[kind].style.opacity = bad ? "0.55" : "";
      }
    }

    updateShopTip();
  }

  function buyBunny(kind) {
    kind = safeKind(kind);

    // bunny4 は未解放なら購入不可
    if (kind === "bunny4" && !ach.unlock_bunny4) return;

    const def = BUNNY_DEFS[kind];
    if (!def) return;

    if (coins < def.price) return;

    coins -= def.price;
    saveCoins();
    updateHud();

    const b = new Bunny(Date.now(), kind);
    bunnies.push(b);
    saveBunnyMeta();

    checkUnlocks();
    refreshShopUI();
  }

  /* =========================
   * SHOP HOVER TIP (progress)
   * ========================= */
  function updateShopTip() {
    // 価格（ふつうの価格表示）
    const priceEl = document.getElementById("shopTipPrice");
    if (priceEl) {
      const p = BUNNY_DEFS.bunny1.price;
      priceEl.textContent = String(p);
      priceEl.classList.toggle("priceBad", coins < p);
    }

    // ★進捗表示：現在x/10
    // 使うにはHTML側で <span id="shopTipProgress"></span> をtip内に置く
    const progEl = document.getElementById("shopTipProgress");
    if (progEl) {
      const now = bunnies.length;
      progEl.textContent = ach.unlock_bunny4
        ? "✅ 解放済み"
        : `bunny4解放：${now}/${UNLOCK_BUNNY4_NEED}`;
      progEl.style.color = !ach.unlock_bunny4 && now >= UNLOCK_BUNNY4_NEED ? "#8ef7a0" : "";
    }
  }

  /* =========================
   * OPTIONAL BUTTONS
   * ========================= */
  if (shopBtn) {
    shopBtn.addEventListener("click", () => {
      unlockAudioOnce();
      openShop();
    });
    shopBtn.addEventListener("mouseenter", () => {
      updateShopTip();
      refreshShopUI?.();
    });
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

      const victim = bunnies.pop();
      if (victim?.wrap) victim.wrap.remove();

      saveBunnyMeta();
      checkUnlocks(); // 解放済みなら何もしない
      refreshShopUI?.();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("リセットしますか？")) return;

      coins = 0;
      saveCoins();

      coinsOnField.forEach((c) => c.el?.remove());
      coinsOnField.length = 0;

      candies.forEach((c) => c.remove());
      candies.length = 0;

      bunnies.forEach((b) => b.wrap?.remove());
      bunnies.length = 0;

      // 実績は残す（必要ならここで ach を消す）
      // ach = {}; saveAch();

      const now = Date.now();
      bunnies.push(
        new Bunny(now - BABY_DURATION_MS - 1000, "bunny1"),
        new Bunny(now - BABY_DURATION_MS - 2000, "bunny1")
      );

      saveBunnyMeta();
      updateHud();
      checkUnlocks();
      refreshShopUI?.();
    });
  }

  /* =========================
   * INIT
   * ========================= */
  function initBunnies() {
    const meta = loadBunnyMeta();
    if (meta && meta.length >= 1) {
      meta.forEach((m) => bunnies.push(new Bunny(m.bornAt, m.kind)));
      return;
    }

    const now = Date.now();
    bunnies.push(
      new Bunny(now - BABY_DURATION_MS - 1000, "bunny1"),
      new Bunny(now - BABY_DURATION_MS - 2000, "bunny1")
    );
    saveBunnyMeta();
  }

  /* =========================
   * LOOP
   * ========================= */
  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    const now = performance.now();
    for (let i = candies.length - 1; i >= 0; i--) {
      const c = candies[i];
      c.update(dt);
      if (c.isExpired(now)) {
        c.remove();
        candies.splice(i, 1);
      }
    }

    bunnies.forEach((b) => b.update(dt));
    coinsOnField.forEach((c) => c.update(dt));

    requestAnimationFrame(tick);
  }

  function init() {
    if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
      console.error("必要なDOMが見つかりません: field / bunnyLayer / coinLayer / coinValue");
      return;
    }

    initBunnies();
    updateHud();
    checkUnlocks();

    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      const gy = groundY();
      bunnies.forEach((b) => (b.y = gy - 120));
      updateShopTip();
    });
  }

  init();
})();
