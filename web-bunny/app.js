/* app.js — Milkpop牧場（v13.0 V6-SPEC PORT）
 * 目的：貼りコード(v6)の仕様を、現状環境(index.html/他js)で動く形に適用
 *
 * ✅ 反映した仕様（v6由来）
 * - kind 管理（bunny1/bunny3/bunny4/bunny5/reabunny）
 * - bornAtで baby 判定（3分）
 * - 初期2体は必ず大人（bornAtを過去にして生成） → 初期baby2体バグ解消
 * - babyクリック：コイン1枚（tier1）
 * - 大人クリック：ゲージに応じて「雨」ドロップ（tier混合）
 * - 黄金うんち：ドロップ毎に確率出現、拾うと +10000 & カウント加算
 * - コイン：hover/クリック/タップスライド回収
 * - WB互換：on/off/emit、bunnies配列、spawnBunny/removeBunnyInstance、coins getter/setter 等
 *
 * ⚠️ 注意
 * - 旅立ちは tabidati.js 側が WB.removeBunnyInstance / WB.bunnies を使う想定で互換済み
 * - 既存v12.8の保存（wb_bunnies_v12_8_baby / wb_coin_v1）は読みません
 */

(() => {
  "use strict";
  console.log("[app.js] LOADED v13.0 (V6-SPEC PORT)", Date.now());

  /* =========================
   * Assets / Defs
   * ========================= */
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

  const BUNNY_DEFS = {
    bunny1: {
      label: "通常みるぽ",
      img: "./assets/bunny1.png",
      price: 300,
      coinMul: 0.55,
      desc: "基本のうさぎ。コインは控えめ。",
    },
    bunny3: {
      label: "毒タイプみるぽ",
      img: "./assets/bunny3.png",
      price: 1800,
      coinMul: 1.0,
      desc: "安定してコインを稼ぐ中級うさぎ。",
    },
    bunny4: {
      label: "水タイプみるぽ",
      img: "./assets/bunny4.png",
      price: 6000,
      coinMul: 1.8,
      desc: "大量のコインを生み出す上級うさぎ。",
    },
    bunny5: {
      label: "お正月みるぽ",
      img: "./assets/bunny5.png",
      price: 20000,
      coinMul: 2.8,
      desc: "牧場最上級クラス。圧倒的生産力。",
    },
    reabunny: {
      label: "黄金レアみるぽ",
      img: "./assets/reabunny.png",
      price: 0,
      coinMul: 4.0,
      desc: "突然変異でのみ現れる幻のうさぎ。",
    },
  };

  /* =========================
   * Balance
   * ========================= */
  const BABY_DURATION_MS = 3 * 60 * 1000;

  const BABY_SPEED_MUL = 0.65;
  const REA_EVOLVE_RATE = 0.01;

  const OUGON_UNCHI_RATE_PER_DROP = 0.0015; // 0.15%
  const OUGON_UNCHI_VALUE = 10000;

  const BABY_FOLLOW_GAP = 46;
  const BABY_FOLLOW_FORCE = 6.0;
  const BABY_FOLLOW_MAX_SPEED = 180;

  const BASE_RAIN_COUNT_BY_TIER = [0, 14, 26, 42, 68];
  const GAUGE_PERIOD_RANGE = [7, 14];

  const DEPART_COST = 10;

  /* =========================
   * Storage
   * ========================= */
  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6",
    dex: "wb_dex_v1",
    unchi: "wb_unchi_v1",
    title: "wb_title_v1",
    titleList: "wb_title_list_v1",
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
  const rankBtn = document.getElementById("rankBtn"); // 無くてもOK

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("必要なDOMが見つかりません: #field / #bunnyLayer / #coinLayer / #coinValue");
    return;
  }

  /* =========================
   * Minimal CSS（heart + baby 位置安定）
   * ========================= */
  (() => {
    const css = `
      .bunnyWrap{ position:absolute; width:140px; height:140px; }
      .bunnyWrap.flip{ transform: scaleX(-1); }
      .bunnyWrap .bunny{
        position:absolute;
        left:0;
        bottom:0;
        width:140px;
        height:auto;
        user-select:none;
        -webkit-user-drag:none;
        pointer-events:none;
      }
      .bunnyWrap .bunnyHeart{
        position:absolute;
        left:50%;
        top:-22px;
        width:28px;
        transform: translateX(-50%);
        opacity:0;
        pointer-events:none;
      }
      .bunnyWrap .bunnyHeart.show{ opacity:1; }

      /* baby: wrapはそのまま、画像だけ小さくして bottom:0 固定 */
      .bunnyWrap.baby .bunny{
        width:92px;
        left:14px;
        bottom:0;
      }

      .coin, .ougonunchi{
        position:absolute;
        width:66px;
        height:66px;
        user-select:none;
        -webkit-user-drag:none;
        cursor:pointer;
        z-index:40;
      }
      .ougonunchi{ width:86px; height:86px; z-index:45; }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();

  /* =========================
   * Audio
   * ========================= */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seBaby = new Audio(ASSETS.babySE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);

  sePoyo.preload = "auto";
  seBaby.preload = "auto";
  seCoin.preload = "auto";
  seTabidati.preload = "auto";

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      // iOS対策：無音再生で解禁
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
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(a) {
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * Event bus（WB互換）
   * ========================= */
  const __events = new Map();
  function on(ev, fn) {
    if (!__events.has(ev)) __events.set(ev, new Set());
    __events.get(ev).add(fn);
  }
  function off(ev, fn) { __events.get(ev)?.delete(fn); }
  function emit(ev, payload) {
    __events.get(ev)?.forEach((fn) => { try { fn(payload); } catch {} });
  }

  /* =========================
   * Utils
   * ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function fieldRect() { return field.getBoundingClientRect(); }
  function groundY() { return fieldRect().height - 60; }

  /* =========================
   * Storage helpers
   * ========================= */
  function loadCoins() {
    const n = parseInt(localStorage.getItem(LS.coins) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }
  function saveCoins() { localStorage.setItem(LS.coins, String(coins)); }

  function loadDex() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS.dex) || "{}");
      const d = {};
      for (const k in raw) {
        if (raw[k] === true) d[k] = { seen: true, farewell: 0 };
        else d[k] = { seen: !!raw[k]?.seen, farewell: Number(raw[k]?.farewell) || 0 };
      }
      return d;
    } catch { return {}; }
  }
  function saveDex() { localStorage.setItem(LS.dex, JSON.stringify(dex)); }

  function safeKind(k) { return BUNNY_DEFS[k] ? k : "bunny1"; }

  function loadBunnyMeta() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS.bunnies) || "null");
      if (!Array.isArray(arr)) return null;
      return arr
        .map((x) => ({
          bornAt: Number(x?.bornAt) || (Date.now() - BABY_DURATION_MS - 9999),
          kind: safeKind(x?.kind),
        }))
        .filter(Boolean);
    } catch { return null; }
  }
  function saveBunnyMeta() {
    localStorage.setItem(
      LS.bunnies,
      JSON.stringify(bunnies.map((b) => ({ bornAt: b.bornAt, kind: b.kind })))
    );
  }

  function loadGoldenUnchiCount() {
    const n = parseInt(localStorage.getItem(LS.unchi) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }
  function saveGoldenUnchiCount() {
    localStorage.setItem(LS.unchi, String(goldenUnchiCount));
  }

  /* =========================
   * HUD
   * ========================= */
  function updateHud() {
    coinValueEl.textContent = String(coins);
    emit("hudUpdated", { coins });
  }

  /* =========================
   * Drops（Coin / OugonUnchi）
   * ========================= */
  function coinValueFromTier(t) {
    if (t === 4) return 100;
    if (t === 3) return 10;
    if (t === 2) return 5;
    return 1;
  }

  const dropByEl = new WeakMap();
  const dropsOnField = [];

  class DropBase {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() * 2 - 1) * 110;
      this.vy = -(420 + Math.random() * 240);
      this.gravity = 2200;
      this.bounce = 0.22 + Math.random() * 0.12;
      this.floor = groundY();
      this.el = null;
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
      if (!this.el) return;
      this.el.style.left = `${this.x}px`;
      this.el.style.top  = `${this.y}px`;
    }
    removeSelf() {
      try { this.el?.remove(); } catch {}
      const idx = dropsOnField.indexOf(this);
      if (idx >= 0) dropsOnField.splice(idx, 1);
    }
  }

  class Coin extends DropBase {
    constructor(x, y, tier) {
      super(x, y);
      this.value = coinValueFromTier(tier);

      const el = document.createElement("img");
      el.className = "coin";
      el.src = ASSETS.coins[tier - 1];
      el.draggable = false;
      this.el = el;

      dropByEl.set(el, this);

      // PC: hover / click
      el.addEventListener("pointerenter", () => this.collect());
      el.addEventListener("click", () => this.collect());
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.collect(); });

      coinLayer.appendChild(el);
      this.render();
    }
    collect() {
      if (!this.el || !this.el.isConnected) return;
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

      const el = document.createElement("img");
      el.className = "ougonunchi";
      el.src = ASSETS.ougonUnchi;
      el.draggable = false;
      this.el = el;

      dropByEl.set(el, this);

      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collect();
      });
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collect();
      });

      coinLayer.appendChild(el);
      this.render();
    }
    collect() {
      if (!this.el || !this.el.isConnected) return;
      coins += this.value;
      goldenUnchiCount += 1;

      saveGoldenUnchiCount();
      emit("goldenUnchiCollected", { goldenUnchiCount });

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
    return clamp(Math.ceil(clamp(g01, 0, 1) * 4), 1, 4);
  }

  function pickTierMixed(maxTier) {
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

  function spawnRainFromBunny(bunny, gauge01) {
    const maxTier = gaugeToTier(gauge01);
    const mul = BUNNY_DEFS[bunny.kind]?.coinMul ?? 1;
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
  const bunnies = [];

  class Bunny {
    constructor(bornAt, kind = "bunny1") {
      this.bornAt = bornAt;
      this.kind = safeKind(kind);

      this.isBaby = (Date.now() - this.bornAt) < BABY_DURATION_MS;

      // dex seen 更新
      if (!dex[this.kind]) dex[this.kind] = { seen: true, farewell: 0 };
      else dex[this.kind].seen = true;
      saveDex();

      // DOM
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
      this.y = groundY() - 140; // wrap高に合わせて
      this.dir = Math.random() < 0.5 ? -1 : 1;

      this.baseSpeed = 55 + Math.random() * 60;
      this.gauge = 0; // 0..1
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
      this.el.src = this.isBaby
        ? ASSETS.babyBunny
        : (BUNNY_DEFS[this.kind]?.img || BUNNY_DEFS.bunny1.img);
    }

    evolveIfNeeded() {
      if (!this.isBaby) return;
      if (Date.now() - this.bornAt < BABY_DURATION_MS) return;

      this.isBaby = false;

      // reabunny 進化
      if (Math.random() < REA_EVOLVE_RATE) {
        this.kind = "reabunny";
        if (!dex.reabunny) dex.reabunny = { seen: true, farewell: 0 };
        else dex.reabunny.seen = true;
        saveDex();
      }

      this.syncSprite();
      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = rand(GAUGE_PERIOD_RANGE[0], GAUGE_PERIOD_RANGE[1]);
      this.heart.classList.remove("show");

      saveBunnyMeta();
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

    onClick() {
      playSE(this.isBaby ? seBaby : sePoyo);

      if (this.isBaby) {
        spawnBabyCoin(this);
        return;
      }

      spawnRainFromBunny(this, this.gauge);

      this.gauge = 0;
      this.charged = false;
      this.gaugePeriod = rand(GAUGE_PERIOD_RANGE[0], GAUGE_PERIOD_RANGE[1]);
      this.heart.classList.remove("show");
    }

    findLeaderForBaby() {
      let best = null;
      let bestD = Infinity;
      for (const b of bunnies) {
        if (b === this) continue;
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
      const wrapWidth = 140;

      const minX = 0;
      const maxX = Math.max(0, fr.width - wrapWidth);

      if (this.isBaby) {
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
          this.x += this.dir * this.baseSpeed * BABY_SPEED_MUL * dt;
        }
      } else {
        this.x += this.dir * this.baseSpeed * dt;
      }

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
      this.wrap.style.top  = `${this.y}px`;
    }
  }

  /* =========================
   * Touch collect (iPad/スマホ)
   * ========================= */
  let touchCollectActive = false;
  let touchPointerId = null;

  function collectAtClientPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;
    const target =
      (el.classList?.contains("coin") || el.classList?.contains("ougonunchi"))
        ? el
        : el.closest?.(".coin, .ougonunchi");
    if (!target) return;

    const drop = dropByEl.get(target);
    if (drop && typeof drop.collect === "function") drop.collect();
  }

  field.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    touchCollectActive = true;
    touchPointerId = e.pointerId;
    collectAtClientPoint(e.clientX, e.clientY);
  }, { passive: true });

  field.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") return;
    if (!touchCollectActive) return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    collectAtClientPoint(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    touchCollectActive = false;
    touchPointerId = null;
  }, { passive: true });

  window.addEventListener("pointercancel", (e) => {
    if (e.pointerType !== "touch") return;
    if (touchPointerId !== null && e.pointerId !== touchPointerId) return;
    touchCollectActive = false;
    touchPointerId = null;
  }, { passive: true });

  /* =========================
   * Bunny spawn/remove for modules
   * ========================= */
  function spawnBunny(kind, bornAt = Date.now()) {
    const b = new Bunny(bornAt, kind);
    bunnies.push(b);
    saveBunnyMeta();
    emit("bunnyCountChanged", { count: bunnies.length });
    return b;
  }

  function removeBunnyInstance(b) {
    const idx = bunnies.indexOf(b);
    if (idx < 0) return false;
    try { b.wrap.remove(); } catch {}
    bunnies.splice(idx, 1);
    saveBunnyMeta();
    emit("bunnyCountChanged", { count: bunnies.length });
    return true;
  }

  /* =========================
   * Reset
   * ========================= */
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      unlockAudioOnce();
      if (!confirm("リセットしますか？")) return;
      localStorage.removeItem(LS.coins);
      localStorage.removeItem(LS.bunnies);
      localStorage.removeItem(LS.dex);
      localStorage.removeItem(LS.unchi);
      localStorage.removeItem(LS.title);
      localStorage.removeItem(LS.titleList);
      emit("resetRequested", {});
      location.reload();
    });
  }

  /* =========================
   * Loop
   * ========================= */
  let coins = loadCoins();
  let dex = loadDex();
  let goldenUnchiCount = loadGoldenUnchiCount();
  let lastFrame = performance.now();

  function initBunnies() {
    const meta = loadBunnyMeta();
    if (meta && meta.length >= 1) {
      meta.forEach((m) => spawnBunny(m.kind, m.bornAt));
      return;
    }

    // ★ 初期2体は必ず大人（bornAtを過去にして baby 判定を外す）
    const t = Date.now();
    spawnBunny("bunny1", t - BABY_DURATION_MS - 1000);
    spawnBunny("bunny1", t - BABY_DURATION_MS - 2000);
    saveBunnyMeta();
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    const gy = groundY();
    for (const d of dropsOnField) d.floor = gy;

    for (const b of bunnies) b.update(dt);
    for (const d of dropsOnField) d.update(dt);

    requestAnimationFrame(tick);
  }

  function init() {
    initBunnies();
    updateHud();

    emit("bunnyCountChanged", { count: bunnies.length });
    emit("goldenUnchiCollected", { goldenUnchiCount });

    requestAnimationFrame(tick);

    window.addEventListener("resize", () => {
      const gy = groundY();
      for (const b of bunnies) b.y = gy - 140;
      emit("resize", {});
    }, { passive: true });
  }

  /* =========================
   * WB public API（tabidati/omukae/zukan/syougou が使う）
   * ========================= */
  window.WB = {
    // events
    on, off, emit,

    // const/defs
    ASSETS,
    BUNNY_DEFS,
    LS,
    DEPART_COST,

    // dom
    field,
    shopBtn,
    departBtn,
    rankBtn,

    // state
    get coins() { return coins; },
    set coins(v) { coins = Math.max(0, Math.floor(Number(v) || 0)); saveCoins(); updateHud(); },
    get dex() { return dex; },
    set dex(v) { dex = v || {}; saveDex(); },
    get goldenUnchiCount() { return goldenUnchiCount; },

    // storage
    saveCoins,
    saveBunnyMeta,
    loadDex,
    saveDex,
    saveGoldenUnchiCount,

    // ui/audio
    updateHud,
    unlockAudioOnce,
    playSE,
    seTabidati,

    // bunnies
    bunnies,
    spawnBunny,
    removeBunnyInstance,
  };

  /* =========================
   * saku.png 左右表示（v6仕様）
   * ========================= */
  (function mountSakuSides() {
    const SRC = "./assets/saku.png";
    if (document.getElementById("sakuLeft")) return;

    const make = (id, side) => {
      const img = document.createElement("img");
      img.id = id;
      img.src = SRC;
      img.alt = "saku";
      img.draggable = false;
      img.decoding = "async";
      img.loading = "eager";
      img.className = `saku ${side}`;
      img.addEventListener("error", () => {
        console.error("[saku] load failed:", img.src);
      });
      document.body.appendChild(img);
    };
    make("sakuLeft", "left");
    make("sakuRight", "right");
  })();

  init();
})();
