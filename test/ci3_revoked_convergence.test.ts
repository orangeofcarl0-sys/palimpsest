/**
 * CI3 §16 — THE ONE REPRODUCED DEFECT, AS A FALSIFIER.
 *
 * THE ASYMMETRY.
 *
 * Two different lookups answer "is this observation already recorded":
 *
 *   the delegated route   SELECT … FROM evidence  WHERE … predicate=? AND status='active'   (controller.ts)
 *   the shared writer     SELECT … FROM events    WHERE idempotency_key=?                   (work_evidence.ts)
 *
 * They disagree in exactly one situation: after an atom's authority has been REVOKED. The route then sees
 * "nothing active", decides to record, and hands the write to the writer — which finds the same key in the
 * log and returns the STALE event as if it were the observation just taken.
 *
 * THE CONSEQUENCE THIS MEASURES.
 *
 * Whether a settlement can therefore report `PASSED` while writing no atom at all and leaving every atom
 * stale. If it can, the settlement is claiming a qualification that does not exist — a false claim about
 * authority, even though the Gate itself still refuses.
 *
 * This file is a FALSIFIER: it asserts the CORRECT behaviour, so it fails on a tree where the defect is
 * present and passes once the writer refuses to converge on a revoked atom.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
}, 180_000);

function removeTree(path: string): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      /* a live handle; retry after the child closes */
    }
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* left in place */
  }
}

const PASSING = ["node", "-e", "process.exit(0)"];

const STANDARD: ProjectStandard = Object.freeze({
  statement: "the artifact exists, the scope is respected and the check command passes",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "process_exit_zero" as const }),
    Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/a.ts"]) }),
    Object.freeze({ kind: "scope_respected" as const }),
  ]),
  derivedFrom: Object.freeze(["ci3 revoked-convergence fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [] as string[],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function worker(): WorkWorkerRunPort {
  return {
    adapterId: "ci3-revoked-worker",
    async run(input) {
      const scope = input.context.work.writeScope;
      const file = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "src/a.ts";
      mkdirSync(join(input.workDir, file, ".."), { recursive: true });
      writeFileSync(join(input.workDir, file), "export const a = 1;\n");
      execFileSync("git", ["add", "-A"], { cwd: input.workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: input.workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

describe("CI3 §16 — a settlement after revocation must not report a qualification it did not produce", () => {
  it("re-settling a revoked attempt refuses rather than reporting PASSED with zero new atoms", async () => {
    const projectId = "ci3rev";
    const repo = mkdtempSync(join(tmpdir(), "ci3rev-repo-"));
    cleanups.push(() => removeTree(repo));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, "README.md"), "# baseline\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const rigDir = mkdtempSync(join(tmpdir(), "ci3rev-rig-"));
    const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId,
      databasePath: join(rigDir, "p.sqlite"),
      ordariumDatabasePath: join(rigDir, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: STANDARD,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
      runtimeCarrierPort: callbackRuntimeCarrierPort("ci3rev-carrier", {
        onRealize: async (request) => ({
          runtimeAgent: { runtimeAdapter: "ci3rev", agentId: `agent-${request.activationId}` },
          session: { runtimeAdapter: "ci3rev", sessionId: `session-${request.activationId}` },
        }),
        onRelease: async () => undefined,
      }),
      workWorkerPort: () => worker(),
    } as never);
    cleanups.push(() => {
      try {
        installed.dispose();
      } catch {
        /* best effort */
      }
      removeTree(rigDir);
    });

    const connection = installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
    };
    const startTool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    expect(startTool).toBeDefined();
    if (startTool === undefined) return;
    await startTool.execute(
      { projectId, goal: "revoked convergence", headCommit: head, tasks: [TASK] },
      { callId: "c", rootCallId: "r", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );

    const service = installed.workDelegation;
    expect(service).toBeDefined();
    if (service === undefined) return;
    const started = await service.start({ expectedTaskId: TASK.task_id });
    let attemptId: string | null = null;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if ("attemptId" in view && typeof view.attemptId === "string") attemptId = view.attemptId;
        break;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(attemptId).not.toBeNull();
    if (attemptId === null) return;

    const countByStatus = (status: string): number => {
      const row = connection
        .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status=?")
        .get(projectId as never, attemptId as never, status as never) as { n: number };
      return Number(row.n);
    };
    expect(countByStatus("active")).toBe(3);

    /**
     * THE REVOCATION. A typed invalidation retires the task under the live attempt, so every atom bound to
     * that attempt loses authority while the attempt itself is untouched.
     */
    installed.controller.planReconciled({
      tasks: [
        { ...TASK, task_id: "task-a" },
        { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] },
      ],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });
    expect(countByStatus("stale")).toBe(3);
    expect(countByStatus("active")).toBe(0);
    const eventsBefore = Number(
      (connection.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type='EVIDENCE_ADDED'").get(projectId as never) as {
        n: number;
      }).n,
    );

    /**
     * THE FALSIFIER. A second settlement of the same attempt must NOT report a successful qualification:
     * its evidence no longer carries authority, so there is nothing to converge onto and nothing new to
     * record. Reporting `PASSED` here would be a claim about authority that the ledger contradicts.
     */
    const settlement = await installed.controller
      .settleMutatingWork({ attemptId, workerOutcome: { kind: "READY_FOR_SETTLEMENT" } })
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({ ok: false as const, detail: error instanceof Error ? error.message : String(error) }));

    if (settlement.ok) {
      /**
       * IF IT RAN AT ALL, it must not have claimed qualification. The only honest outcomes are a refusal
       * (`NOT_READY` with a reason) or a genuinely NEW qualification, which would require new atoms.
       */
      expect(settlement.result).not.toHaveProperty("evidenceRecorded");
      if ("reason" in settlement.result) {
        expect(String(settlement.result.reason)).toMatch(/COMPLETION_|CANDIDATE_|WORLD_|NOT_READY|UNCOMMITTED|NO_WORK|OUT_OF_SCOPE|RESULT_/u);
      }
    } else {
      expect(settlement.detail.length).toBeGreaterThan(0);
    }

    /** AND THE INVARIANT EITHER WAY: no atom gained authority, and nothing new was appended. */
    expect(countByStatus("active")).toBe(0);
    expect(countByStatus("stale")).toBe(3);
    const eventsAfter = Number(
      (connection.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type='EVIDENCE_ADDED'").get(projectId as never) as {
        n: number;
      }).n,
    );
    expect(eventsAfter).toBe(eventsBefore);
    /** The Gate still refuses, which is the safety half that already held. */
    expect(installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");
  }, 180_000);
});
