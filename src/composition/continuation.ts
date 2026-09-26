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
import { ATTEMPT_OPEN_STATES } from "../domain/state_machine.js";
import { makeResultContinuationService, type ResultContinuationService } from "../continuation/service.js";
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

  const sourceRecorder: ObservationRecorder = observations.registerObserver({
    observerId: GIT_SOURCE_OBSERVER_ID,
    observerVersion: GIT_SOURCE_OBSERVER_VERSION,
    mechanism: GIT_SOURCE_MECHANISM,
  });
  // The honest first-party reader: whole-repository read footprints and
  // honestly-unavailable facets. It grants no reach it does not have — the
  // conservative mechanism over-approximates, which is the correct direction.
  const conservative: ObservationRecorder = observations.registerObserver({
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

  // ── the narrow owner reads (§20) ──
  const connection = store.connection;
  const readTask = (taskId: string) => {
    const row = connection
      .prepare("SELECT state, state_json, last_event_id FROM tasks WHERE project_id=? AND task_id=?")
      .get(options.projectId, taskId) as
      | { state: unknown; state_json: Uint8Array; last_event_id: unknown }
      | undefined;
    if (row === undefined) return null;
    const batch = batchAnchorOf(row.state_json);
    return {
      state: String(row.state),
      batchActivationEventId: batch,
      lastEventId: Number(row.last_event_id),
    };
  };
  const readTaskEnvelopeId = (taskId: string): string | null =>
    // The Work owner reads its own envelope column (G10-W keeps that list short).
    controller.taskEnvelopeId(taskId);
  const readAttempt = (attemptId: string) => {
    const row = connection
      .prepare("SELECT task_id, state, state_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(options.projectId, attemptId) as
      | { task_id: unknown; state: unknown; state_json: Uint8Array }
      | undefined;
    if (row === undefined) return null;
    return {
      taskId: String(row.task_id ?? ""),
      state: String(row.state),
      batchActivationEventId: batchAnchorOf(row.state_json),
    };
  };
  const openAttempt = (taskId: string) => {
    const rows = connection
      .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC")
      .all(options.projectId, taskId) as Array<{ attempt_id: unknown; state: unknown }>;
    for (const row of rows) {
      if (ATTEMPT_OPEN_STATES.has(String(row.state))) {
        return { attemptId: String(row.attempt_id), state: String(row.state) };
      }
    }
    return null;
  };

  const continuation = makeResultContinuationService({
    projectId: options.projectId,
    store,
    readTask,
    readTaskEnvelopeId,
    readAttempt,
    openAttempt,
    reconcileHead: async () => {
      const outcome = await controller.reconcileProjectHead();
      return outcome.status === "blocked"
        ? { status: "blocked" as const, blockers: outcome.blockers }
        : { status: outcome.status, blockers: [] };
    },
    workDelegation: workDelegation ?? null,
    targetFence: () => controller.reworkTargetFence(),
    results,
    basisRuntime: worldBasisRuntime,
    crossBasis,
    issuer,
    observation: worldObservation,
    sourceObserver,
    conservative,
    rematerialization,
    admissionStore: admissions,
    repository,
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

/** The batch anchor a task or attempt row carries in its projected state. */
function batchAnchorOf(stateJson: Uint8Array): number | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(stateJson)) as { batch_activation_event_id?: unknown };
    return parsed.batch_activation_event_id === null || parsed.batch_activation_event_id === undefined
      ? null
      : Number(parsed.batch_activation_event_id);
  } catch {
    return null;
  }
}
