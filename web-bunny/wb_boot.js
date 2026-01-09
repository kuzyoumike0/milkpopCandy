// wb_boot.js
// ✅ app.js が途中で落ちても「WBが無い」だけで他モジュールが全滅しないための保険
(() => {
  "use strict";

  if (window.WB && typeof window.WB === "object") return;

  const listeners = new Map();

  window.WB = {
    __boot: true,

    on(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    emit(ev, ...args) {
      const set = listeners.get(ev);
      if (!set) return;
      for (const fn of set) {
        try { fn(...args); } catch {}
      }
    },

    // 最低限の互換（表示だけでも壊れない）
    getCoin() {
      const el = document.getElementById("coinValue");
      return Number(el?.textContent || "0") || 0;
    }
  };

  console.log("[wb_boot] WB bootstrapped");
})();
