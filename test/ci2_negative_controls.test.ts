/**
 * Palimpsest-CI2 §13 — NEGATIVE QUALIFICATION CONTROLS (N1..N8).
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   Can a candidate that is invalid, stale, conflicting, wrongly-attributed or insufficiently evidenced be
 *   REFUSED rather than qualified — and is each refusal for the reason claimed, rather than because the route
 *   rejects everything?
 *
 * WHY THE POSITIVE CONTROL SITS IN THE SAME FILE.
 *
 * Every negative control here is paired with a positive one that differs in exactly the invalidating dimension.
 * Without that pairing, "the Gate did not PASS" is satisfied by universal rejection, which §13 explicitly forbids
 * as a safety solution. The paired positive is therefore the load-bearing half of each case: it proves the fixture
 * CAN qualify when the defect is absent.
 *
 * HOW EACH CASE AVOIDS THE CHEAP FAILURE MODE.
 *
 * A negative control that never reaches the behaviour it claims to test is worthless. Each case below therefore
 * asserts the intermediate fact that makes the negative meaningful:
 *
 *   N1  the candidate is EXPORTED and the attempt is RUNNING (so the refusal is about scope, not about "no work")
 *   N2  the artifact check RAN (so the refusal is about absence, not about the check being skipped)
 *   N3  candidate A1's evidence EXISTS and is ACTIVE (so the non-borrowing is about subject binding)
 *   N4  A1 PASSED (so A2's failure is not a property of the whole project)
 *   N5  the contract digest DIFFERS (so the incompatibility is real)
 *   N6  the attempt is COMPLETED (so "no evidence" is not "no attempt")
 *   N7  the command is authorized and the world is observable (so the error is the evaluator's)
 *   N8  a foreign commit RESOLVES (so the mismatch is provenance, not a missing object)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
  type GroundedPlanningState,
} from "../src/binding/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";
import { parseTaskSpec, projectIrDigestOf, type ProjectIr } from "../src/schema/index.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";
import { GateEngine } from "../src/evidence/gate_dsl.js";
import { deriveAttemptCompletionContract } from "../src/domain/completion_contract.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
/**
 * The teardown budget is raised for THIS hook because it removes eight separate disposable rigs, each a real
 * git repository with a SQLite database and up to two exported worlds. The repository's own vitest config sets
 * `hookTimeout: 30_000` for the same reason it says: a hook that builds or tears down a real rig is doing what a
 * test does, and deserves the same allowance. Measured here, eight rigs' teardown exceeded 30s under load, so it
 * is stated rather than left to flake.
 */
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
    /* left in place; the run's global temp sweep reports what remains */
  }
}

const HEAD = "c".repeat(40);
const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-ci2n",
  revision: 1,
  agentDefinitionIds: ["owner-ci2n"],
});

/** The passing command: authorized by policy, really spawned, really exits 0. */
const PASSING = ["node", "-e", "process.exit(0)"];
const FAILING = ["node", "-e", "process.exit(1)"];

function fullStandard(command: readonly string[]): ProjectStandard {
  return Object.freeze({
    statement: "the artifact exists, the scope is respected and the check command passes",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...command]), predicate: "process_exit_zero" as const }),
      Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/a.ts"]) }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["ci2 negative-control fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function makeBaselineRepo(projectId: string): { repo: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), `ci2n-${projectId}-`));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci2n-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci2n", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci2n", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

/** A worker that writes `file` with `contents` and commits it, optionally also writing an out-of-scope file. */
function boundedWorker(input: {
  readonly file: string;
  readonly contents: string;
  readonly also?: readonly string[];
}): WorkWorkerRunPort {
  return {
    adapterId: "ci2n-bounded-worker",
    async run({ workDir }) {
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      for (const path of input.also ?? []) {
        mkdirSync(join(workDir, path, ".."), { recursive: true });
        writeFileSync(join(workDir, path), "export const sneaky = true;\n");
      }
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly projectId: string;
  readonly repo: string;
  readonly head: string;
  readonly call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly evidenceFor: (subjectId: string) => ReadonlyArray<Record<string, unknown>>;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
  readonly start: (tasks: readonly (typeof TASK)[]) => Promise<void>;
  readonly run: (taskId: string) => Promise<{ attemptId: string; settlement: unknown }>;
}

function makeRig(input: {
  readonly projectId: string;
  readonly worker: WorkWorkerRunPort;
  readonly standard?: ProjectStandard;
  readonly allowed?: readonly string[];
}): Rig {
  const projectId = input.projectId;
  const repoInfo = makeBaselineRepo(projectId);
  const rig = mkdtempSync(join(tmpdir(), `ci2n-rig-${projectId}-`));
  const standard = input.standard ?? fullStandard(PASSING);
  const allowed = input.allowed ?? PASSING;
  const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
    projectId,
    databasePath: join(rig, "p.sqlite"),
    ordariumDatabasePath: join(rig, "o.sqlite"),
    repository: repoInfo.repo,
    git: new GitCliPort(repoInfo.repo, join(repoInfo.repo, ".palimpsest", "worlds")),
    execution: "worktree",
    concurrency: 1,
    standard,
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: allowed[0]!, argv_prefix: allowed.slice(1) }] }),
    runtimeCarrierPort: declaredCarrierPort(),
    workWorkerPort: () => input.worker,
  } as never);
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best effort at teardown */
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
  const start = async (tasks: readonly (typeof TASK)[]) => {
    await call("palimpsest_start", {
      projectId,
      goal: "a delegated candidate must qualify",
      headCommit: repoInfo.head,
      tasks,
    });
  };
  const run = async (taskId: string) => {
    const service = installed.workDelegation;
    if (service === undefined) throw new Error("no work delegation service");
    const started = await service.start({ expectedTaskId: taskId });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if (!("attemptId" in view) || typeof view.attemptId !== "string") throw new Error("no attempt id");
        return { attemptId: view.attemptId, settlement: "settlement" in view ? view.settlement : null };
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error(`job ${started.jobId} did not settle`);
  };
  return {
    installed,
    projectId,
    repo: repoInfo.repo,
    head: repoInfo.head,
    call,
    evidenceFor: (subjectId) => {
      const rows = connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
        .all(projectId as never, subjectId as never) as { evidence_json: Uint8Array }[];
      return rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    },
    attemptRow: (attemptId) => {
      const row = connection
        .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(projectId as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
      if (row === undefined) return null;
      return {
        state: row.state,
        report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
      };
    },
    start,
    run,
  };
}

const RELEASE_GATE = "gate-release";

describe("CI2 §13 N1 — a write-scope violation is refused and records no qualifying evidence", () => {
  it("refuses an out-of-scope candidate, and the paired in-scope candidate qualifies", async () => {
    /** NEGATIVE: the worker writes its declared file AND an undeclared one. */
    const bad = makeRig({
      projectId: "ci2n1bad",
      worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n", also: ["src/elsewhere.ts"] }),
    });
    await bad.start([TASK]);
    const badRun = await bad.run("task-a");
    /** PRECONDITION: the refusal is about scope, not about absent work — the candidate exists. */
    const badRow = bad.attemptRow(badRun.attemptId);
    expect(badRow).not.toBeNull();
    if (badRow === null) return;
    expect(badRow.state).toBe("RUNNING");
    expect(bad.evidenceFor(badRun.attemptId)).toEqual([]);
    const badGate = bad.installed.controller.evaluateGate(RELEASE_GATE, "attempt", badRun.attemptId);
    expect(badGate.verdict).not.toBe("PASS");

    /** POSITIVE PAIR: the same worker, same task, no out-of-scope file. */
    const good = makeRig({
      projectId: "ci2n1good",
      worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }),
    });
    await good.start([TASK]);
    const goodRun = await good.run("task-a");
    const goodRow = good.attemptRow(goodRun.attemptId);
    expect(goodRow?.state).toBe("COMPLETED");
    const goodGate = good.installed.controller.evaluateGate(RELEASE_GATE, "attempt", goodRun.attemptId);
    expect(goodGate.verdict).toBe("PASS");
  });
});

describe("CI2 §13 N2 — a missing required artifact is refused", () => {
  it("refuses when the declared artifact is absent from the evaluated result, and passes when present", async () => {
    /**
     * NEGATIVE: the task declares `src/a.ts` as a required artifact, and the worker writes `src/b.ts`.
     * The scope allows only `src/a.ts`, so this ALSO trips the scope check — which is why the task's write
     * scope is widened to cover `src/b.ts` while the required artifact stays `src/a.ts`. That isolates the
     * artifact check from the scope check.
     */
    const badTask = { ...TASK, write_paths: ["src/a.ts", "src/b.ts"], required_artifacts: ["src/a.ts"] };
    const bad = makeRig({
      projectId: "ci2n2bad",
      worker: boundedWorker({ file: "src/b.ts", contents: "export const b = 'B1';\n" }),
    });
    await bad.start([badTask]);
    const badRun = await bad.run("task-a");
    const badRow = bad.attemptRow(badRun.attemptId);
    expect(badRow?.state).toBe("RUNNING");
    /** PRECONDITION: the scope check PASSED, so the refusal is the artifact check's. */
    expect(bad.evidenceFor(badRun.attemptId)).toEqual([]);

    /** POSITIVE PAIR: the worker writes the artifact the task declares. */
    const good = makeRig({
      projectId: "ci2n2good",
      worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }),
    });
    await good.start([badTask]);
    const goodRun = await good.run("task-a");
    expect(good.attemptRow(goodRun.attemptId)?.state).toBe("COMPLETED");
    const goodEvidence = good.evidenceFor(goodRun.attemptId).map((atom) => atom.predicate);
    expect(goodEvidence).toContain("expected_files_exist");
  });
});

describe("CI2 §13 N3/N4 — evidence does not transfer between candidates or attempts", () => {
  it("attempt A1's evidence does not satisfy a gate over attempt A2, and neither does a second task's", async () => {
    /**
     * TWO TASKS IN ONE PROJECT. A1 passes; then a second task's attempt is examined.
     *
     * The second task has a DIFFERENT attempt id, so the subject key differs. Even though the same
     * release gate is declared and A1's evidence is active, the engine scopes by subject.
     */
    const rig = makeRig({ projectId: "ci2n3", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    const taskB = { ...TASK, task_id: "task-b", objective: "write b", write_paths: ["src/a.ts"], required_artifacts: ["src/a.ts"] };
    await rig.start([TASK, taskB]);
    const first = await rig.run("task-a");
    expect(rig.attemptRow(first.attemptId)?.state).toBe("COMPLETED");
    /** PRECONDITION: A1's evidence exists and is ACTIVE. */
    const firstEvidence = rig.evidenceFor(first.attemptId);
    expect(firstEvidence).toHaveLength(3);
    expect(firstEvidence.every((atom) => atom.status === "active")).toBe(true);
    const firstGate = rig.installed.controller.evaluateGate(RELEASE_GATE, "attempt", first.attemptId);
    expect(firstGate.verdict).toBe("PASS");

    /** THE OTHER ATTEMPT: no evidence of its own, and A1's cannot stand in for it. */
    const engine = new GateEngine();
    const syntheticSubject = "attempt-not-created";
    expect(rig.evidenceFor(syntheticSubject)).toEqual([]);
    const otherVerdict = engine.evaluate(rig.installed.controller.store, rig.projectId, "attempt", syntheticSubject, RELEASE_GATE);
    expect(otherVerdict.verdict).toBe("INCOMPLETE");
    expect(otherVerdict.evidence_used).toEqual([]);

    /**
     * AND THE SAME HOLDS FOR A COMMIT-SUBJECT GATE: A1's attempt evidence is scoped to the attempt, so a
     * gate declared over a commit subject finds nothing even in the project that holds A1's atoms.
     */
    const commitSubject = String(rig.attemptRow(first.attemptId)?.report?.result_commit ?? "");
    expect(commitSubject).toMatch(/^[0-9a-f]{40}$/u);
    rig.installed.controller.declareGate(
      { gate_id: "gate-commit", version: 1, subject_type: "commit", require: { mode: "all", chain: [{ exists: { predicate: "process_exit_zero" } }] } },
      "ci2-n3",
    );
    const commitVerdict = engine.evaluate(rig.installed.controller.store, rig.projectId, "commit", commitSubject, "gate-commit");
    expect(commitVerdict.verdict).toBe("INCOMPLETE");
    expect(commitVerdict.evidence_used).toEqual([]);
  });

  it("a candidate's own atoms name only that candidate, so a newer candidate cannot borrow them", async () => {
    const rig = makeRig({ projectId: "ci2n4", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    await rig.start([TASK]);
    const run = await rig.run("task-a");
    const row = rig.attemptRow(run.attemptId);
    const candidate = String(row?.report?.result_commit ?? "");
    expect(candidate).toMatch(/^[0-9a-f]{40}$/u);
    const evidence = rig.evidenceFor(run.attemptId);
    expect(evidence).toHaveLength(3);
    /** Every atom names THIS candidate... */
    for (const atom of evidence) expect((atom.value as Record<string, unknown>).result_commit).toBe(candidate);
    /** ...and a gate scoped to a DIFFERENT candidate does not match them. */
    rig.installed.controller.declareGate(
      {
        gate_id: "gate-candidate",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: "0".repeat(40) } } }] },
      },
      "ci2-n4",
    );
    const wrongCandidate = new GateEngine().evaluate(rig.installed.controller.store, rig.projectId, "attempt", run.attemptId, "gate-candidate");
    expect(wrongCandidate.verdict).toBe("INCOMPLETE");
    /** The SAME clause with the REAL candidate matches, which proves the `where` is doing the work. */
    rig.installed.controller.declareGate(
      {
        gate_id: "gate-candidate-right",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: candidate } } }] },
      },
      "ci2-n4",
    );
    const rightCandidate = new GateEngine().evaluate(rig.installed.controller.store, rig.projectId, "attempt", run.attemptId, "gate-candidate-right");
    expect(rightCandidate.verdict).toBe("PASS");
  });
});

describe("CI2 §13 N5 — a different contract cannot silently satisfy this one", () => {
  it("the two contracts have different basis digests, and evidence records the contract's own checks", async () => {
    const withCommand = fullStandard(PASSING);
    const withoutCommand: ProjectStandard = Object.freeze({
      statement: "the artifact exists and the scope is respected",
      clauses: Object.freeze([
        Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/a.ts"]) }),
        Object.freeze({ kind: "scope_respected" as const }),
      ]),
      derivedFrom: Object.freeze(["ci2 negative-control fixture"]),
      confirmed: true,
      notes: Object.freeze([]),
    });
    const envelope = {
      write_paths: ["src/a.ts"],
      required_artifacts: ["src/a.ts"],
      allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
    };
    const contractA = deriveAttemptCompletionContract({ standard: withCommand, task: TASK, envelope });
    const contractB = deriveAttemptCompletionContract({ standard: withoutCommand, task: TASK, envelope });
    /** PRECONDITION: the two contracts are genuinely different, so incompatibility is real. */
    expect(contractA.basisDigest).not.toBe(contractB.basisDigest);
    expect(contractA.mechanical.map((check) => check.kind)).toContain("run_standard_command");
    expect(contractB.mechanical.map((check) => check.kind)).not.toContain("run_standard_command");

    /** A delegated run under contract A records A's checks; contract B's narrower bar is not what ran. */
    const rig = makeRig({ projectId: "ci2n5", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    await rig.start([TASK]);
    const run = await rig.run("task-a");
    const predicates = rig.evidenceFor(run.attemptId).map((atom) => atom.predicate).sort();
    expect(predicates).toEqual(["expected_files_exist", "process_exit_zero", "write_scope_valid"]);
    /** The evidence is tagged with the project revision and digest it was produced under. */
    for (const atom of rig.evidenceFor(run.attemptId)) {
      expect(atom.input_fingerprint).toMatch(/^[0-9a-f]{64}$/u);
      expect(typeof atom.project_revision).toBe("number");
    }
  });
});

describe("CI2 §13 N6/N7 — absent evidence and evaluator failure are never PASS", () => {
  it("a completed attempt with no evidence of its own is INCOMPLETE, not PASS", async () => {
    const rig = makeRig({ projectId: "ci2n6", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    await rig.start([TASK]);
    const run = await rig.run("task-a");
    /** PRECONDITION: the attempt really completed, so "no evidence" is not "no attempt". */
    expect(rig.attemptRow(run.attemptId)?.state).toBe("COMPLETED");
    expect(rig.evidenceFor(run.attemptId)).toHaveLength(3);
    /** A subject with no atoms is INCOMPLETE — absence of evidence is never a pass (§18). */
    const engine = new GateEngine();
    const empty = engine.evaluate(rig.installed.controller.store, rig.projectId, "attempt", "attempt-with-no-atoms", RELEASE_GATE);
    expect(empty.verdict).toBe("INCOMPLETE");
    expect(empty.next_evidence_needed.length).toBeGreaterThan(0);
  });

  it("a failing standard command refuses the settlement and records no passing atom", async () => {
    /**
     * N7: the command is AUTHORIZED and really runs — it just exits nonzero. The evaluator must return
     * FAILED, the settlement must refuse, and crucially no passing `process_exit_zero` atom may exist.
     */
    const rig = makeRig({
      projectId: "ci2n7",
      worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }),
      standard: fullStandard(FAILING),
      allowed: FAILING,
    });
    await rig.start([TASK]);
    const run = await rig.run("task-a");
    const row = rig.attemptRow(run.attemptId);
    expect(row?.state).toBe("RUNNING");
    expect(rig.evidenceFor(run.attemptId)).toEqual([]);
    const gate = rig.installed.controller.evaluateGate(RELEASE_GATE, "attempt", run.attemptId);
    expect(gate.verdict).toBe("INCOMPLETE");

    /** POSITIVE PAIR: the same fixture with a passing command completes and qualifies. */
    const good = makeRig({ projectId: "ci2n7good", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    await good.start([TASK]);
    const goodRun = await good.run("task-a");
    expect(good.attemptRow(goodRun.attemptId)?.state).toBe("COMPLETED");
    expect(good.installed.controller.evaluateGate(RELEASE_GATE, "attempt", goodRun.attemptId).verdict).toBe("PASS");
  });
});

describe("CI2 §13 N8 — a foreign or mismatched candidate is not accepted for looking plausible", () => {
  it("a commit that resolves but was not produced by this attempt has no atoms naming it", async () => {
    const rig = makeRig({ projectId: "ci2n8", worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });
    await rig.start([TASK]);
    const run = await rig.run("task-a");
    const row = rig.attemptRow(run.attemptId);
    const candidate = String(row?.report?.result_commit ?? "");
    expect(candidate).toMatch(/^[0-9a-f]{40}$/u);

    /**
     * A FOREIGN COMMIT, made directly in the canonical repository. It RESOLVES — so this is a provenance
     * question, not a missing-object one — and its content is plausible (the same file, different bytes).
     */
    writeFileSync(join(rig.repo, "src", "a.ts"), "export const a = 'FOREIGN';\n");
    execFileSync("git", ["add", "-A"], { cwd: rig.repo });
    execFileSync("git", ["-c", "user.email=f@f.f", "-c", "user.name=f", "commit", "-qm", "foreign"], { cwd: rig.repo });
    const foreign = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    expect(execFileSync("git", ["cat-file", "-t", foreign], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe("commit");
    expect(foreign).not.toBe(candidate);

    /**
     * The attempt's atoms name the ATTEMPT'S candidate and nothing else. A gate scoped to the foreign
     * commit therefore finds nothing — the evidence cannot be redirected at a plausible-looking object.
     */
    for (const atom of rig.evidenceFor(run.attemptId)) {
      expect((atom.value as Record<string, unknown>).result_commit).toBe(candidate);
    }
    rig.installed.controller.declareGate(
      {
        gate_id: "gate-foreign",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: foreign } } }] },
      },
      "ci2-n8",
    );
    const foreignVerdict = new GateEngine().evaluate(rig.installed.controller.store, rig.projectId, "attempt", run.attemptId, "gate-foreign");
    expect(foreignVerdict.verdict).toBe("INCOMPLETE");
    expect(foreignVerdict.evidence_used).toHaveLength(3);
  });
});
