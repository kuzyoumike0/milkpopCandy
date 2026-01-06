// tabidati.js
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
    if (!btn) {
      console.warn("[tabidati.js] #departBtn が見つかりません（旅立ちボタンなし）");
      return;
    }

    btn.addEventListener("click", () => {
      WB.unlockAudioOnce?.();

      // うさぎ1匹以下なら何もしない
      if (!WB.bunnies || WB.bunnies.length <= 1) return;

      // コイン不足
      if (WB.coins < WB.DEPART_COST) return;

      // コスト支払い
      WB.coins -= WB.DEPART_COST;
      WB.saveCoins?.();
      WB.updateHud?.();
      WB.refreshShopUI?.();

      // SE
      WB.playSE?.(WB.seTabidati);

      // 今まで通り「最後の一匹を旅立たせる」
      const victim = WB.bunnies.pop();
      if (!victim) return;

      // 図鑑: 旅立ち回数
      WB.recordFarewell?.(victim.kind);

      // ふわっとお別れ
      WB.showFarewellMessage?.(victim.kind);

      // DOM削除
      try { victim.wrap?.remove(); } catch {}

      // 保存 & unlock check
      WB.saveBunnyMeta?.();
      WB.checkUnlocks?.();
    });
  });
})();
