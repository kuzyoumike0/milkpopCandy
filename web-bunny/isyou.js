// isyou.js
// - お洒落ボタンをHUDへ自動追加
// - partyhat を購入
// - 装着モード中、クリックした「うさぎ個体」に帽子を装着
// - 保存は bunnyIndex ではなく「個体ID = bornAt」
// - partyhat は大きめ＆下寄せ（耳の下・頭の真ん中）
// - 反転時ズレ対策：親flipの反転を帽子側で打ち消す（scaleX(-1)）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * Storage
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v4",     // { partyhat: number }
    equipped: "wb_isyou_eq_v4",     // { bornAt: { partyhat:true } }
  };

  const ITEM = {
    key: "partyhat",
    label: "パーティーハット",
    price: 5000,
    src: "./assets/isyou/partyhat.png",
  };

  // ★ここだけ調整すればOK
  const HAT_X = "45%";   // もう少し左寄せ
  const HAT_Y = "38px";  // 大幅に下へ（耳の下）
  const HAT_W = "100px"; // 大きめ
  const HAT_R = "-5deg";
  const HAT_S = "1.0";

  let equipMode = false;

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
  const equipped = loadJson(LS.equipped, {}); // { bornAt: { partyhat:true } }

  /* =========================
   * Toast
   * ========================= */
  function toast(msg) {
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
    if (document.getElementById("isyouStyleFinalV4")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleFinalV4";
    s.textContent = `
/* ===== お洒落パネル ===== */
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
}
#isyouPanel .head{
  display:flex; justify-content:space-between; align-items:center;
  padding:12px 14px;
  border-bottom:1px solid rgba(0,0,0,.08);
  font-weight:1000;
}
#isyouPanel .body{ padding:14px; }
#isyouPanel .row{
  display:flex; gap:10px; align-items:center;
  justify-content:space-between; flex-wrap:wrap;
}
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
  outline:3px solid rgba(255,90,140,.35);
}

/* ===== 帽子：耳の下／頭の真ん中 ===== */
.bunnyWrap{ position:relative; } /* 念のため */

.bunnyWrap .isyouHat{
  position:absolute;

  left: var(--hatX, ${HAT_X});
  top:  var(--hatY, ${HAT_Y});

  width: var(--hatW, ${HAT_W});
  height:auto;

  /* 通常（非flip） */
  transform:
    translateX(-50%)
    rotate(var(--hatR, ${HAT_R}))
    scale(var(--hatS, ${HAT_S}));

  transform-origin: 50% 90%;
  pointer-events:none;
  z-index: 6;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.18));
}

/* ★flip時：親の反転を帽子側で打ち消す（scaleX(-1)）＋角度だけ左右反転 */
.bunnyWrap.flip .isyouHat{
  transform:
    translateX(-50%)
    scaleX(-1)
    rotate(calc(var(--hatR, ${HAT_R}) * -1))
    scale(var(--hatS, ${HAT_S}));
}

/* ===== 装着モード可視化 ===== */
#isyouBtn.on{
  outline:3px solid rgba(255,90,140,.45);
  box-shadow:
    0 12px 32px rgba(0,0,0,.14),
    0 0 0 6px rgba(255,90,140,.12);
}
`;
    document.head.appendChild(s);
  }

  /* =========================
   * HUD Button
   * ========================= */
  function injectHudButton() {
    const hudButtons = document.getElementById("hudButtons");
    if (!hudButtons) return;
    if (document.getElementById("isyouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.type = "button";
    btn.textContent = "お洒落";
    btn.addEventListener("click", () => {
      WB.unlockAudioOnce?.();
      openPanel();
    });

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

    panelEl.querySelector(".bg").onclick = closePanel;
    panelEl.querySelector(".close").onclick = closePanel;
    panelEl.querySelector(".card").onclick = e => e.stopPropagation();

    return panelEl;
  }

  function renderPanel() {
    const body = buildPanel().querySelector(".body");
    const n = owned[ITEM.key] || 0;

    body.innerHTML = `
      <div class="row">
        <b>${ITEM.label}</b>
        <span>所持：${n}</span>
      </div>
      <div style="height:8px"></div>
      <div class="row">
        <span>価格：${ITEM.price}🪙</span>
        <button class="btn primary" data-buy>購入</button>
      </div>
      <div style="height:10px"></div>
      <div class="row">
        <button class="btn ${equipMode ? "active" : ""}" data-equip>
          ${equipMode ? "装着モード：ON" : "装着モード：OFF"}
        </button>
      </div>
      <div style="margin-top:8px;font-size:13px;opacity:.8;font-weight:900;">
        ※装着モード中、付けたい「うさぎ」をクリック
      </div>
    `;

    body.querySelector("[data-buy]").onclick = () => {
      buyItem();
      renderPanel();
    };
    body.querySelector("[data-equip]").onclick = () => {
      toggleEquipMode();
      renderPanel();
    };
  }

  function openPanel() {
    renderPanel();
    panelEl.style.display = "block";
  }
  function closePanel() {
    if (panelEl) panelEl.style.display = "none";
  }

  /* =========================
   * Logic
   * ========================= */
  function buyItem() {
    if (WB.coins < ITEM.price) {
      toast(`コイン不足（${ITEM.price}🪙）`);
      return;
    }
    WB.coins -= ITEM.price;
    WB.saveCoins?.();
    WB.updateHud?.();

    owned[ITEM.key] = (owned[ITEM.key] || 0) + 1;
    saveJson(LS.owned, owned);

    toast(`🎉 ${ITEM.label} 購入！`);
  }

  function toggleEquipMode() {
    if (!owned[ITEM.key]) {
      toast("先に購入してね！");
      return;
    }
    equipMode = !equipMode;
    document.getElementById("isyouBtn")?.classList.toggle("on", equipMode);
    toast(equipMode ? "装着モードON" : "装着モードOFF");
  }

  function bunnyId(bunny) {
    return String(bunny?.bornAt ?? "");
  }

  function applyVars(bunny) {
    // 装着時ズレ対策：1フレ遅らせて確定（画像ロード/flip反映待ち）
    requestAnimationFrame(() => {
      try {
        bunny.wrap.style.setProperty("--hatX", HAT_X);
        bunny.wrap.style.setProperty("--hatY", HAT_Y);
        bunny.wrap.style.setProperty("--hatW", HAT_W);
        bunny.wrap.style.setProperty("--hatR", HAT_R);
        bunny.wrap.style.setProperty("--hatS", HAT_S);
      } catch {}
    });
  }

  function ensureHatOnBunny(bunny) {
    const id = bunnyId(bunny);
    if (!id) return;

    let hat = bunny.wrap.querySelector(".isyouHat");
    if (!hat) {
      hat = document.createElement("img");
      hat.className = "isyouHat";
      hat.src = ITEM.src;
      hat.draggable = false;
      hat.decoding = "async";
      bunny.wrap.appendChild(hat);
    }

    // 位置/サイズを確定
    applyVars(bunny);

    // 保存
    equipped[id] = equipped[id] || {};
    equipped[id][ITEM.key] = true;
    saveJson(LS.equipped, equipped);
  }

  function applyEquippedAll() {
    WB.bunnies.forEach(b => {
      const id = bunnyId(b);
      if (equipped[id]?.[ITEM.key]) ensureHatOnBunny(b);
    });
  }

  function onPointerDownCapture(e) {
    if (!equipMode) return;
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target.closest(".bunnyWrap");
    if (!wrap) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const bunny = WB.bunnies.find(b => b.wrap === wrap);
    if (!bunny) return;

    if ((owned[ITEM.key] || 0) <= 0) {
      toast("在庫がないよ（購入してね）");
      equipMode = false;
      document.getElementById("isyouBtn")?.classList.remove("on");
      return;
    }

    owned[ITEM.key]--;
    saveJson(LS.owned, owned);

    ensureHatOnBunny(bunny);

    equipMode = false;
    document.getElementById("isyouBtn")?.classList.remove("on");
    toast("🎉 帽子を装着！");
  }

  /* =========================
   * Boot
   * ========================= */
  window.addEventListener("load", () => {
    injectStyles();
    injectHudButton();
    applyEquippedAll();

    document.addEventListener("pointerdown", onPointerDownCapture, true);

    WB.on?.("bunnyCountChanged", () => {
      setTimeout(applyEquippedAll, 0);
    });

    WB.on?.("resetRequested", () => {
      localStorage.removeItem(LS.owned);
      localStorage.removeItem(LS.equipped);
    });
  });

  // 装着ズレが残る時用：flipが切り替わった瞬間にも再適用
  WB.on?.("resize", () => setTimeout(applyEquippedAll, 0));
})();
