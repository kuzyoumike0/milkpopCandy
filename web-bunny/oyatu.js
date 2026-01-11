// oyatu.js（HUD追加：モーダルで選択 + 連打で落とす + 落とす時SE + 60msクール + 拾うと「次のクリック2倍」）v1.3.2
// ✅ HUDに #oyatuBtn があれば押してモーダルを開く
// ✅ モーダルでおやつ画像を選択（ランダムも可）
// ✅ 「落とす」ボタンを連打で複数個落とせる（同時最大数あり）
// ✅ 落とした瞬間にSE（BGM.jsのSEスライダー追従）
// ✅ SE最短間隔クールダウン（デフォ60ms）
// ✅ 落ちたおやつをクリックで拾う → 30秒以内に“1回だけ”うさぎクリック獲得2倍
// ✅ coinChanged / 監視フォールバック両対応
// ✅ LS：バフ状態のみ保存（ドロップは多重なので保存しない＝軽量）
//
// ✅ v1.3.1 変更点
// - 地面まで落とす：field下端に固定して落下
// - サイズを小さく：SIZE を 56 → 40 に
//
// ✅ v1.3.2 追加点
// - うさぎが近づいたら自動で「食べる」（当たり判定）
//   ※ うさぎの移動ロジックは壊さない（誘導しない）
//   ※ 食べた時も拾った時と同じバフ付与
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
// 読み込み：mirrorball_dance.js の前〜最後の方推奨
//
// デバッグ：window.OYATU.open() / window.OYATU.dropNow() / window.OYATU.clearBuff()

(() => {
  "use strict";
  if (window.__OYATU_V132__) return;
  window.__OYATU_V132__ = true;

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
    FALL_MS: 820,

    SIZE: 40,
    Z: 260000,

    OYATU_DROP_SE_SRC: "./assets/se/Onoma-Pop04-1(High-Dry).mp3",
    OYATU_DROP_SE_BASE: 1.0,

    DROP_SE_COOLDOWN_MS: 60,

    GROUND_MARGIN_PX: 8,

    // ✅ うさぎが食べる判定
    AUTO_EAT_ENABLED: true,
    EAT_CHECK_MS: 120,
    EAT_RADIUS_PX: 34,     // 中心距離がこの値以下なら食べる
    EAT_AFTER_LAND_ONLY: true, // 落下中に食べない（地面到達後のみ）

    BUFF_WINDOW_MS: 30_000,
    COINCLICK_WINDOW_MS: 320,
    LS_BUFF: "milkpop_oyatu_buff_v2",

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
  function saveJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  function rm(key) { try { localStorage.removeItem(key); } catch {} }

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
   * SE + cooldown
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
    if (document.getElementById("oyatuCssV132")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV132";
    s.textContent = `
@keyframes oyatuFallV132{
  0%{ transform:translate3d(var(--x), -90px, 0) rotate(-10deg); opacity:0; }
  12%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV132{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-2deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 3px), 0) rotate(2deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-2deg); }
}
@keyframes oyatuEatPopV132{
  0%{ transform:translate3d(var(--x), var(--y), 0) scale(1) rotate(6deg); opacity:1; }
  40%{ transform:translate3d(var(--x), var(--y), 0) scale(1.08) rotate(-6deg); opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) scale(0.2) rotate(12deg); opacity:0; }
}
.oyatuDropV132{
  position:absolute; left:0; top:0;
  width:${CFG.SIZE}px; height:${CFG.SIZE}px;
  z-index:${CFG.Z};
  cursor:pointer;
  user-select:none; -webkit-user-drag:none;
  touch-action: manipulation;
  will-change: transform, opacity;
  opacity:0;
}
.oyatuDropV132.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV132.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV132 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}
#oyatuBuffBadgeV132{
  position:fixed; right:10px; bottom:10px;
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
#oyatuModalV132{ position:fixed; inset:0; z-index:2147483647; display:none; }
#oyatuModalV132 .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#oyatuModalV132 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(520px, 92vw);
  max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#oyatuModalV132 .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#oyatuModalV132 .title{ font-weight:1000; letter-spacing:.02em; }
#oyatuModalV132 .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;
}
#oyatuModalV132 .body{ padding:12px 14px 14px; overflow:auto; }
#oyatuModalV132 .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
#oyatuModalV132 .pick{
  border:2px solid rgba(0,0,0,.10);
  border-radius:14px; padding:10px;
  display:flex; align-items:center; gap:10px;
  background:#fff;
  cursor:pointer;
  user-select:none;
}
#oyatuModalV132 .pick.on{ border-color: rgba(255,120,180,.65); box-shadow:0 10px 22px rgba(0,0,0,.08); }
#oyatuModalV132 .pick img{ width:40px; height:40px; image-rendering:pixelated; }
#oyatuModalV132 .pick .name{ font-weight:1000; font-size:12px; opacity:.9; }
#oyatuModalV132 .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; }
#oyatuModalV132 .btn{
  border:none; border-radius:12px;
  padding:10px 12px; font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#oyatuModalV132 .btn.primary{ background:#ffd6e7; }
#oyatuModalV132 .hint{ font-size:12px; opacity:.78; font-weight:900; line-height:1.35; }
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
    d.id = "oyatuBuffBadgeV132";
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

  function dropsOnFieldCount() { return $$(".oyatuDropV132", field).length; }

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

  function eatDrop(dropEl, reason = "bunny") {
    if (!dropEl || !dropEl.isConnected) return;
    if (dropEl.dataset.eaten === "1") return;
    dropEl.dataset.eaten = "1";

    // ✅ 食べた扱いでバフ付与（クリック拾いと同じ効果）
    startBuff();

    // 見た目：パクッと消える
    dropEl.style.animation = `oyatuEatPopV132 220ms ease-out forwards`;
    setTimeout(() => { try { dropEl.remove(); } catch {} }, 260);

    try { window.WB?.emit?.("oyatu:eat", { by: reason }); } catch {}
  }

  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) return false;

    playDropSE();

    const fr = field.getBoundingClientRect();
    const size = CFG.SIZE;

    const x = clamp(
      30 + Math.random() * (fr.width - 60),
      6,
      Math.max(6, fr.width - size - 6)
    );

    const groundY = clamp(
      fr.height - size - CFG.GROUND_MARGIN_PX,
      6,
      Math.max(6, fr.height - size - 6)
    );

    const src = pickSrc(selectedId);

    const d = document.createElement("div");
    d.className = "oyatuDropV132";
    d.dataset.oyatu = "1";
    d.dataset.landed = "0";
    d.id = `oyatuDropV132_${++dropSeq}`;
    d.style.setProperty("--x", `${Math.round(x)}px`);
    d.style.setProperty("--y", `${Math.round(groundY)}px`);
    d.innerHTML = `<img alt="おやつ">`;

    const img = d.querySelector("img");
    if (img) {
      img.src = src;
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    // クリックで拾う（手動）
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      eatDrop(d, "click");
      try { window.WB?.emit?.("oyatu:pickup", { until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}
    });

    field.appendChild(d);

    requestAnimationFrame(() => {
      d.classList.add("show");
      d.style.animation = `oyatuFallV132 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!d.isConnected) return;
        d.dataset.landed = "1"; // ✅ 着地
        d.style.animation = `oyatuBobV132 1.8s ease-in-out infinite`;
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
      if (WB?.on && !WB.__oyatuCoinHookedV132) {
        WB.__oyatuCoinHookedV132 = true;
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
   * ✅ Bunny auto-eat（衝突で食べる）
   * ========================= */
  function getCenterRect(el) {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
  }

  function tickAutoEat() {
    if (!CFG.AUTO_EAT_ENABLED) return;

    const drops = $$(".oyatuDropV132", field);
    if (!drops.length) return;

    const bunnies = $$(".bunnyWrap, .bunny-wrap", document);
    if (!bunnies.length) return;

    // 近い順で早く消えるようにする（軽量）
    for (const d of drops) {
      if (!d.isConnected) continue;
      if (d.dataset.eaten === "1") continue;
      if (CFG.EAT_AFTER_LAND_ONLY && d.dataset.landed !== "1") continue;

      const dc = getCenterRect(d);

      for (const b of bunnies) {
        if (!b.isConnected) continue;

        const bc = getCenterRect(b);
        const dx = dc.cx - bc.cx;
        const dy = dc.cy - bc.cy;
        const dist = Math.hypot(dx, dy);

        if (dist <= CFG.EAT_RADIUS_PX) {
          eatDrop(d, "bunny");
          break;
        }
      }
    }
  }

  let autoEatTimer = 0;
  function startAutoEatLoop() {
    if (autoEatTimer) return;
    autoEatTimer = window.setInterval(() => {
      try { tickAutoEat(); } catch {}
    }, CFG.EAT_CHECK_MS);
  }

  /* =========================
   * Modal
   * ========================= */
  const MODAL_ID = "oyatuModalV132";
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
          <div class="hint">「落とす」で連打ドロップ。落ちたおやつはクリックで拾えるほか、うさぎが近づくと自動で食べます（同じバフ付与）。</div>
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
      $$(".oyatuDropV132", field).forEach(el => { try { el.remove(); } catch {} });
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

  // ✅ 自動で食べるループ開始
  startAutoEatLoop();

  requestAnimationFrame(loop);

  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };
  window.OYATU.setAutoEat = (on) => { CFG.AUTO_EAT_ENABLED = !!on; };

  console.log("[oyatu] ready v1.3.2", {
    btn: CFG.HUD_BTN_ID,
    maxDrops: CFG.MAX_DROPS_ON_FIELD,
    buffMs: CFG.BUFF_WINDOW_MS,
    seCooldownMs: CFG.DROP_SE_COOLDOWN_MS,
    size: CFG.SIZE,
    groundMargin: CFG.GROUND_MARGIN_PX,
    autoEat: CFG.AUTO_EAT_ENABLED,
    eatRadius: CFG.EAT_RADIUS_PX,
  });
})();
