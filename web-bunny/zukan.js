(() => {
  if (!window.WB) return;
  const WB = window.WB;

  const UNKNOWN_SVG = (() => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">` +
      `<rect width="100%" height="100%" rx="18" ry="18" fill="#f3f3f3"/>` +
      `<text x="50%" y="56%" text-anchor="middle" font-size="52" font-family="system-ui" fill="#b8b8b8">?</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  })();

  const FAREWELL_FLAVOR = {
    normal: [
      { at: 10, text: "何度別れても、その温もりはここに残っている。" },
      { at: 20, text: "別れは慣れない。…それでも歩いていけるようになった。" },
      { at: 50, text: "数えきれない旅立ちの先で、ここはもう“帰る場所”になった。" },
    ],
    reabunny: [
      { at: 10, text: "幻は、指の間から零れる。掴んだと思った瞬間に消えてしまう。" },
      { at: 20, text: "二度と戻らないと知っていても、見送ってしまった自分を責めてしまう。" },
      { at: 50, text: "重ねた別れは祈りになり、祈りは傷になった。…それでも忘れられない。" },
    ],
  };

  function getFarewellFlavor(kind, farewellCount) {
    if (!farewellCount || farewellCount < 10) return "";
    const list = kind === "reabunny" ? FAREWELL_FLAVOR.reabunny : FAREWELL_FLAVOR.normal;
    for (let i = list.length - 1; i >= 0; i--) {
      if (farewellCount >= list[i].at) return list[i].text;
    }
    return "";
  }

  function openDex() {
    let backdrop = document.getElementById("dexBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "dexBackdrop";
      backdrop.className = "modalBackdrop";
      document.body.appendChild(backdrop);
    }

    let modal = document.getElementById("dexModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "dexModal";
      modal.className = "modal";
      backdrop.appendChild(modal);
    }

    const close = () => { try { backdrop.remove(); } catch {} };

    const renderBunnyDex = () => {
      const dex = WB.dex || {};
      const kinds = Object.keys(WB.BUNNY_DEFS);

      const cards = kinds.map(kind => {
        const def = WB.BUNNY_DEFS[kind];
        const entry = dex[kind];
        const known = !!entry?.seen;
        const farewellCount = entry?.farewell ?? 0;

        const img = known ? def.img : UNKNOWN_SVG;
        const name = known ? def.label : "？？？";
        const desc = known ? def.desc : "まだ出会っていません";
        const flavor = known ? getFarewellFlavor(kind, farewellCount) : "";

        return `
          <div class="dexCard ${known ? "" : "unknown"}">
            <img src="${img}" alt="${name}">
            <div class="dexName">${name}</div>
            <div class="dexDesc">${desc}</div>
            <div style="font-size:12px;opacity:.8;margin-top:4px;">旅立ち：${farewellCount} 回</div>
            ${flavor ? `
              <div style="
                margin-top:6px;
                font-size:12px;
                line-height:1.5;
                font-style:italic;
                opacity:.9;
                color:${kind === "reabunny" ? "#5a2a2a" : "#7a5a6e"};
              ">${flavor}</div>
            ` : ""}
          </div>
        `;
      }).join("");

      return `<div class="dexGrid">${cards}</div>`;
    };

    const renderTitleDex = () => {
      const count = Number(WB.goldenUnchiCount || 0);
      const titles = WB.syougou?.GOLDEN_UNCHI_TITLES || [];
      const owned = WB.syougou?.ownedTitles || [];
      const current = WB.syougou?.currentTitle || "";

      const next = titles.slice().sort((a,b)=>a.at-b.at).find(t => count < t.at);

      let progPct = 100;
      let progText = "全解放済み";
      if (next) {
        progPct = Math.max(0, Math.min(100, Math.floor((count / next.at) * 100)));
        progText = `${count} / ${next.at}`;
      }

      const nextLine = next
        ? `次の称号まで：<b>あと ${next.at - count} 回</b>（${next.title}）`
        : `次の称号まで：<b>全解放済み</b>`;

      const equippedLine = current
        ? `現在の称号：<b>${current}</b>`
        : `現在の称号：<b>なし</b>`;

      const headerInfo = `
        <div style="font-size:12px;opacity:.92;line-height:1.7;margin:2px 0 10px;">
          黄金うんち回数：<b>${count} 回</b><br>
          ${nextLine}<br>
          ${equippedLine}
        </div>

        <div class="titleProgress">
          <div class="titleProgressBar">
            <div class="titleProgressFill" style="width:${progPct}%;"></div>
          </div>
          <div class="titleProgressText">${progText}</div>
        </div>
      `;

      const list = titles.map(t => {
        const isOwned = owned.includes(t.title);
        const isEquipped = current === t.title;

        return `
          <div class="titleCard ${isOwned ? "" : "disabled"}">
            <div class="titleName">
              ${t.title}
              ${isEquipped ? `<span class="titleBadge on">装備中</span>` : ""}
              ${isOwned && !isEquipped ? `<span class="titleBadge">解放済</span>` : ""}
              ${!isOwned ? `<span class="titleBadge">未解放</span>` : ""}
            </div>
            <div class="titleReq">条件：黄金うんち ${t.at} 回</div>
            <div style="margin-top:8px;">
              ${
                isOwned
                  ? `<button class="dexTab" data-equip="${t.title}" style="width:100%;background:#fff;box-shadow:0 6px 18px rgba(0,0,0,.10);">
                       ${isEquipped ? "装備中" : "装備する"}
                     </button>`
                  : `<div style="font-size:12px;opacity:.7;">まだ解放されていません</div>`
              }
            </div>
          </div>
        `;
      }).join("");

      return `${headerInfo}<div style="display:grid;gap:12px;">${list}</div>`;
    };

    let tab = "bunny";

    const paint = () => {
      modal.innerHTML = `
        <div class="modalHeader">
          <div class="modalTitle">📖 図鑑</div>
          <button class="modalClose" id="closeDexBtn">×</button>
        </div>

        <div class="dexTabs">
          <button class="dexTab ${tab==="bunny" ? "active" : ""}" id="tabBunny">うさぎ</button>
          <button class="dexTab ${tab==="title" ? "active" : ""}" id="tabTitle">称号</button>
        </div>

        <div id="dexBody">
          ${tab==="bunny" ? renderBunnyDex() : renderTitleDex()}
        </div>
      `;

      modal.querySelector("#closeDexBtn").onclick = close;
      modal.querySelector("#tabBunny").onclick = () => { tab = "bunny"; paint(); };
      modal.querySelector("#tabTitle").onclick = () => { tab = "title"; paint(); };

      modal.querySelectorAll("[data-equip]").forEach(btn => {
        btn.onclick = () => {
          const title = btn.getAttribute("data-equip");
          WB.emit("equipTitleRequested", { title });
          tab = "title";
          paint();
        };
      });
    };

    paint();

    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  }

  // rankBtn で図鑑を開く
  if (WB.rankBtn) {
    WB.rankBtn.addEventListener("click", () => {
      WB.unlockAudioOnce();
      openDex();
    });
  }

  WB.zukan = { openDex };
})();
