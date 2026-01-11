// memoryGarden_fusion.js（V1.0 - 記憶の合成：2つの記憶 → 1つの短編 / 高コスト）
//
// ✅ memoryGarden.js を改造せず「後付けパッチ」で実装
// ✅ 記憶カードに「🧵 合成に使う」ボタンを追加（2つ選択）
// ✅ 高コストコインで合成（不足なら中断）
// ✅ 合成結果は新しい記憶として保存（emotion="tsumugi"）
// ✅ 合成後：単体表示（MG API があれば）
// ✅ emit("memoryGarden:updated") で図鑑/庭UIが更新される
//
// 読み込み順：memoryGarden.js の後

(() => {
  "use strict";
  if (window.__MEMORY_GARDEN_FUSION_V1__) return;
  window.__MEMORY_GARDEN_FUSION_V1__ = true;

  const VERSION = "1.0";

  const CFG = {
    pollMs: 700,

    // ✅ 高コスト（ここを好みに合わせて上げてOK）
    costCoin: 25000,

    // 連打ガード
    minActIntervalMs: 450,
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

  /* =========================
   * Coins (best effort)
   * ========================= */
  function getCoins() {
    const WB = window.WB;
    try { if (typeof WB?.getCoin === "function") return Number(WB.getCoin()) || 0; } catch {}
    try { if (typeof WB?.coins === "number") return Number(WB.coins) || 0; } catch {}
    // HUD fallback
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

    // 最優先API
    try {
      if (typeof WB?.spendCoin === "function") return !!WB.spendCoin(amount);
    } catch {}

    // 直接減算（WB.coins）
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
   * Toast (simple)
   * ========================= */
  function toast(msg) {
    msg = String(msg || "");
    if (!msg) return;

    // 既存トーストが使えたらそれ優先
    try { if (window.WB?.toast) return window.WB.toast(msg); } catch {}
    try { if (window.ZISSEKI?.toast) return window.ZISSEKI.toast(msg); } catch {}

    // fallback
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

  function playSE() {
    const mg = getMG();
    safe(() => mg?.playMessageSE?.());
  }

  /* =========================
   * Fusion UI
   * ========================= */
  const UI = {
    panel: "mgFusionPanelV1",
    style: "mgFusionStyleV1",
  };

  let lastActAt = 0;
  let pickA = null; // mem object
  let pickB = null; // mem object

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
  flex:1;
  min-width:260px;
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
   * Pick from memory cards
   * ========================= */
  function findMemoryCardsInGardenPanel() {
    const panel = document.getElementById("mgPanelV1");
    if (!panel || panel.style.display !== "block") return [];
    const body = panel.querySelector(".body");
    if (!body) return [];
    return $$(`.mem[data-memid]`, body);
  }

  function ensureFusionButtonOnCard(card) {
    if (!card) return false;
    if (card.querySelector('[data-act="fusionPick"]')) return true;

    // btnRowがあればそこへ、なければ作る
    let row = card.querySelector(".btnRow");
    if (!row) {
      row = document.createElement("div");
      row.className = "btnRow";
      row.style.cssText = "display:flex; gap:10px; margin-top:8px; align-items:center;";
      card.appendChild(row);
    }

    // 既存の「単体で読む」ボタンがあるならその隣に挿す
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

      const id = card.getAttribute("data-memid");
      const store = getStore();
      if (!id || !store) return;

      const mem = (store.memories || []).find(m => m && m.id === id);
      if (!mem) return;

      // 同じのを2回選べない
      if (pickA?.id === mem.id || pickB?.id === mem.id) {
        toast("同じ記憶は2回使えないよ");
        return;
      }

      // 1つ目 → 2つ目
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

      // 3回目以降は押したやつをBとして差し替え
      pickB = mem;
      playSE();
      toast("2つ目を入れ替えた");
      openFusion();
    });

    // rowの先頭に追加（邪魔なら末尾に変更OK）
    row.insertBefore(btn, row.firstChild);
    return true;
  }

  /* =========================
   * Generate fused short story (3 lines)
   * ========================= */
  function get3Lines(text) {
    const lines = String(text || "").split("\n").map(x => x.trim()).filter(Boolean);
    while (lines.length < 3) lines.push("……");
    return lines.slice(0, 3);
  }

  function fuseText(a, b) {
    const [a1, a2, a3] = get3Lines(a?.text);
    const [b1, b2, b3] = get3Lines(b?.text);

    // “高コスト”感＝少し儀式っぽい接続詞
    const c1 = "ほどいて、結ぶ。";
    const c2 = "二つぶんの静けさが、ひとつの灯りになる。";
    const c3 = "新しい名前で、明日へ置いていく。";

    // 3行に収める（混ぜ方は読みやすさ優先）
    // 1行目：A1 + 儀式
    // 2行目：A2/B2 を融合
    // 3行目：B3 + 余韻
    const line1 = `${a1} ${c1}`;
    const line2 = `${a2} / ${b2}`;
    const line3 = `${b3} ${c3}`;

    // 念のため長すぎる場合に少し切る（極端な長文対策）
    return [line1, line2, line3].map(s => s.length > 90 ? s.slice(0, 90) + "…" : s).join("\n");
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

    // コストチェック
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

    const text = fuseText(pickA, pickB);
    const memObj = {
      id: uid("mem"),
      emotion: "tsumugi",
      text,
      date: safe(() => mg?.store ? (new Date(), null) : null) ? "" : "", // unused; set below
      bornAt: Date.now(),
      doneAt: Date.now(),
      // 栞パッチがあるなら fav にも対応
      fav: false,

      // 合成元
      fusedFrom: [pickA.id, pickB.id],
    };

    // 日付は MG の形式に合わせる
    memObj.date = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    })();

    // 先頭へ追加
    store.memories = store.memories || [];
    store.memories.unshift(memObj);

    // 選択をリセット（気持ちいい）
    pickA = null;
    pickB = null;

    // 更新通知
    safe(() => window.WB?.emit?.("memoryGarden:updated", { fusion: true }));
    toast("🧵 記憶を紡いだ（新しい短編が残った）");

    // 単体表示（MGがあれば）
    safe(() => mg?.showById?.(memObj.id));

    // 合成パネル更新
    openFusion();
  }

  /* =========================
   * Optional: show emotion label nicer
   * ========================= */
  function patchTsUmugiLabel() {
    // memoryGarden.js 側の EMO マップには触れないので、表示自体は "tsumugi" のままでもOK。
    // ただ、図鑑等で見やすくしたい場合に備えて、store内に簡易ラベルを置く。
    const store = getStore();
    if (!store) return;
    store.__fusionLabel = store.__fusionLabel || { tsumugi: "🧵 つむぎ" };
  }

  /* =========================
   * Main loop
   * ========================= */
  function tick() {
    const mg = getMG();
    const store = getStore();
    if (!mg || !store) return;

    patchTsUmugiLabel();

    // 記憶の庭パネルの記憶カードへボタン後付け
    const cards = findMemoryCardsInGardenPanel();
    cards.forEach(ensureFusionButtonOnCard);
  }

  setInterval(tick, CFG.pollMs);
  window.addEventListener("load", () => setTimeout(tick, 0));

  console.log(`[memoryGarden_fusion] loaded v${VERSION}`);
})();
