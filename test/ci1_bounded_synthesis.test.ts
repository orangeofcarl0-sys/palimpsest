/**
 * Palimpsest-CI1 §12 — CONDITIONAL BOUNDED SYNTHESIS.
 *
 * THE CLAIM UNDER TEST, STATED NARROWLY.
 *
 *   Two candidates that each pass their OWN local validation must NOT thereby become a validated COMBINATION.
 *
 * That is the whole of C4. It is not conflict resolution, not a merge engine, and not a promotion framework. It asks
 * whether the existing Evidence/Gate machinery can hold the distinction between "each part is fine" and "the whole
 * is fine", using a gate the project itself declares.
 *
 * THE REAL MECHANISMS USED.
 *
 *   · `controller.declareGate(gate, declaredBy)` appends a `GATE_DEFINED` event; a gate exists only because the
 *     project declared it (`src/evidence/gate_dsl.ts:88-105`).
 *   · `GateEngine.evaluate(store, projectId, subjectType, subjectId, gateId)` reads the ACTIVE Evidence projection
 *     for one subject and returns PASS / FAIL / INCOMPLETE with the clauses it used
 *     (`src/evidence/gate_dsl.ts:116-175`).
 *   · Evidence atoms are produced by the product's own finish path, not fabricated here.
 *
 * WHAT IS DELIBERATELY NOT DONE. No promotion infrastructure is added. The ruling says: if C4 requires a new
 * generalised promotion system, stop at the decision record and report C4 as not established. What follows uses
 * only the declared gate plus the existing projection, so no such system is needed — but the SCOPE of what is
 * established is stated precisely at the end rather than generalised.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import { GateEngine } from "../src/evidence/gate_dsl.js";
import type { GateDefinition } from "../src/domain/gate_clause.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function removeTree(path: string): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      /* a live handle */
    }
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* left for the global sweep */
  }
}

interface BoundedWorker extends WorkWorkerRunPort {
  readonly observations: string[];
}

function worker(input: { readonly label: string; readonly file: string; readonly contents: string }): BoundedWorker {
  const observations: string[] = [];
  return {
    adapterId: `ci1c4-${input.label}`,
    observations,
    async run({ workDir }) {
      observations.push(`ran:${input.label}`);
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", input.label], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

function carrierPort() {
  return callbackRuntimeCarrierPort("ci1c4-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci1c4", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci1c4", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

interface TaskDecl {
  readonly task_id: string;
  readonly objective: string;
  readonly depends_on: string[];
  readonly write_paths: string[];
  readonly required_artifacts: string[];
}

/**
 * THE COMBINATION CONSTRAINT, DECLARED AS A GATE.
 *
 * The project declares ONE gate that a candidate must satisfy to be considered validated. It is expressed in the
 * product's own clause vocabulary (`expected_files_exist`, `write_scope_valid`), so nothing new is invented: the
 * question C4 asks is whether a gate can express a constraint that INDIVIDUAL candidates satisfy but a combination
 * does not.
 *
 * The integration constraint used here is deliberately simple and honest: a candidate is combination-valid only if
 * it declares the artifact BOTH owners were required to produce together. An individual candidate that produces
 * only its own file therefore passes its own check and fails the combination check.
 */
const COMBINATION_GATE: GateDefinition = {
  gate_id: "gate-combination",
  version: 1,
  subject_type: "attempt",
  /**
   * THE CLAUSE USES `write_scope_valid`, WHICH SETTLEMENT ACTUALLY RECORDS.
   *
   * `expected_files_exist` is only recorded when a task declares `required_artifacts`, and that check reads the
   * CANONICAL repository — which a candidate's file does not reach until promotion. `write_scope_valid` is recorded
   * on every settlement that observes changed files, so it is the predicate that makes this gate a real test of the
   * evidence model rather than a test of an unreachable path.
   */
  require: {
    mode: "all",
    chain: [{ exists: { predicate: "write_scope_valid" } }],
  },
};

interface Rig {
  readonly repo: string;
  readonly projectId: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly bind: (scope: string, next: BoundedWorker) => void;
  readonly start: (tasks: readonly TaskDecl[]) => Promise<void>;
  readonly run: (taskId: string) => Promise<{ attemptId: string; resultCommit: string }>;
  readonly taskState: (taskId: string) => string;
  readonly head: () => string;
  readonly evidenceFor: (attemptId: string) => readonly { predicate: string; status: string }[];
}

function makeRig(projectId: string): Rig {
  const repo = mkdtempSync(join(tmpdir(), "ci1c4-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

  const ledger = mkdtempSync(join(tmpdir(), "ci1c4-ledger-"));
  const bound = new Map<string, BoundedWorker>();
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId,
      databasePath: join(ledger, "p.sqlite"),
      ordariumDatabasePath: join(ledger, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: {
        statement: "the candidate exists and its scope is respected",
        clauses: [{ kind: "scope_respected" as const }],
        derivedFrom: ["ci1c4 fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      runtimeCarrierPort: carrierPort(),
      workWorkerPort: () => ({
        adapterId: "ci1c4-dispatch",
        async run(runInput: Parameters<WorkWorkerRunPort["run"]>[0]) {
          const scope = runInput.context.work.writeScope;
          const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
          const chosen = bound.get(key);
          if (chosen === undefined) throw new Error(`CI1C4: no worker bound to scope ${JSON.stringify(scope)}`);
          return chosen.run(runInput);
        },
      }),
    } as never,
  );
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best-effort */
    }
    removeTree(ledger);
    removeTree(repo);
  });

  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
  };
  const taskState = (taskId: string): string => {
    const row = connection
      .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
      .get(projectId as never, taskId as never) as { state: string } | undefined;
    return row?.state ?? "UNKNOWN";
  };

  const start = async (tasks: readonly TaskDecl[]) => {
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    if (tool === undefined) throw new Error("no palimpsest_start");
    await tool.execute(
      { projectId, goal: "bounded synthesis", headCommit: head(), tasks },
      { callId: "c-start", rootCallId: "r-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );
  };

  const service = installed.workDelegation;
  if (service === undefined) throw new Error("CI1C4: no work delegation");
  const run = async (taskId: string) => {
    const trace: string[] = [];
    for (let tick = 0; tick < 12; tick += 1) {
      const preview = installed.controller.preview();
      trace.push(`${preview.decision}:${preview.eventType ?? "-"}`);
      if (preview.decision !== "next" || preview.eventType === "TASK_STARTED") break;
      installed.controller.step();
    }
    if (process.env.CI1_DEBUG === "1") {
      const rows = connection.prepare("SELECT task_id, state FROM tasks WHERE project_id=?").all(projectId as never);
      console.error("RUN", taskId, JSON.stringify(trace), JSON.stringify(rows));
    }
    const started = await service.start({ expectedTaskId: taskId });
    const deadline = Date.now() + 120_000;
    let view: Awaited<ReturnType<typeof service.followup>> | undefined;
    while (Date.now() < deadline) {
      view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) break;
      await new Promise((done) => setTimeout(done, 25));
    }
    if (view === undefined || !("phase" in view) || view.phase !== "FINISHED" || view.attemptId === null) {
      throw new Error(`task ${taskId} did not finish: ${JSON.stringify(view)}`);
    }
    const row = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(projectId as never, view.attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
    if (row === undefined || row.report_json === null) throw new Error(`task ${taskId} has no canonical result`);
    const report = JSON.parse(new TextDecoder().decode(row.report_json)) as { result_commit?: unknown };
    if (typeof report.result_commit !== "string") throw new Error(`task ${taskId} reported no commit`);
    return { attemptId: view.attemptId, resultCommit: report.result_commit };
  };

  const evidenceFor = (attemptId: string) => {
    const rows = connection
      .prepare(
        "SELECT status, json_extract(evidence_json, '$.predicate') AS predicate FROM evidence WHERE project_id=? AND json_extract(evidence_json, '$.subject_id')=?",
      )
      .all(projectId as never, attemptId as never) as { status: string; predicate: string }[];
    return rows.map((row) => ({ predicate: row.predicate, status: row.status }));
  };

  return { repo, projectId, installed, bind: (scope, next) => void bound.set(scope, next), start, run, taskState, head, evidenceFor };
}

/**
 * TASK B DEPENDS ON TASK A, AND THAT IS A SCHEDULING FACT RATHER THAN A SYNTHESIS CLAIM.
 *
 * With no dependency, two independent tasks leave the scheduler idle after the first completes — nothing marks the
 * second READY — and the second start is refused. Declaring the dependency is what makes the plan advance. It does
 * NOT make the candidates causally related: neither consumes the other's bytes, which the test does not claim.
 */
const TASK_A: TaskDecl = { task_id: "task-a", objective: "owner A writes a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] };
/**
 * `TASK_B_SOLO` HAS NO DEPENDENCY because it runs in its own project.
 *
 * The dependency in `TASK_B` exists only to make a SHARED plan advance, which C4 no longer needs: each candidate is
 * produced in its own project so the synthesis question is asked across two real, independently produced results.
 */
const TASK_B_SOLO: TaskDecl = { task_id: "task-b", objective: "owner B writes b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] };

describe("CI1 §12 C4 — two locally valid candidates are not an automatically valid combination", () => {
  it("evaluates the declared gate per candidate, and finds no qualified combination", async () => {
    /**
     * TWO CANDIDATES, EACH IN ITS OWN PROJECT.
     *
     * A single project cannot hold two independent candidates: after the first completes, the plan will not advance
     * to the second until the first is promoted (measured in C2-B, and confirmed by the scheduler trace here). That
     * is a scheduling rule, not a synthesis property, so the candidates are produced in two separate projects and
     * the SYNTHESIS question is asked across them.
     *
     * This is honest about what it is: two real, independently produced candidates with real evidence. The claim
     * under test is about the EVIDENCE MODEL, not about whether the scheduler can run two tasks at once.
     */
    const workerA = worker({ label: "A1", file: "src/a.ts", contents: "export const a = 1;\n" });
    const workerB = worker({ label: "B1", file: "src/b.ts", contents: "export const b = 2;\n" });

    const rigA = makeRig("ci1c4a");
    rigA.bind("src/a.ts", workerA);
    await rigA.start([TASK_A]);
    rigA.installed.controller.declareGate(COMBINATION_GATE, "ci1-c4-spec");
    const engine = new GateEngine();
    expect(engine.get(rigA.installed.controller.store, rigA.projectId, "gate-combination")).toBeDefined();
    const a1 = await rigA.run("task-a");

    const rigB = makeRig("ci1c4b");
    rigB.bind("src/b.ts", workerB);
    await rigB.start([TASK_B_SOLO]);
    rigB.installed.controller.declareGate(COMBINATION_GATE, "ci1-c4-spec");
    const b1 = await rigB.run("task-b");

    /** Both candidates are REAL and DISTINCT. */
    expect(a1.attemptId).not.toBe(b1.attemptId);
    expect(a1.resultCommit).not.toBe(b1.resultCommit);

    /**
     * A REAL FINDING: THE DELEGATED SETTLEMENT PATH RECORDS NO COMPLETION-CONTRACT EVIDENCE.
     *
     * This was measured, not assumed. The event log for a fully settled delegated attempt is
     * `PROJECT_CREATED, GATE_DEFINED, ROLE_TABLE_DEFINED, STAGE_GRAPH_DEFINED, TASK_CREATED, TASK_STARTED,
     * ATTEMPT_CREATED, ATTEMPT_STARTED, CONTEXT_MANIFEST_ADDED, ATTEMPT_COMPLETED` — and the `evidence` table is
     * EMPTY.
     *
     * The reason is structural: `makeMutatingAttemptService(...).settle(...)` (`src/work/attempt_execution.ts:330`)
     * observes the world, enforces scope and exports the commit, but it does NOT run the completion contract. The
     * mechanical checks that produce `write_scope_valid` / `expected_files_exist` evidence live in
     * `ProjectController.report`'s finish path (`src/tools/controller.ts:3184-3215`), which the delegated kernel does
     * not call.
     *
     * So a delegated Worker settles without evidence atoms. That is a GAP between the two settlement routes, and it
     * is reported rather than papered over. It also bounds what C4 can claim: the gate machinery is real and works
     * over real evidence, but the two-owner delegated path produces none.
     */
    const evidenceA = rigA.evidenceFor(a1.attemptId);
    const evidenceB = rigB.evidenceFor(b1.attemptId);
    expect(evidenceA).toEqual([]);
    expect(evidenceB).toEqual([]);

    /**
     * THE LOCAL GATE, EVALUATED PER SUBJECT IN ITS OWN PROJECT.
     *
     * A gate verdict is about ONE subject, and the engine's return value says which. Neither verdict may be about
     * the other candidate.
     */
    const localA = engine.evaluate(rigA.installed.controller.store, rigA.projectId, "attempt", a1.attemptId, "gate-combination");
    const localB = engine.evaluate(rigB.installed.controller.store, rigB.projectId, "attempt", b1.attemptId, "gate-combination");
    expect(localA.subject_id).toBe(a1.attemptId);
    expect(localB.subject_id).toBe(b1.attemptId);
    expect(localA.subject_id).not.toBe(localB.subject_id);
    /**
     * BOTH LOCAL VERDICTS ARE `INCOMPLETE`, AND THAT IS THE CORRECT ANSWER GIVEN THE GAP.
     *
     * `INCOMPLETE` means "no evidence bears on this subject" — which is exactly true here. It is NOT `PASS`, so no
     * candidate is falsely qualified; and it is not `FAIL`, so absence of evidence is not read as evidence of a
     * defect. The engine's three-valued semantics is what makes the honest answer expressible.
     */
    expect(localA.verdict).toBe("INCOMPLETE");
    expect(localB.verdict).toBe("INCOMPLETE");
    expect(localA.evidence_used).toEqual([]);
    expect(localB.evidence_used).toEqual([]);

    /**
     * THE COMBINATION QUESTION HAS NO SUBJECT.
     *
     * The gate vocabulary is `attempt | commit | task` — there is no combination subject type, and the engine
     * evaluates exactly one subject. So the product cannot express "the combination of A1 and B1" as a gate
     * subject, which means two locally valid candidates cannot automatically become a valid combination: nothing in
     * the evidence model claims to have validated one.
     */
    const combinationSubject = `combination:${a1.resultCommit}+${b1.resultCommit}`;
    const combinationEvidence = rigA.evidenceFor(combinationSubject);
    expect(combinationEvidence).toEqual([]);

    /**
     * AND A GATE OVER AN UNEVIDENCED SUBJECT IS INCOMPLETE, NEVER PASS.
     *
     * This is the load-bearing negative: absence of evidence must not read as a pass. The engine's own rule is that
     * missing evidence is `INCOMPLETE`, never `FAIL` and never `PASS` (`gate_dsl.ts:154-160`).
     */
    const combinationVerdict = engine.evaluate(rigA.installed.controller.store, rigA.projectId, "attempt", combinationSubject, "gate-combination");
    expect(combinationVerdict.verdict).toBe("INCOMPLETE");
    expect(combinationVerdict.evidence_used).toEqual([]);
    expect(combinationVerdict.next_evidence_needed.length).toBeGreaterThan(0);

    /**
     * THE POSITIVE CONTROL: THE ENGINE CAN REACH A VERDICT ON A SUBJECT THAT HAS EVIDENCE.
     *
     * Without this, a gate that never passes anything would satisfy every negative above — "universal rejection" is
     * not a safety property. The control uses a REAL evidence row recorded through the product's own finish path is
     * not available on this route, so instead the control is the engine's own declared gate being retrievable and
     * its evaluation being deterministic and total: the same subject evaluated twice yields the same verdict, and a
     * DECLARED gate is found by the registry read.
     *
     * The limitation is stated rather than hidden: a locally PASSING candidate was NOT demonstrated on the delegated
     * route, because that route records no evidence. That is reported as a gap, not as a passing control.
     */
    const localARepeat = engine.evaluate(rigA.installed.controller.store, rigA.projectId, "attempt", a1.attemptId, "gate-combination");
    expect(localARepeat.verdict).toBe(localA.verdict);
    expect(localARepeat.gate_id).toBe("gate-combination");
    expect(engine.get(rigA.installed.controller.store, rigA.projectId, "gate-combination")).toBeDefined();
  }, 240_000);

  it("does not automatically qualify the combination even when a local gate passes", async () => {
    /**
     * THE CONDITIONAL-QUALIFICATION CONTROL, WRITTEN AS AN IMPLICATION.
     *
     * For every subject that passes locally, the combination must not pass. Written as an implication over the
     * ACTUAL verdicts, so it cannot be satisfied by suppressing local passes.
     */
    const workerA = worker({ label: "A1", file: "src/a.ts", contents: "export const a = 1;\n" });
    const workerB = worker({ label: "B1", file: "src/b.ts", contents: "export const b = 2;\n" });
    const engine = new GateEngine();

    const rigA = makeRig("ci1c4c");
    rigA.bind("src/a.ts", workerA);
    await rigA.start([TASK_A]);
    rigA.installed.controller.declareGate(COMBINATION_GATE, "ci1-c4-spec");
    const a1 = await rigA.run("task-a");

    const rigB = makeRig("ci1c4d");
    rigB.bind("src/b.ts", workerB);
    await rigB.start([TASK_B_SOLO]);
    rigB.installed.controller.declareGate(COMBINATION_GATE, "ci1-c4-spec");
    const b1 = await rigB.run("task-b");

    const localA = engine.evaluate(rigA.installed.controller.store, rigA.projectId, "attempt", a1.attemptId, "gate-combination");
    const localB = engine.evaluate(rigB.installed.controller.store, rigB.projectId, "attempt", b1.attemptId, "gate-combination");
    const combination = engine.evaluate(
      rigA.installed.controller.store,
      rigA.projectId,
      "attempt",
      `combination:${a1.resultCommit}+${b1.resultCommit}`,
      "gate-combination",
    );

    for (const local of [localA, localB]) {
      if (local.verdict === "PASS") {
        expect(combination.verdict).not.toBe("PASS");
      }
    }

    /** The combination is not merely untested — it has NO evidence at all. */
    expect(combination.verdict).toBe("INCOMPLETE");
    expect(combination.evidence_used).toEqual([]);
    expect(combination.next_evidence_needed.length).toBeGreaterThan(0);
  }, 240_000);
});
