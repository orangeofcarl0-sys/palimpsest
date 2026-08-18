/**
 * installPalimpsest — the golden path (docs/01 §6, P2).
 *
 * One call wires the orchestration ledger, the shared Ordarium effects
 * runtime, the trusted policy, the controller and the seven tools into a
 * DSH host context. Defaults are zero-config and strong: `$DSH_HOME`
 * ledgers, a trusted-default policy (deny network, bounded attempts), and
 * the git CLI port rooted at the canonical repository.
 */

import { join } from "node:path";

import type { RuntimeHooks } from "@ordarium/core";

import { EventStore, dshDefaultStatePath } from "./state/index.js";
import { defaultOrdariumPath, createPalimpsestEffects } from "./effects/index.js";
import { GitCliPort, type GitPort } from "./effects/index.js";
import { TaskPolicy } from "./domain/index.js";
import { ProjectController } from "./tools/controller.js";
import { definePalimpsestTools } from "./tools/tools.js";
import type { DshPluginContext, DshToolDefinition } from "./tools/dsh_types.js";

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
}

export interface InstalledPalimpsest {
  readonly controller: ProjectController;
  readonly tools: readonly DshToolDefinition[];
  register(context: DshPluginContext): () => void;
  dispose(): Promise<void>;
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

  const disposers: (() => void)[] = [];
  for (const definition of tools) {
    const registered = context.tools.register(definition);
    if (typeof registered === "function") disposers.push(registered);
    else if (registered !== undefined) disposers.push(() => registered.dispose());
  }

  return {
    controller,
    tools,
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
