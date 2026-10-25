/**
 * Palimpsest-CI2 §6 — THE POSITIVE REFERENCE FROM THE EXISTING FINISH ROUTE.
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   What does the authorized Finish route actually record when a Completion Contract genuinely passes? Which checks
 *   run, what do the atoms look like, how is a failure represented, what identifies the evidence subject, and how
 *   does a normal Gate consume it?
 *
 * WHY A REFERENCE IS NEEDED RATHER THAN A TEMPLATE.
 *
 * The delegated correction (§7 Approach C) must reuse the SAME evaluation semantics. To claim that, the semantics
 * have to be written down as behaviour — atoms, predicates, values, subject, verdict — so the delegated case can be
 * compared against it field by field. This file is that written-down behaviour. It is NOT a licence to copy the
 * Finish lifecycle into delegated settlement: the two routes keep separate lifecycle control, and only the
 * EVALUATION is shared.
 *
 * THE FIXTURE IS A GENUINE PASS, NOT A PERPETUAL INCOMPLETE.
 *
 * The standard declares all three mechanical check kinds, the command really spawns and really exits 0, the declared
 * artifact really exists in the tree, and the change really stays inside the declared write scope. So the reference
 * is a case where every check can legitimately PASS — which is what makes it a contract rather than an aspiration.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { defineWorkTools } from "../src/adapters/dsh/work.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { deriveAttemptCompletionContract } from "../src/domain/completion_contract.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PROJECT = "ci2ref";
const PASSING = ["node", "-e", "process.exit(0)"];
const FAILING = ["node", "-e", "process.exit(1)"];

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown[] };
}

/** A standard that exercises ALL THREE mechanical check kinds, so the contract is not vacuous. */
function fullStandard(command: readonly string[], predicate: "tests_pass" | "process_exit_zero" = "tests_pass"): ProjectStandard {
  return Object.freeze({
    statement: "the artifact exists, the scope is respected and the check command passes",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...command]), predicate }),
      Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/dedupe.ts"]) }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["ci2 reference fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "ci2-ref-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* a live sqlite handle keeps the directory busy on Windows; the run's temp sweep reports it */
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

function makeStack(repo: string, standard: ProjectStandard, allowed: readonly string[]) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
    projectId: PROJECT,
    databasePath: join(repo, ".palimpsest", "p.sqlite"),
    ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
    repository: repo,
    git,
    execution: "in-place",
    standard,
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: allowed[0]!, argv_prefix: allowed.slice(1) }] }),
  } as never);
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
  const workTools = defineWorkTools(installed.application as never);
  const finishTool = workTools.find((entry) => entry.name === "palimpsest_finish");
  if (finishTool === undefined) throw new Error("palimpsest_finish is not composed");
  const finish = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await finishTool.execute({ action: "run", ...args }, {
      callId: "c-finish",
      rootCallId: "r-finish",
      name: "palimpsest_finish",
      arguments: { action: "run", ...args },
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  return { installed, call, finish, connection };
}

async function runningAttempt(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
  task: { write_paths: string[]; required_artifacts: string[] },
): Promise<string> {
  await call("palimpsest_start", {
    projectId: PROJECT,
    goal: "make dedupe cheap",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "rewrite dedupe", depends_on: [], ...task }],
  });
  await call("palimpsest_next", {});
  const created = (await call("palimpsest_next", {})) as { entityId: string };
  await call("palimpsest_claim", { attemptId: created.entityId });
  return created.entityId;
}

function commitAll(repo: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
}

function attemptState(connection: Connection, attemptId: string): string {
  return (connection.prepare("SELECT state FROM attempts WHERE attempt_id=?").get(attemptId as never) as { state: string }).state;
}

/** The evidence projection, read exactly as the Gate reads it. */
function evidenceFor(connection: Connection, subjectId: string): Array<Record<string, unknown>> {
  const rows = connection
    .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
    .all(PROJECT as never, subjectId as never) as { evidence_json: Uint8Array }[];
  return rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
}

describe("CI2 §6 — the Finish route's authorized completion behaviour", () => {
  it("records real evidence for every mechanical check, and the release gate PASSES on it", async () => {
    const { repo, head } = workspace();
    const standard = fullStandard(PASSING);
    const { installed, call, finish, connection } = makeStack(repo, standard, PASSING);

    /**
     * THE CONTRACT IS NON-VACUOUS — asserted through the product's own derivation, before the work starts.
     */
    const contract = deriveAttemptCompletionContract({
      standard,
      task: { write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
      envelope: {
        write_paths: ["src/dedupe.ts"],
        required_artifacts: ["src/dedupe.ts"],
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      },
    });
    expect(contract.mechanical.map((check) => check.kind)).toEqual([
      "assert_write_scope",
      "run_standard_command",
      "assert_required_artifacts",
    ]);

    const attemptId = await runningAttempt(call, head, {
      write_paths: ["src/dedupe.ts"],
      required_artifacts: ["src/dedupe.ts"],
    });
    expect(attemptState(connection, attemptId)).toBe("RUNNING");

    /** Real work, committed, inside the declared scope. */
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n");
    commitAll(repo, "dedupe sorts");
    const resultCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

    const result = await finish({ summary: "dedupe sorts" });
    expect(result.state).toBe("COMPLETED");
    expect(result.evidenceRecorded).toEqual(expect.arrayContaining(["tests_pass", "write_scope_valid", "expected_files_exist"]));
    expect(attemptState(connection, attemptId)).toBe("COMPLETED");

    /**
     * THE REFERENCE: WHAT THE ATOMS ACTUALLY ARE.
     *
     * Three atoms, one per mechanical check, all scoped to the ATTEMPT, all produced by the product.
     */
    const evidence = evidenceFor(connection, attemptId);
    expect(evidence).toHaveLength(3);
    const byPredicate = new Map(evidence.map((atom) => [String(atom.predicate), atom]));
    expect([...byPredicate.keys()].sort()).toEqual(["expected_files_exist", "tests_pass", "write_scope_valid"]);

    /** The command atom carries the OBSERVED exit code and the command that produced it. */
    const commandAtom = byPredicate.get("tests_pass")!;
    expect(commandAtom.subject_type).toBe("attempt");
    expect(commandAtom.subject_id).toBe(attemptId);
    expect(commandAtom.exit_code).toBe(0);
    expect(commandAtom.command).toEqual(PASSING);
    expect(commandAtom.producer).toBe("palimpsest-gate");
    expect(commandAtom.status).toBe("active");

    /** The two OBSERVED atoms carry no command and no exit code — they are tree/filesystem facts. */
    const scopeAtom = byPredicate.get("write_scope_valid")!;
    expect(scopeAtom.command).toBeNull();
    expect(scopeAtom.exit_code).toBeNull();
    expect(scopeAtom.producer).toBe("palimpsest-finish");
    expect(scopeAtom.value).toEqual({ changed_files: ["src/dedupe.ts"], write_paths: ["src/dedupe.ts"], out_of_scope: [] });

    const artifactAtom = byPredicate.get("expected_files_exist")!;
    expect(artifactAtom.command).toBeNull();
    expect(artifactAtom.value).toEqual({ paths: ["src/dedupe.ts"], missing: [] });

    /**
     * THE REFERENCE GAP THIS STAGE EXISTS TO CLOSE.
     *
     * Every atom is scoped to the attempt and names no candidate. `subject_digest` is a digest of
     * `{attempt_id, predicate}` (or `{attempt_id, command}`), NOT of the result — so no atom can answer "which
     * candidate was this about?". That is the measured hole CI2-B1 corrects for the delegated route, and this
     * assertion is what keeps the correction from being claimed where it was not made.
     */
    for (const atom of evidence) {
      expect(JSON.stringify(atom)).not.toContain(resultCommit);
    }

    /**
     * AND THE NORMAL GATE CONSUMES THEM.
     *
     * The release gate is the one the confirmed standard declared at genesis, so this is the product's own gate
     * over the product's own evidence — not a gate this test invented to be satisfiable.
     */
    const gate = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(gate.verdict).toBe("PASS");
    expect(gate.failed).toEqual([]);
    expect(gate.unresolved).toEqual([]);
    expect(gate.evidence_used).toHaveLength(3);
    expect(gate.subject_id).toBe(attemptId);

    /**
     * `ATTEMPT_COMPLETED` IS NOT THE QUALIFICATION. The gate verdict is separate from the attempt state, and
     * nothing promoted the attempt merely because the local gate passed.
     */
    const attempts = installed.controller.status().attempts;
    expect(attempts.find((entry) => entry.attempt_id === attemptId)?.state).toBe("COMPLETED");
  });

  it("a FAILING command is recorded as a refusal, never as a passing predicate, and the attempt stays RUNNING", async () => {
    const { repo, head } = workspace();
    const standard = fullStandard(FAILING);
    const { call, finish, connection } = makeStack(repo, standard, FAILING);

    const attemptId = await runningAttempt(call, head, { write_paths: ["src/dedupe.ts"], required_artifacts: [] });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n// touched\n");
    commitAll(repo, "work");

    await expect(finish({})).rejects.toThrow(/failed \(exit 1\)/u);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");

    /**
     * HOW A FAILURE IS REPRESENTED: as the ABSENCE of a passing predicate, plus a true scope observation that was
     * made on the way. The product does not write a failing atom; it refuses and records nothing false.
     */
    const predicates = evidenceFor(connection, attemptId).map((atom) => String(atom.predicate));
    expect(predicates).not.toContain("tests_pass");
    expect(predicates).toContain("write_scope_valid");
  });

  it("an out-of-scope change is refused, and the refusal is the product's observation not the caller's claim", async () => {
    const { repo, head } = workspace();
    const standard = fullStandard(PASSING);
    const { call, finish, connection } = makeStack(repo, standard, PASSING);

    const attemptId = await runningAttempt(call, head, { write_paths: ["src/dedupe.ts"], required_artifacts: [] });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n// ok\n");
    writeFileSync(join(repo, "src", "elsewhere.ts"), "export const sneaky = true;\n");
    commitAll(repo, "work plus a stray file");

    /** The agent's own summary claims it stayed in scope; the tree says otherwise. */
    await expect(finish({ summary: "only touched dedupe" })).rejects.toThrow(/outside the task envelope's write_paths/u);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
    const predicates = evidenceFor(connection, attemptId).map((atom) => String(atom.predicate));
    expect(predicates).not.toContain("write_scope_valid");
  });

  it("a missing declared artifact is refused rather than recorded as present", async () => {
    const { repo, head } = workspace();
    const standard = fullStandard(PASSING);
    const { call, finish, connection } = makeStack(repo, standard, PASSING);

    /**
     * The task declares an artifact the work will NOT produce. `expected_files_exist` reads the CANONICAL
     * repository (in-place, so that is the tree), so the check really has something to be wrong about.
     */
    const attemptId = await runningAttempt(call, head, { write_paths: ["src/dedupe.ts"], required_artifacts: ["src/absent.ts"] });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n// ok\n");
    commitAll(repo, "work");

    await expect(finish({})).rejects.toThrow(/missing required artifacts/u);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
    const predicates = evidenceFor(connection, attemptId).map((atom) => String(atom.predicate));
    expect(predicates).not.toContain("expected_files_exist");
  });
});
