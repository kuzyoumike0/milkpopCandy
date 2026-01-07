/* app.js — Milkpop牧場（CSS: bunnyWrap前提 / お迎え=omukae.js依存）
 * - 初期：bunny.png（大人）2匹
 * - お迎え（shopBtn）は WB.emit("omukae:open") するだけ（UI/購入はomukae.js）
 * - omukae.js から:
 *   - WB.spendCoin(cost)
 *   - WB.createBunny({ isBaby:true, targetAdultSrc:"./assets/bunny3.png" })
 *   - WB.omukaeCatalog
 *
 * - クリック時のみコインドロップ（放置ドロップなし）
 * - coin価値: coin1=1 / coin2=5 / coin3=10 / coin4=100
 * - ゲージ量でティア(1..4)決定（1低〜4高）
 * - MAX到達“瞬間だけ”ハートふわふわ（MAX中は表示のみ）
 * - baby→3分で進化：targetAdultSrc があればそれへ確定進化
 *   - ただし targetAdultSrc が bunny1 の場合のみ 0.5% で reabunny
 * - reset：うさぎ + 所持コイン + 落ちコインのみ初期化（他LS保持）
 */

(() => {
  "use strict";
console.log("[app.js] loaded", "version=v11-wrapCss", Date.now());

  /* =========================
   * Helpers
   * ========================= */
  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const now = () => Date.now();

  /* =========================
   * DOM
   * ========================= */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");   // お迎え（omukae.jsが処理）
  const slotBtn = $("#slotBtn");
  const departBtn = $("#departBtn");
  const resetBtn = $("#resetBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] required DOM not found");
    return;
  }

  /* =========================
   * Constants
   * ========================= */
  const LS = {
    coin: "wb_coin_v1",
    bunnies: "wb_bunnies_v11_wrapCss",
  };

  const ASSET = {
    bunny: "./assets/bunny.png",
    bunny1: "./assets/bunny1.png",
    bunny3: "./assets/bunny3.png",
    bunny4: "./assets/bunny4.png",
    bunny5: "./assets/bunny5.png",
    reabunny: "./assets/reabunny.png",

    baby: "./assets/babybunny.png",
    hart: "./assets/hart.png",

    coin1: "./assets/coin1.png",
    coin2: "./assets/coin2.png",
    coin3: "./assets/coin3.png",
    coin4: "./assets/coin4.png",

    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  // omukae.js が参照する「商品一覧」(costは仮。omukae.js側でインフレ等で上書きOK)
  const OMUKAE_CATALOG = [
    { key: "bunny1", name: "bunny1", src: ASSET.bunny1, cost: 200 },
    { key: "bunny3", name: "bunny3", src: ASSET.bunny3, cost: 200 },
    { key: "bunny4", name: "bunny4", src: ASSET.bunny4, cost: 200 },
    { key: "bunny5", name: "bunny5", src: ASSET.bunny5, cost: 200 },
  ];

  const COIN_TIER = {
    1: { src: ASSET.coin1, value: 1 },
    2: { src: ASSET.coin2, value: 5 },
    3: { src: ASSET.coin3, value: 10 },
    4: { src: ASSET.coin4, value: 100 },
  };

  const START_BUNNIES = 2;
  const CLICK_COOLDOWN_MS = 1000;
  const BABY_GROW_MS = 3 * 60 * 1000;

  const GAUGE = {
    max: 100,
    perSec: 4,          // 1秒あたりの増加
    drainOnDrop: 35,    // クリックドロップで減少
    showHartAt: 100,    // MAX到達時のみ表示
  };

  // bunny1指定の時だけ 0.5% で reabunny
  const REA_RULE = { fromBunny1ToReaChance: 0.005 };

  // CSSの coin は 32px 前提（style.css）なので合わせる
  const COIN_W = 32;
  const COIN_H = 32;

  const LS = {
  coin: "wb_coin_v1",
  bunnies: "wb_bunnies_v11_wrapCss",

  // ★過去キー（ここに過去使ってたものを全部並べる）
  legacyBunnyKeys: [
    "wb_bunnies_v10_omukaeDepends",
    "wb_bunnies_v9",
    "wb_bunnies_v8",
  ],
  legacyCoinKeys: [
    "wb_coin_v0",
  ],
};

  /* =========================
   * Audio
   * ========================= */
  const SE = {
    poyo: new Audio(ASSET.sePoyo),
    coin: new Audio(ASSET.seCoin),
  };
  SE.poyo.preload = "auto";
  SE.coin.preload = "auto";

  function playSE(aud) {
    try { aud.currentTime = 0; aud.play(); } catch {}
  }

  /* =========================
   * State
   * ========================= */
  let coin = 0;
  const bunnies = [];
  const spawnedCoins = new Map();

  let rafId = 0;
  let lastTickAt = now();

  /* =========================
   * Storage
   * ========================= */
  function loadCoin() {
    const n = Number(localStorage.getItem(LS.coin) || "0");
    coin = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    coinValueEl.textContent = String(coin);
  }
  function saveCoin() {
    localStorage.setItem(LS.coin, String(coin));
  }

  function loadBunnies() {
    try {
      const raw = localStorage.getItem(LS.bunnies);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => ({
          bornAt: Number(x?.bornAt),
          x: Number(x?.x),
          dir: Number(x?.dir),
          isBaby: !!x?.isBaby,
          growAt: Number(x?.growAt || 0),
          gauge: Number(x?.gauge || 0),
          maxAnimArmed: x?.maxAnimArmed !== false,
          adultSrc: typeof x?.adultSrc === "string" ? x.adultSrc : "",
          targetAdultSrc: typeof x?.targetAdultSrc === "string" ? x.targetAdultSrc : "",
        }))
        .filter((x) => Number.isFinite(x.bornAt));
    } catch {
      return [];
    }
  }

  function saveBunnies() {
    const data = bunnies.map((b) => ({
      bornAt: b.bornAt,
      x: Math.round(b.x),
      dir: b.dir,
      isBaby: b.isBaby,
      growAt: b.growAt,
      gauge: Math.round(b.gauge),
      maxAnimArmed: b.maxAnimArmed,
      adultSrc: b.adultSrc || "",
      targetAdultSrc: b.targetAdultSrc || "",
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* =========================
   * Coin
   * ========================= */
  function renderCoin() { coinValueEl.textContent = String(coin); }

  function addCoin(n) {
    coin = Math.max(0, coin + Math.floor(n));
    renderCoin();
    saveCoin();
  }

  function spendCoin(n) {
    n = Math.floor(n);
    if (coin < n) return false;
    coin -= n;
    renderCoin();
    saveCoin();
    return true;
  }

  function getFloorY() {
    // だいたい地面ライン。必要ならCSSに合わせて調整。
    return Math.max(0, field.clientHeight - 74);
  }

  function tierFromGauge(g) {
    g = clamp(g, 0, GAUGE.max);
    if (g < 25) return 1;
    if (g < 50) return 2;
    if (g < 75) return 3;
    return 4;
  }

  function spawnCoinAtTier(tier, x, y) {
    const def = COIN_TIER[tier] || COIN_TIER[1];
    const id = now() + Math.floor(Math.random() * 9999);

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.alt = `coin-tier-${tier}`;
    el.draggable = false;

    const floorY = getFloorY();
    const px = clamp(x, 0, field.clientWidth - COIN_W);
    const py = clamp(y, 0, floorY);

    el.style.left = `${px}px`;
    el.style.top = `${py}px`;

    // style.css: #coinLayer pointer-events:none なので coin は pointer-events:auto が有効
    const collect = () => {
      if (!spawnedCoins.has(id)) return;
      spawnedCoins.delete(id);
      el.remove();
      playSE(SE.coin);
      addCoin(def.value);
    };
    el.addEventListener("mouseenter", collect, { passive: true });
    el.addEventListener("click", collect);

    coinLayer.appendChild(el);
    spawnedCoins.set(id, el);
    return id;
  }

  function clearAllSpawnedCoins() {
    for (const el of spawnedCoins.values()) {
      try { el.remove(); } catch {}
    }
    spawnedCoins.clear();
  }

  /* =========================
   * Bunny (CSS: .bunnyWrap / .bunny / .bunnyHeart)
   * ========================= */
  function placeWrap(b) {
    const maxX = Math.max(0, field.clientWidth - 140); // .bunnyWrap width
    b.x = clamp(b.x, 0, maxX);

    const floorY = getFloorY();
    // wrap を地面に合わせる（wrap height 140）
    b.y = clamp(floorY - 140 + 22, 0, floorY);

    b.wrap.style.left = `${b.x}px`;
    b.wrap.style.top = `${b.y}px`;

    // flip は wrap に付ける（CSS準拠）
    if (b.dir < 0) b.wrap.classList.add("flip");
    else b.wrap.classList.remove("flip");
  }

  function setHeartVisible(b, isVisible, animateOnce) {
    if (isVisible) {
      b.heart.classList.add("show");
      if (animateOnce) {
        // show は常時無限アニメなので、「瞬間だけふわふわ」を実現するため
        // show を一旦付けて、少ししたら外して“表示は維持”したいが、
        // 仕様は「MAX時だけハート」＝MAX中表示OKなので、
        // ここでは animateOnce=true のときだけ 2.6秒後に show を外す。
        // （MAX中ずっとふわふわさせたい場合は外さない）
        setTimeout(() => {
          // MAX中でも「ふわふわは瞬間だけ」なので外す
          b.heart.classList.remove("show");
        }, 2600);
      }
    } else {
      b.heart.classList.remove("show");
    }
  }

  function updateHeart(b) {
    // heart の表示条件：MAXの時だけ
    const isMax = b.gauge >= GAUGE.showHartAt;

    // MAX到達“瞬間だけ”ふわふわ
    if (isMax && b.maxAnimArmed) {
      b.maxAnimArmed = false;
      setHeartVisible(b, true, true);
      saveBunnies();
      return;
    }

    // MAXでないなら非表示＆再アーム
    if (!isMax) {
      if (!b.maxAnimArmed) {
        b.maxAnimArmed = true;
        saveBunnies();
      }
      setHeartVisible(b, false, false);
      return;
    }

    // MAXだが到達済み（ふわふわはしない、表示は維持…の仕様なら show を付ける）
    // ただし show を付けると無限ふわふわになるので、ここは表示だけにしたい。
    // 画像自体を見せるだけにするなら、CSSを少し変える必要がある。
    // ここでは「MAX時はハート表示、ふわふわは瞬間だけ」に合わせて、
    // show を付けず opacityだけ上げる（インラインで上書き）。
    b.heart.style.opacity = "1";
  }

  function calcDropCount(b) {
    if (b.isBaby) return 1;
    const step = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);
    return clamp(1 + step + (b.gauge >= GAUGE.max ? 1 : 0), 1, 8);
  }

  function drainGaugeOnDrop(b) {
    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
  }

  function dropCoinsFromBunny(b) {
    const tier = b.isBaby ? 1 : tierFromGauge(b.gauge);
    const count = calcDropCount(b);

    // だいたい足元（wrap 140 の下辺 / bunny画像が bottom 0）
    const footX = b.x + 60;            // 140の中央
    const footY = b.y + 140 - 10;

    for (let i = 0; i < count; i++) {
      const cx = footX + rand(-12, 12) - COIN_W / 2;
      const cy = footY + rand(-6, 2) - COIN_H / 2;
      spawnCoinAtTier(tier, cx, cy);
    }

    if (!b.isBaby) {
      drainGaugeOnDrop(b);
      updateHeart(b);
      saveBunnies();
    }
  }

  function evolveBaby(b) {
    let target = b.targetAdultSrc || ASSET.bunny;

    // bunny1指定だけ 0.5% で reabunny
    if (target === ASSET.bunny1 && Math.random() < REA_RULE.fromBunny1ToReaChance) {
      target = ASSET.reabunny;
    }

    b.isBaby = false;
    b.growAt = 0;
    b.adultSrc = target;

    b.wrap.classList.remove("baby");
    b.img.src = b.adultSrc;

    saveBunnies();
  }

  function createBunny({
    isBaby = false,
    x,
    dir,
    bornAt,
    growAt,
    gauge,
    maxAnimArmed,
    adultSrc,
    targetAdultSrc,
  } = {}) {
    // CSS準拠：wrapがクリック判定
    const wrap = document.createElement("div");
    wrap.className = "bunnyWrap";

    const img = document.createElement("img");
    img.className = "bunny";
    img.draggable = false;
    img.alt = "bunny";

    const heart = document.createElement("img");
    heart.className = "bunnyHeart";
    heart.src = ASSET.hart;
    heart.alt = "heart";
    heart.draggable = false;

    wrap.appendChild(img);
    wrap.appendChild(heart);
    bunnyLayer.appendChild(wrap);

    const b = {
      bornAt: Number.isFinite(bornAt) ? bornAt : now(),
      x: Number.isFinite(x) ? x : rand(40, Math.max(41, field.clientWidth - 180)),
      y: 0,
      vx: rand(0.25, 0.6),
      dir: Number.isFinite(dir) ? Math.sign(dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      isBaby: !!isBaby,
      growAt: Number.isFinite(growAt) && growAt > 0 ? growAt : (isBaby ? now() + BABY_GROW_MS : 0),
      lastClickAt: 0,
      gauge: Number.isFinite(gauge) ? clamp(gauge, 0, GAUGE.max) : 0,
      maxAnimArmed: (maxAnimArmed !== false),
      adultSrc: typeof adultSrc === "string" ? adultSrc : "",
      targetAdultSrc: typeof targetAdultSrc === "string" ? targetAdultSrc : "",
      wrap,
      img,
      heart,
    };

    if (b.isBaby) {
      wrap.classList.add("baby");
      img.src = ASSET.baby;
      b.adultSrc = "";
    } else {
      b.adultSrc = b.adultSrc || ASSET.bunny;
      img.src = b.adultSrc;
    }

    // heart 初期は非表示
    heart.style.opacity = "0";

    placeWrap(b);

    // ✅ クリックは wrap に付ける（.bunnyはpointer-events:noneなのでこれ必須）
    const onTap = (ev) => {
      ev?.stopPropagation?.();
      const t = now();
      if (t - b.lastClickAt < CLICK_COOLDOWN_MS) return;
      b.lastClickAt = t;

      playSE(SE.poyo);
      dropCoinsFromBunny(b);
    };
    wrap.addEventListener("pointerdown", onTap);
    wrap.addEventListener("click", onTap);

    bunnies.push(b);
    saveBunnies();
    return b;
  }

  function clearAllBunnies() {
    for (const b of bunnies) {
      try { b.wrap.remove(); } catch {}
    }
    bunnies.length = 0;
  }

  /* =========================
   * Loop
   * ========================= */
  function step() {
    const t = now();
    const dtSec = Math.max(0, Math.min(0.2, (t - lastTickAt) / 1000));
    lastTickAt = t;

    for (const b of bunnies) {
      // 成長
      if (b.isBaby && b.growAt && t >= b.growAt) {
        evolveBaby(b);
      }

      // ゲージ（adultのみ）
      if (!b.isBaby) {
        b.gauge = clamp(b.gauge + GAUGE.perSec * dtSec, 0, GAUGE.max);
      } else {
        b.gauge = 0;
      }

      // 移動
      b.x += b.vx * b.dir;
      const maxX = Math.max(0, field.clientWidth - 140);
      if (b.x <= 0) { b.x = 0; b.dir = 1; }
      else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }

      placeWrap(b);

      // ハート
      // showクラスは無限アニメなので、MAX中の表示は opacity を使う
      const isMax = b.gauge >= GAUGE.showHartAt;
      if (isMax) b.heart.style.opacity = "1";
      else b.heart.style.opacity = "0";
      updateHeart(b);
    }

    rafId = requestAnimationFrame(step);
  }

  function onResize() {
    for (const b of bunnies) placeWrap(b);
    saveBunnies();
  }

  /* =========================
   * WB (Public API) — omukae.js用
   * ========================= */
  const WB = (window.WB = window.WB || {});
  WB.assets = ASSET;
  WB.omukaeCatalog = OMUKAE_CATALOG;

  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.getBunnies = () => bunnies;

  WB.resetCoreOnly = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    clearAllSpawnedCoins();
    clearAllBunnies();

    localStorage.removeItem(LS.bunnies);
    localStorage.removeItem(LS.coin);

    coin = 0;
    renderCoin();
    saveCoin();

    lastTickAt = now();

    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ isBaby: false, adultSrc: ASSET.bunny });
    }

    rafId = requestAnimationFrame(step);
  };

  const listeners = new Map();
  WB.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WB.emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch {} }
  };

  /* =========================
   * Buttons
   * ========================= */
  // お迎えボタンは omukae.js へ通知するだけ
  shopBtn?.addEventListener("click", () => {
    WB.emit("omukae:open", { catalog: WB.omukaeCatalog });
  });

  slotBtn?.addEventListener("click", () => WB.emit("ui:slot", {}));
  departBtn?.addEventListener("click", () => WB.emit("ui:depart", {}));

  resetBtn?.addEventListener("click", () => {
    if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;
    WB.resetCoreOnly();
    WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
  });

  /* =========================
   * Boot
   * ========================= */
  loadCoin();

  const saved = loadBunnies();
  if (saved.length > 0) {
    for (const s of saved) {
      createBunny({
        bornAt: s.bornAt,
        x: Number.isFinite(s.x) ? s.x : undefined,
        dir: Number.isFinite(s.dir) ? s.dir : undefined,
        isBaby: !!s.isBaby,
        growAt: Number.isFinite(s.growAt) ? s.growAt : 0,
        gauge: Number.isFinite(s.gauge) ? s.gauge : 0,
        maxAnimArmed: s.maxAnimArmed !== false,
        adultSrc: s.adultSrc || "",
        targetAdultSrc: s.targetAdultSrc || "",
      });
    }
  } else {
    // 初回起動：bunny 2匹（大人）
    for (let i = 0; i < START_BUNNIES; i++) {
      createBunny({ isBaby: false, adultSrc: ASSET.bunny });
    }
  }

  window.addEventListener("resize", onResize);

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", { version: "app.js-core-v11-wrapCss", startBunnies: bunnies.length });
})();
