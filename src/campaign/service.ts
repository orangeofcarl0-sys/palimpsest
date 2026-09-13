/**
 * G10-G1/G2 campaign service — explicit Campaign genesis, commitment
 * lifecycle, hypothesis branches, evidence observations, and derived belief
 * state. No mutable status row is canonical (§49/§59); there is no
 * `setBelief` API (§77) — belief revisions trace to evidence observations.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type {
  CampaignBasisRef,
  CampaignCommitment,
  CampaignCommitmentId,
  CampaignCommitmentState,
  CampaignDefinition,
  CampaignEventType,
} from "./artifacts.js";
import { materializeCampaignCommitment, materializeCampaignDefinition } from "./artifacts.js";
import type {
  BeliefRevision,
  CampaignBeliefStanding,
  CampaignEvidenceObservation,
  CampaignEvidencePort,
  CampaignHypothesis,
  ClaimStandingSnapshot,
  CurrentBeliefState,
  EvidenceKnowledge,
} from "./epistemic.js";
import {
  beliefStandingOf,
  currentBeliefStateOf,
  materializeBeliefRevision,
  materializeCampaignHypothesis,
  materializeObservation,
} from "./epistemic.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export interface CampaignServiceDeps {
  readonly store: CampaignStore;
  readonly allocateCommitmentId: () => CampaignCommitmentId;
  /** Read-only bridge to the authoritative Evidence plane (§38). */
  readonly evidence?: CampaignEvidencePort | undefined;
}

export interface CampaignCommitmentStateEntry {
  readonly commitment: CampaignCommitment;
  readonly state: CampaignCommitmentState;
}

export interface CampaignHypothesisStateEntry {
  readonly hypothesis: CampaignHypothesis;
  readonly state: "ACTIVE" | "RETIRED";
}

export type CampaignBeliefRefreshResult =
  | {
      readonly status: "refreshed";
      readonly observations: readonly CampaignEvidenceObservation[];
      readonly revisions: readonly BeliefRevision[];
      readonly beliefState: CurrentBeliefState;
    }
  | { readonly status: "epistemic_refresh_incomplete"; readonly detail: string };

export interface CampaignService {
  createCampaign(input: {
    readonly campaignId: string;
    readonly institutionId: string;
    readonly statement: string;
  }): Promise<{ readonly definition: CampaignDefinition; readonly commitment: CampaignCommitment; readonly event: CampaignEvent }>;
  openCommitment(input: { readonly campaignId: string; readonly statement: string }): Promise<CampaignCommitment>;
  resolveCommitment(input: {
    readonly campaignId: string;
    readonly commitmentId: CampaignCommitmentId;
    readonly reason: string;
  }): Promise<void>;
  abandonCommitment(input: {
    readonly campaignId: string;
    readonly commitmentId: CampaignCommitmentId;
    readonly reason: string;
  }): Promise<void>;
  supersedeCommitment(input: {
    readonly campaignId: string;
    readonly commitmentId: CampaignCommitmentId;
    readonly statement: string;
  }): Promise<CampaignCommitment>;
  commitmentStates(campaignId: string): Promise<readonly CampaignCommitmentStateEntry[]>;
  basis(campaignId: string): Promise<CampaignBasisRef | undefined>;
  definition(campaignId: string): Promise<CampaignDefinition | undefined>;
  replay(campaignId: string): Promise<readonly CampaignEvent[]>;
  /** Register a hypothesis; verifies the referenced claim is known (§66). */
  proposeHypothesis(input: {
    readonly campaignId: string;
    readonly statement: string;
    readonly claimId: string;
    readonly parentHypothesisId?: string | undefined;
  }): Promise<EvidenceKnowledge<CampaignHypothesis>>;
  retireHypothesis(input: { readonly campaignId: string; readonly hypothesisId: string; readonly reason: string }): Promise<void>;
  hypotheses(campaignId: string): Promise<readonly CampaignHypothesisStateEntry[]>;
  /** Observe ALL active hypotheses; append nothing unless every claim is known (§81). */
  refreshCampaignBeliefs(campaignId: string): Promise<CampaignBeliefRefreshResult>;
  currentBeliefState(campaignId: string): Promise<CurrentBeliefState>;
}

export const CAMPAIGN_EVENT_DIGEST_DOMAIN = "palimpsest.campaign-event.v1";

export function campaignEventId(type: string, campaignId: string, payload: unknown): string {
  return `evt-${canonicalDigest({ domain: CAMPAIGN_EVENT_DIGEST_DOMAIN, type, campaignId, payload }).slice(0, 24)}`;
}

export function makeCampaignService(deps: CampaignServiceDeps): CampaignService {
  async function currentBasis(campaignId: string): Promise<CampaignBasisRef> {
    const basis = await deps.store.basis(campaignId);
    if (basis === undefined) {
      throw new CampaignStoreError("unknown_campaign", `campaign "${campaignId}" does not exist`);
    }
    return basis;
  }

  function request(type: CampaignEventType, campaignId: string, payload: unknown): CampaignAppendRequest {
    return { eventId: campaignEventId(type, campaignId, payload), type, payload };
  }

  async function createCampaign(input: {
    readonly campaignId: string;
    readonly institutionId: string;
    readonly statement: string;
  }) {
    const definition = materializeCampaignDefinition({
      campaignId: input.campaignId,
      institutionId: input.institutionId,
    });
    const commitment = materializeCampaignCommitment({
      commitmentId: deps.allocateCommitmentId(),
      campaignId: definition.campaignId,
      statement: input.statement,
    });
    const event = await deps.store.genesis({ definition, initialCommitment: commitment });
    return Object.freeze({ definition, commitment, event });
  }

  async function openCommitment(input: { readonly campaignId: string; readonly statement: string }): Promise<CampaignCommitment> {
    const basis = await currentBasis(input.campaignId);
    const commitment = materializeCampaignCommitment({
      commitmentId: deps.allocateCommitmentId(),
      campaignId: input.campaignId,
      statement: input.statement,
    });
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("CAMPAIGN_COMMITMENT_OPENED", input.campaignId, { commitment })],
    });
    return commitment;
  }

  async function endCommitment(
    type: "CAMPAIGN_COMMITMENT_RESOLVED" | "CAMPAIGN_COMMITMENT_ABANDONED",
    input: { readonly campaignId: string; readonly commitmentId: CampaignCommitmentId; readonly reason: string },
  ): Promise<void> {
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request(type, input.campaignId, { commitmentId: input.commitmentId, reason: input.reason })],
    });
  }

  async function supersedeCommitment(input: {
    readonly campaignId: string;
    readonly commitmentId: CampaignCommitmentId;
    readonly statement: string;
  }): Promise<CampaignCommitment> {
    const basis = await currentBasis(input.campaignId);
    const successor = materializeCampaignCommitment({
      commitmentId: deps.allocateCommitmentId(),
      campaignId: input.campaignId,
      statement: input.statement,
    });
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [
        request("CAMPAIGN_COMMITMENT_SUPERSEDED", input.campaignId, {
          commitmentId: input.commitmentId,
          successorCommitmentId: successor.commitmentId,
        }),
        request("CAMPAIGN_COMMITMENT_OPENED", input.campaignId, { commitment: successor }),
      ],
    });
    return successor;
  }

  async function commitmentStates(campaignId: string): Promise<readonly CampaignCommitmentStateEntry[]> {
    const events = await deps.store.replay(campaignId);
    const byId = new Map<CampaignCommitmentId, { commitment: CampaignCommitment; state: CampaignCommitmentState }>();
    for (const event of events) {
      switch (event.type) {
        case "CAMPAIGN_COMMITMENT_OPENED": {
          const commitment = (event.payload as { commitment: CampaignCommitment }).commitment;
          byId.set(commitment.commitmentId, { commitment, state: "OPEN" });
          break;
        }
        case "CAMPAIGN_COMMITMENT_RESOLVED": {
          const { commitmentId } = event.payload as { commitmentId: CampaignCommitmentId };
          const existing = byId.get(commitmentId);
          if (existing !== undefined) byId.set(commitmentId, { ...existing, state: "RESOLVED" });
          break;
        }
        case "CAMPAIGN_COMMITMENT_ABANDONED": {
          const { commitmentId } = event.payload as { commitmentId: CampaignCommitmentId };
          const existing = byId.get(commitmentId);
          if (existing !== undefined) byId.set(commitmentId, { ...existing, state: "ABANDONED" });
          break;
        }
        case "CAMPAIGN_COMMITMENT_SUPERSEDED": {
          const { commitmentId } = event.payload as { commitmentId: CampaignCommitmentId };
          const existing = byId.get(commitmentId);
          if (existing !== undefined) byId.set(commitmentId, { ...existing, state: "SUPERSEDED" });
          break;
        }
        default:
          break;
      }
    }
    return Object.freeze([...byId.values()]);
  }

  async function hypotheses(campaignId: string): Promise<readonly CampaignHypothesisStateEntry[]> {
    const events = await deps.store.replay(campaignId);
    const byId = new Map<string, { hypothesis: CampaignHypothesis; state: "ACTIVE" | "RETIRED" }>();
    for (const event of events) {
      if (event.type === "HYPOTHESIS_PROPOSED") {
        const hypothesis = (event.payload as { hypothesis: CampaignHypothesis }).hypothesis;
        byId.set(hypothesis.hypothesisId, { hypothesis, state: "ACTIVE" });
      } else if (event.type === "HYPOTHESIS_RETIRED") {
        const { hypothesisId } = event.payload as { hypothesisId: string };
        const existing = byId.get(hypothesisId);
        if (existing !== undefined) byId.set(hypothesisId, { ...existing, state: "RETIRED" });
      }
    }
    return Object.freeze([...byId.values()]);
  }

  async function proposeHypothesis(input: {
    readonly campaignId: string;
    readonly statement: string;
    readonly claimId: string;
    readonly parentHypothesisId?: string | undefined;
  }): Promise<EvidenceKnowledge<CampaignHypothesis>> {
    if ((await deps.store.definition(input.campaignId)) === undefined) {
      throw new CampaignStoreError("unknown_campaign", `campaign "${input.campaignId}" does not exist`);
    }
    if (input.parentHypothesisId !== undefined) {
      const existing = await hypotheses(input.campaignId);
      // §67: the parent must exist and belong to the SAME campaign; cycles are
      // impossible because a hypothesis can only reference an already-created one.
      if (!existing.some((entry) => entry.hypothesis.hypothesisId === input.parentHypothesisId)) {
        throw new CampaignStoreError("invalid_registration", "parent hypothesis must exist in the same campaign");
      }
    }
    if (deps.evidence === undefined) {
      return Object.freeze({ state: "unknown", detail: "no CampaignEvidencePort is configured — the claim cannot be verified" });
    }
    const knowledge = await deps.evidence.inspectClaim({ claimId: input.claimId });
    if (knowledge.state !== "known") {
      // §66: never silently create Campaign evidence truth for an unknown claim.
      return Object.freeze({ state: knowledge.state, detail: knowledge.detail });
    }
    const hypothesis = materializeCampaignHypothesis({
      hypothesisId: `h-${canonicalDigest({
        domain: "palimpsest.campaign-hypothesis.v1",
        campaignId: input.campaignId,
        claimId: input.claimId,
        statement: input.statement,
        parent: input.parentHypothesisId ?? null,
      }).slice(0, 24)}`,
      campaignId: input.campaignId,
      statement: input.statement,
      claim: { claimId: input.claimId },
      parentHypothesisId: input.parentHypothesisId,
    });
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("HYPOTHESIS_PROPOSED", input.campaignId, { hypothesis })],
    });
    return Object.freeze({ state: "known", value: hypothesis });
  }

  async function retireHypothesis(input: {
    readonly campaignId: string;
    readonly hypothesisId: string;
    readonly reason: string;
  }): Promise<void> {
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("HYPOTHESIS_RETIRED", input.campaignId, { hypothesisId: input.hypothesisId, reason: input.reason })],
    });
  }

  async function beliefRevisions(campaignId: string): Promise<readonly BeliefRevision[]> {
    const events = await deps.store.replay(campaignId);
    return Object.freeze(
      events
        .filter((event) => event.type === "BELIEF_REVISED")
        .map((event) => (event.payload as { revision: BeliefRevision }).revision),
    );
  }

  async function currentBeliefState(campaignId: string): Promise<CurrentBeliefState> {
    return currentBeliefStateOf(campaignId, await beliefRevisions(campaignId));
  }

  async function refreshCampaignBeliefs(campaignId: string): Promise<CampaignBeliefRefreshResult> {
    if (deps.evidence === undefined) {
      return Object.freeze({ status: "epistemic_refresh_incomplete", detail: "no CampaignEvidencePort is configured" });
    }
    const active = (await hypotheses(campaignId)).filter((entry) => entry.state === "ACTIVE");

    // Phase 1: observe ALL required claims read-only. Any unknown/error aborts
    // with NOTHING appended — no partially refreshed state (§81).
    const gathered: { hypothesisId: string; snapshot: ClaimStandingSnapshot }[] = [];
    for (const entry of active) {
      const knowledge = await deps.evidence.inspectClaim(entry.hypothesis.claim);
      if (knowledge.state !== "known") {
        return Object.freeze({
          status: "epistemic_refresh_incomplete",
          detail: `claim "${entry.hypothesis.claim.claimId}" is ${knowledge.state}: ${knowledge.detail}`,
        });
      }
      gathered.push({ hypothesisId: entry.hypothesis.hypothesisId, snapshot: knowledge.value });
    }
    if (gathered.length === 0) {
      return Object.freeze({
        status: "refreshed",
        observations: Object.freeze([]),
        revisions: Object.freeze([]),
        beliefState: await currentBeliefState(campaignId),
      });
    }

    // Phase 2: materialize everything, then append ONE atomic batch.
    const basis = await currentBasis(campaignId);
    const previousRevisions = await beliefRevisions(campaignId);
    const latestByHypothesis = new Map<string, BeliefRevision>();
    for (const revision of previousRevisions) latestByHypothesis.set(revision.hypothesisId, revision);

    const observations: CampaignEvidenceObservation[] = [];
    const revisions: BeliefRevision[] = [];
    const events: CampaignAppendRequest[] = [];
    for (const item of gathered) {
      const observationId = `obs-${canonicalDigest({
        domain: "palimpsest.campaign-observation.v1",
        campaignId,
        hypothesisId: item.hypothesisId,
        standingDigest: item.snapshot.digest,
      }).slice(0, 24)}`;
      const observation = materializeObservation({
        observationId,
        campaignId,
        hypothesisId: item.hypothesisId,
        standing: item.snapshot,
      });
      const previous = latestByHypothesis.get(item.hypothesisId);
      const standing: CampaignBeliefStanding = beliefStandingOf(item.snapshot.status);
      const revision = materializeBeliefRevision({
        beliefRevisionId: `br-${canonicalDigest({
          domain: "palimpsest.campaign-belief-revision.v1",
          campaignId,
          hypothesisId: item.hypothesisId,
          observationId,
          standing,
        }).slice(0, 24)}`,
        campaignId,
        hypothesisId: item.hypothesisId,
        previous: previous === undefined ? null : { beliefRevisionId: previous.beliefRevisionId },
        standing,
        evidenceObservationId: observationId,
      });
      observations.push(observation);
      revisions.push(revision);
      events.push(request("EVIDENCE_OBSERVED", campaignId, { observation }));
    }
    for (const revision of revisions) {
      events.push(request("BELIEF_REVISED", campaignId, { revision }));
    }
    await deps.store.appendAtomic({ expectedBasis: basis, events });
    return Object.freeze({
      status: "refreshed",
      observations: Object.freeze(observations),
      revisions: Object.freeze(revisions),
      beliefState: currentBeliefStateOf(campaignId, [...previousRevisions, ...revisions]),
    });
  }

  return {
    createCampaign,
    openCommitment,
    resolveCommitment: (input) => endCommitment("CAMPAIGN_COMMITMENT_RESOLVED", input),
    abandonCommitment: (input) => endCommitment("CAMPAIGN_COMMITMENT_ABANDONED", input),
    supersedeCommitment,
    commitmentStates,
    basis: (campaignId) => deps.store.basis(campaignId),
    definition: (campaignId) => deps.store.definition(campaignId),
    replay: (campaignId) => deps.store.replay(campaignId),
    proposeHypothesis,
    retireHypothesis,
    hypotheses,
    refreshCampaignBeliefs,
    currentBeliefState,
  };
}
