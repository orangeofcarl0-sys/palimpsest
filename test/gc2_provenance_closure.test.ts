/**
 * G10-GC2 PAG provenance & wake-admission closure — machine proofs.
 *
 *   GC2-A exact CampaignProjectRef grounding
 *   GC2-B Work knowledge completeness
 *   GC2-C canonical BeliefState provenance
 *   GC2-D strict production-event parser closure
 *   GC2-E/H wake causal state machine
 *   GC2-F/G Project + WAIT admission bound to THIS wake
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

import {
  CampaignStoreError,
  SqliteCampaignStore,
  campaignProjectRefsEqual,
  committedReconciliationOf,
  currentBeliefStateOf,
  inFlightWake,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeInterventionService,
  makeNextActionAdmissionService,
  makeProspectiveService,
  materializeCampaignProjectRef,
  materializeClaimStandingSnapshot,
  parseAdmittedCampaignActionRef,
  parseCampaignCheckpoint,
  parseCampaignProjectRef,
  parseReconciliationReport,
  projectLinkedProjects,
  reconciliationDigestOf,
} from "../src/campaign/index.js";
import type {
  BeliefRevision,
  CampaignBeliefStanding,
  CampaignClaimStatus,
  CampaignProjectRef,
  ProjectOperationalStanding,
  WorkKnowledge,
} from "../src/campaign/index.js";
import type { InstitutionEpochRefLike } from "../src/campaign/index.js";

const EPOCH = (epoch = 1): InstitutionEpochRefLike => ({ institutionId: "inst-1", epoch, digest: `e${epoch}`.padEnd(64, "0") });
const PROPOSAL = { goal: "g", changeClass: "metadata_only", tasks: [{ title: "t", dependsOn: [], writePaths: ["o.txt"] }] };
const ref = (projectId: string, revision = 0, digest = "a".repeat(64)): CampaignProjectRef => ({ projectId, revision, digest });

interface WorldOptions {
  readonly withWork?: boolean;
  readonly claim?: () => CampaignClaimStatus | "unknown" | "error";
  readonly epoch?: () => WorkKnowledge<InstitutionEpochRefLike>;
  readonly project?: (ref: CampaignProjectRef) => WorkKnowledge<ProjectOperationalStanding>;
  readonly path?: string;
}

function world(options: WorldOptions = {}) {
  const store = new SqliteCampaignStore(options.path ?? ":memory:");
  const claimStatus = options.claim ?? (() => "SUPPORTED" as CampaignClaimStatus);
  const epoch = options.epoch ?? (() => ({ state: "known" as const, value: EPOCH() }));
  const institutions = { inspectEpoch: async (institutionId: string) => {
    const knowledge = epoch();
    return knowledge.state === "known" ? { state: "known" as const, value: { ...knowledge.value, institutionId } } : knowledge;
  } };
  const evidence = {
    inspectClaim: async (claim: { claimId: string }) => {
      const status = claimStatus();
      if (status === "unknown") return { state: "unknown" as const, detail: "unknown" };
      if (status === "error") return { state: "error" as const, detail: "error" };
      return {
        state: "known" as const,
        value: materializeClaimStandingSnapshot({
          claim,
          status,
          supportingEvidenceIds: status === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: status === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${status}`,
        }),
      };
    },
  };
  const inspected: CampaignProjectRef[] = [];
  const project = options.project ?? (() => ({ state: "known" as const, value: "running" as const }));
  const work = {
    inspectProject: async (candidate: CampaignProjectRef) => {
      inspected.push(candidate);
      return project(candidate);
    },
  };
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  let iv = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z", evidence, projects: work });
  const interventions = makeInterventionService({ store, allocateInterventionId: () => `iv-${++iv}`, work, evidence });
  const production = makeCampaignProductionService({
    store,
    institutions,
    evidence,
    ...(options.withWork === false ? {} : { work }),
    allocateWakeCycleId: () => `wc-${++k}`,
    allocateWatchId: () => `pw-${++w}`,
    allocateObservationId: () => `obs-${++o}`,
    allocateRevisionId: () => `br-${++r}`,
  });
  let admissionId = 0;
  const nextProject = { value: ref("p1") };
  const admittedByKey = new Map<string, CampaignProjectRef>();
  const workAdmission = {
    admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
      const existing = admittedByKey.get(admissionKey);
      if (existing !== undefined) return existing;
      const assigned = nextProject.value;
      admittedByKey.set(admissionKey, assigned);
      return assigned;
    },
  };
  const mode: { value: "project" | "wait" } = { value: "project" };
  const compiler = makeCompilerService({
    store,
    allocateCompilationId: () => `cmp-${++admissionId}`,
    compiler: {
      compile: async () =>
        mode.value === "project"
          ? { kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }
          : { kind: "wait", reason: "nothing useful now", watches: [{ condition: { kind: "external_signal", signalKey: "sig2" }, reason: "later" }] },
    },
    work: workAdmission,
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
  return { store, campaign, prospective, interventions, production, compiler, nextAction, mode, inspected, nextProject };
}

async function ready(w: ReturnType<typeof world>, claims: readonly string[] = ["claim-1"]) {
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  for (const claimId of claims) {
    const h = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: `H-${claimId}`, claimId });
    if (h.state !== "known") throw new Error("hypothesis not registered");
  }
  await w.campaign.refreshCampaignBeliefs("camp-1");
}

async function dormant(w: ReturnType<typeof world>) {
  const result = await w.production.admitWait({
    campaignId: "camp-1",
    reason: "wait",
    watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
  });
  if (result.status !== "dormant") throw new Error("expected dormant");
  return result;
}

async function waking(w: ReturnType<typeof world>): Promise<string> {
  const started = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
  if (started.status !== "started") throw new Error(`expected started, got ${started.status}`);
  return started.wakeCycleId;
}

/* ---------------------------------------------------------------- *
 * GC2-A — exact CampaignProjectRef grounding
 * ---------------------------------------------------------------- */

describe("GC2-A exact ProjectRef grounding", () => {
  it("A-M01/M05/M06/A-M07: PROJECT_ADMITTED ref (revision + digest) survives into the checkpoint", async () => {
    const w = world();
    await ready(w);
    w.nextProject.value = ref("p-alpha", 3, "c".repeat(64));
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error(compiled.detail);
    const admission = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    if (admission.status !== "admitted") throw new Error("expected admitted");

    const checkpoint = await w.production.buildCurrentCampaignCheckpoint("camp-1");
    expect(checkpoint.state).toBe("known");
    if (checkpoint.state !== "known") return;
    expect(checkpoint.value.knownProjectRefs).toHaveLength(1);
    expect(checkpoint.value.knownProjectRefs[0]).toEqual({ projectId: "p-alpha", revision: 3, digest: "c".repeat(64) });
    expect(JSON.stringify(checkpoint.value)).not.toMatch(/"revision":0,"digest":""/);
  });

  it("A-M02: an intervention ref is preserved exactly", async () => {
    const w = world();
    await ready(w);
    await w.interventions.register({ campaignId: "camp-1", project: ref("p-iv", 4, "d".repeat(64)), purpose: "measure", targetHypothesisIds: [] });
    const checkpoint = await w.production.buildCurrentCampaignCheckpoint("camp-1");
    if (checkpoint.state !== "known") throw new Error("expected known");
    expect(checkpoint.value.knownProjectRefs).toEqual([{ projectId: "p-iv", revision: 4, digest: "d".repeat(64) }]);
  });

  it("A-M03: the same exact ref seen through admission and intervention deduplicates with both sources", async () => {
    const w = world();
    await ready(w);
    w.nextProject.value = ref("p-same", 1, "e".repeat(64));
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    await w.interventions.register({ campaignId: "camp-1", project: ref("p-same", 1, "e".repeat(64)), purpose: "test", targetHypothesisIds: [] });
    const projection = projectLinkedProjects(await w.store.replay("camp-1"));
    if (projection.status !== "known") throw new Error("expected known");
    expect(projection.projects).toHaveLength(1);
    // The admission's own declared Intervention and the explicit registration
    // are distinct provenance sources; the exact ref is deduplicated.
    const kinds = new Set(projection.projects[0]!.sources.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(["admission", "intervention"]);
  });

  it("A-M04: conflicting refs for one projectId fail closed", async () => {
    const w = world();
    await ready(w);
    w.nextProject.value = ref("p-clash", 1, "a".repeat(64));
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    await w.interventions.register({ campaignId: "camp-1", project: ref("p-clash", 2, "b".repeat(64)), purpose: "test", targetHypothesisIds: [] });
    const projection = projectLinkedProjects(await w.store.replay("camp-1"));
    expect(projection.status).toBe("project_identity_conflict");
    const checkpoint = await w.production.buildCurrentCampaignCheckpoint("camp-1");
    expect(checkpoint.state).toBe("error");
  });

  it("A-M08: the exact ref survives a store restart/replay", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pal-gc2a-")), "campaign.sqlite");
    const w = world({ path });
    await ready(w);
    w.nextProject.value = ref("p-restart", 5, "f".repeat(64));
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    w.store.close();

    const reopened = new SqliteCampaignStore(path);
    const projection = projectLinkedProjects(await reopened.replay("camp-1"));
    if (projection.status !== "known") throw new Error("expected known");
    expect(projection.projects[0]!.project).toEqual({ projectId: "p-restart", revision: 5, digest: "f".repeat(64) });
    reopened.close();
  });
});

/* ---------------------------------------------------------------- *
 * GC2-B — Work knowledge completeness
 * ---------------------------------------------------------------- */

describe("GC2-B Work knowledge completeness", () => {
  it("B-M01: zero linked projects requires no Work source", async () => {
    const w = world({ withWork: false });
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    const observed = await w.production.observeCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(observed.status).toBe("complete");
  });

  it("B-M02: a linked project with no Work source is incomplete with zero writes", async () => {
    const w = world({ withWork: false });
    await ready(w);
    w.nextProject.value = ref("p1");
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    await dormant(w);
    const wc = await waking(w);
    const before = (await w.store.replay("camp-1")).length;
    const observed = await w.production.observeCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(observed.status).toBe("reconciliation_incomplete");
    expect((await w.store.replay("camp-1")).length).toBe(before);
  });

  it("B-M03/M04: unknown and error Project standings both block reconciliation", async () => {
    for (const kind of ["unknown", "error"] as const) {
      const w = world({ project: () => (kind === "unknown" ? { state: "unknown", detail: "x" } : { state: "error", detail: "x" }) });
      await ready(w);
      w.nextProject.value = ref("p1");
      const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
      if (compiled.status !== "compiled") throw new Error("compile");
      await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
      await dormant(w);
      const wc = await waking(w);
      const reconciled = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
      expect(reconciled.status).toBe("reconciliation_incomplete");
    }
  });

  it("B-M05/M06/M07: every linked project is observed at its exact ref and the standing is stored against it", async () => {
    const w = world({ project: (candidate) => ({ state: "known", value: candidate.projectId === "p-a" ? "completed" : "running" }) });
    await ready(w);
    w.nextProject.value = ref("p-b", 2, "b".repeat(64));
    const compiledB = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiledB.status !== "compiled") throw new Error("compile b");
    await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiledB.compiled });
    await w.interventions.register({ campaignId: "camp-1", project: ref("p-a", 7, "a".repeat(64)), purpose: "test", targetHypothesisIds: [] });
    await dormant(w);
    const wc = await waking(w);
    const observed = await w.production.observeCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    if (observed.status !== "complete") throw new Error(observed.detail);
    expect(observed.snapshot.projectObservations.map((entry) => entry.project)).toEqual([
      { projectId: "p-a", revision: 7, digest: "a".repeat(64) },
      { projectId: "p-b", revision: 2, digest: "b".repeat(64) },
    ]);
    expect(w.inspected.some((candidate) => campaignProjectRefsEqual(candidate, ref("p-a", 7, "a".repeat(64))))).toBe(true);
    expect(observed.snapshot.projectObservations.find((entry) => entry.project.projectId === "p-a")!.standing).toBe("completed");
  });
});

/* ---------------------------------------------------------------- *
 * GC2-C — canonical BeliefState provenance
 * ---------------------------------------------------------------- */

describe("GC2-C canonical BeliefState provenance", () => {
  it("C-M01/M02/M03: reconciliation digests are the canonical currentBeliefStateOf digests", async () => {
    let status: CampaignClaimStatus = "SUPPORTED";
    const w = world({ claim: () => status });
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    const eventsBefore = await w.store.replay("camp-1");
    const revisionsBefore = eventsBefore.filter((e) => e.type === "BELIEF_REVISED").map((e) => (e.payload as { revision: BeliefRevision }).revision);
    const previous = currentBeliefStateOf("camp-1", revisionsBefore);

    status = "CONTRADICTED";
    const reconciled = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    if (reconciled.status !== "reconciled") throw new Error("expected reconciled");
    const after = await w.campaign.currentBeliefState("camp-1");
    expect(reconciled.report.previousBeliefStateDigest).toBe(previous.digest);
    expect(reconciled.report.resultingBeliefStateDigest).toBe(after.digest);
    expect(reconciled.report.previousBeliefStateDigest).not.toBe("previous");
    expect(reconciled.report.previousBeliefStateDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(reconciled.report.digest).toBe(reconciliationDigestOf(reconciled.report));
  });

  it("C-M04: unchanged Evidence yields equal before/after digests", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    const reconciled = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    if (reconciled.status !== "reconciled") throw new Error("expected reconciled");
    expect(reconciled.report.changedHypothesisIds).toHaveLength(0);
    expect(reconciled.report.previousBeliefStateDigest).toBe(reconciled.report.resultingBeliefStateDigest);
  });

  it("C-M05/M06: changed Evidence updates the resulting digest and replay reconstructs it", async () => {
    let status: CampaignClaimStatus = "SUPPORTED";
    const w = world({ claim: () => status });
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    status = "CONTRADICTED";
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const replayed = currentBeliefStateOf(
      "camp-1",
      (await w.store.replay("camp-1")).filter((e) => e.type === "BELIEF_REVISED").map((e) => (e.payload as { revision: BeliefRevision }).revision),
    );
    expect(replayed.digest).toBe((await w.campaign.currentBeliefState("camp-1")).digest);
    expect(replayed.entries[0]!.standing).toBe<CampaignBeliefStanding>("contradicted");
  });

  it("C-M08: a corrupt belief digest in a report fails the parser", async () => {
    const good = {
      wakeCycleId: "wc-1",
      worldSnapshotDigest: "a".repeat(64),
      previousBeliefStateDigest: "b".repeat(64),
      resultingBeliefStateDigest: "c".repeat(64),
      activeCommitmentIds: ["cc-1"],
      changedHypothesisIds: [],
      digest: "",
    };
    const withDigest = { ...good, digest: reconciliationDigestOf(good) };
    expect(parseReconciliationReport(withDigest).digest).toBe(withDigest.digest);
    expect(() => parseReconciliationReport({ ...withDigest, resultingBeliefStateDigest: "d".repeat(64) })).toThrow(CampaignStoreError);
    expect(() => parseReconciliationReport({ ...withDigest, previousBeliefStateDigest: "previous" })).toThrow(CampaignStoreError);
  });
});

/* ---------------------------------------------------------------- *
 * GC2-D — strict production-event parser closure
 * ---------------------------------------------------------------- */

describe("GC2-D strict production parser closure", () => {
  const base = {
    wakeCycleId: "wc-1",
    worldSnapshotDigest: "a".repeat(64),
    previousBeliefStateDigest: "b".repeat(64),
    resultingBeliefStateDigest: "c".repeat(64),
    activeCommitmentIds: ["cc-1"],
    changedHypothesisIds: ["h-1"],
    digest: "",
  };
  const good = { ...base, digest: reconciliationDigestOf(base) };

  it("D-M01/M02/M03/M04: unknown fields, null/typed ids, and invalid digests are rejected", () => {
    expect(() => parseReconciliationReport({ ...good, extra: 1 })).toThrow(/unknown/);
    expect(() => parseReconciliationReport({ ...good, wakeCycleId: null })).toThrow(CampaignStoreError);
    expect(() => parseReconciliationReport({ ...good, wakeCycleId: 7 })).toThrow(CampaignStoreError);
    expect(() => parseReconciliationReport({ ...good, worldSnapshotDigest: "not-a-digest" })).toThrow(/digest/);
  });

  it("D-M05/M06: non-array and invalid-id arrays are rejected", () => {
    expect(() => parseReconciliationReport({ ...good, activeCommitmentIds: "cc-1" })).toThrow(/array/);
    expect(() => parseReconciliationReport({ ...good, activeCommitmentIds: [1] })).toThrow(CampaignStoreError);
    expect(() => parseReconciliationReport({ ...good, changedHypothesisIds: ["h-1", "h-1"] })).toThrow(/duplicates/);
  });

  it("D-M07/M08/M09: completion action refs are strictly nested", () => {
    const projectAction = {
      kind: "project",
      compilationId: "cmp-1",
      reconciliationDigest: "a".repeat(64),
      admissionKey: "adm-1",
      project: ref("p1"),
    };
    const parsed = parseAdmittedCampaignActionRef({ ...projectAction, wakeCycleId: "wc-1" });
    expect(parsed.kind).toBe("project");
    expect(() => parseAdmittedCampaignActionRef({ ...projectAction, wakeCycleId: "wc-1", kind: "explode" })).toThrow(CampaignStoreError);
    expect(() => parseAdmittedCampaignActionRef({ ...projectAction, wakeCycleId: "wc-1", project: { projectId: "p1" } })).toThrow(CampaignStoreError);
    expect(() => parseAdmittedCampaignActionRef({ ...projectAction, wakeCycleId: "wc-1", extra: true })).toThrow(/unknown/);
    expect(() => parseCampaignProjectRef({ projectId: "p1", revision: 0, digest: "" })).toThrow(CampaignStoreError);
    expect(() => parseCampaignProjectRef({ projectId: "p1", revision: 0, digest: "a".repeat(64), extra: 1 })).toThrow(/unknown/);
    expect(materializeCampaignProjectRef({ projectId: "p1", revision: 0, digest: "a".repeat(64) })).toEqual(ref("p1"));
  });

  it("D-M10: a malformed durable event fails replay closed", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pal-gc2d-")), "campaign.sqlite");
    const store = new SqliteCampaignStore(path);
    await store.genesis({
      definition: { schemaVersion: 1, campaignId: "camp-1", institutionId: "inst-1" },
      initialCommitment: { schemaVersion: 1, commitmentId: "cc-1", campaignId: "camp-1", statement: "s" },
    });
    store.close();
    // Corrupt the stored payload directly.
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path);
    db.prepare("UPDATE campaign_events SET payload_json = ? WHERE seq = 1").run(JSON.stringify({ commitment: { bad: true } }));
    db.close();
    const reopened = new SqliteCampaignStore(path);
    await expect(reopened.replay("camp-1")).rejects.toBeInstanceOf(CampaignStoreError);
    reopened.close();
  });
});

/* ---------------------------------------------------------------- *
 * GC2-E/H — wake causal state machine
 * ---------------------------------------------------------------- */

describe("GC2-E/H wake causality and gating", () => {
  it("E-M01/H-M01/M02: an arbitrary or stale wake cycle cannot be observed or reconciled", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    expect((await w.production.observeCurrentWorld({ campaignId: "camp-1", wakeCycle: "wc-other", wakeCause: { kind: "manual", signalId: "s", reason: "r" } })).status).toBe("wake_cycle_mismatch");
    expect((await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: "wc-other", wakeCause: { kind: "manual", signalId: "s", reason: "r" } })).status).toBe("wake_cycle_mismatch");
    expect((await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } })).status).toBe("reconciled");
  });

  it("E-M03/M04: a same-wake retry is idempotent and no second reconciliation is committed", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    const first = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const second = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    if (first.status !== "reconciled" || second.status !== "reconciled") throw new Error("expected reconciled");
    expect(second.report.digest).toBe(first.report.digest);
    expect((await w.store.replay("camp-1")).filter((e) => e.type === "RECONCILIATION_COMMITTED")).toHaveLength(1);
  });

  it("E-M05/M06/M07/M08: a compiled action is bound to its wake and stales under another wake", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error(compiled.detail);
    expect(compiled.compiled.wake?.wakeCycleId).toBe(wc);
    expect(compiled.compiled.wake?.reconciliationDigest).toMatch(/^[0-9a-f]{64}$/);
    // A changed belief basis stales the candidate before first admission.
    await w.campaign.abandonCommitment({ campaignId: "camp-1", commitmentId: "cc-1", reason: "changed" });
    const stale = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(stale.status).toBe("stale");
  });

  it("H-M03/M06: compilation requires a committed reconciliation during a wake", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    await waking(w); // WAKING, no reconciliation yet
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    expect(compiled.status).toBe("compilation_failed");
  });

  it("H-M07: a TERMINATED campaign refuses every wake progression", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const basis = (await w.store.basis("camp-1"))!;
    await w.store.appendAtomic({ expectedBasis: basis, events: [{ eventId: "evt-term", type: "CAMPAIGN_TERMINATED", payload: { reason: "done" } }] });
    const blocked = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(blocked.status).toBe("blocked");
  });
});

/* ---------------------------------------------------------------- *
 * GC2-F/G — admission bound to THIS wake
 * ---------------------------------------------------------------- */

describe("GC2-F/G admission binding", () => {
  it("F-M01/M04: a historical Project cannot complete a new wake; the bound Project can", async () => {
    const w = world({ project: (candidate) => ({ state: "known", value: candidate.projectId === "p-hist" ? "completed" : "running" }) });
    await ready(w);
    // A historical, wake-less admission of P1 while ACTIVE.
    w.nextProject.value = ref("p-hist", 0, "a".repeat(64));
    const historical = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (historical.status !== "compiled") throw new Error("compile hist");
    expect(historical.compiled.wake).toBeUndefined();
    const histAdmission = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: historical.compiled });
    if (histAdmission.status !== "admitted") throw new Error("hist admit");

    await dormant(w);
    const wc = await waking(w);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const reconciliation = committedReconciliationOf(await w.store.replay("camp-1"), wc)!;
    // The historical P1 exists but is not bound to THIS wake.
    await expect(
      w.production.completeWakeWithAction({
        campaignId: "camp-1",
        wakeCycleId: wc,
        action: { kind: "project", wakeCycleId: wc, compilationId: histAdmission.status === "admitted" ? "cmp-hist" : "x", reconciliationDigest: reconciliation.digest, admissionKey: "adm-hist", project: ref("p-hist", 0, "a".repeat(64)) },
      }),
    ).rejects.toThrow(/PROJECT_ADMITTED bound to THIS wake/);

    // A NEW project bound to THIS wake completes it.
    w.nextProject.value = ref("p-new", 1, "b".repeat(64));
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error(compiled.detail);
    const admission = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    if (admission.status !== "admitted" || admission.completion === null) throw new Error("expected completion");
    await w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: wc, action: admission.completion });
    expect(await w.production.lifecycleState("camp-1")).toBe("ACTIVE");
  });

  it("F-M05/M06/M07/M08: a crash after Work admission recovers with one Project and one completion", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    w.nextProject.value = ref("p2", 0, "d".repeat(64));
    const first = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    if (first.status !== "admitted" || first.completion === null) throw new Error("expected admitted");
    // Retry (simulated crash recovery) converges on the same Project.
    const retry = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    if (retry.status !== "admitted") throw new Error("expected retry admitted");
    expect(retry.project).toEqual(first.project);
    expect((await w.store.replay("camp-1")).filter((e) => e.type === "PROJECT_ADMITTED")).toHaveLength(1);
    await w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: wc, action: first.completion });
    await expect(w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: wc, action: first.completion })).resolves.toBeUndefined();
    expect((await w.store.replay("camp-1")).filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);
  });

  it("G-M01..G-M08: a WAIT wake installs a NEW grounded checkpoint and a historical WAIT cannot satisfy it", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc1 = await waking(w);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc1, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    // GC3: WAIT admission goes through the unified boundary with a compiled candidate.
    w.mode.value = "wait";
    const compiledWait = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiledWait.status !== "compiled") throw new Error(compiledWait.detail);
    const waited = await w.nextAction.admitCompiledNextAction({ campaignId: "camp-1", compiled: compiledWait.compiled });
    if (waited.status !== "admitted") throw new Error(`expected admitted, got ${waited.status}: ${waited.detail}`);
    expect(waited.lifecycle).toBe("DORMANT");
    if (waited.action?.kind !== "wait") throw new Error("expected wait completion");
    expect(await w.production.lifecycleState("camp-1")).toBe("DORMANT");
    const types = (await w.store.replay("camp-1")).map((e) => e.type);
    expect(types).toContain("WAIT_ADMITTED");
    expect(types.filter((t) => t === "WAKE_CYCLE_COMPLETED")).toHaveLength(1);
    // Second WAIT wake: a DIFFERENT candidate is a different admission.
    const wc2 = await waking(w);
    const already = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc2, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    if (already.status !== "reconciled") throw new Error("expected reconciled");
    const compiledWait2 = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiledWait2.status !== "compiled") throw new Error(compiledWait2.detail);
    const fresh = await w.nextAction.admitCompiledNextAction({ campaignId: "camp-1", compiled: compiledWait2.compiled });
    if (fresh.status !== "admitted") throw new Error(`expected admitted, got ${fresh.status}: ${fresh.detail}`);
    if (fresh.action?.kind === "wait" && waited.action?.kind === "wait") {
      expect(fresh.action.waitAdmissionId).not.toBe(waited.action.waitAdmissionId);
    }
  });
});

/* ---------------------------------------------------------------- *
 * Checkpoint parser canonicalization
 * ---------------------------------------------------------------- */

describe("GC2 checkpoint ordering and canonical parsing", () => {
  it("knownProjectRefs parse into canonical (projectId, revision, digest) order", () => {
    const parsed = parseCampaignCheckpoint({
      campaignId: "camp-1",
      campaignBasisThroughSeq: 4,
      campaignBasisDigest: "a".repeat(64),
      institutionEpoch: EPOCH(),
      beliefStateDigest: "b".repeat(64),
      activeCommitmentIds: ["cc-2", "cc-1"],
      activeHypothesisIds: [],
      activeWatchIds: [],
      knownProjectRefs: [ref("p-b", 2, "b".repeat(64)), ref("p-a", 3, "a".repeat(64)), ref("p-a", 1, "c".repeat(64))],
    });
    expect(parsed.activeCommitmentIds).toEqual(["cc-1", "cc-2"]);
    expect(parsed.knownProjectRefs.map((entry) => `${entry.projectId}:${entry.revision}`)).toEqual(["p-a:1", "p-a:3", "p-b:2"]);
  });
});

/* ---------------------------------------------------------------- *
 * Source firewall + remaining state-machine proofs
 * ---------------------------------------------------------------- */

describe("GC2 source firewall", () => {
  it("no campaign module synthesizes a fake ProjectRef, a placeholder belief digest, or a caller checkpoint", () => {
    for (const file of ["production.ts", "lifecycle.ts", "compiler.ts", "project.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/revision:\s*0\s*,\s*digest:\s*""/);
      expect(code).not.toMatch(/previousBeliefStateDigest:\s*"previous"/);
      expect(code).not.toMatch(/checkpoint:\s*caller/);
      expect(code).not.toMatch(/projectIds\s*\.\s*map/);
    }
  });

  it("H-M04/H-M08: a stale-wake candidate is refused and an incomplete wake survives restart", async () => {
    const w = world();
    await ready(w);
    await dormant(w);
    const wc = await waking(w);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: wc, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("compile");
    const elsewhere = { ...compiled.compiled, wake: { wakeCycleId: "wc-elsewhere", reconciliationDigest: compiled.compiled.wake!.reconciliationDigest } };
    expect((await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: elsewhere })).status).toBe("stale");
    // One incomplete wake invariant: resumeWake reports the same single cycle.
    expect(await w.production.resumeWake("camp-1")).toEqual({ status: "in_progress", wakeCycleId: wc });
    expect(inFlightWake(await w.store.replay("camp-1"))).toBe(wc);
  });
});
