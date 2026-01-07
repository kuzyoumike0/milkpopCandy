// isyou.js — お洒落（ショップ＋装着＋flip補正＋赤枠選択）完全版（FIX：flipでも帽子がズレない）
// ✅ #hud待機して「お洒落ボタン」が必ず出る
// ✅ モーダル内クリックは装着判定しない（選択ボタンが押せる）
// ✅ 装着モード中は backdrop がクリックを通す（うさぎをクリックできる）
// ✅ 赤枠は見えるように選択中だけ z-index を上げる
// ✅ FIX：親(bunnyWrap.flip)が反転してるのでアクセ側で scaleX しない（二重反転回避）
// ✅ slot（部類）導入：hat に partyhat/crown/ribbon を入れて同一位置
// ✅ FIX：アンカー座標を getBoundingClientRect ではなく offset 系（レイアウト座標）で取る
//     → flip（transform）しても帽子がズレない
// ✅ NEW：帽子を「うさぎ画像と同じサイズ・同じ位置」に完全一致で重ねる（fitToBunny）

(() => {
  "use strict";

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitFor(getter, timeoutMs = WAIT_MS) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        try {
          const v = getter();
          if (v) { clearInterval(t); resolve(v); return; }
        } catch {}
        if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          reject(new Error("waitFor timeout"));
        }
      }, TICK_MS);
    });
  }

  function waitForWB() {
    return waitFor(() => (window.WB && typeof window.WB.on === "function" ? window.WB : null));
  }
  function waitForHUD() {
    return waitFor(() => document.getElementById("hud"));
  }

  Promise.all([waitForWB(), waitForHUD()])
    .then(([WB, hud]) => {
      if (window.__ISYOU_INITED__) return;
      window.__ISYOU_INITED__ = true;

      /* =========================
       * Config
       * ========================= */
      const LS = {
        owned: "wb_isyou_owned_v2",
        equipped: "wb_isyou_equipped_v2",
        title: (WB.LS && WB.LS.title) ? WB.LS.title : "wb_title_v1",
      };

      // slot（今回は hat を「うさぎ画像と完全一致で重ねる」）
      const SLOTS = {
  hat: {
    // ※fitToBunnyの時は anchor は使わない（互換のため残してOK）
    anchorX: 0.59,
    anchorY: 0.18,
    offsetX: 0,
    offsetY: 0,
    z: 9999,
  },

  // ✅ 追加：顔（アイマスク用）
  face: {
    anchorX: 0.55,
    anchorY: 0.34,
    offsetX: 0,
    offsetY: 0,
    z: 9998,
  },

  // ✅ 追加：手元（アヒル用：抱えてる位置）
  hand: {
    anchorX: 0.62,
    anchorY: 0.66,
    offsetX: 0,
    offsetY: 0,
    z: 9997,
  },
};


      const ITEMS = {
        partyhat: {
          label: "パーティーハット",
          img: "/assets/isyou/partyhat.png",
          price: 500,
          slot: "hat",
          // ✅ うさぎ画像と同サイズ・同位置
          fitToBunny: true,
          offsetX: 0,
          offsetY: 0,
          // fitToBunny時は scale は使わない（残しても無視される）
          scale: 1,
          z: 9999,
        },
        crown: {
          label: "王冠",
          img: "/assets/isyou/crown.png",
          price: 3500,
          slot: "hat",
          fitToBunny: true,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          z: 9999,
        },
        ribbon: {
          label: "リボン",
          img: "/assets/isyou/ribbon.png",
          price: 1200,
          slot: "hat",
          fitToBunny: true,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          z: 9999,
        },
        aimasuku: {
  label: "アイマスク",
  img: "/assets/isyou/aimasuku.png",
          price: 1200,
          slot: "hat",
          fitToBunny: true,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          z: 9999,
        },

  // 反転時も顔向きはそのままにしたいなら true（好み）
  keepUpright: true,
},

ahiru: {
  label: "ぷかアヒル",
  img: "/assets/isyou/ahiru.png",
  price: 600,
  slot: "hat",

  fitToBunny: false,
  scale: 0.60,     // ←大きさ
  offsetX: 0,
  offsetY: 0,
  z: 9997,

  // 反転に合わせて左右も反転してほしいなら keepUpright は false のまま（指定しない）
  keepUpright: false,
},

      };

      /* =========================
       * CSS
       * ========================= */
      (function injectCSS() {
        if (document.getElementById("isyouStyleFinalV9")) return;
        const s = document.createElement("style");
        s.id = "isyouStyleFinalV9";
        s.textContent = `
#hud{ pointer-events:auto; }
#isyouBtn{
  pointer-events:auto;
  z-index:2147483647;
  font-weight:900;
  border:none;
  border-radius:12px;
  padding:8px 12px;
  cursor:pointer;
  background:#ffe6f2;
  box-shadow:0 6px 18px rgba(0,0,0,.18);
  margin-left:8px;
}
#isyouBtn:hover{ filter:brightness(1.03); }

body.isyouEquipMode .bunnyWrap:hover{
  outline:4px solid rgba(255,64,64,.60);
  outline-offset:3px;
  border-radius:18px;
}
.bunnyWrap.isyouSelectedTarget{
  outline:4px solid rgba(255,64,64,.92);
  outline-offset:3px;
  border-radius:18px;
  box-shadow:0 0 0 2px rgba(255,255,255,.65) inset;
  position:relative;
  z-index:2147483590 !important;
}

/* partyhat：ポンッ */
.bunnyWrap.isyouPopHat .isyouItem[data-item-key="partyhat"]{
  animation:isyouPop 220ms ease-out;
}
@keyframes isyouPop{
  0%{ transform: var(--isyouT) scale(0.1); }
  70%{ transform: var(--isyouT) scale(1.15); }
  100%{ transform: var(--isyouT) scale(1.0); }
}

/* レイヤ */
.isyouLayer{ position:absolute; inset:0; pointer-events:none; z-index:50; }
.isyouItem{
  position:absolute;
  left:0; top:0;
  transform-origin:50% 50%;
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
}

/* モーダル */
.isyouBackdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.45);
  display:grid; place-items:center;
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
body.isyouEquipMode .isyouBackdrop{ pointer-events:none; background:rgba(0,0,0,.25); }
body.isyouEquipMode .isyouModal{ pointer-events:auto; }

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
       * Coins
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
        btn.id = "isyouBtn";
        btn.textContent = "お洒落";
        const shopBtn = document.getElementById("shopBtn");
        if (shopBtn && shopBtn.parentElement === hud) hud.insertBefore(btn, shopBtn);
        else hud.appendChild(btn);
      }

      /* =========================
       * Modal
       * ========================= */
      let backdrop = null;
      let tab = "shop";
      let equipMode = false;

      const selectedItems = new Set();
      let selectedBornAt = null;

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
            toggle.textContent = equipMode ? "装着モード：ON" : "装着モード：OFF";
            toggle.addEventListener("click", () => {
              equipMode = !equipMode;
              document.body.classList.toggle("isyouEquipMode", equipMode);
              if (!equipMode) setSelectedTarget(null);
              render();
            });

            const hint = document.createElement("div");
            hint.className = "isyouSmall";
            hint.textContent = "①アイテム選択 ②うさぎをクリックで赤枠 ③同じうさぎを再クリックで装着";

            rowTop.appendChild(toggle);
            rowTop.appendChild(hint);
            body.appendChild(rowTop);

            const sel = getSelectedBunny();
            const targetLine = document.createElement("div");
            targetLine.className = "isyouSmall";
            targetLine.style.marginTop = "6px";
            targetLine.textContent = sel
              ? `装着対象：${sel.kind || "bunny"}（ID: ${sel.bornAt}）`
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
       * Accessory draw
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

      function getBunnyImgEl(wrap) {
        return (
          wrap.querySelector("img.bunnyImg") ||
          wrap.querySelector("img[data-bunny]") ||
          wrap.querySelector("img[src*='bunny']") ||
          wrap.querySelector("img")
        );
      }

      // ✅ 重要：offset系で「wrap内ローカル座標」を取る（transformの影響を受けない）
      function getLocalPosWithin(el, root) {
        let x = 0, y = 0;
        let cur = el;
        while (cur && cur !== root) {
          x += cur.offsetLeft || 0;
          y += cur.offsetTop || 0;
          cur = cur.offsetParent;
        }
        return { x, y, ok: (cur === root) };
      }

      // ✅ hatアンカー（比率）を「ローカル座標」で返す（fitToBunny時は使わない）
      function getAnchorPoint(bunny, slotKey) {
        const wrap = bunny?.wrap;
        if (!wrap) return { x: 0, y: 0 };

        const img = getBunnyImgEl(wrap);
        if (!img) return { x: wrap.clientWidth / 2, y: 0 };

        const slot = slotKey && SLOTS[slotKey] ? SLOTS[slotKey] : null;
        const ax = slot && typeof slot.anchorX === "number" ? slot.anchorX : 0.5;
        const ay = slot && typeof slot.anchorY === "number" ? slot.anchorY : 0.0;

        const p = getLocalPosWithin(img, wrap);
        const w = img.offsetWidth || img.clientWidth || 0;
        const h = img.offsetHeight || img.clientHeight || 0;

        return { x: p.x + w * ax, y: p.y + h * ay };
      }

      // 親がflipで反転してるので、アクセ側で scaleX しない（keepUprightだけ相殺）
      function applyTransform(imgEl, bunny, it) {
        const keepUpright = !!it.keepUpright;

        const slotKey = it.slot ? String(it.slot) : "";
        const slot = slotKey && SLOTS[slotKey] ? SLOTS[slotKey] : null;

        const sox = slot ? (Number(slot.offsetX) || 0) : 0;
        const soy = slot ? (Number(slot.offsetY) || 0) : 0;
        const sz  = slot ? (Number(slot.z) || 0) : 0;

        const ox = (Number(it.offsetX) || 0) + sox;
        const oy = (Number(it.offsetY) || 0) + soy;

        // ✅ NEW：うさぎ画像と同サイズ・同位置に重ねる
        // ✅ NEW：うさぎ画像と同サイズ・同位置に重ねる（反転でもズレない版）
if (it.fitToBunny) {
  const wrap = bunny?.wrap;
  const bimg = wrap ? getBunnyImgEl(wrap) : null;
  if (!wrap || !bimg) return;

  const cs = getComputedStyle(bimg);

  // bunnyImg の位置決めを完全コピー（transformも含む）
  imgEl.style.left = cs.left;
  imgEl.style.top = cs.top;
  imgEl.style.width = cs.width;
  imgEl.style.height = cs.height;

  imgEl.style.transformOrigin = cs.transformOrigin || "50% 50%";

  // 元の transform をベースに、微調整 ox/oy を末尾に足す
  const base = (cs.transform && cs.transform !== "none") ? cs.transform : "";
  const extraMove = (ox || oy) ? ` translate(${ox}px, ${oy}px)` : "";
  const extraFlip = keepUpright ? " scaleX(-1)" : "";

  const t = `${base}${extraMove}${extraFlip}`.trim() || "none";

  imgEl.style.setProperty("--isyouT", t);
  imgEl.style.transform = t;

  const finalZ = (sz || 0) || (Number(it.z) || 10);
  imgEl.style.zIndex = String(finalZ);
  return;
}


        // 旧：アンカー比率で置く（互換）
        const sc = Number(it.scale) || 1;
        const a = getAnchorPoint(bunny, slotKey);
        imgEl.style.left = `${a.x}px`;
        imgEl.style.top  = `${a.y}px`;

        const extraFlip = keepUpright ? " scaleX(-1)" : "";
        const baseT =
          `translate(-50%, -50%) translate(${ox}px, ${oy}px) ` +
          `scale(${sc})` + extraFlip;

        imgEl.style.setProperty("--isyouT", baseT);
        imgEl.style.transform = baseT;

        const finalZ = (sz || 0) || (Number(it.z) || 10);
        imgEl.style.zIndex = String(finalZ);
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

        const key = String(bunny.bornAt);
        equipped[key] = equipped[key] || {};
        equipped[key][itemKey] = !equipped[key][itemKey];
        saveAll();
        drawAllForBunny(bunny);

        if (itemKey === "partyhat") {
          bunny.wrap.classList.add("isyouPopHat");
          setTimeout(() => bunny.wrap?.classList?.remove("isyouPopHat"), 260);
        }
      }

      /* =========================
       * Equip mode click
       * ========================= */
      document.addEventListener("pointerdown", (e) => {
        if (!equipMode) return;
        if (e.target?.closest?.(".isyouModal")) return;

        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;

        const bunny = (getBunnyList() || []).find((b) => b && b.wrap === wrap) || null;
        if (!bunny || bunny.isBaby) return;

        if (selectedBornAt == null) {
          setSelectedTarget(bunny);
          return;
        }

        if (bunny.bornAt === selectedBornAt) {
          if (selectedItems.size === 0) return;
          selectedItems.forEach((k) => toggleEquip(bunny, k));
          return;
        }

        setSelectedTarget(bunny);
      }, { capture: true });

      /* =========================
       * Hooks + flip watcher
       * ========================= */
      WB.on?.("bunnyCountChanged", redrawAll);
      WB.on?.("resize", redrawAll);

      let rafId = null;
      function startFlipWatcher() {
        if (rafId) return;
        let lastSig = "";
        const loop = () => {
          const list = getBunnyList();
          const sig = (list || []).map(b => (b?.wrap?.classList?.contains("flip") ? "1" : "0")).join("");
          if (sig !== lastSig) { lastSig = sig; redrawAll(); }
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      }
      startFlipWatcher();

      redrawAll();
      console.log("[isyou] ready (hat fitToBunny)");
    })
    .catch((err) => {
      console.warn("[isyou] init failed:", err?.message || err);
    });
})();
