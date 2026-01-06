// tenki.js
(() => {
  const FIELD_ID = "field";
  const SUNNY_SRC = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  const field = document.getElementById(FIELD_ID);
  if (!field) return;

  const fieldRect = () => field.getBoundingClientRect();

  /* =========================
     ☀️ Sunny（1個）
  ========================= */
  const sunny = document.createElement("img");
  sunny.src = SUNNY_SRC;

  Object.assign(sunny.style, {
    position: "absolute",
    top: "20px",
    right: "20px",
    width: "120px",
    pointerEvents: "none",
    zIndex: 1,
  });

  field.appendChild(sunny);

  /* =========================
     ☁️ Cloud（複数＋移動）
  ========================= */
  const CLOUD_COUNT = 6;
  const clouds = [];

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = document.createElement("img");
    cloud.src = CLOUDY_SRC;

    const size = 80 + Math.random() * 60;
    const startX = Math.random() * fieldRect().width;
    const speed = 0.1 + Math.random() * 0.25; // ← ゆっくり

    cloud._x = startX;
    cloud._speed = speed;

    Object.assign(cloud.style, {
      position: "absolute",
      top: Math.random() * 60 + "%",
      left: "0px",
      width: `${size}px`,
      opacity: 0.8,
      pointerEvents: "none",
      zIndex: 0,
      transform: `translateX(${cloud._x}px)`,
    });

    field.appendChild(cloud);
    clouds.push(cloud);
  }

  /* =========================
     ☁️ アニメーション
  ========================= */
  function animateClouds() {
    const rect = fieldRect();

    clouds.forEach(cloud => {
      cloud._x += cloud._speed;

      // 右端を超えたら左に戻す
      if (cloud._x > rect.width + 100) {
        cloud._x = -150;
        cloud.style.top = Math.random() * 60 + "%"; // 高さを少し変える
      }

      cloud.style.transform = `translateX(${cloud._x}px)`;
    });

    requestAnimationFrame(animateClouds);
  }

  animateClouds();
})();
