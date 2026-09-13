/**
 * G10-G6 CampaignCompiler machine proofs (§183).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
  makeCompilerService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type {
  CampaignPlanningContext,
  CampaignProjectRef,
  CampaignWorkAdmissionPort,
  CampaignCompilerPort,
} from "../src/campaign/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const EVIDENCE = {
  inspectClaim: async (ref: { claimId: string }) => ({
    state: "known" as const,
    value: materializeClaimStandingSnapshot({
      claim: ref,
      status: "SUPPORTED" as const,
      supportingEvidenceIds: ["ev-1"],
      contradictingEvidenceIds: [],
      provenanceDigest: "prov",
    }),
  }),
};

const PROPOSAL = { goal: "test the hypothesis", changeClass: "metadata_only", tasks: [{ title: "run experiment", dependsOn: [], writePaths: ["experiments/out.txt"] }] };

function workPort() {
  const projects = new Map<string, CampaignProjectRef>();
  const digests = new Map<string, string>();
  const calls: string[] = [];
  let n = 0;
  const port: CampaignWorkAdmissionPort = {
    admit: async ({ admissionKey, proposal }) => {
      const digest = JSON.stringify(proposal);
      const existing = projects.get(admissionKey);
      if (existing !== undefined) {
        if (digests.get(admissionKey) !== digest) throw new Error("admission conflict");
        return existing;
      }
      calls.push(admissionKey);
      const project: CampaignProjectRef = { projectId: `p-${++n}`, revision: 0, digest: "a".repeat(64) };
      projects.set(admissionKey, project);
      digests.set(admissionKey, digest);
      return project;
    },
  };
  return { port, calls, projects };
}

function world(compiler?: CampaignCompilerPort) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  let k = 0;
  let w = 0;
  const campaign = makeCampaignService({
    institutions: TEST_INSTITUTIONS, store, allocateCommitmentId: () => `cc-${++c}`, evidence: EVIDENCE });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z" });
  void prospective;
  const work = workPort();
  const buildContext = async (campaignId: string): Promise<CampaignPlanningContext> => {
    const definition = await campaign.definition(campaignId);
    if (definition === undefined) throw new Error("unknown campaign");
    const commitments = await campaign.commitmentStates(campaignId);
    const hypotheses = await campaign.hypotheses(campaignId);
    const beliefState = await campaign.currentBeliefState(campaignId);
    const events = await store.replay(campaignId);
    const watchIds = events
      .filter((event) => event.type === "WATCH_INSTALLED")
      .map((event) => (event.payload as { watch: { watchId: string } }).watch.watchId);
    return {
      campaignId,
      institutionId: definition.institutionId,
      activeCommitments: commitments.filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
      activeHypotheses: hypotheses.filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
      beliefState,
      recentObservationRefs: [],
      interventionSummaries: [],
      institutionEpoch: null,
      activeWatchIds: watchIds,
      reconciliationDigest: null,
      wakeCycleId: null,
    };
  };
  const compilerService = makeCompilerService({
    store,
    buildContext,
    allocateCompilationId: () => `cmp-${++k}`,
    compiler,
    work: work.port,
  });
  return { store, campaign, compilerService, work };
}

async function ready(w: ReturnType<typeof world>, claimId = "claim-1") {
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  const knowledge = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H", claimId });
  if (knowledge.state !== "known") throw new Error("hypothesis not registered");
  return knowledge.value;
}

describe("G6-M01/M02/M03/M04: compiler output is a candidate; strict parser", () => {
  it("a valid Project candidate is produced without mutating the Campaign", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    const hypothesis = await ready(w);
    const basisBefore = await w.store.basis("camp-1");
    const result = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    expect(result.compiled.action.kind).toBe("project");
    expect(result.compiled.campaignBasisDigest).toBe(basisBefore!.chainDigest);
    expect(await w.store.basis("camp-1")).toEqual(basisBefore);
    expect(hypothesis.hypothesisId).toBeTruthy();
  });

  it("an unknown action kind is rejected and mutates nothing", async () => {
    const w = world({ compile: async () => ({ kind: "terminate" }) });
    await ready(w);
    const basisBefore = await w.store.basis("camp-1");
    const result = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    expect(result.status).toBe("compilation_failed");
    expect(await w.store.basis("camp-1")).toEqual(basisBefore);
  });

  it("an invalid ProjectProposal is rejected and creates no Work", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: { goal: "", changeClass: "metadata_only", tasks: [] }, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    await ready(w);
    const result = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    expect(result.status).toBe("compilation_failed");
    expect(w.work.calls).toHaveLength(0);
    // §166: definition_id stays Work lineage — the compiler does not inject it.
    expect(strip(SRC("compiler.ts"))).not.toMatch(/definition_id|definitionId\s*[:=]/);
  });
});

describe("G6-M06/M07/M08: freshness and stable admission key", () => {
  it("a stale candidate is refused; a fresh one has a stable admission key", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    await ready(w);
    const compiled = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("expected compiled");
    await w.campaign.openCommitment({ campaignId: "camp-1", statement: "new" });
    const stale = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(stale.status).toBe("stale");
    expect(w.work.calls).toHaveLength(0);
  });
});

describe("G6-M09/M10/M11/M12: idempotent admission saga", () => {
  it("retrying the same admission produces one Project link; a changed candidate under the same key fails closed", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    await ready(w);
    const compiled = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("expected compiled");

    const first = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(first.status).toBe("admitted");
    const second = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(second.status).toBe("admitted");
    if (first.status === "admitted" && second.status === "admitted") {
      expect(second.project).toEqual(first.project);
    }
    expect(w.work.calls).toHaveLength(1);
    expect((await w.compilerService.admissions("camp-1"))).toHaveLength(1);

    // Same key (compilationId + basis) but a different candidate → conflict.
    const tampered = {
      ...compiled.compiled,
      action: { ...compiled.compiled.action, proposal: { ...PROPOSAL, goal: "different" } },
    };
    const conflict = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: tampered as typeof compiled.compiled });
    expect(conflict.status).toBe("conflict");
  });

  it("a crash after Work admission recovers by re-calling with the same key", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    await ready(w);
    const compiled = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("expected compiled");
    // Simulate: Work admitted, process crashed BEFORE PROJECT_ADMITTED.
    const admissionKey = `adm-${(await import("../src/schema/canonical.js")).canonicalDigest({ domain: "palimpsest.campaign-admission.v1", compilationId: compiled.compiled.compilationId, campaignBasisDigest: compiled.compiled.campaignBasisDigest, wakeCycleId: null, reconciliationDigest: null }).slice(0, 24)}`;
    const preAdmitted = await w.work.port.admit({ admissionKey, proposal: compiled.compiled.action.kind === "project" ? compiled.compiled.action.proposal : {} });
    expect(w.work.calls).toHaveLength(1);

    const recovered = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(recovered.status).toBe("admitted");
    if (recovered.status === "admitted") expect(recovered.project.projectId).toBe(preAdmitted.projectId);
    expect(w.work.calls).toHaveLength(1); // no new Work admission
    expect((await w.compilerService.admissions("camp-1"))).toHaveLength(1);
  });
});

describe("G6-M16/M18: compiler never sets belief; scheduler untouched", () => {
  it("belief is unchanged by compile/admit and the module imports no scheduler", async () => {
    const w = world({ compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) });
    await ready(w);
    const beliefBefore = (await w.campaign.currentBeliefState("camp-1")).digest;
    const compiled = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error("expected compiled");
    await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect((await w.campaign.currentBeliefState("camp-1")).digest).toBe(beliefBefore);
    expect((await w.store.replay("camp-1")).some((event) => event.type === "CAMPAIGN_TERMINATED")).toBe(false);
    const code = strip(SRC("compiler.ts"));
    expect(code).not.toMatch(/scheduler|attemptExecutor|ordarium|effects\//i);
  });
});

describe("G6: WAIT candidates are not admitted through the Work path", () => {
  it("a WAIT action is routed elsewhere and never touches Work", async () => {
    const w = world({ compile: async () => ({ kind: "wait", reason: "nothing useful", watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }] }) });
    await ready(w);
    const compiled = await w.compilerService.compileNextAction({ campaignId: "camp-1" });
    expect(compiled.status).toBe("compiled");
    if (compiled.status !== "compiled") return;
    expect(compiled.compiled.action.kind).toBe("wait");
    const result = await w.compilerService.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(result.status).toBe("conflict");
    expect(w.work.calls).toHaveLength(0);
  });
});

const TEST_INSTITUTIONS = {
  inspectEpoch: async () => ({
    state: "known" as const,
    value: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) },
  }),
};
