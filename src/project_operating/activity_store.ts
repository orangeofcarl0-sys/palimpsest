/**
 * G10-AB — the append-only management activity store.
 *
 * A small project-scoped append-only store is justified because NO existing
 * owner records "Palimpsest selected candidate C under profile P and observed
 * result R". It may share a physical database with the operator preference
 * stores while logical ownership stays separate (its own table).
 *
 * Per-project `sequence` + `previousRecordDigest` give LOCAL tamper-evidence
 * under normal application assumptions. This is not security against a hostile
 * database administrator, and is not marketed as such.
 *
 * This store is NOT a universal Project History store, and it never becomes
 * semantic truth: it references canonical owners rather than copying them.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildManagementActivityRecord,
  classifyUnresolvedActivity,
  interruptedReasonOf,
  isTerminalManagementDecision,
  managementActivityDigestOf,
  unresolvedActivityOf,
  type CanonicalOutcomeRef,
  type ManagementActivityDecision,
  type ManagementActivityRecord,
  type ManagementActivitySubjectRef,
  type ProjectBasisRef,
  type UnresolvedActivityClass,
  type UnresolvedActivityProbe,
} from "./activity.js";

/** The genesis previous-digest of a project's activity chain. */
export const MANAGEMENT_ACTIVITY_GENESIS = "0".repeat(64);

interface ActivityRow {
  readonly record_json: Uint8Array;
}

function decodeRow(row: ActivityRow): ManagementActivityRecord {
  return JSON.parse(new TextDecoder().decode(row.record_json)) as ManagementActivityRecord;
}

export interface AppendActivityInput {
  readonly projectId: string;
  readonly candidateRef: string;
  readonly candidateDigest: string;
  readonly actionClass: string;
  readonly subjects: readonly ManagementActivitySubjectRef[];
  readonly managementProfileRef: string;
  readonly workModePreferenceRef?: string | null | undefined;
  readonly projectBasis: ProjectBasisRef;
  readonly decision: ManagementActivityDecision;
  readonly confirmed: boolean;
  readonly reason: string;
  readonly typedReasonCode?: string | null | undefined;
  readonly startedAt: string;
  readonly finishedAt?: string | null | undefined;
  readonly canonicalOutcomeRefs?: readonly CanonicalOutcomeRef[] | undefined;
  readonly noncanonicalOutcomeSummary?: string | null | undefined;
  readonly supersedesRecordId?: string | null | undefined;
}

export class SqliteManagementActivityStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;
  readonly #maxSeq: ReturnType<DatabaseSync["prepare"]>;
  readonly #tip: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS management_activity (" +
        "project_id TEXT NOT NULL, " +
        "sequence INTEGER NOT NULL, " +
        "record_id TEXT NOT NULL, " +
        "record_json BLOB NOT NULL, " +
        "record_digest TEXT NOT NULL, " +
        "previous_record_digest TEXT NOT NULL, " +
        "appended_at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, sequence))",
    );
    this.#database.exec(
      "CREATE INDEX IF NOT EXISTS management_activity_record ON management_activity(project_id, record_id)",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT record_json FROM management_activity WHERE project_id = ? ORDER BY sequence",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO management_activity (project_id, sequence, record_id, record_json, record_digest, previous_record_digest, appended_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.#maxSeq = this.#database.prepare(
      "SELECT MAX(sequence) AS max_seq FROM management_activity WHERE project_id = ?",
    );
    this.#tip = this.#database.prepare(
      "SELECT record_digest FROM management_activity WHERE project_id = ? ORDER BY sequence DESC LIMIT 1",
    );
  }

  close(): void {
    this.#database.close();
  }

  /** Append one activity record, chaining it onto the project's history. */
  append(input: AppendActivityInput): ManagementActivityRecord {
    const seqRow = this.#maxSeq.get(input.projectId) as { max_seq: number | null } | undefined;
    const sequence = (seqRow?.max_seq ?? 0) + 1;
    const tipRow = this.#tip.get(input.projectId) as { record_digest: string } | undefined;
    const previousRecordDigest = tipRow?.record_digest ?? MANAGEMENT_ACTIVITY_GENESIS;
    const record = buildManagementActivityRecord({
      projectId: input.projectId,
      sequence,
      candidateRef: input.candidateRef,
      candidateDigest: input.candidateDigest,
      actionClass: input.actionClass,
      subjects: input.subjects,
      managementProfileRef: input.managementProfileRef,
      workModePreferenceRef: input.workModePreferenceRef ?? null,
      projectBasis: input.projectBasis,
      decision: input.decision,
      confirmed: input.confirmed,
      reason: input.reason,
      typedReasonCode: input.typedReasonCode ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      canonicalOutcomeRefs: input.canonicalOutcomeRefs ?? [],
      noncanonicalOutcomeSummary: input.noncanonicalOutcomeSummary ?? null,
      supersedesRecordId: input.supersedesRecordId ?? null,
      previousRecordDigest,
    });
    this.#insert.run(
      input.projectId,
      sequence,
      record.recordId,
      new TextEncoder().encode(JSON.stringify(record)),
      record.recordDigest,
      previousRecordDigest,
      record.finishedAt ?? record.startedAt,
    );
    return record;
  }

  /** Every record for a project, oldest first (the append-only history). */
  list(projectId: string): readonly ManagementActivityRecord[] {
    return Object.freeze(
      (this.#selectAll.all(projectId) as unknown as ActivityRow[]).map((row) => decodeRow(row)),
    );
  }

  /** The records that still need a terminal. */
  unresolved(projectId: string): readonly ManagementActivityRecord[] {
    return unresolvedActivityOf(this.list(projectId));
  }

  /**
   * Mechanically classify and terminalize an unresolved record. It NEVER writes
   * a success: the terminal decision is `interrupted` with a reason naming the
   * classification, and any canonical ref that is provably present is linked
   * rather than asserted.
   */
  terminalizeInterrupted(input: {
    readonly projectId: string;
    readonly recordId: string;
    readonly probe: UnresolvedActivityProbe;
    readonly finishedAt: string;
    readonly canonicalOutcomeRefs?: readonly CanonicalOutcomeRef[] | undefined;
  }): { readonly record: ManagementActivityRecord; readonly classification: UnresolvedActivityClass } {
    const existing = this.list(input.projectId).find((row) => row.recordId === input.recordId);
    if (existing === undefined) {
      throw new Error(`management activity ${input.recordId} does not exist`);
    }
    if (isTerminalManagementDecision(existing.decision)) {
      throw new Error(`management activity ${input.recordId} is already terminal (${existing.decision})`);
    }
    const classification = classifyUnresolvedActivity(existing, input.probe);
    const record = this.append({
      projectId: existing.projectId,
      candidateRef: existing.candidateRef,
      candidateDigest: existing.candidateDigest,
      actionClass: existing.actionClass,
      subjects: existing.subjects,
      managementProfileRef: existing.managementProfileRef,
      workModePreferenceRef: existing.workModePreferenceRef,
      projectBasis: existing.projectBasis,
      decision: "interrupted",
      confirmed: existing.confirmed,
      reason: interruptedReasonOf(classification),
      typedReasonCode: `unresolved_${classification.toLowerCase()}`,
      startedAt: existing.startedAt,
      finishedAt: input.finishedAt,
      canonicalOutcomeRefs: input.canonicalOutcomeRefs ?? [],
      noncanonicalOutcomeSummary: null,
      supersedesRecordId: existing.recordId,
    });
    return Object.freeze({ record, classification });
  }

  /** Verify the local chain: contiguous sequence and linked digests. */
  verifyChain(projectId: string): { readonly ok: boolean; readonly problem?: string } {
    let previous = MANAGEMENT_ACTIVITY_GENESIS;
    let expected = 1;
    for (const record of this.list(projectId)) {
      if (record.sequence !== expected) {
        return { ok: false, problem: `sequence gap at ${record.sequence} (expected ${expected})` };
      }
      if (record.previousRecordDigest !== previous) {
        return { ok: false, problem: `broken chain at sequence ${record.sequence}` };
      }
      // Recompute the content digest: a rewritten body breaks the chain even if
      // the sequence and pointer are intact.
      if (managementActivityDigestOf(record) !== record.recordDigest) {
        return { ok: false, problem: `content digest mismatch at sequence ${record.sequence}` };
      }
      previous = record.recordDigest;
      expected += 1;
    }
    return { ok: true };
  }
}
