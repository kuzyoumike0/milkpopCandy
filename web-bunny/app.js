// ===============================
// 基本状態
// ===============================
let coins = 0;
let lastClickTime = 0;

// ===============================
// UI更新
// ===============================
function updateCoinUI() {
  const counter = document.getElementById("coin-counter");
  if (counter) counter.textContent = coins;
}

// ===============================
// 効果音
// ===============================
const poyoSE = new Audio("poyo.mp3");
poyoSE.volume = 0.6;

function playPoyoSE() {
  poyoSE.currentTime = 0;
  poyoSE.play();
}

// ===============================
// コイン生成制限（1秒1回）
// ===============================
function canDropCoin() {
  const now = Date.now();
  if (now - lastClickTime < 1000) return false;
  lastClickTime = now;
  return true;
}

// ===============================
// コイン生成（ウサギの足元）
// ===============================
function dropCoinFromRabbit(rabbitEl) {
  const rect = rabbitEl.getBoundingClientRect();

  const coin = document.createElement("div");
  coin.className = "coin";

  // 🐰 足元に配置
  const x = rect.left + rect.width / 2 - 10;
  const y = rect.bottom - 10;

  coin.style.left = `${x}px`;
  coin.style.top = `${y}px`;

  document.body.appendChild(coin);

  // 🪙 軽いバウンド
  coin.animate(
    [
      { transform: "translateY(0)" },
      { transform: "translateY(-8px)" },
      { transform: "translateY(0)" }
    ],
    { duration: 300, easing: "ease-out" }
  );

  // 🧲 ホバーで回収
  coin.addEventListener("mouseenter", () => {
    coin.remove();
    coins++;
    updateCoinUI();
  });

  // 放置しすぎたら消える
  setTimeout(() => {
    if (coin.isConnected) coin.remove();
  }, 8000);
}

// ===============================
// 初期化
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  updateCoinUI();

  const rabbits = document.querySelectorAll(".rabbit");

  rabbits.forEach(rabbit => {
    rabbit.addEventListener("click", () => {
      if (!canDropCoin()) return;

      playPoyoSE();
      dropCoinFromRabbit(rabbit);
    });
  });
});
