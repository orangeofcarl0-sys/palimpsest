/**
 * PLMP-LEAN-1 appendix A — Completion Handoff (`palimpsest_finish`), acceptance LEAN-A15..A18.
 *
 * The measured defect this closes: the agent finished its work, the tests passed and the gate could
 * have passed, but the attempt was left RUNNING — because the last step (choose a predicate, name a
 * gate id, run the command, report the result) was the PRODUCT's job being done by hand.
 *
 * The property under test is not "a new tool exists" but "the agent supplies none of the mechanical
 * facts, and the product observes them". So A15 asserts the tool's own contract cannot carry a
 * predicate, a gate id, an exit code or a changed-file list; A18 proves the scope evidence is an
 * observation by making a caller's belief contradict the tree.
 *
 * The tool is exercised through the DSH adapter composition — the same definitions the host
 * registers — rather than the core kernel tools, because `palimpsest_finish` is an agent-facing
 * product tool and that is the surface whose contract the spec fixes.
 *
 * The standard is built by hand rather than derived: Phase 1 already covers derivation, and hand
 * building keeps these tests about `finish` alone. Its command is a stand-in for a project's test
 * command — a real spawn that exits 0 (or, for A16, 1).
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

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const FAILING = ["node", "-e", "process.exit(1)"];

/** The narrow slice of the store these assertions read; avoids leaning on the full install type. */
interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown[] };
}

function standardOf(command: readonly string[]): ProjectStandard {
  return Object.freeze({
    statement: "测试通过，且不越界改文件",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...command]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-finish-"));
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
      // A still-open sqlite handle keeps the directory busy on Windows; the OS temp cleaner reaps
      // it. Failing the file over teardown hygiene is noise, not signal.
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function makeStack(repo: string, standard: ProjectStandard, allowed: readonly string[]) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const host = {
    tools: { register: () => () => undefined },
  };
  const installed = installPalimpsest(host as never, {
    projectId: "finish",
    databasePath: join(repo, ".palimpsest", "p.sqlite"),
    ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
    repository: repo,
    git,
    execution: "in-place",
    standard,
    policy: trustedDefaultPolicy({
      allowed_commands: [{ executable: allowed[0]!, argv_prefix: allowed.slice(1) }],
    }),
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

  // The agent-facing product tools, composed exactly as the host composes them.
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

  return { installed, call, finish, finishTool, connection };
}

/** Start one task, advance to its attempt and claim it — the normal path to a RUNNING attempt. */
async function runningAttempt(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
  task: { write_paths: string[]; required_artifacts: string[] },
): Promise<string> {
  await call("palimpsest_start", {
    projectId: "finish",
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

describe("LEAN-A15..A18: finish derives the mechanical facts, the agent states done-ness once", () => {
  it("A15 one call settles the attempt; the agent has nowhere to put a predicate, gate, exit code or file list", async () => {
    const { repo, head } = workspace();
    const { call, finish, finishTool, connection } = makeStack(repo, standardOf(PASSING), PASSING);

    // The tool's own contract cannot carry the mechanical facts — there is no argument for them, and
    // the schema closes the object, so there is nowhere to smuggle one in either.
    const parameters = (finishTool as unknown as { parameters: Record<string, unknown> }).parameters;
    const contract = JSON.stringify(parameters);
    for (const forbidden of ["attemptId", "predicate", "exitCode", "changedFiles", "gateId", "command"]) {
      expect(contract).not.toContain(forbidden);
    }
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.required).toEqual(["action"]);

    const attemptId = await runningAttempt(call, head, {
      write_paths: ["src/dedupe.ts"],
      required_artifacts: ["src/dedupe.ts"],
    });
    expect(attemptState(connection, attemptId)).toBe("RUNNING");

    writeFileSync(
      join(repo, "src", "dedupe.ts"),
      "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n",
    );
    commitAll(repo, "dedupe sorts");

    // ONE call, and the only thing the agent states is that it considers the work done.
    const result = await finish({ summary: "去重改成 Set 并排序，测试通过" });
    // INV-4: the projection the MODEL sees names no attempt — orchestration state stays inside.
    expect(result).not.toHaveProperty("attemptId");
    expect(result.state).toBe("COMPLETED");
    expect(result.changedFiles).toEqual(["src/dedupe.ts"]);
    expect(result.evidenceRecorded).toContain("tests_pass");
    expect(result.evidenceRecorded).toContain("write_scope_valid");
    expect(result.evidenceRecorded).toContain("expected_files_exist");
    expect(attemptState(connection, attemptId)).toBe("COMPLETED");
  });

  it("A16 a failing standard command refuses and leaves the attempt RUNNING", async () => {
    const { repo, head } = workspace();
    const { call, finish, connection } = makeStack(repo, standardOf(FAILING), FAILING);

    const attemptId = await runningAttempt(call, head, {
      write_paths: ["src/dedupe.ts"],
      required_artifacts: ["src/dedupe.ts"],
    });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n// touched\n");
    commitAll(repo, "work");

    await expect(finish({})).rejects.toThrow(/failed \(exit 1\)/);
    // Still running: the agent can fix it. And crucially no PASSING predicate was recorded — the
    // failing command observed an exit code and refused rather than dressing it as `tests_pass`.
    // `write_scope_valid` may legitimately be present already: the contract reports scope BEFORE the
    // commands (an out-of-scope change is more actionable than a failing test), that observation is
    // true, and recording it is idempotent, so re-finishing re-appends nothing.
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
    const rows = connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=?")
      .all("finish" as never) as { evidence_json: Uint8Array }[];
    const predicates = rows.map(
      (row) => (JSON.parse(new TextDecoder().decode(row.evidence_json)) as { predicate: string }).predicate,
    );
    // The failing command left NO passing predicate behind...
    expect(predicates).not.toContain("tests_pass");
    // ...while the scope observation it made on the way is present and true.
    expect(predicates).toContain("write_scope_valid");
  });

  it("A17 no observable work is refused, and the refusal names the locus the task belongs to", async () => {
    const { repo, head } = workspace();
    const { call, finish, connection } = makeStack(repo, standardOf(PASSING), PASSING);

    const attemptId = await runningAttempt(call, head, { write_paths: ["src/dedupe.ts"], required_artifacts: [] });
    // Nothing changed at all — an analysis-only task forced into a Work attempt.
    await expect(finish({})).rejects.toThrow(/no observable work/);
    await expect(finish({})).rejects.toThrow(/reasoning branch/);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
  });

  it("A18 the scope evidence is the product's OBSERVATION, so a caller cannot claim it", async () => {
    const { repo, head } = workspace();
    const { call, finish, connection } = makeStack(repo, standardOf(PASSING), PASSING);

    const attemptId = await runningAttempt(call, head, {
      write_paths: ["src/dedupe.ts"],
      required_artifacts: ["src/dedupe.ts"],
    });
    // The agent believes it stayed in scope; the tree says otherwise. There is no argument through
    // which the agent could assert `write_scope_valid` — the product observes, and refuses.
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n// ok\n");
    writeFileSync(join(repo, "src", "elsewhere.ts"), "export const sneaky = true;\n");
    commitAll(repo, "work plus a stray file");

    await expect(finish({ summary: "只改了 dedupe" })).rejects.toThrow(/outside the task envelope's write_paths/);
    await expect(finish({})).rejects.toThrow(/elsewhere\.ts/);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
  });
});
