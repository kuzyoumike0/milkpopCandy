// app.js（全内容）
// ※ index.html には <div id="coinLayer"></div> があり、HUDは id="hud"、フィールドは id="field"
// ※ style.css には .coin / .coin.collecting / レア用クラス(rainbow等) が入っている前提

// ===== 保存 =====
const KEY = "web_bunny_save_v2";

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
const bunny = document.getElementById("bunny");
const coinLayer = document.getElementById("coinLayer");
const hud = document.getElementById("hud");

// ===== 状態 =====
const save = loadSave();

const state = {
  bankCoins: save.coins, // 所持コイン（HUDに出る）
  lastInteractAt: Date.now(),

  // 放置で“落ちる”設定（この秒数を超えると1回ドロップ）
  idleSecondsToDrop: 20,

  // フィールドに落ちているコイン数上限（増えすぎ防止）
  maxDropped: 12,

  // 歩行
  x: 20,
  vx: 40, // px/sec
  facing: 1, // 1:右, -1:左
  t: 0,
  marginX: 10
};

// 放置時間でコインの種類が変わる（秒）
const COIN_TIERS = [
  { name: "銅", emoji: "🪙", value: 1, minIdle: 0, className: "" },
  { name: "銀", emoji: "🥈", value: 3, minIdle: 60, className: "silver" }, // 1分放置
  { name: "金", emoji: "🥇", value: 8, minIdle: 180, className: "gold" }, // 3分放置
  { name: "虹", emoji: "🌈", value: 20, minIdle: 420, className: "rainbow" } // 7分放置
];

function getCoinTierByIdleSeconds(idleSec) {
  for (let i = COIN_TIERS.length - 1; i >= 0; i--) {
    if (idleSec >= COIN_TIERS[i].minIdle) return COIN_TIERS[i];
  }
  return COIN_TIERS[0];
}

function renderCoins() {
  coinValue.textContent = String(state.bankCoins);
  writeSave({ coins: state.bankCoins });
}

function touch() {
  state.lastInteractAt = Date.now();
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

// ===== コインを“ぽろっ”と落とす（種類付き） =====
function dropCoin(tier) {
  if (countDroppedCoins() >= state.maxDropped) return;

  const frect = field.getBoundingClientRect();
  const brect = bunny.getBoundingClientRect();

  // うさぎの近く（少しランダム）
  const startX = (brect.left - frect.left) + 60 + (Math.random() * 30 - 15);
  const startY = (brect.top - frect.top) + 40;

  // 落下距離（床まで）
  const dropDist = Math.min(170, Math.max(90, frect.height - (startY + 70)));

  const coin = document.createElement("div");
  coin.className = `coin ${tier.className || ""}`.trim();
  coin.textContent = tier.emoji;

  coin.style.left = `${Math.max(8, Math.min(frect.width - 64, startX))}px`;
  coin.style.top = `${Math.max(8, Math.min(frect.height - 64, startY))}px`;

  // CSS変数で落下距離と時間を変える
  const fallMs = 520 + Math.floor(Math.random() * 320);
  coin.style.setProperty("--drop", `${dropDist}px`);
  coin.style.setProperty("--fall", `${fallMs}ms`);

  // 値を保持（回収時に加算）
  coin.dataset.value = String(tier.value);

  // 回収（HUDへ吸い込み）
  const collect = () => {
    const v = Number(coin.dataset.value || "1");
    if (coin.classList.contains("collecting")) return;
    coin.classList.add("collecting");

    // coin中心（field内座標）
    const coinX = parseFloat(coin.style.left) + 28;
    const coinY = parseFloat(coin.style.top) + 28 + dropDist;

    // HUD座標→field内へ
    const hrect = hud.getBoundingClientRect();
    const targetScreenX = hrect.left + 30;
    const targetScreenY = hrect.top + hrect.height / 2;

    const targetX = targetScreenX - frect.left;
    const targetY = targetScreenY - frect.top;

    const dx = targetX - coinX;
    const dy = targetY - coinY;

    coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.35)`;
    coin.style.opacity = "0.2";

    setTimeout(() => {
      state.bankCoins += v;
      renderCoins();
      spark(`+${v}`, Math.max(8, targetX - 10), Math.max(8, targetY - 20));
      coin.remove();
      touch();
    }, 420);
  };

  coin.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    collect();
  });

  coinLayer.appendChild(coin);

  // 一定時間で消える（放置しすぎても詰まらない）
  setTimeout(() => {
    if (coin.isConnected) coin.remove();
  }, 30000);
}

// ===== ボタン =====
petBtn.addEventListener("click", () => {
  touch();
  // なでると“銅”を1枚落とす（所持に直で入らないのが牧場感）
  dropCoin(getCoinTierByIdleSeconds(0));

  // 反応（ちょい弾む）
  bunny.animate(
    [
      { transform: `translate(${state.x}px, 0) scaleX(${state.facing})` },
      { transform: `translate(${state.x}px, -6px) scaleX(${state.facing})` },
      { transform: `translate(${state.x}px, 0) scaleX(${state.facing})` }
    ],
    { duration: 260, easing: "ease-out" }
  );
});

resetBtn.addEventListener("click", () => {
  state.bankCoins = 0;
  renderCoins();
  touch();
});

// 触ったら放置解除（ユーザー操作全般）
["pointerdown", "pointermove", "keydown"].forEach((evt) => {
  window.addEventListener(evt, touch, { passive: true });
});

// ===== 放置で“ぽろっ”（放置が長いほどレア度UP） =====
setInterval(() => {
  const idleSec = (Date.now() - state.lastInteractAt) / 1000;
  if (idleSec >= state.idleSecondsToDrop) {
    const tier = getCoinTierByIdleSeconds(idleSec);
    dropCoin(tier);
    state.lastInteractAt = Date.now();
  }
}, 1000);

// ===== 歩行（フィールド内） =====
function tick(dt) {
  const w = field.clientWidth;
  const bunnyW = bunny.clientWidth;

  state.x += state.facing * state.vx * dt;

  const minX = state.marginX;
  const maxX = Math.max(state.marginX, w - bunnyW - state.marginX);

  if (state.x <= minX) {
    state.x = minX;
    state.facing = 1;
  } else if (state.x >= maxX) {
    state.x = maxX;
    state.facing = -1;
  }

  state.t += dt * 6.0;
  const bob = Math.abs(Math.sin(state.t)) * 4;

  bunny.style.transform = `translate(${state.x}px, ${-bob}px) scaleX(${state.facing})`;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(loop);
}

// 初期表示
renderCoins();
requestAnimationFrame(loop);
