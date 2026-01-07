// isyou.js — お洒落ボタンが出ない対策・完全版（WB待機 + HUD待機）
// - #hud が出るまで待ってからボタンを追加
// - 既にあれば再利用
// - 目立つように最低限のCSSも注入
// - partyhatは頭上に乗る設定（anchorY/offsetY調整）

(() => {
  "use strict";

  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitFor(fn, timeoutMs = WAIT_MS) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        try {
          const v = fn();
          if (v) {
            clearInterval(t);
            resolve(v);
            return;
          }
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
      if (window.__ISYOU_INITED__) {
        console.log("[isyou] already inited");
        return;
      }
      window.__ISYOU_INITED__ = true;
      console.log("[isyou] init");

      // CSS（ボタンが確実に見える）
      if (!document.getElementById("isyouBtnCssV1")) {
        const s = document.createElement("style");
        s.id = "isyouBtnCssV1";
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
        `;
        document.head.appendChild(s);
      }

      // ボタン作成（左のボタン群に混ぜる）
      let btn = document.getElementById("isyouBtn");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "isyouBtn";
        btn.textContent = "お洒落";

        // shopBtn があるならその左に入れる（ボタン群に揃える）
        const shopBtn = document.getElementById("shopBtn");
        if (shopBtn && shopBtn.parentElement === hud) {
          hud.insertBefore(btn, shopBtn);
        } else {
          hud.appendChild(btn);
        }
      }

      // ここまでで「お洒落ボタンが出ない」は解消するはず
      // ↓以降：最低限の装着機能（partyhatのみ）も付けておく

      const LS = {
        owned: "wb_isyou_owned_v2",
        equipped: "wb_isyou_equipped_v2",
      };

      const ITEMS = {
        partyhat: {
          label: "パーティーハット",
          img: "/assets/isyou/partyhat.png",
          price: 500,

          // ★頭上（耳の間）寄せ
          anchorY: -0.02,
          offsetX: 2,
          offsetY: -26,
          scale: 0.42,
          z: 25,
        },
      };

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

      function getBunnyList() {
        return Array.isArray(WB.bunnies) ? WB.bunnies : (typeof WB.getBunnies === "function" ? WB.getBunnies() : []);
      }

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

      // レイヤCSS
      if (!document.getElementById("isyouLayerCssV1")) {
        const s = document.createElement("style");
        s.id = "isyouLayerCssV1";
        s.textContent = `
.isyouLayer{ position:absolute; inset:0; pointer-events:none; z-index:50; }
.isyouItem{
  position:absolute;
  left:50%;
  transform-origin:50% 50%;
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
}
.bunnyWrap.isyouSelectedTarget{
  outline:4px solid rgba(255,64,64,.92);
  outline-offset:3px;
  border-radius:18px;
  position:relative;
  z-index:2147483590;
}
        `;
        document.head.appendChild(s);
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
        const k = String(bunny.bornAt);
        const eq = equipped[k] || {};
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

      // 赤枠選択→その子にだけ付ける（partyhatのみ）
      let equipMode = false;
      let selectedBornAt = null;

      function clearSelect() {
        (getBunnyList() || []).forEach((b) => b?.wrap?.classList?.remove("isyouSelectedTarget"));
        selectedBornAt = null;
      }
      function selectBunny(bunny) {
        clearSelect();
        if (!bunny) return;
        selectedBornAt = bunny.bornAt;
        bunny.wrap?.classList?.add("isyouSelectedTarget");
      }

      function toggleHat(bunny) {
        if (!bunny || bunny.isBaby) return;
        if ((owned.partyhat || 0) <= 0) {
          // 未所持なら1個だけ配る（動作確認用。不要なら消してOK）
          owned.partyhat = 1;
        }
        const k = String(bunny.bornAt);
        equipped[k] = equipped[k] || {};
        equipped[k].partyhat = !equipped[k].partyhat;
        saveAll();
        drawAllForBunny(bunny);
      }

      // クリック判定
      document.addEventListener("pointerdown", (e) => {
        if (!equipMode) return;
        const wrap = e.target?.closest?.(".bunnyWrap");
        if (!wrap) return;
        const bunny = (getBunnyList() || []).find((b) => b && b.wrap === wrap) || null;
        if (!bunny) return;

        if (selectedBornAt == null) {
          selectBunny(bunny);
          return;
        }
        if (bunny.bornAt === selectedBornAt) {
          toggleHat(bunny);
          return;
        }
        selectBunny(bunny);
      }, { capture: true });

      // ボタンでモード切替（簡易）
      btn.addEventListener("click", () => {
        WB.unlockAudioOnce?.();
        equipMode = !equipMode;
        if (!equipMode) clearSelect();
        btn.textContent = equipMode ? "お洒落(装着ON)" : "お洒落";
      });

      WB.on?.("bunnyCountChanged", redrawAll);
      WB.on?.("resize", redrawAll);

      redrawAll();
      console.log("[isyou] ready + button ok");
    })
    .catch((err) => {
      console.warn("[isyou] init failed:", err?.message || err);
    });
})();
