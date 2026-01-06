import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8080;

// いま実行しているカレントディレクトリ（Railwayでズレにくい）
const ROOT = process.cwd();

// ルート配信（index.html, app.js, slot.js, style.css など）
app.use(express.static(ROOT));

// web-bunny 配信（★これが /web-bunny/assets/.. を生やす）
app.use("/web-bunny", express.static(path.join(ROOT, "web-bunny")));

// ついでに assets を直でも配信したい場合（任意：保険）
// app.use("/assets", express.static(path.join(ROOT, "web-bunny", "assets")));

app.get("/__health", (_req, res) => {
  res.type("text").send(
    [
      `ROOT=${ROOT}`,
      `WEB_BUNNY=${path.join(ROOT, "web-bunny")}`,
      `ASSETS=${path.join(ROOT, "web-bunny", "assets")}`,
    ].join("\n")
  );
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  console.log("ROOT =", ROOT);
});
