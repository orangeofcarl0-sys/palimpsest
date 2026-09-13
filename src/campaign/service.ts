/**
 * G10-G1 campaign service — explicit Campaign genesis, commitment lifecycle,
 * and derived commitment state. No mutable status row is canonical (§49/§59).
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
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export interface CampaignServiceDeps {
  readonly store: CampaignStore;
  readonly allocateCommitmentId: () => CampaignCommitmentId;
}

export interface CampaignCommitmentStateEntry {
  readonly commitment: CampaignCommitment;
  readonly state: CampaignCommitmentState;
}

export interface CampaignService {
  createCampaign(input: {
    readonly campaignId: string;
    readonly institutionId: string;
    readonly statement: string;
  }): Promise<{ readonly definition: CampaignDefinition; readonly commitment: CampaignCommitment; readonly event: CampaignEvent }>;
  openCommitment(input: {
    readonly campaignId: string;
    readonly statement: string;
  }): Promise<CampaignCommitment>;
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
  /** Supersede + open a successor as ONE atomic transition (§50). */
  supersedeCommitment(input: {
    readonly campaignId: string;
    readonly commitmentId: CampaignCommitmentId;
    readonly statement: string;
  }): Promise<CampaignCommitment>;
  commitmentStates(campaignId: string): Promise<readonly CampaignCommitmentStateEntry[]>;
  basis(campaignId: string): Promise<CampaignBasisRef | undefined>;
  definition(campaignId: string): Promise<CampaignDefinition | undefined>;
  replay(campaignId: string): Promise<readonly CampaignEvent[]>;
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

  async function openCommitment(input: {
    readonly campaignId: string;
    readonly statement: string;
  }): Promise<CampaignCommitment> {
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
      events: [
        request(type, input.campaignId, { commitmentId: input.commitmentId, reason: input.reason }),
      ],
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
  };
}
