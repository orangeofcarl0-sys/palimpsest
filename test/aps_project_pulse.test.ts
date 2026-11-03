/**
 * APS-A/B — the project pulse and the contribution → decision → outcome chain.
 *
 * These tests exercise the REAL product path (`installProduct` → normal tool catalogue → the
 * existing project journal/controller owners). No model is called. The contribution content is
 * test-authored; the run is a deterministic engineering qualification, not a model result.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";
import type { DshToolRunContext } from "../src/tools/dsh_types.js";
import { makeContributionService } from "../src/project_contribution/index.js";
import { makeProjectPulseService } from "../src/project_pulse/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function workspace(name: string): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-aps-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  const stateDir = join(root, "state");
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the test process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir };
}

const scopeStandard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["APS fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "aps",
      repository: repo,
      stateDir,
      execution: "in-place",
      standard: scopeStandard,
      toolProfile: "normal",
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

function toolOf(installed: ReturnType<typeof install>, name: string): DshToolDefinition {
  const definition = installed.tools.find((entry) => entry.name === name);
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  return definition;
}

async function call(installed: ReturnType<typeof install>, name: string, args: Record<string, unknown>): Promise<unknown> {
  const definition = toolOf(installed, name);
  const context: DshToolRunContext = {
    callId: `c-${name}`,
    rootCallId: `r-${name}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  };
  return definition.execute(args, context);
}

const TASKS = [
  {
    task_id: "site-a",
    objective: "Select a vendor for site A from the declared capacity data.",
    depends_on: [],
    write_paths: ["docs/site-a.md"],
    required_artifacts: ["docs/site-a.md"],
  },
  {
    task_id: "site-b",
    objective: "Select a coastal-rated vendor for site B.",
    depends_on: [],
    write_paths: ["docs/site-b.md"],
    required_artifacts: ["docs/site-b.md"],
  },
];

const REPLANNED_TASKS = [
  TASKS[0]!,
  {
    task_id: "site-b-coastal",
    objective: "Select a COASTAL-RATED vendor for site B and cite the rating source.",
    depends_on: [],
    write_paths: ["docs/site-b-coastal.md"],
    required_artifacts: ["docs/site-b-coastal.md"],
  },
  {
    task_id: "capacity-refresh",
    objective: "Re-read the capacity table and record whether the 2026 coastal rating is present.",
    depends_on: ["site-b-coastal"],
    write_paths: ["docs/capacity-refresh.md"],
    required_artifacts: ["docs/capacity-refresh.md"],
  },
];

async function start(installed: ReturnType<typeof install>, head: string): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "aps",
    goal: "produce a defensible site-by-site vendor selection",
    headCommit: head,
    tasks: TASKS,
  });
}

describe("APS-A: the pulse is the continuation read", () => {
  it("a cold Session sees the goal, pending work and no invented contributions", async () => {
    const { repo, head, stateDir } = workspace("pulse");
    const installed = install(repo, stateDir);
    await start(installed, head);

    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as {
      schema: string;
      projectId: string;
      goal: string;
      contributions: unknown[];
      delegations: unknown[];
      pendingWork: Array<{ taskId: string; state: string }>;
      nextActions: { mechanical: string[]; decisionRelevant: string[]; distinction: string };
      coverage: { complete: boolean; unavailable: string[] };
      authorityBoundaries: string[];
      digest: string;
    };
    expect(pulse.schema).toBe("pc1-project-pulse/v1");
    expect(pulse.projectId).toBe("aps");
    expect(pulse.goal).toMatch(/defensible/iu);
    expect(pulse.contributions).toEqual([]);
    expect(pulse.delegations).toEqual([]);
    expect(pulse.pendingWork.map((task) => task.taskId)).toEqual(["site-a", "site-b"]);
    expect(pulse.nextActions.mechanical.length).toBeGreaterThan(0);
    expect(pulse.nextActions.decisionRelevant.length).toBeGreaterThan(0);
    expect(pulse.nextActions.distinction).toMatch(/advisory.*not authority/iu);
    expect(pulse.authorityBoundaries.join(" ")).toMatch(/may not accept/iu);
    expect(pulse.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(pulse.coverage.unavailable).toContain("delegation runtime (not composed)");
  });

  it("a native Subagent finding is recorded as declared, not observed, and enters the pulse", async () => {
    const { repo, head, stateDir } = workspace("native");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const initialRevision = installed.controller.work.project().revision;

    const recorded = (await call(installed, "palimpsest_contribute", {
      action: "record",
      sourceKind: "NATIVE_SUBAGENT",
      sourceRef: "subagent:capacity-check",
      task: "Check whether the capacity table still supports the site assumptions.",
      finding: "The table omits the 2026 coastal rating; site B's current assumption is not supported.",
      declaredReadFootprint: ["sources/vendor-capabilities.csv"],
      artifacts: [],
    })) as {
      contribution: {
        contributionId: string;
        observation: string;
        readFootprintObservation: string;
        declaredReadFootprint: string[];
        independentVerification: boolean;
        basis: { projectRevision: number; headCommit: string };
      };
      alreadyRecorded: boolean;
    };
    expect(recorded.alreadyRecorded).toBe(false);
    expect(recorded.contribution.contributionId).toMatch(/^ctb-[0-9a-f]{32}$/u);
    expect(recorded.contribution.observation).toBe("PRINCIPAL_DECLARED");
    expect(recorded.contribution.readFootprintObservation).toBe("DECLARED");
    expect(recorded.contribution.declaredReadFootprint).toEqual(["sources/vendor-capabilities.csv"]);
    expect(recorded.contribution.independentVerification).toBe(false);
    expect(recorded.contribution.basis.projectRevision).toBe(initialRevision);

    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as {
      contributions: Array<{ record: { contributionId: string }; status: string; basisState: string }>;
      decisionQueue: Array<{ kind: string; ref: string }>;
    };
    expect(pulse.contributions).toHaveLength(1);
    expect(pulse.contributions[0]!.record.contributionId).toBe(recorded.contribution.contributionId);
    expect(pulse.contributions[0]!.status).toBe("UNASSESSED");
    expect(pulse.contributions[0]!.basisState).toBe("CURRENT");
    expect(pulse.decisionQueue).toContainEqual(
      expect.objectContaining({ kind: "CONTRIBUTION_ASSESSMENT", ref: recorded.contribution.contributionId }),
    );

    const again = (await call(installed, "palimpsest_contribute", {
      action: "record",
      sourceKind: "NATIVE_SUBAGENT",
      sourceRef: "subagent:capacity-check",
      task: "Check whether the capacity table still supports the site assumptions.",
      finding: "The table omits the 2026 coastal rating; site B's current assumption is not supported.",
      declaredReadFootprint: ["sources/vendor-capabilities.csv"],
    })) as { alreadyRecorded: boolean };
    expect(again.alreadyRecorded).toBe(true);
  });
});

describe("APS-B: contribution → decision → actual plan change → downstream outcome", () => {
  it("REVISE_PLAN applies the complete new graph and reports the observed revision delta", async () => {
    const { repo, head, stateDir } = workspace("replan");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const initialRevision = installed.controller.work.project().revision;
    const contribution = (await call(installed, "palimpsest_contribute", {
      action: "record",
      sourceKind: "NATIVE_SUBAGENT",
      sourceRef: "subagent:capacity-check",
      task: "Check the coastal rating.",
      finding: "Site B needs a coastal-rated unit; the original task did not require it.",
    })) as { contribution: { contributionId: string } };

    const decided = (await call(installed, "palimpsest_contribute", {
      action: "decide",
      contributionId: contribution.contribution.contributionId,
      decision: "REVISE_PLAN",
      decisionNote: "Make the coastal constraint explicit and add a verification task before either selection is accepted.",
      reason: "the capacity finding changes the site-B requirement",
      changeClass: "behavior_change",
      changedIds: ["site-b"],
      declaredChangedPlan: true,
      tasks: REPLANNED_TASKS,
    })) as {
      decision: {
        decision: string;
        basisState: string;
        planChange: {
          fromRevision: number;
          toRevision: number;
          addedTaskIds: string[];
          changedTaskIds: string[];
          removedTaskIds: string[];
        } | null;
      };
      contribution: {
        status: string;
        downstream: { planRevision: number | null; addedTaskIds: string[]; observableOutcome: boolean };
      };
      alreadyRecorded: boolean;
    };
    expect(decided.alreadyRecorded).toBe(false);
    expect(decided.decision.decision).toBe("REVISE_PLAN");
    expect(decided.decision.basisState).toBe("CURRENT");
    expect(decided.decision.planChange).toEqual(
      expect.objectContaining({
        fromRevision: initialRevision,
        toRevision: initialRevision + 1,
        addedTaskIds: ["site-b-coastal", "capacity-refresh"],
        changedTaskIds: [],
        removedTaskIds: ["site-b"],
      }),
    );
    expect(decided.contribution.status).toBe("PLAN_CHANGED");
    expect(decided.contribution.downstream.planRevision).toBe(initialRevision + 1);
    expect(decided.contribution.downstream.addedTaskIds).toEqual(["site-b-coastal", "capacity-refresh"]);
    expect(decided.contribution.downstream.observableOutcome).toBe(false);

    const project = installed.controller.work.project();
    expect(project.revision).toBe(initialRevision + 1);
    expect(project.tasks.map((task) => task.task_id)).toEqual(["site-a", "site-b-coastal", "capacity-refresh"]);
    expect(project.decisions.some((decision) => decision.rationale.includes(contribution.contribution.contributionId))).toBe(true);

    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as {
      contributions: Array<{ status: string; latestDecision: { record: { planChange: unknown } } | null; downstream: { planRevision: number | null } }>;
      decisionQueue: Array<{ kind: string }>;
    };
    expect(pulse.contributions[0]!.status).toBe("PLAN_CHANGED");
    expect(pulse.contributions[0]!.latestDecision?.record.planChange).not.toBeNull();
    expect(pulse.contributions[0]!.downstream.planRevision).toBe(initialRevision + 1);
    expect(pulse.decisionQueue.some((item) => item.kind === "CONTRIBUTION_ASSESSMENT")).toBe(false);

    const replay = (await call(installed, "palimpsest_contribute", {
      action: "decide",
      contributionId: contribution.contribution.contributionId,
      decision: "REVISE_PLAN",
      decisionNote: "Make the coastal constraint explicit and add a verification task before either selection is accepted.",
      reason: "the capacity finding changes the site-B requirement",
      changeClass: "behavior_change",
      changedIds: ["site-b"],
      declaredChangedPlan: true,
      tasks: REPLANNED_TASKS,
    })) as { alreadyRecorded: boolean };
    expect(replay.alreadyRecorded).toBe(true);
    expect(installed.controller.work.project().revision).toBe(initialRevision + 1);
  });

  it("a stale contribution cannot silently rewrite the plan; allowStaleBasis is explicit", async () => {
    const { repo, head, stateDir } = workspace("stale");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const initialRevision = installed.controller.work.project().revision;
    const contribution = (await call(installed, "palimpsest_contribute", {
      action: "record",
      sourceKind: "NATIVE_SUBAGENT",
      sourceRef: "subagent:late-check",
      task: "Check the grant constraints.",
      finding: "The contingency floor may be 10%, not 8%.",
    })) as { contribution: { contributionId: string } };

    const siteC = {
      task_id: "site-c",
      objective: "Select a vendor for site C.",
      depends_on: [],
      write_paths: ["docs/site-c.md"],
      required_artifacts: ["docs/site-c.md"],
    };
    // The project moves for an unrelated reason after the finding was recorded.
    await call(installed, "palimpsest_work", {
      action: "plan",
      reason: "add the third site",
      tasks: [...TASKS, siteC],
    });
    expect(installed.controller.work.project().revision).toBe(initialRevision + 1);

    const revisedTasks = [
      ...TASKS,
      siteC,
      {
        task_id: "contingency-review",
        objective: "Record the grant contingency floor and its source.",
        depends_on: [],
        write_paths: ["docs/contingency.md"],
        required_artifacts: ["docs/contingency.md"],
      },
    ];
    await expect(
      call(installed, "palimpsest_contribute", {
        action: "decide",
        contributionId: contribution.contribution.contributionId,
        decision: "REVISE_PLAN",
        decisionNote: "Raise the contingency floor.",
        tasks: revisedTasks,
      }),
    ).rejects.toThrow(/stale|basis/iu);

    const forced = (await call(installed, "palimpsest_contribute", {
      action: "decide",
      contributionId: contribution.contribution.contributionId,
      decision: "REVISE_PLAN",
      decisionNote: "The floor is still informative after re-reading the current grant note; raise it explicitly.",
      tasks: revisedTasks,
      allowStaleBasis: true,
    })) as { decision: { basisState: string; planChange: { fromRevision: number; toRevision: number } | null } };
    expect(forced.decision.basisState).toBe("STALE");
    expect(forced.decision.planChange).toEqual(
      expect.objectContaining({ fromRevision: initialRevision + 1, toRevision: initialRevision + 2 }),
    );
    expect(installed.controller.work.project().revision).toBe(initialRevision + 2);
  });

  it("a new Session continues the same project from durable state", async () => {
    const { repo, head, stateDir } = workspace("continuation");
    const first = install(repo, stateDir);
    await start(first, head);
    const contribution = (await call(first, "palimpsest_contribute", {
      action: "record",
      sourceKind: "NATIVE_SUBAGENT",
      sourceRef: "subagent:open-question",
      task: "Check the coastal warranty evidence.",
      finding: "The warranty certificate is promised but not on file.",
    })) as { contribution: { contributionId: string } };
    await first.dispose();

    const second = install(repo, stateDir);
    const pulse = (await call(second, "palimpsest_continuity", { action: "pulse" })) as {
      goal: string;
      contributions: Array<{ record: { contributionId: string }; status: string; basisState: string }>;
      decisionQueue: Array<{ kind: string; ref: string }>;
      pendingWork: Array<{ taskId: string }>;
    };
    expect(pulse.goal).toMatch(/defensible/iu);
    expect(pulse.contributions).toHaveLength(1);
    expect(pulse.contributions[0]!.record.contributionId).toBe(contribution.contribution.contributionId);
    expect(pulse.contributions[0]!.status).toBe("UNASSESSED");
    expect(pulse.pendingWork.map((task) => task.taskId)).toEqual(["site-a", "site-b"]);
    expect(pulse.decisionQueue).toContainEqual(
      expect.objectContaining({ kind: "CONTRIBUTION_ASSESSMENT", ref: contribution.contribution.contributionId }),
    );
  });
});

describe("APS-B: delegation discovery, terminal results and recovery", () => {
  it("a terminal delegation result is discoverable, recorded as declared and assessed", async () => {
    const { repo, head, stateDir } = workspace("delegation");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const projectWorkspace = installed.projectWorkspace!;
    const workspaceSurface = installed.application.projectWorkspace!;
    const delegationRef = `dlg2.${head}.delegation-cell.branch-1`;
    const contribution = makeContributionService({
      projectId: "aps",
      controller: {
        projectId: "aps",
        work: { project: () => installed.controller.work.project() },
        status: () => installed.controller.status(),
        plan: (input) => installed.controller.plan(input),
      },
      workspace: {
        journal: (projectId?: string) => projectWorkspace.journal(projectId),
        recordJournalEntry: (entry) => projectWorkspace.recordJournalEntry({ ...entry, projectId: "aps" }),
      },
      delegation: {
        async inspect() {
          return {
            state: "COMPLETED",
            basisCommit: head,
            question: "Is the 2026 coastal rating present?",
            conclusion: "The coastal rating is not in the declared source.",
            detail: "the research branch produced an admitted conclusion",
            receipt: {
              receiptId: "receipt-aps",
              readFootprint: ["declared-basis:" + head],
              artifacts: [],
            },
          };
        },
      },
      clock: () => "2026-11-03T00:00:00.000Z",
    });
    await contribution.recordDelegationStart({
      delegationRef,
      task: "Is the 2026 coastal rating present?",
      basisCommit: head,
    });
    const recorded = await contribution.record({ sourceKind: "DELEGATION", sourceRef: delegationRef });
    expect(recorded.contribution.observation).toBe("PRODUCT_OBSERVED_TERMINAL");
    expect(recorded.contribution.readFootprintObservation).toBe("DECLARED");
    expect(recorded.contribution.declaredReadFootprint).toEqual(["declared-basis:" + head]);
    expect(recorded.contribution.independentVerification).toBe(false);
    const decided = await contribution.decide({
      contributionId: recorded.contribution.contributionId,
      decision: "ACCEPT_AS_CANDIDATE",
      decisionNote: "Keep it as a candidate; it is a single exploratory source, not verified truth.",
      declaredChangedPlan: false,
    });
    expect(decided.decision.planChange).toBeNull();
    expect(decided.decision.declaredChangedPlan).toBe(false);

    const pulse = makeProjectPulseService({
      projectId: "aps",
      continuity: workspaceSurface,
      contributions: contribution,
      workspace: workspaceSurface,
      delegation: {
        async status() {
          return { state: "COMPLETED", basisCommit: head, detail: "terminal" };
        },
      },
    });
    const view = await pulse.pulse();
    expect(view.delegations).toHaveLength(1);
    expect(view.delegations[0]!.delegationRef).toBe(delegationRef);
    expect(view.delegations[0]!.state).toBe("COMPLETED");
    expect(view.delegations[0]!.consumed).toBe(true);
    expect(view.delegations[0]!.assessed).toBe(true);
    expect(view.delegations[0]!.basisState).toBe("CURRENT");
    expect(view.decisionQueue.some((item) => item.kind === "TERMINAL_DELEGATION")).toBe(false);
  });

  it("a terminal result that was never recorded is queued; an interrupted branch is recoverable", async () => {
    const { repo, head, stateDir } = workspace("late");
    const installed = install(repo, stateDir);
    await start(installed, head);
    const projectWorkspace = installed.projectWorkspace!;
    const workspaceSurface = installed.application.projectWorkspace!;
    const contribution = makeContributionService({
      projectId: "aps",
      controller: {
        projectId: "aps",
        work: { project: () => installed.controller.work.project() },
        status: () => installed.controller.status(),
        plan: (input) => installed.controller.plan(input),
      },
      workspace: {
        journal: (projectId?: string) => projectWorkspace.journal(projectId),
        recordJournalEntry: (entry) => projectWorkspace.recordJournalEntry({ ...entry, projectId: "aps" }),
      },
      clock: () => "2026-11-03T00:00:00.000Z",
    });
    const lateRef = `dlg2.${head}.delegation-late.branch-1`;
    const interruptedRef = `dlg2.${head}.delegation-interrupted.branch-1`;
    await contribution.recordDelegationStart({ delegationRef: lateRef, task: "Late question", basisCommit: head });
    await contribution.recordDelegationStart({ delegationRef: interruptedRef, task: "Interrupted question", basisCommit: head });

    const pulse = makeProjectPulseService({
      projectId: "aps",
      continuity: workspaceSurface,
      contributions: contribution,
      workspace: workspaceSurface,
      delegation: {
        async status(input: { delegationRef: string }) {
          return input.delegationRef === lateRef
            ? { state: "COMPLETED", basisCommit: head, detail: "terminal result arrived with no consumer" }
            : { state: "INTERRUPTED", basisCommit: head, detail: "the branch is open but no worker exists" };
        },
      },
    });
    const view = await pulse.pulse();
    expect(view.delegations).toHaveLength(2);
    expect(view.decisionQueue).toContainEqual(
      expect.objectContaining({ kind: "TERMINAL_DELEGATION", ref: lateRef }),
    );
    expect(view.decisionQueue).toContainEqual(
      expect.objectContaining({ kind: "INTERRUPTED_DELEGATION", ref: interruptedRef }),
    );
    const update = view.decisionQueue.map((item) => item.detail).join(" ");
    expect(update).toMatch(/not yet recorded/iu);
    expect(update).toMatch(/not running/iu);
  });
});
