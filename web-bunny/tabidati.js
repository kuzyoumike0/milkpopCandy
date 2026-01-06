// tabidati.js
// 「旅立ちボタン → 次にクリックしたウサギを旅立たせる」版
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
    let selecting = false;

    const normalText = btn.textContent || "旅立ち";
    const selectText = "旅立ち：ウサギを選んでね";

    function setSelecting(on) {
      selecting = !!on;
      if (selecting) {
        btn.classList.add("active");
        btn.textContent = selectText;
      } else {
        btn.classList.remove("active");
        btn.textContent = normalText;
      }
    }

    function findBunnyByWrap(wrapEl) {
      if (!wrapEl || !WB.bunnies) return null;
      // bunnies の中から wrap が一致する子を探す
      for (const b of WB.bunnies) {
        if (b && b.wrap === wrapEl) return b;
      }
      return null;
    }

    function departBunny(bunny) {
      if (!bunny) return;

      // うさぎ1匹以下なら不可
      if (!WB.bunnies || WB.bunnies.length <= 1) return;

      // コイン不足なら不可
      if (WB.coins < WB.DEPART_COST) return;

      // 支払い
      WB.coins -= WB.DEPART_COST;
      WB.saveCoins?.();
      WB.updateHud?.();
      WB.refreshShopUI?.();

      // SE
      WB.playSE?.(WB.seTabidati);

      // bunnies配列から除去（popではなく対象削除）
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
    }

    // ===== 旅立ちボタン =====
    btn.addEventListener("click", () => {
      WB.unlockAudioOnce?.();

      // 1匹以下なら選択モードに入らない
      if (!WB.bunnies || WB.bunnies.length <= 1) return;

      // トグル（もう一回押すとキャンセル）
      setSelecting(!selecting);
    });

    // ===== 「次にクリックしたウサギ」を奪って旅立たせる =====
    // capture で先に拾って、Bunny.wrap の pointerdown を発動させない
    layer.addEventListener(
      "pointerdown",
      (e) => {
        if (!selecting) return;

        // 旅立ち選択中だけクリックを奪う
        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;

        // クリックによる通常処理（コイン雨/ぽよ等）を止める
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}
        try { e.stopImmediatePropagation(); } catch {}

        // ここで選択モード解除（成功/失敗に関わらず解除した方が事故らない）
        setSelecting(false);

        const bunny = findBunnyByWrap(wrap);
        if (!bunny) return;

        // 旅立ち実行
        departBunny(bunny);
      },
      true // ★capture
    );

    // 画面のどこかをクリックしてキャンセル（任意）
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!selecting) return;
        // ボタン押下と、うさぎクリックは除外
        if (e.target === btn || btn.contains(e.target)) return;
        if (e.target?.closest?.(".bunnyWrap")) return;
        setSelecting(false);
      },
      true
    );
  });
})();
