/**
 * PC1-V1 R5 — a model-originated proposal must reach the normal Operator Review path.
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
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

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
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PC1-V1 R5 fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r5-"));
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

function install(repo: string, head: string, stateDir: string, withOperator = true) {
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
      ...(withOperator ? { operatorAuthority: operator } : {}),
    },
  );
  cleanups.push(() => void installed.dispose());
  installed.controller.start({
    projectId: "pc1v1",
    goal: "keep the project honest",
    headCommit: head,
    tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] }],
  });
  return installed;
}

async function call(installed: ReturnType<typeof install>, args: Record<string, unknown>) {
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

describe("PC1-V1 R5: a model proposal becomes an exact reviewable record", () => {
  it("adopts a plan proposal once, requires a real operator, and applies through the plan owner", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const proposed = (await call(installed, {
      action: "propose",
      purpose: "Add a follow-up review task",
      proposedAction: "Revise the plan to include the follow-up",
      actionClass: "REVISE_PLAN",
      sources: ["journal:example"],
      writePaths: ["sources/follow.md"],
      tasks: [
        { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] },
        { task_id: "follow", objective: "follow", depends_on: ["deliver"], write_paths: ["sources/follow.md"], required_artifacts: ["sources/follow.md"] },
      ],
      risk: "The follow-up depends on the first result",
      requiredAuthority: "project operator",
      expectedArtifact: "sources/follow.md",
    })) as { proposalRef: string; digest: string };
    expect(proposed.proposalRef).toMatch(/^pje-/u);

    const listed = await installed.review.listAll();
    expect(listed).toHaveLength(1);
    const proposal = listed[0]!;
    expect(proposal.kind).toBe("PLAN_REVISION");
    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(proposal.adoption?.journalEntryId).toBe(proposed.proposalRef);
    expect(proposal.adoption?.repairRequired).toBe(false);
    const preview = installed.review.preview(proposal.proposalId);
    expect(preview.currentness).toBe("CURRENT");
    expect(preview.applicable).toBe(false);

    // Idempotent: listing again does not create a second proposal.
    expect(await installed.review.listAll()).toHaveLength(1);

    expect(() => installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "agent:test" })).toThrow(/authorized operator/iu);
    await expect(installed.review.apply(proposal.proposalId, { actor: "agent:test" })).rejects.toThrow(/authorized operator/iu);

    installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice", note: "exact proposal accepted" });
    const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
    expect(applied.outcome).toBe("APPLIED");
    expect(applied.record.application?.canonicalRef).toMatch(/^event:/u);
    expect(applied.record.application?.revision).toBe(installed.controller.work.project().revision);
    expect(installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["deliver", "follow"]);
    expect(installed.tools.map((tool) => tool.name).join(" ")).not.toMatch(/review/iu);
  });

  it("a generic ACTION is applied as an operator-approved note, not as canonical Work", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    const before = installed.controller.work.project().revision;
    await call(installed, {
      action: "propose",
      purpose: "Investigate the supplier claim",
      proposedAction: "Read the supplier certificate and record whether it is an actual certificate",
      actionClass: "INVESTIGATE",
      sources: ["sources/base.md"],
      writePaths: [],
      requiredAuthority: "project operator",
    });
    const proposal = (await installed.review.listAll())[0]!;
    expect(proposal.kind).toBe("ACTION");
    expect(proposal.adoption?.repairRequired).toBe(false);
    installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
    const applied = await installed.review.apply(proposal.proposalId, { actor: "operator:alice" });
    expect(applied.outcome).toBe("APPLIED");
    expect(applied.record.application?.canonicalRef).toMatch(/^journal:/u);
    expect(installed.controller.work.project().revision).toBe(before);
    const journal = await installed.projectWorkspace!.journal("pc1v1");
    expect(journal.some((entry) => entry.entry.title.startsWith("Approved action:"))).toBe(true);
  });

  it("an incomplete proposal is reviewable but cannot be approved or applied", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    await call(installed, {
      action: "propose",
      purpose: "Change something consequential",
      proposedAction: "Change the delivery plan",
      actionClass: "CHANGE",
    });
    const proposal = (await installed.review.listAll())[0]!;
    expect(proposal.adoption?.repairRequired).toBe(true);
    expect(proposal.adoption?.missingFields).toEqual(expect.arrayContaining(["scope.writePaths", "sources"]));
    expect(() =>
      installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" }),
    ).toThrow(/not ready for approval/iu);
    const requested = installed.review.decide(proposal.proposalId, { decision: "REQUEST_CHANGES", actor: "operator:alice" });
    expect(requested.proposal.status).toBe("CHANGES_REQUESTED");
  });

  it("a changed project basis makes an adopted proposal stale", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir);
    await call(installed, {
      action: "propose",
      purpose: "Investigate one source",
      proposedAction: "Read the source and record a finding",
      actionClass: "INVESTIGATE",
      sources: ["sources/base.md"],
    });
    const proposal = (await installed.review.listAll())[0]!;
    installed.controller.plan({
      tasks: [
        { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["sources/base.md"], required_artifacts: ["sources/base.md"] },
        { task_id: "later", objective: "later", depends_on: ["deliver"], write_paths: ["sources/later.md"], required_artifacts: ["sources/later.md"] },
      ],
      reason: "change the basis",
    });
    const preview = installed.review.preview(proposal.proposalId);
    expect(preview.currentness).toBe("STALE");
    const staleDecision = installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" });
    expect(staleDecision.proposal.status).toBe("STALE");
  });

  it("without an operator authority the proposal is still reviewable but cannot be decided", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(repo, head, stateDir, false);
    await call(installed, {
      action: "propose",
      purpose: "Investigate one source",
      proposedAction: "Read the source and record a finding",
      actionClass: "INVESTIGATE",
      sources: ["sources/base.md"],
    });
    const proposal = (await installed.review.listAll())[0]!;
    expect(proposal.kind).toBe("ACTION");
    expect(() =>
      installed.review.decide(proposal.proposalId, { decision: "APPROVE", actor: "operator:alice" }),
    ).toThrow(/composes no operator authority/iu);
  });
});
