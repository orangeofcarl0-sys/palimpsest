/**
 * G10-F0 coordination store error vocabulary, extracted into its own module
 * (§22–§24) so artifact-domain parsers (participation, messages, commitment)
 * can validate strictly WITHOUT importing the store implementation — and so
 * the store can compose those parsers without a runtime import cycle.
 *
 * `CoordinationStoreError` is the fail-closed envelope for malformed history
 * (malformed payload, unknown type, invalid append request).
 *
 * `CoordinationConflictError` distinguishes the three failure families the F0
 * store contract requires (§17) while keeping the historical `kind:
 * "coordination_conflict"` discriminant that existing callers/tests match:
 *   - `database_busy`    — SQLite write contention (bounded wait exhausted);
 *   - `head_mismatch`    — `expectedHeadSeq` no longer matches the canonical head
 *                          (a stale state-machine write — re-read and re-evaluate);
 *   - `event_conflict`   — an eventId already exists with different content;
 *   - `recovery_required`— a declared-atomic transition is partially present in
 *                          history (legacy partial state or corruption) — F0
 *                          NEVER silently completes it (§18).
 */

export class CoordinationStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationStoreError";
  }
}

export type CoordinationConflictCategory =
  | "head_mismatch"
  | "event_conflict"
  | "recovery_required"
  | "database_busy";

export class CoordinationConflictError extends Error {
  /** Historical discriminant retained — semantically "coordination_conflict". */
  readonly kind = "coordination_conflict" as const;

  constructor(
    readonly category: CoordinationConflictCategory,
    message: string,
  ) {
    super(message);
    this.name = "CoordinationConflictError";
  }
}
