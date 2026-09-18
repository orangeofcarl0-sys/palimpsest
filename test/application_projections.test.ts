/**
 * MultiGraph projection adapters — the Work species reads the REAL Work graph.
 *
 * These tests exist because the Work projection had no coverage at all, and that is exactly why a
 * shipped defect survived 178 test files: `workProjection` read `task.id` / `promotion.id` while the
 * Work graph exposes `taskId` / `promotionId`, so every MultiGraph Work node rendered as
 * `undefined` (presentationId, typed ref id AND label). The E2E suite covered `/api/graph`, which is
 * correct; nothing covered the projection that MultiGraph actually reads.
 *
 * The first test drives the same call the application surface makes
 * (`src/application/surfaces/projections.ts`), so it fails if the adapter and the graph drift apart
 * again — the typing alone is the guard, and this is the proof that the guard is wired to reality.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { reasoningProjection, workProjection } from "../src/application/projections.js";
import type { OrchestrationGraph } from "../src/tools/graph.js";
import { ProjectController } from "../src/tools/controller.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-projection-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "projection-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-18T00:00:00Z",
  });
  return {
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

/** A node whose identity is the literal string "undefined" is the defect this file guards. */
function assertNoUndefinedIdentity(label: string, envelope: { readonly nodes: readonly { readonly presentationId: string; readonly ref: { readonly id: string }; readonly label: string }[] }): void {
  for (const node of envelope.nodes) {
    expect(node.presentationId, `${label}: presentationId carries "undefined"`).not.toContain("undefined");
    expect(node.ref.id, `${label}: ref.id is the literal "undefined"`).not.toBe("undefined");
    expect(node.label, `${label}: label is the literal "undefined"`).not.toBe("undefined");
  }
}

describe("MultiGraph Work projection reads the real Work graph", () => {
  it("PROJ-W01: a real project's task projects with its canonical taskId, not undefined", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({ projectId: "projection-project", goal: "g", tasks: [taskSpec("task-1")] });

      // Exactly the call src/application/surfaces/projections.ts makes.
      const envelope = workProjection(rig.controller.orchestrationGraph(), rig.controller.viewCursor());

      expect(envelope.species).toBe("work");
      expect(envelope.knowledge).toBe("known");
      expect(envelope.nodes).toHaveLength(1);
      const node = envelope.nodes[0]!;
      expect(node.presentationId).toBe("work:task:task-1");
      expect(node.ref).toEqual({ species: "work", kind: "task", id: "task-1" });
      expect(node.label).toBe("task-1");
      // The state comes from the same record, so it must be a real scheduler state.
      expect(typeof node.state).toBe("string");
      expect(node.state).not.toBe("undefined");
      assertNoUndefinedIdentity("PROJ-W01", envelope);
    } finally {
      await rig.cleanup();
    }
  });

  it("PROJ-W02: every task in a multi-task project is projected by its own taskId", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({
        projectId: "projection-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2"), taskSpec("task-3")],
      });
      const envelope = workProjection(rig.controller.orchestrationGraph(), rig.controller.viewCursor());
      const ids = envelope.nodes.filter((node) => node.kind === "task").map((node) => node.ref.id).sort();
      expect(ids).toEqual(["task-1", "task-2", "task-3"]);
      assertNoUndefinedIdentity("PROJ-W02", envelope);
    } finally {
      await rig.cleanup();
    }
  });

  it("PROJ-W03: a promotion node carries its promotionId and its real state is never invented", () => {
    // A typed graph literal: the projection's contract is now compiler-checked, so this cannot
    // silently drift the way the `unknown` cast did.
    const graph: OrchestrationGraph = {
      project: { projectId: "p", revision: 0, goal: "g", paused: false, cursor: 0 },
      tasks: [],
      promotions: [{ promotionId: "promotion-7", attemptId: "attempt-1", state: "COMMITTED" }],
    };
    const envelope = workProjection(graph, null);
    expect(envelope.nodes).toHaveLength(1);
    expect(envelope.nodes[0]!.presentationId).toBe("work:promotion:promotion-7");
    expect(envelope.nodes[0]!.ref).toEqual({ species: "work", kind: "promotion", id: "promotion-7" });
    expect(envelope.nodes[0]!.label).toBe("promotion-7");
    assertNoUndefinedIdentity("PROJ-W03", envelope);
  });

  it("PROJ-W04: an absent source is an UNKNOWN projection, never an empty known graph", () => {
    const envelope = workProjection(null, null);
    expect(envelope.knowledge).toBe("unknown");
    expect(envelope.nodes).toEqual([]);
    expect(envelope.sourceBases).toEqual([]);
  });

  it("PROJ-W05: the projection digest covers the canonical refs, so it changes with them", () => {
    const base: OrchestrationGraph = {
      project: { projectId: "p", revision: 0, goal: "g", paused: false, cursor: 0 },
      tasks: [{ taskId: "task-1", objective: "o", state: "READY", role: "implementer", dependsOn: [], writePaths: [], requiredArtifacts: [], attempts: [] }],
      promotions: [],
    };
    const other: OrchestrationGraph = { ...base, tasks: [{ ...base.tasks[0]!, taskId: "task-2" }] };
    expect(workProjection(base, null).projectionDigest).not.toBe(workProjection(other, null).projectionDigest);
  });
});

describe("MultiGraph Reasoning projection labels nodes by what they say", () => {
  const claimNode = (content: unknown) => ({
    ref: { claimId: "cl-27148b4ce5c9c298dc53a4d5" },
    claim: { type: { typeId: "reasoning.statement" }, ...(content === undefined ? {} : { content }), dependencies: [] },
    active: true,
  });
  const project = (nodes: ReturnType<typeof claimNode>[]) =>
    reasoningProjection({ cellId: "cell-1", frontierRevision: 0, frontierDigest: "d", nodes, candidates: [], branches: [] });

  it("PROJ-R01: a claim with a statement is labelled by the statement, not by its type", () => {
    const envelope = project([claimNode({ statement: "two independent falsifiable replacements preserving first-occurrence order" })]);
    expect(envelope.nodes[0]!.label).toBe("two independent falsifiable replacements preserving first-occurrence order");
    expect(envelope.nodes[0]!.label).not.toBe("reasoning.statement");
    // The canonical identity is still carried — labelling by content must not lose the ref.
    expect(envelope.nodes[0]!.ref).toEqual({ species: "reasoning", kind: "claim", id: "cl-27148b4ce5c9c298dc53a4d5" });
  });

  it("PROJ-R02: a claim with no statement falls back to its type, and nothing is invented", () => {
    expect(project([claimNode(undefined)]).nodes[0]!.label).toBe("reasoning.statement");
    expect(project([claimNode({})]).nodes[0]!.label).toBe("reasoning.statement");
    expect(project([claimNode({ statement: "   " })]).nodes[0]!.label).toBe("reasoning.statement");
    expect(project([claimNode({ statement: 42 })]).nodes[0]!.label).toBe("reasoning.statement");
    expect(project([claimNode(null)]).nodes[0]!.label).toBe("reasoning.statement");
  });

  it("PROJ-R03: the label is not part of the digest, so re-labelling does not churn the read model", () => {
    const a = project([claimNode({ statement: "first wording" })]);
    const b = project([claimNode({ statement: "a different wording" })]);
    expect(a.projectionDigest).toBe(b.projectionDigest);
    expect(a.nodes[0]!.presentationId).toBe(b.nodes[0]!.presentationId);
  });
});
