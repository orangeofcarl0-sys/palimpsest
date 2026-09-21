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

import { join } from "node:path";

import type { RuntimeHooks } from "@ordarium/core";

import { canonicalDigest } from "../schema/canonical.js";
import { TaskPolicy } from "../domain/index.js";
import type { GitPort } from "../effects/index.js";
import { createPalimpsestEffects, defaultOrdariumPath, GitCliPort } from "../effects/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/index.js";
import { EventStore, dshDefaultStatePath } from "../state/index.js";
import type { DshToolDefinition } from "../tools/dsh_types.js";
import { ProjectController } from "../tools/controller.js";
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
}

/** §12: explicit typed input, explicit typed output, no discovery, no string keys. */
export function composeCore(options: CoreCompositionOptions): CoreComposition {
  const repository = options.repository ?? process.cwd();
  const git = options.git ?? new GitCliPort(repository, join(repository, ".palimpsest", "worktrees"));
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
    execution: options.execution,
    standard: options.standard,
    /**
     * PLMP-LEAN-1 §2.1 / 2A-Q: what this deployment can actually do, so readiness states the truth
     * rather than a guess. `sandboxSpawnVerified` is true exactly when a REAL repository is bound: a
     * deployment with none cannot spawn anything in a project tree, and one that says nothing gets
     * the controller's conservative default instead of a comfortable assumption. The verifier half is
     * filled in where verification is composed, which is the only place that knows.
     */
    capabilities: options.capabilities ?? {
      independentVerifierAvailable: false,
      sandboxSpawnVerified: options.repository !== undefined && options.repository !== "",
    },
    clock: options.clock,
  });
  const baseTools = definePalimpsestTools(controller);
  return { repository, git, store, effects, policy, controller, baseTools };
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
