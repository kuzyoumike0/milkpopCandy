// isyou.js — 赤枠で選択したうさぎにだけ装着（partyhat）
// - 装着モードON：うさぎクリックで赤枠ロック
// - 赤枠の同じうさぎを再クリック：選択中アイテムを装着/解除（ポンッ）
// - モーダル内クリックは無視（アイテム選択できる）
// - flip補正 / 複数装着OK / babyは装着しない
// - partyhat.png パスは /assets/isyou/partyhat.png

(() => {
  "use strict";

  /* =========================
   * Wait for WB
   * ========================= */
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
      if (window.__ISYOU_INITED__) {
        console.log("[isyou] already inited");
        return;
      }
      window.__ISYOU_INITED__ = true;
      console.log("[isyou] init");

      /* =========================
       * Config
       * ========================= */
      const LS = {
        owned: "wb_isyou_owned_v2",          // { itemKey: number }
        equipped: "wb_isyou_equipped_v2",    // { bornAt: { itemKey:true } }
        title: (WB.LS && WB.LS.title) ? WB.LS.title : "wb_title_v1",
      };

      // 画像パスはあなたの実パスを優先
      const ITEM_IMAGES = {
        partyhat: ["/assets/isyou/partyhat.png", "./assets/isyou/partyhat.png"],
        crown:   ["/assets/isyou/crown.png", "./assets/isyou/crown.png"],
        ribbon:  ["/assets/isyou/ribbon.png", "./assets/isyou/ribbon.png"],
      };

      const ITEMS = {
        partyhat: {
          label: "パーティーハット",
          img: ITEM_IMAGES.partyhat[0],
          price: 500,
          anchorY: 0.03, // 頭頂部寄り
          offsetX: 12,   // 耳の間に寄せる（微調整OK）
          offsetY: -6,
          scale: 0.58,   // ★小さめ
          z: 25,
        },
        crown: {
          label: "王冠",
          img: ITEM_IMAGES.crown[0],
          price: 3500,
          anchorY: 0.10,
          offsetX: 0,
          offsetY: -26,
          scale: 1.15,
          z: 30,
        },
        ribbon: {
          label: "リボン",
          img: ITEM_IMAGES.ribbon[0],
          price: 1200,
          anchorY: 0.55,
          offsetX: 0,
          offsetY: 10,
          scale: 1.05,
          z: 10,
        },
      };

      /* =========================
       * HUD
       * ========================= */
      const hud = document.getElementById("hud");
      if (!hud) {
        console.warn("[isyou] #hud not found");
        return;
      }

      /* =========================
       * CSS inject
       * ========================= */
      (function injectCSS() {
        if (document.getElementById("isyouStyleLockHatV1")) return;
        const s = document.createElement("style");
        s.id = "isyouStyleLockHatV1";
        s.textContent = `
#hud{ pointer-events:auto; }
#isyouBtn{ pointer-events:auto; z-index:2147483647; }

body.isyouEquipMode .bunnyWrap{ outline:none; }
body.isyouEquipMode .bunnyWrap:hover{
  outline: 4px solid rgba(255,64,64,.60);
  outline-offset: 3px;
  border-radius: 18px;
}

.bunnyWrap.isyouSelectedTarget{
  outline: 4px solid rgba(255,64,64,.92);
  outline-offset: 3px;
  border-radius: 18px;
  box-shadow: 0 0 0 2px rgba(255,255,255,.65) inset;
}

.bunnyWrap.isyouJustEquipped{
  outline: 4px solid rgba(255,64,64,.92);
  outline-offset: 3px;
  border-radius: 18px;
  animation: isyouBlink 520ms ease-in-out;
}
@keyframes isyouBlink{
  0%{ filter: brightness(1.0); }
  50%{ filter: brightness(1.15); }
  100%{ filter: brightness(1.0); }
}

/* うさぎの上に乗るアクセサリ */
.isyouLayer{ position:absolute; inset:0; pointer-events:none; z-index:50; }
.isyouItem{
  position:absolute;
  left:50%;
  transform-origin: 50% 50%;
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
}

/* ポンッ（JSで変数渡し） */
.isyouItem.isyouPop{
  animation: isyouPop 240ms cubic-bezier(.2,.95,.25,1);
}
@keyframes isyouPop{
  0%   { transform: translate(var(--tx), var(--ty)) scale(var(--sc0)) scaleX(var(--fx)); }
  70%  { transform: translate(var(--tx), var(--ty)) scale(var(--sc1)) scaleX(var(--fx)); }
  100% { transform: translate(var(--tx), var(--ty)) scale(var(--sc2)) scaleX(var(--fx)); }
}

/* Modal */
.isyouBackdrop{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.45);
  display:grid;
  place-items:center;
  z-index:2147483600;
}
.isyouModal{
  width:min(92vw,560px);
  max-height:86vh;
  background:#fff;
  border-radius:18px;
  padding:14px;
  box-shadow:0 20px 60px rgba(0,0,0,.30);
  overflow:auto;
  pointer-events:auto;
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
.isyouBtn{
  border:none; padding:7px 10px; border-radius:12px; cursor:pointer;
  background:#fff; box-shadow:0 4px 12px rgba(0,0,0,.12);
  font-weight:800;
}
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
       * Coin helpers
       * ========================= */
      function getCoins() {
        if (typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
        if (typeof WB.coins === "number") return WB.coins;
        return 0;
      }
      function spendCoins(amount) {
        amount = Math.max(0, Math.floor(Number(amount) || 0));
        if (amount <= 0) return true;
        if (typeof WB.spendCoin === "function") return !!WB.spendCoin(amount);
        if (typeof WB.coins === "number") {
          if (WB.coins < amount) return false;
          WB.coins -= amount;
          WB.updateHud?.();
          WB.saveCoins?.();
          return true;
        }
        return false;
      }

      /* =========================
       * HUD Button
       * ========================= */
      let btn = document.getElementById("isyouBtn");
      if (!btn) {
        btn = document.createElement("button");
        btn.textContent = "お洒落";
        btn.id = "isyouBtn";
        hud.appendChild(btn);
      }

      /* =========================
       * Modal
       * ========================= */
      let backdrop = null;
      let tab = "shop"; // "shop" | "equip"
      let equipMode = false;

      const selectedItems = new Set(); // ここに選んだアイテムが入る
      let selectedBornAt = null;       // 赤枠の対象

      function getBunnyList() {
        return Array.isArray(WB.bunnies)
          ? WB.bunnies
          : (typeof WB.getBunnies === "function" ? WB.getBunnies() : []);
      }

      function clearSelectedTargetVisual() {
        (getBunnyList() || []).forEach((b) => b?.wrap?.classList?.remove("isyouSelectedTarget"));
      }

      function setSelectedTarget(bunnyOrNull) {
        clearSelectedTargetVisual();
        if (!bunnyOrNull) {
          selectedBornAt = null;
          return;
        }
        selectedBornAt = bunnyOrNull.bornAt;
        bunnyOrNull.wrap?.classList?.add("isyouSelectedTarget");
      }

      function getSelectedBunny() {
        if (selectedBornAt == null) return null;
        return (getBunnyList() || []).find((b) => b && b.bornAt === selectedBornAt) || null;
      }

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

        const tabs = document.createElement("div");
        tabs.className = "isyouTabs";

        const tabShop = document.createElement("button");
        tabShop.className = "isyouTab";
        tabShop.textContent = "ショップ";

        const tabEquip = document.createElement("button");
        tabEquip.className = "isyouTab";
        tabEquip.textContent = "装着";

        tabs.appendChild(tabShop);
        tabs.appendChild(tabEquip);

        const body = document.createElement("div");

        function render() {
          tabShop.classList.toggle("on", tab === "shop");
          tabEquip.classList.toggle("on", tab === "equip");
          body.innerHTML = "";

          const coinLine = document.createElement("div");
          coinLine.className = "isyouSmall";
          coinLine.textContent = `所持コイン：${getCoins()} 🪙`;
          body.appendChild(coinLine);

          if (tab === "shop") {
            const grid = document.createElement("div");
            grid.className = "isyouGrid";

            Object.entries(ITEMS).forEach(([key, it]) => {
              const card = document.createElement("div");
              card.className = "isyouCard";

              const top = document.createElement("div");
              top.className = "isyouCardHead";

              const img = document.createElement("img");
              img.className = "isyouThumb";
              img.src = it.img;
              img.onerror = () => {
                const c = ITEM_IMAGES[key] || [];
                if (c[1]) img.src = c[1];
                img.onerror = null;
              };

              const name = document.createElement("div");
              name.innerHTML = `<div class="isyouName">${it.label}</div><div class="isyouSmall">所持：${owned[key] || 0}</div>`;

              top.appendChild(img);
              top.appendChild(name);

              const row = document.createElement("div");
              row.className = "isyouRow";

              const buy = document.createElement("button");
              buy.className = "isyouBtn primary";
              buy.textContent = `購入（${it.price}🪙）`;
              buy.addEventListener("click", () => {
                const ok = spendCoins(it.price);
                if (!ok) {
                  buy.textContent = "コイン不足";
                  setTimeout(() => (buy.textContent = `購入（${it.price}🪙）`), 700);
                  return;
                }
                owned[key] = (owned[key] || 0) + 1;
                saveAll();
                WB.updateHud?.();
                render();
              });

              row.appendChild(buy);
              card.appendChild(top);
              card.appendChild(row);
              grid.appendChild(card);
            });

            body.appendChild(grid);
          }

          if (tab === "equip") {
            const rowTop = document.createElement("div");
            rowTop.className = "isyouRow";

            const toggle = document.createElement("button");
            toggle.className = "isyouBtn primary";
            toggle.textContent = equipMode ? "装着モード：ON（赤枠の子に装着）" : "装着モード：OFF";
            toggle.addEventListener("click", () => {
              equipMode = !equipMode;
              document.body.classList.toggle("isyouEquipMode", equipMode);
              if (!equipMode) setSelectedTarget(null);
              render();
            });

            const hint = document.createElement("div");
            hint.className = "isyouSmall";
            hint.textContent = "①アイテム選択 → ②うさぎをクリックで赤枠 → ③同じ子を再クリックで装着/解除";

            rowTop.appendChild(toggle);
            rowTop.appendChild(hint);
            body.appendChild(rowTop);

            const sel = getSelectedBunny();
            const targetLine = document.createElement("div");
            targetLine.className = "isyouSmall";
            targetLine.style.marginTop = "6px";
            targetLine.textContent = sel
              ? `装着対象：${sel.kind || "bunny"}（ID:${sel.bornAt}）`
              : "装着対象：未選択（うさぎをクリックして赤枠で選択）";
            body.appendChild(targetLine);

            const grid = document.createElement("div");
            grid.className = "isyouGrid";

            Object.entries(ITEMS).forEach(([key, it]) => {
              const count = owned[key] || 0;

              const card = document.createElement("div");
              card.className = "isyouCard";

              const top = document.createElement("div");
              top.className = "isyouCardHead";

              const img = document.createElement("img");
              img.className = "isyouThumb";
              img.src = it.img;
              img.onerror = () => {
                const c = ITEM_IMAGES[key] || [];
                if (c[1]) img.src = c[1];
                img.onerror = null;
              };

              const name = document.createElement("div");
              name.innerHTML = `<div class="isyouName">${it.label}</div><div class="isyouSmall">所持：${count}</div>`;

              top.appendChild(img);
              top.appendChild(name);

              const row = document.createElement("div");
              row.className = "isyouRow";

              const pick = document.createElement("button");
              pick.className = "isyouBtn";
              const on = selectedItems.has(key);
              pick.textContent = on ? "選択中" : "選択";
              pick.style.background = on ? "#ffe6f2" : "#fff";
              pick.disabled = count <= 0;
              pick.addEventListener("click", () => {
                if (count <= 0) return;
                if (selectedItems.has(key)) selectedItems.delete(key);
                else selectedItems.add(key);
                render();
              });

              row.appendChild(pick);
              card.appendChild(top);
              card.appendChild(row);
              grid.appendChild(card);
            });

            body.appendChild(grid);
          }
        }

        tabShop.addEventListener("click", () => { tab = "shop"; render(); });
        tabEquip.addEventListener("click", () => { tab = "equip"; render(); });

        modal.appendChild(head);
        modal.appendChild(tabs);
        modal.appendChild(body);

        backdrop.appendChild(modal);
        backdrop.addEventListener("click", closeModal);

        document.body.appendChild(backdrop);
        render();
      }

      btn.addEventListener("click", () => {
        WB.unlockAudioOnce?.();
        openModal();
      });

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

      function setImgWithFallback(imgEl, itemKey) {
        const candidates = ITEM_IMAGES[itemKey] || [ITEMS[itemKey]?.img].filter(Boolean);
        let i = 0;
        imgEl.src = candidates[i];
        imgEl.onerror = () => {
          i++;
          if (i < candidates.length) imgEl.src = candidates[i];
          else {
            console.warn("[isyou] image load failed:", itemKey, candidates);
            imgEl.onerror = null;
          }
        };
      }

      function applyTransform(imgEl, bunny, it) {
        const flip = !!bunny?.wrap?.classList?.contains("flip");
        const fx = flip ? -1 : 1;

        const ox = (Number(it.offsetX) || 0) * (flip ? -1 : 1);
        const oy = (Number(it.offsetY) || 0);
        const sc = (Number(it.scale) || 1);

        imgEl.style.top = `${(Number(it.anchorY) || 0) * 100}%`;

        const tx = `calc(-50% + ${ox}px)`;
        const ty = `${oy}px`;

        imgEl.style.setProperty("--tx", tx);
        imgEl.style.setProperty("--ty", ty);
        imgEl.style.setProperty("--fx", String(fx));
        imgEl.style.setProperty("--sc2", String(sc));
        imgEl.style.setProperty("--sc0", String(Math.max(0.01, sc * 0.70)));
        imgEl.style.setProperty("--sc1", String(sc * 1.12));

        imgEl.style.transform = `translate(${tx}, ${ty}) scale(${sc}) scaleX(${fx})`;
        imgEl.style.zIndex = String(it.z || 10);
      }

      function drawAllForBunny(bunny) {
        if (!bunny?.wrap) return;

        if (bunny.isBaby) {
          const layer = bunny.wrap.querySelector(".isyouLayer");
          if (layer) layer.innerHTML = "";
          return;
        }

        const key = String(bunny.bornAt);
        const eq = equipped[key] || {};
        const layer = ensureLayer(bunny);
        if (!layer) return;

        const keep = new Set(Object.keys(eq).filter(k => eq[k]));
        Array.from(layer.querySelectorAll(".isyouItem")).forEach((el) => {
          const k = el.dataset.itemKey;
          if (!keep.has(k)) el.remove();
        });

        for (const itemKey of keep) {
          const it = ITEMS[itemKey];
          if (!it) continue;

          let img = layer.querySelector(`.isyouItem[data-item-key="${itemKey}"]`);
          const newlyCreated = !img;

          if (!img) {
            img = document.createElement("img");
            img.className = "isyouItem";
            img.dataset.itemKey = itemKey;
            img.draggable = false;
            setImgWithFallback(img, itemKey);
            layer.appendChild(img);
          }

          applyTransform(img, bunny, it);

          if (newlyCreated) {
            img.classList.add("isyouPop");
            setTimeout(() => img?.classList?.remove("isyouPop"), 260);
          }
        }
      }

      function redrawAll() {
        const list = getBunnyList();
        (list || []).forEach(drawAllForBunny);

        if (selectedBornAt != null) {
          const still = (list || []).some(b => b && b.bornAt === selectedBornAt);
          if (!still) setSelectedTarget(null);
        }
      }

      function toggleEquip(bunny, itemKey) {
        if (!bunny || bunny.isBaby) return;
        if ((owned[itemKey] || 0) <= 0) return;

        const key = String(bunny.bornAt);
        equipped[key] = equipped[key] || {};
        equipped[key][itemKey] = !equipped[key][itemKey];

        saveAll();
        drawAllForBunny(bunny);

        try {
          bunny.wrap.classList.add("isyouJustEquipped");
          setTimeout(() => bunny.wrap?.classList?.remove("isyouJustEquipped"), 520);
        } catch {}
      }

      /* =========================
       * Click: 赤枠選択→同じ子再クリックで装着
       * ========================= */
      function getBunnyFromWrap(wrap) {
        const list = getBunnyList();
        return (list || []).find(b => b && b.wrap === wrap) || null;
      }

      document.addEventListener("pointerdown", (e) => {
        if (!equipMode) return;

        // モーダル内は無視（アイテム選択できる）
        if (e.target?.closest?.(".isyouModal")) return;

        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;

        const bunny = getBunnyFromWrap(wrap);
        if (!bunny || bunny.isBaby) return;

        // 未選択 → 選択して赤枠
        if (selectedBornAt == null) {
          setSelectedTarget(bunny);
          return;
        }

        // 同じ赤枠の子 → 選択アイテムを装着/解除
        if (bunny.bornAt === selectedBornAt) {
          if (selectedItems.size === 0) return;
          selectedItems.forEach((k) => toggleEquip(bunny, k));
          return;
        }

        // 別の子 → 赤枠を移動（装着しない）
        setSelectedTarget(bunny);
      }, { capture: true });

      /* =========================
       * Hooks
       * ========================= */
      WB.on?.("bunnyCountChanged", redrawAll);
      WB.on?.("resize", redrawAll);

      redrawAll();
      console.log("[isyou] ready (locked target equip)");
    })
    .catch((err) => console.warn("[isyou] init failed:", err?.message || err));
})();
