// tenki.js（UFOレア飛来つき）
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

  /* =========================
   * 👽 UFO（レアで左→右に画面外から画面外へ）
   * ========================= */
  const UFO_SRC = "./assets/tenki/UFO.png";

  // レア確率：この間隔ごとに判定
  const UFO_CHECK_MS = 6000;

  // 1回の判定で出る確率（例：0.06=約6%）
  const UFO_CHANCE = 0.06;

  // 同時に複数出さない
  let ufoActive = false;

  // ふわふわ設定
  const UFO_MIN_SIZE = 70;
  const UFO_MAX_SIZE = 120;

  // 速度（px/s）
  const UFO_MIN_SPEED = 55;
  const UFO_MAX_SPEED = 120;

  // ふわふわ振幅（px）
  const UFO_MIN_BOB = 8;
  const UFO_MAX_BOB = 18;

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
   * 👽 UFO 生成（左画面外→右画面外）
   * ========================= */
  function spawnUFO() {
    if (ufoActive) return;
    ufoActive = true;

    const fr = fieldRect();
    const top = computeTopOffset();

    const ufo = document.createElement("img");
    ufo.src = UFO_SRC;
    ufo.draggable = false;

    const size = UFO_MIN_SIZE + Math.random() * (UFO_MAX_SIZE - UFO_MIN_SIZE);
    const speed = UFO_MIN_SPEED + Math.random() * (UFO_MAX_SPEED - UFO_MIN_SPEED);
    const bobAmp = UFO_MIN_BOB + Math.random() * (UFO_MAX_BOB - UFO_MIN_BOB);
    const bobSpeed = 0.9 + Math.random() * 1.3; // 揺れ速度

    // 上寄り（雲の範囲より少し上〜同じくらい）
    const minY = top + 10;
    const maxY = Math.max(minY + 20, top + fr.height * 0.30);
    const baseY = Math.floor(minY + Math.random() * (maxY - minY));

    // 画面外スタート → 画面外ゴール
    let x = -size - 40;
    const endX = fr.width + size + 60;

    // z-index：雲のちょい上〜太陽より下/上は好み。ここは雲より上にして目立たせる
    const z = 5;

    Object.assign(ufo.style, {
      position: "absolute",
      left: "0px",
      top: `${baseY}px`,
      width: `${size}px`,
      pointerEvents: "none",
      zIndex: String(z),
      opacity: "0.0",
      transform: `translateX(${x}px) translateY(0px)`,
      filter: "drop-shadow(0 10px 14px rgba(0,0,0,.18))",
      willChange: "transform,opacity",
    });

    field.appendChild(ufo);

    const fadeInDur = 700;
    const fadeOutDur = 700;

    let startedAt = performance.now();
    let lastTs = startedAt;

    function step(ts) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;

      // 横移動
      x += speed * dt;

      // ふわふわ（sin）
      const t = (ts - startedAt) / 1000;
      const bob = Math.sin(t * bobSpeed * Math.PI * 2) * bobAmp;

      // フェード
      const dist = endX - (-size - 40);
      const p = clamp01((x - (-size - 40)) / Math.max(1, dist));
      let op = 1;

      // 入り
      if (p < 0.12) op = p / 0.12;
      // 出
      if (p > 0.88) op = (1 - p) / 0.12;

      ufo.style.opacity = String(clamp01(op));
      ufo.style.transform = `translateX(${x}px) translateY(${bob}px)`;

      if (x >= endX) {
        try { ufo.remove(); } catch {}
        ufoActive = false;
        return;
      }

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // レア判定タイマー（開いてる間に時々出る）
  setInterval(() => {
    if (ufoActive) return;
    if (Math.random() < UFO_CHANCE) spawnUFO();
  }, UFO_CHECK_MS);

  /* =========================
     アニメーション
  ========================= */
  function animate() {
    const fr = fieldRect();

    // HUDの高さ変化対策：毎フレ更新しても軽い
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
