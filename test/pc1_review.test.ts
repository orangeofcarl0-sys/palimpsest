/**
 * PC1 S04 — proposal, review, authority and source-intake binding.
 *
 * These tests use the REAL controller/plan/intent owners. The review store is metadata only; every
 * applied effect is visible as an ordinary ProjectIR revision or Work task.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { trustedDefaultPolicy } from "../src/install.js";
import type { OperatorAuthorityPort } from "../src/project_review/index.js";
import type { ProjectIntentAdmissionPort } from "../src/project_intent/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const operator: OperatorAuthorityPort = {
  policyRef: { policyId: "pc1-test-operator", version: "1" },
  authorize: (actor) =>
    actor === "operator:alice"
      ? { authorized: true, role: "operator" }
      : { authorized: false, role: "unknown", reason: "not the configured operator" },
};

const admittingPort: ProjectIntentAdmissionPort = {
  policyRef: { policyId: "pc1-test-intent", version: "1" },
  async decide(input) {
    return {
      decision: "ADMIT",
      proposalDigest: input.proposal.digest,
      policyRef: { policyId: "pc1-test-intent", version: "1" },
      provenanceDigest: "a".repeat(64),
      detail: "test operator admitted the exact digest",
    };
  },
};

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-s04-"));
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
      // Windows keeps sqlite handles busy
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

function install(repo: string, stateDir: string, options: { operator?: boolean; intentAdmission?: ProjectIntentAdmissionPort } = {}) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1",
      repository: repo,
      stateDir,
      execution: "in-place",
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      toolProfile: "expert",
      ...(options.operator === false ? {} : { operatorAuthority: operator }),
      ...(options.intentAdmission === undefined ? {} : { projectIntentAdmission: options.intentAdmission }),
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

function startProject(installed: ReturnType<typeof install>, head: string, tasks: Array<Record<string, unknown>> = [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }]) {
  installed.controller.start({ projectId: "pc1", goal: "keep the project honest", headCommit: head, tasks: tasks as never });
}

describe("PC1 S04: proposal review and authority", () => {
  it("a plan proposal is reviewable, requires an operator, applies through the existing revision path, and traces all actors", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir);
    startProject(installed, head);
    const proposal = installed.review.proposePlan({
      proposedBy: "agent:test",
      purpose: "add a follow-up task",
      proposedAction: "revise the plan to include the follow-up",
      sources: ["journal:example"],
      scope: { writePaths: ["sources/follow-up.md"], effects: ["projectir_revision"] },
      payload: {
        reason: "add follow-up",
        tasks: [
          { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] },
          { task_id: "follow", objective: "follow", depends_on: ["deliver"], write_paths: ["sources/follow-up.md"], required_artifacts: ["sources/follow-up.md"] },
        ],
      },
    });
    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.digest).toMatch(/^[0-9a-f]{64}$/u);
    const preview = installed.review.preview(proposal.proposalId);
    expect(preview.currentness).toBe("CURRENT");
    expect(preview.applicable).toBe(false);
    expect(preview.knownImpacts.length).toBeGreaterThan(0);

    await expect(installed.review.apply(proposal.proposalId, { actor: "agent:test" })).rejects.toThrow(/authorized operator|AUTHORITY_UNRESOLVED/u);
    const approved = installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice", note: "ok" });
    expect(approved.proposal.status).toBe("APPROVED");
    expect(approved.applicable).toBe(true);

    const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
    expect(applied.outcome).toBe("APPLIED");
    expect(applied.record.status).toBe("APPLIED");
    expect(applied.record.application?.appliedBy).toBe("operator:alice");
    expect(installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["deliver", "follow"]);

    installed.review.recordExecution(proposal.proposalId, { attemptId: "attempt-test", taskId: "follow" });
    installed.review.recordAcceptance(proposal.proposalId, { promotionId: "promotion-test", acceptedHead: "f".repeat(40) });
    const trace = installed.review.preview(proposal.proposalId).proposal;
    expect(trace.proposedBy).toBe("agent:test");
    expect(trace.review?.decidedBy).toBe("operator:alice");
    expect(trace.execution?.taskId).toBe("follow");
    expect(trace.acceptance?.promotionId).toBe("promotion-test");
  });

  it("a deployment without operator authority can propose but cannot decide or apply", () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, { operator: false });
    startProject(installed, head);
    const proposal = installed.review.proposePlan({
      proposedBy: "agent:test",
      purpose: "p", proposedAction: "a", sources: [], scope: { writePaths: [], effects: [] },
      payload: { reason: "r", tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }] },
    });
    expect(() => installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" })).toThrow(/no operator authority/u);
    expect(installed.review.list().length).toBe(1);
  });

  it("a stale proposal cannot be applied, and a rejection is not an approval", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir);
    startProject(installed, head);
    const proposal = installed.review.proposePlan({
      proposedBy: "agent:test", purpose: "p", proposedAction: "a", sources: [], scope: { writePaths: [], effects: [] },
      payload: { reason: "r", tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }] },
    });
    // Move the basis underneath the proposal.
    installed.controller.plan({
      tasks: [
        { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] },
        { task_id: "other", objective: "other", depends_on: [], write_paths: ["sources/other.md"], required_artifacts: ["sources/other.md"] },
      ],
      reason: "move the basis",
    });
    const decided = installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
    expect(decided.currentness).toBe("STALE");
    expect(decided.proposal.status).toBe("STALE");
    expect(decided.applicable).toBe(false);

    const fresh = installed.review.proposePlan({
      proposedBy: "agent:test", purpose: "p2", proposedAction: "a2", sources: [], scope: { writePaths: [], effects: [] },
      payload: { reason: "r2", tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }] },
    });
    installed.review.decide(fresh.proposalId, { decision: "REJECT", actor: "operator:alice", note: "not now" });
    expect(installed.review.preview(fresh.proposalId).proposal.status).toBe("REJECTED");
    await expect(installed.review.apply(fresh.proposalId, { actor: "operator:alice" })).rejects.toThrow(/only an APPROVED/u);
  });

  it("a source intake binds the exact bytes and the resulting Git blob; a different blob fails verification", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir);
    startProject(installed, head);
    const candidate = join(stateDir, "candidate.csv");
    writeFileSync(candidate, "vendor,min_temp\nV3,0\n");
    const proposal = installed.review.proposeSourceIntake({
      proposedBy: "agent:test",
      purpose: "intake the corrected bulletin",
      proposedAction: "apply the exact candidate bytes to sources/vendor.csv",
      sources: [candidate],
      scope: { writePaths: ["sources/vendor.csv"], effects: ["work_task"] },
      payload: { candidatePath: candidate, targetPath: "sources/vendor.csv", objective: "intake the bulletin exactly", taskId: "intake" },
    });
    expect(proposal.status).toBe("PROPOSED");
    installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
    const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
    expect(applied.outcome).toBe("APPLIED");
    expect(installed.controller.work.project().tasks.some((task) => task.task_id === "intake")).toBe(true);

    // The worker writes the approved bytes and commits.
    writeFileSync(join(repo, "sources", "vendor.csv"), "vendor,min_temp\nV3,0\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "intake"], { cwd: repo });
    const resultCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    const verified = installed.review.verifySourceIntake(proposal.proposalId, { resultCommit });
    expect(verified.verified).toBe(true);
    expect(verified.outOfScope).toEqual([]);

    // A different blob is rejected even though the path exists.
    writeFileSync(join(repo, "sources", "vendor.csv"), "vendor,min_temp\nV3,-10\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "wrong"], { cwd: repo });
    const wrongCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    const wrong = installed.review.verifySourceIntake(proposal.proposalId, { resultCommit: wrongCommit });
    expect(wrong.verified).toBe(false);
    expect(wrong.detail).toMatch(/hash|digest/u);
  });

  it("an intent proposal can use the existing admission authority; without it the apply refuses", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, stateDir, { intentAdmission: admittingPort });
    startProject(installed, head);
    const entry = await installed.application.projectWorkspace!.recordJournalEntry({
      kind: "NEGATIVE_RESULT",
      title: "no compliant vendor under the bulletin",
      body: "The bulletin is not accepted and no vendor is compliant if it is.",
      provenance: "inbox/2026-02-10/vendor-capabilities.csv",
    });
    const proposal = await installed.review.proposeIntent({
      changes: [
        {
          kind: "DECISION_APPEND",
          decision: { decision_id: "dec-1", statement: "Record the Site B negative finding", rationale: "operator review", evidence_ids: [], supersedes: null },
        },
      ],
      grounds: { negativeResults: [{ entryId: entry.entryId }] },
      rationale: "the negative finding is a legitimate ground",
      proposedBy: "agent:test",
      purpose: "record the negative finding",
      proposedAction: "append a ProjectIR decision",
      sources: [`journal:${entry.entryId}`],
      scope: { writePaths: [], effects: ["projectir_revision"] },
    });
    const before = installed.controller.work.project().revision;
    installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
    const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
    expect(applied.outcome).toBe("APPLIED");
    expect(installed.controller.work.project().revision).toBe(before + 1);
    expect(installed.controller.work.project().decisions.some((decision) => decision.decision_id === "dec-1")).toBe(true);
  });
});
