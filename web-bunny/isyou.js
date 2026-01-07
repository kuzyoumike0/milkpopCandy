// isyou.js — 赤枠で選択したうさぎにだけ装着（partyhat）
// ★修正：モーダルが邪魔で赤枠が見えない問題を解決
// - 装着モード中だけ：backdrop は pointer-events:none（背景クリックを通す）
// - モーダルだけ pointer-events:auto（操作できる）
// - 選択中のうさぎ .isyouSelectedTarget は z-index を上げて赤枠を最前面に

(() => {
  "use strict";

  const WAIT_MS = 8000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB.on === "function") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found in time"));
        }
      }, TICK_MS);
    });
  }

  waitForWB()
    .then((WB) => {
      if (window.__ISYOU_INITED__) return;
      window.__ISYOU_INITED__ = true;

      const LS = {
        owned: "wb_isyou_owned_v2",
        equipped: "wb_isyou_equipped_v2",
        title: (WB.LS && WB.LS.title) ? WB.LS.title : "wb_title_v1",
      };

      const ITEMS = {
        partyhat: {
          label: "パーティーハット",
          img: "/assets/isyou/partyhat.png",
          price: 500,
          anchorY: 0.03,
          offsetX: 12,
          offsetY: -6,
          scale: 0.58,
          z: 25,
        },
      };

      const hud = document.getElementById("hud");
      if (!hud) return;

      /* =========================
       * CSS
       * ========================= */
      (function injectCSS() {
        if (document.getElementById("isyouStyleLockHatFixZ")) return;
        const s = document.createElement("style");
        s.id = "isyouStyleLockHatFixZ";
        s.textContent = `
#hud{ pointer-events:auto; }
#isyouBtn{ pointer-events:auto; z-index:2147483647; }

/* 装着モード hover 赤枠 */
body.isyouEquipMode .bunnyWrap:hover{
  outline: 4px solid rgba(255,64,64,.60);
  outline-offset: 3px;
  border-radius: 18px;
}

/* ★選択中：赤枠 + 最前面へ */
.bunnyWrap.isyouSelectedTarget{
  outline: 4px solid rgba(255,64,64,.92);
  outline-offset: 3px;
  border-radius: 18px;
  box-shadow: 0 0 0 2px rgba(255,255,255,.65) inset;
  z-index: 2147483590 !important;   /* ← modalより少し下、backdropより上に見せる */
  position: relative;              /* z-indexを効かせる */
}

/* アクセサリ */
.isyouLayer{ position:absolute; inset:0; pointer-events:none; z-index:50; }
.isyouItem{
  position:absolute; left:50%;
  transform-origin:50% 50%;
  pointer-events:none;
  user-select:none; -webkit-user-drag:none;
}

/* モーダル */
.isyouBackdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.45);
  display:grid; place-items:center;
  z-index:2147483600;
}

/* ★装着モード中：背景(backdrop)はクリックを通す */
body.isyouEquipMode .isyouBackdrop{
  pointer-events:none;              /* ←重要：うさぎクリックが通る */
  background:rgba(0,0,0,.25);
}
/* ★モーダルは触れる */
body.isyouEquipMode .isyouModal{
  pointer-events:auto;              /* ←重要：ボタン選択できる */
}

.isyouModal{
  width:min(92vw,560px);
  max-height:86vh;
  background:#fff;
  border-radius:18px;
  padding:14px;
  box-shadow:0 20px 60px rgba(0,0,0,.30);
  overflow:auto;
}
.isyouHeader{ display:flex; justify-content:space-between; align-items:center; gap:10px; }
.isyouTitle{ font-weight:900; }
.isyouClose{ border:none; background:#eee; border-radius:12px; padding:6px 10px; cursor:pointer; }
.isyouTabs{ display:flex; gap:8px; margin-top:10px; }
.isyouTab{ border:none; padding:8px 10px; border-radius:12px; cursor:pointer; background:#f3f3f3; font-weight:800; }
.isyouTab.on{ background:#ffe6f2; }
.isyouGrid{ margin-top:12px; display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:12px; }
.isyouCard{ background:#fff; border-radius:14px; padding:10px; box-shadow:0 6px 18px rgba(0,0,0,.12); }
.isyouCardHead{ display:flex; align-items:center; gap:10px; }
.isyouThumb{ width:54px; height:54px; object-fit:contain; }
.isyouName{ font-weight:900; }
.isyouRow{ margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.isyouBtn{ border:none; padding:7px 10px; border-radius:12px; cursor:pointer; background:#fff; box-shadow:0 4px 12px rgba(0,0,0,.12); font-weight:800; }
.isyouBtn.primary{ background:#ffe6f2; }
.isyouSmall{ font-size:12px; opacity:.85; }
        `;
        document.head.appendChild(s);
      })();

      /* =========================
       * Storage
       * ========================= */
      function loadJSON(key, fallback) {
        try {
          const v = JSON.parse(localStorage.getItem(key) || "null");
          return v && typeof v === "object" ? v : fallback;
        } catch {
          return fallback;
        }
      }
      const owned = loadJSON(LS.owned, {});
      const equipped = loadJSON(LS.equipped, {});
      function saveAll() {
        localStorage.setItem(LS.owned, JSON.stringify(owned));
        localStorage.setItem(LS.equipped, JSON.stringify(equipped));
      }

      /* =========================
       * HUD button
       * ========================= */
      let btn = document.getElementById("isyouBtn");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "isyouBtn";
        btn.textContent = "お洒落";
        hud.appendChild(btn);
      }

      /* =========================
       * Bunny helpers
       * ========================= */
      const selectedItems = new Set();
      let selectedBornAt = null;
      let equipMode = false;

      function getBunnyList() {
        return Array.isArray(WB.bunnies) ? WB.bunnies : (typeof WB.getBunnies === "function" ? WB.getBunnies() : []);
      }
      function clearSelectedTargetVisual() {
        (getBunnyList() || []).forEach((b) => b?.wrap?.classList?.remove("isyouSelectedTarget"));
      }
      function setSelectedTarget(bunnyOrNull) {
        clearSelectedTargetVisual();
        if (!bunnyOrNull) { selectedBornAt = null; return; }
        selectedBornAt = bunnyOrNull.bornAt;
        bunnyOrNull.wrap?.classList?.add("isyouSelectedTarget");
      }

      /* =========================
       * Accessory drawing
       * ========================= */
      function ensureLayer(bunny) {
        if (!bunny?.wrap) return null;
        let layer = bunny.wrap.querySelector(".isyouLayer");
        if (!layer) {
          layer = document.createElement("div");
          layer.className = "isyouLayer";
          bunny.wrap.appendChild(layer);
        }
        return layer;
      }
      function applyTransform(imgEl, bunny, it) {
        const flip = !!bunny?.wrap?.classList?.contains("flip");
        const fx = flip ? -1 : 1;
        const ox = (Number(it.offsetX) || 0) * (flip ? -1 : 1);
        const oy = (Number(it.offsetY) || 0);
        const sc = (Number(it.scale) || 1);

        imgEl.style.top = `${(Number(it.anchorY) || 0) * 100}%`;
        imgEl.style.transform = `translate(calc(-50% + ${ox}px), ${oy}px) scale(${sc}) scaleX(${fx})`;
        imgEl.style.zIndex = String(it.z || 10);
      }
      function drawAllForBunny(bunny) {
        if (!bunny?.wrap || bunny.isBaby) return;
        const key = String(bunny.bornAt);
        const eq = equipped[key] || {};
        const layer = ensureLayer(bunny);
        if (!layer) return;

        layer.innerHTML = "";
        Object.keys(eq).forEach((itemKey) => {
          if (!eq[itemKey]) return;
          const it = ITEMS[itemKey];
          if (!it) return;
          const img = document.createElement("img");
          img.className = "isyouItem";
          img.dataset.itemKey = itemKey;
          img.src = it.img;
          layer.appendChild(img);
          applyTransform(img, bunny, it);
        });
      }
      function redrawAll() {
        (getBunnyList() || []).forEach(drawAllForBunny);
      }

      function toggleEquip(bunny, itemKey) {
        if (!bunny || bunny.isBaby) return;
        if ((owned[itemKey] || 0) <= 0) return;

        const k = String(bunny.bornAt);
        equipped[k] = equipped[k] || {};
        equipped[k][itemKey] = !equipped[k][itemKey];
        saveAll();
        drawAllForBunny(bunny);
      }

      /* =========================
       * Modal UI (minimum)
       * ========================= */
      let backdrop = null;

      function closeModal() {
        equipMode = false;
        document.body.classList.remove("isyouEquipMode");
        selectedItems.clear();
        setSelectedTarget(null);
        try { backdrop?.remove(); } catch {}
        backdrop = null;
      }

      function openModal() {
        if (backdrop) return;

        backdrop = document.createElement("div");
        backdrop.className = "isyouBackdrop";

        const modal = document.createElement("div");
        modal.className = "isyouModal";
        modal.addEventListener("click", (e) => e.stopPropagation());

        const head = document.createElement("div");
        head.className = "isyouHeader";

        const title = document.createElement("div");
        title.className = "isyouTitle";
        title.textContent = "🎀 お洒落";

        const close = document.createElement("button");
        close.className = "isyouClose";
        close.textContent = "×";
        close.addEventListener("click", closeModal);

        head.appendChild(title);
        head.appendChild(close);

        const body = document.createElement("div");

        const rowTop = document.createElement("div");
        rowTop.className = "isyouRow";

        const toggle = document.createElement("button");
        toggle.className = "isyouBtn primary";
        toggle.textContent = equipMode ? "装着モード：ON（赤枠の子に装着）" : "装着モード：OFF";
        toggle.addEventListener("click", () => {
          equipMode = !equipMode;
          document.body.classList.toggle("isyouEquipMode", equipMode);
          if (!equipMode) setSelectedTarget(null);
          toggle.textContent = equipMode ? "装着モード：ON（赤枠の子に装着）" : "装着モード：OFF";
        });

        const pick = document.createElement("button");
        pick.className = "isyouBtn";
        pick.textContent = selectedItems.has("partyhat") ? "partyhat：選択中" : "partyhat：選択";
        pick.addEventListener("click", () => {
          if ((owned.partyhat || 0) <= 0) {
            pick.textContent = "partyhat：未所持";
            setTimeout(() => {
              pick.textContent = selectedItems.has("partyhat") ? "partyhat：選択中" : "partyhat：選択";
            }, 700);
            return;
          }
          if (selectedItems.has("partyhat")) selectedItems.delete("partyhat");
          else selectedItems.add("partyhat");
          pick.textContent = selectedItems.has("partyhat") ? "partyhat：選択中" : "partyhat：選択";
        });

        rowTop.appendChild(toggle);
        rowTop.appendChild(pick);

        const hint = document.createElement("div");
        hint.className = "isyouSmall";
        hint.style.marginTop = "8px";
        hint.textContent = "装着モードON → うさぎをクリックで赤枠 → 同じうさぎをもう一度クリックで装着/解除";

        body.appendChild(rowTop);
        body.appendChild(hint);

        modal.appendChild(head);
        modal.appendChild(body);

        backdrop.appendChild(modal);
        // ★装着モード中は backdrop が pointer-events:none になるので
        // クリックで閉じる挙動は「×」で閉じる運用に寄せる
        backdrop.addEventListener("click", closeModal);

        document.body.appendChild(backdrop);
      }

      btn.addEventListener("click", () => {
        WB.unlockAudioOnce?.();
        openModal();
      });

      /* =========================
       * Click: 赤枠選択 → 同じ子再クリックで装着
       * ========================= */
      document.addEventListener("pointerdown", (e) => {
        if (!equipMode) return;

        // モーダル内クリックは無視
        if (e.target?.closest?.(".isyouModal")) return;

        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;

        const bunny = (getBunnyList() || []).find((b) => b && b.wrap === wrap) || null;
        if (!bunny || bunny.isBaby) return;

        // 未選択 → 赤枠
        if (selectedBornAt == null) {
          setSelectedTarget(bunny);
          return;
        }

        // 同じ子 → 装着
        if (bunny.bornAt === selectedBornAt) {
          if (selectedItems.size === 0) return;
          selectedItems.forEach((k) => toggleEquip(bunny, k));
          return;
        }

        // 別の子 → 赤枠移動
        setSelectedTarget(bunny);
      }, { capture: true });

      /* =========================
       * Hooks
       * ========================= */
      WB.on?.("bunnyCountChanged", redrawAll);
      WB.on?.("resize", redrawAll);

      redrawAll();
      console.log("[isyou] ready");
    })
    .catch((err) => console.warn("[isyou] init failed:", err?.message || err));
})();
