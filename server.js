import express from "express";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;

// Railwayではこれが /app
const ROOT = process.cwd();

// ★ index.html は web-bunny の中
const WEB_ROOT = path.join(ROOT, "web-bunny");
const INDEX_PATH = path.join(WEB_ROOT, "index.html");

// 静的配信
// web-bunny を ルートとして配信する
app.use(express.static(WEB_ROOT));

// assets を /web-bunny/assets/... でも参照できるようにする（保険）
app.use("/web-bunny", express.static(WEB_ROOT));

// デバッグ用
app.get("/__health", (_req, res) => {
  res.type("text").send(
    [
      `ROOT=${ROOT}`,
      `WEB_ROOT=${WEB_ROOT}`,
      `INDEX_PATH=${INDEX_PATH}`,
      `INDEX_EXISTS=${fs.existsSync(INDEX_PATH)}`,
      `APP_JS_EXISTS=${fs.existsSync(path.join(WEB_ROOT, "app.js"))}`,
      `ASSETS_EXISTS=${fs.existsSync(path.join(WEB_ROOT, "assets"))}`,
      `COIN2_EXISTS=${fs.existsSync(path.join(WEB_ROOT, "assets", "coin2.png"))}`,
    ].join("\n")
  );
});

// ルート
app.get("/", (_req, res) => {
  if (fs.existsSync(INDEX_PATH)) {
    res.sendFile(INDEX_PATH);
  } else {
    res.status(500).type("text").send(
      `index.html not found\n` +
      `Expected at: ${INDEX_PATH}`
    );
  }
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  console.log("ROOT =", ROOT);
  console.log("WEB_ROOT =", WEB_ROOT);
});
