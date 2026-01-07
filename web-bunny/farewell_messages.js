// farewell_messages.js
// 旅立ちメッセージ（通常＋レア）
// - WB.showFarewellMessage(kind) を提供
// - WB.recordFarewell(kind) があれば、そこでカウント記録（図鑑/称号の加算は recordFarewell 側で呼ぶのがオススメ）
// - ふわっと表示（CSS込み）
// - レアセリフ：通常2% / reabunny 5%（調整可）

(() => {
  if (!window.WB) return;
  const WB = window.WB;

  /* =========================
   * 設定
   * ========================= */
  const RARE_RATE_DEFAULT = 0.02; // 2%
  const RARE_RATE_REA     = 0.05; // reabunnyだけ 5%

  // 表示時間（ms）
  const HOLD_NORMAL = 4200;
  const HOLD_RARE   = 5200;

  /* =========================
   * メッセージ集
   * ========================= */
  const MSG = {
    bunny1: {
      normal: [
        "またね。ここで過ごした日々は、ちゃんと宝物だったよ。",
        "旅立ちは終わりじゃない。…次の場所で、きっと笑える。",
        "小さな足音が遠ざかる。牧場は少しだけ静かになる。",
      ],
      rare: [
        "「ありがとう」って、聞こえた気がした。…気のせいじゃない。",
        "振り返らないまま、でも確かに優しく、背中で手を振った。",
        "コインより重いものを、置いていった気がした。",
      ],
    },

    bunny3: {
      normal: [
        "堅実に積み上げた日々は、どこへ行っても強い。",
        "安定は、静かな勇気だ。次の空へ行こう。",
        "きちんと整えた歩幅で、迷わず旅立っていった。",
      ],
      rare: [
        "「これで大丈夫」— そう言って、先に光へ溶けた。",
        "最期まで落ち着いていた。…だから余計に胸に残る。",
      ],
    },

    bunny4: {
      normal: [
        "派手に稼いだ夜も、静かな朝も。全部、ここにあった。",
        "大きな背中が、ふっと軽くなって風に消えた。",
        "眩しいほどの足跡を残して、次の舞台へ。",
      ],
      rare: [
        "空気が一瞬きらめいた。…別れに、祝福が混ざっていた。",
        "最後に置いていったのはコインじゃない。温度だった。",
      ],
    },

    bunny5: {
      normal: [
        "最上級の誇りは、去り際にも宿る。",
        "圧倒的だった。だから、空いた場所が広く感じる。",
        "牧場の王者は、王者のまま旅に出る。",
      ],
      rare: [
        "風が止まった。時間だけが、置き去りになった。",
        "「これでいい」— その一言が、胸の奥に刺さった。",
      ],
    },

    reabunny: {
      normal: [
        "幻は、掴めた瞬間から消えていく。…分かっていたのに。",
        "奇跡は永遠じゃない。だから、今が眩しい。",
        "会えたこと自体が贈り物。…でも、贈り物は去っていく。",
      ],
      // ★別れが重い（レア）
      rare: [
        "君が居た証拠を、何度数えても足りない。…行かないで。",
        "心の奥が、ぽっかり音を立てて欠けた。取り返しがつかない。",
        "「次はいつ？」って聞けないのが、いちばん痛い。",
        "手を伸ばした先に、もう触れられるものが無かった。",
      ],
    },

    // もし babybunny 等があるならここに足せる
    babybunny: {
      normal: [
        "まだ小さな旅立ち。…またどこかで会える気がする。",
        "転んでも立ち上がる。その強さだけを残していった。",
      ],
      rare: [
        "最後に、ちいさく跳ねた。…それだけで泣きそうになった。",
      ],
    },
  };

  // 不明kindのフォールバック
  const FALLBACK = {
    normal: [
      "旅立ちは、静かにやってくる。",
      "ありがとう。…またどこかで。",
    ],
    rare: [
      "別れは慣れない。慣れたくもない。",
    ],
  };

  function pick(arr) {
    if (!arr || !arr.length) return "";
    return arr[(Math.random() * arr.length) | 0];
  }

  function isRare(kind) {
    const r = (kind === "reabunny") ? RARE_RATE_REA : RARE_RATE_DEFAULT;
    return Math.random() < r;
  }

  /* =========================
   * 表示（ふわっと）
   * ========================= */
  function ensureStyle() {
    if (document.getElementById("wbFarewellMsgStyleV1")) return;
    const s = document.createElement("style");
    s.id = "wbFarewellMsgStyleV1";
    s.textContent = `
.wbFarewellMsg{
  position: fixed;
  left: 50%;
  top: 18%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  width: min(720px, 92vw);
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 18px 60px rgba(0,0,0,.20);
  font-weight: 900;
  line-height: 1.45;
  white-space: pre-line;
  opacity: 0;
  animation: wbMsgIn .24s ease-out forwards;
}
.wbFarewellMsg .small{
  display:block;
  margin-top: 6px;
  font-size: 12px;
  opacity: .75;
  font-weight: 900;
}
.wbFarewellMsg.rare{
  box-shadow: 0 22px 70px rgba(0,0,0,.24);
}
@keyframes wbMsgIn{
  from { opacity: 0; transform: translate(-50%, -70%); filter: blur(1px); }
  to   { opacity: 1; transform: translate(-50%, -50%); filter: blur(0); }
}
.wbFarewellMsg.out{
  transition: opacity 520ms ease, transform 520ms ease, filter 520ms ease;
  opacity: 0;
  transform: translate(-50%, -35%);
  filter: blur(1px);
}
`;
    document.head.appendChild(s);
  }

  function showFarewellToast(text, opt = {}) {
    ensureStyle();

    const rare = !!opt.rare;
    const hold = opt.holdMs ?? (rare ? HOLD_RARE : HOLD_NORMAL);
    const kind = opt.kind ? String(opt.kind) : "";

    // 既存があれば消してから
    document.querySelectorAll(".wbFarewellMsg").forEach((n) => {
      try { n.remove(); } catch {}
    });

    const el = document.createElement("div");
    el.className = "wbFarewellMsg" + (rare ? " rare" : "");
    el.textContent = text;

    // 下に小さく種類表示（要らなければ消してOK）
    const sub = document.createElement("span");
    sub.className = "small";
    sub.textContent = kind ? `— ${kind}` : "";
    el.appendChild(sub);

    document.body.appendChild(el);

    setTimeout(() => el.classList.add("out"), Math.max(0, hold - 520));
    setTimeout(() => { try { el.remove(); } catch {} }, hold + 120);
  }

  /* =========================
   * 公開API
   * ========================= */
  function showFarewellMessage(kind) {
    const k = String(kind || "");
    const pack = MSG[k] || FALLBACK;

    const rare = isRare(k);
    const line = rare ? pick(pack.rare) : pick(pack.normal);

    const prefix = rare ? "🕊️✨" : "🕊️";
    showFarewellToast(`${prefix} ${line}`, { rare, kind: k });
  }

  // すでに app.js で定義済みなら上書きしない（上書きしたい場合はこのifを外してOK）
  if (typeof WB.showFarewellMessage !== "function") {
    WB.showFarewellMessage = showFarewellMessage;
  }

  // 外にも出しておく
  WB.farewellMsg = {
    showFarewellMessage,
    MSG,
    rates: { default: RARE_RATE_DEFAULT, reabunny: RARE_RATE_REA },
  };
})();
