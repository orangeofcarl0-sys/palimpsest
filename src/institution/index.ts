/**
 * G10-F4 institution package — the durable institution continuity kernel:
 * stable institution identity, versioned charter, explicit continuation
 * authority, authorized epoch lineage, and a current Organization body.
 *
 * NOT the full PLMP-PAG-0 stack: Campaign, belief state, watchers, wake
 * lifecycle, and CampaignCompiler remain deferred (§134–§135). No empty
 * placeholder registries are created.
 */

export {
  INSTITUTION_CHARTER_DIGEST_DOMAIN,
  INSTITUTION_EPOCH_DIGEST_DOMAIN,
  InstitutionArtifactError,
  institutionCharterDigestContent,
  institutionCharterRefOf,
  institutionCharterRefsEqual,
  institutionEpochDigestContent,
  institutionEpochRefOf,
  institutionEpochRefsEqual,
  materializeApproval,
  materializeContinuationAuthorityRule,
  materializeInstitutionCharter,
  materializeInstitutionEpoch,
  materializeTransitionProposal,
  parseApproval,
  parseContinuationAuthorityRule,
  parseInstitutionCharter,
  parseInstitutionCharterRef,
  parseInstitutionEpoch,
  parseInstitutionEpochRef,
  parseTransitionProposal,
} from "./artifacts.js";
export type {
  ContinuationAuthorityRule,
  InstitutionApproval,
  InstitutionCharter,
  InstitutionCharterRef,
  InstitutionEpoch,
  InstitutionEpochRef,
  InstitutionId,
  InstitutionTransitionProposal,
} from "./artifacts.js";

export {
  InstitutionStoreError,
  SqliteInstitutionStore,
  defaultInstitutionPath,
} from "./store.js";
export type { InstitutionStore, InstitutionStoreErrorKind } from "./store.js";

export { makeInstitutionService } from "./service.js";
export type { InstitutionService, InstitutionServiceDeps } from "./service.js";

export { activateAndGovernOrganizationChange, institutionBodyView } from "./governed.js";
export type { GovernedAdoptionResult, InstitutionBodyView } from "./governed.js";
