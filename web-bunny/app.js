(() => {
  /* =========================
   * Bunny牧場 app.js（完全版）
   * - うさぎ種別: bunny1 / bunny3 / bunny4 / bunny5 / reabunny
   * - お迎え: モーダル＋サムネ＋不足は赤＋箱パカ/虹キラ演出
   * - baby: 3分、ハート（チャージ）なし、遅い、クリックでcoin1を1枚、他のうさぎの後ろを追従
   * - 成体: ゲージ（非表示）チャージ→ハート出しっぱなし、クリックで混合コイン雨（種類で増える）
   * - 画面端で折り返し、画面外に出ない
   * - 図鑑: 出現した種類を一覧表示（未出現は？？？）
   * - 低確率で黄金うんち(assets/ougonunchi.png)出現、クリックで+10000
   * ========================= */

  /* ===== Assets ===== */
  const ASSETS = {
    babyBunny: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    babySE: "./assets/babybunny.mp3",
    tabidatiSE: "./assets/tabidati.mp3",

    ougonUnchi: "./assets/ougonunchi.png",

    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
  };

  /* ===== Bunny defs（増やすならここだけ） ===== */
  const BUNNY_DEFS = {
    bunny1: {
      label: "bunny1",
      img: "./assets/bunny1.png",
      price: 25,
      coinMul: 0.55, // 少なめ
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
      price: 0, // ショップに出さない（突然変異のみ）
      coinMul: 4.0,
      desc: "突然変異でのみ現れる幻のうさぎ。",
    },
  };

  /* ===== Balance ===== */
  const BABY_DURATION_MS = 3 * 60 * 1000;
  const BABY_SPEED_MUL = 0.65;

  // baby->成体に成長した瞬間の突然変異率（reabunny）
  const REA_EVOLVE_RATE = 0.01;

  // 実績（同時うさぎ数 >= 10 で shop 拡張：bunny4/bunny5解禁）
  const UNLOCK_BUNNY4_NEED = 10;

  // 黄金うんち（コインを「生成するたび」に抽選）
  const OUGON_UNCHI_RATE_PER_DROP = 0.0015; // 0.15%
  const OUGON_UNCHI_VALUE = 10000;

  // baby 追従（行列）
  const BABY_FOLLOW_GAP = 46;
  const BABY_FOLLOW_FORCE = 6.0;
  const BABY_FOLLOW_MAX_SPEED = 180;

  // コイン雨（ベース枚数）
  // tier=1..4（ゲージに応じて tier 上限が上がる）
  const BASE_RAIN_COUNT_BY_TIER = [0, 14, 26, 42, 68];

  // ゲージチャージ（秒）
  const GAUGE_PERIOD_RANGE = [7, 14];

  // 旅立ち（ボタンがある場合）
  const DEPART_COST = 10; // 使ってないなら無視でOK（UI側に説明があれば合わせる）

  /* ===== Storage keys ===== */
  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6", // [{bornAt, kind}]
    ach: "wb_ach_v2",
    dex: "wb_dex_v1",
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
  const rankBtn = document.getElementById("rankBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("必要なDOMが見つかりません: #field / #bunnyLayer / #coinLayer / #coinValue");
    return;
  }

  /* =========================
   * Audio
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
   * Storage
   * ========================= */
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

  function loadDex() {
    try {
      const d = JSON.parse(localStorage.getItem(LS.dex) || "{}");
      return d && typeof d === "object" ? d : {};
    } catch {
      return {};
    }
  }
  function saveDex() {
    localStorage.setItem(LS.dex, JSON.stringify(dex));
  }

  function safeKind(k) {
    return BUNNY_DEFS[k] ? k : "bunny1";
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
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map((b) => ({ bornAt: b.bornAt, kind: b.kind })))
    );
  }

  /* =========================
   * Utils
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function fieldRect() {
    return field.getBoundingClientRect();
  }

  // 地面Y（見た目に合わせて適度に上）
  function groundY() {
    // だいたい下から60px
    return fieldRect().height - 60;
  }

  function updateHud() {
    coinValueEl.textContent = String(coins);
  }

  /* =========================
   * State
   * ========================= */
  let coins = loadCoins();
  let ach = loadAch();
  let dex = loadDex();

  const bunnies = [];
  const dropsOnField = []; // Coin / OugonUnchi をまとめて管理

  let lastFrame = performance.now();

  /* =========================
   * Achievements (unlock shop)
   * ========================= */
  function unlock(id) {
    if (ach[id]) return false;
    ach[id] = true;
    saveAch();
    return true;
  }

  function checkUnlocks() {
    // 同時うさぎ数 >= 10 で shop 拡張
    if (!ach.unlock_bunny4 && bunnies.length >= UNLOCK_BUNNY4_NEED) {
      const newly = unlock("unlock_bunny4");
      if (newly) {
        try {
          alert("実績解除！ bunny4 / bunny5 がショップに出現しました 🐰✨");
        } catch {}
      }
    }
    refreshShopUI?.();
  }

  /* =========================
   * Drops (Coin / OugonUnchi)
   * ========================= */
  function coinValueFromTier(t) {
    if (t === 4) return 100;
    if (t === 3) return 10;
    if (t === 2) return 5;
    return 1;
  }

  class DropBase {
    constructor(x, y) {
      this.x = x;
      this.y = y;

      // ちょい弾み
      this.vx = (Math.random() * 2 - 1) * 110;
      this.vy = -(420 + Math.random() * 240);
      this.gravity = 2200;
      this.bounce = 0.22 + Math.random() * 0.12;
      this.floor = groundY();
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y >= this.floor) {
        this.y = this.floor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
          this.vx *= 0.72;
        } else {
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x}px`;
      this.el.style.top = `${this.y}px`;
    }

    removeSelf() {
      try {
        this.el.remove();
      } catch {}
      const idx = dropsOnField.indexOf(this);
      if (idx >= 0) dropsOnField.splice(idx, 1);
    }
  }

  class Coin extends DropBase {
    constructor(x, y, tier) {
      super(x, y);
      this.value = coinValueFromTier(tier);

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.draggable = false;

      // hover or click で回収
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
      this.removeSelf();
    }
  }

  class OugonUnchi extends DropBase {
    constructor(x, y) {
      super(x, y);
      this.value = OUGON_UNCHI_VALUE;

      this.el = document.createElement("img");
      this.el.className = "ougonunchi";
      this.el.src = ASSETS.ougonUnchi;
      this.el.draggable = false;

      // クリックのみ
      this.el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collect();
      });

      coinLayer.appendChild(this.el);
      this.render();
    }

    collect() {
      coins += this.value;
      saveCoins();
      updateHud();
      playSE(seCoin);
      this.removeSelf();
    }
  }

  function maybeSpawnOugonUnchi(x, y) {
    if (Math.random() < OUGON_UNCHI_RATE_PER_DROP) {
      const p = new OugonUnchi(x, y);
      dropsOnField.push(p);
      return true;
    }
    return false;
  }

  function gaugeToTier(g01) {
    // 0..1 -> 1..4
    return clamp(Math.ceil(clamp(g01, 0, 1) * 4), 1, 4);
  }

  // 「混合で雨みたいに」：上tierほど出やすい（maxTierに応じた重み）
  function pickTierMixed(maxTier) {
    // index: 1..4
    const wTable = {
      1: [0, 1],
      2: [0, 1, 2],
      3: [0, 1, 2, 3],
      4: [0, 1, 2, 3, 6],
    };
    const w = wTable[maxTier];
    let sum = 0;
    for (let t = 1; t <= maxTier; t++) sum += w[t];
    let roll = Math.random() * sum;
    for (let t = 1; t <= maxTier; t++) {
      roll -= w[t];
      if (roll <= 0) return t;
    }
    return maxTier;
  }

  // うさぎからコイン雨
  function spawnRainFromBunny(bunny, gauge01) {
    const maxTier = gaugeToTier(gauge01);
    const mul = BUNNY_DEFS[bunny.kind]?.coinMul ?? 1;

    // ハートMAXならさらにちょい増し
    const chargedBonus = bunny.charged ? 1.15 : 1.0;

    const baseCount = BASE_RAIN_COUNT_BY_TIER[maxTier];
    const count = Math.max(1, Math.floor(baseCount * mul * chargedBonus));

    const fr = fieldRect();
    const r = bunny.wrap.getBoundingClientRect();
    const baseX = (r.left - fr.left) + r.width * 0.5;
    const baseY = (r.top - fr.top) + r.height * 0.78;

    const spreadX = 70 + maxTier * 28;

    for (let i = 0; i < count; i++) {
      const delay = i * (9 + Math.random() * 12);
      setTimeout(() => {
        const x = baseX + (Math.random() * 2 - 1) * spreadX;
        const y = baseY + (Math.random() * 2 - 1) * 10;

        // ★低確率で黄金うんち
        if (maybeSpawnOugonUnchi(x, y)) return;

        const tier = pickTierMixed(maxTier);
        const c = new Coin(x, y, tier);
        dropsOnField.push(c);
      }, delay);
    }
  }

  function spawnBabyCoin(bunny) {
    const fr = fieldRect();
    const r = bunny.wrap.getBoundingClientRect();
    const x = (r.left - fr.left) + r.width * 0.55 + rand(-8, 8);
    const y = (r.top - fr.top) + r.height * 0.82;
    const c = new Coin(x, y, 1);
    dropsOnField.push(c);
  }

  /* =========================
   * Bunny
   * ========================= */
  class Bunny {
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = bornAt;
      this.kind = safeKind(kind);
      this.isBaby = (Date.now() - bornAt) < BABY_DURATION_MS;

      // 図鑑登録
      if (!dex[this.kind]) {
        dex[this.kind] = true;
        saveDex();
      }

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

      const fr = fieldRect();
      this.x = rand(30, Math.max(30, fr.width - 170));
      this.y = groundY() - 120;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 60; // 成体の基本歩行

      // ゲージ（非表示）
      this.gauge = 0;
      this.gaugePeriod = rand(GAUGE_PERIOD_RANGE[0], GAUGE_PERIOD_RANGE[1]);
      this.charged = false;

      this.vx = 0;

      this.syncSprite();

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.onClick();
      });
    }

    syncSprite() {
      this.wrap.classList.toggle("baby", this.isBaby);
      this.el.src = this.isBaby ? ASSETS.babyBunny : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
    }

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;

      // 成長時突然変異
      if (Math.random() < REA_EVOLVE_RATE) {
        this.kind = "reabunny";
        if (!dex.reabunny) {
          dex.reabunny = true;
          saveDex();
        }
      }

      this.syncSprite();

      // 成体になったのでゲージ初期化
      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = rand(GAUGE_PERIOD_RANGE[0], GAUGE_PERIOD_RANGE[1]);
      this.heart.classList.remove("show");

      saveBunnyMeta();
    }

    updateGauge(dt) {
      // babyはチャージ無し＆ハート無し
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

      // MAXならハート出しっぱなし
      if (this.charged) this.heart.classList.add("show");
      else this.heart.classList.remove("show");
    }

    onClick() {
      playSE(this.isBaby ? seBaby : sePoyo);

      if (this.isBaby) {
        spawnBabyCoin(this);
        return;
      }

      spawnRainFromBunny(this, this.gauge);

      // クリックでゲージ消費
      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = rand(GAUGE_PERIOD_RANGE[0], GAUGE_PERIOD_RANGE[1]);
      this.heart.classList.remove("show");
    }

    // babyが追従する相手を探す（近い成体優先）
    findLeaderForBaby() {
      let best = null;
      let bestD = Infinity;

      for (const b of bunnies) {
        if (b === this) continue;

        // 成体を優先、いなければ先に生まれたbabyもリーダー可（行列感）
        const canLead = (!b.isBaby) || (b.isBaby && b.bornAt < this.bornAt);
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
      this.evolveIfNeeded();
      this.updateGauge(dt);

      const fr = fieldRect();
      const wrapWidth = 140; // CSSのbunnyWrap幅
      const minX = 0;
      const maxX = Math.max(0, fr.width - wrapWidth);

      if (this.isBaby) {
        // babyは他のうさぎの後ろを追従（行列）
        const leader = this.findLeaderForBaby();
        const babySpeedCap = Math.max(60, (this.baseSpeed * BABY_SPEED_MUL) * 2.0);

        if (leader) {
          const desiredX = leader.x - leader.dir * BABY_FOLLOW_GAP;
          const dx = desiredX - this.x;

          const targetV = clamp(dx * BABY_FOLLOW_FORCE, -BABY_FOLLOW_MAX_SPEED, BABY_FOLLOW_MAX_SPEED);
          this.vx = clamp(targetV, -babySpeedCap, babySpeedCap);

          this.x += this.vx * dt;

          if (Math.abs(this.vx) > 6) this.dir = this.vx >= 0 ? 1 : -1;
          else this.dir = leader.dir;
        } else {
          // leader不在：ゆっくり徘徊
          this.x += this.dir * this.baseSpeed * BABY_SPEED_MUL * dt;
        }
      } else {
        // 成体：左右に徘徊
        this.x += this.dir * this.baseSpeed * dt;
      }

      // 画面端で折り返し（外に行かない）
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
   * DEX (図鑑)
   * ========================= */
  const UNKNOWN_SVG = (() => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">` +
      `<rect width="100%" height="100%" rx="18" ry="18" fill="#f3f3f3"/>` +
      `<text x="50%" y="56%" text-anchor="middle" font-size="52" font-family="system-ui" fill="#b8b8b8">?</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  })();

  function openDex() {
    let backdrop = document.getElementById("dexBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "dexBackdrop";
      backdrop.className = "modalBackdrop";
      document.body.appendChild(backdrop);
    }

    let modal = document.getElementById("dexModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "dexModal";
      modal.className = "modal";
      backdrop.appendChild(modal);
    }

    const kinds = Object.keys(BUNNY_DEFS);

    const cards = kinds
      .map((kind) => {
        const def = BUNNY_DEFS[kind];
        const known = !!dex[kind];
        const img = known ? def.img : UNKNOWN_SVG;
        const name = known ? def.label : "？？？";
        const desc = known ? def.desc : "まだ出会っていません";
        return `
          <div class="dexCard ${known ? "" : "unknown"}">
            <img src="${img}" alt="${name}">
            <div class="dexName">${name}</div>
            <div class="dexDesc">${desc}</div>
          </div>
        `;
      })
      .join("");

    modal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">📖 Bunny図鑑</div>
        <button class="modalClose" id="closeDexBtn" aria-label="close">×</button>
      </div>
      <div class="dexGrid">${cards}</div>
    `;

    const close = () => {
      try {
        backdrop.remove();
      } catch {}
    };
    modal.querySelector("#closeDexBtn").onclick = close;
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close();
    };
  }

  if (rankBtn) {
    rankBtn.addEventListener("click", () => {
      unlockAudioOnce();
      openDex();
    });
  }

  /* =========================
   * Shop (モーダル＋サムネ)
   * ========================= */
  let shopBackdrop = null;
  let shopModal = null;

  function getShopKinds() {
    // reabunny は出さない（突然変異枠）
    if (!ach.unlock_bunny4) return ["bunny1", "bunny3"];
    return ["bunny1", "bunny3", "bunny4", "bunny5"];
  }

  function buildShopModal() {
    if (!shopBackdrop) {
      shopBackdrop = document.createElement("div");
      shopBackdrop.id = "shopBackdrop";
      shopBackdrop.className = "modalBackdrop";
      document.body.appendChild(shopBackdrop);
    }
    if (!shopModal) {
      shopModal = document.createElement("div");
      shopModal.id = "shopModal";
      shopModal.className = "modal";
      shopBackdrop.appendChild(shopModal);
    }

    const kinds = getShopKinds();
    const cards = kinds
      .map((kind) => {
        const def = BUNNY_DEFS[kind];
        const canBuy = coins >= def.price;
        return `
          <div class="shopCard ${canBuy ? "" : "disabled"}">
            <img src="${def.img}" class="shopThumb" alt="${def.label}">
            <div class="shopName">${def.label}</div>
            <div class="shopDesc">${def.desc}</div>
            <div class="shopPrice ${canBuy ? "" : "bad"}">${def.price} 🪙</div>
            <button data-buy="${kind}" ${canBuy ? "" : "disabled"}>お迎え</button>
          </div>
        `;
      })
      .join("");

    const nowCount = bunnies.length;
    const progText = ach.unlock_bunny4
      ? `✅ 解放済み`
      : `🔒 解放条件：同時うさぎ数 ${nowCount}/${UNLOCK_BUNNY4_NEED}`;

    shopModal.innerHTML = `
      <div class="modalHeader">
        <div class="modalTitle">🐰 お迎え</div>
        <button class="modalClose" id="closeShopBtn" aria-label="close">×</button>
      </div>

      <div style="font-size:12px;opacity:.85;margin-bottom:10px;line-height:1.5;">
        ${progText}<br>
        お迎えした子は <b>baby</b> で来て、<b>3分</b>で成長します。
      </div>

      <div class="shopGrid">${cards}</div>

      <div style="margin-top:10px;font-size:12px;opacity:.9;">
        所持：<b>${coins}🪙</b>
      </div>
    `;

    shopModal.querySelector("#closeShopBtn").onclick = closeShopModal;
    shopBackdrop.onclick = (e) => {
      if (e.target === shopBackdrop) closeShopModal();
    };

    shopModal.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.getAttribute("data-buy");
        // 押した瞬間に閉じてOK（演出は画面中央で出る）
        closeShopModal();
        buyBunny(kind);
      };
    });
  }

  function openShopModal() {
    buildShopModal();
  }

  function closeShopModal() {
    try {
      shopBackdrop?.remove();
    } catch {}
    shopBackdrop = null;
    shopModal = null;
  }

  function refreshShopUI() {
    if (!shopBackdrop || !shopModal) return;
    // 価格色や解放進捗を更新したいので作り直し
    buildShopModal();
  }

  if (shopBtn) {
    shopBtn.addEventListener("click", () => {
      unlockAudioOnce();
      openShopModal();
    });
  }

  /* =========================
   * Adopt FX (箱パカ／虹キラ)
   * ========================= */
  function showAdoptEffect(kind) {
    const def = BUNNY_DEFS[kind] || BUNNY_DEFS.bunny1;

    const overlay = document.createElement("div");
    overlay.className = "adoptFxOverlay";

    const fx = document.createElement("div");
    fx.className = "adoptFx";

    const box = document.createElement("div");
    box.className = "adoptBox";

    const lid = document.createElement("div");
    lid.className = "adoptLid";

    const thumb = document.createElement("img");
    thumb.className = "adoptThumb";
    thumb.src = def.img;

    fx.appendChild(box);
    fx.appendChild(lid);
    fx.appendChild(thumb);

    const sparkCount = 18;
    for (let i = 0; i < sparkCount; i++) {
      const s = document.createElement("div");
      s.className = "adoptSpark";
      const dx = (Math.random() * 2 - 1) * 130;
      const dy = (Math.random() * 2 - 1) * 130 - 70;
      s.style.setProperty("--dx", `${dx}px`);
      s.style.setProperty("--dy", `${dy}px`);
      const h = Math.floor(Math.random() * 360);
      s.style.background = `hsla(${h}, 92%, 72%, .95)`;
      s.style.boxShadow = `0 0 14px hsla(${h}, 92%, 72%, .65)`;
      s.style.left = "50%";
      s.style.top = "55%";
      s.style.transform = "translate(-50%,-50%)";
      s.style.animationDelay = `${120 + Math.random() * 220}ms`;
      fx.appendChild(s);
    }

    overlay.appendChild(fx);
    document.body.appendChild(overlay);

    setTimeout(() => {
      try {
        overlay.remove();
      } catch {}
    }, 900);

    return 520; // うさぎ生成まで待つ目安
  }

  function buyBunny(kind) {
    kind = safeKind(kind);
    const def = BUNNY_DEFS[kind];
    if (!def || def.price <= 0) return; // reabunnyは買えない
    if (coins < def.price) return;

    coins -= def.price;
    saveCoins();
    updateHud();
    refreshShopUI();

    const waitMs = showAdoptEffect(kind);

    setTimeout(() => {
      const b = new Bunny(Date.now(), kind);
      bunnies.push(b);
      saveBunnyMeta();
      checkUnlocks();
    }, waitMs);
  }

  /* =========================
   * Depart / Reset
   * ========================= */
  if (departBtn) {
    departBtn.addEventListener("click", () => {
      unlockAudioOnce();

      if (bunnies.length <= 1) return;
      if (coins < DEPART_COST) return;

      coins -= DEPART_COST;
      saveCoins();
      updateHud();
      refreshShopUI();

      playSE(seTabidati);

      const victim = bunnies.pop();
      try {
        victim.wrap.remove();
      } catch {}

      saveBunnyMeta();
      checkUnlocks();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      unlockAudioOnce();
      if (!confirm("リセットしますか？")) return;
      localStorage.removeItem(LS.coins);
      localStorage.removeItem(LS.bunnies);
      // 実績・図鑑も消すなら↓も外す
      // localStorage.removeItem(LS.ach);
      // localStorage.removeItem(LS.dex);
      location.reload();
    });
  }

  /* =========================
   * Init / Loop
   * ========================= */
  function initBunnies() {
    const meta = loadBunnyMeta();
    if (meta && meta.length >= 1) {
      meta.forEach((m) => bunnies.push(new Bunny(m.bornAt, m.kind)));
      return;
    }

    // 初期2匹（成体で開始）
    const now = Date.now();
    bunnies.push(
      new Bunny(now - BABY_DURATION_MS - 1000, "bunny1"),
      new Bunny(now - BABY_DURATION_MS - 2000, "bunny1")
    );
    saveBunnyMeta();
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    // 地面補正（リサイズに対応）
    const gy = groundY();
    for (const d of dropsOnField) d.floor = gy;

    // update
    for (const b of bunnies) b.update(dt);
    for (const d of dropsOnField) d.update(dt);

    requestAnimationFrame(tick);
  }

  function init() {
    initBunnies();
    updateHud();
    checkUnlocks();

    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      const gy = groundY();
      for (const b of bunnies) b.y = gy - 120;
      refreshShopUI();
    });
  }

  init();

  function showFarewellMessage(kind) {
  const texts = [
    "またどこかで会えるよ。",
    "ありがとう。元気でね。",
    "やさしい時間をありがとう。",
    "旅立ちは、はじまり。",
    "ずっと忘れないよ。",
  ];

  const def = BUNNY_DEFS[kind];
  const name = def?.label ?? "うさぎ";
  const msg = `${name} は旅立っていった…`;

  const el = document.createElement("div");
  el.className = "farewellMsg";
  el.textContent = msg + " " + texts[Math.floor(Math.random() * texts.length)];

  document.body.appendChild(el);

  setTimeout(() => {
    try { el.remove(); } catch {}
  }, 2600);
}

})();
