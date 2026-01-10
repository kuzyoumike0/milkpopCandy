// gameMenu.js（非module）V2.1
// ✅ 右上にハンバーガーメニュー1個だけ作る
// ✅ メニュー項目：🛒ショップ / 🎀お洒落 / 🧸アイテム配置 / 🎰スロット / 📖図鑑 / 🎵BGM
// ✅ 追加：🐦 X（@Soni_complaint）へのリンク
// ✅ 追加：📜 利用規約（クリックでモーダル表示）
// ✅ 呼び出し：
//   - shop     : WB.shop.open()
//   - isyou    : ISYOU.openModal()
//   - itemplace: ITEMPLACE.open()
//   - slot     : WB.slot.open() / SLOT.open() / #slotBtn click（順で吸収）
//   - zukan    : WB.zukan.open("bunny")
//   - bgm      : WB.bgm.openModal()（✅必ず開く：待機＆予約付き）
// ✅ 外側クリックで閉じる
// ✅ FIX: BGMモーダルが出ない根絶（WB.bgm待機 + openModal予約キュー）

(() => {
  "use strict";

  const UI = {
    btn:   "gameHamburgerV1",
    panel: "gameMenuPanelV1",
    style: "gameMenuStyleV1",

    // ✅ 追加
    tosModal: "milkpopTosModalV1",
    tosStyle: "milkpopTosStyleV1",
  };

  const $ = (q, p = document) => p.querySelector(q);

  /* =========================
   * 利用規約テキスト（ここを好きに編集）
   * ========================= */
  const TOS_TEXT = `
■ 利用規約（Milkpop）
本コンテンツは娯楽目的のミニゲームです。

1. 禁止事項
- 不正ツール・自動化・改変によるプレイ
- サーバーや他ユーザーへ迷惑となる行為
- 画像/音声/データの無断転載は禁止利用

2. 免責
- データ消失（localStorage削除/ブラウザ更新等）により進行状況が失われる場合があります。
- 予告なく仕様変更・停止することがあります。

3. お問い合わせ
X（旧Twitter）: @Soni_complaint
`.trim();

  const X_HANDLE = "Soni_complaint";
  const X_URL = `https://x.com/${encodeURIComponent(X_HANDLE)}`;

  /* =========================
   * Utils
   * ========================= */
  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const s = document.createElement("style");
    s.id = UI.style;
    s.textContent = `
#${UI.btn}{
  position:fixed; top:10px; right:10px;
  z-index:2147483100;
  width:44px; height:44px;
  border:none; border-radius:14px;
  background:rgba(255,255,255,.95);
  box-shadow:0 12px 32px rgba(0,0,0,.18);
  cursor:pointer;
  display:flex; align-items:center; justify-content:center;
}
#${UI.btn} .bars{ width:18px; height:14px; position:relative; }
#${UI.btn} .bars i{
  position:absolute; left:0; right:0; height:2px;
  border-radius:2px; background:#333;
}
#${UI.btn} .bars i:nth-child(1){ top:0; }
#${UI.btn} .bars i:nth-child(2){ top:6px; }
#${UI.btn} .bars i:nth-child(3){ top:12px; }

#${UI.panel}{
  position:fixed; top:62px; right:10px;
  z-index:2147483101;
  width:min(280px, 92vw);
  background:rgba(255,255,255,.98);
  border-radius:16px;
  box-shadow:0 18px 44px rgba(0,0,0,.22);
  padding:10px;
  display:none;
}
#${UI.panel} .ttl{
  font-weight:1000; letter-spacing:.02em;
  padding:6px 8px 10px;
}
#${UI.panel} .list{
  display:flex; flex-direction:column; gap:8px;
}
#${UI.panel} .item{
  border:none; border-radius:14px;
  padding:10px 12px;
  font-weight:1000;
  background:rgba(0,0,0,.04);
  cursor:pointer;
  text-align:left;
}
#${UI.panel} .item:hover{ background:rgba(0,0,0,.06); }
#${UI.panel} .note{
  margin-top:8px;
  font-size:12px;
  opacity:.75;
  padding:6px 8px 2px;
  line-height:1.35;
}
#${UI.panel} .smallrow{
  display:flex; gap:8px; margin-top:8px; padding:0 4px;
}
#${UI.panel} .pill{
  flex:1;
  border:none;
  border-radius:999px;
  padding:8px 10px;
  font-weight:1000;
  cursor:pointer;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.panel} .pill:hover{ transform:translateY(-1px); }
`;
    document.head.appendChild(s);
  }

  function ensureTosStyle() {
    if (document.getElementById(UI.tosStyle)) return;
    const s = document.createElement("style");
    s.id = UI.tosStyle;
    s.textContent = `
#${UI.tosModal}{
  position:fixed; inset:0;
  z-index:2147483200;
  display:none;
}
#${UI.tosModal} .backdrop{
  position:absolute; inset:0;
  background:rgba(0,0,0,.45);
}
#${UI.tosModal} .card{
  position:absolute;
  left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(560px, 92vw);
  max-height:min(70vh, 560px);
  overflow:auto;
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.28);
  padding:14px 14px 12px;
  -webkit-overflow-scrolling:touch;
}
#${UI.tosModal} .row{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
}
#${UI.tosModal} .ttl{
  font-weight:1000;
}
#${UI.tosModal} .close{
  border:none; border-radius:12px;
  width:40px; height:40px;
  font-weight:1000;
  cursor:pointer;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.08);
}
#${UI.tosModal} pre{
  margin:10px 0 0;
  white-space:pre-wrap;
  word-break:break-word;
  font-size:13px;
  line-height:1.55;
  background:rgba(0,0,0,.04);
  border-radius:14px;
  padding:12px;
}
#${UI.tosModal} .hint{
  margin-top:10px;
  font-size:12px;
  opacity:.75;
}
#${UI.tosModal} .link{
  font-weight:1000;
  color:#2b6cff;
  text-decoration:none;
}
`;
    document.head.appendChild(s);
  }

  function ensureTosModal() {
    ensureTosStyle();
    let m = document.getElementById(UI.tosModal);
    if (m) return m;

    m = document.createElement("div");
    m.id = UI.tosModal;
    m.innerHTML = `
      <div class="backdrop" data-close="1"></div>
      <div class="card" role="dialog" aria-modal="true" aria-label="利用規約">
        <div class="row">
          <div class="ttl">📜 利用規約</div>
          <button class="close" type="button" data-close="1">×</button>
        </div>
        <pre id="milkpopTosTextV1"></pre>
        <div class="hint">
          お問い合わせ：<a class="link" href="${X_URL}" target="_blank" rel="noopener noreferrer">@${X_HANDLE}</a>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const pre = m.querySelector("#milkpopTosTextV1");
    if (pre) pre.textContent = TOS_TEXT;

    // close handlers
    m.addEventListener("click", (e) => {
      const c = e.target?.closest?.("[data-close]");
      if (c) hideTos();
    });

    // Escで閉じる
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTos();
    });

    return m;
  }

  function showTos() {
    const m = ensureTosModal();
    m.style.display = "block";
  }
  function hideTos() {
    const m = document.getElementById(UI.tosModal);
    if (m) m.style.display = "none";
  }

  function ensureUI() {
    ensureStyle();

    let btn = document.getElementById(UI.btn);
    let panel = document.getElementById(UI.panel);

    if (!btn) {
      btn = document.createElement("button");
      btn.id = UI.btn;
      btn.type = "button";
      btn.innerHTML = `<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>`;
      btn.title = "メニュー";
      document.body.appendChild(btn);
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.id = UI.panel;
      panel.innerHTML = `
        <div class="ttl">🐰 Milkpop メニュー</div>
        <div class="list">
          <button class="item" type="button" data-act="shop">🛒 ショップ</button>
          <button class="item" type="button" data-act="isyou">🎀 お洒落</button>
          <button class="item" type="button" data-act="itemplace">🧸 アイテム配置</button>
          <button class="item" type="button" data-act="slot">🎰 スロット</button>
          <button class="item" type="button" data-act="zukan">📖 図鑑</button>
          <button class="item" type="button" data-act="bgm">🎵 BGM</button>
        </div>

        <!-- ✅ 追加：Xリンク / 利用規約 -->
        <div class="smallrow">
          <button class="pill" type="button" data-act="xlink">X（@${X_HANDLE}）</button>
          <button class="pill" type="button" data-act="tos">利用規約</button>
        </div>

        <div class="note">
          ※ BGMは一度クリックが必要です。<br>
          ※ アイテム配置：選んだアイテムが透明赤枠で出ます → 置きたい場所をクリックで確定。<br>
          ※ スロット：コイン消費に注意。
        </div>
      `;
      document.body.appendChild(panel);
    }

    return { btn, panel };
  }

  function closePanel(panel) { panel.style.display = "none"; }
  function togglePanel(panel) {
    panel.style.display = (panel.style.display === "block") ? "none" : "block";
  }

  function safeCall(fn, retryMs = 140) {
    try { fn(); return; } catch {}
    setTimeout(() => { try { fn(); } catch {} }, retryMs);
  }

  /* =========================
   * Slot best effort
   * ========================= */
  function openSlotBestEffort() {
    try { if (window.WB?.slot?.open) { window.WB.slot.open(); return true; } } catch {}
    try { if (window.SLOT?.open) { window.SLOT.open(); return true; } } catch {}

    const btn = document.getElementById("slotBtn");
    if (btn) {
      try { btn.click(); return true; } catch {}
      try {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      } catch {}
    }

    try { if (window.WB?.openSlot) { window.WB.openSlot(); return true; } } catch {}
    return false;
  }

  /* =========================
   * ✅ BGM open (WAIT + QUEUE)
   * ========================= */
  // BGM.js がまだ読み込まれてない/patch前でも「開いて欲しい」を予約できる
  window.__milkpopOpenModalQueue = window.__milkpopOpenModalQueue || [];

  function queueOpenBgmModal() {
    try {
      window.__milkpopOpenModalQueue.push({ type: "bgm", at: Date.now() });
    } catch {}
  }

  async function waitForBgmOpenModal(maxMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (window.WB?.bgm?.openModal) return true;
      await new Promise(r => setTimeout(r, 50));
    }
    return false;
  }

  async function openBgmModalGuaranteed() {
    // まずは予約（BGM.js側が吸収できるように）
    queueOpenBgmModal();

    // ユーザー操作中に unlock を踏む（SE/BGM両対応）
    try { window.WB?.unlockAudioOnce?.(); } catch {}

    // すでにあるなら即開く
    try {
      if (window.WB?.bgm?.openModal) { window.WB.bgm.openModal(); return true; }
    } catch {}

    // ないなら待つ（ロード順対策）
    const ok = await waitForBgmOpenModal(8000);
    if (ok) {
      try { window.WB.bgm.openModal(); return true; } catch {}
    }

    // それでも無理なら「BGM.jsが未読込」なのでここで終わり（黙殺しない）
    console.warn("[gameMenu] BGM modal not ready: BGM.js not loaded or WB.bgm not patched");
    return false;
  }

  /* =========================
   * Action handler
   * ========================= */
  function handleAction(act) {
    if (act === "shop") {
      safeCall(() => window.WB?.shop?.open?.());
      return;
    }
    if (act === "isyou") {
      safeCall(() => window.ISYOU?.openModal?.());
      return;
    }
    if (act === "itemplace") {
      safeCall(() => window.ITEMPLACE?.open?.());

      setTimeout(() => {
        if (window.ITEMPLACE?.open) return;
        try { window.ITEMPLACE?.openModal?.(); } catch {}
      }, 0);

      setTimeout(() => {
        try { window.WB?.itemplace?.open?.(); } catch {}
        try { window.WB?.itemplace?.openModal?.(); } catch {}
      }, 0);
      return;
    }
    if (act === "slot") {
      safeCall(() => openSlotBestEffort());
      setTimeout(() => { openSlotBestEffort(); }, 120);
      return;
    }
    if (act === "zukan") {
      safeCall(() => window.WB?.zukan?.open?.("bunny"));
      return;
    }
    if (act === "bgm") {
      // ✅ ここが本命：必ず openModal を開く（待機＆予約）
      openBgmModalGuaranteed();
      return;
    }

    // ✅ 追加：Xリンク
    if (act === "xlink") {
      try { window.open(X_URL, "_blank", "noopener,noreferrer"); } catch {}
      return;
    }

    // ✅ 追加：利用規約
    if (act === "tos") {
      showTos();
      return;
    }
  }

  /* =========================
   * Boot
   * ========================= */
  function boot() {
    const { btn, panel } = ensureUI();

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(panel);
    });

    panel.addEventListener("click", (e) => {
      const b = e.target?.closest?.("[data-act]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();

      const act = b.getAttribute("data-act");

      // ✅ 利用規約はメニュー閉じてもOK（見やすい）
      closePanel(panel);
      handleAction(act);
    });

    document.addEventListener("pointerdown", (e) => {
      if (panel.style.display !== "block") return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel(panel);
    }, { passive: true });

    // ✅ 利用規約モーダルを先に生成しておく（初回クリックで一瞬遅れるの防止）
    ensureTosModal();
    hideTos();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
