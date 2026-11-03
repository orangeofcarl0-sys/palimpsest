/**
 * PC1-V1 R4 — the declared execution boundary must match the filesystem.
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
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r4-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the test process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R4 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function install(repo: string, stateDir: string, execution: "in-place" | "worktree") {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pc1v1", repository: repo, stateDir, execution, standard, toolProfile: "normal" },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

function start(installed: ReturnType<typeof install>, head: string, writePaths: string[], artifacts: string[] = []) {
  installed.controller.start({
    projectId: "pc1v1",
    goal: "write one governed file",
    headCommit: head,
    tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: writePaths, required_artifacts: artifacts }],
  });
}

function workTool(installed: ReturnType<typeof install>): DshToolDefinition {
  const tool = installed.tools.find((entry) => entry.name === "palimpsest_work");
  if (tool === undefined) throw new Error("palimpsest_work is absent");
  return tool;
}

async function call(installed: ReturnType<typeof install>, args: Record<string, unknown>) {
  return workTool(installed).execute(args, {
    callId: "c",
    rootCallId: "r",
    name: "palimpsest_work",
    arguments: args,
    signal: new AbortController().signal,
  }) as Promise<Record<string, unknown>>;
}

describe("PC1-V1 R4: in-place is direct editing, stated before the first write", () => {
  it("the live tree moves immediately while the canonical project head does not", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, "in-place");
    start(installed, head, ["docs/a.md"], ["docs/a.md"]);
    const status = (await call(installed, { action: "status" })) as {
      boundary: { liveRepositoryMutable: boolean; isolated: boolean; warning: string | null };
    };
    expect(status.boundary.liveRepositoryMutable).toBe(true);
    expect(status.boundary.isolated).toBe(false);
    expect(status.boundary.warning).toMatch(/live project tree|isolated/iu);

    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no attempt");
    await installed.controller.claim(created.entity_id);
    writeFileSync(join(repo, "docs", "a.md"), "# a\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "a"], { cwd: repo });
    const liveHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    expect(liveHead).not.toBe(head);
    expect(installed.controller.work.project().head_commit).toBe(head);

    const completed = await call(installed, { action: "complete", summary: "a" });
    expect((completed.boundary as { liveRepositoryMutable: boolean }).liveRepositoryMutable).toBe(true);
    expect(installed.controller.work.project().head_commit).toBe(head);
  });

  it("an out-of-scope edit is refused and the attempt stays RUNNING", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, "in-place");
    start(installed, head, ["docs/a.md"], []);
    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no attempt");
    await installed.controller.claim(created.entity_id);
    writeFileSync(join(repo, "docs", "other.md"), "# other\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "other"], { cwd: repo });
    await expect(call(installed, { action: "complete" })).rejects.toThrow(/outside|write_paths|scope/iu);
    expect(installed.controller.status().attempts.find((attempt) => attempt.attempt_id === created.entity_id)?.state).toBe("RUNNING");
  });
});

describe("PC1-V1 R4: worktree is an isolated candidate until Promotion", () => {
  it("result export leaves the canonical head alone; authorized promotion moves it exactly", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, "worktree");
    start(installed, head, ["docs/candidate.md"], ["docs/candidate.md"]);
    const status = (await call(installed, { action: "status" })) as {
      boundary: { liveRepositoryMutable: boolean; isolated: boolean; warning: string | null };
    };
    expect(status.boundary.liveRepositoryMutable).toBe(false);
    expect(status.boundary.isolated).toBe(true);
    expect(status.boundary.warning).toBeNull();

    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no attempt");
    const claimed = await installed.controller.claim(created.entity_id);
    mkdirSync(join(claimed.worldPath, "docs"), { recursive: true });
    writeFileSync(join(claimed.worldPath, "docs", "candidate.md"), "# candidate\n");
    execFileSync("git", ["add", "-A"], { cwd: claimed.worldPath });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: claimed.worldPath });

    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(head);
    const completed = await call(installed, { action: "complete", summary: "candidate" });
    expect((completed.boundary as { isolated: boolean }).isolated).toBe(true);
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(head);
    expect(installed.controller.work.project().head_commit).toBe(head);

    const promoted = await installed.controller.promoteAttempt({ attemptId: created.entity_id, gateId: "gate-release" });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    expect(promoted.resultingHeadCommit).not.toBe(head);
    expect(installed.controller.work.project().head_commit).toBe(promoted.resultingHeadCommit);
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(promoted.resultingHeadCommit);
  });
});
