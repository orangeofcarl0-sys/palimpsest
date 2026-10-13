/**
 * Trajectory-P2-C §7 — THE EXECUTION-ASSOCIATION PRODUCT COMPOSITION CLUSTER.
 *
 * ONE composition module that turns the P2-B domain into a NORMAL product capability. It owns the WIRING
 * and nothing else: the durable store, the trusted recorder, the source-verifying qualifier, the official
 * DSH reader, the host-derived Work Worker Port and the read-only attributed Preview are all existing
 * modules; this file decides which of them exist, in what order they are created, and who closes them.
 *
 * WHY A SEPARATE MODULE (§7.8). `install.ts` must stay a COMPOSITION ROOT: bounded fan-out and no direct
 * capability-family imports (the `SR-1 §25 A03` rule, enforced by `test/architecture/composition_root_rules`).
 * The whole of P2-C's new wiring therefore lives HERE, and `install.ts` calls this one function.
 *
 * OWNERSHIP (§7.5). The STORE is created here and is therefore `INSTALL_CREATED_AND_MANAGED`: the install
 * closes it through its lifecycle. The RECORDER and QUALIFIER are stateless wrappers over that store.
 * The READER holds a mounted Cordis fiber and exposes `close()`, registered as an owned resource. Nothing
 * here closes a caller-supplied store.
 *
 * ABSENCE IS HONEST (§7.2). Every capability is present exactly when its real dependency exists:
 *   · no host executable facts ⇒ no Work Worker Port ⇒ no Work Delegation, never a stub;
 *   · no derivable durable path ⇒ no association store;
 *   · no DSH home / sessions root ⇒ the reader is absent and the preview reports an unavailable source.
 *
 * COMPOSING THIS DOES NOT EXECUTE ANYTHING. It starts no worker, claims no attempt, schedules nothing and
 * runs no model. Execution stays with the existing Work/Continuation authority.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import { dirname, join } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";
import type { EventStore } from "../state/index.js";
import type { ProjectController } from "../tools/controller.js";
import type { ContextService } from "../context/service.js";
import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  makeTrustedSourceRegistry,
  type AssociationQualifier,
  type ExecutionAssociationRecorder,
  type ExecutionAssociationStore,
  type SourceKind,
  type TrustedSourceEpoch,
  type WorkRevalidationPort,
} from "../execution_association/index.js";
import type { DshSessionReadPort } from "../trajectory/execution.js";
import { buildTrajectoryPresentation } from "../trajectory/presentation.js";
import { dshSubprocessWorkWorkerPort } from "../deployment/work_worker.js";
import { admitAttempt, buildRelationContext, projectEvolutionOf, type TrajectoryV0WorkOwner } from "./trajectory_v0.js";
import { composeTrajectoryInputs } from "./trajectory.js";
import { composeAttributedPreview, type AttributedPreviewService, type CapsuleAuthorizationPort } from "./attributed_preview.js";
import type { WorkDelegationService, WorkWorkerRunPort } from "../interaction/work_delegation.js";
import type { OwnedResource } from "./lifecycle.js";

/** §7.6: the official reader module, resolved as a bare specifier in production (the DSH host process has
 * the package installed under its profile's `node_modules`). A caller may override it — the same
 * configuration style the host already uses for `palimpsestEntry` — which is what lets a test process
 * (running outside the DSH profile) point at the same implementation by absolute path. */
const DEFAULT_SESSION_READER_MODULE = "palimpsest-host-deployment/runtime/session_reader.js";

/** Exactly the public options this cluster may read (the `*CompositionOptions` idiom the other clusters use). */
export interface ExecutionAssociationClusterOptions {
  readonly projectId: string;
  readonly databasePath: string | undefined;
  /** §7.1: the HOST's own executable facts. Absent ⇒ no Work Worker Port, never a stub. */
  readonly workWorkerBin: string | undefined;
  readonly workWorkerProfile: string | undefined;
  readonly workWorkerTimeoutMs: number | undefined;
  /** §6.1: the deployment's own classification of that executable. */
  readonly executionAssociationSourceKind: SourceKind | undefined;
  /** §7.6: the DSH home and session root, when the deployment knows them. */
  readonly dshHomePath: string | undefined;
  readonly dshSessionsRoot: string | undefined;
  readonly sessionReaderModule: string | undefined;
  /** An explicitly supplied port factory overrides the host-derived one (the pre-P2-C path). */
  readonly workWorkerPort: ((worldPath: string) => WorkWorkerRunPort) | undefined;
  /** §6.1: historical trusted epochs, so an upgrade does not invalidate history. */
  readonly historicalEpochs?: readonly TrustedSourceEpoch[] | undefined;
  /**
   * P2-D0 §8.3: the optional cross-owner reads the T0 project-evolution projection consumes. They are the
   * SAME owners `composeTrajectoryV0` is composed from, passed through so the attributed Preview presents
   * the real projection rather than an empty one with a caveat. Absent ⇒ the projection honestly reports
   * the missing owners through its basis vector, exactly as the V0 composition does.
   */
  readonly trajectoryOwners?: {
    readonly reasoning: import("../reasoning_cell/index.js").ReasoningCellService | undefined;
    readonly proof: import("../proof_asset/index.js").ProofEvidenceService | undefined;
    readonly projectWorkspace: import("../project_workspace/index.js").ProjectWorkspaceService | undefined;
    readonly journalStore: import("../project_workspace/index.js").ProjectJournalStore | undefined;
    readonly associationStore: import("../project_workspace/index.js").ProjectAssetAssociationStore | undefined;
  } | undefined;
  /** Trajectory-P2-D1 §11.5: the EXPERIMENTAL Attempt-bound delivery toggle. DEFAULT OFF. */
  readonly experimentalTrajectoryContextDelivery?: boolean | undefined;
  /** Trajectory-P2-D1 §9.2: an optional LOWER Capsule byte budget for the experimental delivery. */
  readonly trajectoryCapsuleMaxSerializedBytes?: number | undefined;
  /**
   * Trajectory-P2-D2 §7/§8: the EXPERIMENTAL presentation ARM. `CONTROL` renders the no-history boundary;
   * `TREATMENT` renders the actual qualified Capsule. Absent ⇒ `OFF` (no section). The arm is TRUSTED
   * CONFIGURATION fixed before Worker execution; a model cannot choose it (§8.4).
   */
  readonly trajectoryPresentationMode?: "OFF" | "CONTROL" | "TREATMENT" | undefined;
  /** Trajectory-P2-D2 §7.7: an optional LOWER section byte budget. A caller may lower, never raise. */
  readonly trajectorySectionMaxBytes?: number | undefined;
}

export interface ExecutionAssociationClusterInput {
  readonly options: ExecutionAssociationClusterOptions;
  readonly store: EventStore;
  readonly controller: ProjectController;
}

export interface ExecutionAssociationCluster {
  /** §7.1: the Work Worker Port factory for the continuation cluster, or undefined (absent is honest). */
  readonly workWorkerPortFactory: ((worldPath: string) => WorkWorkerRunPort) | undefined;
  /** §7.3: the trusted recorder, wired by the continuation cluster to `onCorrelatedSessionIdentity`. */
  readonly recorder: ExecutionAssociationRecorder | undefined;
  /** §7.4: the source-qualification label the port records, derived from the deployment's own kind. */
  readonly sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED" | "CONTROLLED_STUB" | "DIRECT_CHILD_IPC";
  /** §7.5: the qualifier, exposed so a host can read qualifications directly. */
  readonly qualifier: AssociationQualifier | undefined;
  /** §7.7: the read-only attributed Preview surface. */
  readonly trajectory: { readonly attributedPreview: AttributedPreviewService } | undefined;
  /**
   * Trajectory-P2-D1 §11: the Attempt-bound delivery provider for the EXPERIMENTAL capability, or undefined.
   * Present ONLY when the deployment enabled it; the install binds it to the context owner. It resolves the
   * consumer attempt's own Capsule through the ordinary `capsuleForConsumer` path.
   */
  readonly trajectoryCapsuleDelivery:
    | ((input: { readonly attemptId: string }) => Promise<{ readonly capsule: unknown; readonly serializedBytes: number; readonly contentDigest: string; readonly originAttemptId: string; readonly framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS"; readonly authority: "READ_ONLY_INSPECTION"; readonly schemaVersion: number; readonly presentation: import("../context/service.js").TrajectoryPresentationDelivery | null; readonly deliveryState: import("../context/service.js").TrajectoryDeliveryState } | null>)
    | undefined;
  /** §7.5: resources this cluster created and the install must close. */
  readonly ownedResources: readonly OwnedResource[];
}

/** §7.5: derive the association store path from the deployment's durable root, or undefined. */
export function deriveExecutionAssociationPath(databasePath: string | undefined): string | undefined {
  if (databasePath === undefined || databasePath.length === 0) return undefined;
  if (databasePath === ":memory:") return ":memory:";
  return join(dirname(databasePath), "execution-associations.sqlite");
}

/** §7.1: map the deployment's source kind onto the port's observation-qualification label. */
function qualificationLabelOf(kind: SourceKind): "FIRST_PARTY_DSH_QUALIFIED" | "CONTROLLED_STUB" | "DIRECT_CHILD_IPC" {
  if (kind === "FIRST_PARTY_DSH_HOST") return "FIRST_PARTY_DSH_QUALIFIED";
  if (kind === "CONTROLLED_STUB") return "CONTROLLED_STUB";
  return "DIRECT_CHILD_IPC";
}

/**
 * §7.1/§7.2: derive the Work Worker Port factory from the HOST's own launch facts.
 *
 * The host already knows its DSH executable and profile name (the same facts `deriveBranchHost` uses), so
 * the port is derived from those rather than from a model-supplied path. Absent facts ⇒ absent factory.
 */
function deriveWorkWorkerPortFactory(options: ExecutionAssociationClusterOptions): ((worldPath: string) => WorkWorkerRunPort) | undefined {
  if (options.workWorkerPort !== undefined) return options.workWorkerPort;
  const dshBin = options.workWorkerBin?.trim();
  const profile = options.workWorkerProfile?.trim();
  if (dshBin === undefined || dshBin.length === 0 || profile === undefined || profile.length === 0) return undefined;
  const port = dshSubprocessWorkWorkerPort({
    dshBin,
    profile,
    ...(options.workWorkerTimeoutMs === undefined ? {} : { timeoutMs: options.workWorkerTimeoutMs }),
  });
  return () => port;
}

/** §6.5: the Work revalidation port, reusing the ordinary Preview's exact-`ATTEMPT_CREATED` admission. */
function makeWorkRevalidation(input: { readonly projectId: string; readonly store: EventStore; readonly controller: ProjectController }): WorkRevalidationPort {
  return {
    readAttempt: ({ attemptId }) => {
      const events = input.store.listEvents(input.projectId);
      const attemptRecord = input.controller.attemptWorkRecord(attemptId);
      try {
        const admitted = admitAttempt({ projectId: input.projectId, attemptId, events, record: attemptRecord });
        return { ok: true, taskId: attemptRecord?.taskId ?? null, state: attemptRecord?.state ?? null, creationEventId: String(admitted.created.event_id) };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * P2-D0 §10.3 / P2-D1 §10.3: THE CONSUMER-AUTHORIZATION PORT.
 *
 * The source of permission is the consumer Attempt's OWN canonical Work lineage: a governed TASK_READY that
 * names this attempt's creation event and carries a `rework_provenance.origin_result_subject.ref`.
 *
 * P2-D1 §10.3 CORRECTION: this no longer maintains its OWN event-log scan. It reuses the CONTEXT OWNER's
 * `governedReworkOriginOf()` — the SAME resolution the PriorResultContext is compiled from, bounded by the
 * attempt's creation event — so there is ONE meaning of "Governed Rework lineage" rather than two. The
 * consumer cannot choose an origin by naming one; an attempt with no lineage may inspect no history.
 */
export function makeCapsuleAuthorization(input: { readonly projectId: string; readonly store: EventStore; readonly controller: ProjectController; readonly contextService: ContextService }): CapsuleAuthorizationPort {
  return {
    resolvePermittedOrigin: ({ consumerAttemptId }) => {
      const record = input.controller.attemptWorkRecord(consumerAttemptId);
      if (record === null) return { ok: false, reason: "CONSUMER_NOT_CANONICAL", detail: `attempt ${consumerAttemptId} is not a canonical attempt of this project` };
      /**
       * §10.3: the Context Owner resolves the lineage. Its own attempt-creation bound is what keeps the
       * permission attempt-scoped: a TASK_READY that appeared AFTER the consumer was created cannot rebind it.
       */
      const origin = input.contextService.governedReworkOriginOf(consumerAttemptId);
      if (origin === null) {
        return { ok: false, reason: "NO_LINEAGE", detail: `attempt ${consumerAttemptId} has no governed rework lineage, so it may inspect no historical attempt` };
      }
      /**
       * §10.3: the origin subject must be compatible with an actual Attempt. The governed lineage names a
       * result SUBJECT; its `ref` is the origin AttemptId the Context Owner already verified when it compiled
       * the PriorResultContext (an unresolvable origin fails that compilation closed). The kind is carried so
       * a non-attempt subject cannot masquerade as one.
       */
      if (origin.originResultSubjectKind !== "attempt_result" && origin.originResultSubjectKind !== "unknown") {
        return { ok: false, reason: "NO_LINEAGE", detail: `attempt ${consumerAttemptId}'s lineage names an origin result of kind "${origin.originResultSubjectKind}", which is not an attempt result` };
      }
      if (input.controller.attemptWorkRecord(origin.originAttemptId) === null) {
        return { ok: false, reason: "NO_LINEAGE", detail: `attempt ${consumerAttemptId}'s lineage names origin attempt ${origin.originAttemptId}, which is not a canonical attempt of this project` };
      }
      return {
        ok: true,
        originAttemptId: origin.originAttemptId,
        basis: `the consumer attempt ${consumerAttemptId} is a governed continuation of origin attempt ${origin.originAttemptId}, established by the Context Owner's rework lineage at event_id ${String(origin.reworkEventId)}`,
      };
    },
  };
}

/** §7.6: load the shipped official reader, or report absence. */
async function loadSessionReader(input: {
  readonly dshHomePath: string | undefined;
  readonly sessionsRoot: string | undefined;
  readonly moduleSpecifier: string;
}): Promise<DshSessionReadPort | undefined> {
  if (input.dshHomePath === undefined || input.sessionsRoot === undefined) return undefined;
  let module: { makeRealDshSessionReader: (i: { dshHomePath: string; sessionsRoot: string }) => Promise<DshSessionReadPort | null> };
  try {
    module = (await import(input.moduleSpecifier)) as typeof module;
  } catch {
    return undefined;
  }
  if (typeof module.makeRealDshSessionReader !== "function") return undefined;
  try {
    return (await module.makeRealDshSessionReader({ dshHomePath: input.dshHomePath, sessionsRoot: input.sessionsRoot })) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * §7: compose the whole execution-association cluster.
 *
 * SYNCHRONOUS on purpose: `installPalimpsest` is synchronous, so the reader is a LAZY handle whose Cordis
 * backend mounts on first use. A deployment that never reads a session mounts nothing, and the
 * capability's PRESENCE is still known synchronously.
 */
export function composeExecutionAssociationCluster(input: ExecutionAssociationClusterInput): ExecutionAssociationCluster {
  const { options } = input;
  /**
   * P2-D0 §9.6: THE EXPERT-PORT ALIGNMENT RULE.
   *
   * An explicitly supplied Worker Port replaces the host-derived one, but it is an OPAQUE caller object:
   * nothing proves it launches the executable `workWorkerBin` names. Deriving a FIRST_PARTY_DSH_HOST basis
   * from `workWorkerBin` while the ACTUAL producer is a caller stub is exactly how a stub would borrow
   * first-party authority (F11). The two facts must agree, and only the caller can assert that they do.
   *
   * So: an explicit port with NO explicit source kind is classified `UNKNOWN`, never `FIRST_PARTY_DSH_HOST`.
   * A caller that really is driving the configured first-party binary says so explicitly (and, when a test
   * drives a stub, says `CONTROLLED_STUB`); the conservative default refuses to guess.
   */
  const explicitPortWithoutKind = options.workWorkerPort !== undefined && options.executionAssociationSourceKind === undefined;
  const sourceKind: SourceKind =
    options.executionAssociationSourceKind ?? (options.workWorkerBin === undefined || explicitPortWithoutKind ? "UNKNOWN" : "FIRST_PARTY_DSH_HOST");
  const workWorkerPortFactory = deriveWorkWorkerPortFactory(options);
  const sessionSourceQualification = qualificationLabelOf(sourceKind);

  const ownedResources: OwnedResource[] = [];

  /** §7.6: the reader is a lazy handle; its presence is decided synchronously from the deployment's facts. */
  const hasReader = options.dshHomePath !== undefined && options.dshHomePath.length > 0 && options.dshSessionsRoot !== undefined && options.dshSessionsRoot.length > 0;
  let readerPromise: Promise<DshSessionReadPort | undefined> | undefined;
  let mountedReader: DshSessionReadPort | undefined;
  const ensureReader = async (): Promise<DshSessionReadPort | undefined> => {
    if (mountedReader !== undefined) return mountedReader;
    if (readerPromise === undefined) {
      readerPromise = loadSessionReader({ dshHomePath: options.dshHomePath, sessionsRoot: options.dshSessionsRoot, moduleSpecifier: options.sessionReaderModule ?? DEFAULT_SESSION_READER_MODULE });
    }
    mountedReader = await readerPromise;
    return mountedReader;
  };

  const readerHandle: DshSessionReadPort | undefined = hasReader
    ? {
        sourceIdentity: "dsh-session-persistence-jsonl",
        evidenceClass: "REAL_DSH_QUERY",
        async readEvents(request) {
          const reader = await ensureReader();
          if (reader === undefined) {
            return Object.freeze({
              schemaVersion: 1, readState: "READ_CAPABILITY_ABSENT", sessionId: request.sessionId, header: null,
              sourceIdentity: "dsh-session-persistence-jsonl", sourceEvidenceClass: "REAL_DSH_QUERY",
              throughSeq: null, knownEventCount: null, inheritedEventCount: null,
              requestedFromSeq: request.fromSeq ?? 0, requestedMaxEvents: request.maxEvents ?? 0, returnedCount: 0,
              pageBounded: true, diskIoBounded: true,
              durabilityProvenance: "DURABILITY_UNRESOLVED", persistedEventCount: null, syntheticRecoveryEventCount: null,
              events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]),
              detail: "the official DSH reader could not be mounted from this deployment's DSH home",
            } as never);
          }
          return reader.readEvents(request);
        },
        async readHeaderIdentity(sessionId) {
          const reader = await ensureReader();
          if (reader === undefined) return { readState: "READ_CAPABILITY_ABSENT" as const, header: null, detail: "the official DSH reader could not be mounted" };
          return reader.readHeaderIdentity(sessionId);
        },
        async close() {
          const reader = mountedReader ?? (readerPromise === undefined ? undefined : await readerPromise);
          await reader?.close?.();
        },
      }
    : undefined;

  if (readerHandle !== undefined) {
    /**
     * P2-D0 §9.4: the reader's close is ASYNCHRONOUS (it disposes a mounted Cordis fiber), so the owned
     * resource RETURNS the promise. `composeInstalledLifecycle` awaits it, which is what makes
     * `await installed.dispose()` actually wait for the reader rather than discarding its promise.
     */
    ownedResources.push({ what: "dshSessionReader", ownership: "INSTALL_CREATED_AND_MANAGED", close: () => readerHandle.close?.() });
  }

  const storePath = deriveExecutionAssociationPath(options.databasePath);
  /** §7.2: no derivable durable path ⇒ no durable association history. Honest absence, not a stub. */
  if (storePath === undefined) {
    return Object.freeze({
      workWorkerPortFactory,
      recorder: undefined,
      sessionSourceQualification,
      qualifier: undefined,
      trajectory: undefined,
      trajectoryCapsuleDelivery: undefined,
      ownedResources: Object.freeze(ownedResources),
    });
  }

  const associationStore = new SqliteExecutionAssociationStore(storePath);
  ownedResources.push({ what: "executionAssociationStore", ownership: "INSTALL_CREATED_AND_MANAGED", close: () => associationStore.close() });

  /** §6.1: the trusted registry is built from the DEPLOYMENT's own basis and kind — never a record. */
  const basis = computeTrustedSourceBasis({ adapterId: `dsh-subprocess-work-worker:${options.workWorkerProfile ?? "unbound"}`, workerBin: options.workWorkerBin ?? "", nodeExecPath: process.execPath });
  const registry = makeTrustedSourceRegistry({
    epochs: [
      ...(options.historicalEpochs ?? []),
      { epochId: `current-${basis.workerBinDigest.slice(0, 12)}`, sourceKind, sourceBasis: basis },
    ],
  });

  const recorder = createExecutionAssociationRecorder({ store: associationStore, projectId: options.projectId, sourceBasis: basis, sourceKind });
  /**
   * P2-D0 §9.3: an in-memory path cannot be cold-recovered, so the qualifier carries EPHEMERAL and the
   * attributed Preview reports it. A caller that requires durability can then refuse the binding.
   */
  const storeDurability: "DURABLE" | "EPHEMERAL" = storePath === ":memory:" ? "EPHEMERAL" : "DURABLE";
  const qualifier = makeAssociationQualifier({
    store: associationStore,
    registry,
    durability: storeDurability,
    work: makeWorkRevalidation({ projectId: options.projectId, store: input.store, controller: input.controller }),
    dsh: {
      readHeaderIdentity: async (sessionId) => {
        if (readerHandle === undefined) return { readState: "READ_CAPABILITY_ABSENT" as const, header: null, detail: "no DSH session reader is composed, so no header could be read" };
        return readerHandle.readHeaderIdentity(sessionId);
      },
    },
  });

  const trajectory = {
    attributedPreview: composeAttributedPreview({
      projectId: options.projectId,
      controller: input.controller as unknown as TrajectoryV0WorkOwner,
      promotions: input.controller.promotions as unknown as { promotionFactsSync(): readonly { readonly eventId: string; readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string; readonly expectedHeadCommit: string; readonly resultingHeadCommit: string }[] },
      qualifier,
      store: associationStore,
      sessionReader: readerHandle,
      capsuleAuthorization: makeCapsuleAuthorization({ projectId: options.projectId, store: input.store, controller: input.controller, contextService: input.controller.context }),
      /**
       * P2-D0 §8.3: the SAME `projectEvolutionOf` the V0 composition uses, over the SAME projection inputs.
       * The adapter supplies the attempt's own relation context, so selected/quarantined relations stay
       * Attempt-scoped and a cross-owner basis failure is reported with its real structured origin.
       */
      projectEvolutionOf: async ({ attemptId, events, relationContext }) => {
        const owners = options.trajectoryOwners;
        const projectionInputs = composeTrajectoryInputs({
          projectId: options.projectId,
          controller: input.controller as unknown as Parameters<typeof composeTrajectoryInputs>[0]["controller"],
          promotions: input.controller.promotions as unknown as Parameters<typeof composeTrajectoryInputs>[0]["promotions"],
          reasoning: owners?.reasoning,
          proof: owners?.proof,
          projectWorkspace: owners?.projectWorkspace,
          journalStore: owners?.journalStore,
          associationStore: owners?.associationStore,
        });
        void events;
        return projectEvolutionOf(projectionInputs, relationContext);
      },
    }),
  };

  /**
   * Trajectory-P2-D1 §11.5: the EXPERIMENTAL Attempt-bound delivery provider, DEFAULT OFF.
   *
   * When enabled, the provider resolves the consumer attempt's OWN Capsule through the ordinary
   * `capsuleForConsumer` path — so the consumer identity is the attempt id the Host supplies (the attempt
   * being compiled), never a model choice — and returns a bounded, digest-carrying, read-only projection.
   * Any refusal (no lineage, no qualified origin, over budget) returns null, so nothing is delivered rather
   * than a fabricated or partial Capsule. It changes no authority.
   */
  const trajectoryCapsuleDelivery =
    options.experimentalTrajectoryContextDelivery === true
      ? async (input2: { readonly attemptId: string }) => {
          const result = await trajectory.attributedPreview.capsuleForConsumer({
            consumerAttemptId: input2.attemptId,
            ...(options.trajectoryCapsuleMaxSerializedBytes === undefined ? {} : { limits: { maxSerializedBytes: options.trajectoryCapsuleMaxSerializedBytes } }),
          });
          if (result.state !== "AUTHORIZED" || result.capsule === null) return null;
          const bytes = Buffer.byteLength(JSON.stringify(result.capsule), "utf8");
          /**
           * Trajectory-P2-D2 §7/§8.6: THE PRODUCT RENDERS THE MODEL-VISIBLE SECTION.
           *
           * The arm is TRUSTED CONFIGURATION (never a model choice). The consumer-basis digest is the
           * Capsule's own authorization basis, so the presentation is bound to the SAME permission that
           * admitted the Capsule. A TREATMENT whose presentation cannot be built is reported as a
           * DELIVERY PRECONDITION failure — never silently relabeled CONTROL.
           */
          const mode = options.trajectoryPresentationMode ?? "OFF";
          const presentationOutcome = buildTrajectoryPresentation({
            mode,
            capsule: result.capsule,
            consumerBasisDigest: canonicalDigest(result.capsule.authorizationBasis),
            ...(options.trajectorySectionMaxBytes === undefined ? {} : { limits: { maxSectionBytes: options.trajectorySectionMaxBytes } }),
          });
          const presentation = presentationOutcome.ok ? presentationOutcome.presentation : null;
          const deliveryState: import("../context/service.js").TrajectoryDeliveryState = !presentationOutcome.ok
            ? "DELIVERY_PRECONDITION_NOT_MET"
            : presentation === null
              ? "DELIVERY_DISABLED"
              : presentation.mode === "CONTROL"
                ? "CONTROL_SECTION_RENDERED"
                : "SECTION_RENDERED";
          return Object.freeze({
            schemaVersion: result.capsule.schemaVersion,
            capsule: result.capsule,
            serializedBytes: bytes,
            contentDigest: canonicalDigest(result.capsule),
            originAttemptId: result.capsule.originAttemptId,
            framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS" as const,
            authority: "READ_ONLY_INSPECTION" as const,
            presentation,
            deliveryState,
          });
        }
      : undefined;

  return Object.freeze({
    workWorkerPortFactory,
    recorder,
    sessionSourceQualification,
    qualifier,
    trajectory,
    trajectoryCapsuleDelivery,
    ownedResources: Object.freeze(ownedResources),
  });
}

export type { ExecutionAssociationStore };

/* ------------------------------------------------------------------ *
 * §7.7 — THE INSTALL CONTRACT
 * ------------------------------------------------------------------ */

/**
 * §7.1/§7.2: the install options this stage adds. They are declared HERE, in the cluster module, rather
 * than in `install_contract.ts` (which sits at its §22 size ceiling) and rather than in a separate
 * contract file (which would add an extra `install.ts` import and breach the §25 composition-root
 * fan-out ceiling). `install.ts` widens its own option type with this interface.
 */
export interface ExecutionAssociationInstallOptions {
  /**
   * §7.1: the HOST's own account of the executable it configured for work workers. Supplying these lets
   * the install derive a real Work Worker Port; omitting them leaves the port absent (never a stub), so
   * Work Delegation is not composed and no worker can start.
   */
  readonly workWorkerBin?: string | undefined;
  readonly workWorkerProfile?: string | undefined;
  /** §7.2: a bounded worker wall clock; absent uses the port's own default. */
  readonly workWorkerTimeoutMs?: number | undefined;
  /**
   * §6.1: how the deployment classifies the executable it configured. Defaults to `FIRST_PARTY_DSH_HOST`
   * only when a real DSH bin was supplied; a test that drives a stub passes `CONTROLLED_STUB`.
   */
  readonly executionAssociationSourceKind?: SourceKind | undefined;
  /** §7.6: the DSH home and session root, when the deployment knows them, so the reader can be composed. */
  readonly dshHomePath?: string | undefined;
  readonly dshSessionsRoot?: string | undefined;
  /**
   * §7.6: an override for the official reader module specifier. Production omits it (the bare
   * `palimpsest-host-deployment/runtime/session_reader.js` resolves inside the DSH host process); a test
   * process outside the DSH profile points at the same file by absolute path, so there is one reader.
   */
  readonly sessionReaderModule?: string | undefined;
  /**
   * P2-D0 §9.7: trusted HISTORICAL source epochs, so a legitimate upgrade ADDS an epoch rather than
   * invalidating every historical association. A deployment supplies the epochs it established; the
   * current basis is always appended by the composition. Supplying nothing means only the current
   * configuration is trusted, which is the honest default for a deployment that never upgraded.
   */
  readonly historicalEpochs?: readonly TrustedSourceEpoch[] | undefined;
  /**
   * Trajectory-P2-D1 §11.5: the EXPERIMENTAL, non-model, DEFAULT-OFF Attempt-bound Trajectory Context
   * delivery capability.
   *
   * When `true`, the install binds a provider that materializes the consumer attempt's OWN qualified
   * Trajectory Capsule into that attempt's worker context (via `workWorkerContext`), so the correct bounded
   * historical material reaches the trusted Worker Context boundary BEFORE the first model turn. The
   * consumer identity is the attempt being compiled — the Host's own `prepared.attemptId` — never a model
   * choice. It changes NO authority: the Capsule is read-only historical data.
   *
   * DEFAULT OFF. Absent or false ⇒ nothing is bound and the worker context is byte-identical to production.
   * This is an EXPERIMENTAL delivery contract, deliberately separate from R2-E's efficacy env var.
   */
  readonly experimentalTrajectoryContextDelivery?: boolean | undefined;
  /**
   * P2-D1 §9.2: an optional LOWER Capsule byte budget for the experimental delivery. It can only lower the
   * product ceiling, never raise it.
   */
  readonly trajectoryCapsuleMaxSerializedBytes?: number | undefined;
  /**
   * Trajectory-P2-D2 §7/§8: the EXPERIMENTAL presentation ARM. `CONTROL` renders the no-history boundary,
   * `TREATMENT` renders the actual qualified Capsule, `OFF` (the default) renders nothing. It is TRUSTED
   * CONFIGURATION fixed before Worker execution — a model cannot choose it and cannot supply a substitute
   * Capsule. It changes NO authority: the section is read-only historical data.
   */
  readonly trajectoryPresentationMode?: "OFF" | "CONTROL" | "TREATMENT" | undefined;
  /** P2-D2 §7.7: an optional LOWER section byte budget. It can only lower the product ceiling. */
  readonly trajectorySectionMaxBytes?: number | undefined;
}

/**
 * §7.7: the install RESULT this stage adds — the read-only attributed Preview surface, the recorder the
 * host wires, the qualifier, and the composed Work Delegation service (so a host, and the product
 * cold-preview gate, can start real work through the ordinary product path).
 */
export interface ExecutionAssociationInstallResult {
  readonly trajectory?: { readonly attributedPreview: AttributedPreviewService } | undefined;
  readonly executionAssociationRecorder?: ExecutionAssociationRecorder | undefined;
  readonly executionAssociationQualifier?: AssociationQualifier | undefined;
  readonly workDelegation?: WorkDelegationService | undefined;
}

