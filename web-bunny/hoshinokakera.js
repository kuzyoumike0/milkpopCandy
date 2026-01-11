// hoshinokakera.js（流れ星 → 星のかけらドロップ → クリックで拾って +50,000コイン）v1.0.0
// ✅ たまに流れ星が横切る（軽量：CSSアニメ中心）
// ✅ 流れ星の終点あたりに assets/tenki/hoshinokakera.png を1個ドロップ
// ✅ かけらをクリックで拾うと「+50,000コイン」
// ✅ WB.se / WB.addCoin / WB.setCoin / WB.coins / #coinValue に自動追従
// ✅ 1個だけ（重複ドロップしない）・リロード後も残る（LS保存）
// ✅ デバッグ：window.HOSHI.dropNow() / window.HOSHI.clear()

(() => {
  "use strict";
  if (window.__HOSHINOKAKERA_V100__) return;
  window.__HOSHINOKAKERA_V100__ = true;

  const CFG = {
    // 置き場所
    FIELD_ID: "field",

    // 画像
    SHARD_SRC: "./assets/tenki/hoshinokakera.png",

    // 報酬
    REWARD_COINS: 50000,

    // 出現率（1秒あたり）
    // 例：0.0008 => 0.08%/sec ≒ 平均約20分に1回
    STAR_CHANCE_PER_SEC: 0.005556,

    // かけらが落ちるまでの演出時間（流れ星アニメ）
    STAR_ANIM_MS: 1300,

    // かけら表示
    SHARD_SIZE: 54,
    SHARD_Z: 260000, // アイテムより上にしたいなら上げる

    // LS
    LS_SHARD: "milkpop_hoshinokakera_state_v1",

    // クリック判定を取りやすく
    HIT_PAD: 10,

    // フェード
    FADE_MS: 180,
  };

  const $ = (q, p = document) => p.querySelector(q);

  const field = document.getElementById(CFG.FIELD_ID);
  if (!field) return;

  // position 保険
  const st = getComputedStyle(field);
  if (st.position === "static") field.style.position = "relative";

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function loadState() {
    try {
      const v = JSON.parse(localStorage.getItem(CFG.LS_SHARD) || "null");
      if (!v || typeof v !== "object") return null;
      return v;
    } catch {
      return null;
    }
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

    // まず addCoin があれば使う（他のモジュールと整合しやすい）
    try {
      if (WB && typeof WB.addCoin === "function") {
        WB.addCoin(d);
        return;
      }
    } catch {}

    // 無ければ現在値 + d
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
  0%{ transform: translate3d(var(--x), var(--y), 0) rotate(-3deg); }
  50%{ transform: translate3d(var(--x), calc(var(--y) - 4px), 0) rotate(3deg); }
  100%{ transform: translate3d(var(--x), var(--y), 0) rotate(-3deg); }
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
#hoshiShardV1.show{
  opacity:1;
  transition: opacity ${CFG.FADE_MS}ms ease;
}
#hoshiShardV1.hide{
  opacity:0;
  transition: opacity ${CFG.FADE_MS}ms ease;
}
#hoshiShardV1 img{
  width:100%;
  height:100%;
  display:block;
  pointer-events:none; /* クリックは親divで取る */
}
`;
    document.head.appendChild(s);
  }

  ensureCss();

  /* =========================
   * Shard DOM
   * ========================= */
  let shardEl = null;

  function removeShardDom() {
    if (shardEl) {
      try { shardEl.remove(); } catch {}
      shardEl = null;
    }
  }

  function ensureShardDom() {
    if (shardEl && shardEl.isConnected) return shardEl;

    const d = document.createElement("div");
    d.id = "hoshiShardV1";
    d.innerHTML = `<img src="${CFG.SHARD_SRC}" alt="星のかけら">`;

    // クリックで拾う
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickupShard();
    });

    // 画像404でも落ちない
    const img = d.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        img.style.opacity = "0";
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
    // 既にあるなら出さない
    if (shardExists()) return false;

    const fr = field.getBoundingClientRect();
    const size = CFG.SHARD_SIZE;

    const xx = clamp(x, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.width - size - CFG.HIT_PAD));
    const yy = clamp(y, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.height - size - CFG.HIT_PAD));

    saveState({ active: true, x: xx, y: yy, t: Date.now() });

    const el = ensureShardDom();
    setShardPos(xx, yy);
    // show
    requestAnimationFrame(() => el.classList.add("show"));
    return true;
  }

  function restoreShardIfNeeded() {
    const st = loadState();
    if (!st || !st.active) return;

    const el = ensureShardDom();
    setShardPos(st.x || 60, st.y || 120);
    requestAnimationFrame(() => el.classList.add("show"));
  }

  function pickupShard() {
    const st = loadState();
    if (!st || !st.active) return;

    const WB = window.WB || null;

    // 報酬
    addCoins(WB, CFG.REWARD_COINS);

    // 消す（演出）
    const el = ensureShardDom();
    el.classList.remove("show");
    el.classList.add("hide");

    clearState();

    setTimeout(() => {
      removeShardDom();
    }, CFG.FADE_MS + 40);

    try { WB?.emit?.("hoshi:kakera", { coins: CFG.REWARD_COINS }); } catch {}
  }

  /* =========================
   * Shooting Star (visual)
   * ========================= */
  let starBusy = false;

  function flyShootingStarAndDrop() {
    if (starBusy) return;
    if (shardExists()) return; // かけらが残ってるならイベント抑制

    starBusy = true;

    const fr = field.getBoundingClientRect();

    // 開始点：右上寄り → 終点：左下寄り
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

    // 終点付近に落とす（画面内に調整）
    const dropX = clamp(x1 + 220, 40, fr.width - CFG.SHARD_SIZE - 40);
    const dropY = clamp(y1 - 40, 60, fr.height - CFG.SHARD_SIZE - 30);

    setTimeout(() => {
      try { star.remove(); } catch {}
      spawnShardAt(dropX, dropY);
      starBusy = false;
    }, CFG.STAR_ANIM_MS + 30);
  }

  /* =========================
   * Main loop
   * ========================= */
  let lastT = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // ランダム発生（かけらが無い時だけ）
    if (!shardExists() && !starBusy) {
      const p = 1 - Math.pow(1 - CFG.STAR_CHANCE_PER_SEC, dt);
      if (Math.random() < p) flyShootingStarAndDrop();
    }

    requestAnimationFrame(tick);
  }

  // 起動
  restoreShardIfNeeded();
  requestAnimationFrame(tick);

  // デバッグAPI
  window.HOSHI = window.HOSHI || {};
  window.HOSHI.dropNow = () => flyShootingStarAndDrop();
  window.HOSHI.spawnShard = (x, y) => spawnShardAt(Number(x) || 80, Number(y) || 120);
  window.HOSHI.clear = () => {
    clearState();
    removeShardDom();
  };

  console.log("[hoshinokakera] ready v1.0.0", {
    img: CFG.SHARD_SRC,
    reward: CFG.REWARD_COINS,
    chancePerSec: CFG.STAR_CHANCE_PER_SEC,
  });
})();
