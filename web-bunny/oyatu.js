// oyatu.js（おやつドロップ + 30秒以内「1回だけクリック獲得2倍」）v1.0.0
// ✅ たまに「おやつ（添付画像）」が空から落ちてくる（1個だけ保持）
// ✅ クリックで拾うと「おやつバフ」発動：30秒以内に“1回だけ”うさぎクリック獲得が2倍
// ✅ うさぎクリックを DOM で検出（.bunnyWrap / .bunny-wrap）→ coinChanged の増加分に追撃して2倍を実現
// ✅ WB.se（あれば）/ SEスライダー追従は呼び出しだけ（SE素材は任意）
// ✅ リロード後も：落ちてるおやつ・バフ状態を復元（LS）
//
// 画像は assets/oyatu/ に置いてください（このファイル名で）
// - ./assets/oyatu/candy_candycane_halloween_orange.png
// - ./assets/oyatu/wataame_white.png
// - ./assets/oyatu/cupcake_cream_pink_choco.png
// - ./assets/oyatu/orange_cut.png
//
// デバッグ：window.OYATU.dropNow() / window.OYATU.clearDrop() / window.OYATU.clearBuff()

(() => {
  "use strict";
  if (window.__OYATU_V100__) return;
  window.__OYATU_V100__ = true;

  const CFG = {
    FIELD_ID: "field",

    // ✅ おやつ画像（添付のやつ）
    OYATU_LIST: [
      "./assets/oyatu/candy_candycane_halloween_orange.png",
      "./assets/oyatu/wataame_white.png",
      "./assets/oyatu/cupcake_cream_pink_choco.png",
      "./assets/oyatu/orange_cut.png",
    ],

    // 出現率（1秒あたり）例：0.0012 => 平均約14分に1回
    DROP_CHANCE_PER_SEC: 0.0012,

    // 落下演出
    FALL_MS: 850,

    // 表示
    SIZE: 56,
    Z: 260000,

    // バフ
    BUFF_WINDOW_MS: 30_000, // 30秒
    COINCLICK_WINDOW_MS: 260, // うさぎクリック→coin増加が起こるまでの猶予
    // coinChangedで「増加分」を見て追撃するので、倍化は 1回だけ

    // localStorage
    LS_DROP: "milkpop_oyatu_drop_v1",
    LS_BUFF: "milkpop_oyatu_buff_v1",

    // クリック取りやすさ
    HIT_PAD: 10,

    // ふわっと消す
    FADE_MS: 160,
  };

  const field = document.getElementById(CFG.FIELD_ID);
  if (!field) return;

  // position保険
  if (getComputedStyle(field).position === "static") field.style.position = "relative";

  const $ = (q, p = document) => p.querySelector(q);

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
   * Coins helpers（加算だけ）
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
    if (document.getElementById("oyatuCssV1")) return;
    const s = document.createElement("style");
    s.id = "oyatuCssV1";
    s.textContent = `
@keyframes oyatuFallV1{
  0%{ transform:translate3d(var(--x), -90px, 0) rotate(-10deg); opacity:0; }
  10%{ opacity:1; }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(8deg); opacity:1; }
}
@keyframes oyatuBobV1{
  0%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
  50%{ transform:translate3d(var(--x), calc(var(--y) - 5px), 0) rotate(3deg); }
  100%{ transform:translate3d(var(--x), var(--y), 0) rotate(-3deg); }
}
#oyatuDropV1{
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
#oyatuDropV1.show{ opacity:1; transition:opacity ${CFG.FADE_MS}ms ease; }
#oyatuDropV1.hide{ opacity:0; transition:opacity ${CFG.FADE_MS}ms ease; }
#oyatuDropV1 img{
  width:100%; height:100%; display:block;
  pointer-events:none;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,.22));
}
#oyatuBuffBadgeV1{
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
`;
    document.head.appendChild(s);
  }
  ensureCss();

  /* =========================
   * Drop（1個だけ）
   * ========================= */
  let dropEl = null;

  function ensureDropEl() {
    if (dropEl && dropEl.isConnected) return dropEl;

    const d = document.createElement("div");
    d.id = "oyatuDropV1";
    d.innerHTML = `<img alt="おやつ">`;
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickupDrop();
    });

    field.appendChild(d);
    dropEl = d;
    return d;
  }

  function removeDropEl() {
    if (!dropEl) return;
    try { dropEl.remove(); } catch {}
    dropEl = null;
  }

  function saveDropState(st) { saveJson(CFG.LS_DROP, st); }
  function loadDropState() { return loadJson(CFG.LS_DROP, null); }
  function clearDropState() { rm(CFG.LS_DROP); }

  function hasDrop() {
    const st = loadDropState();
    return !!(st && st.active);
  }

  function pickOyatuSrc() {
    const list = CFG.OYATU_LIST.filter(Boolean);
    return list[Math.floor(Math.random() * list.length)] || CFG.OYATU_LIST[0];
  }

  function placeDrop(x, y, src, withFallAnim) {
    const fr = field.getBoundingClientRect();
    const size = CFG.SIZE;

    const xx = clamp(x, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.width - size - CFG.HIT_PAD));
    const yy = clamp(y, CFG.HIT_PAD, Math.max(CFG.HIT_PAD, fr.height - size - CFG.HIT_PAD));

    saveDropState({ active: true, x: xx, y: yy, src: String(src || ""), t: Date.now() });

    const el = ensureDropEl();
    const img = el.querySelector("img");
    if (img) {
      img.src = String(src || "");
      img.addEventListener("error", () => { img.style.opacity = "0"; }, { once: true });
    }

    el.style.setProperty("--x", `${Math.round(xx)}px`);
    el.style.setProperty("--y", `${Math.round(yy)}px`);
    el.classList.remove("hide");
    el.classList.add("show");

    if (withFallAnim) {
      el.style.opacity = "1";
      el.style.animation = `oyatuFallV1 ${CFG.FALL_MS}ms ease-out forwards`;
      setTimeout(() => {
        if (!el.isConnected) return;
        // 着地後はゆらゆら
        el.style.animation = `oyatuBobV1 1.8s ease-in-out infinite`;
      }, CFG.FALL_MS + 10);
    } else {
      el.style.animation = `oyatuBobV1 1.8s ease-in-out infinite`;
    }
  }

  function dropNow() {
    if (hasDrop()) return false;

    const fr = field.getBoundingClientRect();
    const x = 30 + Math.random() * (fr.width - 60);
    const y = fr.height * (0.55 + Math.random() * 0.30); // 下の方に落ちやすく

    placeDrop(x, y, pickOyatuSrc(), true);
    return true;
  }

  function restoreDropIfNeeded() {
    const st = loadDropState();
    if (!st || !st.active) return;
    placeDrop(Number(st.x) || 80, Number(st.y) || 140, st.src || pickOyatuSrc(), false);
  }

  /* =========================
   * Buff（30秒以内に1回だけ2倍）
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

  // バフ表示（右下）
  let badgeEl = null;
  function ensureBadge() {
    if (badgeEl && badgeEl.isConnected) return badgeEl;
    const d = document.createElement("div");
    d.id = "oyatuBuffBadgeV1";
    d.textContent = "🍬 おやつ：次のクリック2倍（残り 30s）";
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
    const until = Date.now() + CFG.BUFF_WINDOW_MS;
    saveBuff(until, false);
    updateBadge();
  }

  function pickupDrop() {
    const st = loadDropState();
    if (!st || !st.active) return;

    // バフ発動
    startBuff();

    // ドロップ消す
    const el = ensureDropEl();
    el.classList.remove("show");
    el.classList.add("hide");

    clearDropState();

    setTimeout(() => removeDropEl(), CFG.FADE_MS + 40);

    // ちょい通知（任意）
    try { window.WB?.emit?.("oyatu:pickup", { until: Date.now() + CFG.BUFF_WINDOW_MS }); } catch {}
  }

  /* =========================
   * 2倍処理（DOMでうさぎクリック検出 → coinChanged増加分に追撃）
   * ========================= */
  let lastBunnyClickAt = 0;
  let lastCoinsSeen = null;

  function isBunnyTarget(t) {
    const el = t && t.nodeType === 1 ? t : null;
    if (!el) return false;
    const wrap = el.closest?.(".bunnyWrap, .bunny-wrap");
    return !!wrap;
  }

  // うさぎクリックを「捕捉」する（既存処理を邪魔しない）
  document.addEventListener("click", (e) => {
    if (!isBunnyTarget(e.target)) return;

    const b = loadBuff();
    if (!b || b.used) return;
    if (Date.now() > b.until) return;

    lastBunnyClickAt = Date.now();
  }, true);

  // coinChanged を拾えるなら拾う。無い環境は監視で補う
  let coinHooked = false;
  let watchTimer = 0;

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

    // 直前にうさぎがクリックされていれば「その増加分」をもう1回足す → 合計2倍
    if (lastBunnyClickAt && (now - lastBunnyClickAt) <= CFG.COINCLICK_WINDOW_MS) {
      const WB = window.WB || null;
      addCoins(WB, diff);

      // 使い切り
      saveBuff(b.until, true);
      updateBadge();
      lastBunnyClickAt = 0;

      try { WB?.emit?.("oyatu:double", { bonus: diff }); } catch {}
    }
  }

  function hookCoinChangedIfPossible(WB) {
    try {
      if (WB?.on && !WB.__oyatuCoinHookedV1) {
        WB.__oyatuCoinHookedV1 = true;
        WB.on("coinChanged", (payload) => {
          const cur = (() => {
            if (typeof payload === "number") return payload;
            if (payload && typeof payload === "object" && payload.coins != null) return Number(payload.coins);
            return Number(payload);
          })();
          onCoinsChanged(cur);
        });
        coinHooked = true;
      }
    } catch {}
  }

  function startCoinWatchFallback() {
    if (watchTimer) return;
    watchTimer = window.setInterval(() => {
      const WB = window.WB || null;
      const cur = readCoinsDirect(WB);
      onCoinsChanged(cur);
    }, 200);
  }

  /* =========================
   * Main loop（出現抽選 + バフ表示更新）
   * ========================= */
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // バフバッジ更新
    updateBadge();

    // 期限切れ掃除
    const b = loadBuff();
    if (b && (Date.now() > b.until || b.used)) {
      if (Date.now() > b.until) clearBuff();
    }

    // ドロップ抽選（1個だけ）
    if (!hasDrop()) {
      const p = 1 - Math.pow(1 - CFG.DROP_CHANCE_PER_SEC, dt);
      if (Math.random() < p) dropNow();
    }

    requestAnimationFrame(loop);
  }

  /* =========================
   * Boot
   * ========================= */
  // 復元
  restoreDropIfNeeded();
  updateBadge();

  // coin hook
  try {
    hookCoinChangedIfPossible(window.WB || null);
  } catch {}
  // フォールバック監視
  startCoinWatchFallback();

  requestAnimationFrame(loop);

  // Debug API
  window.OYATU = window.OYATU || {};
  window.OYATU.dropNow = () => dropNow();
  window.OYATU.clearDrop = () => { clearDropState(); removeDropEl(); };
  window.OYATU.clearBuff = () => { clearBuff(); updateBadge(); };

  console.log("[oyatu] ready v1.0.0", {
    imgs: CFG.OYATU_LIST,
    chancePerSec: CFG.DROP_CHANCE_PER_SEC,
    buffWindowMs: CFG.BUFF_WINDOW_MS,
    reward: "next bunny click x2 (once)",
    coinHooked,
  });
})();
