/* app.js — Milkpop牧場（コア）
 * - うさぎ2匹で開始 / 左右にウロウロ
 * - 放置でコインを落とす
 * - うさぎクリックでもコイン（1秒クール） + poyo.mp3
 * - コインは床に重なって溜まる / クリック or ホバーで回収 + coin.mp3
 * - 各モジュール（omukae/zisseki/syougou/zukan/tabidati 等）が参照できるよう window.WB を提供
 * - saku.png を左右端に小さく表示
 */

(() => {
  "use strict";

  const $ = (q, p = document) => p.querySelector(q);

  /* ===== 参照要素 ===== */
  const field = $("#field");
  const bunnyLayer = $("#bunnyLayer");
  const coinLayer = $("#coinLayer");
  const coinValueEl = $("#coinValue");

  const shopBtn = $("#shopBtn");     // お迎え
  const slotBtn = $("#slotBtn");     // スロット（slot.jsで拾う）
  const rankBtn = $("#rankBtn");     // 図鑑/称号
  const departBtn = $("#departBtn"); // 旅立ち
  const resetBtn = $("#resetBtn");   // リセット

  if (!field || !bunnyLayer || !coinLayer || !coinValueEl) {
    console.warn("[WB] required DOM not found");
    return;
  }

  /* ===== アセット ===== */
  const ASSETS = {
    bunny: "./assets/bunny.png",
    baby: "./assets/babybunny.png",
    rea: "./assets/reabunny.png",
    ougon: "./assets/ougonunchi.png",
    poyo: "./assets/poyo.mp3",
    coinSe: "./assets/coin.mp3",
    saku: "./assets/saku.png",
  };

  /* ===== 物理・ゲーム定数 ===== */
  const COIN_IDLE_MIN_MS = 5000; // 放置コイン間隔（最短）
  const COIN_IDLE_MAX_MS = 9000; // 放置コイン間隔（最長）
  const CLICK_COIN_COOLDOWN_MS = 1000;

  const COIN_FALL_BOUNCE = 0.28;     // 着地時バウンド量
  const COIN_FALL_DUR_MS = 260;      // 落下アニメ
  const COIN_STACK_Y_JITTER = 2;     // 重なりの微妙なズレ

  const BUNNY_WALK_SPEED = 22;       // px/s
  const BUNNY_TURN_MIN_MS = 1200;
  const BUNNY_TURN_MAX_MS = 2600;

  /* ===== セーブ ===== */
  const LS_KEY = "milkpop_wb_save_v1";

  function now() { return Date.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return (a + Math.floor(Math.random() * (b - a + 1))); }

  /* ===== SE（重ね鳴らし） ===== */
  function oneShot(src, vol = 0.9) {
    try {
      const a = new Audio(src);
      a.volume = vol;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================================================
   * WB（他JSから触る共通API）
   * ========================================================= */
  const WB = (window.WB ||= {});

  WB.coins = 0;
  WB.bunnies = []; // {id, el, x, y, dir, nextTurnAt, nextIdleCoinAt, lastClickCoinAt, kind}
  WB.coinsOnField = []; // {id, el, x, y, value}

  WB.ui = {
    field,
    bunnyLayer,
    coinLayer,
    coinValueEl,
    shopBtn,
    slotBtn,
    rankBtn,
    departBtn,
    resetBtn,
  };

  WB.state = {
    // 旅立ちモードなどは tabidati.js が管理してもOK。app側はフラグ置き場だけ用意
    departMode: false,
  };

  WB.updateHud = () => {
    coinValueEl.textContent = String(Math.max(0, Math.floor(WB.coins)));
  };

  WB.saveCoins = () => {
    save();
  };

  WB.addCoins = (delta) => {
    WB.coins = Math.max(0, Math.floor(WB.coins + (Number(delta) || 0)));
    WB.updateHud();
    save();
  };

  WB.setCoins = (v) => {
    WB.coins = Math.max(0, Math.floor(Number(v) || 0));
    WB.updateHud();
    save();
  };

  // お迎え価格：現在匹数に応じて上がる（omukae.jsが使う想定）
  WB.getOmukaeCost = () => {
    const n = WB.bunnies.length;
    // 例：1匹目 2000 / 2匹目 4000 / 3匹目 7000 / 4匹目 11000 …（緩やかに上昇）
    // nは「現在の匹数」なので、次を買う値段 = f(n)
    const base = 2000;
    const extra = Math.floor((n * (n + 1)) / 2) * 1000; // 0,1000,3000,6000,...
    return base + extra;
  };

  WB.saveAll = () => save();
  WB.loadAll = () => load();

  /* =========================================================
   * 背景装飾：saku.png を左右端に小さく
   * ========================================================= */
  function mountSaku() {
    // 二重生成防止
    if ($("#sakuLeft") || $("#sakuRight")) return;

    const mk = (id, side) => {
      const img = document.createElement("img");
      img.id = id;
      img.src = ASSETS.saku;
      img.alt = "saku";
      img.style.position = "fixed";
      img.style.bottom = "10px";
      img.style[side] = "10px";
      img.style.width = "72px";
      img.style.height = "auto";
      img.style.opacity = "0.9";
      img.style.pointerEvents = "none";
      img.style.zIndex = "2"; // うさぎ・コインより下にしたい場合は style.css 側で調整してOK
      document.body.appendChild(img);
    };

    mk("sakuLeft", "left");
    mk("sakuRight", "right");
  }

  /* =========================================================
   * うさぎ生成・移動
   * ========================================================= */
  let bunnyIdSeq = 1;

  function fieldRect() {
    const r = field.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  }

  function createBunny(kind = "bunny", x = null) {
    const id = bunnyIdSeq++;
    const el = document.createElement("img");
    el.className = "wb-bunny";
    el.src = kind === "baby" ? ASSETS.baby : (kind === "rea" ? ASSETS.rea : ASSETS.bunny);
    el.alt = kind;
    el.draggable = false;

    // 見た目
    el.style.position = "absolute";
    el.style.width = "96px";
    el.style.height = "auto";
    el.style.userSelect = "none";
    el.style.touchAction = "manipulation";
    el.style.cursor = "pointer";
    el.style.zIndex = "5";

    const fr = fieldRect();
    const startX = x ?? rand(40, Math.max(60, fr.w - 140));
    const y = Math.max(0, fr.h - 120); // 床付近（style.cssで床表現があるなら調整可）

    const bunny = {
      id,
      el,
      kind,
      x: startX,
      y,
      dir: Math.random() < 0.5 ? -1 : 1,
      nextTurnAt: now() + randi(BUNNY_TURN_MIN_MS, BUNNY_TURN_MAX_MS),
      nextIdleCoinAt: now() + randi(COIN_IDLE_MIN_MS, COIN_IDLE_MAX_MS),
      lastClickCoinAt: 0,
    };

    el.style.transform = `translate(${bunny.x}px, ${bunny.y}px) scaleX(${bunny.dir === 1 ? 1 : -1})`;
    bunnyLayer.appendChild(el);
    WB.bunnies.push(bunny);

    // クリック：旅立ちモードなら tabidati.js に委譲、そうでなければコイン
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 旅立ちモードは tabidati.js が管理する想定
      if (window.TABIDATI && typeof window.TABIDATI.onBunnyClick === "function") {
        window.TABIDATI.onBunnyClick(bunny);
        return;
      }

      // 通常：クリックコイン（クールダウン）
      const t = now();
      if (t - bunny.lastClickCoinAt < CLICK_COIN_COOLDOWN_MS) return;
      bunny.lastClickCoinAt = t;

      oneShot(ASSETS.poyo, 0.9);
      dropCoinAtBunnyFeet(bunny, 1);
    });

    return bunny;
  }

  function updateBunnies(dt) {
    const fr = fieldRect();
    const minX = 10;
    const maxX = Math.max(10, fr.w - 110);

    for (const b of WB.bunnies) {
      // 方向転換（たまに）
      if (now() >= b.nextTurnAt) {
        b.dir = Math.random() < 0.5 ? -1 : 1;
        b.nextTurnAt = now() + randi(BUNNY_TURN_MIN_MS, BUNNY_TURN_MAX_MS);
      }

      // 移動
      b.x += b.dir * BUNNY_WALK_SPEED * dt;
      if (b.x < minX) { b.x = minX; b.dir = 1; }
      if (b.x > maxX) { b.x = maxX; b.dir = -1; }

      // 放置コイン
      if (now() >= b.nextIdleCoinAt) {
        dropCoinAtBunnyFeet(b, 1);
        b.nextIdleCoinAt = now() + randi(COIN_IDLE_MIN_MS, COIN_IDLE_MAX_MS);
      }

      // 反映
      b.el.style.transform = `translate(${b.x}px, ${b.y}px) scaleX(${b.dir === 1 ? 1 : -1})`;
    }
  }

  /* =========================================================
   * コイン生成・回収
   * ========================================================= */
  let coinIdSeq = 1;

  function dropCoinAtBunnyFeet(bunny, value = 1) {
    const id = coinIdSeq++;
    const el = document.createElement("div");
    el.className = "wb-coin";
    el.textContent = "🪙";
    el.dataset.id = String(id);

    // 見た目
    el.style.position = "absolute";
    el.style.fontSize = "26px";
    el.style.lineHeight = "1";
    el.style.userSelect = "none";
    el.style.cursor = "pointer";
    el.style.zIndex = "6";

    // 位置（足元に重ね置き）
    const fr = fieldRect();

    // field内の座標系に合わせる（bunny.x/y は field座標）
    const x = bunny.x + 40 + rand(-10, 10);
    const groundY = Math.max(0, fr.h - 54);
    const y = groundY + rand(-COIN_STACK_Y_JITTER, COIN_STACK_Y_JITTER);

    // 落下演出：少し上から落ちてバウンド
    const startY = y - 50;

    el.style.transform = `translate(${x}px, ${startY}px) scale(0.95)`;
    el.style.transition = `transform ${COIN_FALL_DUR_MS}ms cubic-bezier(.2,1.1,.2,1)`;
    coinLayer.appendChild(el);

    requestAnimationFrame(() => {
      const bounceY = y - 12 * COIN_FALL_BOUNCE;
      el.style.transform = `translate(${x}px, ${bounceY}px) scale(1)`;
      setTimeout(() => {
        el.style.transition = `transform 140ms ease-out`;
        el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      }, COIN_FALL_DUR_MS);
    });

    const coin = { id, el, x, y, value: Math.max(1, Math.floor(value || 1)) };
    WB.coinsOnField.push(coin);

    const collect = (e) => {
      e.preventDefault();
      e.stopPropagation();
      collectCoin(coin);
    };

    // 回収：クリック or ホバー
    el.addEventListener("click", collect, { passive: false });
    el.addEventListener("mouseenter", collect, { passive: false });

    return coin;
  }

  function collectCoin(coin) {
    // 既に消えてたら無視
    if (!coin || !coin.el || !coin.el.isConnected) return;

    oneShot(ASSETS.coinSe, 0.85);
    WB.addCoins(coin.value);

    // ふわっと消える
    coin.el.style.transition = "transform 160ms ease, opacity 160ms ease";
    coin.el.style.opacity = "0";
    coin.el.style.transform += " scale(1.25)";
    setTimeout(() => {
      try { coin.el.remove(); } catch {}
    }, 180);

    WB.coinsOnField = WB.coinsOnField.filter((c) => c.id !== coin.id);
    save();
  }

  /* =========================================================
   * リセット
   * ========================================================= */
  function hardReset() {
    // 保存消す
    try { localStorage.removeItem(LS_KEY); } catch {}
    // 画面要素を消す
    WB.coins = 0;
    WB.updateHud();

    for (const c of [...WB.coinsOnField]) {
      try { c.el.remove(); } catch {}
    }
    WB.coinsOnField = [];

    for (const b of [...WB.bunnies]) {
      try { b.el.remove(); } catch {}
    }
    WB.bunnies = [];

    // 初期2匹へ
    createBunny("bunny", 70);
    createBunny("bunny", null);

    save();

    // ほかモジュールに通知（任意）
    try { window.ZISSEKI?.onReset?.(); } catch {}
    try { window.SYOUGOU?.onReset?.(); } catch {}
    try { window.ZUKAN?.onReset?.(); } catch {}
    try { window.TABIDATI?.onReset?.(); } catch {}
    try { window.OMUKAE?.onReset?.(); } catch {}
  }

  /* =========================================================
   * セーブ / ロード（コアのみ）
   * ========================================================= */
  function save() {
    const data = {
      v: 1,
      coins: WB.coins,
      bunnies: WB.bunnies.map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        dir: b.dir,
        nextTurnAt: b.nextTurnAt,
        nextIdleCoinAt: b.nextIdleCoinAt,
        lastClickCoinAt: b.lastClickCoinAt,
      })),
      // コインは保存しない（溜まりすぎ＆座標ズレ回避）
      // 必要なら later で追加可
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return false;

      WB.coins = Math.max(0, Math.floor(data.coins || 0));
      WB.updateHud();

      // 既存削除
      for (const b of [...WB.bunnies]) {
        try { b.el.remove(); } catch {}
      }
      WB.bunnies = [];

      bunnyIdSeq = 1;
      // 復元
      const list = Array.isArray(data.bunnies) ? data.bunnies : [];
      if (list.length === 0) return false;

      for (const bd of list) {
        const b = createBunny(bd.kind || "bunny", bd.x ?? null);
        b.dir = bd.dir === -1 ? -1 : 1;
        b.nextTurnAt = Number(bd.nextTurnAt) || (now() + randi(BUNNY_TURN_MIN_MS, BUNNY_TURN_MAX_MS));
        b.nextIdleCoinAt = Number(bd.nextIdleCoinAt) || (now() + randi(COIN_IDLE_MIN_MS, COIN_IDLE_MAX_MS));
        b.lastClickCoinAt = Number(bd.lastClickCoinAt) || 0;
      }

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
   * ボタン（最低限：リセットのみ確実に）
   * 他は各モジュール側でイベント購読してOK
   * ========================================================= */
  if (resetBtn) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // 確認は入れない（毎回の開発で邪魔になるため）
      hardReset();
    });
  }

  // お迎え：omukae.js が実装しているなら委譲
  if (shopBtn) {
    shopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        if (window.OMUKAE && typeof window.OMUKAE.open === "function") {
          window.OMUKAE.open();
        } else {
          // フォールバック：とりあえず 1匹増やす（テスト用）
          const cost = WB.getOmukaeCost();
          if (WB.coins < cost) return;
          WB.addCoins(-cost);
          createBunny("bunny", null);
          save();
        }
      } catch {}
    });
  }

  // 図鑑/称号：zukan.js / syougou.js がopen持っていれば委譲
  if (rankBtn) {
    rankBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        if (window.ZUKAN && typeof window.ZUKAN.open === "function") window.ZUKAN.open();
        else if (window.SYOUGOU && typeof window.SYOUGOU.open === "function") window.SYOUGOU.open();
      } catch {}
    });
  }

  // 旅立ち：tabidati.js に委譲（旅立ちモードON/OFF）
  if (departBtn) {
    departBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        if (window.TABIDATI && typeof window.TABIDATI.toggle === "function") {
          window.TABIDATI.toggle();
        } else {
          // フォールバック（簡易）：モード切替だけ
          WB.state.departMode = !WB.state.departMode;
          departBtn.classList.toggle("active", WB.state.departMode);
        }
      } catch {}
    });
  }

  /* =========================================================
   * ループ
   * ========================================================= */
  let last = performance.now();

  function tick(t) {
    const dt = clamp((t - last) / 1000, 0, 0.05);
    last = t;

    updateBunnies(dt);

    requestAnimationFrame(tick);
  }

  /* =========================================================
   * 起動
   * ========================================================= */
  function boot() {
    mountSaku();

    // ロード→失敗なら初期2匹
    const ok = load();
    if (!ok) {
      WB.coins = 0;
      WB.updateHud();
      createBunny("bunny", 70);
      createBunny("bunny", null);
      save();
    }

    // 外部モジュールが初期化したい場合のフック
    try { window.ZISSEKI?.init?.(WB); } catch {}
    try { window.SYOUGOU?.init?.(WB); } catch {}
    try { window.ZUKAN?.init?.(WB); } catch {}
    try { window.OMUKAE?.init?.(WB); } catch {}
    try { window.TABIDATI?.init?.(WB); } catch {}

    requestAnimationFrame(tick);
  }

  window.addEventListener("load", boot);
})();
