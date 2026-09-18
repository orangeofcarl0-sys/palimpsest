/**
 * SR1-A08/A09 — resource ownership and disposal order (§14).
 *
 * Before R1 this logic was the tail of a 1,400-line `installPalimpsest` body and could only be
 * exercised through a full installation. Extracting `composeInstalledLifecycle` makes the
 * invariants directly testable:
 *
 *   caller-owned resource is never closed by install
 *   install-owned resource closes exactly once
 *   the monitor is settled and stopped BEFORE any store closes
 *   tool registrations are disposed first, in reverse registration order
 */

import { describe, expect, it } from "vitest";

import { composeInstalledLifecycle, type OwnedResource } from "../../src/composition/lifecycle.js";
import type { DshPluginContext, DshToolDefinition } from "../../src/tools/dsh_types.js";

interface Harness {
  readonly events: string[];
  readonly context: DshPluginContext;
  readonly tools: readonly DshToolDefinition[];
  readonly owned: readonly OwnedResource[];
  readonly controller: { close(): Promise<void> };
  readonly store: { close(): void };
  readonly effects: { close(): Promise<void> };
  readonly monitor: { ready(): Promise<unknown>; dispose(): Promise<void> };
}

function harness(options: { readonly withMonitor?: boolean; readonly owned?: readonly string[] } = {}): Harness {
  const events: string[] = [];
  const tools = [1, 2, 3].map((n) => ({ name: `tool-${n}` }) as unknown as DshToolDefinition);
  const context = {
    tools: {
      register: (definition: DshToolDefinition) => {
        const name = (definition as unknown as { readonly name: string }).name;
        events.push(`register:${name}`);
        return () => events.push(`dispose:${name}`);
      },
    },
  } as unknown as DshPluginContext;
  return {
    events,
    context,
    tools,
    owned: (options.owned ?? []).map((name) => ({
      what: name,
      ownership: "INSTALL_CREATED_AND_MANAGED" as const,
      close: () => events.push(`close:${name}`),
    })),
    controller: { close: async () => void events.push("controller.close") },
    store: { close: () => void events.push("store.close") },
    effects: { close: async () => void events.push("effects.close") },
    monitor: {
      ready: async () => {
        events.push("monitor.ready");
        return { state: "started" };
      },
      dispose: async () => void events.push("monitor.dispose"),
    },
  };
}

const assemble = (h: Harness, withMonitor = false) =>
  composeInstalledLifecycle({
    context: h.context,
    tools: h.tools,
    controller: h.controller as never,
    store: h.store as never,
    effects: h.effects as never,
    ...(withMonitor ? { monitor: h.monitor } : {}),
    ownedResources: h.owned,
  });

describe("SR1-A08/A09 install lifecycle ownership", () => {
  it("A08 disposes tool registrations first, in reverse registration order", async () => {
    const h = harness();
    const lifecycle = assemble(h);
    await lifecycle.dispose();
    expect(h.events.slice(3, 6)).toEqual(["dispose:tool-3", "dispose:tool-2", "dispose:tool-1"]);
  });

  it("A09 closes everything in the documented order: registrations, monitor, controller, log, owned stores, effects", async () => {
    const h = harness({ owned: ["verificationHistory", "bridgeHistory"] });
    const lifecycle = assemble(h, true);
    await lifecycle.dispose();
    expect(h.events).toEqual([
      "register:tool-1",
      "register:tool-2",
      "register:tool-3",
      "dispose:tool-3",
      "dispose:tool-2",
      "dispose:tool-1",
      "monitor.ready",
      "monitor.dispose",
      "controller.close",
      "store.close",
      "close:verificationHistory",
      "close:bridgeHistory",
      "effects.close",
    ]);
  });

  it("A09 the monitor is settled and stopped BEFORE any store closes", async () => {
    const h = harness();
    await assemble(h, true).dispose();
    expect(h.events.indexOf("monitor.dispose")).toBeLessThan(h.events.indexOf("store.close"));
    expect(h.events.indexOf("monitor.ready")).toBeLessThan(h.events.indexOf("controller.close"));
  });

  it("A09 with no monitor composed, no monitor call happens at all", async () => {
    const h = harness();
    await assemble(h, false).dispose();
    expect(h.events.some((event) => event.startsWith("monitor."))).toBe(false);
  });

  it("A09 dispose is idempotent: a second call closes nothing again", async () => {
    const h = harness({ owned: ["store-a"] });
    const lifecycle = assemble(h, true);
    await lifecycle.dispose();
    const after = [...h.events];
    await lifecycle.dispose();
    expect(h.events).toEqual(after);
  });

  it("A08/A09 an owned resource that throws does not silently look closed twice", async () => {
    const h = harness();
    const failing: OwnedResource = {
      what: "exploding",
      ownership: "INSTALL_CREATED_AND_MANAGED",
      close: () => {
        h.events.push("close:exploding");
        throw new Error("close failed");
      },
    };
    const lifecycle = composeInstalledLifecycle({
      context: h.context,
      tools: h.tools,
      controller: h.controller as never,
      store: h.store as never,
      effects: h.effects as never,
      ownedResources: [failing],
    });
    await expect(lifecycle.dispose()).rejects.toThrow("close failed");
    // The failure is NOT swallowed: effects was not reached, and a retry does not re-close.
    expect(h.events).not.toContain("effects.close");
    await expect(lifecycle.dispose()).resolves.toBeUndefined();
    expect(h.events.filter((event) => event === "close:exploding")).toHaveLength(1);
  });

  it("register(next) re-registers the same tool set and disposes only its own registrations", async () => {
    const h = harness();
    const lifecycle = assemble(h);
    const inner = lifecycle.register(h.context);
    expect(h.events.filter((event) => event.startsWith("register:")).length).toBe(6);
    inner();
    expect(h.events.slice(-3)).toEqual(["dispose:tool-3", "dispose:tool-2", "dispose:tool-1"]);
    // The initial disposers were NOT consumed by the inner disposer.
    await lifecycle.dispose();
    expect(h.events.filter((event) => event === "dispose:tool-1")).toHaveLength(2);
  });

  it("A09 the disposer list is exposed for the initial context", () => {
    const h = harness();
    expect(assemble(h).disposers).toHaveLength(3);
  });
});
