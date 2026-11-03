/**
 * C6-R3 diagnostic — inspect the seeded orchestration databases without modifying them.
 * Usage: node inspect_state.mjs <state-dir>
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (dir === undefined) {
  process.stderr.write("usage: node inspect_state.mjs <state-dir>\n");
  process.exit(2);
}
for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".sqlite")).sort()) {
  const path = join(dir, file);
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
    process.stdout.write(`${file}: ${tables.join(", ")}\n`);
    for (const table of ["projects", "project_ir", "events", "journal_entries", "task_states", "tasks", "attempts"]) {
      if (!tables.includes(table)) continue;
      try {
        const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
        process.stdout.write(`  ${table}: ${count.n}\n`);
      } catch (error) {
        process.stdout.write(`  ${table}: ERROR ${error.message}\n`);
      }
    }
    if (tables.includes("projects")) {
      process.stdout.write(`  projects rows: ${JSON.stringify(db.prepare("SELECT * FROM projects LIMIT 5").all())}\n`);
    }
    db.close();
  } catch (error) {
    process.stdout.write(`${file}: ERROR ${error.message}\n`);
  }
}
