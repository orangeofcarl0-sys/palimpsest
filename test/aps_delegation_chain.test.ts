/**
 * APS-A — the delegation product path feeds the contribution chain.
 *
 * The delegation service here is a controlled fake; the test is about the ADAPTER orchestration:
 * `start` records the delegation for later discovery, and `consume` records a contribution and the
 * principal's decision. It does not claim a model ran.
 */
import { describe, expect, it } from "vitest";

import { defineProductTools } from "../src/adapters/dsh/product.js";

const receipt = {
  schema: "pc1-receipt/v1",
  receiptId: "receipt-aps",
  handoffId: "handoff-aps",
  executor: "REASONING_BRANCH",
  executorIdentity: "reasoning-cell:c/branch:b",
  findings: [],
  artifacts: [],
  readFootprint: ["declared-basis:test"],
  sharedSources: [],
  status: "PARTIAL",
  limitations: [],
  followUp: [],
  createdAt: "2026-11-03T00:00:00.000Z",
};

function harness() {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const journal: Array<{ entryId: string; kind: string; title: string; body: string; provenance: string; digest: string }> = [];
  const fakeDelegation = {
    async start(input: { task: string }) {
      return {
        delegationRef: `dlg2.${"a".repeat(40)}.cell.branch`,
        kind: "RESEARCH",
        outcome: "STARTED",
        state: "RUNNING",
        basisCommit: "a".repeat(40),
        conclusion: null,
        detail: "started",
        task: input.task,
      };
    },
    async status() {
      return { delegationRef: "dlg2.ref", state: "COMPLETED", basisCommit: "a".repeat(40), detail: "terminal" };
    },
    async inspect() {
      return { delegationRef: "dlg2.ref", state: "COMPLETED", basisCommit: "a".repeat(40), question: "q", conclusion: "c", detail: "terminal", receipt };
    },
    async consume(input: { delegationRef: string; decisionNote: string; changedPlan?: boolean }) {
      return {
        delegationRef: input.delegationRef,
        state: "COMPLETED",
        receipt,
        decisionNote: input.decisionNote,
        changedPlan: input.changedPlan === true,
        detail: "consumed",
      };
    },
  };
  const fakeContribution = {
    async record(input: Record<string, unknown>) {
      calls.push({ name: "record", input });
      return {
        contribution: {
          contributionId: "ctb-test",
          sourceKind: "DELEGATION",
          sourceRef: input.sourceRef,
          observation: "PRODUCT_OBSERVED_TERMINAL",
          independentVerification: false,
        },
        journalEntryId: "pje-contribution",
        alreadyRecorded: false,
      };
    },
    async recordDelegationStart(input: Record<string, unknown>) {
      calls.push({ name: "recordDelegationStart", input });
      return { journalEntryId: "pje-start", alreadyRecorded: false };
    },
    async decide(input: Record<string, unknown>) {
      calls.push({ name: "decide", input });
      return {
        decision: { decisionId: "ctd-test", decision: input.decision, planChange: null, declaredChangedPlan: input.declaredChangedPlan },
        journalEntryId: "pje-decision",
        alreadyRecorded: false,
        contribution: { status: "ACKNOWLEDGED" },
      };
    },
    async list() {
      return [];
    },
    changeClasses() {
      return ["metadata_only", "backward_compatible", "behavior_change", "contract_breaking"];
    },
  };
  const fakeWorkspace = {
    async journal() {
      return journal.map((entry) => ({ entry }));
    },
    async recordJournalEntry(input: { kind: string; title: string; body: string; provenance: string }) {
      const entry = { entryId: `pje-${journal.length + 1}`, digest: "e".repeat(64), ...input };
      journal.push(entry);
      return entry;
    },
  };
  const tools = defineProductTools({ delegation: fakeDelegation, contribution: fakeContribution, projectWorkspace: fakeWorkspace } as never);
  const delegate = tools.find((entry) => entry.name === "palimpsest_delegate")!;
  const call = async (args: Record<string, unknown>) =>
    delegate.execute(args, {
      callId: "c",
      rootCallId: "r",
      name: "palimpsest_delegate",
      arguments: args,
      signal: new AbortController().signal,
    });
  return { calls, journal, call };
}

describe("APS-A: the delegation path records discovery and consumption in the contribution chain", () => {
  it("start records the delegation so a later Session can discover it", async () => {
    const h = harness();
    await h.call({ action: "start", task: "Is the coastal rating current?" });
    expect(h.calls).toContainEqual({
      name: "recordDelegationStart",
      input: expect.objectContaining({
        delegationRef: `dlg2.${"a".repeat(40)}.cell.branch`,
        task: "Is the coastal rating current?",
        basisCommit: "a".repeat(40),
      }),
    });
  });

  it("consume with a COMPLETE task graph records a REVISE_PLAN decision and the actual revision request", async () => {
    const h = harness();
    const tasks = [
      { task_id: "site-b-coastal", objective: "Select a coastal-rated vendor.", depends_on: [], write_paths: ["deliverables/site-b.md"], required_artifacts: ["deliverables/site-b.md"] },
    ];
    const result = (await h.call({
      action: "consume",
      delegationRef: "dlg2.ref",
      decisionNote: "The finding changes the site-B requirement.",
      changedPlan: true,
      tasks,
    })) as { contribution: unknown; decision: unknown; journalRef: string };
    expect(h.calls).toContainEqual({ name: "record", input: expect.objectContaining({ sourceKind: "DELEGATION", sourceRef: "dlg2.ref" }) });
    expect(h.calls).toContainEqual({
      name: "decide",
      input: expect.objectContaining({
        contributionId: "ctb-test",
        decision: "REVISE_PLAN",
        declaredChangedPlan: true,
        tasks,
      }),
    });
    expect(result.contribution).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.journalRef).toBe("pje-1");
    expect(h.journal[0]!.body).toContain("pc1-consumption/v1");
  });

  it("consume without a task graph keeps changedPlan as a DECLARATION", async () => {
    const h = harness();
    await h.call({
      action: "consume",
      delegationRef: "dlg2.ref",
      decisionNote: "Keep it as a lead.",
      changedPlan: true,
    });
    expect(h.calls).toContainEqual({
      name: "decide",
      input: expect.objectContaining({
        contributionId: "ctb-test",
        decision: "ACCEPT_AS_CANDIDATE",
        declaredChangedPlan: true,
      }),
    });
    const decide = h.calls.find((entry) => entry.name === "decide")!;
    expect(decide.input).not.toHaveProperty("tasks");
  });
});
