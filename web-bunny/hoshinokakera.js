// hoshinokakera.js（流れ星 → 星のかけらドロップ → クリックで拾って +50,000コイン）v1.0.2
// ✅ window.HOSHI を“必ず”最初に生やす（fieldが無くても HOSHI is not defined にならない）
// ✅ 実行確認ログを最初に出す（読み込みできてるか即わかる）
// ✅ field が後から出るケースにも対応（見つかるまで待機）
// ✅ 画像URL解決 / LS復元 / 404検知は v1.0.1 同等

(() => {
  "use strict";

  // ===== 必ず最初に作る：これで「HOSHI is not defined」は消える =====
  window.HOSHI = window.HOSHI || {};
  window.HOSHI.__ver = "1.0.2";

  // “このファイルが実行されているか” を確実に判定できるログ
  console.log("[hoshinokakera] BOOT v1.0.2", { baseURI: document.baseURI });

  if (window.__HOSHINOKAKERA_V102__) {
    console.warn("[hoshinokakera] already inited v1.0.2; skip");
    return;
  }
  window.__HOSHINOKAKERA_V102__ = true;

  const CFG = {
    FIELD_ID: "field",
    SHARD_SRC: "./assets/tenki/hoshinokakera.png",
    REWARD_COINS: 50000,
    STAR_CHANCE_PER_SEC: 0.005556,
    STAR_ANIM_MS: 1300,
    SHARD_SIZE: 54,
    SHARD_Z: 260000,
    LS_SHARD: "milkpop_hoshinokakera_state_v1",
    HIT_PAD: 10,
    FADE_MS: 180,
  };

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function resolveUrl(src) {
    try { return new URL(src, document.baseURI).href; } catch { return src; }
  }
  const SHARD_URL = resolveUrl(CFG.SHARD_SRC);

  function loadState() {
    try {
      const v = JSON.parse(localStorage.getItem(CFG.LS_SHARD) || "null");
      if (!v || typeof v !== "object") return null;
      return v;
    } catch { return null; }
  }
  function saveState(v) {
    try { localStorage.setItem(CFG.LS_SHARD, JSON.stringify(v)); } catch {}
  }
  function clearState() {
    try { localStorage.removeItem(CFG.LS_SHARD); } catch {}
  }

  /* =========================
   * Coins helpers
   * ========================= */
  function readCoinsDirect(WB) {
    try { if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try {
      if (WB && ("coins" in WB)) {
        const v = Number(WB.coins);
        if (Number.isFinite(v)) return v;
      }
    } catch {}
    const el = document.getElementById("coinValue");
    return el ? (Number(el.textContent) || 0) : 0;
  }

  function setCoinsDirect(WB, v) {
    const val = Math.max(0, Math.floor(Number(v) || 0));
    try { if (WB && typeof WB.setCoin === "function") WB.setCoin(val); } catch {}
    try { if (WB && ("coins" in WB)) WB.coins = val; } catch {}
    try { localStorage.setItem("wb_coins_v6", String(val)); } catch {}
    const el = document.getElementById("coinValue");
    if (el) el.textContent = String(val);
    try { WB?.emit?.("coinChanged", val); } catch {}
  }

  function addCoins(WB, delta) {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;
    try {
      if (WB && typeof WB.addCoin === "function") { WB.addCoin(d); return; }
    } catch {}
    const cur = readCoinsDirect(WB);
    setCoinsDirect(WB, cur + d);
  }

  /* =========================
   * CSS
   * ========================= */
  function ensureCss() {
    if (document.getElementById("hoshiKakeraCssV1")) return;
    const s = document.createElement("style");
    s.id = "hoshiKakeraCssV1";
    s.textContent = `
@keyframes hoshiStarFlyV1{
  0%   { transform: translate3d(var(--x0), var(--y0), 0) rotate(-18deg); opacity:0; }
  10%  { opacity:1; }
  100% { transform: translate3d(var(--x1), var(--y1), 0) rotate(-18deg); opacity:0; }
}
@keyframes hoshiShardBobV1{
  0%{ transform: translate3d(var(--x), var(--y), 0) rotate(-3deg) scale(1); }
  50%{ transform: translate3d(var(--x), calc(var(--y) - 4px), 0) rotate(3deg) scale(1.02); }
  100%{ transform: translate3d(var(--x), var(--y), 0) rotate(-3deg) scale(1); }
}
#hoshiStarV1{
  position:absolute;
  left:0; top:0;
  width:160px; height:4px;
  pointer-events:none;
  z-index:${CFG.SHARD_Z - 1};
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.95), rgba(255,255,255,0));
  filter:drop-shadow(0 6px 10px rgba(255,255,255,.35));
  border-radius:999px;
  opacity:0;
  animation:hoshiStarFlyV1 ${CFG.STAR_ANIM_MS}ms ease-out forwards;
  will-change:transform, opacity;
}
#hoshiShardV1{
  position:absolute;
  left:0; top:0;
  width:${CFG.SHARD_SIZE}px;
  height:${CFG.SHARD_SIZE}px;
  z-index:${CFG.SHARD_Z};
  cursor:pointer;
  user-select:none;
  -webkit-user-drag:none;
  touch-action: manipulation;
  will-change: transform, opacity;
  opacity:0;
}
#hoshiShardV1.show{ opacity:1; transition: opacity ${CFG.FADE_MS}ms ease; }
#hoshiShardV1.hide{ opacity:0; transition: opacity ${CFG.FADE_MS}ms ease; }
#hoshiShardV1 img{ width:100%; height:100%; display:block; pointer-events:none; }
`;
    document.head.appendChild(s);
  }
  ensureCss();

  /* =========================
   * Field wait (重要)
   * ========================= */
  let field = null;

  function getField() {
    const el = document.getElementById(CFG.FIELD_ID);
    if (!el) return null;
    const st = getComputedStyle(el);
    if (st.position === "static") el.style.position = "relative";
    return el;
  }

  function waitForField(maxMs = 8000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const el = getField();
        if (el) { clearInterval(t); resolve(el); return; }
        if (Date.now() - start > maxMs) {
          clearInterval(t);
          reject(new Error("field not found"));
        }
      }, 50);
    });
  }

  /* =========================
   * Shard DOM
   * ========================= */
  let shardEl = null;

  function removeShardDom() {
    if (shardEl) { try { shardEl.remove(); } catch {} shardEl = null; }
  }

  function ensureShardDom() {
    if (shardEl && shardEl.isConnected) return shardEl;

    const d = document.createElement("div");
    d.id = "hoshiShardV1";
    d.innerHTML = `<img src="${SHARD_URL}" alt="星のかけら">`;

    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickupShard();
    });

    const img = d.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        console.warn("[hoshinokakera] image load error:", SHARD_URL, "baseURI=", document.baseURI);
        img.style.display = "none";
        d.style.width = `${CFG.SHARD_SIZE}px`;
        d.style.height = `${CFG.SHARD_SIZE}px`;
        d.style.borderRadius = "999px";
        d.style.background = "radial-gradient(circle, rgba(255,255,255,.9), rgba(255,255,255,0) 65%)";
        d.style.filter = "drop-shadow(0 10px 18px rgba(255,255,255,.45))";
      });
    }

    field.appendChild(d);
    shardEl = d;
    return shardEl;
  }

  function setShardPos(x, y) {
    const el = ensureShardDom();
    el.style.setProperty("--x", `${Math.round(x)}px`);
    el.style.setProperty("--y", `${Math.round(y)}px`);
    el.style.animation = `hoshiShardBobV1 1.8s ease-in-out infinite`;
  }

  function shardExists() {
    const st = loadState();
    return !!(st && st.active);
  }

  function spawnShardAt(x, y) {
    if (!field) return false;
    if (shardExists()) return false;

    const fr = field.getBoundingClientRect();
    const size = CFG.SHARD_SIZE;

    const xx = clamp(x, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.width - size - CFG.HIT_PAD));
    const yy = clamp(y, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.height - size - CFG.HIT_PAD));

    saveState({ active: true, x: xx, y: yy, t: Date.now() });

    const el = ensureShardDom();
    setShardPos(xx, yy);
    requestAnimationFrame(() => el.classList.add("show"));

    console.log("[hoshinokakera] spawned", { x: xx, y: yy, img: SHARD_URL });
    return true;
  }

  function restoreShardIfNeeded(force = false) {
    const st = loadState();
    if (!st || !st.active) return false;
    if (!field) return false;

    const need = force || !(shardEl && shardEl.isConnected);
    if (!need) return true;

    const el = ensureShardDom();
    setShardPos(st.x || 60, st.y || 120);
    requestAnimationFrame(() => el.classList.add("show"));

    console.log("[hoshinokakera] restored from LS", { x: st.x, y: st.y, t: st.t, img: SHARD_URL });
    return true;
  }

  function pickupShard() {
    const st = loadState();
    if (!st || !st.active) return;

    const WB = window.WB || null;
    addCoins(WB, CFG.REWARD_COINS);

    const el = ensureShardDom();
    el.classList.remove("show");
    el.classList.add("hide");

    clearState();
    setTimeout(() => removeShardDom(), CFG.FADE_MS + 40);

    try { WB?.emit?.("hoshi:kakera", { coins: CFG.REWARD_COINS }); } catch {}
  }

  /* =========================
   * Shooting Star
   * ========================= */
  let starBusy = false;

  function flyShootingStarAndDrop() {
    if (!field) return;
    if (starBusy) return;
    if (shardExists()) { restoreShardIfNeeded(true); return; }

    starBusy = true;

    const fr = field.getBoundingClientRect();
    const x0 = fr.width + 120;
    const y0 = 20 + Math.random() * (fr.height * 0.25);
    const x1 = -180;
    const y1 = y0 + (fr.height * (0.25 + Math.random() * 0.35));

    const star = document.createElement("div");
    star.id = "hoshiStarV1";
    star.style.setProperty("--x0", `${Math.round(x0)}px`);
    star.style.setProperty("--y0", `${Math.round(y0)}px`);
    star.style.setProperty("--x1", `${Math.round(x1)}px`);
    star.style.setProperty("--y1", `${Math.round(y1)}px`);
    field.appendChild(star);

    const dropX = clamp(x1 + 220, 40, fr.width - CFG.SHARD_SIZE - 40);
    const dropY = clamp(y1 - 40, 60, fr.height - CFG.SHARD_SIZE - 30);

    setTimeout(() => {
      try { star.remove(); } catch {}
      const ok = spawnShardAt(dropX, dropY);
      if (!ok) restoreShardIfNeeded(true);
      starBusy = false;
    }, CFG.STAR_ANIM_MS + 30);
  }

  /* =========================
   * Loop
   * ========================= */
  let lastT = performance.now();
  let restoreCool = 0;

  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    restoreCool += dt;
    if (restoreCool >= 1.0) {
      restoreCool = 0;
      if (shardExists()) restoreShardIfNeeded(false);
    }

    if (!shardExists() && !starBusy) {
      const p = 1 - Math.pow(1 - CFG.STAR_CHANCE_PER_SEC, dt);
      if (Math.random() < p) flyShootingStarAndDrop();
    }

    requestAnimationFrame(tick);
  }

  /* =========================
   * Public API（最初から存在してる）
   * ========================= */
  window.HOSHI.dropNow = () => flyShootingStarAndDrop();
  window.HOSHI.spawnShard = (x, y) => spawnShardAt(Number(x) || 80, Number(y) || 120);
  window.HOSHI.clear = () => { clearState(); removeShardDom(); };
  window.HOSHI.debug = () => {
    console.log("[hoshinokakera] debug", {
      ver: window.HOSHI.__ver,
      baseURI: document.baseURI,
      shardSrc: CFG.SHARD_SRC,
      shardUrl: SHARD_URL,
      field: !!field,
      state: loadState(),
      dom: !!(shardEl && shardEl.isConnected),
      shardExists: shardExists(),
    });
  };

  // ===== init（fieldが取れるまで待つ） =====
  waitForField(8000).then((el) => {
    field = el;
    console.log("[hoshinokakera] field ready", field);

    // 起動
    restoreShardIfNeeded(true);
    requestAnimationFrame(tick);

    console.log("[hoshinokakera] ready v1.0.2", {
      img: SHARD_URL,
      reward: CFG.REWARD_COINS,
      chancePerSec: CFG.STAR_CHANCE_PER_SEC,
    });
  }).catch((err) => {
    console.warn("[hoshinokakera] init failed:", err?.message || err);
    // fieldが無いページでも HOSHI.debug() はできる
  });
})();
