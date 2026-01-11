// tenki.js（UFO強化 + 特殊演出PNGランダム表示：軽量化版 + ✅雨/雪SEループ）
// ✅ UFO.mp3 を SEスライダーに紐づけ（WB.se.loop） + ITEMより上
// ✅ UFOは ITEM（ベッド/ミラーボール/oak）より上に表示：超高z-index
// ✅ UFO出現中は UFO.mp3 をずっと鳴らし続ける（ループ）
// ✅ BGM.js の SE API（WB.se.loop / WB.getSEVolume / milkpop_se_settings_v1 muted）に完全追従
// ✅ BGM.js が無い場合はフォールバックで鳴る
// ✅ UFO出現を “もう少しレア” に
// ✅ 追加：assets/tenki の PNG（大雨/大雪/雷/オーロラ/桜/紅葉）をランダムで表示（UFOより下）
// ✅ 追加：雨(rain)/雪(snow) のときだけ assets/tenki 内のSEをループ再生（WB.se.loop追従）
// ✅ 重要：PNG演出で重くならないように軽量化
//    - specialは <div background-image> で表示（imgより軽いことが多い）
//    - JSで毎フレームtransform更新しない（CSSアニメに移行）
//    - drop-shadow等の重いfilterを廃止
//    - will-change / translateZ で合成に寄せる

(() => {
  "use strict";

  const FIELD_ID = "tenkiLayer";
  const HUD_ID   = "hud";

  const SUNNY_SRC  = "./assets/tenki/Sunny.gif";
  const CLOUDY_SRC = "./assets/tenki/cloudy_1.gif";

  // 🛸 UFO
  const UFO_IMG_SRC = "./assets/tenki/UFO.png";
  const UFO_SE_SRC  = "./assets/UFO.mp3";
  const UFO_SE_BASE = 1.0;

  // ✅ 特殊演出SE（assets/tenki の中に置く）
  // ※日本語ファイル名でも動くことは多いが、環境によっては事故るので英数字推奨
  const RAIN_SE_SRC = "./assets/tenki/雨が降る1.mp3";
  const SNOW_SE_SRC = "./assets/tenki/天候・吹雪.mp3";
  const SPECIAL_SE_BASE = 0.85;

  // 出現率（1秒あたり）— レア化
  const UFO_CHANCE_PER_SEC = 0.0035; // 0.35%/sec
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

  /* =========================
     ✅ 特殊演出PNG（assets/tenki に置く）
     - “たまに” ランダムで1枚だけ表示
     - UFOより下 / アイテムより上
     - ✅ 軽量化：div + background-image + CSS drift（JS毎フレーム更新なし）
     - ✅ 雨/雪のときだけSEをループ（WB.se.loop追従）
  ========================= */
  const SPECIAL_Z_INDEX = 340000; // UFO(350000)より下 / アイテムより上想定
  const SPECIAL_CHANCE_PER_SEC = 0.0016; // 0.16%/sec（目安：10分に1回くらい）
  const SPECIAL_MIN_DURATION_SEC = 5.5;
  const SPECIAL_MAX_DURATION_SEC = 10.0;

  // ✅ さらに軽くしたいなら opacity を 0.45〜0.5 に下げると合成コストが下がることが多い
  const SPECIALS = [
    { key: "rain",   src: "./assets/tenki/w02_大雨.png",     opacity: 0.55, blend: "screen",
      se: { id: "tenki_rain", src: RAIN_SE_SRC, base: SPECIAL_SE_BASE } },

    { key: "snow",   src: "./assets/tenki/w05_大雪.png",     opacity: 0.55, blend: "screen",
      se: { id: "tenki_snow", src: SNOW_SE_SRC, base: SPECIAL_SE_BASE } },

    { key: "thun",   src: "./assets/tenki/w09_雷.png",       opacity: 0.60, blend: "screen" },
    { key: "aurora", src: "./assets/tenki/w33_オーロラ.png", opacity: 0.55, blend: "screen" },
    { key: "sakura", src: "./assets/tenki/w34_桜.png",       opacity: 0.55, blend: "screen" },
    { key: "momiji", src: "./assets/tenki/w35_紅葉.png",     opacity: 0.55, blend: "screen" },
  ];

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
     ✅ CSS（特殊演出：軽量 drift）
  ========================= */
  function ensureSpecialCssOnce() {
    if (document.getElementById("tenkiSpecialCssV1")) return;
    const s = document.createElement("style");
    s.id = "tenkiSpecialCssV1";
    s.textContent = `
@keyframes milkpopSpecialDriftV1{
  0%   { transform: translate3d(0px, 0px, 0); }
  50%  { transform: translate3d(1.2px, -0.8px, 0); }
  100% { transform: translate3d(0px, 0px, 0); }
}
#tenkiSpecialOverlayV1{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:${SPECIAL_Z_INDEX};
  opacity:0;
  background-repeat:no-repeat;
  background-position:center;
  background-size:cover;
  will-change: opacity, transform;
  transform: translate3d(0,0,0);
  animation: milkpopSpecialDriftV1 6.5s ease-in-out infinite;
}
`;
    document.head.appendChild(s);
  }

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
      // ✅ filterは重いのでUFO側だけ最低限（必要なら残してOK）
      filter: "drop-shadow(0 14px 22px rgba(0,0,0,.22))",
      transition: "opacity .25s ease",
      willChange: "transform, opacity",
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
     ✅ 特殊演出SE（雨/雪だけ）
  ========================= */
  let __specialFallbackAudio = null;
  let __specialPlayingId = null;

  function startSpecialSound(se) {
    stopSpecialSound();
    if (!se || !se.id || !se.src) return;
    __specialPlayingId = se.id;

    try {
      const WB = window.WB;
      if (WB?.se?.loop) {
        WB.se.loop(se.id, se.src, Number(se.base ?? 1.0));
        return;
      }
    } catch {}

    // フォールバック（BGM.js無しでも鳴る）
    try {
      const a = new Audio();
      a.preload = "auto";
      a.loop = true;
      a.src = encodeURI(se.src);
      a.volume = 0.8;
      a.play().catch(() => {});
      __specialFallbackAudio = a;
    } catch {}
  }

  function stopSpecialSound() {
    try {
      if (__specialPlayingId) window.WB?.se?.stop?.(__specialPlayingId);
    } catch {}
    __specialPlayingId = null;

    try {
      if (__specialFallbackAudio) {
        __specialFallbackAudio.pause();
        __specialFallbackAudio = null;
      }
    } catch {}
  }

  /* =========================
     ✅ 特殊演出（軽量）
  ========================= */
  ensureSpecialCssOnce();

  let specialEl = null;       // div
  let specialActive = false;
  let specialTLeft = 0;
  let specialTargetOpacity = 0.55;
  let specialNowOpacity = 0.0;

  function ensureSpecialEl() {
    if (specialEl && specialEl.isConnected) return specialEl;

    const d = document.createElement("div");
    d.id = "tenkiSpecialOverlayV1";

    // 初期は何も出さない
    d.style.opacity = "0";
    d.style.mixBlendMode = "normal";

    field.appendChild(d);
    specialEl = d;
    return specialEl;
  }

  function pickSpecial() {
    const i = Math.floor(Math.random() * SPECIALS.length);
    return SPECIALS[i];
  }

  function startSpecial(which = null) {
    if (specialActive) return;

    const s = which || pickSpecial();
    const el = ensureSpecialEl();

    // ✅ img.src じゃなく background-image
    el.style.backgroundImage = `url("${s.src}")`;
    el.style.mixBlendMode = (s.blend || "normal");

    specialTargetOpacity = Math.max(0, Math.min(1, Number(s.opacity ?? 0.55)));
    specialNowOpacity = 0.0;
    el.style.opacity = "0";

    // ✅ 雨/雪ならSE開始（それ以外は停止）
    startSpecialSound(s.se);

    specialActive = true;
    specialTLeft =
      (SPECIAL_MIN_DURATION_SEC + Math.random() * (SPECIAL_MAX_DURATION_SEC - SPECIAL_MIN_DURATION_SEC));
  }

  function stopSpecial() {
    specialActive = false;
    // ✅ 特殊演出SE停止
    stopSpecialSound();
    // フェードアウトはanimate側で
  }

  // デバッグ用：コンソールから強制表示
  window.TENKI = window.TENKI || {};
  window.TENKI.forceSpecial = (keyOrIndex) => {
    let s = null;
    if (typeof keyOrIndex === "number") s = SPECIALS[keyOrIndex];
    else if (typeof keyOrIndex === "string") s = SPECIALS.find(x => x.key === keyOrIndex) || null;
    startSpecial(s);
  };
  window.TENKI.stopSpecial = () => stopSpecial();
  window.TENKI._specialSoundStop = () => stopSpecialSound();

  /* =========================
     アニメーション
  ========================= */
  let lastT = performance.now();

  // ✅ タブ非表示中は描画を軽くする（ブラウザ負担減）
  let hiddenSlow = false;
  document.addEventListener("visibilitychange", () => {
    hiddenSlow = document.hidden;
  });

  function animate(t) {
    const fr = fieldRect();

    // タブ裏は更新頻度を落とす（体感軽い）
    const dtRaw = (t - lastT) / 1000;
    const dt = Math.min(0.05, dtRaw);
    lastT = t;

    layoutSun();

    // 雲移動
    clouds.forEach(c => {
      c._x += c._speed * (hiddenSlow ? 0.35 : 1.0);
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

    // ✅ 特殊演出抽選（非アクティブ時のみ）
    if (!specialActive) {
      const pSp = 1 - Math.pow(1 - SPECIAL_CHANCE_PER_SEC, dt);
      if (Math.random() < pSp) startSpecial();
    } else {
      specialTLeft -= dt;
      if (specialTLeft <= 0) stopSpecial();
    }

    // ✅ 特殊演出フェード（JSでtransform触らない＝軽い）
    if (specialEl) {
      const target = specialActive ? specialTargetOpacity : 0;
      specialNowOpacity = approach(specialNowOpacity, target, 0.08);
      specialEl.style.opacity = String(specialNowOpacity);

      // 完全に消えたらDOM掃除（残骸ゼロ）
      if (!specialActive && specialNowOpacity < 0.01) {
        // ✅ 保険：音が残ってたら止める
        stopSpecialSound();
        try { specialEl.remove(); } catch {}
        specialEl = null;
      }
    }

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
