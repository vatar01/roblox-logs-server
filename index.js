const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Чтение логов
app.get("/logs", (req, res) => {
  if (!fs.existsSync("logs.json")) fs.writeFileSync("logs.json", "[]");
  const logs = JSON.parse(fs.readFileSync("logs.json"));
  res.json(logs);
});

// Добавление лога из Roblox
app.post("/addlog", (req, res) => {
  const log = req.body;

  if (!fs.existsSync("logs.json")) fs.writeFileSync("logs.json", "[]");
  const logs = JSON.parse(fs.readFileSync("logs.json"));

  logs.push(log);
  fs.writeFileSync("logs.json", JSON.stringify(logs, null, 2));

  res.json({ status: "OK", log });
});

app.get("/", (req, res) => {
  res.send("Roblox Logs API работает!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
