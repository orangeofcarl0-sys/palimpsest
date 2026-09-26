/**
 * PLMP-LEAN-1 §D5-d — the PACKAGED RESULT CONTINUATION AUTHORITY.
 *
 * Every mechanism below already existed and each already had ONE owner:
 *
 *     D5-0    AuthoritativeResultResolver          which result is this, from its owner
 *     D3-a    ProjectWorldBasisRuntime             is the origin basis still EXACTLY current
 *     D3-b/c  CompatibilityIssuer + admission      is reuse PROVEN impossible / unproven / proven
 *     D3-d    RematerializationRuntime             carry a result across a proven divergence
 *     D5-a    assessContinuation                   which SAFE paths exist (pure, no effect)
 *     D5-b2   ReworkAdmissionPermit + governed     set aside a completed candidate, VERIFYING → READY
 *             TASK_READY append
 *     G10-X   reconcileProjectHead                 the promoted head becomes the new ProjectIR basis
 *     D2-d    WorkDelegationService                the ONE execution kernel (prepare → run → settle)
 *
 * What did not exist was the ORDER — and one last caller-fact seam. A caller could still mint a
 * structurally valid permit by filling `targetObservationDigest`, `currentEnvelopeId`, the batch anchor and
 * the reason BY HAND and calling `ReworkAdmissionPermit.issue()`. D5-b2 had proved that a FORGED permit
 * cannot pass admission; nothing yet proved that a REAL permit must be born from a FRESH assessment. That
 * is the W.5 hole this service closes:
 *
 *     fresh observation  ≺  continuation assessment  ≺  permit mint  ≺  TASK_READY
 *
 * with no caller-supplied quantity anywhere in the chain. THE CALLER CHOOSES A ROUTE; THE SERVICE DERIVES
 * EVERY AUTHORITY-BEARING FACT. The one thing a caller may bring is `expectedAssessmentDigest` — not
 * authority, but its DECISION FRESHNESS FENCE: the digest `inspect()` returned, proving the choice was made
 * against a world the service re-verifies. A caller cannot bind authority to a world; it can only bind its
 * INTENT to an assessment.
 *
 * WHAT THE SERVICE IS NOT, and each is a boundary rather than an omission:
 *
 *   · it is NOT a second assessment engine   — packaged inspection ALWAYS actually runs the authoritative
 *     D3-b through the issuer (`NOT_ASSESSED` cannot be reached from here, so the two-layer distinction
 *     D5-a preserves cannot be laundered into `UNKNOWN` by a lazy caller);
 *   · it is NOT a second head authority      — after the governed reopening it calls ONLY
 *     `reconcileProjectHead()`; a quiescence blocker is reported (WAITING), never routed around;
 *   · it is NOT a second execution kernel    — attempts start ONLY through `WorkDelegationService.start()`;
 *     this file never touches TASK_STARTED, ATTEMPT_CREATED or the context compiler;
 *   · it is NOT a state database             — it is a STATELESS orchestrator over durable owners; progress
 *     after a crash is RECONSTRUCTED from the Event Log (`TASK_READY.rework_provenance` decides replay, the
 *     same philosophy as D3-d derivation replay), never from an ephemeral permit or a private table;
 *   · it does NOT choose policy for anyone   — V1 mints a rework only when the fresh assessment says the
 *     reuse question is settled against reuse (INCOMPATIBLE) or never settled (UNKNOWN). EXACT and
 *     COMPATIBLE refuse, because the durable `ReworkReason` vocabulary has no honest word for "reuse was
 *     provable and was declined" — inventing one later (`EXPLICIT_REWORK`) is a governance decision, not a
 *     mapping this file may quietly perform;
 *   · it does NOT auto-fallback              — a failed rematerialization returns FAILED and stops; the
 *     next continuation choice is the caller's, explicitly.
 *
 * THE AUTHORITY KERNEL IS SYNCHRONOUS. From the final target re-observation through the fence read, the
 * permit mint and the governed append there is no `await` — the append lands inside the same synchronous
 * span that verified the world, so an interleaved mutation cannot slip between check and effect. What the
 * fence cannot see (a git world) the re-observation covers; what the re-observation cannot cover (a
 * promotion landing after the observation but before the append) the canonical target fence covers, because
 * the aggregate re-derives every fence field from its own log inside the admission transaction.
 *
 * Layer: L3 (`src/continuation/`). Composed once by `src/composition/continuation.ts`.
 */
import {
  ReworkAdmissionPermit,
  type ReworkReason,
} from "../domain/rework_admission.js";
import { assessContinuation, type ContinuationAssessment } from "./assessment.js";

import type {
  ContinuationResolvedResult,
  ContinuationResultRef,
  ResultContinuationPorts,
} from "./ports.js";

/** The packaged action view: what THIS deployment could do next, as facts — never written into Project truth. */
export interface ContinuationAvailableActions {
  readonly rematerialize: boolean;
  readonly rework: boolean;
}

/** What `inspect` returns: the safe paths for one result, each with its evidence. */
export interface ContinuationInspection {
  readonly schemaVersion: 1;
  readonly result: ResultSubjectRef;
  /** `false` when the owner could not resolve the result — every action is then absent, never guessed. */
  readonly resolved: boolean;
  readonly taskId: string | null;
  readonly targetObservationDigest: string | null;
  /** D3-b's conclusion and the certificate that carries it (an authority record, not a verdict string). */
  readonly compatibility: {
    readonly outcome: string;
    readonly issuanceDigest: string | null;
  };
  /** Present exactly when the result resolved; the packaged assessment ALWAYS ran D3-b. */
  readonly assessment: ContinuationAssessment | null;
  readonly availableActions: ContinuationAvailableActions;
  readonly detail: string;
}

export type ReworkContinuationState =
  | "REFUSED"
  | "STALE_INSPECTION"
  | "REOPENED_WAITING_FOR_QUIESCENCE"
  | "READY_FOR_DELEGATION"
  | "DELEGATED"
  | "ALREADY_IN_PROGRESS";

/** `DELEGATED` is deliberately NOT "completed": the Work has only been started (or resumed). */
export interface ReworkContinuationResult {
  readonly schemaVersion: 1;
  readonly state: ReworkContinuationState;
  readonly result: ResultSubjectRef;
  readonly taskId: string;
  readonly detail: string;
  /** Present for REFUSED / REOPENED_WAITING_FOR_QUIESCENCE: the named blockers, verbatim from their owners. */
  readonly blockers: readonly string[];
  /** The governed TASK_READY's event id, when THIS call landed it (null on replay). */
  readonly reopenedEventId: number | null;
  /** Whether the promoted head is the task's current authorization basis. */
  readonly headSynced: boolean;
  readonly attemptId: string | null;
  readonly jobId: string | null;
}

export type RematerializationContinuationState =
  | "REFUSED"
  | "STALE_INSPECTION"
  | "MATERIALIZED"
  | "REMATERIALIZATION_FAILED"
  | "ADMISSION_REFUSED"
  | "EFFECT_CAPABILITY_UNAVAILABLE";

export interface RematerializationContinuationResult {
  readonly schemaVersion: 1;
  readonly state: RematerializationContinuationState;
  readonly result: ResultSubjectRef;
  readonly taskId: string;
  readonly detail: string;
  readonly admissionRef: string | null;
  /** A `REMATERIALIZATION_FAILED` is a NEW FACT that rewrites nothing — carried so the caller can decide. */
  readonly candidateRef: string | null;
}

export interface ReworkLineageRow {
  readonly originResultSubjectRef: string;
  readonly eventId: number;
}

/**
 * THE PORTS the service consumes — five capabilities, and nothing else.
 *
 * SR-2 §八: this replaced a dependency record that named `EventStore`, the D3-R authorities,
 * the world runtime and the delegation service directly. The algorithm never changed; what
 * changed is that the service can now only see what it is entitled to understand.
 *
 *     composition knows wiring;  service knows semantics.
 */
export type ResultContinuationServiceDeps = ResultContinuationPorts;

/**
 * The result identity this layer speaks in.
 *
 * Structurally identical to the world/result owner's `ResultSubjectRef` — deliberately, so a
 * caller passes one and the composition passes it through, while this module names no owner
 * type (SR-2 §八).
 */
export type ResultSubjectRef = ContinuationResultRef;

export interface ResultContinuationService {
  readonly adapterId: string;
  inspect(input: { readonly result: ResultSubjectRef }): ContinuationInspection;
  rematerialize(input: {
    readonly result: ResultSubjectRef;
    readonly expectedAssessmentDigest: string;
  }): Promise<RematerializationContinuationResult>;
  startRework(input: {
    readonly result: ResultSubjectRef;
    readonly expectedAssessmentDigest: string;
  }): Promise<ReworkContinuationResult>;
}

/** §7 — the V1 packaged rework policy: only a reuse question SETTLED AGAINST reuse (or never settled). */
function reworkReasonFor(assessment: ContinuationAssessment): ReworkReason | null {
  if (assessment.compatibility === "INCOMPATIBLE") return "INCOMPATIBLE";
  if (assessment.compatibility === "UNKNOWN") return "UNKNOWN";
  return null;
}

export function makeResultContinuationService(deps: ResultContinuationServiceDeps): ResultContinuationService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  function refused(result: ResultSubjectRef, taskId: string, detail: string): ReworkContinuationResult {
    return {
      schemaVersion: 1,
      state: "REFUSED",
      result,
      taskId,
      detail,
      blockers: [],
      reopenedEventId: null,
      headSynced: false,
      attemptId: null,
      jobId: null,
    };
  }

  /**
   * THE PACKAGED INSPECTION — fresh facts → D3-b → D5-a, synchronously.
   *
   * Every observation is made NOW, through an authority: the source change by the registered git observer,
   * the result's read footprint as the honest first-party whole-repository conservative answer, its write
   * footprint as an observed execution fact. A facet this deployment cannot observe is recorded
   * UNAVAILABLE — never omitted (an omission would digest like "nothing there").
   */
  function inspectSync(result: ResultSubjectRef): {
    readonly resolved: ContinuationResolvedResult | null;
    readonly inspection: ContinuationInspection;
  } {
    // §11 V1 boundary: the packaged face is scoped to ATTEMPT_RESULT. A derived
    // candidate's premises are its derivation RECORD, not a fresh observation —
    // packaging it here would fabricate the very fresh-facts discipline this
    // service exists to enforce. The D3 authority layer keeps serving it.
    if (result.kind !== "ATTEMPT_RESULT") {
      return {
        resolved: null,
        inspection: unresolved(result, "the packaged continuation face V1 is scoped to attempt results; a derived candidate continues through the D3 authority layer, whose premises are its derivation record rather than a fresh observation"),
      };
    }

    /**
     * ONE call to the world port absorbs D3-a, the authority-bearing observations and the
     * existing D3-b issuer. Continuation does not re-derive any of it, and it cannot: the port
     * is the only compatibility engine the service can reach.
     */
    const world = deps.world.inspect({ result: { kind: result.kind, ref: result.ref } });
    if (world.resolved === null) {
      return {
        resolved: null,
        inspection: unresolved(result, "this deployment cannot authoritatively resolve that result: unknown identity, an attempt that never completed, or a result whose basis was never captured"),
      };
    }

    const resolved = world.resolved;
    const taskId = resolved.taskId;
    const target = world.targetObservation;
    const certificate = world.compatibility;

    /**
     * D5-a over the FRESH facts — the service's OWN frozen calculus, unchanged.
     *
     * `currentness === null` becomes `NONE` rather than "unknown": the port reports null only
     * when no assessment was possible, and D5-a's `NONE` means exactly "no basis was ever
     * captured, so the question does not arise".
     */
    const task = deps.work.task(taskId);
    const assessment = assessContinuation({
      resultSubjectRef: result,
      originBasisDigest: resolved.originBasisDigest,
      currentTargetDigest: target?.digest ?? null,
      currentness: world.currentness ?? "NONE",
      compatibility: certificate === null ? null : certificate.outcome,
      capabilities: {
        rematerialization: deps.world.rematerializationAvailable,
        rework: task?.state === "VERIFYING",
      },
    });

    const reworkReason = reworkReasonFor(assessment);
    const reworkOpen = task?.state === "VERIFYING" && reworkReason !== null && assessment.rework.available;
    return {
      resolved,
      inspection: {
        schemaVersion: 1,
        result,
        resolved: true,
        taskId,
        targetObservationDigest: target?.digest ?? null,
        compatibility: {
          outcome: certificate === null ? "NOT_ASSESSED" : certificate.outcome,
          issuanceDigest: certificate === null ? null : certificate.issuanceDigest,
        },
        assessment,
        availableActions: {
          rematerialize: assessment.reuse.rematerializationAvailable,
          rework: reworkOpen,
        },
        detail: assessment.detail,
      },
    };
  }

  /** The one shape an unresolved result takes, so both early exits cannot drift apart. */
  function unresolved(result: ResultSubjectRef, detail: string): ContinuationInspection {
    return {
      schemaVersion: 1,
      result,
      resolved: false,
      taskId: null,
      targetObservationDigest: null,
      compatibility: { outcome: "NOT_ASSESSED", issuanceDigest: null },
      assessment: null,
      availableActions: { rematerialize: false, rework: false },
      detail,
    };
  }

  /**
   * THE POST-REOPEN HALF — the authorities that already own it, in order:
   * G10-X head reconciliation, then D2-d delegation. Never re-ordered, never
   * duplicated here.
   */
  async function advanceAfterReopen(input: {
    readonly result: ResultSubjectRef;
    readonly taskId: string;
    readonly reopenedEventId: number | null;
  }): Promise<ReworkContinuationResult> {
    const reconciliation = await deps.canonical.reconcileHead();
    const blockers = reconciliation.blockers ?? [];
    if (reconciliation.status === "blocked") {
      return {
        schemaVersion: 1,
        state: "REOPENED_WAITING_FOR_QUIESCENCE",
        result: input.result,
        taskId: input.taskId,
        detail:
          "the governed reopening landed; the head reconciliation is blocked by other open work — one continuation command acts on one result, and the blocking work must reach quiescence (or be explicitly continued) first",
        blockers,
        reopenedEventId: input.reopenedEventId,
        headSynced: false,
        attemptId: null,
        jobId: null,
      };
    }
    if (deps.execution === null) {
      return {
        schemaVersion: 1,
        state: "READY_FOR_DELEGATION",
        result: input.result,
        taskId: input.taskId,
        detail:
          "the governed reopening landed and the head is in sync, but this deployment composes no work delegation capability — the task is ready for an explicit D2-d start",
        blockers: [],
        reopenedEventId: input.reopenedEventId,
        headSynced: true,
        attemptId: null,
        jobId: null,
      };
    }
    const open = deps.work.openAttempt(input.taskId);
    if (open !== null) {
      return {
        schemaVersion: 1,
        state: "ALREADY_IN_PROGRESS",
        result: input.result,
        taskId: input.taskId,
        detail: `an attempt for this task already holds the mutating lane (${open.state}); the record decides replay — no second rework was minted`,
        blockers: [],
        reopenedEventId: null,
        headSynced: true,
        attemptId: open.attemptId,
        jobId: null,
      };
    }
    try {
      const started = await deps.execution.startOrResume({ taskId: input.taskId });
      return {
        schemaVersion: 1,
        state: "DELEGATED",
        result: input.result,
        taskId: input.taskId,
        detail: "the governed reopening, the head reconciliation and the D2-d delegation all landed; the Work runs on the current basis",
        blockers: [],
        reopenedEventId: input.reopenedEventId,
        headSynced: true,
        // The attempt identity becomes durable when the job's prepare lands; the job handle (`jobId`)
        // is the host's view, and `followup`/`inspectAttempt` expose the attempt once it exists.
        attemptId: null,
        jobId: started.jobId,
      };
    } catch (error) {
      return {
        schemaVersion: 1,
        state: "READY_FOR_DELEGATION",
        result: input.result,
        taskId: input.taskId,
        detail: `the reopening landed and the head is in sync, but the delegation start was refused (${
          error instanceof Error ? error.message : String(error)
        }); retrying startRework continues from the durable record`,
        blockers: [],
        reopenedEventId: input.reopenedEventId,
        headSynced: true,
        attemptId: null,
        jobId: null,
      };
    }
  }

  return Object.freeze({
    adapterId: "first-party-result-continuation-service",

    inspect(input: { readonly result: ResultSubjectRef }): ContinuationInspection {
      return inspectSync(input.result).inspection;
    },

    async rematerialize(input: {
      readonly result: ResultSubjectRef;
      readonly expectedAssessmentDigest: string;
    }): Promise<RematerializationContinuationResult> {
      const { resolved, inspection } = inspectSync(input.result);
      const taskId = inspection.taskId ?? "";
      if (resolved === null || inspection.assessment === null) {
        return {
          schemaVersion: 1,
          state: "REFUSED",
          result: input.result,
          taskId,
          detail: inspection.detail,
          admissionRef: null,
          candidateRef: null,
        };
      }
      if (inspection.assessment.assessmentDigest !== input.expectedAssessmentDigest) {
        return {
          schemaVersion: 1,
          state: "STALE_INSPECTION",
          result: input.result,
          taskId,
          detail:
            "the caller's assessment digest does not match a fresh assessment of the CURRENT world — the choice was made against a world that has since moved; re-inspect and choose again (zero effects)",
          admissionRef: null,
          candidateRef: null,
        };
      }
      if (!inspection.assessment.reuse.rematerializationAvailable) {
        return {
          schemaVersion: 1,
          state: "REFUSED",
          result: input.result,
          taskId,
          detail: `the fresh assessment does not offer rematerialization for this result (${inspection.assessment.reuse.blocker ?? "no rematerialization capability is composed"})`,
          admissionRef: null,
          candidateRef: null,
        };
      }
      /**
       * THE EFFECT IS ONE PORT CALL. Admit-then-carry is a single decision chain whose ORDER is
       * its semantics (D3-c ≺ D3-d), so the port performs it and the service cannot interleave
       * an admission against one world with a carry into another.
       */
      const outcome = await deps.result.admitAndRematerialize({
        result: { kind: input.result.kind, ref: input.result.ref },
        resolved,
        issuanceDigest: inspection.compatibility.issuanceDigest ?? "",
        taskId,
        hasBasis: deps.world.hasCapturedBasis({ attemptId: input.result.ref }),
      });
      if (outcome.state === "MATERIALIZED") {
        return {
          schemaVersion: 1,
          state: "MATERIALIZED",
          result: input.result,
          taskId,
          detail: outcome.detail,
          admissionRef: outcome.admissionRef,
          candidateRef: outcome.candidateRef,
        };
      }
      return {
        schemaVersion: 1,
        state: outcome.state,
        result: input.result,
        taskId,
        detail: outcome.detail,
        admissionRef: outcome.admissionRef,
        candidateRef: null,
      };
    },

    async startRework(input: {
      readonly result: ResultSubjectRef;
      readonly expectedAssessmentDigest: string;
    }): Promise<ReworkContinuationResult> {
      // ── 1. resolve + packaged policy gates (all synchronous, zero effects) ──
      const { resolved, inspection } = inspectSync(input.result);
      const taskId = inspection.taskId ?? "";
      if (resolved === null || inspection.assessment === null) {
        return {
          schemaVersion: 1,
          state: "REFUSED",
          result: input.result,
          taskId,
          detail: inspection.detail,
          blockers: [],
          reopenedEventId: null,
          headSynced: false,
          attemptId: null,
          jobId: null,
        };
      }
      if (input.result.kind !== "ATTEMPT_RESULT") {
        return {
          schemaVersion: 1,
          state: "REFUSED",
          result: input.result,
          taskId,
          detail:
            "a derived candidate cannot authorize a rework in V1: its derivation record is not an attempt, and the durable lineage would assert a Work that never ran",
          blockers: [],
          reopenedEventId: null,
          headSynced: false,
          attemptId: null,
          jobId: null,
        };
      }

      // ── 2. THE RECORD DECIDES REPLAY (§17) — before any mint ──
      const lineage = deps.work.reworkLineage({ taskId, resultRef: input.result.ref });
      const task = deps.work.task(taskId);
      if (lineage !== null && task !== null && task.state !== "VERIFYING") {
        return advanceAfterReopen({ result: input.result, taskId, reopenedEventId: null });
      }

      // ── 3. the origin must be THIS batch's completed candidate (§11) ──
      if (task === null) {
        return refused(input.result, taskId, `task "${taskId}" does not exist in this project`);
      }
      if (task.state !== "VERIFYING") {
        return refused(
          input.result,
          taskId,
          `the task is ${task.state}, not VERIFYING: a governed reopening sets aside a completed candidate of a VERIFYING batch, and no such candidate is being held`,
        );
      }
      if (task.batchActivationEventId === null) {
        return refused(input.result, taskId, "the VERIFYING task carries no batch anchor, so no candidate can be attributed to its batch");
      }
      const origin = deps.work.attempt(input.result.ref);
      if (origin === null) {
        return refused(input.result, taskId, "the origin attempt does not exist in the Work ledger");
      }
      if (origin.taskId !== taskId) {
        return refused(input.result, taskId, `the origin attempt belongs to task "${origin.taskId}", not to the task being reopened`);
      }
      if (origin.state !== "COMPLETED") {
        return refused(input.result, taskId, `the origin attempt is ${origin.state}; only a COMPLETED candidate can be set aside by a governed reopening`);
      }
      if (origin.batchActivationEventId !== task.batchActivationEventId) {
        return refused(
          input.result,
          taskId,
          `the origin attempt belongs to batch ${String(origin.batchActivationEventId)}, not to the task's current batch ${String(task.batchActivationEventId)} — an older attempt cannot authorize this batch's rework`,
        );
      }

      // ── 4. the caller's freshness fence: intent bound to an assessment ──
      if (inspection.assessment.assessmentDigest !== input.expectedAssessmentDigest) {
        return {
          schemaVersion: 1,
          state: "STALE_INSPECTION",
          result: input.result,
          taskId,
          detail:
            "the caller's assessment digest does not match a fresh assessment of the CURRENT world — the choice was made against a world that has since moved; re-inspect and choose again (zero events, zero permits used)",
          blockers: [],
          reopenedEventId: null,
          headSynced: false,
          attemptId: null,
          jobId: null,
        };
      }

      // ── 5. §7 packaged policy — no invented reasons ──
      const reason = reworkReasonFor(inspection.assessment);
      if (reason === null) {
        return refused(
          input.result,
          taskId,
          `the fresh assessment is ${inspection.assessment.compatibility}: ${
            inspection.assessment.compatibility === "EXACT"
              ? "the result still holds exactly, so there is nothing to redo"
              : "reuse is provable — use rematerialize; the durable rework vocabulary has no honest reason for declining a provable reuse"
          }`,
        );
      }
      if (!inspection.assessment.rework.available) {
        return refused(input.result, taskId, `rework is not mechanically available: ${inspection.assessment.rework.blocker ?? "unknown blocker"}`);
      }

      // ── 6. THE AUTHORITY KERNEL — synchronous from here to the append ──
      // (inspectSync already observed the target and ran D3-b inside this span;
      // the final canonical re-observation follows, then no `await` until the
      // event has landed.)
      const targetBeforeMint = deps.world.observeTarget(taskId);
      if (targetBeforeMint === null || targetBeforeMint.digest !== inspection.targetObservationDigest) {
        return {
          schemaVersion: 1,
          state: "STALE_INSPECTION",
          result: input.result,
          taskId,
          detail:
            "the target moved between the assessment and the mint — a permit for one target observation does not authorize another; re-inspect and choose again (zero events, zero permits used)",
          blockers: [],
          reopenedEventId: null,
          headSynced: false,
          attemptId: null,
          jobId: null,
        };
      }
      const fence = deps.canonical.targetFence();
      const permit = ReworkAdmissionPermit.issue({
        projectId: deps.projectId,
        taskId,
        originResultSubjectKind: input.result.kind,
        originResultSubjectRef: input.result.ref,
        originBasisDigest: resolved.originBasisDigest,
        targetObservationDigest: targetBeforeMint.digest,
        currentEnvelopeId: task.envelopeId ?? "",
        batchActivationEventId: task.batchActivationEventId,
        reason,
        targetFence: fence,
      });
      const reopenedEventId = deps.work.reopen({
        taskId,
        batchActivationEventId: task.batchActivationEventId,
        lastEventId: task.lastEventId,
        permit,
        assessmentDigest: inspection.assessment.assessmentDigest,
      });

      // ── 7. the second half belongs to the existing owners ──
      return advanceAfterReopen({ result: input.result, taskId, reopenedEventId });
    },
  });
}