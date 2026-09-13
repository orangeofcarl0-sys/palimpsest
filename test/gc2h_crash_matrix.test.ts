/**
 * G10-GC2-H crash matrix (§136).
 *
 * The production loop is injected with a crash BEFORE and AFTER each durable
 * commit boundary. Every retry must either converge (idempotent recovery) or
 * fail closed — never duplicate a Project, a reconciliation, or a completion.
 */

import { describe, expect, it } from "vitest";

import {
  SqliteCampaignStore,
  committedReconciliationOf,
  inFlightWake,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type { CampaignAppendRequest, CampaignAtomicAppend, CampaignBasisRef, CampaignDefinition, CampaignEvent, CampaignEventType, CampaignProjectRef, CampaignStore } from "../src/campaign/index.js";

const PROPOSAL = { goal: "g", changeClass: "metadata_only", tasks: [{ title: "t", dependsOn: [], writePaths: ["o.txt"] }] };

/** One-shot crash seam: throw before/after a batch containing a trigger type. */
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

function makeHarness() {
  const inner = new SqliteCampaignStore(":memory:");
  const store = new CrashStore(inner);
  const institutions = {
    inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch: 1, digest: "e".repeat(64) } }),
  };
  const evidence = {
    inspectClaim: async (claim: { claimId: string }) => ({
      state: "known" as const,
      value: materializeClaimStandingSnapshot({ claim, status: "SUPPORTED" as const, supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "prov" }),
    }),
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
  const admitted = new Map<string, CampaignProjectRef>();
  const compiler = makeCompilerService({
    store,
    allocateCompilationId: () => `cmp-${++cmp}`,
    compiler: { compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) },
    work: {
      admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
        const existing = admitted.get(admissionKey);
        if (existing !== undefined) return existing;
        const project: CampaignProjectRef = { projectId: "P2", revision: 2, digest: "2".repeat(64) };
        admitted.set(admissionKey, project);
        return project;
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
        activeCommitments: (await campaign.commitmentStates(campaignId)).filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
        activeHypotheses: (await campaign.hypotheses(campaignId)).filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
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
  return { store, campaign, production, compiler };
}

async function toDormant(h: ReturnType<typeof makeHarness>) {
  await h.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  const dormant = await h.production.admitWait({ campaignId: "camp-1", reason: "wait", watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }] });
  if (dormant.status !== "dormant") throw new Error("dormant");
}

const count = async (h: ReturnType<typeof makeHarness>, type: string) => (await h.store.replay("camp-1")).filter((event) => event.type === type).length;

describe("GC2-H crash matrix", () => {
  it("crash BEFORE WAKE_STARTED → retry starts exactly one cycle", async () => {
    const h = makeHarness();
    await toDormant(h);
    h.store.crashBefore("WAKE_STARTED");
    await expect(h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } })).rejects.toThrow(/crash before/);
    expect(await count(h, "WAKE_STARTED")).toBe(0);
    const retry = await h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(retry.status).toBe("started");
    expect(await count(h, "WAKE_STARTED")).toBe(1);
  });

  it("crash AFTER WAKE_STARTED → retry reports the in-flight cycle, no W2", async () => {
    const h = makeHarness();
    await toDormant(h);
    h.store.crashAfter("WAKE_STARTED");
    await expect(h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } })).rejects.toThrow(/crash after/);
    const retry = await h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(retry.status).toBe("wake_already_in_progress");
    expect(await count(h, "WAKE_STARTED")).toBe(1);
  });

  it("crash BEFORE and AFTER RECONCILIATION_COMMITTED → one reconciliation, idempotent retry", async () => {
    for (const mode of ["before", "after"] as const) {
      const h = makeHarness();
      await toDormant(h);
      const start = await h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
      if (start.status !== "started") throw new Error("start");
      if (mode === "before") h.store.crashBefore("RECONCILIATION_COMMITTED");
      else h.store.crashAfter("RECONCILIATION_COMMITTED");
      await expect(h.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } })).rejects.toThrow(/crash/);
      const retry = await h.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
      expect(retry.status).toBe("reconciled");
      expect(await count(h, "RECONCILIATION_COMMITTED")).toBe(1);
      expect(await count(h, "WORLD_RECONCILED")).toBe(1);
    }
  });

  it("crash BEFORE and AFTER PROJECT_ADMITTED → one Project, one link, idempotent retry", async () => {
    for (const mode of ["before", "after"] as const) {
      const h = makeHarness();
      await toDormant(h);
      const start = await h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
      if (start.status !== "started") throw new Error("start");
      await h.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
      const compiled = await h.compiler.compileNextAction({ campaignId: "camp-1" });
      if (compiled.status !== "compiled") throw new Error("compile");
      if (mode === "before") h.store.crashBefore("PROJECT_ADMITTED");
      else h.store.crashAfter("PROJECT_ADMITTED");
      await expect(h.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled })).rejects.toThrow(/crash/);
      const retry = await h.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
      expect(retry.status).toBe("admitted");
      expect(await count(h, "PROJECT_ADMITTED")).toBe(1);
    }
  });

  it("crash BEFORE and AFTER WAKE_CYCLE_COMPLETED → one completion, idempotent retry", async () => {
    for (const mode of ["before", "after"] as const) {
      const h = makeHarness();
      await toDormant(h);
      const start = await h.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
      if (start.status !== "started") throw new Error("start");
      await h.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
      const compiled = await h.compiler.compileNextAction({ campaignId: "camp-1" });
      if (compiled.status !== "compiled") throw new Error("compile");
      const admitted = await h.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
      if (admitted.status !== "admitted" || admitted.completion === null) throw new Error("admit");
      if (mode === "before") h.store.crashBefore("WAKE_CYCLE_COMPLETED");
      else h.store.crashAfter("WAKE_CYCLE_COMPLETED");
      await expect(h.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: start.wakeCycleId, action: admitted.completion })).rejects.toThrow(/crash/);
      await h.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: start.wakeCycleId, action: admitted.completion });
      expect(await count(h, "WAKE_CYCLE_COMPLETED")).toBe(1);
      expect(await h.production.lifecycleState("camp-1")).toBe("ACTIVE");
    }
  });
});
