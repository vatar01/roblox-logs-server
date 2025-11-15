// index.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const API_KEY = process.env.API_KEY || "change_me_key";
const DATABASE_URL = process.env.DATABASE_URL;

if(!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Cannot start.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// rate limit - generic
const limiter = rateLimit({
  windowMs: 15 * 1000, // 15 seconds (short for demo)
  max: 200
});
app.use(limiter);

// Serve frontend
app.use(express.static("public"));

// ------------------------- AUTH HELPERS -------------------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Invalid Authorization header" });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function isAdmin(username) {
  const r = await pool.query("SELECT role FROM admins WHERE username = $1", [username]);
  return r.rows[0] && r.rows[0].role === "admin";
}

// ------------------------- AUTH ROUTES -------------------------
// Register (use carefully — after creating first admin you may disable this route)
app.post("/auth/register", async (req, res) => {
  const { username, password, role } = req.body;
  if(!username || !password) return res.status(400).json({ error: "username and password required" });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO admins (username, password_hash, role) VALUES ($1,$2,$3) ON CONFLICT (username) DO NOTHING", [username, hash, role || "admin"]);
    return res.json({ status: "OK" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "db error" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: "username and password required" });
  try {
    const r = await pool.query("SELECT id, username, password_hash, role FROM admins WHERE username = $1", [username]);
    if(r.rowCount === 0) return res.status(401).json({ error: "invalid credentials" });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({ error: "invalid credentials" });
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// ------------------------- LOGS ROUTES -------------------------
// Add log — used by Roblox. Protected by API_KEY header `x-api-key`
app.post("/addlog", async (req, res) => {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key || key !== API_KEY) return res.status(403).json({ error: "forbidden" });

  const { player, playerId, event, value, time } = req.body;
  if(!player || !event) return res.status(400).json({ error: "player and event required" });

  try {
    const q = `INSERT INTO logs (player, player_id, event, value, time) VALUES ($1,$2,$3,$4,$5) RETURNING id`;
    const vals = [player, playerId || null, event, value ? JSON.stringify(value) : null, time || Date.now()];
    const r = await pool.query(q, vals);
    return res.json({ status: "OK", id: r.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "db error" });
  }
});

// Protected: get logs (admin only)
app.get("/logs", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, player, player_id, event, value, time, created_at FROM logs ORDER BY time DESC LIMIT 200");
    // parse JSONB value
    const rows = r.rows.map(row => ({ ...row, value: row.value ? JSON.parse(row.value) : null }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "db error" });
  }
});

// Protected: player detail
app.get("/player/:name", authMiddleware, async (req, res) => {
  const name = req.params.name;
  try {
    const r = await pool.query("SELECT id, player, player_id, event, value, time, created_at FROM logs WHERE player = $1 ORDER BY time DESC LIMIT 500", [name]);
    const rows = r.rows.map(row => ({ ...row, value: row.value ? JSON.parse(row.value) : null }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "db error" });
  }
});

// Players aggregation
app.get("/players", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT player, COUNT(*) AS events, MIN(time) AS first_seen, MAX(time) AS last_seen
      FROM logs
      GROUP BY player
      ORDER BY events DESC
      LIMIT 500
    `);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "db error" });
  }
});

// healthcheck
app.get("/health", (req, res) => res.json({ ok: true }));

// start
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
