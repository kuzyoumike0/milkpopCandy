// tenki.js
(() => {
  const FIELD_ID = "tenkiLayer";
  const HUD_ID = "hud";

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

  const field = document.getElementById(FIELD_ID);
  if (!field) return;

  const hud = document.getElementById(HUD_ID);

  const st = getComputedStyle(field);
  if (st.position === "static") field.style.position = "relative";

  const fieldRect = () => field.getBoundingClientRect();
  const hudRect = () => (hud ? hud.getBoundingClientRect() : null);

  // HUDがfieldに被っているなら、その分だけ下にずらす（被ってないなら最小だけ）
  const computeTopOffset = () => {
    const fr = fieldRect();
    const hr = hudRect();
    if (!hr) return 8;

    const overlap = hr.bottom - fr.top; // +なら被り
    return overlap > 1 ? Math.ceil(overlap) + 8 : 8;
  };

  const rectsIntersect = (a, b) =>
    !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

  const approach = (cur, target, speed) => cur + (target - cur) * speed;

  // 雲のY位置を「ボタンの下〜上の方」に収める（px）
  const pickCloudYpx = () => {
    const fr = fieldRect();
    const top = computeTopOffset();
    const minY = top + 6;
    const maxY = Math.max(minY + 10, top + fr.height * 0.35); // 上35%以内
    return Math.floor(minY + Math.random() * (maxY - minY));
  };

  /* =========================
     ☀️ 太陽（にじみ演出なし）
  ========================= */
  const sunny = document.createElement("img");
  sunny.src = SUNNY_SRC;

  Object.assign(sunny.style, {
    position: "absolute",
    width: "120px",
    pointerEvents: "none",
    zIndex: 2,
    opacity: String(SUN_BASE_OPACITY),
  });

  sunny._opacity = SUN_BASE_OPACITY;
  field.appendChild(sunny);

  // 太陽の位置（HUDの下）
  const layoutSun = () => {
    const top = computeTopOffset();
    // 右上寄せ：tenkiLayer内で right を使うとズレにくい
    sunny.style.top = `${top}px`;
    sunny.style.right = `20px`;
  };
  layoutSun();
  window.addEventListener("resize", layoutSun);

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
      left: "0px",
      top: `${pickCloudYpx()}px`,          // ★HUDの下から出す
      width: `${size}px`,
      pointerEvents: "none",
      zIndex: String(cloud._z),
      opacity: String(cloud._opacity),
      transform: `translateX(${cloud._x}px)`,
    });

    field.appendChild(cloud);
    clouds.push(cloud);
  }

  /* ===== 雲の前後シャッフル（自然寄り） ===== */
  setInterval(() => {
    clouds.forEach(c => {
      const size = parseFloat(c.style.width);
      const base = size > 125 ? 3 : size > 105 ? 2 : 1;
      c._z = Math.min(4, base + Math.floor(Math.random() * 2));
      c.style.zIndex = String(c._z);
    });
  }, 7000);

  /* =========================
     アニメーション
  ========================= */
  function animate() {
    const fr = fieldRect();

    // 位置がズレないよう、たまに太陽の基準を更新（HUDの高さ変化対策）
    // ここは軽いので毎フレでもOK
    layoutSun();

    // 雲移動
    clouds.forEach(c => {
      c._x += c._speed;

      if (c._x > fr.width + 150) {
        c._x = -200;
        c.style.top = `${pickCloudYpx()}px`;  // ★再出現もHUD下へ
      }
      c.style.transform = `translateX(${c._x}px)`;
    });

    const cloudRects = clouds.map(c => c.getBoundingClientRect());
    const sunRect = sunny.getBoundingClientRect();

    // 雲同士の透け
    clouds.forEach((a, i) => {
      let overlap = false;
      for (let j = 0; j < clouds.length; j++) {
        if (i === j) continue;
        if (clouds[j]._z >= a._z && rectsIntersect(cloudRects[i], cloudRects[j])) {
          overlap = true;
          break;
        }
      }
      const target = overlap ? CLOUD_OVERLAP_OPACITY : CLOUD_BASE_OPACITY;
      a._opacity = approach(a._opacity, target, CLOUD_FADE_SPEED);
      a.style.opacity = String(a._opacity);
    });

    // 太陽が雲の後ろに隠れる（雲が太陽より前＆重なり）
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
