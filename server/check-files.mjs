import path from "path";
import fs from "fs";
import { openDb } from "./src/db.js";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "db.sqlite");

async function checkFiles() {
  const db = await openDb({ filename: DB_PATH });
  
  console.log("=== File Storage Diagnostic ===\n");
  
  const files = await db.all("SELECT * FROM clip_files ORDER BY created_at DESC");
  console.log(`Total files in database: ${files.length}\n`);
  
  let missing = 0;
  let found = 0;
  
  for (const f of files) {
    const exists = fs.existsSync(f.storage_path);
    const status = exists ? "✓ EXISTS" : "✗ MISSING";
    console.log(`${status} | ${f.original_name}`);
    console.log(`       ID: ${f.id}`);
    console.log(`       Path: ${f.storage_path}`);
    console.log(`       Size: ${f.size} bytes`);
    console.log(`       Clip: ${f.clip_id}`);
    console.log();
    
    if (exists) found++;
    else missing++;
  }
  
  console.log("=== Summary ===");
  console.log(`Found on disk: ${found}`);
  console.log(`Missing: ${missing}`);
  
  if (missing > 0) {
    console.log("\n⚠️  Some files are missing from disk but still in database.");
    console.log("   This can happen if:");
    console.log("   - Files were manually deleted");
    console.log("   - Server was moved to different directory");
    console.log("   - Database was copied without the uploads folder");
  }
  
  await db.close();
}

checkFiles().catch(console.error);
