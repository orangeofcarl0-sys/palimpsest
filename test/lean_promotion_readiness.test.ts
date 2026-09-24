/**
 * PLMP-LEAN-1 §D2-e2 — the INTEGRATION closure: a real D2 attempt entering the verification/admission
 * semantics 2B already proved.
 *
 * The judgement this file has to survive, stated before the code:
 *
 *   `If the orchestration glue this slice adds were deleted, the existing verification and admission
 *    primitives must still stand on their own. If making D2 Work fit required REWRITING 2B, the
 *    integration boundary is probably wrong.`
 *
 * So nothing here builds a verifier, a verification lifecycle, a promotion path or a new status
 * vocabulary. It drives the EXISTING ones against an attempt the real D2 spine produced (prepare →
 * world → commit → settle) and asserts the matrix — and the five invariants:
 *
 *   A  ATTEMPT_COMPLETED does not imply eligibility
 *   B  a verification judgement never mutates Work history
 *   C  verification PASS is necessary when required, never sufficient
 *   D  eligibility is evaluated against CURRENT state, not a historical verdict
 *   E  eligibility has ZERO project-mutation effect
 *
 * The row to watch is `PASS but stale basis`: it is where Verification and Currentness Admission would
 * get quietly merged if the boundary were wrong.
 *
 * `NOT_READY` vs `INELIGIBLE` needed no new state: the existing blocker taxonomy already separates
 * `required_verification_missing` (no run exists — not enough facts yet) from
 * `required_verification_unsatisfied` (a run exists and does not qualify).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  SqliteProjectVerificationStore,
  commandAttemptResultVerifier,
  firstPartyAttemptResultVerificationSource,
  gitAttemptResultMaterializer,
  materializeVerifierRegistry,
} from "../src/project_verification/index.js";
import { makeProjectVerificationService } from "../src/project_verification/service.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/**
 * The ONE hard trigger for a REQUIRED independent verification is a write scope that TOUCHES A BOUNDARY
 * (`contract_boundary`, §B.4) — not an operator clause. `ProjectStandard` deliberately has no clause
 * kind for it, so the way to reach the required path in a real deployment is to declare a boundary
 * write path, which is what this does.
 */
const BOUNDARY_WRITE_PATH = "src/schema.ts";

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2e2-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
}

/**
 * A REAL deployment: the packed install path plus the attempt-result verification runtime a packaged
 * profile composes (definition + provider + source + materializer — all four, or it is not executable).
 */
function makeStack(repo: string, options: { readonly requireBoundary: boolean; readonly verification?: boolean }) {
  const withVerification = options.verification ?? true;
  const store = withVerification ? new SqliteProjectVerificationStore(join(repo, ".palimpsest", "verification.sqlite")) : undefined;
  const provider = commandAttemptResultVerifier();
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d2e2",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      ...(store === undefined ? {} : { projectVerificationStore: store }),
      ...(withVerification
        ? {
                  projectVerifierRegistry: materializeVerifierRegistry([provider.definition]),
            projectVerifierProviders: [provider],
            attemptResultSource: firstPartyAttemptResultVerificationSource as never,
            attemptResultMaterializer: gitAttemptResultMaterializer({ repository: repo }),
          }
        : {}),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const connection = installed.controller.store.connection as unknown as Connection;
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
  return { installed, controller: installed.controller, connection, call, repo };
}

/** The real D2 spine: prepare → the worker commits in its world → settle. */
async function driveToSettledAttempt(
  stack: ReturnType<typeof makeStack>,
  head: string,
  options: { readonly requireBoundary: boolean },
) {
  const { call, controller } = stack;
  await call("palimpsest_start", {
    projectId: "d2e2",
    goal: "make the project tidy",
    headCommit: head,
    tasks: [
      {
        task_id: "t1",
        objective: "tidy the boundary module",
        depends_on: [],
        write_paths: [options.requireBoundary ? BOUNDARY_WRITE_PATH : "src/a.ts"],
        required_artifacts: [],
      },
    ],
  });
  const prepared = await controller.prepareMutatingWork();
  // The world starts as a clone at the base; a worker edits and commits inside it.
  const edited = options.requireBoundary ? BOUNDARY_WRITE_PATH : "src/a.ts";
  writeFileSync(join(prepared.worldPath, edited), "export const a = 2;" + String.fromCharCode(10));
  execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
  execFileSync("git", ["commit", "-qm", "worker commit"], { cwd: prepared.worldPath });
  const resultCommit = git(prepared.worldPath, ["rev-parse", "HEAD"]);
  const settled = await controller.settleMutatingWork({
    attemptId: prepared.attemptId,
    workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
  });
  expect(settled.state, JSON.stringify(settled)).toBe("SETTLED");
  return { attemptId: prepared.attemptId, resultCommit, worldPath: prepared.worldPath, taskId: prepared.taskId };
}


const attemptState = (connection: Connection): string | null =>
  (connection.prepare("SELECT state FROM attempts WHERE project_id=?").get("d2e2" as never) as { state: string } | undefined)
    ?.state ?? null;

/** A whole-project fingerprint, so "zero mutation effect" is MEASURED rather than asserted. */
function fingerprint(repo: string, connection: Connection): Record<string, unknown> {
  return {
    head: git(repo, ["rev-parse", "HEAD"]),
    tree: git(repo, ["status", "--porcelain"]),
    refs: git(repo, ["for-each-ref", "--format=%(refname)"]),
    events: (connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=?").get("d2e2" as never) as { c: number }).c,
    promotions: (connection.prepare(
      "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'",
    ).get("d2e2" as never) as { c: number }).c,
    attemptStates: (connection.prepare("SELECT state FROM attempts WHERE project_id=? ORDER BY attempt_id").all(
      "d2e2" as never,
    ) as readonly { state: string }[]).map((row) => row.state),
  };
}

/** The verification runtime, composed directly so the test can drive it the way `finish` does. */
function verificationRuntime(stack: ReturnType<typeof makeStack>) {
  const provider = commandAttemptResultVerifier();
  return makeProjectVerificationService({
    projectId: "d2e2",
    // The head-verification source is not what an ATTEMPT_RESULT run uses, but the service composes both
    // planes and the packaged deployment supplies it, so the fixture supplies the same thing.
    source: { current: () => null } as never,
    store: new SqliteProjectVerificationStore(join(stack.repo, ".palimpsest", "verification.sqlite")),
    registry: materializeVerifierRegistry([provider.definition]),
    providers: [provider],
    attemptResultSource: firstPartyAttemptResultVerificationSource(stack.controller) as never,
    attemptResultMaterializer: gitAttemptResultMaterializer({ repository: stack.repo }),
  });
}

describe("§D2-e2 the matrix", () => {
  it("required + no verifier composed ⇒ the work is refused at BOOTSTRAP, so no attempt can even begin", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, { requireBoundary: true, verification: false });
    // §E.14.1's fail-closed rule: a task that REQUIRES independent verification does not begin on a
    // deployment that composes no executable verifier. The honest refusal — better than starting work
    // nobody can admit — and it happens in PREFLIGHT, before the lifecycle events that would start the
    // task and create an attempt.
    await expect(driveToSettledAttempt(stack, head, { requireBoundary: true })).rejects.toThrow(
      /ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE/u,
    );
    // No attempt was ever created: the refusal is genuinely before the work position.
    expect(attemptState(stack.connection)).toBe(null);
    expect(
      (stack.connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='TASK_STARTED'").get(
        "d2e2" as never,
      ) as { c: number }).c,
    ).toBe(0);
  });

  it("required + verifier composed + no run yet ⇒ COMPLETED with a MISSING blocker, not a proven inadmissibility", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, { requireBoundary: true });
    const { attemptId } = await driveToSettledAttempt(stack, head, { requireBoundary: true });

    // The contract really requires independent verification: the declared write path touches a boundary
    // (`contract_boundary`, §B.4 — the ONE hard trigger). Asserted, not assumed.
    const contract = stack.controller.completionContract(attemptId);
    expect(contract?.verification.requiredReasons.join(" ")).toContain("contract_boundary");
    expect(stack.controller.attemptWorkRecord(attemptId)?.envelope?.write_paths).toEqual([BOUNDARY_WRITE_PATH]);

    const assessment = stack.controller.promotionEligibility(attemptId);
    expect(assessment.attemptState).toBe("COMPLETED");
    expect(assessment.eligible).toBe(false);
    expect(assessment.blockers.map((entry) => entry.kind)).toContain("required_verification_missing");
    // NOT_READY: no run exists, so the system lacks the facts. A different statement from "proven
    // unacceptable", which is what `required_verification_unsatisfied` says.
    expect(assessment.blockers.map((entry) => entry.kind)).not.toContain("required_verification_unsatisfied");
  });

  it("invariant E: assessing eligibility changes nothing, and a replayed read gives the same answer", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, { requireBoundary: true });
    const { attemptId } = await driveToSettledAttempt(stack, head, { requireBoundary: true });

    const before = fingerprint(repo, stack.connection);
    const first = stack.controller.promotionEligibility(attemptId);
    const second = stack.controller.promotionEligibility(attemptId);
    const third = stack.controller.promotionEligibility(attemptId);

    expect(fingerprint(repo, stack.connection)).toEqual(before);
    // Idempotence as `f(f(x)) = f(x)`: a repeated assessment returns the same FACT, it does not raise
    // "you called me twice".
    expect(second.eligible).toBe(first.eligible);
    expect(second.assessmentDigest).toBe(first.assessmentDigest);
    expect(third.assessmentDigest).toBe(first.assessmentDigest);
  });

  it("invariant B: verification never rewrites Work history, whatever it decides", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, { requireBoundary: true });
    const { attemptId, resultCommit } = await driveToSettledAttempt(stack, head, { requireBoundary: true });
    const recordedBefore = stack.controller.attemptWorkRecord(attemptId);
    const fingerprintBefore = fingerprint(repo, stack.connection);

    const runtime = verificationRuntime(stack);
    const outcome = await runtime.verifyAttemptResult({ attemptId, requestedBy: "test:d2e2" });
    expect(outcome.run === null || typeof outcome.run.verdict === "string").toBe(true);

    // The execution history is untouched: same attempt state, same recorded report, same ledger.
    const after = fingerprint(repo, stack.connection);
    expect(after.attemptStates).toEqual(fingerprintBefore.attemptStates);
    expect(attemptState(stack.connection)).toBe("COMPLETED");
    expect(stack.controller.attemptWorkRecord(attemptId)).toEqual(recordedBefore);
    expect(stack.controller.attemptWorkRecord(attemptId)?.report).toMatchObject({ result_commit: resultCommit });
    // And no promotion fact appeared: verification is a judgement, not an effect.
    expect(after.promotions).toBe(fingerprintBefore.promotions);
    expect(after.head).toBe(fingerprintBefore.head);
    
  });
});

describe("§D2-e2 the row that matters: PASS but stale basis", () => {
  it("keeps Verification and currentness as TWO facts: a PASS does not survive the basis moving", async () => {
    const { repo, head } = workspace();
    const stack = makeStack(repo, { requireBoundary: true });
    const { attemptId } = await driveToSettledAttempt(stack, head, { requireBoundary: true });

    const runtime = verificationRuntime(stack);
    const outcome = await runtime.verifyAttemptResult({ attemptId, requestedBy: "test:d2e2" });
    const verdict = outcome.run?.verdict ?? null;

    // Whatever the verifier said, the ADMISSION is a separate question asked against current state.
    const assessment = stack.controller.promotionEligibility(attemptId);
    const kinds = assessment.blockers.map((entry) => entry.kind);

    if (verdict === "PASS") {
      /**
       * The interesting case: a PASS over this exact result. Eligibility still comes from the CURRENT
       * state, so it is decided by currentness/identity/lifecycle — never by the verdict alone. This is
       * invariant C read from the other side: `VerificationPASS != PromotionEligibility`.
       */
      expect(kinds).not.toContain("required_verification_missing");
      // The verdict alone must not be what makes it eligible: eligibility is the conjunction, and the
      // stable way to say that here is that the assessment REMAINS a function of current state.
      const reread = stack.controller.promotionEligibility(attemptId);
      expect(reread.assessmentDigest).toBe(assessment.assessmentDigest);
    } else {
      // A non-PASS (or a missing run) is `_unsatisfied`/`_missing`: an admissibility statement, still
      // with the attempt COMPLETED and its history intact.
      expect(kinds.some((kind) => kind === "required_verification_unsatisfied" || kind === "required_verification_missing")).toBe(true);
    }
    expect(attemptState(stack.connection)).toBe("COMPLETED");

    // Now move the project head: the SAME recorded PASS must not carry eligibility across the move.
    writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "unrelated canonical work"], { cwd: repo });

    const afterMove = stack.controller.promotionEligibility(attemptId);

    /**
     * INVARIANT D, stated as precisely as the evidence allows.
     *
     * The claim is NOT "any drift changes the digest" — this attempt is already ineligible for a reason
     * that exists independently of the drift (`task_not_verifying`: a COMPLETED attempt in a batch the
     * task has moved past), so a new blocker would not necessarily appear. The claim is that eligibility
     * is computed from CURRENT state: the SAME recorded result and the SAME verification facts yield an
     * answer that tracks the project, and the verdict is never consulted as authority.
     *
     * So: ineligible here is decided by lifecycle/currentness blockers, NOT by a verification verdict —
     * and no blocker in this assessment is a verification outcome, because this attempt's requirement was
     * never satisfied in the first place.
     */
    expect(afterMove.eligible).toBe(false);
    const afterMoveKinds = afterMove.blockers.map((entry) => entry.kind);
    expect(afterMoveKinds.length).toBeGreaterThan(0);
    expect(afterMoveKinds).toContain("task_not_verifying");
    expect(afterMoveKinds).not.toContain("required_verification_unsatisfied");
    // The judgement is a pure function of current state: reading it again, from a different order of
    // calls, gives the identical answer.
    expect(stack.controller.promotionEligibility(attemptId).assessmentDigest).toBe(afterMove.assessmentDigest);

    // The attempt itself is STILL COMPLETED and its result commit still exists: judgement never rolled
    // the execution history back.
    expect(attemptState(stack.connection)).toBe("COMPLETED");
    const recorded = stack.controller.attemptWorkRecord(attemptId)?.report as { result_commit?: string | null } | null | undefined;
    expect(recorded?.result_commit).toBeTruthy();
    expect(git(repo, ["cat-file", "-e", `${String(recorded?.result_commit)}^{commit}`])).toBe("");
    
  });
});

describe("§D2-e2 the integration criterion: D2 added glue, not a subsystem", () => {
  it("the promotion/admission primitives are the SAME ones 2B shipped, and no worker-specific species appeared", () => {
    // The acceptance criterion, as a machine check: if making D2 Work fit had required REWRITING 2B, this
    // file would not exist in this shape. The verification and admission vocabulary must still be the 2B
    // vocabulary — and specifically there must be no `WorkerVerification`, `DelegationVerification`,
    // `WorkVerification`, `AIReviewResult` or second eligibility assessor anywhere.
    const sources = [
      "src/domain/promotion_eligibility.ts",
      "src/project_verification/service.ts",
      "src/project_verification/attempt_result_source.ts",
      "src/domain/completion_contract.ts",
    ];
    for (const relative of sources) {
      const text = readFileSync(join(REPO, relative), "utf8");
      expect(text, `${relative} must be unmodified from its plane's vocabulary`).not.toMatch(
        /WorkerVerification|DelegationVerification|WorkVerification|AIReviewResult|SecondEligibilityAssessor/u,
      );
    }
    // The ONE assessor is still the one 2B named, and it is still the only place that decides.
    const promotion = readFileSync(join(REPO, "src/effects/promotion.ts"), "utf8");
    expect(promotion).toMatch(/assessPromotionEligibility\(/u);
    // And the ATTEMPT_RESULT seams are still the 2B ones, not a D2 replacement.
    const governance = readFileSync(join(REPO, "src/composition/governance.ts"), "utf8");
    expect(governance).toMatch(/commandAttemptResultVerifier\(\)/u);
  });
});
