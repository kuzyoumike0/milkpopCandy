// unchi.js（非module）— ✅通常うんち(unchi.png) / ✅黄金うんち(ougonunchi.png) / ✅個体ゲージ
// ✅WBマージ / ✅BGM.js(SE音量/ミュート)追従 / ✅モーダルを潰さないz-index
(() => {
  "use strict";
  console.log("[unchi.js] LOADED v1.0 (split from app.js)", Date.now());

  /* =========================
   * Config
   * ========================= */
  const ASSETS = {
    unchiImg:   "./assets/unchi.png",
    ougonUnchi: "./assets/ougonunchi.png",
    unchiSE:    "./assets/unchi.mp3",
  };

  // 通常うんち
  const UNCHI_CHARGE_MAX = 100;
  const UNCHI_CHARGE_PER_SEC = 0.198; // 例：満タン約8.4分
  const UNCHI_VALUE = 10;             // クリックで加算（app.js側COIN倍率と整合取りたいなら app.jsのmultで調整）
  const UNCHI_ADULT_ONLY = true;      // 子供中は出さない

  // 黄金うんち（確率スポーン方式が欲しい場合はtrueに）
  const ENABLE_OUGON_RANDOM = false;
  const OUGON_RATE_PER_SEC = 0.005;   // 秒間確率（ENABLE_OUGON_RANDOM=true のとき）
  const OUGON_VALUE = 120;            // クリックで加算

  // SE base（スライダーに追従する前提で1.0）
  const UNCHI_SE_BASE = 1.0;

  // z-index（モーダルより下に）
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
  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found"));
        }
      }, TICK_MS);
    });
  }

  /* =========================
   * SE volume / mute (BGM.js追従)
   * ========================= */
  const LS_KEY_BGM_SETTINGS = "milkpop_bgm_settings_v2";
  const LS_KEY_SE_VOL       = "milkpop_se_volume_v1";

  function loadMuted() {
    try {
      const raw = localStorage.getItem(LS_KEY_BGM_SETTINGS);
      if (!raw) return false;
      const j = JSON.parse(raw);
      return !!j.muted;
    } catch {
      return false;
    }
  }

  function getSEVolume() {
    // 1) WB.getSEVolume
    try {
      if (window.WB && typeof window.WB.getSEVolume === "function") {
        const v = Number(window.WB.getSEVolume());
        if (Number.isFinite(v)) return clamp(v, 0, 1);
      }
    } catch {}

    // 2) shared var
    try {
      const v = Number(window.__milkpopSeVolume);
      if (Number.isFinite(v)) return clamp(v, 0, 1);
    } catch {}

    // 3) LS
    try {
      const raw = localStorage.getItem(LS_KEY_SE_VOL);
      if (raw == null) return 0.85;
      const v = Number(raw);
      return clamp(Number.isFinite(v) ? v : 0.85, 0, 1);
    } catch {
      return 0.85;
    }
  }

  /* =========================
   * Audio
   * ========================= */
  const seUnchi = new Audio(encodeURI(ASSETS.unchiSE));
  try { seUnchi.preload = "auto"; seUnchi.loop = false; } catch {}

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    // app.js / BGM.js 側にも unlock があれば呼ぶ
    try { window.WB?.unlockAudioOnce?.(); } catch {}

    try {
      seUnchi.muted = true;
      seUnchi.currentTime = 0;
      seUnchi.play()
        .then(() => { seUnchi.pause(); seUnchi.currentTime = 0; seUnchi.muted = false; })
        .catch(() => (seUnchi.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playSE(base = 1.0) {
    if (!audioUnlocked) return;
    const muted = loadMuted();
    const vol = muted ? 0 : clamp(base * getSEVolume(), 0, 1);
    try {
      seUnchi.muted = !!muted;
      seUnchi.volume = vol;
      seUnchi.currentTime = 0;
      seUnchi.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * DOM layer
   * ========================= */
  function ensureUnchiLayer(field) {
    let layer = document.getElementById("unchiLayer");
    if (layer) {
      layer.style.zIndex = String(Z.UNCHI_LAYER);
      return layer;
    }
    layer = document.createElement("div");
    layer.id = "unchiLayer";
    layer.style.position = "absolute";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = String(Z.UNCHI_LAYER);
    field.appendChild(layer);
    return layer;
  }

  function injectCssOnce() {
    if (document.getElementById("milkpopUnchiCssV1")) return;
    const st = document.createElement("style");
    st.id = "milkpopUnchiCssV1";
    st.textContent = `
      .unchiDrop{
        width:24px !important; height:24px !important;
        position:absolute;
        user-select:none; -webkit-user-drag:none;
        pointer-events:auto;
        cursor:pointer;
        z-index:${Z.UNCHI_DROP};
      }
      .ougonunchiDrop{
        width:26px !important; height:26px !important;
        position:absolute;
        user-select:none; -webkit-user-drag:none;
        pointer-events:auto;
        cursor:pointer;
        z-index:${Z.OUGON_DROP};
      }
    `;
    document.head.appendChild(st);
  }

  /* =========================
   * Physics drop
   * ========================= */
  function groundY(field) {
    const r = field.getBoundingClientRect();
    const h = Math.max(1, field.clientHeight || r.height || 1);
    return h - 60;
  }

  const dropsOnField = [];
  const dropByEl = new WeakMap();

  class BaseDrop {
    constructor({ layer, field, cls, src, x, y }) {
      this.field = field;
      this.layer = layer;

      this.x = x;
      this.y = y;
      this.vx = (Math.random() * 2 - 1) * 120;
      this.vy = -(480 + Math.random() * 260);
      this.gravity = 2200;
      this.bounce  = 0.18 + Math.random() * 0.10;
      this.floor   = groundY(field);

      const el = document.createElement("img");
      el.className = cls;
      el.src = src;
      el.draggable = false;
      el.style.pointerEvents = "auto";
      el.onerror = () => console.warn("[unchi] image load failed:", el.src);
      this.el = el;

      dropByEl.set(el, this);

      el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.collect(); });
      el.addEventListener("click", () => this.collect());

      layer.appendChild(el);
      this.render();
    }

    render() {
      this.el.style.left = `${this.x}px`;
      this.el.style.top  = `${this.y}px`;
    }

    update(dt) {
      this.floor = groundY(this.field);
      this.vy += this.gravity * dt;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;

      if (this.y >= this.floor) {
        this.y = this.floor;
        if (Math.abs(this.vy) > 260) {
          this.vy = -this.vy * this.bounce;
          this.vx *= 0.70;
        } else {
          this.vy = 0;
          this.vx = 0;
        }
      }
      this.render();
    }

    destroy() {
      try { this.el.remove(); } catch {}
      const idx = dropsOnField.indexOf(this);
      if (idx >= 0) dropsOnField.splice(idx, 1);
    }
  }

  class UnchiDrop extends BaseDrop {
    constructor(opts) {
      super({ ...opts, cls: "unchiDrop", src: ASSETS.unchiImg });
    }
    collect() {
      if (!this.el || !this.el.isConnected) return;
      unlockAudioOnce();

      // コイン加算（WBがあればWB経由で、無ければ自前加算）
      const WB = window.WB;
      if (WB && typeof WB.coins !== "undefined") {
        WB.coins = (Number(WB.coins) || 0) + UNCHI_VALUE;
      } else if (WB && typeof WB.getCoin === "function" && typeof WB.spendCoin === "function") {
        // 予備（通常はcoins setterがある）
      } else {
        // 最後の保険：LSだけ増やす（HUD更新されない可能性はある）
        try {
          const key = (WB && WB.LS && WB.LS.coins) ? WB.LS.coins : "wb_coins_v6";
          const now = parseInt(localStorage.getItem(key) || "0", 10) || 0;
          localStorage.setItem(key, String(now + UNCHI_VALUE));
        } catch {}
      }

      try { WB?.updateHud?.(); } catch {}
      playSE(UNCHI_SE_BASE);
      this.destroy();
    }
  }

  class OugonUnchiDrop extends BaseDrop {
    constructor(opts) {
      super({ ...opts, cls: "ougonunchiDrop", src: ASSETS.ougonUnchi });
    }
    collect() {
      if (!this.el || !this.el.isConnected) return;
      unlockAudioOnce();

      const WB = window.WB;
      if (WB && typeof WB.coins !== "undefined") {
        WB.coins = (Number(WB.coins) || 0) + OUGON_VALUE;
      } else {
        try {
          const key = (WB && WB.LS && WB.LS.coins) ? WB.LS.coins : "wb_coins_v6";
          const now = parseInt(localStorage.getItem(key) || "0", 10) || 0;
          localStorage.setItem(key, String(now + OUGON_VALUE));
        } catch {}
      }

      try { WB?.updateHud?.(); } catch {}
      playSE(1.0);
      this.destroy();
    }
  }

  /* =========================
   * Spawn helper (bunny position)
   * ========================= */
  function spawnNearBunny(field, layer, bunny, type = "normal") {
    try {
      const wrap = bunny?.wrap;
      if (!wrap || !wrap.getBoundingClientRect) return false;

      const r  = wrap.getBoundingClientRect();
      const fr = field.getBoundingClientRect();

      const x = (r.left - fr.left) + r.width  * 0.40 + rand(-10, 10);
      const y = (r.top  - fr.top)  + r.height * 0.88 + rand(-6, 6);

      const drop = (type === "ougon")
        ? new OugonUnchiDrop({ field, layer, x, y })
        : new UnchiDrop({ field, layer, x, y });

      dropsOnField.push(drop);
      return true;
    } catch {
      return false;
    }
  }

  /* =========================
   * Per-bunny gauge (in memory)
   * ========================= */
  const perBunnyGauge = new Map(); // bornAt -> charge 0..100

  function isAdult(bunny) {
    // app.js の実装差を吸収（isBabyがあるならそれを見る）
    if (typeof bunny?.isBaby === "boolean") return !bunny.isBaby;
    // bornAt から推測（app.jsの BABY_DURATION_MS と合わせたい場合はここを調整）
    const BABY_MS = 3 * 60 * 1000;
    const bornAt = Number(bunny?.bornAt) || 0;
    return (Date.now() - bornAt) >= BABY_MS;
  }

  function tickGaugeAndSpawn(WB, field, layer, dt) {
    const list = (typeof WB.getBunnies === "function") ? WB.getBunnies() : (Array.isArray(WB.bunnies) ? WB.bunnies : []);
    if (!Array.isArray(list) || list.length === 0) return;

    for (const b of list) {
      const id = Number(b?.bornAt);
      if (!id) continue;

      if (UNCHI_ADULT_ONLY && !isAdult(b)) continue;

      const cur = clamp(Number(perBunnyGauge.get(id) || 0), 0, UNCHI_CHARGE_MAX);
      let next = cur + UNCHI_CHARGE_PER_SEC * dt;

      // 黄金うんち：秒間確率スポーン（任意）
      if (ENABLE_OUGON_RANDOM && Math.random() < (OUGON_RATE_PER_SEC * dt)) {
        spawnNearBunny(field, layer, b, "ougon");
      }

      if (next >= UNCHI_CHARGE_MAX) {
        next = 0;
        spawnNearBunny(field, layer, b, "normal");
        try { WB.emit?.("bunnyUnchiSpawned", { bornAt: id }); } catch {}
      }

      perBunnyGauge.set(id, next);
    }
  }

  /* =========================
   * Loop
   * ========================= */
  let _field = null;
  let _layer = null;

  let lastTs = performance.now();
  function rafLoop(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    // drops physics
    for (const d of dropsOnField) d.update(dt);

    // gauge/spawn
    try {
      const WB = window.WB;
      if (WB && _field && _layer) tickGaugeAndSpawn(WB, _field, _layer, dt);
    } catch {}

    requestAnimationFrame(rafLoop);
  }

  /* =========================
   * WB Export (merge)
   * ========================= */
  function exportWB() {
    const prev = (window.WB && typeof window.WB === "object") ? window.WB : {};
    const api = {
      // 外部から強制スポーンしたいとき
      spawnUnchi: (bornAt) => {
        const WB = window.WB;
        if (!_field || !_layer || !WB) return false;
        const list = (typeof WB.getBunnies === "function") ? WB.getBunnies() : (Array.isArray(WB.bunnies) ? WB.bunnies : []);
        const t = Number(bornAt);
        const b = list.find(x => Number(x?.bornAt) === t);
        if (!b) return false;
        return spawnNearBunny(_field, _layer, b, "normal");
      },
      spawnOugonUnchi: (bornAt) => {
        const WB = window.WB;
        if (!_field || !_layer || !WB) return false;
        const list = (typeof WB.getBunnies === "function") ? WB.getBunnies() : (Array.isArray(WB.bunnies) ? WB.bunnies : []);
        const t = Number(bornAt);
        const b = list.find(x => Number(x?.bornAt) === t);
        if (!b) return false;
        return spawnNearBunny(_field, _layer, b, "ougon");
      },
      // ゲージ確認（デバッグ用）
      getUnchiGauge: (bornAt) => clamp(Number(perBunnyGauge.get(Number(bornAt)) || 0), 0, UNCHI_CHARGE_MAX),
      // 音量スライダー追従のため公開
      seUnchi,
      unlockAudioOnce,
    };

    const next = Object.assign({}, prev);
    next.unchi = Object.assign({}, (prev.unchi || {}), api);

    window.WB = next;
  }

  /* =========================
   * Boot
   * ========================= */
  waitForWB()
    .then((WB) => {
      injectCssOnce();

      const field = WB.field || document.getElementById("field");
      if (!field) throw new Error("field not found");

      // fieldがstaticだとレイヤーが飛ぶので保険
      const cs = getComputedStyle(field);
      if (cs.position === "static") field.style.position = "relative";

      _field = field;
      _layer = ensureUnchiLayer(field);

      exportWB();

      // BGM.js が registerSE を持ってるなら登録（UFOと同じくスライダー追従させる）
      try { WB.bgm?.registerSE?.(seUnchi); } catch {}

      // ループ開始
      requestAnimationFrame(rafLoop);

      console.log("[unchi.js] ready");
    })
    .catch((e) => {
      console.warn("[unchi.js] WB wait failed:", e?.message || e);
    });
})();
