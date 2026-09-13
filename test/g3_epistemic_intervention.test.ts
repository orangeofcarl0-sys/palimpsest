/**
 * G10-G3 epistemic intervention machine proofs (§101).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
  makeInterventionService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type {
  CampaignClaimStatus,
  CampaignEvidencePort,
  CampaignWorkObservationPort,
  ProjectOperationalStanding,
  WorkKnowledge,
} from "../src/campaign/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function evidencePort(standings: Map<string, CampaignClaimStatus | "unknown">): CampaignEvidencePort {
  return {
    inspectClaim: async (ref) => {
      const status = standings.get(ref.claimId);
      if (status === undefined || status === "unknown") return { state: "unknown", detail: "unknown" };
      return {
        state: "known",
        value: materializeClaimStandingSnapshot({
          claim: ref,
          status,
          supportingEvidenceIds: status === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: status === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${status}`,
        }),
      };
    },
  };
}

function workPort(standing: WorkKnowledge<ProjectOperationalStanding>): CampaignWorkObservationPort {
  return { inspectProject: async () => standing };
}

function world(standings: Map<string, CampaignClaimStatus | "unknown">, work: CampaignWorkObservationPort) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  let i = 0;
  const campaign = makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++c}`,
    evidence: evidencePort(standings),
  });
  const interventions = makeInterventionService({ store, allocateInterventionId: () => `iv-${++i}`, work });
  return { store, campaign, interventions };
}

const PROJECT = { projectId: "p1", revision: 0, digest: "d".repeat(64) };

async function setup(work: CampaignWorkObservationPort, claimStatus: CampaignClaimStatus = "SUPPORTED") {
  const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", claimStatus]]);
  const w = world(standings, work);
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  const hypothesis = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H", claimId: "claim-1" });
  if (hypothesis.state !== "known") throw new Error("hypothesis not registered");
  await w.campaign.refreshCampaignBeliefs("camp-1");
  return { ...w, standings, hypothesis: hypothesis.value };
}

describe("G3-M01/M02: intervention identity firewalls", () => {
  it("intervention is not an Attempt and holds no Work internals", () => {
    const code = strip(SRC("intervention.ts"));
    expect(code).not.toMatch(/attemptId|attempt_id|scheduler|workgraph|projectir/i);
    expect(code).not.toMatch(/ordarium|effects\//i);
  });
});

describe("G3-M03/M04/M05: operational outcome is observed and never sets belief", () => {
  it("an unknown project state stays unknown and does not touch belief", async () => {
    const w = await setup(workPort({ state: "unknown", detail: "work store unavailable" }));
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "test",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    const before = (await w.campaign.currentBeliefState("camp-1")).digest;
    const knowledge = await w.interventions.observeOperational(intervention.interventionId);
    expect(knowledge.state).toBe("unknown");
    expect((await w.campaign.currentBeliefState("camp-1")).digest).toBe(before);
    const state = (await w.interventions.interventions("camp-1"))[0]!;
    expect(state.knowledge).toBe("unobserved");
    expect(state.operational).toBeNull();
  });

  it("a failed operational outcome does not mutate belief", async () => {
    const w = await setup(workPort({ state: "known", value: "failed" }));
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "test",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    const before = (await w.campaign.currentBeliefState("camp-1")).digest;
    const knowledge = await w.interventions.observeOperational(intervention.interventionId);
    expect(knowledge).toEqual({ state: "known", value: "failed" });
    expect((await w.campaign.currentBeliefState("camp-1")).digest).toBe(before);
  });
});

describe("G3-M06/M07: completed+refuting and failed+useful are both valid", () => {
  it("operational completion with a refuted hypothesis records a refuting epistemic outcome", async () => {
    const w = await setup(workPort({ state: "known", value: "completed" }));
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "test",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    await w.interventions.observeOperational(intervention.interventionId);
    // Only admitted evidence changes belief.
    w.standings.set("claim-1", "CONTRADICTED");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    const assessed = await w.interventions.assessEpistemic(intervention.interventionId);
    expect(assessed.classifications[0]).toMatchObject({ before: "supported", after: "contradicted", classification: "refuting" });
    expect(assessed.aggregate).toBe("refuting");
  });

  it("a failed Project that still changed the belief records the actual epistemic transition", async () => {
    const w = await setup(workPort({ state: "known", value: "failed" }));
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "explore",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    await w.interventions.observeOperational(intervention.interventionId);
    w.standings.set("claim-1", "CONTRADICTED");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    const assessed = await w.interventions.assessEpistemic(intervention.interventionId);
    expect(assessed.classifications[0]!.classification).toBe("refuting");
    const state = (await w.interventions.interventions("camp-1"))[0]!;
    expect(state.operational).toBe("failed");
    expect(state.epistemic).toBe("refuting");
  });
});

describe("G3-M08: Project failure does not terminate the Campaign", () => {
  it("the campaign remains alive and a second intervention is legal", async () => {
    const w = await setup(workPort({ state: "known", value: "failed" }));
    const first = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "test",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    await w.interventions.observeOperational(first.interventionId);
    expect(await w.campaign.definition("camp-1")).toBeDefined();
    const second = await w.interventions.register({
      campaignId: "camp-1",
      project: { projectId: "p2", revision: 0, digest: "e".repeat(64) },
      purpose: "test",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    expect(second.interventionId).not.toBe(first.interventionId);
    expect((await w.interventions.interventions("camp-1")).length).toBe(2);
  });
});

describe("G3-M09/M10: immutable history and recorded basis", () => {
  it("intervention history is append-only and the pre-belief basis is recorded", async () => {
    const w = await setup(workPort({ state: "known", value: "completed" }));
    const intervention = await w.interventions.register({
      campaignId: "camp-1",
      project: PROJECT,
      purpose: "measure",
      targetHypothesisIds: [w.hypothesis.hypothesisId],
    });
    expect(intervention.preBeliefStandings[0]).toEqual({ hypothesisId: w.hypothesis.hypothesisId, standing: "supported" });
    expect(intervention.preBeliefStateDigest).toMatch(/^[0-9a-f]{64}$/);
    await w.interventions.observeOperational(intervention.interventionId);
    const before = await w.store.basis("camp-1");
    w.standings.set("claim-1", "INCONCLUSIVE");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    await w.interventions.assessEpistemic(intervention.interventionId);
    const after = await w.store.basis("camp-1");
    expect(after!.throughSeq).toBeGreaterThan(before!.throughSeq);
    // The original registration event is unchanged in history.
    const registered = (await w.store.replay("camp-1")).filter((event) => event.type === "INTERVENTION_REGISTERED");
    expect((registered[0]!.payload as { intervention: { preBeliefStateDigest: string } }).intervention.preBeliefStateDigest).toBe(
      intervention.preBeliefStateDigest,
    );
  });
});
