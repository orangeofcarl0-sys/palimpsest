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
