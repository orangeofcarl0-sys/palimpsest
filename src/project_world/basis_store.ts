/**
 * PLMP-LEAN-1 §D3-a — the durable, APPEND-ONCE store for an attempt's captured world basis.
 *
 *     Attempt provenance is immutable.
 *
 * This is the whole reason the store exists rather than a field on the attempt row. An attempt's basis
 * says where its work came from, and that fact does not change when the world moves: a later world is
 * what `assessCurrentness` reports, never a reason to rewrite what the attempt started from. So the
 * write path is a bare INSERT with a composite primary key and NO upsert — a second capture for one
 * attempt cannot overwrite the first even if a caller tries, which makes the invariant a property of
 * the storage rather than of the caller's discipline.
 *
 * Deliberately NOT event-sourced, and deliberately NOT a canonical Work table:
 *
 *   - it records EXECUTION PROVENANCE, not Work state. D3-0 already separated those (`AttemptResult`
 *     carries a `basisDigest`; the basis itself is the record the digest names), and putting it in the
 *     event log would add event types, projector cases, snapshot tables and aggregate validation to a
 *     slice whose entire point is to be a semantic foundation rather than a lifecycle change;
 *   - its history is append-only and self-contained, exactly like the verification history store, and
 *     it owns its own file for the same reason: a capability that keeps its own durable record does not
 *     reach into the Work ledger to do it.
 *
 * Layer: L2 (`src/project_world/`), beside `project_verification/`.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProjectWorldBasis, WorkDependency } from "../domain/world_basis.js";

/**
 * One captured basis, with the footprint it was resolved from.
 *
 * The FOOTPRINT is stored beside the basis because §D3-a requires currentness to RE-RESOLVE the same
 * dependency projection against the current world (`B_1 = Resolve(W_1, R_w)`) rather than comparing two
 * global snapshots. Re-resolution needs `R_w`, and `R_w` cannot be recovered from the basis: the basis
 * records what the dependencies RESOLVED to, not which selectors produced them.
 */
export interface CapturedWorldBasis {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly attemptId: string;
  readonly taskId: string;
  readonly dependency: WorkDependency;
  readonly basis: ProjectWorldBasis;
  /** When the capture happened. Provenance only — never an input to any assessment. */
  readonly capturedAt: string;
}

export type CaptureOutcome =
  | { readonly state: "APPENDED"; readonly record: CapturedWorldBasis }
  /** The attempt already had a basis. The FIRST capture is the attempt's provenance, forever. */
  | { readonly state: "EXISTING"; readonly record: CapturedWorldBasis };

export interface AttemptWorldBasisStore {
  read(input: { readonly projectId: string; readonly attemptId: string }): CapturedWorldBasis | null;
  /** Append the FIRST basis for an attempt. A later capture is reported, never applied. */
  appendOnce(record: CapturedWorldBasis): CaptureOutcome;
  close(): void;
}

export class SqliteAttemptWorldBasisStore implements AttemptWorldBasisStore {
  readonly #database: DatabaseSync;
  readonly #read: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS attempt_world_basis (" +
        "project_id TEXT NOT NULL, " +
        "attempt_id TEXT NOT NULL, " +
        "task_id TEXT NOT NULL, " +
        "basis_digest TEXT NOT NULL, " +
        "record_json BLOB NOT NULL, " +
        "captured_at TEXT NOT NULL, " +
        // The composite key is what makes the immutability structural: there is no second row to write.
        "PRIMARY KEY (project_id, attempt_id))",
    );
    this.#read = this.#database.prepare(
      "SELECT record_json FROM attempt_world_basis WHERE project_id = ? AND attempt_id = ?",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO attempt_world_basis (project_id, attempt_id, task_id, basis_digest, record_json, captured_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  read(input: { readonly projectId: string; readonly attemptId: string }): CapturedWorldBasis | null {
    const row = this.#read.get(input.projectId, input.attemptId) as { record_json: Uint8Array } | undefined;
    if (row === undefined) return null;
    return decodeRecord(row.record_json);
  }

  appendOnce(record: CapturedWorldBasis): CaptureOutcome {
    const existing = this.read({ projectId: record.projectId, attemptId: record.attemptId });
    if (existing !== null) return Object.freeze({ state: "EXISTING" as const, record: existing });
    try {
      this.#insert.run(
        record.projectId,
        record.attemptId,
        record.taskId,
        record.basis.basisDigest,
        new TextEncoder().encode(JSON.stringify(record)),
        record.capturedAt,
      );
    } catch (error) {
      /**
       * A concurrent capture won the race. Re-read rather than treating it as a failure: the attempt
       * still has exactly one basis, which is the invariant that matters — losing the race is not an
       * error, and inventing a second answer would be.
       */
      const raced = this.read({ projectId: record.projectId, attemptId: record.attemptId });
      if (raced === null) throw error;
      return Object.freeze({ state: "EXISTING" as const, record: raced });
    }
    return Object.freeze({ state: "APPENDED" as const, record });
  }

  close(): void {
    this.#database.close();
  }
}

function decodeRecord(blob: Uint8Array): CapturedWorldBasis {
  return JSON.parse(new TextDecoder().decode(blob)) as CapturedWorldBasis;
}
