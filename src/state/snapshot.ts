/** Normalized snapshots and projection reset helpers. */

import type { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/index.js";

export const PROJECTION_TABLES = [
  "projects",
  "tasks",
  "attempts",
  "evidence",
  "promotions",
  "scheduler_control",
  "projection_cursors",
] as const;

type Row = Record<string, any>;

export function clearProjections(connection: DatabaseSync): void {
  for (const table of PROJECTION_TABLES) {
    connection.exec(`DELETE FROM ${table}`);
  }
}

function normalizeCell(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(value));
  }
  return value;
}

export function normalizedSnapshot(connection: DatabaseSync): Row {
  const result: Row = {};
  for (const table of PROJECTION_TABLES) {
    const columns = (
      connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    ).map((row) => row.name);
    const order = columns.join(", ");
    const rows = connection.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all() as Row[];
    result[table] = rows.map((row) => {
      const normalized: Row = {};
      for (const column of columns) {
        normalized[column] = normalizeCell(row[column]);
      }
      return normalized;
    });
  }
  return result;
}

export function snapshotDigest(connection: DatabaseSync): string {
  return canonicalDigest(normalizedSnapshot(connection));
}
