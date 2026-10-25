/**
 * Palimpsest-CI2 §10 — THE SINGLE WORK-EVIDENCE WRITER.
 *
 *     one builder, two settlement routes
 *
 * WHY THIS MODULE EXISTS.
 *
 * Evidence becomes durable through exactly one event type, `EVIDENCE_ADDED`, projected into the
 * `evidence` table (`src/state/projector.ts:44`). Before this module there were two private builders
 * of that event, both inside `ProjectController` (`#recordCommandEvidence`, `#recordObservedEvidence`),
 * and the delegated settlement route could reach neither — so a delegated candidate settled COMPLETED
 * with no evidence at all. Measured by CI1 C4 and re-derived by CI2's RED falsifier.
 *
 * The builders are moved here, unchanged in shape, so that:
 *
 *   1. there is still EXACTLY ONE writer (this is a move, not a second implementation);
 *   2. the Finish route and the delegated route provably build identical atoms;
 *   3. `ProjectController` keeps its size ceiling, which is a real constraint — its LOC ratchet is
 *      4830 and it sat at 4827.
 *
 * WHAT DID NOT MOVE, AND MUST NOT.
 *
 * The decision of WHEN evidence may be recorded stays with each route. `finish` records as it goes and
 * refuses on the first contradiction, leaving the attempt RUNNING; the delegated route evaluates the
 * whole contract and only records when the candidate is admitted. This module appends an atom it is
 * handed; it does not decide eligibility, does not report, and does not transition an attempt.
 *
 * THE ATOM'S `value` MAP IS WHERE THE CANDIDATE GOES.
 *
 * `subject_digest` is a digest of `(attempt_id, predicate)` or `(attempt_id, command)` and therefore
 * cannot distinguish two different results observed for one attempt. `value` is explicitly open
 * (`src/schema/models.ts:907-909`) and is what a gate clause's `where` matches against
 * (`src/domain/gate_clause.ts:209-216`), so a candidate recorded there makes "may THIS candidate be
 * promoted?" expressible with no schema change and no new predicate.
 */
import { canonicalDigest } from "../schema/canonical.js";
import { parseNewEvent, type EvidenceAtom, type EvidencePredicate, type SchedulerEvent } from "../schema/index.js";
import type { EventStore } from "../state/index.js";
import { actionKey, stableEntityId } from "../domain/index.js";
import type { AttemptCompletionContract } from "../domain/completion_contract.js";
import {
  candidateDependencyDigest,
  evaluateCompletionContract,
  type EvaluatedCandidate,
} from "../work/completion_evaluation.js";

/** Everything the writer needs that the calling route already has in hand. */
export interface WorkEvidenceContext {
  readonly store: EventStore;
  readonly projectId: string;
  readonly attemptId: string;
  /** The attempt's `last_event_id`, so the atom's causation points at the attempt's own history. */
  readonly causationId: number;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly requiredArtifacts: readonly string[];
  readonly now: () => string;
  /**
   * The already-recorded atom for one evidence idempotency key, when there is one.
   *
   * Supplied by the caller because only it can read the log; used to converge a repeated observation
   * instead of failing the store's digest check on a moved `created_at`. `undefined` means "no atom
   * for this key", which is the ordinary first-write case.
   */
  readonly findExisting?: ((idempotencyKey: string) => { readonly event: SchedulerEvent; readonly exitCode: number | null } | undefined) | undefined;
}

/**
 * Read the already-recorded atom for one evidence idempotency key, or `undefined`.
 *
 * Exported so the controller's context builder stays a flat literal — its LOC ceiling is a real
 * constraint, and this lookup is the writer's own concern rather than the caller's.
 */
export function findRecordedEvidence(
  store: EventStore,
  projectId: string,
  idempotencyKey: string,
): { readonly event: SchedulerEvent; readonly exitCode: number | null } | undefined {
  const found = store.connection
    .prepare("SELECT event_id FROM events WHERE project_id=? AND idempotency_key=?")
    .get(projectId, idempotencyKey) as { event_id: number } | undefined;
  if (found === undefined) return undefined;
  const event = store.getEvent(Number(found.event_id));
  if (event === undefined) return undefined;
  const atom = (event.payload as { evidence?: { exit_code?: number | null } }).evidence;
  return { event, exitCode: atom?.exit_code ?? null };
}

/** An observed, non-command fact: `write_scope_valid`, `expected_files_exist`. */
export function recordObservedEvidence(
  context: WorkEvidenceContext,
  predicate: Extract<EvidencePredicate, "write_scope_valid" | "expected_files_exist">,
  value: Record<string, unknown>,
  candidate?: { readonly dependencyDigest: string; readonly producer: string } | undefined,
): SchedulerEvent {
  const key = actionKey("evidence-observed-v1", {
    project_id: context.projectId,
    attempt_id: context.attemptId,
    predicate,
  });
  /** Same convergence rule as a command observation: the same observed fact recorded twice is one atom. */
  const existing = context.findExisting?.(key);
  if (existing !== undefined) return existing.event;
  const evidenceId = stableEntityId("evidence", key);
  const evidence: EvidenceAtom = {
    schema_version: 1,
    project_id: context.projectId,
    evidence_id: evidenceId,
    subject_type: "attempt",
    subject_id: context.attemptId,
    subject_digest: canonicalDigest({ attempt_id: context.attemptId, predicate }),
    predicate,
    value: value as EvidenceAtom["value"],
    project_revision: context.projectRevision,
    input_fingerprint: context.projectDigest,
    command: null,
    exit_code: null,
    environment_digest: "e".repeat(64),
    dependency_digest: candidate?.dependencyDigest ?? null,
    observed_artifacts: [...context.requiredArtifacts],
    producer: candidate?.producer ?? "palimpsest-finish",
    created_at: context.now(),
    status: "active",
  };
  return context.store.append(
    parseNewEvent({
      schema_version: 1,
      project_id: context.projectId,
      event_type: "EVIDENCE_ADDED",
      payload_version: 1,
      entity_type: "evidence",
      entity_id: evidenceId,
      payload: { evidence },
      causation_id: context.causationId,
      correlation_id: `evidence:${evidenceId}`,
      idempotency_key: key,
      expected_project_revision: context.projectRevision,
    }),
  );
}

/**
 * A process fact: the command that ran and the exit code this process OBSERVED.
 *
 * The exit code is never a caller's. That is the constitution `palimpsest_report` states — claims are
 * never evidence, only deterministic observation is — and it is why this function takes a number the
 * caller must have obtained by running the command, not a boolean it decided.
 *
 * `observedArtifacts` and `value` are separate parameters ON PURPOSE, and `value` is LAST-BUT-ONE with
 * `candidate` after it, so the positional call `gate()` makes — `(attempt, predicate, command, exit,
 * observedArtifacts)` — keeps meaning what it always meant. Collapsing them would silently reinterpret
 * an artifact list as an evidence payload, which is exactly the kind of quiet shape change the
 * extraction was supposed to avoid.
 */
export function recordCommandEvidence(
  context: WorkEvidenceContext,
  predicate: EvidencePredicate,
  command: readonly string[],
  exitCode: number,
  observedArtifacts?: readonly string[] | undefined,
  value?: Record<string, unknown> | undefined,
  candidate?: { readonly dependencyDigest: string; readonly producer: string } | undefined,
): SchedulerEvent {
  const key = actionKey("evidence-v1", {
    project_id: context.projectId,
    attempt_id: context.attemptId,
    predicate,
    command,
  });
  /**
   * CONVERGENCE BEFORE APPEND, AND ONLY FOR THE SAME OBSERVATION.
   *
   * The key identifies ONE observation — this attempt, this predicate, this command — and the store
   * already returns the existing event when the request digest matches. It does not match here for two
   * legitimate reasons: `created_at` moves on every call, and a repeat through a different ROUTE may
   * carry a candidate attribution the first did not. Neither difference means a different fact was
   * observed, so the existing atom is returned as-is.
   *
   * IT IS NOT A LICENCE TO OVERWRITE. The caller hands back the previously recorded exit code, and if
   * it differs from the one being recorded this does NOT converge — the store then raises its own
   * `IdempotencyConflict`, which is the correct answer: two different exit codes for one command are
   * two different observations competing for one identity, and neither may silently win.
   */
  const existing = context.findExisting?.(key);
  if (existing !== undefined) {
    if (existing.exitCode !== exitCode) {
      throw new Error(
        `evidence ${predicate} for attempt ${context.attemptId} was already recorded with exit code ${String(existing.exitCode)}, and this observation is ${String(exitCode)} — two different observations cannot share one evidence identity`,
      );
    }
    return existing.event;
  }
  const evidenceId = stableEntityId("evidence", key);
  const evidence: EvidenceAtom = {
    schema_version: 1,
    project_id: context.projectId,
    evidence_id: evidenceId,
    subject_type: "attempt",
    subject_id: context.attemptId,
    subject_digest: canonicalDigest({ attempt_id: context.attemptId, command }),
    predicate,
    value: (value ?? { exit_code: exitCode }) as EvidenceAtom["value"],
    project_revision: context.projectRevision,
    input_fingerprint: context.projectDigest,
    command: [...command],
    exit_code: exitCode,
    environment_digest: "e".repeat(64),
    dependency_digest: candidate?.dependencyDigest ?? null,
    observed_artifacts: [...(observedArtifacts ?? context.requiredArtifacts)],
    producer: candidate?.producer ?? "palimpsest-gate",
    created_at: context.now(),
    status: "active",
  };
  return context.store.append(
    parseNewEvent({
      schema_version: 1,
      project_id: context.projectId,
      event_type: "EVIDENCE_ADDED",
      payload_version: 1,
      entity_type: "evidence",
      entity_id: evidenceId,
      payload: { evidence },
      causation_id: context.causationId,
      correlation_id: `evidence:${evidenceId}`,
      idempotency_key: key,
      expected_project_revision: context.projectRevision,
    }),
  );
}

/** Everything one delegated-settlement evidence attachment needs. */
export interface CompletionAttachmentPorts {
  readonly context: WorkEvidenceContext;
  readonly contract: AttemptCompletionContract;
  readonly candidate: EvaluatedCandidate;
  readonly workDir: string;
  readonly changedFiles: readonly string[];
  readonly writePaths: readonly string[];
  readonly runCommand: (command: readonly string[]) => Promise<number | null>;
  /**
   * The evidence already recorded for this attempt, as `(predicate → dependency_digest)`.
   *
   * A REPEATED settlement must CONVERGE, not duplicate. The atom's idempotency key is
   * `(project, attempt, predicate)` and deliberately carries no candidate, so a second settlement of the
   * same attempt addresses the same key — but the atom's bytes differ (`created_at` moves), and the store
   * refuses a key reused for different bytes with `IdempotencyConflict`. That refusal is the STORE being
   * correct: it cannot tell "the same qualification, recorded twice" from "a different qualification
   * smuggled under one key".
   *
   * So the decision is made HERE, where the candidate identity is known: if an atom for this predicate
   * already exists with THIS candidate's dependency digest, the qualification is already recorded and
   * nothing is appended. If it exists with a DIFFERENT digest, that is the W5 conflict and it must not
   * silently converge — the caller is told, and the settlement refuses.
   */
  readonly existing: (predicate: EvidencePredicate) => string | null;
}

/** One recorded qualification's identity, as the attachment step needs to compare it. */
export interface RecordedQualification {
  readonly predicate: EvidencePredicate;
  readonly dependencyDigest: string | null;
}

/**
 * Evaluate the contract against the candidate, then record evidence for every check that HELD.
 *
 * The whole of the delegated route's evidence attachment, in one place: the controller supplies only
 * the observations it alone can make (the derived contract, the resolved candidate tree, the command
 * runner bound to the effects runtime) and the SHARED evaluator plus the SHARED writers do the rest.
 *
 * A check that FAILED or could not be evaluated records NOTHING. A refusal must not leave a
 * half-evidence trail implying the candidate was partly qualified, and absence of evidence must never
 * be creatable by the failing route itself.
 */
export async function attachCompletionEvidence(
  ports: CompletionAttachmentPorts,
): Promise<
  | { readonly outcome: "PASSED"; readonly evidenceRecorded: readonly string[]; readonly detail: string }
  | { readonly outcome: "FAILED" | "NOT_EVALUABLE"; readonly detail: string }
  | { readonly outcome: "CANDIDATE_CONFLICT"; readonly detail: string }
> {
  const evaluation = await evaluateCompletionContract({
    contract: ports.contract,
    candidate: ports.candidate,
    workDir: ports.workDir,
    changedFiles: ports.changedFiles,
    writePaths: ports.writePaths,
    runCommand: ports.runCommand,
  });
  if (evaluation.outcome !== "PASSED") return { outcome: evaluation.outcome, detail: evaluation.detail };
  const dependencyDigest = candidateDependencyDigest(ports.candidate);
  const attribution = { dependencyDigest, producer: "palimpsest-delegated-settlement" } as const;

  /**
   * THE CONVERGENCE / CONFLICT DECISION, MADE BEFORE ANY WRITE.
   *
   * Both outcomes are decided from the atoms already recorded, so a repeat neither appends a duplicate
   * nor is refused by the store for reusing a key with new bytes. Nothing is written until every
   * predicate has been classified, so a conflict leaves the ledger untouched.
   */
  const toRecord: Array<(typeof evaluation.observations)[number]> = [];
  const recorded: string[] = [];
  for (const observation of evaluation.observations) {
    const { predicate, value } = observation;
    if (observation.outcome !== "PASSED" || predicate === null || value === null) continue;
    const existingDigest = ports.existing(predicate);
    if (existingDigest !== null) {
      if (existingDigest === dependencyDigest) {
        /** Already qualified, for THIS candidate: converge. */
        recorded.push(predicate);
        continue;
      }
      /**
       * W5: an atom for this predicate already exists and names a DIFFERENT candidate. That is not a
       * replay of one immutable result, and silently converging would let a second result inherit the
       * first's qualification. Refuse, and name both.
       */
      return {
        outcome: "CANDIDATE_CONFLICT",
        detail: `this attempt already holds ${predicate} evidence for a different candidate (recorded dependency ${existingDigest.slice(0, 12)}, this result ${dependencyDigest.slice(0, 12)}) — two different results for one attempt are not a replay of one immutable result, so the second is not qualified by the first`,
      };
    }
    toRecord.push(observation);
  }

  for (const observation of toRecord) {
    const { predicate, value } = observation;
    if (predicate === null || value === null) continue;
    if (observation.command !== null && observation.exitCode !== null) {
      recordCommandEvidence(ports.context, predicate, observation.command, observation.exitCode, undefined, value, attribution);
    } else {
      recordObservedEvidence(
        ports.context,
        predicate as Extract<EvidencePredicate, "write_scope_valid" | "expected_files_exist">,
        value,
        attribution,
      );
    }
    recorded.push(predicate);
  }
  return { outcome: "PASSED", evidenceRecorded: Object.freeze(recorded), detail: evaluation.detail };
}
