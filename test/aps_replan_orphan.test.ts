/**
 * APS-C pilot regression — a typed plan revision that retires a task must also retire its live work
 * position from the in-place lane.
 *
 * Measured in the G pilot: `selection-final` was staled by a replan while its attempt row stayed
 * RUNNING; the next task could never claim because the in-place single-writer guard counted the
 * orphan. The task graph is the authority on whether a position exists; the attempt is history.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["APS replan orphan fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "aps-replan-orphan-"));
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
      /* sqlite handles may outlive the test process on Windows */
    }
  });
  return {
    repo,
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(),
    stateDir: join(root, "state"),
  };
}

describe("APS: a retired task's attempt does not hold the in-place lane", () => {
  it("stales the orphan and lets the replacement task claim", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = installProduct(
      { tools: { register: () => () => undefined } } as never,
      { projectId: "aps", repository: repo, stateDir, execution: "in-place", standard, toolProfile: "normal" },
    );
    cleanups.push(() => void installed.dispose());
    installed.controller.start({
      projectId: "aps",
      goal: "two tasks, one retired",
      headCommit: head,
      tasks: [
        { task_id: "a", objective: "first", depends_on: [], write_paths: ["docs/a.md"], required_artifacts: ["docs/a.md"] },
        { task_id: "b", objective: "second", depends_on: [], write_paths: ["docs/b.md"], required_artifacts: ["docs/b.md"] },
      ],
    });
    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no attempt was created");
    await installed.controller.claim(created.entity_id);
    expect(installed.controller.status().attempts.find((attempt) => attempt.attempt_id === created.entity_id)?.state).toBe("RUNNING");

    installed.controller.plan({
      goal: "two tasks, one retired",
      requirements: [],
      decisions: [],
      tasks: [
        {
          task_id: "a2",
          objective: "replacement first",
          depends_on: [],
          write_paths: ["docs/a2.md"],
          required_artifacts: ["docs/a2.md"],
        },
        { task_id: "b", objective: "second", depends_on: [], write_paths: ["docs/b.md"], required_artifacts: ["docs/b.md"] },
      ],
      reason: "replace the first task after its result became stale",
      changeClass: "contract_breaking",
      changedIds: ["a"],
    });
    installed.controller.step();

    const status = installed.controller.status();
    expect(status.tasks.find((task) => task.task_id === "a")?.state).toBe("STALE");
    const orphan = status.attempts.find((attempt) => attempt.attempt_id === created.entity_id);
    expect(orphan?.state).toBe("STALE");
    expect(orphan?.orphaned).toBe(true);
    expect(status.nextAction.kind).not.toBe("WAIT_ACTIVE_WORK");

    let replacement = status.attempts.find((attempt) => attempt.task_id === "a2" && attempt.state === "CREATED");
    for (let step = 0; step < 4 && replacement === undefined; step += 1) {
      installed.controller.step();
      replacement = installed.controller.status().attempts.find(
        (attempt) => attempt.task_id === "a2" && attempt.state === "CREATED",
      );
    }
    expect(replacement, "the replacement task must get a work position").toBeDefined();
    await expect(installed.controller.claim(replacement!.attempt_id)).resolves.toBeDefined();
    expect(
      installed.controller.status().attempts.find((attempt) => attempt.attempt_id === replacement!.attempt_id)?.state,
    ).toBe("RUNNING");
  });
});
