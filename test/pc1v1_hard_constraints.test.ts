/**
 * PC1-V1 R7 — historical acceptance ≠ current applicability, and mechanical constraints can correct
 * a candidate decision before acceptance without embedding the evaluator's answer.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { makeProjectContinuityService } from "../src/project_continuity/index.js";
import { evaluateHardConstraint, HardConstraintInputError } from "../src/domain/hard_constraints.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R7 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r7-"));
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

function install(repo: string, head: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    // The explicit hard-constraint check remains an EXPERT surface; the normal profile is the
    // six-verb ordinary-project path and does not advertise it.
    { projectId: "pc1v1", repository: repo, stateDir, execution: "in-place", standard, toolProfile: "expert" },
  );
  cleanups.push(() => void installed.dispose());
  installed.controller.start({
    projectId: "pc1v1",
    goal: "check hard constraints before planning",
    headCommit: head,
    tasks: [{ task_id: "plan", objective: "plan", depends_on: [], write_paths: ["docs/plan.md"], required_artifacts: [] }],
  });
  return installed;
}

async function check(installed: ReturnType<typeof install>, kind: string, parameters: Record<string, unknown>) {
  const tool = installed.tools.find((entry) => entry.name === "palimpsest_outcome") as DshToolDefinition | undefined;
  if (tool === undefined) throw new Error("palimpsest_outcome is absent");
  return (await tool.execute(
    { action: "check", kind, parameters, taskId: "plan" },
    { callId: "c", rootCallId: "r", name: "palimpsest_outcome", arguments: {}, signal: new AbortController().signal },
  )) as { status: string; facts: Record<string, unknown>; assumptions: string[]; detail: string; digest: string };
}

describe("PC1-V1 R7: explicit mechanical checks", () => {
  it("D8 plus a 21-day lead time is D29, not D27/D28", () => {
    const result = evaluateHardConstraint({
      kind: "schedule",
      parameters: { observationDay: 8, leadTimeDays: 21, latestDay: 28 },
    });
    expect(result.status).toBe("FAIL");
    expect(result.facts.completionDay).toBe(29);
    expect(result.facts.meetsLatest).toBe(false);
    expect(result.detail).toMatch(/29/iu);
    expect(result.assumptions.length).toBeGreaterThan(0);

    const withApproval = evaluateHardConstraint({
      kind: "schedule",
      parameters: { observationDay: 8, approvalDay: 10, leadTimeDays: 21, latestDay: 28 },
    });
    expect(withApproval.facts.completionDay).toBe(31);
    expect(withApproval.status).toBe("FAIL");
  });

  it("budget, units, coverage, source identity and approval are deterministic", () => {
    const budget = evaluateHardConstraint({
      kind: "budget",
      parameters: { lineItems: [{ label: "reference", amount: 3980 }, { label: "mixed", amount: 1800 }], fixedCosts: 1200, cap: 7200 },
    });
    expect(budget.status).toBe("PASS");
    expect(budget.facts.total).toBe(6980);

    const units = evaluateHardConstraint({ kind: "units", parameters: { value: 1.2, from: "mg/m3", to: "ug/m3" } });
    expect(units.status).toBe("PASS");
    expect(units.facts.converted).toBeCloseTo(1200, 9);

    const coverage = evaluateHardConstraint({
      kind: "coverage",
      parameters: {
        days: 14,
        overlapDays: 14,
        requiredOverlapDays: 14,
        requiredValidRatio: 0.9,
        sites: [{ id: "s1", validDays: 13 }, { id: "s2", validDays: 14 }],
      },
    });
    expect(coverage.status).toBe("PASS");

    const expected = createHash("sha256").update("approved").digest("hex");
    const actual = createHash("sha256").update("different").digest("hex");
    const identity = evaluateHardConstraint({ kind: "source-identity", parameters: { expectedSha256: expected, actualSha256: actual } });
    expect(identity.status).toBe("FAIL");
    const approval = evaluateHardConstraint({ kind: "approval", parameters: { required: true, approved: false } });
    expect(approval.status).toBe("FAIL");
  });

  it("rejects missing or malformed inputs instead of inventing a status", () => {
    expect(() => evaluateHardConstraint({ kind: "schedule", parameters: { observationDay: 8, latestDay: 28 } })).toThrow(HardConstraintInputError);
    expect(() =>
      evaluateHardConstraint({ kind: "source-identity", parameters: { expectedSha256: "abc", actualSha256: "abc" } }),
    ).toThrow(/64 hexadecimal/iu);
  });

  it("records the check as a non-canonical note available before formal acceptance", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const scheduled = await check(installed, "schedule", { observationDay: 8, leadTimeDays: 21, latestDay: 28 });
    expect(scheduled.status).toBe("FAIL");
    expect(scheduled.digest).toMatch(/^[0-9a-f]{64}$/u);
    const journal = await installed.projectWorkspace!.journal("pc1v1");
    const note = journal.find((entry) => entry.entry.title.startsWith("Hard constraint schedule"));
    expect(note).toBeDefined();
    expect(note!.entry.body).toContain("pc1-hard-constraint/v1");
    // The check created no Work, no acceptance and no plan revision.
    expect(installed.controller.work.project().revision).toBe(0);
    expect(installed.controller.status().tasks.every((task) => task.state === "READY")).toBe(true);
  });
});

describe("PC1-V1 R7: continuity keeps history and current applicability separate", () => {
  it("marks an older promotion for the same task SUPERSEDED and the latest UNKNOWN, never APPLICABLE", async () => {
    const ir = {
      project_id: "pc1v1",
      revision: 1,
      digest: "d".repeat(64),
      head_commit: "h".repeat(40),
      goal: "goal",
      requirements: [],
      decisions: [],
      tasks: [{ task_id: "t", objective: "t", depends_on: [], write_paths: [], required_artifacts: [] }],
    } as never;
    const status = {
      revision: 1,
      headCommit: "h".repeat(40),
      schedulerState: "RUNNING",
      tasks: [{ task_id: "t", state: "SATISFIED" }],
      attempts: [
        { attempt_id: "a1", task_id: "t", state: "COMPLETED" },
        { attempt_id: "a2", task_id: "t", state: "COMPLETED" },
      ],
      evidence: [],
      promotions: [],
      promotionFence: [],
    };
    const continuity = makeProjectContinuityService({
      work: {
        project: () => ir,
        status: () => status,
        promotionFacts: () => [
          { promotionId: "p1", attemptId: "a1", sourceCommit: "c1", expectedHeadCommit: "h0", resultingHeadCommit: "h1" },
          { promotionId: "p2", attemptId: "a2", sourceCommit: "c2", expectedHeadCommit: "h1", resultingHeadCommit: "h2" },
        ],
      },
    });
    const summary = await continuity.summary();
    expect(summary.acceptedResults).toHaveLength(2);
    const first = summary.acceptedResults.find((entry) => entry.id === "promotion:p1")!;
    const second = summary.acceptedResults.find((entry) => entry.id === "promotion:p2")!;
    expect(first.historicalAcceptance).toBe("ACCEPTED");
    expect(first.currentApplicability).toBe("SUPERSEDED");
    expect(second.historicalAcceptance).toBe("ACCEPTED");
    expect(second.currentApplicability).toBe("UNKNOWN");
    expect(second.applicabilityBasis).toMatch(/not proof that it still applies/iu);
  });

  it("orders the capsule by decision value and still names omitted sections", async () => {
    const ir = {
      project_id: "pc1v1",
      revision: 1,
      digest: "d".repeat(64),
      head_commit: "h".repeat(40),
      goal: "goal",
      requirements: [{ requirement_id: "r1", statement: "hard constraint", priority: "MUST" }],
      decisions: [],
      tasks: [],
    } as never;
    const status = {
      revision: 1,
      headCommit: "h".repeat(40),
      schedulerState: "RUNNING",
      tasks: [],
      attempts: [],
      evidence: [],
      promotions: [],
      promotionFence: [],
    };
    const continuity = makeProjectContinuityService({
      work: {
        project: () => ir,
        status: () => status,
        promotionFacts: () => [],
      },
      workspace: {
        journal: async () => [
          {
            entry: {
              entryId: "pje-1",
              kind: "NEGATIVE_RESULT",
              title: "a negative finding",
              body: "detail",
              provenance: "test",
              digest: "d".repeat(64),
            },
          },
        ] as never,
        openLoops: async () => [],
      },
    });
    const capsule = await continuity.contextCapsule({ maxBytes: 8192 });
    const text = capsule.text;
    const order = [
      "Binding requirements",
      "Recent material changes",
      "Current blocking",
      "Important negative findings",
      "Unresolved assumptions",
      "Permissible next actions",
      "Historical acceptance",
    ].map((label) => text.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);

    const tiny = await continuity.contextCapsule({ maxBytes: 1024 });
    expect(tiny.complete).toBe(false);
    expect(tiny.omitted.length).toBeGreaterThan(0);
  });
});
