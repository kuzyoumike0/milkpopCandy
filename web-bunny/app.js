(() => {
  const ASSETS = {
    bunny: "./assets/bunny.png",
    hart: "./assets/hart.png",
    candy: "./assets/candy.png",
    coinSE: "./assets/coin.mp3",
    poyoSE: "./assets/poyo.mp3",
    tabidatiSE: "./assets/tabidati.mp3",
    coins: ["./assets/coin1.png","./assets/coin2.png","./assets/coin3.png","./assets/coin4.png"],
  };

  const COST = { CANDY: 10, DEPART: 10 };

  const LS_KEYS = {
    coins: "webBunny_coins_v1",
    bunnyCount: "webBunny_bunnyCount_v1",
    stats: "webBunny_stats_v1",
    unlocked: "webBunny_achUnlocked_v1",
    daily: "webBunny_daily_v1",
  };

  const field = document.getElementById("field");
  const bunnyLayer = document.getElementById("bunnyLayer");
  const coinLayer = document.getElementById("coinLayer");

  const coinValueEl = document.getElementById("coinValue");
  const bunnyValueEl = document.getElementById("bunnyValue");
  const coinHudEl = document.getElementById("coinHud");

  const candyBtn = document.getElementById("candyBtn");
  const hintEl = document.getElementById("hint");

  const departBtn = document.getElementById("departBtn");
  const departTip = document.getElementById("departTip");

  const rankBtn = document.getElementById("rankBtn");
  const rankModal = document.getElementById("rankModal");
  const closeRankBtn = document.getElementById("closeRankBtn");
  const bestBox = document.getElementById("bestBox");
  const dailyBox = document.getElementById("dailyBox");
  const achBox = document.getElementById("achBox");

  const shopBtn = document.getElementById("shopBtn");
  const resetBtn = document.getElementById("resetBtn");

  const modalBackdrop = document.getElementById("modalBackdrop");
  const shopModal = document.getElementById("shopModal");
  const closeShopBtn = document.getElementById("closeShopBtn");
  const bunnyPriceEl = document.getElementById("bunnyPrice");
  const buyBunnyBtn = document.getElementById("buyBunnyBtn");

  /* ===== State ===== */
  let coins = safeInt(localStorage.getItem(LS_KEYS.coins), 0);
  let bunnyCount = clamp(safeInt(localStorage.getItem(LS_KEYS.bunnyCount), 2), 2, 9999);

  const bunnies = [];
  const coinsOnField = [];
  const candies = [];

  let lastFrame = performance.now();
  let rafId = 0;

  let candyArmed = false;

  /* ===== Audio ===== */
  const sePoyo = new Audio(ASSETS.poyoSE);
  const seCoin = new Audio(ASSETS.coinSE);
  const seTabidati = new Audio(ASSETS.tabidatiSE);
  [sePoyo, seCoin, seTabidati].forEach(a => (a.preload = "auto"));

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      sePoyo.muted = true;
      sePoyo.currentTime = 0;
      sePoyo.play().then(() => {
        sePoyo.pause();
        sePoyo.currentTime = 0;
        sePoyo.muted = false;
      }).catch(() => (sePoyo.muted = false));
    } catch {}
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true });

  function playSE(aud) { try { aud.currentTime = 0; aud.play().catch(() => {}); } catch {} }

  /* ===== Helpers ===== */
  function safeInt(v, def) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : def;
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function fieldRect() { return field.getBoundingClientRect(); }
  function groundY() {
    const fr = fieldRect();
    const gl = document.getElementById("groundLine").getBoundingClientRect();
    return gl.top - fr.top;
  }

  function saveCore() {
    localStorage.setItem(LS_KEYS.coins, String(coins));
    localStorage.setItem(LS_KEYS.bunnyCount, String(bunnyCount));
  }

  function updateHud() {
    coinValueEl.textContent = String(coins);
    bunnyValueEl.textContent = String(bunnies.length);
  }

  function bumpCoinHud() {
    coinHudEl.classList.remove("bump");
    void coinHudEl.offsetWidth;
    coinHudEl.classList.add("bump");
  }

  function shineCoinHud() {
    coinHudEl.classList.remove("shine");
    void coinHudEl.offsetWidth;
    coinHudEl.classList.add("shine");
  }

  function getBunnyPrice(nextIndex) {
    const base = 25, growth = 1.28;
    return Math.floor(base * Math.pow(growth, Math.max(0, nextIndex - 1)));
  }

  function coinTierFromIdleSeconds(sec) {
    if (sec >= 90) return 4;
    if (sec >= 45) return 3;
    if (sec >= 18) return 2;
    return 1;
  }
  function applyRareBoost(baseTier) {
    const r = Math.random();
    let up = 0;
    if (r < 0.10) up = 3;
    else if (r < 0.35) up = 2;
    else if (r < 0.75) up = 1;
    return clamp(baseTier + up, 1, 4);
  }
  function coinValueFromTier(tier) {
    if (tier === 4) return 100;
    if (tier === 3) return 10;
    if (tier === 2) return 5;
    return 1;
  }

  function randomGaugeSeconds() { return 8.0 + Math.random() * 8.0; }

  /* ===== Stats / Ranking / Achievements ===== */
  const stats = loadStats();
  const unlocked = loadUnlockedSet();

  function loadStats() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_KEYS.stats) || "null") || {};
      return {
        totalEarned: o.totalEarned ?? 0,
        totalSpent: o.totalSpent ?? 0,
        totalCandies: o.totalCandies ?? 0,
        totalDepartures: o.totalDepartures ?? 0,
        totalRareDepartMsgs: o.totalRareDepartMsgs ?? 0,
        maxCoinsHeld: o.maxCoinsHeld ?? coins,
        maxBunniesHeld: o.maxBunniesHeld ?? bunnyCount,
        maxSingleGain: o.maxSingleGain ?? 0,
      };
    } catch {
      return { totalEarned:0,totalSpent:0,totalCandies:0,totalDepartures:0,totalRareDepartMsgs:0,maxCoinsHeld:coins,maxBunniesHeld:bunnyCount,maxSingleGain:0 };
    }
  }
  function saveStats() { localStorage.setItem(LS_KEYS.stats, JSON.stringify(stats)); }

  function loadUnlockedSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEYS.unlocked) || "[]");
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }
  function saveUnlockedSet() { localStorage.setItem(LS_KEYS.unlocked, JSON.stringify(Array.from(unlocked))); }

  function todayKeyJST() {
    const dtf = new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" });
    return dtf.format(new Date());
  }
  function loadDaily() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_KEYS.daily) || "null") || {};
      return typeof o === "object" && o ? o : {};
    } catch { return {}; }
  }
  function saveDaily(obj) { localStorage.setItem(LS_KEYS.daily, JSON.stringify(obj)); }

  function onGain(value) {
    stats.totalEarned += value;
    stats.maxSingleGain = Math.max(stats.maxSingleGain, value);
    stats.maxCoinsHeld = Math.max(stats.maxCoinsHeld, coins);
    saveStats();

    const d = loadDaily();
    const k = todayKeyJST();
    d[k] = (d[k] || 0) + value;
    saveDaily(d);

    checkAchievements();
  }
  function onSpend(value) { stats.totalSpent += value; saveStats(); checkAchievements(); }
  function onCandy() { stats.totalCandies += 1; saveStats(); checkAchievements(); }
  function onDepart(isRareMsg) {
    stats.totalDepartures += 1;
    if (isRareMsg) stats.totalRareDepartMsgs += 1;
    saveStats();
    checkAchievements();
  }

  const ACH = [
    { id:"first_coin", name:"はじめてのコイン", desc:"コインを1枚拾う", rare:false, ok:()=>stats.totalEarned>=1 },
    { id:"jackpot", name:"JACKPOT!", desc:"+100（coin4）を拾う", rare:true, ok:()=>stats.maxSingleGain>=100 },
    { id:"rich_1k", name:"小金持ち", desc:"所持コインが1000以上になる", rare:false, ok:()=>stats.maxCoinsHeld>=1000 },
    { id:"breeder_10", name:"にぎやか牧場", desc:"うさぎ10匹以上にする", rare:false, ok:()=>stats.maxBunniesHeld>=10 },
    { id:"candy_10", name:"キャンディ好き", desc:"キャンディを10回落とす", rare:false, ok:()=>stats.totalCandies>=10 },
    { id:"depart_1", name:"旅立ちの夜", desc:"旅立ちを1回行う", rare:false, ok:()=>stats.totalDepartures>=1 },
    { id:"rare_msg", name:"特別な言葉", desc:"レア台詞を引く", rare:true, ok:()=>stats.totalRareDepartMsgs>=1 },
    { id:"earned_10k", name:"牧場長", desc:"累計で1万コイン稼ぐ", rare:true, ok:()=>stats.totalEarned>=10000 },
  ];

  function checkAchievements() {
    let changed = false;
    for (const a of ACH) {
      if (!unlocked.has(a.id) && a.ok()) { unlocked.add(a.id); changed = true; }
    }
    if (changed) saveUnlockedSet();
    if (!rankModal.classList.contains("hidden")) renderRankModal();
  }

  function fmt(n) { return (n || 0).toLocaleString("ja-JP"); }

  function renderRankModal() {
    const bestRows = [
      ["累計獲得", `${fmt(stats.totalEarned)} 🪙`],
      ["累計消費", `${fmt(stats.totalSpent)} 🪙`],
      ["最大所持", `${fmt(stats.maxCoinsHeld)} 🪙`],
      ["最大うさぎ数", `${fmt(stats.maxBunniesHeld)} 🐰`],
      ["最大一撃", `+${fmt(stats.maxSingleGain)}`],
      ["キャンディ回数", `${fmt(stats.totalCandies)} 🍬`],
      ["旅立ち回数", `${fmt(stats.totalDepartures)} 🐰`],
      ["レア台詞", `${fmt(stats.totalRareDepartMsgs)} ✨`],
    ];
    bestBox.innerHTML = bestRows.map(([k,v]) =>
      `<div class="rankRow"><span>${k}</span><span><small>${v}</small></span></div>`
    ).join("");

    const d = loadDaily();
    const entries = Object.entries(d).map(([k,v]) => ({k,v}))
      .sort((a,b) => b.k.localeCompare(a.k))
      .slice(0, 7);
    dailyBox.innerHTML = entries.length
      ? entries.map(e => `<div class="rankRow"><span>${e.k}</span><span><small>${fmt(e.v)} 🪙</small></span></div>`).join("")
      : `<div class="rankRow"><span>まだ記録がありません</span><span><small>—</small></span></div>`;

    achBox.innerHTML = ACH.map(a => {
      const isOn = unlocked.has(a.id);
      return `
        <div class="achItem ${isOn ? "" : "locked"}">
          <div>
            <div class="achName ${a.rare ? "achRare":""}">${isOn ? "✅" : "🔒"} ${a.name}</div>
            <div class="achDesc">${a.desc}</div>
          </div>
          <div class="achRight">${a.rare ? "RARE" : "OK"}</div>
        </div>
      `;
    }).join("");
  }

  /* ===== Depart messages ===== */
  const DEPART_MESSAGES = ["ありがとう…","またね…","いってきます…","だいすき…","たのしかった…","ばいばい…","げんきでね…"];
  const DEPART_RARE_MESSAGES = ["伝説になるね…✨","星になって見守るよ…🌟","また会おうね、約束…💛","この牧場、最高だった…👑","…君のコインは輝いてる…✨"];
  const DEPART_RARE_CHANCE = 0.03;
  function pickDepartMessageObj() {
    const rare = Math.random() < DEPART_RARE_CHANCE;
    const arr = rare ? DEPART_RARE_MESSAGES : DEPART_MESSAGES;
    return { text: arr[Math.floor(Math.random() * arr.length)], rare };
  }

  /* ===== FX ===== */
  function spawnGainPop(x, y, value) {
    const fr = fieldRect();
    const d = document.createElement("div");
    d.className = "gainPop show";
    d.textContent = `+${value}`;
    if (value >= 100) d.classList.add("rainbow");
    d.style.left = `${clamp(x, 0, fr.width)}px`;
    d.style.top  = `${clamp(y, 0, fr.height)}px`;
    coinLayer.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  function spawnSparks(x, y) {
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("div");
      s.className = "spark show";
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${(Math.random()*2-1)*70}px`);
      s.style.setProperty("--dy", `${(Math.random()*2-1)*70-30}px`);
      s.style.background = `rgba(255,255,255,${0.7 + Math.random()*0.3})`;
      coinLayer.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  function spawnDepartFx(x, y) {
    for (let i = 0; i < 12; i++) {
      const p = document.createElement("div");
      p.className = "puff show";
      const a = 0.65 + Math.random() * 0.25;
      p.style.background = (Math.random() < 0.35) ? `rgba(255,195,220,${a})` : `rgba(255,255,255,${a})`;
      const sz = 10 + Math.random() * 14;
      p.style.width = `${sz}px`;
      p.style.height = `${sz}px`;
      p.style.setProperty("--dx", `${(Math.random()*2-1)*60}px`);
      p.style.setProperty("--dy", `${-20 - Math.random()*70}px`);
      p.style.left = `${x}px`;
      p.style.top  = `${y}px`;
      coinLayer.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  }

  function spawnDepartMsg(x, y, msg) {
    const fr = fieldRect();
    const d = document.createElement("div");
    d.className = "departMsg show";
    if (msg.rare) d.classList.add("rare");
    d.textContent = msg.text;
    d.style.left = `${clamp(x, 0, fr.width)}px`;
    d.style.top  = `${clamp(y, 0, fr.height)}px`;
    coinLayer.appendChild(d);
    setTimeout(() => d.remove(), 2200;
  }

  /* ===== Candy ===== */
  class Candy {
    constructor(x, ttlMs = 10000) {
      this.x = x; this.y = -60; this.vy = 0;
      this.gravity = 2600; this.resting = false;
      this.spawnAt = performance.now(); this.ttlMs = ttlMs;

      this.el = document.createElement("img");
      this.el.className = "candy";
      this.el.src = ASSETS.candy;
      this.el.draggable = false;
      coinLayer.appendChild(this.el);
      this.render();
    }
    floorY() { return groundY() - 2; }
    isExpired(now) { return (now - this.spawnAt) >= this.ttlMs; }
    remove() { this.el.remove(); }
    update(dt) {
      if (!this.resting) {
        this.vy += this.gravity * dt;
        this.y += this.vy * dt;
        const fy = this.floorY();
        if (this.y >= fy) { this.y = fy; this.vy = 0; this.resting = true; }
      }
      this.render();
    }
    render() {
      this.el.style.left = `${this.x - 26}px`;
      this.el.style.top  = `${this.y - 26}px`;
      const t = performance.now() / 200;
      this.el.style.transform = `rotate(${Math.sin(t)*6}deg)`;
    }
  }

  /* ===== Bunny ===== */
  let bunnyIdSeq = 1;
  class Bunny {
    constructor() {
      this.id = bunnyIdSeq++;

      this.wrap = document.createElement("div");
      this.wrap.className = "bunnyWrap";

      this.heart = document.createElement("img");
      this.heart.className = "bunnyHeart";
      this.heart.src = ASSETS.hart;
      this.heart.draggable = false;

      this.el = document.createElement("img");
      this.el.className = "bunny walk";
      this.el.src = ASSETS.bunny;
      this.el.draggable = false;

      this.wrap.appendChild(this.heart);
      this.wrap.appendChild(this.el);
      bunnyLayer.appendChild(this.wrap);

      this.x = 0;
      this.baseHomeX = 0;
      this.baseHomeY = 0;
      this.targetHomeX = 0;

      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.baseSpeed = 55 + Math.random() * 65;
      this.roamRange = 90 + Math.random() * 260;

      this.gauge = Math.random() * 0.25;
      this.gaugePeriod = randomGaugeSeconds();
      this.charged = false;

      this.lastClickAt = Date.now();
      this.lastClickSpawnAt = 0;

      this.wrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        unlockAudioOnce();
        this.tryClickDrop();
      });
    }

    setBaseHome(x, y) {
      this.baseHomeX = x;
      this.baseHomeY = y;
      if (this.x === 0) this.x = x;
    }

    idleSeconds() { return (Date.now() - this.lastClickAt) / 1000; }

    updateGauge(dt) {
      if (this.charged) return;
      this.gauge += dt / this.gaugePeriod;
      if (this.gauge >= 1) {
        this.gauge = 1;
        this.charged = true;
        this.heart.classList.add("ready");
      }
    }

    tryClickDrop() {
      const t = performance.now();
      if (t - this.lastClickSpawnAt < 1000) return;
      this.lastClickSpawnAt = t;

      this.lastClickAt = Date.now();
      playSE(sePoyo);

      const wasCharged = this.charged;
      if (wasCharged) {
        this.charged = false;
        this.gauge = 0;
        this.gaugePeriod = randomGaugeSeconds();
        this.heart.classList.remove("ready");
        this.heart.classList.add("show");
        setTimeout(() => this.heart.classList.remove("show"), 700);
      }

      spawnCoinAtBunny(this, wasCharged);
    }

    update(dt, crowdIndex, crowdCount, candyTargetXOrNull) {
      this.updateGauge(dt);

      if (candyTargetXOrNull != null) {
        const spread = 52;
        const center = (crowdCount - 1) / 2;
        const offset = (crowdIndex - center) * spread;
        this.targetHomeX = candyTargetXOrNull + offset;
      } else {
        this.targetHomeX = this.baseHomeX;
      }

      const homeX = lerp(this.x, this.targetHomeX, 0.03);
      const roam = (candyTargetXOrNull != null) ? 35 : this.roamRange;
      const min = homeX - roam, max = homeX + roam;
      const spd = this.baseSpeed * (candyTargetXOrNull != null ? 1.25 : 1.0);

      this.x += this.dir * spd * dt;
      if (this.x < min) this.dir = 1;
      if (this.x > max) this.dir = -1;

      this.wrap.classList.toggle("flip", this.dir < 0);
      this.wrap.style.left = `${this.x}px`;
      this.wrap.style.top  = `${this.baseHomeY}px`;
    }
  }

  /* ===== Coin ===== */
  class Coin {
    constructor(x, yStart, yFloor, tier, value, flashy) {
      this.value = value;
      this.flashy = flashy;
      this.collected = false;

      this.el = document.createElement("img");
      this.el.className = "coin";
      this.el.src = ASSETS.coins[tier - 1];
      this.el.draggable = false;

      this.x = x; this.y = yStart; this.yFloor = yFloor;
      this.vx = (Math.random() * 2 - 1) * (flashy ? 22 : 10);
      this.vy = 0;
      this.gravity = flashy ? 2400 : 2100;
      this.bounce = flashy ? 0.62 : 0.38;
      this.resting = false;

      this.spin = flashy ? (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10) : 0;
      this.angle = 0;

      this.el.addEventListener("pointerenter", () => this.collect());
      this.el.addEventListener("click", (e) => { e.preventDefault(); this.collect(); });

      coinLayer.appendChild(this.el);
      this.render();
    }

    collect() {
      if (this.collected) return;
      this.collected = true;

      spawnGainPop(this.x, this.y, this.value);

      coins += this.value;
      saveCore();
      updateHud();
      bumpCoinHud();
      playSE(seCoin);

      stats.maxCoinsHeld = Math.max(stats.maxCoinsHeld, coins);
      stats.maxSingleGain = Math.max(stats.maxSingleGain, this.value);
      saveStats();
      onGain(this.value);

      this.el.remove();
      const idx = coinsOnField.indexOf(this);
      if (idx >= 0) coinsOnField.splice(idx, 1);
    }

    update(dt) {
      if (this.collected || this.resting) return;

      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.flashy) this.angle += this.spin * dt;

      if (this.y >= this.yFloor) {
        this.y = this.yFloor;
        if (Math.abs(this.vy) > 260) this.vy = -this.vy * this.bounce;
        else { this.resting = true; this.vy = 0; this.vx = 0; }
      }
      this.render();
    }

    render() {
      this.el.style.left = `${this.x - 22}px`;
      this.el.style.top  = `${this.y - 22}px`;
      const squash = (!this.resting && this.y > this.yFloor - 16);
      if (this.flashy) {
        const rot = this.angle * 180 / Math.PI;
        const scale = squash ? "scale(1.18,0.88)" : "scale(1.08,1.08)";
        this.el.style.transform = `${scale} rotate(${rot}deg)`;
      } else {
        this.el.style.transform = squash ? `scale(1.05,0.95)` : `scale(1,1)`;
      }
    }
  }

  function spawnCoinAtBunny(bunny, flashy) {
    const baseTier = coinTierFromIdleSeconds(bunny.idleSeconds());
    const tier = flashy ? applyRareBoost(baseTier) : baseTier;
    const value = coinValueFromTier(tier);

    const fr = fieldRect();
    const gY = groundY();
    const r = bunny.wrap.getBoundingClientRect();
    const x = (r.left - fr.left) + (r.width / 2);
    const startY = gY - (flashy ? 220 : 150);

    if (flashy) { spawnSparks(x, startY); shineCoinHud(); }

    const c = new Coin(x, startY, gY - 2, tier, value, flashy);
    coinsOnField.push(c);
  }

  /* ===== Candy ===== */
  function flashButtonText(btn, text, ms = 650) {
    const prev = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = prev), ms);
  }

  function setCandyMode(on) {
    candyArmed = on;
    candyBtn.classList.toggle("armed", on);
    hintEl.classList.toggle("hidden", !on);
    if (on) hintEl.textContent = `🍬 フィールドをクリックすると、上からキャンディを落とします（${COST.CANDY}🪙）`;
  }

  candyBtn.addEventListener("click", () => {
    if (!candyArmed && coins < COST.CANDY) { flashButtonText(candyBtn, "コイン不足…"); return; }
    setCandyMode(!candyArmed);
  });

  field.addEventListener("pointerdown", (e) => {
    if (!candyArmed) return;

    if (coins < COST.CANDY) { setCandyMode(false); flashButtonText(candyBtn, "コイン不足…"); return; }

    coins -= COST.CANDY;
    saveCore();
    updateHud();
    bumpCoinHud();
    onSpend(COST.CANDY);
    onCandy();

    const fr = fieldRect();
    const x = clamp(e.clientX - fr.left, 30, fr.width - 30);

    candies.push(new Candy(x, 10000));
    setCandyMode(false);
  });

  /* ===== Depart (HUD button) ===== */
  function updateDepartTip() {
    if (!departTip) return;
    departTip.innerHTML =
      `${COST.DEPART}🪙 消費で うさぎを1匹送り出します。<br/>` +
      `※最後の1匹は旅立ちできません。`;
  }
  updateDepartTip();

  departBtn.addEventListener("click", () => {
    if (bunnies.length <= 1) { flashButtonText(departBtn, "ムリ…"); return; }
    if (coins < COST.DEPART) { flashButtonText(departBtn, "不足…"); return; }

    const victim = bunnies[bunnies.length - 1];
    const fr = fieldRect();
    const r = victim.wrap.getBoundingClientRect();
    const fxX = (r.left - fr.left) + r.width * 0.5;
    const fxY = (r.top - fr.top) + r.height * 0.65;

    coins -= COST.DEPART;
    saveCore();
    updateHud();
    bumpCoinHud();
    onSpend(COST.DEPART);

    departBtn.disabled = true;

    const msg = pickDepartMessageObj();
    victim.wrap.classList.add("departing");
    playSE(seTabidati);
    spawnDepartFx(fxX, fxY);
    spawnDepartMsg(fxX, fxY - 40, msg);
    onDepart(msg.rare);

    setTimeout(() => {
      bunnyCount = bunnies.length - 1;
      saveCore();
      rebuildBunnies(bunnyCount);
      updateHud();
      departBtn.disabled = false;
    }, 420);
  });

  /* ===== Modals ===== */
  function openModal(type) {
    const open = !!type;
    modalBackdrop.classList.toggle("hidden", !open);
    shopModal.classList.toggle("hidden", type !== "shop");
    rankModal.classList.toggle("hidden", type !== "rank");
    if (type === "shop") updateShopUI();
    if (type === "rank") renderRankModal();
  }

  shopBtn.onclick = () => openModal("shop");
  rankBtn.onclick = () => openModal("rank");
  closeShopBtn.onclick = () => openModal(null);
  closeRankBtn.onclick = () => openModal(null);
  modalBackdrop.onclick = () => openModal(null);

  /* ===== Shop ===== */
  function updateShopUI() {
    bunnyPriceEl.textContent = String(getBunnyPrice(bunnies.length));
  }

  buyBunnyBtn.addEventListener("click", () => {
    const price = getBunnyPrice(bunnies.length);
    if (coins < price) { flashButtonText(buyBunnyBtn, "コイン不足…"); return; }

    coins -= price;
    bunnyCount = bunnies.length + 1;
    saveCore();

    stats.maxBunniesHeld = Math.max(stats.maxBunniesHeld, bunnyCount);
    saveStats();
    onSpend(price);

    rebuildBunnies(bunnyCount);
    updateShopUI();
    updateHud();
    bumpCoinHud();
  });

  /* ===== Init & Loop ===== */
  function rebuildBunnies(n) {
    bunnyLayer.innerHTML = "";
    bunnies.length = 0;
    bunnyIdSeq = 1;

    for (let i = 0; i < n; i++) bunnies.push(new Bunny());

    stats.maxBunniesHeld = Math.max(stats.maxBunniesHeld, n);
    saveStats();

    layoutBunnies();
    updateHud();
    checkAchievements();
  }

  function layoutBunnies() {
    const fr = fieldRect();
    const gY = groundY();
    const step = Math.max(70, fr.width / Math.max(1, bunnies.length));
    bunnies.forEach((b, i) => b.setBaseHome(20 + step * i, gY - 120));
  }

  function tick(ts) {
    const dt = Math.min(0.033, (ts - lastFrame) / 1000);
    lastFrame = ts;

    const now = performance.now();
    for (let i = candies.length - 1; i >= 0; i--) {
      const c = candies[i];
      c.update(dt);
      if (c.isExpired(now)) { c.remove(); candies.splice(i, 1); }
    }

    const targetCandy = candies.length ? candies[candies.length - 1] : null;
    const targetX = targetCandy ? targetCandy.x : null;

    for (let i = 0; i < bunnies.length; i++) {
      bunnies[i].update(dt, i, bunnies.length, targetX);
    }

    for (const c of coinsOnField) c.update(dt);

    rafId = requestAnimationFrame(tick);
  }

  function init() {
    stats.maxCoinsHeld = Math.max(stats.maxCoinsHeld, coins);
    stats.maxBunniesHeld = Math.max(stats.maxBunniesHeld, bunnyCount);
    saveStats();

    rebuildBunnies(bunnyCount);
    updateHud();
    updateShopUI();
    setCandyMode(false);

    window.addEventListener("resize", () => layoutBunnies());

    resetBtn.onclick = () => {
      if (!confirm("リセットしますか？")) return;
      coins = 0;
      bunnyCount = 2;
      saveCore();

      for (const c of coinsOnField) c.el.remove();
      coinsOnField.length = 0;

      for (const c of candies) c.remove();
      candies.length = 0;

      rebuildBunnies(bunnyCount);
      updateHud();
      updateShopUI();
      setCandyMode(false);
    };

    cancelAnimationFrame(rafId);
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  init();
})();
