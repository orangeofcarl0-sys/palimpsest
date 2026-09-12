/**
 * G10-E1 AttemptCatalogPort — read-only canonical Attempt-state validation
 * (§34). The default implementation reads the Work orchestration database's
 * `attempts` projection (read-only; the coordination layer never writes Work
 * truth). Terminal states (COMPLETED/FAILED/EXPIRED/CANCELLED/STALE) refuse
 * NEW participation starts; LEASED/RUNNING are admissible.
 */

import { DatabaseSync } from "node:sqlite";

import type { AttemptRef } from "./participation.js";
import { ParticipationError } from "./participation.js";

const TERMINAL_ATTEMPT_STATES = new Set(["COMPLETED", "FAILED", "EXPIRED", "CANCELLED", "STALE"]);

export interface AttemptCatalogPort {
  assertAdmissibleAttempt(attempt: AttemptRef): Promise<void>;
}

export class SqliteAttemptCatalog implements AttemptCatalogPort {
  readonly #database: DatabaseSync;

  constructor(orchestrationDatabasePath: string) {
    // Read-only handle onto the canonical Work store.
    this.#database = new DatabaseSync(orchestrationDatabasePath, { readOnly: true });
  }

  async assertAdmissibleAttempt(attempt: AttemptRef): Promise<void> {
    const row = this.#database
      .prepare("SELECT state FROM attempts WHERE project_id = ? AND attempt_id = ?")
      .get(attempt.projectId, attempt.attemptId) as { state: string } | undefined;
    if (row === undefined) {
      throw new ParticipationError(
        "attempt_unknown",
        `attempt "${attempt.attemptId}" does not exist in project "${attempt.projectId}" (no invented attempt ids)`,
      );
    }
    if (TERMINAL_ATTEMPT_STATES.has(row.state)) {
      throw new ParticipationError(
        "attempt_terminal",
        `attempt "${attempt.attemptId}" is terminal (${row.state}) — new participation cannot start`,
      );
    }
  }
}
