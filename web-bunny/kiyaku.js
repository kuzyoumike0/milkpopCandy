// kiyaku.js（非module）— 利用規約モーダル（予約キュー対応で必ず開く）
// ✅ window.KIYAKU.open()/close()/setText()
// ✅ gameMenu.js が先に呼んでも「予約」→ kiyaku.js 読込後に自動で開く
// ✅ 背景クリック / × / Esc で閉じる
// ✅ スクロールOK・超前面

(() => {
  "use strict";
  console.log("[kiyaku.js] LOADED v1.1.0 (queue+guaranteed)", Date.now());

  const UI = {
    modal: "milkpopKiyakuModalV1",
    style: "milkpopKiyakuStyleV1",
    text:  "milkpopKiyakuTextV1",
  };

  // ====== 利用規約本文（ここを編集） ======
  const KIYAKU_TEXT = `
■ 利用規約（Milkpop）

このゲーム（以下「本サービス」）は、ブラウザ上で遊べる娯楽コンテンツです。
本サービスを利用した時点で、本規約に同意したものとみなします。

────────────────────────
1. 禁止事項
────────────────────────
利用者は、以下の行為を行ってはなりません。

(1) 不正ツール・自動化ツール・改変ツール等を用いたプレイ
(2) サービスの不具合・仕様の穴を意図的に悪用する行為
(3) サーバー/通信/データへ過度な負荷を与える行為
(4) 他の利用者や第三者への迷惑行為、誹謗中傷、脅迫
(5) 画像・音声・文章など本サービス内の素材を、権利者の許可なく転載・配布する行為
(6) 法令または公序良俗に反する行為

────────────────────────
2. データ保存について（重要）
────────────────────────
本サービスのセーブデータは、主にブラウザの localStorage に保存されます。

・ブラウザの履歴/サイトデータ削除、端末変更、シークレットモードなどにより、
  進行状況や購入情報が消える場合があります。
・データ消失について運営は責任を負いません。

────────────────────────
3. 免責事項
────────────────────────
・本サービスの内容は予告なく変更、停止、中断されることがあります。
・本サービス利用により利用者に生じたいかなる損害についても、
  運営は責任を負いません（ただし法令で認められる範囲）。
────────────────────────
4. 使用素材
────────────────────────
効果音ラボ様　https://soundeffect-lab.info/
DOVA-SYNDROME様　https://dova-s.jp/
サクソラ様　https://39sora.com/
32°様
────────────────────────
5. お問い合わせ
────────────────────────
X（旧Twitter） @Soni_complaint

※DMやリプライの返信は保証できません。
`.trim();
  // ======================================

  const X_HANDLE = "Soni_complaint";
  const X_URL = `https://x.com/${encodeURIComponent(X_HANDLE)}`;

  const $ = (q, p = document) => p.querySelector(q);

  function ensureStyle() {
    if (document.getElementById(UI.style)) return;
    const s = document.createElement("style");
    s.id = UI.style;
    s.textContent = `
#${UI.modal}{
  position:fixed; inset:0;
  z-index:2147483500;
  display:none;
}
#${UI.modal} .backdrop{
  position:absolute; inset:0;
  background:rgba(0,0,0,.48);
}
#${UI.modal} .card{
  position:absolute;
  left:50%; top:50%;
  transform:translate(-50%,-50%);
  width:min(620px, 92vw);
  max-height:min(74vh, 620px);
  overflow:auto;
  background:rgba(255,255,255,.98);
  border-radius:18px;
  box-shadow:0 22px 70px rgba(0,0,0,.30);
  padding:14px 14px 12px;
  -webkit-overflow-scrolling:touch;
}
#${UI.modal} .row{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
}
#${UI.modal} .ttl{
  font-weight:1000;
  letter-spacing:.02em;
}
#${UI.modal} .close{
  border:none; border-radius:12px;
  width:40px; height:40px;
  font-weight:1000;
  cursor:pointer;
  background:#fff;
  box-shadow:0 10px 24px rgba(0,0,0,.10);
}
#${UI.modal} pre{
  margin:10px 0 0;
  white-space:pre-wrap;
  word-break:break-word;
  font-size:13px;
  line-height:1.6;
  background:rgba(0,0,0,.04);
  border-radius:14px;
  padding:12px;
}
#${UI.modal} .hint{
  margin-top:10px;
  font-size:12px;
  opacity:.78;
}
#${UI.modal} .link{
  font-weight:1000;
  color:#2b6cff;
  text-decoration:none;
}
#${UI.modal} .link:hover{ text-decoration:underline; }
`;
    document.head.appendChild(s);
  }

  function ensureModal() {
    ensureStyle();
    let m = document.getElementById(UI.modal);
    if (m) return m;

    m = document.createElement("div");
    m.id = UI.modal;
    m.innerHTML = `
      <div class="backdrop" data-kiyaku-close="1"></div>
      <div class="card" role="dialog" aria-modal="true" aria-label="利用規約">
        <div class="row">
          <div class="ttl">📜 利用規約</div>
          <button class="close" type="button" data-kiyaku-close="1">×</button>
        </div>

        <pre id="${UI.text}"></pre>

        <div class="hint">
          お問い合わせ：<a class="link" href="${X_URL}" target="_blank" rel="noopener noreferrer">@${X_HANDLE}</a>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const pre = $(`#${UI.text}`, m);
    if (pre) pre.textContent = KIYAKU_TEXT;

    // 背景/× で閉じる
    m.addEventListener("click", (e) => {
      const c = e.target?.closest?.("[data-kiyaku-close]");
      if (c) close();
    });

    // Esc
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    return m;
  }

  function open() {
    const m = ensureModal();
    m.style.display = "block";
  }

  function close() {
    const m = document.getElementById(UI.modal);
    if (m) m.style.display = "none";
  }

  // ✅ 公開API
  window.KIYAKU = window.KIYAKU || {};
  window.KIYAKU.open = open;
  window.KIYAKU.close = close;
  window.KIYAKU.setText = (text) => {
    const m = ensureModal();
    const pre = $(`#${UI.text}`, m);
    if (pre) pre.textContent = String(text ?? "");
  };

  // ✅ 予約キュー（gameMenuが先に呼んでも後から開く）
  // ルール：
  // - gameMenu.js が window.__milkpopOpenModalQueue に {type:"kiyaku"} を積む
  // - kiyaku.js 起動時に吸収して open
  window.__milkpopOpenModalQueue = window.__milkpopOpenModalQueue || [];
  function drainQueue() {
    try {
      const q = window.__milkpopOpenModalQueue;
      if (!Array.isArray(q) || q.length === 0) return;

      let needOpen = false;
      const rest = [];
      for (const item of q) {
        if (item && item.type === "kiyaku") needOpen = true;
        else rest.push(item);
      }
      q.length = 0;
      rest.forEach(x => q.push(x));

      if (needOpen) open();
    } catch {}
  }

  // 初期化（初回遅延防止）
  try { ensureModal(); close(); } catch {}

  // 起動直後に吸収 + 少しだけ監視（ロード順対策）
  drainQueue();
  const start = Date.now();
  const t = setInterval(() => {
    drainQueue();
    if (Date.now() - start > 8000) clearInterval(t);
  }, 100);

  console.log("[kiyaku.js] ready (use KIYAKU.open())");
})();
