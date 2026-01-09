/* app.js — Milkpop牧場（コア総統合 / WB安定版）
 * ✅ 目的：
 * - window.WB を「絶対に」用意して、他モジュール（isyou / zisseki / syougou / omukae / zukan / tabidati / slot / BGM / hanabi / tenki / bgcolor）が死なない
 * - うさぎ生成・移動・クリックコイン・放置ドロップ・黄金うんち（レア）をコアで担う
 * - WB差し替え耐性：wb_boot.js が先にWBを作ってても“上書き破壊しない”
 * - レイヤーのposition/z-indexを強制整備して「見えない」を根絶
 *
 * ※このファイルは「基礎の牧場コア」です。
 *   追加要素（衣装/称号/図鑑/旅立ち/スロット/花火/天気/BGM）側は WB API を参照する設計です。
 */

(() => {
  "use strict";

  const VERSION = "app.js v2026.01.09-core-merge-1";
  console.log(`[app] LOADED ${VERSION}`, Date.now());

  /* =========================
   * DOM helpers
   * ========================= */
  const $ = (q, p = document) => p.querySelector(q);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;

  function waitFor(getter, timeoutMs = 8000, tickMs = 30) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const v = getter();
        if (v) {
          clearInterval(t);
          resolve(v);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          reject(new Error("waitFor timeout"));
        }
      }, tickMs);
    });
  }

  /* =========================
   * Ensure base DOM
   * ========================= */
  async function ensureDom() {
    // index.html 前提：#field #bunnyLayer #coinLayer
    const field = await waitFor(() => $("#field"), 12000);
    const bunnyLayer = await waitFor(() => $("#bunnyLayer"), 12000);
    const coinLayer = await waitFor(() => $("#coinLayer"), 12000);

    // レイヤーが「見えない」事故根絶：position/z-indexを強制
    field.style.position = "relative";

    const fixLayer = (el, z) => {
      if (!el) return;
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.right = "0";
      el.style.bottom = "0";
      el.style.zIndex = String(z);
    };

    fixLayer($("#bgLayer"), 0);
    fixLayer($("#tenkiLayer"), 10);
    fixLayer(bunnyLayer, 50);
    fixLayer(coinLayer, 60);

    // bunny/coinはクリックが必要なことがあるので pointer-events はコア側で制御
    bunnyLayer.style.pointerEvents = "auto";
    coinLayer.style.pointerEvents = "auto";

    return { field, bunnyLayer, coinLayer };
  }

  /* =========================
   * Storage keys (core)
   * ========================= */
  const LS = {
    coins: "wb_coins_v6",
    bunnies: "wb_bunnies_v6",
    stats: "wb_stats_v6", // 黄金うんち回数/旅立ち回数など（他モジュールとも共有しやすい）
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  /* =========================
   * Assets (core)
   * ========================= */
  const ASSETS = {
    // うさぎ（最低限）
    bunny: "./assets/bunny.png",         // ※あなたの環境で存在する最小構成
    // もし進化差分が see assets にある場合、あとで BUNNY_DEFS に増やせる
    ougonUnchi: "./assets/ougonunchi.png",
    coins: [
      "./assets/coin1.png",
      "./assets/coin2.png",
      "./assets/coin3.png",
      "./assets/coin4.png",
    ],
    se: {
      coin: "./assets/coin.mp3",
      poyo: "./assets/poyo.mp3",
    }
  };

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }
  function preloadAudio(src) {
    return new Promise((resolve) => {
      try {
        const a = new Audio();
        a.preload = "auto";
        a.src = src;
        a.addEventListener("canplaythrough", () => resolve(true), { once: true });
        a.addEventListener("error", () => resolve(false), { once: true });
      } catch {
        resolve(false);
      }
    });
  }

  /* =========================
   * Bunny defs (core minimal)
   * ========================= */
  // 必要ならあなたの既存 tier に合わせて増やしてOK
  const BUNNY_DEFS = {
    bunny: {
      key: "bunny",
      label: "うさぎ",
      img: ASSETS.bunny,
      w: 120, // CSS表示サイズ（px）
      coinMult: 1.0,
      idleCoin: 1,
      speed: 30, // px/sec
    },
    // 追加例：
    // reabunny: { ... }
  };

  /* =========================
   * WB event bus (merge-safe)
   * ========================= */
  function ensureWBBase() {
    const old = (window.WB && typeof window.WB === "object") ? window.WB : null;

    // 既に wb_boot.js が作った listener を生かしたい：on/emit があればそれを使う
    const listeners = new Map();
    const on = old?.on?.bind(old) || function (ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    };
    const emit = old?.emit?.bind(old) || function (ev, ...args) {
      const set = listeners.get(ev);
      if (!set) return;
      for (const fn of set) { try { fn(...args); } catch {} }
    };

    const WB = old || {};
    WB.on = on;
    WB.emit = emit;

    // バージョン/メタ
    WB.VERSION = VERSION;
    WB.ASSETS = WB.ASSETS || ASSETS;
    WB.LS = WB.LS || {};
    WB.LS.coreCoins = LS.coins;
    WB.LS.coreBunnies = LS.bunnies;
    WB.LS.coreStats = LS.stats;

    window.WB = WB;
    return WB;
  }

  /* =========================
   * Coin system (core)
   * ========================= */
  function createCoinSystem(WB, coinValueEl) {
    let coins = Number(loadJSON(LS.coins, 0)) || 0;

    function syncHud() {
      if (coinValueEl) coinValueEl.textContent = String(Math.floor(coins));
    }
    function save() { saveJSON(LS.coins, Math.floor(coins)); }

    function setCoin(v) {
      coins = Math.max(0, Math.floor(Number(v) || 0));
      save();
      syncHud();
      WB.emit("coin:change", coins);
    }
    function addCoin(delta) {
      coins = Math.max(0, Math.floor(coins + (Number(delta) || 0)));
      save();
      syncHud();
      WB.emit("coin:change", coins);
      return coins;
    }
    function getCoin() { return Math.floor(coins); }
    function spendCoins(amount) {
      const a = Math.max(0, Math.floor(Number(amount) || 0));
      if (coins < a) return false;
      coins -= a;
      save();
      syncHud();
      WB.emit("coin:change", coins);
      return true;
    }

    syncHud();

    WB.getCoin = WB.getCoin || getCoin;
    WB.setCoin = WB.setCoin || setCoin;
    WB.addCoin = WB.addCoin || addCoin;
    WB.spendCoins = WB.spendCoins || spendCoins;

    return { getCoin, setCoin, addCoin, spendCoins, syncHud };
  }

  /* =========================
   * Stats (shared)
   * ========================= */
  function createStats(WB) {
    const stats = loadJSON(LS.stats, {
      ougonCount: 0,
      departCount: 0,
    });

    function save() { saveJSON(LS.stats, stats); }
    function getStats() { return { ...stats }; }
    function inc(key, n = 1) {
      stats[key] = Math.max(0, Math.floor((Number(stats[key]) || 0) + (Number(n) || 0)));
      save();
      WB.emit("stats:change", getStats());
      return stats[key];
    }
    function set(key, v) {
      stats[key] = Math.max(0, Math.floor(Number(v) || 0));
      save();
      WB.emit("stats:change", getStats());
    }

    WB.stats = WB.stats || {};
    WB.stats.get = getStats;
    WB.stats.inc = inc;
    WB.stats.set = set;

    return stats;
  }

  /* =========================
   * Audio unlock / SE
   * ========================= */
  function createAudioSystem(WB) {
    let unlocked = false;

    const se = {
      coin: null,
      poyo: null,
    };

    function ensureSe(key, src) {
      try {
        if (!se[key]) {
          se[key] = new Audio(src);
          se[key].preload = "auto";
        }
        return se[key];
      } catch {
        return null;
      }
    }

    async function unlockAudioOnce() {
      if (unlocked) return;
      unlocked = true;

      // 軽く1回再生を試す（失敗してもOK）
      try {
        const a = ensureSe("poyo", ASSETS.se.poyo);
        if (a) {
          a.volume = 0.0001;
          await a.play().catch(() => {});
          a.pause();
          a.currentTime = 0;
          a.volume = 1;
        }
      } catch {}
      WB.emit("audio:unlocked");
    }

    function playSe(key) {
      if (!unlocked) return;
      const src = ASSETS.se[key];
      if (!src) return;
      const a = ensureSe(key, src);
      if (!a) return;
      try {
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch {}
    }

    // 既に別モジュールが unlockAudioOnce を持ってても連結（BGM.js と同じ考え方）
    const prevUnlock = (typeof WB.unlockAudioOnce === "function") ? WB.unlockAudioOnce : null;
    WB.unlockAudioOnce = async () => {
      try { prevUnlock?.(); } catch {}
      await unlockAudioOnce();
    };

    WB.audio = WB.audio || {};
    WB.audio.playSe = playSe;

    // ユーザー操作で解禁
    const handler = async () => { try { await WB.unlockAudioOnce(); } catch {} };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });

    return { playSe };
  }

  /* =========================
   * Bunny system (core)
   * ========================= */
  function createBunnySystem(WB, dom, coinSys, statsSys, audioSys) {
    const { field, bunnyLayer, coinLayer } = dom;

    // bunny state list
    // bornAt を個体IDとして使う（isyō等が装備保存で使える）
    let bunnies = loadJSON(LS.bunnies, []);
    if (!Array.isArray(bunnies)) bunnies = [];

    // 最低2匹は確保（既存方針）
    function ensureInitialBunnies() {
      if (bunnies.length > 0) return;
      spawnBunny("bunny", { x: 80 });
      spawnBunny("bunny", { x: 320 });
      save();
    }

    function save() { saveJSON(LS.bunnies, bunnies); }

    function getBunnies() { return bunnies.slice(); }

    function spawnBunny(defKey = "bunny", opts = {}) {
      const def = BUNNY_DEFS[defKey] || BUNNY_DEFS.bunny;
      const bornAt = Date.now() + "_" + Math.floor(Math.random() * 1e9);

      const rect = field.getBoundingClientRect();
      const w = def.w;
      const h = def.w; // ざっくり

      const x = (opts.x != null) ? Number(opts.x) : rand(40, Math.max(40, rect.width - w - 40));
      const y = (opts.y != null) ? Number(opts.y) : rand(60, Math.max(60, rect.height - h - 80));

      const bunny = {
        bornAt,
        defKey: def.key,
        x, y,
        vx: (chance(0.5) ? 1 : -1) * def.speed,
        dir: 1, // 1:右, -1:左
        lastClickAt: 0,
        lastDropAt: 0,
      };

      bunnies.push(bunny);
      WB.emit("bunny:spawn", { ...bunny });
      save();
      render();
      return bunny;
    }

    function removeBunnyById(bornAt) {
      const i = bunnies.findIndex(b => b.bornAt === bornAt);
      if (i >= 0) {
        const gone = bunnies.splice(i, 1)[0];
        save();
        render();
        WB.emit("bunny:remove", gone);
        return true;
      }
      return false;
    }

    // coin entity list (DOM managed only; no persistence)
    const floatingCoins = new Set();

    function makeCoinDom(src, x, y, scale = 1) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "coin";
      img.draggable = false;
      img.style.position = "absolute";
      img.style.left = `${x}px`;
      img.style.top = `${y}px`;
      img.style.width = `${Math.floor(36 * scale)}px`;
      img.style.height = "auto";
      img.style.userSelect = "none";
      img.style.cursor = "pointer";
      img.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,.25))";
      img.style.pointerEvents = "auto";
      img.style.zIndex = "1";

      const born = Date.now();
      const lifeMs = 25000;

      const onPickup = () => {
        try { img.remove(); } catch {}
        floatingCoins.delete(img);
        audioSys.playSe("coin");
        coinSys.addCoin(1);
      };

      img.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPickup();
      });

      // 自然消滅
      const t = setInterval(() => {
        if (!img.isConnected) { clearInterval(t); return; }
        if (Date.now() - born > lifeMs) {
          try { img.remove(); } catch {}
          floatingCoins.delete(img);
          clearInterval(t);
        }
      }, 500);

      return img;
    }

    function makeOugonDom(x, y) {
      const img = document.createElement("img");
      img.src = ASSETS.ougonUnchi;
      img.alt = "ougon";
      img.draggable = false;
      img.style.position = "absolute";
      img.style.left = `${x}px`;
      img.style.top = `${y}px`;
      img.style.width = "52px";
      img.style.height = "auto";
      img.style.userSelect = "none";
      img.style.cursor = "pointer";
      img.style.filter = "drop-shadow(0 12px 22px rgba(0,0,0,.28))";
      img.style.pointerEvents = "auto";
      img.style.zIndex = "2";

      const born = Date.now();
      const lifeMs = 35000;

      const onPickup = () => {
        try { img.remove(); } catch {}
        floatingCoins.delete(img);
        audioSys.playSe("coin");
        // 黄金は高額
        coinSys.addCoin(10000);
        WB.stats?.inc?.("ougonCount", 1);
        WB.emit("ougon:pickup");
      };

      img.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPickup();
      });

      const t = setInterval(() => {
        if (!img.isConnected) { clearInterval(t); return; }
        if (Date.now() - born > lifeMs) {
          try { img.remove(); } catch {}
          floatingCoins.delete(img);
          clearInterval(t);
        }
      }, 500);

      return img;
    }

    function dropCoinAt(x, y, kind = "normal") {
      // kind: normal | ougon
      if (kind === "ougon") {
        const dom = makeOugonDom(x, y);
        coinLayer.appendChild(dom);
        floatingCoins.add(dom);
        return;
      }

      const src = ASSETS.coins[Math.floor(rand(0, ASSETS.coins.length))] || ASSETS.coins[0];
      const dom = makeCoinDom(src, x, y, 1);
      coinLayer.appendChild(dom);
      floatingCoins.add(dom);
    }

    // Bunny DOM cache
    const bunnyDomById = new Map();

    function buildBunnyDom(bunny) {
      const def = BUNNY_DEFS[bunny.defKey] || BUNNY_DEFS.bunny;

      const wrap = document.createElement("div");
      wrap.className = "bunnyWrap";
      wrap.dataset.bornAt = bunny.bornAt;

      wrap.style.position = "absolute";
      wrap.style.left = `${bunny.x}px`;
      wrap.style.top = `${bunny.y}px`;
      wrap.style.width = `${def.w}px`;
      wrap.style.height = `${def.w}px`;
      wrap.style.pointerEvents = "auto";
      wrap.style.userSelect = "none";
      wrap.style.touchAction = "manipulation";
      wrap.style.zIndex = "10";

      const img = document.createElement("img");
      img.className = "bunnyImg";
      img.src = def.img;
      img.alt = def.label;
      img.draggable = false;
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      img.style.userSelect = "none";
      img.style.pointerEvents = "none"; // クリックはwrapで指出し
      img.style.filter = "drop-shadow(0 14px 18px rgba(0,0,0,.18))";

      wrap.appendChild(img);

      wrap.addEventListener("pointerdown", async (e) => {
        // isyou装着モードなどがクリック遮断したい場合に備え、WBイベントを先に投げる
        // 返り値でキャンセルしたい場合は isyou 側が capture で止める想定
        e.preventDefault();
        e.stopPropagation();
        try { await WB.unlockAudioOnce?.(); } catch {}
        onBunnyClick(bunny.bornAt, e);
      });

      return wrap;
    }

    function onBunnyClick(bornAt, ev) {
      const bunny = bunnies.find(b => b.bornAt === bornAt);
      if (!bunny) return;

      const now = Date.now();
      // クリック連打抑制（1秒）
      if (now - (bunny.lastClickAt || 0) < 1000) return;
      bunny.lastClickAt = now;
      save();

      audioSys.playSe("poyo");

      // クリックで reduces? ここではシンプルに 1 コインを落とす
      const rect = field.getBoundingClientRect();
      const x = clamp((bunny.x + 40), 10, rect.width - 60);
      const y = clamp((bunny.y + 70), 10, rect.height - 60);

      dropCoinAt(x, y, "normal");
      WB.emit("bunny:click", { bornAt });
    }

    function render() {
      // 不要なDOMを掃除
      const alive = new Set(bunnies.map(b => b.bornAt));
      for (const [id, dom] of bunnyDomById.entries()) {
        if (!alive.has(id)) {
          try { dom.remove(); } catch {}
          bunnyDomById.delete(id);
        }
      }

      // 生成・更新
      for (const b of bunnies) {
        let dom = bunnyDomById.get(b.bornAt);
        if (!dom) {
          dom = buildBunnyDom(b);
          bunnyDomById.set(b.bornAt, dom);
          bunnyLayer.appendChild(dom);
        }
        dom.style.left = `${b.x}px`;
        dom.style.top = `${b.y}px`;

        // 向き（flip）
        const dir = (b.dir >= 0) ? 1 : -1;
        dom.style.transform = `scaleX(${dir})`;
      }
    }

    // movement loop
    let lastTick = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - lastTick) / 1000); // clamp
      lastTick = now;

      const rect = field.getBoundingClientRect();

      for (const b of bunnies) {
        const def = BUNNY_DEFS[b.defKey] || BUNNY_DEFS.bunny;
        const w = def.w;

        b.x += (b.vx || def.speed) * dt;

        // bounce
        if (b.x < 10) {
          b.x = 10;
          b.vx = Math.abs(def.speed);
        } else if (b.x > rect.width - w - 10) {
          b.x = rect.width - w - 10;
          b.vx = -Math.abs(def.speed);
        }
        b.dir = (b.vx >= 0) ? 1 : -1;

        // idle drop
        const dropInterval = 5000; // 5秒ごとにチャンス
        const last = b.lastDropAt || 0;
        if (Date.now() - last > dropInterval) {
          b.lastDropAt = Date.now();

          // 通常コイン：高確率
          if (chance(0.65)) {
            const x = clamp((b.x + 40), 10, rect.width - 60);
            const y = clamp((b.y + 80), 10, rect.height - 60);
            dropCoinAt(x, y, "normal");
          }

          // 黄金うんち：低確率（最上位）
          // ここは好みで調整（例：0.6%）
          if (chance(0.006)) {
            const x = clamp((b.x + 50), 10, rect.width - 80);
            const y = clamp((b.y + 90), 10, rect.height - 80);
            dropCoinAt(x, y, "ougon");
            WB.emit("ougon:spawn", { bornAt: b.bornAt });
          }
        }
      }

      render();
      requestAnimationFrame(tick);
    }

    ensureInitialBunnies();
    render();
    requestAnimationFrame(tick);

    // 公開API
    WB.getBunnies = WB.getBunnies || getBunnies;
    WB.spawnBunny = WB.spawnBunny || spawnBunny;
    WB.removeBunny = WB.removeBunny || removeBunnyById;

    // 互換：旧実装が WB.bunnies を参照してても動くように
    Object.defineProperty(WB, "bunnies", {
      get() { return bunnies; },
      set(v) {
        if (Array.isArray(v)) {
          bunnies = v;
          save();
          render();
        }
      },
      configurable: true
    });

    // コイン生成API（他モジュールが使える）
    WB.spawnCoin = WB.spawnCoin || ((x, y) => dropCoinAt(x, y, "normal"));
    WB.spawnOugon = WB.spawnOugon || ((x, y) => dropCoinAt(x, y, "ougon"));

    return { render };
  }

  /* =========================
   * HUD buttons (core)
   * ========================= */
  function wireHud(WB) {
    const shopBtn = $("#shopBtn");
    const slotBtn = $("#slotBtn");
    const departBtn = $("#departBtn");
    const resetBtn = $("#resetBtn");

    // コアは「イベントを投げるだけ」。実装は各モジュールへ委譲できる
    shopBtn?.addEventListener("click", () => WB.emit("hud:shop"));
    slotBtn?.addEventListener("click", () => WB.emit("hud:slot"));
    departBtn?.addEventListener("click", () => WB.emit("hud:depart"));
    resetBtn?.addEventListener("click", () => {
      // 乱暴な全消しは危険なので確認を入れる（それでもワンボタン復旧したい要望が多いので）
      if (!confirm("リセットしますか？（コイン/うさぎ/実績などが消える場合があります）")) return;
      try {
        localStorage.removeItem(LS.coins);
        localStorage.removeItem(LS.bunnies);
        localStorage.removeItem(LS.stats);
      } catch {}
      location.reload();
    });

    // 互換：各モジュールが直接参照できるようにもしておく
    WB.hud = WB.hud || {};
    WB.hud.shop = () => WB.emit("hud:shop");
    WB.hud.slot = () => WB.emit("hud:slot");
    WB.hud.depart = () => WB.emit("hud:depart");
  }

  /* =========================
   * Boot
   * ========================= */
  (async function boot() {
    const dom = await ensureDom();

    // preload（失敗しても続行）
    await Promise.allSettled([
      preloadImage(ASSETS.bunny),
      preloadImage(ASSETS.ougonUnchi),
      ...ASSETS.coins.map(preloadImage),
      preloadAudio(ASSETS.se.coin),
      preloadAudio(ASSETS.se.poyo),
    ]);

    const WB = ensureWBBase();

    // coin / stats / audio
    const coinValueEl = $("#coinValue");
    const coinSys = createCoinSystem(WB, coinValueEl);
    createStats(WB);
    const audioSys = createAudioSystem(WB);

    // bunny system
    createBunnySystem(WB, dom, coinSys, WB.stats, audioSys);

    // HUD
    wireHud(WB);

    // ready signal
    WB.__ready = true;
    WB.emit("wb:ready", WB);
    console.log("[app] WB ready", WB);
  })().catch((e) => {
    console.error("[app] boot failed", e);
    // 最悪でもWBは残す
    try {
      const WB = ensureWBBase();
      WB.__ready = false;
      WB.emit("wb:error", e);
    } catch {}
  });
})();
