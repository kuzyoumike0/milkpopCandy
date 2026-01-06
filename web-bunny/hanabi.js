// hanabi.js
// クリック（ボタン）でコインを消費して、背景に花火を出す（Canvas）
// - #coinValue を所持コインとして使用
// - #field 内に canvas を敷いて「背景」に出す（pointer-events:none）
// - ボタンが無ければ右下に自動生成（#hanabiBtn）

(() => {
  const COST = 200; // 花火1回のコスト（必要なら変更）
  const BTN_ID = "hanabiBtn";
  const CANVAS_ID = "hanabiCanvasBg";
  const TOAST_ID = "hanabiToast";

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * Coin HUD
   * ========================= */
  function getCoin() {
    const el = $("#coinValue");
    return el ? Number(el.textContent) || 0 : 0;
  }
  function setCoin(v) {
    const el = $("#coinValue");
    if (el) el.textContent = String(Math.max(0, Math.floor(v)));
  }

  /* =========================
   * Toast
   * ========================= */
  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById(TOAST_ID);
    if (!t) {
      t = document.createElement("div");
      t.id = TOAST_ID;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove("hide");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hide"), 1500);
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("hanabiStyleV1")) return;
    const s = document.createElement("style");
    s.id = "hanabiStyleV1";
    s.textContent = `
#${BTN_ID}{
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147482000;
  border: none;
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 900;
  cursor: pointer;
  background: rgba(255,255,255,.95);
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
}
#${BTN_ID}:active{ transform: translateY(1px); }

#${TOAST_ID}{
  position: fixed;
  left: 50%;
  top: 18px;
  transform: translateX(-50%);
  z-index: 2147483000;
  background: rgba(0,0,0,.68);
  color: #fff;
  padding: 10px 14px;
  border-radius: 14px;
  font-weight: 900;
  opacity: 1;
  transition: opacity 220ms ease, transform 220ms ease;
  pointer-events: none;
}
#${TOAST_ID}.hide{
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}

#${CANVAS_ID}{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0; /* 背景 */
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Canvas setup (background)
   * ========================= */
  let canvas, ctx, field, dpr = 1;
  let W = 0, H = 0;

  function ensureCanvas() {
    field = document.getElementById("field") || document.body;

    // 背景に敷くため、field を relative に（既存が違っても壊れにくいよう最低限）
    const cs = getComputedStyle(field);
    if (cs.position === "static") field.style.position = "relative";

    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = CANVAS_ID;
      field.insertBefore(canvas, field.firstChild); // 一番下（背景）に
    }
    ctx = canvas.getContext("2d");

    // bunnyLayer/coinLayer が背景より上に来るよう軽く補助（既に上なら影響なし）
    const bunnyLayer = document.getElementById("bunnyLayer");
    const coinLayer = document.getElementById("coinLayer");
    if (bunnyLayer) {
      const bcs = getComputedStyle(bunnyLayer);
      if (bcs.position === "static") bunnyLayer.style.position = "relative";
      bunnyLayer.style.zIndex = "2";
    }
    if (coinLayer) {
      const ccs = getComputedStyle(coinLayer);
      if (ccs.position === "static") coinLayer.style.position = "relative";
      coinLayer.style.zIndex = "3";
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas || !field) return;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = field.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width));
    H = Math.max(1, Math.floor(r.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* =========================
   * Fireworks particle system
   * ========================= */
  const particles = [];
  let rafId = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnBurst(x, y, power = 1) {
    // 1発の花火：粒子
    const count = Math.floor(120 * power);
    const baseSpd = rand(2.8, 4.6) * power;
    const grav = 0.05 * power;

    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = baseSpd * rand(0.55, 1.1);
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: rand(48, 78),     // frames
        age: 0,
        grav,
        drag: 0.985,
        size: rand(1.2, 2.2) * power,
        // 色は指定しない縛りは「チャート」向けなので、ここは自由にやる（ただし派手に）
        hue: rand(0, 360),
        tw: Math.random() < 0.18, // きらめき
      });
    }

    // 中心の閃光（薄い輪）
    particles.push({
      ring: true,
      x, y,
      r: 0,
      vr: rand(5, 8) * power,
      life: 20,
      age: 0
    });

    startLoop();
  }

  function startLoop() {
    if (rafId) return;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      step();
    };
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function step() {
    if (!ctx || !canvas) return;

    // ほんのり残像
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);

    // 発光合成
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;

      if (p.ring) {
        const t = p.age / p.life;
        const alpha = Math.max(0, 1 - t);
        p.r += p.vr;

        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${0.25 * alpha})`;
        ctx.lineWidth = 2;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();

        if (p.age >= p.life) particles.splice(i, 1);
        continue;
      }

      // 物理
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.grav;
      p.x += p.vx;
      p.y += p.vy;

      const t = p.age / p.life;
      const alpha = Math.max(0, 1 - t);

      // きらめき
      const sparkle = p.tw ? (0.7 + 0.3 * Math.sin(p.age * 0.6)) : 1;

      // 描画
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * sparkle})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // 範囲外 or 寿命
      if (p.age >= p.life || p.x < -50 || p.x > W + 50 || p.y < -80 || p.y > H + 80) {
        particles.splice(i, 1);
      }
    }

    if (particles.length === 0) {
      // 透明化して停止（負荷軽減）
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      stopLoop();
    }
  }

  /* =========================
   * UI / Action
   * ========================= */
  function ensureButton() {
    let btn = document.getElementById(BTN_ID);

    if (!btn) {
      // 既存に「花火」ボタンがあるならそれを使う（IDが違っても拾う）
      btn =
        document.getElementById("hanabi")
        || [...document.querySelectorAll("button")].find(b => (b.textContent || "").includes("花火"))
        || null;

      if (!btn) {
        btn = document.createElement("button");
        btn.id = BTN_ID;
        btn.type = "button";
        btn.textContent = `🎆 花火（-${COST}）`;
        document.body.appendChild(btn);
      } else {
        // 既存ボタンを使う場合もラベルにコストを添える（邪魔なら消してOK）
        btn.id = BTN_ID;
        if (!btn.textContent.includes("花火")) btn.textContent = "🎆 花火";
      }
    }

    btn.addEventListener("click", () => {
      const have = getCoin();
      if (have < COST) {
        toast("コインが足りない…！");
        return;
      }
      setCoin(have - COST);

      // 背景に花火：画面上方〜中央にランダム
      ensureCanvas();

      const bursts = 3 + Math.floor(Math.random() * 2); // 3〜4発
      for (let i = 0; i < bursts; i++) {
        const x = rand(W * 0.15, W * 0.85);
        const y = rand(H * 0.12, H * 0.45);
        const power = rand(0.9, 1.35);
        setTimeout(() => spawnBurst(x, y, power), i * 220);
      }

      toast(`🎆 花火！ (-${COST}🪙)`);
    });
  }

  /* =========================
   * Boot
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    ensureButton();
    // 先にCanvas作る必要はない（クリック時に生成）
  });
})();
