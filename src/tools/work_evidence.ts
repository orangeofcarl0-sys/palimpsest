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
 */
export function recordCommandEvidence(
  context: WorkEvidenceContext,
  predicate: EvidencePredicate,
  command: readonly string[],
  exitCode: number,
  value?: Record<string, unknown> | undefined,
  candidate?: { readonly dependencyDigest: string; readonly producer: string } | undefined,
): SchedulerEvent {
  const key = actionKey("evidence-v1", {
    project_id: context.projectId,
    attempt_id: context.attemptId,
    predicate,
    command,
  });
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
    observed_artifacts: [...context.requiredArtifacts],
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
  const attribution = {
    dependencyDigest: candidateDependencyDigest(ports.candidate),
    producer: "palimpsest-delegated-settlement",
  } as const;
  const recorded: string[] = [];
  for (const observation of evaluation.observations) {
    const { predicate, value } = observation;
    if (observation.outcome !== "PASSED" || predicate === null || value === null) continue;
    if (observation.command !== null && observation.exitCode !== null) {
      recordCommandEvidence(ports.context, predicate, observation.command, observation.exitCode, value, attribution);
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
