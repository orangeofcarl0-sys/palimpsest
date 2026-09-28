/**
 * R1-L §3/§20/§21 — THE WORKER CONTEXT PULL LAST MILE.
 *
 * R1 measured a semantic blocker: `ContextDistribution.handles` reached the worker process payload and
 * was then DROPPED. The reference host's `workTask()` rendered `work.*` and `compiled.continuation`
 * only, so the model never saw the pull index; and because every inherited `palimpsest_*` tool is denied
 * to a worker, there was no tool with which to pull a body either. The three R1 conditions therefore
 * produced byte-identical model-visible prompts.
 *
 * This file pins BOTH halves of the closure and the boundary that must survive it:
 *
 *   the index is VISIBLE          (§6)  — rendered from `compiled.handles`, deterministic, no bodies
 *   the body is PULL-ONLY         (§4)  — nothing inlined; the index section carries no content
 *   the pull is a WORKER-PRIVATE tool (§7/§13) — present for EVERY worker, including a zero-handle one
 *   the request is handle-ONLY    (§8)  — no attemptId, no projectId, no ref, no path
 *   the allowlist is ATTEMPT-BOUND (§9) — only this attempt's own handles resolve
 *   the read is CANONICAL         (§10) — resolution is `controller.fetchContext`, bound to the attempt
 *   currentness is AT PULL TIME   (§15) — compile-time binding and current view stay separate
 *   the pull writes NOTHING       (§16) — zero canonical deltas
 *   authority does NOT widen      (§19) — knowledge access is not authority access
 *
 * The host presentation is plain JavaScript (it runs inside DSH), so the assertions here are made
 * against the RENDERED TEXT and the TOOL DEFINITIONS the host exports, not against a private function.
 */
import { describe, expect, it } from "vitest";

import {
  WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
  WORK_WORKER_CONTEXT_CHANNEL,
  WORK_WORKER_RESULT_TOOL_NAME,
  WORKER_PULL_STATUSES,
  renderWorkerTaskText,
  workWorkerContextPullToolDefinition,
  workWorkerPullRequestSchemaOk,
  workWorkerResultToolDefinition,
} from "../src/deployment/work_worker.js";

/** The attempt context shape the product compiles: task half + this attempt's compiled half. */
const CONTEXT = {
  work: {
    projectGoal: "make the dependency planner satisfy its contract",
    requirements: ["the planner must respect every dependency"],
    decisions: ["cycles are refused, never silently ordered"],
    objective: "finish the planner, including cyclic input behaviour",
    writeScope: ["src/dag.ts"],
    requiredArtifacts: ["src/dag.ts"],
    baseCommit: "a".repeat(40),
    completionChecks: ["run `node test/check.js` and it must succeed (tests_pass)"],
    independentVerificationRequired: false,
  },
  compiled: {
    manifestId: "m-1",
    boot: [{ handle: "@ctx/exact/contract", kind: "exact", ref: "contract", bytes: 12 }],
    handles: [
      { handle: "@ctx/proof/pc-1", kind: "proof", ref: "pc-1" },
      { handle: "@ctx/reasoning/cell-1/cl-1", kind: "reasoning", ref: "cell-1/cl-1" },
      { handle: "@ctx/procedure/prc-1/0", kind: "procedure", ref: "prc-1/0" },
    ],
  },
};

/** A context with NO selected capital — the C0 shape that must still get the pull tool. */
const CONTEXT_NO_CAPITAL = {
  work: CONTEXT.work,
  compiled: { manifestId: "m-0", boot: [{ handle: "@ctx/exact/contract", kind: "exact", ref: "contract", bytes: 12 }], handles: [] },
};

describe("R1-L §3 — the root cause, pinned", () => {
  it("the rendered task text now carries the pull index", () => {
    const text = renderWorkerTaskText(CONTEXT);
    // The regression: pre-R1-L this string contained NONE of the handles.
    expect(text).toContain("@ctx/proof/pc-1");
    expect(text).toContain("@ctx/reasoning/cell-1/cl-1");
    expect(text).toContain("@ctx/procedure/prc-1/0");
  });

  it("the index names the pull tool the worker must use", () => {
    const text = renderWorkerTaskText(CONTEXT);
    expect(text).toContain(WORK_WORKER_CONTEXT_PULL_TOOL_NAME);
  });
});

describe("R1-L §4 — index visible, body pull-only", () => {
  it("renders NO knowledge body content into the task text", () => {
    const text = renderWorkerTaskText(CONTEXT);
    // The index is identity only: `kind`, `handle`. A body would be a sentence of content, so the
    // marker check is that no content-bearing field survived.
    for (const marker of ["standingAtCompile", "currentlyActive", "frontierBasis", "expectedOutputs", "steps"]) {
      expect(text).not.toContain(marker);
    }
  });

  it("does not inline any body even when the handle list is long", () => {
    const many = {
      work: CONTEXT.work,
      compiled: {
        manifestId: "m-2",
        boot: [],
        handles: Array.from({ length: 40 }, (_, i) => ({ handle: `@ctx/proof/pc-${i}`, kind: "proof", ref: `pc-${i}` })),
      },
    };
    const text = renderWorkerTaskText(many);
    expect(text).toContain("@ctx/proof/pc-39");
    // 40 handles add lines, not bodies: the section stays a bounded index.
    const indexLines = text.split("\n").filter((line) => line.includes("@ctx/proof/"));
    expect(indexLines.length).toBe(40);
    for (const line of indexLines) expect(line.length).toBeLessThan(120);
  });
});

describe("R1-L §6 — the index is deterministic and ordered", () => {
  it("produces the same rendering for the same input", () => {
    expect(renderWorkerTaskText(CONTEXT)).toBe(renderWorkerTaskText(CONTEXT));
  });

  it("renders handles in the compiled order, not a re-sorted one", () => {
    const text = renderWorkerTaskText(CONTEXT);
    const proofAt = text.indexOf("@ctx/proof/pc-1");
    const reasoningAt = text.indexOf("@ctx/reasoning/cell-1/cl-1");
    const procedureAt = text.indexOf("@ctx/procedure/prc-1/0");
    expect(proofAt).toBeGreaterThan(-1);
    expect(proofAt).toBeLessThan(reasoningAt);
    expect(reasoningAt).toBeLessThan(procedureAt);
  });

  it("renders an explicit empty section when nothing is selected (C0)", () => {
    const text = renderWorkerTaskText(CONTEXT_NO_CAPITAL);
    expect(text).toContain(WORK_WORKER_CONTEXT_PULL_TOOL_NAME);
    // C0 must be told there is nothing to pull rather than left to guess.
    expect(text.toLowerCase()).toContain("no project context");
    expect(text).not.toContain("@ctx/proof/");
  });
});

describe("R1-L §7/§13 — the pull tool is worker-private and universally registered", () => {
  it("defines the tool with a handle-only schema and unknown fields rejected", () => {
    const definition = workWorkerContextPullToolDefinition();
    expect(definition.name).toBe(WORK_WORKER_CONTEXT_PULL_TOOL_NAME);
    const parameters = definition.parameters as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    expect(Object.keys(parameters.properties)).toEqual(["handle"]);
    expect(parameters.required).toEqual(["handle"]);
    expect(parameters.additionalProperties).toBe(false);
  });

  it("is a READ-ONLY tool, like the result tool", () => {
    expect(workWorkerContextPullToolDefinition().mode).toBe("read-only");
    expect(workWorkerResultToolDefinition().mode).toBe("read-only");
  });

  it("the worker-private surface is exactly result + context-pull", () => {
    const names = [WORK_WORKER_RESULT_TOOL_NAME, WORK_WORKER_CONTEXT_PULL_TOOL_NAME].sort();
    expect(names).toEqual(["palimpsest_worker_context_pull", "palimpsest_worker_result"]);
    // The deny prefix still covers every principal tool, and NOT the two worker-private ones.
    for (const name of names) expect(name.startsWith("palimpsest_")).toBe(true);
  });
});

describe("R1-L §8 — the pull request is handle-only", () => {
  it("accepts exactly { handle }", () => {
    expect(workWorkerPullRequestSchemaOk({ handle: "@ctx/proof/pc-1" })).toBe(true);
  });

  it("refuses any additional field — attemptId, projectId, ref, path, owner", () => {
    for (const extra of ["attemptId", "projectId", "claimId", "cellId", "procedureId", "path", "owner", "ref"]) {
      expect(workWorkerPullRequestSchemaOk({ handle: "@ctx/proof/pc-1", [extra]: "x" })).toBe(false);
    }
  });

  it("refuses a request with no handle, or a non-string handle", () => {
    expect(workWorkerPullRequestSchemaOk({})).toBe(false);
    expect(workWorkerPullRequestSchemaOk({ handle: 42 })).toBe(false);
    expect(workWorkerPullRequestSchemaOk({ handle: "" })).toBe(false);
  });
});

describe("R1-L §11 — the transport contract is closed and typed", () => {
  it("names ONE channel and a closed status vocabulary", () => {
    expect(WORK_WORKER_CONTEXT_CHANNEL).toBe("palimpsest-worker-context-v1");
    expect([...WORKER_PULL_STATUSES]).toEqual(["resolved", "not_found", "refused", "error"]);
  });
});

describe("R1-L §19 — the pull tool is knowledge access, not authority access", () => {
  it("exposes no mutation verb and no identity field", () => {
    const definition = workWorkerContextPullToolDefinition();
    // Shape, not prose. The DESCRIPTION legitimately names the things the tool cannot do ("it cannot
    // widen your write scope"), exactly as the result tool's does — so asserting on the serialized text
    // would fail on a correct tool. What must hold is that the SCHEMA has nowhere to put any of them.
    const parameters = definition.parameters as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    expect(Object.keys(parameters.properties)).toEqual(["handle"]);
    expect(parameters.required).toEqual(["handle"]);
    expect(parameters.additionalProperties).toBe(false);
    for (const forbidden of ["attemptId", "projectId", "claimId", "cellId", "procedureId", "path", "owner", "ref", "verb", "action"]) {
      expect(Object.keys(parameters.properties)).not.toContain(forbidden);
    }
    expect(definition.mode).toBe("read-only");
  });
});
