import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ルート配信（index.html, app.js, slot.js, style.css 等）
app.use(express.static(__dirname));

// ★ web-bunny/ を /web-bunny として静的配信（画像が表示されない原因を潰す）
app.use("/web-bunny", express.static(path.join(__dirname, "web-bunny")));

// 直叩き用（/ に来たら index.html）
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
