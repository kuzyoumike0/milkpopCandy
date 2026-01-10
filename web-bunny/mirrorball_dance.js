<header id="hud">
  <div id="coin">🪙 <span id="coinValue">0</span></div>

  <div id="hudButtons">
    <!-- ✅ 表に出す -->
    <button id="omukaeBtn" type="button">お迎え</button>
    <button id="departBtn" type="button">旅立ち</button>
    <button id="hanabiBtn" type="button">🎆 花火</button>

    <!-- ✅ 互換用（他JSが click() で呼ぶ） -->
    <button id="shopBtn" type="button" style="display:none;">ショップ</button>
    <button id="slotBtn" type="button" style="display:none;">スロット</button>
    <button id="rankBtn" type="button" style="display:none;">ランキング</button>
    <button id="resetBtn" type="button" style="display:none;">リセット</button>
  </div>

  <div id="title" aria-label="current-title"></div>
</header>
