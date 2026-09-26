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
  actionKey,
} from "../domain/idempotency.js";
import { parseNewEvent, normalizeEventPayload } from "../schema/index.js";
import type { EventStore } from "../state/index.js";

import {
  ReworkAdmissionPermit,
  type ReworkReason,
  type ReworkTargetFence,
} from "../domain/rework_admission.js";
import { REPOSITORY_SOURCE } from "../project_world/dependency.js";
import { crossBasisAdmissionRefOf } from "../project_world/admission_store.js";
import { assessContinuation, type ContinuationAssessment } from "../project_world/continuation.js";
import type { CompatibilityIssuer, IssuedCompatibilityAssessment } from "../project_world/issuance.js";
import type {
  CrossBasisAdmissionRuntime,
} from "../project_world/cross_basis.js";
import type { CrossBasisAdmissionStore } from "../project_world/admission_store.js";
import type { ProjectWorldBasisRuntime, ProjectWorldObservationPort } from "../project_world/runtime.js";
import type {
  AuthoritativeResultResolver,
  ResolvedResult,
  ResultSubjectRef,
} from "../project_world/result_resolution.js";
import type {
  RematerializationRuntime,
} from "../project_world/rematerialization.js";
import type {
  ObservationRecorder,
} from "../project_world/observation_authority.js";
import type { SourceChangeObserverPort } from "../deployment/source_change_observer.js";
import type { WorkDelegationService } from "../interaction/work_delegation.js";

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
 * The narrow owner reads the service consumes. Everything here is a read an
 * existing owner already answers; the composition supplies them (§20: the
 * controller keeps its narrow reads, and the service never reaches into a
 * store it does not own).
 */
export interface ResultContinuationServiceDeps {
  readonly projectId: string;
  /** The governed append — the ONE seam that can spend a rework permit. */
  readonly store: Pick<EventStore, "appendReworkReopening" | "listEvents">;
  /** Task row as the Work owner projects it: state, batch anchor, last event id. */
  readonly readTask: (taskId: string) => {
    readonly state: string;
    readonly batchActivationEventId: number | null;
    readonly lastEventId: number;
  } | null;
  /** The envelope the task CURRENTLY carries — the E_0 a permit is spent against. */
  readonly readTaskEnvelopeId: (taskId: string) => string | null;
  /** One attempt row: which task authorized it, in which batch, in which state. */
  readonly readAttempt: (attemptId: string) => {
    readonly taskId: string;
    readonly state: string;
    readonly batchActivationEventId: number | null;
  } | null;
  /** A nonterminal attempt holding the mutating lane, or null. */
  readonly openAttempt: (taskId: string) => { readonly attemptId: string; readonly state: string } | null;
  /** G10-X — the ONLY head advance this service may call. */
  readonly reconcileHead: () => Promise<{
    readonly status: "in_sync" | "reconciled" | "blocked";
    readonly blockers?: readonly string[];
  }>;
  /** D2-d — the ONLY attempt starter. Null = no delegation capability (honest, never stubbed). */
  readonly workDelegation: WorkDelegationService | null;
  /** The canonical authority picture a mint is made under (the Work owner reads it). */
  readonly targetFence: () => ReworkTargetFence;
  /** D3/D5 authorities. Each null = capability absent; the service reports absence, never a stub. */
  readonly results: AuthoritativeResultResolver | null;
  readonly basisRuntime: ProjectWorldBasisRuntime | null;
  readonly crossBasis: CrossBasisAdmissionRuntime | null;
  readonly issuer: CompatibilityIssuer | null;
  /** The current-world observation port (source revision), shared with the cross-basis runtime. */
  readonly observation: import("../project_world/runtime.js").ProjectWorldObservationPort | null;
  /** The authority-bearing source-change observer (D3-b4), when this deployment observes source changes. */
  readonly sourceObserver: SourceChangeObserverPort | null;
  /** The conservative recorder: whole-repository reads and honestly-unavailable facets. */
  readonly conservative: ObservationRecorder | null;
  readonly rematerialization: RematerializationRuntime | null;
  readonly admissionStore: CrossBasisAdmissionStore | null;
  /** The repository the source observations are scoped to. */
  readonly repository: string | null;
  readonly clock?: (() => string) | undefined;
}

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

  /** The durable replay query (§17): has a governed TASK_READY already reopened THIS result?
   *
   * The Event Log is the ONLY source. A lineage row exists iff a TASK_READY for this task carries a
   * `rework_provenance` naming this result — the durable shadow of a spent permit. The ephemeral permit
   * object plays no part: after a restart it does not exist, and the record alone decides replay.
   */
  function existingReworkLineage(taskId: string, resultRef: string): ReworkLineageRow | null {
    for (const event of deps.store.listEvents(deps.projectId)) {
      if (event.event_type !== "TASK_READY" || event.entity_id !== taskId) continue;
      const provenance = (event.payload as { rework_provenance?: { origin_result_subject?: { ref?: unknown } } })
        .rework_provenance;
      const ref = provenance?.origin_result_subject?.ref;
      if (typeof ref === "string" && ref === resultRef) {
        return { originResultSubjectRef: ref, eventId: Number(event.event_id) };
      }
    }
    return null;
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
    readonly resolved: ResolvedResult | null;
    readonly inspection: ContinuationInspection;
  } {
    // §11 V1 boundary: the packaged face is scoped to ATTEMPT_RESULT. A derived
    // candidate's premises are its derivation RECORD, not a fresh observation —
    // packaging it here would fabricate the very fresh-facts discipline this
    // service exists to enforce. The D3 authority layer keeps serving it.
    if (result.kind !== "ATTEMPT_RESULT") {
      return {
        resolved: null,
        inspection: {
          schemaVersion: 1,
          result,
          resolved: false,
          taskId: null,
          targetObservationDigest: null,
          compatibility: { outcome: "NOT_ASSESSED", issuanceDigest: null },
          assessment: null,
          availableActions: { rematerialize: false, rework: false },
          detail:
            "the packaged continuation face V1 is scoped to attempt results; a derived candidate continues through the D3 authority layer, whose premises are its derivation record rather than a fresh observation",
        },
      };
    }
    const resolved = deps.results?.resolve(result) ?? null;
    if (resolved === null) {
      return {
        resolved: null,
        inspection: {
          schemaVersion: 1,
          result,
          resolved: false,
          taskId: null,
          targetObservationDigest: null,
          compatibility: { outcome: "NOT_ASSESSED", issuanceDigest: null },
          assessment: null,
          availableActions: { rematerialize: false, rework: false },
          detail:
            "this deployment cannot authoritatively resolve that result: unknown identity, an attempt that never completed, or a result whose basis was never captured",
        },
      };
    }

    const taskId = resolved.taskId;
    /** D3-a: EXACT currentness, re-resolved through the attempt's own captured footprint. */
    const currentness = deps.basisRuntime?.assessCurrentness({ attemptId: result.ref }) ?? null;

    /** The OBSERVED target, bound to the certificate and the permit alike. */
    const target = deps.crossBasis?.observeTarget(taskId) ?? null;

    /** D3-b through the AUTHORITY: fresh observations → refs → issue. No premise object crosses this seam. */
    const certificate: IssuedCompatibilityAssessment | null = (() => {
      if (deps.issuer === null || target === null) return null;
      const originSourceRevision = originSourceRevisionOf(result, resolved);
      const currentSource = deps.observation?.observeSource();
      const scopeOf = (from: string, to: string) => ({
        domain: "source" as const,
        scopeRef: deps.repository ?? taskId,
        from,
        to,
      });
      const unavailable = (domain: "project_semantic" | "source" | "assets" | "environment", detail: string) =>
        deps.conservative?.unavailable({ domain, detail }) ?? null;

      const changeRef =
        deps.sourceObserver !== null && originSourceRevision !== null && currentSource?.ok
          ? deps.sourceObserver.observeChange({
              fromRevision: originSourceRevision,
              toRevision: currentSource.revision.revision,
              scopeRef: deps.repository ?? taskId,
            })
          : unavailable("source", "the basis-to-current source change could not be observed");
      const writeRef =
        deps.sourceObserver !== null && originSourceRevision !== null && resolved.sourceResult !== null
          ? deps.sourceObserver.observeChange({
              fromRevision: originSourceRevision,
              toRevision: resolved.sourceResult.resultRevision,
              scopeRef: deps.repository ?? taskId,
            })
          : unavailable(
              "source",
              resolved.sourceResult === null
                ? "the result produced no canonical source revision, so its write footprint cannot be observed"
                : "the result's write footprint could not be observed",
            );
      const readRef =
        deps.conservative?.record({ scope: scopeOf(originSourceRevision ?? "", originSourceRevision ?? ""), selectors: [REPOSITORY_SOURCE] }) ??
        null;

      return deps.issuer.issue({
        resultManifestDigest: resolved.resultManifestDigest,
        originBasisDigest: resolved.originBasisDigest,
        targetObservationDigest: target.digest,
        exactlyCurrent: currentness?.currentness === "CURRENT",
        observationRefs: {
          projectSemantic: unavailable("project_semantic", "no first-party observer exists for the project semantic change domain"),
          source: changeRef,
          assets: unavailable("assets", "no first-party observer exists for the asset change domain"),
          environment: unavailable("environment", "no first-party observer exists for the environment change domain"),
          resultReads: readRef,
          resultWrites: writeRef,
        },
      });
    })();

    /** D5-a over the FRESH facts. `capabilities.rework` is a task-open fact the caller checks below. */
    const task = deps.readTask(taskId);
    const assessment = assessContinuation({
      resultSubjectRef: result,
      originBasisDigest: resolved.originBasisDigest,
      currentTargetDigest: target?.digest ?? null,
      currentness: currentness === null ? "NONE" : currentness.currentness,
      compatibility: certificate === null ? null : certificate.assessment.outcome,
      capabilities: {
        rematerialization: deps.rematerialization !== null && deps.results !== null && deps.admissionStore !== null,
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
          outcome: certificate === null ? "NOT_ASSESSED" : certificate.assessment.outcome,
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

  /** The origin source revision the observations are diffed FROM — the captured basis's own binding. */
  function originSourceRevisionOf(result: ResultSubjectRef, resolved: ResolvedResult): string | null {
    if (result.kind !== "ATTEMPT_RESULT" || deps.basisRuntime === null) return null;
    const record = deps.basisRuntime.read({ attemptId: result.ref });
    const source = record?.basis.source;
    return source !== undefined && source.state === "BOUND" ? source.value.revision : null;
  }

  /** THE GOVERNED REQUEST — the ordinary TASK_READY payload; the EventStore synthesizes the lineage. */
  function reopenRequest(taskId: string, batchActivationEventId: number, lastEventId: number) {
    return parseNewEvent({
      schema_version: 1,
      project_id: deps.projectId,
      event_type: "TASK_READY",
      payload_version: 1,
      entity_type: "task",
      entity_id: taskId,
      payload: normalizeEventPayload("TASK_READY", {
        previous_state: "VERIFYING",
        new_state: "READY",
        reason: "rework-admitted",
        batch_activation_event_id: batchActivationEventId,
      }),
      causation_id: lastEventId,
      correlation_id: `task:${taskId}:rework`,
      idempotency_key: actionKey("task-batch-settle-v1", {
        project_id: deps.projectId,
        task_id: taskId,
        batch_activation_event_id: batchActivationEventId,
        target_state: "READY",
      }),
      expected_project_revision: 0,
    });
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
    const reconciliation = await deps.reconcileHead();
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
    if (deps.workDelegation === null) {
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
    const open = deps.openAttempt(input.taskId);
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
      const started = await deps.workDelegation.start({ expectedTaskId: input.taskId });
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
      if (!inspection.assessment.reuse.rematerializationAvailable || deps.rematerialization === null || deps.admissionStore === null) {
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
      // D3-c: the admission decision is a RECORD from the fresh certificate.
      const target = deps.crossBasis?.observeTarget(taskId);
      const presented = deps.issuer?.recall(inspection.compatibility.issuanceDigest ?? "") ?? null;
      const decision = deps.crossBasis?.admit({
        presented,
        resultManifestDigest: resolved.resultManifestDigest,
        originBasisDigest: resolved.originBasisDigest,
        taskId,
        hasBasis: deps.basisRuntime?.read({ attemptId: input.result.ref }) !== null && deps.basisRuntime !== null,
      });
      if (decision === undefined || decision === null) {
        return {
          schemaVersion: 1,
          state: "EFFECT_CAPABILITY_UNAVAILABLE",
          result: input.result,
          taskId,
          detail: "no cross-basis admission runtime is composed, so the carry cannot be admitted",
          admissionRef: null,
          candidateRef: null,
        };
      }
      const admissionRecord = deps.admissionStore.record({
        schemaVersion: 1,
        admissionRef: crossBasisAdmissionRefOf({
          issuanceRef: decision.issuanceDigest ?? "",
          targetObservationDigest: decision.targetObservationDigest,
          resultSubjectRef: input.result,
        }),
        issuanceRef: decision.issuanceDigest ?? "",
        resultSubjectRef: input.result,
        resultManifestDigest: resolved.resultManifestDigest,
        originBasisDigest: resolved.originBasisDigest,
        targetObservation: {
          targetObservationDigest: decision.targetObservationDigest,
          targetBasisRevision: deps.observation?.observeSource().ok
            ? (deps.observation?.observeSource() as { readonly ok: true; readonly revision: { readonly revision: string } }).revision.revision
            : "",
          detail: target?.detail ?? "",
        },
        state: decision.state,
        admitted: decision.admitted,
        detail: decision.detail,
        recordedAt: now(),
      });
      if (!decision.admitted) {
        return {
          schemaVersion: 1,
          state: "ADMISSION_REFUSED",
          result: input.result,
          taskId,
          detail: decision.detail,
          admissionRef: admissionRecord.admissionRef,
          candidateRef: null,
        };
      }
      const outcome = await deps.rematerialization.rematerialize({ admissionRef: admissionRecord.admissionRef });
      if (outcome.state === "MATERIALIZED") {
        return {
          schemaVersion: 1,
          state: "MATERIALIZED",
          result: input.result,
          taskId,
          detail: outcome.detail,
          admissionRef: admissionRecord.admissionRef,
          candidateRef: outcome.candidate?.candidateId ?? null,
        };
      }
      return {
        schemaVersion: 1,
        state: outcome.state,
        result: input.result,
        taskId,
        detail: outcome.detail,
        admissionRef: admissionRecord.admissionRef,
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
      const lineage = existingReworkLineage(taskId, input.result.ref);
      const task = deps.readTask(taskId);
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
      const origin = deps.readAttempt(input.result.ref);
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
      const targetBeforeMint = deps.crossBasis?.observeTarget(taskId) ?? null;
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
      const fence = deps.targetFence();
      const permit = ReworkAdmissionPermit.issue({
        projectId: deps.projectId,
        taskId,
        originResultSubjectKind: input.result.kind,
        originResultSubjectRef: input.result.ref,
        originBasisDigest: resolved.originBasisDigest,
        targetObservationDigest: targetBeforeMint.digest,
        currentEnvelopeId: deps.readTaskEnvelopeId(taskId) ?? "",
        batchActivationEventId: task.batchActivationEventId,
        reason,
        targetFence: fence,
      });
      const appended = deps.store.appendReworkReopening(
        reopenRequest(taskId, task.batchActivationEventId, task.lastEventId),
        permit,
        { assessmentDigest: inspection.assessment.assessmentDigest },
      );

      // ── 7. the second half belongs to the existing owners ──
      return advanceAfterReopen({
        result: input.result,
        taskId,
        reopenedEventId: Number(appended.event_id),
      });
    },
  });
}