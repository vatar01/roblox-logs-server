import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import path from "path";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const LOGS_FILE = "./logs.json";

// Создать файл, если его нет
if (!fs.existsSync(LOGS_FILE)) fs.writeJsonSync(LOGS_FILE, []);

// --- Отдаём фронтенд ---
app.use(express.static("public"));

// --- Получить ВСЕ логи ---
app.get("/logs", async (req, res) => {
    const logs = await fs.readJson(LOGS_FILE);
    res.json(logs);
});

// --- Логи одного игрока ---
app.get("/player/:name", async (req, res) => {
    const name = req.params.name;
    const logs = await fs.readJson(LOGS_FILE);
    const filtered = logs.filter(l => l.player === name);
    res.json(filtered);
});

// --- Добавить лог ---
app.post("/addlog", async (req, res) => {
    const body = req.body;

    if (!body.player || !body.event) {
        return res.status(400).json({ error: "Invalid request" });
    }

    const logs = await fs.readJson(LOGS_FILE);
    logs.push(body);

    await fs.writeJson(LOGS_FILE, logs, { spaces: 2 });

    res.json({ status: "OK", log: body });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
});
