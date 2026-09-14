/**
 * G10-P attention marks — deployment-local mechanical bookkeeping (NOT semantic truth).
 *
 * A mark only remembers which accepted boundary revision this deployment has already
 * raised attention for. Losing marks causes at most a repeated attention signal, never
 * a semantic change; the boundary/collaboration truth stays in its canonical stores.
 */

import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

export interface AttentionMarkStore {
  read(key: string): Promise<string | undefined>;
  write(key: string, value: string): Promise<void>;
  clear(key: string): Promise<void>;
}

export class SqliteAttentionMarkStore implements AttentionMarkStore {
  readonly #database: DatabaseSync;
  readonly #select: ReturnType<DatabaseSync["prepare"]>;
  readonly #upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly #delete: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS attention_marks (" +
        "mark_key TEXT PRIMARY KEY, " +
        "mark_value TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL)",
    );
    this.#select = this.#database.prepare("SELECT mark_value FROM attention_marks WHERE mark_key = ?");
    this.#upsert = this.#database.prepare(
      "INSERT INTO attention_marks (mark_key, mark_value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT (mark_key) DO UPDATE SET mark_value = excluded.mark_value, updated_at = excluded.updated_at",
    );
    this.#delete = this.#database.prepare("DELETE FROM attention_marks WHERE mark_key = ?");
  }

  async read(key: string): Promise<string | undefined> {
    return (this.#select.get(key) as { mark_value: string } | undefined)?.mark_value;
  }

  async write(key: string, value: string): Promise<void> {
    this.#upsert.run(key, value, new Date().toISOString());
  }

  async clear(key: string): Promise<void> {
    this.#delete.run(key);
  }

  close(): void {
    this.#database.close();
  }
}

export function defaultAttentionMarkPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "attention.sqlite");
}
