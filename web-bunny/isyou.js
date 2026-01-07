// isyou.js
// お洒落（衣装）: partyhat を購入→「どのウサギに付けるか」クリックで選択
// - assets/isyou/partyhat.png を頭に重ねる（bunnyWrap 内にabsolute配置）
// - 購入は HUD に「お洒落」ボタンを追加（既にあればそれを使う）
// - 購入済みは永続化（localStorage）
// - 付け替え: お洒落パネルから「装着モード」にして、付けたいウサギをクリック

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * Config
   * ========================= */
  const LS = {
    owned: "wb_isyou_owned_v1",     // { partyhat: true }
    equip: "wb_isyou_equip_v1",     // { [bunnyId]: { partyhat: true } }
  };

  const ITEMS = [
    {
      key: "partyhat",
      name: "パーティーハット",
      emoji: "🎉",
      price: 2500,
      src: "./assets/isyou/partyhat.png",
      // うさぎ頭への相対位置（調整用）
      // bunnyWrap を基準に absolute で置く
      // 基本は「上にちょい出して頭に被せる」位置
      style: {
        // % は bunnyWrap の幅/高さに対する比率
        leftPct: 50,     // 中央寄せ
        topPct: 6,       // 上の方
        widthPct: 38,    // 帽子の大きさ
        rotateDeg: -8,   // 少し傾ける
      },
    },
  ];

  /* =========================
   * Helpers
   * ========================= */
  const $ = (q, p = document) => p.querySelector(q);

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

  // bunny の永続IDを用意（wrapにdata-idが無い場合でも安定させる）
  function ensureBunnyId(bunny) {
    if (!bunny) return null;
    if (bunny.id) return String(bunny.id);

    // wrapに付与されていればそれを使う
    try {
      const w = bunny.wrap;
      const existed = w?.dataset?.bid;
      if (existed) {
        bunny.id = existed;
        return existed;
      }
    } catch {}

    const id = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    bunny.id = id;
    try { if (bunny.wrap) bunny.wrap.dataset.bid = id; } catch {}
    return id;
  }

  function toast(msg, ms = 1600) {
    // 既存の toast があっても最低限見えるように
    const el = document.createElement("div");
    el.className = "farewellMilestone";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, ms);
  }

  function getCoins() {
    return Number(WB.coins || 0);
  }
  function spendCoins(n) {
    const v = Math.max(0, Math.floor(n));
    WB.coins = Math.max(0, getCoins() - v);
    WB.saveCoins?.();
    WB.updateHud?.();
  }
  function addCoins(n) {
    const v = Math.max(0, Math.floor(n));
    WB.coins = getCoins() + v;
    WB.saveCoins?.();
    WB.updateHud?.();
  }

  /* =========================
   * State
   * ========================= */
  const state = {
    owned: loadJson(LS.owned, {}),   // {partyhat:true}
    equip: loadJson(LS.equip, {}),   // { bunnyId: {partyhat:true}}
    attachMode: null,               // "partyhat" | null
    uiOpen: false,
  };

  function saveAll() {
    saveJson(LS.owned, state.owned);
    saveJson(LS.equip, state.equip);
  }

  function isOwned(key) {
    return !!state.owned?.[key];
  }

  function isEquipped(bunnyId, key) {
    return !!state.equip?.[bunnyId]?.[key];
  }

  function setEquipped(bunnyId, key, on) {
    if (!bunnyId) return;
    if (!state.equip[bunnyId]) state.equip[bunnyId] = {};
    state.equip[bunnyId][key] = !!on;
    saveAll();
  }

  /* =========================
   * Styles
   * ========================= */
  function injectStyles() {
    if (document.getElementById("isyouStyleV1")) return;
    const s = document.createElement("style");
    s.id = "isyouStyleV1";
    s.textContent = `
/* 帽子レイヤ（うさぎに重ねる） */
.bunnyWrap{ position: relative; } /* 念のため */
.bunnyWrap .isyouLayer{
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index: 6; /* うさぎ画像より上を想定 */
}
.bunnyWrap .isyouHat{
  position:absolute;
  transform-origin: 50% 70%;
  image-rendering: auto;
  filter: drop-shadow(0 6px 8px rgba(0,0,0,.18));
  opacity: 1;
}

/* 装着モード時：対象選択を分かりやすく */
.isyouAttachOn .bunnyWrap{
  outline: 2px dashed rgba(255, 120, 160, .85);
  outline-offset: 6px;
  border-radius: 18px;
}
.isyouAttachOn .bunnyWrap:hover{
  outline: 3px solid rgba(255, 60, 60, .95);
  outline-offset: 6px;
}

/* お洒落パネル */
#isyouPanel{
  position: fixed;
  inset:0;
  z-index: 2147483647;
  display:none;
  user-select:none;
}
#isyouPanel .bg{ position:absolute; inset:0; background: rgba(0,0,0,.38); }
#isyouPanel .card{
  position:absolute;
  left:50%; top:50%;
  transform: translate(-50%,-50%);
  width: min(640px, 92vw);
  max-height: min(78vh, 720px);
  overflow:hidden;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,.24);
  display:flex;
  flex-direction: column;
}
#isyouPanel .head{
  display:flex; align-items:center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(0,0,0,.08);
}
#isyouPanel .title{ font-weight: 1000; letter-spacing:.02em; }
#isyouPanel .close{
  border:none; background: rgba(0,0,0,.06);
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 900;
  cursor:pointer;
}
#isyouPanel .body{ padding: 12px 14px; overflow:auto; }
#isyouPanel .section{
  background: rgba(0,0,0,.03);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
}
#isyouPanel .row{
  display:flex; gap: 10px;
  flex-wrap: wrap;
  align-items:center;
  justify-content: space-between;
}
#isyouPanel .pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  background: rgba(255,255,255,.92);
  border-radius: 999px;
  padding: 8px 10px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  font-weight: 900;
}
#isyouPanel .btn{
  border:none;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  cursor:pointer;
  background: #fff;
  box-shadow: 0 10px 22px rgba(0,0,0,.10);
}
#isyouPanel .btn.primary{ background: #ffd6e7; }
#isyouPanel .btn.danger{ background: rgba(255,80,80,.12); }
#isyouPanel .grid{ display:grid; grid-template-columns: 1fr; gap: 10px; }
#isyouPanel .item{
  background: rgba(255,255,255,.92);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
#isyouPanel .item .left{ display:flex; flex-direction: column; gap: 4px; }
#isyouPanel .item .name{ font-weight: 1000; }
#isyouPanel .item .meta{ font-size: 12px; opacity: .75; font-weight: 900; }
#isyouPanel .badge{
  display:inline-flex; align-items:center; gap: 6px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.06);
  font-weight: 900;
  font-size: 12px;
}
#isyouPanel .badge.on{ background: rgba(120, 210, 255, .22); }
`;
    document.head.appendChild(s);
  }

  /* =========================
   * Hat DOM mount
   * ========================= */
  function ensureIsyouLayer(wrap) {
    if (!wrap) return null;
    let layer = wrap.querySelector(":scope > .isyouLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "isyouLayer";
      wrap.appendChild(layer);
    }
    return layer;
  }

  function applyPartyHatToWrap(wrap, on) {
    if (!wrap) return;
    const layer = ensureIsyouLayer(wrap);
    if (!layer) return;

    // 既存を掃除
    const existed = layer.querySelector(".isyouHat.partyhat");
    if (existed) {
      if (!on) {
        try { existed.remove(); } catch {}
      }
      // on ならそのまま
      if (on) return;
    }

    if (!on) return;

    const item = ITEMS.find(x => x.key === "partyhat");
    if (!item) return;

    const img = document.createElement("img");
    img.className = "isyouHat partyhat";
    img.alt = item.name;
    img.src = item.src;

    // 位置：頭に被せる（wrap基準）
    // left=50% / top=6% / width=38% をデフォ
    const st = item.style || {};
    img.style.left = (st.leftPct ?? 50) + "%";
    img.style.top = (st.topPct ?? 6) + "%";
    img.style.width = (st.widthPct ?? 38) + "%";
    img.style.transform = `translate(-50%, 0) rotate(${st.rotateDeg ?? -8}deg)`;

    layer.appendChild(img);
  }

  function applyAllEquips() {
    // bunnies 全員に反映
    (WB.bunnies || []).forEach((b) => {
      const id = ensureBunnyId(b);
      const wrap = b.wrap;
      if (!id || !wrap) return;
      applyPartyHatToWrap(wrap, isEquipped(id, "partyhat"));
    });
  }

  /* =========================
   * UI (Panel)
   * ========================= */
  let uiEl = null;

  function buildUI() {
    injectStyles();
    if (uiEl && document.body.contains(uiEl)) return uiEl;

    uiEl = document.createElement("div");
    uiEl.id = "isyouPanel";
    uiEl.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🧢 お洒落</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body"></div>
      </div>
    `;
    document.body.appendChild(uiEl);

    uiEl.querySelector(".bg")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closePanel();
    });
    uiEl.querySelector(".close")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closePanel();
    });
    uiEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    return uiEl;
  }

  function renderUI() {
    const p = buildUI();
    const body = p.querySelector(".body");
    if (!body) return;

    const have = getCoins();
    const attach = state.attachMode;

    const itemsHtml = ITEMS.map((it) => {
      const owned = isOwned(it.key);
      const isAttach = attach === it.key;

      const right = owned
        ? `
          <span class="badge ${isAttach ? "on" : ""}">${isAttach ? "装着モード中" : "購入済み"}</span>
          <button class="btn primary" type="button" data-attach="${it.key}">
            ${isAttach ? "装着モード解除" : "どの🐰に付ける？"}
          </button>
        `
        : `
          <span class="badge">未購入</span>
          <button class="btn primary" type="button" data-buy="${it.key}">
            購入（-${it.price}🪙）
          </button>
        `;

      return `
        <div class="item">
          <div class="left">
            <div class="name">${escapeHtml(it.emoji)} ${escapeHtml(it.name)}</div>
            <div class="meta">帽子（頭に重ねて表示） / 価格：${it.price}🪙</div>
          </div>
          <div class="right">${right}</div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="section">
        <div class="row">
          <div class="pill">所持：<b>${have}</b> 🪙</div>
          <div class="pill">状態：<b>${attach ? "装着モード（🐰をクリック）" : "通常"}</b></div>
          <div class="row" style="gap:8px">
            <button class="btn danger" type="button" data-cancel="1">装着モード解除</button>
          </div>
        </div>
        <div style="height:10px"></div>
        <div class="mini" style="font-weight:900; opacity:.8;">
          購入後「どの🐰に付ける？」→付けたいウサギをクリック。もう一度クリックで外せます。
        </div>
      </div>

      <div class="section">
        <div class="row">
          <div class="title">🧺 アイテム</div>
          <button class="btn" type="button" data-refresh="1">更新</button>
        </div>
        <div style="height:10px"></div>
        <div class="grid">${itemsHtml}</div>
      </div>
    `;

    // bind buy
    body.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute("data-buy") || "";
        const it = ITEMS.find(x => x.key === key);
        if (!it) return;

        if (getCoins() < it.price) {
          toast("コインが足りない…！", 1600);
          return;
        }
        spendCoins(it.price);
        state.owned[key] = true;
        saveAll();
        toast(`購入！ ${it.emoji} ${it.name}`, 1800);

        // 購入した瞬間に装着モードへ
        setAttachMode(key);
        renderUI();
      });
    });

    // bind attach toggle
    body.querySelectorAll("[data-attach]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute("data-attach") || "";
        if (!isOwned(key)) return;

        if (state.attachMode === key) setAttachMode(null);
        else setAttachMode(key);

        renderUI();
      });
    });

    body.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        setAttachMode(null);
        renderUI();
      });
    });

    body.querySelectorAll("[data-refresh]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        renderUI();
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openPanel() {
    const p = buildUI();
    renderUI();
    p.style.display = "block";
  }
  function closePanel() {
    const p = uiEl || document.getElementById("isyouPanel");
    if (!p) return;
    p.style.display = "none";
  }

  /* =========================
   * Attach mode (click bunny to equip)
   * ========================= */
  function setAttachMode(keyOrNull) {
    state.attachMode = keyOrNull ? String(keyOrNull) : null;

    // 画面側に状態を出す（hover赤縁もここでON）
    document.documentElement.classList.toggle("isyouAttachOn", !!state.attachMode);

    if (state.attachMode) {
      toast("🧢 装着モード：付けたい🐰をクリック", 1800);
      WB.unlockAudioOnce?.();
    } else {
      toast("🧢 装着モード：解除", 1200);
    }
  }

  function onPointerDownCapture(e) {
    if (!state.attachMode) return;

    // 左クリック/タップのみ
    if (e.button != null && e.button !== 0) return;

    const wrap = e.target?.closest?.(".bunnyWrap");
    if (!wrap) return;

    // 他のクリック処理（コイン生成など）を止める
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const bunny = (WB.bunnies || []).find(b => b.wrap === wrap);
    if (!bunny) return;

    const id = ensureBunnyId(bunny);
    if (!id) return;

    const key = state.attachMode;

    // トグル装着
    const next = !isEquipped(id, key);
    setEquipped(id, key, next);

    if (key === "partyhat") {
      applyPartyHatToWrap(wrap, next);
    }

    toast(next ? "🎉 帽子をかぶせた！" : "🎈 帽子を外した！", 1400);
    renderUI();
  }

  // キャプチャで横取り（装着モード中だけ）
  document.addEventListener("pointerdown", onPointerDownCapture, true);

  /* =========================
   * HUD button
   * ========================= */
  function injectHudButton() {
    const hud = document.getElementById("hudButtons") || document.getElementById("hud");
    if (!hud) return;

    if (document.getElementById("isyouBtn")) return;

    const btn = document.createElement("button");
    btn.id = "isyouBtn";
    btn.type = "button";
    btn.textContent = "お洒落";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openPanel();
    });
    hud.appendChild(btn);
  }

  /* =========================
   * Hook: bunny 생성/更新時に反映
   * ========================= */
  function hookBunnyChanges() {
    // もしWBがイベントemitを持ってるなら拾う（無ければ無視）
    try {
      WB.on?.("bunnyCountChanged", () => applyAllEquips());
      WB.on?.("bunnySpawned", () => applyAllEquips());
    } catch {}
  }

  /* =========================
   * Boot
   * ========================= */
  injectStyles();
  injectHudButton();
  hookBunnyChanges();

  // 初期反映（ロード後）
  window.addEventListener("load", () => {
    injectHudButton();
    setTimeout(() => applyAllEquips(), 50);

    // 既存ボタンを拾う
    const btn =
      document.getElementById("isyouBtn") ||
      [...document.querySelectorAll("button")].find(b => (b.textContent || "").includes("お洒落"));
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });
    }
  });

  // 外部公開（デバッグ用）
  WB.isyou = {
    openPanel,
    closePanel,
    setAttachMode,
    applyAllEquips,
    get owned() { return { ...state.owned }; },
    get equip() { return loadJson(LS.equip, {}); },
  };
})();
