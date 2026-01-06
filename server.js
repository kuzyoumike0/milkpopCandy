// server.js（ESM / Node v22想定）
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CSP（いまの default-src 'none' をやめて必要最小限だけ許可）=====
// Google翻訳のCSS（gstatic）を許可したくない場合は、https://www.gstatic.com を消してOK
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // 画像（data: は必要なら。不要なら data: を消してOK）
      "img-src 'self' data:",
      // CSS（slot.jsのインラインstyleを使うので unsafe-inline を許可）
      "style-src 'self' 'unsafe-inline' https://www.gstatic.com",
      "style-src-elem 'self' 'unsafe-inline' https://www.gstatic.com",
      // JS（この構成だと外部JS不要。念のため inline を許可）
      "script-src 'self' 'unsafe-inline'",
      // フォント（Soleil.woff2 を自分のドメインから読む＆data: フォントも許可）
      "font-src 'self' data:",
      // 音声（poyo.mp3 / coin.mp3）
      "media-src 'self'",
      // fetch / websocket など（必要なら拡張）
      "connect-src 'self'",
    ].join("; ")
  );
  next();
});

// ===== 静的配信 =====
// ルート直下（index.html, app.js, slot.js, style.css, manifest など）
app.use(express.static(__dirname));

// ★ web-bunny/ を /web-bunny として配信（assets 配下の画像/音が出るようにする）
app.use("/web-bunny", express.static(path.join(__dirname, "web-bunny")));

// ===== ルーティング =====
// / は index.html を返す
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
