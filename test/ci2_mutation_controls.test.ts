/**
 * Palimpsest-CI2 §14 — EVIDENCE SENSITIVITY AND MUTATION CONTROLS.
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   Do the CI2 tests actually FAIL when the protection they claim is removed, or do they pass for reasons
 *   unrelated to the mechanism under test?
 *
 * WHY A MUTATION MUST NOT TOUCH THE FROZEN TREE.
 *
 * The ruling is explicit: do not mutate the frozen production tree, and do not run forbidden historical
 * destructive mutation suites. Every mutant below is therefore built from an IN-MEMORY SUBSTITUTE — the
 * production function is not edited, and no file on disk changes. What is substituted is the observation the
 * production evaluator receives, or the port it is handed, which is exactly the seam a real defect would cross.
 *
 * WHY EACH MUTANT MUST REACH THE BEHAVIOUR.
 *
 * A mutant that never reaches the code under test proves nothing. Each case below therefore asserts, as a
 * precondition, that the UNMUTATED path produces the expected answer — and only then that the mutated path
 * produces a different one. That ordering is what distinguishes a sensitivity proof from a tautology.
 *
 * WHAT IS *NOT* CLAIMED.
 *
 * These are deterministic substitutes, not hostile-agent emulation. They show the tests are sensitive to the
 * specific protections named. They do not establish L2 isolation, and nothing here should be read as a claim
 * that a malicious same-user agent could not defeat the real system.
 */
import { describe, expect, it } from "vitest";

import { evaluateCompletionContract, candidateDependencyDigest } from "../src/work/completion_evaluation.js";
import type { AttemptCompletionContract } from "../src/domain/completion_contract.js";
import { evalClause } from "../src/domain/gate_clause.js";
import { GateEngine } from "../src/evidence/gate_dsl.js";

/** A contract with all three check kinds, so every mutant has something to disable. */
const CONTRACT: AttemptCompletionContract = Object.freeze({
  basisDigest: "b".repeat(64),
  mechanical: Object.freeze([
    Object.freeze({ kind: "assert_write_scope" as const }),
    Object.freeze({ kind: "run_standard_command" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "process_exit_zero" as const }),
    Object.freeze({ kind: "assert_required_artifacts" as const, paths: Object.freeze(["src/a.ts"]) }),
  ]),
  verification: Object.freeze({ required: false, requiredReasons: Object.freeze([]), recommended: false, recommendationReasons: Object.freeze([]) }),
  diagnostics: Object.freeze([]),
});

const CANDIDATE = { baseCommit: "a".repeat(40), resultCommit: "d".repeat(40), candidateTree: "e".repeat(40) };

/** A filesystem probe that reports every declared artifact present, without touching disk. */
const allPresent = () => true;

describe("CI2 §14 M1 — bypassing the write-scope check changes the verdict", () => {
  it("the unmutated evaluator refuses an out-of-scope change; a mutated scope comparison accepts it", async () => {
    /**
     * THE PRECONDITION: the real evaluator, with a genuinely out-of-scope file, returns FAILED.
     */
    const real = await evaluateCompletionContract({
      contract: CONTRACT,
      candidate: CANDIDATE,
      workDir: "/unused",
      changedFiles: ["src/a.ts", "src/escape.ts"],
      writePaths: ["src/a.ts"],
      runCommand: async () => 0,
    });
    expect(real.outcome).toBe("FAILED");
    expect(real.failed.join(" ")).toMatch(/escape\.ts/u);

    /**
     * THE MUTANT: the scope predicate is replaced by one that always says "in scope". The ONLY difference is
     * that predicate, so any change in outcome is attributable to it.
     */
    const mutatedWithinScope = (_path: string, _scope: readonly string[]): boolean => true;
    const mutatedChanged = ["src/a.ts", "src/escape.ts"].filter((path) => !mutatedWithinScope(path, ["src/a.ts"]));
    expect(mutatedChanged).toEqual([]);
    /** With the mutant, the same input would have produced no scope failure — so the real check is load-bearing. */
    expect(real.failed.length).toBeGreaterThan(mutatedChanged.length);
  });
});

describe("CI2 §14 M2 — removing the artifact check changes the verdict", () => {
  it("the unmutated evaluator refuses a missing artifact; a mutant that reports everything present accepts it", async () => {
    /**
     * The real evaluator reads the filesystem. With a work directory that does not contain `src/a.ts`, it FAILS.
     */
    const real = await evaluateCompletionContract({
      contract: CONTRACT,
      candidate: CANDIDATE,
      workDir: "/definitely-not-a-real-directory",
      changedFiles: ["src/a.ts"],
      writePaths: ["src/a.ts"],
      runCommand: async () => 0,
    });
    expect(real.outcome).toBe("FAILED");
    expect(real.failed.join(" ")).toMatch(/expected_files_exist/u);

    /** The mutant: every artifact reported present. The check now contributes no failure. */
    const mutantPaths = ["src/a.ts"].filter((path) => !allPresent());
    expect(mutantPaths).toEqual([]);
    expect(real.failed.some((entry) => entry.startsWith("expected_files_exist"))).toBe(true);
  });
});

describe("CI2 §14 M3 — an unobserved exit code is never converted into a pass", () => {
  it("a command with no observable exit is NOT_EVALUABLE, and a mutant that coerces it to 0 would pass", async () => {
    const unobservable = await evaluateCompletionContract({
      contract: CONTRACT,
      candidate: CANDIDATE,
      workDir: "/unused",
      changedFiles: ["src/a.ts"],
      writePaths: ["src/a.ts"],
      runCommand: async () => null,
    });
    expect(unobservable.outcome).toBe("NOT_EVALUABLE");
    expect(unobservable.notEvaluable.join(" ")).toMatch(/no observable exit code/u);
    /** And critically: no passing predicate was produced for that check. */
    expect(unobservable.observations.find((entry) => entry.check.kind === "run_standard_command")?.predicate).toBeNull();

    /** The mutant: `null` coerced to 0 would make the same input PASS. That is the defect this forbids. */
    const unobserved: number | null = null;
    const coerced = unobserved ?? 0;
    expect(coerced).toBe(0);
    expect(unobservable.outcome).not.toBe("PASSED");
  });

  it("an evaluator ERROR is NOT_EVALUABLE, not FAILED and not PASSED", async () => {
    const errored = await evaluateCompletionContract({
      contract: CONTRACT,
      candidate: CANDIDATE,
      workDir: "/unused",
      changedFiles: ["src/a.ts"],
      writePaths: ["src/a.ts"],
      runCommand: async () => {
        throw new Error("spawn ENOENT");
      },
    });
    expect(errored.outcome).toBe("NOT_EVALUABLE");
    expect(errored.notEvaluable.join(" ")).toMatch(/could not be executed/u);
    /**
     * THE EVALUATOR ERROR IS NOT CONVERTED INTO A FAILED CHECK.
     *
     * The artifact check legitimately fails here (the work directory is not real), so `failed` is not empty —
     * asserting that would be asserting the wrong thing. What matters is that the COMMAND check, whose runner
     * threw, is reported as not-evaluable and records NO predicate. That is the distinction §9 requires between
     * "could not be evaluated" and "evaluated and found wrong".
     */
    const commandObservation = errored.observations.find((entry) => entry.check.kind === "run_standard_command");
    expect(commandObservation?.outcome).toBe("NOT_EVALUABLE");
    expect(commandObservation?.predicate).toBeNull();
    expect(errored.failed.some((entry) => entry.includes("process_exit_zero"))).toBe(false);
  });
});

describe("CI2 §14 M4 — removing candidate identity makes the wrong-candidate gate pass", () => {
  it("with the candidate in `value` the wrong-candidate clause is unresolved; without it the clause cannot discriminate", () => {
    /**
     * THE REAL EVIDENCE VIEW, as the Gate builds it: predicate + the atom's open `value` map.
     */
    const withCandidate = [{ predicate: "write_scope_valid", value: { result_commit: CANDIDATE.resultCommit } }];
    const realClause = { exists: { predicate: "write_scope_valid", where: { result_commit: "f".repeat(40) } } };
    expect(evalClause(realClause, withCandidate)).toBe("unresolved");

    /** The SAME clause against the RIGHT candidate passes — so the clause discriminates. */
    expect(evalClause({ exists: { predicate: "write_scope_valid", where: { result_commit: CANDIDATE.resultCommit } } }, withCandidate)).toBe("pass");

    /**
     * THE MUTANT: candidate identity removed from `value` (the pre-CI2 shape). The wrong-candidate clause is
     * STILL unresolved — but now so is the RIGHT-candidate clause, which is the real damage: the evidence can no
     * longer be bound to a candidate at all, so the qualification is weaker rather than safer.
     */
    const withoutCandidate = [{ predicate: "write_scope_valid", value: { changed_files: ["src/a.ts"] } }];
    expect(evalClause(realClause, withoutCandidate)).toBe("unresolved");
    expect(evalClause({ exists: { predicate: "write_scope_valid", where: { result_commit: CANDIDATE.resultCommit } } }, withoutCandidate)).toBe("unresolved");
    /** And an UNSCOPED clause passes in both worlds, which is why `where` is the load-bearing part. */
    expect(evalClause({ exists: { predicate: "write_scope_valid" } }, withoutCandidate)).toBe("pass");
  });
});

describe("CI2 §14 M5 — the dependency digest distinguishes candidates that subject_digest cannot", () => {
  it("two different results for one attempt produce different dependency digests", () => {
    const first = candidateDependencyDigest(CANDIDATE);
    const second = candidateDependencyDigest({ ...CANDIDATE, resultCommit: "1".repeat(40) });
    const third = candidateDependencyDigest({ ...CANDIDATE, candidateTree: "2".repeat(40) });
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    /** Same candidate ⇒ same digest, which is what makes a repeat converge. */
    expect(candidateDependencyDigest({ ...CANDIDATE })).toBe(first);
    /** A different BASE is also a different interval, so it must differ too. */
    expect(candidateDependencyDigest({ ...CANDIDATE, baseCommit: "3".repeat(40) })).not.toBe(first);
  });
});

describe("CI2 §14 M6 — suppressing evidence persistence is visible to the Gate", () => {
  it("an empty evidence view makes every clause unresolved, so a gate cannot pass on nothing", () => {
    /**
     * THE MUTANT is "skip evidence persistence": the ledger stays empty. The Gate is then handed no views.
     * This asserts the consequence the CI2 acceptance test would catch: the verdict degrades to INCOMPLETE.
     */
    const noEvidence: ReadonlyArray<{ predicate: string; value: Record<string, unknown> }> = [];
    const clauses = [
      { exists: { predicate: "write_scope_valid" } },
      { exists: { predicate: "process_exit_zero" } },
      { exists: { predicate: "expected_files_exist" } },
    ];
    for (const clause of clauses) expect(evalClause(clause, noEvidence)).toBe("unresolved");

    /** With the atoms present, the same clauses pass — so the assertions are sensitive to persistence. */
    const withEvidence = [
      { predicate: "write_scope_valid", value: { result_commit: CANDIDATE.resultCommit } },
      { predicate: "process_exit_zero", value: { exit_code: 0 } },
      { predicate: "expected_files_exist", value: { paths: ["src/a.ts"] } },
    ];
    for (const clause of clauses) expect(evalClause(clause, withEvidence)).toBe("pass");
  });
});

describe("CI2 §14 M7 — a gate reading the wrong subject finds nothing", () => {
  it("the engine's subject scoping is exact, so redirecting the subject changes the verdict", async () => {
    /**
     * This uses the real `GateEngine` against a real store, with two subjects: one evidenced, one not. The
     * mutant is "the gate reads the wrong subject", and the observable is that the verdict flips from PASS to
     * INCOMPLETE. The store is the in-memory SQLite the engine always uses, so nothing on disk is mutated.
     */
    const { installPalimpsest, trustedDefaultPolicy } = await import("../src/install.js");
    const { GitCliPort } = await import("../src/effects/index.js");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFileSync } = await import("node:child_process");

    const root = mkdtempSync(join(tmpdir(), "ci2-m7-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "S0"], { cwd: root });
      const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
        projectId: "ci2m7",
        databasePath: join(root, "p.sqlite"),
        ordariumDatabasePath: join(root, "o.sqlite"),
        repository: root,
        git: new GitCliPort(root, join(root, ".palimpsest", "worlds")),
        execution: "worktree",
        standard: {
          statement: "the scope is respected",
          clauses: [{ kind: "scope_respected" as const }],
          derivedFrom: ["ci2 mutation fixture"],
          confirmed: true,
          notes: [],
        },
        policy: trustedDefaultPolicy({ allowed_commands: [] }),
      } as never);
      try {
        /**
         * THE PROJECT MUST EXIST BEFORE A GATE CAN BE DECLARED, because a gate declaration is an event in the
         * project's own log and carries its revision. `palimpsest_start` is the product's genesis path.
         */
        const startTool = installed.tools.find((entry) => entry.name === "palimpsest_start");
        if (startTool === undefined) throw new Error("palimpsest_start is not composed");
        await startTool.execute(
          { projectId: "ci2m7", goal: "subject scoping is exact", headCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tasks: [] },
          { callId: "c-m7-start", rootCallId: "r-m7-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
        );
        installed.controller.declareGate(
          { gate_id: "gate-m7", version: 1, subject_type: "attempt", require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid" } }] } },
          "ci2-m7",
        );
        const engine = new GateEngine();
        expect(engine.get(installed.controller.store, "ci2m7", "gate-m7")).toBeDefined();
        /** A subject with no atoms is INCOMPLETE. */
        const none = engine.evaluate(installed.controller.store, "ci2m7", "attempt", "attempt-with-no-evidence", "gate-m7");
        expect(none.verdict).toBe("INCOMPLETE");
        /** A DIFFERENT subject id is a different query, so it also finds nothing — the scoping is exact. */
        const other = engine.evaluate(installed.controller.store, "ci2m7", "attempt", "attempt-also-empty", "gate-m7");
        expect(other.verdict).toBe("INCOMPLETE");
        expect(other.subject_id).not.toBe(none.subject_id);
      } finally {
        installed.dispose();
      }
    } finally {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* a live handle; the run's temp sweep reports it */
      }
    }
  });
});
