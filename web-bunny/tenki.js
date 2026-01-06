// tenki.js
(() => {
  const FIELD_ID = "field";
  const SUNNY_SRC = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  const CLOUD_COUNT = 6;

  // 雲の透け演出
  const CLOUD_BASE_OPACITY = 0.85;     // 普段
  const CLOUD_OVERLAP_OPACITY = 0.55;  // 雲同士が重なるとき
  const CLOUD_FADE_SPEED = 0.06;       // 0〜1（大きいほど即変化）

  // 太陽が隠れる演出
  const SUN_BASE_OPACITY = 1.0;
  const SUN_HIDE_OPACITY = 0.25;
  const SUN_FADE_SPEED = 0.06;

  const field = document.getElementById(FIELD_ID);
  if (!field) return;

  // 重要：absolute を効かせるため親を基準にする
  const st = getComputedStyle(field);
  if (st.position === "static") field.style.position = "relative";

  const fieldRect = () => field.getBoundingClientRect();

  const rectsIntersect = (a, b) => {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  };

  const approach = (cur, target, speed) => cur + (target - cur) * speed;

  /* =========================
     ☀️ Sunny（1個）
  ========================= */
  const sunny = document.createElement("img");
  sunny.src = SUNNY_SRC;

  // 太陽は「雲の中間層」くらいに置く（雲が前に来たら隠れる）
  Object.assign(sunny.style, {
    position: "absolute",
    top: "20px",
    right: "20px",
    width: "120px",
    pointerEvents: "none",
    zIndex: 2,
    opacity: String(SUN_BASE_OPACITY),
  });

  sunny._opacity = SUN_BASE_OPACITY;
  field.appendChild(sunny);

  /* =========================
     ☁️ Cloud（複数＋移動）
  ========================= */
  const clouds = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = document.createElement("img");
    cloud.src = CLOUDY_SRC;

    const size = 80 + Math.random() * 60;
    const startX = Math.random() * fieldRect().width;
    const speed = 0.08 + Math.random() * 0.22; // ゆっくり

    cloud._x = startX;
    cloud._speed = speed;

    // 雲レイヤー： 1〜4（太陽 zIndex=2）
    cloud._z = 1 + Math.floor(Math.random() * 4);
    cloud._opacity = CLOUD_BASE_OPACITY;

    Object.assign(cloud.style, {
      position: "absolute",
      top: Math.random() * 60 + "%",
      left: "0px",
      width: `${size}px`,
      pointerEvents: "none",
      zIndex: String(cloud._z),
      opacity: String(cloud._opacity),
      transform: `translateX(${cloud._x}px)`,
    });

    field.appendChild(cloud);
    clouds.push(cloud);
  }

  /* =========================
     ☁️ 雲の重なり順シャッフル（自然寄り）
     - 大きい雲ほど前に来やすい
  ========================= */
  function shuffleCloudZ() {
    clouds.forEach(cloud => {
      const size = parseFloat(cloud.style.width);
      // sizeが大きいほど z が高くなりやすい
      const base = size > 125 ? 3 : size > 105 ? 2 : 1;
      cloud._z = Math.min(4, base + Math.floor(Math.random() * 2)); // 1〜4
      cloud.style.zIndex = String(cloud._z);
    });
  }
  setInterval(shuffleCloudZ, 7000);

  /* =========================
     ☁️ アニメーション（移動＋透け判定＋太陽隠し）
  ========================= */
  function animate() {
    const rect = fieldRect();

    // 移動
    for (const cloud of clouds) {
      cloud._x += cloud._speed;

      if (cloud._x > rect.width + 120) {
        cloud._x = -180;
        cloud.style.top = Math.random() * 60 + "%";
      }
      cloud.style.transform = `translateX(${cloud._x}px)`;
    }

    // 判定用Rect（DOMの実座標）
    const cloudRects = clouds.map(c => c.getBoundingClientRect());
    const sunRect = sunny.getBoundingClientRect();

    // 1) 雲同士が重なると「ほんのり透ける」
    for (let i = 0; i < clouds.length; i++) {
      const a = clouds[i];
      const ra = cloudRects[i];

      let overlapped = false;

      for (let j = 0; j < clouds.length; j++) {
        if (i === j) continue;

        const b = clouds[j];
        const rb = cloudRects[j];

        // 重なっていて、かつ「前の雲（zが高い）」が存在するなら透ける
        if (rectsIntersect(ra, rb) && b._z >= a._z) {
          overlapped = true;
          break;
        }
      }

      const targetOpacity = overlapped ? CLOUD_OVERLAP_OPACITY : CLOUD_BASE_OPACITY;
      a._opacity = approach(a._opacity, targetOpacity, CLOUD_FADE_SPEED);
      a.style.opacity = String(a._opacity);
    }

    // 2) 太陽が雲の後ろに隠れる（太陽と重なり、雲のzが太陽より前）
    let sunCovered = false;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (c._z > 2 && rectsIntersect(sunRect, cloudRects[i])) {
        sunCovered = true;
        break;
      }
    }

    const sunTarget = sunCovered ? SUN_HIDE_OPACITY : SUN_BASE_OPACITY;
    sunny._opacity = approach(sunny._opacity, sunTarget, SUN_FADE_SPEED);
    sunny.style.opacity = String(sunny._opacity);

    requestAnimationFrame(animate);
  }

  animate();
})();
