/* app.js — Milkpop牧場 最終版
 * - クリック時のみコインドロップ
 * - ゲージUIなし（内部管理）
 * - MAX時のみハート表示
 * - bunny / bunny1,3,4,5 / reabunny 使用
 * - babybunny は小さく
 */

(() => {
  "use strict";

  /* =====================
   * Utils
   * ===================== */
  const $ = (q, p = document) => p.querySelector(q);
  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => Date.now();

  /* =====================
   * DOM
   * ===================== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");
  const resetBtn = $("#resetBtn");

  /* =====================
   * Assets
   * ===================== */
  const ASSET = {
    baby: "./assets/babybunny.png",
    adultList: [
      "./assets/bunny.png",
      "./assets/bunny1.png",
      "./assets/bunny3.png",
      "./assets/bunny4.png",
      "./assets/bunny5.png",
      "./assets/reabunny.png",
    ],
    hart: "./assets/hart.png",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  /* =====================
   * Constants
   * ===================== */
  const START_BUNNIES = 2;
  const BABY_GROW_MS = 3 * 60 * 1000;
  const CLICK_COOLDOWN = 1000;

  const SIZE = {
    adultW: 96,
    adultH: 96,
    babyScale: 0.65, // ← bunnyより小さく
    coin: 28,
    hart: 36,
  };

  const GAUGE = {
    max: 100,
    perSec: 4,
    drain: 35,
  };

  /* =====================
   * Audio
   * ===================== */
  const SE_POYO = new Audio(ASSET.sePoyo);
  const SE_COIN = new Audio(ASSET.seCoin);

  const playSE = (a) => {
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  };

  /* =====================
   * State
   * ===================== */
  let coin = 0;
  const bunnies = [];
  let lastTick = now();

  /* =====================
   * Coin
   * ===================== */
  function addCoin(n) {
    coin += n;
    coinValueEl.textContent = coin;
  }

  function spawnCoin(x, y) {
    const el = document.createElement("img");
    el.className = "coin";
    el.src = ASSET.coins[Math.floor(Math.random() * ASSET.coins.length)];
    el.style.position = "absolute";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${SIZE.coin}px`;
    el.style.height = `${SIZE.coin}px`;

    const collect = () => {
      playSE(SE_COIN);
      addCoin(1);
      el.remove();
    };

    el.addEventListener("mouseenter", collect);
    el.addEventListener("click", collect);

    coinLayer.appendChild(el);
  }

  /* =====================
   * Bunny
   * ===================== */
  function createBunny(isBaby = false) {
    const el = document.createElement("img");
    el.className = "bunny";
    el.src = isBaby
      ? ASSET.baby
      : ASSET.adultList[Math.floor(Math.random() * ASSET.adultList.length)];

    const b = {
      el,
      isBaby,
      bornAt: now(),
      growAt: isBaby ? now() + BABY_GROW_MS : 0,
      gauge: 0,
      lastClick: 0,
      x: rand(20, field.clientWidth - 120),
      dir: Math.random() < 0.5 ? -1 : 1,
      hart: null,
    };

    el.style.position = "absolute";
    el.style.userSelect = "none";

    resizeBunny(b);
    bunnyLayer.appendChild(el);

    el.addEventListener("click", () => {
      const t = now();
      if (t - b.lastClick < CLICK_COOLDOWN) return;
      b.lastClick = t;

      playSE(SE_POYO);
      dropCoins(b);
    });

    // ハート
    const h = document.createElement("img");
    h.src = ASSET.hart;
    h.style.position = "absolute";
    h.style.width = `${SIZE.hart}px`;
    h.style.height = `${SIZE.hart}px`;
    h.style.pointerEvents = "none";
    h.style.opacity = "0";
    h.style.transform = "translate(-50%, -100%)";
    bunnyLayer.appendChild(h);
    b.hart = h;

    bunnies.push(b);
    return b;
  }

  function resizeBunny(b) {
    const scale = b.isBaby ? SIZE.babyScale : 1;
    b.el.style.width = `${SIZE.adultW * scale}px`;
    b.el.style.height = `${SIZE.adultH * scale}px`;
  }

  function dropCoins(b) {
    const base = b.isBaby ? 1 : 1 + Math.floor(b.gauge / 25);
    const count = clamp(base, 1, 8);

    for (let i = 0; i < count; i++) {
      spawnCoin(
        b.x + 40 + rand(-10, 10),
        field.clientHeight - 80
      );
    }

    if (!b.isBaby) {
      b.gauge = clamp(b.gauge - GAUGE.drain, 0, GAUGE.max);
    }
  }

  /* =====================
   * Loop
   * ===================== */
  function update() {
    const t = now();
    const dt = (t - lastTick) / 1000;
    lastTick = t;

    for (const b of bunnies) {
      // 成長
      if (b.isBaby && b.growAt && t >= b.growAt) {
        b.isBaby = false;
        b.el.src =
          ASSET.adultList[Math.floor(Math.random() * ASSET.adultList.length)];
        resizeBunny(b);
      }

      // ゲージ
      if (!b.isBaby) {
        b.gauge = clamp(b.gauge + GAUGE.perSec * dt, 0, GAUGE.max);
      }

      // 移動
      b.x += 0.3 * b.dir;
      if (b.x < 0 || b.x > field.clientWidth - SIZE.adultW) b.dir *= -1;

      b.el.style.left = `${b.x}px`;
      b.el.style.top = `${field.clientHeight - 120}px`;
      b.el.style.transform = `scaleX(${b.dir})`;

      // ハート（MAX時のみ）
      b.hart.style.left = `${b.x + SIZE.adultW / 2}px`;
      b.hart.style.top = `${field.clientHeight - 130}px`;
      b.hart.style.opacity = b.gauge >= GAUGE.max ? "1" : "0";
    }

    requestAnimationFrame(update);
  }

  /* =====================
   * UI
   * ===================== */
  shopBtn?.addEventListener("click", () => createBunny(true));
  resetBtn?.addEventListener("click", () => location.reload());

  /* =====================
   * Start
   * ===================== */
  for (let i = 0; i < START_BUNNIES; i++) createBunny(false);
  update();
})();
