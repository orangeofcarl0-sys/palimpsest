/**
 * PLMP-LEAN-1 §C.11 — the delegation runtime's state derivation, its derived identity, and the failure
 * classes it keeps apart. Acceptance DEL-A06 plus the four pre-surface hardening regressions.
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
  delegationCellIdOf,
  delegationRefOf,
  makeDelegationService,
  parseDelegationRef,
  type DelegationServiceDeps,
  type DelegationTerminalProjection,
} from "../src/interaction/delegation.js";
import { makePrincipalTerminalComposer } from "../src/interaction/delegation_terminal.js";
import { canonicalDigest } from "../src/schema/canonical.js";

/* ------------------------------------------------------------------ *
 * The branch host: the test decides when — and with what — a job settles.
 * ------------------------------------------------------------------ */

function controllableJob() {
  let settle: (value: unknown) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const completion = new Promise<unknown>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    job: { completion, cancel: () => undefined },
    settle: (value: unknown) => settle(value),
    fail: (error: unknown) => fail(error),
  };
}

/* ------------------------------------------------------------------ *
 * A FAITHFUL ReasoningCell stand-in. It is deliberately not a mock of the
 * methods the runtime happens to call: it keeps real cells, real deterministic
 * branch ids (so a ref minted before a restart still resolves after one) and
 * real candidate statuses — which is what the DEDUPLICATED and restart cases need.
 * ------------------------------------------------------------------ */

interface FakeBranch {
  readonly cellId: string;
  readonly branchId: string;
  readonly question: string;
  closed: boolean;
}
interface FakeCandidate {
  readonly candidateDigest: string;
  readonly branchId: string;
  status: "PENDING" | "ADMITTED" | "REJECTED" | "DEDUPLICATED";
  readonly statement: string;
  claimId: string | null;
}

function fakeReasoning(options: { readonly admit?: boolean; readonly deduplicate?: boolean } = {}) {
  const admit = options.admit ?? true;
  const deduplicate = options.deduplicate ?? false;
  const cells = new Map<
    string,
    {
      readonly definition: { cellId: string; objective: string; verificationPolicyRef: unknown; admissionPolicyRef: unknown };
      readonly branches: Map<string, FakeBranch>;
      readonly candidates: Map<string, FakeCandidate>;
    }
  >();
  const calls = { openCell: 0, openBranch: 0, submitCandidate: 0, evaluateCandidate: 0, closeBranch: 0, cellView: 0 };
  let claimCounter = 0;

  const cellOf = (cellId: string) => {
    const cell = cells.get(cellId);
    if (cell === undefined) {
      const error = new Error(`reasoning cell "${cellId}" does not exist`);
      (error as { kind?: string }).kind = "unknown_cell";
      throw error;
    }
    return cell;
  };

  return {
    calls,
    cells,
    async openCell(input: {
      readonly cellId: string;
      readonly objective: string;
      readonly verificationPolicyRef: unknown;
      readonly admissionPolicyRef: unknown;
    }) {
      calls.openCell += 1;
      const existing = cells.get(input.cellId);
      if (existing !== undefined) {
        // Idempotent ONLY for identical content — exactly what the real store enforces.
        if (existing.definition.objective !== input.objective) throw new Error("already exists with different content");
        return existing.definition as never;
      }
      const definition = {
        cellId: input.cellId,
        objective: input.objective,
        verificationPolicyRef: input.verificationPolicyRef,
        admissionPolicyRef: input.admissionPolicyRef,
      };
      cells.set(input.cellId, { definition, branches: new Map(), candidates: new Map() });
      return definition as never;
    },
    async openBranch(input: { readonly cellId: string; readonly question: string }) {
      calls.openBranch += 1;
      const cell = cellOf(input.cellId);
      // Deterministic from (cellId, question), like the real service: the SAME delegation therefore
      // resolves to the SAME branch before and after a restart.
      const branchId = `br-${canonicalDigest({ cellId: input.cellId, question: input.question }).slice(0, 24)}`;
      if (!cell.branches.has(branchId)) {
        cell.branches.set(branchId, { cellId: input.cellId, branchId, question: input.question, closed: false });
      }
      return { branch: { ref: { cellId: input.cellId, branchId } }, brief: { branchId } } as never;
    },
    async branchBrief(input: { readonly cellId: string; readonly branchId: string }) {
      const cell = cellOf(input.cellId);
      if (!cell.branches.has(input.branchId)) throw new Error(`unknown branch "${input.branchId}"`);
      return { schemaVersion: 1, objective: cell.definition.objective, question: cell.branches.get(input.branchId)!.question } as never;
    },
    async closeBranch(input: { readonly cellId: string; readonly branchId: string }) {
      calls.closeBranch += 1;
      const cell = cellOf(input.cellId);
      const branch = cell.branches.get(input.branchId);
      if (branch === undefined) throw new Error(`unknown branch "${input.branchId}"`);
      branch.closed = true;
    },
    async cellView(input: { readonly cellId: string }) {
      calls.cellView += 1;
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
    async submitCandidate(input: {
      readonly cellId: string;
      readonly branchId: string;
      readonly content: unknown;
    }) {
      calls.submitCandidate += 1;
      const cell = cellOf(input.cellId);
      if (cell.branches.get(input.branchId)?.closed === true) {
        const error = new Error(`branch "${input.branchId}" is CLOSED`);
        (error as { kind?: string }).kind = "branch_closed";
        throw error;
      }
      const statement = (input.content as { readonly statement: string }).statement;
      const candidateDigest = canonicalDigest({ candidate: statement }).slice(0, 24);
      if (deduplicate) {
        cell.candidates.set(candidateDigest, { candidateDigest, branchId: input.branchId, status: "DEDUPLICATED", statement, claimId: null });
        return { candidate: { candidateDigest }, status: "DEDUPLICATED" } as never;
      }
      cell.candidates.set(candidateDigest, { candidateDigest, branchId: input.branchId, status: "PENDING", statement, claimId: null });
      return { candidate: { candidateDigest, branch: { branchId: input.branchId } }, status: "PENDING" } as never;
    },
    async evaluateCandidate(input: { readonly candidateDigest: string }) {
      calls.evaluateCandidate += 1;
      for (const cell of cells.values()) {
        const candidate = cell.candidates.get(input.candidateDigest);
        if (candidate === undefined) continue;
        if (admit) {
          claimCounter += 1;
          candidate.status = "ADMITTED";
          candidate.claimId = `claim-${claimCounter}`;
          return { status: "admitted", candidateDigest: input.candidateDigest, claimId: candidate.claimId, frontierBasis: {} } as never;
        }
        candidate.status = "REJECTED";
        return { status: "rejected", candidateDigest: input.candidateDigest, frontierBasis: {} } as never;
      }
      throw new Error(`unknown candidate "${input.candidateDigest}"`);
    },
  };
}

function harness(
  options: {
    readonly admit?: boolean;
    readonly deduplicate?: boolean;
    readonly projectId?: string;
    readonly basisCommit?: string;
    readonly release?: () => Promise<void>;
  } = {},
) {
  const terminals: DelegationTerminalProjection[] = [];
  const reasoning = fakeReasoning(options);
  const jobs: ReturnType<typeof controllableJob>[] = [];
  const branchStarts: { readonly workDir: string; readonly capabilityProfile?: string }[] = [];
  const released: string[] = [];
  const bases = [options.basisCommit ?? "a".repeat(40)];
  let frozen = 0;

  const deps: DelegationServiceDeps = {
    projectId: options.projectId ?? "project-1",
    reasoning: reasoning as never,
    branchExecutionFor: (workDir: string) => ({
      adapterId: "test-branch-host",
      start: (input: { readonly capabilityProfile?: string }) => {
        branchStarts.push({ workDir, ...(input.capabilityProfile === undefined ? {} : { capabilityProfile: input.capabilityProfile }) });
        const next = controllableJob();
        jobs.push(next);
        return next.job;
      },
    }),
    snapshot: {
      freeze: async () => {
        const basisCommit = bases[bases.length - 1]!;
        frozen += 1;
        return {
          workDir: `/frozen/basis-${frozen}`,
          basisCommit,
          release: async () => {
            released.push(basisCommit);
            await options.release?.();
          },
        };
      },
    },
    onTerminal: (projection) => terminals.push(projection),
  };
  return {
    service: makeDelegationService(deps),
    deps,
    reasoning,
    jobs,
    branchStarts,
    terminals,
    released,
    /** A NEW PROCESS over the SAME canonical cells: the job map is empty. */
    restart: () => makeDelegationService({ ...deps, onTerminal: undefined }),
    setBasis: (basisCommit: string) => bases.push(basisCommit),
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("DEL-A06: the state comes from BOTH layers, and INTERRUPTED is not RUNNING", () => {
  it("start returns immediately, and the ref is opaque, basis-carrying and round-trippable", async () => {
    const h = harness();
    const started = await h.service.start({ task: "investigate the cache race" });
    expect(started.outcome).toBe("STARTED");
    expect(started.state).toBe("RUNNING");
    expect(started.kind).toBe("RESEARCH");
    expect(started.basisCommit).toBe("a".repeat(40));

    const parsed = parseDelegationRef(started.delegationRef);
    expect(parsed).not.toBeNull();
    // §C.11 ②: the ref CARRIES the exact basis, so it survives the job map and a settlement.
    expect(parsed!.basisCommit).toBe("a".repeat(40));
    expect(delegationRefOf(parsed!)).toBe(started.delegationRef);
    expect(parseDelegationRef("nonsense")).toBeNull();
    // A v1 ref — or any near-miss — must never be read as a v2 one.
    expect(parseDelegationRef(`dlg1.${"a".repeat(40)}.cell.br-1`)).toBeNull();
    expect(parseDelegationRef(`dlg2.nothex.cell.br-1`)).toBeNull();

    // The job is in flight: OPEN branch + a live job in THIS process.
    const status = await h.service.status({ delegationRef: started.delegationRef });
    expect(status.state).toBe("RUNNING");
    expect(status.basisCommit).toBe("a".repeat(40));
    expect(h.jobs).toHaveLength(1);
  });

  it("settles through the SHARED settlement path, releases the snapshot, and delivers ONE terminal projection", async () => {
    const h = harness({ admit: true });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();

    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("COMPLETED");
    expect(h.reasoning.calls.closeBranch).toBe(1);
    expect(h.released).toEqual(["a".repeat(40)]);
    expect(h.terminals).toHaveLength(1);
    expect(h.terminals[0]!.state).toBe("COMPLETED");
    expect(h.terminals[0]!.conclusion).toContain("invalidate()");
    // §C.11 ②: the terminal projection carries the basis, not just the delegation's own conclusion.
    expect(h.terminals[0]!.basisCommit).toBe("a".repeat(40));

    // inspect is progressive disclosure over the same state — and the basis is STILL there, from the
    // ref, now that the job map entry is gone.
    const inspected = await h.service.inspect({ delegationRef: started.delegationRef });
    expect(inspected.basisCommit).toBe("a".repeat(40));
    expect(inspected.question).toBe("investigate the cache race");
    expect(inspected.conclusion).toContain("invalidate()");
  });

  it("a closed branch with no admissible conclusion is FAILED, not a fabricated claim", async () => {
    const h = harness({ admit: false });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "a guess" });
    await settle();
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("FAILED");
    expect(h.terminals[0]!.state).toBe("FAILED");
    // A rejected candidate is not a conclusion, so nothing is offered as one.
    expect(h.terminals[0]!.conclusion).toBeNull();
  });

  it("a host failure closes the branch and reports FAILED rather than inventing a candidate", async () => {
    const h = harness();
    const started = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.fail(new Error("the research host died"));
    await settle();
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("FAILED");
    expect(h.released).toEqual(["a".repeat(40)]);
    expect(h.reasoning.calls.submitCandidate).toBe(0);
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
    const after = await h.restart().status({ delegationRef: started.delegationRef });
    expect(after.state).toBe("INTERRUPTED");
    expect(after.detail).toContain("NOT running");
    expect(after.detail).toContain("does not auto-rerun");
    // The basis is still answerable, because the ref carries it.
    expect(after.basisCommit).toBe("a".repeat(40));
    // And nothing about it fabricates a worker: the branch is untouched, and no terminal was sent.
    expect(h.reasoning.cells.get(delegationCellIdOf({ projectId: "project-1", basisCommit: "a".repeat(40), task: "investigate the cache race" }))!.branches.size).toBe(1);
    expect(h.terminals).toHaveLength(0);
  });

  it("refuses a kind D1 does not implement, and an empty task", async () => {
    const h = harness();
    await expect(h.service.start({ task: "   " })).rejects.toBeInstanceOf(DelegationError);
    await expect(h.service.start({ task: "x", kind: "WORK" as never })).rejects.toThrow(/RESEARCH delegation only/);
  });
});

describe("§C.11 ② hardening: the delegation's identity is derived, so a retry converges", () => {
  it("an identical start while RUNNING starts NO second worker and returns the SAME ref", async () => {
    const h = harness();
    const first = await h.service.start({ task: "investigate the cache race" });
    const second = await h.service.start({ task: "investigate the cache race" });

    expect(second.delegationRef).toBe(first.delegationRef);
    expect(second.outcome).toBe("ALREADY_RUNNING");
    expect(second.state).toBe("RUNNING");
    // The load-bearing assertion: ONE child, not two, over one semantic branch.
    expect(h.jobs).toHaveLength(1);
    expect(h.reasoning.calls.submitCandidate).toBe(0);
  });

  it("the same task on a NEW basis is a DIFFERENT delegation, so a stale reading is never replayed", async () => {
    const h = harness();
    const first = await h.service.start({ task: "investigate the cache race" });
    h.setBasis("b".repeat(40));
    const second = await h.service.start({ task: "investigate the cache race" });

    expect(second.delegationRef).not.toBe(first.delegationRef);
    expect(second.outcome).toBe("STARTED");
    expect(second.basisCommit).toBe("b".repeat(40));
    // A second delegation over a second basis means a second cell and a second worker, on purpose.
    expect(h.jobs).toHaveLength(2);
    expect(h.reasoning.cells.size).toBe(2);
  });

  it("two projects on one reasoning store do not collide, even on the same task and basis", async () => {
    const h = harness();
    const mine = await h.service.start({ task: "investigate the cache race" });
    const theirs = await makeDelegationService({ ...h.deps, projectId: "project-2" }).start({
      task: "investigate the cache race",
    });
    expect(theirs.delegationRef).not.toBe(mine.delegationRef);
    expect(h.reasoning.cells.size).toBe(2);
  });

  it("an existing TERMINAL delegation is replayed, not re-run: no new worker, no second settlement", async () => {
    const h = harness({ admit: true });
    const first = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();

    // A retry after the fact — e.g. a principal whose context no longer holds the answer. The identity
    // is a pure function of what it already knows, so it converges on the existing result.
    const again = await h.service.start({ task: "investigate the cache race" });
    expect(again.outcome).toBe("EXISTING");
    expect(again.state).toBe("COMPLETED");
    expect(again.delegationRef).toBe(first.delegationRef);
    expect(again.conclusion).toContain("invalidate()");
    expect(h.jobs).toHaveLength(1);
    expect(h.reasoning.calls.submitCandidate).toBe(1);
    expect(h.reasoning.calls.evaluateCandidate).toBe(1);
  });

  it("an INTERRUPTED branch is reported as existing and is NOT auto-rerun", async () => {
    const h = harness();
    const first = await h.service.start({ task: "investigate the cache race" });
    // The process dies: the branch stays OPEN, the job map is empty.
    const restarted = h.restart();
    const again = await restarted.start({ task: "investigate the cache race" });
    expect(again.outcome).toBe("EXISTING");
    expect(again.state).toBe("INTERRUPTED");
    expect(again.delegationRef).toBe(first.delegationRef);
    expect(h.jobs).toHaveLength(1);
  });

  it("the delegated branch is asked for the READ-ONLY project profile, against the frozen snapshot", async () => {
    const h = harness();
    await h.service.start({ task: "investigate the cache race" });
    expect(h.branchStarts).toHaveLength(1);
    // §C.23: without this the worker gets a frozen snapshot it cannot open, and can only answer from
    // the brief — which is the gap the D1 live gate measured.
    expect(h.branchStarts[0]!.capabilityProfile).toBe("PROJECT_READ_ONLY");
    // ...and the workDir it reads is the SNAPSHOT, never the canonical repository.
    expect(h.branchStarts[0]!.workDir).toContain("/frozen/basis");
  });

  it("the cell is opened with the policy refs the deployment's policy ports actually serve", async () => {
    const h = harness();
    await h.service.start({ task: "investigate the cache race" });
    const cellId = delegationCellIdOf({ projectId: "project-1", basisCommit: "a".repeat(40), task: "investigate the cache race" });
    const definition = h.reasoning.cells.get(cellId)!.definition;
    // The first-party exploratory bundle REFUSES any other ref, so a delegation that invented one
    // would fail verification for ever while looking like a runtime that simply never concludes.
    expect(definition.verificationPolicyRef).toEqual({ policyId: "recipe.explore.verification", version: "v1" });
    expect(definition.admissionPolicyRef).toEqual({ policyId: "recipe.explore.admission", version: "v1" });
  });
});

describe("§C.11 ③ hardening: the three failure classes stay apart", () => {
  it("a snapshot RELEASE failure is reported as hygiene, never as a research result", async () => {
    // The snapshot lives under `.palimpsest/`, so `git worktree remove` failing is an ordinary bad
    // day, not an epistemic event. It must not reach the outcome, the count of settlements, or the text
    // the principal reads.
    let releases = 0;
    const h = harness({
      admit: true,
      release: async () => {
        releases += 1;
        if (releases === 1) throw new Error("worktree remove failed");
      },
    });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();
    await settle();

    expect(h.reasoning.calls.submitCandidate).toBe(1);
    expect(h.reasoning.calls.evaluateCandidate).toBe(1);
    expect(h.reasoning.calls.closeBranch).toBe(1);
    expect(h.terminals).toHaveLength(1);
    expect(h.terminals[0]!.state).toBe("COMPLETED");
    expect(h.terminals[0]!.detail).not.toContain("worktree");
    expect((await h.service.status({ delegationRef: started.delegationRef })).state).toBe("COMPLETED");
  });

  it("a terminal DELIVERY failure is not a research outcome, and NOT a second settlement", async () => {
    // THE reachable double-settlement: `onTerminal` is called at the END of settlement, so a throwing
    // delivery seam made the whole settlement reject and the outer `.catch` settled the same branch a
    // second time — a second candidate submission, a second close, a second notification, all for one
    // piece of research. Measured against the pre-fix chain (delivery not isolated, no guard) this test
    // fails with `expected 2 to be 1`; the delivery isolation is the fix, and the exactly-once guard in
    // the runtime is the second line of defence behind it.
    let releases = 0;
    const h = harness({
      admit: true,
      release: async () => {
        releases += 1;
      },
    });
    const service = makeDelegationService({
      ...h.deps,
      onTerminal: () => {
        throw new Error("the followup seam exploded");
      },
    });
    const started = await service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();
    await settle();

    expect(releases).toBe(1);
    expect(h.reasoning.calls.closeBranch).toBe(1);
    expect(h.reasoning.calls.submitCandidate).toBe(1);
    expect(h.reasoning.calls.evaluateCandidate).toBe(1);
    expect((await service.status({ delegationRef: started.delegationRef })).state).toBe("COMPLETED");
  });
});

describe("§C.13 hardening: DEDUPLICATED converges in BOTH lifecycles", () => {
  it("a branch that converges on an existing conclusion is COMPLETED, exactly as the blocking path counts it", async () => {
    const h = harness({ deduplicate: true });
    const started = await h.service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();

    expect(h.terminals[0]!.state).toBe("COMPLETED");
    expect(h.terminals[0]!.detail).toContain("converged on an existing exploratory conclusion");
    expect(h.terminals[0]!.conclusion).toContain("invalidate()");
    // And it stays COMPLETED after the job map is gone — the canonical view is the same fact.
    expect((await h.restart().status({ delegationRef: started.delegationRef })).state).toBe("COMPLETED");
  });
});

describe("the principal-facing terminal text", () => {
  it("carries the basis and the conclusion, states the standing, and leaks no orchestration detail", async () => {
    const delivered: string[] = [];
    const composer = makePrincipalTerminalComposer({
      deliver: {
        adapterId: "recording",
        deliver: async (text) => {
          delivered.push(text);
          return { delivered: true, detail: "recorded" };
        },
      },
    });
    const h = harness({ admit: true });
    const service = makeDelegationService({ ...h.deps, onTerminal: composer.onTerminal });
    const started = await service.start({ task: "investigate the cache race" });
    h.jobs[0]!.settle({ status: "completed", statement: "the race is in invalidate()" });
    await settle();
    await settle();

    expect(delivered).toHaveLength(1);
    const text = delivered[0]!;
    expect(text).toContain("aaa");
    expect(text).toContain("the race is in invalidate()");
    expect(text).toContain("not Work Evidence or Project Verification");
    // Orchestration detail stays out: no ref, no cell id, no branch id, no workDir.
    expect(text).not.toContain(started.delegationRef);
    expect(text).not.toContain("br-");
    expect(text).not.toContain("/frozen/basis");
    expect(composer.deliveries).toHaveLength(1);
    expect(composer.deliveries[0]!.delivered).toBe(true);
  });
});
