// isyou.js
// - 「お洒落」ボタンをHUDへ自動追加
// - partyhat を購入（所持数）
// - 装着モード中にうさぎクリックで、そのうさぎに帽子を装着
// - 位置は「頭に重なる」ように画像上部へ

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  const LS = {
    owned: "wb_isyou_owned_v1",   // { partyhat: 0 }
    equipped: "wb_isyou_eq_v1",  // { bunnyIndex: { partyhat:true } } ※簡易
  };

  const ITEM = {
    key: "partyhat",
    label: "パーティ帽",
    price: 5000,
    src: "./assets/isyou/partyhat.png",
  };

  let equipMode = false; // 装着先選択モード

  function loadJson(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v ?? def;
    } catch {
      return def;
    }
  }
  function saveJson(key, v) {
    localStorage.setItem(key, JSON.stringify(v));
  }

  const owned = loadJson(LS.owned, { partyhat: 0 });
  const equipped = loadJson(LS.equipped, {}); // { idx: { partyhat: true } }

  function toast(msg) {
    // 既存のtoast CSSがなくても見える
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 1600);
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleV1";
    s.textContent = `
/* お洒落パネル */
#isyouPanel{
  position:fixed; inset:0;
  display:none;
  z-index:2147483647;
}
#isyouPanel .bg{ position:absolute; inset:0; background:rgba(0,0,0,.35); }
#isyouPanel .card{
  position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(520px,92vw);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
}
#isyouPanel .head{
  display:flex; justify-content:space-between; align-items:center;
  padding:12px 14px;
  border-bottom:1px solid rgba(0,0,0,.08);
  font-weight:1000;
}
#isyouPanel .body{ padding:14px; }
#isyouPanel .row{ display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
#isyouPanel .btn{
  border:none; border-radius:12px;
  padding:10px 12px;
  font-weight:900;
  cursor:pointer;
  background:#fff;
  box-shadow:0 10px 22px rgba(0,0,0,.10);
}
#isyouPanel .btn.primary{ background:#ffd6e7; }
#isyouPanel .btn.active{
  outline:3px solid rgba(255, 80, 120, .35);
}

/* 帽子（うさぎwrapに重ねる） */
.bunnyWrap{ position:absolute; }
.bunnyWrap .isyouHat{
  position:absolute;
  left:50%;
  top:-10px;            /* ★頭に重なる位置 */
  width:42px;           /* ★帽子サイズ（必要なら調整） */
  height:auto;
  transform:translateX(-50%);
  pointer-events:none;
  z-index:5;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.18));
}

/* 装着モードONの視認性 */
#isyouBtn.on{
  outline:3px solid rgba(255,90,140,.45);
  box-shadow:0 12px 32px rgba(0,0,0,.14), 0 0 0 6px rgba(255,90,140,.12);
}
.bunnyWrap.isyouTarget{
  outline:3px solid rgba(255,90,140,.55);
  border-radius:16px;
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * HUD button inject
   * ========================= */
  function injectHudButton() {
    const hudButtons = document.getElementById("hudButtons");
    if (!hudButtons) return;

    if (document.getElementById("isyouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.type = "button";
    btn.textContent = "お洒落";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      WB.unlockAudioOnce?.();
      openPanel();
    });

    // rankBtnの右に置きたい場合は挿入位置調整
    hudButtons.appendChild(btn);
  }

  /* =========================
   * Panel
   * ========================= */
  let panelEl = null;

  function buildPanel() {
    injectStyles();
    if (panelEl && document.body.contains(panelEl)) return panelEl;

    panelEl = document.createElement("div");
    panelEl.id = "isyouPanel";
    panelEl.innerHTML = `
      <div class="bg"></div>
      <div class="card">
        <div class="head">
          <div>🎀 お洒落</div>
          <button class="btn close" type="button">閉じる</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(panelEl);

    panelEl.querySelector(".bg")?.addEventListener("click", closePanel);
    panelEl.querySelector(".close")?.addEventListener("click", closePanel);
    panelEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return panelEl;
  }

  function renderPanel() {
    const p = buildPanel();
    const body = p.querySelector(".body");
    if (!body) return;

    const have = Number(WB.coins || 0);
    const n = Number(owned[ITEM.key] || 0);

    body.innerHTML = `
      <div class="row">
        <div><b>${ITEM.label}</b></div>
        <div>所持：<b>${n}</b></div>
      </div>
      <div style="height:10px"></div>
      <div class="row">
        <div>価格：<b>${ITEM.price}</b>🪙</div>
        <button class="btn primary" type="button" data-buy="1">購入</button>
      </div>
      <div style="height:10px"></div>
      <div class="row">
        <button class="btn ${equipMode ? "active" : ""}" type="button" data-equipmode="1">
          ${equipMode ? "装着モード：ON（うさぎをクリック）" : "装着モード：OFF"}
        </button>
      </div>
      <div style="margin-top:10px;opacity:.8;font-weight:900;font-size:13px;">
        ※装着モード中は、付けたい「うさぎ」をクリックしてね
      </div>
    `;

    body.querySelector("[data-buy]")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      buyItem();
      renderPanel();
    });

    body.querySelector("[data-equipmode]")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      toggleEquipMode();
      renderPanel();
    });
  }

  function openPanel() {
    const p = buildPanel();
    renderPanel();
    p.style.display = "block";
  }
  function closePanel() {
    if (!panelEl) return;
    panelEl.style.display = "none";
  }

  /* =========================
   * Buy / Equip
   * ========================= */
  function buyItem() {
    const have = Number(WB.coins || 0);
    if (have < ITEM.price) {
      toast(`コイン不足（必要：${ITEM.price}🪙）`);
      return;
    }
    WB.coins = have - ITEM.price;
    WB.saveCoins?.();
    WB.updateHud?.();

    owned[ITEM.key] = Number(owned[ITEM.key] || 0) + 1;
    saveJson(LS.owned, owned);

    toast(`購入！ ${ITEM.label}（所持：${owned[ITEM.key]}）`);
  }

  function setEquipMode(on) {
    equipMode = !!on;
    const btn = document.getElementById("isyouBtn");
    if (btn) btn.classList.toggle("on", equipMode);
    toast(equipMode ? "🎀 装着モード：ON（うさぎをクリック）" : "🎀 装着モード：OFF");
  }

  function toggleEquipMode() {
    if (!owned[ITEM.key]) {
      toast("まず帽子を購入してね！");
      return;
    }
    setEquipMode(!equipMode);
  }

  function ensureHatOnBunny(bunny, idx) {
    if (!bunny?.wrap) return;

    let hat = bunny.wrap.querySelector(".isyouHat");
    if (!hat) {
      hat = document.createElement("img");
      hat.className = "isyouHat";
      hat.src = ITEM.src;
      hat.alt = ITEM.key;
      hat.draggable = false;
      bunny.wrap.appendChild(hat);
    } else {
      hat.src = ITEM.src;
    }

    equipped[String(idx)] = equipped[String(idx)] || {};
    equipped[String(idx)][ITEM.key] = true;
    saveJson(LS.equipped, equipped);
  }

  function applyEquippedAll() {
    // 既存保存分を反映（ロード時）
    (WB.bunnies || []).forEach((b, i) => {
      const eq = equipped[String(i)];
      if (eq?.[ITEM.key]) ensureHatOnBunny(b, i);
    });
  }

  function onPointerDownCapture(e) {
    if (!equipMode) return;

    // 左クリック/タップのみ
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    // 通常クリック（コイン発生）を止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const idx = (WB.bunnies || []).findIndex(b => b.wrap === wrap);
    if (idx < 0) return;

    if (!owned[ITEM.key] || owned[ITEM.key] <= 0) {
      toast("帽子が無いよ。購入してね！");
      return;
    }

    // 付与（消費）
    owned[ITEM.key] -= 1;
    saveJson(LS.owned, owned);

    ensureHatOnBunny(WB.bunnies[idx], idx);

    toast(`🎉 ${ITEM.label} を装着！`);
    // 1回装着したらOFFにしたいならここでOFFにする
    setEquipMode(false);
  }

  /* =========================
   * Boot
   * ========================= */
  function boot() {
    injectStyles();
    injectHudButton();
    applyEquippedAll();

    // 装着モード：うさぎクリックを横取り（キャプチャ）
    document.addEventListener("pointerdown", onPointerDownCapture, true);

    // うさぎ数が増えたら、保存分反映（indexずれが気になるなら後でID方式にする）
    WB.on?.("bunnyCountChanged", () => {
      setTimeout(() => applyEquippedAll(), 0);
    });

    // リセット時
    WB.on?.("resetRequested", () => {
      try { localStorage.removeItem(LS.owned); } catch {}
      try { localStorage.removeItem(LS.equipped); } catch {}
    });
  }

  window.addEventListener("load", boot);
})();
