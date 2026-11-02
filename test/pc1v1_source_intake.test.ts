/**
 * PC1-V1 R6 — an approved source intake is an exact-byte admission requirement.
 *
 * Wrong-but-in-scope bytes must not become accepted merely because file/scope checks pass.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { trustedDefaultPolicy } from "../src/install.js";
import type { OperatorAuthorityPort } from "../src/project_review/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const operator: OperatorAuthorityPort = {
  policyRef: { policyId: "pc1v1-operator", version: "1" },
  authorize: (actor) =>
    actor === "operator:alice"
      ? { authorized: true, role: "operator" }
      : { authorized: false, role: "unknown", reason: "not the configured operator" },
};

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and produce the declared artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R6 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r6-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "sources"), { recursive: true });
  writeFileSync(join(repo, "sources", "base.md"), "# base\n");
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
    {
      projectId: "pc1v1",
      repository: repo,
      stateDir,
      execution: "in-place",
      standard,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      toolProfile: "normal",
      operatorAuthority: operator,
    },
  );
  cleanups.push(() => void installed.dispose());
  installed.controller.start({
    projectId: "pc1v1",
    goal: "accept an exact approved source",
    headCommit: head,
    tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }],
  });
  return installed;
}

async function prepareIntake(installed: ReturnType<typeof install>, stateDir: string, approved: string) {
  const candidate = join(stateDir, "candidate.csv");
  writeFileSync(candidate, approved);
  const proposal = installed.review.proposeSourceIntake({
    proposedBy: "agent:test",
    purpose: "intake the approved source",
    proposedAction: "write the exact approved bytes to sources/vendor.csv",
    sources: [candidate],
    scope: { writePaths: ["sources/vendor.csv"], effects: ["work_task"] },
    payload: { candidatePath: candidate, targetPath: "sources/vendor.csv", objective: "intake the approved source", taskId: "intake" },
  });
  installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
  const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
  expect(applied.outcome).toBe("APPLIED");
  installed.controller.setHold("deliver", { reason: "keep the fixture focused on the intake task", declaredBy: "test" });
  installed.controller.step();
  const created = installed.controller.step();
  if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("the intake attempt was not created");
  await installed.controller.claim(created.entity_id);
  return { attemptId: created.entity_id, proposal };
}

function commitIntake(repo: string, bytes: string, extra?: Record<string, string>): string {
  writeFileSync(join(repo, "sources", "vendor.csv"), bytes);
  for (const [path, content] of Object.entries(extra ?? {})) writeFileSync(join(repo, path), content);
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "intake"], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

describe("PC1-V1 R6: approved source bytes are verified at acceptance", () => {
  it("wrong-but-in-scope bytes complete under file/scope checks but cannot be promoted", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const approved = "vendor,min_temp\nV3,0\n";
    const { attemptId, proposal } = await prepareIntake(installed, stateDir, approved);
    commitIntake(repo, "vendor,min_temp\nV3,-10\n");
    const finished = await installed.controller.finish({ summary: "intake written" });
    expect(finished.evidenceRecorded).toContain("write_scope_valid");
    expect(finished.evidenceRecorded).toContain("expected_files_exist");
    installed.controller.step();

    const eligibility = installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(eligibility.eligible).toBe(false);
    const blocker = eligibility.blockers.find((entry) => entry.kind === "source_intake_unverified");
    expect(blocker).toBeDefined();
    expect(blocker?.detail).toMatch(/hashes to|approved/iu);
    expect(blocker?.refs).toContain(proposal.proposalId);
    await expect(installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" })).rejects.toThrow(/source_intake_unverified/iu);
    expect(installed.controller.work.project().head_commit).toBe(head);
  });

  it("correct approved bytes proceed through normal acceptance", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const approved = "vendor,min_temp\nV3,0\n";
    const { attemptId } = await prepareIntake(installed, stateDir, approved);
    commitIntake(repo, approved);
    await installed.controller.finish({ summary: "exact bytes" });
    installed.controller.step();

    const eligibility = installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.blockers).toEqual([]);
    const promoted = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
    expect(promoted.resultingHeadCommit).not.toBe(head);
  });

  it("an out-of-scope change is refused even when the approved bytes are exact", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const approved = "vendor,min_temp\nV3,0\n";
    const { attemptId } = await prepareIntake(installed, stateDir, approved);
    commitIntake(repo, approved, { "sources/extra.md": "# extra\n" });
    await expect(installed.controller.finish()).rejects.toThrow(/outside|write_paths|scope/iu);
    expect(installed.controller.status().attempts.find((attempt) => attempt.attempt_id === attemptId)?.state).toBe("RUNNING");
  });

  it("an unrelated Work task is not subject to source-intake rules", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    // The existing `deliver` task has no approved intake binding.
    const admission = installed.review.sourceIntakeAdmissionForAttempt({ attemptId: "none", taskId: "deliver", resultCommit: head });
    expect(admission).toBeNull();
  });
});
