/* app.js — Bunny牧場（完成版） */

(() => {
  "use strict";

  const $ = (q, p = document) => p.querySelector(q);

  /* =====================
   * DOM
   * ===================== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");
  const shopBtn = $("#shopBtn");

  /* =====================
   * Assets
   * ===================== */
  const BUNNY_IMG = "./assets/bunny.png";
  const BABY_IMG  = "./assets/babybunny.png";

  const SE_POYO = new Audio("./assets/poyo.mp3");
  const SE_COIN = new Audio("./assets/coin.mp3");

  /* =====================
   * Game State
   * ===================== */
  let coin = 0;
  let bunnyIdSeq = 0;
  const bunnies = [];

  /* =====================
   * Utils
   * ===================== */
  const rand = (a, b) => Math.random() * (b - a) + a;

  function addCoin(v) {
    coin += v;
    coinValueEl.textContent = coin;
  }

  /* =====================
   * Coin
   * ===================== */
  function spawnCoin(x, y) {
    const el = document.createElement("div");
    el.className = "coin";
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;

    const collect = () => {
      SE_COIN.currentTime = 0;
      SE_COIN.play();
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
    const id = ++bunnyIdSeq;

    const el = document.createElement("img");
    el.className = "bunny";
    el.src = isBaby ? BABY_IMG : BUNNY_IMG;

    const state = {
      id,
      el,
      isBaby,
      x: rand(40, field.clientWidth - 80),
      y: field.clientHeight - 120,
      vx: rand(-0.4, 0.4),
      lastClick: 0,
    };

    if (isBaby) el.classList.add("baby");

    el.style.left = `${state.x}px`;
    el.style.top  = `${state.y}px`;

    /* クリックでコイン */
    el.addEventListener("click", () => {
      const now = Date.now();
      if (now - state.lastClick < 1000) return;
      state.lastClick = now;

      SE_POYO.currentTime = 0;
      SE_POYO.play();

      dropCoins(state);
    });

    bunnyLayer.appendChild(el);
    bunnies.push(state);

    /* 3分で成長 */
    if (isBaby) {
      setTimeout(() => {
        state.isBaby = false;
        el.src = BUNNY_IMG;
        el.classList.remove("baby");
      }, 180000);
    }

    /* 放置ドロップ */
    setInterval(() => dropCoins(state), 5000 + Math.random() * 4000);

    return state;
  }

  function dropCoins(bunny) {
    const baseX = bunny.x + 30;
    const baseY = bunny.y + 50;

    const count = bunny.isBaby ? 1 : Math.floor(rand(1, 4));

    for (let i = 0; i < count; i++) {
      spawnCoin(
        baseX + rand(-8, 8),
        baseY + rand(-4, 4)
      );
    }
  }

  /* =====================
   * Movement
   * ===================== */
  function update() {
    for (const b of bunnies) {
      b.x += b.vx;

      if (b.x < 20 || b.x > field.clientWidth - 80) {
        b.vx *= -1;
      }

      b.el.style.left = `${b.x}px`;
    }

    requestAnimationFrame(update);
  }

  /* =====================
   * Shop
   * ===================== */
  shopBtn.addEventListener("click", () => {
    if (coin < 10) return alert("コインが足りません");
    coin -= 10;
    coinValueEl.textContent = coin;
    createBunny(true);
  });

  /* =====================
   * Start
   * ===================== */
  createBunny(false);
  createBunny(false);

  update();
})();
