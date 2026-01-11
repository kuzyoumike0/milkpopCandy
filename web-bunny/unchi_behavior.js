// unchi_behavior.js（危険回避＆黄金吸引）v1.0.0
// ✅ 通常うんち：近づいたら避ける（dirを反転方向へ）
// ✅ 黄金うんち：近づいたら寄っていく（ギャグ）
// ✅ 追跡/回避中だけ baseSpeed を倍率で調整（解除で復帰）
// ✅ DOMから unchi / ougonunchi を検出（img src を見る）
//
// 読み込み：app.js の後（最後の方推奨）

(() => {
  "use strict";
  if (window.__UNCHI_BEHAVIOR_V100__) return;
  window.__UNCHI_BEHAVIOR_V100__ = true;

  const CFG = {
    TICK_MS: 90,

    // 通常うんち回避
    AVOID_ENABLED: true,
    AVOID_RADIUS_PX: 260,     // これ以内に入ったら避ける
    AVOID_PUSH_PX: 4,         // “押し返し”の微調整（dirだけだと拮抗する時用）
    AVOID_SPEED_MUL: 1.15,    // 逃げる時はちょい速く

    // 黄金うんち吸引（ギャグ）
    ATTRACT_ENABLED: true,
    ATTRACT_RADIUS_PX: 520,   // これ以内なら寄る
    ATTRACT_EAT_RADIUS_PX: 34,// ここまで近づいたら「つつく」演出（消さない）
    ATTRACT_SPEED_MUL: 1.35,  // 寄る時はちょい速く

    // 検出：srcにこれが含まれてたら判定
    UNCHI_KEYWORD: "unchi.png",
    OUGON_KEYWORD: "ougonunchi.png",
  };

  const bunnyOrigSpeed = new WeakMap(); // bunny -> original baseSpeed
  const bunnyMode = new WeakMap();      // bunny -> "avoid"|"attract"|null

  const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));

  function ensureOrigSpeed(b) {
    if (bunnyOrigSpeed.has(b)) return;
    const v = Number(b?.baseSpeed);
    bunnyOrigSpeed.set(b, Number.isFinite(v) && v > 0 ? v : 50);
  }
  function restoreSpeed(b) {
    const v = bunnyOrigSpeed.get(b);
    if (v != null) b.baseSpeed = v;
  }

  function getBunnies() {
    try {
      const arr = window.WB?.getBunnies?.();
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function getBunnyCenter(b) {
    // app.js では wrap 140x140。念のためDOMを読む
    let w = 140, h = 140;
    try {
      const r = b?.wrap?.getBoundingClientRect?.();
      if (r && r.width > 10 && r.height > 10) { w = r.width; h = r.height; }
    } catch {}

    const x = Number(b?.x) || 0;
    const y = Number(b?.y) || 0;

    // 足元中心（oyatuと同じ感覚）
    return { x: x + w * 0.5, y: y + h * 0.85, w, h };
  }

  function findUnchiImgs() {
    // うんちDOMのclass名が不明でも、srcで拾う
    const imgs = $$('img[src*="unchi"]');
    const normal = [];
    const ougon = [];

    for (const img of imgs) {
      const src = String(img.getAttribute("src") || "");
      if (!src) continue;
      if (src.includes(CFG.OUGON_KEYWORD)) ougon.push(img);
      else if (src.includes(CFG.UNCHI_KEYWORD)) normal.push(img);
    }
    return { normal, ougon };
  }

  function centerOfImg(img) {
    const r = img.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function steerAvoid(b, threatPt) {
    ensureOrigSpeed(b);
    const bc = getBunnyCenter(b);

    const dx = threatPt.x - bc.x; // threat - bunny
    // threat が右にいるなら左へ逃げる（dir=-1）
    if (dx > 0) b.dir = -1;
    else if (dx < 0) b.dir = 1;

    const orig = bunnyOrigSpeed.get(b) || 50;
    b.baseSpeed = Math.max(20, orig * CFG.AVOID_SPEED_MUL);

    // “押し返し” 微調整（dirだけだと膠着する時がある）
    try {
      const push = CFG.AVOID_PUSH_PX;
      if (dx > 0) b.x -= push;
      else b.x += push;
    } catch {}

    bunnyMode.set(b, "avoid");
  }

  function steerAttract(b, targetPt) {
    ensureOrigSpeed(b);
    const bc = getBunnyCenter(b);

    const dx = targetPt.x - bc.x; // target - bunny
    if (dx > 2) b.dir = 1;
    else if (dx < -2) b.dir = -1;

    const orig = bunnyOrigSpeed.get(b) || 50;
    b.baseSpeed = Math.max(20, orig * CFG.ATTRACT_SPEED_MUL);

    bunnyMode.set(b, "attract");
  }

  function tick() {
    const bunnies = getBunnies();
    if (!bunnies.length) return;

    const { normal, ougon } = findUnchiImgs();

    // うんちが無いなら復帰
    if (!normal.length && !ougon.length) {
      for (const b of bunnies) {
        if (!b) continue;
        if (bunnyMode.has(b)) {
          restoreSpeed(b);
          bunnyMode.delete(b);
        }
      }
      return;
    }

    for (const b of bunnies) {
      if (!b) continue;

      const bc = getBunnyCenter(b);

      // 1) 回避が最優先（通常うんち）
      if (CFG.AVOID_ENABLED && normal.length) {
        let nearest = null;
        let bestD = Infinity;

        for (const img of normal) {
          if (!img.isConnected) continue;
          const p = centerOfImg(img);
          const d = Math.hypot(p.x - bc.x, p.y - bc.y);
          if (d < bestD) { bestD = d; nearest = p; }
        }

        if (nearest && bestD <= CFG.AVOID_RADIUS_PX) {
          steerAvoid(b, nearest);
          continue; // 回避中は黄金吸引しない
        }
      }

      // 2) 黄金は寄る（ギャグ）
      if (CFG.ATTRACT_ENABLED && ougon.length) {
        let nearest = null;
        let bestD = Infinity;

        for (const img of ougon) {
          if (!img.isConnected) continue;
          const p = centerOfImg(img);
          const d = Math.hypot(p.x - bc.x, p.y - bc.y);
          if (d < bestD) { bestD = d; nearest = p; }
        }

        if (nearest && bestD <= CFG.ATTRACT_RADIUS_PX) {
          steerAttract(b, nearest);

          // 近づいたら “つつく” 演出（消さない：ギャグ維持）
          if (bestD <= CFG.ATTRACT_EAT_RADIUS_PX) {
            try { window.WB?.emit?.("ougonunchi:poke", { bunnyBornAt: b.bornAt }); } catch {}
          }
          continue;
        }
      }

      // 3) 何もしてないなら速度復帰
      if (bunnyMode.has(b)) {
        restoreSpeed(b);
        bunnyMode.delete(b);
      }
    }
  }

  let timer = 0;
  function start() {
    if (timer) return;
    timer = window.setInterval(() => {
      try { tick(); } catch {}
    }, CFG.TICK_MS);
  }

  start();

  window.UNCHI_BEHAVIOR = window.UNCHI_BEHAVIOR || {};
  window.UNCHI_BEHAVIOR.setAvoid = (on) => { CFG.AVOID_ENABLED = !!on; };
  window.UNCHI_BEHAVIOR.setAttract = (on) => { CFG.ATTRACT_ENABLED = !!on; };

  console.log("[unchi_behavior] ready v1.0.0", {
    tickMs: CFG.TICK_MS,
    avoidRadius: CFG.AVOID_RADIUS_PX,
    attractRadius: CFG.ATTRACT_RADIUS_PX,
  });
})();
