/**
 * G10-G1 campaign package — durable long-horizon Campaign identity owned by a
 * DurableInstitution, with a canonical append-only CampaignStore.
 *
 * Campaign ≠ Project ≠ Institution ≠ RuntimeAgent.
 * CampaignCommitment ≠ federation Commitment.
 */

export {
  CAMPAIGN_CHAIN_DOMAIN,
  CampaignArtifactError,
  CAMPAIGN_COMMITMENT_EVENT_PARSERS,
  campaignBasisRefsEqual,
  campaignChainDigest,
  materializeCampaignCommitment,
  materializeCampaignDefinition,
  parseCampaignBasisRef,
  parseCampaignCommitment,
  parseCampaignDefinition,
} from "./artifacts.js";
export type {
  CampaignBasisRef,
  CampaignCommitment,
  CampaignCommitmentId,
  CampaignCommitmentState,
  CampaignDefinition,
  CampaignEventParsers,
  CampaignEventPayloadParser,
  CampaignEventType,
  CampaignId,
} from "./artifacts.js";

export {
  CampaignStoreError,
  SqliteCampaignStore,
  defaultCampaignPath,
} from "./store.js";
export type {
  CampaignAppendRequest,
  CampaignAtomicAppend,
  CampaignEvent,
  CampaignStore,
  CampaignStoreErrorKind,
} from "./store.js";

export { CAMPAIGN_EVENT_DIGEST_DOMAIN, campaignEventId, makeCampaignService } from "./service.js";
export type { CampaignCommitmentStateEntry, CampaignService, CampaignServiceDeps } from "./service.js";
