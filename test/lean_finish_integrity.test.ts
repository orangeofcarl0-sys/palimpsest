/**
 * PLMP-LEAN-1 phase 2A-R — Completion Integrity, acceptance LEAN-A22..A25.
 *
 * A probe of `main@89377c7` settled a correctness gap that the phase-2A tests did not cover, because
 * they all committed before finishing. With the tree left dirty, `finish` was ACCEPTED, recorded
 * `changed_files: ["src/dedupe.ts"]`, and recorded `result_commit` = the BASE commit — a commit that
 * does not contain the edit:
 *
 *     finish outcome       : ACCEPTED
 *     HEAD == base         : 327f7724efef
 *     working tree dirty   : "M src/dedupe.ts"
 *     report.result_commit : 327f7724efef
 *     resultCommit contains the work: NO
 *
 * The in-place promotion guard could not catch it either: it compares the recorded commit against the
 * repository HEAD, and in that state both are the base, so it passed and a promotion could record a
 * COMMITTED outcome whose canonical head contains none of the work.
 *
 * The invariant that closes it: **completed in-place work must be commit-materialized**, i.e.
 * `changed_files == Diff(base, resultCommit)`. It is what makes an `ATTEMPT_RESULT` verification
 * subject (phase 2B) a genuinely immutable artifact rather than a pointer at whatever the tree
 * happened to hold.
 *
 * The remedy is refusal, not committing on the agent's behalf: committing is ordinary agent work
 * (read / edit / test / commit), not governance machinery, so the product must not author commits.
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
const EDIT = "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n";

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown };
}

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-integrity-"));
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
      // Windows keeps the directory busy while a sqlite handle is open; the OS reaps it.
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function makeStack(repo: string, execution: "in-place" | "worktree") {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "integrity",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git,
      execution,
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
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
  const finishTool = defineWorkTools(installed.application as never).find((entry) => entry.name === "palimpsest_finish");
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
): Promise<string> {
  await call("palimpsest_start", {
    projectId: "integrity",
    goal: "make dedupe cheap",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "rewrite dedupe", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
    ],
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

function evidenceCount(connection: Connection): number {
  return (connection.prepare("SELECT COUNT(*) AS c FROM evidence WHERE project_id=?").get("integrity" as never) as { c: number }).c;
}

/** The commit the attempt's own report recorded — what phase 2B would bind as its subject. */
function recordedResultCommit(connection: Connection, attemptId: string): string | null {
  const row = connection.prepare("SELECT report_json FROM attempts WHERE attempt_id=?").get(attemptId as never) as {
    report_json: Uint8Array | null;
  };
  if (row.report_json === null) return null;
  const report = JSON.parse(new TextDecoder().decode(row.report_json)) as { result_commit: string | null };
  return report.result_commit;
}

function nameOnly(repo: string, args: readonly string[]): string[] {
  return execFileSync("git", ["diff", "--name-only", ...args], { cwd: repo })
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    // `.palimpsest/` is the product's own scaffolding and is filtered from every observation it
    // makes; the fixture's state databases live there, so the comparison must filter them too or it
    // would be comparing the product's plumbing against the attempt's work.
    .filter((path) => !path.startsWith(".palimpsest/"))
    .sort();
}

/** Untracked scaffolding the product leaves behind is not the attempt's work. */
function dirtyWorkFiles(repo: string): string[] {
  return execFileSync("git", ["status", "--porcelain"], { cwd: repo })
    .toString()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.slice(3).trim())
    .filter((path) => !path.startsWith(".palimpsest/"));
}

describe("LEAN-A22..A25: completed in-place work must be commit-materialized", () => {
  it("A22 an uncommitted tree cannot finish, and the refusal names the paths without recording anything", async () => {
    const { repo, head } = workspace();
    const { call, finish, connection } = makeStack(repo, "in-place");
    const attemptId = await runningAttempt(call, head);

    // Written, never committed: the exact state the probe showed being ACCEPTED before the fix.
    writeFileSync(join(repo, "src", "dedupe.ts"), EDIT);

    await expect(finish({ summary: "done" })).rejects.toThrow(/work that is not committed/);
    await expect(finish({})).rejects.toThrow(/src\/dedupe\.ts/);
    await expect(finish({})).rejects.toThrow(/Commit or revert them, then finish again/);
    // Still running, and — because the check runs before any command — nothing was recorded.
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
    expect(evidenceCount(connection)).toBe(0);
  });

  it("A23 after a successful finish the result commit really contains the work", async () => {
    const { repo, head } = workspace();
    const { call, finish, connection } = makeStack(repo, "in-place");
    const attemptId = await runningAttempt(call, head);

    writeFileSync(join(repo, "src", "dedupe.ts"), EDIT);
    commitAll(repo, "dedupe sorts");
    const result = await finish({ summary: "committed" });
    expect(result.state).toBe("COMPLETED");

    // The invariant an ATTEMPT_RESULT subject would need: the recorded commit exists, contains every
    // observed change, and the tree is clean at it.
    const recorded = recordedResultCommit(connection, attemptId);
    expect(recorded).not.toBeNull();
    const committedDiff = nameOnly(repo, [head, recorded!]);
    expect(committedDiff).toEqual([...((result.changedFiles as string[]) ?? [])].sort());
    expect(committedDiff).toEqual(["src/dedupe.ts"]);
    // The work is IN that commit, not merely beside it.
    expect(execFileSync("git", ["show", `${recorded}:src/dedupe.ts`], { cwd: repo }).toString()).toContain(".sort(");
    // And nothing was left behind in the working tree.
    expect(dirtyWorkFiles(repo)).toEqual([]);
  });

  it("A24 worktree-mode finish fails closed, and names the path that settles a placed attempt", async () => {
    const { repo, head } = workspace();
    const { call, finish } = makeStack(repo, "worktree");
    await runningAttempt(call, head);
    /**
     * §D2-a rewrote this test's PREMISE, not just its message. It used to refuse because a worktree
     * "cannot be observed" — and that stopped being true when the completion observation became
     * placement-aware (`#observeAttemptResultSync`). What still refuses, and for a real reason, is
     * that `finish` closes a DIRECT attempt: `begin` is in-place only (§E.4.1), so a worktree-placed
     * attempt has no direct work position to close and is settled by its own report path.
     */
    await expect(finish({})).rejects.toThrow(/finish closes a DIRECT attempt/);
    await expect(finish({})).rejects.toThrow(/palimpsest_report/);
  });

  it("A26 the mechanical pump cannot settle a zero-work COMPLETED attempt", async () => {
    const { repo, head } = workspace();
    const { call, installed, connection } = makeStack(repo, "in-place");

    // Drive to an attempt that exists but is not yet claimed: `start` → `next` (TASK_STARTED) →
    // `next` (ATTEMPT_CREATED). The pump claims it itself, which is what the live session hit.
    await call("palimpsest_start", {
      projectId: "integrity",
      goal: "make dedupe cheap",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "rewrite dedupe", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const attemptId = created.entityId;

    // THE LIVE FAILURE, reproduced deterministically: the tree is untouched, the pump runs the
    // policy command against the UNCHANGED code (exit 0), and would settle the attempt COMPLETED
    // with `changed_files: []`, `result_commit` = the base commit and zero evidence — the exact
    // state `finish` refuses, reached through the automatic path instead.
    const refusal = await installed.controller
      .runAttemptWithCommandExecutor(attemptId)
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    expect(refusal).not.toBeNull();
    expect(refusal).toMatch(/no observable work/);
    // And the refusal names the locus the task belongs to, not just the symptom.
    expect(refusal).toMatch(/reasoning branch/);

    // Nothing was settled: no COMPLETED attempt, and no evidence invented for one.
    expect(attemptState(connection, attemptId)).not.toBe("COMPLETED");
    expect(evidenceCount(connection)).toBe(0);
  });

  it("A25 the principal projection carries no attempt id, while the application result still does", async () => {
    const first = workspace();
    const firstStack = makeStack(first.repo, "in-place");
    await runningAttempt(firstStack.call, first.head);
    writeFileSync(join(first.repo, "src", "dedupe.ts"), EDIT);
    commitAll(first.repo, "work");
    const principal = await firstStack.finish({});
    // INV-4: orchestration state does not enter the principal context.
    expect(principal).not.toHaveProperty("attemptId");
    // `verification` is now part of the principal projection too: the verification CONCLUSION is
    // decision evidence (B.15), unlike the run id, subject digest and attempt id, which stay out.
    expect(Object.keys(principal).sort()).toEqual([
      "changedFiles",
      "evidenceRecorded",
      "nextEvidenceNeeded",
      "state",
      "verification",
    ]);

    // The application result keeps it — an operator surface may legitimately want to name the attempt.
    const second = workspace();
    const secondStack = makeStack(second.repo, "in-place");
    await runningAttempt(secondStack.call, second.head);
    writeFileSync(join(second.repo, "src", "dedupe.ts"), EDIT);
    commitAll(second.repo, "work");
    const application = await secondStack.installed.application.work.finish({});
    expect(application.attemptId).toBeTruthy();
  });
});
