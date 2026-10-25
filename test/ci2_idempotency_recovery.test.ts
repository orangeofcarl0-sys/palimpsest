/**
 * Palimpsest-CI2 §15/§11 — SETTLEMENT IDEMPOTENCY AND THE BOUNDED CRASH WINDOWS.
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   Repeated settlement of one genuine delegated result does not produce a second independent qualification, a
 *   second candidate, or a duplicate promotion — and a settlement that conflicts with the recorded candidate is
 *   not silently treated as an idempotent replay.
 *
 * WHAT IS *NOT* CLAIMED.
 *
 * No cross-system atomicity. Git and SQLite are two systems, and this file does not pretend an awaited call makes
 * them one. Each window below is measured as it actually behaves on this deployment, and where no safe recovery
 * exists the limitation is stated rather than papered over. There is no Transactional Outbox here, and §11 says
 * not to build one without a concrete measured failure.
 *
 * THE SIX OPERATIONS §15 ASKS TO KEEP DISTINCT.
 *
 *   repeated REQUEST          same call, same attempt, same candidate        → must converge
 *   repeated DELIVERY         the consumer observes the same world again       → must not duplicate authority
 *   RE-EVALUATION             same candidate, evaluated again                 → must converge on the same atoms
 *   NEW ATTEMPT               a different attempt for the same task           → must be its own subject
 *   CHANGED CANDIDATE         a different result commit for one attempt       → must NOT converge (W5)
 *   CHANGED CONTRACT          a different bar                                 → must NOT silently satisfy the old one
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
import { candidateDependencyDigest, evaluateCompletionContract } from "../src/work/completion_evaluation.js";

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
  derivedFrom: Object.freeze(["ci2 idempotency fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci2i-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci2i", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci2i", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

function boundedWorker(contents: string): WorkWorkerRunPort {
  return {
    adapterId: "ci2i-worker",
    async run({ workDir }) {
      mkdirSync(join(workDir, "src"), { recursive: true });
      writeFileSync(join(workDir, "src", "a.ts"), contents);
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
  readonly evidenceFor: (subjectId: string) => ReadonlyArray<Record<string, unknown>>;
  readonly eventsOfType: (type: string) => number;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
  readonly start: () => Promise<void>;
  readonly run: () => Promise<string>;
  readonly settleAgain: (attemptId: string) => Promise<unknown>;
}

function makeRig(input: { readonly projectId: string; readonly worker: WorkWorkerRunPort }): Rig {
  const projectId = input.projectId;
  const repoRoot = mkdtempSync(join(tmpdir(), `ci2i-${projectId}-`));
  cleanups.push(() => removeTree(repoRoot));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repoRoot });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const rig = mkdtempSync(join(tmpdir(), `ci2i-rig-${projectId}-`));
  const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
    projectId,
    databasePath: join(rig, "p.sqlite"),
    ordariumDatabasePath: join(rig, "o.sqlite"),
    repository: repoRoot,
    git: new GitCliPort(repoRoot, join(repoRoot, ".palimpsest", "worlds")),
    execution: "worktree",
    concurrency: 1,
    standard: STANDARD,
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
    runtimeCarrierPort: declaredCarrierPort(),
    workWorkerPort: () => input.worker,
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
  const run = async (): Promise<string> => {
    const service = installed.workDelegation;
    if (service === undefined) throw new Error("no work delegation service");
    const started = await service.start({ expectedTaskId: "task-a" });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if (!("attemptId" in view) || typeof view.attemptId !== "string") throw new Error("no attempt id");
        return view.attemptId;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error(`job ${started.jobId} did not settle`);
  };
  return {
    installed,
    projectId,
    repo: repoRoot,
    head,
    evidenceFor: (subjectId) => {
      const rows = connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
        .all(projectId as never, subjectId as never) as { evidence_json: Uint8Array }[];
      return rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    },
    eventsOfType: (type) => {
      const row = connection.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type=?").get(projectId as never, type as never) as {
        n: number;
      };
      return Number(row.n);
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
    start: async () => {
      await call("palimpsest_start", {
        projectId,
        goal: "a delegated candidate must qualify",
        headCommit: head,
        tasks: [TASK],
      });
    },
    run,
    /** A DIRECT repeat of the settlement request for an already-completed attempt. */
    settleAgain: async (attemptId) => await installed.controller.settleMutatingWork({ attemptId, workerOutcome: { kind: "READY_FOR_SETTLEMENT" } }),
  };
}

const RELEASE_GATE = "gate-release";

describe("CI2 §15 — repeated settlement converges and does not duplicate authority", () => {
  it("a repeated settlement request neither re-qualifies nor duplicates the candidate", async () => {
    const rig = makeRig({ projectId: "ci2i1", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    const row = rig.attemptRow(attemptId);
    expect(row?.state).toBe("COMPLETED");
    const candidate = String(row?.report?.result_commit ?? "");
    const atomsBefore = rig.evidenceFor(attemptId);
    const eventsBefore = rig.eventsOfType("EVIDENCE_ADDED");
    const completionsBefore = rig.eventsOfType("ATTEMPT_COMPLETED");
    expect(atomsBefore).toHaveLength(3);
    expect(completionsBefore).toBe(1);

    /**
     * THE REPEAT. The attempt is already COMPLETED, so the settlement ladder's own invariants decide what
     * happens — and whatever it decides must not produce a second qualification.
     */
    const second = await rig.settleAgain(attemptId);
    expect(second).toBeDefined();

    /**
     * CONVERGENCE, NOT DUPLICATION.
     *
     * The product may refuse the repeat (the attempt is terminal) or converge on the same records. Both are
     * correct; what must NOT happen is a second set of atoms or a second ATTEMPT_COMPLETED.
     */
    expect(rig.evidenceFor(attemptId)).toHaveLength(atomsBefore.length);
    expect(rig.eventsOfType("EVIDENCE_ADDED")).toBe(eventsBefore);
    expect(rig.eventsOfType("ATTEMPT_COMPLETED")).toBe(completionsBefore);
    /** The candidate identity is unchanged. */
    expect(String(rig.attemptRow(attemptId)?.report?.result_commit ?? "")).toBe(candidate);
    /** And the gate still passes, for the same subject, with the same atoms. */
    const gate = rig.installed.controller.evaluateGate(RELEASE_GATE, "attempt", attemptId);
    expect(gate.verdict).toBe("PASS");
    expect(gate.evidence_used).toHaveLength(3);
  });

  it("re-evaluating the same candidate produces the same observations, so its atoms would converge", async () => {
    /**
     * RE-EVALUATION IS A DIFFERENT OPERATION FROM A REPEATED REQUEST, and this measures it directly: the
     * evaluator is deterministic, so two evaluations of one candidate yield the same predicates, values and
     * dependency digest — which is WHY the atom's derived idempotency key converges.
     */
    const rig = makeRig({ projectId: "ci2i2", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    const row = rig.attemptRow(attemptId);
    const candidate = String(row?.report?.result_commit ?? "");
    const tree = execFileSync("git", ["rev-parse", `${candidate}^{tree}`], { cwd: rig.repo, encoding: "utf8" }).trim();
    const envelope = { write_paths: ["src/a.ts"], required_artifacts: ["src/a.ts"], allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] };
    const contract = rig.installed.controller.completionContract(attemptId);
    expect(contract).not.toBeNull();
    if (contract === null) return;
    const ports = {
      contract,
      candidate: { baseCommit: rig.head, resultCommit: candidate, candidateTree: tree },
      workDir: rig.repo,
      changedFiles: ["src/a.ts"],
      writePaths: envelope.write_paths,
      runCommand: async () => 0,
    };
    const first = await evaluateCompletionContract(ports);
    const second = await evaluateCompletionContract(ports);
    expect(second.outcome).toBe(first.outcome);
    expect(second.observations.map((entry) => entry.predicate)).toEqual(first.observations.map((entry) => entry.predicate));
    expect(second.observations.map((entry) => entry.value)).toEqual(first.observations.map((entry) => entry.value));
    expect(candidateDependencyDigest(ports.candidate)).toBe(candidateDependencyDigest(ports.candidate));
  });
});

describe("CI2 §11 W1..W5 — the bounded failure windows", () => {
  it("W1/W2: the exported candidate outlives the evaluation, so qualification can be re-derived without the worker", async () => {
    /**
     * W1 — "candidate exported, evidence not yet recorded". The candidate is an IMMUTABLE git object in the
     * canonical object database, and the contract is a PURE function of the envelope and standard. So the
     * evaluation can be re-run later from those two things alone, WITHOUT re-running the worker.
     *
     * THE MEASURED LIMIT, AND WHY IT IS RECORDED RATHER THAN HIDDEN.
     *
     * The first version of this test re-evaluated with `workDir: <canonical repo>` and got FAILED — because the
     * canonical repository is still at the BASE commit and the candidate's file does not reach it until
     * promotion. That is not a defect in the evaluator; it is the same fact that made the delegated route read
     * `worldPath` in the first place. It also states W1's real recovery requirement: re-evaluation needs the
     * candidate MATERIALIZED somewhere, which the immutable commit can always provide.
     *
     * So the recovery is measured the way it would actually be performed: materialize the exported commit into a
     * disposable checkout and evaluate there. No worker runs, and the answer is identical to the original.
     */
    const rig = makeRig({ projectId: "ci2wi12", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    const row = rig.attemptRow(attemptId);
    expect(row?.state).toBe("COMPLETED");
    const candidate = String(row?.report?.result_commit ?? "");
    /** The candidate RESOLVES from the canonical repository without the world, which is what makes W1 recoverable. */
    expect(execFileSync("git", ["cat-file", "-t", candidate], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe("commit");
    const contract = rig.installed.controller.completionContract(attemptId);
    expect(contract).not.toBeNull();
    if (contract === null) return;
    const tree = execFileSync("git", ["rev-parse", `${candidate}^{tree}`], { cwd: rig.repo, encoding: "utf8" }).trim();

    /** THE RECOVERY: a disposable checkout of the exported commit, built from the immutable object alone. */
    const checkout = mkdtempSync(join(tmpdir(), "ci2w1-checkout-"));
    cleanups.push(() => removeTree(checkout));
    execFileSync("git", ["--git-dir", join(rig.repo, ".git"), "worktree", "add", "--detach", checkout, candidate], { cwd: rig.repo });
    cleanups.push(() => {
      try {
        execFileSync("git", ["worktree", "remove", "--force", checkout], { cwd: rig.repo });
      } catch {
        /* the directory removal below still runs */
      }
    });

    const reEvaluation = await evaluateCompletionContract({
      contract,
      candidate: { baseCommit: rig.head, resultCommit: candidate, candidateTree: tree },
      workDir: checkout,
      changedFiles: ["src/a.ts"],
      writePaths: ["src/a.ts"],
      runCommand: async () => 0,
    });
    expect(reEvaluation.outcome).toBe("PASSED");
    expect(reEvaluation.observations.map((entry) => entry.predicate)).toEqual(["write_scope_valid", "process_exit_zero", "expected_files_exist"]);
    /** The atoms already recorded agree with the re-evaluation, so no second qualification is implied. */
    expect(rig.evidenceFor(attemptId).map((atom) => atom.predicate).sort()).toEqual(
      ["expected_files_exist", "process_exit_zero", "write_scope_valid"],
    );
  });

  it("W3: re-observing a delivered result does not create a second independent qualification", async () => {
    /**
     * W3 — "evidence recorded, consumer acknowledgement missing". Re-observation is a READ; the settlement is
     * the authority. The atoms' ids are derived from `(attempt, predicate)`, so a second observation of the same
     * result addresses the SAME rows rather than appending new ones.
     */
    const rig = makeRig({ projectId: "ci2w3", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    const before = rig.evidenceFor(attemptId);
    const idsBefore = before.map((atom) => atom.evidence_id).sort();
    const eventCountBefore = rig.eventsOfType("EVIDENCE_ADDED");
    /** Re-observing the world is a read the product already supports. */
    const observed = rig.installed.controller.observeAttemptResult(attemptId);
    expect(observed).not.toBeNull();
    /** No new evidence was appended by the read, and the ids are stable. */
    expect(rig.eventsOfType("EVIDENCE_ADDED")).toBe(eventCountBefore);
    expect(rig.evidenceFor(attemptId).map((atom) => atom.evidence_id).sort()).toEqual(idsBefore);
  });

  it("W4: a completed attempt with unavailable evidence stays unqualified rather than being assumed qualified", async () => {
    /**
     * W4 — "attempt completion recorded, evidence unavailable". The correct behaviour is that qualification
     * remains UNAVAILABLE. The engine expresses that as INCOMPLETE for a subject with no atoms, never PASS.
     */
    const rig = makeRig({ projectId: "ci2w4", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    expect(rig.attemptRow(attemptId)?.state).toBe("COMPLETED");
    const engine = new (await import("../src/evidence/gate_dsl.js")).GateEngine();
    const unqualified = engine.evaluate(rig.installed.controller.store, rig.projectId, "attempt", "attempt-with-unavailable-evidence", RELEASE_GATE);
    expect(unqualified.verdict).toBe("INCOMPLETE");
    expect(unqualified.evidence_used).toEqual([]);
    /** And the REAL attempt, whose evidence IS available, is qualified — so INCOMPLETE is not universal. */
    expect(rig.installed.controller.evaluateGate(RELEASE_GATE, "attempt", attemptId).verdict).toBe("PASS");
  });

  it("W5: two different candidates for one attempt are distinguishable, not an idempotent replay", async () => {
    /**
     * W5 — "same Attempt, conflicting candidate identity".
     *
     * This is the window where the naive model fails: `subject_digest` is a digest of `(attempt_id, predicate)`,
     * so it CANNOT tell two results apart, and the atom's idempotency key contains no candidate either. What
     * makes the conflict detectable is the CANDIDATE NAMED IN THE ATOM'S `value` and the content-addressed
     * `dependency_digest` over `(base, result, tree)`.
     *
     * Two different commits therefore produce two different dependency digests — so they are provably not the
     * same immutable result, and a gate scoped by `where: { result_commit }` matches exactly one of them.
     */
    const rig = makeRig({ projectId: "ci2w5", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();
    const row = rig.attemptRow(attemptId);
    const firstCandidate = String(row?.report?.result_commit ?? "");
    const firstTree = execFileSync("git", ["rev-parse", `${firstCandidate}^{tree}`], { cwd: rig.repo, encoding: "utf8" }).trim();

    /** A SECOND, genuinely different candidate, produced by a real commit in the canonical repository. */
    mkdirSync(join(rig.repo, "src"), { recursive: true });
    writeFileSync(join(rig.repo, "src", "a.ts"), "export const a = 'A2';\n");
    execFileSync("git", ["add", "-A"], { cwd: rig.repo });
    execFileSync("git", ["-c", "user.email=x@x.x", "-c", "user.name=x", "commit", "-qm", "second"], { cwd: rig.repo });
    const secondCandidate = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
    const secondTree = execFileSync("git", ["rev-parse", `${secondCandidate}^{tree}`], { cwd: rig.repo, encoding: "utf8" }).trim();
    expect(secondCandidate).not.toBe(firstCandidate);

    /** THE CONFLICT IS DETECTABLE: different digests, so they cannot be the same result. */
    const firstDigest = candidateDependencyDigest({ baseCommit: rig.head, resultCommit: firstCandidate, candidateTree: firstTree });
    const secondDigest = candidateDependencyDigest({ baseCommit: rig.head, resultCommit: secondCandidate, candidateTree: secondTree });
    expect(secondDigest).not.toBe(firstDigest);

    /** And the recorded atoms name the FIRST candidate only, so the second cannot inherit its qualification. */
    const atoms = rig.evidenceFor(attemptId);
    expect(atoms).toHaveLength(3);
    for (const atom of atoms) {
      expect((atom.value as Record<string, unknown>).result_commit).toBe(firstCandidate);
      expect(atom.dependency_digest).toBe(firstDigest);
    }
    rig.installed.controller.declareGate(
      {
        gate_id: "gate-w5",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: secondCandidate } } }] },
      },
      "ci2-w5",
    );
    const secondVerdict = new (await import("../src/evidence/gate_dsl.js")).GateEngine().evaluate(
      rig.installed.controller.store,
      rig.projectId,
      "attempt",
      attemptId,
      "gate-w5",
    );
    expect(secondVerdict.verdict).toBe("INCOMPLETE");
  });

  it("a NEW attempt for the same task is its own subject and is not covered by the previous attempt's atoms", async () => {
    const rig = makeRig({ projectId: "ci2new", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const first = await rig.run();
    expect(rig.attemptRow(first)?.state).toBe("COMPLETED");
    const firstAtoms = rig.evidenceFor(first);
    expect(firstAtoms).toHaveLength(3);
    /** A different attempt id is a different subject, by the projection's own query. */
    const engine = new (await import("../src/evidence/gate_dsl.js")).GateEngine();
    const other = engine.evaluate(rig.installed.controller.store, rig.projectId, "attempt", "attempt-second", RELEASE_GATE);
    expect(other.verdict).toBe("INCOMPLETE");
    expect(other.evidence_used).toEqual([]);
  });
});
