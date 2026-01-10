// unchi.js（非module）— クリックで消滅 / 上限N個で古い順に消去
(() => {
  "use strict";
  console.log("[unchi.js] LOADED v1.2 (cap & click-priority)", Date.now());

  /* =========================
   * Config
   * ========================= */
  const ASSETS = {
    unchiImg:   "./assets/unchi.png",
    ougonUnchi: "./assets/ougonunchi.png",
    unchiSE:    "./assets/unchi.mp3",
  };

  const UNCHI_CHARGE_MAX = 100;
  const UNCHI_CHARGE_PER_SEC = 0.198;
  const UNCHI_VALUE = 10;

  const ENABLE_OUGON_RANDOM = true;
  const OUGON_RATE_PER_SEC = 0.002;
  const OUGON_VALUE = 120;

  const UNCHI_SE_BASE = 1.0;

  // ✅ 上限（通常＋黄金 合計）
  const MAX_UNCHI_ON_FIELD = 20;

  const Z = {
    UNCHI_LAYER: 120,
    UNCHI_DROP:  121,
    OUGON_DROP:  122,
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);

  /* =========================
   * Wait WB
   * ========================= */
  function waitForWB() {
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (window.WB) {
          clearInterval(t);
          resolve(window.WB);
        }
      }, 50);
    });
  }

  /* =========================
   * Audio (SE slider follow)
   * ========================= */
  const seUnchi = new Audio(encodeURI(ASSETS.unchiSE));
  seUnchi.preload = "auto";

  function playSE() {
    try {
      const v = window.WB?.getSEVolume?.() ?? 0.85;
      seUnchi.volume = clamp(v * UNCHI_SE_BASE, 0, 1);
      seUnchi.currentTime = 0;
      seUnchi.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * DOM / CSS
   * ========================= */
  function injectCssOnce() {
    if (document.getElementById("unchiCssV2")) return;
    const st = document.createElement("style");
    st.id = "unchiCssV2";
    st.textContent = `
      .unchiDrop,.ougonunchiDrop{
        width:24px;height:24px;
        position:absolute;
        pointer-events:auto;
        cursor:pointer;
        user-select:none;
      }
      .ougonunchiDrop{ width:26px;height:26px; }
    `;
    document.head.appendChild(st);
  }

  function ensureLayer(field) {
    let l = document.getElementById("unchiLayer");
    if (l) return l;
    l = document.createElement("div");
    l.id = "unchiLayer";
    l.style.position = "absolute";
    l.style.inset = "0";
    l.style.pointerEvents = "none";
    l.style.zIndex = Z.UNCHI_LAYER;
    field.appendChild(l);
    return l;
  }

  /* =========================
   * Drop management
   * ========================= */
  const drops = []; // 古い順にpush
  const dropByEl = new WeakMap();

  function enforceCap() {
    while (drops.length > MAX_UNCHI_ON_FIELD) {
      const oldest = drops.shift();
      oldest?.destroy(false); // false = 報酬なし
    }
  }

  class BaseDrop {
    constructor({ layer, field, cls, src, x, y }) {
      this.createdAt = Date.now();
      this.field = field;
      this.layer = layer;

      this.x = x;
      this.y = y;
      this.vx = (Math.random() * 2 - 1) * 120;
      this.vy = -(420 + Math.random() * 240);
      this.gravity = 2200;
      this.bounce  = 0.2;
      this.floor   = field.clientHeight - 60;

      const el = document.createElement("img");
      el.src = src;
      el.className = cls;
      el.draggable = false;
      el.style.pointerEvents = "auto";
      this.el = el;

      dropByEl.set(el, this);

      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.collect();
      });

      layer.appendChild(el);
      this.render();

      drops.push(this);
      enforceCap();
    }

    render() {
      this.el.style.left = `${this.x}px`;
      this.el.style.top  = `${this.y}px`;
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y >= this.floor) {
        this.y = this.floor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
          this.vx *= 0.7;
        } else {
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }

    destroy(byClick) {
      try { this.el.remove(); } catch {}
      const i = drops.indexOf(this);
      if (i >= 0) drops.splice(i, 1);
    }
  }

  class UnchiDrop extends BaseDrop {
    constructor(o) {
      super({ ...o, cls: "unchiDrop", src: ASSETS.unchiImg });
    }
    collect() {
      window.WB.coins += UNCHI_VALUE;
      window.WB.updateHud?.();
      playSE();
      this.destroy(true);
    }
  }

  class OugonUnchiDrop extends BaseDrop {
    constructor(o) {
      super({ ...o, cls: "ougonunchiDrop", src: ASSETS.ougonUnchi });
    }
    collect() {
      window.WB.coins += OUGON_VALUE;
      window.WB.updateHud?.();
      playSE();
      this.destroy(true);
    }
  }

  function spawnNearBunny(field, layer, b, type) {
    const r = b.wrap.getBoundingClientRect();
    const fr = field.getBoundingClientRect();
    const x = (r.left - fr.left) + r.width * 0.4 + rand(-10, 10);
    const y = (r.top  - fr.top ) + r.height * 0.9;

    return type === "ougon"
      ? new OugonUnchiDrop({ field, layer, x, y })
      : new UnchiDrop({ field, layer, x, y });
  }

  /* =========================
   * Gauge loop
   * ========================= */
  const gauge = new Map();

  function tick(WB, field, layer, dt) {
    for (const b of WB.getBunnies()) {
      const id = b.bornAt;
      if (!gauge.has(id)) gauge.set(id, 0);

      let v = gauge.get(id) + UNCHI_CHARGE_PER_SEC * dt;

      if (ENABLE_OUGON_RANDOM && Math.random() < OUGON_RATE_PER_SEC * dt) {
        spawnNearBunny(field, layer, b, "ougon");
      }

      if (v >= UNCHI_CHARGE_MAX) {
        v = 0;
        spawnNearBunny(field, layer, b, "normal");
      }
      gauge.set(id, v);
    }
  }

  /* =========================
   * Boot
   * ========================= */
  waitForWB().then(WB => {
    injectCssOnce();
    const field = WB.field;
    const layer = ensureLayer(field);

    let last = performance.now();
    function loop(t) {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      drops.forEach(d => d.update(dt));
      tick(WB, field, layer, dt);

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    console.log("[unchi.js] ready");
  });
})();
