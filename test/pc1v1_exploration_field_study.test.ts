/**
 * PC1-V1 R3 — exploratory cognition may proceed without formal Work acceptance, and the Field
 * Study's artifact set can be completed by one governed deliverable with acceptance kept separate.
 *
 * This is a deterministic product-path test. It does not claim scientific correctness of the
 * artifact contents, and it is not a model-behavior result.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and produce every declared artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R3 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r3-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "reviews"), { recursive: true });
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

function install(repo: string, head: string, stateDir: string, tasks: Array<Record<string, unknown>>) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pc1v1", repository: repo, stateDir, execution: "in-place", standard, toolProfile: "normal" },
  );
  cleanups.push(() => void installed.dispose());
  installed.controller.start({ projectId: "pc1v1", goal: "complete the research program", headCommit: head, tasks: tasks as never });
  return installed;
}

async function work(installed: ReturnType<typeof install>, args: Record<string, unknown>) {
  const tool = installed.tools.find((entry) => entry.name === "palimpsest_work") as DshToolDefinition | undefined;
  if (tool === undefined) throw new Error("palimpsest_work is absent");
  return (await tool.execute(args, {
    callId: "c",
    rootCallId: "r",
    name: "palimpsest_work",
    arguments: args,
    signal: new AbortController().signal,
  })) as Record<string, unknown>;
}

function writeFiles(repo: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "research"], { cwd: repo });
}

describe("PC1-V1 R3: exploration is not formal Work", () => {
  it("records findings without creating a Task, Attempt, Evidence or gate pass", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir, [
      { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["README.md"], required_artifacts: [] },
    ]);
    const before = installed.controller.status();
    const recorded = await work(installed, {
      action: "explore",
      goal: "Determine whether the supplier claim is an actual certificate",
      finding: "The inbox contains a promise, not a certificate; the claim is unverified.",
      sources: ["inbox/supplier-claim.md"],
      artifacts: ["reviews/evidence.md"],
      uncertainty: "The supplier may provide a certificate later.",
      explorationStatus: "CANDIDATE",
      taskId: "deliver",
    });
    expect(recorded.status).toBe("RECORDED");
    expect(recorded.standing).toBe("EXPLORATORY");
    expect(recorded.nonAuthoritative).toBe(true);
    const after = installed.controller.status();
    expect(after.revision).toBe(before.revision);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.evidence).toEqual(before.evidence);
    expect(installed.controller.evaluateGate("gate-release", "attempt", "no-attempt").verdict).toBe("INCOMPLETE");

    const listed = (await work(installed, { action: "explorations" })) as { explorations: Array<Record<string, unknown>> };
    expect(listed.explorations).toHaveLength(1);
    expect(listed.explorations[0]!.goal).toMatch(/certificate/iu);
    expect(listed.explorations[0]!.standing).toBe("EXPLORATORY");
  });

  it("the Field Study's five artifacts can be completed by one governed deliverable, accepted separately", async () => {
    const { repo, head, stateDir } = workspace();
    const artifacts = ["study-plan.md", "plan.json", "reviews/evidence.md", "reviews/delivery.md", "unresolved.md"];
    const installed = install(repo, head, stateDir, [
      { task_id: "synthesis", objective: "synthesize the research into one deliverable", depends_on: [], write_paths: artifacts, required_artifacts: artifacts },
    ]);

    // Independent exploratory findings are recorded BEFORE the formal deliverable. They are not
    // accepted, and they do not occupy the Scheduler's VERIFYING latch.
    for (const [goal, finding, artifact] of [
      ["design the monitoring program", "A three-reference design is the conservative candidate.", "study-plan.md"],
      ["review the evidence", "The Echo high-humidity readings are biased upward.", "reviews/evidence.md"],
      ["review the delivery plan", "The conservative lead time is 21 days.", "reviews/delivery.md"],
      ["record unresolved questions", "No approved deployment is represented.", "unresolved.md"],
    ] as const) {
      const recorded = await work(installed, {
        action: "explore",
        goal,
        finding,
        sources: ["sources/base.md"],
        artifacts: [artifact],
        uncertainty: "The candidate still requires formal acceptance.",
        explorationStatus: "CANDIDATE",
      });
      expect(recorded.standing).toBe("EXPLORATORY");
    }
    expect(installed.controller.status().tasks[0]!.state).toBe("READY");

    // One formal deliverable carries the complete candidate artifact set.
    installed.controller.step();
    const created = installed.controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("no synthesis attempt");
    await installed.controller.claim(created.entity_id);
    writeFiles(repo, {
      "study-plan.md": "# Study plan\n\nA candidate plan; not an approved deployment.\n",
      "plan.json": JSON.stringify({ plan: "candidate", approvalRequired: true }, null, 2),
      "reviews/evidence.md": "# Evidence review\n\nThe Echo high-humidity bias is treated as a limitation.\n",
      "reviews/delivery.md": "# Delivery review\n\nThe schedule is a candidate, not a commitment.\n",
      "unresolved.md": "# Unresolved\n\nDeployment approval and the final schedule remain unresolved.\n",
    });
    const liveHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const finished = await work(installed, { action: "complete", summary: "candidate deliverable set" });
    expect(finished.evidenceRecorded).toEqual(expect.arrayContaining(["write_scope_valid", "expected_files_exist"]));
    installed.controller.step();
    expect(installed.controller.status().tasks[0]!.state).toBe("VERIFYING");
    expect(installed.controller.work.project().head_commit).toBe(head);

    // The candidate is complete but NOT accepted; acceptance is a separate operator effect.
    const gate = installed.controller.evaluateGate("gate-release", "attempt", created.entity_id);
    expect(gate.verdict).toBe("PASS");
    const promoted = await installed.controller.promoteAttempt({ attemptId: created.entity_id, gateId: "gate-release" });
    expect(promoted.resultingHeadCommit).toBe(liveHead);
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    expect(installed.controller.status().tasks[0]!.state).toBe("SATISFIED");
    expect(installed.controller.work.project().head_commit).toBe(liveHead);
  });
});
