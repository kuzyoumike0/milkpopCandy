// ✅ V30.0 PATCH：赤枠が「必ず出る」完全版（軽量）
// - 赤枠は body 直下 fixed（overlay依存を完全排除）
// - 装着モード中だけ追従ループ（常時rAFしない）
// - クリック直後に即同期して「出ない」を根絶

(() => {
  "use strict";

  /* =========================
   * SelectBox (fixed)
   * ========================= */
  function ensureSelectBoxFixed() {
    let box = document.getElementById("isyouSelectBoxFixed");
    if (!box) {
      box = document.createElement("div");
      box.id = "isyouSelectBoxFixed";
      box.style.cssText = `
        position: fixed;
        left: -9999px; top: -9999px;
        width: 0px; height: 0px;
        pointer-events: none;
        z-index: 2147483650;
        border-radius: 18px;
        box-sizing: border-box;
        border: 4px solid rgba(255, 64, 64, .95);
        box-shadow:
          0 0 0 3px rgba(255,255,255,.95),
          0 14px 34px rgba(0,0,0,.22);
      `;
      document.body.appendChild(box);
    }
    return box;
  }

  function hideSelectBoxFixed() {
    const box = ensureSelectBoxFixed();
    box.style.left = "-9999px";
    box.style.top = "-9999px";
    box.style.width = "0px";
    box.style.height = "0px";
  }

  function syncSelectBoxFixedToImg(img) {
    const box = ensureSelectBoxFixed();
    if (!img || !img.isConnected) { hideSelectBoxFixed(); return; }

    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;

    box.style.left = `${r.left}px`;
    box.style.top  = `${r.top}px`;
    box.style.width  = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  /* =========================
   * Patch runner (light)
   * ========================= */
  let __raf = 0;
  let __running = false;
  let __last = 0;

  function startLoop(state) {
    if (__running) return;
    __running = true;

    const tick = (ts) => {
      __raf = 0;
      if (!__running) return;

      // 12fpsくらいに制限（重さ対策）
      if (ts - __last < 80) {
        __raf = requestAnimationFrame(tick);
        return;
      }
      __last = ts;

      if (state.mode === "equip" && state.selectedImg) {
        syncSelectBoxFixedToImg(state.selectedImg);
        __raf = requestAnimationFrame(tick);
      } else {
        // 装着モードじゃないなら止める
        hideSelectBoxFixed();
        stopLoop();
      }
    };

    __raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    __running = false;
    if (__raf) cancelAnimationFrame(__raf);
    __raf = 0;
  }

  /* =========================
   * Try patch
   * ========================= */
  const tryPatch = () => {
    const ISYOU = window.ISYOU;
    if (!ISYOU || !ISYOU._state) return false;

    const state = ISYOU._state;

    // 既存の赤枠（overlay版）があれば隠しておく（干渉防止）
    try {
      const old = document.getElementById("isyouSelectBox");
      if (old) old.style.display = "none";
    } catch {}

    // ✅ 「装着モードに入ったら」開始、「抜けたら」停止 を確実にする
    // 1) クリック直後に即同期（最重要）
    // 2) 装着モード中のみ追従（軽量）
    document.addEventListener("pointerdown", (e) => {
      // isyou側が capture で止めるので bubble でも拾える
      // ただし確実性を上げるため capture で拾う
    }, true);

    // 装着モード中のクリックで選択された img を即同期
    const onDown = (e) => {
      if (state.mode !== "equip") return;
      const img =
        e.target?.closest?.("#bunnyLayer img") ||
        (e.target?.tagName === "IMG" ? e.target : null);

      if (img && img.tagName === "IMG") {
        // state.selectedImg は isyou 側で更新されるが、
        // “その瞬間”にまだ入ってない場合があるので両対応
        syncSelectBoxFixedToImg(img);
        // 次フレームでも追いかけて確実に位置確定
        requestAnimationFrame(() => syncSelectBoxFixedToImg(state.selectedImg || img));
        startLoop(state);
      }
    };
    document.addEventListener("pointerdown", onDown, true);

    // 装着モードの間だけ resize/scroll で即同期（保険）
    const onRS = () => {
      if (state.mode === "equip" && state.selectedImg) {
        syncSelectBoxFixedToImg(state.selectedImg);
        startLoop(state);
      } else {
        hideSelectBoxFixed();
        stopLoop();
      }
    };
    window.addEventListener("resize", onRS, { passive: true });
    window.addEventListener("scroll", onRS, { passive: true });

    // 初期状態：もし既に装着モードなら開始
    if (state.mode === "equip" && state.selectedImg) {
      syncSelectBoxFixedToImg(state.selectedImg);
      startLoop(state);
    } else {
      hideSelectBoxFixed();
    }

    console.log("[isyou] patched: select box fixed (light)");
    return true;
  };

  // すぐ/遅延でパッチ試行
  if (!tryPatch()) {
    let t = 0;
    const id = setInterval(() => {
      t++;
      if (tryPatch() || t > 200) clearInterval(id);
    }, 50);
  }
})();
