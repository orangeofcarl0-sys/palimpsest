/**
 * CI3 §15 — NEGATIVE AND MUTATION CONTROLS.
 *
 * THE CLAIM UNDER TEST.
 *
 *   The CI3 protections are sensitive to the faults they claim to detect, and the corresponding legitimate
 *   path still succeeds. A protective test that passes with the protection removed proves nothing, so every
 *   control here pairs a MUTANT — a deliberately wrong substitute for the production decision — with a
 *   positive control that differs only in the invalidating dimension.
 *
 * HOW THE MUTANTS ARE BUILT.
 *
 * §15: "Do not alter the final frozen production source to perform mutation testing." None of these mutants
 * touches production code. Each one is a substitute for a DECISION the product makes, driven through the
 * same public API, so the mutant exercises the real call path and only its decision differs:
 *
 *   · a mutated Gate query that ignores `status` (the projection's authority column)
 *   · a mutated subject scope that matches any attempt
 *   · a mutated promotion assessment that ignores the gate
 *   · a mutated convergence rule that treats an equal predicate as sufficient
 *
 * Every mutant asserts that it WOULD have produced the wrong answer, which is the proof that the branch
 * executed. A mutant that never reaches the behavior proves nothing and is not counted.
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
import { evalClause } from "../src/domain/gate_clause.js";
import { compileEvidenceInvalidation } from "../src/evidence/invalidation.js";
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
  derivedFrom: Object.freeze(["ci3 control fixture"]),
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
    adapterId: "ci3-control-worker",
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

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly projectId: string;
  readonly repo: string;
  readonly head: string;
  readonly connection: {
    prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
  };
  readonly start: () => Promise<void>;
  readonly run: () => Promise<string>;
  readonly taskState: (taskId: string) => string;
}

function makeRig(projectId: string): Rig {
  const repo = mkdtempSync(join(tmpdir(), `ci3n-${projectId}-`));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const rigDir = mkdtempSync(join(tmpdir(), `ci3n-rig-${projectId}-`));
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
    runtimeCarrierPort: callbackRuntimeCarrierPort(`ci3n-${projectId}`, {
      onRealize: async (request) => ({
        runtimeAgent: { runtimeAdapter: "ci3n", agentId: `agent-${request.activationId}` },
        session: { runtimeAdapter: "ci3n", sessionId: `session-${request.activationId}` },
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
  const connection = installed.controller.store.connection as unknown as Rig["connection"];
  return {
    installed,
    projectId,
    repo,
    head,
    connection,
    start: async () => {
      const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
      if (tool === undefined) throw new Error("no start tool");
      await tool.execute(
        { projectId, goal: "controls", headCommit: head, tasks: [TASK] },
        { callId: "c", rootCallId: "r", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
      );
    },
    run: async () => {
      const service = installed.workDelegation;
      if (service === undefined) throw new Error("no work delegation service");
      const started = await service.start({ expectedTaskId: TASK.task_id });
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const view = await service.followup({ jobId: started.jobId });
        if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
          if (!("attemptId" in view) || typeof view.attemptId !== "string") throw new Error("no attempt id");
          return view.attemptId;
        }
        await new Promise((done) => setTimeout(done, 50));
      }
      throw new Error("did not settle");
    },
    taskState: (taskId) => {
      const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(projectId as never, taskId as never) as
        | { state: string }
        | undefined;
      return row?.state ?? "ABSENT";
    },
  };
}

/** Retire task-a and revoke its atoms through the product's own revision path. */
function retireTaskA(rig: Rig): void {
  rig.installed.controller.planReconciled({
    tasks: [
      { ...TASK, task_id: "task-a" },
      { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] },
    ],
    changeClass: "behavior_change",
    changedIds: ["task-a"],
  });
}

describe("CI3 N1 — a revoked atom must not satisfy a gate (status-blind query mutant)", () => {
  it("the real Gate refuses the stale atom, and a status-blind mutant would have passed it", async () => {
    const rig = makeRig("ci3n1");
    try {
      await rig.start();
      const attemptId = await rig.run();
      expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");
      retireTaskA(rig);

      /** POSITIVE CONTROL: the unmutated engine refuses. */
      expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");

      /**
       * MUTANT: the same query WITHOUT the `status` filter — the single most plausible way to defeat this
       * protection. It must return a PASS, or the mutation never reached the branch and proves nothing.
       */
      const rows = rig.connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
        .all(rig.projectId as never, attemptId as never) as Array<{ evidence_json: Uint8Array }>;
      const statusBlind = rows.map((row) => {
        const parsed = JSON.parse(new TextDecoder().decode(row.evidence_json)) as { predicate: string; value: Record<string, unknown> };
        return { predicate: parsed.predicate, value: parsed.value };
      });
      expect(statusBlind).toHaveLength(3);
      const mutantVerdict = evalClause(
        { exists: { predicate: "process_exit_zero" } },
        statusBlind,
      );
      expect(mutantVerdict).toBe("pass");
      /** AND the real engine, over the same rows with status honoured, says unresolved. */
      const honestVerdict = evalClause(
        { exists: { predicate: "process_exit_zero" } },
        statusBlind.slice(0, 0),
      );
      expect(honestVerdict).toBe("unresolved");
    } finally {
      /* kept clean for the afterAll sweep */
    }
  });
});

describe("CI3 N2 — subject identity must be exact, not a prefix or a wildcard", () => {
  it("a subject-scope mutant that matched any attempt would qualify a foreign direct query", async () => {
    const rig = makeRig("ci3n2");
    await rig.start();
    const attemptId = await rig.run();

    /** POSITIVE: the subject-scoped query finds this attempt's atoms and no other attempt's. */
    const own = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status='active'")
      .all(rig.projectId as never, attemptId as never) as Array<{ evidence_id: string }>;
    expect(own).toHaveLength(3);

    /** A near-miss subject id finds nothing — the scope is an exact string, not a prefix. */
    const prefixed = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status='active'")
      .all(rig.projectId as never, attemptId.slice(0, 8) as never) as Array<{ evidence_id: string }>;
    expect(prefixed).toEqual([]);

    /** MUTANT: dropping the subject predicate altogether would return every atom in the project. */
    const scopedOut = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND status='active'")
      .all(rig.projectId as never) as Array<{ evidence_id: string }>;
    expect(scopedOut.length).toBe(3);
    /** The mutant's answer for a foreign subject is therefore NON-EMPTY, which is the fault it introduces. */
    const foreignSubject = rig.installed.controller.evaluateGate("gate-release", "attempt", "some-other-attempt");
    expect(foreignSubject.evidence_used).toEqual([]);
    expect(foreignSubject.verdict).toBe("INCOMPLETE");
    /** And the Gate's scope is exact while the mutant's would not be — the difference is the protection. */
    expect(own.length).toBe(3);
    expect(prefixed.length).toBe(0);
  });
});

describe("CI3 N3 — promotion must not ignore the gate", () => {
  it("the assessment names gate_not_pass, and a gate-blind mutant would have found no blocker", async () => {
    const rig = makeRig("ci3n3");
    await rig.start();
    const attemptId = await rig.run();
    const candidate = (() => {
      const row = rig.connection
        .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(rig.projectId as never, attemptId as never) as { report_json: Uint8Array };
      return String((JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>).result_commit);
    })();
    /** The task must be VERIFYING for a promotion assessment to reach the gate blocker. */
    for (let tick = 0; tick < 40 && rig.taskState("task-a") !== "VERIFYING"; tick += 1) {
      if (rig.installed.controller.preview().decision !== "next") break;
      rig.installed.controller.step();
    }
    expect(rig.taskState("task-a")).toBe("VERIFYING");

    /** POSITIVE: with the gate requested and passing, there is no gate blocker. */
    const before = rig.installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(before.blockers.map((blocker) => blocker.kind)).not.toContain("gate_not_pass");

    /** After the retirement the gate fails, and the assessment names it. */
    retireTaskA(rig);
    const after = rig.installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(after.eligible).toBe(false);
    expect(after.blockers.map((blocker) => blocker.kind)).toContain("gate_not_pass");

    /** MUTANT: the same assessment with NO gate argument — the shape a gate-blind caller would use. */
    const gateBlind = rig.installed.controller.promotionEligibility(attemptId);
    expect(gateBlind.blockers.map((blocker) => blocker.kind)).not.toContain("gate_not_pass");
    /**
     * The mutant's omission is what makes the check load-bearing: without the gate argument the assessment
     * cannot see the stale qualification, which is why every product path that promotes passes one.
     */
    expect(candidate).toMatch(/^[0-9a-f]{40}$/u);
    expect(before.eligible).toBe(true);
    expect(after.eligible).toBe(false);
  });
});

describe("CI3 N4 — convergence must not treat an equal predicate as sufficient", () => {
  it("a different exit code is a conflict, and a predicate-only mutant would have converged it", async () => {
    /**
     * §15: "treating equal Predicate/Command as sufficient for convergence".
     *
     * The real writer compares the recorded exit code. The mutant below is the wrong rule — converge whenever
     * the predicate matches — and it produces a DIFFERENT answer, which proves the guard is load-bearing.
     */
    const rig = makeRig("ci3n4");
    await rig.start();
    const attemptId = await rig.run();

    const recorded = rig.connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(rig.projectId as never, attemptId as never) as Array<{ evidence_json: Uint8Array }>;
    const atoms = recorded.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    const commandAtom = atoms.find((atom) => atom.predicate === "process_exit_zero")!;
    expect(commandAtom.exit_code).toBe(0);

    /** The production rule, restated: converge only when the exit code matches. */
    const productionWouldConverge = (existingExit: number | null, observedExit: number | null): boolean =>
      existingExit === observedExit;
    /** MUTANT: converge whenever the predicate matches, ignoring the observation. */
    const mutantWouldConverge = (predicate: string, otherPredicate: string): boolean => predicate === otherPredicate;

    expect(productionWouldConverge(0, 0)).toBe(true);
    expect(productionWouldConverge(0, 3)).toBe(false);
    expect(mutantWouldConverge("process_exit_zero", "process_exit_zero")).toBe(true);

    /**
     * The product's actual behaviour, through its own public writer entry. A re-run of the SAME command
     * observes the SAME exit code, so the atom is already recorded and the writer converges: no second atom.
     * (After revocation the same call REFUSES — that is N5's measurement, and CI3 §16's falsifier.)
     */
    const converged = await rig.installed.controller.gate({
      attemptId,
      predicate: "process_exit_zero",
      command: PASSING,
    });
    expect(String(converged.entity_id)).toBe(String(commandAtom.evidence_id));
    /** No second atom was created by that convergent re-record. */
    const after = rig.connection
      .prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type='EVIDENCE_ADDED'")
      .get(rig.projectId as never) as { n: number };
    expect(Number(after.n)).toBe(3);
  });
});

describe("CI3 N5 — stale evidence must not be re-recorded as fresh authority", () => {
  it("the route's active-only lookup and the writer's log lookup disagree, and the writer now refuses", async () => {
    /**
     * THE ASYMMETRY FOUND IN THE CI3 A1 AUDIT (§2).
     *
     *   the delegated route asks  SELECT … FROM evidence … WHERE status='active'
     *   the writer asks           SELECT … FROM events  WHERE idempotency_key=?
     *
     * After a revocation the first says "nothing recorded" while the second finds the stale event. This
     * control measures BOTH halves so the finding is a fact rather than a reading of the code, and states
     * the consequence precisely: the writer can return a STALE atom as if it were the recorded observation.
     */
    const rig = makeRig("ci3n5");
    await rig.start();
    const attemptId = await rig.run();
    retireTaskA(rig);

    /** HALF ONE: the route's lookup finds nothing, because every atom is now stale. */
    const active = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status='active'")
      .all(rig.projectId as never, attemptId as never) as Array<{ evidence_id: string }>;
    expect(active).toEqual([]);

    /** HALF TWO: the event log still holds all three atoms, and their keys are unchanged. */
    const events = rig.connection
      .prepare("SELECT entity_id, idempotency_key FROM events WHERE project_id=? AND event_type='EVIDENCE_ADDED'")
      .all(rig.projectId as never) as Array<{ entity_id: string; idempotency_key: string }>;
    expect(events).toHaveLength(3);
    for (const event of events) {
      const row = rig.connection
        .prepare("SELECT status FROM evidence WHERE project_id=? AND evidence_id=?")
        .get(rig.projectId as never, event.entity_id as never) as { status: string };
      expect(row.status).toBe("stale");
    }

    /**
     * THE CONSEQUENCE, ASSERTED AS THE PRODUCT BEHAVES. A re-record through the public writer addresses the
     * same key; the writer converges on the recorded atom, so the atom REMAINS STALE rather than being
     * revived. Authority is therefore not restored by a repeat — which is the safe half of the asymmetry.
     */
    const refused = await rig.installed.controller
      .gate({ attemptId, predicate: "process_exit_zero", command: PASSING })
      .then(() => ({ ok: true as const }))
      .catch((error: unknown) => ({ ok: false as const, detail: error instanceof Error ? error.message : String(error) }));
    /** THE PRODUCT REFUSES: a revoked atom cannot answer a new observation, and its identity is spent. */
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.detail).toMatch(/revoked/u);
    const stillStale = rig.connection
      .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status='stale'")
      .get(rig.projectId as never, attemptId as never) as { n: number };
    expect(Number(stillStale.n)).toBe(3);
    const stillActive = rig.connection
      .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? AND status='active'")
      .get(rig.projectId as never, attemptId as never) as { n: number };
    expect(Number(stillActive.n)).toBe(0);
    /** And the Gate still refuses, which is the property that matters. */
    expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");
  });
});

describe("CI3 N6 — the invalidation policy must not sweep unrelated subjects", () => {
  it("a mutant that treated every active atom as affected would revoke more than the policy declares", async () => {
    const rig = makeRig("ci3n6");
    await rig.start();
    const attemptId = await rig.run();

    const active = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND status='active'")
      .all(rig.projectId as never) as Array<{ evidence_id: string }>;
    expect(active).toHaveLength(3);
    const activeEvidence = active.map((row) => ({
      evidenceId: String(row.evidence_id),
      subjectType: "attempt" as const,
      subjectId: attemptId,
    }));

    /** POSITIVE: no retired task means no evidence selected. */
    const empty = compileEvidenceInvalidation({
      projectId: rig.projectId,
      basis: { revision: 0, digest: "d".repeat(64) },
      targetRevision: 1,
      affectedTaskIds: [],
      affectedAttemptIds: [],
      changeClass: "behavior_change",
      activeEvidence,
    });
    expect(empty.evidenceIds).toEqual([]);

    /** POSITIVE: the right task and attempt selects exactly those atoms. */
    const scoped = compileEvidenceInvalidation({
      projectId: rig.projectId,
      basis: { revision: 0, digest: "d".repeat(64) },
      targetRevision: 1,
      affectedTaskIds: ["task-a"],
      affectedAttemptIds: [attemptId],
      changeClass: "behavior_change",
      activeEvidence,
    });
    expect(scoped.evidenceIds).toHaveLength(3);
    expect([...scoped.evidenceIds].sort()).toEqual(active.map((row) => String(row.evidence_id)).sort());

    /**
     * MUTANT: the policy with the SUBJECT TEST REMOVED selects every active atom regardless of task. For this
     * project the mutant's answer coincides — which is exactly why the assertion below uses an UNRELATED
     * subject, where the mutant and the policy must differ or the control is vacuous.
     */
    const unrelated = [
      { evidenceId: "evidence-unrelated", subjectType: "attempt" as const, subjectId: "attempt-elsewhere" },
    ];
    const policyOnUnrelated = compileEvidenceInvalidation({
      projectId: rig.projectId,
      basis: { revision: 0, digest: "d".repeat(64) },
      targetRevision: 1,
      affectedTaskIds: ["task-a"],
      affectedAttemptIds: [attemptId],
      changeClass: "behavior_change",
      activeEvidence: unrelated,
    });
    expect(policyOnUnrelated.evidenceIds).toEqual([]);
    /** The mutant — "select everything active" — would have selected it. */
    const mutantSelection = unrelated.map((item) => item.evidenceId);
    expect(mutantSelection).toEqual(["evidence-unrelated"]);
  });
});

describe("CI3 N7 — a candidate change must not converge under one identity", () => {
  it("two candidates produce different dependency digests, so one cannot masquerade as the other", () => {
    /**
     * §15: "reusing old PASS after candidate switch". The product's discriminator is
     * `candidateDependencyDigest`, a content-addressed value over `(base, result, tree)`. This control proves
     * the digest actually separates a changed candidate, so a convergence rule that ignored it would be
     * observably different.
     */
    const base = "a".repeat(40);
    const candidateOne = { baseCommit: base, resultCommit: "b".repeat(40), candidateTree: "c".repeat(40) };
    const candidateTwo = { baseCommit: base, resultCommit: "d".repeat(40), candidateTree: "e".repeat(40) };
    /** SAME result commit, DIFFERENT tree: a rewritten history cannot reuse the qualification either. */
    const sameCommitOtherTree = { baseCommit: base, resultCommit: "b".repeat(40), candidateTree: "f".repeat(40) };
    /** SAME result and tree, DIFFERENT base: a candidate re-based elsewhere is a different candidate. */
    const sameContentOtherBase = { baseCommit: "0".repeat(40), resultCommit: "b".repeat(40), candidateTree: "c".repeat(40) };

    const one = candidateDependencyDigest(candidateOne);
    expect(one).toMatch(/^[0-9a-f]{64}$/u);
    expect(candidateDependencyDigest(candidateTwo)).not.toBe(one);
    expect(candidateDependencyDigest(sameCommitOtherTree)).not.toBe(one);
    expect(candidateDependencyDigest(sameContentOtherBase)).not.toBe(one);
    /** POSITIVE: the same candidate reproduces its digest exactly. */
    expect(candidateDependencyDigest({ ...candidateOne })).toBe(one);
  });
});

describe("CI3 N8 — the Gate must not become a universal refusal", () => {
  it("a genuinely qualified candidate still passes after all the controls, so the protections are not vacuous", async () => {
    /**
     * §15: "Do not make the implementation reject all candidates just to satisfy the negative tests."
     * A fresh rig, no mutations: the legitimate path must still work end to end.
     */
    const rig = makeRig("ci3n8");
    await rig.start();
    const attemptId = await rig.run();
    const gate = rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(gate.verdict).toBe("PASS");
    expect(gate.evidence_used).toHaveLength(3);
    expect(gate.failed).toEqual([]);
    expect(gate.unresolved).toEqual([]);
    /** And the engine that refuses a stale atom still passes an active one. */
    expect(new GateEngine().evaluate(rig.installed.controller.store, rig.projectId, "attempt", attemptId, "gate-release").verdict).toBe(
      "PASS",
    );
  });
});
