/**
 * SR-1 §11/§12 — the CORE composition.
 *
 * Everything in this module was the head of `installPalimpsest`: the durable log, the effects
 * runtime, the trusted default policy, the `ProjectController` and the legacy Work tool set.
 * Composition only — it decides no policy of its own, performs no discovery, keeps no global
 * state, and its input is a NARROW typed record (§34), not the whole options bag.
 *
 * Ownership (§14), unchanged by the move:
 *   `store`   — created here when no `databasePath` is given; caller-supplied otherwise. A
 *               caller-supplied `EventStore` is never closed by the install path.
 *   `effects` — created here; owns the Ordarium ledger handle and closes once on dispose.
 *   `git`     — caller-supplied or a `GitCliPort` over the repository; owns no handle.
 */

import { join, dirname } from "node:path";

import type { RuntimeHooks } from "@ordarium/core";

import { canonicalDigest } from "../schema/canonical.js";
import type { CompletionCapabilities } from "../domain/completion_contract.js";
import { TaskPolicy } from "../domain/index.js";
import type { GitPort } from "../effects/index.js";
import { createPalimpsestEffects, defaultOrdariumPath, GitCliPort } from "../effects/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/index.js";
import { EventStore, dshDefaultStatePath } from "../state/index.js";
import type { DshToolDefinition } from "../tools/dsh_types.js";
import { ProjectController } from "../tools/controller.js";
import { gitRepositoryWorldPort } from "../deployment/execution_world.js";
import { firstPartyProjectWorldObservation } from "../deployment/world_observation.js";
import { SqliteAttemptWorldBasisStore } from "../project_world/basis_store.js";
import { makeProjectWorldBasisRuntime } from "../project_world/runtime.js";
import { definePalimpsestTools } from "../tools/tools.js";

/** Exactly the options the core composition needs — nothing else is visible to it. */
export interface CoreCompositionOptions {
  readonly projectId: string;
  readonly repository?: string | undefined;
  readonly git?: GitPort | undefined;
  readonly databasePath?: string | undefined;
  readonly ordariumDatabasePath?: string | undefined;
  readonly policy?: TaskPolicy | undefined;
  readonly execution?: import("../tools/controller.js").ExecutionMode | undefined;
  /** §D4-a: the operator's capacity bound for concurrent canonical Work. Absent ⇒ the genesis default. */
  readonly concurrency?: number | undefined;
  readonly standard?: import("../domain/standard.js").ProjectStandard | undefined;
  /**
   * PLMP-LEAN-1 §2.1 / 2A-Q: what this deployment can actually do. Absent ⇒ a conservative default
   * (nothing available), so an unstated capability reads as ABSENT rather than assumed present.
   */
  readonly capabilities?: import("../domain/completion_contract.js").CompletionCapabilities | undefined;
  readonly clock?: (() => string) | undefined;
  readonly effectsClock?: (() => Date) | undefined;
  readonly leaseMs?: number | undefined;
  readonly hooks?: RuntimeHooks | undefined;
}

/** The kernel substrate every other composition group is built on. */
export interface CoreComposition {
  readonly repository: string;
  readonly git: GitPort;
  readonly store: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
  readonly policy: TaskPolicy;
  readonly controller: ProjectController;
  readonly baseTools: readonly DshToolDefinition[];
  /**
   * §B.14: the late-bound admission resolver. A later composition group binds it ONCE, when both the
   * Work owner (the contract) and the verification owner (the qualification) exist.
   */
  readonly verificationAdmission: {
    resolver: ((attemptId: string) => import("../domain/promotion_eligibility.js").PromotionVerificationAdmission | null) | null;
  };
  /**
   * §D2-LIVE: the late-bound capability holder, bound by the cluster that actually COMPOSES the
   * verification runtime. Read-through, so a controller that already holds the object sees the
   * binding; unbound ⇒ the conservative default (nothing available).
   *
   * A caller who passed explicit `options.capabilities` owns the value and this bind is a no-op —
   * see `composeCore`.
   */
  readonly verificationCapabilities: {
    bind(next: import("../domain/completion_contract.js").CompletionCapabilities): void;
  };
  /**
   * §D3-a: the basis store this composition CREATED, when it created one. Exposed so `lifecycle` closes
   * it with the other install-created resources — a store whose owner is unnamed leaks its handle.
   */
  readonly worldBasisStore: import("../project_world/basis_store.js").AttemptWorldBasisStore | undefined;
}

/** §12: explicit typed input, explicit typed output, no discovery, no string keys. */
export function composeCore(options: CoreCompositionOptions): CoreComposition {
  const repository = options.repository ?? process.cwd();
  /**
   * §D2-LIVE: ONE world root, named once.
   *
   * The git port MATERIALIZES a world and the execution-world port later EXPORTS its result, and both
   * address it as `<worldsRoot>/<attemptId>`. They used to be given different roots — the port
   * `.palimpsest/worktrees`, the exporter `.palimpsest/worlds` — so on every packaged deployment
   * `exportResultCommit` looked in a directory the world was never created in, settlement returned
   * `RESULT_NOT_EXPORTED`/`WORLD_MISSING`, and no delegated attempt could ever reach COMPLETED. The
   * live gate measured exactly that. Two spellings of one location is the same defect class as two
   * definitions of "clean", so the root is computed here and CONSUMED by both.
   *
   * The spelling is `worlds` because the ontology is the EXECUTION WORLD (§D2-cR); `worktrees` was the
   * linked-worktree backend's name and survives only where a caller supplies its own port root.
   */
  const worldsRoot = join(repository, ".palimpsest", "worlds");
  const git = options.git ?? new GitCliPort(repository, worldsRoot);
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
  /**
   * PLMP-LEAN-1 §B.14: the late-bound admission wiring, in the shape this repo already uses for
   * `verificationWiring`. The PORT is stable from birth (so the promotion manager never observes a
   * changing dependency); only its RESOLVER is bound once, later, when both owners exist.
   */
  const verificationAdmission: {
    resolver: ((attemptId: string) => import("../domain/promotion_eligibility.js").PromotionVerificationAdmission | null) | null;
  } = { resolver: null };
  const verificationAdmissionPort = {
    read: (attemptId: string) => verificationAdmission.resolver?.(attemptId) ?? null,
  };
  const policy = options.policy ?? trustedDefaultPolicy();

  /**
   * §D3-a: the world-basis runtime. Composed only where a real project can be OBSERVED — a repository to
   * name a source revision, and the Work ledger to re-derive a semantic projection. Absent elsewhere,
   * which is the honest "this deployment captures no basis" rather than a stub.
   *
   * The store is its own file beside the project's databases (the same derivation the operating and
   * verification stores use), and `lifecycle` closes it with the other install-created resources.
   */
  const worldBasisStore =
    options.repository === undefined || options.repository === ""
      ? undefined
      : new SqliteAttemptWorldBasisStore(
          options.databasePath === undefined || options.databasePath === ":memory:"
            ? ":memory:"
            : join(dirname(options.databasePath), "attempt_world_basis.sqlite"),
        );
  /**
   * The observation port reads through the WORK OWNER, which does not exist until the controller below
   * is constructed. The holder is the same late-binding idiom `verificationAdmission` uses: the port is
   * stable from birth and its ONE dependency is bound immediately afterwards, so nothing can observe a
   * changing dependency.
   */
  const worldOwner: {
    current: { taskEnvelope(taskId: string): unknown | null; projectRevision(): number } | null;
  } = { current: null };
  const worldBasisRuntime =
    worldBasisStore === undefined || options.repository === undefined || options.repository === ""
      ? undefined
      : makeProjectWorldBasisRuntime({
          projectId: options.projectId,
          store: worldBasisStore,
          observation: firstPartyProjectWorldObservation({
            owner: {
              taskEnvelope: (taskId) => worldOwner.current?.taskEnvelope(taskId) ?? null,
              projectRevision: () => worldOwner.current?.projectRevision() ?? 0,
            },
            repository: options.repository,
          }),
          ...(options.clock === undefined ? {} : { clock: options.clock }),
        });

  /**
   * §D2-LIVE: the capability statement is LATE-BOUND, exactly like `verificationAdmission` below.
   *
   * The controller gates `begin`/`prepareMutatingWork` on `attemptResultVerificationAvailable`, so
   * whichever value it reads decides whether a verification-requiring task may start at all. That
   * value used to be computed HERE, from a PROXY — "was `projectVerificationStore` passed as an
   * option?" — before the verification runtime was composed. On the packaged path the store is not
   * passed; governance CREATES it (a project workspace is enough to configure verification), so the
   * proxy said `false` while the deployment then composed a real, executable, independent
   * attempt-result verifier.
   *
   * The live gate measured the consequence: a boundary task was refused with
   * `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` on a deployment that verifies attempt results
   * correctly, and readiness reported `DEGRADED` — the product refusing work it can actually do.
   *
   *     a capability must be derived from what was COMPOSED, never from how it was requested
   *
   * So the holder is stable from birth and bound ONCE, later, by the cluster that actually composes
   * the runtime. An explicit `options.capabilities` still wins outright: a caller who states the
   * capabilities is asserting them, and nothing here may overwrite an assertion with a derivation.
   */
  const verificationCapabilities: { bound: CompletionCapabilities | null } = {
    bound: options.capabilities ?? null,
  };
  const conservativeCapabilities: CompletionCapabilities = Object.freeze({
    independentVerifierAvailable: false,
    attemptResultVerificationAvailable: false,
    sandboxSpawnVerified: options.repository !== undefined && options.repository !== "",
  });
  const capabilities: CompletionCapabilities = Object.freeze({
    get independentVerifierAvailable(): boolean {
      return (verificationCapabilities.bound ?? conservativeCapabilities).independentVerifierAvailable;
    },
    get attemptResultVerificationAvailable(): boolean {
      return (verificationCapabilities.bound ?? conservativeCapabilities).attemptResultVerificationAvailable;
    },
    get sandboxSpawnVerified(): boolean {
      return (verificationCapabilities.bound ?? conservativeCapabilities).sandboxSpawnVerified;
    },
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: options.projectId,
    policy,
    execution: options.execution,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    standard: options.standard,
    capabilities,
    verificationAdmission: verificationAdmissionPort,
    /**
     * §D2-e1: the execution-world port exists exactly where this deployment PLACES work in worlds — a
     * real repository that can be observed. It owns no authority: it imports objects and deletes
     * directories, and settlement decides whether that is allowed to mean anything.
     */
    ...(options.repository === undefined || options.repository === ""
      ? {}
      : {
          executionWorld: gitRepositoryWorldPort({
            repository,
            worldsRoot,
          }),
        }),
    /**
     * §D3-a: the world-basis capability, composed where a real project can be OBSERVED.
     *
     * It needs the repository (to name a source revision) and the task rows (to re-derive a semantic
     * projection), so it is absent exactly when the world cannot be observed — and absent means "this
     * deployment records no basis", which the assessment reports honestly instead of reconstructing.
     *
     * The store lives in its own file beside the project's databases, and THIS composition owns its
     * lifetime: it is created here and closed by `lifecycle` with the other install-created resources.
     */
    ...(worldBasisRuntime === undefined
      ? {}
      : {
          worldBasis: worldBasisRuntime,
          worldBasisRead: worldBasisRuntime,
        }),
    clock: options.clock,
  });
  // §D3-a: bind the Work owner the observation port reads through, ONCE, now that it exists.
  worldOwner.current = {
    taskEnvelope: (taskId) => controller.taskEnvelopeOrNull(taskId),
    projectRevision: () => controller.promotions.projectRevision(),
  };
  const baseTools = definePalimpsestTools(controller);
  return {
    repository,
    git,
    store,
    effects,
    policy,
    controller,
    baseTools,
    verificationAdmission,
    verificationCapabilities: {
      bind(next) {
        // An explicit assertion is not overwritten by a derivation.
        if (options.capabilities !== undefined) return;
        verificationCapabilities.bound = next;
      },
    },
    worldBasisStore,
  };
}

/**
 * G10-D5 default activation allocator: a domain-separated digest over
 * (context, subject) — retry-stable (same context ⇒ same id ⇒ Ordarium idempotent dedupe),
 * and not any forbidden identity (§21). Public API via `install.ts` → `advanced.ts`.
 */
export function defaultAllocateActivationId(subject: string, context: string): string {
  return `act-${canonicalDigest({ domain: "palimpsest.activation-id.v1", context, subject }).slice(0, 32)}`;
}

/**
 * The trusted default task policy of the golden path. Public API, like
 * `defaultAllocateActivationId`; it lives here because it belongs to the core composition.
 */
/**
 * @param override - the OPERATOR's narrowing of the default. Measured live: the default gate
 *   command is `python -m pytest`, and a project whose toolchain is not Python could not record
 *   any gate evidence at all — every attempt reached VERIFYING with zero evidence, because the
 *   envelope authorizes only commands from this policy and no caller could declare the project's
 *   own. A deployment therefore declares its commands in the profile; nothing else widens them.
 */
export function trustedDefaultPolicy(
  override: Partial<ConstructorParameters<typeof TaskPolicy>[0]> = {},
): TaskPolicy {
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
    ...override,
  });
}
