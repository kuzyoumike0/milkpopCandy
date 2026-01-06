import express from "express";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;

// Railway/コンテナでは process.cwd() が一番安定
const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "index.html");

// まず静的配信（index.html, app.js, slot.js, style.css, manifest 等）
app.use(express.static(ROOT));

// ★ web-bunny を /web-bunny として静的配信（assetsが出るようになる）
app.use("/web-bunny", express.static(path.join(ROOT, "web-bunny")));

// ヘルスチェック（デバッグ用）
app.get("/__health", (_req, res) => {
  res.type("text").send(
    [
      `PORT=${PORT}`,
      `ROOT=${ROOT}`,
      `INDEX_EXISTS=${fs.existsSync(INDEX_PATH)}`,
      `WEB_BUNNY_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny"))}`,
      `ASSETS_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny", "assets"))}`,
      `COIN2_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny", "assets", "coin2.png"))}`,
    ].join("\n")
  );
});

// ルート（/）は必ず index.html を返す（これで Cannot GET / が消える）
app.get("/", (_req, res) => {
  if (fs.existsSync(INDEX_PATH)) {
    res.sendFile(INDEX_PATH);
  } else {
    // index.html が無い場合でも原因が分かるようにする
    res
      .status(500)
      .type("text")
      .send(`index.html not found at: ${INDEX_PATH}\nROOT=${ROOT}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  console.log("ROOT =", ROOT);
});
