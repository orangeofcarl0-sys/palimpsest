/**
 * PLMP-GRAPH-5 §B2-E / SCHEMA-AUDIT-A01 (31 号修订): a tripwire over the
 * canonical parser strictness matrix produced in
 * docs/engineering/audits/G9-B2-CLOSURE-ASSESSMENT.md §E. The facts below are
 * the AUDITED CURRENT STATE - they pin parser discipline so it cannot drift
 * silently in either direction. Tightening a parser (G9-F scope) must update
 * this tripwire together with a frozen wire-contract decision; the matrix in
 * the assessment is the reference.
 */
import { describe, expect, it } from "vitest";

import { parseTaskSpec } from "../src/schema/index.js";
import { parseAgentGraphNode } from "../src/graph/index.js";
import { parseStageGraphDefinition } from "../src/domain/index.js";

const validTaskSpec = {
  task_id: "task-1",
  objective: "Complete task-1.",
  depends_on: [],
  write_paths: ["src/task-1.py"],
  required_artifacts: ["src/task-1.py"],
};

const validAgentNode = { id: "a", kind: "agent", label: "A", scope: "root", task: {} };

const validStageGraph = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING", concurrency: 2 },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "audit",
  reason: "audit fixture",
};

describe("parser strictness tripwire (SCHEMA-AUDIT-A01)", () => {
  it("models.ts canonical parsers accept unknown fields (audited state - G9-F scope)", () => {
    // Required-field strict, unknown-field permissive: the whole models.ts
    // family behaves this way today. DO NOT 'fix' here - wire contracts are
    // frozen and need a per-contract decision (assessment §E).
    const spec = parseTaskSpec({ ...validTaskSpec, unknown_extra_field: 1 });
    expect(spec.task_id).toBe("task-1");
    expect(Object.hasOwn(spec, "unknown_extra_field")).toBe(false);
  });

  it("graph/canvas parsers are strict whitelists (24/21 号 contracts)", () => {
    expect(() => parseAgentGraphNode({ ...validAgentNode, extra: 1 })).toThrow(/unknown node field "extra"/);
  });

  it("parseStageGraphDefinition is field-open at every layer (audited state - G9-F scope)", () => {
    // The typo case from the G9-B2 audit: 'concurency' is silently ignored
    // today. Pinned here so the G9-F tightening flips this tripwire on purpose.
    const graph = parseStageGraphDefinition({
      ...validStageGraph,
      stages: [{ id: "active", state: "ACTIVE", concurency: 8 }, ...validStageGraph.stages.slice(1)],
      mystery_root_field: true,
    });
    expect(graph.stages[0]!.concurrency).toBeUndefined();
  });
});
