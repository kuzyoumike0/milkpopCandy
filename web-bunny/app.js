/* app.js — Milkpop牧場（コア）
 * - うさぎ2匹で開始 / 左右にウロウロ
 * - 放置でコインを落とす
 * - うさぎクリックでもコイン（1秒クール） + poyo.mp3
 * - コインは床に重なって溜まる / クリック or ホバーで回収 + coin.mp3
 * - 各モジュール（omukae/zisseki/syougou/zukan/tabidati 等）が参照できるよう window.WB を提供
 * - saku.png を左右端に小さく表示
 */

(() => {
  "use strict";

  const $ = (q, p = document) => p.querySelector(q);

  /* ===== 参照要素 ===== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");     // お迎え
  const slotBtn = $("#slotBtn");     // スロット
  const rankBtn = $("#rankBtn");     // 図鑑/称号
  const departBtn = $("#departBtn"); // 旅立ち
  const resetBtn = $("#resetBtn");   // リセット

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.warn("[WB] required DOM not found");
    return;
  }

  /* ===== アセット ===== */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    baby: "./assets/babybunny.png",
    rea: "./assets/reabunny.png",
    ougon: "./assets/ougonunchi.png",
    poyo: "./assets/poyo.mp3",
    coinSe: "./assets/coin.mp3",
    saku: "./assets/saku.png",
  };

  /* ===== 定数 ===== */
  const COIN_IDLE_MIN_MS = 5000;
  const COIN_IDLE_MAX_MS = 9000;
  const CLICK_COIN_COOLDOWN_MS = 1000;

  const COIN_FALL_BOUNCE = 0.28;
  const COIN_FALL_DUR_MS = 260;
  const COIN_STACK_Y_JITTER = 2;

  const BUNNY_WALK_SPEED = 22;
  const BUNNY_TURN_MIN_MS = 1200;
  const BUNNY_TURN_MAX_MS = 2600;

  /* ===== セーブ ===== */
  const LS_KEY = "milkpop_wb_save_v1";

  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ===== SE ===== */
  function oneShot(src, vol = 0.9) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* ===== WB API ===== */
  const WB = (window.WB ||= {});
  WB.coins = 0;
  WB.bunnies = [];
  WB.coinsOnField = [];

  WB.ui = {
    field, bunnyLayer, coinLayer, coinValueEl,
    shopBtn, slotBtn, rankBtn, departBtn, resetBtn,
  };

  WB.state = { departMode: false };

  WB.updateHud = () => {
    coinValueEl.textContent = String(Math.max(0, Math.floor(WB.coins)));
  };

  WB.addCoins = (v) => {
    WB.coins = Math.max(0, Math.floor(WB.coins + (v || 0)));
    WB.updateHud();
    save();
  };

  WB.getOmukaeCost = () => {
    const n = WB.bunnies.length;
    return 2000 + Math.floor((n * (n + 1)) / 2) * 1000;
  };

  /* ===== saku ===== */
  function mountSaku() {
    if ($("#sakuLeft")) return;
    ["left", "right"].forEach(side => {
      const img = document.createElement("img");
      img.id = side === "left" ? "sakuLeft" : "sakuRight";
      img.src = ASSETS.saku;
      img.style.position = "fixed";
      img.style.bottom = "10px";
      img.style[side] = "10px";
      img.style.width = "72px";
      img.style.pointerEvents = "none";
      img.style.zIndex = "2";
      document.body.appendChild(img);
    });
  }

  /* ===== うさぎ ===== */
  let bunnyIdSeq = 1;

  function fieldRect() {
    const r = field.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function createBunny(kind = "bunny", x = null) {
    const id = bunnyIdSeq++;
    const el = document.createElement("img");
    el.className = "wb-bunny";
    el.src =
      kind === "baby" ? ASSETS.baby :
      kind === "rea"  ? ASSETS.rea  :
      ASSETS.bunny;

    const isBaby = kind === "baby";

    el.style.position = "absolute";
    el.style.width = isBaby ? "72px" : "96px";   // ★ baby は小さく
    el.style.userSelect = "none";
    el.style.cursor = "pointer";
    el.style.zIndex = "5";

    const fr = fieldRect();
    const startX = x ?? rand(40, fr.w - 140);
    const y = fr.h - (isBaby ? 110 : 120);       // ★ baby は少し下げる

    const bunny = {
      id, el, kind,
      x: startX, y,
      dir: Math.random() < 0.5 ? -1 : 1,
      nextTurnAt: now() + randi(BUNNY_TURN_MIN_MS, BUNNY_TURN_MAX_MS),
      nextIdleCoinAt: now() + randi(COIN_IDLE_MIN_MS, COIN_IDLE_MAX_MS),
      lastClickCoinAt: 0,
    };

    el.style.transform = `translate(${bunny.x}px,${bunny.y}px) scaleX(${bunny.dir})`;
    bunnyLayer.appendChild(el);
    WB.bunnies.push(bunny);

    el.addEventListener("click", e => {
      e.stopPropagation();
      const t = now();
      if (t - bunny.lastClickCoinAt < CLICK_COIN_COOLDOWN_MS) return;
      bunny.lastClickCoinAt = t;
      oneShot(ASSETS.poyo);
      dropCoinAtBunnyFeet(bunny, 1);
    });

    return bunny;
  }

  function updateBunnies(dt) {
    const fr = fieldRect();
    const minX = 10;
    const maxX = fr.w - 110;

    for (const b of WB.bunnies) {
      if (now() >= b.nextTurnAt) {
        b.dir *= -1;
        b.nextTurnAt = now() + randi(BUNNY_TURN_MIN_MS, BUNNY_TURN_MAX_MS);
      }

      b.x += b.dir * BUNNY_WALK_SPEED * dt;
      if (b.x < minX || b.x > maxX) b.dir *= -1;

      if (now() >= b.nextIdleCoinAt) {
        dropCoinAtBunnyFeet(b, 1);
        b.nextIdleCoinAt = now() + randi(COIN_IDLE_MIN_MS, COIN_IDLE_MAX_MS);
      }

      b.el.style.transform =
        `translate(${b.x}px,${b.y}px) scaleX(${b.dir})`;
    }
  }

  /* ===== コイン ===== */
  let coinIdSeq = 1;

  function dropCoinAtBunnyFeet(bunny, value = 1) {
    const el = document.createElement("div");
    el.className = "wb-coin";
    el.textContent = "🪙";
    el.style.position = "absolute";
    el.style.fontSize = "26px";
    el.style.cursor = "pointer";
    el.style.zIndex = "6";

    const fr = fieldRect();
    const x = bunny.x + (bunny.kind === "baby" ? 30 : 40);
    const y = fr.h - 54;

    el.style.transform = `translate(${x}px,${y - 50}px)`;
    el.style.transition = `transform ${COIN_FALL_DUR_MS}ms cubic-bezier(.2,1.1,.2,1)`;
    coinLayer.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = `translate(${x}px,${y}px)`;
    });

    el.addEventListener("mouseenter", () => collectCoin(el, value));
    el.addEventListener("click", () => collectCoin(el, value));
  }

  function collectCoin(el, value) {
    if (!el.isConnected) return;
    oneShot(ASSETS.coinSe, 0.85);
    WB.addCoins(value);
    el.remove();
  }

  /* ===== セーブ ===== */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        coins: WB.coins,
        bunnies: WB.bunnies.map(b => ({ kind: b.kind }))
      }));
    } catch {}
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY));
      if (!d) return false;
      WB.coins = d.coins || 0;
      WB.updateHud();
      d.bunnies.forEach(b => createBunny(b.kind));
      return true;
    } catch {
      return false;
    }
  }

  /* ===== 起動 ===== */
  function boot() {
    mountSaku();
    if (!load()) {
      createBunny("bunny", 70);
      createBunny("bunny", null);
    }
    let last = performance.now();
    function tick(t) {
      const dt = clamp((t - last) / 1000, 0, 0.05);
      last = t;
      updateBunnies(dt);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener("load", boot);
})();
