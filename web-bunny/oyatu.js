// oyatu.js（HUD追加：モーダルで選択 + 連打で落とす + 拾うと「次のクリック2倍」）v1.2.0
// ✅ HUDに #oyatuBtn があれば押してモーダルを開く
// ✅ モーダルでおやつ画像を選択（ランダムも可）
// ✅ 「落とす」ボタンを連打で複数個落とせる（同時最大数あり）
// ✅ 落ちたおやつをクリックで拾う → 30秒以内に“1回だけ”うさぎクリック獲得2倍
// ✅ coinChanged / 監視フォールバック両対応
// ✅ LS：バフ状態のみ保存（ドロップは多重なので保存しない＝軽量）
//
// 画像は assets/oyatu/ に置いてください（このパスで参照）
// - ./assets/oyatu/candy_candycane_halloween_orange.png
// - ./assets/oyatu/wataame_white.png
// - ./assets/oyatu/cupcake_cream_pink_choco.png
// - ./assets/oyatu/orange_cut.png
//
// デバッグ：window.OYATU.open() / window.OYATU.dropNow() / window.OYATU.clearBuff()

(() => {
  "use strict";
  if (window.__OYATU_V120__) return;
  window.__OYATU_V120__ = true;

  const CFG = {
    FIELD_ID: "field",
    HUD_BTN_ID: "oyatuBtn",

    // おやつ画像（添付の4つ）
    OYATU_LIST: [
      { id: "candy",   name: "キャンディケイン", src: "./assets/oyatu/candy_candycane_halloween_orange.png" },
      { id: "wataame", name: "わたあめ",         src: "./assets/oyatu/wataame_white.png" },
      { id: "cupcake", name: "カップケーキ",     src: "./assets/oyatu/cupcake_cream_pink_choco.png" },
      { id: "orange",  name: "オレンジ",         src: "./assets/oyatu/orange_cut.png" },
    ],

    // 同時に画面へ存在できる最大数（連打の暴走ガード）
    MAX_DROPS_ON_FIELD: 10,

    // 落下演出
    FALL_MS: 820,

    // 表示
    SIZE: 56,
    Z: 260000,

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
   * CSS
   * ========================= */
  function ensureCss() {
    if (document.getElementById("oyatuCssV12")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV12";
    s.textContent = `
@keyframes oyatuFallV12{
  0%{ transform:translate3d(var(--x), -90px, 0) rotate(-10deg); opacity:0; }
  12%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV12{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 5px), 0) rotate(3deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
}
.oyatuDropV12{
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
.oyatuDropV12.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV12.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
.oyatuDropV12 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}

/* バフ表示（右下） */
#oyatuBuffBadgeV12{
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
#oyatuModalV12{ position:fixed; inset:0; z-index:2147483647; display:none; }
#oyatuModalV12 .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#oyatuModalV12 .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(520px, 92vw);
  max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#oyatuModalV12 .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#oyatuModalV12 .title{ font-weight:1000; letter-spacing:.02em; }
#oyatuModalV12 .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;
}
#oyatuModalV12 .body{ padding:12px 14px 14px; overflow:auto; }
#oyatuModalV12 .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
#oyatuModalV12 .pick{
  border:2px solid rgba(0,0,0,.10);
  border-radius:14px; padding:10px;
  display:flex; align-items:center; gap:10px;
  background:#fff;
  cursor:pointer;
  user-select:none;
}
#oyatuModalV12 .pick.on{ border-color: rgba(255,120,180,.65); box-shadow:0 10px 22px rgba(0,0,0,.08); }
#oyatuModalV12 .pick img{ width:40px; height:40px; image-rendering:pixelated; }
#oyatuModalV12 .pick .name{ font-weight:1000; font-size:12px; opacity:.9; }
#oyatuModalV12 .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; }
#oyatuModalV12 .btn{
  border:none; border-radius:12px;
  padding:10px 12px; font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#oyatuModalV12 .btn.primary{ background:#ffd6e7; }
#oyatuModalV12 .hint{ font-size:12px; opacity:.78; font-weight:900; line-height:1.35; }
`;
    document.head.appendChild(s);
  }
  ensureCss();

  /* =========================
   * Buff（30秒以内に1回だけ2倍）※拾ったら“再付与”できる
   * ========================= */
  function loadBuff() {
    const b = loadJson(CFG.LS_BUFF, null);
    if (!b || typeof b !== "object") return null;
    const until = Number(b.until || 0);
    const used = !!b.used;
    if (!until || !Number.isFinite(until)) return null;
    return { until, used };
  }
  function saveBuff(until, used) {
    saveJson(CFG.LS_BUFF, { until, used: !!used });
  }
  function clearBuff() { rm(CFG.LS_BUFF); }

  // 右下バッジ
  let badgeEl = null;
  function ensureBadge() {
    if (badgeEl && badgeEl.isConnected) return badgeEl;
    const d = document.createElement("div");
    d.id = "oyatuBuffBadgeV12";
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
    // 既存バフがあっても「使い切ってたら復活」「未使用なら延長」
    const now = Date.now();
    const cur = loadBuff();
    const until = now + CFG.BUFF_WINDOW_MS;

    if (!cur) {
      saveBuff(until, false);
    } else {
      // 未使用なら残りを“最大”にして延長、使用済みなら復活
      saveBuff(Math.max(cur.until || 0, until), false);
    }
    updateBadge();
  }

  /* =========================
   * Drops（複数）
   * ========================= */
  let dropSeq = 0;

  function dropsOnFieldCount() {
    return $$(".oyatuDropV12", field).length;
  }

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

  function spawnDrop(selectedId) {
    if (dropsOnFieldCount() >= CFG.MAX_DROPS_ON_FIELD) return false;

    const fr = field.getBoundingClientRect();
    const size = CFG.SIZE;

    const x = clamp(30 + Math.random() * (fr.width - 60), 6, Math.max(6, fr.width - size - 6));
    const y = clamp(fr.height * (0.55 + Math.random() * 0.30), 6, Math.max(6, fr.height - size - 6));
    const src = pickSrc(selectedId);

    const d = document.createElement("div");
    d.className = "oyatuDropV12";
    d.dataset.oyatu = "1";
    d.id = `oyatuDropV12_${++dropSeq}`;
    d.style.setProperty("--x", `${Math.round(x)}px`);
    d.style.setProperty("--y", `${Math.round(y)}px`);
    d.innerHTML = `<img alt="おやつ">`;

    const img = d.querySelector("img");
    if (img) {
      img.src = src;
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    // クリックで拾う
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // バフ発動
      startBuff();

      // 消す
      d.classList.remove("show");
      d.classList.add("hide");
      setTimeout(() => { try { d.remove(); } catch {} }, CFG.FADE_MS + 40);

      try { window.WB?.emit?.("oyatu:pickup", { until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}
    });

    field.appendChild(d);

    // 落下 → 着地後ゆらゆら
    requestAnimationFrame(() => {
      d.classList.add("show");
      d.style.animation = `oyatuFallV12 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!d.isConnected) return;
        d.style.animation = `oyatuBobV12 1.8s ease-in-out infinite`;
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

  // うさぎクリック捕捉（既存処理を邪魔しない）
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

    // 直前のうさぎクリック由来なら、その増加分をもう1回足す（=2倍）
    if (lastBunnyClickAt && (now - lastBunnyClickAt) <= CFG.COINCLICK_WINDOW_MS) {
      const WB = window.WB || null;
      addCoins(WB, diff);

      // 1回だけ
      saveBuff(b.until, true);
      updateBadge();
      lastBunnyClickAt = 0;

      try { WB?.emit?.("oyatu:double", { bonus: diff }); } catch {}
    }
  }

  // coinChangedフック（あれば）
  function hookCoinChangedIfPossible(WB) {
    try {
      if (WB?.on && !WB.__oyatuCoinHookedV12) {
        WB.__oyatuCoinHookedV12 = true;
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

  // フォールバック監視
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
  const MODAL_ID = "oyatuModalV12";
  let selectedId = "random"; // デフォ：ランダム

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
          <div class="hint">選んだおやつを「落とす」ボタンで連打ドロップできます。落ちたおやつを拾うと「次のうさぎクリックが2倍（30秒以内・1回）」になります。</div>
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
        </div>
      </div>
    `;
    document.body.appendChild(m);

    m.querySelector(".bg")?.addEventListener("click", () => closeModal());
    m.querySelector(".close")?.addEventListener("click", () => closeModal());
    m.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    const grid = m.querySelector("[data-grid]");
    if (grid) {
      // ランダム枠
      const randomPick = document.createElement("div");
      randomPick.className = "pick on";
      randomPick.dataset.pick = "random";
      randomPick.innerHTML = `
        <img src="${CFG.OYATU_LIST[0].src}" style="opacity:.55" alt="random">
        <div class="name">ランダム</div>
      `;
      grid.appendChild(randomPick);

      // 実画像枠
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
      });
    }

    m.querySelector("[data-drop]")?.addEventListener("click", () => {
      // 連打で落とせる
      spawnDrop(selectedId);
      renderModalMeta();
    });

    m.querySelector("[data-clear]")?.addEventListener("click", () => {
      $$(".oyatuDropV12", field).forEach(el => { try { el.remove(); } catch {} });
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
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // 期限切れ掃除
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
  // HUDボタン
  const btn = document.getElementById(CFG.HUD_BTN_ID);
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  }

  // コインフック
  try { hookCoinChangedIfPossible(window.WB || null); } catch {}
  startCoinWatchFallback();

  requestAnimationFrame(loop);

  // Public API
  window.OYATU = window.OYATU || {};
  window.OYATU.open = () => openModal();
  window.OYATU.close = () => closeModal();
  window.OYATU.dropNow = (id = "random") => spawnDrop(String(id));
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };

  console.log("[oyatu] ready v1.2.0", {
    btn: CFG.HUD_BTN_ID,
    maxDrops: CFG.MAX_DROPS_ON_FIELD,
    buffMs: CFG.BUFF_WINDOW_MS,
  });
})();
