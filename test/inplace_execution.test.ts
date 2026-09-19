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

import { installPalimpsest } from "../src/install.js";
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

function makeStack(repo: string) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const host = hostStub();
  const installed = installPalimpsest(host as never, {
    projectId: "inplace",
    databasePath: join(repo, ".palimpsest", "orchestration.sqlite"),
    ordariumDatabasePath: join(repo, ".palimpsest", "ordarium.sqlite"),
    repository: repo,
    git,
    execution: "in-place",
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
