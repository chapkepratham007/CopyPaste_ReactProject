import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { openDb } from "./db.js";
import { createOrUpdateClipSchema, readClipSchema } from "./validation.js";
import { ensureDirnameSafeId, nowMs, randomId } from "./util.js";

const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "db.sqlite");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

// Construct CORS origin - if it's just a hostname (no protocol), prepend https://
let corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
if (corsOrigin && !corsOrigin.startsWith("http://") && !corsOrigin.startsWith("https://")) {
  corsOrigin = "https://" + corsOrigin;
}
const CORS_ORIGIN = corsOrigin;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = await openDb({ filename: DB_PATH });

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for file uploads
const uploadLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many uploads, please try again later" },
});

const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", CORS_ORIGIN];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
      cb(null, `${nowMs()}-${randomId()}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB
  },
});

function computeExpiresAt(expiresInSeconds) {
  if (expiresInSeconds === null || expiresInSeconds === undefined) return null;
  return nowMs() + expiresInSeconds * 1000;
}

async function deleteClipAndFiles(clipId) {
  const rows = await db.all("SELECT storage_path FROM clip_files WHERE clip_id = ?", clipId);
  await db.run("DELETE FROM clips WHERE id = ?", clipId);

  for (const r of rows) {
    if (!r?.storage_path) continue;
    try {
      fs.unlinkSync(r.storage_path);
    } catch {
      // ignore
    }
  }
}

async function loadClipOr404(clipId) {
  const clip = await db.get("SELECT * FROM clips WHERE id = ?", clipId);
  if (!clip) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  return clip;
}

function assertNotExpired(clip) {
  if (clip.expires_at !== null && clip.expires_at <= nowMs()) {
    const err = new Error("Expired");
    err.status = 404;
    throw err;
  }
}

async function assertPassword(clip, password) {
  const ok = await bcrypt.compare(password, clip.password_hash);
  if (!ok) {
    const err = new Error("Invalid password");
    err.status = 401;
    throw err;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/clips/:clipId/meta", async (req, res, next) => {
  try {
    const { clipId } = req.params;
    if (!ensureDirnameSafeId(clipId)) return res.status(400).json({ error: "Invalid clip id" });

    const clip = await loadClipOr404(clipId);
    assertNotExpired(clip);

    const files = await db.all(
      "SELECT id, original_name, mime_type, size, created_at FROM clip_files WHERE clip_id = ? ORDER BY created_at ASC",
      clipId
    );

    res.json({
      id: clip.id,
      expiresAt: clip.expires_at,
      destroyOnRead: Boolean(clip.destroy_on_read),
      hasText: typeof clip.text === "string" && clip.text.length > 0,
      files,
      updatedAt: clip.updated_at,
      lastReadAt: clip.last_read_at,
    });
  } catch (e) {
    next(e);
  }
});

app.put("/api/clips/:clipId", async (req, res, next) => {
  try {
    const { clipId } = req.params;
    if (!ensureDirnameSafeId(clipId)) return res.status(400).json({ error: "Invalid clip id" });

    const parsed = createOrUpdateClipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const { password, text, expiresInSeconds, destroyOnRead } = parsed.data;
    const existing = await db.get("SELECT * FROM clips WHERE id = ?", clipId);

    const t = nowMs();

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.run(
        "INSERT INTO clips (id, password_hash, text, expires_at, destroy_on_read, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        clipId,
        passwordHash,
        text ?? "",
        computeExpiresAt(expiresInSeconds),
        destroyOnRead ? 1 : 0,
        t,
        t
      );

      return res.status(201).json({ ok: true, created: true });
    }

    assertNotExpired(existing);
    await assertPassword(existing, password);

    await db.run(
      "UPDATE clips SET text = ?, expires_at = ?, destroy_on_read = ?, updated_at = ? WHERE id = ?",
      text ?? "",
      computeExpiresAt(expiresInSeconds),
      destroyOnRead ? 1 : 0,
      t,
      clipId
    );

    res.json({ ok: true, created: false });
  } catch (e) {
    next(e);
  }
});

app.post("/api/clips/:clipId/read", async (req, res, next) => {
  try {
    const { clipId } = req.params;
    if (!ensureDirnameSafeId(clipId)) return res.status(400).json({ error: "Invalid clip id" });

    const parsed = readClipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const { password } = parsed.data;

    const clip = await loadClipOr404(clipId);
    assertNotExpired(clip);
    await assertPassword(clip, password);

    const files = await db.all(
      "SELECT id, original_name, mime_type, size, created_at FROM clip_files WHERE clip_id = ? ORDER BY created_at ASC",
      clipId
    );

    const t = nowMs();
    await db.run("UPDATE clips SET last_read_at = ? WHERE id = ?", t, clipId);

    if (clip.destroy_on_read) {
      await deleteClipAndFiles(clipId);
    }

    res.json({
      id: clip.id,
      text: clip.text,
      expiresAt: clip.expires_at,
      destroyOnRead: Boolean(clip.destroy_on_read),
      files,
    });
  } catch (e) {
    next(e);
  }
});

app.post("/api/clips/:clipId/files", uploadLimiter, upload.array("files", 10), async (req, res, next) => {
  try {
    const { clipId } = req.params;
    if (!ensureDirnameSafeId(clipId)) return res.status(400).json({ error: "Invalid clip id" });

    const password = req.header("x-clip-password");
    if (!password) return res.status(400).json({ error: "Missing x-clip-password header" });

    const clip = await loadClipOr404(clipId);
    assertNotExpired(clip);
    await assertPassword(clip, password);

    const uploaded = req.files || [];
    const t = nowMs();

    for (const f of uploaded) {
      await db.run(
        "INSERT INTO clip_files (id, clip_id, original_name, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        randomId(),
        clipId,
        f.originalname,
        f.mimetype,
        f.size,
        f.path,
        t
      );
    }

    await db.run("UPDATE clips SET updated_at = ? WHERE id = ?", t, clipId);

    res.json({ ok: true, uploaded: uploaded.length });
  } catch (e) {
    next(e);
  }
});

app.get("/api/clips/:clipId/files/:fileId", async (req, res, next) => {
  try {
    const { clipId, fileId } = req.params;
    if (!ensureDirnameSafeId(clipId)) return res.status(400).json({ error: "Invalid clip id" });

    const password = req.header("x-clip-password");
    if (!password) return res.status(400).json({ error: "Missing x-clip-password header" });

    const clip = await loadClipOr404(clipId);
    assertNotExpired(clip);
    await assertPassword(clip, password);

    const file = await db.get(
      "SELECT id, original_name, mime_type, size, storage_path FROM clip_files WHERE id = ? AND clip_id = ?",
      fileId,
      clipId
    );
    if (!file) return res.status(404).json({ error: "File record not found" });

    // Check if file exists on disk
    if (!fs.existsSync(file.storage_path)) {
      console.error(`File not found on disk: ${file.storage_path}`);
      return res.status(404).json({ error: "File not found on server" });
    }

    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Content-Disposition", `attachment; filename=\"${encodeURIComponent(file.original_name)}\"`);

    const stream = fs.createReadStream(file.storage_path);
    stream.on("error", (err) => {
      console.error(`Stream error for ${file.storage_path}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read file" });
      }
    });
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});

async function cleanupExpired() {
  const t = nowMs();
  const expired = await db.all("SELECT id, expires_at FROM clips WHERE expires_at IS NOT NULL AND expires_at <= ?", t);
  if (expired.length > 0) {
    console.log(`[cleanup] Found ${expired.length} expired clips at ${new Date(t).toISOString()}`);
    for (const c of expired) {
      console.log(`[cleanup] Deleting clip ${c.id}, expired at ${new Date(c.expires_at).toISOString()}`);
      await deleteClipAndFiles(c.id);
    }
  }
}

setInterval(() => {
  cleanupExpired().catch(() => {});
}, 60_000);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Server error",
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
