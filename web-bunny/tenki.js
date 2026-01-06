// tenki.js
(() => {
  const FIELD_ID = "tenkiLayer";
  const SUNNY_SRC = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  const CLOUD_COUNT = 6;

  /* ===== 雲の透け ===== */
  const CLOUD_BASE_OPACITY = 0.85;
  const CLOUD_OVERLAP_OPACITY = 0.55;
  const CLOUD_FADE_SPEED = 0.06;

  /* ===== 太陽 ===== */
  const SUN_BASE_OPACITY = 1.0;
  const SUN_HIDE_OPACITY = 0.25;
  const SUN_FADE_SPEED = 0.06;

  /* ===== にじみ（霞み） ===== */
  const SUN_GLOW_MAX = 18;     // 霞み最大px
  const SUN_GLOW_SPEED = 0.08;

  const field = document.getElementById(FIELD_ID);
  if (!field) return;

  const st = getComputedStyle(field);
  if (st.position === "static") field.style.position = "relative";

  const fieldRect = () => field.getBoundingClientRect();

  const rectsIntersect = (a, b) =>
    !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

  const approach = (cur, target, speed) =>
    cur + (target - cur) * speed;

  /* =========================
     ☀️ 太陽
  ========================= */
  const sunny = document.createElement("img");
  sunny.src = SUNNY_SRC;

  Object.assign(sunny.style, {
    position: "absolute",
    top: "20px",
    right: "20px",
    width: "120px",
    pointerEvents: "none",
    zIndex: 2,
    opacity: SUN_BASE_OPACITY,
    filter: "blur(0px)",
  });

  sunny._opacity = SUN_BASE_OPACITY;
  sunny._glow = 0;

  field.appendChild(sunny);

  /* =========================
     ☁️ 雲
  ========================= */
  const clouds = [];

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = document.createElement("img");
    cloud.src = CLOUDY_SRC;

    const size = 80 + Math.random() * 60;

    cloud._x = Math.random() * fieldRect().width;
    cloud._speed = 0.08 + Math.random() * 0.22;
    cloud._z = 1 + Math.floor(Math.random() * 4);
    cloud._opacity = CLOUD_BASE_OPACITY;

    Object.assign(cloud.style, {
      position: "absolute",
      top: Math.random() * 60 + "%",
      left: "0px",
      width: `${size}px`,
      pointerEvents: "none",
      zIndex: cloud._z,
      opacity: cloud._opacity,
      transform: `translateX(${cloud._x}px)`,
    });

    field.appendChild(cloud);
    clouds.push(cloud);
  }

  /* ===== 雲の前後シャッフル ===== */
  setInterval(() => {
    clouds.forEach(c => {
      const size = parseFloat(c.style.width);
      const base = size > 125 ? 3 : size > 105 ? 2 : 1;
      c._z = Math.min(4, base + Math.floor(Math.random() * 2));
      c.style.zIndex = c._z;
    });
  }, 7000);

  /* =========================
     アニメーション
  ========================= */
  function animate() {
    const rect = fieldRect();

    /* ---- 雲移動 ---- */
    clouds.forEach(c => {
      c._x += c._speed;
      if (c._x > rect.width + 150) {
        c._x = -200;
        c.style.top = Math.random() * 60 + "%";
      }
      c.style.transform = `translateX(${c._x}px)`;
    });

    const cloudRects = clouds.map(c => c.getBoundingClientRect());
    const sunRect = sunny.getBoundingClientRect();

    /* ---- 雲同士の透け ---- */
    clouds.forEach((a, i) => {
      let overlap = false;
      cloudRects.forEach((rb, j) => {
        if (i !== j && clouds[j]._z >= a._z && rectsIntersect(cloudRects[i], rb)) {
          overlap = true;
        }
      });
      const target = overlap ? CLOUD_OVERLAP_OPACITY : CLOUD_BASE_OPACITY;
      a._opacity = approach(a._opacity, target, CLOUD_FADE_SPEED);
      a.style.opacity = a._opacity;
    });

    /* ---- 太陽：隠れ＋にじみ ---- */
    let sunCovered = false;
    let sunTouched = false;

    clouds.forEach((c, i) => {
      if (rectsIntersect(sunRect, cloudRects[i])) {
        sunTouched = true;
        if (c._z > 2) sunCovered = true;
      }
    });

    const sunOpacityTarget = sunCovered ? SUN_HIDE_OPACITY : SUN_BASE_OPACITY;
    sunny._opacity = approach(sunny._opacity, sunOpacityTarget, SUN_FADE_SPEED);
    sunny.style.opacity = sunny._opacity;

    const glowTarget = sunTouched ? SUN_GLOW_MAX : 0;
    sunny._glow = approach(sunny._glow, glowTarget, SUN_GLOW_SPEED);
    sunny.style.filter = `blur(${sunny._glow}px)`;

    requestAnimationFrame(animate);
  }

  animate();
})();
