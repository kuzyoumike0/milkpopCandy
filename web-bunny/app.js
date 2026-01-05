/* Bunny牧場
  - 開始時うさぎ2匹
  - うさぎ左右移動
  - 放置でコイン排出
  - クリックでもコイン排出（SE: poyo.mp3）
  - コインは地面に重なって貯まる
  - 回収はクリック or ホバー（SE: coin.mp3）
  - ショップでうさぎ増やせる
*/

(() => {
  const ASSET = (p) => `./assets/${p}`;

  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer  = document.getElementById("coinLayer");

  const coinValueEl = document.getElementById("coinValue");
  const shopBtn = document.getElementById("shopBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const shopModal = document.getElementById("shopModal");
  const closeShopBtn = document.getElementById("closeShopBtn");
  const buyBunnyBtn = document.getElementById("buyBunnyBtn");
  const bunnyPriceEl = document.getElementById("bunnyPrice");
  const bunnyCountEl = document.getElementById("bunnyCount");

  // ====== Audio (ブラウザ制限対策：最初のユーザー操作でアンロック) ======
  const audio = {
    poyo: new Audio(ASSET("poyo.mp3")),
    coin: new Audio(ASSET("coin.mp3")),
  };
  audio.poyo.preload = "auto";
  audio.coin.preload = "auto";
  let audioUnlocked = false;

  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // 0秒再生→停止（環境により無音が必要）
    try {
      audio.poyo.volume = 0.0001;
      audio.poyo.play().then(() => {
        audio.poyo.pause();
        audio.poyo.currentTime = 0;
        audio.poyo.volume = 1;
      }).catch(() => {
        audio.poyo.volume = 1;
      });
    } catch {}
  }

  function playSE(name) {
    if (!audioUnlocked) return; // 未アンロックなら鳴らさない（ユーザー操作後に鳴る）
    const src = audio[name];
    if (!src) return;
    try {
      // 同時再生できるように clone
      const a = src.cloneNode(true);
      a.volume = 1;
      a.play().catch(() => {});
    } catch {}
  }

  window.addEventListener("pointerdown", unlockAudioOnce, { once: true });

  // ====== State ======
  const SAVE_KEY = "bunny_ranch_save_v1";

  const state = {
    coins: 0,
    bunnies: [], // {id, el, x, y, dir, speed, nextDropAt, lastClickDropAt}
  };

  // ====== Layout helpers ======
  function fieldRect() {
    const r = document.getElementById("field").getBoundingClientRect();
    return r;
  }

  function groundY() {
    const r = fieldRect();
    // 地面の少し上（見た目）
    return r.height - 18; // coin center y
  }

  function bunnyFootY() {
    const r = fieldRect();
    // うさぎ画像の足元（transform: -100% なので top は足元）
    return r.height - 32; // bunny "top" position
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(min, max) { return Math.random() * (max - min) + min; }

  // ====== Coins ======
  function addCoins(n) {
    state.coins += n;
    coinValueEl.textContent = String(state.coins);
    updateShopUI();
    save();
  }

  function spawnCoinAt(x) {
    const r = fieldRect();
    const gx = clamp(x, 24, r.width - 24);

    const coin = document.createElement("div");
    coin.className = "coin bounce";
    coin.style.left = `${gx + rand(-4, 4)}px`; // ほぼ重なる（少しだけ揺らす）
    coin.style.top  = `${groundY()}px`;

    let collected = false;
    const collect = () => {
      if (collected) return;
      collected = true;
      coin.remove();
      addCoins(1);
      playSE("coin");
    };

    // クリック回収
    coin.addEventListener("click", (e) => {
      e.stopPropagation();
      collect();
    });

    // カーソル合わせて回収（ホバー）
    coin.addEventListener("pointerenter", () => {
      collect();
    });

    // bounce class 外す（繰り返さない）
    setTimeout(() => coin.classList.remove("bounce"), 380);

    coinLayer.appendChild(coin);
  }

  // ====== Bunny ======
  let bunnyIdSeq = 1;

  function scheduleNextDrop(b) {
    // 放置排出：だいたい 2.2〜5.0 秒で1回
    b.nextDropAt = performance.now() + rand(2200, 5000);
  }

  function createBunny(x) {
    const b = {
      id: bunnyIdSeq++,
      el: null,
      x: x,
      y: bunnyFootY(),
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: rand(26, 52), // px/sec
      nextDropAt: 0,
      lastClickDropAt: 0,
    };

    const img = document.createElement("img");
    img.className = "bunny";
    img.src = ASSET("bunny.png");
    img.alt = "bunny";
    img.draggable = false;

    // クリック：SEぽよ + コイン落とす（1秒クールダウン）
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      unlockAudioOnce();

      const now = performance.now();
      if (now - b.lastClickDropAt < 1000) {
        // 連打で爆増しないように（1秒に1回）
        playSE("poyo");
        return;
      }
      b.lastClickDropAt = now;

      playSE("poyo");
      spawnCoinAt(b.x);
    });

    b.el = img;
    bunnyLayer.appendChild(img);

    scheduleNextDrop(b);
    state.bunnies.push(b);
    updateShopUI();
    save();
    return b;
  }

  function updateBunny(b, dt) {
    const r = fieldRect();
    const leftLimit  = 40;
    const rightLimit = r.width - 40;

    b.y = bunnyFootY();

    b.x += b.dir * b.speed * dt;

    if (b.x < leftLimit) {
      b.x = leftLimit;
      b.dir = 1;
    } else if (b.x > rightLimit) {
      b.x = rightLimit;
      b.dir = -1;
    }

    // 向き（左右反転）
    const flip = b.dir < 0 ? -1 : 1;
    b.el.style.left = `${b.x}px`;
    b.el.style.top  = `${b.y}px`;
    b.el.style.transform = `translate(-50%, -100%) scaleX(${flip})`;

    // 放置ドロップ
    const now = performance.now();
    if (now >= b.nextDropAt) {
      spawnCoinAt(b.x);
      scheduleNextDrop(b);
    }
  }

  // ====== Shop ======
  function bunnyPrice() {
    // 50 → 70 → 98...（ゆるやかに上昇）
    const count = state.bunnies.length;
    const base = 50;
    const mul = Math.pow(1.4, Math.max(0, count - 2)); // 初期2匹は据え置き感
    return Math.round(base * mul);
  }

  function updateShopUI() {
    bunnyCountEl.textContent = String(state.bunnies.length);
    const p = bunnyPrice();
    bunnyPriceEl.textContent = String(p);

    if (state.coins >= p) {
      buyBunnyBtn.disabled = false;
      buyBunnyBtn.style.opacity = "1";
    } else {
      buyBunnyBtn.disabled = true;
      buyBunnyBtn.style.opacity = ".55";
    }
  }

  function openShop() {
    modalBackdrop.classList.remove("hidden");
    shopModal.classList.remove("hidden");
    updateShopUI();
  }

  function closeShop() {
    modalBackdrop.classList.add("hidden");
    shopModal.classList.add("hidden");
  }

  shopBtn.addEventListener("click", () => {
    unlockAudioOnce();
    openShop();
  });

  closeShopBtn.addEventListener("click", closeShop);
  modalBackdrop.addEventListener("click", closeShop);

  buyBunnyBtn.addEventListener("click", () => {
    unlockAudioOnce();
    const p = bunnyPrice();
    if (state.coins < p) return;
    state.coins -= p;
    coinValueEl.textContent = String(state.coins);

    // 追加位置：ランダム
    const r = fieldRect();
    createBunny(rand(60, r.width - 60));

    updateShopUI();
    save();
  });

  // ====== Save/Load ======
  function save() {
    try {
      const data = {
        coins: state.coins,
        bunnyCount: state.bunnies.length,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      return data;
    } catch {
      return null;
    }
  }

  function hardReset() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    location.reload();
  }
  resetBtn.addEventListener("click", hardReset);

  // ====== Game Loop ======
  let lastT = performance.now();
  function tick(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000); // 最大50ms
    lastT = t;

    for (const b of state.bunnies) updateBunny(b, dt);

    requestAnimationFrame(tick);
  }

  // ====== Init ======
  function init() {
    const r = fieldRect();

    // restore
    const data = load();
    if (data) {
      state.coins = Number(data.coins) || 0;
      coinValueEl.textContent = String(state.coins);

      // うさぎ数復元（最低2）
      const want = Math.max(2, Number(data.bunnyCount) || 2);
      for (let i = 0; i < want; i++) {
        createBunny(rand(60, r.width - 60));
      }
    } else {
      // 初期2匹
      createBunny(r.width * 0.33);
      createBunny(r.width * 0.66);
    }

    updateShopUI();
    requestAnimationFrame(tick);
  }

  // リサイズで地面基準が変わるので、うさぎのyは毎フレ反映（updateBunnyでやってる）
  window.addEventListener("resize", () => updateShopUI());

  init();
})();
