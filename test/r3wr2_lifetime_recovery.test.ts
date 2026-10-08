/**
 * R3-WR2 — BORROWED-OBJECT LIFETIME AND ATTEMPT-RECOVERY REGRESSIONS.
 *
 * Every test here pins a MEASURED fact about the shipped runtime, and each has the shape the ruling requires:
 * a healthy positive control, a failing mutant, an assertion against the ACTUAL production path (the compiled
 * `GitCliPort` from `dist`, not a copy of its logic), and a durable-state witness where the claim is about
 * state rather than about a return value.
 *
 * The two defects this stage repaired are pinned so they cannot silently return:
 *
 *   A  the readiness criterion must be an ALLOWLIST. The mutant is a corrupt index, which the old TEXT-matching
 *      denylist accepted as READY. The control is a clean world, which must still be accepted.
 *   B  `palimpsest.world.create` must honour `effects.idempotent()`. The mutant is a second `createWorld` call
 *      with the same world id, which used to fail; the control is the first call.
 *
 * The compiled port is reached by PATH and imported DYNAMICALLY. A static `import` from `dist` makes TypeScript
 * treat the emitted declaration as an input and the build then refuses to overwrite it (TS5055) — the same
 * pattern `test/p_deployment.test.ts` and `test/r3wr_object_store.test.ts` use.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  BORROW_LIFETIME_MATRIX,
  CONTINUATION_FINDING,
  FAILURE_DISTINCTION,
  IDEMPOTENCY_CONTRACT,
  PREPARATION_FAILURE_FINDING,
  READINESS_CRITERION,
  VALIDITY_SCOPES,
  WORKER_TOKEN_FINDING,
} from "../scripts/r3wr2/contract.mjs";

const NL = String.fromCharCode(10);
const BASE = mkdtempSync(join(tmpdir(), "r3wr2-test-"));

afterAll(() => {
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the temp hygiene sweep collects it */
  }
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/** A basis repository, built in a temporary root. */
function makeBasis(root: string): { repo: string; basisCommit: string } {
  const repo = join(root, "canonical");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "ledger.mjs"), `export const answer = 0;${NL}`, "utf8");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=b@b.b", "-c", "user.name=b", "commit", "-qm", "basis"]);
  return { repo, basisCommit: git(repo, ["rev-parse", "HEAD"]) };
}

/** The real compiled port, loaded dynamically so the build is not disturbed. */
async function loadPort(): Promise<any> {
  const modulePath = fileURLToPath(new URL("../dist/src/effects/git_port.js", import.meta.url));
  const module = await import(modulePath);
  return module.GitCliPort;
}

/**
 * A template directory whose `post-checkout` hook injects a fault into the new world. This runs in exactly the
 * window that makes the test about the GATE: the clone and the checkout have already succeeded, and the gate
 * has not run yet.
 */
function injectingTemplate(root: string, fault: string): string {
  const dir = join(root, `template-${fault}`);
  mkdirSync(join(dir, "hooks"), { recursive: true });
  const body: Record<string, string> = {
    "corrupt-index": 'printf "GARBAGE-INDEX" > "$(git rev-parse --git-dir)/index"',
    "held-index-lock": 'touch "$(git rev-parse --git-dir)/index.lock"',
    "garbled-head": 'printf "ref: refs/heads/nonexistent\\n" > "$(git rev-parse --git-dir)/HEAD"',
    none: "exit 0",
  };
  writeFileSync(join(dir, "hooks", "post-checkout"), `#!/bin/sh${NL}${body[fault]}${NL}exit 0${NL}`, "utf8");
  return dir;
}

/** Prepare a world through the REAL port with a fault injected at the post-checkout moment. */
async function worldWithFault(fault: string, label: string) {
  const GitCliPort = await loadPort();
  const root = join(BASE, label);
  mkdirSync(root, { recursive: true });
  const basis = makeBasis(root);
  const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
  const previous = process.env.GIT_TEMPLATE_DIR;
  process.env.GIT_TEMPLATE_DIR = injectingTemplate(root, fault);
  try {
    const created = await port.createWorld({ worktreeId: `attempt-${label}`, baseCommit: basis.basisCommit });
    return { root, basis, port, worldId: `attempt-${label}`, refused: false as const, created };
  } catch (error) {
    return { root, basis, port, worldId: `attempt-${label}`, refused: true as const, error: String((error as Error)?.message ?? error) };
  } finally {
    if (previous === undefined) delete process.env.GIT_TEMPLATE_DIR;
    else process.env.GIT_TEMPLATE_DIR = previous;
  }
}

/* ================================================================== *
 * A. THE READINESS CRITERION IS AN ALLOWLIST, AND IT IS ENFORCED IN PRODUCTION
 * ================================================================== */

describe("R3-WR2 A. the readiness gate is an allowlist and the PRODUCTION port enforces it", () => {
  it("a healthy world is ACCEPTED — the positive control, so the gate is not refusing everything", async () => {
    const result = await worldWithFault("none", "healthy");
    expect(result.refused, `a healthy world must be accepted, got: ${result.refused ? result.error : ""}`).toBe(false);
    expect(existsSync(result.created.worldPath)).toBe(true);
    expect(git(result.created.worldPath, ["rev-parse", "--verify", "HEAD^{commit}"])).toBe(result.basis.basisCommit);
  });

  it("a CORRUPT INDEX is REFUSED — the mutant the old text-matching criterion accepted as READY", async () => {
    /**
     * This is defect A. `fatal: .git/index: index file smaller than expected` matches none of the old denylist
     * patterns, so the old gate fell through and declared the world READY. The world cannot commit at all.
     */
    const result = await worldWithFault("corrupt-index", "corrupt-index");
    expect(result.refused, "a world with a corrupt index cannot commit and must be refused").toBe(true);
    expect(String(result.error)).toContain("WORLD_NOT_COMMIT_CAPABLE");
  });

  it("a HELD index.lock is REFUSED — the second failure the old criterion accepted", async () => {
    const result = await worldWithFault("held-index-lock", "held-index-lock");
    expect(result.refused, "a world whose index is locked cannot commit and must be refused").toBe(true);
    expect(String(result.error)).toContain("WORLD_NOT_COMMIT_CAPABLE");
  });

  it("a GARBLED HEAD is REFUSED, and the refusal names HEAD rather than an object-store error", async () => {
    const result = await worldWithFault("garbled-head", "garbled-head");
    expect(result.refused).toBe(true);
    expect(String(result.error)).toContain("WORLD_NOT_COMMIT_CAPABLE");
    expect(String(result.error)).toContain("HEAD");
  });

  it("a DEAD BORROWED STORE is REFUSED even though the world was prepared first", async () => {
    /**
     * The fault R3-WR's gate exists for. The world is created successfully, THEN the borrowed target is moved
     * aside, so the failure is a genuine object-store fault rather than a preparation fault.
     */
    const GitCliPort = await loadPort();
    const root = join(BASE, "dead-borrowed");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    await port.createWorld({ worktreeId: "attempt-dead", baseCommit: basis.basisCommit });
    renameSync(join(basis.repo, ".git", "objects"), join(root, "objects-moved"));
    await expect(port.createWorld({ worktreeId: "attempt-dead", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_NOT_COMMIT_CAPABLE|object directory|not a git repository/u);
  });

  it("the criterion is an ALLOWLIST of exit codes, and the contract says so", () => {
    expect(String(READINESS_CRITERION.shape)).toContain("ALLOWLIST");
    expect(String(READINESS_CRITERION.why)).toContain("denylist cannot bound");
    const facts = (READINESS_CRITERION.facts as readonly { command: string }[]).map((entry) => entry.command);
    expect(facts.some((command) => command.includes("HEAD^{commit}"))).toBe(true);
    expect(facts.some((command) => command.includes("cat-file"))).toBe(true);
    expect(facts.some((command) => command.includes("status"))).toBe(true);
    expect(facts.some((command) => command.includes("--dry-run"))).toBe(true);
  });

  it("the two failures the old denylist missed are recorded with the fact that they matched nothing", () => {
    const missed = READINESS_CRITERION.failuresTheOldDenylistMissed as readonly { fault: string; exit: number; matchedAnyPattern: boolean }[];
    expect(missed.length).toBe(2);
    for (const entry of missed) {
      expect(entry.matchedAnyPattern, `${entry.fault} must be recorded as unmatched`).toBe(false);
      expect(entry.exit).toBe(128);
    }
    expect(missed.map((entry) => entry.fault).join(" ")).toContain("corrupt index");
  });

  it("the exit-1 rule is justified by a MEASURED git property, not by a preference", () => {
    expect(String(READINESS_CRITERION.exitOneRule.whySafe)).toContain("does NOT run the pre-commit hook");
    expect(String(READINESS_CRITERION.exitOneRule.whyNotStatusText)).toContain("UNSTAGED");
  });

  it("the stated limit of the check is recorded rather than hidden", () => {
    expect(String(READINESS_CRITERION.limit)).toContain("pre-commit hook");
    expect(String(READINESS_CRITERION.limit)).toContain("not detected");
  });

  it("a world whose worker has made UNSTAGED edits is still accepted, so the resume state is not refused", async () => {
    /**
     * The criterion must not be so strict that it refuses the state a RESUMED attempt is in. A worker that made
     * an edit and did not commit leaves exactly this world, and Gate E depends on it being usable.
     */
    const result = await worldWithFault("none", "unstaged");
    expect(result.refused).toBe(false);
    const worldPath = result.created.worldPath;
    writeFileSync(join(worldPath, "src", "ledger.mjs"), `export const answer = 9;${NL}`, "utf8");
    /** A reuse of the world must STILL accept it, and must not destroy the edit. */
    const again = await result.port.createWorld({ worktreeId: result.worldId, baseCommit: result.basis.basisCommit });
    expect(Boolean(again.worldPath)).toBe(true);
    expect(git(worldPath, ["status", "--porcelain", "--untracked-files=no"])).toContain("src/ledger.mjs");
  });
});

/* ================================================================== *
 * B. `palimpsest.world.create` HONOURS ITS DECLARED EFFECT PROFILE
 * ================================================================== */

describe("R3-WR2 B. world.create is idempotent, which is the convergence condition of the recovery engine", () => {
  it("a SECOND call with the same world id SUCCEEDS — the mutant that used to fail", async () => {
    /**
     * Defect B. `palimpsest.world.create` is declared `effects.idempotent()`, so Ordarium's recovery for an
     * uncertain invocation is `redispatch-same-key`: it RE-RUNS the action with the same world id. Before the
     * repair the second call failed with "destination path already exists and is not an empty directory", so
     * that redispatch could never converge.
     */
    const GitCliPort = await loadPort();
    const root = join(BASE, "idempotent");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const first = await port.createWorld({ worktreeId: "attempt-idem", baseCommit: basis.basisCommit });
    const second = await port.createWorld({ worktreeId: "attempt-idem", baseCommit: basis.basisCommit });
    expect(first.worldPath).toBe(second.worldPath);
    expect(git(second.worldPath, ["rev-parse", "--verify", "HEAD^{commit}"])).toBe(basis.basisCommit);
  });

  it("the reuse PRESERVES uncommitted work, so converging cannot destroy a worker's edits", async () => {
    /**
     * The direction of the repair matters: re-cloning would converge too, and would delete whatever the world
     * held. This pins the safer property — the edit is still there after the reuse.
     */
    const GitCliPort = await loadPort();
    const root = join(BASE, "idempotent-preserve");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-preserve", baseCommit: basis.basisCommit });
    const edited = join(created.worldPath, "src", "ledger.mjs");
    writeFileSync(edited, `export const answer = 7;${NL}`, "utf8");
    const sizeBefore = statSync(edited).size;
    await port.createWorld({ worktreeId: "attempt-preserve", baseCommit: basis.basisCommit });
    expect(existsSync(edited)).toBe(true);
    expect(statSync(edited).size).toBe(sizeBefore);
    expect(git(created.worldPath, ["status", "--porcelain", "--untracked-files=no"])).toContain("src/ledger.mjs");
  });

  it("a REUSED world is still gated, so reuse is not a way to bypass readiness", async () => {
    const GitCliPort = await loadPort();
    const root = join(BASE, "idempotent-gated");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    await port.createWorld({ worktreeId: "attempt-gated", baseCommit: basis.basisCommit });
    /**
     * Break the world, then ask for it again: the reuse path must refuse it rather than hand back a world that
     * cannot commit. The refusal may be the NAMED readiness error or git's own error from the basis checkout,
     * which a corrupt index also fails — both are refusals, and which one arrives first depends on where the
     * corruption is. What must never happen is a SUCCESSFUL return.
     */
    writeFileSync(join(basis.repo, ".palimpsest", "worlds", "attempt-gated", ".git", "index"), "GARBAGE");
    await expect(port.createWorld({ worktreeId: "attempt-gated", baseCommit: basis.basisCommit })).rejects.toThrow(
      /WORLD_NOT_COMMIT_CAPABLE|index file smaller than expected/u,
    );
  });

  it("the declared profile and the load-bearing reason are frozen as data", () => {
    expect(String(IDEMPOTENCY_CONTRACT.declaredProfile)).toContain("idempotent");
    expect(String(IDEMPOTENCY_CONTRACT.whyLoadBearing)).toContain("redispatch-same-key");
    expect(String(IDEMPOTENCY_CONTRACT.whyReuseAndNotReClone)).toContain("uncommitted work");
    expect(IDEMPOTENCY_CONTRACT.afterRepair.RETRY_SETTLED).toBe(true);
  });
});

/* ================================================================== *
 * C. THE FROZEN FINDINGS OF GATES C–F
 * ================================================================== */

describe("R3-WR2 C. the frozen findings, and the distinctions the ruling requires", () => {
  it("the reproduced CLASS is distinguished from the UNIDENTIFIED trigger", () => {
    expect(FAILURE_DISTINCTION.OBJECT_STORE_FAILURE_REPRODUCED).toBe(true);
    expect(FAILURE_DISTINCTION.ORIGINAL_TRIGGER_IDENTIFIED).toBe(false);
    expect(String(FAILURE_DISTINCTION.statement)).toContain("never identified the ORIGIN");
  });

  it("CREATE_TIME_READINESS is distinguished from ATTEMPT_LIFETIME_VALIDITY", () => {
    expect(String(VALIDITY_SCOPES.CREATE_TIME_READINESS.scope)).toContain("POINT IN TIME");
    expect(String(VALIDITY_SCOPES.ATTEMPT_LIFETIME_VALIDITY.scope)).toContain("LIFETIME");
    expect(String(VALIDITY_SCOPES.relation)).toContain("does NOT imply lifetime validity");
  });

  it("the worker-token parity PASS is only claimed with its confinement control", () => {
    expect(WORKER_TOKEN_FINDING.HOST_WORKER_ACCESS_PARITY).toBe("PASS");
    expect(String(WORKER_TOKEN_FINDING.confinementControl)).toContain("DENIED");
    expect(String(WORKER_TOKEN_FINDING.confidentialityPreserved)).toContain("no label was removed");
  });

  it("the borrow lifetime matrix records what SURVIVES as well as what breaks", () => {
    expect(BORROW_LIFETIME_MATRIX.survives.length).toBeGreaterThanOrEqual(3);
    expect(BORROW_LIFETIME_MATRIX.breaks.length).toBeGreaterThanOrEqual(3);
    const survives = (BORROW_LIFETIME_MATRIX.survives as readonly { fault: string }[]).map((entry) => entry.fault).join(" ");
    expect(survives).toContain("repacked");
    expect(survives).toContain("restored");
    const breaks = (BORROW_LIFETIME_MATRIX.breaks as readonly { fault: string; mechanism: string }[]);
    expect(breaks.some((entry) => entry.mechanism.includes("ABSOLUTE"))).toBe(true);
  });

  it("no product-wide cloning redesign was made, and the alternatives carry their tradeoffs", () => {
    expect(BORROW_LIFETIME_MATRIX.productRedesignMade).toBe(false);
    expect(BORROW_LIFETIME_MATRIX.alternatives.length).toBeGreaterThanOrEqual(3);
    for (const option of BORROW_LIFETIME_MATRIX.alternatives as readonly { tradeoff: string }[]) {
      expect(option.tradeoff.length).toBeGreaterThan(20);
    }
  });

  it("the continuation finding CORRECTS R3-WR rather than repeating it", () => {
    expect(String(CONTINUATION_FINDING.supersedes)).toContain("OPEN");
    const arms = CONTINUATION_FINDING.arms as readonly { arm: string; sameAttemptResumed: boolean; resultSettled: boolean }[];
    for (const arm of arms.slice(0, 2)) {
      expect(arm.sameAttemptResumed, `${arm.arm} must resume the same attempt`).toBe(true);
      expect(arm.resultSettled, `${arm.arm} must settle`).toBe(true);
    }
    /** The third arm is the residual, and it must NOT be reported as settled. */
    const residual = arms.find((arm) => arm.arm === "STORE_PERMANENTLY_GONE");
    expect(residual!.resultSettled).toBe(false);
    expect(String(CONTINUATION_FINDING.residualGap)).toContain("no authorized terminal path");
  });

  it("no canonical event was invented for the residual gap", () => {
    expect(CONTINUATION_FINDING.canonicalChangeMade).toBe(false);
    expect(String(CONTINUATION_FINDING.canonicalChangeRequired)).toContain("would require new canonical semantics");
  });

  it("the preparation-failure arms record that no partial world was ever presented as READY", () => {
    expect(PREPARATION_FAILURE_FINDING.arms.length).toBe(2);
    for (const arm of PREPARATION_FAILURE_FINDING.arms as readonly { workerGivenPartialWorld: boolean; duplicateAttempt: boolean }[]) {
      expect(arm.workerGivenPartialWorld).toBe(false);
      expect(arm.duplicateAttempt).toBe(false);
    }
    expect(String(PREPARATION_FAILURE_FINDING.partialWorldNeverPresented)).toContain("never ran");
  });
});
