// memoryGarden_fusion.js（V1.3 - 記憶の合成：2つの記憶 → 1つの短編 / 高コスト / 結果単体表示つき）
//
// ✅ memoryGarden.js を改造せず「後付けパッチ」で実装
// ✅ 記憶カードに「🧵 合成に使う」ボタンを追加（2つ選択）
// ✅ data-memid が無い環境でも、DOMに後付けして確実に選べる（V1.2）
// ✅ 高コストコインで合成（不足なら中断）
// ✅ 合成結果は新しい記憶として保存（emotion="tsumugi"）
// ✅ 合成メッセージは memoryGarden_fusion_messages.js（window.MG_FUSION_MESSAGES）から取得
// ✅ 合成後：結果を必ず単体表示（このJS内モーダル）＋ 可能ならMGの単体表示APIも叩く（V1.3）
// ✅ emit("memoryGarden:updated") で図鑑/庭UIが更新される
//
// 読み込み順：memoryGarden_messages.js → memoryGarden_fusion_messages.js → memoryGarden.js → memoryGarden_fusion.js

(() => {
  "use strict";
  if (window.__MEMORY_GARDEN_FUSION_V13__) return;
  window.__MEMORY_GARDEN_FUSION_V13__ = true;

  const VERSION = "1.3";

  const CFG = {
    pollMs: 700,
    costCoin: 25000,
    minActIntervalMs: 450,

    // ✅ 単体表示SE（要求）
    seUrl: "./assets/messege/messegese.mp3",
  };

  const $ = (q, p = document) => p.querySelector(q);
  const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));
  function safe(fn) { try { return fn(); } catch { return undefined; } }
  function now() { return Date.now(); }

  function getMG() {
    return window.WB?.memoryGarden || window.memoryGarden || null;
  }
  function getStore() {
    const mg = getMG();
    return mg?.store || null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  /* =========================
   * Coins (best effort)
   * ========================= */
  function getCoins() {
    const WB = window.WB;
    try { if (typeof WB?.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try { if (typeof WB?.coins === "number") return Number(WB.coins) || 0; } catch {}
    try {
      const v = Number(document.getElementById("coinValue")?.textContent || "0");
      if (Number.isFinite(v)) return v;
    } catch {}
    return 0;
  }

  function spendCoins(amount) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return true;

    const WB = window.WB;

    try {
      if (typeof WB?.spendCoin === "function") return !!WB.spendCoin(amount);
    } catch {}

    try {
      if (typeof WB?.coins === "number") {
        if (WB.coins < amount) return false;
        WB.coins -= amount;
        try { WB.saveCoins?.(); } catch {}
        try { WB.updateHud?.(); } catch {}
        try { WB.emit?.("coinChanged", WB.coins); } catch {}
        return true;
      }
    } catch {}

    return false;
  }

  /* =========================
   * Toast
   * ========================= */
  function toast(msg) {
    msg = String(msg || "");
    if (!msg) return;

    try { if (window.WB?.toast) return window.WB.toast(msg); } catch {}
    try { if (window.ZISSEKI?.toast) return window.ZISSEKI.toast(msg); } catch {}

    try {
      const id = "mgFusionToastV1";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText = `
          position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
          z-index:2147483647;
          background:rgba(20,20,20,.82);
          color:#fff;
          border-radius:14px;
          padding:10px 12px;
          font-weight:950;
          box-shadow:0 14px 40px rgba(0,0,0,.22);
          opacity:0;
          pointer-events:none;
          transition:opacity .2s ease, transform .2s ease;
          white-space:pre-line;
        `;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(-6px)";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(0px)";
      }, 1600);
    } catch {}
  }

  /* =========================
   * SE
   * ========================= */
  function playSE() {
    const mg = getMG();
    // もし memoryGarden.js 側に playMessageSE があるならそれ優先（音量連携できる可能性がある）
    const ok = safe(() => mg?.playMessageSE?.());
    if (ok !== undefined) return;

    // フォールバック：単体で鳴らす
    try {
      if (!window.__mgFusionSe__) {
        const a = new Audio(CFG.seUrl);
        a.preload = "auto";
        a.volume = 1.0;
        window.__mgFusionSe__ = a;
      }
      const a = window.__mgFusionSe__;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  /* =========================
   * Fusion UI
   * ========================= */
  const UI = { panel: "mgFusionPanelV1", style: "mgFusionStyleV1" };

  let lastActAt = 0;
  let pickA = null;
  let pickB = null;

  function canAct() {
    const t = now();
    if (t - lastActAt < CFG.minActIntervalMs) return false;
    lastActAt = t;
    return true;
  }

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const s = document.createElement("style");
    s.id = UI.style;
    s.textContent = `
#${UI.panel}{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#${UI.panel} .bg{position:absolute; inset:0; background:rgba(0,0,0,.42);}
#${UI.panel} .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(720px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  overflow:hidden;
}
#${UI.panel} .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px; border-bottom:1px solid rgba(0,0,0,.06);
}
#${UI.panel} .title{font-weight:1000; display:flex; align-items:center; gap:10px;}
#${UI.panel} .close{
  width:34px; height:34px; border:none; border-radius:999px;
  background:rgba(0,0,0,.06); font-weight:1100; cursor:pointer;
}
#${UI.panel} .body{padding:14px;}
#${UI.panel} .row{display:flex; gap:12px; flex-wrap:wrap;}
#${UI.panel} .box{
  flex:1; min-width:260px;
  background:rgba(0,0,0,.04);
  border-radius:16px;
  padding:12px;
}
#${UI.panel} .box .cap{font-weight:1000; opacity:.8; margin-bottom:8px;}
#${UI.panel} .box .txt{font-weight:950; white-space:pre-line; line-height:1.5;}
#${UI.panel} .meta{
  display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
  font-weight:900; opacity:.7; font-size:12px; margin-top:10px;
}
#${UI.panel} .foot{
  padding:12px 14px 14px;
  display:flex; gap:10px; align-items:center; justify-content:space-between;
  border-top:1px solid rgba(0,0,0,.06);
}
#${UI.panel} .cost{
  font-weight:1000;
  background:rgba(255,214,231,.45);
  padding:8px 10px;
  border-radius:12px;
}
#${UI.panel} .btns{display:flex; gap:10px; align-items:center;}
#${UI.panel} .btn{
  border:none; border-radius:12px; padding:10px 12px;
  font-weight:1000; cursor:pointer;
  background:rgba(0,0,0,.06);
}
#${UI.panel} .btn.primary{background:rgba(255,214,231,.75);}
#${UI.panel} .hint{font-weight:900; opacity:.7; font-size:12px; margin-top:10px;}
`;
    document.head.appendChild(s);
  }

  function ensurePanel() {
    ensureStyle();
    let p = document.getElementById(UI.panel);
    if (p) return p;

    p = document.createElement("div");
    p.id = UI.panel;
    p.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🧵 記憶の合成</div>
          <button class="close" type="button">×</button>
        </div>
        <div class="body"></div>
        <div class="foot">
          <div class="cost">コスト：${CFG.costCoin.toLocaleString()} 🪙</div>
          <div class="btns">
            <button class="btn" data-act="reset" type="button">選び直す</button>
            <button class="btn primary" data-act="do" type="button">合成する</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(p);

    $(".bg", p).addEventListener("click", (e) => { e.preventDefault(); closeFusion(); });
    $(".close", p).addEventListener("click", (e) => { e.preventDefault(); closeFusion(); });
    $(".card", p).addEventListener("click", (e) => e.stopPropagation());

    p.querySelector('[data-act="reset"]').addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!canAct()) return;
      pickA = null; pickB = null;
      renderFusion();
      toast("合成する記憶を2つ選んでね");
    });

    p.querySelector('[data-act="do"]').addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!canAct()) return;
      doFusion();
    });

    return p;
  }

  function openFusion() {
    const p = ensurePanel();
    p.style.display = "block";
    playSE();
    renderFusion();
  }

  function closeFusion() {
    const p = document.getElementById(UI.panel);
    if (p) p.style.display = "none";
  }

  function renderFusion() {
    const p = ensurePanel();
    const body = $(".body", p);

    const aText = pickA ? pickA.text : "（まだ選ばれていません）";
    const bText = pickB ? pickB.text : "（まだ選ばれていません）";

    body.innerHTML = `
      <div class="row">
        <div class="box">
          <div class="cap">1つ目</div>
          <div class="txt">${escapeHtml(aText)}</div>
          <div class="meta">
            <div>${escapeHtml(pickA?.emotion || "")}</div>
            <div>${escapeHtml(pickA?.date || "")}</div>
          </div>
        </div>
        <div class="box">
          <div class="cap">2つ目</div>
          <div class="txt">${escapeHtml(bText)}</div>
          <div class="meta">
            <div>${escapeHtml(pickB?.emotion || "")}</div>
            <div>${escapeHtml(pickB?.date || "")}</div>
          </div>
        </div>
      </div>

      <div class="hint">
        ・記憶一覧の「🧵 合成に使う」で2つ選ぶと、ここで合成できます。<br>
        ・合成後は新しい記憶（tsumugi）が追加されます（元の記憶は消えません）。
      </div>
    `;
  }

  /* =========================
   * ★ data-memid 後付け
   * ========================= */
  function attachMemIdsToGardenCards() {
    const store = getStore();
    const panel = document.getElementById("mgPanelV1");
    if (!store || !panel || panel.style.display !== "block") return;

    const body = panel.querySelector(".body");
    if (!body) return;

    const cards = $$(".mem", body);
    if (!cards.length) return;

    const list = (store.memories || []).slice(0, 80);
    const n = Math.min(cards.length, list.length);

    for (let i = 0; i < n; i++) {
      const el = cards[i];
      const mem = list[i];
      if (!mem?.id) continue;
      if (!el.getAttribute("data-memid")) el.setAttribute("data-memid", mem.id);
    }
  }

  function findMemoryCardsInGardenPanel() {
    const panel = document.getElementById("mgPanelV1");
    if (!panel || panel.style.display !== "block") return [];
    const body = panel.querySelector(".body");
    if (!body) return [];

    attachMemIdsToGardenCards();

    const a = $$(`.mem[data-memid]`, body);
    if (a.length) return a;

    return $$(`.mem`, body);
  }

  function ensureFusionButtonOnCard(card) {
    if (!card) return false;
    if (card.querySelector('[data-act="fusionPick"]')) return true;

    let row = card.querySelector(".btnRow");
    if (!row) {
      row = document.createElement("div");
      row.className = "btnRow";
      row.style.cssText = "display:flex; gap:10px; margin-top:8px; align-items:center;";
      card.appendChild(row);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-act", "fusionPick");
    btn.textContent = "🧵 合成に使う";
    btn.style.cssText = `
      border:none; border-radius:12px; padding:8px 10px;
      font-weight:1000; background:rgba(0,0,0,.06); cursor:pointer;
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!canAct()) return;

      const store = getStore();
      if (!store) return;

      let mem = null;
      const id = card.getAttribute("data-memid");
      if (id) mem = (store.memories || []).find(m => m && m.id === id) || null;

      if (!mem) {
        const panel = document.getElementById("mgPanelV1");
        const body = panel?.querySelector?.(".body");
        const cards = body ? $$(".mem", body) : [];
        const idx = cards.indexOf(card);
        if (idx >= 0) mem = (store.memories || [])[idx] || null;
      }

      if (!mem) return;

      if (pickA?.id === mem.id || pickB?.id === mem.id) {
        toast("同じ記憶は2回使えないよ");
        return;
      }

      if (!pickA) {
        pickA = mem;
        playSE();
        toast("1つ目を選んだ。もう1つ選んでね");
        openFusion();
        return;
      }

      if (!pickB) {
        pickB = mem;
        playSE();
        toast("2つ目を選んだ。合成できるよ");
        openFusion();
        return;
      }

      pickB = mem;
      playSE();
      toast("2つ目を入れ替えた");
      openFusion();
    });

    row.insertBefore(btn, row.firstChild);
    return true;
  }

  /* =========================
   * Fusion message picker
   * ========================= */
  function pickFusionMessage() {
    const pool = window.MG_FUSION_MESSAGES?.tsumugi;
    if (Array.isArray(pool) && pool.length) {
      return String(pool[Math.floor(Math.random() * pool.length)] || "").trim();
    }
    return "ほどいた記憶を、結び直す。\n二つ分の静けさが残った。\nそれを短編と呼ぶ。";
  }

  /* =========================
   * ✅ 合成結果の単体表示（このJS内）
   * ========================= */
  const VIEW = { panel: "mgFusionViewV1", style: "mgFusionViewStyleV1" };

  function ensureViewStyle() {
    if (document.getElementById(VIEW.style)) return;
    const s = document.createElement("style");
    s.id = VIEW.style;
    s.textContent = `
#${VIEW.panel}{position:fixed; inset:0; z-index:2147483647; display:none; user-select:none;}
#${VIEW.panel} .bg{position:absolute; inset:0; background:rgba(0,0,0,.45);}
#${VIEW.panel} .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(680px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  overflow:hidden;
}
#${VIEW.panel} .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px; border-bottom:1px solid rgba(0,0,0,.06);
}
#${VIEW.panel} .title{font-weight:1100; display:flex; align-items:center; gap:10px;}
#${VIEW.panel} .close{
  width:34px; height:34px; border:none; border-radius:999px;
  background:rgba(0,0,0,.06); font-weight:1100; cursor:pointer;
}
#${VIEW.panel} .body{padding:14px 14px 16px;}
#${VIEW.panel} .meta{font-weight:900; opacity:.7; font-size:12px; margin-bottom:10px;}
#${VIEW.panel} .txt{font-weight:1000; white-space:pre-line; line-height:1.55;}
#${VIEW.panel} .foot{
  padding:12px 14px 14px;
  display:flex; gap:10px; align-items:center; justify-content:flex-end;
  border-top:1px solid rgba(0,0,0,.06);
}
#${VIEW.panel} .btn{
  border:none; border-radius:12px; padding:10px 12px;
  font-weight:1000; cursor:pointer; background:rgba(0,0,0,.06);
}
#${VIEW.panel} .btn.primary{background:rgba(255,214,231,.75);}
`;
    document.head.appendChild(s);
  }

  function ensureViewPanel() {
    ensureViewStyle();
    let p = document.getElementById(VIEW.panel);
    if (p) return p;

    p = document.createElement("div");
    p.id = VIEW.panel;
    p.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">🧵 合成された短編</div>
          <button class="close" type="button">×</button>
        </div>
        <div class="body">
          <div class="meta"></div>
          <div class="txt"></div>
        </div>
        <div class="foot">
          <button class="btn" data-act="close" type="button">閉じる</button>
          <button class="btn primary" data-act="openGarden" type="button">記憶の庭を開く</button>
        </div>
      </div>
    `;
    document.body.appendChild(p);

    $(".bg", p).addEventListener("click", (e) => { e.preventDefault(); closeView(); });
    $(".close", p).addEventListener("click", (e) => { e.preventDefault(); closeView(); });
    $(".card", p).addEventListener("click", (e) => e.stopPropagation());
    p.querySelector('[data-act="close"]').addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); closeView();
    });
    p.querySelector('[data-act="openGarden"]').addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeView();
      // MGのUIがあるなら記憶タブへ誘導
      const mg = getMG();
      safe(() => mg?.open?.("mem"));
      safe(() => window.WB?.zukan?.open?.("memory"));
    });

    return p;
  }

  function openView(mem) {
    const p = ensureViewPanel();
    const meta = $(".meta", p);
    const txt = $(".txt", p);

    meta.textContent = `emotion: ${mem?.emotion || "tsumugi"} / ${mem?.date || ""}`;
    txt.textContent = String(mem?.text || "");

    p.style.display = "block";
    playSE();
  }

  function closeView() {
    const p = document.getElementById(VIEW.panel);
    if (p) p.style.display = "none";
  }

  /* =========================
   * Do fusion
   * ========================= */
  function doFusion() {
    const mg = getMG();
    const store = getStore();
    if (!store) return;

    if (!pickA || !pickB) {
      toast("記憶が2つ必要です");
      openFusion();
      return;
    }

    const cost = Math.floor(Number(CFG.costCoin) || 0);
    const coins = getCoins();
    if (coins < cost) {
      toast(`コイン不足（必要：${cost.toLocaleString()}🪙）`);
      openFusion();
      return;
    }
    if (!spendCoins(cost)) {
      toast(`コイン不足（必要：${cost.toLocaleString()}🪙）`);
      openFusion();
      return;
    }

    playSE();

    const text = pickFusionMessage();
    const memObj = {
      id: uid("mem"),
      emotion: "tsumugi",
      text,
      date: todayStr(),
      bornAt: Date.now(),
      doneAt: Date.now(),
      fav: false,
      fusedFrom: [pickA.id, pickB.id],
    };

    store.memories = store.memories || [];
    store.memories.unshift(memObj);

    pickA = null;
    pickB = null;

    safe(() => window.WB?.emit?.("memoryGarden:updated", { fusion: true }));
    toast("🧵 記憶を紡いだ（新しい短編が残った）");

    // ✅ まずこのJS内の単体表示で「確実に見せる」
    openView(memObj);

    // ✅ もしMG側に単体表示APIがあるなら、そっちでも表示してOK（好みでOFFにもできる）
    safe(() => mg?.showById?.(memObj.id));

    // 合成パネルも更新（任意：開いたままにする）
    openFusion();
  }

  function patchTsUmugiLabel() {
    const store = getStore();
    if (!store) return;
    store.__fusionLabel = store.__fusionLabel || { tsumugi: "🧵 つむぎ" };
  }

  function tick() {
    const mg = getMG();
    const store = getStore();
    if (!mg || !store) return;

    patchTsUmugiLabel();

    const cards = findMemoryCardsInGardenPanel();
    cards.forEach(ensureFusionButtonOnCard);
  }

  // 外部から呼びたい時用（デバッグ/拡張）
  window.WB = window.WB || {};
  window.WB.memoryFusion = {
    openView,
    closeView,
    openFusion,
    closeFusion,
    version: VERSION,
  };

  setInterval(tick, CFG.pollMs);
  window.addEventListener("load", () => setTimeout(tick, 0));

  console.log(`[memoryGarden_fusion] loaded v${VERSION} (show result modal=ON)`);
})();
