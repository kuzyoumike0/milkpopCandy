// oyatu.js v1.4.2
// ✅ v1.4.1 + NEW: うさぎが「おやつへ取りに行く（吸い寄せ）」
// - おやつ（着地済み）があると、近い うさぎ をターゲットへ少しずつ誘導
// - 近づいたら赤枠 → 食べて消える（バフ付与）
// - クリックで拾うも残す
// - 軽量：120ms tick / 最大個数制限 / 毎フレーム更新なし
//
// 注意：app.js が transform で動かす環境向けに、
// 1) WB.getBunnies() の b.x/b.y 等を優先更新（可能なら“本体座標”を動かす）
// 2) 取れない環境では wrap の transform を「軽く上書き」して押す（保険）
// という二段構え。

(() => {
  "use strict";
  if (window.__OYATU_V142__) return;
  window.__OYATU_V142__ = true;

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

    // ===== 自動で食べる =====
    EAT_TICK_MS: 120,
    EAT_DIST_PX: 46,
    EAT_HINT_MS: 220,
    EAT_OUTLINE: "rgba(255,64,64,.85)",

    // ===== 取りに行く（誘導） =====
    SEEK_RADIUS_PX: 260,     // この距離以内におやつがあると取りに行く
    SEEK_STOP_PX: 58,        // 近すぎると押しすぎない
    SEEK_PULL_PX_PER_TICK: 6, // 1tickで押す最大px（軽い吸い寄せ）
    SEEK_Y_MUL: 0.55,        // 縦方向は少し弱め（地面付近で自然）

    BUNNY_WRAP_SELECTOR: ".bunnyWrap, .bunny-wrap",
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
@keyframes oyatuToastIn{ from{ opacity:0; transform:translate(-50%,-70%); } to{ opacity:1; transform:translate(-50%,-50%); } }
@keyframes oyatuToastOut{ from{ opacity:1; transform:translate(-50%,-50%); } to{ opacity:0; transform:translate(-50%,-35%); } }
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
   * SE
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
    if (document.getElementById("oyatuCssV142")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV142";
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
  outline: 4px solid ${CFG.EAT_OUTLINE};
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
   * Drops
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
  function getDropCost() { return CFG.COST_PER_DROP; }

  function removeDrop(d, reason = "pickup") {
    if (!d || !d.isConnected) return;
    if (d.__oyatuRemoving) return;
    d.__oyatuRemoving = true;

    d.classList.remove("near");
    d.classList.remove("show");
    d.classList.add("hide");

    setTimeout(() => { try { d.remove(); } catch {} }, CFG.FADE_MS + 40);

    // ✅ 拾った/食べた扱い：バフ付与
    startBuff();
    try { window.WB?.emit?.("oyatu:pickup", { reason, until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}
  }

  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) {
      toast(`同時最大 ${CFG.MAX_DROPS_ON_FIELD} 個までだよ`);
      return false;
    }

    const WB = window.WB || null;
    const cost = getDropCost();
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
    d.className = "oyatuDropV14";
    d.dataset.oyatu = "1";
    d.id = `oyatuDropV14_${++dropSeq}`;
    d.style.setProperty("--x", `${Math.round(x)}px`);
    d.style.setProperty("--y", `${Math.round(y)}px`);
    d.innerHTML = `<img alt="おやつ">`;

    d.__oyatuLanded = false;
    d.__nearSince = 0;

    const img = d.querySelector("img");
    if (img) {
      img.src = src;
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeDrop(d, "click");
    });

    field.appendChild(d);

    requestAnimationFrame(() => {
      d.classList.add("show");
      d.style.animation = `oyatuFallV14 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!d.isConnected) return;
        d.__oyatuLanded = true;
        d.style.animation = `oyatuBobV14 1.8s ease-in-out infinite`;
      }, CFG.FALL_MS + 10);
    });

    try { window.WB?.emit?.("oyatu:drop", { id: String(selectedId || "random"), cost }); } catch {}
    return true;
  }

  /* =========================
   * ✅ 取りに行く（誘導）: bunny座標更新（できるだけWB本体に寄せる）
   * ========================= */
  function getBunnyListFromWB() {
    const WB = window.WB || null;
    try { if (WB && typeof WB.getBunnies === "function") return WB.getBunnies() || []; } catch {}
    try { if (WB && Array.isArray(WB.bunnies)) return WB.bunnies; } catch {}
    return [];
  }

  function rectCenter(r) { return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }

  function setBunnyXY(bunny, nx, ny) {
    // ✅ 1) よくある座標プロパティ候補に書き込む（app.jsがそれでtransform組むなら勝つ）
    const candidates = [
      ["x", "y"],
      ["_x", "_y"],
      ["px", "py"],
    ];

    for (const [kx, ky] of candidates) {
      if (bunny && Number.isFinite(bunny[kx]) && Number.isFinite(bunny[ky])) {
        bunny[kx] = nx;
        bunny[ky] = ny;
        try { bunny.update?.(); } catch {}
        try { bunny.render?.(); } catch {}
        try { bunny.apply?.(); } catch {}
        return true;
      }
    }

    // pos / position オブジェクト
    try {
      if (bunny?.pos && Number.isFinite(bunny.pos.x) && Number.isFinite(bunny.pos.y)) {
        bunny.pos.x = nx; bunny.pos.y = ny;
        try { bunny.update?.(); } catch {}
        try { bunny.render?.(); } catch {}
        return true;
      }
      if (bunny?.position && Number.isFinite(bunny.position.x) && Number.isFinite(bunny.position.y)) {
        bunny.position.x = nx; bunny.position.y = ny;
        try { bunny.update?.(); } catch {}
        try { bunny.render?.(); } catch {}
        return true;
      }
    } catch {}

    // ✅ 2) 最後の保険：wrapのtransformを“押す”（上書きされても tick で押し続ける）
    try {
      const w = bunny?.wrap;
      if (w && w.style) {
        w.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
        return true;
      }
    } catch {}

    return false;
  }

  function tryNudgeBunnyTowardDrop(bunny, bunnyRect, dropCenter) {
    if (!bunny || !bunnyRect) return;

    const bc = rectCenter(bunnyRect);
    const dx = dropCenter.x - bc.x;
    const dy = dropCenter.y - bc.y;

    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist <= 0.01) return;

    // 近すぎたら押しすぎない（食べ判定に任せる）
    if (dist < CFG.SEEK_STOP_PX) return;
    if (dist > CFG.SEEK_RADIUS_PX) return;

    // 1tickの最大押し量（上品）
    const step = Math.min(CFG.SEEK_PULL_PX_PER_TICK, dist * 0.18);
    const ux = dx / dist;
    const uy = dy / dist;

    // “画面上の見た目座標”で押す量（pixel）
    const ndx = ux * step;
    const ndy = uy * step * CFG.SEEK_Y_MUL;

    // bunnyの“現在座標”推定：WB座標が分からないので、画面座標の差分だけ足す
    // → app.jsがtransformで動かしてても、tickで押し続けることで「取りに行く」感が出る
    const w = bunny?.wrap;
    if (!w || !w.isConnected) return;

    // 現在のtransformから推定（matrix / translate3d 両対応）
    let cx = 0, cy = 0;
    try {
      const tr = w.style.transform || "";
      const m3 = tr.match(/translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/i);
      const m2 = tr.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px/i);
      const mm = tr.match(/matrix\(\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+),\s*([-\d.e]+)\s*\)/i);
      const mm3 = tr.match(/matrix3d\((.+)\)/i);

      if (m3) { cx = parseFloat(m3[1]) || 0; cy = parseFloat(m3[2]) || 0; }
      else if (m2) { cx = parseFloat(m2[1]) || 0; cy = parseFloat(m2[2]) || 0; }
      else if (mm) { cx = parseFloat(mm[5]) || 0; cy = parseFloat(mm[6]) || 0; }
      else if (mm3) {
        const parts = mm3[1].split(",").map(s => parseFloat(s.trim()));
        // matrix3d: 13,14 が translateX/Y
        if (parts.length >= 16) { cx = parts[12] || 0; cy = parts[13] || 0; }
      }
    } catch {}

    // 押す
    const nx = cx + ndx;
    const ny = cy + ndy;

    // WB本体に入れられるならそれが最優先（勝ちやすい）
    if (!setBunnyXY(bunny, nx, ny)) {
      // setBunnyXY 内で wrap transform 上書きまでやる
    }
  }

  /* =========================
   * ✅ 自動で食べる + 取りに行く tick（同じループで軽量）
   * ========================= */
  function getBunnyWraps() { return $$(CFG.BUNNY_WRAP_SELECTOR, document); }

  function eatAndSeekTick() {
    const drops = $$(".oyatuDropV14", field).filter(d => d && d.isConnected && !d.__oyatuRemoving && d.__oyatuLanded);
    if (!drops.length) return;

    // drop rect/center を先計算
    const dropInfo = [];
    for (const d of drops) {
      const r = d.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      dropInfo.push({ el: d, r, c: rectCenter(r) });
    }
    if (!dropInfo.length) return;

    // bunny一覧（WB優先）
    const list = getBunnyListFromWB();
    const wrapList = getBunnyWraps();

    // bunnyRect を集める（WBのbunnyとwrapをマッチさせたい）
    // できるだけ b.wrap があるものを優先し、無ければDOM順で当てる
    const bunnyRects = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const w = b?.wrap || null;
      const el = (w && w.isConnected) ? w : (wrapList[i] || null);
      if (!el || !el.isConnected) continue;
      const br = el.getBoundingClientRect();
      if (!br.width || !br.height) continue;
      bunnyRects.push({ bunny: b, el, r: br, c: rectCenter(br) });
    }
    // WBが取れない場合もDOMだけで誘導（最低限）
    if (!bunnyRects.length) {
      for (const el of wrapList) {
        if (!el || !el.isConnected) continue;
        const br = el.getBoundingClientRect();
        if (!br.width || !br.height) continue;
        bunnyRects.push({ bunny: { wrap: el }, el, r: br, c: rectCenter(br) });
      }
    }
    if (!bunnyRects.length) return;

    const now = Date.now();

    // 1) 取りに行く：各うさぎに最寄りおやつを割り当てて押す
    for (const b of bunnyRects) {
      let best = null;
      let bestDist = Infinity;

      for (const di of dropInfo) {
        const dx = di.c.x - b.c.x;
        const dy = di.c.y - b.c.y;
        const d = Math.hypot(dx, dy);
        if (d < bestDist) { bestDist = d; best = di; }
      }
      if (!best) continue;

      // 誘導（近い距離だけ）
      tryNudgeBunnyTowardDrop(b.bunny, b.r, best.c);
    }

    // 2) 食べる判定：おやつ側で「最寄りうさぎ」との距離で処理
    for (const di of dropInfo) {
      const dEl = di.el;
      if (!dEl || !dEl.isConnected || dEl.__oyatuRemoving) continue;

      // 最寄りうさぎを探す
      let bestB = null;
      let bestDist = Infinity;

      for (const b of bunnyRects) {
        const dx = di.c.x - b.c.x;
        const dy = di.c.y - b.c.y;
        const d = Math.hypot(dx, dy);
        if (d < bestDist) { bestDist = d; bestB = b; }
      }

      const near = bestDist <= CFG.EAT_DIST_PX;

      if (near) {
        dEl.classList.add("near");
        if (!dEl.__nearSince) dEl.__nearSince = now;

        if ((now - dEl.__nearSince) >= CFG.EAT_HINT_MS) {
          playDropSE();          // ぱくっ（軽いSE）
          removeDrop(dEl, "eat");
        }
      } else {
        dEl.classList.remove("near");
        dEl.__nearSince = 0;
      }
    }
  }

  let eatTimer = 0;
  function startEatLoop() {
    if (eatTimer) return;
    eatTimer = window.setInterval(eatAndSeekTick, CFG.EAT_TICK_MS);
  }

  /* =========================
   * 2倍処理
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
      const cur = readCoinsDirect(WB);
      onCoinsChanged(cur);
    }, 200);
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
            落ちたおやつは「クリックで拾う」か「うさぎが取りに来て食べる」どちらでもOK。<br>
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
      $$(".oyatuDropV14", field).forEach(el => { try { el.remove(); } catch {} });
      renderModalMeta();
    });

    return m;
  }

  function setSelected(id) {
    selectedId = String(id || "random");
    const m = ensureModal();
    $$(".pick", m).forEach(p => p.classList.toggle("on", (p.dataset.pick || "") === selectedId));
    const costEl = m.querySelector("[data-cost]");
    if (costEl) costEl.textContent = String(getDropCost());
  }

  function renderModalMeta() {
    const m = document.getElementById(MODAL_ID);
    if (!m || m.style.display !== "block") return;

    const countEl = m.querySelector("[data-count]");
    if (countEl) countEl.textContent = String(dropsOnFieldCount());

    const WB = window.WB || null;
    const coins = readCoinsDirect(WB);
    const cost = getDropCost();

    const coinsEl = m.querySelector("[data-coins]");
    if (coinsEl) coinsEl.textContent = String(coins);

    const canEl = m.querySelector("[data-can]");
    if (canEl) canEl.textContent = String(cost > 0 ? Math.floor(coins / cost) : 9999);

    const buffEl = m.querySelector("[data-buff]");
    if (buffEl) {
      const b = loadBuff();
      if (!b) buffEl.textContent = "なし";
      else if (b.used) buffEl.textContent = "使用済み（次は拾って/食べて再付与）";
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
   * Main loop
   * ========================= */
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
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

  // ✅ 自動で食べる + 取りに行く
  startEatLoop();

  requestAnimationFrame(loop);

  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };

  console.log("[oyatu] ready v1.4.2 (paid drops + auto eat + seek)", {
    btn: CFG.HUD_BTN_ID,
    costPerDrop: CFG.COST_PER_DROP,
    maxDrops: CFG.MAX_DROPS_ON_FIELD,
    buffMs: CFG.BUFF_WINDOW_MS,
    seCooldownMs: CFG.DROP_SE_COOLDOWN_MS,
    seekRadius: CFG.SEEK_RADIUS_PX,
    seekPull: CFG.SEEK_PULL_PX_PER_TICK,
  });
})();
