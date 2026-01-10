// tenki.js（UFO強化：✅UFO.mp3 を SEスライダーに紐づけ（WB.se.loop） + ITEMより上）
// ✅ UFOは ITEM（ベッド/ミラーボール/oak）より上に表示：超高z-index
// ✅ UFO出現中は UFO.mp3 をずっと鳴らし続ける（ループ）
// ✅ BGM.js の SE API（WB.se.loop / WB.getSEVolume / milkpop_se_settings_v1 muted）に完全追従
// ✅ BGM.js が無い場合はフォールバックで鳴る

(() => {
  "use strict";

  const FIELD_ID = "tenkiLayer";
  const HUD_ID   = "hud";

  const SUNNY_SRC  = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  // 🛸 UFO
  const UFO_IMG_SRC = "./assets/tenki/UFO.png";
  const UFO_SE_SRC  = "./assets/UFO.mp3";

  // ✅ SEスライダー通り（小さくしない）
  const UFO_SE_BASE = 1.0;

  // 出現率（1秒あたり）
  const UFO_CHANCE_PER_SEC = 0.010; // 1.0%/sec
  const UFO_SPEED_PX_PER_SEC = 95;
  const UFO_SIZE_PX = 150;

  const UFO_TOP_RATIO_MIN = 0.08;
  const UFO_TOP_RATIO_MAX = 0.30;

  // ✅ ITEMより上（itemPlaceが9999でも勝つ）
  const UFO_Z_INDEX = 350000;

  const CLOUD_COUNT = 6;

  /* 雲の透け */
  const CLOUD_BASE_OPACITY = 0.85;
  const CLOUD_OVERLAP_OPACITY = 0.55;
  const CLOUD_FADE_SPEED = 0.06;

  /* 太陽 */
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

  // HUDが被ってるなら下にずらす
  const computeTopOffset = () => {
    const fr = fieldRect();
    const hr = hudRect();
    if (!hr) return 8;
    const overlap = hr.bottom - fr.top;
    return overlap > 1 ? Math.ceil(overlap) + 8 : 8;
  };

  const rectsIntersect = (a, b) =>
    !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

  const approach = (cur, target, speed) => cur + (target - cur) * speed;

  const pickCloudYpx = () => {
    const fr = fieldRect();
    const top = computeTopOffset();
    const minY = top + 6;
    const maxY = Math.max(minY + 10, top + fr.height * 0.35);
    return Math.floor(minY + Math.random() * (maxY - minY));
  };

  /* =========================
     ☀️ 太陽
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

  const layoutSun = () => {
    const top = computeTopOffset();
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
      top: `${pickCloudYpx()}px`,
      width: `${size}px`,
      pointerEvents: "none",
      zIndex: String(cloud._z),
      opacity: String(cloud._opacity),
      transform: `translateX(${cloud._x}px)`,
    });

    field.appendChild(cloud);
    clouds.push(cloud);
  }

  // たまに雲のzをシャッフル
  setInterval(() => {
    clouds.forEach(c => {
      const size = parseFloat(c.style.width);
      const base = size > 125 ? 3 : size > 105 ? 2 : 1;
      c._z = Math.min(4, base + Math.floor(Math.random() * 2));
      c.style.zIndex = String(c._z);
    });
  }, 7000);

  /* =========================
     🛸 UFO
  ========================= */
  let ufoEl = null;
  let ufoX = 0;
  let ufoY = 0;
  let ufoActive = false;

  function ensureUFOEl() {
    if (ufoEl && ufoEl.isConnected) return ufoEl;

    const img = document.createElement("img");
    img.src = UFO_IMG_SRC;
    img.draggable = false;

    Object.assign(img.style, {
      position: "absolute",
      width: `${UFO_SIZE_PX}px`,
      height: "auto",
      pointerEvents: "none",
      zIndex: String(UFO_Z_INDEX),
      opacity: "0",
      transform: "translate3d(0,0,0)",
      filter: "drop-shadow(0 14px 22px rgba(0,0,0,.22))",
      transition: "opacity .25s ease",
    });

    field.appendChild(img);
    ufoEl = img;
    return ufoEl;
  }

  function pickUFOY() {
    const fr = fieldRect();
    const top = computeTopOffset();
    const min = top + fr.height * UFO_TOP_RATIO_MIN;
    const max = top + fr.height * UFO_TOP_RATIO_MAX;
    const y = min + Math.random() * Math.max(10, (max - min));
    return Math.floor(y);
  }

  // ✅ ここが本命：UFO.mp3 を SEに紐づけ（WB.se.loop）
  function startUFOSound() {
    try {
      const WB = window.WB;
      if (WB?.se?.loop) {
        WB.se.loop("ufo", UFO_SE_SRC, UFO_SE_BASE);
        return;
      }
    } catch {}

    // フォールバック（BGM.js無しでも鳴る）
    try {
      const a = new Audio();
      a.preload = "auto";
      a.loop = true;
      a.src = encodeURI(UFO_SE_SRC);
      a.volume = 0.8;
      a.play().catch(() => {});
      window.__ufoFallbackAudio = a;
    } catch {}
  }

  function stopUFOSound() {
    try { window.WB?.se?.stop?.("ufo"); } catch {}

    try {
      if (window.__ufoFallbackAudio) {
        window.__ufoFallbackAudio.pause();
        window.__ufoFallbackAudio = null;
      }
    } catch {}
  }

  function startUFO() {
    if (ufoActive) return;

    const el = ensureUFOEl();
    ufoActive = true;

    ufoX = -UFO_SIZE_PX - 40;
    ufoY = pickUFOY();

    el.style.left = `${ufoX}px`;
    el.style.top = `${ufoY}px`;
    el.style.opacity = "1";

    startUFOSound();
  }

  function stopUFO() {
    if (!ufoActive) return;
    ufoActive = false;

    if (ufoEl) {
      ufoEl.style.opacity = "0";
      setTimeout(() => {
        try { ufoEl?.remove(); } catch {}
        ufoEl = null;
      }, 350);
    }
    stopUFOSound();
  }

  /* =========================
     アニメーション
  ========================= */
  let lastT = performance.now();

  function animate(t) {
    const fr = fieldRect();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    layoutSun();

    // 雲移動
    clouds.forEach(c => {
      c._x += c._speed;
      if (c._x > fr.width + 150) {
        c._x = -200;
        c.style.top = `${pickCloudYpx()}px`;
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

    // 太陽が雲で隠れる
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

    // UFO抽選（非アクティブ時のみ）
    if (!ufoActive) {
      const p = 1 - Math.pow(1 - UFO_CHANCE_PER_SEC, dt);
      if (Math.random() < p) startUFO();
    } else {
      // UFO移動
      ufoX += UFO_SPEED_PX_PER_SEC * dt;

      if (ufoEl) {
        ufoEl.style.left = `${ufoX}px`;
        const bob = Math.sin(t / 220) * 6;
        ufoEl.style.top = `${ufoY + bob}px`;
      }

      if (ufoX > fr.width + UFO_SIZE_PX + 80) stopUFO();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  window.addEventListener("resize", () => {
    layoutSun();
  }, { passive: true });
})();
