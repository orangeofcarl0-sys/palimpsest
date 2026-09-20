/**
 * In-place execution (PR2 of the observation root-cure): the attempt works in the canonical
 * repository tree — the model for an agent whose cwd IS the repository — and its report is
 * OBSERVED by the product (`git status`/HEAD, checked against the envelope's write_paths), never
 * assembled from caller claims.
 *
 * The defect this closes was measured live: a DSH agent did its work in the main repo while the
 * attempt worktree stayed at base, so the gate ran in an empty tree four times. In-place makes
 * work and observation the same tree; the mismatch is structurally impossible.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { parseGateDefinition } from "../src/evidence/index.js";
import { GitCliPort } from "../src/effects/index.js";
import { definePalimpsestTools } from "../src/tools/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function workspace(): { repo: string; head: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-inplace-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  const state = join(root, "state");
  mkdirSync(state, { recursive: true });
  const dispose = () => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // A still-open sqlite handle keeps the directory busy on Windows; the OS temp cleaner
      // reaps it. Failing the FILE over teardown temp hygiene is noise, not signal.
    }
  };
  cleanups.push(dispose);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
  return { repo, head, dispose };
}

function hostStub() {
  const definitions = new Map<string, { name: string; execute: (args: unknown, ctx: unknown) => Promise<unknown> }>();
  return {
    definitions,
    tools: {
      register: (definition: { name: string; execute: (args: unknown, ctx: unknown) => Promise<unknown> }) => {
        definitions.set(definition.name, definition);
        return () => definitions.delete(definition.name);
      },
    },
  };
}

function makeStack(
  repo: string,
  allowedCommands?: Array<{ executable: string; argv_prefix: string[] }>,
) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const host = hostStub();
  const installed = installPalimpsest(host as never, {
    projectId: "inplace",
    databasePath: join(repo, ".palimpsest", "orchestration.sqlite"),
    ordariumDatabasePath: join(repo, ".palimpsest", "ordarium.sqlite"),
    repository: repo,
    git,
    execution: "in-place",
    ...(allowedCommands === undefined
      ? {}
      : { policy: trustedDefaultPolicy({ allowed_commands: allowedCommands }) }),
  } as never);
  cleanups.push(() => {
    try {
      installed.controller.store.close();
    } catch {
      /* already closed */
    }
  });
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((t) => t.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  return { git, installed, call, host };
}

describe("in-place execution: work and observation are the same tree", () => {
  it("claim reports no worktree path; the report observes changed files and HEAD itself", async () => {
    const { repo, head: base } = workspace();
    const { call, installed } = makeStack(repo);

    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "count removed duplicates",
      headCommit: base,
      tasks: [
        {
          task_id: "t1",
          objective: "add duplicateCount to dedupe",
          depends_on: [],
          write_paths: ["src/dedupe.ts"],
          required_artifacts: ["src/dedupe.ts"],
        },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const attemptId = created.entityId;

    const claim = (await call("palimpsest_claim", { attemptId })) as { worktreePath: string; baseCommit?: string };
    // In-place: NO worktree is created — work happens in this repository.
    expect(claim.worktreePath).toBe("");

    // The agent edits the repo it stands in (its cwd), exactly the live-session behaviour.
    writeFileSync(
      join(repo, "src", "dedupe.ts"),
      "export function dedupe(values: number[]): { values: number[]; duplicateCount: number } {\n  const seen = new Set<number>();\n  const out: number[] = [];\n  for (const v of values) { if (seen.has(v)) continue; seen.add(v); out.push(v); }\n  return { values: out, duplicateCount: values.length - out.length };\n}\n",
    );
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "count duplicates"], { cwd: repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();

    // The report carries NO changed_files and NO result_commit: the product observes both.
    const report = (await call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done" })) as {
      eventType: string;
    };
    expect(report.eventType).toBe("ATTEMPT_COMPLETED");

    // The report is read straight from the attempts projection: changed_files and result_commit
    // must be the product's OBSERVATION (git status/HEAD), not anything the caller passed.
    const row = (installed.controller.store.connection
      .prepare("SELECT report_json FROM attempts WHERE attempt_id=?")
      .get(attemptId) as { report_json: Uint8Array })!;
    const report2 = JSON.parse(new TextDecoder().decode(row.report_json)) as {
      changed_files: string[];
      result_commit: string | null;
    };
    // Observed, not claimed — the caller passed neither field.
    expect(report2.changed_files).toEqual(["src/dedupe.ts"]);
    expect(report2.result_commit).toBe(head);
  });

  it("an out-of-scope change fails the report loudly, naming the path", async () => {
    const { repo, head: base } = workspace();
    const { call } = makeStack(repo);

    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "only touch dedupe",
      headCommit: base,
      tasks: [
        { task_id: "t1", objective: "edit dedupe only", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: created.entityId });

    // A second file OUTSIDE the envelope's write_paths.
    writeFileSync(join(repo, "src", "other.ts"), "export const sneaky = true;\n");

    await expect(
      call("palimpsest_report", { attemptId: created.entityId, workerStatus: "completed", summary: "done" }),
    ).rejects.toThrow(/outside the task envelope's write_paths.*src\/other\.ts/);
  });

  it("a second concurrent claim is refused in-place (one writer per tree)", async () => {
    const { repo } = workspace();
    const { call } = makeStack(repo);
    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "two tasks one tree",
      tasks: [
        { task_id: "t1", objective: "a", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
        { task_id: "t2", objective: "b", depends_on: ["t1"], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const first = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: first.entityId });

    // Advance the scheduler until a second attempt exists, then try to claim it concurrently.
    let second: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const step = (await call("palimpsest_next", {})) as { entityId?: string };
      if (step?.entityId?.startsWith("attempt-")) {
        second = step.entityId;
        break;
      }
    }
    if (second !== undefined) {
      await expect(call("palimpsest_claim", { attemptId: second })).rejects.toThrow(
        /in-place execution allows one RUNNING attempt at a time/,
      );
    }
  });

  it("worktree mode is untouched: claim still creates the isolated worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-wt-"));
    const repo = join(root, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "dedupe.ts"), "x\n");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
    const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    const installed = installPalimpsest(hostStub() as never, {
      projectId: "wt",
      databasePath: join(root, "p.sqlite"),
      ordariumDatabasePath: join(root, "o.sqlite"),
      repository: repo,
      git,
    } as never);
    cleanups.push(() => void installed.dispose());
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = installed.tools.find((t) => t.name === name)!;
      return (await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })) as Record<string, unknown>;
    };
    await call("palimpsest_start", {
      projectId: "wt",
      goal: "g",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] }],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const claim = (await call("palimpsest_claim", { attemptId: created.entityId })) as { worktreePath: string };
    // Default mode unchanged: a real isolated worktree on disk.
    expect(claim.worktreePath).not.toBe("");
    expect(existsSync(claim.worktreePath)).toBe(true);
  });
});

describe("gate observation: only a number is an exit code", () => {
  it("a missing executable observes as null, never NaN (the live defect)", async () => {
    const { repo } = workspace();
    const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
    // The gate runs with cwd = the attempt's tree; create it so only the EXECUTABLE can be missing.
    mkdirSync(join(repo, ".palimpsest", "worktrees", "attempt-x"), { recursive: true });
    // Measured live: a deployment whose PATH lacked the gate executable reported
    // "exitCode must be an integer or null" because Number("ENOENT") is NaN — neither a code nor
    // an honest null. The observation must say "no process ran", which the controller then reports
    // as no-observation rather than recording anything.
    const missing = await git.runGate({ worktreeId: "attempt-x", executable: "definitely-not-a-real-command-xyz", argv: [] });
    expect(missing).toEqual({ exitCode: null, outputTail: "" });
    // A real command's real code is still observed exactly.
    const failing = await git.runGate({ worktreeId: "attempt-x", executable: "python", argv: ["-c", "import sys; sys.exit(5)"] });
    expect(failing.exitCode).toBe(5);
  });
});

describe("in-place gate: it runs where the work is", () => {
  it("the gate executes in the repository and records the observed exit code", async () => {
    const { repo, head: base } = workspace();
    // The OPERATOR declares this project's gate commands (the profile's policy block); nothing
    // else can widen them, which is why the agent could not fix this itself in the live session.
    const { call } = makeStack(repo, [
      { executable: "python", argv_prefix: ["-m", "pytest"] },
      { executable: "python", argv_prefix: ["-c"] },
    ]);
    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "a gate that can actually run",
      headCommit: base,
      tasks: [
        { task_id: "t1", objective: "check the tree", depends_on: [], write_paths: ["src"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const attemptId = created.entityId;
    await call("palimpsest_claim", { attemptId });

    // The defect this pins, found live: in-place claim creates NO worktree, yet the gate spawned
    // with the (nonexistent) worktree path as cwd → ENOENT → every in-place gate was unobservable
    // and the project could never record evidence. The gate must run in the repository.
    const gate = (await call("palimpsest_gate", {
      attemptId,
      predicate: "process_exit_zero",
      // A real command, allowed by the envelope's default policy, that succeeds in this directory.
      command: ["python", "-c", "print('gate ran here')"],
    })) as { exitCode: number | null; outputTail?: string };
    expect(gate.exitCode).toBe(0);
    expect(String(gate.outputTail)).toContain("gate ran here");
  });
});

describe("in-place promotion: the tree must not move past the report", () => {
  const POLICY = [
    { executable: "python", argv_prefix: ["-m", "pytest"] },
    { executable: "python", argv_prefix: ["-c"] },
  ];

  const driveToVerifying = async (repo: string, base: string, call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "promote only what was observed",
      headCommit: base,
      tasks: [
        { task_id: "t1", objective: "edit dedupe", depends_on: [], write_paths: ["src"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const attemptId = created.entityId;
    await call("palimpsest_claim", { attemptId });
    return attemptId;
  };

  it("refuses promotion when work landed after the report, naming both commits", async () => {
    const { repo, head: base } = workspace();
    const { call, installed } = makeStack(repo, POLICY);
    const attemptId = await driveToVerifying(repo, base, call);

    // Report with a clean tree (the mechanical pump's behaviour), then do the work afterwards.
    await call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "nothing yet" });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "real work"], { cwd: repo });

    // The defect this pins, found live: promoting would merge the recorded (pre-work) commit —
    // a no-op that moves the head to a commit which does not contain the work.
    await expect(installed.controller.promoteAttempt({ attemptId })).rejects.toThrow(
      /work landed after the report.*report the attempt again/s,
    );
  });

  it("allows promotion when the recorded commit IS the current head", async () => {
    const { repo, head: base } = workspace();
    const { call, installed } = makeStack(repo, POLICY);
    const attemptId = await driveToVerifying(repo, base, call);

    // Work first, commit, then report: the observation records the commit that contains it.
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)]; // counted");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "counted"], { cwd: repo });
    await call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done" });

    // The precondition passes; eligibility (not the staleness rule) decides the rest, so the call
    // must not throw the staleness error.
    await installed.controller.promoteAttempt({ attemptId }).catch((error: unknown) => {
      expect(String((error as Error).message)).not.toMatch(/work landed after the report/);
    });
  });
});

describe("in-place promotion: the ledger advances to the work that is already in the tree", () => {
  const POLICY = [
    { executable: "python", argv_prefix: ["-m", "pytest"] },
    { executable: "python", argv_prefix: ["-c"] },
  ];

  it("promotes: the task is satisfied and the ledger head becomes the recorded commit", async () => {
    const { repo, head: base } = workspace();
    const { call, installed } = makeStack(repo, POLICY);
    await call("palimpsest_start", {
      projectId: "inplace",
      goal: "close the loop in place",
      headCommit: base,
      tasks: [
        { task_id: "t1", objective: "edit dedupe", depends_on: [], write_paths: ["src"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    const attemptId = created.entityId;
    await call("palimpsest_claim", { attemptId });

    // Work, commit, then observe: the recorded commit contains the work and IS the repo head.
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)]; // counted");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "counted"], { cwd: repo });
    const recorded = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    await call("palimpsest_report", { attemptId, workerStatus: "completed", summary: "done" });

    // Evidence the release gate will require, observed by the product.
    await call("palimpsest_gate", { attemptId, predicate: "process_exit_zero", command: ["python", "-c", "pass"] });

    // The scheduler settles the batch, then the operator declares and evaluates the gate.
    for (let step = 0; step < 8; step += 1) {
      if (installed.controller.status().tasks[0]?.state === "VERIFYING") break;
      if (installed.controller.step() === null) break;
    }
    installed.controller.declareGate(
      parseGateDefinition({
        gate_id: "gate-release",
        version: 1,
        subject_type: "attempt",
        require: { all: [{ exists: { predicate: "process_exit_zero" } }] },
      }),
      "in-place loop",
    );
    expect(installed.controller.evaluateAttemptGate("gate-release", attemptId).verdict).toBe("PASS");

    // The defect this pins, found live: promotion ran a worktree-style merge whose precondition
    // (repo head == the ledger's proven head) can NEVER hold in-place, because the agent's own
    // commit is the repo head. The merge is now performed against the repository's head — git's
    // honest "Already up to date" — while the recorded fact still advances from the chain head.
    const outcome = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
    expect(outcome.resultingHeadCommit).toBe(recorded);

    // The operator's last step: the promotion advanced the head, and the machine reconciles that
    // advance and settles the batch — exactly what `palimpsest control next` does for a person.
    for (let turn = 0; turn < 6; turn += 1) {
      const state = installed.controller.status();
      if (state.tasks.every((entry) => entry.state === "SATISFIED") && state.head?.state === "IN_SYNC") break;
      await installed.controller.runTurn();
    }
    const after = installed.controller.status();
    expect(after.tasks[0]?.state).toBe("SATISFIED");
    expect(after.head?.projectHeadCommit).toBe(recorded);
    expect(after.head?.state).toBe("IN_SYNC");
    expect(after.promotions.length).toBe(1);
    // And the work is in the canonical head, not merely adjacent to it.
    expect(execFileSync("git", ["show", "HEAD:src/dedupe.ts"], { cwd: repo }).toString()).toContain("counted");
  });
});
