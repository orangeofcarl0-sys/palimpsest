/**
 * PLMP-LEAN-1 §D2-a — the ISOLATED WORK EXECUTION WORLD and ONE completion observation.
 *
 * D2's first slice is deliberately mechanical and model-free, because the question it has to answer is
 * not "how do we spawn a coder" but:
 *
 *     A real Work attempt placed in an isolated worktree — can Palimpsest still say exactly what it
 *     did, whether anything was left uncommitted, and what its immutable result commit is?
 *
 * Before this slice the answer was NO for the worktree placement: `report` took the worker's own
 * `changedFiles`/`resultCommit` on trust, and only the in-place path was observed. So the two
 * placements had two different completion rules — the thing that must never happen:
 *
 *     CompletionInvariant(in-place) == CompletionInvariant(worktree)
 *
 * Everything below runs against a REAL repository and a REAL `git worktree`, so "isolated" means what
 * git means by it. The adversarial four are the cases a completion rule exists to catch.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const INITIAL = "export const dedupe = (v: number[]) => [...new Set(v)];\n";
const EDITED = "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n";

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
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2a-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "dedupe.ts"), INITIAL);
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
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/**
 * The canonical tree's OWN view of untracked files, with the product's scaffolding filtered — the
 * same `.palimpsest/` filter every observation the product makes applies. Without it the comparison
 * would be measuring the product's plumbing (state databases, worktrees) rather than the attempt's
 * work.
 */
const porcelain = (cwd: string): string[] =>
  git(cwd, ["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(".palimpsest/"));

const commitAll = (cwd: string, message: string): string => {
  execFileSync("git", ["add", "-A"], { cwd });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd });
  return git(cwd, ["rev-parse", "HEAD"]);
};

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown };
}

function makeStack(repo: string, execution: "in-place" | "worktree") {
  const gitPort = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d2a",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: gitPort,
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
  return { installed, controller: installed.controller, connection, call, gitPort };
}

/** Drive a real attempt to RUNNING; under worktree placement this is what CREATES the world. */
async function runningAttempt(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
): Promise<string> {
  await call("palimpsest_start", {
    projectId: "d2a",
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

/** Read the observation of a world that MUST be observable, or fail the test loudly. */
function observableWorld(
  controller: { observeAttemptResult: (attemptId: string) => AttemptObservation | null },
  attemptId: string,
): AttemptObservation {
  const observed = controller.observeAttemptResult(attemptId);
  if (observed === null) throw new Error(`attempt ${attemptId} was expected to be observable`);
  return observed;
}

interface AttemptObservation {
  readonly placement: string;
  readonly workDir: string;
  readonly baseCommit: string;
  readonly observedHead: string;
  readonly committedChanges: readonly string[];
  readonly uncommittedChanges: readonly string[];
  readonly changedFiles: readonly string[];
  readonly requiredArtifacts: readonly { readonly path: string; readonly present: boolean }[];
}

function attemptState(connection: Connection, attemptId: string): string {
  return (connection.prepare("SELECT state FROM attempts WHERE attempt_id=?").get(attemptId as never) as { state: string }).state;
}

function eventCount(connection: Connection): number {
  return (connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=?").get("d2a" as never) as { c: number }).c;
}

describe("§D2-a A. the Work execution world is a real, isolated, attempt-bound worktree", () => {
  it("placing an attempt creates an isolated worktree at the attempt's base commit", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo, "worktree");

    const attemptId = await runningAttempt(call, head);
    const observation = controller.observeAttemptResult(attemptId);
    if (observation === null) throw new Error("a real worktree placement must be observable");

    expect(observation.placement).toBe("worktree");
    expect(observation.baseCommit).toBe(head);
    // A REAL git worktree, not a copy: git knows it, and it is the attempt's own directory.
    // Separator-agnostic: the product builds this path with forward slashes (it is a git path), and
    // the assertion is about WHERE the world is, not about which slash names it.
    expect(observation.workDir.split(String.fromCharCode(92)).join("/")).toContain(`.palimpsest/worktrees/${attemptId}`);
    expect(existsSync(observation.workDir)).toBe(true);
    expect(git(repo, ["worktree", "list"]).split("\n").some((line) => line.includes(attemptId))).toBe(true);
    // It is the BASE, and the canonical tree is untouched by having created it.
    expect(git(observation.workDir, ["rev-parse", "HEAD"])).toBe(head);
    expect(porcelain(repo)).toEqual([]);
  });

  it("a missing execution world is refused, never reported as a clean one", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);
    rmSync(workDir, { recursive: true, force: true });
    git(repo, ["worktree", "prune"]);
    // "I cannot see it" must never read as "there is nothing to see".
    expect(() => controller.observeAttemptResult(attemptId)).toThrow(/has no work execution world/);
  });
});

describe("§D2-a B. ONE observation, so the completion rule cannot differ by placement", () => {
  it("work observed in an isolated worktree refuses an uncommitted completion (the same rule as in-place)", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);

    // The worker edits INSIDE its world and does not commit — the exact state 2A-R was built to catch.
    writeFileSync(join(workDir, "src", "dedupe.ts"), EDITED);
    const observed = observableWorld(controller, attemptId);
    expect(observed.committedChanges).toEqual([]);
    expect(observed.uncommittedChanges).toEqual(["src/dedupe.ts"]);
    expect(observed.changedFiles).toEqual(["src/dedupe.ts"]);
    // The result commit would be the BASE, i.e. a commit that does not contain the work.
    expect(observed.observedHead).toBe(head);

    const before = eventCount(connection);
    await expect(
      call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done", changedFiles: ["src/dedupe.ts"] }),
    ).rejects.toThrow(/not committed/u);
    expect(eventCount(connection)).toBe(before);
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
  });

  it("work observed in an isolated worktree settles on the commit made INSIDE it, not on a caller's claim", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);

    writeFileSync(join(workDir, "src", "dedupe.ts"), EDITED);
    const result = commitAll(workDir, "dedupe sorts");
    expect(result).not.toBe(head);

    const observed = observableWorld(controller, attemptId);
    expect(observed.committedChanges).toEqual(["src/dedupe.ts"]);
    expect(observed.uncommittedChanges).toEqual([]);
    expect(observed.observedHead).toBe(result);
    expect(observed.requiredArtifacts).toEqual([{ path: "src/dedupe.ts", present: true }]);

    // The caller claims a DIFFERENT commit and OTHER files. The observation wins, in this placement
    // exactly as it does in-place — which is the whole point of having one observation.
    await call("palimpsest_report", {
      attemptId,
      workerStatus: "completed",
      summary: "done",
      changedFiles: ["totally/wrong.ts"],
      resultCommit: "f".repeat(40),
    });
    expect(attemptState(connection, attemptId)).toBe("COMPLETED");
    const row = connection.prepare("SELECT report_json FROM attempts WHERE attempt_id=?").get(attemptId as never) as {
      report_json: Uint8Array;
    };
    const report = JSON.parse(new TextDecoder().decode(row.report_json)) as {
      result_commit: string;
      changed_files: string[];
    };
    expect(report.result_commit).toBe(result);
    expect(report.changed_files).toEqual(["src/dedupe.ts"]);
    // And the canonical tree still holds NONE of it: the work lives in the attempt's world until the
    // exit path decides what to do with it.
    expect(porcelain(repo)).toEqual([]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  });

  it("a commit followed by more uncommitted drift is refused too (a result commit is not a licence)", async () => {
    const { repo, head } = workspace();
    const { controller, call, connection } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);

    writeFileSync(join(workDir, "src", "dedupe.ts"), EDITED);
    commitAll(workDir, "dedupe sorts");
    writeFileSync(join(workDir, "src", "dedupe.ts"), `${EDITED}// and then some more\n`);

    const observed = observableWorld(controller, attemptId);
    expect(observed.committedChanges).toEqual(["src/dedupe.ts"]);
    expect(observed.uncommittedChanges).toEqual(["src/dedupe.ts"]);
    // Both states are named: "there is a result commit" is not a reason to ignore what came after it.
    await expect(call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done" })).rejects.toThrow(
      /not committed/u,
    );
    expect(attemptState(connection, attemptId)).toBe("RUNNING");
  });

  it("out-of-scope work in the placed world is refused, and the refusal names the placement", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);

    mkdirSync(join(workDir, "src", "elsewhere"), { recursive: true });
    writeFileSync(join(workDir, "src", "elsewhere", "x.ts"), "export const x = 1;\n");
    commitAll(workDir, "out of scope");

    await expect(call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done" })).rejects.toThrow(
      /worktree attempt .* outside the task envelope's write_paths/u,
    );
  });
});

describe("§D2-a C. result identity is not promotion authority", () => {
  it("keeps observing base → result honestly even after the CANONICAL head moves on", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo, "worktree");
    const attemptId = await runningAttempt(call, head);
    const { workDir } = observableWorld(controller, attemptId);

    writeFileSync(join(workDir, "src", "dedupe.ts"), EDITED);
    const result = commitAll(workDir, "dedupe sorts");

    // Someone else moves the canonical branch (the principal committing on the live tree).
    writeFileSync(join(repo, "src", "other.ts"), "export const other = 1;\n");
    const canonical = commitAll(repo, "unrelated canonical work");
    expect(canonical).not.toBe(head);

    // The observation stays about THIS attempt's world: base H0, result R. It does not pretend the
    // result is based on H1, and it does not hide the fact that the world's base has moved on.
    const observed = observableWorld(controller, attemptId);
    expect(observed.baseCommit).toBe(head);
    expect(observed.observedHead).toBe(result);
    expect(observed.changedFiles).toEqual(["src/dedupe.ts"]);

    /**
     * Whether `result` may be promoted onto the canonical branch is a DIFFERENT question, asked at the
     * exit by the layer that owns that authority — and it must be answered against the canonical head,
     * not against this observation. `cross_revision_promotion_not_supported` (§3.2) is that answer, and
     * it is enforced where promotion is actually attempted (the git port's expected-head contract, and
     * the promotion admission layer built in D2-b/D2-e). D2-a's job is only to keep the two apart.
     */
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(canonical);
    expect(observed.observedHead).not.toBe(canonical);
  });
});
