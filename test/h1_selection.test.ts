import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { SUMMARY_JUDGE_CAP, SUMMARY_STORE_CAP } from "../src/select/declared.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-h1sel-")), "ops.sqlite"),
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
      attempt_limit: 8,
      candidate_limit: 4,
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

async function driveCompleted(controller: ProjectController, count: number, summary: string) {
  const attempts = Array.from({ length: count }, () => controller.step()!);
  for (const attempt of attempts) {
    await controller.claim(attempt.entity_id);
  }
  for (let index = 0; index < attempts.length; index += 1) {
    controller.report(attempts[index]!.entity_id, {
      workerStatus: "completed",
      summary: summary.replaceAll("{n}", String(index + 1)),
    });
  }
  return attempts;
}

function declareWideSlots(controller: ProjectController): void {
  controller.declareRoleTable({
    roles: [
      { role: "implementer", slots: 4 },
      { role: "tester", slots: 1 },
      { role: "verifier", slots: 1 },
      { role: "scout", slots: 2 },
      { role: "analyst", slots: 2 },
    ],
    hardCap: 20,
    declaredBy: "h1-test",
  });
}

describe("H1-C: declared-judge selection (spec 3.3)", () => {
  it("H1-C1: a declared rubric judge is deterministic and replayable across identical rigs", async () => {
    const winners: string[] = [];
    for (let run = 0; run < 2; run += 1) {
      const { store, controller, cleanup } = makeRig();
      try {
        controller.start({
          projectId: "scheduler-project",
          goal: "g",
          tasks: [taskSpec("task-1")],
        });
        declareWideSlots(controller);
        controller.step();
        await driveCompleted(controller, 3, "candidate {n}");
        controller.declareJudge({ judgeId: "rubric-v1", kind: "rubric", declaredBy: "h1-test" });
        const result = await controller.selectCandidate();
        expect(result.winner).toBeDefined();
        winners.push(result.winner!);
        const row = store.connection
          .prepare(
            "SELECT attempt_id, replayable FROM selections WHERE project_id=? ORDER BY last_event_id DESC LIMIT 1",
          )
          .get("scheduler-project") as { attempt_id: string; replayable: number } | undefined;
        expect(row).toBeDefined();
        expect(row!.replayable).toBe(1);
        expect(row!.attempt_id).toBe(result.winner);
      } finally {
        await cleanup();
      }
    }
    expect(winners[0]).toBe(winners[1]);
  });

  it("H1-C2: selection without a declared judge fails closed (the tie-judge default is gone)", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.step();
      await driveCompleted(controller, 2, "candidate {n}");
      await expect(controller.selectCandidate()).rejects.toThrow(DomainValidationError);
      await expect(controller.selectCandidate()).rejects.toThrow(/no selection judge declared/);
    } finally {
      await cleanup();
    }
  });

  it("H1-C3: the decision is event-sourced with rounds and the judge reference", async () => {
    const { store, controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      declareWideSlots(controller);
      controller.step();
      await driveCompleted(controller, 3, "candidate {n}");
      controller.declareJudge({ judgeId: "host-llm", kind: "llm", declaredBy: "h1-test" });
      const result = await controller.selectCandidate({
        compare(left, right) {
          return left.id < right.id ? "left" : "right";
        },
      });
      const row = store.connection
        .prepare("SELECT payload_json FROM events WHERE event_type='CANDIDATE_SELECTED'")
        .get() as { payload_json: Uint8Array };
      const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as {
        rounds: Array<{ left: string; right: string; winner: string; tie: boolean }>;
        judge: { id: string; kind: string; replayable: boolean };
        winner: string | null;
        candidates: string[];
      };
      expect(payload.rounds).toHaveLength(result.comparisons);
      expect(payload.judge).toMatchObject({ id: "host-llm", kind: "llm", replayable: false });
      expect(payload.candidates).toHaveLength(3);
      expect(payload.winner).toBe(result.winner ?? null);
    } finally {
      await cleanup();
    }
  });

  it("H1-C4: the worker summary is capped at store and judge boundaries", async () => {
    const { store, controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      declareWideSlots(controller);
      controller.step();
      const attempts = await driveCompleted(controller, 2, "x".repeat(5000));
      controller.declareJudge({ judgeId: "host-llm", kind: "llm", declaredBy: "h1-test" });
      let seen: number | null = null;
      await controller.selectCandidate({
        compare(left) {
          seen = left.view.commentary === null ? 0 : left.view.commentary.text.length;
          return "tie" as const;
        },
      });
      // The stored report is capped at the store cap...
      const row = store.connection
        .prepare("SELECT report_json FROM attempts WHERE attempt_id=?")
        .get(attempts[0]!.entity_id) as { report_json: Uint8Array };
      const report = JSON.parse(new TextDecoder().decode(row.report_json)) as { summary: string };
      expect(report.summary.length).toBe(SUMMARY_STORE_CAP);
      // ...and the judge view at the judge cap.
      expect(seen).toBe(SUMMARY_JUDGE_CAP);
    } finally {
      await cleanup();
    }
  });
});
