/**
 * installPalimpsest — the golden path (docs/01 §6, P2).
 *
 * One call wires the orchestration ledger, the shared Ordarium effects
 * runtime, the trusted policy, the controller and the seven tools into a
 * DSH host context. Defaults are zero-config and strong: `$DSH_HOME`
 * ledgers, a trusted-default policy (deny network, bounded attempts), and
 * the git CLI port rooted at the canonical repository.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { canonicalDigest } from "./schema/canonical.js";

import type { RuntimeHooks } from "@ordarium/core";

import { EventStore, dshDefaultStatePath } from "./state/index.js";
import { defaultOrdariumPath, createPalimpsestEffects } from "./effects/index.js";
import { GitCliPort, type GitPort } from "./effects/index.js";
import { TaskPolicy } from "./domain/index.js";
import { ProjectController } from "./tools/controller.js";
import { definePalimpsestTools } from "./tools/tools.js";
import type { DshPluginContext, DshToolDefinition } from "./tools/dsh_types.js";
import type {
  LiveCompileOutcome,
  LiveCompileRequest,
  ObservationOutcome,
  RuntimeCarrierPort,
  RuntimeObservationPort,
  RuntimeRealizationOutcome,
  RuntimeRealizationRequest,
  RuntimeReleaseHandle,
} from "./runtime/index.js";
import {
  makeRuntimeRealizationService,
  observeAndCompileGroundedPlan,
  observeBindingState,
} from "./runtime/index.js";
import type { PersistentPointStore } from "./continuity/index.js";
import type {
  AttemptCatalogPort,
  CoordinationStore,
} from "./coordination/index.js";
import { makeParticipationService } from "./coordination/index.js";
import type {
  FederationService,
  PeerDirectoryPort,
  PeerRef,
  PeerTransportPort,
} from "./federation/index.js";
import { makeCommitmentService, makeFederationMessagingService, makeFederationService } from "./federation/index.js";
import type { OrganizationStore } from "./organization/index.js";
import type { InstitutionService, InstitutionStore } from "./institution/index.js";
import { makeInstitutionService } from "./institution/index.js";

export interface InstallPalimpsestOptions {
  /** Orchestration ledger; defaults to $DSH_HOME/palimpsest/palimpsest.sqlite. */
  databasePath?: string | undefined;
  /** Shared Ordarium ledger; defaults to $DSH_HOME/ordarium/operations.sqlite. */
  ordariumDatabasePath?: string | undefined;
  /** Canonical repository (for the default git CLI port). */
  repository?: string | undefined;
  /** Side-effect git port; defaults to GitCliPort(repository, repository/.palimpsest/worktrees). */
  git?: GitPort | undefined;
  projectId: string;
  policy?: TaskPolicy | undefined;
  /** Palimpsest-side wire clock (ProjectIR/evidence timestamps). */
  clock?: (() => string) | undefined;
  /** Ordarium-side Date clock (leases/recovery); tests pass a ManualClock. */
  effectsClock?: (() => Date) | undefined;
  leaseMs?: number | undefined;
  hooks?: RuntimeHooks | undefined;
  /** G10-D5 (additive): host-neutral runtime carrier port. Absent = no runtime surface. */
  runtimeCarrierPort?: RuntimeCarrierPort | undefined;
  /** G10-D5 (additive): read-only runtime/continuity observation port. */
  runtimeObservationPort?: RuntimeObservationPort | undefined;
  /** G10-D5 (additive): the canonical PersistentPoint store (required for persistent realization). */
  continuityStore?: PersistentPointStore | undefined;
  /** G10-D5 (additive): activation allocator seam; default is a deterministic digest allocator. */
  allocateActivationId?: ((subject: string, context: string) => string) | undefined;
  /** G10-D5 (additive): observation-instance identity allocator; default is a random UUID (effect layer). */
  allocateSnapshotId?: (() => string) | undefined;
  /** G10-E5 (additive): the local collaboration peer identity. Absent = no federation surface. */
  localPeer?: PeerRef | undefined;
  /** G10-E5 (additive): the host-neutral peer transport port. */
  peerTransportPort?: PeerTransportPort | undefined;
  /** G10-E5 (additive): the read-only peer directory port. */
  peerDirectoryPort?: PeerDirectoryPort | undefined;
  /** G10-E5 (additive): the canonical Palimpsest-owned coordination store. */
  coordinationStore?: CoordinationStore | undefined;
  /** G10-E5 (additive): read-only canonical Attempt validation for participation. */
  attemptCatalog?: AttemptCatalogPort | undefined;
  /** G10-F5 (additive): the canonical organization lineage store. Absent = no organization surface. */
  organizationStore?: OrganizationStore | undefined;
  /** G10-F5 (additive): the canonical institution lineage store (requires organizationStore). */
  institutionStore?: InstitutionStore | undefined;
  /** G10-F5 (additive): institution transition-id allocator; default is a random UUID. */
  allocateTransitionId?: (() => string) | undefined;
  /**
   * G0 (additive): the trusted local institution governance identity. Distinct
   * from federation `localPeer`; required for `installed.institution.service.approveLocal`.
   */
  institutionGovernancePeer?: PeerRef | undefined;
}

/**
 * G10-D5: the high-level runtime service exposed when runtime wiring is
 * supplied (§94). It coordinates local realization steps and is NOT an
 * authority root (§98): effects stay Ordarium-admitted; observation is
 * read-only. Operations that lack their wiring are absent — never stubbed.
 */
export interface InstalledRuntime {
  /** Present iff an observation port + continuity store were supplied. */
  readonly observe?: (scope?: { scope?: string | undefined }) => Promise<ObservationOutcome>;
  /** Present iff an observation port + continuity store were supplied. */
  readonly compile?: (request: LiveCompileRequest) => Promise<LiveCompileOutcome>;
  /** Present iff a runtime carrier port was supplied. */
  readonly realize?: (request: RuntimeRealizationRequest) => Promise<RuntimeRealizationOutcome>;
  /** Present iff a runtime carrier port was supplied. */
  readonly release?: (handle: RuntimeReleaseHandle) => Promise<
    { readonly status: "released" } | { readonly status: "failed"; readonly reason: string; readonly detail: string }
  >;
}

export interface InstalledPalimpsest {
  readonly controller: ProjectController;
  readonly tools: readonly DshToolDefinition[];
  /** Present only when runtime wiring options are supplied (§93 backward compatibility). */
  readonly runtime?: InstalledRuntime | undefined;
  /** Present only when the full federation wiring is supplied (§132–§135) — never partial. */
  readonly federation?: FederationService | undefined;
  /** G10-F5 (additive): present only when an organization store is supplied. */
  readonly organization?: InstalledOrganization | undefined;
  /** G10-F5 (additive): present only when both organization + institution stores are supplied. */
  readonly institution?: InstalledInstitution | undefined;
  register(context: DshPluginContext): () => void;
  dispose(): Promise<void>;
}

/** G10-F5: the additive organization surface (never forces institution configuration). */
export interface InstalledOrganization {
  readonly store: OrganizationStore;
}

/** G10-F5: the additive institution governance surface. */
export interface InstalledInstitution {
  readonly store: InstitutionStore;
  readonly service: InstitutionService;
}

/**
 * G10-D5 default activation allocator: a domain-separated digest over
 * (context, subject) — retry-stable (same context ⇒ same id ⇒ Ordarium
 * idempotent dedupe), and not any forbidden identity (§21).
 */
export function defaultAllocateActivationId(subject: string, context: string): string {
  return `act-${canonicalDigest({
    domain: "palimpsest.activation-id.v1",
    context,
    subject,
  }).slice(0, 32)}`;
}

export function trustedDefaultPolicy(): TaskPolicy {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
  });
}

export function installPalimpsest(
  context: DshPluginContext,
  options: InstallPalimpsestOptions,
): InstalledPalimpsest {
  const repository = options.repository ?? process.cwd();
  const git =
    options.git ??
    new GitCliPort(repository, join(repository, ".palimpsest", "worktrees"));
  const store = new EventStore(options.databasePath ?? dshDefaultStatePath(), {
    clock: options.clock ?? (() => new Date().toISOString()),
  });
  const effects = createPalimpsestEffects({
    databasePath: options.ordariumDatabasePath ?? defaultOrdariumPath(),
    git,
    clock: options.effectsClock,
    leaseMs: options.leaseMs,
    hooks: options.hooks,
  });
  const policy = options.policy ?? trustedDefaultPolicy();
  const controller = new ProjectController({
    store,
    effects,
    projectId: options.projectId,
    policy,
    clock: options.clock,
  });
  const tools = definePalimpsestTools(controller);

  // G10-D5: the runtime service exists only when runtime wiring is supplied
  // (§92/§93). No hidden default host behavior; the seven-tool orchestration
  // surface is unchanged when the options are absent.
  let runtime: InstalledRuntime | undefined;
  if (
    options.runtimeCarrierPort !== undefined ||
    (options.runtimeObservationPort !== undefined && options.continuityStore !== undefined)
  ) {
    const observationDeps =
      options.runtimeObservationPort !== undefined && options.continuityStore !== undefined
        ? {
            pointStore: options.continuityStore,
            observationPort: options.runtimeObservationPort,
            allocateSnapshotId: options.allocateSnapshotId ?? (() => `obs-${randomUUID()}`),
          }
        : undefined;
    const realizationService =
      options.runtimeCarrierPort === undefined
        ? undefined
        : makeRuntimeRealizationService({
            effects,
            allocateActivationId:
              options.allocateActivationId ?? defaultAllocateActivationId,
            port: options.runtimeCarrierPort,
            ...(options.continuityStore === undefined ? {} : { pointStore: options.continuityStore }),
          });
    runtime = {
      ...(observationDeps === undefined ? {} : { observe: () => observeBindingState(observationDeps) }),
      ...(observationDeps === undefined
        ? {}
        : { compile: (request) => observeAndCompileGroundedPlan(observationDeps, request) }),
      ...(realizationService === undefined
        ? {}
        : {
            realize: (request) => realizationService.realize(request),
            release: (request) => realizationService.releaseCarrier(request),
          }),
    };
  }

  // G10-E5 (§132–§135): the federation service exists only when the full
  // collaboration wiring is supplied. No hidden default peers or transports;
  // the high-level service is the recommended path (never raw transport).
  let federation: FederationService | undefined;
  if (
    options.localPeer !== undefined &&
    options.coordinationStore !== undefined &&
    options.peerTransportPort !== undefined &&
    options.peerDirectoryPort !== undefined &&
    options.attemptCatalog !== undefined
  ) {
    const messaging = makeFederationMessagingService({
      effects,
      store: options.coordinationStore,
      localPeer: options.localPeer,
      allocateMessageId: () => `msg-${randomUUID()}`,
      allocateWakeId: () => `wake-${randomUUID()}`,
      transportPort: options.peerTransportPort,
    });
    const commitments = makeCommitmentService({
      store: options.coordinationStore,
      localPeer: options.localPeer,
      allocateCommitmentId: () => `com-${randomUUID()}`,
      allocateHandoffId: () => `ho-${randomUUID()}`,
    });
    const participation = makeParticipationService({
      store: options.coordinationStore,
      attempts: options.attemptCatalog,
      allocateInvocationId: () => `inv-${randomUUID()}`,
      allocateParticipationId: () => `part-${randomUUID()}`,
    });
    federation = makeFederationService({
      store: options.coordinationStore,
      localPeer: options.localPeer,
      messaging,
      commitments,
      participation,
      directory: options.peerDirectoryPort,
      allocateContactNeedId: () => `need-${randomUUID()}`,
    });
  }

  const disposers: (() => void)[] = [];

  // G10-F5 (§153): ADDITIVE organization/institution surfaces. Supplying no
  // organization/institution store changes nothing (§154); institution wiring
  // requires the organization store because an epoch references a body.
  const organization: InstalledOrganization | undefined =
    options.organizationStore === undefined ? undefined : { store: options.organizationStore };
  let institution: InstalledInstitution | undefined;
  if (options.organizationStore !== undefined && options.institutionStore !== undefined) {
    institution = {
      store: options.institutionStore,
      service: makeInstitutionService({
        store: options.institutionStore,
        organizations: options.organizationStore,
        allocateTransitionId: options.allocateTransitionId ?? (() => `tr-${randomUUID()}`),
        localGovernancePeer: options.institutionGovernancePeer,
      }),
    };
  }
  for (const definition of tools) {
    const registered = context.tools.register(definition);
    if (typeof registered === "function") disposers.push(registered);
    else if (registered !== undefined) disposers.push(() => registered.dispose());
  }

  return {
    controller,
    tools,
    ...(runtime === undefined ? {} : { runtime }),
    ...(federation === undefined ? {} : { federation }),
    ...(organization === undefined ? {} : { organization }),
    ...(institution === undefined ? {} : { institution }),
    register(next: DshPluginContext): () => void {
      const inner: (() => void)[] = [];
      for (const definition of tools) {
        const registered = next.tools.register(definition);
        if (typeof registered === "function") inner.push(registered);
        else if (registered !== undefined) inner.push(() => registered.dispose());
      }
      return () => {
        for (const dispose of [...inner].reverse()) dispose();
      };
    },
    async dispose() {
      for (const dispose of [...disposers].reverse()) dispose();
      await controller.close();
      store.close();
    },
  };
}
