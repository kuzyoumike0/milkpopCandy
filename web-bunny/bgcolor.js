<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Milkpop牧場</title>

  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

  <link rel="manifest" href="./manifest.webmanifest" />
  <meta name="theme-color" content="#ffd6e7" />

  <link rel="stylesheet" href="./style.css?v=20260109_1" />

  <meta http-equiv="Content-Security-Policy"
        content="
          default-src 'self';
          img-src 'self' data:;
          media-src 'self';
          style-src 'self' 'unsafe-inline';
          script-src 'self' 'unsafe-inline';
          font-src 'self' data:;
        ">
</head>

<body>

  <!-- ===== HUD ===== -->
  <header id="hud">
    <div id="coin">🪙 <span id="coinValue">0</span></div>

    <div id="hudButtons">
      <!-- ✅ 別ボタン -->
      <button id="omukaeBtn" type="button">お迎え</button>
      <button id="shopBtn" type="button">ショップ</button>

      <button id="slotBtn" type="button">スロット</button>
      <button id="departBtn" type="button">旅立ち</button>
      <button id="resetBtn" type="button">リセット</button>
    </div>

    <div id="title" aria-label="current-title"></div>
  </header>

  <!-- ===== メインフィールド ===== -->
  <main id="field">
    <div id="bgLayer"></div>
    <div id="tenkiLayer"></div>
    <div id="bunnyLayer"></div>
    <div id="coinLayer"></div>
  </main>

  <!-- ✅ 背景（朝昼夜＋ミラーボール） -->
  <script src="./bgcolor.js?v=20260109_2"></script>

  <!-- 天気 -->
  <script src="./tenki.js?v=20260109_1"></script>

  <!-- 花火 -->
  <script src="./hanabi.js?v=20260109_1"></script>

  <!-- ✅ WBを先に用意 -->
  <script src="./wb_boot.js?v=20260109_1"></script>

  <!-- ===== コア（WBを作る） ===== -->
  <script src="./app.js?v=20260109_1"></script>

  <!-- ✅ BGM：必ず app.js の後 -->
  <script src="./BGM.js?v=20260109_1"></script>

  <!-- ✅ ショップ（ミラーボール購入/設置切替） -->
  <script src="./shop.js?v=20260109_2"></script>

  <!-- ===== 拡張（WB依存） ===== -->
  <script src="./isyou.js?v=20260109_1"></script>
  <script src="./zisseki.js?v=20260109_1"></script>
  <script src="./syougou.js?v=20260109_1"></script>

  <!-- ✅ お迎え（omukae は omukaeBtn を使うように修正が必要） -->
  <script src="./omukae.js?v=20260109_1"></script>

  <script src="./zukan.js?v=20260109_1"></script>
  <script src="./farewell_messages.js?v=20260109_1"></script>
  <script src="./tabidati.js?v=20260109_1"></script>
  <script src="./slot.js?v=20260109_1"></script>

  <!-- Service Worker（安全版：復旧用に ?nosw=1 で無効化） -->
  <script>
    (function () {
      const params = new URLSearchParams(location.search);
      const noSw = params.get("nosw") === "1";
      if (noSw) {
        console.warn("[SW] disabled by ?nosw=1");
        return;
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      }
    })();
  </script>

</body>
</html>
