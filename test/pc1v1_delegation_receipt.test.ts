/**
 * PC1-V1 R8 — a real delegation result is projected into Handoff/Receipt and consumed.
 *
 * The branch host here is a controlled deterministic executor. It exercises the REAL delegation
 * service, the REAL receipt contract and the REAL product adapter. It is NOT a claim that a model
 * subagent ran; the live independent-Agent gate remains separately reported.
 */
import { describe, expect, it } from "vitest";

import { makeDelegationService, type DelegationServiceDeps } from "../src/interaction/delegation.js";
import { assessIndependence } from "../src/project_handoff/index.js";
import { defineProductTools } from "../src/adapters/dsh/product.js";
import { canonicalDigest } from "../src/schema/canonical.js";

function controllableJob() {
  let settle: (value: unknown) => void = () => undefined;
  const completion = new Promise<unknown>((resolve) => {
    settle = resolve;
  });
  return { job: { completion, cancel: () => undefined }, settle: (value: unknown) => settle(value) };
}

interface Branch { readonly cellId: string; readonly branchId: string; readonly question: string; closed: boolean }
interface Candidate { readonly candidateDigest: string; readonly branchId: string; status: "PENDING" | "ADMITTED"; readonly statement: string; claimId: string | null }

function fakeReasoning() {
  const cells = new Map<string, { definition: Record<string, unknown>; branches: Map<string, Branch>; candidates: Map<string, Candidate> }>();
  let claims = 0;
  const cellOf = (cellId: string) => {
    const cell = cells.get(cellId);
    if (cell === undefined) throw new Error(`unknown cell ${cellId}`);
    return cell;
  };
  return {
    async openCell(input: { cellId: string; objective: string; verificationPolicyRef: unknown; admissionPolicyRef: unknown }) {
      if (!cells.has(input.cellId)) {
        cells.set(input.cellId, { definition: { ...input }, branches: new Map(), candidates: new Map() });
      }
      return cells.get(input.cellId)!.definition as never;
    },
    async openBranch(input: { cellId: string; question: string }) {
      const cell = cellOf(input.cellId);
      const branchId = `br-${canonicalDigest({ cellId: input.cellId, question: input.question }).slice(0, 24)}`;
      if (!cell.branches.has(branchId)) cell.branches.set(branchId, { cellId: input.cellId, branchId, question: input.question, closed: false });
      return { branch: { ref: { cellId: input.cellId, branchId } }, brief: { branchId } } as never;
    },
    async branchBrief(input: { cellId: string; branchId: string }) {
      const cell = cellOf(input.cellId);
      return { schemaVersion: 1, objective: cell.definition.objective, question: cell.branches.get(input.branchId)!.question } as never;
    },
    async closeBranch(input: { cellId: string; branchId: string }) {
      cellOf(input.cellId).branches.get(input.branchId)!.closed = true;
    },
    async cellView(input: { cellId: string }) {
      const cell = cellOf(input.cellId);
      return {
        definition: cell.definition,
        lifecycle: "OPEN",
        branches: [...cell.branches.values()].map((branch) => ({
          ref: { branchId: branch.branchId },
          question: branch.question,
          closed: branch.closed,
          atFrontier: {},
        })),
        candidates: [...cell.candidates.values()].map((candidate) => ({
          candidateDigest: candidate.candidateDigest,
          branchId: candidate.branchId,
          status: candidate.status,
          claim: { type: "reasoning.statement@v1", content: { statement: candidate.statement } },
        })),
        claims: [],
        events: [],
      } as never;
    },
    async submitCandidate(input: { cellId: string; branchId: string; content: { statement: string } }) {
      const cell = cellOf(input.cellId);
      const candidateDigest = canonicalDigest({ statement: input.content.statement }).slice(0, 24);
      cell.candidates.set(candidateDigest, {
        candidateDigest,
        branchId: input.branchId,
        status: "PENDING",
        statement: input.content.statement,
        claimId: null,
      });
      return { candidate: { candidateDigest }, status: "PENDING" } as never;
    },
    async evaluateCandidate(input: { cellId: string; candidateDigest: string }) {
      const cell = cellOf(input.cellId);
      const candidate = cell.candidates.get(input.candidateDigest)!;
      candidate.status = "ADMITTED";
      claims += 1;
      candidate.claimId = `claim-${claims}`;
      return { status: "admitted", candidateDigest: input.candidateDigest, claimId: candidate.claimId, frontierBasis: {} } as never;
    },
  };
}

function harness() {
  const reasoning = fakeReasoning();
  const jobs: ReturnType<typeof controllableJob>[] = [];
  const terminals: Array<{ delegationRef: string; state: string; basisCommit: string; question: string; conclusion: string | null; detail: string; receipt: unknown }> = [];
  const deps: DelegationServiceDeps = {
    projectId: "pc1v1",
    reasoning: reasoning as never,
    branchExecutionFor: () => ({
      adapterId: "controlled-branch-host",
      start: () => {
        const next = controllableJob();
        jobs.push(next);
        return next.job;
      },
    }),
    snapshot: {
      freeze: async () => ({
        workDir: "/frozen/basis",
        basisCommit: "a".repeat(40),
        release: async () => undefined,
      }),
    },
    projectBasis: () => ({ projectRevision: 3, projectDigest: "d".repeat(64), headCommit: "h".repeat(40) }),
    clock: () => "2026-11-03T00:00:00.000Z",
    onTerminal: (projection) => terminals.push(projection as never),
  };
  return { deps, service: makeDelegationService(deps), jobs, terminals };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("PC1-V1 R8: delegation → Handoff/Receipt → consumption", () => {
  it("projects the terminal result and consumes it without turning it into truth", async () => {
    const h = harness();
    const started = await h.service.start({ task: "Is the cache race known?" });
    expect(started.state).toBe("RUNNING");
    const running = await h.service.inspect({ delegationRef: started.delegationRef });
    expect(running.receipt).toBeNull();

    h.jobs[0]!.settle({ statement: "The cache race is a known issue in the frozen basis.", evidenceRefs: ["ev-1"] });
    await settle();
    expect(h.terminals).toHaveLength(1);
    const projection = h.terminals[0]! as unknown as {
      receipt: {
        status: string;
        executor: string;
        executorIdentity: string;
        handoffId: string;
        findings: Array<{ claim: string; hypothesis: boolean; sources: Array<{ rootId: string }> }>;
        readFootprint: string[];
        limitations: string[];
      };
    };
    expect(projection.receipt.status).toBe("COMPLETE");
    expect(projection.receipt.executor).toBe("REASONING_BRANCH");
    expect(projection.receipt.executorIdentity).toMatch(/^reasoning-cell:/u);
    expect(projection.receipt.findings[0]!.claim).toMatch(/known issue/iu);
    expect(projection.receipt.findings[0]!.hypothesis).toBe(true);
    expect(projection.receipt.readFootprint).toEqual([`declared-basis:${"a".repeat(40)}`]);
    expect(projection.receipt.limitations.join(" ")).toMatch(/DECLARED.*not observed/iu);

    const inspected = await h.service.inspect({ delegationRef: started.delegationRef });
    expect(inspected.receipt?.receiptId).toBe((projection.receipt as unknown as { receiptId: string }).receiptId);

    const consumed = await h.service.consume({
      delegationRef: started.delegationRef,
      decisionNote: "Cite it as a lead, not as verified truth; keep the question open.",
      changedPlan: true,
    });
    expect(consumed.state).toBe("COMPLETED");
    expect(consumed.changedPlan).toBe(true);
    expect(consumed.receipt.receiptId).toBe(inspected.receipt?.receiptId);
    const again = await h.service.consume({
      delegationRef: started.delegationRef,
      decisionNote: "Same decision.",
    });
    expect(again.receipt.receiptId).toBe(consumed.receipt.receiptId);
  });

  it("two branches over the same frozen basis are not independent verification", async () => {
    const h = harness();
    const first = await h.service.start({ task: "Question one" });
    h.jobs[0]!.settle({ statement: "claim one" });
    await settle();
    const second = await h.service.start({ task: "Question two" });
    h.jobs[1]!.settle({ statement: "claim two" });
    await settle();
    const r1 = (await h.service.inspect({ delegationRef: first.delegationRef })).receipt!;
    const r2 = (await h.service.inspect({ delegationRef: second.delegationRef })).receipt!;
    const independence = assessIndependence([r1, r2]);
    expect(independence.receipts).toBe(2);
    expect(independence.independentVerification).toBe(false);
    expect(independence.duplicatedSources).toContain(`declared-basis:${"a".repeat(40)}`);
    expect(independence.detail).toMatch(/share a root source|not independent/iu);
  });

  it("the product consume action records one idempotent journal note", async () => {
    const journal: Array<{ entryId: string; kind: string; title: string; body: string; provenance: string; digest: string }> = [];
    const receipt = {
      schema: "pc1-receipt/v1",
      receiptId: "receipt-test",
      handoffId: "handoff-test",
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
    const fakeDelegation = {
      async consume(input: { delegationRef: string; decisionNote: string; changedPlan?: boolean }) {
        return {
          delegationRef: input.delegationRef,
          state: "COMPLETED" as const,
          receipt,
          decisionNote: input.decisionNote,
          changedPlan: input.changedPlan === true,
          detail: "consumed",
        };
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
    const tools = defineProductTools({ delegation: fakeDelegation, projectWorkspace: fakeWorkspace } as never);
    const consumeTool = tools.find((entry) => entry.name === "palimpsest_delegate")!;
    const first = (await consumeTool.execute(
      { action: "consume", delegationRef: "dlg2.ref", decisionNote: "Keep as a lead.", changedPlan: false },
      { callId: "c", rootCallId: "r", name: "palimpsest_delegate", arguments: {}, signal: new AbortController().signal },
    )) as { journalRef: string; alreadyRecorded: boolean };
    expect(first.alreadyRecorded).toBe(false);
    expect(journal).toHaveLength(1);
    expect(journal[0]!.body).toContain("pc1-consumption/v1");
    const second = (await consumeTool.execute(
      { action: "consume", delegationRef: "dlg2.ref", decisionNote: "Keep as a lead.", changedPlan: false },
      { callId: "c2", rootCallId: "r2", name: "palimpsest_delegate", arguments: {}, signal: new AbortController().signal },
    )) as { journalRef: string; alreadyRecorded: boolean };
    expect(second.alreadyRecorded).toBe(true);
    expect(journal).toHaveLength(1);
  });
});
