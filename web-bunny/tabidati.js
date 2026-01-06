// tabidati.js
// 「旅立ちON中は、クリックしたウサギを何匹でも旅立たせ続ける」版
// app.js が window.WB を公開している前提

(() => {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(() => {
    const WB = window.WB;
    if (!WB) {
      console.error("[tabidati.js] window.WB が見つかりません。app.js の WB 公開を確認してください。");
      return;
    }

    const btn = WB.departBtn;
    const layer = WB.bunnyLayer || document.getElementById("bunnyLayer");

    if (!btn) {
      console.warn("[tabidati.js] #departBtn が見つかりません（旅立ちボタンなし）");
      return;
    }
    if (!layer) {
      console.warn("[tabidati.js] #bunnyLayer が見つかりません（うさぎクリック奪取ができません）");
      return;
    }

    // ===== 内部状態 =====
    let departMode = false;

    const normalText = btn.textContent || "旅立ち";
    const onText = "旅立ちON：クリックで旅立つ";

    function setMode(on) {
      departMode = !!on;
      if (departMode) {
        btn.classList.add("active");
        btn.textContent = onText;
      } else {
        btn.classList.remove("active");
        btn.textContent = normalText;
      }
    }

    function findBunnyByWrap(wrapEl) {
      if (!wrapEl || !WB.bunnies) return null;
      for (const b of WB.bunnies) {
        if (b && b.wrap === wrapEl) return b;
      }
      return null;
    }

    function departBunny(bunny) {
      if (!bunny) return false;

      // うさぎ1匹以下なら不可
      if (!WB.bunnies || WB.bunnies.length <= 1) return false;

      // コイン不足なら不可
      if (WB.coins < WB.DEPART_COST) return false;

      // 支払い
      WB.coins -= WB.DEPART_COST;
      WB.saveCoins?.();
      WB.updateHud?.();
      WB.refreshShopUI?.();

      // SE
      WB.playSE?.(WB.seTabidati);

      // bunnies配列から除去
      const idx = WB.bunnies.indexOf(bunny);
      if (idx >= 0) WB.bunnies.splice(idx, 1);

      // 図鑑: 旅立ち回数
      WB.recordFarewell?.(bunny.kind);

      // お別れメッセージ
      WB.showFarewellMessage?.(bunny.kind);

      // DOM削除
      try { bunny.wrap?.remove(); } catch {}

      // 保存 & unlock check
      WB.saveBunnyMeta?.();
      WB.checkUnlocks?.();

      return true;
    }

    // ===== 旅立ちボタン：ON/OFF =====
    btn.addEventListener("click", () => {
      WB.unlockAudioOnce?.();

      // 1匹以下ならONにしない
      if (!WB.bunnies || WB.bunnies.length <= 1) {
        setMode(false);
        return;
      }

      setMode(!departMode);
    });

    // ===== departMode中のクリックを奪って旅立たせる（連続） =====
    layer.addEventListener(
      "pointerdown",
      (e) => {
        if (!departMode) return;

        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;

        // 通常クリック（コイン雨/ぽよ）を止める
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}
        try { e.stopImmediatePropagation(); } catch {}

        const bunny = findBunnyByWrap(wrap);
        if (!bunny) return;

        const ok = departBunny(bunny);

        // 条件で自動OFF
        // - 残り1匹になった
        // - コインが足りなくなった
        if (!ok || !WB.bunnies || WB.bunnies.length <= 1 || WB.coins < WB.DEPART_COST) {
          setMode(false);
        }
      },
      true // capture
    );

    // ===== 背景クリックでOFF（任意：邪魔なら消してOK） =====
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!departMode) return;
        if (e.target === btn || btn.contains(e.target)) return;
        if (e.target?.closest?.(".bunnyWrap")) return;
        setMode(false);
      },
      true
    );
  });
})();
