/** SQLite connection identity and durability configuration. */

import { mkdirSync } from "node:fs";

import { DatabaseSync } from "node:sqlite";

import { join, resolve } from "node:path";

import { StateStoreError } from "./errors.js";
import { applyMigrations, classifyDatabase } from "./migrations.js";

const BUSY_TIMEOUT_MS = 5_000;
const WAL_AUTOCHECKPOINT_PAGES = 1_000;

export function defaultStatePath(canonicalRepository: string): string {
  return join(resolve(canonicalRepository), ".palimpsest", "palimpsest.db");
}

export function openDatabase(
  path: string,
  options: { clock: () => string },
): DatabaseSync {
  const resolved = resolve(path);
  mkdirSync(join(resolved, ".."), { recursive: true });
  const connection = new DatabaseSync(resolved);
  try {
    const initialize = classifyDatabase(connection);
    connection.exec("PRAGMA foreign_keys = ON");
    connection.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    const mode = (
      connection.prepare("PRAGMA journal_mode = WAL").get() as {
        journal_mode: string;
      }
    ).journal_mode;
    if (mode.toLowerCase() !== "wal") {
      throw new StateStoreError(`SQLite refused WAL mode and returned '${mode}'`);
    }
    connection.exec("PRAGMA synchronous = FULL");
    connection.exec(`PRAGMA wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES}`);
    applyMigrations(connection, { initialize, appliedAt: options.clock });
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}
