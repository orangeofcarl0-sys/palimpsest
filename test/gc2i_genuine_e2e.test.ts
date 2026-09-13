/**
 * G10-GC2-I — genuine P1 → Dormant → WorkChanged → Wake → P2 end-to-end.
 *
 * Unlike the GC8 proof, P1 is a REAL Campaign-linked Project BEFORE dormancy:
 * its exact `(projectId, revision, digest)` survives the checkpoint/restart, its
 * Work state change is observed during the wake, and neither the historical P1
 * nor the historical WAIT can satisfy a later wake. A crash after Work
 * admission recovers the same P2.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CampaignStoreError,
  SqliteCampaignStore,
  committedReconciliationOf,
  currentBeliefStateOf,
  inFlightWake,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeInterventionService,
  makeNextActionAdmissionService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
  projectLinkedProjects,
} from "../src/campaign/index.js";
import type {
  BeliefRevision,
  CampaignClaimStatus,
  CampaignProjectRef,
  CampaignReconciliationReport,
  ProjectOperationalStanding,
} from "../src/campaign/index.js";

const P1: CampaignProjectRef = { projectId: "P1", revision: 3, digest: "1".repeat(64) };
const P2: CampaignProjectRef = { projectId: "P2", revision: 1, digest: "2".repeat(64) };
const PROJECT_PROPOSAL = { goal: "follow-up experiment", changeClass: "metadata_only", tasks: [{ title: "run", dependsOn: [], writePaths: ["out.txt"] }] };

interface SharedState {
  epoch: number;
  claimStatus: CampaignClaimStatus | "unknown" | "error";
  channel: "known" | "unknown" | "error";
  signal: boolean;
  proposal: "project" | "wait";
  nextProject: CampaignProjectRef;
  admitted: Map<string, CampaignProjectRef>;
  workCalls: string[];
  inspected: CampaignProjectRef[];
  crashAfterAdmit: boolean;
}

function makeWorld(path: string, state: SharedState) {
  const store = new SqliteCampaignStore(path);
  const institutions = {
    inspectEpoch: async (institutionId: string) =>
      ({ state: "known" as const, value: { institutionId, epoch: state.epoch, digest: `e${state.epoch}`.padEnd(64, "0") } }),
  };
  const evidence = {
    inspectClaim: async (claim: { claimId: string }) => {
      if (state.claimStatus === "unknown") return { state: "unknown" as const, detail: "unknown" };
      if (state.claimStatus === "error") return { state: "error" as const, detail: "error" };
      return {
        state: "known" as const,
        value: materializeClaimStandingSnapshot({
          claim,
          status: state.claimStatus,
          supportingEvidenceIds: state.claimStatus === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: state.claimStatus === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${state.claimStatus}`,
        }),
      };
    },
  };
  const work = {
    inspectProject: async (candidate: CampaignProjectRef) => {
      state.inspected.push(candidate);
      if (state.channel !== "known") return { state: state.channel, detail: "channel unavailable" } as const;
      const standing: ProjectOperationalStanding = candidate.projectId === "P1" ? "completed" : "running";
      return { state: "known" as const, value: standing };
    },
  };
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  let iv = 0;
  let cmp = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
  const interventions = makeInterventionService({ store, allocateInterventionId: () => `iv-${++iv}`, work, evidence });
  const prospective = makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++w}`,
    clock: () => "2026-01-01T00:00:00Z",
    evidence,
    projects: work,
    signals: { inspect: async () => ({ state: "known" as const, value: state.signal }) },
    institutions: { currentEpoch: async () => ({ state: "known" as const, value: state.epoch }) },
  });
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
          ? { kind: "project", projectProposal: PROJECT_PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }
          : { kind: "wait", reason: "nothing useful", watches: [{ condition: { kind: "external_signal", signalKey: "sig2" }, reason: "later" }] },
    },
    work: {
      admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
        state.workCalls.push(admissionKey);
        const existing = state.admitted.get(admissionKey);
        if (existing !== undefined) {
          if (state.crashAfterAdmit) {
            state.crashAfterAdmit = false;
            throw new Error("simulated crash after Work admission");
          }
          return existing;
        }
        state.admitted.set(admissionKey, state.nextProject);
        if (state.crashAfterAdmit) {
          state.crashAfterAdmit = false;
          throw new Error("simulated crash after Work admission");
        }
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
        activeCommitments: (await campaign.commitmentStates(campaignId)).filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
        activeHypotheses: (await campaign.hypotheses(campaignId)).filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
        beliefState: await campaign.currentBeliefState(campaignId),
        recentObservationRefs: events
          .filter((event) => event.type === "EVIDENCE_OBSERVED")
          .map((event) => (event.payload as { observation: { observationId: string } }).observation.observationId),
        interventionSummaries: events
          .filter((event) => event.type === "INTERVENTION_REGISTERED")
          .map((event) => {
            const intervention = (event.payload as { intervention: { project: CampaignProjectRef; purpose: string } }).intervention;
            return `${intervention.project.projectId}@${intervention.project.revision}:${intervention.purpose}`;
          }),
        institutionEpoch: (await institutions.inspectEpoch(definition.institutionId)).value,
        activeWatchIds: events
          .filter((event) => event.type === "WATCH_INSTALLED")
          .map((event) => (event.payload as { watch: { watchId: string } }).watch.watchId),
        reconciliationDigest: inFlight === undefined ? null : committedReconciliationOf(events, inFlight)?.digest ?? null,
        wakeCycleId: inFlight ?? null,
      };
    },
  });
  const nextAction = makeNextActionAdmissionService({
    store,
    projectAdmission: { admit: (input) => compiler.admitCompiledAction(input) },
    production: {
      buildCurrentCampaignCheckpoint: (campaignId, productionOptions) => production.buildCurrentCampaignCheckpoint(campaignId, productionOptions),
      completeWakeWithAction: (input) => production.completeWakeWithAction(input),
      lifecycleState: (campaignId) => production.lifecycleState(campaignId),
    },
    allocateWatchId: () => `pw-${++w}`,
  });
  return { store, campaign, prospective, production, compiler, interventions, nextAction };
}

function newState(): SharedState {
  return {
    epoch: 1,
    claimStatus: "SUPPORTED",
    channel: "known",
    signal: false,
    proposal: "project",
    nextProject: P2,
    admitted: new Map(),
    workCalls: [],
    inspected: [],
    crashAfterAdmit: false,
  };
}

const eventTypes = (events: readonly { type: string }[]): string[] => events.map((event) => event.type);

describe("GC2-I genuine P1 → Dormant → WorkChanged → Wake → P2", () => {
  it("runs the full causally-auditable long-horizon loop with restart and crash recovery", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pal-gc2i-")), "campaign.sqlite");
    const state = newState();
    let w = makeWorld(path, state);

    // 1–2. Real Institution-grounded Campaign; a ghost institution is refused.
    await w.campaign.createCampaign({ campaignId: "C", institutionId: "I", statement: "root" });
    await expect(
      makeCampaignService({ store: w.store, allocateCommitmentId: () => "x", institutions: { inspectEpoch: async () => ({ state: "unknown", detail: "ghost" }) } })
        .createCampaign({ campaignId: "ghost", institutionId: "ghost", statement: "s" }),
    ).rejects.toBeTruthy();

    // 3. H1 → Q1; Evidence Q1 SUPPORTED.
    const h1 = await w.campaign.proposeHypothesis({ campaignId: "C", statement: "H1", claimId: "Q1" });
    if (h1.state !== "known") throw new Error("H1");
    await w.campaign.refreshCampaignBeliefs("C");
    expect((await w.campaign.currentBeliefState("C")).entries[0]!.standing).toBe("supported");

    // 4. Admit the real Project P1 (exact revision/digest).
    state.nextProject = P1;
    const compileP1 = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compileP1.status !== "compiled") throw new Error(compileP1.detail);
    const admitP1 = await w.compiler.admitCompiledAction({ campaignId: "C", compiled: compileP1.compiled });
    if (admitP1.status !== "admitted") throw new Error("P1 admit");
    expect(admitP1.project).toEqual(P1);

    // 5. Register Intervention I1 against exact P1 targeting H1.
    const i1 = await w.interventions.register({ campaignId: "C", project: P1, purpose: "test", targetHypothesisIds: [h1.value.hypothesisId] });
    expect(i1.project).toEqual(P1);

    // 6. P1 is observed running/completed before dormancy.
    expect((await w.store.replay("C")).some((e) => e.type === "PROJECT_ADMITTED")).toBe(true);

    // 7. WAIT through the production golden path → DORMANT; checkpoint holds exact P1.
    const dormant = await w.production.admitWait({
      campaignId: "C",
      reason: "nothing useful now",
      watches: [{ condition: { kind: "external_signal", signalKey: "sig" }, reason: "wake on signal" }],
    });
    if (dormant.status !== "dormant") throw new Error("dormant");
    const checkpointBefore = await w.production.buildCurrentCampaignCheckpoint("C");
    if (checkpointBefore.state !== "known") throw new Error("checkpoint");
    expect(checkpointBefore.value.knownProjectRefs).toEqual([P1]);
    expect(checkpointBefore.value.institutionEpoch.epoch).toBe(1);

    // 8. Restart: the checkpoint and exact P1 ref replay unchanged.
    w.store.close();
    w = makeWorld(path, state);
    const replayed = projectLinkedProjects(await w.store.replay("C"));
    if (replayed.status !== "known") throw new Error("replay projection");
    expect(replayed.projects.map((entry) => entry.project)).toContainEqual(P1);
    const checkpointAfterRestart = await w.production.buildCurrentCampaignCheckpoint("C");
    if (checkpointAfterRestart.state !== "known") throw new Error("checkpoint restart");
    expect(checkpointAfterRestart.value).toEqual(checkpointBefore.value);

    // 9–10. The world changes while DORMANT; a real watch triggers.
    state.epoch = 2;
    state.claimStatus = "CONTRADICTED";
    state.signal = true;
    const watchId = dormant.watchIds[0]!;
    await w.prospective.recordTrigger({ campaignId: "C", watchId, cause: "signal set" });

    // 11. DORMANT → WAKING; a second beginWake yields no W2.
    const start = await w.production.beginWake({ campaignId: "C", cause: { kind: "watch", watchId } });
    if (start.status !== "started") throw new Error(`start ${start.status}`);
    const W1 = start.wakeCycleId;
    expect(await w.production.resumeWake("C")).toEqual({ status: "in_progress", wakeCycleId: W1 });

    // 12–14. Disabled / unknown observers block reconciliation with ZERO writes.
    for (const channel of ["error", "unknown"] as const) {
      state.channel = channel;
      const before = (await w.store.replay("C")).length;
      const blocked = await w.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: W1, wakeCause: { kind: "watch", watchId } });
      expect(blocked.status).toBe("reconciliation_incomplete");
      expect((await w.store.replay("C")).length).toBe(before);
    }
    state.channel = "known";
    state.claimStatus = "unknown";
    const evidenceBlocked = await w.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: W1, wakeCause: { kind: "watch", watchId } });
    expect(evidenceBlocked.status).toBe("reconciliation_incomplete");
    state.claimStatus = "CONTRADICTED";

    // 15. Successful observation: E2, Q1 standing, exact P1 ref + changed Work standing, real trigger.
    const observed = await w.production.observeCurrentWorld({ campaignId: "C", wakeCycle: W1, wakeCause: { kind: "watch", watchId } });
    if (observed.status !== "complete") throw new Error(observed.detail);
    expect(observed.snapshot.institutionEpoch.epoch).toBe(2);
    expect(observed.snapshot.projectObservations).toEqual([{ project: P1, standing: "completed" }]);
    expect(observed.snapshot.triggeredWatchIds).toContain(watchId);
    expect(state.inspected.some((candidate) => JSON.stringify(candidate) === JSON.stringify(P1))).toBe(true);

    // 16–17. Reconcile R1 and validate canonical belief provenance.
    const previous = currentBeliefStateOf("C", (await w.store.replay("C")).filter((e) => e.type === "BELIEF_REVISED").map((e) => (e.payload as { revision: BeliefRevision }).revision));
    const reconciled = await w.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: W1, wakeCause: { kind: "watch", watchId } });
    if (reconciled.status !== "reconciled") throw new Error(`reconcile ${reconciled.status}`);
    const R1: CampaignReconciliationReport = reconciled.report;
    expect(R1.previousBeliefStateDigest).toBe(previous.digest);
    expect(R1.resultingBeliefStateDigest).toBe((await w.campaign.currentBeliefState("C")).digest);

    // 18. Unchanged refresh is a zero-write no-op.
    const beforeRefresh = (await w.store.replay("C")).length;
    const refresh = await w.campaign.refreshCampaignBeliefs("C");
    expect(refresh.status).toBe("refreshed");
    expect((await w.store.replay("C")).length).toBe(beforeRefresh);

    // 19. Compiler context reflects the current reconciled state.
    const contextEvents = await w.store.replay("C");
    expect(contextEvents.filter((e) => e.type === "RECONCILIATION_COMMITTED")).toHaveLength(1);

    // 20. Historical P1 cannot satisfy W1.
    await expect(
      w.production.completeWakeWithAction({
        campaignId: "C",
        wakeCycleId: W1,
        action: { kind: "project", wakeCycleId: W1, compilationId: "cmp-historical", reconciliationDigest: R1.digest, admissionKey: "adm-historical", project: P1 },
      }),
    ).rejects.toBeInstanceOf(CampaignStoreError);

    // 21–24. Compile K1, crash after Work admit, recover the SAME P2, finalize once.
    state.nextProject = P2;
    state.crashAfterAdmit = true;
    const compileK1 = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compileK1.status !== "compiled") throw new Error(compileK1.detail);
    expect(compileK1.compiled.wake?.wakeCycleId).toBe(W1);
    expect(compileK1.compiled.wake?.reconciliationDigest).toBe(R1.digest);
    await expect(w.compiler.admitCompiledAction({ campaignId: "C", compiled: compileK1.compiled })).rejects.toThrow(/simulated crash/);
    const recovered = await w.compiler.admitCompiledAction({ campaignId: "C", compiled: compileK1.compiled });
    if (recovered.status !== "admitted" || recovered.completion === null) throw new Error("P2 recovery");
    expect(recovered.project).toEqual(P2);
    expect(recovered.project).not.toEqual(P1);
    expect((await w.store.replay("C")).filter((e) => e.type === "PROJECT_ADMITTED").map((e) => (e.payload as { project: CampaignProjectRef }).project)).toEqual([P1, P2]);

    // 25. ACTIVE only after the bound completion.
    await w.production.completeWakeWithAction({ campaignId: "C", wakeCycleId: W1, action: recovered.completion });
    expect(await w.production.lifecycleState("C")).toBe("ACTIVE");
    const completions = (await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED");
    expect(completions).toHaveLength(1);

    // 26. P1 remains a historical linked Project.
    const historical = projectLinkedProjects(await w.store.replay("C"));
    if (historical.status !== "known") throw new Error("historical projection");
    expect(historical.projects.map((entry) => entry.project)).toContainEqual(P1);

    // 27. Second cycle: WAIT → DORMANT → W2 → R2 → compiler chooses WAIT.
    const dormant2 = await w.production.admitWait({
      campaignId: "C",
      reason: "wait again",
      watches: [{ condition: { kind: "external_signal", signalKey: "sig3" }, reason: "wake again" }],
    });
    if (dormant2.status !== "dormant") throw new Error("dormant2");
    state.signal = false;
    const start2 = await w.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "cli", reason: "operator" } });
    if (start2.status !== "started") throw new Error("start2");
    const W2 = start2.wakeCycleId;
    const rec2 = await w.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: W2, wakeCause: { kind: "manual", signalId: "cli", reason: "operator" } });
    if (rec2.status !== "reconciled" && rec2.status !== "no_active_commitment") throw new Error("reconcile2");
    const R2 = rec2.report;

    // 28. A historical WAIT admission cannot complete W2.
    await expect(
      w.production.completeWakeWithAction({
        campaignId: "C",
        wakeCycleId: W2,
        action: { kind: "wait", wakeCycleId: W2, compilationId: "cmp-old", reconciliationDigest: R1.digest, waitAdmissionId: "waitad-old", checkpointDigest: "f".repeat(64) },
      }),
    ).rejects.toBeInstanceOf(CampaignStoreError);

    // 29–30. Compile K2 (WAIT), admit Q2 bound to K2/W2/R2, become DORMANT.
    state.proposal = "wait";
    const compileK2 = await w.compiler.compileNextAction({ campaignId: "C" });
    if (compileK2.status !== "compiled") throw new Error(compileK2.detail);
    if (compileK2.compiled.action.kind !== "wait") throw new Error("expected wait candidate");
    const watchesBefore = (await w.store.replay("C")).filter((e) => e.type === "WATCH_INSTALLED").length;
    const waited = await w.nextAction.admitCompiledNextAction({ campaignId: "C", compiled: compileK2.compiled });
    if (waited.status !== "admitted") throw new Error(`wait admission ${waited.status}: ${waited.detail}`);
    expect(waited.lifecycle).toBe("DORMANT");
    if (waited.action?.kind !== "wait") throw new Error("expected wait completion");
    expect(await w.production.lifecycleState("C")).toBe("DORMANT");
    expect((await w.store.replay("C")).filter((e) => e.type === "WATCH_INSTALLED").length).toBeGreaterThan(watchesBefore);
    expect((await w.store.replay("C")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(2);
    // The second WAIT used a NEW WaitAdmission bound to K2/W2/R2.
    const waitAdmissions = (await w.store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED").map((e) => (e.payload as { waitAdmission: { compilationId: string; wakeCycleId: string; reconciliationDigest: string } }).waitAdmission);
    expect(waitAdmissions).toHaveLength(1);
    expect(waitAdmissions[0]!.compilationId).toBe(compileK2.compiled.compilationId);
    expect(waitAdmissions[0]!.wakeCycleId).toBe(W2);
    expect(waitAdmissions[0]!.reconciliationDigest).toBe(R2.digest);

    // Durable replay reconstructs the full provenance chain.
    expect(eventTypes(await w.store.replay("C"))).toEqual(expect.arrayContaining(["PROJECT_ADMITTED", "WAKE_CYCLE_COMPLETED", "WAIT_ADMITTED", "RECONCILIATION_COMMITTED"]));
    expect(inFlightWake(await w.store.replay("C"))).toBeUndefined();
    w.store.close();
  });
});
