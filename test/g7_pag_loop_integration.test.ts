/**
 * G10-G7 full PAG loop integration proofs (§185–§233).
 *
 *   G7-E2E   long-horizon loop: create → hypothesis → belief → intervention →
 *            WAIT/dormant → wake → reconcile → compile → admit → ACTIVE
 *   G7-EVID  EvidenceHistory ≠ CurrentBeliefState
 *   G7-MATRIX identity/authority/store separation
 *   G7-REG   Work/runtime/federation non-regression
 *   G7-ORTHO persistence orthogonality
 *   G7-NODUP no Evidence-body duplication; context independence
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
  makeCompilerService,
  makeInterventionService,
  makeLifecycleService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type { CampaignClaimStatus, CampaignEvidencePort, CampaignProjectRef } from "../src/campaign/index.js";
import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockHost } from "./helpers.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PROPOSAL = { goal: "test", changeClass: "metadata_only", tasks: [{ title: "run", dependsOn: [], writePaths: ["out.txt"] }] };
const EPOCH0 = { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) };

function world() {
  const store = new SqliteCampaignStore(":memory:");
  const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", "SUPPORTED"]]);
  const evidence: CampaignEvidencePort = {
    inspectClaim: async (ref) => {
      const status = standings.get(ref.claimId);
      if (status === undefined || status === "unknown") return { state: "unknown", detail: "unknown" };
      return {
        state: "known",
        value: materializeClaimStandingSnapshot({ claim: ref, status, supportingEvidenceIds: status === "SUPPORTED" ? ["e1"] : [], contradictingEvidenceIds: status === "CONTRADICTED" ? ["e2"] : [], provenanceDigest: `p-${status}` }),
      };
    },
  };
  let c = 0;
  let w = 0;
  let k = 0;
  let i = 0;
  const campaign = makeCampaignService({
    institutions: TEST_INSTITUTIONS, store, allocateCommitmentId: () => `cc-${++c}`, evidence });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z", evidence, projects: { inspectProject: async () => ({ state: "known", value: "completed" }) } });
  const lifecycle = makeLifecycleService({ store, allocateWakeCycleId: () => `wc-${++k}`, institutions: { inspectEpoch: async () => ({ state: "known", value: EPOCH0 }) } });
  const interventions = makeInterventionService({ store, allocateInterventionId: () => `iv-${++i}`, work: { inspectProject: async () => ({ state: "known", value: "completed" }) } });
  let cmp = 0;
  const admitted = new Map<string, CampaignProjectRef>();
  const compiler = makeCompilerService({
    store,
    allocateCompilationId: () => `cmp-${++cmp}`,
    compiler: { compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) },
    work: {
      admit: async ({ admissionKey }) => {
        const existing = admitted.get(admissionKey);
        if (existing !== undefined) return existing;
        const project = { projectId: "p1", revision: 0, digest: "a".repeat(64) };
        admitted.set(admissionKey, project);
        return project;
      },
    },
    buildContext: async (campaignId) => {
      const definition = await campaign.definition(campaignId);
      if (definition === undefined) throw new Error("unknown campaign");
      const commitments = await campaign.commitmentStates(campaignId);
      const hypotheses = await campaign.hypotheses(campaignId);
      return {
        campaignId,
        institutionId: definition.institutionId,
        activeCommitments: commitments.filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
        activeHypotheses: hypotheses.filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
        beliefState: await campaign.currentBeliefState(campaignId),
        recentObservationRefs: [],
        interventionSummaries: [],
        institutionEpoch: null,
        activeWatchIds: [],
        reconciliationDigest: null,
      };
    },
  });
  return { store, standings, campaign, prospective, lifecycle, interventions, compiler };
}

function checkpoint(store: SqliteCampaignStore) {
  return {
    campaignId: "camp-1",
    campaignBasisThroughSeq: 1,
    campaignBasisDigest: "b".repeat(64),
    institutionEpoch: EPOCH0,
    beliefStateDigest: "d".repeat(64),
    activeCommitmentIds: ["cc-1"],
    activeHypothesisIds: [],
    activeWatchIds: [],
    knownProjectRefs: [],
  };
  void store;
}

describe("G7-E2E/G7-EVID: the full long-horizon loop", () => {
  it("create → belief → intervention → WAIT/dormant → wake → reconcile → compile → admit → ACTIVE", async () => {
    const w = world();
    await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    const hypothesis = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H", claimId: "claim-1" });
    if (hypothesis.state !== "known") throw new Error("hypothesis not registered");
    const refreshed = await w.campaign.refreshCampaignBeliefs("camp-1");
    expect(refreshed.status).toBe("refreshed");

    // Intervention: completed operation + refuting evidence.
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: { projectId: "p1", revision: 0, digest: "a".repeat(64) },
      purpose: "test",
      targetHypothesisIds: [hypothesis.value.hypothesisId],
    });
    await w.interventions.observeOperational(intervention.interventionId);
    w.standings.set("claim-1", "CONTRADICTED");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    const assessed = await w.interventions.assessEpistemic(intervention.interventionId);
    expect(assessed.aggregate).toBe("refuting");

    // Historical observation O1 (supported) survives while belief is contradicted.
    const observations = (await w.store.replay("camp-1")).filter((event) => event.type === "EVIDENCE_OBSERVED");
    expect(observations.length).toBeGreaterThanOrEqual(2);
    expect((await w.campaign.currentBeliefState("camp-1")).entries[0]!.standing).toBe("contradicted");

    // WAIT → dormancy.
    await w.prospective.wait({
      campaignId: "camp-1",
      reason: "no useful action now",
      watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
    });
    await w.lifecycle.beginDormancy({ campaignId: "camp-1", checkpoint: checkpoint(w.store), reason: "wait" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("DORMANT");

    // Wake → continuity check → reconcile.
    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" });
    const observed = await w.lifecycle.observeWorld({ campaignId: "camp-1", wakeCycleId });
    if (observed.status !== "complete") throw new Error("expected complete world observation");
    await w.lifecycle.reconcile({ campaignId: "camp-1", wakeCycleId, snapshot: observed.snapshot });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("RECONCILING");

    // Compile a NEW action from the reconciled basis and admit it.
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    if (compiled.status !== "compiled") throw new Error(compiled.detail);
    const admission = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(admission.status).toBe("admitted");

    await w.lifecycle.completeWake({ campaignId: "camp-1", wakeCycleId, nextAction: "project" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("ACTIVE");
    // CampaignId survived every change.
    expect((await w.campaign.definition("camp-1"))!.campaignId).toBe("camp-1");
  });
});

describe("G7-MATRIX: identity / authority / store separation", () => {
  it("campaign modules import no Evidence/Work implementation and no effect authority", () => {
    for (const file of ["compiler.ts", "lifecycle.ts", "prospective.ts", "intervention.ts"]) {
      const code = strip(SRC(`campaign/${file}`));
      expect(code).not.toMatch(/ordarium|effects\//i);
      expect(code).not.toMatch(/evidence\/index|state\/index|scheduler\//i);
    }
  });
});

describe("G7-REG: Work / runtime / federation non-regression", () => {
  it("nothing downstream imports campaign, and install without a campaign store is unchanged", () => {
    for (const file of ["scheduler/scheduler.ts", "runtime/realize.ts", "federation/federation_service.ts", "organization/store.ts", "institution/store.ts"]) {
      expect(strip(SRC(file))).not.toMatch(/campaign\/index|campaign\.js/);
    }
    const root = SRC("index.ts");
    expect(root).not.toMatch(/campaign/);
    const bare = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-g7-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-g7-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
    });
    expect(bare.campaign).toBeUndefined();

    const store = new SqliteCampaignStore(":memory:");
    const withCampaign = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-g7b-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-g7b-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
      campaignStore: store,
      campaignClock: () => "2026-01-01T00:00:00Z",
      campaignInstitutionEpochPort: {
        inspectEpoch: async () => ({
          state: "known" as const,
          value: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) },
        }),
      },
    });
    expect(withCampaign.campaign?.store).toBe(store);
    expect(typeof withCampaign.campaign?.campaign.createCampaign).toBe("function");
    expect(withCampaign.campaign?.compiler).toBeUndefined(); // no compiler port → absent, never stubbed
  });
});

describe("G7-ORTHO/G7-NODUP: orthogonality and no Evidence duplication", () => {
  it("campaign + no institution/federation works; the store holds no evidence bodies", async () => {
    const w = world();
    await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    const hypothesis = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H", claimId: "claim-1" });
    if (hypothesis.state !== "known") throw new Error("hypothesis not registered");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    const serialized = JSON.stringify(await w.store.replay("camp-1"));
    expect(serialized).not.toMatch(/evidenceBody|experiment|config node|data node/i);
    // Context independence: destroying derived context is irrelevant here (none stored).
    expect(strip(SRC("campaign/lifecycle.ts"))).not.toMatch(/context|summary/i);
  });
});

const TEST_INSTITUTIONS = {
  inspectEpoch: async () => ({
    state: "known" as const,
    value: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) },
  }),
};
