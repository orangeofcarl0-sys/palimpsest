/**
 * G10-AD §12 — the narrow, append-only Project Verification history store.
 *
 *   ProjectVerificationStore ≠ ProjectIR       ≠ WorkEventStore
 *   ProjectVerificationStore ≠ ProofEvidenceStore
 *   ProjectVerificationStore ≠ OrganizationMemory
 *
 * It owns ONE thing: the verification request/run history of a project. It never
 * copies the ProjectIR, never writes Work Evidence, never publishes Proof and
 * never admits Reasoning. The ProjectIR stays the project truth owner; a run
 * only ever REFERENCES the subject digest it observed.
 *
 * CRASH-HONEST by construction (§12): the STARTED event is appended BEFORE the
 * provider call and the COMPLETED event AFTER the result is observed, so a crash
 * in between leaves an unresolved STARTED event with NO fabricated verdict. The
 * fold (`foldProjectVerificationRuns`) can then only ever report `STARTED`.
 *
 * Per-project `sequence` + `previousRecordDigest` + a recomputed content digest
 * give LOCAL tamper-evidence, exactly like the G10-AB management-activity store.
 * This is not security against a hostile database administrator and is not
 * marketed as such.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildProjectVerificationRunEvent,
  foldProjectVerificationRuns,
  parseProjectVerificationRunEvent,
  projectVerificationEventDigestOf,
  projectVerificationRunIdOf,
  type ProjectHeadVerificationSubject,
  type ProjectVerificationSubject,
  type ProjectVerificationFreshness,
  type ProjectVerificationRun,
  type ProjectVerificationRunEvent,
  type ProjectVerificationRunEventInput,
  type ProjectVerificationVerdict,
} from "./artifacts.js";
import type { VerifierIndependenceClass } from "./independence.js";

/** The genesis previous-digest of a project's verification chain. */
export const PROJECT_VERIFICATION_GENESIS = "0".repeat(64);

interface EventRow {
  readonly sequence: number;
  readonly event_json: Uint8Array;
}

function decodeStoredEvent(row: EventRow): ProjectVerificationRunEvent {
  return parseProjectVerificationRunEvent(JSON.parse(new TextDecoder().decode(row.event_json)));
}

export interface AppendProjectVerificationStartInput {
  readonly projectId: string;
  readonly requestRef: string;
  readonly requestDigest: string;
  readonly subject: ProjectVerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly independence: VerifierIndependenceClass;
  readonly startedAt: string;
}

export interface AppendProjectVerificationCompletionInput {
  readonly projectId: string;
  readonly runId: string;
  readonly verdict: ProjectVerificationVerdict;
  readonly score?: number | null | undefined;
  readonly detail?: string | null | undefined;
  readonly freshness: ProjectVerificationFreshness;
  /** The digest of the raw provider result this completion records. */
  readonly resultDigest: string;
  readonly finishedAt: string;
}

export interface AppendProjectVerificationInterruptionInput {
  readonly projectId: string;
  readonly runId: string;
  readonly detail: string;
  readonly freshness: ProjectVerificationFreshness;
  readonly finishedAt: string;
}

/** The history seam the service depends on (no other store surface). */
export interface ProjectVerificationHistoryStore {
  appendStart(input: AppendProjectVerificationStartInput): ProjectVerificationRun;
  appendCompletion(input: AppendProjectVerificationCompletionInput): ProjectVerificationRun;
  appendInterruption(input: AppendProjectVerificationInterruptionInput): ProjectVerificationRun;
  /** Folded runs, oldest first. */
  list(projectId: string): readonly ProjectVerificationRun[];
  /** Runs whose STARTED event has no successor: they never produced a verdict. */
  unresolved(projectId: string): readonly ProjectVerificationRun[];
  verifyChain(projectId: string): { readonly ok: boolean; readonly problem?: string | undefined };
}

export class SqliteProjectVerificationStore implements ProjectVerificationHistoryStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;
  readonly #maxSeq: ReturnType<DatabaseSync["prepare"]>;
  readonly #tip: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(
      databasePath === ":memory:" ? ":memory:" : join(databasePath),
    );
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS project_verification_event (" +
        "project_id TEXT NOT NULL, " +
        "sequence INTEGER NOT NULL, " +
        "event_id TEXT NOT NULL, " +
        "run_id TEXT NOT NULL, " +
        "kind TEXT NOT NULL, " +
        "event_json BLOB NOT NULL, " +
        "record_digest TEXT NOT NULL, " +
        "previous_record_digest TEXT NOT NULL, " +
        "appended_at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, sequence))",
    );
    this.#database.exec(
      "CREATE INDEX IF NOT EXISTS project_verification_event_run ON project_verification_event(project_id, run_id)",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT sequence, event_json FROM project_verification_event WHERE project_id = ? ORDER BY sequence",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO project_verification_event (project_id, sequence, event_id, run_id, kind, event_json, record_digest, previous_record_digest, appended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.#maxSeq = this.#database.prepare(
      "SELECT MAX(sequence) AS max_seq FROM project_verification_event WHERE project_id = ?",
    );
    this.#tip = this.#database.prepare(
      "SELECT record_digest FROM project_verification_event WHERE project_id = ? ORDER BY sequence DESC LIMIT 1",
    );
  }

  close(): void {
    this.#database.close();
  }

  /** Every durable event of a project, oldest first (the raw append-only chain). */
  listEvents(projectId: string): readonly ProjectVerificationRunEvent[] {
    return Object.freeze(
      (this.#selectAll.all(projectId) as unknown as EventRow[]).map((row) => decodeStoredEvent(row)),
    );
  }

  #appendEvent(
    input: Omit<ProjectVerificationRunEventInput, "sequence" | "previousRecordDigest">,
  ): ProjectVerificationRunEvent {
    const seqRow = this.#maxSeq.get(input.projectId) as { max_seq: number | null } | undefined;
    const sequence = (seqRow?.max_seq ?? 0) + 1;
    const tipRow = this.#tip.get(input.projectId) as { record_digest: string } | undefined;
    const previousRecordDigest = tipRow?.record_digest ?? PROJECT_VERIFICATION_GENESIS;
    const event = buildProjectVerificationRunEvent({
      ...input,
      sequence,
      previousRecordDigest,
    });
    this.#insert.run(
      event.projectId,
      event.sequence,
      event.eventId,
      event.runId,
      event.kind,
      new TextEncoder().encode(JSON.stringify(event)),
      event.recordDigest,
      previousRecordDigest,
      event.at,
    );
    return event;
  }

  #run(projectId: string, runId: string): ProjectVerificationRun | undefined {
    return this.list(projectId).find((run) => run.runId === runId);
  }

  /**
   * §12: write STARTED BEFORE the provider call. The run identity is derived from
   * the project, the chain position, the request and the verifier, so the caller
   * cannot choose it and the same request cannot silently reuse an old run.
   */
  appendStart(input: AppendProjectVerificationStartInput): ProjectVerificationRun {
    const seqRow = this.#maxSeq.get(input.projectId) as { max_seq: number | null } | undefined;
    const sequence = (seqRow?.max_seq ?? 0) + 1;
    const runId = projectVerificationRunIdOf({
      projectId: input.projectId,
      sequence,
      requestRef: input.requestRef,
      requestDigest: input.requestDigest,
      verifierRef: input.verifierRef,
    });
    const event = this.#appendEvent({
      projectId: input.projectId,
      runId,
      kind: "STARTED",
      requestRef: input.requestRef,
      requestDigest: input.requestDigest,
      subject: input.subject,
      verifierRef: input.verifierRef,
      verifierDefinitionDigest: input.verifierDefinitionDigest,
      independence: input.independence,
      at: input.startedAt,
      verdict: null,
      score: null,
      detail: null,
      freshness: null,
      resultDigest: null,
    });
    void event;
    const run = this.#run(input.projectId, runId);
    if (run === undefined) throw new Error(`the STARTED event for run ${runId} was not persisted`);
    return run;
  }

  #openRun(projectId: string, runId: string): ProjectVerificationRunEvent {
    const events = this.listEvents(projectId);
    const started = events.find((event) => event.runId === runId && event.kind === "STARTED");
    if (started === undefined) {
      throw new Error(`no STARTED event exists for run ${runId} in project ${projectId}`);
    }
    if (events.some((event) => event.runId === runId && event.kind !== "STARTED")) {
      throw new Error(`run ${runId} already has a terminal event; verification history is append-only`);
    }
    return started;
  }

  /** §12: write COMPLETED after the provider result was observed. */
  appendCompletion(input: AppendProjectVerificationCompletionInput): ProjectVerificationRun {
    const started = this.#openRun(input.projectId, input.runId);
    const event = this.#appendEvent({
      projectId: started.projectId,
      runId: started.runId,
      kind: "COMPLETED",
      requestRef: started.requestRef,
      requestDigest: started.requestDigest,
      subject: started.subject,
      verifierRef: started.verifierRef,
      verifierDefinitionDigest: started.verifierDefinitionDigest,
      independence: started.independence,
      at: input.finishedAt,
      verdict: input.verdict,
      score: input.score ?? null,
      detail: input.detail ?? null,
      freshness: input.freshness,
      resultDigest: input.resultDigest,
    });
    void event;
    const run = this.#run(input.projectId, input.runId);
    if (run === undefined) throw new Error(`the COMPLETED event for run ${input.runId} was not persisted`);
    return run;
  }

  /**
   * Close a run that never produced a result (an abort, or an operator
   * recovery). It writes NO verdict: the honest statement is "this run is
   * closed and nothing was established".
   */
  appendInterruption(input: AppendProjectVerificationInterruptionInput): ProjectVerificationRun {
    const started = this.#openRun(input.projectId, input.runId);
    const event = this.#appendEvent({
      projectId: started.projectId,
      runId: started.runId,
      kind: "INTERRUPTED",
      requestRef: started.requestRef,
      requestDigest: started.requestDigest,
      subject: started.subject,
      verifierRef: started.verifierRef,
      verifierDefinitionDigest: started.verifierDefinitionDigest,
      independence: started.independence,
      at: input.finishedAt,
      verdict: null,
      score: null,
      detail: input.detail,
      freshness: input.freshness,
      resultDigest: null,
    });
    void event;
    const run = this.#run(input.projectId, input.runId);
    if (run === undefined) throw new Error(`the INTERRUPTED event for run ${input.runId} was not persisted`);
    return run;
  }

  /** Folded runs, oldest first (a VIEW: the events are the truth). */
  list(projectId: string): readonly ProjectVerificationRun[] {
    return foldProjectVerificationRuns(this.listEvents(projectId));
  }

  /** Unresolved STARTED runs: history that never produced a verdict. */
  unresolved(projectId: string): readonly ProjectVerificationRun[] {
    return Object.freeze(this.list(projectId).filter((run) => run.status === "STARTED"));
  }

  /** Verify the local chain: contiguous sequence, linked digests, intact bodies. */
  verifyChain(projectId: string): { readonly ok: boolean; readonly problem?: string | undefined } {
    const rows = this.#selectAll.all(projectId) as unknown as EventRow[];
    let previous = PROJECT_VERIFICATION_GENESIS;
    let expected = 1;
    for (const row of rows) {
      let event: ProjectVerificationRunEvent;
      try {
        event = decodeStoredEvent(row);
      } catch (error) {
        return {
          ok: false,
          problem: `unreadable event at sequence ${row.sequence}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (event.sequence !== expected) {
        return { ok: false, problem: `sequence gap at ${event.sequence} (expected ${expected})` };
      }
      if (event.kind !== "STARTED" && event.kind !== "COMPLETED" && event.kind !== "INTERRUPTED") {
        return { ok: false, problem: `unknown event kind at sequence ${event.sequence}` };
      }
      if (event.previousRecordDigest !== previous) {
        return { ok: false, problem: `broken chain at sequence ${event.sequence}` };
      }
      // Recompute the content digest: a rewritten body breaks the chain even if
      // the sequence and the pointer are intact.
      const { schemaVersion: _v, eventId: _e, recordDigest: _d, ...body } = event;
      if (projectVerificationEventDigestOf(body) !== event.recordDigest) {
        return { ok: false, problem: `content digest mismatch at sequence ${event.sequence}` };
      }
      previous = event.recordDigest;
      expected += 1;
    }
    return { ok: true };
  }
}
