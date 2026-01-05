const DEPART_MESSAGES = [
  "ありがとう…",
  "またね…",
  "いってきます…",
  "だいすき…",
  "たのしかった…",
  "ばいばい…",
  "げんきでね…",
];

const DEPART_RARE_MESSAGES = [
  "伝説になるね…✨",
  "星になって見守るよ…🌟",
  "また会おうね、約束…💛",
  "この牧場、最高だった…👑",
  "…君のコインは輝いてる…✨",
];

// レア確率（例：3%）
const DEPART_RARE_CHANCE = 0.03;

function pickDepartMessageObj() {
  const rare = Math.random() < DEPART_RARE_CHANCE;
  const arr = rare ? DEPART_RARE_MESSAGES : DEPART_MESSAGES;
  const text = arr[Math.floor(Math.random() * arr.length)];
  return { text, rare };
}
