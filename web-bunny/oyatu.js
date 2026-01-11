// oyatu.js（HUD追加：モーダルで選択 + 連打で落とす + 落とす時SE + 60msクール + 拾うと「次のクリック2倍」）v1.4.0
// ✅ HUDに #oyatuBtn があれば押してモーダルを開く
// ✅ モーダルでおやつ画像を選択（ランダムも可）
// ✅ 「落とす」ボタンを連打で複数個落とせる（同時最大数あり）
// ✅ 落とした瞬間にSE（BGM.jsのSEスライダー追従）
// ✅ SE最短間隔クールダウン（デフォ60ms）
// ✅ 落ちたおやつをクリックで拾う → 30秒以内に“1回だけ”うさぎクリック獲得2倍
// ✅ coinChanged / 監視フォールバック両対応
// ✅ LS：バフ状態のみ保存（ドロップは多重なので保存しない＝軽量）
//
// ✅ v1.4.0 変更点（要望対応）
// - おやつは「選ばれたうさぎの足元」に落とす（地面固定じゃなく、うさぎ位置基準）
// - うさぎが「おやつに向かって移動」して食べる（dir/baseSpeedを追跡中だけ制御）
// - 近づいたら自動で食べる（食べた時も拾いと同じバフ付与）
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
// 読み込み：app.js の後（最後の方推奨）
//
// デバッグ：window.OYATU.open() / window.OYATU.dropNow() / window.OYATU.clearBuff()

(() => {
  "use strict";
  if (window.__OYATU_V140__) return;
  window.__OYATU_V140__ = true;

  const CFG = {
    FIELD_ID: "field",
    HUD_BTN_ID: "oyatuBtn",

    OYATU_LIST: [
      { id: "candy",   name: "キャンディケイン", src: "./assets/oyatu/candy_candycane_halloween_orange.png" },
      { id: "wataame", name: "わたあめ",         src: "./assets/oyatu/wataame_white.png" },
      { id: "cupcake", name: "カップケーキ",     src: "./assets/oyatu/cupcake_cream_pink_choco.png" },
      { id: "orange",  name: "オレンジ",         src: "./assets/oyatu/orange_cut.png" },
    ],

    MAX_DROPS_ON_FIELD: 10,

    // 演出
    FALL_MS: 520,
    SIZE: 40,
    Z: 260000,

    // 落とすSE
    OYATU_DROP_SE_SRC: "./assets/se/Onoma-Pop04-1(High-Dry).mp3",
    OYATU_DROP_SE_BASE: 1.0,
    DROP_SE_COOLDOWN_MS: 60,

    // バフ
    BUFF_WINDOW_MS: 30_000,
    COINCLICK_WINDOW_MS: 320,
    LS_BUFF: "milkpop_oyatu_buff_v2",

    // ふわっと消す
    FADE_MS: 160,

    // ✅ 足元に落とす
    DROP_AT_BUNNY_FEET: true,
    DROP_FOOT_X_JITTER: 10,      // 足元Xゆらぎ
    DROP_FOOT_Y_OFFSET: 0,       // 足元Yオフセット（必要なら +5 など）

    // ✅ 追いかけAI
    AI_ENABLED: true,
    AI_TICK_MS: 90,
    AI_PICK_RADIUS_PX: 620,      // この距離以内のおやつを追いかけ対象にする
    AI_EAT_RADIUS_PX: 28,        // この距離以内で食べる
    AI_SPEED_MUL: 1.35,          // 追いかけ中だけ baseSpeed をこの倍率に
    AI_STEER_HYSTERESIS: 2,      // dir反転しすぎ防止用の微小値

    // 落下中に食べない（着地後のみ）
    EAT_AFTER_LAND_ONLY: true,
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
  function saveJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  function rm(key) { try { localStorage.removeItem(key); } catch {} }

  /* =========================
   * Coins helpers（加算）
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
      if (WB && typeof WB.addCoin === "function") {
        WB.addCoin(d);
        return;
      }
    } catch {}

    const cur = readCoinsDirect(WB);
    setCoinsDirect(WB, cur + d);
  }

  /* =========================
   * SE（BGM.jsがあれば追従） + クールダウン
   * ========================= */
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
    } catch {}
  }

  /* =========================
   * CSS
   * ========================= */
  function ensureCss() {
    if (document.getElementById("oyatuCssV140")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV140";
    s.textContent = `
@keyframes oyatuFallV140{
  0%{ transform:translate3d(var(--x), calc(var(--y) - 90px), 0) rotate(-10deg); opacity:0; }
  12%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV140{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-2deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 3px), 0) rotate(2deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-2deg); }
}
@keyframes oyatuEatPopV140{
  0%{ transform:translate3d(var(--x), var(--y), 0) scale(1) rotate(6deg); opacity:1; }
  40%{ transform:translate3d(var(--x), var(--y), 0) scale(1.08) rotate(-6deg); opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) scale(0.2) rotate(12deg); opacity:0; }
}
.oyatuDropV140{
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
.oyatuDropV140.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV140.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV140 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}

/* バフ表示（右下） */
#oyatuBuffBadgeV140{
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
#oyatuModalV140{ position:fixed; inset:0; z-index:2147483647; display:none; }
#oyatuModalV140 .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#oyatuModalV140 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(520px, 92vw);
  max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#oyatuModalV140 .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#oyatuModalV140 .title{ font-weight:1000; letter-spacing:.02em; }
#oyatuModalV140 .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;
}
#oyatuModalV140 .body{ padding:12px 14px 14px; overflow:auto; }
#oyatuModalV140 .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
#oyatuModalV140 .pick{
  border:2px solid rgba(0,0,0,.10);
  border-radius:14px; padding:10px;
  display:flex; align-items:center; gap:10px;
  background:#fff;
  cursor:pointer;
  user-select:none;
}
#oyatuModalV140 .pick.on{ border-color: rgba(255,120,180,.65); box-shadow:0 10px 22px rgba(0,0,0,.08); }
#oyatuModalV140 .pick img{ width:40px; height:40px; image-rendering:pixelated; }
#oyatuModalV140 .pick .name{ font-weight:1000; font-size:12px; opacity:.9; }
#oyatuModalV140 .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; }
#oyatuModalV140 .btn{
  border:none; border-radius:12px;
  padding:10px 12px; font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#oyatuModalV140 .btn.primary{ background:#ffd6e7; }
#oyatuModalV140 .hint{ font-size:12px; opacity:.78; font-weight:900; line-height:1.35; }
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
    d.id = "oyatuBuffBadgeV140";
    document.body.appendChild(d);
    badgeEl = d;
    return d;
  }

  function updateBadge() {
    const b = loadBuff();
    const el = ensureBadge();
    if (!b) { el.style.display = "none"; return; }
    const left = Math.max(0, b.until - Date.now());
    if (left <= 0 || b.used) { el.style.display = "none"; return; }
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
   * Drops
   * ========================= */
  let dropSeq = 0;

  function dropsOnFieldCount() { return $$(".oyatuDropV140", field).length; }

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

  function getBunniesSafe() {
    try {
      const WB = window.WB;
      if (WB?.getBunnies) {
        const arr = WB.getBunnies();
        return Array.isArray(arr) ? arr : [];
      }
    } catch {}
    return [];
  }

  function getBunnySizeHint(b) {
    // app.js では WRAP_W/H = 140 だが、確実性のためDOMから読む
    try {
      const r = b?.wrap?.getBoundingClientRect?.();
      if (r && r.width > 10 && r.height > 10) return { w: r.width, h: r.height };
    } catch {}
    return { w: 140, h: 140 };
  }

  function spawnPosAtBunnyFeet() {
    const bunnies = getBunniesSafe();
    if (!bunnies.length) {
      // うさぎが取れなければ適当に中央寄り
      const fr = field.getBoundingClientRect();
      const x = clamp(fr.width * 0.5, 6, Math.max(6, fr.width - CFG.SIZE - 6));
      const y = clamp(fr.height * 0.75, 6, Math.max(6, fr.height - CFG.SIZE - 6));
      return { x, y, targetBunny: null };
    }

    // ランダムな1匹を「足元投下」対象にする（偏りを避ける）
    const b = bunnies[Math.floor(Math.random() * bunnies.length)];
    const sz = getBunnySizeHint(b);

    // b.x/b.y は field 座標（translate3d）なので、そのまま使える
    const baseX = Number(b?.x) || 0;
    const baseY = Number(b?.y) || 0;

    // 足元：うさぎの真ん中少し右、下端付近
    const x = baseX + sz.w * 0.55 + (Math.random() * 2 - 1) * CFG.DROP_FOOT_X_JITTER - CFG.SIZE * 0.5;
    const y = baseY + sz.h * 0.86 + CFG.DROP_FOOT_Y_OFFSET;

    // worldBounds 相当のクランプは oyatu側では fieldサイズで簡易
    const fr = field.getBoundingClientRect();
    const cx = clamp(Math.round(x), 6, Math.max(6, fr.width - CFG.SIZE - 6));
    const cy = clamp(Math.round(y), 6, Math.max(6, fr.height - CFG.SIZE - 6));

    return { x: cx, y: cy, targetBunny: b };
  }

  function eatDrop(dropEl, reason = "bunny") {
    if (!dropEl || !dropEl.isConnected) return;
    if (dropEl.dataset.eaten === "1") return;
    dropEl.dataset.eaten = "1";

    startBuff();

    dropEl.style.animation = `oyatuEatPopV140 220ms ease-out forwards`;
    setTimeout(() => { try { dropEl.remove(); } catch {} }, 260);

    try { window.WB?.emit?.("oyatu:eat", { by: reason }); } catch {}
  }

  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) return false;

    playDropSE();

    const src = pickSrc(selectedId);

    const p = CFG.DROP_AT_BUNNY_FEET ? spawnPosAtBunnyFeet() : (() => {
      const fr = field.getBoundingClientRect();
      const x = clamp(30 + Math.random() * (fr.width - 60), 6, Math.max(6, fr.width - CFG.SIZE - 6));
      const y = clamp(fr.height * 0.75, 6, Math.max(6, fr.height - CFG.SIZE - 6));
      return { x, y, targetBunny: null };
    })();

    const d = document.createElement("div");
    d.className = "oyatuDropV140";
    d.dataset.oyatu = "1";
    d.dataset.landed = "0";
    d.dataset.eaten = "0";
    d.id = `oyatuDropV140_${++dropSeq}`;

    // ✅ おやつは「足元に落とす」ので、--y を足元の位置にする
    d.style.setProperty("--x", `${Math.round(p.x)}px`);
    d.style.setProperty("--y", `${Math.round(p.y)}px`);

    d.innerHTML = `<img alt="おやつ">`;
    const img = d.querySelector("img");
    if (img) {
      img.src = src;
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    // 手動拾い（クリック）
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      eatDrop(d, "click");
      try { window.WB?.emit?.("oyatu:pickup", { until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}
    });

    field.appendChild(d);

    requestAnimationFrame(() => {
      d.classList.add("show");
      d.style.animation = `oyatuFallV140 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!d.isConnected) return;
        d.dataset.landed = "1";
        d.style.animation = `oyatuBobV140 1.8s ease-in-out infinite`;
      }, CFG.FALL_MS + 10);
    });

    return true;
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
      if (WB?.on && !WB.__oyatuCoinHookedV140) {
        WB.__oyatuCoinHookedV140 = true;
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
   * ✅ うさぎAI：おやつに向かって移動して食べる
   * ========================= */
  const bunnyOrigSpeed = new WeakMap();   // bunny -> original baseSpeed
  const bunnyState = new WeakMap();       // bunny -> { targetId, lastSeenAt }

  function getDropCenterField(el) {
    // oyatuDropは translate3d(var(--x), var(--y)) なので、CSS var を読むのが確実
    // ただし animation後も --x/--y は固定なので中心計算に使える
    const x = Number(String(el.style.getPropertyValue("--x") || "").replace("px","")) || 0;
    const y = Number(String(el.style.getPropertyValue("--y") || "").replace("px","")) || 0;
    return { x: x + CFG.SIZE * 0.5, y: y + CFG.SIZE * 0.5 };
  }

  function chooseNearestDropForBunny(b) {
    const drops = $$(".oyatuDropV140", field);
    if (!drops.length) return null;

    const bx = Number(b?.x) || 0;
    const by = Number(b?.y) || 0;
    const sz = getBunnySizeHint(b);
    const bcx = bx + sz.w * 0.5;
    const bcy = by + sz.h * 0.85;

    let best = null;
    let bestD = Infinity;

    for (const d of drops) {
      if (!d.isConnected) continue;
      if (d.dataset.eaten === "1") continue;
      if (CFG.EAT_AFTER_LAND_ONLY && d.dataset.landed !== "1") continue;

      const dc = getDropCenterField(d);
      const dx = dc.x - bcx;
      const dy = dc.y - bcy;
      const dist = Math.hypot(dx, dy);

      if (dist <= CFG.AI_PICK_RADIUS_PX && dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best ? { el: best, dist: bestD, bcx, bcy } : null;
  }

  function restoreBunnySpeed(b) {
    const orig = bunnyOrigSpeed.get(b);
    if (orig != null && Number.isFinite(orig)) {
      b.baseSpeed = orig;
    }
  }

  function ensureOrigSpeed(b) {
    if (!bunnyOrigSpeed.has(b)) {
      const v = Number(b?.baseSpeed);
      if (Number.isFinite(v) && v > 0) bunnyOrigSpeed.set(b, v);
      else bunnyOrigSpeed.set(b, 50);
    }
  }

  function steerBunnyToDrop(b, dropInfo) {
    ensureOrigSpeed(b);

    const d = dropInfo.el;
    const dc = getDropCenterField(d);

    // bunny足元中心
    const bx = Number(b?.x) || 0;
    const by = Number(b?.y) || 0;
    const sz = getBunnySizeHint(b);
    const bcx = bx + sz.w * 0.5;
    const bcy = by + sz.h * 0.85;

    const dx = dc.x - bcx;
    const dy = dc.y - bcy;
    const dist = Math.hypot(dx, dy);

    // ✅ 食べる
    if (dist <= CFG.AI_EAT_RADIUS_PX) {
      eatDrop(d, "bunny");
      restoreBunnySpeed(b);
      bunnyState.delete(b);
      return;
    }

    // ✅ 追いかけ中は速度ちょい上げ
    const orig = bunnyOrigSpeed.get(b) || 50;
    b.baseSpeed = Math.max(20, orig * CFG.AI_SPEED_MUL);

    // ✅ dir をターゲットへ
    // dx がほぼ0の時は反転連打しないようヒステリシス
    if (dx > CFG.AI_STEER_HYSTERESIS) b.dir = 1;
    else if (dx < -CFG.AI_STEER_HYSTERESIS) b.dir = -1;

    bunnyState.set(b, { targetId: d.id, lastSeenAt: Date.now() });
  }

  function tickBunnyAI() {
    if (!CFG.AI_ENABLED) return;

    const bunnies = getBunniesSafe();
    if (!bunnies.length) return;

    const dropsCount = dropsOnFieldCount();
    if (!dropsCount) {
      // 追いかけ解除（速度復元）
      for (const b of bunnies) {
        if (!b) continue;
        if (bunnyState.has(b)) {
          restoreBunnySpeed(b);
          bunnyState.delete(b);
        }
      }
      return;
    }

    for (const b of bunnies) {
      if (!b) continue;

      const info = chooseNearestDropForBunny(b);
      if (!info) {
        // 対象無し：速度復元
        if (bunnyState.has(b)) {
          restoreBunnySpeed(b);
          bunnyState.delete(b);
        }
        continue;
      }

      steerBunnyToDrop(b, info);
    }
  }

  let aiTimer = 0;
  function startAI() {
    if (aiTimer) return;
    aiTimer = window.setInterval(() => {
      try { tickBunnyAI(); } catch {}
    }, CFG.AI_TICK_MS);
  }

  /* =========================
   * Modal（選択 + 連打ドロップ）
   * ========================= */
  const MODAL_ID = "oyatuModalV140";
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
          <div class="title">🍬 おやつ</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body">
          <div class="hint">「落とす」で連打ドロップ。おやつは“うさぎの足元”に落ち、うさぎが近づいて食べます（食べても拾ってもバフ付与）。</div>
          <div style="height:10px"></div>

          <div class="grid" data-grid></div>

          <div class="row">
            <button class="btn primary" type="button" data-drop>⬇ 落とす（連打OK）</button>
            <button class="btn" type="button" data-clear>画面の落ち物を全消し</button>
          </div>

          <div class="row">
            <div class="hint">同時最大：${CFG.MAX_DROPS_ON_FIELD}個 / 現在：<b data-count>0</b>個</div>
            <div class="hint">バフ：<b data-buff>なし</b></div>
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
        setSelected(t.dataset.pick || "random");
      });
    }

    m.querySelector("[data-drop]")?.addEventListener("click", () => {
      spawnDrop(selectedId);
      renderModalMeta();
    });

    m.querySelector("[data-clear]")?.addEventListener("click", () => {
      $$(".oyatuDropV140", field).forEach(el => { try { el.remove(); } catch {} });
      renderModalMeta();
    });

    return m;
  }

  function setSelected(id) {
    selectedId = String(id || "random");
    const m = ensureModal();
    $$(".pick", m).forEach(p => p.classList.toggle("on", (p.dataset.pick || "") === selectedId));
  }

  function renderModalMeta() {
    const m = document.getElementById(MODAL_ID);
    if (!m || m.style.display !== "block") return;

    const countEl = m.querySelector("[data-count]");
    if (countEl) countEl.textContent = String(dropsOnFieldCount());

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
   * Main loop（バフ期限掃除）
   * ========================= */
  let lastT = performance.now();
  function loop(now) {
    lastT = now;

    const b = loadBuff();
    if (b && Date.now() > b.until) { clearBuff(); updateBadge(); }
    else updateBadge();

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

  // ✅ うさぎ追跡AI開始
  startAI();

  requestAnimationFrame(loop);

  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };
  window.OYATU.setAI = (on) => { CFG.AI_ENABLED = !!on; };

  console.log("[oyatu] ready v1.4.0", {
    btn: CFG.HUD_BTN_ID,
    maxDrops: CFG.MAX_DROPS_ON_FIELD,
    size: CFG.SIZE,
    dropAtFeet: CFG.DROP_AT_BUNNY_FEET,
    ai: CFG.AI_ENABLED,
    aiSpeedMul: CFG.AI_SPEED_MUL,
    eatRadius: CFG.AI_EAT_RADIUS_PX,
  });
})();
