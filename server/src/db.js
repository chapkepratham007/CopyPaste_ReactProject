import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openDb({ filename }) {
  const db = await open({
    filename,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA foreign_keys = ON;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      expires_at INTEGER,
      destroy_on_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_read_at INTEGER
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS clip_files (
      id TEXT PRIMARY KEY,
      clip_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
    );
  `);

  await db.exec("CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON clips(expires_at);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_clip_files_clip_id ON clip_files(clip_id);");

  return db;
}
