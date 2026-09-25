/**
 * PLMP-LEAN-1 §D5-c2 — the PRIOR RESULT CONTEXT: what a reopened attempt is
 * TOLD about the result it replaces.
 *
 *     Rework history says WHY            (the durable rework_provenance on TASK_READY)
 *     ContextManifest says WHAT A1 got   (this block, compiled per attempt)
 *     Worker transport merely delivers it (D5-c3)
 *
 * THE FROZEN BOUNDARY. `CurrentBasis ≠ PriorResultContext`: this block never
 * enters the ProjectWorldBasis, the TaskEnvelope, or the Work semantic identity
 * (semanticProjectionDigestOf is untouched by it). It is COMPILED PRESENTATION —
 * coordinates plus concise interpretations — and it is authoritative only in the
 * weak sense that every field is read from an owner that already owns the fact:
 *
 *   lineage        the reworked TASK_READY's rework_provenance (the Event Log)
 *   origin result  the origin attempt's own record (attempts history)
 *   verification   the ProjectVerificationStore's runs for that subject
 *   world change   the promotion facts and the ProjectIR head
 *
 * EVIDENCE-STRENGTH IS ENCODED IN THE FIELD NAMES, not buried in prose:
 *
 *   priorExecution.workerSummary        the ORIGIN WORKER's interpretation
 *   priorExecution.observedChangedFiles what Palimpsest OBSERVED in the tree
 *   verification[]                      HISTORICAL runs — Verification(R0) does
 *                                       NOT imply Verification(R1) (D3-d), so
 *                                       they are never a qualification of A1
 *   worldTransition                     immutable coordinates only — H0, H1 and
 *                                       the promotion event refs. No diff, no
 *                                       merge proposal: the worker is in the H1
 *                                       world and can read `git diff H0..H1` and
 *                                       `git show R0` itself.
 *                                       give immutable coordinates,
 *                                       not a proposed merge interpretation.
 *
 * ContextManifest ≠ Evidence ≠ Admission: nothing here is readable as authority.
 * The compatibility plane must not consume it to admit anything, and no module
 * below the context layer imports it.
 */
import type { ProjectVerificationRun } from "../project_verification/artifacts.js";

/** The on-chain payload shape (snake_case) — mirrors the ContextManifest block. */
export interface PriorResultContext {
  readonly schema_version: 1;
  readonly lineage: {
    /** The governed TASK_READY that carried the rework_provenance. */
    readonly rework_event_id: number;
    readonly reason: string;
    readonly continuation_assessment_digest?: string | undefined;
    readonly target_observation_digest: string;
    readonly origin_basis_digest: string;
  };
  readonly origin_result: {
    readonly subject: { readonly kind: string; readonly ref: string };
    /** The origin result's own manifest digest, when one was computable. */
    readonly result_manifest_digest: string | null;
    readonly source_result?:
      | { readonly base_revision: string; readonly result_revision: string }
      | undefined;
  };
  readonly prior_execution?:
    | {
        /** The origin worker's INTERPRETATION — labelled, never a fact. */
        readonly worker_summary: string;
        /** What Palimpsest OBSERVED in the origin attempt's tree. */
        readonly observed_changed_files: readonly string[];
      }
    | undefined;
  /** HISTORICAL verification runs of the origin result — never A1's qualification. */
  readonly verification: ReadonlyArray<{
    readonly run_id: string;
    readonly verifier_ref: string;
    readonly verdict: string;
    readonly freshness: string;
    readonly independence: string;
  }>;
  readonly world_transition: {
    readonly from_head: string;
    readonly to_head: string;
    readonly promotion_event_refs: readonly string[];
  };
}

export interface PriorResultContextInput {
  /** The governed TASK_READY's event id. */
  readonly reworkEventId: number;
  /** The durable lineage read from that event (owner: the Event Log). */
  readonly provenance: {
    readonly origin_result_subject: { readonly kind: string; readonly ref: string };
    readonly origin_basis_digest: string;
    readonly target_observation_digest: string;
    readonly reason: string;
    readonly continuation_assessment_digest?: string | undefined;
  };
  /** The origin envelope E_0 (owner: the attempt-authorization resolver). */
  readonly originEnvelope: { readonly envelope_id: string; readonly base_commit: string };
  /** The origin attempt's report (owner: the attempts record). Absent ⇒ no prior execution block. */
  readonly originReport?: {
    readonly summary: string;
    readonly changed_files: readonly string[];
    readonly result_commit: string | null;
  } | undefined;
  /** The digest identifying the origin result's verification subject, when computable. */
  readonly originSubjectDigest: string | null;
  /** Independent verification runs (owner: the ProjectVerificationStore), unfiltered. */
  readonly verificationRuns: readonly ProjectVerificationRun[];
  /** The promotion chain from the origin basis to the current head (owner: the Event Log). */
  readonly promotionChain: ReadonlyArray<{ readonly eventId: string }>;
  /** The current canonical head (owner: the ProjectIR). */
  readonly currentHead: string;
}

export function compilePriorResultContext(input: PriorResultContextInput): PriorResultContext {
  // Historical verification: this origin result's own runs, terminal ones only.
  // Kept as HISTORY — the block never asserts that R0 is currently verified, and
  // A1's own qualification starts empty regardless of what R0 passed.
  const verification = input.verificationRuns
    .filter(
      (run) =>
        run.subject.kind === "ATTEMPT_RESULT" &&
        run.subject.attemptId === input.provenance.origin_result_subject.ref &&
        run.terminalEventId !== null,
    )
    .map((run) => ({
      run_id: run.runId,
      verifier_ref: run.verifierRef,
      verdict: run.verdict ?? "UNRESOLVED",
      freshness: run.freshness,
      independence: run.independence,
    }));

  return {
    schema_version: 1,
    lineage: {
      rework_event_id: input.reworkEventId,
      reason: input.provenance.reason,
      ...(input.provenance.continuation_assessment_digest === undefined
        ? {}
        : { continuation_assessment_digest: input.provenance.continuation_assessment_digest }),
      target_observation_digest: input.provenance.target_observation_digest,
      origin_basis_digest: input.provenance.origin_basis_digest,
    },
    origin_result: {
      subject: { ...input.provenance.origin_result_subject },
      result_manifest_digest: input.originSubjectDigest,
      ...(input.originReport?.result_commit == null
        ? {}
        : {
            source_result: {
              base_revision: input.originEnvelope.base_commit,
              result_revision: input.originReport.result_commit,
            },
          }),
    },
    ...(input.originReport === undefined
      ? {}
      : {
          prior_execution: {
            worker_summary: input.originReport.summary,
            observed_changed_files: [...input.originReport.changed_files],
          },
        }),
    verification,
    world_transition: {
      from_head: input.originEnvelope.base_commit,
      to_head: input.currentHead,
      promotion_event_refs: input.promotionChain.map((entry) => entry.eventId),
    },
  };
}
