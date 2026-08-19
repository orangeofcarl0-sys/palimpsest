/**
 * Telemetry persistence (Research line R11). The ModelPerformanceTable is a
 * host-facing in-memory face; this module snapshots it into a dedicated
 * table of the orchestration SQLite so cumulative success/cost data survives
 * a process restart.
 *
 * The table is deliberately *not* part of the projection contract: it does
 * not live in PROJECTION_TABLES, is not replayed by rebuild_projections and
 * never participates in the snapshot digest, so the frozen fixture parity is
 * untouched. Persistence is a snapshot write (idempotent, ordered): the
 * latest `persistTelemetry()` call is the durable state.
 */

import type { DatabaseSync } from "node:sqlite";

import { ModelPerformanceTable } from "./performance_table.js";

export const TELEMETRY_TABLE = "palimpsest_telemetry";
export const TELEMETRY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS palimpsest_telemetry (
    task_type TEXT NOT NULL,
    model TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    successes INTEGER NOT NULL,
    cost REAL NOT NULL,
    PRIMARY KEY (task_type, model)
);`;

export function ensureTelemetryTable(connection: DatabaseSync): void {
  connection.exec(TELEMETRY_TABLE_SQL);
}

/** Snapshot-write the whole table into the extension table (idempotent). */
export function writeTelemetry(
  connection: DatabaseSync,
  table: ModelPerformanceTable,
): void {
  ensureTelemetryTable(connection);
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.exec(`DELETE FROM ${TELEMETRY_TABLE}`);
    const insert = connection.prepare(
      `INSERT INTO ${TELEMETRY_TABLE}(task_type, model, attempts, successes, cost)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const row of table.snapshot().rows) {
      insert.run(row.task_type, row.model, row.attempts, row.successes, row.avgAttemptCost * row.attempts);
    }
    connection.exec("COMMIT");
  } catch (error) {
    try {
      connection.exec("ROLLBACK");
    } catch {
      // SQLite may already have rolled back.
    }
    throw error;
  }
}

/** Rebuild an in-memory table from the durable rows. */
export function rebuildTelemetry(connection: DatabaseSync): ModelPerformanceTable {
  ensureTelemetryTable(connection);
  const table = new ModelPerformanceTable();
  const rows = connection
    .prepare(
      `SELECT task_type, model, attempts, successes, cost FROM ${TELEMETRY_TABLE}
       ORDER BY task_type, model`,
    )
    .all() as Array<{
    task_type: string;
    model: string;
    attempts: number;
    successes: number;
    cost: number;
  }>;
  for (const row of rows) {
    // Replay each recorded attempt: successes first so the final counts match.
    const perAttemptCost = row.attempts === 0 ? 0 : row.cost / row.attempts;
    for (let index = 0; index < row.attempts; index += 1) {
      table.record({
        task_type: row.task_type,
        model: row.model,
        outcome: index < row.successes ? "success" : "failure",
        cost: perAttemptCost,
      });
    }
  }
  return table;
}