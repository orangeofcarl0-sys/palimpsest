/**
 * PC1 S02-R02 — placement-independent completion. A placed attempt has a normal product path: the
 * principal's `palimpsest_work action=complete` settles it through the existing D2 settlement owner,
 * rather than telling the principal to wait for a host worker that may not exist.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-placed-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

function standard(): ProjectStandard {
  return Object.freeze({
    statement: "the change stays inside the declared write scope",
    clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
    derivedFrom: Object.freeze(["PC1 placed-completion fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

describe("PC1 S02-R02: a placed attempt completes through the normal product path", () => {
  it("settles the world, exports the result, and leaves the task VERIFYING", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = installProduct(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "pc1",
        repository: repo,
        stateDir,
        execution: "worktree",
        standard: standard(),
        toolProfile: "normal",
      },
    );
    cleanups.push(() => void installed.dispose());
    installed.controller.start({
      projectId: "pc1",
      goal: "deliver the placed result",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    installed.controller.step();
    const created = installed.controller.step()!;
    const claimed = await installed.controller.claim(created.entity_id);
    const world = claimed.worldPath;
    writeFileSync(join(world, "deliverable.md"), "# delivered\n");
    execFileSync("git", ["add", "-A"], { cwd: world });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "deliver"], { cwd: world });

    const tool = installed.tools.find((entry) => entry.name === "palimpsest_work") as DshToolDefinition | undefined;
    expect(tool).toBeDefined();
    const result = (await tool!.execute(
      { action: "complete", summary: "delivered" },
      { callId: "c", rootCallId: "r", name: "palimpsest_work", arguments: {}, signal: new AbortController().signal },
    )) as { state: string; resultCommit: string; changedFiles: string[] };
    expect(result.state).toBe("COMPLETED");
    expect(result.resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(result.changedFiles).toContain("deliverable.md");
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("VERIFYING");
    // Object availability, not canonical acceptance: the head has not moved.
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(head);

    const promoted = await installed.controller.promotions.promoteAttempt({ attemptId: created.entity_id });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    expect(promoted.resultingHeadCommit).not.toBe(head);
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("SATISFIED");
  });

  it("an existing READY task can be entered with `start` and completed in-place", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = installProduct(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "pc1",
        repository: repo,
        stateDir,
        execution: "in-place",
        standard: standard(),
        toolProfile: "normal",
      },
    );
    cleanups.push(() => void installed.dispose());
    installed.controller.start({
      projectId: "pc1",
      goal: "deliver the in-place result",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_work") as DshToolDefinition;
    const started = (await tool.execute(
      { action: "start" },
      { callId: "c1", rootCallId: "r", name: "palimpsest_work", arguments: {}, signal: new AbortController().signal },
    )) as { state: string; status: { summary: { attemptsRunning: number } } };
    expect(started.state).toBe("READY");
    expect(started.status.summary.attemptsRunning).toBe(1);
    writeFileSync(join(repo, "deliverable.md"), "# delivered\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "deliver"], { cwd: repo });
    const completed = (await tool.execute(
      { action: "complete", summary: "delivered" },
      { callId: "c2", rootCallId: "r", name: "palimpsest_work", arguments: {}, signal: new AbortController().signal },
    )) as { state: string; changedFiles: string[]; evidenceRecorded: string[] };
    expect(completed.state).toBe("COMPLETED");
    expect(completed.changedFiles).toContain("deliverable.md");
    expect(completed.evidenceRecorded).toContain("write_scope_valid");
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("VERIFYING");
  });
});
