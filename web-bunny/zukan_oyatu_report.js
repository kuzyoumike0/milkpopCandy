// zukan_oyatu_report.js（食レポ図鑑）v1.0.0
// ✅ oyatu:eat イベント（{id}）を拾って回数を保存
// ✅ 右上/メニュー等から呼べる API: WB.zukan.open("oyatu") / window.OYATU_ZUKAN.open()
// ✅ かわいい短文が「回数」に応じて埋まる
//
// LS: milkpop_zukan_oyatu_v1

(() => {
  "use strict";
  if (window.__OYATU_ZUKAN_V100__) return;
  window.__OYATU_ZUKAN_V100__ = true;

  const CFG = {
    LS: "milkpop_zukan_oyatu_v1",
    STYLE_ID: "oyatuZukanStyleV100",
    MODAL_ID: "oyatuZukanModalV100",
    // 図鑑に載せるおやつID（oyatu.js の item.id と一致させる）
    ITEMS: [
      { id: "candy",   name: "キャンディケイン", emoji: "🍭" },
      { id: "wataame", name: "わたあめ",         emoji: "☁️" },
      { id: "cupcake", name: "カップケーキ",     emoji: "🧁" },
      { id: "orange",  name: "オレンジ",         emoji: "🍊" },
    ],
    // “何回で次のコメントが埋まるか”
    MILESTONES: [1, 3, 5, 10, 20, 35, 50],
  };

  const $ = (q, p = document) => p.querySelector(q);

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(CFG.LS) || "null");
      if (!v || typeof v !== "object") return { counts: {}, unlocked: {} };
      return {
        counts: v.counts && typeof v.counts === "object" ? v.counts : {},
        unlocked: v.unlocked && typeof v.unlocked === "object" ? v.unlocked : {},
      };
    } catch {
      return { counts: {}, unlocked: {} };
    }
  }

  function save(state) {
    try { localStorage.setItem(CFG.LS, JSON.stringify(state)); } catch {}
  }

  function incEat(id) {
    if (!id) return;
    const st = load();
    st.counts[id] = Math.max(0, Math.floor(Number(st.counts[id] || 0))) + 1;

    // milestone 到達で “コメント開放”
    const c = st.counts[id];
    for (const m of CFG.MILESTONES) {
      if (c >= m) {
        st.unlocked[`${id}:${m}`] = true;
      }
    }
    save(st);
  }

  // かわいい短文（おやつ別）
  const LINES = {
    candy: [
      { at: 1,  text: "ぺろっ。甘い…！ちょっと強くなる気がする。" },
      { at: 3,  text: "棒の部分も…かじっていい？（ダメ）" },
      { at: 5,  text: "持ち歩きたい。ポケットが欲しい。" },
      { at: 10, text: "舌が赤くなるやつだ！勝ちだ！" },
      { at: 20, text: "わかった。これは“戦闘用おやつ”だ。" },
      { at: 35, text: "一周回って、最初の一口が一番好き。" },
      { at: 50, text: "もう身体の一部。たぶん羽も生える。" },
    ],
    wataame: [
      { at: 1,  text: "ふわ…消えた。…え？今食べた？" },
      { at: 3,  text: "空気がおいしいってこういうこと？" },
      { at: 5,  text: "ほっぺが雲になった。やばい。" },
      { at: 10, text: "噛むと“きゅ”ってなる。かわいい。" },
      { at: 20, text: "ふわふわの神。信仰したい。" },
      { at: 35, text: "食べてる時だけ世界がやさしい。" },
      { at: 50, text: "雲になって浮きたい。浮く。" },
    ],
    cupcake: [
      { at: 1,  text: "上のクリームが主役。知ってる。" },
      { at: 3,  text: "クリーム→スポンジ→クリーム…完璧。" },
      { at: 5,  text: "甘いのに、ちゃんと“ごはん感”がある。" },
      { at: 10, text: "紙のカップ、外すの上手になった。" },
      { at: 20, text: "誕生日じゃなくても祝っていいよね？" },
      { at: 35, text: "一口目に全てが詰まってる。" },
      { at: 50, text: "“牧場のケーキ職人”を名乗る。" },
    ],
    orange: [
      { at: 1,  text: "すっぱい！でも…もう一口いける。" },
      { at: 3,  text: "手がオレンジの匂い。最高。" },
      { at: 5,  text: "皮をむく音が、気持ちいいんだよね。" },
      { at: 10, text: "ビタミンで走る速度が上がった（気がする）。" },
      { at: 20, text: "白い筋も食べる派。えらい。" },
      { at: 35, text: "“冬の太陽”って味がする。" },
      { at: 50, text: "みかんの国の王になる。" },
    ],
  };

  function ensureStyle() {
    if (document.getElementById(CFG.STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = CFG.STYLE_ID;
    st.textContent = `
#${CFG.MODAL_ID}{ position:fixed; inset:0; z-index:2147483647; display:none; }
#${CFG.MODAL_ID} .bg{ position:absolute; inset:0; background:rgba(0,0,0,.38); }
#${CFG.MODAL_ID} .card{
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(660px, 92vw); max-height:min(82vh, 900px);
  background:rgba(255,255,255,.97);
  border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);
  overflow:hidden;
  display:flex; flex-direction:column;
}
#${CFG.MODAL_ID} .head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px 10px; border-bottom:1px solid rgba(0,0,0,.08);
}
#${CFG.MODAL_ID} .title{ font-weight:1000; letter-spacing:.02em; }
#${CFG.MODAL_ID} .close{
  border:none; background:rgba(0,0,0,.06);
  border-radius:12px; padding:8px 12px; font-weight:1000; cursor:pointer;
}
#${CFG.MODAL_ID} .body{ padding:12px 14px 14px; overflow:auto; }
.ozGrid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
.ozCard{
  background:#fff; border-radius:16px; padding:12px;
  border:1px solid rgba(0,0,0,.08);
  box-shadow:0 10px 22px rgba(0,0,0,.06);
}
.ozTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
.ozName{ font-weight:1000; }
.ozCount{ font-weight:1000; opacity:.7; font-size:12px; }
.ozLines{ margin-top:10px; display:flex; flex-direction:column; gap:8px; }
.ozLine{
  border-radius:12px; padding:8px 10px;
  background:rgba(0,0,0,.04);
  font-weight:900; font-size:12px; line-height:1.35;
}
.ozLine.lock{ opacity:.38; filter:blur(.6px); }
.ozHint{ margin-top:12px; font-weight:900; font-size:12px; opacity:.75; }
.ozRow{ display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-top:12px; }
.ozBtn{
  border:none; border-radius:12px;
  padding:10px 12px; font-weight:1000; cursor:pointer;
  background:#fff; box-shadow:0 10px 22px rgba(0,0,0,.10);
}
.ozBtn.primary{ background:#ffd6e7; }
`;
    document.head.appendChild(st);
  }

  function ensureModal() {
    ensureStyle();
    let m = document.getElementById(CFG.MODAL_ID);
    if (m) return m;

    m = document.createElement("div");
    m.id = CFG.MODAL_ID;
    m.innerHTML = `
      <div class="bg"></div>
      <div class="card" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">📖 食レポ図鑑</div>
          <button class="close" type="button">閉じる</button>
        </div>
        <div class="body">
          <div class="ozGrid" data-grid></div>

          <div class="ozRow">
            <button class="ozBtn" type="button" data-reset>食レポを初期化</button>
            <button class="ozBtn primary" type="button" data-close>OK</button>
          </div>

          <div class="ozHint">※ おやつを食べるほど、短文コメントが埋まります。</div>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    m.querySelector(".bg")?.addEventListener("click", () => close());
    m.querySelector(".close")?.addEventListener("click", () => close());
    m.querySelector("[data-close]")?.addEventListener("click", () => close());
    m.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());

    m.querySelector("[data-reset]")?.addEventListener("click", () => {
      if (!confirm("食レポを初期化しますか？")) return;
      try { localStorage.removeItem(CFG.LS); } catch {}
      render();
    });

    return m;
  }

  function render() {
    const st = load();
    const m = ensureModal();
    const grid = m.querySelector("[data-grid]");
    if (!grid) return;
    grid.innerHTML = "";

    for (const it of CFG.ITEMS) {
      const count = Math.max(0, Math.floor(Number(st.counts[it.id] || 0)));

      const card = document.createElement("div");
      card.className = "ozCard";
      const lines = (LINES[it.id] || []).slice();

      const lineHtml = lines.map(line => {
        const key = `${it.id}:${line.at}`;
        const unlocked = !!st.unlocked[key];
        const cls = unlocked ? "ozLine" : "ozLine lock";
        const head = unlocked ? `【${line.at}回】` : `【???】`;
        const body = unlocked ? line.text : "？？？？？？？？？？";
        return `<div class="${cls}"><b>${head}</b> ${body}</div>`;
      }).join("");

      card.innerHTML = `
        <div class="ozTop">
          <div class="ozName">${it.emoji} ${it.name}</div>
          <div class="ozCount">食べた回数：${count}回</div>
        </div>
        <div class="ozLines">${lineHtml}</div>
      `;
      grid.appendChild(card);
    }
  }

  function open() {
    const m = ensureModal();
    m.style.display = "block";
    render();
  }
  function close() {
    const m = document.getElementById(CFG.MODAL_ID);
    if (!m) return;
    m.style.display = "none";
  }

  // ✅ oyatu:eat を拾う（id が必要）
  function hook() {
    const WB = window.WB;
    if (!WB?.on) return;

    if (WB.__oyatuZukanHookedV100) return;
    WB.__oyatuZukanHookedV100 = true;

    WB.on("oyatu:eat", (p) => {
      const id = String(p?.id || "");
      if (!id) return;
      incEat(id);
    });
  }

  // ✅ WB.zukan に合流（既存があれば壊さない）
  function mergeWBApi() {
    const prev = window.WB || {};
    const zukanPrev = (prev.zukan && typeof prev.zukan === "object") ? prev.zukan : {};
    const zukan = Object.assign({}, zukanPrev);

    // open("oyatu") だけ追加（既存の bunny 図鑑などは温存）
    const oldOpen = typeof zukan.open === "function" ? zukan.open.bind(zukan) : null;
    zukan.open = (mode = "oyatu") => {
      const m = String(mode || "oyatu");
      if (m === "oyatu") { open(); return; }
      if (oldOpen) return oldOpen(m);
    };

    window.WB = Object.assign({}, prev, { zukan });
  }

  mergeWBApi();
  hook();

  window.OYATU_ZUKAN = window.OYATU_ZUKAN || {};
  window.OYATU_ZUKAN.open = open;
  window.OYATU_ZUKAN.close = close;

  console.log("[zukan_oyatu_report] ready v1.0.0");
})();
