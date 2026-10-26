/**
 * CI3 §12 — FRESH QUALIFICATION AFTER STALENESS (THE MANDATORY POSITIVE CAPABILITY).
 *
 * THE QUESTION.
 *
 *   If the product can refuse a stale qualification (measured in `ci3_promotion_authority.test.ts`), can a
 *   legitimate candidate ever get a NEW applicable PASS under the current conditions and promote? A system
 *   that only ever says NO is fail-closed but not live, and §12 makes this the difference between a
 *   qualified CI3 and an incomplete one.
 *
 * WHY THIS ROUTE AND NOT ANOTHER.
 *
 * The product offers no "re-evaluate this attempt" operation, and CI3 must not invent one. What it offers
 * is: a new TASK, a new ATTEMPT, a new candidate, its own completion evaluation, and its own evidence. That
 * is the documented mechanism (§12: "If the current product requires a new Attempt or a separate evaluation
 * operation, use that documented mechanism"), and this test walks it end to end:
 *
 *   1 candidate A1 qualifies under revision N            → real atoms, real Gate PASS
 *   2 an authorized revision retires A1's work           → A1's atoms are stale, its PASS is gone
 *   3 E1 remains available in history                    → same evidence ids, same bytes, still attributable
 *   4 a NEW evaluation runs under the current context    → a real worker, a real evaluator, real commands
 *   5 new applicable evidence is durably recorded        → new ids, its own candidate identity
 *   6 the normal Gate passes on the NEW evidence         → not on the old atoms
 *   7 promotion succeeds under current head authority    → and the head advances
 *
 * The old PASS is NEVER consulted for the new candidate, and the new PASS is never written over the old
 * record. Both facts are asserted against the database, not inferred.
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
import { candidateDependencyDigest } from "../src/work/completion_evaluation.js";

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
  derivedFrom: Object.freeze(["ci3 requalification fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK_A = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [] as string[],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

const TASK_B = {
  task_id: "task-b",
  objective: "write src/a.ts again under the current conditions, after A's work was retired",
  depends_on: [] as string[],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function worker(bodies: readonly string[]): WorkWorkerRunPort {
  let invocation = 0;
  return {
    adapterId: "ci3-requal-worker",
    async run(input) {
      const body = bodies[Math.min(invocation, bodies.length - 1)]!;
      invocation += 1;
      const scope = input.context.work.writeScope;
      const file = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "src/a.ts";
      mkdirSync(join(input.workDir, file, ".."), { recursive: true });
      writeFileSync(join(input.workDir, file), body);
      execFileSync("git", ["add", "-A"], { cwd: input.workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: input.workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

describe("CI3 §12 — a candidate can regain applicable qualification after its old evidence expired", () => {
  it("retires A1, keeps its history, qualifies a new candidate on its own evidence, and promotes it", async () => {
    const projectId = "ci3d";
    const repo = mkdtempSync(join(tmpdir(), "ci3d-repo-"));
    cleanups.push(() => removeTree(repo));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, "README.md"), "# baseline\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
    const baseHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const rigDir = mkdtempSync(join(tmpdir(), "ci3d-rig-"));
    /**
     * ONE worker instance for the whole project.
     *
     * The worker factory is invoked per delegation, so a factory that built a NEW worker each time would
     * reset its invocation counter and hand the second attempt the FIRST body — which is exactly how this
     * fixture first produced a candidate whose content was A1's. Sharing the instance is what makes the two
     * attempts genuinely different work.
     */
    const sharedWorker = worker(["export const a = 'A1';\n", "export const a = 'B1';\n"]);
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
      runtimeCarrierPort: callbackRuntimeCarrierPort("ci3d-carrier", {
        onRealize: async (request) => ({
          runtimeAgent: { runtimeAdapter: "ci3d", agentId: `agent-${request.activationId}` },
          session: { runtimeAdapter: "ci3d", sessionId: `session-${request.activationId}` },
        }),
        onRelease: async () => undefined,
      }),
      workWorkerPort: () => sharedWorker,
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
    const call = async (name: string, args: Record<string, unknown>): Promise<void> => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      });
    };
    const runTask = async (taskId: string): Promise<string> => {
      const service = installed.workDelegation;
      if (service === undefined) throw new Error("no work delegation service");
      const started = await service.start({ expectedTaskId: taskId });
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const view = await service.followup({ jobId: started.jobId });
        if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
          if (!("attemptId" in view) || typeof view.attemptId !== "string") throw new Error("no attempt id");
          return view.attemptId;
        }
        await new Promise((done) => setTimeout(done, 50));
      }
      throw new Error(`${taskId} did not settle`);
    };
    const atomsOf = (attemptId: string): Array<{ status: string; atom: Record<string, unknown> }> => {
      const rows = connection
        .prepare("SELECT status, evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? ORDER BY evidence_id")
        .all(projectId as never, attemptId as never) as Array<{ status: string; evidence_json: Uint8Array }>;
      return rows.map((row) => ({
        status: row.status,
        atom: JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>,
      }));
    };
    const candidateOf = (attemptId: string): string => {
      const row = connection
        .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(projectId as never, attemptId as never) as { report_json: Uint8Array };
      return String((JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>).result_commit);
    };
    const taskState = (taskId: string): string => {
      const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(projectId as never, taskId as never) as
        | { state: string }
        | undefined;
      return row?.state ?? "ABSENT";
    };

    /** (1) A1 QUALIFIES under revision 0, through the real delegated route. */
    await call("palimpsest_start", {
      projectId,
      goal: "a retired candidate's work must be re-evaluable under current conditions",
      headCommit: baseHead,
      tasks: [TASK_A, TASK_B],
    });
    const attemptA = await runTask("task-a");
    const candidateA = candidateOf(attemptA);
    expect(candidateA).toMatch(/^[0-9a-f]{40}$/u);
    const atomsA = atomsOf(attemptA);
    expect(atomsA).toHaveLength(3);
    expect(atomsA.every((row) => row.status === "active")).toBe(true);
    const gateA = installed.controller.evaluateGate("gate-release", "attempt", attemptA);
    expect(gateA.verdict).toBe("PASS");

    /**
     * (2) AN AUTHORIZED REVISION RETIRES A1's WORK.
     *
     * `planReconciled` with a typed invalidation is the product's own settlement act: it stales the task
     * and revokes the evidence that gave its work gate authority, in ONE batch. `task-b` is retained and
     * becomes READY. This is the ONLY way to reach a fresh evaluation, and it is the documented mechanism.
     */
    const outcome = installed.controller.planReconciled({
      tasks: [TASK_A, TASK_B],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });
    expect(outcome.result.revision).toBe(1);
    expect(taskState("task-a")).toBe("STALE");
    expect(taskState("task-b")).toBe("READY");

    /** (3) E1 SURVIVES: the same ids, the same bytes, and they still name candidate A. */
    const afterStale = atomsOf(attemptA);
    expect(afterStale).toHaveLength(3);
    expect(afterStale.map((row) => row.atom.evidence_id)).toEqual(atomsA.map((row) => row.atom.evidence_id));
    expect(afterStale.map((row) => row.atom)).toEqual(atomsA.map((row) => row.atom));
    for (const row of afterStale) {
      expect(row.status).toBe("stale");
      expect((row.atom.value as Record<string, unknown>).result_commit).toBe(candidateA);
    }
    /** And the old qualification no longer authorizes anything. */
    expect(installed.controller.evaluateGate("gate-release", "attempt", attemptA).verdict).toBe("INCOMPLETE");

    /**
     * (4) A GENUINE NEW EVALUATION, under the current revision, by a NEW attempt on the retained task.
     *
     * The worker runs again and the evaluator runs the contract's checks again; nothing is copied from A.
     */
    const verifying = (() => {
      for (let tick = 0; tick < 40; tick += 1) {
        const preview = installed.controller.preview();
        if (preview.decision === "next" && preview.eventType === "TASK_STARTED" && preview.entityId === "task-b") return true;
        if (preview.decision !== "next") return false;
        installed.controller.step();
      }
      return false;
    })();
    expect(verifying).toBe(true);
    const attemptB = await runTask("task-b");
    expect(attemptB).not.toBe(attemptA);
    const candidateB = candidateOf(attemptB);
    expect(candidateB).not.toBe(candidateA);

    /** (5) NEW APPLICABLE EVIDENCE: new ids, its own candidate identity, its own evaluation. */
    const atomsB = atomsOf(attemptB);
    expect(atomsB).toHaveLength(3);
    expect(atomsB.every((row) => row.status === "active")).toBe(true);
    const idsA = new Set(atomsA.map((row) => String(row.atom.evidence_id)));
    const idsB = new Set(atomsB.map((row) => String(row.atom.evidence_id)));
    expect([...idsB].filter((id) => idsA.has(id))).toEqual([]);
    const treeB = execFileSync("git", ["rev-parse", `${candidateB}^{tree}`], { cwd: repo, encoding: "utf8" }).trim();
    const digestB = candidateDependencyDigest({ baseCommit: baseHead, resultCommit: candidateB, candidateTree: treeB });
    for (const row of atomsB) {
      expect(row.atom.dependency_digest).toBe(digestB);
      expect((row.atom.value as Record<string, unknown>).result_commit).toBe(candidateB);
      expect(row.atom.producer).toBe("palimpsest-delegated-settlement");
    }
    /** The old evidence is still stale: the new qualification is ADDITIVE, never a rewrite. */
    expect(atomsOf(attemptA).every((row) => row.status === "stale")).toBe(true);

    /** (6) THE NORMAL GATE PASSES — on the new evidence, for the new subject. */
    const gateB = installed.controller.evaluateGate("gate-release", "attempt", attemptB);
    expect(gateB.verdict).toBe("PASS");
    expect([...gateB.evidence_used].sort()).toEqual([...idsB].sort());
    expect(gateB.evidence_used).not.toContain([...idsA][0]);

    /**
     * (7) PROMOTION SUCCEEDS under the current head authority, and the head actually advances.
     *
     * The task must be VERIFYING first, exactly as in the CI2 continuity ladder; nothing here fabricates
     * that state.
     */
    for (let tick = 0; tick < 40 && taskState("task-b") !== "VERIFYING"; tick += 1) {
      if (installed.controller.preview().decision !== "next") break;
      installed.controller.step();
    }
    expect(taskState("task-b")).toBe("VERIFYING");
    const promotion = await installed.controller.promoteWhenGatePasses(attemptB, candidateB, baseHead, "gate-release");
    expect(promotion.promoted).toBe(true);
    if (!promotion.promoted) return;
    const promotedHead = promotion.result.resultingHeadCommit;
    /**
     * THE PROMOTION IS A MERGE, so the resulting head is the merge commit — not the candidate id. The
     * candidate is its parent, and the candidate's tree is what the canonical branch now contains. Asserting
     * equality with `candidateB` would be asserting the wrong mechanism.
     */
    expect(promotedHead).not.toBe(baseHead);
    expect(promotedHead).toMatch(/^[0-9a-f]{40}$/u);
    expect(promotedHead).not.toBe(candidateB);
    /** The candidate is an ancestor of the promoted head, so its content really landed. */
    expect(() =>
      execFileSync("git", ["merge-base", "--is-ancestor", candidateB, promotedHead], { cwd: repo, stdio: "ignore" }),
    ).not.toThrow();
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(promotedHead);
    /** The retired candidate NEVER became canonical: its content was never the baseline. */
    expect(baseHead).not.toBe(promotedHead);
    expect(execFileSync("git", ["show", `${promotedHead}:src/a.ts`], { cwd: repo, encoding: "utf8" })).toBe("export const a = 'B1';\n");
  }, 180_000);
});
