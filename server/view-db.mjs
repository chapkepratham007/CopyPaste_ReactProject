import { openDb } from "./src/db.js";

const DB_PATH = process.env.DB_PATH || new URL("./data/db.sqlite", import.meta.url).pathname;

async function main() {
  const db = await openDb({ filename: DB_PATH });

  console.log("\n=== CLIPS ===");
  const clips = await db.all("SELECT * FROM clips ORDER BY created_at DESC");
  if (clips.length === 0) {
    console.log("No clips found.");
  } else {
    for (const c of clips) {
      console.log(`\nID: ${c.id}`);
      console.log(`  Text length: ${c.text?.length || 0} chars`);
      console.log(`  Expires: ${c.expires_at ? new Date(c.expires_at).toLocaleString() : "Never"}`);
      console.log(`  Destroy on read: ${c.destroy_on_read ? "Yes" : "No"}`);
      console.log(`  Created: ${new Date(c.created_at).toLocaleString()}`);
      console.log(`  Updated: ${new Date(c.updated_at).toLocaleString()}`);
    }
  }

  console.log("\n=== FILES ===");
  const files = await db.all(`
    SELECT f.*, c.id as clip_id 
    FROM clip_files f 
    JOIN clips c ON f.clip_id = c.id 
    ORDER BY f.created_at DESC
  `);
  if (files.length === 0) {
    console.log("No files found.");
  } else {
    for (const f of files) {
      console.log(`\nFile: ${f.original_name}`);
      console.log(`  Clip ID: ${f.clip_id}`);
      console.log(`  Size: ${Math.round(f.size / 1024 * 10) / 10} KB`);
      console.log(`  Type: ${f.mime_type}`);
      console.log(`  Storage: ${f.storage_path}`);
    }
  }

  console.log(`\nTotal: ${clips.length} clips, ${files.length} files\n`);

  await db.close();
}

main().catch(console.error);
