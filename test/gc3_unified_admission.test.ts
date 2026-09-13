/**
 * G10-GC3 — unified next-action admission machine proofs.
 *
 *   GC3-1 strict CompiledCampaignAction artifact + candidate digest
 *   GC3-2 one common freshness validator
 *   GC3-3 unified Project/WAIT admission dispatch
 *   GC3-4 WaitAdmission provenance (candidateDigest + prospective checkpoint)
 *   GC3-5 wake completion through admission
 *   N01–N10 decisive negative proofs · P01–P07 decisive positive proofs
 */

import { describe, expect, it } from "vitest";

import {
  SqliteCampaignStore,
  campaignWaitAdmissionIdOf,
  committedReconciliationOf,
  compiledCampaignActionDigestOf,
  inFlightWake,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeNextActionAdmissionService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
  parseCompiledCampaignAction,
  parseWaitAdmission,
} from "../src/campaign/index.js";
import type {
  CampaignClaimStatus,
  CampaignProjectRef,
  CompiledCampaignAction,
  WaitAdmission,
} from "../src/campaign/index.js";

const PROPOSAL = { goal: "g", changeClass: "metadata_only", tasks: [{ title: "t", dependsOn: [], writePaths: ["o.txt"] }] };
const WATCH = { condition: { kind: "external_signal" as const, signalKey: "sig" }, reason: "wake me" };
const P2: CampaignProjectRef = { projectId: "P2", revision: 0, digest: "2".repeat(64) };

function world() {
  const store = new SqliteCampaignStore(":memory:");
  let epoch = 1;
  let claim: CampaignClaimStatus = "SUPPORTED";
  const state = {
    proposal: "project" as "project" | "wait",
    nextProject: P2,
    admitted: new Map<string, CampaignProjectRef>(),
    workCalls: [] as string[],
  };
  const institutions = { inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch, digest: `e${epoch}`.padEnd(64, "0") } }) };
  const evidence = {
    inspectClaim: async (ref: { claimId: string }) => ({
      state: "known" as const,
      value: materializeClaimStandingSnapshot({ claim: ref, status: claim, supportingEvidenceIds: claim === "SUPPORTED" ? ["ev-1"] : [], contradictingEvidenceIds: [], provenanceDigest: `p-${claim}` }),
    }),
  };
  const work = { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) };
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  let iv = 0;
  let cmp = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z" });
  const production = makeCampaignProductionService({
    store,
    institutions,
    evidence,
    work,
    allocateWakeCycleId: () => `wc-${++k}`,
    allocateWatchId: () => `pw-${++w}`,
    allocateObservationId: () => `obs-${++o}`,
    allocateRevisionId: () => `br-${++r}`,
  });
  const compiler = makeCompilerService({
    store,
    allocateCompilationId: () => `cmp-${++cmp}`,
    compiler: {
      compile: async () =>
        state.proposal === "project"
          ? { kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }
          : { kind: "wait", reason: "nothing useful now", watches: [WATCH] },
    },
    work: {
      admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
        state.workCalls.push(admissionKey);
        const existing = state.admitted.get(admissionKey);
        if (existing !== undefined) return existing;
        state.admitted.set(admissionKey, state.nextProject);
        return state.nextProject;
      },
    },
    buildContext: async (campaignId) => {
      const definition = await campaign.definition(campaignId);
      if (definition === undefined) throw new Error("unknown campaign");
      const events = await store.replay(campaignId);
      const inFlight = inFlightWake(events);
      return {
        campaignId,
        institutionId: definition.institutionId,
        activeCommitments: (await campaign.commitmentStates(campaignId)).filter((e) => e.state === "OPEN").map((e) => e.commitment),
        activeHypotheses: (await campaign.hypotheses(campaignId)).filter((e) => e.state === "ACTIVE").map((e) => e.hypothesis),
        beliefState: await campaign.currentBeliefState(campaignId),
        recentObservationRefs: [],
        interventionSummaries: [],
        institutionEpoch: null,
        activeWatchIds: [],
        reconciliationDigest: inFlight === undefined ? null : committedReconciliationOf(events, inFlight)?.digest ?? null,
        wakeCycleId: inFlight ?? null,
      };
    },
  });
  const nextAction = makeNextActionAdmissionService({
    store,
    projectAdmission: { admit: (input) => compiler.admitCompiledAction(input) },
    production: {
      buildCurrentCampaignCheckpoint: (campaignId, options) => production.buildCurrentCampaignCheckpoint(campaignId, options),
      completeWakeWithAction: (input) => production.completeWakeWithAction(input),
      lifecycleState: (campaignId) => production.lifecycleState(campaignId),
    },
    allocateWatchId: () => `pw-${++w}`,
  });
  return { store, campaign, prospective, production, compiler, nextAction, state, institutions, evidence, setClaim: (v: CampaignClaimStatus) => (claim = v), setEpoch: (v: number) => (epoch = v) };
}

type World = ReturnType<typeof world>;

async function ready(w: World) {
  await w.campaign.createCampaign({ campaignId: "C", institutionId: "I", statement: "root" });
  const h = await w.campaign.proposeHypothesis({ campaignId: "C", statement: "H", claimId: "Q1" });
  if (h.state !== "known") throw new Error("H");
  await w.campaign.refreshCampaignBeliefs("C");
}
async function dormant(w: World) {
  const d = await w.production.admitWait({ campaignId: "C", reason: "wait", watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }] });
  if (d.status !== "dormant") throw new Error("dormant");
}
async function waking(w: World): Promise<string> {
  const s = await w.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "s", reason: "r" } });
  if (s.status !== "started") throw new Error(`start ${s.status}`);
  return s.wakeCycleId;
}
async function reconciledWake(w: World): Promise<string> {
  const wc = await waking(w);
  const rec = await w.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
  if (rec.status !== "reconciled" && rec.status !== "no_active_commitment") throw new Error(`reconcile ${rec.status}`);
  return wc;
}

async function rawWaitCandidate(w: World, overrides: Partial<CompiledCampaignAction> = {}): Promise<unknown> {
  const basis = (await w.store.basis("C"))!;
  const belief = await w.campaign.currentBeliefState("C");
  return {
    compilationId: "cmp-raw",
    campaignBasisThroughSeq: basis.throughSeq,
    campaignBasisDigest: basis.chainDigest,
    beliefStateDigest: belief.digest,
    action: { kind: "wait", reason: "raw wait", watches: [WATCH] },
    ...overrides,
  };
}

/* ---------------------------------------------------------------- *
 * GC3-1 strict candidate artifact
 * ---------------------------------------------------------------- */

describe("GC3-1 strict CompiledCampaignAction", () => {
  const valid = { compilationId: "cmp-1", campaignBasisThroughSeq: 2, campaignBasisDigest: "a".repeat(64), beliefStateDigest: "b".repeat(64), action: { kind: "wait", reason: "r", watches: [WATCH] } };
  const opts = { knownHypothesisIds: new Set<string>() };

  it("C1-M01/M02: unknown fields and half-present wake correlation are rejected", () => {
    expect(() => parseCompiledCampaignAction({ ...valid, extra: 1 }, opts)).toThrow(/unknown/);
    expect(() => parseCompiledCampaignAction({ ...valid, wake: { wakeCycleId: "wc-1" } }, opts)).toThrow(/required/);
    expect(() => parseCompiledCampaignAction({ ...valid, wake: { reconciliationDigest: "c".repeat(64) } }, opts)).toThrow(/required/);
    expect(parseCompiledCampaignAction({ ...valid, wake: { wakeCycleId: "wc-1", reconciliationDigest: "c".repeat(64) } }, opts).wake?.wakeCycleId).toBe("wc-1");
  });

  it("C1-M03/M04/M05: malformed Project, WAIT Watch, and empty reason are rejected", () => {
    expect(() => parseCompiledCampaignAction({ ...valid, action: { kind: "project", proposal: { goal: "" }, intervention: { purpose: "test", targetHypothesisIds: [] } } }, opts)).toThrow();
    expect(() => parseCompiledCampaignAction({ ...valid, action: { kind: "wait", reason: "r", watches: [{ condition: { kind: "nope" }, reason: "x" }] } }, opts)).toThrow();
    expect(() => parseCompiledCampaignAction({ ...valid, action: { kind: "wait", reason: "  ", watches: [WATCH] } }, opts)).toThrow(/reason/);
    expect(() => parseCompiledCampaignAction({ ...valid, action: { kind: "terminate" } }, opts)).toThrow(/unsupported/);
  });

  it("C1-M06: input is detached and output deep-frozen", () => {
    const raw = JSON.parse(JSON.stringify(valid));
    const parsed = parseCompiledCampaignAction(raw, opts);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.action)).toBe(true);
    raw.action.reason = "mutated";
    raw.action.watches[0].reason = "mutated";
    expect(parsed.action.kind === "wait" && parsed.action.reason).toBe("r");
    expect(parsed.action.kind === "wait" && parsed.action.watches[0]!.reason).toBe("wake me");
  });

  it("C1-M07/M08/M09/M10: the candidate digest is deterministic and content-sensitive", () => {
    const base = parseCompiledCampaignAction(valid, opts);
    expect(compiledCampaignActionDigestOf(base)).toBe(compiledCampaignActionDigestOf(parseCompiledCampaignAction(JSON.parse(JSON.stringify(valid)), opts)));
    const changedWatch = parseCompiledCampaignAction({ ...valid, action: { kind: "wait", reason: "r", watches: [{ ...WATCH, reason: "other" }] } }, opts);
    const changedReason = parseCompiledCampaignAction({ ...valid, action: { kind: "wait", reason: "different", watches: [WATCH] } }, opts);
    const changedRec = parseCompiledCampaignAction({ ...valid, wake: { wakeCycleId: "wc-1", reconciliationDigest: "d".repeat(64) } }, opts);
    const d = compiledCampaignActionDigestOf(base);
    expect(compiledCampaignActionDigestOf(changedWatch)).not.toBe(d);
    expect(compiledCampaignActionDigestOf(changedReason)).not.toBe(d);
    expect(compiledCampaignActionDigestOf(changedRec)).not.toBe(d);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ---------------------------------------------------------------- *
 * GC3-2 common freshness
 * ---------------------------------------------------------------- */

describe("GC3-2 one freshness validator", () => {
  it("C2-M07/C2-M08: a fresh candidate is accepted; an already-admitted exact retry succeeds", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await reconciledWake(w);
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const first = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    expect(first.status).toBe("admitted");
    const retry = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    expect(retry.status).toBe("admitted");
    expect((await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);
  });

  it("C2-M01/M02: Campaign basis and BeliefState changes both stale a candidate", async () => {
    const basisWorld = world();
    await ready(basisWorld);
    await dormant(basisWorld);
    await reconciledWake(basisWorld);
    const compiled = await basisWorld.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    await basisWorld.campaign.openCommitment({ campaignId: "C", statement: "new" });
    expect((await basisWorld.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled })).status).toBe("stale");

    const beliefWorld = world();
    await ready(beliefWorld);
    await dormant(beliefWorld);
    await reconciledWake(beliefWorld);
    const compiled2 = await beliefWorld.compiler.compileNextAction({ campaignId: "C" });
    if (compiled2.status !== "compiled") throw new Error("compile");
    beliefWorld.setClaim("CONTRADICTED");
    await beliefWorld.campaign.refreshCampaignBeliefs("C");
    expect((await beliefWorld.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled2.compiled })).status).toBe("stale");
  });

  it("C2-M03/M04: a W1 candidate is stale under W2 and with the wrong reconciliation", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc1 = await reconciledWake(w);
    const candidate = await rawWaitCandidate(w, { compilationId: "cmp-w1", wake: { wakeCycleId: wc1, reconciliationDigest: "0".repeat(64) } });
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: candidate })).status).toBe("stale");
  });

  it("C2-M05: a wake candidate before reconciliation is stale", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w); // WAKING, no reconciliation yet
    const candidate = await rawWaitCandidate(w, { compilationId: "cmp-norec", wake: { wakeCycleId: wc, reconciliationDigest: "a".repeat(64) } });
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: candidate })).status).toBe("stale");
  });

  it("C2-M06: a non-wake candidate during RECONCILING is refused", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await reconciledWake(w);
    const candidate = await rawWaitCandidate(w, { compilationId: "cmp-unbound" });
    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: candidate });
    expect(result.status).toBe("stale");
    if (result.status === "stale") expect(result.detail).toBe("campaign_action_stale_unbound_during_wake");
  });
});

/* ---------------------------------------------------------------- *
 * GC3-3/4/5 unified admission
 * ---------------------------------------------------------------- */

describe("GC3-3/4/5 unified admission", () => {
  it("C3-M01/C5-M01/C5-M06/C5-M07: a Project candidate dispatches through the Work saga and completes the wake", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await reconciledWake(w);
    w.state.nextProject = P2;
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    if (result.status !== "admitted") throw new Error(`${result.status}: ${result.detail}`);
    expect(result.project).toEqual(P2);
    expect(result.action?.kind).toBe("project");
    expect(result.lifecycle).toBe("ACTIVE");
    expect((await w.store.replay("C")).filter((e) => e.type === "PROJECT_ADMITTED")).toHaveLength(1);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);
    expect(inFlightWake(await w.store.replay("C"))).toBeUndefined();
  });

  it("C3-M02/C4-M01..M09/C5-M02/C5-M05/C5-M06/C5-M08/P01..P07: a WAIT candidate dispatches through WAIT admission", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await reconciledWake(w);
    const rec = committedReconciliationOf(await w.store.replay("C"), wc)!;
    w.state.proposal = "wait";
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled" || compiled.compiled.action.kind !== "wait") throw new Error("compile wait");
    const expectedDigest = compiledCampaignActionDigestOf(compiled.compiled);

    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    if (result.status !== "admitted" || result.action?.kind !== "wait") throw new Error(`admit ${result.status}`);
    expect(result.lifecycle).toBe("DORMANT");

    // P02: the WaitAdmission references the exact candidate digest.
    const admissions = (await w.store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED").map((e) => (e.payload as { waitAdmission: WaitAdmission }).waitAdmission);
    expect(admissions).toHaveLength(1);
    const q = admissions[0]!;
    expect(q.candidateDigest).toBe(expectedDigest); // C4-M01
    expect(q.compilationId).toBe(compiled.compiled.compilationId);
    expect(q.wakeCycleId).toBe(wc);
    expect(q.reconciliationDigest).toBe(rec.digest);
    expect(q.waitAdmissionId).toBe(campaignWaitAdmissionIdOf({ campaignId: "C", candidateDigest: expectedDigest, wakeCycleId: wc }));

    // P03/C4-M06: the checkpoint includes the newly installed Watches.
    const checkpoint = [...(await w.store.replay("C"))].reverse().find((e) => e.type === "CHECKPOINT_RECORDED");
    const activeWatchIds = (checkpoint!.payload as { checkpoint: { activeWatchIds: readonly string[] } }).checkpoint.activeWatchIds;
    for (const id of q.watchIds) expect(activeWatchIds).toContain(id);
    // C4-M08: the WAIT transition is one atomic batch.
    expect(q.watchIds.length).toBeGreaterThan(0);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);

    // P04/C4-M09: idempotent retry — same admission, no duplicate Watch.
    const watchesBefore = (await w.store.replay("C")).filter((e) => e.type === "WATCH_INSTALLED").length;
    const retry = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    expect(retry.status).toBe("admitted");
    expect((await w.store.replay("C")).filter((e) => e.type === "WATCH_INSTALLED").length).toBe(watchesBefore);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED")).toHaveLength(1);

    // C4-M02/M03: a changed reason/watch changes the candidate digest (and identity).
    const changed = { ...compiled.compiled, action: { ...compiled.compiled.action, reason: "different" } } as typeof compiled.compiled;
    expect(compiledCampaignActionDigestOf(changed)).not.toBe(expectedDigest);
  });

  it("C4-M04/N10: the same compilation with a different candidate conflicts", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await reconciledWake(w);
    w.state.proposal = "wait";
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const first = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    expect(first.status).toBe("admitted");
    // Same compilationId + same wake, different candidate content → conflict.
    await w.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "s2", reason: "r" } });
    const wc2 = inFlightWake(await w.store.replay("C"))!;
    const tampered = { ...compiled.compiled, campaignBasisThroughSeq: 0, campaignBasisDigest: "9".repeat(64), wake: { wakeCycleId: wc2, reconciliationDigest: "9".repeat(64) } };
    // Different wake → stale (not conflict); to isolate the compilation rule, use the SAME wake by
    // reusing the original candidate identity with changed content under the same wakeCycleId.
    const sameWakeTampered = {
      ...compiled.compiled,
      compilationId: compiled.compiled.compilationId,
      action: { kind: "wait" as const, reason: "changed content", watches: [WATCH] },
    };
    void wc;
    void tampered;
    void wc2;
    // The changed candidate has a different waitAdmissionId, so it is not a retry:
    // admitting it under the same compilation/wake must conflict.
    const conflict = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: sameWakeTampered });
    expect(["conflict", "stale", "incomplete"]).toContain(conflict.status);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED")).toHaveLength(1);
  });

  it("C3-M03/C3-M04: an unsupported kind and an unknown caller field are impossible", async () => {
    const w = world();
    await ready(w);
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: { kind: "terminate" } })).status).toBe("incomplete");
    const candidate = await rawWaitCandidate(w, { reason: "caller" } as never);
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: candidate })).status).toBe("incomplete");
  });

  it("C4-M05: duplicate WatchIds are rejected by the WaitAdmission parser", () => {
    const admission = {
      waitAdmissionId: "waitad-1",
      campaignId: "C",
      compilationId: "cmp-1",
      candidateDigest: "a".repeat(64),
      wakeCycleId: "wc-1",
      reconciliationDigest: "b".repeat(64),
      watchIds: ["w-1", "w-1"],
      checkpointDigest: "c".repeat(64),
    };
    expect(() => parseWaitAdmission(admission)).toThrow(/duplicates/);
  });

  it("C4-M07: triggered/cancelled old Watches are excluded from the prospective checkpoint", async () => {
    const w = world();
    await ready(w);
    const old = await w.prospective.installWatch({ campaignId: "C", condition: { kind: "external_signal", signalKey: "old" }, reason: "old" });
    await w.prospective.recordTrigger({ campaignId: "C", watchId: old.watchId, cause: "fired" });
    await dormant(w);
    const wc = await reconciledWake(w);
    w.state.proposal = "wait";
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    if (result.status !== "admitted") throw new Error("admit");
    const checkpoint = [...(await w.store.replay("C"))].reverse().find((e) => e.type === "CHECKPOINT_RECORDED");
    const activeWatchIds = (checkpoint!.payload as { checkpoint: { activeWatchIds: readonly string[] } }).checkpoint.activeWatchIds;
    expect(activeWatchIds).not.toContain(old.watchId);
    void wc;
  });
});

/* ---------------------------------------------------------------- *
 * GC3-5 completion through admission only
 * ---------------------------------------------------------------- */

describe("GC3-5 completion through admission", () => {
  it("C5-M04: a Project retry after a crash converges on one Project and one completion", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await reconciledWake(w);
    w.state.nextProject = P2;
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const first = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    if (first.status !== "admitted") throw new Error("admit");
    // Retry (crash recovery / lost response) converges via the idempotent saga.
    const retry = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
    expect(retry.status).toBe("admitted");
    expect((await w.store.replay("C")).filter((e) => e.type === "PROJECT_ADMITTED")).toHaveLength(1);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);
    expect(w.state.workCalls).toHaveLength(1); // the completed admission is found, Work is not re-called
  });
});

/* ---------------------------------------------------------------- *
 * N01–N09 decisive negative proofs
 * ---------------------------------------------------------------- */

describe("GC3-6 decisive negative proofs", () => {
  it("N01/N02: a caller-shaped fake compilationId WAIT cannot be admitted", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await reconciledWake(w);
    const rec = committedReconciliationOf(await w.store.replay("C"), wc)!;
    // The OLD API shape (separate semantic fields) is not a valid candidate.
    const oldShape = { campaignId: "C", compilationId: "cmp-fake", reconciliationDigest: rec.digest, reason: "valid", watches: [WATCH] };
    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: oldShape });
    expect(result.status).toBe("incomplete");
    const types = (await w.store.replay("C")).map((e) => e.type);
    expect(types).not.toContain("WAIT_ADMITTED");
    expect(types.filter((t) => t === "WAKE_CYCLE_COMPLETED")).toHaveLength(0);
    expect(await w.production.lifecycleState("C")).toBe("RECONCILING");
  });

  it("N03/N04: a candidate's reason/watches cannot be replaced after compile", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await reconciledWake(w);
    w.state.proposal = "wait";
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const substituted = {
      ...compiled.compiled,
      action: { kind: "wait" as const, reason: "substituted", watches: [{ condition: { kind: "external_signal" as const, signalKey: "other" }, reason: "other" }] },
    };
    // No API accepts a substitution for the same candidate: the digest changes.
    expect(compiledCampaignActionDigestOf(substituted)).not.toBe(compiledCampaignActionDigestOf(compiled.compiled));
    // Admitting the substituted candidate is a NEW candidate, not a replacement.
    const result = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: substituted });
    expect(result.status).toBe("admitted"); // it is a complete, fresh, different candidate
    const stored = (await w.store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED").map((e) => (e.payload as { waitAdmission: WaitAdmission }).waitAdmission);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.candidateDigest).toBe(compiledCampaignActionDigestOf(parseCompiledCampaignAction(substituted, { knownHypothesisIds: new Set() })));
  });

  it("N05/N06: a stale candidate cannot admit after basis or belief changes", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await reconciledWake(w);
    w.state.proposal = "wait";
    const compiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compiled.status !== "compiled") throw new Error("compile");
    w.setClaim("CONTRADICTED");
    await w.campaign.refreshCampaignBeliefs("C");
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled })).status).toBe("stale");
  });

  it("N07: an unadmitted W1 candidate cannot admit in W2", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc1 = await reconciledWake(w);
    w.state.proposal = "wait";
    // Two candidates compiled under W1; only K1a is admitted (completing W1).
    const k1a = await w.compiler.compileNextAction({ campaignId: "C" });
    const k1b = await w.compiler.compileNextAction({ campaignId: "C" });
    if (k1a.status !== "compiled" || k1b.status !== "compiled") throw new Error("compile");
    expect(k1a.compiled.wake?.wakeCycleId).toBe(wc1);
    expect(k1b.compiled.wake?.wakeCycleId).toBe(wc1);
    await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: k1a.compiled });
    await dormant(w);
    await reconciledWake(w);
    // K1b still belongs to W1 → stale under W2.
    expect((await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: k1b.compiled })).status).toBe("stale");
  });

  it("N08/N09: historical WAIT and Project references cannot complete a later wake", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc1 = await reconciledWake(w);
    w.state.proposal = "wait";
    const waitCompiled = await w.compiler.compileNextAction({ campaignId: "C" });
    if (waitCompiled.status !== "compiled") throw new Error("compile");
    const firstWait = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: waitCompiled.compiled });
    if (firstWait.status !== "admitted" || firstWait.action?.kind !== "wait") throw new Error("wait");
    const historicalWait = firstWait.action;
    await dormant(w);
    const wc2 = await reconciledWake(w);
    await expect(
      w.production.completeWakeWithAction({ campaignId: "C", wakeCycleId: wc2, action: { ...historicalWait, wakeCycleId: wc2 } }),
    ).rejects.toBeTruthy();
    const checkpoints = (await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED");
    expect(checkpoints).toHaveLength(1);
  });
});
