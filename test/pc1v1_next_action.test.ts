/**
 * PC1-V1 R2 — the normal product must not advertise a transition the Scheduler will refuse.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { explainWorkState } from "../src/domain/work_state.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r2-"));
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

const scopeStandard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R2 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function install(repo: string, stateDir: string, standard: ProjectStandard | null = scopeStandard) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1v1",
      repository: repo,
      stateDir,
      execution: "in-place",
      ...(standard === null ? {} : { standard }),
      toolProfile: "normal",
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

const baseInput = {
  standardConfirmed: true,
  schedulerState: "RUNNING" as const,
  schedulerDecision: null,
  schedulerError: null,
  tasks: [{ taskId: "a", state: "READY" }],
  attempts: [],
  holds: [],
  promotionFence: [],
  headState: "IN_SYNC",
};

describe("PC1-V1 R2: the pure state explanation", () => {
  it("names each blocking condition without advertising a guaranteed transition", () => {
    expect(explainWorkState(baseInput).executable).toBe(false);
    expect(explainWorkState(baseInput).detail).toMatch(/no activation decision|futile/iu);

    const stepping = explainWorkState({ ...baseInput, schedulerDecision: { eventType: "ATTEMPT_CREATED", entityId: "attempt-1" } });
    expect(stepping.kind).toBe("EXECUTE_SCHEDULER_STEP");
    expect(stepping.executable).toBe(true);
    expect(stepping.action).toBe("palimpsest_work action=next");

    expect(
      explainWorkState({
        ...baseInput,
        tasks: [
          { taskId: "seen", state: "VERIFYING" },
          { taskId: "next", state: "READY" },
        ],
      }).kind,
    ).toBe("WAIT_OPERATOR_ACCEPT");

    expect(explainWorkState({ ...baseInput, schedulerState: "PAUSED" }).kind).toBe("SCHEDULER_PAUSED");
    expect(explainWorkState({ ...baseInput, holds: ["a"] }).detail).toMatch(/hold/iu);
    expect(
      explainWorkState({ ...baseInput, promotionFence: [{ taskId: "a", state: "PREPARED" }] }).kind,
    ).toBe("WAIT_OPERATOR_RECOVERY");
    expect(explainWorkState({ ...baseInput, headState: "SYNC_REQUIRED" }).kind).toBe("WAIT_OPERATOR_HEAD_SYNC");
    expect(explainWorkState({ ...baseInput, standardConfirmed: false }).kind).toBe("NEEDS_COMPLETION_STANDARD");
    expect(
      explainWorkState({ ...baseInput, tasks: [{ taskId: "a", state: "BLOCKED" }] }).kind,
    ).toBe("WAIT_DEPENDENCIES");
    const noFormalWork = explainWorkState({ ...baseInput, tasks: [], attempts: [] });
    expect(noFormalWork.kind).toBe("NO_FORMAL_WORK");
    expect(noFormalWork.executable).toBe(false);
    expect(noFormalWork.session?.mayEnd).toBe(true);
    expect(noFormalWork.detail).toMatch(/no live formal task/iu);
  });
});

describe("PC1-V1 R2: the normal surface does not contradict the Scheduler", () => {
  it("a VERIFYING result makes a READY task un-nextable, and status/continuity both say why", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir);
    installed.controller.start({
      projectId: "pc1v1",
      goal: "two independent deliverables",
      headCommit: head,
      tasks: [
        { task_id: "first", objective: "first", depends_on: [], write_paths: ["docs/first.md"], required_artifacts: ["docs/first.md"] },
        { task_id: "second", objective: "second", depends_on: [], write_paths: ["docs/second.md"], required_artifacts: ["docs/second.md"] },
      ],
    });
    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no attempt");
    await installed.controller.claim(created.entity_id);
    writeFileSync(join(repo, "docs", "first.md"), "# first\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "first"], { cwd: repo });
    await installed.controller.finish({ summary: "first delivered" });
    installed.controller.step();

    const status = installed.controller.status();
    expect(status.tasks.find((task) => task.task_id === "first")?.state).toBe("VERIFYING");
    expect(status.tasks.find((task) => task.task_id === "second")?.state).toBe("READY");
    expect(status.nextAction.kind).toBe("WAIT_OPERATOR_ACCEPT");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.detail).toMatch(/next will make no progress/iu);
    expect(installed.controller.step()).toBeNull();

    const tool = installed.tools.find((entry) => entry.name === "palimpsest_work") as DshToolDefinition | undefined;
    const projected = (await tool!.execute(
      { action: "status" },
      { callId: "c", rootCallId: "r", name: "palimpsest_work", arguments: {}, signal: new AbortController().signal },
    )) as { nextAction: { kind: string }; nextActions: string[] };
    expect(projected.nextAction.kind).toBe("WAIT_OPERATOR_ACCEPT");
    expect(projected.nextActions).toHaveLength(1);
    expect(projected.nextActions[0]).toMatch(/^operator:/u);
    expect(projected.nextActions[0]).not.toBe("palimpsest_work action=next");

    const continuityTool = installed.tools.find((entry) => entry.name === "palimpsest_continuity") as DshToolDefinition | undefined;
    expect(continuityTool).toBeDefined();
    const summary = (await continuityTool!.execute(
      { action: "summary" },
      { callId: "c2", rootCallId: "r2", name: "palimpsest_continuity", arguments: {}, signal: new AbortController().signal },
    )) as { nextActions: string[] };
    expect(summary.nextActions[0]).toMatch(/^operator:/u);
    expect(summary.nextActions).not.toContain("agent: palimpsest_work action=next");
  });

  it("pause and hold are reported as states, not as work to do", () => {
    const paused = workspace();
    const pausedInstall = install(paused.repo, paused.stateDir);
    pausedInstall.controller.start({
      projectId: "pc1v1",
      goal: "paused project",
      headCommit: paused.head,
      tasks: [{ task_id: "a", objective: "a", depends_on: [], write_paths: ["docs/a.md"], required_artifacts: [] }],
    });
    pausedInstall.controller.pause("operator pause");
    expect(pausedInstall.controller.status().nextAction.kind).toBe("SCHEDULER_PAUSED");

    const held = workspace();
    const heldInstall = install(held.repo, held.stateDir);
    heldInstall.controller.start({
      projectId: "pc1v1",
      goal: "held project",
      headCommit: held.head,
      tasks: [{ task_id: "a", objective: "a", depends_on: [], write_paths: ["docs/a.md"], required_artifacts: [] }],
    });
    heldInstall.controller.setHold("a", { reason: "operator hold", declaredBy: "test" });
    const status = heldInstall.controller.status();
    expect(status.holds).toContain("a");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.detail).toMatch(/hold/iu);
  });

  it("start claims an ATTEMPT_CREATED position that the principal did not claim yet", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir);
    installed.controller.start({
      projectId: "pc1v1",
      goal: "enter the prepared position",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["docs/notes.md"], required_artifacts: [] }],
    });
    installed.controller.step();
    const created = installed.controller.step();
    expect(created?.event_type).toBe("ATTEMPT_CREATED");
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_work") as DshToolDefinition | undefined;
    const result = (await tool!.execute(
      { action: "start", goal: "write the notes", writePaths: ["docs/notes.md"] },
      { callId: "start-claim", rootCallId: "r", name: "palimpsest_work", arguments: {}, signal: new AbortController().signal },
    )) as { state: string; boundary?: { liveRepositoryMutable: boolean } };
    expect(result.state).toBe("READY");
    expect(result.boundary?.liveRepositoryMutable).toBe(true);
    expect(installed.controller.status().attempts.find((attempt) => attempt.attempt_id === created!.entity_id)?.state).toBe("RUNNING");
  });

  it("a project without a confirmed standard says so before suggesting any completion", () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, null);
    installed.controller.start({
      projectId: "pc1v1",
      goal: "no standard",
      headCommit: head,
      tasks: [{ task_id: "a", objective: "a", depends_on: [], write_paths: ["docs/a.md"], required_artifacts: [] }],
    });
    expect(installed.controller.status().nextAction.kind).toBe("NEEDS_COMPLETION_STANDARD");
    expect(installed.controller.status().nextAction.executable).toBe(false);
  });
});
