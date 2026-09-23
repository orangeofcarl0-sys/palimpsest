/**
 * PLMP-LEAN-1 §C.11 ① — the delegation runtime's state derivation. Acceptance DEL-A06.
 *
 * The property that matters most here is the one a durable store CANNOT express:
 *
 *     OPEN branch after a restart  ≠  RUNNING worker
 *
 * ReasoningCell persists that a branch is open. It cannot persist whether a host job exists. So the
 * state comes from both layers, and an OPEN branch with no job in THIS process must report
 * INTERRUPTED — never a state that claims a worker is running when the process that ran it is gone.
 */
import { describe, expect, it } from "vitest";

import {
  DelegationError,
  delegationRefOf,
  makeDelegationService,
  parseDelegationRef,
  type DelegationServiceDeps,
  type DelegationTerminalProjection,
} from "../src/interaction/delegation.js";

/** A controllable branch host: the test decides when — and with what — the job settles. */
function controllableJob() {
  let settle: (value: unknown) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const completion = new Promise<unknown>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    job: { completion: completion as Promise<never>, cancel: () => undefined },
    settle: (value: unknown) => settle(value),
    fail: (error: unknown) => fail(error),
  };
}

function harness(options: { readonly admitted?: boolean } = {}) {
  const admitted = options.admitted ?? true;
  const terminals: DelegationTerminalProjection[] = [];
  const closed: string[] = [];
  const released: string[] = [];
  const host = controllableJob();
  const branches: { branchId: string; question: string; closed: boolean }[] = [];
  const submittedFor = new Set<string>();
  let nextBranch = 0;

  const deps: DelegationServiceDeps = {
    reasoning: {
      openCell: async () => ({}),
      openBranch: async ({ question }) => {
        nextBranch += 1;
        const branchId = `branch-${nextBranch}`;
        branches.push({ branchId, question, closed: false });
        return { branch: { ref: { branchId } } };
      },
      branchBrief: async () => ({ schemaVersion: 1, objective: "o", question: "q" }),
      closeBranch: async ({ branchId }) => {
        closed.push(branchId);
        const branch = branches.find((entry) => entry.branchId === branchId);
        if (branch !== undefined) branch.closed = true;
      },
      cellView: async () => ({
        definition: {},
        lifecycle: "OPEN",
        storeBasis: {},
        frontierBasis: {},
        branches: branches.map((entry) => ({ ref: { branchId: entry.branchId }, question: entry.question, closed: entry.closed, atFrontier: {} })),
        candidates: branches
          .filter((entry) => entry.closed && submittedFor.has(entry.branchId))
          .map((entry) => ({
            candidateDigest: `cd-${entry.branchId}`,
            branchId: entry.branchId,
            status: admitted ? ("ADMITTED" as const) : ("REJECTED" as const),
            claim: { type: "reasoning.statement@v1", content: { statement: `conclusion for ${entry.branchId}` } },
          })),
        claims: [],
        events: [],
      }) as never,
      // The fixture's candidate is a stub: the real `ReasoningCandidate` is a full artifact and this
      // test is about STATE DERIVATION, not about the reasoning plane's own shape.
      submitCandidate: (async ({ branchId }: { readonly branchId: string }) => {
        submittedFor.add(branchId);
        return { status: "PENDING", candidate: { candidateDigest: "cd" } };
      }) as never,
      evaluateCandidate: async () =>
        admitted
          ? ({ status: "admitted", candidateDigest: "cd", claimId: "claim-1", frontierBasis: {} } as never)
          : ({ status: "rejected", candidateDigest: "cd", frontierBasis: {} } as never),
    },
    branchExecutionFor: () => ({ adapterId: "test", run: () => host.job.completion, start: () => host.job }),
    snapshot: {
      freeze: async () => ({
        workDir: "/frozen/basis",
        basisCommit: "a".repeat(40),
        release: async () => {
          released.push("basis");
        },
      }),
    },
    onTerminal: (projection) => terminals.push(projection),
  };
  return { service: makeDelegationService(deps), deps, host, terminals, closed, released, branches, submittedFor };
}

describe("DEL-A06: the state comes from BOTH layers, and INTERRUPTED is not RUNNING", () => {
  it("start returns immediately, and the ref is opaque but round-trippable", async () => {
    const h = harness();
    const started = await h.service.start({ task: "investigate the cache race" });
    expect(started.state).toBe("STARTED");
    expect(started.kind).toBe("RESEARCH");
    const parsed = parseDelegationRef(started.delegationRef);
    expect(parsed).not.toBeNull();
    expect(delegationRefOf(parsed!.cellId, parsed!.branchId)).toBe(started.delegationRef);
    expect(parseDelegationRef("nonsense")).toBeNull();

    // The job is in flight: OPEN branch + a live job in THIS process.
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("RUNNING");
  });

  it("settles through the SHARED settlement path, releases the snapshot, and delivers ONE terminal projection", async () => {
    const h = harness({ admitted: true });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.host.settle({ status: "completed", statement: "the race is in invalidate()" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("COMPLETED");
    expect(h.closed).toHaveLength(1);
    expect(h.released).toEqual(["basis"]);
    expect(h.terminals).toHaveLength(1);
    expect(h.terminals[0]!.state).toBe("COMPLETED");
    expect(h.terminals[0]!.conclusion).toContain("invalidate()");
    // inspect is progressive disclosure over the same state.
    const inspected = await h.service.inspect({ delegationRef: started.delegationRef });
    expect(inspected.basisCommit).toBeNull(); // the job is gone from the map once settled
    expect(inspected.conclusion).toContain("conclusion for");
  });

  it("a closed branch with no admissible conclusion is FAILED, not a fabricated claim", async () => {
    const h = harness({ admitted: false });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.host.settle({ status: "completed", statement: "a guess" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("FAILED");
    expect(h.terminals[0]!.state).toBe("FAILED");
  });

  it("a host failure closes the branch and reports FAILED rather than inventing a candidate", async () => {
    const h = harness();
    const started = await h.service.start({ task: "investigate the cache race" });
    h.host.fail(new Error("the research host died"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("FAILED");
    expect(h.released).toEqual(["basis"]);
    expect(h.terminals[0]!.detail).toContain("research host");
  });

  it("THE KEY CASE: an OPEN branch with no job in this process is INTERRUPTED, never RUNNING", async () => {
    const h = harness();
    const started = await h.service.start({ task: "investigate the cache race" });
    // In THIS process the job really is alive.
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("RUNNING");

    // A restart is a NEW PROCESS, not a call: the SAME canonical cell (the branch is still open), and
    // an EMPTY job map. This is exactly what a crash leaves behind, and it is what the durable layer
    // cannot express on its own.
    const restarted = makeDelegationService({ ...h.deps, onTerminal: undefined });
    const after = await restarted.status({ delegationRef: started.delegationRef });
    expect(after.state).toBe("INTERRUPTED");
    expect(after.detail).toContain("NOT running");
    expect(after.detail).toContain("does not auto-rerun");
    // And nothing about it fabricates a worker: the branch is untouched, and no terminal was sent.
    expect(h.branches[0]!.closed).toBe(false);
    expect(h.terminals).toHaveLength(0);
  });

  it("refuses a kind D1 does not implement, and an empty task", async () => {
    const h = harness();
    await expect(h.service.start({ task: "   " })).rejects.toBeInstanceOf(DelegationError);
    await expect(h.service.start({ task: "x", kind: "WORK" as never })).rejects.toThrow(/RESEARCH delegation only/);
  });
});
