// isyou.js — お洒落（ショップ＋複数装着＋flip補正＋称号連動＋赤枠）完全版
(() => {
  if (!window.WB) {
    console.warn("[isyou] WB not found");
    return;
  }
  const WB = window.WB;

  /* =========================
   * Config
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v2",          // { itemKey: number }
    equipped: "wb_isyou_equipped_v2",    // { bornAt: { itemKey:true } }
    // 称号のキー（syougou.js の実装差があっても吸収する）
    title: (WB.LS && WB.LS.title) ? WB.LS.title : "wb_title_v1",
  };

  // ここにアイテムを追加していく（複数装着OK）
  const ITEMS = {
    partyhat: {
      label: "パーティーハット",
      img: "./assets/partyhat.png",
      price: 500,
      // 位置（px）: Xは「中央からのずらし」。flip時は符号反転してズレ補正する
      offsetX: 0,
      offsetY: -18,
      scale: 1.15,
      z: 20,
    },

    // 例：王冠（称号連動用に用意。画像が無いなら消してOK）
    crown: {
      label: "王冠",
      img: "./assets/crown.png",
      price: 3500,
      offsetX: 0,
      offsetY: -28,
      scale: 1.20,
      z: 30,
    },

    // 例：リボン（複数装着の見本。画像が無いなら消してOK）
    ribbon: {
      label: "リボン",
      img: "./assets/ribbon.png",
      price: 1200,
      offsetX: 0,
      offsetY: 32,
      scale: 1.05,
      z: 10,
    },
  };

  // 「称号」と「自動装着」の紐づけ（必要に応じて増やせる）
  // title文字列は syougou.js の表示名に合わせてください
  const TITLE_LINKS = [
    { match: /黄金の王/, autoEquip: ["crown"] },
    { match: /黄金に選ばれし者/, autoEquip: ["crown"] },
  ];

  const hud = document.getElementById("hud");
  if (!hud) {
    console.warn("[isyou] #hud not found");
    return;
  }

  /* =========================
   * CSS inject (赤枠 + モーダル)
   * ========================= */
  (function injectCSS() {
    if (document.getElementById("isyouStyleV3")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleV3";
    s.textContent = `
/* ===== お洒落モード：赤枠（装着対象を分かりやすく） ===== */
body.isyouEquipMode .bunnyWrap{
  outline: none;
}
body.isyouEquipMode .bunnyWrap:hover{
  outline: 4px solid rgba(255,64,64,.88);
  outline-offset: 3px;
  border-radius: 18px;
}
.bunnyWrap.isyouJustEquipped{
  outline: 4px solid rgba(255,64,64,.88);
  outline-offset: 3px;
  border-radius: 18px;
  animation: isyouBlink 520ms ease-in-out;
}
@keyframes isyouBlink{
  0%{ filter: brightness(1.0); }
  50%{ filter: brightness(1.15); }
  100%{ filter: brightness(1.0); }
}

/* ===== アクセサリ表示レイヤ ===== */
.isyouLayer{
  position:absolute;
  inset:0;
  pointer-events:none;
}
.isyouItem{
  position:absolute;
  left:50%;
  top:0;
  transform-origin: 50% 50%;
  pointer-events:none;
  user-select:none;
  -webkit-user-drag:none;
}

/* ===== お洒落モーダル ===== */
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
}
.isyouHeader{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
}
.isyouTitle{
  font-weight:900;
}
.isyouClose{
  border:none;
  background:#eee;
  border-radius:12px;
  padding:6px 10px;
  cursor:pointer;
}
.isyouTabs{
  display:flex;
  gap:8px;
  margin-top:10px;
}
.isyouTab{
  border:none;
  padding:8px 10px;
  border-radius:12px;
  cursor:pointer;
  background:#f3f3f3;
  font-weight:800;
}
.isyouTab.on{
  background:#ffe6f2;
}
.isyouGrid{
  margin-top:12px;
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(170px,1fr));
  gap:12px;
}
.isyouCard{
  background:#fff;
  border-radius:14px;
  padding:10px;
  box-shadow:0 6px 18px rgba(0,0,0,.12);
}
.isyouCardHead{
  display:flex;
  align-items:center;
  gap:10px;
}
.isyouThumb{
  width:54px;
  height:54px;
  object-fit:contain;
}
.isyouName{
  font-weight:900;
}
.isyouMeta{
  margin-top:6px;
  font-size:12px;
  opacity:.85;
  line-height:1.35;
}
.isyouRow{
  margin-top:10px;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  align-items:center;
}
.isyouBtn{
  border:none;
  padding:7px 10px;
  border-radius:12px;
  cursor:pointer;
  background:#fff;
  box-shadow:0 4px 12px rgba(0,0,0,.12);
  font-weight:800;
}
.isyouBtn.primary{
  background:#ffe6f2;
}
.isyouBtn.bad{
  background:#ffecec;
}
.isyouSmall{
  font-size:12px;
  opacity:.85;
}
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
  const owned = loadJSON(LS.owned, {});         // { itemKey: number }
  const equipped = loadJSON(LS.equipped, {});   // { bornAt: { itemKey:true } }

  function saveAll() {
    localStorage.setItem(LS.owned, JSON.stringify(owned));
    localStorage.setItem(LS.equipped, JSON.stringify(equipped));
  }

  /* =========================
   * Coin helpers (互換)
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
   * UI Button in HUD
   * ========================= */
  const btn = document.createElement("button");
  btn.textContent = "お洒落";
  btn.id = "isyouBtn";
  hud.appendChild(btn);

  /* =========================
   * Modal
   * ========================= */
  let backdrop = null;
  let tab = "shop"; // "shop" | "equip"
  let equipMode = false;
  const selectedItems = new Set(); // 複数装着：選択中アイテム

  function closeModal() {
    equipMode = false;
    document.body.classList.remove("isyouEquipMode");
    selectedItems.clear();
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

          const meta = document.createElement("div");
          meta.className = "isyouMeta";
          meta.textContent = `価格：${it.price} 🪙`;

          const row = document.createElement("div");
          row.className = "isyouRow";

          const buy = document.createElement("button");
          buy.className = "isyouBtn primary";
          buy.textContent = "購入";
          buy.addEventListener("click", () => {
            const ok = spendCoins(it.price);
            if (!ok) {
              buy.textContent = "コイン不足";
              setTimeout(() => (buy.textContent = "購入"), 700);
              return;
            }
            owned[key] = (owned[key] || 0) + 1;
            saveAll();
            WB.updateHud?.();
            render();
          });

          row.appendChild(buy);

          card.appendChild(top);
          card.appendChild(meta);
          card.appendChild(row);
          grid.appendChild(card);
        });

        body.appendChild(grid);
      }

      if (tab === "equip") {
        // 装着モードトグル
        const rowTop = document.createElement("div");
        rowTop.className = "isyouRow";

        const toggle = document.createElement("button");
        toggle.className = "isyouBtn primary";
        toggle.textContent = equipMode ? "装着モード：ON（うさぎクリック）" : "装着モード：OFF";
        toggle.addEventListener("click", () => {
          equipMode = !equipMode;
          document.body.classList.toggle("isyouEquipMode", equipMode);
          render();
        });

        const hint = document.createElement("div");
        hint.className = "isyouSmall";
        hint.textContent = "※複数選んで同時装着できます / もう一度クリックで外します";

        rowTop.appendChild(toggle);
        rowTop.appendChild(hint);
        body.appendChild(rowTop);

        // 選択UI
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
   * Bunny accessory layer helpers
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

  function isFlip(bunny) {
    return !!bunny?.wrap?.classList?.contains("flip");
  }

  function applyTransform(imgEl, bunny, it) {
    // flip時：Xオフセットを反転 + scaleX(-1)で左右合わせ
    const flip = isFlip(bunny);
    const ox = (Number(it.offsetX) || 0) * (flip ? -1 : 1);
    const oy = (Number(it.offsetY) || 0);
    const sc = (Number(it.scale) || 1);
    const fx = flip ? -1 : 1;

    // translate(-50%, oy) は中央基準。ox は translateX で追加
    imgEl.style.transform = `translate(calc(-50% + ${ox}px), ${oy}px) scale(${sc}) scaleX(${fx})`;
    imgEl.style.zIndex = String(it.z || 10);
  }

  function drawAllForBunny(bunny) {
    if (!bunny?.wrap) return;

    // babyには装飾なし（要望：初期babyはすぐbunnyにするが、残っても装備不可）
    if (bunny.isBaby) {
      // layerだけ消す
      const layer = bunny.wrap.querySelector(".isyouLayer");
      if (layer) layer.innerHTML = "";
      return;
    }

    const key = String(bunny.bornAt);
    const eq = equipped[key] || {};

    const layer = ensureLayer(bunny);
    if (!layer) return;

    // まず既存を整理：装備してないものは消す
    const keep = new Set(Object.keys(eq).filter(k => eq[k]));
    Array.from(layer.querySelectorAll(".isyouItem")).forEach((el) => {
      const k = el.dataset.itemKey;
      if (!keep.has(k)) el.remove();
    });

    // 装備中を描画
    for (const itemKey of keep) {
      const it = ITEMS[itemKey];
      if (!it) continue;

      let img = layer.querySelector(`.isyouItem[data-item-key="${itemKey}"]`);
      if (!img) {
        img = document.createElement("img");
        img.className = "isyouItem";
        img.dataset.itemKey = itemKey;
        img.src = it.img;
        layer.appendChild(img);
      }
      applyTransform(img, bunny, it);
    }
  }

  function redrawAll() {
    const list = Array.isArray(WB.bunnies) ? WB.bunnies : [];
    list.forEach(drawAllForBunny);
  }

  /* =========================
   * Equip toggle on bunny click (複数同時装着)
   * ========================= */
  function toggleEquip(bunny, itemKey) {
    if (!bunny || bunny.isBaby) return;

    const it = ITEMS[itemKey];
    if (!it) return;

    const have = owned[itemKey] || 0;
    if (have <= 0) return;

    const key = String(bunny.bornAt);
    equipped[key] = equipped[key] || {};

    // 付け外しトグル
    equipped[key][itemKey] = !equipped[key][itemKey];

    saveAll();
    drawAllForBunny(bunny);

    // 赤枠のフィードバック
    try {
      bunny.wrap.classList.add("isyouJustEquipped");
      setTimeout(() => bunny.wrap?.classList?.remove("isyouJustEquipped"), 520);
    } catch {}
  }

  // クリックの取り方：bunnyWrapだけ拾う（ボタン類を邪魔しない）
  document.addEventListener("pointerdown", (e) => {
    if (!equipMode) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    // 旅立ちモードなど他のcapture処理がある場合に備え、ここでは止めない（押し負けるなら後でcapture化）
    const list = Array.isArray(WB.bunnies) ? WB.bunnies : [];
    const bunny = list.find(b => b.wrap === wrap);
    if (!bunny) return;

    // 選択が空なら何もしない
    if (selectedItems.size === 0) return;

    // 複数同時にトグル
    selectedItems.forEach((k) => toggleEquip(bunny, k));
  }, { passive: true });

  /* =========================
   * Title linkage (称号と連動)
   * - 称号変更イベントが無くても拾えるように localStorage を監視
   * ========================= */
  function getCurrentTitle() {
    try {
      const v = localStorage.getItem(LS.title);
      if (!v) return "";
      // syougou.jsの実装差：文字列/JSON両対応
      if (v.startsWith("{") || v.startsWith("[")) {
        const j = JSON.parse(v);
        if (typeof j === "string") return j;
        return String(j?.equipped || j?.current || j?.name || "");
      }
      return v;
    } catch {
      return "";
    }
  }

  let lastTitle = null;
  function applyTitleLinkage() {
    const title = getCurrentTitle();
    if (title === lastTitle) return;
    lastTitle = title;

    // 条件一致したら「持ってる前提で自動装着」ではなく
    // まず「未所持なら付与（解放）」→ 次に全うさぎに装着、など好きに調整可能。
    // ここは控えめに：所持している場合のみ自動装着。
    const auto = new Set();
    for (const rule of TITLE_LINKS) {
      if (rule.match.test(title)) {
        (rule.autoEquip || []).forEach(k => auto.add(k));
      }
    }
    if (auto.size === 0) return;

    const list = Array.isArray(WB.bunnies) ? WB.bunnies : [];
    for (const bunny of list) {
      if (!bunny || bunny.isBaby) continue;
      const key = String(bunny.bornAt);
      equipped[key] = equipped[key] || {};
      for (const itemKey of auto) {
        // 所持してるものだけ
        if ((owned[itemKey] || 0) > 0) equipped[key][itemKey] = true;
      }
      drawAllForBunny(bunny);
    }
    saveAll();
  }

  // 1秒ごとに称号を見る（軽い）
  setInterval(applyTitleLinkage, 1000);

  /* =========================
   * Hooks: bunnies増減 / 反転変化 / resize などに追従
   * ========================= */
  // bunnyCountChanged があれば描画
  WB.on?.("bunnyCountChanged", redrawAll);
  WB.on?.("resize", redrawAll);
  WB.on?.("hudUpdated", () => {
    // コイン表示等と同時に称号変化がある場合も拾える
    applyTitleLinkage();
  });

  // 反転は update の中で class が変わるので、軽く監視して再計算
  // （requestAnimationFrameで間引き）
  let rafId = null;
  function startFlipWatcher() {
    if (rafId) return;
    let lastSig = "";
    const loop = () => {
      const list = Array.isArray(WB.bunnies) ? WB.bunnies : [];
      const sig = list.map(b => (b?.wrap?.classList?.contains("flip") ? "1" : "0")).join("");
      if (sig !== lastSig) {
        lastSig = sig;
        redrawAll();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  startFlipWatcher();

  // 初回描画
  redrawAll();
  applyTitleLinkage();

  console.log("[isyou] ready");
})();
