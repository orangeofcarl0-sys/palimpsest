/**
 * PLMP-LEAN-1 §D3-d2 — the append-once store for DERIVED RESULT CANDIDATES.
 *
 * A candidate is a real result identity that later stages must be able to name: verification addresses it
 * by `candidateId`, and eligibility will address it by its manifest. So it needs to be recorded rather
 * than held in a variable.
 *
 * APPEND-ONCE, for the same reason the basis store is: a candidate is the output of ONE operation
 * identity, and re-running that operation must converge on the SAME record rather than accumulate a
 * second identity for the same work. A bare INSERT with the candidate id as the primary key makes that a
 * property of the storage rather than of a caller's discipline — and a losing race re-reads instead of
 * failing, because "exactly one candidate for one derivation" is the invariant that matters.
 *
 * It is deliberately NOT a Work table: a derivation is not a Work execution, and giving it a place in the
 * Work ledger would make the execution history assert that a Work ran when none did.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { DerivedResultCandidate } from "./derivation.js";

export interface DerivedResultCandidateStore {
  read(candidateId: string): DerivedResultCandidate | null;
  /** All candidates for one derivation, so a retry can find what the operation already produced. */
  readByDerivation(derivationId: string): readonly DerivedResultCandidate[];
  appendOnce(candidate: DerivedResultCandidate): { readonly state: "APPENDED" | "EXISTING"; readonly candidate: DerivedResultCandidate };
  close(): void;
}

export class SqliteDerivedResultCandidateStore implements DerivedResultCandidateStore {
  readonly #database: DatabaseSync;
  readonly #read: ReturnType<DatabaseSync["prepare"]>;
  readonly #byDerivation: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS derived_result_candidate (" +
        "candidate_id TEXT NOT NULL, " +
        "derivation_id TEXT NOT NULL, " +
        "project_id TEXT NOT NULL, " +
        "task_id TEXT NOT NULL, " +
        "result_manifest_digest TEXT NOT NULL, " +
        "candidate_json BLOB NOT NULL, " +
        "derived_at TEXT NOT NULL, " +
        "PRIMARY KEY (candidate_id))",
    );
    this.#database.exec(
      "CREATE INDEX IF NOT EXISTS derived_result_candidate_derivation ON derived_result_candidate(derivation_id)",
    );
    this.#read = this.#database.prepare("SELECT candidate_json FROM derived_result_candidate WHERE candidate_id = ?");
    this.#byDerivation = this.#database.prepare(
      "SELECT candidate_json FROM derived_result_candidate WHERE derivation_id = ? ORDER BY candidate_id",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO derived_result_candidate (candidate_id, derivation_id, project_id, task_id, result_manifest_digest, candidate_json, derived_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
  }

  read(candidateId: string): DerivedResultCandidate | null {
    const row = this.#read.get(candidateId) as unknown as { candidate_json: Uint8Array } | undefined;
    return row === undefined ? null : decode(row.candidate_json);
  }

  readByDerivation(derivationId: string): readonly DerivedResultCandidate[] {
    const rows = this.#byDerivation.all(derivationId) as unknown as readonly { candidate_json: Uint8Array }[];
    return Object.freeze(rows.map((row) => decode(row.candidate_json)));
  }

  appendOnce(candidate: DerivedResultCandidate): { readonly state: "APPENDED" | "EXISTING"; readonly candidate: DerivedResultCandidate } {
    const existing = this.read(candidate.candidateId);
    if (existing !== null) return Object.freeze({ state: "EXISTING" as const, candidate: existing });
    try {
      this.#insert.run(
        candidate.candidateId,
        candidate.derivation.derivationId,
        candidate.projectId,
        candidate.taskId,
        candidate.resultManifestDigest,
        new TextEncoder().encode(JSON.stringify(candidate)),
        candidate.derivedAt,
      );
    } catch {
      // A concurrent append won. Re-read rather than fail: one candidate per operation identity is the
      // invariant, and losing the race is not an error.
      const raced = this.read(candidate.candidateId);
      if (raced === null) throw new Error("the candidate could not be recorded and is not present");
      return Object.freeze({ state: "EXISTING" as const, candidate: raced });
    }
    return Object.freeze({ state: "APPENDED" as const, candidate });
  }

  close(): void {
    this.#database.close();
  }
}

function decode(blob: Uint8Array): DerivedResultCandidate {
  return JSON.parse(new TextDecoder().decode(blob)) as DerivedResultCandidate;
}
