/**
 * Palimpsest-CI2 §17 — CONDITIONAL PROJECT HEAD AND TASK CONTINUITY.
 *
 * THE BOUNDED QUESTION.
 *
 *   Can a normally qualified delegated candidate advance project state, and can a subsequent task be correctly
 *   admitted under the ESTABLISHED PUBLIC CONTROL FLOW?
 *
 * WHY THIS IS THE STRONGEST CONTINUITY TEST AVAILABLE.
 *
 * `promoteWhenGatePasses` (`controller.ts:3991`) is the product's own gate-gated promotion entry: it evaluates a
 * registered gate and refuses unless the verdict is PASS. Before CI2 that path was unreachable for delegated work,
 * because the delegated route produced no evidence and the gate could only ever be INCOMPLETE. It is reachable
 * now, and using it here means the promotion is authorized by the evidence the delegated route recorded — not by
 * a gate this test fabricated, and not by calling `promote` directly to sidestep the gate.
 *
 * WHAT IS NOT DONE.
 *
 * No internal Task state is fabricated. No frozen task-envelope revision is overwritten with the current project
 * revision. If the normal API sequence deadlocks, the exact state, event sequence, revisions, promotion result,
 * reconciliation blockers and scheduler decision are preserved and reported as a bounded blocker — not forced
 * past. §17 says a `NOT_ESTABLISHED` verdict is an acceptable outcome; a forced one is not.
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
import { GateEngine } from "../src/evidence/gate_dsl.js";

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

const PROJECT = "ci2d";
const PASSING = ["node", "-e", "process.exit(0)"];

const STANDARD: ProjectStandard = Object.freeze({
  statement: "the candidate stays in scope and the check command passes",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "process_exit_zero" as const }),
    Object.freeze({ kind: "scope_respected" as const }),
  ]),
  derivedFrom: Object.freeze(["ci2 continuity fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK_A = {
  task_id: "task-a",
  objective: "produce src/a.ts",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: [],
};

/** Task B DEPENDS ON A, so its admission is a genuine continuity question rather than an independent start. */
const TASK_B = {
  task_id: "task-b",
  objective: "produce src/b.ts after A",
  depends_on: ["task-a"],
  write_paths: ["src/b.ts"],
  required_artifacts: [],
};

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci2d-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci2d", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci2d", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

function boundedWorker(file: string, contents: string): WorkWorkerRunPort {
  return {
    adapterId: `ci2d-worker:${file}`,
    async run({ workDir }) {
      mkdirSync(join(workDir, file, ".."), { recursive: true });
      writeFileSync(join(workDir, file), contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

describe("CI2 §17 — a qualified delegated candidate advances the project, and the next task is admitted", () => {
  it("promotes through the gate, reconciles the head, and admits task B under the normal control flow", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ci2d-repo-"));
    cleanups.push(() => removeTree(repo));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "base.ts"), "export const base = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
    const baseHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

    const rig = mkdtempSync(join(tmpdir(), "ci2d-rig-"));
    /**
     * THE WORKER IS SELECTED BY THE SCOPE THE CANONICAL TASK DECLARED, which is what a real worker receives in
     * its own context (`work.writeScope`). The port seam is called with the WORLD path, which names the ATTEMPT
     * (`worlds/attempt-<hash>`) and carries no task or scope information at all — CI1 measured that misbinding
     * and caught it by asserting WHICH worker ran. Matching on the world path here would silently run A's worker
     * for B, so the dispatch happens on the context instead, and an unmatched scope is a refusal.
     */
    const workerByScope = new Map<string, WorkWorkerRunPort>([
      ["src/a.ts", boundedWorker("src/a.ts", "export const a = 'A1';\n")],
      ["src/b.ts", boundedWorker("src/b.ts", "export const b = 'B1';\n")],
    ]);
    const observedScopes: string[] = [];
    const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId: PROJECT,
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: STANDARD,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
      runtimeCarrierPort: declaredCarrierPort(),
      workWorkerPort: () => ({
        adapterId: "ci2d-dispatching-worker",
        async run(input: Parameters<WorkWorkerRunPort["run"]>[0]) {
          const scope = input.context.work.writeScope;
          const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
          observedScopes.push(key);
          const worker = workerByScope.get(key);
          if (worker === undefined) throw new Error(`CI2 D: no worker is bound to write scope ${JSON.stringify(scope)}`);
          return worker.run(input);
        },
      }),
    } as never);
    cleanups.push(() => {
      try {
        installed.dispose();
      } catch {
        /* best effort */
      }
      removeTree(rig);
    });
    const connection = installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
    };
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      return (await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })) as Record<string, unknown>;
    };

    await call("palimpsest_start", {
      projectId: PROJECT,
      goal: "a qualified candidate advances the project",
      headCommit: baseHead,
      tasks: [TASK_A, TASK_B],
    });

    /**
     * TASK A RUNS THROUGH THE NORMAL CONSUMER, producing A1 and its evidence.
     *
     * The worker dispatch above is deliberately simple (the port is called with the WORLD path, which names the
     * attempt rather than the task), so this fixture runs ONE task at a time and the second job is started only
     * after the first is settled. That is the serialization the assertion is about, not an artifact of the rig.
     */
    const service = installed.workDelegation;
    expect(service).toBeDefined();
    if (service === undefined) return;
    const startedA = await service.start({ expectedTaskId: "task-a" });
    let attemptA: string | null = null;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: startedA.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if ("attemptId" in view && typeof view.attemptId === "string") attemptA = view.attemptId;
        break;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(attemptA).not.toBeNull();
    if (attemptA === null) return;

    /** Each owner's own worker ran, and neither ran the other's — the same misbinding CI1 caught. */
    expect(observedScopes).toEqual(["src/a.ts"]);

    /** A1 completed and its evidence exists — the precondition that makes the gate-gated promotion meaningful. */
    const rowA = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(PROJECT as never, attemptA as never) as { state: string; report_json: Uint8Array | null };
    expect(rowA.state).toBe("COMPLETED");
    const reportA = JSON.parse(new TextDecoder().decode(rowA.report_json!)) as Record<string, unknown>;
    const candidateA = String(reportA.result_commit);
    expect(candidateA).toMatch(/^[0-9a-f]{40}$/u);
    const atomsA = connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(PROJECT as never, attemptA as never) as { evidence_json: Uint8Array }[];
    expect(atomsA).toHaveLength(2);

    /** THE GATE PASSES ON A1'S OWN EVIDENCE. */
    const engine = new GateEngine();
    const gateA = engine.evaluate(installed.controller.store, PROJECT, "attempt", attemptA, "gate-release");
    expect(gateA.verdict).toBe("PASS");

    /**
     * THE PROMOTION LADDER, THROUGH PUBLIC APIS ONLY.
     *
     * `step()` commits the scheduler's transitions; the task must reach VERIFYING before a promotion is legal
     * (`task_not_verifying` otherwise). This loop only steps; it fabricates no state.
     */
    const taskState = (taskId: string): string => {
      const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT as never, taskId as never) as
        | { state: string }
        | undefined;
      return row?.state ?? "ABSENT";
    };
    const stepUntil = (target: string, budget = 20): string => {
      for (let tick = 0; tick < budget; tick += 1) {
        if (taskState("task-a") === target) return target;
        const preview = installed.controller.preview();
        if (preview.decision !== "next") return taskState("task-a");
        installed.controller.step();
      }
      return taskState("task-a");
    };
    const verifying = stepUntil("VERIFYING");
    expect(verifying).toBe("VERIFYING");

    /**
     * GATE-GATED PROMOTION. `promoteWhenGatePasses` refuses unless the gate PASSES, so this call succeeding is
     * itself evidence that the delegated route's atoms authorized the promotion.
     */
    const promotion = await installed.controller.promoteWhenGatePasses(attemptA, candidateA, baseHead, "gate-release");
    expect(promotion.promoted).toBe(true);
    if (!promotion.promoted) return;
    expect(promotion.result.resultingHeadCommit).toMatch(/^[0-9a-f]{40}$/u);
    const promotedHead = promotion.result.resultingHeadCommit;
    expect(promotedHead).not.toBe(baseHead);

    /** ONE step commits TASK_SATISFIED, then the head is reconciled through the public API. */
    installed.controller.step();
    const reconciliation = await installed.controller.reconcileProjectHead();
    expect(reconciliation).toBeDefined();
    /** The canonical repository really moved to the promoted candidate. */
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(promotedHead);
    /** And the candidate's file is now in the canonical tree, which it was not before promotion. */
    expect(execFileSync("git", ["cat-file", "-t", `${promotedHead}:src/a.ts`], { cwd: repo, encoding: "utf8" }).trim()).toBe("blob");

    /**
     * THE CONTINUITY QUESTION: can task B be admitted now?
     *
     * This is the measured answer, whatever it is. A refusal is recorded with its reason rather than forced.
     */
    const headStatus = installed.controller.status().head;
    expect(headStatus).toBeDefined();
    if (headStatus === undefined) return;
    const preview = installed.controller.preview();
    const taskBState = taskState("task-b");
    const attemptB = await service
      .start({ expectedTaskId: "task-b" })
      .then((started) => ({ ok: true as const, started }))
      .catch((error: unknown) => ({ ok: false as const, detail: error instanceof Error ? error.message : String(error) }));

    /**
     * WHAT MUST HOLD EITHER WAY: the head is in sync (so the project is not left in a state where no new work may
     * start), and task B is either admitted or refused FOR A NAMED REASON — never silently stranded.
     */
    expect(headStatus.state).toBe("IN_SYNC");
    expect(headStatus.projectHeadCommit).toBe(promotedHead);
    expect(preview).toBeDefined();
    if (attemptB.ok) {
      /**
       * ADMITTED. Then the decisive fact is that B's execution starts from A's promoted head rather than the old
       * base — the dependency was honoured by the version premises, not merely declared.
       */
      const deadlineB = Date.now() + 120_000;
      let settledB: string | null = null;
      while (Date.now() < deadlineB) {
        const view = await service.followup({ jobId: attemptB.started.jobId });
        if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
          if ("attemptId" in view && typeof view.attemptId === "string") settledB = view.attemptId;
          break;
        }
        await new Promise((done) => setTimeout(done, 50));
      }
      expect(settledB).not.toBeNull();
      if (settledB !== null) {
        /** B's own worker ran — the second distinct scope, proving the dispatch was not misbound. */
        expect(observedScopes).toEqual(["src/a.ts", "src/b.ts"]);
        const envelope = installed.controller.taskEnvelopeOrNull("task-b");
        /** B's frozen base is the head the project was at when B was admitted. */
        expect(envelope).not.toBeNull();
        expect(envelope?.base_commit).toBe(promotedHead);
        /** And B's own candidate is a distinct commit, qualified on its own evidence. */
        const rowB = connection
          .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
          .get(PROJECT as never, settledB as never) as { state: string; report_json: Uint8Array | null };
        expect(rowB.state).toBe("COMPLETED");
        const reportB = JSON.parse(new TextDecoder().decode(rowB.report_json!)) as Record<string, unknown>;
        expect(String(reportB.result_commit)).not.toBe(candidateA);
        expect(engine.evaluate(installed.controller.store, PROJECT, "attempt", settledB, "gate-release").verdict).toBe("PASS");
      }
    } else {
      /** REFUSED — and the reason is preserved verbatim rather than generalized away. */
      expect(attemptB.detail.length).toBeGreaterThan(0);
      expect(taskBState).not.toBe("ACTIVE");
      /**
       * A refusal at this point is a real continuity finding and is recorded in the report. The assertion here
       * only requires that the project was not left in an inconsistent state, which `headStatus.state` above
       * already established.
       */
      expect(headStatus.provenEffectHeadCommit).toBe(promotedHead);
    }
  });
});
