// tenki.js
(() => {
  const FIELD_ID = "field"; // 背景を置く親要素（既存のフィールド）
  const SUNNY_SRC = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  const field = document.getElementById(FIELD_ID);
  if (!field) return;

  /* =========================
     Sunny.gif（1個だけ）
  ========================= */
  const sunny = document.createElement("img");
  sunny.src = SUNNY_SRC;
  sunny.className = "sunny";

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
     cloudy_1.gif（複数個）
  ========================= */
  const CLOUD_COUNT = 6; // ← 置きたい数

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = document.createElement("img");
    cloud.src = CLOUDY_SRC;
    cloud.className = "cloud";

    const size = 80 + Math.random() * 60;

    Object.assign(cloud.style, {
      position: "absolute",
      top: Math.random() * 60 + "%",
      left: Math.random() * 100 + "%",
      width: `${size}px`,
      opacity: 0.8,
      pointerEvents: "none",
      zIndex: 0,
    });

    field.appendChild(cloud);
  }
})();
