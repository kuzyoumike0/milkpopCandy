// tennshi_on_prestige.js (v1.0)
// ✅ 転生する度に assets/tennshi.png を1体増やす（累計=転生回数）
// ✅ リロードしても常駐（localStorage）
// ✅ WB API の差異に強い（spawn/add/clone のフォールバック）
//
// 期待するもの：
// - どこかで転生回数が localStorage に保存される OR 転生完了時に WB.emit/dispatchEvent が飛ぶ
// - WB.getBunnies() があるとより確実（無くてもDOM検出で最低限動く）

(() => {
  "use strict";
  if (window.__TENNSHI_ON_PRESTIGE_V1__) return;
  window.__TENNSHI_ON_PRESTIGE_V1__ = true;

  const TENNSHI_IMG = "./assets/tennshi.png";

  // あなたの転生処理が使っているキーに合わせて、ここだけ変えればOK
  // 例：prestige.js で LS_PRESTIGE_COUNT を使ってるなら同じにする
  const LS_PRESTIGE_COUNT = "milkpop_prestige_count_v1";

  // 天使の累計保存（安全策：転生回数と別に保持）
  const LS_TENNSHI_COUNT = "milkpop_tennshi_count_v1";

  // 二重生成防止の検出キー（DOM/データ両方）
  const TENNSHI_MARK = "data-tennshi";

  const WAIT_MS = 8000;
  const TICK_MS = 250;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function readIntLS(key, def = 0) {
    try {
      const v = parseInt(localStorage.getItem(key) || "", 10);
      return Number.isFinite(v) ? v : def;
    } catch {
      return def;
    }
  }
  function writeIntLS(key, v) {
    try { localStorage.setItem(key, String(Math.max(0, v | 0))); } catch {}
  }

  function getPrestigeCountGuess() {
    // ① 転生回数（あなたの prestige.js に合わせる）
    const a = readIntLS(LS_PRESTIGE_COUNT, 0);

    // ② もし別キーで管理してる場合の保険（必要なら増やしてOK）
    // const b = readIntLS("milkpop_prestigeCount", 0);

    return Math.max(0, a);
  }

  function getTennshiCountSaved() {
    return readIntLS(LS_TENNSHI_COUNT, 0);
  }

  function setTennshiCountSaved(n) {
    writeIntLS(LS_TENNSHI_COUNT, n);
  }

  function domCountTennshi() {
    // 画像srcで判定（tennshi.pngが入ってる要素）
    const imgs = [...document.querySelectorAll("img")];
    let c = 0;
    for (const im of imgs) {
      const s = (im.getAttribute("src") || "").toLowerCase();
      if (s.includes("tennshi.png")) c++;
    }
    // data-mark を付けた要素もカウント（clone系）
    c += document.querySelectorAll(`[${TENNSHI_MARK}="1"]`).length;
    return c;
  }

  function wbCountTennshi() {
    try {
      if (window.WB?.getBunnies) {
        const bs = WB.getBunnies() || [];
        let c = 0;
        for (const b of bs) {
          const img = (b?.img || b?.skin || b?.src || b?.image || "").toString().toLowerCase();
          const el = b?.el || b?.node || b?.wrap || null;
          const elSrc = el?.querySelector?.("img")?.getAttribute?.("src") || "";
          if (img.includes("tennshi.png") || elSrc.toLowerCase().includes("tennshi.png")) c++;
        }
        return c;
      }
    } catch {}
    return domCountTennshi();
  }

  // ====== 生成（WB API が何を提供してるか分からないので順番に試す） ======

  function trySpawnByWB() {
    const WB = window.WB;
    if (!WB) return false;

    // 1) 明示的な spawn API（よくある）
    try {
      if (typeof WB.spawnBunny === "function") {
        WB.spawnBunny({ img: TENNSHI_IMG, tag: "tennshi" });
        return true;
      }
    } catch {}

    // 2) addBunny(img) 系
    try {
      if (typeof WB.addBunny === "function") {
        WB.addBunny(TENNSHI_IMG, { tag: "tennshi" });
        return true;
      }
    } catch {}

    // 3) defs から作れる系
    try {
      if (typeof WB.createBunny === "function") {
        WB.createBunny({ img: TENNSHI_IMG, tag: "tennshi" });
        return true;
      }
    } catch {}

    return false;
  }

  function tryCloneFromExistingDOM() {
    // 最低限：既存うさぎDOMを複製して見た目だけ天使にする（移動ロジックは既存依存）
    // ※WB側でDOM走査して動かしてるタイプなら、これでも動くことがある
    const layer = document.querySelector("#bunnyLayer") || document.querySelector(".bunnyWrap") || null;
    if (!layer) return false;

    const any = layer.querySelector(".bunny, img");
    if (!any) return false;

    const wrap = any.closest?.(".bunnyWrap") || any.parentElement;
    if (!wrap) return false;

    const clone = wrap.cloneNode(true);
    // img差し替え
    const im = clone.querySelector("img");
    if (im) im.src = TENNSHI_IMG;
    clone.setAttribute(TENNSHI_MARK, "1");

    // 位置を少しずらす
    try {
      const x = Math.floor(20 + Math.random() * 120);
      const y = Math.floor(30 + Math.random() * 60);
      clone.style.transform = `translate(${x}px, ${y}px)`;
    } catch {}

    layer.appendChild(clone);
    return true;
  }

  function spawnOneTennshi() {
    // まずWBで生成を試す
    if (trySpawnByWB()) return true;

    // ダメなら最終手段でDOM複製（環境によっては動かないので注意）
    if (tryCloneFromExistingDOM()) return true;

    console.warn("[tennshi] spawn failed: no WB spawn API and no bunny DOM to clone");
    return false;
  }

  // ====== 目標数に合わせて不足分を生成 ======
  function ensureTennshiTo(targetCount) {
    targetCount = Math.max(0, targetCount | 0);

    const cur = wbCountTennshi();
    if (cur >= targetCount) return;

    const need = clamp(targetCount - cur, 0, 50); // 念のため上限
    for (let i = 0; i < need; i++) spawnOneTennshi();
  }

  // ====== 転生を「検知」してカウントを増やす ======
  function onPrestigeDetected() {
    // 転生回数を優先し、それが無い/0なら「保存天使数+1」で増やす
    const pc = getPrestigeCountGuess();
    const saved = getTennshiCountSaved();

    const next = Math.max(saved + 1, pc); // pcが進んでるならそれに追従
    setTennshiCountSaved(next);

    ensureTennshiTo(next);
  }

  // 1) WBイベント（もし prestige.js が emit してるなら拾える）
  function hookWBEvents() {
    try {
      if (window.WB?.on) {
        // ありがちなイベント名を広く拾う
        WB.on("prestige", onPrestigeDetected);
        WB.on("prestigeDone", onPrestigeDetected);
        WB.on("reincarnate", onPrestigeDetected);
        WB.on("reincarnateDone", onPrestigeDetected);
      }
    } catch {}
  }

  // 2) windowイベント（もし prestige.js が dispatchEvent してるなら拾える）
  function hookWindowEvents() {
    const handler = () => onPrestigeDetected();
    window.addEventListener("milkpop:prestige", handler);
    window.addEventListener("milkpop:reincarnate", handler);
  }

  // 3) localStorageの転生回数が増えたら拾う（最も確実）
  let lastPrestige = getPrestigeCountGuess();
  function startPollingPrestige() {
    setInterval(() => {
      const now = getPrestigeCountGuess();
      if (now > lastPrestige) {
        lastPrestige = now;

        // 転生回数=天使数に同期（「転生する度に1体」だから）
        setTennshiCountSaved(now);
        ensureTennshiTo(now);
      }
    }, 800);
  }

  // 起動：WBが来たら「保存天使数 or 転生回数」ぶん生成
  function initWhenReady() {
    const start = Date.now();
    const timer = setInterval(() => {
      const ok = !!window.WB;
      const timeout = Date.now() - start > WAIT_MS;
      if (!ok && !timeout) return;

      clearInterval(timer);

      hookWBEvents();
      hookWindowEvents();
      startPollingPrestige();

      const pc = getPrestigeCountGuess();
      const saved = getTennshiCountSaved();
      const target = Math.max(pc, saved);
      setTennshiCountSaved(target);
      ensureTennshiTo(target);

      console.log("[tennshi] init done", { prestige: pc, saved, target });
    }, TICK_MS);
  }

  initWhenReady();

  // デバッグ用
  window.TENNSHI = window.TENNSHI || {};
  window.TENNSHI.spawnOne = () => { setTennshiCountSaved(getTennshiCountSaved() + 1); ensureTennshiTo(getTennshiCountSaved()); };
  window.TENNSHI.syncToPrestige = () => { const pc = getPrestigeCountGuess(); setTennshiCountSaved(pc); ensureTennshiTo(pc); };
})();
