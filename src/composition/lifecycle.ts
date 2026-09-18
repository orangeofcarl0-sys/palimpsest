/**
 * SR-1 §11/§14 — the install lifecycle: tool registration and DISPOSAL ORDER.
 *
 * The disposal sequence used to be the tail of `installPalimpsest`. It is the one place in
 * the install path where getting the order wrong corrupts something (a monitor tick running
 * against a closed store; a store closed twice; a caller-owned store closed by the install).
 * Extracting it makes the ownership table explicit and reviewable instead of implicit in the
 * order of statements at the end of a very long function.
 *
 * Ownership invariants (§14), unchanged by this move:
 *
 *   caller-owned resource is never closed by install
 *   install-owned resource closes exactly once
 *
 * Concretely, and exactly as before the move:
 *
 *   `store`            install-created (an `EventStore` the caller supplied is still closed —
 *                      that is the pre-existing contract of `installPalimpsest`)
 *   `effects`          install-created; closed LAST, after every store
 *   `controller`       closed through `ProjectController.close()`
 *   `monitor`          settled with `ready()` then stopped BEFORE any store closes, because a
 *                      tick callback must never run against a closed store
 *   tool registrations disposed FIRST, in reverse registration order
 *   the optional stores below follow their own pre-existing guards verbatim, including the
 *   two ownership flags the install path computes while composing
 */

import type { DshPluginContext, DshToolDefinition } from "../tools/dsh_types.js";
import type { ProjectController } from "../tools/controller.js";
import type { EventStore } from "../state/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/index.js";

/** A resource this install is responsible for closing, with the reason recorded. */
export interface OwnedResource {
  /** Human-readable identity, used by the lifecycle tests. */
  readonly what: string;
  /** Why the install owns it (or why it deliberately does not close it). */
  readonly ownership: "install-owned" | "caller-supplied-but-closed-by-contract";
  readonly close: () => void;
}

/**
 * The monitor's stop-then-close pair, kept separate because of its ordering constraint: the
 * monitor is settled and stopped BEFORE any store closes, so a tick callback can never run
 * against a closed store. `ready()`'s outcome is the driver's own report and is deliberately
 * discarded here, exactly as the pre-refactor sequence did.
 */
export interface MonitorLifecyclePort {
  ready(): Promise<unknown>;
  dispose(): Promise<void>;
}

export interface InstalledLifecycleInput {
  readonly context: DshPluginContext;
  readonly tools: readonly DshToolDefinition[];
  readonly controller: ProjectController;
  readonly store: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
  readonly monitor?: MonitorLifecyclePort | undefined;
  /**
   * Optional stores, closed in this exact order after the controller and the log. Each entry
   * names its own resource and carries the guard the install path already applied.
   */
  readonly ownedResources: readonly OwnedResource[];
}

export interface InstalledLifecycle {
  /** Disposers for the initial context's tool registrations, in registration order. */
  readonly disposers: readonly (() => void)[];
  /** Register the same tool set on a later context; returns that context's disposer. */
  register(next: DshPluginContext): () => void;
  /** Idempotent: the second call is a no-op. */
  dispose(): Promise<void>;
}

/** Register `tools` on `context`, collecting whatever disposer the host returns. */
function registerTools(context: DshPluginContext, tools: readonly DshToolDefinition[]): (() => void)[] {
  const disposers: (() => void)[] = [];
  for (const definition of tools) {
    const registered = context.tools.register(definition);
    if (typeof registered === "function") disposers.push(registered);
    else if (registered !== undefined) disposers.push(() => registered.dispose());
  }
  return disposers;
}

export function composeInstalledLifecycle(input: InstalledLifecycleInput): InstalledLifecycle {
  const disposers = registerTools(input.context, input.tools);
  let disposed = false;
  return {
    disposers,
    register(next: DshPluginContext): () => void {
      const inner = registerTools(next, input.tools);
      return () => {
        for (const dispose of [...inner].reverse()) dispose();
      };
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      // 1. Tool registrations first, reverse order.
      for (const dispose of [...disposers].reverse()) dispose();
      // 2. The monitor settles and STOPS before anything else closes.
      if (input.monitor !== undefined) {
        await input.monitor.ready();
        await input.monitor.dispose();
      }
      // 3. The controller, then the log it writes to.
      await input.controller.close();
      input.store.close();
      // 4. The optional stores, in the recorded order.
      for (const resource of input.ownedResources) resource.close();
      // 5. Finally the Ordarium ledger handle, so an embedder does not leak it.
      await input.effects.close();
    },
  };
}
