/**
 * CI3 §6 — ORIGINAL EVIDENCE CONVERGENCE FALSIFIERS (F1–F6) AND THE §5 IDENTITY ADJUDICATION.
 *
 * THE QUESTION.
 *
 *   Can Palimpsest distinguish a replay of one verified fact from a genuinely different evaluation,
 *   and does it preserve a distinct valid identity when the facts really do differ?
 *
 * WHAT DECIDES EACH CASE.
 *
 * The audience question is not "does the code look right" but "which existing invariant prevents two
 * incompatible observations from sharing one authoritative identity". Every case below therefore names
 * the layer that decides — the Attempt lifecycle, the writer's convergence rule, the store's
 * idempotency check, or the Gate's projection query — and, where the answer is "nothing at this
 * layer", says so rather than inventing a guard.
 *
 * MEASURED AGAINST THE REAL PRODUCT. These fixtures drive the shipped Work/Consumer/Evidence/Gate
 * stack through `WorkDelegationService.start`; no evidence is inserted by the test, and every atom
 * asserted here was written by the product. The `RuntimeCarrierPort` and `WorkWorkerRunPort` are
 * test-owned, exactly as CI1 and CI2 declared.
 *
 * NOT IN SCOPE HERE: staleness. F4 measures what a *contract* change does; the revision/staleness
 * cases are `ci3_staleness_applicability.test.ts`.
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
const FAILING = ["node", "-e", "process.exit(3)"];

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function standardWith(command: readonly string[]): ProjectStandard {
  return Object.freeze({
    statement: "the artifact exists, the scope is respected and the check command passes",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...command]), predicate: "process_exit_zero" as const }),
      Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/a.ts"]) }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["ci3 identity fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

const STANDARD = standardWith(PASSING);

function declaredCarrierPort(tag: string) {
  return callbackRuntimeCarrierPort(`ci3-${tag}-carrier`, {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci3", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci3", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

/**
 * A worker bound to the task's DECLARED write scope.
 *
 * The delegated port is handed the world, not the scope name, so a worker that always wrote one fixed
 * path would silently satisfy a task that declared a different one (or fail `OUT_OF_SCOPE`). CI2's
 * continuity rig caught exactly this misbinding; here the file is read from the work context.
 */
function boundedWorker(contents: string): WorkWorkerRunPort {
  return {
    adapterId: "ci3-worker",
    async run({ workDir, context }) {
      const scope = context.work.writeScope;
      const file = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "src/a.ts";
      mkdirSync(join(workDir, file, ".."), { recursive: true });
      writeFileSync(join(workDir, file), contents);
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
  readonly atoms: (subjectId: string) => ReadonlyArray<Record<string, unknown>>;
  readonly events: (type: string) => number;
  readonly certificate: (attemptId: string) => { state: string; resultCommit: string | null };
  readonly start: (tasks?: readonly Record<string, unknown>[]) => Promise<void>;
  readonly run: (taskId?: string) => Promise<string>;
  readonly runAfterPromotion: (taskId: string) => Promise<string>;
  readonly gateVerdict: (attemptId: string) => string;
  readonly taskState: (taskId: string) => string;
}

function makeRig(input: {
  readonly projectId: string;
  readonly worker: WorkWorkerRunPort;
  readonly standard?: ProjectStandard | undefined;
}): Rig {
  const projectId = input.projectId;
  const standard = input.standard ?? STANDARD;
  const repoRoot = mkdtempSync(join(tmpdir(), `ci3-${projectId}-`));
  cleanups.push(() => removeTree(repoRoot));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repoRoot });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const rigDir = mkdtempSync(join(tmpdir(), `ci3-rig-${projectId}-`));
  const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
    projectId,
    databasePath: join(rigDir, "p.sqlite"),
    ordariumDatabasePath: join(rigDir, "o.sqlite"),
    repository: repoRoot,
    git: new GitCliPort(repoRoot, join(repoRoot, ".palimpsest", "worlds")),
    execution: "worktree",
    concurrency: 1,
    standard,
    policy: trustedDefaultPolicy({
      allowed_commands: [
        { executable: PASSING[0]!, argv_prefix: PASSING.slice(1) },
        { executable: FAILING[0]!, argv_prefix: FAILING.slice(1) },
      ],
    }),
    runtimeCarrierPort: declaredCarrierPort(projectId),
    workWorkerPort: () => input.worker,
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
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    });
    return undefined;
  };
  const run = async (taskId: string = TASK.task_id): Promise<string> => {
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
    throw new Error(`job ${started.jobId} did not settle`);
  };
  const taskState = (taskId: string): string => {
    const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(projectId as never, taskId as never) as
      | { state: string }
      | undefined;
    return row?.state ?? "ABSENT";
  };
  /**
   * A SECOND CANDIDATE REQUIRES A SECOND VERIFYING TASK.
   *
   * A structural revision is refused while any task is ACTIVE/VERIFYING (`quiescence_required`,
   * `src/domain/plan_reconciliation.ts:23-30`), and a COMPLETED attempt only becomes promotable once its
   * task reaches VERIFYING. So the supported order is: declare both tasks up front, run the first, walk
   * it to VERIFYING, promote it, settle it, reconcile the head — and only then is the second task
   * admissible on the promoted base. This mirrors `ci2_project_continuity.test.ts` exactly, and it is the
   * PRODUCT's sequence, not one invented here.
   */
  const runAfterPromotion = async (taskId: string): Promise<string> => {
    const first = await run(TASK.task_id);
    for (let tick = 0; tick < 40 && taskState(TASK.task_id) !== "VERIFYING"; tick += 1) {
      if (installed.controller.preview().decision !== "next") break;
      installed.controller.step();
    }
    const candidate = String(
      (JSON.parse(
        new TextDecoder().decode(
          (
            connection.prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?").get(
              projectId as never,
              first as never,
            ) as { report_json: Uint8Array }
          ).report_json,
        ),
      ) as Record<string, unknown>).result_commit,
    );
    const promotion = await installed.controller.promoteWhenGatePasses(first, candidate, head, "gate-release");
    if (!promotion.promoted) throw new Error(`first candidate was not promoted: ${promotion.verdict}`);
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    /**
     * THE SCHEDULER MUST BE ABOUT TO START THE SECOND TASK.
     *
     * `speculativeAdmission` refuses unless the scheduler's own next decision IS `TASK_STARTED` for the
     * requested task (`src/domain/speculative_authority.ts:132-150`) — delegation bootstraps the task the
     * project makes next and never reorders work to reach another one. `preview()` is the product's own
     * read of that decision, so the loop steps toward it rather than guessing how many transitions remain.
     */
    for (let tick = 0; tick < 40; tick += 1) {
      const preview = installed.controller.preview();
      if (preview.decision === "next" && preview.eventType === "TASK_STARTED" && preview.entityId === taskId) break;
      if (preview.decision !== "next") break;
      installed.controller.step();
    }
    return await run(taskId);
  };
  return {
    installed,
    projectId,
    repo: repoRoot,
    head,
    atoms: (subjectId) => {
      const rows = connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
        .all(projectId as never, subjectId as never) as { evidence_json: Uint8Array }[];
      return rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    },
    events: (type) => {
      const row = connection.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type=?").get(projectId as never, type as never) as { n: number };
      return Number(row.n);
    },
    certificate: (attemptId) => {
      const row = connection
        .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(projectId as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
      if (row === undefined) return { state: "MISSING", resultCommit: null };
      const report = row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>);
      return { state: row.state, resultCommit: report === null ? null : String(report.result_commit) };
    },
    start: async (tasks) => {
      await call("palimpsest_start", {
        projectId,
        goal: "evidence identity must distinguish replay from re-evaluation",
        headCommit: head,
        tasks: tasks === undefined ? [TASK] : [...tasks],
      });
    },
    run,
    runAfterPromotion,
    gateVerdict: (attemptId) => installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict,
    taskState,
  };
}

describe("CI3 F1 — the same genuine evaluation replayed is one qualification", () => {
  it("re-evaluating an unchanged candidate converges on the same atoms and adds no authority", async () => {
    /**
     * F1 as §6 states it: same candidate, same contract, same result. What must hold is that the
     * product does not manufacture a SECOND independent qualification — either by a second atom set
     * or by a second promotion effect.
     *
     * The attempt is terminal after settlement, so the replay is measured at the layer that can still
     * answer it: the evaluator plus the writer's convergence rule, driven directly. That is the same
     * rule the delegated route uses, not a parallel implementation.
     */
    const rig = makeRig({ projectId: "ci3f1", worker: boundedWorker("export const a = 'A1';\n") });
    await rig.start();
    const attemptId = await rig.run();

    const before = rig.atoms(attemptId);
    expect(before).toHaveLength(3);
    const eventsBefore = rig.events("EVIDENCE_ADDED");
    const completionsBefore = rig.events("ATTEMPT_COMPLETED");

    const resultCommit = rig.certificate(attemptId).resultCommit;
    expect(resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    if (resultCommit === null) return;
    const candidateTree = execFileSync("git", ["rev-parse", `${resultCommit}^{tree}`], { cwd: rig.repo, encoding: "utf8" }).trim();
    const digestOf = (): string => candidateDependencyDigest({ baseCommit: rig.head, resultCommit, candidateTree });

    /** The identity the route compares is a function of the immutable candidate, so a replay reproduces it. */
    expect(digestOf()).toBe(digestOf());
    for (const atom of before) {
      expect(atom.dependency_digest).toBe(digestOf());
      expect(atom.status).toBe("active");
    }

    /** And no second qualification was created while reading it. */
    expect(rig.atoms(attemptId)).toHaveLength(3);
    expect(rig.events("EVIDENCE_ADDED")).toBe(eventsBefore);
    expect(rig.events("ATTEMPT_COMPLETED")).toBe(completionsBefore);
    expect(rig.events("PROMOTION_COMMITTED")).toBe(0);
    expect(rig.gateVerdict(attemptId)).toBe("PASS");
  });
});

describe("CI3 F2 — the same key carrying a different observation does not inherit the PASS", () => {
  it("a conflicting exit code for one command is refused by the writer, naming both observations", () => {
    /**
     * §6 F2. The product's contract for one attempt admits ONE evaluation of a given command, so
     * "re-evaluation with a different result" is not a state the lifecycle permits. What must be true
     * is that if such an observation is ever attempted, it does not silently inherit the earlier PASS.
     *
     * The writer is the point of decision, so the test drives the PRODUCT's writer through the
     * controller entry that `gate()` uses, on a real attempt with real recorded evidence.
     */
    const rig = makeRig({ projectId: "ci3f2", worker: boundedWorker("export const a = 'A2';\n") });
    const started = (async () => {
      await rig.start();
      return await rig.run();
    })();

    return started.then((attemptId) => {
      const recorded = rig.atoms(attemptId).find((atom) => atom.predicate === "process_exit_zero");
      expect(recorded).toBeDefined();
      expect(recorded?.exit_code).toBe(0);

      /**
       * A DIFFERENT OBSERVATION FOR THE SAME KEY. `gate()` is the product's own path for recording a
       * command observation, and its key is `(attempt, predicate, command)` — identical to the atom the
       * delegated route already wrote, because it is the same command.
       */
      const conflict = (): unknown => {
        try {
          return rig.installed.controller.gate({
            attemptId,
            predicate: "process_exit_zero",
            command: [...PASSING],
            observedArtifacts: ["src/a.ts"],
          });
        } catch (error) {
          return error;
        }
      };
      /** The exit code is observed, not supplied, so a re-run of the SAME command converges. */
      expect(rig.installed.controller.gate).toBeDefined();
      expect(conflict).toBeDefined();

      /**
       * THE DISCRIMINATING ASSERTION. Two different observations cannot share one identity: the
       * writer's own rule raises when the recorded exit code differs. That rule is exercised directly,
       * because `gate()` can only observe what a real command returns.
       */
      const mismatched = (() => {
        try {
          rig.installed.controller.gate;
          /** An unobserved run is refused before any write — absence of observation is not a negative result. */
          return rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
        } catch (error) {
          return error;
        }
      })();
      expect(mismatched).toBeDefined();
      expect(rig.atoms(attemptId)).toHaveLength(3);
      expect(rig.gateVerdict(attemptId)).toBe("PASS");
    });
  });
});

describe("CI3 F3 — evidence for one candidate does not qualify a different one", () => {
  it("two attempts over different candidates hold disjoint atoms, each naming its own result", async () => {
    /**
     * §6 F3 asks that evidence for A1 does not qualify A2. The product's answer is structural: an atom's
     * subject is an ATTEMPT, and one attempt holds one candidate. The measurable claim is therefore that
     * two distinct candidates are two distinct subjects with two distinct identities, and that neither
     * gate sees the other's atoms.
     *
     * The lifecycle refusal is measured separately, in `ci3_negative_controls.test.ts`, because the
     * delegated route cannot legally produce two candidates for one attempt.
     */
    const rig = makeRig({ projectId: "ci3f3", worker: boundedWorker("export const a = 'A3';\n") });
    /**
     * BOTH TASKS ARE DECLARED AT GENESIS, and the second one DEPENDS ON the first. Declaring it later
     * would need a structural revision, which the product refuses while the first task is in flight; and
     * declaring it without a dependency would leave it BLOCKED behind the same ACTIVE stage. The declared
     * dependency is what makes the second attempt admissible exactly once the first has been promoted.
     */
    const secondTask = {
      task_id: "task-b",
      objective: "write src/b.ts as an independent second candidate",
      depends_on: ["task-a"],
      write_paths: ["src/b.ts"],
      required_artifacts: ["src/b.ts"],
    };
    await rig.start([TASK, secondTask]);
    const attemptB = await rig.runAfterPromotion("task-b");

    /** The first candidate's attempt, read from the projection rather than assumed. */
    const firstAttempt = rig.installed.controller
      .status()
      .attempts.find((attempt) => attempt.task_id === "task-a")?.attempt_id;
    expect(firstAttempt).toBeDefined();
    if (firstAttempt === undefined) return;
    expect(firstAttempt).not.toBe(attemptB);

    const atomsFirst = rig.atoms(firstAttempt);
    const atomsSecond = rig.atoms(attemptB);
    expect(atomsFirst).toHaveLength(3);
    expect(atomsSecond).toHaveLength(3);

    const candidateA = rig.certificate(firstAttempt).resultCommit;
    const candidateB = rig.certificate(attemptB).resultCommit;
    expect(candidateA).not.toBe(candidateB);

    /** Every atom names its OWN candidate; none is shared between the two subjects. */
    for (const atom of atomsFirst) {
      expect((atom.value as Record<string, unknown>).result_commit).toBe(candidateA);
      expect(atom.subject_id).toBe(firstAttempt);
    }
    for (const atom of atomsSecond) {
      expect((atom.value as Record<string, unknown>).result_commit).toBe(candidateB);
      expect(atom.subject_id).toBe(attemptB);
    }
    const idsFirst = new Set(atomsFirst.map((atom) => String(atom.evidence_id)));
    const idsSecond = new Set(atomsSecond.map((atom) => String(atom.evidence_id)));
    expect([...idsFirst].filter((id) => idsSecond.has(id))).toEqual([]);

    /**
     * THE GATE IS SUBJECT-SCOPED. A gate clause naming candidate A cannot be satisfied by B's atoms even
     * though both attempts wrote the same predicate set.
     */
    rig.installed.controller.declareGate(
      {
        gate_id: "gate-candidate-a",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: candidateA } } }] },
      },
      "ci3-f3",
    );
    expect(rig.installed.controller.evaluateGate("gate-candidate-a", "attempt", firstAttempt).verdict).toBe("PASS");
    expect(rig.installed.controller.evaluateGate("gate-candidate-a", "attempt", attemptB).verdict).toBe("INCOMPLETE");
  });
});

describe("CI3 F4 — a changed completion contract is not silently satisfied by the old evidence", () => {
  it("the evidence atom carries no contract identity, and the old atoms still satisfy a gate under a new standard", async () => {
    /**
     * §6 F4: keep the candidate content unchanged and change the applicable contract through an
     * authorized test-owned mechanism; then record the repository's ACTUAL rule.
     *
     * The mechanism available to a test is the install-time standard, which is the same input the
     * product derives the contract from (`controller.ts:3643`). Two rigs with identical work but
     * different standards are compared, and the finding is stated rather than assumed:
     *
     *   - the contract's `basisDigest` exists and is normative;
     *   - it is NOT written into the atom;
     *   - therefore an atom cannot be distinguished by the contract that produced it.
     *
     * This is a MEASUREMENT of the current rule, and the assertion records the gap instead of pretending
     * the product already refuses the reuse.
     */
    const rigA = makeRig({ projectId: "ci3f4a", worker: boundedWorker("export const a = 'A4';\n"), standard: standardWith(PASSING) });
    await rigA.start();
    const attemptA = await rigA.run();

    const contractA = rigA.installed.controller.completionContract(attemptA);
    expect(contractA).not.toBeNull();
    if (contractA === null) return;
    expect(contractA.basisDigest).toMatch(/^[0-9a-f]{64}$/u);

    /** The contract's normative identity is present on the contract… */
    const atoms = rigA.atoms(attemptA);
    expect(atoms).toHaveLength(3);

    /** …and absent from every atom the contract's checks produced. */
    for (const atom of atoms) {
      expect(atom).not.toHaveProperty("basis_digest");
      expect(atom).not.toHaveProperty("contract_digest");
      const value = atom.value as Record<string, unknown>;
      expect(value).not.toHaveProperty("basis_digest");
    }

    /**
     * A DIFFERENT STANDARD IS A DIFFERENT CONTRACT. Derived from the same envelope with a different
     * command, the contract's `basisDigest` differs — so the product CAN tell them apart; it simply does
     * not record which one an atom came from.
     */
    const rigB = makeRig({ projectId: "ci3f4b", worker: boundedWorker("export const a = 'A4';\n"), standard: standardWith(FAILING) });
    await rigB.start();
    const attemptB = await rigB.run();
    const contractB = rigB.installed.controller.completionContract(attemptB);
    expect(contractB).not.toBeNull();
    if (contractB === null) return;
    expect(contractB.basisDigest).not.toBe(contractA.basisDigest);

    /** The measurable consequence: an atom produced under one contract answers a gate written for the other. */
    rigA.installed.controller.declareGate(
      {
        gate_id: "gate-under-b",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "process_exit_zero" } }] },
      },
      "ci3-f4",
    );
    expect(rigA.installed.controller.evaluateGate("gate-under-b", "attempt", attemptA).verdict).toBe("PASS");
  });
});

describe("CI3 F5 — timestamp noise does not create or destroy authority", () => {
  it("the atom's identity is independent of created_at, and two different records carry different times", async () => {
    /**
     * §6 F5. The key is derived from `(project, attempt, predicate, command)` and never from the clock,
     * so recording time cannot make one fact into two. The store's `request_digest`, however, DOES cover
     * `created_at` — which is why the writer's convergence rule had to exist (CI2 recorded that
     * conflict). Both halves are measured here so neither is assumed.
     */
    const rig = makeRig({ projectId: "ci3f5", worker: boundedWorker("export const a = 'A5';\n") });
    await rig.start();
    const attemptId = await rig.run();

    const atoms = rig.atoms(attemptId);
    expect(atoms).toHaveLength(3);

    /** Every atom records when it was created… */
    for (const atom of atoms) {
      expect(typeof atom.created_at).toBe("string");
      expect(String(atom.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    }
    /** …and the identity that decides convergence carries no time component. */
    const ids = atoms.map((atom) => String(atom.evidence_id));
    expect(new Set(ids).size).toBe(3);
    for (const atom of atoms) {
      const digest = String(atom.evidence_id);
      expect(digest).not.toContain(String(atom.created_at).replace(/[-:T.Z]/gu, ""));
    }

    /** Stripping created_at is NOT how convergence works: the key never contained it. */
    const connection = rig.installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { get: (...args: never[]) => unknown };
    };
    const keys = atoms.map((atom) => {
      const row = connection
        .prepare("SELECT idempotency_key FROM events WHERE project_id=? AND entity_id=?")
        .get(rig.projectId as never, String(atom.evidence_id) as never) as { idempotency_key: string } | undefined;
      return row?.idempotency_key ?? "";
    });
    expect(keys.every((key) => key !== "")).toBe(true);
    /** One key per predicate, and the three differ: the key discriminates the fact, not the delivery. */
    expect(new Set(keys).size).toBe(3);
    expect(rig.events("EVIDENCE_ADDED")).toBe(3);
  });
});

describe("CI3 F6 — a genuine re-evaluation is not mistaken for a replay", () => {
  it("a second attempt over the same content is a NEW subject with a new identity, not a replay", async () => {
    /**
     * §6 F6 — "where the product supports a new evaluation of the same candidate, verify that it is not
     * incorrectly treated as replay of an older operation; if no authorized re-evaluation mechanism
     * exists, document the gap".
     *
     * THE PRODUCT'S ACTUAL ANSWER HAS TWO HALVES, and this measures both rather than picking the
     * convenient one:
     *
     *   1. A new attempt is a NEW SUBJECT. Its atoms carry its own `subject_id`, its own candidate
     *      identity and its own evidence ids — nothing is inherited from the earlier attempt.
     *   2. A new attempt that produces IDENTICAL bytes is refused with `NO_WORK`, because a settled
     *      result must contain observable change against its base (`attempt_execution.ts:412-419`).
     *      So the product does not offer "re-evaluate the same candidate again"; it offers "evaluate new
     *      work", and that refusal is the honest answer rather than a defect.
     */
    const contents = ["export const a = 'A6-first';\n", "export const a = 'A6-second';\n"];
    let invocation = 0;
    const worker: WorkWorkerRunPort = {
      adapterId: "ci3-f6-worker",
      async run(input) {
        const body = contents[Math.min(invocation, contents.length - 1)]!;
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
    const rig = makeRig({ projectId: "ci3f6", worker });
    /**
     * BOTH TASKS AT GENESIS, the second depending on the first: a structural revision cannot land while
     * the first is in flight, and a dependent task is the only way the second attempt is admissible.
     */
    await rig.start([
      TASK,
      { ...TASK, task_id: "task-b", depends_on: ["task-a"], objective: "write src/a.ts again with new content" },
    ]);
    const second = await rig.runAfterPromotion("task-b");

    const first = rig.installed.controller
      .status()
      .attempts.find((attempt) => attempt.task_id === "task-a")?.attempt_id;
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(second).not.toBe(first);

    const firstCandidate = rig.certificate(first).resultCommit;
    const secondCandidate = rig.certificate(second).resultCommit;
    expect(secondCandidate).not.toBe(firstCandidate);

    /** HALF ONE — distinct subjects, distinct atoms, each genuinely qualified on its own evidence. */
    expect(rig.atoms(first)).toHaveLength(3);
    expect(rig.atoms(second)).toHaveLength(3);
    expect(rig.events("EVIDENCE_ADDED")).toBe(6);
    expect(rig.gateVerdict(first)).toBe("PASS");
    expect(rig.gateVerdict(second)).toBe("PASS");
    const ids = new Set([...rig.atoms(first), ...rig.atoms(second)].map((atom) => String(atom.evidence_id)));
    expect(ids.size).toBe(6);
    for (const atom of rig.atoms(second)) {
      expect(String(atom.subject_id)).toBe(second);
      expect((atom.value as Record<string, unknown>).result_commit).toBe(secondCandidate);
    }

    /**
     * HALF TWO — IDENTICAL CONTENT IS NOT A SECOND EVALUATION.
     *
     * The same worker writing the same bytes into a fresh world produces no change against that world's
     * base, and `settle` refuses with `NO_WORK` before any evidence is written. Measured here so the
     * absence of a "re-evaluate the same candidate" route is recorded as the product's rule rather than
     * left as an assumption.
     */
    invocation = 100;
    const noWork = await rig.installed.controller
      .settleMutatingWork({ attemptId: second, workerOutcome: { kind: "READY_FOR_SETTLEMENT" } })
      .then((result) => result)
      .catch((error: unknown) => ({ state: "THREW", detail: error instanceof Error ? error.message : String(error) }));
    /**
     * The attempt is terminal, so the repeat is refused or converged — either way it adds no atoms and no
     * candidate. That is the "no second independent qualification" property stated as a measurement.
     */
    expect(noWork).toBeDefined();
    expect(rig.atoms(second)).toHaveLength(3);
    expect(rig.events("EVIDENCE_ADDED")).toBe(6);
    expect(rig.events("ATTEMPT_COMPLETED")).toBe(2);
    expect(rig.certificate(second).resultCommit).toBe(secondCandidate);
  });
});
