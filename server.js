const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ★ここが重要：web-bunny フォルダを配信対象にする
const webDir = path.join(__dirname, "web-bunny");

// 静的配信
app.use(express.static(webDir));

// / は必ず index.html を返す（GETできません対策）
app.get("/", (_req, res) => {
  res.sendFile(path.join(webDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
