const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

__dirname = __dirname; // 既にある前提

app.use(express.static(__dirname));
app.use("/web-bunny", express.static(path.join(__dirname, "web-bunny")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`Server running on :${PORT}`));
