/** SQLite connection identity and durability configuration. */

import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

import { DatabaseSync } from "node:sqlite";

import { join, resolve } from "node:path";

import { StateStoreError } from "./errors.js";
import { applyMigrations, classifyDatabase } from "./migrations.js";

const BUSY_TIMEOUT_MS = 5_000;
const WAL_AUTOCHECKPOINT_PAGES = 1_000;

/** Repository-scoped state (the frozen Python default); DSH installs use dshDefaultStatePath. */
export function defaultStatePath(canonicalRepository: string): string {
  return join(resolve(canonicalRepository), ".palimpsest", "palimpsest.db");
}

/**
 * DSH deployment default for the orchestration ledger: shared per-host state
 * under $DSH_HOME, the same home the Ordarium ledger uses (双存储拓扑,
 * docs/01 §4). Falls back to ~/.dsh when DSH_HOME is unset.
 */
export function dshDefaultStatePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0
      ? join(homedir(), ".dsh")
      : configured;
  return join(dshHome, "palimpsest", "palimpsest.sqlite");
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
