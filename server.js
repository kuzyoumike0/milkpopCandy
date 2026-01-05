const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

const webRoot = path.join(__dirname, "web-bunny");
app.use(express.static(webRoot));

app.get("/", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web Bunny running on :${PORT}`);
});
