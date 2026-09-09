/**
 * PLMP-GRAPH-5 §B2-E / SCHEMA-AUDIT-A01 (31 号修订): a tripwire over the
 * canonical parser strictness matrix. Originally produced from
 * docs/engineering/audits/G9-B2-CLOSURE-ASSESSMENT.md §E; **tightened by
 * G9-F (spec 35, PLMP-PARSE-1)** - the previously audited permissive state
 * (required-field strict, unknown-field permissive) was a deliberate
 * placeholder, and the frozen per-contract decision now REJECTS unknown
 * keys on closed contracts (PARSE-INV-1/WIRE-INV-1) while keeping explicit
 * open maps open (PARSE-INV-3). The facts below pin parser discipline so it
 * cannot drift silently in either direction.
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

describe("parser strictness tripwire (SCHEMA-AUDIT-A01, tightened by spec 35)", () => {
  it("models.ts canonical parsers REJECT unknown fields on closed contracts", () => {
    // G9-F (spec 35 §1.4): the audited permissive state is closed. Unknown
    // keys on a closed versioned contract mean the parser does not
    // understand that version - they must error, never silently vanish.
    expect(() => parseTaskSpec({ ...validTaskSpec, unknown_extra_field: 1 })).toThrow(
      /task spec: unknown field 'unknown_extra_field'/,
    );
    // Declared additive optionals (SDS-4) stay first-class.
    const spec = parseTaskSpec({ ...validTaskSpec, scope_id: "s1", role: "scout" });
    expect(spec.scope_id).toBe("s1");
  });

  it("graph/canvas parsers are strict whitelists (24/21 号 contracts)", () => {
    expect(() => parseAgentGraphNode({ ...validAgentNode, extra: 1 })).toThrow(/unknown node field "extra"/);
  });

  it("parseStageGraphDefinition rejects unknown fields at every owned layer", () => {
    // The G9-B2 audit typo ('concurency') now errors at the stage layer and
    // at the root layer - flipped on purpose by spec 35 PARSE-H01.
    expect(() =>
      parseStageGraphDefinition({
        ...validStageGraph,
        stages: [{ id: "active", state: "ACTIVE", concurency: 8 }, ...validStageGraph.stages.slice(1)],
      }),
    ).toThrow(/unknown stage graph field 'concurency' on stage 'active'/);
    expect(() => parseStageGraphDefinition({ ...validStageGraph, mystery_root_field: true })).toThrow(
      /unknown stage graph field 'mystery_root_field' on the stage graph root/,
    );
    // Guard clause CONTENTS remain owned by parseClause - legal clauses
    // still parse (PARSE-INV-2).
    const withGuards = parseStageGraphDefinition({
      ...validStageGraph,
      guards: {
        "active:TASK_VERIFYING:VERIFYING": [{ exists: { predicate: "tests_pass", where: { suite: "unit" } } }],
      },
    });
    expect(withGuards.guards["active:TASK_VERIFYING:VERIFYING"]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Spec 35 (PLMP-PARSE-1): PARSE-H01 reproduction-turned-acceptance + canonical
// matrix spot checks. The defects were machine-reproduced BEFORE the fix
// (typo silently swallowed at root/stage/transition/gate-clause layers).
// ---------------------------------------------------------------------------

describe("spec 35 PARSE-H01 + canonical matrix spot checks", () => {
  it("PARSE-H01-A: a root-level typo is an error, never a default", () => {
    expect(() => parseStageGraphDefinition({ ...validStageGraph, concurency: 8 })).toThrow(
      /unknown stage graph field 'concurency' on the stage graph root/,
    );
  });

  it("PARSE-H01-B: a stage-level typo is an error", () => {
    expect(() =>
      parseStageGraphDefinition({
        ...validStageGraph,
        stages: [{ id: "active", state: "ACTIVE", concurency: 8 }, ...validStageGraph.stages.slice(1)],
      }),
    ).toThrow(/unknown stage graph field 'concurency'/);
  });

  it("PARSE-H01-C: a transition-level typo is an error", () => {
    expect(() =>
      parseStageGraphDefinition({
        ...validStageGraph,
        transitions: [
          { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate", guard: "x" },
        ],
      }),
    ).toThrow(/unknown stage graph field 'guard' on transition 'active'/);
  });

  it("PARSE-H01-D: guard contents stay owned by parseClause; where maps stay open", () => {
    // Legal clauses with open `where` payloads parse untouched (PARSE-INV-2/3).
    const graph = parseStageGraphDefinition({
      ...validStageGraph,
      guards: {
        "active:TASK_VERIFYING:VERIFYING": [
          { count: { predicate: "tests_pass", gte: 1, where: { suite: "unit", extra_domain_data: true } } },
        ],
      },
    });
    expect(graph.guards["active:TASK_VERIFYING:VERIFYING"]).toHaveLength(1);
    // But a clause-envelope typo (unknown sibling) still errors.
    expect(() =>
      parseStageGraphDefinition({
        ...validStageGraph,
        guards: {
          "active:TASK_VERIFYING:VERIFYING": [{ exists: { predicate: "tests_pass" }, nott: {} }],
        },
      }),
    ).toThrow(/unknown gate clause field 'nott'/);
  });

  it("matrix: canonical contract unknown keys reject; declared optionals stay first-class", async () => {
    const { parseRequirement, parseEvidenceAtom, parseNewEvent, normalizeEventPayload } = await import(
      "../src/schema/index.js"
    );
    expect(() =>
      parseRequirement({ requirement_id: "r1", statement: "s", priority: "high", acceptance_refs: [], typo: 1 }),
    ).toThrow(/requirement: unknown field 'typo'/);
    // EvidenceAtom: envelope closed, `value` contents open (PARSE-INV-3).
    const atom = {
      schema_version: 1,
      project_id: "p",
      evidence_id: "e1",
      subject_type: "attempt" as const,
      subject_id: "attempt-1",
      subject_digest: "a".repeat(64),
      predicate: "tests_pass" as const,
      value: { some_domain_specific_measurement: 12 },
      project_revision: 0,
      input_fingerprint: "b".repeat(64),
      command: ["python", "-m", "pytest"],
      exit_code: 0,
      environment_digest: "c".repeat(64),
      dependency_digest: null,
      observed_artifacts: [],
      producer: "test",
      created_at: "2026-09-10T00:00:00Z",
      status: "active" as const,
    };
    expect(parseEvidenceAtom(atom).value).toEqual({ some_domain_specific_measurement: 12 });
    expect(() => parseEvidenceAtom({ ...atom, valu: {} })).toThrow(/evidence atom: unknown field 'valu'/);
    // Event payload: a typo must not silently normalize away.
    expect(() =>
      normalizeEventPayload("TASK_BLOCKED", { previous_state: "READY", new_state: "BLOCKED", reason: "r", reasno: "typo" }),
    ).toThrow(/event payload TASK_BLOCKED: unknown field 'reasno'/);
    // Event envelope: unknown key rejects on the new face; committed fields
    // belong to the committed face only.
    expect(() =>
      parseNewEvent({ event_id: 1 }),
    ).toThrow();
  });
});
