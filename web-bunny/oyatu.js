// oyatu.js v1.4.3（軽量化 + 確実に消える + 1匹だけ取りに行く）
// ✅ おやつ落下（課金）+ SE（60msクール）
// ✅ クリックで拾う→バフ（次のクリック2倍）
// ✅ 自動で食べる（軽量）
// ✅ 「取りに行く」：最寄りのうさぎ1匹だけが最寄りおやつへ寄る（負荷激減）
// ✅ 当たり判定：field内座標で距離計算（getBoundingClientRect乱用を回避）
// ✅ “消えない”対策：removeを二重で強制

(() => {
  "use strict";
  if (window.__OYATU_V143__) return;
  window.__OYATU_V143__ = true;

  const CFG = {
    FIELD_ID: "field",
    HUD_BTN_ID: "oyatuBtn",

    COST_PER_DROP: 35,

    OYATU_LIST: [
      { id: "candy",   name: "キャンディケイン", src: "./assets/oyatu/candy_candycane_halloween_orange.png" },
      { id: "wataame", name: "わたあめ",         src: "./assets/oyatu/wataame_white.png" },
      { id: "cupcake", name: "カップケーキ",     src: "./assets/oyatu/cupcake_cream_pink_choco.png" },
      { id: "orange",  name: "オレンジ",         src: "./assets/oyatu/orange_cut.png" },
    ],

    MAX_DROPS_ON_FIELD: 10,
    FALL_MS: 820,

    SIZE: 46,
    Z: 260000,

    OYATU_DROP_SE_SRC: "./assets/se/Onoma-Pop04-1(High-Dry).mp3",
    OYATU_DROP_SE_BASE: 1.0,
    DROP_SE_COOLDOWN_MS: 60,

    BUFF_WINDOW_MS: 30_000,
    COINCLICK_WINDOW_MS: 320,
    LS_BUFF: "milkpop_oyatu_buff_v2",

    FADE_MS: 160,

    // ===== 自動で食べる / 取りに行く =====
    TICK_MS: 140,            // ✅ 少し遅めで十分軽い
    EAT_DIST_PX: 44,         // ✅ 食べる距離
    SEEK_RADIUS_PX: 260,     // ✅ 取りに行く範囲
    SEEK_STEP_PX: 7,         // ✅ 1tickで寄せる量（控えめ）
    SEEK_Y_MUL: 0.55,        // ✅ 縦方向は弱め

    BUNNY_WRAP_SELECTOR: ".bunnyWrap, .bunny-wrap",
  };

  const field = document.getElementById(CFG.FIELD_ID);
  if (!field) return;
  if (getComputedStyle(field).position === "static") field.style.position = "relative";

  const $  = (q, p = document) => p.querySelector(q);
  const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  function loadJson(key, def = null) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; }
  }
  function saveJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  function rm(key) { try { localStorage.removeItem(key); } catch {} }

  /* =========================
   * Coins
   * ========================= */
  function readCoinsDirect(WB) {
    try { if (WB && typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try { if (WB && ("coins" in WB)) return Number(WB.coins) || 0; } catch {}
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
    try { if (WB && typeof WB.spendCoin === "function") return !!WB.spendCoin(c); } catch {}
    const cur = readCoinsDirect(WB);
    if (cur < c) return false;
    setCoinsDirect(WB, cur - c);
    return true;
  }

  /* =========================
   * Toast
   * ========================= */
  function ensureToastCss() {
    if (document.getElementById("oyatuToastCssV1")) return;
    const s = document.createElement("style");
    s.id = "oyatuToastCssV1";
    s.textContent = `
#oyatuToastV1{
  position:fixed; left:50%; top:14%;
  transform:translate(-50%,-50%);
  z-index:2147483647;
  background:rgba(255,255,255,.97);
  border-radius:16px;
  padding:10px 14px;
  box-shadow:0 18px 50px rgba(0,0,0,.22);
  font-weight:1000; font-size:13px;
  opacity:0;
  animation:oyatuToastIn .18s ease-out forwards, oyatuToastOut .28s ease-in forwards;
  animation-delay:0ms, 1.8s;
  max-width:min(520px, 92vw);
  text-align:center;
}
@keyframes oyatuToastIn{ from{ opacity:0; transform:translate(-50%,-70%);} to{ opacity:1; transform:translate(-50%,-50%);} }
@keyframes oyatuToastOut{ from{ opacity:1; transform:translate(-50%,-50%);} to{ opacity:0; transform:translate(-50%,-35%);} }
`;
    document.head.appendChild(s);
  }
  function toast(msg) {
    ensureToastCss();
    try { document.getElementById("oyatuToastV1")?.remove(); } catch {}
    const el = document.createElement("div");
    el.id = "oyatuToastV1";
    el.textContent = String(msg || "");
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 2300);
  }

  /* =========================
   * SE（落とした瞬間だけ）
   * ========================= */
  let __lastDropSeAt = 0;
  function playDropSE() {
    const now = Date.now();
    if (__lastDropSeAt && (now - __lastDropSeAt) < CFG.DROP_SE_COOLDOWN_MS) return;
    __lastDropSeAt = now;

    const WB = window.WB || null;
    try {
      if (WB?.se?.play) { WB.se.play("oyatu_drop", CFG.OYATU_DROP_SE_SRC, CFG.OYATU_DROP_SE_BASE); return; }
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
   * CSS（軽量）
   * ========================= */
  function ensureCss() {
    if (document.getElementById("oyatuCssV143")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV143";
    s.textContent = `
@keyframes oyatuFallV14{
  0%{ transform:translate3d(var(--x), -90px, 0) rotate(-10deg); opacity:0; }
  12%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV14{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 5px), 0) rotate(3deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
}
.oyatuDropV14{
  position:absolute; left:0; top:0;
  width:${CFG.SIZE}px; height:${CFG.SIZE}px;
  z-index:${CFG.Z};
  cursor:pointer;
  user-select:none; -webkit-user-drag:none;
  touch-action: manipulation;
  will-change: transform, opacity;
  opacity:0;
  border-radius: 14px;
}
.oyatuDropV14.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV14.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV14 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}
.oyatuDropV14.near{
  outline: 4px solid rgba(255,64,64,.85);
  outline-offset: 2px;
}

#oyatuBuffBadgeV14{
  position:fixed; right:10px; bottom:10px;
  z-index:2147483647;
  background:rgba(255,255,255,.92);
  border-radius:14px;
  padding:8px 10px;
  box-shadow:0 14px 30px rgba(0,0,0,.18);
  font-weight:1000; font-size:12px;
  display:none;
  user-select:none; pointer-events:none;
}

#oyatuModalV14{ position:fixed; inset:0; z-index:2147483647; display:none; }
#oyatuModalV14 .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#oyatuModalV14 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(520px, 92vw);
  max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#oyatuModalV14 .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#oyatuModalV14 .title{ font-weight:1000; letter-spacing:.02em; }
#oyatuModalV14 .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px;
  font-weight:1000; cursor:pointer;
}
#oyatuModalV14 .body{ padding:12px 14px 14px; overflow:auto; }
#oyatuModalV14 .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
#oyatuModalV14 .pick{
  border:2px solid rgba(0,0,0,.10);
  border-radius:14px; padding:10px;
  display:flex; align-items:center; gap:10px;
  background:#fff;
  cursor:pointer;
  user-select:none;
}
#oyatuModalV14 .pick.on{ border-color: rgba(255,120,180,.65); box-shadow:0 10px 22px rgba(0,0,0,.08); }
#oyatuModalV14 .pick img{ width:40px; height:40px; image-rendering:pixelated; }
#oyatuModalV14 .pick .name{ font-weight:1000; font-size:12px; opacity:.9; }
#oyatuModalV14 .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; }
#oyatuModalV14 .btn{
  border:none; border-radius:12px;
  padding:10px 12px;
  font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#oyatuModalV14 .btn.primary{ background:#ffd6e7; }
#oyatuModalV14 .hint{ font-size:12px; opacity:.78; font-weight:900; line-height:1.35; }
`;
    document.head.appendChild(s);
  }
  ensureCss();

  /* =========================
   * Buff
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
    d.id = "oyatuBuffBadgeV14";
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
   * Drops（field座標を保持）
   * ========================= */
  let dropSeq = 0;
  function dropsOnFieldCount() { return $$(".oyatuDropV14", field).length; }

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

  function removeDrop(d, reason = "pickup") {
    if (!d || !d.isConnected) return;
    if (d.__oyatuRemoving) return;
    d.__oyatuRemoving = true;

    d.classList.remove("near");
    d.classList.remove("show");
    d.classList.add("hide");

    // ✅ バフ付与（拾う/食べる共通）
    startBuff();
    try { window.WB?.emit?.("oyatu:pickup", { reason, until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}

    // ✅ ちゃんと消す（2段階）
    const kill = () => { try { d.remove(); } catch {} };
    setTimeout(kill, CFG.FADE_MS + 60);
    setTimeout(kill, CFG.FADE_MS + 900); // 保険
  }

  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) {
      toast(`同時最大 ${CFG.MAX_DROPS_ON_FIELD} 個までだよ`);
      return false;
    }

    const WB = window.WB || null;
    const cost = CFG.COST_PER_DROP;
    if (!spendCoins(WB, cost)) {
      toast(`🪙 が足りない…（必要 ${cost}）`);
      return false;
    }

    playDropSE();

    const fr = field.getBoundingClientRect();
    const size = CFG.SIZE;

    const x = clamp(30 + Math.random() * (fr.width - 60), 6, Math.max(6, fr.width - size - 6));
    const y = clamp(fr.height - size - 14, 6, Math.max(6, fr.height - size - 6));

    const src = pickSrc(selectedId);

    const d = document.createElement("div");
    d.className = "oyatuDropV14 show";
    d.dataset.oyatu = "1";
    d.id = `oyatuDropV14_${++dropSeq}`;

    // ✅ field内座標を保持（rect不要）
    d.dataset.fx = String(Math.round(x));
    d.dataset.fy = String(Math.round(y));
    d.__oyatuLanded = false;

    d.style.setProperty("--x", `${Math.round(x)}px`);
    d.style.setProperty("--y", `${Math.round(y)}px`);
    d.innerHTML = `<img alt="おやつ">`;

    const img = d.querySelector("img");
    if (img) img.src = src;

    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeDrop(d, "click");
    });

    field.appendChild(d);

    // 落下→着地
    d.style.animation = `oyatuFallV14 ${CFG.FALL_MS}ms ease-out forwards`;
    setTimeout(() => {
      if (!d.isConnected) return;
      d.__oyatuLanded = true;
      d.style.animation = `oyatuBobV14 1.8s ease-in-out infinite`;
    }, CFG.FALL_MS + 10);

    try { window.WB?.emit?.("oyatu:drop", { id: String(selectedId || "random"), cost }); } catch {}
    return true;
  }

  /* =========================
   * 2倍処理：うさぎクリック→coin増加を2倍
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
    try { if (WB && typeof WB.addCoin === "function") { WB.addCoin(d); return; } } catch {}
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
      if (WB?.on && !WB.__oyatuCoinHookedV14) {
        WB.__oyatuCoinHookedV14 = true;
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
      onCoinsChanged(readCoinsDirect(WB));
    }, 220);
  }

  /* =========================
   * ✅ 自動で食べる + 取りに行く（軽量）
   * - drop座標はdataset（rect不要）
   * - うさぎは「最寄り1匹」だけ動かす
   * ========================= */
  function getDropsLanded() {
    const ds = $$(".oyatuDropV14", field);
    const out = [];
    for (const d of ds) {
      if (!d || !d.isConnected || d.__oyatuRemoving) continue;
      if (!d.__oyatuLanded) continue;
      const x = Number(d.dataset.fx), y = Number(d.dataset.fy);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ d, x, y });
    }
    return out;
  }

  function getBunniesQuick() {
    // WBが取れれば優先（wrapが入ってる想定）
    const WB = window.WB || null;
    try { if (WB && typeof WB.getBunnies === "function") return WB.getBunnies() || []; } catch {}
    try { if (WB && Array.isArray(WB.bunnies)) return WB.bunnies; } catch {}
    return [];
  }

  function getBunnyCentersFallback() {
    const wraps = $$(CFG.BUNNY_WRAP_SELECTOR, document);
    const fr = field.getBoundingClientRect();
    const list = [];
    for (const w of wraps) {
      if (!w || !w.isConnected) continue;
      const r = w.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // field内の座標に変換
      const cx = (r.left + r.right) / 2 - fr.left;
      const cy = (r.top + r.bottom) / 2 - fr.top;
      list.push({ wrap: w, cx, cy });
    }
    return list;
  }

  function nudgeWrapTransformToward(wrap, dx, dy) {
    // ✅ ここは最小限の“保険”。app.jsと喧嘩しやすいので強くしない。
    // 差分だけ少し足す（translate3dのみ扱う）
    try {
      const tr = wrap.style.transform || "";
      const m = tr.match(/translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/i);
      let cx = 0, cy = 0;
      if (m) { cx = parseFloat(m[1]) || 0; cy = parseFloat(m[2]) || 0; }
      const nx = cx + dx;
      const ny = cy + dy;
      wrap.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
    } catch {}
  }

  function tickEatSeek() {
    const drops = getDropsLanded();
    if (!drops.length) return;

    // 最寄り1匹だけを探す（負荷最小）
    const bunniesWB = getBunniesQuick();
    const fr = field.getBoundingClientRect();

    let bunnyList = [];
    if (bunniesWB && bunniesWB.length) {
      for (const b of bunniesWB) {
        const w = b?.wrap;
        if (!w || !w.isConnected) continue;
        const r = w.getBoundingClientRect();
        const cx = (r.left + r.right) / 2 - fr.left;
        const cy = (r.top + r.bottom) / 2 - fr.top;
        bunnyList.push({ bunny: b, wrap: w, cx, cy });
      }
    }
    if (!bunnyList.length) bunnyList = getBunnyCentersFallback();
    if (!bunnyList.length) return;

    // dropの“代表”として最寄りペアを作る
    let best = null;
    let bestDist = Infinity;

    for (const d of drops) {
      for (const b of bunnyList) {
        const dx = d.x - b.cx;
        const dy = d.y - b.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { d: d.d, dx, dy, dist, bunny: b };
        }
      }
    }
    if (!best) return;

    // 近いなら食べる（確実に消す）
    if (best.dist <= CFG.EAT_DIST_PX) {
      try { best.d.classList.add("near"); } catch {}
      removeDrop(best.d, "eat");
      return;
    }

    // 取りに行く（範囲内だけ）
    if (best.dist > CFG.SEEK_RADIUS_PX) return;

    const step = Math.min(CFG.SEEK_STEP_PX, best.dist * 0.18);
    const ux = best.dx / best.dist;
    const uy = best.dy / best.dist;

    const ndx = ux * step;
    const ndy = uy * step * CFG.SEEK_Y_MUL;

    // WB座標を直接動かせる環境はここを増やすと自然になるが、
    // 今は“軽く押すだけ”にして喧嘩を避ける
    if (best.bunny?.wrap) {
      nudgeWrapTransformToward(best.bunny.wrap, ndx, ndy);
    } else if (best.bunny?.wrap == null && best.bunny?.wrap !== undefined) {
      // 何もしない
    } else {
      // fallback構造（wrapのみ）
      if (best.bunny.wrap) nudgeWrapTransformToward(best.bunny.wrap, ndx, ndy);
    }
  }

  let tickTimer = 0;
  function startEatSeekLoop() {
    if (tickTimer) return;
    tickTimer = window.setInterval(() => {
      // ✅ dropが無いなら即return（軽い）
      if (!document.querySelector(".oyatuDropV14")) return;
      tickEatSeek();
    }, CFG.TICK_MS);
  }

  /* =========================
   * Modal
   * ========================= */
  const MODAL_ID = "oyatuModalV14";
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
            「落とす」1個ごとに <b>${CFG.COST_PER_DROP}🪙</b> 消費します（連打＝連続課金）。<br>
            落ちたおやつは「クリックで拾う」or「うさぎが取りに来て食べる」どちらでもOK。<br>
            拾う/食べると「次のうさぎクリックが2倍（30秒以内・1回）」になります。
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
          <div class="hint">※ SEは最短 ${CFG.DROP_SE_COOLDOWN_MS}ms 間隔で鳴ります</div>
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
        selectedId = String(t.dataset.pick || "random");
        $$(".pick", m).forEach(p => p.classList.toggle("on", (p.dataset.pick || "") === selectedId));
        renderModalMeta();
      });
    }

    m.querySelector("[data-drop]")?.addEventListener("click", () => {
      spawnDrop(selectedId);
      renderModalMeta();
    });

    m.querySelector("[data-clear]")?.addEventListener("click", () => {
      $$(".oyatuDropV14", field).forEach(el => { try { el.remove(); } catch {} });
      renderModalMeta();
    });

    return m;
  }

  function renderModalMeta() {
    const m = document.getElementById(MODAL_ID);
    if (!m || m.style.display !== "block") return;

    const countEl = m.querySelector("[data-count]");
    if (countEl) countEl.textContent = String(dropsOnFieldCount());

    const WB = window.WB || null;
    const coins = readCoinsDirect(WB);
    const cost = CFG.COST_PER_DROP;

    const coinsEl = m.querySelector("[data-coins]");
    if (coinsEl) coinsEl.textContent = String(coins);

    const canEl = m.querySelector("[data-can]");
    if (canEl) canEl.textContent = String(cost > 0 ? Math.floor(coins / cost) : 9999);

    const buffEl = m.querySelector("[data-buff]");
    if (buffEl) {
      const b = loadBuff();
      if (!b) buffEl.textContent = "なし";
      else if (b.used) buffEl.textContent = "使用済み（拾う/食べるで再付与）";
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
      }, 280);
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
   * Boot
   * ========================= */
  const btn = document.getElementById(CFG.HUD_BTN_ID);
  if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });

  try { hookCoinChangedIfPossible(window.WB || null); } catch {}
  startCoinWatchFallback();
  startEatSeekLoop();

  // バフ表示更新
  let lastT = performance.now();
  function raf(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const b = loadBuff();
    if (b && Date.now() > b.until) { clearBuff(); updateBadge(); }
    else updateBadge();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };

  console.log("[oyatu] ready v1.4.3 (lighter + forced remove + single seeker)", {
    costPerDrop: CFG.COST_PER_DROP,
    tickMs: CFG.TICK_MS,
    eatDist: CFG.EAT_DIST_PX,
    seekRadius: CFG.SEEK_RADIUS_PX,
    seekStep: CFG.SEEK_STEP_PX,
  });
})();
