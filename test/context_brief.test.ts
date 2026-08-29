import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compileContextBrief,
  type ContextBriefInput,
} from "../src/context/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-ctx-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 1,
      candidate_limit: 1,
    }),
    clock: () => "2026-08-13T00:00:00Z",
  });
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function baseInput(): ContextBriefInput {
  return {
    projectId: "p1",
    evidence: [
      {
        evidenceId: "EVD-1",
        status: "active",
        subjectType: "attempt",
        subjectId: "att-1",
        predicate: "tests_pass",
        exitCode: 0,
      },
      {
        evidenceId: "EVD-2",
        status: "active",
        subjectType: "attempt",
        subjectId: "att-1",
        predicate: "lint_pass",
        exitCode: 0,
      },
    ],
    interpretations: [
      {
        attemptId: "att-1",
        taskId: "task-1",
        workerStatus: "completed",
        summary: "worker believes the shape fix landed",
      },
    ],
    claims: [
      {
        claimId: "CLAIM-1",
        label: "modulation has no gain beyond delay=64",
        status: "CONTRADICTED",
        supportedBy: ["EVD-1"],
        contradictedBy: ["EVD-2"],
      },
    ],
  };
}

describe("context brief compressor (PLMP-CTX-1 P1)", () => {
  it("CTX-A01: facts and interpretations map 1:1 from the projections", () => {
    const brief = compileContextBrief(baseInput());
    expect(brief.facts).toHaveLength(2);
    expect(brief.facts[0]).toEqual({
      evidenceId: "EVD-1",
      status: "active",
      subjectType: "attempt",
      subjectId: "att-1",
      predicate: "tests_pass",
      exitCode: 0,
    });
    expect(brief.interpretations).toHaveLength(1);
    expect(brief.interpretations[0]).toMatchObject({
      attemptId: "att-1",
      workerStatus: "completed",
    });
  });

  it("CTX-A02: the layers never leak into each other", () => {
    const brief = compileContextBrief(baseInput());
    for (const fact of brief.facts) {
      expect("summary" in fact).toBe(false);
      expect("workerStatus" in fact).toBe(false);
    }
    for (const interpretation of brief.interpretations) {
      expect("evidenceId" in interpretation).toBe(false);
      expect("predicate" in interpretation).toBe(false);
    }
  });

  it("CTX-A03: contradicted claims surface with both sides and no blended verdict", () => {
    const brief = compileContextBrief(baseInput());
    expect(brief.conflicts).toHaveLength(1);
    const conflict = brief.conflicts[0]!;
    expect(conflict.claimId).toBe("CLAIM-1");
    expect(conflict.status).toBe("CONTRADICTED"); // R7 verdict copied verbatim
    expect(conflict.supportedBy).toEqual(["EVD-1"]);
    expect(conflict.contradictedBy).toEqual(["EVD-2"]);
    // The compressor generates no blended conclusion text of its own.
    expect(Object.keys(conflict).sort()).toEqual([
      "claimId",
      "contradictedBy",
      "label",
      "status",
      "supportedBy",
    ]);

    // A claim without contradiction never enters the conflict layer.
    const clean = compileContextBrief({
      ...baseInput(),
      claims: [
        {
          claimId: "CLAIM-2",
          label: "supported claim",
          status: "SUPPORTED",
          supportedBy: ["EVD-1"],
          contradictedBy: [],
        },
      ],
    });
    expect(clean.conflicts).toEqual([]);
  });

  it("CTX-A04: the compiler is a pure function of its inputs", () => {
    const input = baseInput();
    expect(JSON.stringify(compileContextBrief(input))).toBe(
      JSON.stringify(compileContextBrief(input)),
    );
  });
});

describe("controller context brief (PLMP-CTX-1 P2)", () => {
  // Single-active-task invariant (ACTIVE/VERIFYING mutually exclusive):
  // task-2 only dispatches after task-1 reaches a terminal state, so the
  // drive is sequential - task-1 fails its budget, task-2 completes.
  async function driveProject(controller: ProjectController): Promise<string[]> {
    controller.start({
      projectId: "scheduler-project",
      goal: "g",
      tasks: [taskSpec("task-1"), taskSpec("task-2")],
    });
    const evidenceIds: string[] = [];
    for (let step = 0; step < 24; step += 1) {
      const event = controller.step();
      if (event === null || event.event_type !== "ATTEMPT_CREATED") continue;
      const attemptId = event.entity_id;
      const isLastTask = evidenceIds.length === 1;
      await controller.claim(attemptId);
      const gateEvent = await controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      evidenceIds.push((gateEvent.payload.evidence as { evidence_id: string }).evidence_id);
      controller.report(attemptId, {
        workerStatus: isLastTask ? "completed" : "failed",
        summary: `self-report for ${attemptId}`,
      });
      if (isLastTask) break;
    }
    if (evidenceIds.length < 2) throw new Error("scheduler never dispatched two attempts");
    return evidenceIds;
  }

  it("CTX-A05: the brief is advisory - no events, no projection drift", async () => {
    const { controller, store, cleanup } = makeRig();
    try {
      await driveProject(controller);
      const eventsBefore = (
        store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as {
          c: number;
        }
      ).c;
      const digestBefore = snapshotDigest(store.connection);

      const brief = controller.contextBrief();
      expect(brief.projectId).toBe("scheduler-project");
      expect(brief.facts).toHaveLength(2);
      expect(brief.facts[0]).toMatchObject({ predicate: "tests_pass", exitCode: 0 });
      expect(brief.interpretations).toHaveLength(2);
      expect(brief.interpretations[0]!.summary).toContain("self-report");

      const eventsAfter = (
        store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as {
          c: number;
        }
      ).c;
      expect(eventsAfter).toBe(eventsBefore);
      expect(snapshotDigest(store.connection)).toBe(digestBefore);
    } finally {
      await cleanup();
    }
  });

  it("CTX-A06: the taskId filter narrows attempts and their evidence, claims stay global", async () => {
    const { controller, cleanup } = makeRig();
    try {
      const evidenceIds = await driveProject(controller);
      controller.claims
        .addNode({ id: "CLAIM-1", kind: "claim", label: "the fix works" })
        .addNode({ id: evidenceIds[0]!, kind: "evidence", label: "gate outcome" })
        .addNode({ id: "EVD-NEG", kind: "evidence", label: "counter outcome" })
        .addEdge(evidenceIds[0]!, "CLAIM-1", "supported_by")
        .addEdge("EVD-NEG", "CLAIM-1", "contradicted_by");

      const briefAll = controller.contextBrief();
      expect(briefAll.interpretations).toHaveLength(2);
      expect(briefAll.facts).toHaveLength(2);
      expect(briefAll.conflicts).toHaveLength(1);

      const scoped = controller.contextBrief({ taskId: "task-1" });
      expect(scoped.interpretations).toHaveLength(1);
      expect(scoped.interpretations[0]!.taskId).toBe("task-1");
      expect(scoped.facts).toHaveLength(1);
      expect(scoped.facts[0]!.subjectId).toBe(scoped.interpretations[0]!.attemptId);
      // Claims are project-level in V0 (the graph has no task dimension).
      expect(scoped.conflicts).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
