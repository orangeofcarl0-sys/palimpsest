/**
 * G10-D3 PersistentPoint store — the ONE canonical Palimpsest-owned
 * continuity identity store (D0 §13/§14 decision: a dedicated, clearly
 * Palimpsest-owned durable repository; never Ordarium state — effect
 * authority ≠ continuity semantic ownership).
 *
 * Requirements (§60):
 *   - durable across process restart (SQLite via node:sqlite, own file);
 *   - exactly one canonical identity store (this store; caches/views must be
 *     explicitly derived);
 *   - explicit create/register only (Binding resolution never creates;
 *     runtime realization never creates — fail closed on missing points);
 *   - get by id, list canonical points;
 *   - duplicate id is idempotent ONLY for a byte-identical artifact — a
 *     conflicting artifact fails closed (no last-write-wins identity drift);
 *   - no implicit delete in the D campaign (no delete API at all).
 *
 * Concurrency / corruption (§61): the id is the SQLite PRIMARY KEY, so
 * duplicate registration is atomic even across processes; a malformed stored
 * record fails closed on read (never silently skipped) — identity semantics
 * cannot drift by last-write-wins or by half-written rows.
 *
 * The store is injected through the `PersistentPointStore` port; the SQLite
 * implementation is the canonical default. Embedders may substitute a
 * repository without changing semantics.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type { PersistentPoint, PersistentPointId } from "./point.js";
import { parsePersistentPoint } from "./point.js";

export class ContinuityStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContinuityStoreError";
  }
}

export interface PersistentPointStore {
  /** Explicit registration. Idempotent only for a byte-identical artifact; conflicts fail closed. */
  register(point: PersistentPoint): Promise<void>;
  /** Canonical lookup; undefined when the id was never registered. */
  get(id: PersistentPointId): Promise<PersistentPoint | undefined>;
  /** All canonical points (stable id order). */
  list(): Promise<readonly PersistentPoint[]>;
}

function parseStoredArtifact(json: string): PersistentPoint {
  try {
    return parsePersistentPoint(JSON.parse(json));
  } catch (error) {
    // §61: a malformed stored record fails closed — never skipped, never repaired.
    throw new ContinuityStoreError(
      `continuity store contains a malformed PersistentPoint record: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

export class SqlitePersistentPointStore implements PersistentPointStore {
  readonly #database: DatabaseSync;
  readonly #selectOne: Statement;
  readonly #selectAll: Statement;
  readonly #insert: Statement;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    const path = databasePath === ":memory:" ? ":memory:" : join(databasePath);
    this.#database = new DatabaseSync(path);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS persistent_points (" +
        "persistent_point_id TEXT PRIMARY KEY, " +
        "artifact_json TEXT NOT NULL)",
    );
    this.#selectOne = this.#database.prepare(
      "SELECT artifact_json FROM persistent_points WHERE persistent_point_id = ?",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT persistent_point_id, artifact_json FROM persistent_points ORDER BY persistent_point_id",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO persistent_points (persistent_point_id, artifact_json) VALUES (?, ?)",
    );
  }

  async register(point: PersistentPoint): Promise<void> {
    // Only canonical (parsed) artifacts enter the store.
    const canonical = parsePersistentPoint(JSON.parse(JSON.stringify(point)));
    const artifactJson = JSON.stringify({
      schemaVersion: canonical.schemaVersion,
      persistentPointId: canonical.persistentPointId,
    });
    const existing = this.#selectOne.get(canonical.persistentPointId) as
      | { artifact_json: string }
      | undefined;
    if (existing !== undefined) {
      if (existing.artifact_json !== artifactJson) {
        // §61: a conflicting artifact under a registered id fails closed —
        // last-write-wins must never change identity semantics.
        throw new ContinuityStoreError(
          `PersistentPoint "${canonical.persistentPointId}" is already registered with a different artifact`,
        );
      }
      return; // byte-identical duplicate: idempotent no-op
    }
    try {
      this.#insert.run(canonical.persistentPointId, artifactJson);
    } catch (error) {
      // Cross-process race: re-read and apply the same comparison.
      const raced = this.#selectOne.get(canonical.persistentPointId) as
        | { artifact_json: string }
        | undefined;
      if (raced !== undefined && raced.artifact_json === artifactJson) return;
      if (raced !== undefined) {
        throw new ContinuityStoreError(
          `PersistentPoint "${canonical.persistentPointId}" is already registered with a different artifact`,
        );
      }
      throw new ContinuityStoreError(
        `failed to register PersistentPoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async get(id: PersistentPointId): Promise<PersistentPoint | undefined> {
    const row = this.#selectOne.get(id) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    return parseStoredArtifact(row.artifact_json);
  }

  async list(): Promise<readonly PersistentPoint[]> {
    const rows = this.#selectAll.all() as Array<{
      persistent_point_id: string;
      artifact_json: string;
    }>;
    return Object.freeze(rows.map((row) => parseStoredArtifact(row.artifact_json)));
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default store path: $DSH_HOME/palimpsest/continuity.sqlite (Palimpsest-owned). */
export function defaultContinuityPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0
      ? join(homedir(), ".dsh")
      : configured;
  return join(dshHome, "palimpsest", "continuity.sqlite");
}
