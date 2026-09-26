/**
 * PLMP-LEAN-1 §D5-d — the CONTINUATION composition: the D3 authority stack and
 * the D2-d execution kernel enter the packaged install here, and the packaged
 * ResultContinuationService is composed ONCE from what actually exists.
 *
 * WHAT THIS CLUSTER COMPOSES, and what it deliberately does not:
 *
 *   ObservationAuthority + the git source observer + a conservative recorder
 *                              → the D3-R1 premise authority (durable records)
 *   CompatibilityIssuer        → the D3-b certificate authority (durable, restart-proof)
 *   CrossBasisAdmissionRuntime + store → the D3-c admission authority
 *   RematerializationRuntime   → the D3-d carry effect (git source facet)
 *   first-party result resolver + candidate store → the D5-0 result identity
 *   WorkDelegationService      → the D2-d execution kernel (ONLY when a worker
 *                                port was supplied; its absence is honest, and
 *                                the continuation service then reports
 *                                READY_FOR_DELEGATION instead of pretending)
 *
 * CAPABILITY = COMPOSED RUNTIME FACT (§23). The service's capabilities are read
 * off the objects THIS function created — never off whether an option was
 * passed. That is the lesson D2-LIVE paid for: an option says how something was
 * REQUESTED, a composition says what EXISTS.
 *
 * OWNERSHIP (§22): the four D3 stores this cluster creates are returned as
 * `ownedResources` and closed by `composeInstalledLifecycle` — the first
 * packaged composition of the D3-R components produces no handle leak, and
 * there is deliberately NO ContinuationStore: the service is a stateless
 * orchestrator over durable owners, so there is nothing of its own to close.
 *
 * ABSENCE SEMANTICS: no repository, or no world-basis runtime (the same
 * conditions under which D3-a cannot observe), ⇒ no continuation face at all —
 * never a stub.
 *
 * COMPOSITION ONLY. No policy, no discovery, no string-keyed lookup; the input
 * is a narrow record of already-composed locals.
 */
import { dirname, join } from "node:path";

import {
  makeObservationAuthority,
  type ObservationAuthority,
  type ObservationRecorder,
} from "../project_world/observation_authority.js";
import { makeCompatibilityIssuer, type CompatibilityIssuer } from "../project_world/issuance.js";
import { makeCrossBasisAdmissionRuntime, type CrossBasisAdmissionRuntime } from "../project_world/cross_basis.js";
import { makeCrossBasisAdmissionStore, type CrossBasisAdmissionStore } from "../project_world/admission_store.js";
import { SqliteDerivedResultCandidateStore } from "../project_world/candidate_store.js";
import { makeRematerializationRuntime, type RematerializationRuntime } from "../project_world/rematerialization.js";
import type { AuthoritativeResultResolver } from "../project_world/result_resolution.js";
import type { ProjectWorldBasisRuntime, ProjectWorldObservationPort } from "../project_world/runtime.js";
import { gitSourceChangeObserver, GIT_SOURCE_OBSERVER_ID, GIT_SOURCE_OBSERVER_VERSION, GIT_SOURCE_MECHANISM } from "../deployment/source_change_observer.js";
import { gitSourceRematerializer } from "../deployment/source_rematerializer.js";
import { firstPartyResultResolver } from "../deployment/result_resolution.js";
import { firstPartyAttemptResultVerificationSource } from "../project_verification/index.js";
import type { WorkDelegationService, WorkWorkerRunPort } from "../interaction/work_delegation.js";
import { makeWorkDelegationService } from "../interaction/work_delegation.js";
import { makeResultContinuationService, type ResultContinuationService } from "../continuation/service.js";
import type {
  ContinuationCanonicalPort,
  ContinuationExecutionPort,
  ContinuationResolvedResult,
  ContinuationResultPort,
  ContinuationWorkPort,
  ContinuationWorldPort,
} from "../continuation/ports.js";
import type { IssuedCompatibilityAssessment } from "../project_world/issuance.js";
import { crossBasisAdmissionRefOf } from "../project_world/admission_store.js";
import { REPOSITORY_SOURCE } from "../project_world/dependency.js";
import { actionKey } from "../domain/idempotency.js";
import { normalizeEventPayload, parseNewEvent } from "../schema/index.js";
import type { EventStore } from "../state/index.js";
import type { ProjectController } from "../tools/controller.js";
import type { OwnedResource } from "./lifecycle.js";

/** Exactly the public options this cluster may read. */
export interface ContinuationCompositionOptions {
  readonly projectId: string;
  readonly repository: string | undefined;
  readonly databasePath: string | undefined;
  readonly clock?: (() => string) | undefined;
  /**
   * §D5-d3: the D2-d worker port factory. A host that can EXECUTE work supplies
   * one (the first-party default is `dshSubprocessWorkWorkerPort`); without one
   * the continuation service still reopens and reconciles, and honestly reports
   * `READY_FOR_DELEGATION` — the capability is absent, never stubbed.
   */
  readonly workWorkerPort?: ((worldPath: string) => WorkWorkerRunPort) | undefined;
}

export interface ContinuationCompositionInput {
  readonly options: ContinuationCompositionOptions;
  readonly store: EventStore;
  readonly controller: ProjectController;
  /** The §D3-a runtime composed by the core cluster (a repository was present). */
  readonly worldBasisRuntime: ProjectWorldBasisRuntime | undefined;
  /** The SAME world observation the basis runtime uses — one spelling of the current world. */
  readonly worldObservation: ProjectWorldObservationPort | undefined;
  /** The canonical execution-world root the effect ports address worlds under. */
  readonly worldsRoot: string;
}

export interface ContinuationComposition {
  readonly continuation: ResultContinuationService | undefined;
  /** The D2-d kernel as composed — exposed for hosts that delegate WITHOUT a continuation. */
  readonly workDelegation: WorkDelegationService | undefined;
  /** The D3 stores this cluster created; closed by the install lifecycle. */
  readonly ownedResources: readonly OwnedResource[];
}

export function composeContinuationCapability(input: ContinuationCompositionInput): ContinuationComposition {
  const { options, store, controller } = input;
  const repository = options.repository;
  // Absence is decided once, above; these are the narrowed bindings the ports close over.
  const worldBasisRuntime = input.worldBasisRuntime;
  const worldObservation = input.worldObservation;

  // Absence semantics: without a repository there is no world to observe, and
  // without the basis runtime D3-a has no origin to assess against. The face is
  // absent — never a stub.
  if (repository === undefined || repository === "" || worldBasisRuntime === undefined || worldObservation === undefined) {
    return { continuation: undefined, workDelegation: undefined, ownedResources: Object.freeze([]) };
  }

  // One sibling directory of the orchestration store, like every other
  // deployment-local store (the same derivation the operating, verification and
  // world-basis stores use).
  const derivedStorePath =
    options.databasePath === undefined || options.databasePath === ":memory:"
      ? ":memory:"
      : join(dirname(options.databasePath), "continuation");

  let observations: ObservationAuthority | undefined;
  let issuer: CompatibilityIssuer | undefined;
  let admissions: CrossBasisAdmissionStore | undefined;
  let candidates: SqliteDerivedResultCandidateStore | undefined;
  try {
    observations = makeObservationAuthority({ databasePath: join(derivedStorePath, "observations.sqlite"), ...(options.clock === undefined ? {} : { clock: options.clock }) });
    issuer = makeCompatibilityIssuer({
      issuerId: "palimpsest-first-party",
      observations,
      databasePath: join(derivedStorePath, "compatibility_issuance.sqlite"),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    admissions = makeCrossBasisAdmissionStore({ databasePath: join(derivedStorePath, "cross_basis_admission.sqlite") });
    candidates = new SqliteDerivedResultCandidateStore(join(derivedStorePath, "derived_result_candidate.sqlite"));
  } catch {
    // An unusable D3 store must not take the runtime down: the continuation face
    // is simply absent (never a stub), and whatever opened is released here.
    observations?.close();
    issuer?.close();
    admissions?.close();
    candidates?.close();
    return { continuation: undefined, workDelegation: undefined, ownedResources: Object.freeze([]) };
  }

  // The try/catch above proves every one of these is present; `let` bindings lose that proof
  // inside a closure, so they are frozen into consts for the ports to close over.
  const openStores = { observations, issuer, admissions, candidates };

  const sourceRecorder: ObservationRecorder = openStores.observations.registerObserver({
    observerId: GIT_SOURCE_OBSERVER_ID,
    observerVersion: GIT_SOURCE_OBSERVER_VERSION,
    mechanism: GIT_SOURCE_MECHANISM,
  });
  // The honest first-party reader: whole-repository read footprints and
  // honestly-unavailable facets. It grants no reach it does not have — the
  // conservative mechanism over-approximates, which is the correct direction.
  const conservative: ObservationRecorder = openStores.observations.registerObserver({
    observerId: "world-materializer",
    observerVersion: "1",
    mechanism: "CONSERVATIVE_DOMAIN",
  });
  const sourceObserver = gitSourceChangeObserver({ repository, recorder: sourceRecorder });

  const results: AuthoritativeResultResolver = firstPartyResultResolver({
    owner: {
      projectId: options.projectId,
      attemptBasis: (attemptId) => {
        const record = worldBasisRuntime.read({ attemptId });
        return record === null ? null : { basis: record.basis, taskId: record.taskId };
      },
    },
    attemptResultSource: firstPartyAttemptResultVerificationSource(controller),
    candidates,
  });

  const crossBasis: CrossBasisAdmissionRuntime = makeCrossBasisAdmissionRuntime({
    issuer,
    observation: worldObservation,
  });

  const rematerialization: RematerializationRuntime = makeRematerializationRuntime({
    issuer,
    rematerializer: gitSourceRematerializer({ repository, worldsRoot: input.worldsRoot }),
    candidates,
    admissions,
    results,
    observeCurrentTarget: (taskId) => {
      const target = crossBasis.observeTarget(taskId);
      const source = worldObservation.observeSource();
      return {
        targetObservationDigest: target.digest,
        // An unobservable source cannot anchor a world; the empty revision fails
        // the effect honestly instead of naming a basis nobody observed.
        targetBasisRevision: source.ok ? source.revision.revision : "",
      };
    },
  });

  // §D2-d: the execution kernel, composed ONLY from what exists. `workerFor` is
  // a port PER job, bound to the world the job's prepare materializes.
  const workDelegation: WorkDelegationService | undefined =
    options.workWorkerPort === undefined
      ? undefined
      : makeWorkDelegationService({ controller, workerFor: options.workWorkerPort });

  // ── the narrow owner reads (SR-2 §20) ──
  /**
   * ── THE FIVE PORTS (SR-2 §八) ───────────────────────────────────────────────────────────
   *
   * This is the ONE place allowed to see the concrete wiring: the D3-R authorities, the world
   * runtime, the event log and the delegation service. The service on the other side of these
   * ports knows none of those names.
   *
   *     composition knows wiring;  service knows semantics.
   */
  /**
   * SR-2 §九: these three reads are the Work read owner's, not this composition's.
   *
   * They were written here as their own SQL — a second reading of the same facts the controller
   * reads — which is precisely the duplication the slice removes ("same semantic question ⇒ one
   * reader"). The composition still WIRES the work port; it no longer interprets the projections.
   */
  const readTask = (taskId: string) => controller.work.task(taskId);
  const readAttempt = (attemptId: string) => controller.work.attempt(attemptId);
  const openAttempt = (taskId: string) => {
    const held = controller.work.openAttemptFor(taskId);
    return held === null ? null : { attemptId: held.attemptId, state: held.state };
  };

  /**
   * The narrowing the early return established, restated for the closures below: TypeScript
   * cannot carry a control-flow proof into a nested function body, and re-asserting it here is
   * cheaper than threading optionals through every port.
   */
  const basisRuntime = worldBasisRuntime;
  const observation = worldObservation;
  const repo = repository;
  const certificateIssuer = openStores.issuer;
  const rematerializationRuntime = rematerialization;
  const admissionStore = openStores.admissions;
  const delegation = workDelegation;
  const now = (): string => (options.clock ?? (() => new Date().toISOString()))();

  /**
   * THE FRESH-FACTS CERTIFICATE — the D3-R chain in the one order it may run:
   * D3-a → authority-bearing observations → the existing issuer.
   *
   * It lives in the composition because it is WIRING: it says which observer observes which
   * facet on THIS deployment. It adds no compatibility reasoning — the issuer stays the only
   * engine, and the service never reaches one directly.
   */
  function issueCertificate(input: {
    readonly result: ContinuationResolvedResult;
    readonly currentness: { readonly currentness: string } | null;
    readonly target: { readonly digest: string; readonly detail: string } | null;
  }): IssuedCompatibilityAssessment | null {
    const { result, currentness, target } = input;
    if (target === null) return null;
    const originSourceRevision = (() => {
      const record = basisRuntime.read({ attemptId: result.resultSubjectRef.ref });
      const source = record?.basis.source;
      return source !== undefined && source.state === "BOUND" ? source.value.revision : null;
    })();
    const currentSource = observation.observeSource();
    const scopeOf = (from: string, to: string) => ({ domain: "source" as const, scopeRef: repo, from, to });
    const unavailable = (domain: "project_semantic" | "source" | "assets" | "environment", detail: string) =>
      conservative.unavailable({ domain, detail });

    const changeRef =
      originSourceRevision !== null && currentSource.ok
        ? sourceObserver.observeChange({
            fromRevision: originSourceRevision,
            toRevision: currentSource.revision.revision,
            scopeRef: repo,
          })
        : unavailable("source", "the basis-to-current source change could not be observed");
    const writeRef =
      originSourceRevision !== null && result.sourceResult !== null
        ? sourceObserver.observeChange({
            fromRevision: originSourceRevision,
            toRevision: result.sourceResult.resultRevision,
            scopeRef: repo,
          })
        : unavailable(
            "source",
            result.sourceResult === null
              ? "the result produced no canonical source revision, so its write footprint cannot be observed"
              : "the result's write footprint could not be observed",
          );
    const readRef =
      originSourceRevision === null
        ? null
        : conservative.record({
            scope: scopeOf(originSourceRevision, originSourceRevision),
            selectors: [REPOSITORY_SOURCE],
          });

    return certificateIssuer.issue({
      resultManifestDigest: result.resultManifestDigest,
      originBasisDigest: result.originBasisDigest,
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
  }

  /** The WORLD port: D3-a + the authority-bearing observations + the existing D3-b issuer. */
  const worldPort: ContinuationWorldPort = {
    inspect: ({ result }) => {
      const resolvedResult = results.resolve(result);
      if (resolvedResult === null) {
        return { resolved: null, currentness: null, targetObservation: null, compatibility: null };
      }
      const currentness = worldBasisRuntime.assessCurrentness({ attemptId: result.ref });
      const target = crossBasis.observeTarget(resolvedResult.taskId);
      const certificate = issueCertificate({ result: resolvedResult, currentness, target });
      return {
        resolved: resolvedResult,
        currentness: currentness === null ? null : currentness.currentness,
        targetObservation: target,
        compatibility:
          certificate === null
            ? null
            : { outcome: certificate.assessment.outcome, issuanceDigest: certificate.issuanceDigest },
      };
    },
    observeTarget: (taskId) => crossBasis.observeTarget(taskId),
    rematerializationAvailable: rematerialization !== null && admissions !== null,
    hasCapturedBasis: ({ attemptId }) => basisRuntime.read({ attemptId }) !== null,
  };

  /** The RESULT port: D3-c admission ≺ D3-d carry, as ONE ordered chain. */
  const resultPort: ContinuationResultPort = {
    admitAndRematerialize: async ({ result, resolved, issuanceDigest, taskId, hasBasis }) => {
      if (rematerializationRuntime === null || admissionStore === null) {
        return {
          state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
          admissionRef: null,
          candidateRef: null,
          detail: "no cross-basis admission runtime is composed, so the carry cannot be admitted",
        };
      }
      const target = crossBasis.observeTarget(taskId);
      const decision = crossBasis.admit({
        presented: certificateIssuer.recall(issuanceDigest),
        resultManifestDigest: resolved.resultManifestDigest,
        originBasisDigest: resolved.originBasisDigest,
        taskId,
        hasBasis,
      });
      const source = observation.observeSource();
      const admissionRecord = admissionStore.record({
        schemaVersion: 1,
        admissionRef: crossBasisAdmissionRefOf({
          issuanceRef: decision.issuanceDigest ?? "",
          targetObservationDigest: decision.targetObservationDigest,
          resultSubjectRef: result,
        }),
        issuanceRef: decision.issuanceDigest ?? "",
        resultSubjectRef: result,
        resultManifestDigest: resolved.resultManifestDigest,
        originBasisDigest: resolved.originBasisDigest,
        targetObservation: {
          targetObservationDigest: decision.targetObservationDigest,
          targetBasisRevision: source.ok ? source.revision.revision : "",
          detail: target.detail,
        },
        state: decision.state,
        admitted: decision.admitted,
        detail: decision.detail,
        recordedAt: now(),
      });
      if (!decision.admitted) {
        return {
          state: "ADMISSION_REFUSED" as const,
          admissionRef: admissionRecord.admissionRef,
          candidateRef: null,
          detail: decision.detail,
        };
      }
      const outcome = await rematerializationRuntime.rematerialize({ admissionRef: admissionRecord.admissionRef });
      return {
        state: outcome.state === "MATERIALIZED" ? ("MATERIALIZED" as const) : ("REMATERIALIZATION_FAILED" as const),
        admissionRef: admissionRecord.admissionRef,
        candidateRef: outcome.candidate?.candidateId ?? null,
        detail: outcome.detail,
      };
    },
  };

  /** The WORK port: the Work facts, the durable replay query, and the ONE governed append. */
  const workPort: ContinuationWorkPort = {
    task: readTask,
    attempt: readAttempt,
    openAttempt,
    reworkLineage: ({ taskId, resultRef }) => {
      // The Event Log is the ONLY source: a lineage row exists iff a TASK_READY for this task
      // carries a `rework_provenance` naming this result — the durable shadow of a spent permit.
      // The ephemeral permit plays no part: after a restart it does not exist, and the record
      // alone decides replay.
      for (const event of store.listEvents(options.projectId)) {
        if (event.event_type !== "TASK_READY" || event.entity_id !== taskId) continue;
        const provenance = (
          event.payload as { rework_provenance?: { origin_result_subject?: { ref?: unknown } } }
        ).rework_provenance;
        const ref = provenance?.origin_result_subject?.ref;
        if (typeof ref === "string" && ref === resultRef) return { eventId: Number(event.event_id) };
      }
      return null;
    },
    reopen: ({ taskId, batchActivationEventId, lastEventId, permit, assessmentDigest }) => {
      const appended = store.appendReworkReopening(
        parseNewEvent({
          schema_version: 1,
          project_id: options.projectId,
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
            project_id: options.projectId,
            task_id: taskId,
            batch_activation_event_id: batchActivationEventId,
            target_state: "READY",
          }),
          expected_project_revision: 0,
        }),
        permit,
        { assessmentDigest },
      );
      return Number(appended.event_id);
    },
  };

  /** The CANONICAL port: the head authority. The service never sees PromotionManager. */
  const canonicalPort: ContinuationCanonicalPort = {
    targetFence: () => controller.reworkTargetFence(),
    reconcileHead: async () => {
      const outcome = await controller.reconcileProjectHead();
      return outcome.status === "blocked"
        ? { status: "blocked" as const, blockers: outcome.blockers }
        : { status: outcome.status, blockers: [] };
    },
  };

  /** The EXECUTION port: D2-d, unchanged, behind one verb. */
  const executionPort: ContinuationExecutionPort | null = (() => {
    // `workDelegation` is `undefined` when this deployment composed no worker port — an absence
    // the service reports honestly rather than a stub.
    if (delegation === undefined) return null;
    const bound = delegation;
    return {
      startOrResume: async ({ taskId }) => ({ jobId: (await bound.start({ expectedTaskId: taskId })).jobId }),
    };
  })();

  const continuation = makeResultContinuationService({
    projectId: options.projectId,
    work: workPort,
    world: worldPort,
    result: resultPort,
    canonical: canonicalPort,
    execution: executionPort,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return {
    continuation,
    workDelegation,
    ownedResources: Object.freeze([
      { what: "observationAuthority", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => observations?.close() },
      { what: "compatibilityIssuer", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => issuer?.close() },
      { what: "crossBasisAdmissionStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => admissions?.close() },
      { what: "derivedResultCandidateStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => candidates?.close() },
    ]),
  };
}

