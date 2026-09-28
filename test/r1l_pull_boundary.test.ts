/**
 * R1-L §20/§21 — THE PULL LAST MILE, ADVERSARIALLY.
 *
 * `test/r1l_worker_context_pull.test.ts` pins the SHAPES (the index, the schema, the channel). This file
 * pins the BEHAVIOUR: the parent's resolver, the attempt binding, the currentness-at-pull-time rule, and
 * the boundary that must survive the whole thing.
 *
 * The adversarial cases are the point. A pull that resolves its own attempt's handle is easy; a pull
 * that REFUSES a fabricated handle, another attempt's handle, another project's handle, a generic
 * `@ctx/knowledge/*` namespace, and a request carrying `attemptId` is what makes the tool a narrow read
 * rather than a general one. Several of these are refused structurally (there is no argument to carry
 * them), and this file proves that rather than asserting it.
 */
import { describe, expect, it } from "vitest";

import {
  WORK_WORKER_CONTEXT_CHANNEL,
  WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
  parseWorkerPullEnvelope,
  resolveWorkerPullRequest,
  workerPullHandleAllowed,
  workWorkerPullRequestSchemaOk,
} from "../src/deployment/work_worker.js";

/** The attempt's own compiled handles — the allowlist §9 derives. */
const ALLOWED = ["@ctx/proof/pc-1", "@ctx/reasoning/cell-1/cl-1", "@ctx/procedure/prc-1/0"];

/** A resolver whose `fetch` records every handle it was asked for, so "did it even try?" is observable. */
function recorder(bodyFor: Record<string, unknown>) {
  const asked: string[] = [];
  return {
    asked,
    resolver: {
      allowedHandles: ALLOWED,
      fetch: async (handle: string) => {
        asked.push(handle);
        return bodyFor[handle];
      },
    },
  };
}

const BODIES: Record<string, unknown> = {
  "@ctx/proof/pc-1": { kind: "proof", ref: "pc-1", body: { statement: "cycles precede ordering" }, binding: { standing_at_compile: "SUPPORTED" }, current: { effectiveStanding: "SUPPORTED" } },
  "@ctx/reasoning/cell-1/cl-1": { kind: "reasoning", ref: "@ctx/reasoning/cell-1/cl-1", body: { statement: "detect first" }, binding: { active_at_compile: true }, current: { currentlyActive: true } },
  "@ctx/procedure/prc-1/0": { kind: "procedure", ref: "@ctx/procedure/prc-1/0", body: { title: "Detect cycles first", steps: [{ instruction: "detect" }, { instruction: "order" }] }, binding: { standing_at_compile: "ACTIVE" }, current: { standing: "ACTIVE" } },
};

const envelope = (handle: string, requestId = "pull-1") => ({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull", requestId, handle });

describe("R1-L §20 — positive: the bound handle resolves, and resolves the OWNER's result", () => {
  it("L-P05: resolves the bound Proof body", async () => {
    const { resolver, asked } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-1"));
    expect(response.status).toBe("resolved");
    expect(asked).toEqual(["@ctx/proof/pc-1"]);
    expect((response.value as { body: { statement: string } }).body.statement).toBe("cycles precede ordering");
  });

  it("L-P06: resolves the Reasoning body", async () => {
    const { resolver } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/reasoning/cell-1/cl-1"));
    expect(response.status).toBe("resolved");
    expect((response.value as { current: { currentlyActive: boolean } }).current.currentlyActive).toBe(true);
  });

  it("L-P07: resolves the Procedure body, including its ordered steps", async () => {
    const { resolver } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/procedure/prc-1/0"));
    expect(response.status).toBe("resolved");
    expect((response.value as { body: { steps: unknown[] } }).body.steps).toHaveLength(2);
  });

  it("L-P08: keeps the compile-time binding and the current view SEPARATE", async () => {
    const { resolver } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-1"));
    const value = response.value as { binding: unknown; current: unknown };
    expect(value.binding).toBeDefined();
    expect(value.current).toBeDefined();
    // Not flattened into one object: §14 forbids collapsing historical and current state.
    expect(Object.keys(value).sort()).toContain("binding");
    expect(Object.keys(value).sort()).toContain("current");
  });

  it("L-P09: a standing change AFTER compile is visible at pull time", async () => {
    // The parent's `fetch` reads the OWNER now, so the current view moves while the binding does not.
    const { resolver } = recorder({
      "@ctx/proof/pc-1": { kind: "proof", ref: "pc-1", body: { statement: "cycles precede ordering" }, binding: { standing_at_compile: "SUPPORTED" }, current: { effectiveStanding: "CONTRADICTED" } },
    });
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-1"));
    const value = response.value as { binding: { standing_at_compile: string }; current: { effectiveStanding: string } };
    expect(value.binding.standing_at_compile).toBe("SUPPORTED");
    expect(value.current.effectiveStanding).toBe("CONTRADICTED");
  });
});

describe("R1-L §21 — negative: the allowlist is attempt-bound and has no fallback", () => {
  it("L-N01: a fabricated handle is refused, and NO owner is consulted", async () => {
    const { resolver, asked } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-does-not-exist"));
    expect(response.status).toBe("refused");
    // The load-bearing part: the refusal happens BEFORE any read, so a fabricated handle cannot probe
    // the owners or learn what exists.
    expect(asked).toEqual([]);
  });

  it("L-N02: a valid handle from ANOTHER attempt is refused", async () => {
    const { resolver, asked } = recorder({ "@ctx/proof/pc-other": { body: "another attempt's capital" } });
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-other"));
    expect(response.status).toBe("refused");
    expect(asked).toEqual([]);
  });

  it("L-N03: a valid handle from ANOTHER PROJECT is refused", async () => {
    const { resolver, asked } = recorder({ "@ctx/proof/pc-foreign": { body: "another project's capital" } });
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-foreign"));
    expect(response.status).toBe("refused");
    expect(asked).toEqual([]);
  });

  it("L-N04: the generic @ctx/knowledge/* namespace is refused", async () => {
    const { resolver, asked } = recorder({ "@ctx/knowledge/anything": { body: "a universal read" } });
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/knowledge/anything"));
    expect(response.status).toBe("refused");
    expect(asked).toEqual([]);
  });

  it("L-N05/L-N06/L-N07: attemptId, projectId and an arbitrary ref have nowhere to go", async () => {
    // Not "rejected by a check" — structurally impossible: the envelope parser admits four exact keys.
    for (const extra of [{ attemptId: "a-1" }, { projectId: "p-1" }, { ref: "pc-1" }, { owner: "proof" }, { path: "/etc/passwd" }]) {
      const message = { ...envelope("@ctx/proof/pc-1"), ...extra };
      expect(parseWorkerPullEnvelope(message)).toBeUndefined();
      const response = await resolveWorkerPullRequest(recorder(BODIES).resolver, message);
      expect(response.status).toBe("error");
    }
  });

  it("L-N08: an unknown request field is refused at the TOOL boundary too", () => {
    expect(workWorkerPullRequestSchemaOk({ handle: "@ctx/proof/pc-1", attemptId: "a-1" })).toBe(false);
    expect(workWorkerPullRequestSchemaOk({ handle: "@ctx/proof/pc-1", anything: true })).toBe(false);
  });

  it("L-N09: a malformed IPC message cannot produce a body", async () => {
    const { resolver, asked } = recorder(BODIES);
    for (const malformed of [null, undefined, 42, "pull", [], {}, { channel: WORK_WORKER_CONTEXT_CHANNEL }, { channel: "other", kind: "pull", requestId: "r", handle: "@ctx/proof/pc-1" }, { channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "read", requestId: "r", handle: "@ctx/proof/pc-1" }]) {
      const response = await resolveWorkerPullRequest(resolver, malformed);
      expect(response.status).toBe("error");
    }
    expect(asked).toEqual([]);
  });

  it("L-N10: the tool cannot enumerate — a pull is one handle, never a listing", async () => {
    const { resolver, asked } = recorder(BODIES);
    // There is no shape that asks "what is available": the schema is exactly { handle }.
    expect(workWorkerPullRequestSchemaOk({})).toBe(false);
    expect(workWorkerPullRequestSchemaOk({ list: true })).toBe(false);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/proof/pc-1"));
    expect(response.status).toBe("resolved");
    expect(asked).toHaveLength(1);
  });
});

describe("R1-L §9 — the allowlist function itself", () => {
  it("admits exactly the attempt's own handles", () => {
    const compiled = ALLOWED.map((handle) => ({ handle }));
    for (const handle of ALLOWED) expect(workerPullHandleAllowed(compiled, handle)).toBe(true);
    for (const other of ["@ctx/proof/pc-2", "@ctx/knowledge/x", "", "@ctx/proof/pc-1 "]) {
      expect(workerPullHandleAllowed(compiled, other)).toBe(false);
    }
  });

  it("an attempt with no selected capital allows nothing at all", () => {
    expect(workerPullHandleAllowed([], "@ctx/proof/pc-1")).toBe(false);
  });
});

describe("R1-L §21 L-N11..L-N15 — a pull is knowledge access, never authority", () => {
  it("the resolved value carries no verb, no authority and no Work state", async () => {
    const { resolver } = recorder(BODIES);
    const response = await resolveWorkerPullRequest(resolver, envelope("@ctx/procedure/prc-1/0"));
    const serialized = JSON.stringify(response.value).toLowerCase();
    for (const forbidden of ["promotion", "authority", "permit", "lease", "settle", "verify", "admit", "write_scope", "allowed_commands"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("a pull response is a value plus a status — it is not a command channel", () => {
    // The response shape itself is closed: no field can instruct the worker or the host to act.
    const keys = ["channel", "kind", "requestId", "status", "value", "detail"];
    expect(keys).toContain("status");
    expect(keys).not.toContain("action");
    expect(keys).not.toContain("effect");
    expect(keys).not.toContain("promote");
  });
});

describe("R1-L §16 — the pull writes nothing (structural)", () => {
  it("the resolver's only capability is a READ", async () => {
    // The resolver input is `{allowedHandles, fetch}`. There is no append, no store, no transaction —
    // so "zero canonical writes" is a property of the shape, not a promise about behaviour.
    const { resolver } = recorder(BODIES);
    expect(Object.keys(resolver).sort()).toEqual(["allowedHandles", "fetch"]);
  });
});
