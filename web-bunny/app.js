// ===============================
// 状態
// ===============================
let coins = 0;
let lastClickTime = 0;

// ===============================
// コイン表示更新
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
  try {
    poyoSE.currentTime = 0;
    const p = poyoSE.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}

// ===============================
// 1秒1回制限
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

  // rectは画面基準 → fixed
  coin.style.position = "fixed";
  coin.style.zIndex = "9999";

  // 🐰 足元
  const x = rect.left + rect.width / 2;
  const y = rect.bottom - 6;

  coin.style.left = `${x}px`;
  coin.style.top = `${y}px`;
  coin.style.transform = "translate(-50%, -50%)";

  document.body.appendChild(coin);

  // 💫 ぽよん
  coin.animate(
    [
      { transform: "translate(-50%, -50%) translateY(0)" },
      { transform: "translate(-50%, -50%) translateY(-10px)" },
      { transform: "translate(-50%, -50%) translateY(0)" }
    ],
    { duration: 300, easing: "ease-out" }
  );

  // 🧲 ホバーで回収
  coin.addEventListener("mouseenter", () => {
    coin.remove();
    coins++;
    updateCoinUI();
  });

  // ⏳ 放置消滅
  setTimeout(() => {
    if (coin.isConnected) coin.remove();
  }, 8000);
}

// ===============================
// 初期化
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  updateCoinUI();

  // イベント委譲（画像内クリックでもOK）
  document.addEventListener("click", (e) => {
    const rabbit = e.target.closest(".rabbit");
    if (!rabbit) return;

    if (!canDropCoin()) return;

    playPoyoSE();
    dropCoinFromRabbit(rabbit);
  });
});
