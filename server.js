const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

const webRoot = path.join(__dirname, "web-bunny");
app.use(express.static(webRoot));

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ★ここを追加：web-bunny/ を /web-bunny として静的配信
app.use("/web-bunny", express.static(path.join(__dirname, "web-bunny")));

// ★ルート（index.html等）も配るなら（任意）
app.use(express.static(__dirname));


app.get("/", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web Bunny running on :${PORT}`);
});
