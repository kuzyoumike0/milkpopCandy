// ===== 保存 =====
const KEY = "web_bunny_save_v1";

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { coins: 0 };
    const parsed = JSON.parse(raw);
    return {
      coins: Number.isFinite(parsed.coins) ? parsed.coins : 0
    };
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
const floating = document.getElementById("floating");

// ===== 状態 =====
const save = loadSave();

const state = {
  coins: save.coins,
  lastInteractAt: Date.now(),

  // 放置で増える設定（後で調整しやすい）
  idleSecondsToCoin: 20,  // 20秒放置でコイン
  coinPerTick: 1,

  // 歩行
  x: 20,
  y: 18,
  vx: 40,          // px/sec
  facing: 1,       // 1:右, -1:左

  // ふわふわ上下
  t: 0,

  // 端っこ余白（見切れ防止）
  marginX: 10
};

function renderCoins() {
  coinValue.textContent = String(state.coins);
  writeSave({ coins: state.coins });
}

function touch() {
  state.lastInteractAt = Date.now();
}

function spawnFloat(text, x, y) {
  const div = document.createElement("div");
  div.className = "floatText";
  div.textContent = text;
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  floating.appendChild(div);
  setTimeout(() => div.remove(), 1000);
}

// ===== ボタン =====
petBtn.addEventListener("click", () => {
  touch();
  state.coins += 1;          // なでると+1（好みで変更）
  renderCoins();

  const rect = bunny.getBoundingClientRect();
  const frect = field.getBoundingClientRect();
  spawnFloat("+1", rect.left - frect.left + 60, rect.top - frect.top + 40);

  // 反応（ちょい拡大）
  bunny.style.transition = "transform 120ms";
  bunny.style.transform += " scale(1.06)";
  setTimeout(() => (bunny.style.transition = ""), 140);
});

resetBtn.addEventListener("click", () => {
  state.coins = 0;
  renderCoins();
  touch();
});

// 触ったら放置解除
["pointerdown", "pointermove", "keydown"].forEach(evt => {
  window.addEventListener(evt, touch, { passive: true });
});

// ===== 放置でコイン =====
setInterval(() => {
  const idleSec = (Date.now() - state.lastInteractAt) / 1000;
  if (idleSec >= state.idleSecondsToCoin) {
    state.coins += state.coinPerTick;
    renderCoins();
    state.lastInteractAt = Date.now();

    // 生成演出
    const rect = bunny.getBoundingClientRect();
    const frect = field.getBoundingClientRect();
    spawnFloat(`+${state.coinPerTick}`, rect.left - frect.left + 50, rect.top - frect.top + 30);
  }
}, 1000);

// ===== 歩行（フィールド内） =====
function tick(dt) {
  const w = field.clientWidth;
  const bunnyW = bunny.clientWidth;

  state.x += state.facing * state.vx * dt;

  // 端で反転
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
