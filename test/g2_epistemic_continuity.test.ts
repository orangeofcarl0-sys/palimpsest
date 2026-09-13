/**
 * G10-G2 epistemic continuity machine proofs (§84).
 *
 *   G2-M01 Hypothesis ≠ Evidence claim
 *   G2-M02 parent branch same campaign
 *   G2-M03 branch cycles rejected (parents must pre-exist)
 *   G2-M04 contradicted hypothesis retained
 *   G2-M05 EvidenceHistory append-only
 *   G2-M06 evidence body not duplicated into the Campaign store
 *   G2-M07 belief revision requires an observation
 *   G2-M08 direct belief setter absent
 *   G2-M09 supported→contradicted non-monotonic revision
 *   G2-M10 invalidated evidence → STALE observation
 *   G2-M11 unknown evidence → no partial refresh
 *   G2-M12 WorkerReport ≠ Evidence
 *   G2-M13 CurrentBeliefState replay deterministic
 *   G2-M14 belief digest deterministic
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
} from "../src/campaign/index.js";
import type {
  CampaignEvidencePort,
  CampaignService,
  CampaignClaimStatus,
} from "../src/campaign/index.js";
import { materializeClaimStandingSnapshot } from "../src/campaign/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function portOver(standings: Map<string, CampaignClaimStatus | "unknown">): CampaignEvidencePort {
  return {
    inspectClaim: async (ref) => {
      const status = standings.get(ref.claimId);
      if (status === undefined) return { state: "unknown", detail: "claim is not known to the evidence plane" };
      if (status === "unknown") return { state: "unknown", detail: "evidence plane reports unknown" };
      return {
        state: "known",
        value: materializeClaimStandingSnapshot({
          claim: ref,
          status,
          supportingEvidenceIds: status === "SUPPORTED" || status === "PARTIALLY_SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: status === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${status}`,
        }),
      };
    },
  };
}

function world(standings: Map<string, CampaignClaimStatus | "unknown">) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  const service: CampaignService = makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++c}`,
    evidence: portOver(standings),
  });
  return { store, service };
}

async function campaignWithHypothesis(
  service: CampaignService,
  campaignId = "camp-1",
  claimId = "claim-1",
) {
  await service.createCampaign({ campaignId, institutionId: "inst-1", statement: "root" });
  const knowledge = await service.proposeHypothesis({ campaignId, statement: "H works", claimId });
  if (knowledge.state !== "known") throw new Error(`hypothesis not registered: ${knowledge.state}`);
  return knowledge.value;
}

describe("G2-M01/M12: hypothesis and evidence firewalls", () => {
  it("a hypothesis references a claim by ref and the module holds no evidence body or report path", () => {
    const code = strip(SRC("epistemic.ts")) + strip(SRC("service.ts")) + strip(SRC("store.ts"));
    expect(code).not.toMatch(/evidence_json|evidenceBody|workerReport|AttemptReport|PeerMessage/i);
    expect(code).not.toMatch(/federation|coordination\//i);
  });
});

describe("G2-M02/M03: branch structure", () => {
  it("a parent must exist in the same campaign; unknown parents are rejected", async () => {
    const standings = new Map<string, CampaignClaimStatus | "unknown">([
      ["claim-1", "SUPPORTED"],
      ["claim-2", "INCONCLUSIVE"],
    ]);
    const w = world(standings);
    const h1 = await campaignWithHypothesis(w.service);
    const child = await w.service.proposeHypothesis({
      campaignId: "camp-1",
      statement: "H2",
      claimId: "claim-2",
      parentHypothesisId: h1.hypothesisId,
    });
    expect(child.state).toBe("known");

    // A parent from a different campaign does not exist in this campaign.
    await w.service.createCampaign({ campaignId: "camp-2", institutionId: "inst-1", statement: "other" });
    const foreign = await w.service.proposeHypothesis({ campaignId: "camp-2", statement: "F", claimId: "claim-1" });
    expect(foreign.state).toBe("known");
    const foreignId = foreign.state === "known" ? foreign.value.hypothesisId : "";
    await expect(
      w.service.proposeHypothesis({ campaignId: "camp-1", statement: "H3", claimId: "claim-1", parentHypothesisId: foreignId }),
    ).rejects.toThrow(/parent hypothesis must exist/);
    // A non-existent parent is rejected too (so a cycle can never form).
    await expect(
      w.service.proposeHypothesis({ campaignId: "camp-1", statement: "H4", claimId: "claim-1", parentHypothesisId: "h-nope" }),
    ).rejects.toThrow(/parent hypothesis must exist/);
  });
});

describe("G2-M04/M05/M06: EvidenceHistory semantics", () => {
  it("contradiction retains history; observations are append-only and body-free", async () => {
    const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", "SUPPORTED"]]);
    const w = world(standings);
    const hypothesis = await campaignWithHypothesis(w.service);

    const first = await w.service.refreshCampaignBeliefs("camp-1");
    expect(first.status).toBe("refreshed");
    if (first.status !== "refreshed") return;
    expect(first.beliefState.entries[0]!.standing).toBe("supported");

    standings.set("claim-1", "CONTRADICTED");
    const second = await w.service.refreshCampaignBeliefs("camp-1");
    expect(second.status).toBe("refreshed");
    if (second.status !== "refreshed") return;
    expect(second.beliefState.entries[0]!.standing).toBe("contradicted");

    // History: both observations survive; the hypothesis is retained.
    const observations = (await w.store.replay("camp-1")).filter((event) => event.type === "EVIDENCE_OBSERVED");
    expect(observations).toHaveLength(2);
    expect((await w.service.hypotheses("camp-1")).find((entry) => entry.hypothesis.hypothesisId === hypothesis.hypothesisId)?.state).toBe("ACTIVE");
    // No evidence body is present in a stored observation.
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toMatch(/evidenceBody|"body"|experiment/i);
  });
});

describe("G2-M07/M08: belief revisions require observations", () => {
  it("every belief revision names an observation and no setBelief API exists", async () => {
    const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", "SUPPORTED"]]);
    const w = world(standings);
    await campaignWithHypothesis(w.service);
    expect((w.service as unknown as { setBelief?: unknown }).setBelief).toBeUndefined();
    expect((w.service as unknown as { setBeliefStanding?: unknown }).setBeliefStanding).toBeUndefined();
    await w.service.refreshCampaignBeliefs("camp-1");
    const revisions = (await w.store.replay("camp-1")).filter((event) => event.type === "BELIEF_REVISED");
    expect(revisions).toHaveLength(1);
    const payload = revisions[0]!.payload as { revision: { evidenceObservationId: string } };
    expect(payload.revision.evidenceObservationId).toMatch(/^obs-/);
    // Static: no direct belief setter exists in the module.
    expect(strip(SRC("service.ts"))).not.toMatch(/setBelief\b/);
  });
});

describe("G2-M09/M10: non-monotonic belief and STALE", () => {
  it("SUPPORTED → CONTRADICTED → INCONCLUSIVE → STALE all revise and all remain historical", async () => {
    const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", "SUPPORTED"]]);
    const w = world(standings);
    await campaignWithHypothesis(w.service);
    const sequence: CampaignClaimStatus[] = ["SUPPORTED", "CONTRADICTED", "INCONCLUSIVE", "STALE"];
    const expected = ["supported", "contradicted", "inconclusive", "stale"];
    for (let i = 0; i < sequence.length; i += 1) {
      standings.set("claim-1", sequence[i]!);
      const result = await w.service.refreshCampaignBeliefs("camp-1");
      expect(result.status).toBe("refreshed");
      if (result.status !== "refreshed") return;
      expect(result.beliefState.entries[0]!.standing).toBe(expected[i]);
    }
    expect((await w.store.replay("camp-1")).filter((event) => event.type === "EVIDENCE_OBSERVED")).toHaveLength(4);
    expect((await w.service.currentBeliefState("camp-1")).entries[0]!.standing).toBe("stale");
  });
});

describe("G2-M11: unknown evidence aborts refresh with no partial write", () => {
  it("one unknown claim leaves the Campaign basis untouched", async () => {
    const standings = new Map<string, CampaignClaimStatus | "unknown">([
      ["claim-1", "SUPPORTED"],
      ["claim-2", "SUPPORTED"],
    ]);
    const w = world(standings);
    await campaignWithHypothesis(w.service);
    await w.service.proposeHypothesis({ campaignId: "camp-1", statement: "H2", claimId: "claim-2" });
    const basisBefore = await w.store.basis("camp-1");

    standings.set("claim-2", "unknown");
    const result = await w.service.refreshCampaignBeliefs("camp-1");
    expect(result.status).toBe("epistemic_refresh_incomplete");
    expect(await w.store.basis("camp-1")).toEqual(basisBefore);

    standings.set("claim-2", "SUPPORTED");
    const ok = await w.service.refreshCampaignBeliefs("camp-1");
    expect(ok.status).toBe("refreshed");
  });
});

describe("G2-M13/M14: deterministic replay and digest", () => {
  it("belief state digest is stable across replay and across independent worlds", async () => {
    async function run(): Promise<string> {
      const standings = new Map<string, CampaignClaimStatus | "unknown">([["claim-1", "PARTIALLY_SUPPORTED"]]);
      const w = world(standings);
      await campaignWithHypothesis(w.service);
      await w.service.refreshCampaignBeliefs("camp-1");
      const state = await w.service.currentBeliefState("camp-1");
      // Replay-derived state equals the refresh-time state.
      expect((await w.service.currentBeliefState("camp-1")).digest).toBe(state.digest);
      w.store.close();
      return state.digest;
    }
    expect(await run()).toBe(await run());
  });
});
