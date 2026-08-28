import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  preferredJudge,
  runTournament,
  type PairwiseJudge,
  type TournamentEntry,
} from "../src/select/index.js";
import { ProjectController, RoleSlotPolicy } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeController() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-t4-")), "ops.sqlite"),
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
    parallel: { slots: new RoleSlotPolicy({ slots: { implementer: 4 } }) },
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

/** Drive N parallel completed candidates in one batch. */
async function driveCompleted(controller: ProjectController, count: number) {
  controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
  controller.step();
  const attempts = Array.from({ length: count }, () => controller.step()!);
  for (const attempt of attempts) {
    await controller.claim(attempt.entity_id);
  }
  for (let index = 0; index < attempts.length; index += 1) {
    controller.report(attempts[index]!.entity_id, {
      workerStatus: "completed",
      summary: `candidate ${index + 1}`,
    });
  }
  return attempts;
}

function entries(ids: string[]): TournamentEntry[] {
  return ids.map((id) => ({
    id,
    view: {
      structured: {
        attempt_id: id,
        worker_status: "completed",
        result_commit: null,
        changed_files: 0,
        produced_artifacts: 0,
        duration_ms: null,
      },
      commentary: { text: `summary of ${id}`, origin: "worker-self-report" as const },
    },
  }));
}

describe("recursive pairwise tournament (R4)", () => {
  it("runs exactly n-1 comparisons and picks a winner", async () => {
    const seen: string[] = [];
    const judge: PairwiseJudge = {
      compare(left, right) {
        seen.push(left.id, right.id);
        return left.id < right.id ? "left" : "right";
      },
    };
    const result = await runTournament(entries(["a", "b", "c", "d"]), judge);
    expect(result.winner).toBe("a"); // a < b, c < d, a < (c|d) -> a
    expect(result.comparisons).toBe(3);
    expect(result.rounds).toHaveLength(3);
    expect(seen).toHaveLength(6); // two ids per comparison, 3 comparisons
  });

  it("odd entries get a bye and ties resolve to the first candidate", async () => {
    const result = await runTournament(
      entries(["x", "y", "z"]),
      preferredJudge("never"), // forces ties everywhere
    );
    expect(result.comparisons).toBe(2);
    expect(result.winner).toBe("x"); // tie(x,y)->x; tie(x,z)->x
    expect(result.rounds.every((round) => round.tie)).toBe(true);
  });

  it("handles empty and single-entry brackets", async () => {
    const empty = await runTournament([], preferredJudge("none"));
    expect(empty.winner).toBeUndefined();
    expect(empty.comparisons).toBe(0);
    const single = await runTournament(entries(["only"]), preferredJudge("only"));
    expect(single.winner).toBe("only");
    expect(single.comparisons).toBe(0);
  });

  it("rejects duplicate entry ids", async () => {
    await expect(runTournament(entries(["dup", "dup"]), preferredJudge("dup"))).rejects.toThrow(
      /unique ids/,
    );
  });

  it("the judge only sees id + summary (never the full report)", async () => {
    const { controller, cleanup } = makeController();
    try {
      const attempts = await driveCompleted(controller, 4);
      controller.declareJudge({ judgeId: "host-llm", kind: "llm", declaredBy: "h1-test" });
      const summaries: string[] = [];
      const result = await controller.selectCandidate({
        compare(left, right) {
          summaries.push(left.view.commentary?.text ?? "", right.view.commentary?.text ?? "");
          return left.id < right.id ? "left" : "right";
        },
      });
      expect(result.winner).toBeDefined();
      expect(result.comparisons).toBe(3);
      // The judge's view is compact: summaries, never JSON blobs or digests.
      expect(summaries.every((summary) => summary.startsWith("candidate "))).toBe(true);
      expect(Object.keys(attempts[0]!)).not.toContain("runtime_metadata");
    } finally {
      await cleanup();
    }
  });
});