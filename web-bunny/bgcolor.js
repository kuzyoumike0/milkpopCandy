// bgcolor.js
// ✅ 朝・昼・夜を「JST」で判定して #bgLayer / #field に直接適用
// ✅ mirrorball（購入済み＆ON）なら「ミラーボール画像＋スポットライトだけ」出す（全面ディスコ回転背景は出さない）
// ✅ 光（スポット）は “必ずミラーボール位置（画面中央上）からのみ” 出る
// ✅ スポットは2本（左右）/ ゆらゆら揺れる + 虹色に変化
// ✅ 夜だけ強化（濃さUP）
// ✅ うさぎがスポットに入ると少し明るく見える（bunnyWrap brightness）
// ✅ 重要：OFF時は「残骸含めて」ミラーボール・スポットを完全削除（外せない問題根絶）
// ✅ reset 等でDOMが作り直されても再適用（黒くなる対策）

(() => {
  "use strict";

  /* =========================
   * IDs / Keys
   * ========================= */
  const LS_OWNED = "milkpop_shop_owned_v1";
  const LS_STATE = "milkpop_shop_state_v1";

  // 過去版の残骸（ここを徹底的に掃除）
  const GARBAGE_ID_PREFIXES = [
    "mirrorballDisco",
    "mirrorballSparkle",
    "mirrorballSpotWrapV",
    "mirrorballSpotLeftV",
    "mirrorballSpotRightV",
    "mirrorballImgV",
  ];

  /* =========================
   * Time themes (JST)
   * ========================= */
  const MORNING = { start: 5, end: 10 };
  const DAY = { start: 10, end: 17 };

  const THEMES = {
    morning: "linear-gradient(180deg, #ffe7b8 0%, #ffd6e7 55%, #ffffff 100%)",
    day:     "linear-gradient(180deg, #bfe9ff 0%, #d9f7ff 55%, #ffffff 100%)",
    night:   "linear-gradient(180deg, #0b1026 0%, #141b3a 55%, #2b1b44 100%)",
  };

  function getJSTHour() {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === "hour")?.value ?? 0);
  }

  function getPhaseByHour(h) {
    if (h >= MORNING.start && h < MORNING.end) return "morning";
    if (h >= DAY.start && h < DAY.end) return "day";
    return "night";
  }

  /* =========================
   * Find nodes safely (reset耐性)
   * ========================= */
  function getBgLayer() { return document.getElementById("bgLayer"); }
  function getField()   { return document.getElementById("field"); }

  function ensureBgLayerReady(bgLayer) {
    if (!bgLayer) return;
    const cs = getComputedStyle(bgLayer);
    if (cs.position === "static") bgLayer.style.position = "relative";
    bgLayer.style.overflow = "hidden";
  }

  /* =========================
   * Mirrorball state
   * ========================= */
  function hasMirrorballOwned() {
    try { if (window.WB?.shop?.isOwned?.("mirrorball")) return true; } catch {}
    try {
      const raw = localStorage.getItem(LS_OWNED);
      const j = raw ? JSON.parse(raw) : null;
      return !!j?.mirrorball;
    } catch { return false; }
  }

  function isMirrorballEnabled() {
    try {
      if (typeof window.WB?.shop?.isMirrorballEnabled === "function") {
        return !!window.WB.shop.isMirrorballEnabled();
      }
    } catch {}

    try {
      const raw = localStorage.getItem(LS_STATE);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === "object" && "mirrorballEnabled" in j) return !!j.mirrorballEnabled;
    } catch {}
    return true; // stateが無い古い環境はON扱い
  }

  /* =========================
   * Cleanup (残骸全消し)
   * ========================= */
  function cleanupAllMirrorballStuff(root = document) {
    // 1) prefix系 id を片っ端から削除
    try {
      const all = root.querySelectorAll("[id]");
      all.forEach(el => {
        const id = String(el.id || "");
        for (const p of GARBAGE_ID_PREFIXES) {
          if (id.startsWith(p)) {
            try { el.remove(); } catch {}
            break;
          }
        }
      });
    } catch {}

    // 2) src一致で削除（過去版でidが違う場合）
    try {
      root.querySelectorAll('img[src*="mirrorball.png"], img[src*="/mirrorball.png"]').forEach(el => {
        try { el.remove(); } catch {}
      });
    } catch {}
  }

  /* =========================
   * Mirrorball image (single truth)
   * ========================= */
  const MIRROR = {
    id: "mirrorballImgFINAL",
    styleId: "mirrorballImgStyleFINAL",
    src: "./assets/bg/mirrorball.png",
    top: 8,
    size: 140,
    z: 30,
  };

  function ensureMirrorballStyle() {
    if (document.getElementById(MIRROR.styleId)) return;
    const st = document.createElement("style");
    st.id = MIRROR.styleId;
    st.textContent = `
#${MIRROR.id}{
  position:absolute;
  left:50%;
  top:${MIRROR.top}px;
  transform:translateX(-50%);
  width:${MIRROR.size}px;
  height:auto;
  z-index:${MIRROR.z};
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,.25));
}
`;
    document.head.appendChild(st);
  }

  function ensureMirrorball(bgLayer, on) {
    if (!bgLayer) return;

    ensureBgLayerReady(bgLayer);
    ensureMirrorballStyle();

    if (!on) {
      // ✅ OFFは “残骸含めて全部消す”
      cleanupAllMirrorballStuff(bgLayer);
      try { document.getElementById(MIRROR.id)?.remove(); } catch {}
      return;
    }

    // ONの時：過去版残骸を消してから1個だけ作る
    cleanupAllMirrorballStuff(bgLayer);

    let img = document.getElementById(MIRROR.id);
    if (!img) {
      img = document.createElement("img");
      img.id = MIRROR.id;
      img.alt = "mirrorball";
      img.src = MIRROR.src;
      img.draggable = false;
      img.addEventListener("error", () => console.warn("[bgcolor] mirrorball load failed:", MIRROR.src));
      bgLayer.appendChild(img);
    } else {
      if (img.getAttribute("src") !== MIRROR.src) img.src = MIRROR.src;
    }
  }

  /* =========================
   * Spotlight (ONLY from mirrorball)
   * ========================= */
  const SPOT = {
    styleId: "mirrorballSpotStyleFINAL",
    wrapId:  "mirrorballSpotWrapFINAL",
    leftId:  "mirrorballSpotLeftFINAL",
    rightId: "mirrorballSpotRightFINAL",
    z: 18, // ミラーボールより下
    // 調整ポイント
    widthVmax: 210,      // スポットの“広がり”（大きいほど幅広）
    coreOpacity: 0.52,   // 基本濃さ
    nightAdd: 0.22,      // 夜の追加濃さ
    swayDegA: 18,        // 揺れ角度（基準）
    swayDegB: 28,        // 揺れ角度（最大）
  };

  function spotOriginTopPx() {
    // 光源は “ミラーボール直下” に固定
    return Math.round(MIRROR.top + MIRROR.size * 0.62);
  }

  function ensureSpotStyle() {
    if (document.getElementById(SPOT.styleId)) return;

    const st = document.createElement("style");
    st.id = SPOT.styleId;
    st.textContent = `
@keyframes mbHueFINAL {
  0%   { filter: hue-rotate(0deg)    saturate(1.7) brightness(1.10); }
  100% { filter: hue-rotate(360deg)  saturate(1.7) brightness(1.10); }
}
@keyframes mbSwayL_FINAL {
  0%   { transform: translateX(-50%) rotate(-${SPOT.swayDegA}deg); }
  50%  { transform: translateX(-50%) rotate(-${SPOT.swayDegB}deg); }
  100% { transform: translateX(-50%) rotate(-${SPOT.swayDegA}deg); }
}
@keyframes mbSwayR_FINAL {
  0%   { transform: translateX(-50%) rotate(${SPOT.swayDegA}deg); }
  50%  { transform: translateX(-50%) rotate(${SPOT.swayDegB}deg); }
  100% { transform: translateX(-50%) rotate(${SPOT.swayDegA}deg); }
}

#${SPOT.wrapId}{
  position:absolute;
  inset:0;
  z-index:${SPOT.z};
  pointer-events:none;
  overflow:hidden;
  opacity:0;
  transition: opacity .25s ease;
}

/* ★ “起点は必ずミラーボール位置” */
#${SPOT.wrapId} .beam{
  position:absolute;
  left:50%;
  top:${spotOriginTopPx()}px;

  width:${SPOT.widthVmax}vmax;
  height:${SPOT.widthVmax}vmax;

  transform-origin: 50% 0%;
  mix-blend-mode: screen;
  opacity:${SPOT.coreOpacity};

  /* 三角コーン（中心が明るい） */
  background:
    conic-gradient(from 0deg,
      rgba(255,255,255,0)   0deg,
      rgba(255,255,255,0)  118deg,
      rgba(255,255,255,.00) 150deg,
      rgba(255,255,255,.40) 180deg,
      rgba(255,255,255,.00) 210deg,
      rgba(255,255,255,0)  242deg,
      rgba(255,255,255,0)  360deg
    );

  /* 上ほど濃く、下ほど薄い */
  mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 34%, rgba(0,0,0,0) 74%);
  -webkit-mask-image: radial-gradient(circle at 50% 0%, rgba(0,0,0,1) 0 34%, rgba(0,0,0,0) 74%);

  animation: mbHueFINAL 6.6s linear infinite;
  will-change: transform, filter, opacity;
}

/* 左右（起点は同じ、角度だけ違う） */
#${SPOT.leftId}{
  animation: mbHueFINAL 6.6s linear infinite, mbSwayL_FINAL 2.9s ease-in-out infinite;
}
#${SPOT.rightId}{
  animation: mbHueFINAL 6.6s linear infinite, mbSwayR_FINAL 3.1s ease-in-out infinite;
}
`;
    document.head.appendChild(st);
  }

  function ensureSpotWrap(bgLayer) {
    if (!bgLayer) return null;

    ensureBgLayerReady(bgLayer);
    ensureSpotStyle();

    let wrap = document.getElementById(SPOT.wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = SPOT.wrapId;

      const left = document.createElement("div");
      left.id = SPOT.leftId;
      left.className = "beam";

      const right = document.createElement("div");
      right.id = SPOT.rightId;
      right.className = "beam";

      wrap.appendChild(left);
      wrap.appendChild(right);

      // bgLayerの先頭に（背景の上・ミラーボールの下）
      bgLayer.insertBefore(wrap, bgLayer.firstChild);
    }
    return wrap;
  }

  function removeSpot() {
    try { document.getElementById(SPOT.wrapId)?.remove(); } catch {}
  }

  function setSpotEnabled(bgLayer, on, phase) {
    if (!bgLayer) return;

    if (!on) {
      removeSpot();
      return;
    }

    const wrap = ensureSpotWrap(bgLayer);
    if (!wrap) return;

    wrap.style.opacity = "1";

    // 夜だけ強化
    const isNight = (phase === "night");
    const add = isNight ? SPOT.nightAdd : 0;

    const left = document.getElementById(SPOT.leftId);
    const right = document.getElementById(SPOT.rightId);
    if (left && right) {
      left.style.opacity = String(SPOT.coreOpacity + add);
      right.style.opacity = String(SPOT.coreOpacity + add);
    }
  }

  /* =========================
   * Bunny brighten when in spot (cheap)
   * ========================= */
  let bunnyBrightTimer = null;

  function stopBunnyGlow() {
    if (bunnyBrightTimer) { clearInterval(bunnyBrightTimer); bunnyBrightTimer = null; }
    document.querySelectorAll(".bunnyWrap").forEach(w => { w.style.filter = ""; });
  }

  function startBunnyGlow(on, phase) {
    if (!on) { stopBunnyGlow(); return; }

    const field = getField();
    if (!field) { stopBunnyGlow(); return; }

    const boost = (phase === "night") ? 1.20 : 1.10;

    if (bunnyBrightTimer) clearInterval(bunnyBrightTimer);
    bunnyBrightTimer = setInterval(() => {
      const fr = field.getBoundingClientRect();
      const centerX = fr.left + fr.width * 0.5;
      const originY = fr.top + spotOriginTopPx();

      document.querySelectorAll(".bunnyWrap").forEach(w => {
        const r = w.getBoundingClientRect();
        const x = r.left + r.width * 0.5;
        const y = r.top  + r.height * 0.8;

        const dy = Math.max(0, y - originY);
        const allowed = 130 + dy * 0.90; // 下に行くほど広がる
        const inside = Math.abs(x - centerX) < allowed;

        w.style.filter = inside ? `brightness(${boost})` : "";
      });
    }, 120);
  }

  /* =========================
   * Apply theme & effects
   * ========================= */
  let lastPhase = "";

  function apply(force = false) {
    const bgLayer = getBgLayer();
    const field = getField();

    if (!bgLayer) return;

    ensureBgLayerReady(bgLayer);

    const h = getJSTHour();
    const phase = getPhaseByHour(h);

    // 背景（黒固定をしない）
    if (force || phase !== lastPhase) {
      lastPhase = phase;
      const bg = THEMES[phase] || THEMES.day;
      bgLayer.style.background = bg;
      if (field) field.style.background = bg;

      try { window.WB?.emit?.("bg:changed", { phase, hour: h }); } catch {}
    }

    const owned = hasMirrorballOwned();
    const enabled = isMirrorballEnabled();
    const on = owned && enabled;

    // ✅ OFFなら確実に消す（残骸含めて）
    ensureMirrorball(bgLayer, on);
    setSpotEnabled(bgLayer, on, phase);
    startBunnyGlow(on, phase);

    // ✅ “ミラーボール以外から光” の原因になりがちな残骸を毎回掃除（軽量）
    if (!on) {
      cleanupAllMirrorballStuff(document);
      stopBunnyGlow();
    }
  }

  /* =========================
   * Boot / Watch
   * ========================= */
  // 初回（DOMがまだ出来てない環境もあるので少しリトライ）
  let tries = 0;
  const bootTimer = setInterval(() => {
    tries++;
    apply(true);
    if (getBgLayer() || tries >= 80) clearInterval(bootTimer); // 最大約4秒
  }, 50);

  // 時間帯切替
  setInterval(() => apply(false), 60 * 1000);

  // reset / shop toggle 即反映
  const hookWB = () => {
    if (!window.WB?.on) return false;
    window.WB.on("core:reset_partial", () => apply(true));
    window.WB.on("core:ready", () => apply(true));
    window.WB.on("bg:mirrorball_changed", () => apply(true));
    window.WB.on("bg:mirrorball_toggle", () => apply(true));
    return true;
  };
  hookWB();
  setTimeout(hookWB, 300);
})();
