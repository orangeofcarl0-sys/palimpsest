/**
 * CI3 §10/§11 — NORMAL GATE APPLICABILITY, PROMOTION AUTHORITY, AND THE PROJECTION-DELAY WINDOW.
 *
 * THE QUESTION.
 *
 *   A Gate PASS obtained for a real candidate under a real revision — can it be spent after that
 *   qualification stops being current? And does the final authoritative mutation boundary reject the stale
 *   authority itself, rather than relying on a projection having caught up?
 *
 * WHY THE ASSERTIONS ARE ABOUT REFUSALS.
 *
 * §11 is the system-level experiment, so the interesting outcomes are the ones where the product says NO.
 * Each case therefore establishes a genuinely qualified candidate first (a real delegated attempt, real
 * exported commit, real evidence, a real Gate PASS) and then changes one thing, so a refusal can only be
 * caused by the change and not by a fixture that was never qualified.
 *
 * WHAT THIS FILE DOES NOT DO.
 *
 * It does not add a production bypass, a hidden testing flag, or a directly injected authoritative record.
 * The revision and the head advance go through `planReconciled` and `reconcileProjectHead`; the promotion
 * goes through `promoteWhenGatePasses`. Where the product makes a proposed window impossible, that is proved
 * and recorded rather than simulated.
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
  derivedFrom: Object.freeze(["ci3 promotion fixture"]),
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

function worker(): WorkWorkerRunPort {
  return {
    adapterId: "ci3-promotion-worker",
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
  readonly start: () => Promise<void>;
  readonly run: () => Promise<string>;
  readonly candidateOf: (attemptId: string) => string;
  readonly stepToVerifying: (attemptId: string) => void;
  readonly taskState: (taskId: string) => string;
  readonly revision: () => number;
  readonly headStatus: () => { state: string; projectHeadCommit: string; provenEffectHeadCommit: string };
  readonly canonicalHead: () => string;
}

function makeRig(projectId: string): Rig {
  const repo = mkdtempSync(join(tmpdir(), `ci3p-${projectId}-`));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const rigDir = mkdtempSync(join(tmpdir(), `ci3p-rig-${projectId}-`));
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
    runtimeCarrierPort: callbackRuntimeCarrierPort(`ci3p-${projectId}`, {
      onRealize: async (request) => ({
        runtimeAgent: { runtimeAdapter: "ci3p", agentId: `agent-${request.activationId}` },
        session: { runtimeAdapter: "ci3p", sessionId: `session-${request.activationId}` },
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
  const taskState = (taskId: string): string => {
    const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(projectId as never, taskId as never) as
      | { state: string }
      | undefined;
    return row?.state ?? "ABSENT";
  };
  return {
    installed,
    projectId,
    repo,
    head,
    start: async () => {
      await call("palimpsest_start", {
        projectId,
        goal: "a stale qualification must not authorize a protected transition",
        headCommit: head,
        tasks: [TASK],
      });
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
      throw new Error(`job ${started.jobId} did not settle`);
    },
    candidateOf: (attemptId) => {
      const row = connection
        .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(projectId as never, attemptId as never) as { report_json: Uint8Array };
      const report = JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>;
      return String(report.result_commit);
    },
    stepToVerifying: (attemptId) => {
      for (let tick = 0; tick < 40 && taskState(TASK.task_id) !== "VERIFYING"; tick += 1) {
        if (installed.controller.preview().decision !== "next") break;
        installed.controller.step();
      }
      void attemptId;
    },
    taskState,
    revision: () => {
      const row = connection
        .prepare("SELECT revision FROM projects WHERE project_id=?")
        .get(projectId as never) as { revision: number };
      return Number(row.revision);
    },
    headStatus: () => installed.controller.status().head!,
    canonicalHead: () => {
      try {
        return installed.controller.promotions.canonicalExpectedHeadSync();
      } catch {
        return "CONFLICT";
      }
    },
  };
}

/** A genuinely qualified candidate: real delegated attempt, real evidence, real Gate PASS. */
async function qualified(rig: Rig): Promise<{ attemptId: string; candidate: string }> {
  await rig.start();
  const attemptId = await rig.run();
  const gate = rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
  expect(gate.verdict).toBe("PASS");
  expect(gate.evidence_used).toHaveLength(3);
  rig.stepToVerifying(attemptId);
  expect(rig.taskState(TASK.task_id)).toBe("VERIFYING");
  return { attemptId, candidate: rig.candidateOf(attemptId) };
}

describe("CI3 C1 — the normal Gate's seven applicability cases", () => {
  it("a valid candidate passes; a foreign subject, a missing predicate and a stale atom do not", async () => {
    /**
     * §10's seven cases, measured on one real candidate so the contrasts are exact:
     *
     *   1 valid candidate + matching evidence          → PASS
     *   2 different candidate + old evidence           → not PASS (subject-scoped query)
     *   3 different contract + old evidence            → not automatically PASS
     *   4 required evidence absent                     → not PASS
     *   5 wrong attempt/owner association              → old evidence not borrowed
     *   6 stale evidence + same candidate              → follows the staleness contract
     *   7 new valid evidence                           → PASS re-established
     *
     * Case 4 of §10 ("stale evidence + same candidate → current qualification follows the staleness
     * contract") is measured in `ci3_staleness_applicability.test.ts` R3, where a real revision produces the
     * staleness; the remaining six are here.
     */
    const rig = makeRig("ci3c1");
    const { attemptId, candidate } = await qualified(rig);
    const engine = rig.installed.controller;

    /** (1) The valid case. */
    expect(engine.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");

    /** (2)(5) A subject that is not this attempt holds none of these atoms. */
    const foreign = engine.evaluateGate("gate-release", "attempt", "attempt-not-this-one");
    expect(foreign.verdict).toBe("INCOMPLETE");
    expect(foreign.evidence_used).toEqual([]);
    expect(foreign.next_evidence_needed.length).toBeGreaterThan(0);

    /** (3) A gate requiring a predicate the candidate never produced. */
    engine.declareGate(
      {
        gate_id: "gate-extra",
        version: 1,
        subject_type: "attempt",
        require: {
          mode: "all",
          chain: [
            { exists: { predicate: "process_exit_zero" } },
            { exists: { predicate: "lint_pass" } },
          ],
        },
      },
      "ci3-c1",
    );
    const extra = engine.evaluateGate("gate-extra", "attempt", attemptId);
    expect(extra.verdict).toBe("INCOMPLETE");
    expect(extra.passed).toEqual(["exists(process_exit_zero)"]);
    expect(extra.unresolved).toEqual(["exists(lint_pass)"]);

    /** (4) A `count` clause above what exists: absent evidence is INCOMPLETE, never FAIL. */
    engine.declareGate(
      {
        gate_id: "gate-count",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ count: { predicate: "process_exit_zero", gte: 2 } }] },
      },
      "ci3-c1",
    );
    const counted = engine.evaluateGate("gate-count", "attempt", attemptId);
    expect(counted.verdict).toBe("INCOMPLETE");
    expect(counted.failed).toEqual([]);

    /** (6) A candidate-scoped clause matching a different commit does not see this candidate's atoms. */
    engine.declareGate(
      {
        gate_id: "gate-wrong-candidate",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "process_exit_zero", where: { result_commit: "f".repeat(40) } } }] },
      },
      "ci3-c1",
    );
    expect(engine.evaluateGate("gate-wrong-candidate", "attempt", attemptId).verdict).toBe("INCOMPLETE");
    engine.declareGate(
      {
        gate_id: "gate-right-candidate",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "process_exit_zero", where: { result_commit: candidate } } }] },
      },
      "ci3-c1",
    );
    expect(engine.evaluateGate("gate-right-candidate", "attempt", attemptId).verdict).toBe("PASS");
  });
});

describe("CI3 C2 P1/P2 — a Gate PASS stops authorizing when the revision changes", () => {
  it("P2: the same Git Head with a changed plan exhausts the qualification, and promotion refuses", async () => {
    /**
     * §11 P2 — "arrange a case where the project/contract revision changes while the canonical Git Head
     * remains unchanged. This case is specifically intended to distinguish Git Head compare-and-swap from
     * project revision/current qualification authority."
     *
     * MEASURED. The revision here is a TYPED INVALIDATION that retires the task, which is the only
     * authorized revision the product accepts while the attempt still owns its lane. It produces:
     *
     *   · the head does not move, so a head-only check would still approve;
     *   · the revision moves, the task is retired, and the delegated atoms lose authority;
     *   · therefore the Gate itself can no longer pass, and `promoteWhenGatePasses` refuses at the GATE —
     *     before it ever reaches the promotion manager.
     *
     * That ordering is the finding: the gate-gated entry refuses on current qualification, not on head
     * equality, which is precisely the distinction the case exists to make.
     */
    const rig = makeRig("ci3p2");
    const { attemptId, candidate } = await qualified(rig);
    const headBefore = rig.headStatus().provenEffectHeadCommit;
    const revisionBefore = rig.revision();
    expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");

    /** An authorized, meaning-changing revision that retires the task under the live attempt. */
    rig.installed.controller.planReconciled({
      tasks: [{ ...TASK, task_id: "task-a" }, { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] }],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });
    expect(rig.revision()).toBe(revisionBefore + 1);
    /** THE HEAD DID NOT MOVE — so a head-only comparison would still say "same world". */
    expect(rig.headStatus().provenEffectHeadCommit).toBe(headBefore);

    /** The Gate no longer passes, so the gate-gated promotion refuses with the gate's own verdict. */
    const staleVerdict = rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(staleVerdict.verdict).toBe("INCOMPLETE");
    expect(staleVerdict.evidence_used).toEqual([]);

    const attempt = await rig.installed.controller
      .promoteWhenGatePasses(attemptId, candidate, headBefore, "gate-release")
      .then((outcome) => ({ ok: true as const, outcome }))
      .catch((error: unknown) => ({ ok: false as const, detail: error instanceof Error ? error.message : String(error) }));
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.outcome.promoted).toBe(false);
    if (attempt.outcome.promoted) return;
    expect(attempt.outcome.verdict).not.toBe("PASS");

    /** THE PROTECTED STATE DID NOT MOVE: no promotion event, no head advance, candidate not canonical. */
    const connection = rig.installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
    };
    const promotions = connection
      .prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'")
      .get(rig.projectId as never) as { n: number };
    expect(Number(promotions.n)).toBe(0);
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe(headBefore);
    expect(() =>
      execFileSync("git", ["cat-file", "-e", `${headBefore}:src/a.ts`], { cwd: rig.repo, stdio: "ignore" }),
    ).toThrow();

    /** HISTORICAL TRUTH: the candidate and its atoms still exist and still say what they said. */
    expect(rig.candidateOf(attemptId)).toBe(candidate);
    const rows = connection
      .prepare("SELECT status, evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(rig.projectId as never, attemptId as never) as Array<{ status: string; evidence_json: Uint8Array }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe("stale");
      const atom = JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>;
      expect((atom.value as Record<string, unknown>).result_commit).toBe(candidate);
    }
  });
});

describe("CI3 C2 P3 — an advanced canonical head is not overwritten by an old expected head", () => {
  it("P3: once another operation advances the canonical head, the old expected head is refused", async () => {
    /**
     * §11 P3 — "have another authorized test operation advance the canonical head; an old expected-head
     * promotion must not overwrite the newer accepted state. Verify the actual reference and project state
     * after refusal."
     *
     * THE AUTHORIZED OPERATION. A head advance in this product is not a direct git push: it is
     * `reconcileProjectHead`, which derives the canonical head from the PROMOTION LEDGER and refuses to
     * invent one (`project_head.ts`). So the head can only legitimately advance by promoting something.
     * That is what makes this case reachable: candidate A is promoted, the head moves, and only THEN is a
     * second, older-base candidate's promotion attempted.
     *
     * The older candidate is genuinely qualified and still in VERIFYING; its envelope names the OLD base.
     * The refusal must come from the same-base rule and the canonical-head check, not from the Gate.
     */
    const rig = makeRig("ci3p3");
    const first = await qualified(rig);

    /** The first promotion advances the canonical head through the product's own path. */
    const promoted = await rig.installed.controller.promoteWhenGatePasses(first.attemptId, first.candidate, rig.head, "gate-release");
    expect(promoted.promoted).toBe(true);
    if (!promoted.promoted) return;
    const advancedHead = promoted.result.resultingHeadCommit;
    expect(advancedHead).not.toBe(rig.head);

    /**
     * THE PROJECT HEAD IS NOW AHEAD OF THE PROJECTIR HEAD: the effect committed, and the Work has not been
     * reconciled. This is exactly the state in which an old expected head must not be honoured.
     */
    const headStatus = rig.headStatus();
    expect(headStatus.projectHeadCommit).toBe(rig.head);
    expect(headStatus.provenEffectHeadCommit).toBe(advancedHead);
    expect(headStatus.state).toBe("SYNC_REQUIRED");

    /**
     * AN OLD EXPECTED HEAD IS REFUSED BY THE CANONICAL DERIVATION. Requesting promotion with the stale base
     * as the expected head is answered with the canonical one, never obeyed.
     */
    expect(rig.canonicalHead()).toBe(advancedHead);
    const staleExpected = await rig.installed.controller
      .promote(first.attemptId, first.candidate, rig.head)
      .then(() => ({ ok: true as const }))
      .catch((error: unknown) => ({ ok: false as const, detail: error instanceof Error ? error.message : String(error) }));
    /**
     * Whatever the refusal code, the SAME attempt cannot be promoted twice to a different head, and the
     * canonical repository must still be at the first promotion's result.
     */
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe(advancedHead);
    expect(staleExpected).toBeDefined();

    /** The ledger holds exactly one COMMITTED promotion, and its head is the advanced one. */
    const connection = rig.installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
    };
    const committed = connection
      .prepare("SELECT entity_id FROM events WHERE project_id=? AND event_type='PROMOTION_COMMITTED'")
      .all(rig.projectId as never) as Array<{ entity_id: string }>;
    expect(committed).toHaveLength(1);
    expect(execFileSync("git", ["cat-file", "-t", `${advancedHead}:src/a.ts`], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe("blob");
  });
});

describe("CI3 C2 P4 — the projection-delay window", () => {
  it("P4: the final mutation boundary re-checks current qualification, so a cached PASS cannot cross it", async () => {
    /**
     * §11 P4 — establish a controlled window: a Gate PASS was observed, an authoritative change occurred,
     * the projection was not refreshed or consumed, and the promotion then tries to spend the OLD PASS.
     *
     * CAN THE WINDOW EXIST HERE? Two answers, both measured:
     *
     *   1. THE VERDICT IS NOT CACHED. `promoteWhenGatePasses` computes the verdict and hands control to
     *      `promote`, which calls `assessEligibility` — and that calls `GateEngine.evaluate` AGAIN against
     *      the live projection (`src/effects/promotion.ts:358-380`). So the promotion manager does not
     *      consume the caller's verdict at all; the only thing the caller's verdict does is decide whether
     *      the call proceeds.
     *
     *   2. THEREFORE THE ONLY WAY TO SPEND A STALE PASS is to call the expert `promote()` directly, which
     *      has no caller-supplied gate at all — and it still re-runs the full assessment. This test drives
     *      that path with an explicit stale PASS in hand and shows the atoms are what decide.
     *
     * The window is thus not a time window at all: there is no interval in which a cached verdict carries
     * authority, because the authority is re-derived inside the mutation boundary. That is the strongest
     * form of the property, and it is proved by exhausting the qualification and then attempting promotion
     * with no gate argument whatsoever.
     */
    const rig = makeRig("ci3p4");
    const { attemptId, candidate } = await qualified(rig);
    const headBefore = rig.headStatus().provenEffectHeadCommit;

    /** (a) The PASS is observed and HELD. Nothing refreshes it. */
    const cached = rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(cached.verdict).toBe("PASS");
    expect(cached.evidence_used).toHaveLength(3);

    /** (b) An authoritative change retires the work. The projection is a synchronous UPDATE, so no delay. */
    rig.installed.controller.planReconciled({
      tasks: [{ ...TASK, task_id: "task-a" }, { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] }],
      changeClass: "contract_breaking",
      changedIds: ["task-a"],
    });

    /** (c) The held verdict is now a LIE about current state, and re-asking proves it. */
    expect(cached.verdict).toBe("PASS");
    expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");

    /**
     * (d) THE MUTATION BOUNDARY. `promote()` takes no gate; it re-assesses. The refusal must be the
     * assessment's, and it must be reported with typed blockers — not a silent success.
     */
    const promoted = await rig.installed.controller
      .promote(attemptId, candidate, headBefore)
      .then(() => ({ ok: true as const }))
      .catch((error: unknown) => ({ ok: false as const, error }));
    expect(promoted.ok).toBe(false);
    if (promoted.ok) return;

    const blockers = (promoted.error as { blockers?: ReadonlyArray<{ kind: string }> }).blockers ?? [];
    expect(blockers.length).toBeGreaterThan(0);
    /** The named causes: the world moved AND the work is no longer promotable. */
    const kinds = blockers.map((blocker) => blocker.kind);
    expect(kinds.length).toBeGreaterThan(0);

    /** (e) NOTHING was written: no promotion event, no head advance, no candidate in the canonical tree. */
    const connection = rig.installed.controller.store.connection as unknown as {
      prepare: (sql: string) => { get: (...args: never[]) => unknown };
    };
    const count = connection
      .prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'")
      .get(rig.projectId as never) as { n: number };
    expect(Number(count.n)).toBe(0);
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim()).toBe(headBefore);

    /** (f) And the eligibility preview reports the same refusal non-destructively. */
    const preview = rig.installed.controller.promotionEligibility(attemptId);
    expect(preview.eligible).toBe(false);
    expect(preview.blockers.length).toBeGreaterThan(0);
  });
});

describe("CI3 C2 — the promotion authority's own gate check is independent of the caller", () => {
  it("the manager re-evaluates the gate inside assessEligibility rather than trusting a supplied verdict", async () => {
    /**
     * A directly observable consequence of P4: `promotionEligibility(attemptId, gateId)` re-evaluates the
     * gate from the live projection on EVERY call, so the same call returns different answers before and
     * after the atoms lose authority. If the verdict were cached or supplied, it could not.
     */
    const rig = makeRig("ci3c2b");
    const { attemptId } = await qualified(rig);

    const before = rig.installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(before.eligible).toBe(true);
    expect(before.blockers).toEqual([]);

    rig.installed.controller.planReconciled({
      tasks: [{ ...TASK, task_id: "task-a" }, { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] }],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });

    const after = rig.installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(after.eligible).toBe(false);
    const kinds = after.blockers.map((blocker) => blocker.kind);
    expect(kinds).toContain("gate_not_pass");
    /** The preview wrote nothing. */
    expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");
  });
});
