// oyatu.js（HUD追加：モーダルで選択 + 連打で落とす + 落とす時SE + 60msクール
//          + ✅うさぎが取りに行って食べる（WB.oyatu.seekTo）
//          + ✅食べたら消える（TTL/到達判定/フェイルセーフ）
//          + 拾うと「次のクリック2倍」）v1.5.0
//
// ✅ HUDに #oyatuBtn があれば押してモーダルを開く
// ✅ モーダルでおやつ画像を選択（ランダムも可）
// ✅ 「落とす」ボタンを連打で複数個落とせる（同時最大数あり）
// ✅ 落とした瞬間にSE（BGM.jsのSEスライダー追従）
// ✅ SE最短間隔クールダウン（デフォ60ms）
// ✅ うさぎが近づいたら自動で「食べて消える」→ バフ付与（次のクリック2倍）
// ✅ クリックで拾う（手動）も可能（同じくバフ付与）
// ✅ coinChanged / 監視フォールバック両対応
// ✅ LS：バフ状態のみ保存（ドロップは保存しない＝軽量）
//
// ✅ おやつドロップにコイン消費（WB.spendCoin があればそれ優先）
// - 1個落とすごとに COST_PER_DROP を消費（連打＝連続消費）
// - 不足なら落とさない＆トースト
//
// 画像は assets/oyatu/ に置いてください（このパスで参照）
// - ./assets/oyatu/candy_candycane_halloween_orange.png
// - ./assets/oyatu/wataame_white.png
// - ./assets/oyatu/cupcake_cream_pink_choco.png
// - ./assets/oyatu/orange_cut.png
//
// SEはここに置く（添付SE）
// - ./assets/se/Onoma-Pop04-1(High-Dry).mp3
//
// ✅ 重要：取りに行く動きは app.js に入れた WB.oyatu.seekTo を使う（transform喧嘩しない）
//
// デバッグ：window.OYATU.open() / window.OYATU.dropNow() / window.OYATU.clearBuff() / window.OYATU.clearAll()

(() => {
  "use strict";
  if (window.__OYATU_V150__) return;
  window.__OYATU_V150__ = true;

  const CFG = {
    FIELD_ID: "field",
    HUD_BTN_ID: "oyatuBtn",

    // ✅ 1個落とすコスト
    COST_PER_DROP: 35,

    // おやつ画像（4つ）
    OYATU_LIST: [
      { id: "candy",   name: "キャンディケイン", src: "./assets/oyatu/candy_candycane_halloween_orange.png" },
      { id: "wataame", name: "わたあめ",         src: "./assets/oyatu/wataame_white.png" },
      { id: "cupcake", name: "カップケーキ",     src: "./assets/oyatu/cupcake_cream_pink_choco.png" },
      { id: "orange",  name: "オレンジ",         src: "./assets/oyatu/orange_cut.png" },
    ],

    // 同時に画面へ存在できる最大数（暴走ガード）
    MAX_DROPS_ON_FIELD: 10,

    // 落下演出
    FALL_MS: 820,

    // 表示
    SIZE: 44,      // ✅ 少し小さく
    Z: 260000,

    // ✅ 落とした瞬間のSE（添付SE）
    OYATU_DROP_SE_SRC: "./assets/se/Onoma-Pop04-1(High-Dry).mp3",
    OYATU_DROP_SE_BASE: 1.0,

    // ✅ SE最短間隔（ms）
    DROP_SE_COOLDOWN_MS: 60,

    // ✅ うさぎが食べる判定
    // - app.js の WB.oyatu.defaults.eatDist があればそれ優先
    EAT_DIST_PX: 48,
    // - 「取りに行く」指示の頻度（軽量）
    SEEK_TICK_MS: 180,
    // - seekTo に渡す
    SEEK_OPTS: { speed: 130, radius: 320, durationMs: 1600, yMul: 0.55 },

    // ✅ おやつの寿命（消えない対策）
    DROP_TTL_MS: 45_000,  // 45秒で自然消滅（食べ損ねても残らない）

    // バフ
    BUFF_WINDOW_MS: 30_000,      // 30秒
    COINCLICK_WINDOW_MS: 320,    // うさぎクリック→coin増加まで猶予
    LS_BUFF: "milkpop_oyatu_buff_v2",

    // ふわっと消す
    FADE_MS: 160,
  };

  const field = document.getElementById(CFG.FIELD_ID);
  if (!field) return;
  if (getComputedStyle(field).position === "static") field.style.position = "relative";

  const $ = (q, p = document) => p.querySelector(q);
  const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function loadJson(key, def = null) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return (v ?? def);
    } catch {
      return def;
    }
  }
  function saveJson(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }
  function rm(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  /* =========================
   * Coins helpers（read/spend）
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

  function spendCoins(WB, cost) {
    const c = Math.max(0, Math.floor(Number(cost) || 0));
    if (c <= 0) return true;

    try {
      if (WB && typeof WB.spendCoin === "function") {
        return !!WB.spendCoin(c);
      }
    } catch {}

    const cur = readCoinsDirect(WB);
    if (cur < c) return false;
    setCoinsDirect(WB, cur - c);
    return true;
  }

  /* =========================
   * Toast（軽量）
   * ========================= */
  function ensureToastCss() {
    if (document.getElementById("oyatuToastCssV1")) return;
    const s = document.createElement("style");
    s.id = "oyatuToastCssV1";
    s.textContent = `
#oyatuToastV1{
  position:fixed;
  left:50%;
  top:14%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  background:rgba(255,255,255,.97);
  border-radius:16px;
  padding:10px 14px;
  box-shadow:0 18px 50px rgba(0,0,0,.22);
  font-weight:1000;
  font-size:13px;
  opacity:0;
  animation:oyatuToastIn .18s ease-out forwards, oyatuToastOut .28s ease-in forwards;
  animation-delay:0ms, 1.8s;
  max-width:min(520px, 92vw);
  text-align:center;
}
@keyframes oyatuToastIn{
  from{ opacity:0; transform:translate(-50%,-70%); }
  to  { opacity:1; transform:translate(-50%,-50%); }
}
@keyframes oyatuToastOut{
  from{ opacity:1; transform:translate(-50%,-50%); }
  to  { opacity:0; transform:translate(-50%,-35%); }
}
`;
    document.head.appendChild(s);
  }
  function toast(msg) {
    ensureToastCss();
    const old = document.getElementById("oyatuToastV1");
    try { old?.remove(); } catch {}
    const el = document.createElement("div");
    el.id = "oyatuToastV1";
    el.textContent = String(msg || "");
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 2300);
  }

  /* =========================
   * SE（BGM.jsがあれば追従） + 60msクールダウン
   * ========================= */
  let __oyatuDropFallback = null;
  let __lastDropSeAt = 0;

  function playDropSE() {
    const now = Date.now();
    if (__lastDropSeAt && (now - __lastDropSeAt) < CFG.DROP_SE_COOLDOWN_MS) return;
    __lastDropSeAt = now;

    const WB = window.WB || null;

    try {
      if (WB?.se?.play) {
        WB.se.play("oyatu_drop", CFG.OYATU_DROP_SE_SRC, CFG.OYATU_DROP_SE_BASE);
        return;
      }
    } catch {}

    try {
      const a = new Audio();
      a.preload = "auto";
      a.src = encodeURI(CFG.OYATU_DROP_SE_SRC);
      a.volume = 0.9;
      a.play().catch(() => {});
      __oyatuDropFallback = a;
    } catch {}
  }

  /* =========================
   * CSS
   * ========================= */
  function ensureCss() {
    if (document.getElementById("oyatuCssV15")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV15";
    s.textContent = `
@keyframes oyatuFallV15{
  0%{ transform:translate3d(var(--x), -90px, 0) rotate(-10deg); opacity:0; }
  12%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV15{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 5px), 0) rotate(3deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
}
.oyatuDropV15{
  position:absolute;
  left:0; top:0;
  width:${CFG.SIZE}px;
  height:${CFG.SIZE}px;
  z-index:${CFG.Z};
  cursor:pointer;
  user-select:none;
  -webkit-user-drag:none;
  touch-action: manipulation;
  will-change: transform, opacity;
  opacity:0;
}
.oyatuDropV15.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV15.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV15 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}

/* バフ表示（右下） */
#oyatuBuffBadgeV15{
  position:fixed;
  right:10px;
  bottom:10px;
  z-index:2147483647;
  background:rgba(255,255,255,.92);
  border-radius:14px;
  padding:8px 10px;
  box-shadow:0 14px 30px rgba(0,0,0,.18);
  font-weight:1000;
  font-size:12px;
  display:none;
  user-select:none;
  pointer-events:none;
}

/* モーダル */
#oyatuModalV15{ position:fixed; inset:0; z-index:2147483647; display:none; }
#oyatuModalV15 .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#oyatuModalV15 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(520px, 92vw);
  max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#oyatuModalV15 .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#oyatuModalV15 .title{ font-weight:1000; letter-spacing:.02em; }
#oyatuModalV15 .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;
}
#oyatuModalV15 .body{ padding:12px 14px 14px; overflow:auto; }
#oyatuModalV15 .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
#oyatuModalV15 .pick{
  border:2px solid rgba(0,0,0,.10);
  border-radius:14px; padding:10px;
  display:flex; align-items:center; gap:10px;
  background:#fff;
  cursor:pointer;
  user-select:none;
}
#oyatuModalV15 .pick.on{ border-color: rgba(255,120,180,.65); box-shadow:0 10px 22px rgba(0,0,0,.08); }
#oyatuModalV15 .pick img{ width:40px; height:40px; image-rendering:pixelated; }
#oyatuModalV15 .pick .name{ font-weight:1000; font-size:12px; opacity:.9; }
#oyatuModalV15 .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; }
#oyatuModalV15 .btn{
  border:none; border-radius:12px;
  padding:10px 12px; font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#oyatuModalV15 .btn.primary{ background:#ffd6e7; }
#oyatuModalV15 .hint{ font-size:12px; opacity:.78; font-weight:900; line-height:1.35; }
`;
    document.head.appendChild(s);
  }
  ensureCss();

  /* =========================
   * Buff（30秒以内に1回だけ2倍）※拾ったら再付与/延長
   * ========================= */
  function loadBuff() {
    const b = loadJson(CFG.LS_BUFF, null);
    if (!b || typeof b !== "object") return null;
    const until = Number(b.until || 0);
    const used = !!b.used;
    if (!until || !Number.isFinite(until)) return null;
    return { until, used };
  }
  function saveBuff(until, used) { saveJson(CFG.LS_BUFF, { until, used: !!used }); }
  function clearBuff() { rm(CFG.LS_BUFF); }

  let badgeEl = null;
  function ensureBadge() {
    if (badgeEl && badgeEl.isConnected) return badgeEl;
    const d = document.createElement("div");
    d.id = "oyatuBuffBadgeV15";
    document.body.appendChild(d);
    badgeEl = d;
    return d;
  }

  function updateBadge() {
    const b = loadBuff();
    const el = ensureBadge();
    if (!b) { el.style.display = "none"; return; }

    const left = Math.max(0, b.until - Date.now());
    if (left <= 0 || b.used) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.textContent = `🍬 おやつ：次のクリック2倍（残り ${(left / 1000).toFixed(0)}s）`;
  }

  function startBuff() {
    const now = Date.now();
    const cur = loadBuff();
    const until = now + CFG.BUFF_WINDOW_MS;

    if (!cur) saveBuff(until, false);
    else saveBuff(Math.max(cur.until || 0, until), false);

    updateBadge();
  }

  /* =========================
   * Drops 管理（軽量）
   * ========================= */
  let dropSeq = 0;
  const drops = new Map(); // id -> { el, x, y, bornAt, ttlAt, eaten }

  function dropsOnFieldCount() { return drops.size; }

  function pickById(id) {
    if (id === "random") return null;
    return CFG.OYATU_LIST.find(x => x.id === id) || null;
  }
  function pickSrc(selectedId) {
    const by = pickById(selectedId);
    if (by) return by.src;
    const list = CFG.OYATU_LIST;
    return (list[Math.floor(Math.random() * list.length)] || list[0]).src;
  }
  function getDropCost(_selectedId) { return CFG.COST_PER_DROP; }

  function destroyDrop(id, reason = "unknown") {
    const d = drops.get(id);
    if (!d) return;
    if (d.eaten) return;
    d.eaten = true;

    const el = d.el;
    if (el && el.isConnected) {
      el.classList.remove("show");
      el.classList.add("hide");
      setTimeout(() => { try { el.remove(); } catch {} }, CFG.FADE_MS + 60);
    }
    drops.delete(id);

    try { window.WB?.emit?.("oyatu:eat", { id, reason }); } catch {}
  }

  // ✅ 食べた時の共通処理（バフ付与）
  function onEatOrPickup(id, reason) {
    startBuff();
    destroyDrop(id, reason);
  }

  /* =========================
   * spawnDrop（課金 + 落下 + クリック拾い）
   * ========================= */
  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) {
      toast(`同時最大 ${CFG.MAX_DROPS_ON_FIELD} 個までだよ`);
      return false;
    }

    const WB = window.WB || null;
    const cost = getDropCost(selectedId);

    if (!spendCoins(WB, cost)) {
      toast(`🪙 が足りない…（必要 ${cost}）`);
      return false;
    }

    playDropSE();

    const fr = field.getBoundingClientRect();
    const size = CFG.SIZE;

    // ✅ 地面寄りに落ちる（下の方）
    const x = clamp(30 + Math.random() * (fr.width - 60), 6, Math.max(6, fr.width - size - 6));
    const y = clamp(fr.height - size - 14, 6, Math.max(6, fr.height - size - 6));

    const src = pickSrc(selectedId);

    const id = `oyatuDropV15_${++dropSeq}`;
    const el = document.createElement("div");
    el.className = "oyatuDropV15";
    el.dataset.oyatu = "1";
    el.dataset.oid = id;
    el.style.setProperty("--x", `${Math.round(x)}px`);
    el.style.setProperty("--y", `${Math.round(y)}px`);
    el.innerHTML = `<img alt="おやつ">`;

    const img = el.querySelector("img");
    if (img) {
      img.src = src;
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    // ✅ クリックで手動拾い（軽い：この要素だけ）
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onEatOrPickup(id, "click");
    });

    field.appendChild(el);

    const bornAt = Date.now();
    drops.set(id, {
      el,
      x: Math.round(x),
      y: Math.round(y),
      bornAt,
      ttlAt: bornAt + CFG.DROP_TTL_MS,
      eaten: false,
    });

    requestAnimationFrame(() => {
      el.classList.add("show");
      el.style.animation = `oyatuFallV15 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!el.isConnected) return;
        el.style.animation = `oyatuBobV15 1.8s ease-in-out infinite`;
      }, CFG.FALL_MS + 10);
    });

    // ✅ 取りに行く指示（初回）
    trySeekToDrop(id);

    try { window.WB?.emit?.("oyatu:drop", { id: String(selectedId || "random"), cost }); } catch {}
    return true;
  }

  /* =========================
   * ✅ 取りに行く & 食べる判定（軽量ループ1本）
   * ========================= */
  function getEatDist() {
    try {
      const d = Number(window.WB?.oyatu?.defaults?.eatDist);
      if (Number.isFinite(d) && d > 10) return d;
    } catch {}
    return CFG.EAT_DIST_PX;
  }

  function getBunnyCenters() {
    const WB = window.WB || null;
    const arr = WB?.getBunnies?.() || [];
    if (!Array.isArray(arr) || !arr.length) return [];

    // app.js の WRAP_W/WRAP_H は同じ値の前提（140/140）
    // 中心は足元寄り
    const out = [];
    for (const b of arr) {
      if (!b) continue;
      const x = Number(b.x), y = Number(b.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({
        bornAt: b.bornAt,
        kind: b.kind,
        cx: x + 140 * 0.5,
        cy: y + 140 * 0.78,
      });
    }
    return out;
  }

  function trySeekToDrop(id) {
    const d = drops.get(id);
    if (!d || d.eaten) return false;

    const WB = window.WB || null;
    const seek = WB?.oyatu?.seekTo;
    if (typeof seek === "function") {
      try { seek(d.x, d.y, CFG.SEEK_OPTS); } catch {}
      return true;
    }
    return false;
  }

  // ✅ 最寄りうさぎが一定距離に来たら食べる
  function checkEat(id, bunniesCenters) {
    const d = drops.get(id);
    if (!d || d.eaten) return false;

    const eatDist = getEatDist();
    let best = Infinity;

    for (const b of bunniesCenters) {
      const dx = d.x - b.cx;
      const dy = (d.y - b.cy) * 0.6;
      const dist = Math.hypot(dx, dy);
      if (dist < best) best = dist;
      if (dist <= eatDist) {
        onEatOrPickup(id, "bunny");
        return true;
      }
    }
    return false;
  }

  // ✅ 軽量：一定周期で「seek」「eat」「TTL掃除」だけ
  let seekTimer = 0;
  function startSeekLoop() {
    if (seekTimer) return;
    seekTimer = window.setInterval(() => {
      if (!drops.size) return;

      const now = Date.now();
      const bcs = getBunnyCenters();

      for (const [id, d] of drops) {
        if (!d || d.eaten) { drops.delete(id); continue; }

        // TTLで消える（消えない対策）
        if (now > d.ttlAt) {
          destroyDrop(id, "ttl");
          continue;
        }

        // 食べ判定
        if (bcs.length) {
          if (checkEat(id, bcs)) continue;
        }

        // たまに取りに行く指示（頻度低め）
        // ※ bcs が空なら指示しても意味ないが、WB.oyatu が無い環境でも安全
        trySeekToDrop(id);
      }
    }, CFG.SEEK_TICK_MS);
  }

  /* =========================
   * 2倍処理：うさぎクリック検出 → coinChanged増加分を追撃して2倍
   * ========================= */
  let lastBunnyClickAt = 0;
  let lastCoinsSeen = null;

  function isBunnyTarget(t) {
    const el = t && t.nodeType === 1 ? t : null;
    if (!el) return false;
    return !!el.closest?.(".bunnyWrap, .bunny-wrap");
  }

  document.addEventListener("click", (e) => {
    if (!isBunnyTarget(e.target)) return;
    const b = loadBuff();
    if (!b || b.used) return;
    if (Date.now() > b.until) return;
    lastBunnyClickAt = Date.now();
  }, true);

  function addCoins(WB, delta) {
    const d = Math.max(0, Math.floor(Number(delta) || 0));
    if (!d) return;

    try {
      if (WB && typeof WB.addCoin === "function") {
        WB.addCoin(d);
        return;
      }
    } catch {}

    const cur = readCoinsDirect(WB);
    setCoinsDirect(WB, cur + d);
  }

  function onCoinsChanged(curCoins) {
    const cur = Number(curCoins);
    if (!Number.isFinite(cur)) return;

    if (lastCoinsSeen === null) lastCoinsSeen = cur;

    const diff = cur - lastCoinsSeen;
    lastCoinsSeen = cur;

    if (diff <= 0) return;

    const b = loadBuff();
    if (!b || b.used) return;

    const now = Date.now();
    if (now > b.until) { clearBuff(); updateBadge(); return; }

    if (lastBunnyClickAt && (now - lastBunnyClickAt) <= CFG.COINCLICK_WINDOW_MS) {
      const WB = window.WB || null;
      addCoins(WB, diff);

      saveBuff(b.until, true);
      updateBadge();
      lastBunnyClickAt = 0;

      try { WB?.emit?.("oyatu:double", { bonus: diff }); } catch {}
    }
  }

  function hookCoinChangedIfPossible(WB) {
    try {
      if (WB?.on && !WB.__oyatuCoinHookedV15) {
        WB.__oyatuCoinHookedV15 = true;
        WB.on("coinChanged", (payload) => {
          const cur = (() => {
            if (typeof payload === "number") return payload;
            if (payload && typeof payload === "object" && payload.coins != null) return Number(payload.coins);
            return Number(payload);
          })();
          onCoinsChanged(cur);
        });
      }
    } catch {}
  }

  let watchTimer = 0;
  function startCoinWatchFallback() {
    if (watchTimer) return;
    watchTimer = window.setInterval(() => {
      const WB = window.WB || null;
      const cur = readCoinsDirect(WB);
      onCoinsChanged(cur);
    }, 200);
  }

  /* =========================
   * Modal（選択 + 連打ドロップ）
   * ========================= */
  const MODAL_ID = "oyatuModalV15";
  let selectedId = "random";

  function ensureModal() {
    let m = document.getElementById(MODAL_ID);
    if (m) return m;

    m = document.createElement("div");
    m.id = MODAL_ID;
    m.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🍬 おやつ（🪙消費）</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body">
          <div class="hint">
            「落とす」1個ごとに <b>${CFG.COST_PER_DROP}🪙</b> 消費します（連打＝連続課金）。
            落ちたおやつは <b>うさぎが取りに行って食べます</b>（近づくと消える）。
            もしくは <b>クリックで拾えます</b>。拾う/食べると「次のうさぎクリックが2倍（30秒以内・1回）」になります。
          </div>
          <div style="height:10px"></div>

          <div class="grid" data-grid></div>

          <div class="row">
            <button class="btn primary" type="button" data-drop>⬇ 落とす（連打OK）</button>
            <button class="btn" type="button" data-clear>画面の落ち物を全消し</button>
          </div>

          <div class="row">
            <div class="hint">
              同時最大：${CFG.MAX_DROPS_ON_FIELD}個 / 現在：<b data-count>0</b>個
            </div>
            <div class="hint">
              所持：<b data-coins>0</b>🪙 / あと<b data-can>0</b>個落とせる
            </div>
          </div>

          <div class="row">
            <div class="hint">バフ：<b data-buff>なし</b></div>
            <div class="hint">コスト：<b data-cost>${CFG.COST_PER_DROP}</b>🪙 / 1個</div>
          </div>

          <div style="height:6px"></div>
          <div class="hint">※ SEは最短 ${CFG.DROP_SE_COOLDOWN_MS}ms 間隔で鳴ります（連打対策）</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    m.querySelector(".bg")?.addEventListener("click", () => closeModal());
    m.querySelector(".close")?.addEventListener("click", () => closeModal());
    m.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    const grid = m.querySelector("[data-grid]");
    if (grid) {
      const randomPick = document.createElement("div");
      randomPick.className = "pick on";
      randomPick.dataset.pick = "random";
      randomPick.innerHTML = `
        <img src="${CFG.OYATU_LIST[0].src}" style="opacity:.55" alt="random">
        <div class="name">ランダム</div>
      `;
      grid.appendChild(randomPick);

      CFG.OYATU_LIST.forEach(it => {
        const p = document.createElement("div");
        p.className = "pick";
        p.dataset.pick = it.id;
        p.innerHTML = `<img src="${it.src}" alt="${it.name}"><div class="name">${it.name}</div>`;
        grid.appendChild(p);
      });

      grid.addEventListener("click", (e) => {
        const t = e.target?.closest?.(".pick");
        if (!t) return;
        const id = t.dataset.pick || "random";
        setSelected(id);
        renderModalMeta();
      });
    }

    m.querySelector("[data-drop]")?.addEventListener("click", () => {
      spawnDrop(selectedId);
      renderModalMeta();
    });

    m.querySelector("[data-clear]")?.addEventListener("click", () => {
      clearAllDrops();
      renderModalMeta();
    });

    return m;
  }

  function setSelected(id) {
    selectedId = String(id || "random");
    const m = ensureModal();
    $$(".pick", m).forEach(p => p.classList.toggle("on", (p.dataset.pick || "") === selectedId));
    const costEl = m.querySelector("[data-cost]");
    if (costEl) costEl.textContent = String(getDropCost(selectedId));
  }

  function renderModalMeta() {
    const m = document.getElementById(MODAL_ID);
    if (!m || m.style.display !== "block") return;

    const countEl = m.querySelector("[data-count]");
    if (countEl) countEl.textContent = String(dropsOnFieldCount());

    const WB = window.WB || null;
    const coins = readCoinsDirect(WB);
    const cost = getDropCost(selectedId);

    const coinsEl = m.querySelector("[data-coins]");
    if (coinsEl) coinsEl.textContent = String(coins);

    const canEl = m.querySelector("[data-can]");
    if (canEl) canEl.textContent = String(cost > 0 ? Math.floor(coins / cost) : 9999);

    const buffEl = m.querySelector("[data-buff]");
    if (buffEl) {
      const b = loadBuff();
      if (!b) buffEl.textContent = "なし";
      else if (b.used) buffEl.textContent = "使用済み（次は拾って再付与）";
      else {
        const left = Math.max(0, b.until - Date.now());
        buffEl.textContent = `有効（残り ${(left / 1000).toFixed(0)}s）`;
      }
    }
  }

  let modalLiveTimer = 0;
  function openModal() {
    const m = ensureModal();
    m.style.display = "block";
    renderModalMeta();
    if (!modalLiveTimer) {
      modalLiveTimer = window.setInterval(() => {
        renderModalMeta();
        updateBadge();
        const b = loadBuff();
        if (b && Date.now() > b.until) { clearBuff(); updateBadge(); }
      }, 250);
    }
  }

  function closeModal() {
    const m = document.getElementById(MODAL_ID);
    if (!m) return;
    m.style.display = "none";
    if (modalLiveTimer) clearInterval(modalLiveTimer);
    modalLiveTimer = 0;
  }

  /* =========================
   * Clear all drops
   * ========================= */
  function clearAllDrops() {
    for (const [id, d] of drops) {
      if (!d) continue;
      destroyDrop(id, "clear");
    }
    drops.clear();
  }

  /* =========================
   * Main loop（バフ期限掃除）
   * ========================= */
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const b = loadBuff();
    if (b && Date.now() > b.until) {
      clearBuff();
      updateBadge();
    } else {
      updateBadge();
    }

    requestAnimationFrame(loop);
  }

  /* =========================
   * Boot
   * ========================= */
  const btn = document.getElementById(CFG.HUD_BTN_ID);
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  }

  try { hookCoinChangedIfPossible(window.WB || null); } catch {}
  startCoinWatchFallback();
  startSeekLoop(); // ✅ 取りに行く＆食べる判定（軽量）

  requestAnimationFrame(loop);

  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };
  window.OYATU.clearAll = () => clearAllDrops();

  console.log("[oyatu] ready v1.5.0 (bunny seek+eat, anti-leak)", {
    btn: CFG.HUD_BTN_ID,
    costPerDrop: CFG.COST_PER_DROP,
    maxDrops: CFG.MAX_DROPS_ON_FIELD,
    buffMs: CFG.BUFF_WINDOW_MS,
    ttlMs: CFG.DROP_TTL_MS,
    seekTickMs: CFG.SEEK_TICK_MS,
    seCooldownMs: CFG.DROP_SE_COOLDOWN_MS,
  });
})();
