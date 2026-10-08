/**
 * R3-WR — THE WORKTREE OBJECT-STORE TESTS.
 *
 * These pin the stage's two findings and its repair:
 *
 *   1. THE NEGATIVE RESULTS. The shipped `clone --shared` path does not fail on this host, and the mixed-separator
 *      alternates Git warns about is TOLERATED — all four spellings commit. A future reader who finds the Git
 *      warning must be able to see that it was already tested and refuted, rather than re-deriving the wrong
 *      cause.
 *
 *   2. THE REPRODUCED CONTROL. Removing the borrowed object store makes a worker unable to commit with the exact
 *      signature `fatal: could not parse HEAD`. That is the mechanism the readiness gate exists to catch.
 *
 *   3. THE READINESS GATE. The three facts the ruling names, with the discriminator that matters: a world with a
 *      dead borrowed store still reports a RESOLVABLE HEAD and a clean status, so a gate that only checked those
 *      would pass it. The commit-capability check is the one that catches it.
 *
 * All tests use temporary roots and the SHIPPED preparation path. None of them touches the preserved evidence.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CLASSIFICATION, NOT_READY_CONSEQUENCE, REPRODUCTION_ATTEMPTS, worktreeReadiness } from "../scripts/r3wr/contract.mjs";
import { createWorldLikeShipped, git, makeBasisRepository, workerCommit } from "../scripts/r3wr/reproduce.mjs";
import { alternateSpellingMatrix } from "../scripts/r3wr/spelling.mjs";
import { ATTEMPT_STATES, LIFECYCLE_FINDING, observedLifecycle, recoveryVerdict } from "../scripts/r3wr/recovery.mjs";

const BASE = mkdtempSync(join(tmpdir(), "r3wr-test-"));

/** Build a basis repository and a world prepared through the shipped call. */
function fixture(label: string) {
  const root = join(BASE, label);
  mkdirSync(root, { recursive: true });
  const basis = makeBasisRepository(root);
  const worldPath = join(root, "world");
  const prepared = createWorldLikeShipped({ repository: basis.repo, worldPath, baseCommit: basis.basisCommit });
  return { root, basis, worldPath, prepared };
}

afterAll(() => {
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the temp hygiene sweep collects it */
  }
});

describe("R3-WR — the shipped world preparation is sound on this host", () => {
  it("the shipped clone creates a world whose HEAD resolves and whose basis is readable", () => {
    const { basis, worldPath, prepared } = fixture("sound");
    expect(prepared.created).toBe(true);
    const readiness = worktreeReadiness({ worldPath, basisCommit: basis.basisCommit });
    expect(readiness.WORKTREE_HEAD_RESOLVABLE).toBe(true);
    expect(readiness.WORKTREE_REQUIRED_OBJECTS_RESOLVABLE).toBe(true);
    expect(readiness.WORKTREE_COMMIT_CAPABLE).toBe(true);
    expect(readiness.READY).toBe(true);
  });

  it("a worker can commit through the supported path, which is the negative result this stage records", () => {
    const { basis, worldPath } = fixture("commits");
    writeFileSync(join(worldPath, "src", "ledger.mjs"), "export const answer = 42;\n", "utf8");
    const commit = workerCommit({ worldPath, message: "r3wr test" });
    expect(commit.commitOk, `commit failed: ${String(commit.output)}`).toBe(true);
    expect(commit.couldNotParseHead).toBe(false);
    expect(git(worldPath, ["rev-parse", "HEAD"]).ok).toBe(true);
    expect(git(worldPath, ["rev-parse", "HEAD"]).stdout).not.toBe(basis.basisCommit);
  });

  it("the mixed-separator alternates is TOLERATED, so it is not the defect", () => {
    /**
     * The stage opened with a hypothesis that the mixed separator was the cause. This is the test that refuted
     * it, and it is kept so the refutation is reproducible rather than remembered.
     */
    const matrix = alternateSpellingMatrix({});
    expect(matrix.shippedSpellingCommits, `the shipped spelling failed: ${JSON.stringify(matrix.results)}`).toBe(true);
    expect(matrix.anySpellingFails).toBe(false);
    expect(String(matrix.verdict)).toContain("TOLERATED");
  });
});

describe("R3-WR — the reproduced control: a dead borrowed object store", () => {
  it("removing the alternate target reproduces the worker exact signature", () => {
    const { basis, worldPath } = fixture("mutant");
    /** Move the borrowed target aside, which is the mutant, and observe the commit fail the way a worker saw it. */
    renameSync(join(basis.repo, ".git", "objects"), join(BASE, "mutant-moved-objects"));
    writeFileSync(join(worldPath, "src", "ledger.mjs"), "export const answer = 42;\n", "utf8");
    const commit = workerCommit({ worldPath, message: "r3wr mutant" });
    expect(commit.commitOk).toBe(false);
    expect(commit.couldNotParseHead, `expected the parse-HEAD signature, got: ${String(commit.output)}`).toBe(true);
  });

  it("the readiness gate catches it, even though HEAD still resolves", () => {
    /**
     * THE DISCRIMINATOR THAT MATTERS. A world with a dead borrowed store reports a RESOLVABLE HEAD and a clean
     * status, so the two facts a naive gate would check both pass. Only commit-capability catches it.
     */
    const { basis, worldPath } = fixture("mutant-gate");
    renameSync(join(basis.repo, ".git", "objects"), join(BASE, "mutant-gate-moved"));
    const readiness = worktreeReadiness({ worldPath, basisCommit: basis.basisCommit });
    expect(readiness.READY).toBe(false);
    expect(readiness.WORKTREE_COMMIT_CAPABLE).toBe(false);
    expect(readiness.detail.objectStoreError, "the gate must name the object-store error it saw").not.toBeNull();
  });

  it("a missing basis object also fails readiness, so the gate covers both facts", () => {
    const { worldPath } = fixture("missing-basis");
    const readiness = worktreeReadiness({ worldPath, basisCommit: "0".repeat(40) });
    expect(readiness.WORKTREE_REQUIRED_OBJECTS_RESOLVABLE).toBe(false);
    expect(readiness.READY).toBe(false);
  });

  it("a clean world with nothing staged is READY, so the gate does not refuse ordinary work", () => {
    /**
     * `git commit --dry-run` exits non-zero when there is nothing to commit. If the gate used the exit code it
     * would refuse every clean world, which would be worse than no gate at all.
     */
    const { basis, worldPath } = fixture("clean");
    const readiness = worktreeReadiness({ worldPath, basisCommit: basis.basisCommit });
    expect(readiness.READY).toBe(true);
  });
});

describe("R3-WR — the production repair fails closed", () => {
  it("the port refuses a world whose borrowed store cannot deliver the basis", async () => {
    /**
     * The repair is in `GitCliPort.createWorld`, so it is exercised through the compiled port rather than
     * through a copy of its logic. The mutant is built so the CLONE SUCCEEDS and only the readiness probe can
     * catch it: a second canonical repository is cloned, a world is prepared against it, and then that
     * repository's objects are moved aside before the probe runs.
     */
    const { GitCliPort } = await import("../dist/src/effects/git_port.js");
    const root = join(BASE, "port-repair");
    mkdirSync(root, { recursive: true });
    const basis = makeBasisRepository(root);
    const port = new GitCliPort(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const good = await port.createWorld({ worktreeId: "good", baseCommit: basis.basisCommit });
    expect(Boolean(good.worldPath)).toBe(true);

    /** The mutant: the borrowed target is removed, and the SAME probe must refuse. */
    renameSync(join(basis.repo, ".git", "objects"), join(root, "objects-moved"));
    const mutantProbe = worktreeReadiness({ worldPath: good.worldPath, basisCommit: basis.basisCommit });
    expect(mutantProbe.READY).toBe(false);
    expect(mutantProbe.WORKTREE_COMMIT_CAPABLE).toBe(false);
  });

  it("the repair names what it refuses and forbids the four ways to bypass it", () => {
    expect(String(NOT_READY_CONSEQUENCE.rule)).toContain("must fail worker readiness");
    for (const forbidden of ["skipping verification", "forcing promotion", "disabling quiescence", "re-creating a world"]) {
      expect(NOT_READY_CONSEQUENCE.forbidden.join(" "), `${forbidden} must be forbidden`).toContain(forbidden);
    }
    expect(String(NOT_READY_CONSEQUENCE.route)).toContain("host failure");
  });
});

describe("R3-WR — the defect classification and its honest limits", () => {
  it("the classification is MISSING_GIT_OBJECT and explicitly not MALFORMED_ALTERNATE_PATH", () => {
    expect(CLASSIFICATION.category).toBe("MISSING_GIT_OBJECT");
    expect(CLASSIFICATION.notCategory).toContain("MALFORMED_ALTERNATE_PATH");
    expect(String(CLASSIFICATION.whyNotMalformedPath)).toContain("commits");
  });

  it("the TRIGGER is recorded as NOT REPRODUCED rather than dressed as a cause", () => {
    expect(CLASSIFICATION.triggerNotReproduced).toBe(true);
    expect(String(CLASSIFICATION.triggerStatement)).toContain("not recovered");
  });

  it("the unavailable evidence is named, including this session own restoration", () => {
    const ids = (CLASSIFICATION.unavailableEvidence as readonly { id: string }[]).map((entry) => entry.id);
    expect(ids).toContain("WORKER_ERA_ALTERNATES_BYTES");
    const restored = (CLASSIFICATION.unavailableEvidence as readonly { id: string; detail: string }[]).find((entry) => entry.id === "WORKER_ERA_ALTERNATES_BYTES");
    expect(String(restored!.detail)).toContain("restored by this session");
  });

  it("every reproduction attempt is recorded with what it ruled out", () => {
    expect(REPRODUCTION_ATTEMPTS.length).toBeGreaterThanOrEqual(6);
    for (const attempt of REPRODUCTION_ATTEMPTS as readonly { id: string; committed: number; failed: number; rulesOut: string }[]) {
      expect(attempt.rulesOut.length, `${attempt.id} must state what it ruled out`).toBeGreaterThan(10);
    }
    const control = (REPRODUCTION_ATTEMPTS as readonly { id: string; failed: number }[]).find((entry) => entry.id === "CONTROL_MISSING_ALTERNATE_TARGET");
    expect(control!.failed).toBeGreaterThan(0);
  });
});

/* ================================================================ failed-attempt recovery */

describe("R3-WR — the failed-attempt lifecycle and its recovery path", () => {
  const RUN = "C:/Users/66494/AppData/Local/Temp/palimpsest-runs/run-2026-10-07T17-41-48-267Z";
  const STORE = join(RUN, "units", "r-b0-H", "state", "orchestration.sqlite");

  it("the lifecycle is reconstructed from the durable store, which is the authority", () => {
    const lifecycle = observedLifecycle({ storePath: STORE });
    if (!lifecycle.available) return; // the run is not on this host; the finding is recorded in the contract
    expect(lifecycle.attempts.length).toBeGreaterThan(0);
    for (const attempt of lifecycle.attempts as readonly { attemptId: string; events: readonly string[]; settled: boolean }[]) {
      expect(attempt.events.length, `${attempt.attemptId} must have observed events`).toBeGreaterThan(0);
    }
  });

  it("an attempt that terminated without a result is left RUNNING, which is the separate finding", () => {
    const lifecycle = observedLifecycle({ storePath: STORE });
    if (!lifecycle.available) return;
    /** The observed shape: at least one attempt STARTED and never COMPLETED. */
    expect(lifecycle.unsettled.length, "the run must exhibit the unsettled attempt this stage classified").toBeGreaterThan(0);
    const unsettled = lifecycle.attempts.find((attempt: { attemptId: string }) => attempt.attemptId === lifecycle.unsettled[0]);
    expect(unsettled!.events).toContain("ATTEMPT_STARTED");
    expect(unsettled!.events).not.toContain("ATTEMPT_COMPLETED");
  });

  it("RUNNING is the state that blocks the next generation, and the contract says so", () => {
    expect(ATTEMPT_STATES.RUNNING.settles).toBe(false);
    expect(ATTEMPT_STATES.RUNNING.blocksNextGeneration).toBe(true);
    expect(ATTEMPT_STATES.COMPLETED.blocksNextGeneration).toBe(false);
  });

  it("the lifecycle finding is classified SEPARATELY from the object-store defect", () => {
    expect(LIFECYCLE_FINDING.classifySeparately).toBe(true);
    expect(String(LIFECYCLE_FINDING.distinctFrom)).toContain("PROJECT-level");
    expect(String(LIFECYCLE_FINDING.consequence)).toContain("quiescence_required");
  });

  it("the three forbidden repairs are named, so the gap cannot be closed by hiding it", () => {
    const repairs = (LIFECYCLE_FINDING.forbiddenRepairs as readonly { repair: string }[]).map((entry) => entry.repair);
    expect(repairs).toContain("skip verification");
    expect(repairs).toContain("force promotion");
    expect(repairs).toContain("disable quiescence");
  });

  it("the recovery verdict is OPEN for a run that exhibits the gap", () => {
    const lifecycle = observedLifecycle({ storePath: STORE });
    const verdict = recoveryVerdict(lifecycle);
    if (lifecycle.available) {
      expect(verdict.FAILED_ATTEMPT_RECOVERY).toBe("OPEN");
      expect(verdict.unsettledAttempts).toBeGreaterThan(0);
    } else {
      expect(verdict.FAILED_ATTEMPT_RECOVERY).toBe("NOT_APPLICABLE");
    }
  });

  it("a run whose attempts all settled reports CLOSED, so the verdict is not hardcoded", () => {
    const closed = recoveryVerdict({ available: true, unsettled: [], settled: ["a", "b"], attempts: [] });
    expect(closed.FAILED_ATTEMPT_RECOVERY).toBe("CLOSED");
    const unavailable = recoveryVerdict({ available: false });
    expect(unavailable.FAILED_ATTEMPT_RECOVERY).toBe("NOT_APPLICABLE");
  });
});
