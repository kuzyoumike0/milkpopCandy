// app.js（複数匹版：歩く＋放置でレアコイン落下＋回収でHUDへ吸い込み）

// ===== 保存 =====
const KEY = "web_bunny_save_multi_v1";

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { coins: 0 };
    const p = JSON.parse(raw);
    return { coins: Number.isFinite(p.coins) ? p.coins : 0 };
  } catch {
    return { coins: 0 };
  }
}

function writeSave(save) {
  localStorage.setItem(KEY, JSON.stringify(save));
}

// ===== UI =====
const coinValue = document.getElementById("coinValue");
const petBtn = document.getElementById("petBtn");
const resetBtn = document.getElementById("resetBtn");
const field = document.getElementById("field");
const bunnyLayer = document.getElementById("bunnyLayer");
const coinLayer = document.getElementById("coinLayer");
const hud = document.getElementById("hud");

// ===== 状態 =====
const save = loadSave();

const game = {
  bankCoins: save.coins,
  maxDropped: 18, // 全体の落ちコイン上限
  idleSecondsToDrop: 20, // 放置でドロップする最短間隔（各うさぎ）
  // 触った扱い（全体の放置判定用に使うならここ）
  lastAnyInteractAt: Date.now()
};

// 放置時間でコイン種類が変わる（秒）
const COIN_TIERS = [
  { name: "銅", emoji: "🪙", value: 1,  minIdle: 0,   className: "" },
  { name: "銀", emoji: "🥈", value: 3,  minIdle: 60,  className: "silver" },
  { name: "金", emoji: "🥇", value: 8,  minIdle: 180, className: "gold" },
  { name: "虹", emoji: "🌈", value: 20, minIdle: 420, className: "rainbow" }
];

function getCoinTierByIdleSeconds(idleSec) {
  for (let i = COIN_TIERS.length - 1; i >= 0; i--) {
    if (idleSec >= COIN_TIERS[i].minIdle) return COIN_TIERS[i];
  }
  return COIN_TIERS[0];
}

function renderCoins() {
  coinValue.textContent = String(game.bankCoins);
  writeSave({ coins: game.bankCoins });
}

function touchAny() {
  game.lastAnyInteractAt = Date.now();
}

function spark(text, x, y) {
  const div = document.createElement("div");
  div.className = "coinSpark";
  div.textContent = text;
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  coinLayer.appendChild(div);
  setTimeout(() => div.remove(), 700);
}

function countDroppedCoins() {
  return coinLayer.querySelectorAll(".coin").length;
}

// ===== うさぎ生成 =====
/**
 * bunnies: それぞれ独立して
 * - x, vx, facing, t で歩く
 * - lastInteractAt, lastDropAt で放置判定
 */
const BUNNY_COUNT = 3; // ← ここを増やすと匹数が増える
const BUNNY_W = 160;
const BUNNY_MARGIN = 10;

const bunnies = [];

function createBunny(i) {
  const el = document.createElement("div");
  el.className = "bunny";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `うさぎ${i + 1}`);

  const img = document.createElement("img");
  img.src = "./assets/bunny.png";
  img.alt = `bunny${i + 1}`;
  img.draggable = false;

  el.appendChild(img);
  bunnyLayer.appendChild(el);

  // 個体状態
  const now = Date.now();
  const b = {
    id: i,
    el,
    x: 20 + i * 90,
    vx: 30 + Math.random() * 30,      // 個体ごとの速度
    facing: Math.random() < 0.5 ? 1 : -1,
    t: Math.random() * 10,
    lastInteractAt: now,
    lastDropAt: now
  };

  // タップで「その子が銅を落とす」＋少し弾む
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.lastInteractAt = Date.now();
    touchAny();
    dropCoinNearBunny(b, getCoinTierByIdleSeconds(0)); // 触った時は銅固定

    // 反応（ちょい弾む）
    el.animate(
      [
        { transform: `translate(${b.x}px, 0) scaleX(${b.facing})` },
        { transform: `translate(${b.x}px, -6px) scaleX(${b.facing})` },
        { transform: `translate(${b.x}px, 0) scaleX(${b.facing})` }
      ],
      { duration: 260, easing: "ease-out" }
    );
  });

  return b;
}

function initBunnies() {
  bunnyLayer.innerHTML = "";
  bunnies.length = 0;
  for (let i = 0; i < BUNNY_COUNT; i++) bunnies.push(createBunny(i));
}

// ===== コインを落とす（特定のうさぎの近く） =====
function dropCoinNearBunny(bunnyObj, tier) {
  if (countDroppedCoins() >= game.maxDropped) return;

  const frect = field.getBoundingClientRect();
  const hrect = hud.getBoundingClientRect();

  // うさぎの画面上の矩形を取得
  const brect = bunnyObj.el.getBoundingClientRect();

  // うさぎの近く（少しランダム）
  const startX = (brect.left - frect.left) + 60 + (Math.random() * 34 - 17);
  const startY = (brect.top - frect.top) + 40;

  // 落下距離（床まで）
  const dropDist = Math.min(170, Math.max(90, frect.height - (startY + 70)));

  const coin = document.createElement("div");
  coin.className = `coin ${tier.className || ""}`.trim();
  coin.textContent = tier.emoji;

  coin.style.left = `${Math.max(8, Math.min(frect.width - 64, startX))}px`;
  coin.style.top = `${Math.max(8, Math.min(frect.height - 64, startY))}px`;

  const fallMs = 520 + Math.floor(Math.random() * 320);
  coin.style.setProperty("--drop", `${dropDist}px`);
  coin.style.setProperty("--fall", `${fallMs}ms`);

  coin.dataset.value = String(tier.value);

  // 回収（HUDへ吸い込み）
  const collect = () => {
    const v = Number(coin.dataset.value || "1");
    if (coin.classList.contains("collecting")) return;
    coin.classList.add("collecting");

    const frect2 = field.getBoundingClientRect(); // 最新
    const coinX = parseFloat(coin.style.left) + 28;
    const coinY = parseFloat(coin.style.top) + 28 + dropDist;

    // HUDのコイン表示付近へ
    const targetScreenX = hrect.left + 30;
    const targetScreenY = hrect.top + hrect.height / 2;
    const targetX = targetScreenX - frect2.left;
    const targetY = targetScreenY - frect2.top;

    const dx = targetX - coinX;
    const dy = targetY - coinY;

    coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.35)`;
    coin.style.opacity = "0.2";

    setTimeout(() => {
      game.bankCoins += v;
      renderCoins();
      spark(`+${v}`, Math.max(8, targetX - 10), Math.max(8, targetY - 20));
      coin.remove();

      // 回収した＝触った扱い
      bunnyObjTouch(bunnyObj);
    }, 420);
  };

  function bunnyObjTouch(b) {
    b.lastInteractAt = Date.now();
    touchAny();
  }

  coin.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(coin);

  // 一定時間で消える
  setTimeout(() => {
    if (coin.isConnected) coin.remove();
  }, 30000);
}

// ===== ボタン =====
petBtn.addEventListener("click", () => {
  touchAny();
  // 「なでる」＝全員が銅を1枚ずつ落とす（牧場感）
  for (const b of bunnies) {
    b.lastInteractAt = Date.now();
    dropCoinNearBunny(b, getCoinTierByIdleSeconds(0));
  }
});

resetBtn.addEventListener("click", () => {
  game.bankCoins = 0;
  renderCoins();
  touchAny();
});

// 操作があったら全体の触った扱い（個体には影響させない）
["pointerdown", "pointermove", "keydown"].forEach((evt) => {
  window.addEventListener(evt, touchAny, { passive: true });
});

// ===== 放置で“ぽろっ”（各うさぎが個別に判定） =====
setInterval(() => {
  const now = Date.now();

  for (const b of bunnies) {
    const idleSec = (now - b.lastInteractAt) / 1000;
    const sinceDrop = (now - b.lastDropAt) / 1000;

    // 最低間隔（idleSecondsToDrop）を超えたらドロップ
    if (sinceDrop >= game.idleSecondsToDrop) {
      const tier = getCoinTierByIdleSeconds(idleSec);
      dropCoinNearBunny(b, tier);
      b.lastDropAt = now;
    }
  }
}, 1000);

// ===== 歩行（フィールド内） =====
function tick(dt) {
  const w = field.clientWidth;
  const maxX = Math.max(BUNNY_MARGIN, w - BUNNY_W - BUNNY_MARGIN);
  const minX = BUNNY_MARGIN;

  for (const b of bunnies) {
    b.x += b.facing * b.vx * dt;

    if (b.x <= minX) {
      b.x = minX;
      b.facing = 1;
    } else if (b.x >= maxX) {
      b.x = maxX;
      b.facing = -1;
    }

    b.t += dt * 6.0;
    const bob = Math.abs(Math.sin(b.t)) * 4;

    // NOTE: transformはここで上書き（pointerdown時のanimateは別レイヤなので少しズレてもOK）
    b.el.style.transform = `translate(${b.x}px, ${-bob}px) scaleX(${b.facing})`;
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// 初期化
renderCoins();
initBunnies();
requestAnimationFrame(loop);
