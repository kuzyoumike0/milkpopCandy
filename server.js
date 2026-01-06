import express from "express";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;

// Railway/コンテナでは process.cwd() が一番安定
const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "index.html");

// 静的配信（index.html, app.js, slot.js, style.css 等）
app.use(express.static(ROOT));

// ★ web-bunny を /web-bunny として配信（assetsが出る）
app.use("/web-bunny", express.static(path.join(ROOT, "web-bunny")));

app.get("/__health", (_req, res) => {
  res.type("text").send(
    [
      `PORT=${PORT}`,
      `ROOT=${ROOT}`,
      `INDEX_PATH=${INDEX_PATH}`,
      `INDEX_EXISTS=${fs.existsSync(INDEX_PATH)}`,
      `APP_JS_EXISTS=${fs.existsSync(path.join(ROOT, "app.js"))}`,
      `SLOT_JS_EXISTS=${fs.existsSync(path.join(ROOT, "slot.js"))}`,
      `WEB_BUNNY_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny"))}`,
      `ASSETS_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny", "assets"))}`,
      `COIN2_EXISTS=${fs.existsSync(path.join(ROOT, "web-bunny", "assets", "coin2.png"))}`,
    ].join("\n")
  );
});

// ルートは必ず index.html を返す（これで Cannot GET / が消える）
app.get("/", (_req, res) => {
  if (fs.existsSync(INDEX_PATH)) {
    res.sendFile(INDEX_PATH);
  } else {
    res
      .status(500)
      .type("text")
      .send(
        `index.html not found\nROOT=${ROOT}\nINDEX_PATH=${INDEX_PATH}\n` +
        `Check your deploy working directory / file placement.`
      );
  }
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  console.log("ROOT =", ROOT);
  console.log("INDEX_EXISTS =", fs.existsSync(INDEX_PATH));
});
