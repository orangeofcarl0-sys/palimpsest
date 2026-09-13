/**
 * G10-GC3 crash matrix (§90) — Project and WAIT admission boundaries converge.
 */

import { describe, expect, it } from "vitest";

import {
  SqliteCampaignStore,
  committedReconciliationOf,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeNextActionAdmissionService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type {
  CampaignAppendRequest,
  CampaignAtomicAppend,
  CampaignBasisRef,
  CampaignDefinition,
  CampaignEvent,
  CampaignEventType,
  CampaignProjectRef,
  CampaignStore,
} from "../src/campaign/index.js";

const PROPOSAL = { goal: "g", changeClass: "metadata_only", tasks: [{ title: "t", dependsOn: [], writePaths: ["o.txt"] }] };
const WATCH = { condition: { kind: "external_signal" as const, signalKey: "sig" }, reason: "wake me" };

class CrashStore implements CampaignStore {
  #before: { type: CampaignEventType; fired: boolean } | null = null;
  #after: { type: CampaignEventType; fired: boolean } | null = null;
  constructor(readonly inner: SqliteCampaignStore) {}
  crashBefore(type: CampaignEventType): void {
    this.#before = { type, fired: false };
    this.#after = null;
  }
  crashAfter(type: CampaignEventType): void {
    this.#after = { type, fired: false };
    this.#before = null;
  }
  async genesis(input: Parameters<CampaignStore["genesis"]>[0]): Promise<CampaignEvent> {
    return this.inner.genesis(input);
  }
  async appendAtomic(transition: CampaignAtomicAppend): Promise<readonly CampaignEvent[]> {
    const types = transition.events.map((event: CampaignAppendRequest) => event.type);
    if (this.#before !== null && !this.#before.fired && types.includes(this.#before.type)) {
      this.#before.fired = true;
      throw new Error(`crash before ${this.#before.type}`);
    }
    const result = await this.inner.appendAtomic(transition);
    if (this.#after !== null && !this.#after.fired && types.includes(this.#after.type)) {
      this.#after.fired = true;
      throw new Error(`crash after ${this.#after.type}`);
    }
    return result;
  }
  definition(campaignId: string): Promise<CampaignDefinition | undefined> {
    return this.inner.definition(campaignId);
  }
  basis(campaignId: string): Promise<CampaignBasisRef | undefined> {
    return this.inner.basis(campaignId);
  }
  replay(campaignId: string): Promise<readonly CampaignEvent[]> {
    return this.inner.replay(campaignId);
  }
  campaigns(): Promise<readonly CampaignDefinition[]> {
    return this.inner.campaigns();
  }
  close(): void {
    this.inner.close();
  }
}

function harness() {
  const inner = new SqliteCampaignStore(":memory:");
  const store = new CrashStore(inner);
  const state = { proposal: "project" as "project" | "wait", project: { projectId: "P2", revision: 0, digest: "2".repeat(64) } as CampaignProjectRef, admitted: new Map<string, CampaignProjectRef>(), crashAfterWork: false };
  const institutions = { inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch: 1, digest: "e".repeat(64) } }) };
  const evidence = {
    inspectClaim: async (ref: { claimId: string }) => ({ state: "known" as const, value: materializeClaimStandingSnapshot({ claim: ref, status: "SUPPORTED" as const, supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "p" }) }),
  };
  const work = { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) };
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  let cmp = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
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
    compiler: { compile: async () => (state.proposal === "project" ? { kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } } : { kind: "wait", reason: "wait", watches: [WATCH] }) },
    work: {
      admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
        const existing = state.admitted.get(admissionKey);
        if (existing !== undefined) {
          if (state.crashAfterWork) {
            state.crashAfterWork = false;
            throw new Error("simulated crash after Work admission");
          }
          return existing;
        }
        state.admitted.set(admissionKey, state.project);
        if (state.crashAfterWork) {
          state.crashAfterWork = false;
          throw new Error("simulated crash after Work admission");
        }
        return state.project;
      },
    },
    buildContext: async (campaignId) => {
      const definition = await campaign.definition(campaignId);
      if (definition === undefined) throw new Error("unknown campaign");
      const events = await store.replay(campaignId);
      const inFlight = events.find((e) => e.type === "WAKE_STARTED")?.payload as { wakeCycleId: string } | undefined;
      const wakeCycleId = inFlight?.wakeCycleId ?? null;
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
        reconciliationDigest: wakeCycleId === null ? null : committedReconciliationOf(events, wakeCycleId)?.digest ?? null,
        wakeCycleId,
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
  return { store, campaign, production, compiler, nextAction, state };
}

async function toReconciling(h: ReturnType<typeof harness>): Promise<string> {
  await h.campaign.createCampaign({ campaignId: "C", institutionId: "I", statement: "root" });
  const hyp = await h.campaign.proposeHypothesis({ campaignId: "C", statement: "H", claimId: "Q1" });
  if (hyp.state !== "known") throw new Error("h");
  await h.campaign.refreshCampaignBeliefs("C");
  const dormant = await h.production.admitWait({ campaignId: "C", reason: "wait", watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "l" }] });
  if (dormant.status !== "dormant") throw new Error("d");
  const start = await h.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "s", reason: "r" } });
  if (start.status !== "started") throw new Error("start");
  const rec = await h.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
  if (rec.status !== "reconciled" && rec.status !== "no_active_commitment") throw new Error("rec");
  return start.wakeCycleId;
}

const count = async (h: ReturnType<typeof harness>, type: string) => (await h.store.replay("C")).filter((e) => e.type === type).length;

describe("GC3 crash recovery", () => {
  it("Project: crash before PROJECT_ADMISSION_PREPARED and after Work admission both converge", async () => {
    // before PREPARED
    const a = harness();
    await toReconciling(a);
    const compiledA = await a.compiler.compileNextAction({ campaignId: "C" });
    if (compiledA.status !== "compiled") throw new Error("compile");
    a.store.crashBefore("PROJECT_ADMISSION_PREPARED");
    await expect(a.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiledA.compiled })).rejects.toThrow(/crash before/);
    expect((await a.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiledA.compiled })).status).toBe("admitted");
    expect(await count(a, "PROJECT_ADMITTED")).toBe(1);

    // after Work admission, before PROJECT_ADMITTED
    const b = harness();
    await toReconciling(b);
    const compiledB = await b.compiler.compileNextAction({ campaignId: "C" });
    if (compiledB.status !== "compiled") throw new Error("compile");
    b.state.crashAfterWork = true;
    await expect(b.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiledB.compiled })).rejects.toThrow(/simulated crash/);
    const recovered = await b.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiledB.compiled });
    if (recovered.status !== "admitted") throw new Error(`${recovered.status}`);
    expect(await count(b, "PROJECT_ADMITTED")).toBe(1);
    expect(await count(b, "WAKE_CYCLE_COMPLETED")).toBe(1);
    expect(b.state.admitted.size).toBe(1);
  });

  it("WAIT: crash before and after the atomic batch both converge without duplicates", async () => {
    for (const mode of ["before", "after"] as const) {
      const h = harness();
      await toReconciling(h);
      h.state.proposal = "wait";
      const compiled = await h.compiler.compileNextAction({ campaignId: "C" });
      if (compiled.status !== "compiled") throw new Error("compile");
      if (mode === "before") h.store.crashBefore("WAIT_ADMITTED");
      else h.store.crashAfter("WAIT_ADMITTED");
      await expect(h.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled })).rejects.toThrow(/crash/);
      const retry = await h.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compiled.compiled });
      expect(retry.status).toBe("admitted");
      expect(await count(h, "WAIT_ADMITTED")).toBe(1);
      expect(await count(h, "WAKE_CYCLE_COMPLETED")).toBe(1);
      expect(await h.production.lifecycleState("C")).toBe("DORMANT");
    }
  });
});
