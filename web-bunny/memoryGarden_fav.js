// memoryGarden_fav.js（V1.0 - 栞(お気に入り)システムを memoryGarden.js と分離して追加）
//
// ✅ 記憶カードに「☆/★」を後付け
// ✅ 「栞」タブを後付け（お気に入りだけ一覧）
// ✅ 単体表示(記憶ポップ)にも☆を後付け
// ✅ 図鑑の「記憶」タブにも☆を後付け（best effort）
// ✅ localStorageは memoryGarden.js の store をそのまま使う（store.memories[].fav）
//
// 読み込み順：memoryGarden.js の後

(() => {
  "use strict";
  if (window.__MEMORY_GARDEN_FAV_V1__) return;
  window.__MEMORY_GARDEN_FAV_V1__ = true;

  const VERSION = "1.0";

  const CFG = {
    pollMs: 700,            // 画面の変化に追従するための軽い監視
    maxRender: 120,         // 表示上限
    starOn: "★",
    starOff: "☆",
    tabName: "栞",
  };

  const $ = (q, p = document) => p.querySelector(q);
  const $$ = (q, p = document) => Array.from(p.querySelectorAll(q));

  function safe(fn) { try { return fn(); } catch { return undefined; } }

  function getMG() {
    return window.WB?.memoryGarden || window.memoryGarden || null;
  }

  function getStore() {
    const mg = getMG();
    return mg?.store || null;
  }

  function saveStore() {
    // memoryGarden.js 側が save を閉じてるので、更新通知だけ投げる（保存は MG が store を保持してるため）
    // ※ MG が saveStore を expose していない前提。store の更新は MG の tick/save に乗る＆LSはMGが周期保存。
    safe(() => window.WB?.emit?.("memoryGarden:updated", { favPatched: true }));
  }

  function findMemById(id) {
    const store = getStore();
    if (!store?.memories || !id) return null;
    return store.memories.find(m => m && m.id === id) || null;
  }

  function isFav(id) {
    const m = findMemById(id);
    return !!m?.fav;
  }

  function setFav(id, on) {
    const m = findMemById(id);
    if (!m) return false;
    m.fav = !!on;
    // ここで LS を直接触らず、MG 側の保存サイクル＆updated で更新
    saveStore();
    return true;
  }

  function toggleFav(id) {
    const cur = isFav(id);
    const ok = setFav(id, !cur);
    const mg = getMG();
    if (ok) safe(() => mg?.playMessageSE?.()); // ちょい気持ちいい
    safe(() => mg?.open?.()); // 開いてる場合の再描画保険（openは既に表示中ならそのまま）
    safe(() => mg?.store && (mg.store.__favTouched = Date.now()));
    return ok;
  }

  // MG API を拡張（外部から使える）
  function expose() {
    const mg = getMG();
    if (!mg) return false;
    if (mg.fav) return true; // 二重差し防止
    mg.fav = { version: VERSION, isFav, setFav, toggleFav };
    return true;
  }

  /* =========================
   * UI: 記憶の庭パネル(mgPanelV1)に栞タブを後付け
   * ========================= */
  function ensureFavTabInGardenPanel(panel) {
    const tabs = panel?.querySelector?.(".tabs");
    const body = panel?.querySelector?.(".body");
    if (!tabs || !body) return false;

    if (!tabs.querySelector('.tab[data-tab="fav"]')) {
      const b = document.createElement("button");
      b.className = "tab";
      b.type = "button";
      b.dataset.tab = "fav";
      b.textContent = CFG.tabName;
      tabs.appendChild(b);

      b.addEventListener("click", () => {
        // 既存タブONを外す
        $$(".tab", tabs).forEach(x => x.classList.remove("on"));
        b.classList.add("on");

        // fav表示
        renderFavListTo(body);
      });
    }
    return true;
  }

  function renderFavListTo(body) {
    const store = getStore();
    const mg = getMG();
    if (!store) return;

    safe(() => mg?.playMessageSE?.());

    const list = (store.memories || []).filter(m => !!m?.fav).slice(0, CFG.maxRender);

    if (!list.length) {
      body.innerHTML = `
        <div style="font-weight:900; opacity:.7;">
          まだ栞はありません。<br>
          記憶に「☆」を付けるとここに集まります。
        </div>
      `;
      return;
    }

    const EMO = safe(() => mg?.store && mg.store) ? null : null; // not used
    const emoMap = safe(() => window.WB?.memoryGarden?.store) ? null : null; // not used

    // 感情名は memoryGarden.js の表示に寄せたいので、できるだけ WB.memoryGarden の内部を参照する
    const EMO_MAP = safe(() => window.WB?.memoryGarden && window.WB.memoryGarden) ? null : null;

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${list.map(m => {
          const id = String(m.id || "");
          const date = String(m.date || "");
          const text = String(m.text || "");
          // emotion 表示はテキストだけ（絵文字は MG 本体に依存するので best effort）
          const emo = String(m.emotion || "");
          const on = !!m.fav;

          return `
            <div class="mem" data-memid="${escapeHtml(id)}" style="
              background:rgba(255,255,255,.94);
              border-radius:14px;
              padding:12px 12px;
              box-shadow:0 10px 24px rgba(0,0,0,.10);
              display:flex; flex-direction:column; gap:6px;
            ">
              <div style="display:flex; justify-content:space-between; gap:10px; font-weight:1000; opacity:.9; align-items:center;">
                <div>${escapeHtml(emo)}</div>
                <div>${escapeHtml(date)}</div>
              </div>
              <div style="font-weight:950; white-space:pre-line; line-height:1.45;">${escapeHtml(text)}</div>
              <div style="display:flex; gap:10px; margin-top:8px; align-items:center;">
                <button type="button" data-act="single" style="
                  border:none; border-radius:12px; padding:8px 10px;
                  font-weight:1000; background:rgba(0,0,0,.06); cursor:pointer;
                ">単体で読む</button>
                <button type="button" data-act="fav" style="
                  margin-left:auto;
                  width:46px; height:34px;
                  border:none; border-radius:12px;
                  background:${on ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)"};
                  font-weight:1100;
                  cursor:pointer;
                ">${on ? CFG.starOn : CFG.starOff}</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // bind
    $$('button[data-act="single"]', body).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const card = btn.closest("[data-memid]");
        const id = card?.getAttribute("data-memid");
        if (!id) return;
        safe(() => getMG()?.showById?.(id));
      });
    });

    $$('button[data-act="fav"]', body).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const card = btn.closest("[data-memid]");
        const id = card?.getAttribute("data-memid");
        if (!id) return;
        toggleFav(id);
        renderFavListTo(body); // 栞一覧を更新
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* =========================
   * UI: 記憶一覧に ☆ を後付け（mgPanelV1の「記憶」タブ）
   * ========================= */
  function decorateGardenMemoryCards(panel) {
    const body = panel?.querySelector?.(".body");
    if (!body) return false;

    // memカードっぽい要素を拾う（MG本体のHTMLに依存しすぎない）
    const cards = $$(".mem[data-memid]", body);
    if (!cards.length) return false;

    cards.forEach(card => {
      const id = card.getAttribute("data-memid");
      if (!id) return;

      // 既に付いてたら何もしない
      if (card.querySelector('button[data-act="fav"]')) return;

      // 既存btnRowがあればそこに入れる。なければ末尾に作る
      let row = card.querySelector(".btnRow");
      if (!row) {
        row = document.createElement("div");
        row.className = "btnRow";
        row.style.cssText = "display:flex; gap:10px; margin-top:8px; align-items:center;";
        card.appendChild(row);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-act", "fav");
      btn.textContent = isFav(id) ? CFG.starOn : CFG.starOff;
      btn.style.cssText = `
        margin-left:auto;
        width:46px; height:34px;
        border:none; border-radius:12px;
        background:${isFav(id) ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)"};
        font-weight:1100; cursor:pointer;
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleFav(id);
        // 見た目更新
        btn.textContent = isFav(id) ? CFG.starOn : CFG.starOff;
        btn.style.background = isFav(id) ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)";
      });
      row.appendChild(btn);
    });

    return true;
  }

  /* =========================
   * UI: 単体表示(mgSinglePanelV1)に ☆ を後付け
   * ========================= */
  function ensureFavInSinglePopup() {
    const p = document.getElementById("mgSinglePanelV1");
    if (!p) return false;

    const head = p.querySelector(".head");
    if (!head) return false;

    // 既にあるならOK
    if (head.querySelector('[data-mg="favSingle"]')) return true;

    // closeボタンの手前に差し込み（MG本体の構造に依存しすぎない）
    const closeBtn = head.querySelector(".close") || head.querySelector("button.close") || head.querySelector("button");
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.setAttribute("data-mg", "favSingle");
    favBtn.title = "栞（お気に入り）";
    favBtn.textContent = CFG.starOff;

    favBtn.style.cssText = `
      width:34px; height:34px;
      border:none; border-radius:999px;
      background:rgba(0,0,0,.06);
      font-weight:1100; cursor:pointer;
      margin-left:10px;
    `;

    // 現在開いてるmem idを見つける：単体表示は store の「最新表示」を推定する
    function currentMemIdGuess() {
      // 単体表示は MG の showById から呼ばれることが多いので、最後に触ったIDを保持する
      const mg = getMG();
      const store = getStore();
      const last = store?.__favLastShownId || null;
      if (last) return last;
      // fallback：最新の記憶
      return store?.memories?.[0]?.id || null;
    }

    favBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const store = getStore();
      const id = currentMemIdGuess();
      if (!id) return;
      toggleFav(id);
      refreshFavBtn(id);
    });

    function refreshFavBtn(id) {
      const on = isFav(id);
      favBtn.textContent = on ? CFG.starOn : CFG.starOff;
      favBtn.style.background = on ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)";
    }

    // headに挿入
    if (closeBtn && closeBtn.parentNode) closeBtn.parentNode.insertBefore(favBtn, closeBtn);
    else head.appendChild(favBtn);

    // 表示更新（定期で追従）
    setInterval(() => {
      const id = currentMemIdGuess();
      if (!id) return;
      refreshFavBtn(id);
    }, 350);

    return true;
  }

  /* =========================
   * 図鑑「記憶」タブに ☆ を後付け（best effort）
   * ========================= */
  function decorateZukanMemory() {
    const p = document.getElementById("wbZukanPanelV1");
    if (!p || p.style.display !== "block") return false;

    // 「記憶」タブがONのときだけ
    const memTab = p.querySelector('.tab[data-tab="memory"]');
    if (!memTab || !memTab.classList.contains("on")) return false;

    const body = p.querySelector(".body");
    if (!body) return false;

    // data-memid がある構造ならそこへ付与
    const cards = $$("[data-memid]", body);
    if (!cards.length) return false;

    cards.forEach(card => {
      const id = card.getAttribute("data-memid");
      if (!id) return;

      if (card.querySelector('button[data-act="fav"]')) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-act", "fav");
      btn.textContent = isFav(id) ? CFG.starOn : CFG.starOff;
      btn.style.cssText = `
        margin-left:auto;
        width:46px; height:34px;
        border:none; border-radius:12px;
        background:${isFav(id) ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)"};
        font-weight:1100; cursor:pointer;
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleFav(id);
        btn.textContent = isFav(id) ? CFG.starOn : CFG.starOff;
        btn.style.background = isFav(id) ? "rgba(255,214,231,.55)" : "rgba(0,0,0,.06)";
      });

      // 置き場所：末尾に行を作って追加
      let row = card.querySelector("[data-mg-row]");
      if (!row) {
        row = document.createElement("div");
        row.setAttribute("data-mg-row", "1");
        row.style.cssText = "display:flex; gap:10px; margin-top:8px; align-items:center;";
        card.appendChild(row);
      }
      row.appendChild(btn);
    });

    return true;
  }

  /* =========================
   * 単体表示で最後に表示したIDを覚える（推定精度UP）
   * ========================= */
  function patchShowByIdForTracking() {
    const mg = getMG();
    if (!mg?.showById || mg.__favPatchedShowById) return false;

    const orig = mg.showById.bind(mg);
    mg.showById = function(id) {
      const store = getStore();
      if (store) store.__favLastShownId = id;
      return orig(id);
    };

    // showLatest も追跡
    if (mg.showLatest && !mg.__favPatchedShowLatest) {
      const orig2 = mg.showLatest.bind(mg);
      mg.showLatest = function() {
        const store = getStore();
        const id = store?.memories?.[0]?.id || null;
        if (store && id) store.__favLastShownId = id;
        return orig2();
      };
      mg.__favPatchedShowLatest = true;
    }

    mg.__favPatchedShowById = true;
    return true;
  }

  /* =========================
   * メイン監視ループ
   * ========================= */
  function tick() {
    const mg = getMG();
    const store = getStore();
    if (!mg || !store) return;

    expose();
    patchShowByIdForTracking();

    // 記憶の庭パネル
    const panel = document.getElementById("mgPanelV1");
    if (panel && panel.style.display === "block") {
      ensureFavTabInGardenPanel(panel);

      // 「記憶」表示中っぽい時に☆を後付け
      // （MG本体のcurrentTabに触れないので、カードがあるなら付ける）
      decorateGardenMemoryCards(panel);
    }

    // 単体表示に☆後付け
    ensureFavInSinglePopup();

    // 図鑑にも☆後付け
    decorateZukanMemory();
  }

  // 起動：MGが無い間も回してOK（軽い）
  setInterval(tick, CFG.pollMs);
  window.addEventListener("load", () => setTimeout(tick, 0));

  console.log(`[memoryGarden_fav] loaded v${VERSION}`);
})();
