// zisseki.js（実績システム：図鑑と完全分離版 / ✅WB待機 + ✅実績UI + ✅フレーバーテキスト）
// - localStorage 永続化（実績専用LSのみ）
// - 図鑑(zukan)には一切入れない（LS.dex等に触れない）
// - WB events が無くても定期チェックで解除（コイン/同時うさぎ等）
// - sy:add が来たら即チェック（hanabi/slot/旅立ち/お迎え/うんち等）
//
// ✅ 追加: 実績ごとにフレーバーテキスト
//   - 解除時トーストに表示
//   - UIでも解除済みは表示 / 未解除は伏せる
//
// ✅ 注意: 旅立ち/花火/スロット等の回数は “称号(SYOUGOU)” から読む仕様のまま。
//   - SYOUGOU が無い環境だと、その系統の進捗は 0 になる（コイン・同時うさぎなどは解除可能）

(() => {
  "use strict";

  /* =========================
   * Wait for WB
   * ========================= */
  const WAIT_MS = 12000;
  const TICK_MS = 50;

  function waitForWB() {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (window.WB && typeof window.WB === "object") {
          clearInterval(t);
          resolve(window.WB);
          return;
        }
        if (Date.now() - start > WAIT_MS) {
          clearInterval(t);
          reject(new Error("WB not found"));
        }
      }, TICK_MS);
    });
  }

  /* =========================
   * Main
   * ========================= */
  waitForWB().then((WB) => {
    // ✅ 実績専用LS（図鑑には触れない）
    const LS_ACH = "wb_ach_v5"; // ← v5: flavor 対応版

    // 同時うさぎ数でショップ解放（実績としても扱う）
    const UNLOCK_BUNNY4_NEED = 10;

    /* =========================
     * Storage
     * ========================= */
    function loadAch() {
      try {
        const a = JSON.parse(localStorage.getItem(LS_ACH) || "{}");
        return a && typeof a === "object" ? a : {};
      } catch {
        return {};
      }
    }
    function saveAch() {
      localStorage.setItem(LS_ACH, JSON.stringify(ach));
    }

    const ach = loadAch();

    function isUnlocked(id) {
      return !!ach[id];
    }

    /* =========================
     * Toast
     * ========================= */
    function ensureToastStyle() {
      if (document.getElementById("wbAchToastStyleV2")) return;
      const s = document.createElement("style");
      s.id = "wbAchToastStyleV2";
      s.textContent = `
.wbAchToast{
  position: fixed;
  left: 50%;
  top: 16%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: rgba(255,255,255,.97);
  border-radius: 18px;
  padding: 12px 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,.20);
  opacity: 0;
  animation: wbAchIn .22s ease-out forwards, wbAchOut .36s ease-in forwards;
  animation-delay: 0ms, 2.9s;
  max-width: min(640px, 92vw);
}
.wbAchToast .t1{
  font-weight: 1000;
  line-height: 1.25;
}
.wbAchToast .t2{
  margin-top: 6px;
  font-weight: 900;
  font-size: 12px;
  opacity: .82;
  line-height: 1.35;
}
@keyframes wbAchIn{
  from { opacity: 0; transform: translate(-50%, -70%); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes wbAchOut{
  from { opacity: 1; transform: translate(-50%, -50%); }
  to   { opacity: 0; transform: translate(-50%, -35%); }
}
`;
      document.head.appendChild(s);
    }

    function toast(title, flavor = "") {
      ensureToastStyle();
      const t1 = String(title ?? "").trim();
      const t2 = String(flavor ?? "").trim();
      if (!t1) return;

      const el = document.createElement("div");
      el.className = "wbAchToast";
      el.innerHTML = `
        <div class="t1">${escapeHtml(t1)}</div>
        ${t2 ? `<div class="t2">${escapeHtml(t2)}</div>` : ""}
      `;
      document.body.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, 3800);
    }

    function escapeHtml(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    /* =========================
     * Helpers (WB互換)
     * ========================= */
    function getCoins() {
      try {
        if (typeof WB.getCoin === "function") return Number(WB.getCoin()) || 0;
      } catch {}
      try {
        if (typeof WB.coins === "number") return WB.coins;
      } catch {}
      const el = document.getElementById("coinValue");
      return el ? (Number(el.textContent) || 0) : 0;
    }

    function getBunnyCount() {
      try {
        if (typeof WB.getBunnies === "function") {
          const arr = WB.getBunnies();
          return Array.isArray(arr) ? arr.length : 0;
        }
      } catch {}
      try {
        if (Array.isArray(WB.bunnies)) return WB.bunnies.length;
      } catch {}
      return 0;
    }

    // ✅ “称号カウント”は SYOUGOU から読む（図鑑ではなく称号）
    function getSyougouCount(key) {
      try {
        return Number(window.SYOUGOU?.getCount?.(key) ?? 0) || 0;
      } catch {
        return 0;
      }
    }

    function getStatMaybe(keys) {
      for (const k of keys) {
        try {
          const v = WB?.[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
        } catch {}
        try {
          const v2 = WB?.stats?.[k];
          if (typeof v2 === "number" && Number.isFinite(v2)) return v2;
        } catch {}
      }
      return 0;
    }

    /* =========================
     * ✅ sy:add を受けたら即チェック（花火等がWBに直接出ない環境向け）
     * ========================= */
    let __lastSyPing = 0;
    function onSyAdd() {
      const now = Date.now();
      if (now - __lastSyPing < 120) return; // 連打で重いのを避ける
      __lastSyPing = now;
      checkUnlocks();
      refreshUI();
    }
    try { WB.on?.("sy:add", onSyAdd); } catch {}

    /* =========================
     * Achievements Master（✅flavor を追加）
     * ========================= */
    const ACH_MASTER = [
      {
        id: "unlock_bunny4",
        name: "大家族のはじまり",
        desc: `同時うさぎ数が${UNLOCK_BUNNY4_NEED}匹に到達（bunny4/bunny5解放）`,
        flavor: "牧場が“にぎやか”という言葉では足りなくなってきた。",
        check: () => (getBunnyCount() >= UNLOCK_BUNNY4_NEED),
        progress: () => ({ now: getBunnyCount(), target: UNLOCK_BUNNY4_NEED, unit: "匹" }),
        onUnlock: () => {
          toast("🐰✨ bunny4 / bunny5 がショップに出現しました！", "新しい風が、牧場の空気を変える。");
          try { WB.emit?.("unlockShop", { id: "unlock_bunny4" }); } catch {}
        },
      },

      { id: "coins_10k",  name: "小金持ち",   desc: "所持コイン 10,000 到達",
        flavor: "チャリン…が、少し誇らしく聞こえる。",
        check: () => getCoins() >= 10_000,
        progress: () => ({ now: getCoins(), target: 10_000, unit: "🪙" })
      },
      { id: "coins_100k", name: "資産家",     desc: "所持コイン 100,000 到達",
        flavor: "牧場の運命が、“数字”で見えるようになった。",
        check: () => getCoins() >= 100_000,
        progress: () => ({ now: getCoins(), target: 100_000, unit: "🪙" })
      },
      { id: "coins_1m",   name: "伝説の富豪", desc: "所持コイン 1,000,000 到達",
        flavor: "もう、夢を現実って呼んでいい。",
        check: () => getCoins() >= 1_000_000,
        progress: () => ({ now: getCoins(), target: 1_000_000, unit: "🪙" })
      },

      { id: "unchi_10",  name: "ウンチ道・初段", desc: "ウンチ回数 10",
        flavor: "誇り高く、堂々と、今日も置いていく。",
        check: () => getSyougouCount("unchi") >= 10,
        progress: () => ({ now: getSyougouCount("unchi"), target: 10, unit: "回" })
      },
      { id: "unchi_50",  name: "ウンチ道・五段", desc: "ウンチ回数 50",
        flavor: "積み重ねは、時に香りも積み重なる。",
        check: () => getSyougouCount("unchi") >= 50,
        progress: () => ({ now: getSyougouCount("unchi"), target: 50, unit: "回" })
      },
      { id: "unchi_100", name: "ウンチ道・皆伝", desc: "ウンチ回数 100",
        flavor: "もはや芸術。もはや様式美。",
        check: () => getSyougouCount("unchi") >= 100,
        progress: () => ({ now: getSyougouCount("unchi"), target: 100, unit: "回" })
      },

      { id: "tabidachi_10",  name: "見送り見習い", desc: "旅立ち回数 10",
        flavor: "手を振る回数だけ、優しくなれる気がした。",
        check: () => getSyougouCount("tabidachi") >= 10,
        progress: () => ({ now: getSyougouCount("tabidachi"), target: 10, unit: "回" })
      },
      { id: "tabidachi_50",  name: "見送り職人",   desc: "旅立ち回数 50",
        flavor: "別れに慣れるんじゃない。上手に抱えるだけ。",
        check: () => getSyougouCount("tabidachi") >= 50,
        progress: () => ({ now: getSyougouCount("tabidachi"), target: 50, unit: "回" })
      },
      { id: "tabidachi_100", name: "見送り神",     desc: "旅立ち回数 100",
        flavor: "行ってらっしゃい、の言葉に“祈り”が混ざる。",
        check: () => getSyougouCount("tabidachi") >= 100,
        progress: () => ({ now: getSyougouCount("tabidachi"), target: 100, unit: "回" })
      },

      { id: "hanabi_10",  name: "一発屋",       desc: "花火回数 10",
        flavor: "夜空に、理由のない拍手が起こった。",
        check: () => getSyougouCount("hanabi") >= 10,
        progress: () => ({ now: getSyougouCount("hanabi"), target: 10, unit: "回" })
      },
      { id: "hanabi_50",  name: "夜空の演出家", desc: "花火回数 50",
        flavor: "静けさの上に、光を置く仕事。",
        check: () => getSyougouCount("hanabi") >= 50,
        progress: () => ({ now: getSyougouCount("hanabi"), target: 50, unit: "回" })
      },
      { id: "hanabi_100", name: "天上の花火師", desc: "花火回数 100",
        flavor: "星が嫉妬するほど、上手に鳴らせるようになった。",
        check: () => getSyougouCount("hanabi") >= 100,
        progress: () => ({ now: getSyougouCount("hanabi"), target: 100, unit: "回" })
      },

      { id: "slotwin_10",  name: "当たり癖",         desc: "スロット当たり回数 10",
        flavor: "たまたま、が続くと運命に見える。",
        check: () => getSyougouCount("slot_win") >= 10,
        progress: () => ({ now: getSyougouCount("slot_win"), target: 10, unit: "回" })
      },
      { id: "slotwin_50",  name: "勝ち筋が見える",   desc: "スロット当たり回数 50",
        flavor: "当たる瞬間の気配が、指先で分かる。",
        check: () => getSyougouCount("slot_win") >= 50,
        progress: () => ({ now: getSyougouCount("slot_win"), target: 50, unit: "回" })
      },
      { id: "slotwin_100", name: "スロットの申し子", desc: "スロット当たり回数 100",
        flavor: "確率が、あなたの味方をしている。",
        check: () => getSyougouCount("slot_win") >= 100,
        progress: () => ({ now: getSyougouCount("slot_win"), target: 100, unit: "回" })
      },

      { id: "omukae_10",  name: "お迎え係",   desc: "お迎え回数 10",
        flavor: "扉の向こうは、いつだって新しい物語。",
        check: () => getSyougouCount("omukae") >= 10,
        progress: () => ({ now: getSyougouCount("omukae"), target: 10, unit: "回" })
      },
      { id: "omukae_50",  name: "案内人",     desc: "お迎え回数 50",
        flavor: "迷子にならないように、灯りを持って待っていた。",
        check: () => getSyougouCount("omukae") >= 50,
        progress: () => ({ now: getSyougouCount("omukae"), target: 50, unit: "回" })
      },
      { id: "omukae_100", name: "冥府の執事", desc: "お迎え回数 100",
        flavor: "“ようこそ”は、何度言っても温かい。",
        check: () => getSyougouCount("omukae") >= 100,
        progress: () => ({ now: getSyougouCount("omukae"), target: 100, unit: "回" })
      },

      { id: "buy_10",  name: "多頭飼いデビュー", desc: "累計うさぎ購入 10",
        flavor: "気づいたら、名前を呼ぶ回数が増えていた。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 10,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 10, unit: "匹" })
      },
      { id: "buy_50",  name: "牧場主",           desc: "累計うさぎ購入 50",
        flavor: "ここはもう、“居場所”だ。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 50,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 50, unit: "匹" })
      },
      { id: "buy_100", name: "超・牧場主",       desc: "累計うさぎ購入 100",
        flavor: "牧場が、あなたの呼吸と同じ速度で生きている。",
        check: () => getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]) >= 100,
        progress: () => ({ now: getStatMaybe(["totalBunnyBought", "bunnyBought", "boughtBunnies"]), target: 100, unit: "匹" })
      },
    ];

    function getAchById(id) {
      return ACH_MASTER.find(a => a.id === id) || null;
    }

    function unlock(id, meta = {}) {
      if (ach[id]) return false;
      ach[id] = true;
      saveAch();

      const a = getAchById(id);
      const title = `🏆 実績解除：${a?.name || meta?.name || id}`;
      const flavor = (a?.flavor || meta?.flavor || "").trim();
      toast(title, flavor);

      try { WB.emit?.("achievementUnlocked", { id, ...meta, flavor }); } catch {}
      refreshUI();
      return true;
    }

    /* =========================
     * Unlock check
     * ========================= */
    function checkUnlocks() {
      for (const a of ACH_MASTER) {
        if (isUnlocked(a.id)) continue;
        let ok = false;
        try { ok = !!a.check?.(); } catch { ok = false; }
        if (!ok) continue;

        const newly = unlock(a.id, { name: a.name, desc: a.desc, flavor: a.flavor });
        if (newly) {
          try { a.onUnlock?.(); } catch {}
        }
      }
    }

    /* =========================
     * Ach UI（HUDボタンのみ）
     * ========================= */
    const PANEL_ID = "wbAchPanelV2";
    const BTN_ID   = "wbAchBtnV2";
    let uiEl = null;

    function ensureUiStyle() {
      if (document.getElementById("wbAchUiStyleV2")) return;
      const s = document.createElement("style");
      s.id = "wbAchUiStyleV2";
      s.textContent = `
#${PANEL_ID}{position:fixed;inset:0;z-index:2147483647;display:none;user-select:none;}
#${PANEL_ID} .bg{position:absolute;inset:0;background:rgba(0,0,0,.38);}
#${PANEL_ID} .card{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(760px,94vw);max-height:min(82vh,820px);overflow:hidden;
  background:rgba(255,255,255,.97);border-radius:18px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);display:flex;flex-direction:column;
}
#${PANEL_ID} .head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;border-bottom:1px solid rgba(0,0,0,.08);}
#${PANEL_ID} .title{font-weight:1000;letter-spacing:.02em;}
#${PANEL_ID} .close{border:none;background:rgba(0,0,0,.06);border-radius:12px;padding:8px 12px;font-weight:900;cursor:pointer;}
#${PANEL_ID} .body{padding:12px 14px;overflow:auto;}
#${PANEL_ID} .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:10px;}
#${PANEL_ID} .pill{display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:999px;padding:8px 10px;font-weight:900;}
#${PANEL_ID} .btn{border:none;border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer;background:#fff;box-shadow:0 10px 22px rgba(0,0,0,.10);}
#${PANEL_ID} .btn.primary{background:#ffd6e7;}
#${PANEL_ID} .btn.ghost{background:rgba(0,0,0,.04);box-shadow:none;}
#${PANEL_ID} .grid{display:grid;grid-template-columns:1fr;gap:10px;}
#${PANEL_ID} .item{
  background:rgba(255,255,255,.92);border-radius:14px;padding:12px;
  box-shadow:0 10px 22px rgba(0,0,0,.08);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
}
#${PANEL_ID} .item.locked{opacity:.72;}
#${PANEL_ID} .name{font-weight:1000;}
#${PANEL_ID} .desc{font-size:12px;opacity:.78;font-weight:800;margin-top:4px;line-height:1.35;}
#${PANEL_ID} .flavor{
  margin-top:8px;
  background:rgba(0,0,0,.04);
  border-radius:12px;
  padding:10px 10px;
  font-weight:950;
  font-size:12px;
  line-height:1.4;
  opacity:.92;
}
#${PANEL_ID} .flavor.locked{
  opacity:.55;
  filter: blur(1.4px);
}
#${PANEL_ID} .meta{font-size:12px;opacity:.75;font-weight:900;margin-top:6px;}
#${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-weight:900;font-size:12px;background:rgba(255,120,120,.18);}
#${PANEL_ID} .badge.on{background:rgba(120,210,255,.22);}
#${PANEL_ID} .bar{height:10px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden;margin-top:8px;}
#${PANEL_ID} .bar > i{display:block;height:100%;width:0%;background:rgba(120,210,255,.55);}
#${PANEL_ID} .small{font-size:12px;opacity:.8;font-weight:900;}
#${BTN_ID}{margin-left:8px;}
`;
      document.head.appendChild(s);
    }

    function buildUI() {
      ensureUiStyle();
      if (uiEl && document.body.contains(uiEl)) return uiEl;

      uiEl = document.createElement("div");
      uiEl.id = PANEL_ID;
      uiEl.innerHTML = `
        <div class="bg"></div>
        <div class="card" role="dialog" aria-modal="true">
          <div class="head">
            <div class="title">🏆 実績</div>
            <button class="close" type="button">閉じる</button>
          </div>
          <div class="body"></div>
        </div>
      `;
      document.body.appendChild(uiEl);

      uiEl.querySelector(".bg")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
      uiEl.querySelector(".close")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });
      uiEl.querySelector(".card")?.addEventListener("click", (e) => e.stopPropagation());
      return uiEl;
    }

    let uiFilter = "all"; // all | unlocked | locked

    function renderUI() {
      const p = buildUI();
      const body = p.querySelector(".body");
      if (!body) return;

      const total = ACH_MASTER.length;
      const unlockedCount = ACH_MASTER.filter(a => isUnlocked(a.id)).length;

      const pills = `
        <div class="pill">解除：<b>${unlockedCount}</b> / ${total}</div>
        <div class="pill">🪙 <b>${getCoins().toLocaleString()}</b></div>
        <div class="pill">🐰 <b>${getBunnyCount()}</b></div>
        <div class="pill">💩 <b>${getSyougouCount("unchi")}</b></div>
        <div class="pill">🕊️ <b>${getSyougouCount("tabidachi")}</b></div>
        <div class="pill">🎆 <b>${getSyougouCount("hanabi")}</b></div>
        <div class="pill">🎰 <b>${getSyougouCount("slot_win")}</b></div>
        <div class="pill">🚪 <b>${getSyougouCount("omukae")}</b></div>
      `;

      const buttons = `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn ghost" type="button" data-filter="all">全部</button>
          <button class="btn ghost" type="button" data-filter="unlocked">解除済み</button>
          <button class="btn ghost" type="button" data-filter="locked">未解除</button>
          <button class="btn primary" type="button" data-refresh="1">更新</button>
        </div>
      `;

      const list = ACH_MASTER
        .filter(a => {
          if (uiFilter === "unlocked") return isUnlocked(a.id);
          if (uiFilter === "locked") return !isUnlocked(a.id);
          return true;
        })
        .map(a => {
          const on = isUnlocked(a.id);
          let prog = null;
          try { prog = a.progress?.(); } catch { prog = null; }

          let now = 0, target = 0, unit = "";
          if (prog && Number.isFinite(Number(prog.now)) && Number.isFinite(Number(prog.target)) && Number(prog.target) > 0) {
            now = Number(prog.now);
            target = Number(prog.target);
            unit = String(prog.unit || "");
          }
          const pct = (target > 0) ? Math.max(0, Math.min(100, (now / target) * 100)) : (on ? 100 : 0);

          const right = on
            ? `<span class="badge on">解除済</span>`
            : `<span class="badge">未解除</span>`;

          const barHtml = (target > 0)
            ? `
              <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
              <div class="meta">${escapeHtml(now.toLocaleString())}${escapeHtml(unit)} / ${escapeHtml(target.toLocaleString())}${escapeHtml(unit)}（${pct.toFixed(1)}%）</div>
            `
            : `<div class="meta">進捗：—</div>`;

          const flavorText = (a.flavor || "").trim();
          const flavorHtml = flavorText
            ? `
              <div class="flavor ${on ? "" : "locked"}">
                ${on ? escapeHtml(flavorText) : "？？？（解除すると読める）"}
              </div>
            `
            : "";

          return `
            <div class="item ${on ? "" : "locked"}">
              <div style="flex:1; min-width: 0;">
                <div class="name">${on ? "✅" : "⬜"} ${escapeHtml(a.name)} <span class="small">(${escapeHtml(a.id)})</span></div>
                <div class="desc">${escapeHtml(a.desc || "")}</div>
                ${barHtml}
                ${flavorHtml}
              </div>
              <div>${right}</div>
            </div>
          `;
        })
        .join("");

      body.innerHTML = `
        <div class="toolbar">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">${pills}</div>
          ${buttons}
        </div>
        <div class="grid">${list || "<div class='pill'>表示する実績がありません</div>"}</div>
      `;

      body.querySelectorAll("[data-filter]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          uiFilter = btn.getAttribute("data-filter") || "all";
          renderUI();
        });
      });
      body.querySelectorAll("[data-refresh]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          checkUnlocks();
          renderUI();
        });
      });
    }

    function openPanel() {
      const p = buildUI();
      checkUnlocks();
      renderUI();
      p.style.display = "block";
    }
    function closePanel() {
      const p = uiEl || document.getElementById(PANEL_ID);
      if (!p) return;
      p.style.display = "none";
    }
    function refreshUI() {
      if (uiEl && uiEl.style.display !== "none") renderUI();
    }

    function injectHudButton() {
      const hud = document.getElementById("hud");
      if (!hud) return;
      if (document.getElementById(BTN_ID)) return;

      const mount = document.getElementById("hudButtons") || hud;

      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = "実績";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
      });

      mount.appendChild(btn);
    }

    /* =========================
     * Hooks
     * ========================= */
    try { WB.on?.("bunnyCountChanged", checkUnlocks); } catch {}
    try { WB.on?.("hudUpdated", checkUnlocks); } catch {}
    try { WB.on?.("coinsChanged", checkUnlocks); } catch {}
    try { WB.on?.("coinChanged", checkUnlocks); } catch {}

    // 保険：hanabi.js等が emit してるイベントも拾う
    try { WB.on?.("hanabiFired", checkUnlocks); } catch {}
    try { WB.on?.("slotWin", checkUnlocks); } catch {}
    try { WB.on?.("tabidachi", checkUnlocks); } catch {}
    try { WB.on?.("omukae", checkUnlocks); } catch {}
    try { WB.on?.("sy:add", checkUnlocks); } catch {}

    // eventsが無くても解除できる「定期チェック」
    const TIMER_MS = 900;
    const timer = setInterval(() => {
      checkUnlocks();
      refreshUI();
    }, TIMER_MS);

    window.addEventListener("load", () => {
      injectHudButton();
      setTimeout(injectHudButton, 400);
    });

    /* =========================
     * External
     * ========================= */
    WB.zisseki = {
      ach,
      isUnlocked,
      unlock,
      checkUnlocks,
      LS_ACH,
      UNLOCK_BUNNY4_NEED,
      ACH_MASTER,
      openPanel,
      closePanel,
      stop: () => { try { clearInterval(timer); } catch {} },
    };

    // 初回
    checkUnlocks();
    injectHudButton();

    console.log("[zisseki] ready (flavor in zisseki.js)", { unlocked: Object.keys(ach).length });
  }).catch((e) => {
    console.warn("[zisseki] WB wait failed:", e?.message || e);
  });
})();
