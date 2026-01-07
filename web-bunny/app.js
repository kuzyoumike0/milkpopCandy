/* app.js — Milkpop牧場（v12.8 BABY-RETURN + SPREAD + HEART-SWAY）
 * ✅ 追加修正：
 *  - hart.png：MAX中は常に「ゆらゆら」＋ MAX到達瞬間だけ「ふわっ」
 *  - 回収幅が大きすぎ問題：
 *    - 当たり判定（padding）を縮小
 *    - hover回収は「地面に落ちてから」だけ有効（散らばる前に吸われない）
 *    - マグネットは「地面付近」だけ効く（空中で吸われない）
 * ✅ v12.8:
 *  - baby復活：isBaby=true で生成 → 3分後に targetAdultSrc へ成長
 *  - babyのドロップは常に1枚
 *  - 画面外に行きがち対策：状態ごとの幅でclamp
 *
 * ✅ v12.8 PATCH（今回の修正）:
 *  - babyの「上に浮く」原因だった wrap の transform(scale) を廃止
 *  - babyは wrap を縮めず「画像だけ」小さくして足元(bottom:0)固定
 *  - babyだけ大きい/小さいが混ざる見た目ブレを解消（CSSを統一）
 *  - clamp幅は wrap 基準に統一（babyだけ幅110扱いをやめる）
 *
 * ✅ v12.8 PATCH2（旅立ち/初期baby対策）:
 *  - tabidati.js が旧API前提でも旅立ち出来るように WB.bunnies を生やす（互換）
 *  - 保存復元で「初期2体が両方baby」なら強制でadultに矯正（初期画面baby2体を潰す）
 */

(() => {
  "use strict";
  console.log("[app.js] LOADED v12.8 PATCH2", Date.now());

  /* ===== helpers ===== */
  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const now = () => Date.now();

  /* ===== DOM ===== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");
  const resetBtn = $("#resetBtn");
  const slotBtn = $("#slotBtn");
  const departBtn = $("#departBtn");

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.error("[app.js] required DOM not found");
    return;
  }

  /* ===== inject CSS（heart sway + float + baby FIX） ===== */
  (() => {
    const css = `
      @keyframes wbHeartSway {
        0%   { transform: translateX(-50%) rotate(-7deg); }
        50%  { transform: translateX(-50%) rotate(7deg); }
        100% { transform: translateX(-50%) rotate(-7deg); }
      }
      @keyframes wbHeartFloat {
        0%   { transform: translate(-50%, 0) rotate(-6deg); }
        50%  { transform: translate(-50%, -7px) rotate(6deg); }
        100% { transform: translate(-50%, 0) rotate(-6deg); }
      }
      /* MAX中（表示だけ）は「ゆらゆら」 */
      .bunnyHeart.visible{
        animation: wbHeartSway 2.2s ease-in-out infinite;
      }
      /* MAX到達瞬間は「ふわっ」＋ゆらゆら（少し派手） */
      .bunnyHeart.show{
        animation: wbHeartFloat 1.1s ease-in-out 2, wbHeartSway 2.2s ease-in-out infinite;
      }

      /* =========================
         baby FIX：wrapは縮めない（浮きバグ/当たり判定ズレを防ぐ）
         - 見た目だけ「画像」を小さくする
         - 足元は bottom:0 で必ず地面
      ========================= */
      .bunnyWrap.baby{
        transform: none !important;
      }
      .bunnyWrap.baby .bunny{
        width: 92px !important;
        height: auto !important;
        bottom: 0 !important;
        left: 14px !important; /* 中央寄せ気味 */
      }
      .bunnyWrap.baby .bunnyHeart{
        width: 24px !important;
        top: -18px !important;
      }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();

  /* ===== constants ===== */
  const ASSET = {
    bunny: "./assets/bunny.png",
    bunny1: "./assets/bunny1.png",
    bunny3: "./assets/bunny3.png",
    bunny4: "./assets/bunny4.png",
    bunny5: "./assets/bunny5.png",
    reabunny: "./assets/reabunny.png",

    // ★ baby画像がある場合はこれを使う
    babybunny: "./assets/babybunny.png",

    hart: "./assets/hart.png",

    coin1: "./assets/coin1.png",
    coin2: "./assets/coin2.png",
    coin3: "./assets/coin3.png",
    coin4: "./assets/coin4.png",

    sePoyo: "./assets/poyo.mp3",
    seCoin: "./assets/coin.mp3",
  };

  const OMUKAE_CATALOG = [
    { key: "bunny1", name: "通常みるぽ", src: ASSET.bunny1, cost: 200 },
    { key: "bunny3", name: "毒タイプみるぽ", src: ASSET.bunny3, cost: 200 },
    { key: "bunny4", name: "水タイプみるぽ", src: ASSET.bunny4, cost: 200 },
    { key: "bunny5", name: "お正月みるぽ", src: ASSET.bunny5, cost: 200 },
  ];

  const COIN_TIER = {
    1: { src: ASSET.coin1, value: 1,   spread: 1.00 },
    2: { src: ASSET.coin2, value: 5,   spread: 1.15 },
    3: { src: ASSET.coin3, value: 10,  spread: 1.35 },
    4: { src: ASSET.coin4, value: 100, spread: 1.60 },
  };

  const LS = {
    coin: "wb_coin_v1",
    bunnies: "wb_bunnies_v12_8_baby",
    legacyBunnyKeys: [
      "wb_bunnies_v12_wrapStable",
      "wb_bunnies_v10_omukaeDepends",
      "wb_bunnies_v11_wrapCss",
      "wb_bunnies_v9",
      "wb_bunnies_v8",
    ],
  };

  const START_BUNNIES = 2;
  const CLICK_COOLDOWN_MS = 900;

  const GAUGE = { max: 100, perSec: 4, drainOnDrop: 35 };

  // コイン
  const COIN_W = 66, COIN_H = 66;
  const MAX_COINS_ON_FIELD = 90;

  // マグネット
  const MAGNET_RADIUS = 190;
  const MAGNET_PULL_PX_PER_SEC = 360;

  // hover回収は地面に落ちてから
  const HOVER_ENABLE_DELAY = 0.35;

  // baby成長
  const BABY_GROW_MS = 3 * 60 * 1000;

  // wrap基準（babyもwrapは同じサイズ）
  const BUNNY_W_ADULT = 140;
  const BUNNY_W_BABY  = 140;
  const BUNNY_H       = 140;

  /* ===== Audio ===== */
  const SE = {
    poyo: new Audio(ASSET.sePoyo),
    coin: new Audio(ASSET.seCoin),
  };
  SE.poyo.preload = "auto";
  SE.coin.preload = "auto";
  const playSE = (aud) => { try { aud.currentTime = 0; aud.play(); } catch {} };

  /* ===== WB event bus ===== */
  const WB = (window.WB = window.WB || {});
  const listeners = new Map();
  WB.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WB.emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch (e) { console.error(e); } }
  };

  /* ===== State ===== */
  let coin = 0;
  const bunnies = [];
  const coins = [];
  let nextCoinId = 1;

  let rafId = 0;
  let lastTickAt = now();

  /* ===== field rect cache ===== */
  let fieldLeft = 0, fieldTop = 0;
  function refreshFieldRect() {
    const r = field.getBoundingClientRect();
    fieldLeft = r.left;
    fieldTop  = r.top;
  }
  refreshFieldRect();
  window.addEventListener("resize", refreshFieldRect, { passive: true });
  window.addEventListener("scroll", () => requestAnimationFrame(refreshFieldRect), { passive: true });

  /* ===== mouse（field座標） ===== */
  let mouseFx = -9999, mouseFy = -9999;
  function updateMouseFromEvent(e) {
    mouseFx = e.clientX - fieldLeft;
    mouseFy = e.clientY - fieldTop;
  }
  field.addEventListener("pointermove", updateMouseFromEvent, { passive: true });
  field.addEventListener("mousemove", updateMouseFromEvent, { passive: true });
  field.addEventListener("mouseleave", () => { mouseFx = -9999; mouseFy = -9999; }, { passive: true });

  /* ===== Storage ===== */
  function loadCoin() {
    const n = Number(localStorage.getItem(LS.coin) || "0");
    coin = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    coinValueEl.textContent = String(coin);
  }
  function saveCoin() { localStorage.setItem(LS.coin, String(coin)); }
  function renderCoin() { coinValueEl.textContent = String(coin); }

  function addCoin(n) {
    coin = Math.max(0, coin + Math.floor(n));
    renderCoin(); saveCoin();
  }
  function spendCoin(n) {
    n = Math.floor(n);
    if (coin < n) return false;
    coin -= n;
    renderCoin(); saveCoin();
    return true;
  }

  function loadBunnies() {
    try {
      const raw = localStorage.getItem(LS.bunnies);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(x => ({
        bornAt: Number(x?.bornAt),
        x: Number(x?.x),
        dir: Number(x?.dir),
        adultSrc: typeof x?.adultSrc === "string" ? x.adultSrc : "",
        isBaby: !!x?.isBaby,
        targetAdultSrc: typeof x?.targetAdultSrc === "string" ? x.targetAdultSrc : "",
        babyUntil: Number(x?.babyUntil),
      })).filter(x => Number.isFinite(x.bornAt));
    } catch { return []; }
  }

  function saveBunnies() {
    const data = bunnies.map(b => ({
      bornAt: b.bornAt,
      x: Math.round(b.x),
      dir: b.dir,
      adultSrc: b.adultSrc || "",
      isBaby: !!b.isBaby,
      targetAdultSrc: b.targetAdultSrc || "",
      babyUntil: Number.isFinite(b.babyUntil) ? b.babyUntil : 0,
    }));
    localStorage.setItem(LS.bunnies, JSON.stringify(data));
  }

  /* ===== util ===== */
  function getFloorY() { return Math.max(0, field.clientHeight - 74); }

  function tierFromGauge(g, isBaby = false) {
    if (isBaby) return 1;
    g = clamp(g, 0, GAUGE.max);
    if (g < 25) return 1;
    if (g < 50) return 2;
    if (g < 75) return 3;
    return 4;
  }

  /* ===== coin ===== */
  function collectCoin(c) {
    if (c.collected) return;
    c.collected = true;
    try { c.el.remove(); } catch {}
    addCoin(c.value);
    playSE(SE.coin);
  }

  function spawnCoin(tier, x, y, spread = 1.0) {
    const def = COIN_TIER[tier] || COIN_TIER[1];
    spread = clamp(spread, 1.0, 1.8);

    while (coins.length >= MAX_COINS_ON_FIELD) {
      const old = coins.shift();
      if (old && !old.collected) { try { old.el.remove(); } catch {} }
    }

    const el = document.createElement("img");
    el.className = "coin";
    el.src = def.src;
    el.draggable = false;

    el.style.position = "absolute";
    el.style.width = `${COIN_W}px`;
    el.style.height = `${COIN_H}px`;
    el.style.pointerEvents = "auto";
    el.style.userSelect = "none";
    el.style.zIndex = "40";

    // 当たり判定縮小
    el.style.padding = "6px";
    el.style.margin  = "-6px";

    const floorY = getFloorY() - COIN_H + 2;
    const sx = clamp(x, 0, field.clientWidth - COIN_W);
    const sy = clamp(y, 0, floorY);

    const vxMax = clamp(120 * spread, 120, 240);
    const vyUp  = clamp(110 * spread, 110, 180);

    const bornAt = now();

    const c = {
      id: nextCoinId++,
      el,
      x: sx,
      y: sy,
      vx: rand(-vxMax, vxMax),
      vy: rand(-vyUp, -35),
      value: def.value,
      collected: false,
      life: 8.0,
      bounces: 0,
      bornAt,
    };

    el.style.left = `${c.x}px`;
    el.style.top  = `${c.y}px`;

    el.addEventListener("click", () => collectCoin(c));

    el.addEventListener("mouseenter", () => {
      const floorNow = getFloorY() - COIN_H + 2;
      const landed = (c.y >= floorNow - 2) && (Math.abs(c.vy) < 10);
      const enoughTime = (now() - c.bornAt) >= (HOVER_ENABLE_DELAY * 1000);
      if (landed && enoughTime) collectCoin(c);
    }, { passive: true });

    coinLayer.appendChild(el);
    coins.push(c);
  }

  function clearAllCoins() {
    for (const c of coins) { try { c.el.remove(); } catch {} }
    coins.length = 0;
  }

  /* ===== bunny ===== */
  function bunnyW(b) { return b.isBaby ? BUNNY_W_BABY : BUNNY_W_ADULT; }

  function placeWrap(b) {
    const w = bunnyW(b);
    const maxX = Math.max(0, field.clientWidth - w);
    b.x = clamp(b.x, 0, maxX);

    const floorY = getFloorY();
    b.y = clamp(floorY - BUNNY_H + 22, 0, floorY);

    const lx = (b._lx ?? NaN), ly = (b._ly ?? NaN);
    if (b.x !== lx) b.wrap.style.left = `${b.x}px`;
    if (b.y !== ly) b.wrap.style.top  = `${b.y}px`;
    b._lx = b.x; b._ly = b.y;

    const flipNow = b.dir < 0;
    if (b._flip !== flipNow) {
      b.wrap.classList.toggle("flip", flipNow);
      b._flip = flipNow;
    }
  }

  function setHeartState(b, state) {
    b.heart.classList.remove("visible", "show");
    b.heart.style.opacity = "0";
    if (state === "visible") { b.heart.classList.add("visible"); b.heart.style.opacity = "1"; }
    if (state === "show")    { b.heart.classList.add("show");    b.heart.style.opacity = "1"; }
  }

  function updateHeart(b) {
    const isMax = b.gauge >= GAUGE.max;
    if (!isMax) {
      b.maxAnimArmed = true;
      setHeartState(b, "hide");
      return;
    }
    if (b.maxAnimArmed) {
      b.maxAnimArmed = false;
      setHeartState(b, "show");
      setTimeout(() => setHeartState(b, "visible"), 2400);
      saveBunnies();
    } else {
      setHeartState(b, "visible");
    }
  }

  function calcDropCount(b) {
    if (b.isBaby) return 1;
    const step = Math.floor(clamp(b.gauge, 0, GAUGE.max) / 25);
    return clamp(1 + step + (b.gauge >= GAUGE.max ? 1 : 0), 1, 8);
  }

  function dropCoinsFromBunny(b) {
    const tier = tierFromGauge(b.gauge, b.isBaby);
    const def = COIN_TIER[tier] || COIN_TIER[1];
    const spread = def.spread ?? 1.0;

    const count = calcDropCount(b);

    const footX = b.x + (bunnyW(b) * 0.5);
    const footY = b.y + BUNNY_H - 22;

    const posX = clamp(12 * spread, 12, 20);
    const posY = clamp(6  * spread, 6,  10);

    for (let i = 0; i < count; i++) {
      spawnCoin(
        tier,
        footX + rand(-posX, posX) - COIN_W / 2,
        footY + rand(-posY, 2)    - COIN_H / 2,
        spread
      );
    }

    b.gauge = clamp(b.gauge - GAUGE.drainOnDrop, 0, GAUGE.max);
    updateHeart(b);
    saveBunnies();
  }

  function growUp(b) {
    if (!b || !b.isBaby) return;
    b.isBaby = false;
    b.babyUntil = 0;

    const nextSrc = (b.targetAdultSrc || b.adultSrc || ASSET.bunny);
    b.adultSrc = nextSrc;
    b.img.src = nextSrc;

    b.wrap.classList.remove("baby");
    placeWrap(b);
    saveBunnies();

    WB.emit("bunny:grew", { bornAt: b.bornAt, adultSrc: b.adultSrc });
  }

  function createBunny(opts = {}) {
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

    const bornAt = Number.isFinite(opts.bornAt) ? opts.bornAt : now();
    const isBaby = !!opts.isBaby;

    const targetAdultSrc =
      (typeof opts.targetAdultSrc === "string" && opts.targetAdultSrc) ? opts.targetAdultSrc :
      (typeof opts.adultSrc === "string" && opts.adultSrc) ? opts.adultSrc :
      ASSET.bunny;

    const currentSrc = isBaby ? (ASSET.babybunny || targetAdultSrc) : targetAdultSrc;
    img.src = currentSrc;

    if (isBaby) wrap.classList.add("baby");
    else wrap.classList.remove("baby");

    const b = {
      bornAt,
      x: Number.isFinite(opts.x) ? opts.x : rand(40, Math.max(41, field.clientWidth - 180)),
      y: 0,
      vx: rand(16, 30),
      dir: Number.isFinite(opts.dir) ? Math.sign(opts.dir) || 1 : (Math.random() < 0.5 ? -1 : 1),
      lastClickAt: 0,
      gauge: 0,
      maxAnimArmed: true,

      isBaby,
      babyUntil: isBaby ? (Number.isFinite(opts.babyUntil) ? opts.babyUntil : (bornAt + BABY_GROW_MS)) : 0,
      targetAdultSrc,
      adultSrc: targetAdultSrc,

      // 旅立ち互換：kind を持たせる（推定）
      kind: (() => {
        const low = String(targetAdultSrc).toLowerCase();
        if (low.includes("reabunny")) return "reabunny";
        if (low.includes("bunny5")) return "bunny5";
        if (low.includes("bunny4")) return "bunny4";
        if (low.includes("bunny3")) return "bunny3";
        if (low.includes("bunny1")) return "bunny1";
        return "bunny1";
      })(),

      wrap, img, heart,
      _lx: NaN, _ly: NaN, _flip: null,
    };

    setHeartState(b, "hide");
    placeWrap(b);
    updateHeart(b);

    if (b.isBaby) {
      const remain = b.babyUntil - now();
      if (remain <= 0) {
        growUp(b);
      } else {
        setTimeout(() => growUp(b), remain);
      }
    }

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

    WB.emit("bunnyCountChanged", { count: bunnies.length });
    return b;
  }

  function clearAllBunnies() {
    for (const b of bunnies) { try { b.wrap.remove(); } catch {} }
    bunnies.length = 0;
    WB.emit("bunnyCountChanged", { count: 0 });
  }

  /* ===== Loop ===== */
  function step() {
    try {
      const t = now();
      const dt = Math.max(0, Math.min(0.033, (t - lastTickAt) / 1000));
      lastTickAt = t;

      for (const b of bunnies) {
        if (b.isBaby && b.babyUntil && now() >= b.babyUntil) growUp(b);

        b.gauge = clamp(b.gauge + GAUGE.perSec * dt, 0, GAUGE.max);

        b.x += b.vx * dt * b.dir;
        const maxX = Math.max(0, field.clientWidth - bunnyW(b));
        if (b.x <= 0) { b.x = 0; b.dir = 1; }
        else if (b.x >= maxX) { b.x = maxX; b.dir = -1; }

        placeWrap(b);
        updateHeart(b);
      }

      const floorY = getFloorY() - COIN_H + 2;
      const g = 900;

      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (c.collected) { coins.splice(i, 1); continue; }

        c.life -= dt;
        if (c.life <= 0) {
          try { c.el.remove(); } catch {}
          coins.splice(i, 1);
          continue;
        }

        const nearGround = (c.y >= floorY - 22);
        if (nearGround) {
          const dx = mouseFx - (c.x + COIN_W / 2);
          const dy = mouseFy - (c.y + COIN_H / 2);
          const d2 = dx * dx + dy * dy;

          if (d2 < MAGNET_RADIUS * MAGNET_RADIUS) {
            const d = Math.sqrt(d2) || 1;
            const pull = MAGNET_PULL_PX_PER_SEC * dt;
            c.x += (dx / d) * pull;
            c.y += (dy / d) * pull;
          }
        }

        c.vy += g * dt;

        c.x += c.vx * dt;
        c.y += c.vy * dt;

        c.x = clamp(c.x, 0, field.clientWidth - COIN_W);

        if (c.y >= floorY) {
          c.y = floorY;

          if (c.bounces < 1 && Math.abs(c.vy) > 60) {
            c.vy *= -0.20;
            c.bounces++;
          } else {
            c.vy = 0;
          }
          c.vx *= 0.84;
        }

        c.el.style.left = `${c.x}px`;
        c.el.style.top  = `${c.y}px`;
      }

    } catch (e) {
      console.error("[app.js] step crash", e);
    }

    rafId = requestAnimationFrame(step);
  }

  /* ===== WB public ===== */
  WB.assets = ASSET;
  WB.omukaeCatalog = OMUKAE_CATALOG;
  WB.field = field;
  WB.layers = { bunny: bunnyLayer, coin: coinLayer };

  WB.getCoin = () => coin;
  WB.addCoin = addCoin;
  WB.spendCoin = spendCoin;

  WB.createBunny = (opts = {}) => createBunny(opts);
  WB.getBunnies = () => bunnies;

  // ✅ 互換：旧スクリプトが WB.bunnies を参照しても動くようにする
  WB.bunnies = bunnies;

  WB.resetCoreOnly = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    clearAllCoins();
    clearAllBunnies();

    localStorage.removeItem(LS.bunnies);
    localStorage.removeItem(LS.coin);
    for (const k of LS.legacyBunnyKeys) localStorage.removeItem(k);

    coin = 0;
    renderCoin();
    saveCoin();

    lastTickAt = now();

    for (let i = 0; i < START_BUNNIES; i++) createBunny({ adultSrc: ASSET.bunny });

    rafId = requestAnimationFrame(step);
  };

  /* ===== Buttons ===== */
  shopBtn?.addEventListener("click", () => {
    WB.emit("omukae:open", { catalog: WB.omukaeCatalog });
    WB.omukae?.openShopModal?.();
  });

  resetBtn?.addEventListener("click", () => {
    if (!confirm("うさぎとコインだけリセットします。よろしいですか？")) return;
    WB.resetCoreOnly();
    WB.emit("core:reset_partial", { scope: ["bunnies", "coin", "spawnedCoins"] });
  });

  slotBtn?.addEventListener("click", () => WB.emit("ui:slot", {}));
  departBtn?.addEventListener("click", () => WB.emit("ui:depart", {}));

  /* ===== Boot ===== */
  for (const k of LS.legacyBunnyKeys) {
    try { localStorage.removeItem(k); } catch {}
  }

  loadCoin();

  // === saved復元 ===
  let saved = loadBunnies();

  // ✅ PATCH2：初期2体が両方babyなら強制adultに矯正（「初期画面baby2体」対策）
  if (saved.length === 2 && saved.every(s => !!s.isBaby)) {
    saved = saved.map(s => ({
      ...s,
      isBaby: false,
      babyUntil: 0,
      targetAdultSrc: (s.targetAdultSrc || s.adultSrc || ASSET.bunny),
      adultSrc: (s.targetAdultSrc || s.adultSrc || ASSET.bunny),
    }));
    try { localStorage.setItem(LS.bunnies, JSON.stringify(saved)); } catch {}
  }

  if (saved.length > 0) {
    for (const s of saved) {
      createBunny({
        bornAt: s.bornAt,
        x: Number.isFinite(s.x) ? s.x : undefined,
        dir: Number.isFinite(s.dir) ? s.dir : undefined,
        isBaby: !!s.isBaby,
        babyUntil: Number.isFinite(s.babyUntil) ? s.babyUntil : undefined,
        targetAdultSrc: (s.targetAdultSrc || s.adultSrc || ASSET.bunny),
        adultSrc: (s.adultSrc || ASSET.bunny),
      });
    }
  } else {
    for (let i = 0; i < START_BUNNIES; i++) createBunny({ adultSrc: ASSET.bunny });
  }

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(step);

  WB.emit("core:ready", { version: "app.js-core-v12.8-baby-return-PATCH2", startBunnies: bunnies.length });
})();
